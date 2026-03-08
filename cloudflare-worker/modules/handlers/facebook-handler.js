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
        let { pageId, psid, message, pageToken, useTag, imageUrls, recipient, commentId } = body;

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

        // Tag priority: HUMAN_AGENT → CUSTOMER_FEEDBACK
        const TAG_SEQUENCE = ['HUMAN_AGENT', 'CUSTOMER_FEEDBACK'];

        const messageIds = [];
        let lastResult = null;
        let usedTag = null;

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

                console.warn(`[FACEBOOK-SEND] ⚠️ ${tag} failed (${result.error.code}): ${result.error.message}`);
                // Continue to next tag
            }

            // All tags failed, return last error
            const lastBody = { ...baseFbBody, messaging_type: 'MESSAGE_TAG', tag: TAG_SEQUENCE[TAG_SEQUENCE.length - 1] };
            const { response, result } = await sendToGraph(lastBody);
            return { success: false, result, status: response.status };
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
                    return jsonResponse({
                        success: false,
                        error: imgResult.result.error.message || 'Failed to send image',
                        error_code: imgResult.result.error.code,
                        error_subcode: imgResult.result.error.error_subcode,
                    }, imgResult.status || 400);
                }

                messageIds.push(imgResult.result.message_id);
                lastResult = imgResult.result;
                usedTag = imgResult.tag;
            }
        }

        // Send text message (if provided)
        const hasTextMessage = message && (typeof message === 'string' ? message.trim() : message.text);
        if (hasTextMessage) {
            const textFbBody = {
                recipient: recipient || { id: psid },
                message: typeof message === 'object' ? message : { text: message },
            };

            console.log('[FACEBOOK-SEND] Sending text message');
            const txtResult = await sendWithTagFallback(textFbBody);

            if (!txtResult.success) {
                // Fallback: Private Reply if Send API fails with 551 and commentId is available
                const errorCode = txtResult.result?.error?.code;
                if (errorCode === 551 && commentId) {
                    console.log('[FACEBOOK-SEND] 🔄 Send API failed with 551, trying Private Reply to comment:', commentId);
                    const privateReplyUrl = `${API_ENDPOINTS.FACEBOOK.GRAPH_URL}/${commentId}/private_replies?access_token=${pageToken}`;
                    const textContent = typeof message === 'object' ? message.text : message;

                    const prResponse = await fetchWithRetry(
                        privateReplyUrl,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({ message: textContent }),
                        },
                        3, 1000, 15000
                    );
                    const prResult = await prResponse.json();
                    console.log('[FACEBOOK-SEND] Private Reply response:', JSON.stringify(prResult));

                    if (!prResult.error) {
                        console.log('[FACEBOOK-SEND] ✅ Private Reply succeeded!');
                        messageIds.push(prResult.message_id || prResult.id);
                        lastResult = prResult;
                        usedTag = 'PRIVATE_REPLY';
                    } else {
                        console.error('[FACEBOOK-SEND] ❌ Private Reply also failed:', prResult.error);
                        return jsonResponse({
                            success: false,
                            error: prResult.error.message || 'Private Reply failed',
                            error_code: prResult.error.code,
                            error_subcode: prResult.error.error_subcode,
                            tried: ['HUMAN_AGENT', 'CUSTOMER_FEEDBACK', 'PRIVATE_REPLY'],
                        }, prResponse.status);
                    }
                } else {
                    console.error('[FACEBOOK-SEND] Text send error:', txtResult.result.error);
                    return jsonResponse({
                        success: false,
                        error: txtResult.result.error.message || 'Failed to send text',
                        error_code: txtResult.result.error.code,
                        error_subcode: txtResult.result.error.error_subcode,
                    }, txtResult.status || 400);
                }
            } else {
                messageIds.push(txtResult.result.message_id);
                lastResult = txtResult.result;
                usedTag = txtResult.tag;
            }
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
