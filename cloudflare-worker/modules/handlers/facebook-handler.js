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
        let { pageId, psid, message, pageToken, useTag, imageUrls, recipient, postId, customerName } = body;

        // Fallback: Get token from header if not in body
        if (!pageToken) {
            pageToken = request.headers.get('X-Page-Access-Token');
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

        // Tag priority: HUMAN_AGENT → CUSTOMER_FEEDBACK
        const TAG_SEQUENCE = ['HUMAN_AGENT', 'CUSTOMER_FEEDBACK'];

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
                const { response, result } = await sendToGraph(baseFbBody);
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

        // Helper: Query comments from a Facebook post/video
        async function queryComments(objectId, useStreamFilter) {
            const graphUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${objectId}/comments`;
            const params = new URLSearchParams({
                access_token: pageToken,
                fields: 'from{id,name},id,message,created_time',
                limit: '200',
                order: 'reverse_chronological'
            });
            if (useStreamFilter) params.set('filter', 'stream');

            console.log(`[PRIVATE-REPLY] Querying: ${objectId}/comments (filter=${useStreamFilter ? 'stream' : 'none'})`);

            const resp = await fetchWithRetry(
                `${graphUrl}?${params.toString()}`,
                { method: 'GET', headers: { 'Accept': 'application/json' } },
                2, 1000, 15000
            );
            return await resp.json();
        }

        // Helper: Find real Facebook comment ID by querying the post's comments
        // Tries multiple approaches: different post ID formats and matching strategies
        async function findRealCommentId(fbPostId, customerAsid, customerName) {
            console.log('[PRIVATE-REPLY] ========================================');
            console.log('[PRIVATE-REPLY] Looking up real comment ID from Facebook Graph API...');
            console.log('[PRIVATE-REPLY] Post ID:', fbPostId, '| Customer ASID:', customerAsid);
            if (customerName) console.log('[PRIVATE-REPLY] Customer Name:', customerName);

            // Try multiple post ID formats:
            // 1. Full format: "pageId_postId" (e.g. "112678138086607_2901171643422289")
            // 2. Just the post part (e.g. "2901171643422289")
            const postIdVariants = [fbPostId];
            if (fbPostId.includes('_')) {
                postIdVariants.push(fbPostId.split('_').slice(1).join('_'));
            }

            for (const postIdVariant of postIdVariants) {
                // Try with and without stream filter
                for (const useStream of [true, false]) {
                    try {
                        const data = await queryComments(postIdVariant, useStream);

                        if (data.error) {
                            console.warn(`[PRIVATE-REPLY] Error for ${postIdVariant} (stream=${useStream}):`, data.error.message);
                            continue;
                        }

                        const comments = data.data || [];
                        console.log(`[PRIVATE-REPLY] Found ${comments.length} comments on ${postIdVariant} (stream=${useStream})`);

                        if (comments.length === 0) continue;

                        // Log available commenters for debugging
                        const commenters = comments
                            .filter(c => c.from)
                            .map(c => ({ id: c.from.id, name: c.from.name }));
                        const uniqueCommenters = [...new Map(commenters.map(c => [c.id, c])).values()];
                        console.log('[PRIVATE-REPLY] Commenters found:', JSON.stringify(uniqueCommenters.slice(0, 15)));

                        // Strategy 1: Match by ID (PSID may match from.id with Page Token)
                        let customerComment = comments.find(c =>
                            c.from && String(c.from.id) === String(customerAsid)
                        );

                        if (customerComment) {
                            console.log(`[PRIVATE-REPLY] ✅ Matched by ID! Comment: ${customerComment.id}`);
                            console.log(`[PRIVATE-REPLY]   From: ${customerComment.from.name} (${customerComment.from.id})`);
                            return customerComment.id;
                        }

                        // Strategy 2: Match by name (fallback when PSID ≠ from.id)
                        if (customerName) {
                            const normalizedName = customerName.trim().toLowerCase();
                            customerComment = comments.find(c =>
                                c.from && c.from.name && c.from.name.trim().toLowerCase() === normalizedName
                            );

                            if (customerComment) {
                                console.log(`[PRIVATE-REPLY] ✅ Matched by NAME! Comment: ${customerComment.id}`);
                                console.log(`[PRIVATE-REPLY]   From: ${customerComment.from.name} (${customerComment.from.id})`);
                                console.log(`[PRIVATE-REPLY]   Note: ID mismatch - PSID=${customerAsid}, from.id=${customerComment.from.id}`);
                                return customerComment.id;
                            }
                        }

                        console.log(`[PRIVATE-REPLY] No match found in ${postIdVariant} (stream=${useStream})`);
                        // Found comments but no match - continue trying other variants
                    } catch (err) {
                        console.error(`[PRIVATE-REPLY] Error querying ${postIdVariant}:`, err.message);
                    }
                }
            }

            console.error('[PRIVATE-REPLY] ❌ Could not find customer comment after trying all variants');
            return null;
        }

        // Helper: Send Private Reply via Facebook Graph API
        async function sendPrivateReply(realCommentId, messageText) {
            const prUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${realCommentId}/private_replies`;
            console.log('[PRIVATE-REPLY] Sending Private Reply to comment:', realCommentId);

            const resp = await fetchWithRetry(
                `${prUrl}?access_token=${pageToken}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ message: messageText }),
                },
                2, 1000, 15000
            );
            const result = await resp.json();

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
        // If Send API failed with 551 (no inbox conversation) and we have a postId,
        // query Facebook Graph API for the real comment ID and use Private Reply
        if (sendFailed551 && postId && hasTextMessage) {
            console.log('[FACEBOOK-SEND] ========================================');
            console.log('[FACEBOOK-SEND] Send API failed with 551 → trying Private Reply fallback');

            const messageText = typeof message === 'string' ? message : message.text;
            const realCommentId = await findRealCommentId(postId, psid, customerName);

            if (realCommentId) {
                const prResult = await sendPrivateReply(realCommentId, messageText);

                if (prResult.success) {
                    console.log('[FACEBOOK-SEND] ✅ Private Reply fallback succeeded!');
                    return jsonResponse({
                        success: true,
                        recipient_id: prResult.result.recipient_id,
                        message_id: prResult.result.id,
                        message_ids: [prResult.result.id],
                        used_tag: 'PRIVATE_REPLY',
                        method: 'private_reply',
                        real_comment_id: realCommentId,
                    });
                }

                // Private Reply also failed
                console.error('[FACEBOOK-SEND] ❌ Private Reply also failed');
                return jsonResponse({
                    success: false,
                    error: prResult.result.error?.message || 'Private Reply failed',
                    error_code: prResult.result.error?.code,
                    error_subcode: prResult.result.error?.error_subcode,
                    method: 'private_reply',
                    real_comment_id: realCommentId,
                    send_api_error: lastError?.message,
                }, prResult.status || 400);
            }

            // Could not find real comment ID
            console.error('[FACEBOOK-SEND] ❌ Could not find real comment ID for Private Reply');
            return jsonResponse({
                success: false,
                error: lastError?.message || 'Send API failed and Private Reply comment not found',
                error_code: lastError?.code || 551,
                error_subcode: lastError?.error_subcode,
                private_reply_error: 'Customer comment not found on post',
                post_id: postId,
                customer_asid: psid,
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
