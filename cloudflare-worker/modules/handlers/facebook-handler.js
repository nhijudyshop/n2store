/**
 * Facebook Handler
 * Handles Facebook Graph API related endpoints
 *
 * @module cloudflare-worker/modules/handlers/facebook-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { jsonResponse, errorResponse, CORS_HEADERS } from '../utils/cors-utils.js';
import { buildTposHeaders, learnFromResponse } from '../utils/header-learner.js';
import { API_ENDPOINTS } from '../config/endpoints.js';

/**
 * Handle POST /api/facebook-send
 * Sends messages via Facebook Graph API with MESSAGE_TAG support
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleFacebookSend(request, url) {
    console.log('[FACEBOOK-SEND] ========================================');
    console.log('[FACEBOOK-SEND] Received request to send message via Facebook Graph API');

    try {
        const body = await request.json();
        let { pageId, psid, message, pageToken, useTag, imageUrls, recipient, postId, customerName, commentId, knownCommentIds } = body;

        // Fallback: Get token from header if not in body
        if (!pageToken) {
            pageToken = request.headers.get('X-Page-Access-Token');
        }

        // === DIRECT PRIVATE REPLY MODE ===
        // If commentId is provided, use Send API with recipient.comment_id
        // Note: /{comment-id}/private_replies was removed after Graph API v3.2
        // Current approach: POST /{pageId}/messages with recipient: { comment_id }
        if (commentId && message && pageToken) {
            console.log('[FACEBOOK-SEND] Direct Private Reply mode → commentId:', commentId, 'pageId:', pageId);
            const messageText = typeof message === 'string' ? message : message.text;

            // If pageId is available, use Send API (correct approach for v19.0+)
            if (pageId) {
                const sendUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${pageId}/messages`;
                try {
                    const resp = await fetchWithRetry(
                        `${sendUrl}?access_token=${pageToken}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({
                                recipient: { comment_id: commentId },
                                message: { text: messageText },
                            }),
                        },
                        2, 1000, 15000
                    );
                    const result = await resp.json();
                    console.log('[FACEBOOK-SEND] Direct Private Reply response:', JSON.stringify(result));

                    if (result.error) {
                        console.error('[FACEBOOK-SEND] Private Reply error:', result.error.message);
                        return jsonResponse({
                            success: false,
                            error: result.error.message,
                            error_code: result.error.code,
                            error_subcode: result.error.error_subcode,
                            method: 'private_reply',
                        }, resp.status || 400);
                    }

                    console.log('[FACEBOOK-SEND] ✅ Direct Private Reply succeeded!');
                    return jsonResponse({
                        success: true,
                        recipient_id: result.recipient_id,
                        message_id: result.message_id,
                        method: 'private_reply',
                        comment_id: commentId,
                    });
                } catch (err) {
                    return errorResponse('Private Reply error: ' + err.message, 500);
                }
            }
            // Fallback: no pageId - extract from commentId format (postId_commentId)
            console.warn('[FACEBOOK-SEND] No pageId for Direct Private Reply, skipping to normal flow');
        }

        // Validate required fields
        if (!pageId || (!psid && !recipient) || !pageToken) {
            console.error('[FACEBOOK-SEND] Missing required fields');
            return errorResponse('Missing required fields', 400, {
                required: ['pageId', 'psid OR recipient', 'pageToken'],
                usage: 'POST /api/facebook-send with JSON body { pageId, psid, message, pageToken }'
            });
        }

        const graphApiUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${pageId}/messages`;
        console.log('[FACEBOOK-SEND] Graph API URL:', graphApiUrl);
        if (postId) console.log('[FACEBOOK-SEND] Post ID for Private Reply fallback:', postId);

        // Tag priority: HUMAN_AGENT (7-day window) → POST_PURCHASE_UPDATE (order updates)
        const TAG_SEQUENCE = ['HUMAN_AGENT', 'POST_PURCHASE_UPDATE'];

        const messageIds = [];
        let lastResult = null;
        let usedTag = null;
        let sendFailed551 = false;
        let lastError = null;

        // Helper: send a single request to Facebook Graph API
        async function sendToGraph(fbBody) {
            const resp = await fetchWithRetry(
                `${graphApiUrl}?access_token=${pageToken}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(fbBody),
                },
                3, 1000, 15000
            );
            return { response: resp, result: await resp.json() };
        }

        // Helper: send with tag fallback (HUMAN_AGENT → CUSTOMER_FEEDBACK)
        async function sendWithTagFallback(baseFbBody) {
            if (!useTag) {
                if (!baseFbBody.recipient?.comment_id) {
                    baseFbBody.messaging_type = 'RESPONSE';
                }
                console.log('[FACEBOOK-SEND] Sending without tag, body:', JSON.stringify(baseFbBody));
                const { response, result } = await sendToGraph(baseFbBody);
                console.log('[FACEBOOK-SEND] Facebook response (no-tag):', JSON.stringify(result));
                if (result.error) return { success: false, result, status: response.status };
                return { success: true, result, tag: null };
            }

            for (const tag of TAG_SEQUENCE) {
                const body = { ...baseFbBody, messaging_type: 'MESSAGE_TAG', tag };
                console.log(`[FACEBOOK-SEND] Trying tag: ${tag}`);

                const { response, result } = await sendToGraph(body);
                console.log(`[FACEBOOK-SEND] ${tag} response:`, JSON.stringify(result));

                if (!result.error) {
                    console.log(`[FACEBOOK-SEND] ✅ Success with tag: ${tag}`);
                    return { success: true, result, tag };
                }

                // Track 551 error (no inbox conversation)
                if (result.error.code === 551) {
                    sendFailed551 = true;
                }
                lastError = result.error;

                console.warn(`[FACEBOOK-SEND] ⚠️ ${tag} failed (${result.error.code}): ${result.error.message}`);
            }

            // All tags failed
            return { success: false, result: { error: lastError }, status: 400 };
        }

        // Helper: Search comments on a single post/video for the customer
        // Returns ALL matching comments (not just first) for retry logic
        async function searchCommentsOnObject(objectId, customerAsid, customerName, filter, diagnostics, excludeIds = new Set()) {
            const graphUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${objectId}/comments`;
            const params = new URLSearchParams({
                access_token: pageToken,
                fields: 'from{id,name},id,message,created_time',
                limit: '200',
                order: 'reverse_chronological'
            });
            if (filter) params.set('filter', filter);

            const queryKey = `${objectId}/comments?filter=${filter || 'default'}`;

            try {
                const resp = await fetchWithRetry(
                    `${graphUrl}?${params.toString()}`,
                    { method: 'GET', headers: { 'Accept': 'application/json' } },
                    2, 1000, 15000
                );
                const data = await resp.json();

                if (data.error) {
                    diagnostics.queries.push({ query: queryKey, error: data.error.message });
                    return [];
                }

                const comments = data.data || [];
                diagnostics.queries.push({ query: queryKey, count: comments.length });
                console.log(`[PRIVATE-REPLY] ${queryKey} → ${comments.length} comments`);

                if (comments.length === 0) return [];

                // Collect commenters for diagnostics
                const uniqueCommenters = [...new Map(
                    comments.filter(c => c.from).map(c => [c.from.id, { id: c.from.id, name: c.from.name }])
                ).values()];
                diagnostics.commentersFound = uniqueCommenters.slice(0, 20);

                const matches = [];

                // Match by ID (all comments from this user)
                const idMatches = comments.filter(c => c.from && String(c.from.id) === String(customerAsid));
                for (const m of idMatches) {
                    if (!excludeIds.has(m.id)) {
                        matches.push({ commentId: m.id, matchedBy: 'id', on: objectId });
                    }
                }

                // Match by name (all comments from user with this name)
                if (customerName) {
                    const norm = customerName.trim().toLowerCase();
                    const nameMatches = comments.filter(c =>
                        c.from?.name?.trim().toLowerCase() === norm &&
                        !idMatches.some(im => im.id === c.id) // skip already matched by ID
                    );
                    for (const m of nameMatches) {
                        if (!excludeIds.has(m.id)) {
                            matches.push({ commentId: m.id, matchedBy: 'name', on: objectId });
                        }
                    }
                }

                if (matches.length > 0) {
                    console.log(`[PRIVATE-REPLY] Found ${matches.length} matching comments (excl ${excludeIds.size} already tried)`);
                }

                return matches;
            } catch (err) {
                diagnostics.queries.push({ query: queryKey, error: err.message });
                return [];
            }
        }

        // Helper: Find ALL matching Facebook comment IDs for Private Reply
        // Returns array of {commentId, matchedBy, on} objects
        // excludeIds: Set of comment IDs already tried (to avoid re-trying)
        async function findAllMatchingComments(fbPostId, customerAsid, customerName, excludeIds = new Set()) {
            const diagnostics = {
                postId: fbPostId, psid: customerAsid,
                customerName: customerName || null,
                queries: [], commentersFound: [],
            };

            console.log('[PRIVATE-REPLY] ========================================');
            console.log('[PRIVATE-REPLY] PostId:', fbPostId, '| PSID:', customerAsid, '| Name:', customerName);
            console.log('[PRIVATE-REPLY] Excluding', excludeIds.size, 'already-tried comment IDs');

            const allMatches = [];

            // === STEP 1: Try stored postId directly (if available) ===
            let allFailed = true;
            if (fbPostId) {
                const postIdVariants = [fbPostId];
                if (fbPostId.includes('_')) {
                    postIdVariants.push(fbPostId.split('_').slice(1).join('_'));
                }

                for (const pid of postIdVariants) {
                    for (const filter of ['stream', null]) {
                        const results = await searchCommentsOnObject(pid, customerAsid, customerName, filter, diagnostics, excludeIds);
                        allMatches.push(...results);
                        // Check if query succeeded (even with 0 comments) vs errored
                        const lastQuery = diagnostics.queries[diagnostics.queries.length - 1];
                        if (lastQuery && !lastQuery.error) allFailed = false;
                    }
                }
            }

            // === STEP 2: PostId invalid/missing → search page's live videos and feed ===
            if (allFailed || !fbPostId) {
                console.log('[PRIVATE-REPLY] Stored postId invalid → searching page content...');

                // 2a: Search live_videos
                try {
                    const lvUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${pageId}/live_videos`;
                    const lvParams = new URLSearchParams({
                        access_token: pageToken,
                        fields: 'id,title,created_time',
                        limit: '10'
                    });
                    const lvResp = await fetchWithRetry(
                        `${lvUrl}?${lvParams.toString()}`,
                        { method: 'GET', headers: { 'Accept': 'application/json' } },
                        2, 1000, 15000
                    );
                    const lvData = await lvResp.json();

                    if (!lvData.error && lvData.data?.length > 0) {
                        console.log(`[PRIVATE-REPLY] Found ${lvData.data.length} live videos on page`);
                        diagnostics.liveVideos = lvData.data.map(v => ({ id: v.id, title: v.title, created: v.created_time }));

                        for (const video of lvData.data) {
                            console.log(`[PRIVATE-REPLY] Searching live video: ${video.id} (${video.title || 'untitled'})`);
                            const results = await searchCommentsOnObject(video.id, customerAsid, customerName, 'stream', diagnostics, excludeIds);
                            allMatches.push(...results);
                        }
                    } else {
                        diagnostics.queries.push({ query: `${pageId}/live_videos`, error: lvData.error?.message || 'no data' });
                    }
                } catch (err) {
                    diagnostics.queries.push({ query: `${pageId}/live_videos`, error: err.message });
                }

                // 2b: Search page feed (regular posts)
                try {
                    const feedUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${pageId}/feed`;
                    const feedParams = new URLSearchParams({
                        access_token: pageToken,
                        fields: 'id,message,created_time,type',
                        limit: '15'
                    });
                    const feedResp = await fetchWithRetry(
                        `${feedUrl}?${feedParams.toString()}`,
                        { method: 'GET', headers: { 'Accept': 'application/json' } },
                        2, 1000, 15000
                    );
                    const feedData = await feedResp.json();

                    if (!feedData.error && feedData.data?.length > 0) {
                        console.log(`[PRIVATE-REPLY] Found ${feedData.data.length} posts in page feed`);
                        diagnostics.feedPosts = feedData.data.map(p => ({ id: p.id, type: p.type, created: p.created_time }));

                        for (const post of feedData.data) {
                            console.log(`[PRIVATE-REPLY] Searching post: ${post.id} (${post.type || 'unknown'})`);
                            const results = await searchCommentsOnObject(post.id, customerAsid, customerName, null, diagnostics, excludeIds);
                            allMatches.push(...results);
                        }
                    } else {
                        diagnostics.queries.push({ query: `${pageId}/feed`, error: feedData.error?.message || 'no data' });
                    }
                } catch (err) {
                    diagnostics.queries.push({ query: `${pageId}/feed`, error: err.message });
                }
            }

            // Deduplicate by commentId
            const seen = new Set();
            const uniqueMatches = allMatches.filter(m => {
                if (seen.has(m.commentId)) return false;
                seen.add(m.commentId);
                return true;
            });

            console.log(`[PRIVATE-REPLY] Total unique matches: ${uniqueMatches.length} (after dedup & excluding ${excludeIds.size})`);
            return { matches: uniqueMatches, diagnostics };
        }

        // Helper: Send Private Reply via Facebook Send API
        // Uses POST /{pageId}/messages with recipient.comment_id (current approach for v19.0+)
        async function sendPrivateReply(realCommentId, messageText) {
            const sendUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${pageId}/messages`;
            console.log('[PRIVATE-REPLY] Sending Private Reply via Send API, comment:', realCommentId, 'page:', pageId);

            const resp = await fetchWithRetry(
                `${sendUrl}?access_token=${pageToken}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                        recipient: { comment_id: realCommentId },
                        message: { text: messageText },
                    }),
                },
                2, 1000, 15000
            );
            const result = await resp.json();
            console.log('[PRIVATE-REPLY] Facebook response:', JSON.stringify(result));

            if (result.error) {
                console.error('[PRIVATE-REPLY] ❌ Failed:', result.error.message);
                return { success: false, result, status: resp.status };
            }

            console.log('[PRIVATE-REPLY] ✅ Private Reply sent successfully!', JSON.stringify(result));
            return { success: true, result };
        }

        // Send images first (if any)
        if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
            console.log('[FACEBOOK-SEND] Sending', imageUrls.length, 'images...');

            for (const imageUrl of imageUrls) {
                const imageFbBody = {
                    recipient: recipient || { id: psid },
                    message: {
                        attachment: {
                            type: 'image',
                            payload: { url: imageUrl, is_reusable: true }
                        }
                    }
                };

                console.log('[FACEBOOK-SEND] Sending image:', imageUrl);
                const imgResult = await sendWithTagFallback(imageFbBody);

                if (!imgResult.success) {
                    console.error('[FACEBOOK-SEND] Image send error:', imgResult.result.error);
                    // Don't return yet - try Private Reply fallback below
                    break;
                }

                messageIds.push(imgResult.result.message_id);
                lastResult = imgResult.result;
                usedTag = imgResult.tag;
            }
        }

        // Send text message (if provided)
        const hasTextMessage = message && (typeof message === 'string' ? message.trim() : message.text);
        if (hasTextMessage && !sendFailed551) {
            const textFbBody = {
                recipient: recipient || { id: psid },
                message: typeof message === 'object' ? message : { text: message },
            };

            console.log('[FACEBOOK-SEND] Sending text message');
            const txtResult = await sendWithTagFallback(textFbBody);

            if (!txtResult.success) {
                console.error('[FACEBOOK-SEND] Text send error:', txtResult.result.error);
                // Don't return yet - try Private Reply fallback below
            } else {
                messageIds.push(txtResult.result.message_id);
                lastResult = txtResult.result;
                usedTag = txtResult.tag;
            }
        }

        // ===== PRIVATE REPLY FALLBACK =====
        // If Send API failed (551=no inbox, 10=outside allowed window, or other errors)
        // Try Private Reply: use known comment IDs first, then search page posts
        const sendApiFailed = messageIds.length === 0 && lastError;
        if (sendApiFailed && hasTextMessage) {
            console.log('[FACEBOOK-SEND] ========================================');
            console.log(`[FACEBOOK-SEND] Send API failed (${lastError?.code}) → trying Private Reply fallback`);

            const messageText = typeof message === 'string' ? message : message.text;

            // === STEP A: Try known comment IDs directly (from order data) ===
            const triedCommentIds = new Set();
            let allRepliedTo = false;

            if (knownCommentIds && Array.isArray(knownCommentIds) && knownCommentIds.length > 0) {
                console.log(`[FACEBOOK-SEND] Trying ${knownCommentIds.length} known comment IDs from order data`);

                for (const knownId of knownCommentIds) {
                    triedCommentIds.add(knownId);
                    console.log(`[FACEBOOK-SEND] Trying known commentId: ${knownId}`);
                    const prResult = await sendPrivateReply(knownId, messageText);

                    if (prResult.success) {
                        console.log('[FACEBOOK-SEND] ✅ Private Reply succeeded with known commentId!');
                        const msgId = prResult.result.message_id || prResult.result.id;
                        return jsonResponse({
                            success: true,
                            recipient_id: prResult.result.recipient_id,
                            message_id: msgId,
                            message_ids: [msgId],
                            used_tag: 'PRIVATE_REPLY',
                            method: 'private_reply_known',
                            real_comment_id: knownId,
                            matched_by: 'order_data',
                        });
                    }
                    const errCode = prResult.result?.error?.code;
                    if (errCode === 10900) allRepliedTo = true;
                    console.warn(`[FACEBOOK-SEND] Known commentId ${knownId} failed (${errCode}):`, prResult.result?.error?.message);
                }
                console.log('[FACEBOOK-SEND] All known comment IDs failed, searching for more comments...');
            }

            // === STEP B: Search ALL matching comments on page posts (excluding already tried) ===
            const { matches, diagnostics } = await findAllMatchingComments(postId, psid, customerName, triedCommentIds);

            if (matches.length > 0) {
                console.log(`[FACEBOOK-SEND] Found ${matches.length} new comments to try via Private Reply`);

                for (const match of matches) {
                    console.log(`[FACEBOOK-SEND] Trying commentId: ${match.commentId} (matched by: ${match.matchedBy})`);
                    const prResult = await sendPrivateReply(match.commentId, messageText);

                    if (prResult.success) {
                        console.log('[FACEBOOK-SEND] ✅ Private Reply succeeded via search!');
                        const msgId = prResult.result.message_id || prResult.result.id;
                        return jsonResponse({
                            success: true,
                            recipient_id: prResult.result.recipient_id,
                            message_id: msgId,
                            message_ids: [msgId],
                            used_tag: 'PRIVATE_REPLY',
                            method: 'private_reply',
                            real_comment_id: match.commentId,
                            matched_by: match.matchedBy,
                        });
                    }

                    const errCode = prResult.result?.error?.code;
                    console.warn(`[FACEBOOK-SEND] Comment ${match.commentId} failed (${errCode}):`, prResult.result?.error?.message);
                    if (errCode === 10900) allRepliedTo = true;
                }
            }

            // All attempts failed
            const totalTried = triedCommentIds.size + matches.length;
            if (totalTried > 0 && allRepliedTo) {
                // All comments have been privately replied to already
                return jsonResponse({
                    success: false,
                    error: `Tất cả ${totalTried} comment của khách đã được reply rồi. Cần khách comment mới hoặc nhắn tin lại.`,
                    error_code: 10900,
                    private_reply_error: 'all_already_replied',
                    total_tried: totalTried,
                    send_api_error: lastError?.message,
                    _debug: diagnostics,
                }, 400);
            }

            if (totalTried === 0) {
                // No comments found at all
                return jsonResponse({
                    success: false,
                    error: lastError?.message || 'Không tìm thấy comment của khách trên bài viết',
                    error_code: lastError?.code,
                    private_reply_error: 'comment_not_found',
                    _debug: diagnostics,
                }, 400);
            }

            // Some comments found but failed for other reasons
            return jsonResponse({
                success: false,
                error: `Private Reply thất bại cho ${totalTried} comment`,
                error_code: lastError?.code,
                private_reply_error: 'all_failed',
                total_tried: totalTried,
                send_api_error: lastError?.message,
                _debug: diagnostics,
            }, 400);
        }

        // If Send API failed (non-551) without Private Reply fallback
        if (messageIds.length === 0 && lastError) {
            return jsonResponse({
                success: false,
                error: lastError.message || 'Failed to send message',
                error_code: lastError.code,
                error_subcode: lastError.error_subcode,
            }, 400);
        }

        console.log('[FACEBOOK-SEND] All messages sent successfully!');
        console.log('[FACEBOOK-SEND] ========================================');

        return jsonResponse({
            success: true,
            recipient_id: lastResult?.recipient_id,
            message_id: lastResult?.message_id,
            message_ids: messageIds,
            used_tag: usedTag,
        });

    } catch (error) {
        console.error('[FACEBOOK-SEND] Error:', error.message);
        return errorResponse('Failed to send message via Facebook: ' + error.message, 500);
    }
}

/**
 * Handle GET /api/facebook-graph/livevideo
 * Proxies to TPOS endpoint for live videos
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
/**
 * Handle GET /api/facebook-graph
 * Generic Facebook Graph API proxy for client-side queries
 * Usage: GET /api/facebook-graph?path={graphPath}&access_token={token}&fields=...&limit=...
 */
export async function handleFacebookGraph(request, url) {
    const path = url.searchParams.get('path');
    const accessToken = url.searchParams.get('access_token') || request.headers.get('X-Page-Access-Token');

    if (!path || !accessToken) {
        return errorResponse('Missing path or access_token', 400);
    }

    // Forward all params except 'path' to Facebook
    const fbParams = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
        if (key !== 'path') fbParams.set(key, value);
    }
    if (!fbParams.has('access_token')) {
        fbParams.set('access_token', accessToken);
    }

    const fbUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${path}?${fbParams.toString()}`;
    console.log(`[FB-GRAPH] Proxying: ${path}`);

    try {
        const resp = await fetchWithRetry(fbUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        }, 2, 1000, 15000);

        const body = await resp.text();
        return new Response(body, {
            status: resp.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
            },
        });
    } catch (error) {
        console.error('[FB-GRAPH] Error:', error.message);
        return errorResponse('Facebook Graph API error: ' + error.message, 500);
    }
}

export async function handleFacebookLiveVideos(request, url) {
    const targetUrl = `https://tomato.tpos.vn/api/facebook-graph/livevideo${url.search}`;

    console.log('[FACEBOOK-GRAPH-LIVE] ========================================');
    console.log('[FACEBOOK-GRAPH-LIVE] Proxying to TPOS:', targetUrl);

    const tposHeaders = buildTposHeaders(request);

    try {
        const tposResponse = await fetchWithRetry(targetUrl, {
            method: 'GET',
            headers: tposHeaders,
        }, 3, 1000, 15000);

        console.log('[FACEBOOK-GRAPH-LIVE] TPOS Response status:', tposResponse.status);
        console.log('[FACEBOOK-GRAPH-LIVE] ========================================');

        // Learn from response
        learnFromResponse(tposResponse);

        // Clone response and add CORS headers
        const newResponse = new Response(tposResponse.body, tposResponse);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        newResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, tposappversion, x-tpos-lang');

        return newResponse;

    } catch (error) {
        console.error('[FACEBOOK-GRAPH-LIVE] Error:', error.message);
        return errorResponse('Failed to fetch live videos from TPOS: ' + error.message, 500);
    }
}
