/**
 * Facebook Handler
 * Handles Facebook Graph API related endpoints
 *
 * @module cloudflare-worker/modules/handlers/facebook-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { jsonResponse, errorResponse, CORS_HEADERS } from '../utils/cors-utils.js';
import { buildTposHeaders, learnFromResponse } from '../utils/header-learner.js';
import { API_ENDPOINTS } from '../../config/endpoints.js';

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
        let { pageId, psid, message, pageToken, useTag, imageUrls, recipient } = body;

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

        const messageIds = [];
        let lastResult = null;

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

                if (useTag) {
                    imageFbBody.messaging_type = 'MESSAGE_TAG';
                    imageFbBody.tag = 'POST_PURCHASE_UPDATE';
                } else if (!recipient?.comment_id) {
                    imageFbBody.messaging_type = 'RESPONSE';
                }

                console.log('[FACEBOOK-SEND] Sending image:', imageUrl);

                const imageResponse = await fetchWithRetry(
                    `${graphApiUrl}?access_token=${pageToken}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(imageFbBody),
                    },
                    3, 1000, 15000
                );

                const imageResult = await imageResponse.json();
                console.log('[FACEBOOK-SEND] Image response:', JSON.stringify(imageResult));

                if (imageResult.error) {
                    console.error('[FACEBOOK-SEND] Image send error:', imageResult.error);
                    return jsonResponse({
                        success: false,
                        error: imageResult.error.message || 'Failed to send image',
                        error_code: imageResult.error.code,
                        error_subcode: imageResult.error.error_subcode,
                    }, imageResponse.status);
                }

                messageIds.push(imageResult.message_id);
                lastResult = imageResult;
            }
        }

        // Send text message (if provided)
        const hasTextMessage = message && (typeof message === 'string' ? message.trim() : message.text);
        if (hasTextMessage) {
            const textFbBody = {
                recipient: recipient || { id: psid },
                message: typeof message === 'object' ? message : { text: message },
            };

            if (useTag) {
                textFbBody.messaging_type = 'MESSAGE_TAG';
                textFbBody.tag = 'POST_PURCHASE_UPDATE';
                console.log('[FACEBOOK-SEND] Using MESSAGE_TAG with POST_PURCHASE_UPDATE');
            } else if (!recipient?.comment_id) {
                textFbBody.messaging_type = 'RESPONSE';
                console.log('[FACEBOOK-SEND] Using standard RESPONSE messaging_type');
            } else {
                console.log('[FACEBOOK-SEND] Using Private Reply (comment_id)');
            }

            console.log('[FACEBOOK-SEND] Sending text message');

            const textResponse = await fetchWithRetry(
                `${graphApiUrl}?access_token=${pageToken}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(textFbBody),
                },
                3, 1000, 15000
            );

            const textResult = await textResponse.json();
            console.log('[FACEBOOK-SEND] Text response:', JSON.stringify(textResult));

            if (textResult.error) {
                console.error('[FACEBOOK-SEND] Text send error:', textResult.error);
                return jsonResponse({
                    success: false,
                    error: textResult.error.message || 'Failed to send text',
                    error_code: textResult.error.code,
                    error_subcode: textResult.error.error_subcode,
                }, textResponse.status);
            }

            messageIds.push(textResult.message_id);
            lastResult = textResult;
        }

        console.log('[FACEBOOK-SEND] All messages sent successfully!');
        console.log('[FACEBOOK-SEND] ========================================');

        return jsonResponse({
            success: true,
            recipient_id: lastResult?.recipient_id,
            message_id: lastResult?.message_id,
            message_ids: messageIds,
            used_tag: useTag ? 'POST_PURCHASE_UPDATE' : null,
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
