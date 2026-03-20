// =====================================================
// tab1-chat-facebook.js - Facebook Graph API Integration
// Send message via Facebook Tag (HUMAN_AGENT / POST_PURCHASE_UPDATE),
// 24h policy fallback UI, switchToCommentMode
// =====================================================
// Dependencies: tab1-chat-core.js (state globals), tab1-chat-messages.js (renderChatMessages)
// Exposes: sendMessageViaFacebookTag (file-scoped, called from messages.js),
//          window.show24hFallbackPrompt, window.sendViaFacebookTagFromModal,
//          window.switchToCommentMode, window.close24hFallbackModal,
//          window.current24hPolicyStatus

console.log('[Tab1-Chat-Facebook] Loading...');

// Cache for invalid Facebook tokens (keyed by pageId)
const _fbTokenValidationCache = {};

/**
 * Get Facebook Page Token from various sources (TPOS CRMTeam data)
 * Shared utility - used by tab1-chat-facebook.js, tab1-chat-realtime.js, bill-service.js
 *
 * Priority: 1. currentCRMTeam → 2. currentOrder.CRMTeam → 3. cachedChannelsData → 4. TPOS API
 *
 * @param {string} [pageId] - Facebook Page ID (defaults to window.currentChatChannelId)
 * @returns {Promise<string|null>} Facebook Page Token or null
 */
window.getFacebookPageToken = async function (pageId) {
    pageId = pageId || window.currentChatChannelId;
    if (!pageId) return null;

    // Check validation cache - skip known-invalid tokens
    if (_fbTokenValidationCache[pageId]?.invalid) {
        const cacheAge = Date.now() - (_fbTokenValidationCache[pageId].timestamp || 0);
        // Cache invalid status for 10 minutes, then allow retry
        if (cacheAge < 10 * 60 * 1000) {
            console.warn('[FB-TOKEN] Token for page', pageId, 'marked invalid (cached). Skipping.');
            return null;
        }
        delete _fbTokenValidationCache[pageId];
    }

    // Source 1: currentCRMTeam (set when chat modal opens)
    if (window.currentCRMTeam?.Facebook_PageToken) {
        const crmPageId = window.currentCRMTeam.ChannelId || window.currentCRMTeam.Facebook_AccountId || window.currentCRMTeam.Id;
        if (String(crmPageId) === String(pageId) || String(window.currentCRMTeam.Facebook_AccountId) === String(pageId)) {
            return window.currentCRMTeam.Facebook_PageToken;
        }
    }

    // Source 2: currentOrder.CRMTeam
    if (window.currentOrder?.CRMTeam?.Facebook_PageToken) {
        const crmPageId = window.currentOrder.CRMTeam.ChannelId || window.currentOrder.CRMTeam.Facebook_AccountId;
        if (String(crmPageId) === String(pageId) || String(window.currentOrder.CRMTeam.Facebook_AccountId) === String(pageId)) {
            return window.currentOrder.CRMTeam.Facebook_PageToken;
        }
    }

    // Source 3: cachedChannelsData
    if (window.cachedChannelsData) {
        const channel = window.cachedChannelsData.find(ch =>
            String(ch.ChannelId) === String(pageId) || String(ch.Facebook_AccountId) === String(pageId)
        );
        if (channel?.Facebook_PageToken) return channel.Facebook_PageToken;
    }

    // Source 4: Fetch CRMTeam from TPOS API
    try {
        const headers = await window.tokenManager?.getAuthHeader() || {};
        const baseUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const crmUrl = `${baseUrl}/api/odata/CRMTeam?$filter=ChannelId eq '${pageId}' or Facebook_AccountId eq '${pageId}'&$top=1`;
        const response = await fetch(crmUrl, {
            method: 'GET',
            headers: { ...headers, 'Accept': 'application/json' }
        });
        if (response.ok) {
            const data = await response.json();
            const teams = data.value || data;
            if (teams?.length > 0 && teams[0].Facebook_PageToken) {
                return teams[0].Facebook_PageToken;
            }
        }
    } catch (fetchError) {
        console.warn('[FB-TOKEN] Could not fetch CRMTeam from TPOS:', fetchError.message);
    }

    // Source 5 removed: fallback to mismatched CRMTeam token always fails with page mismatch error
    return null;
};

/**
 * Mark a Facebook Page Token as invalid (e.g. expired, error code 190)
 * @param {string} pageId
 */
window.markFacebookTokenInvalid = function (pageId) {
    _fbTokenValidationCache[pageId] = { invalid: true, timestamp: Date.now() };
};

/**
 * Send message via Facebook Graph API with HUMAN_AGENT / POST_PURCHASE_UPDATE message tag
 * Used to bypass 24h policy when normal Pancake API fails
 * @param {object} params - Message parameters
 * @param {string} params.pageId - Facebook Page ID
 * @param {string} params.psid - Facebook PSID of recipient
 * @param {string} params.message - Message text to send
 * @param {Array<string>} params.imageUrls - Optional array of image URLs to send
 * @returns {Promise<{success: boolean, error?: string, messageId?: string}>}
 */
async function sendMessageViaFacebookTag(params) {
    const { pageId, psid, message, imageUrls, postId, customerName } = params;

    console.log('[FB-TAG-SEND] ========================================');
    console.log('[FB-TAG-SEND] Attempting to send message via Facebook Graph API with HUMAN_AGENT / POST_PURCHASE_UPDATE tag');
    console.log('[FB-TAG-SEND] Page ID:', pageId, 'PSID:', psid);

    try {
        const facebookPageToken = await window.getFacebookPageToken(pageId);

        if (!facebookPageToken) {
            console.error('[FB-TAG-SEND] No Facebook Page Token found for page:', pageId);
            return {
                success: false,
                error: 'Không tìm thấy Facebook Page Token. Token này khác với Pancake token và cần được thiết lập trong TPOS.'
            };
        }

        // Call Facebook Send API via our worker proxy
        const facebookSendUrl = window.API_CONFIG.buildUrl.facebookSend();
        console.log('[FB-TAG-SEND] Calling:', facebookSendUrl);

        // Collect known comment IDs from order data for direct Private Reply
        const knownCommentIdStr = window.purchaseCommentId || null;
        const knownCommentIds = knownCommentIdStr
            ? knownCommentIdStr.split(',').map(id => id.trim()).filter(Boolean)
            : [];

        const requestBody = {
            pageId: pageId,
            psid: psid,
            message: message,
            pageToken: facebookPageToken,
            useTag: true, // Use HUMAN_AGENT / POST_PURCHASE_UPDATE tag
            imageUrls: imageUrls || [],
            postId: postId || window.purchaseFacebookPostId || null,
            customerName: customerName || window.currentCustomerName || null,
            knownCommentIds: knownCommentIds // Direct Private Reply fallback
        };

        const response = await fetch(facebookSendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();
        console.log('[FB-TAG-SEND] Response:', result);
        console.log('[FB-TAG-SEND] ========================================');

        if (result.success) {
            console.log('[FB-TAG-SEND] Message sent successfully via Facebook Graph API!');
            console.log('[FB-TAG-SEND] Message ID:', result.message_id);
            console.log('[FB-TAG-SEND] Used tag:', result.used_tag);
            return {
                success: true,
                messageId: result.message_id,
                recipientId: result.recipient_id,
                usedTag: result.used_tag
            };
        } else {
            console.error('[FB-TAG-SEND] Facebook API error:', result.error);

            // Detect expired/invalid token (error code 190)
            if (result.error_code === 190 || result.error_subcode === 463 || result.error_subcode === 467) {
                window.markFacebookTokenInvalid(pageId);
                if (window.notificationManager) {
                    window.notificationManager.show(
                        'Facebook Page Token hết hạn hoặc không hợp lệ. Vui lòng cập nhật trong TPOS → Kênh bán hàng.',
                        'error', 10000
                    );
                }
            }

            return {
                success: false,
                error: result.error || 'Facebook API error',
                errorCode: result.error_code,
                errorSubcode: result.error_subcode
            };
        }

    } catch (error) {
        console.error('[FB-TAG-SEND] Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Global flag to track if 24h policy fallback UI should be shown
window.current24hPolicyStatus = {
    isExpired: false,
    hoursSinceLastMessage: null,
    canUseFacebookTag: false
};

/**
 * Show 24h policy fallback prompt with option to send via Facebook tag
 */
window.show24hFallbackPrompt = function (messageText, pageId, psid) {
    // Check if Extension is available for bypass
    const extConnected = window.tab1ExtensionBridge?.isConnected();
    const extensionButton = extConnected ? `
                <button onclick="window.sendViaExtensionFromModal('${encodeURIComponent(messageText)}', '${pageId}', '${psid}')"
                    style="padding: 12px 16px; background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-plug"></i>
                    Gửi qua Extension (bypass 24h)
                </button>
                <p style="font-size: 12px; color: #9ca3af; margin: 0; padding: 0 8px;">
                    Gửi trực tiếp qua Business Suite - không giới hạn 24h
                </p>` : '';

    const modalContent = `
        <div style="padding: 20px; max-width: 400px;">
            <h3 style="margin: 0 0 16px; color: #ef4444; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-clock"></i>
                Đã quá 24 giờ
            </h3>
            <p style="color: #6b7280; margin: 0 0 16px; line-height: 1.5;">
                Khách hàng chưa tương tác trong 24 giờ qua. Chọn cách gửi tin nhắn:
            </p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                ${extensionButton}
                <button onclick="window.sendViaFacebookTagFromModal('${encodeURIComponent(messageText)}', '${pageId}', '${psid}')"
                    style="padding: 12px 16px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fab fa-facebook"></i>
                    Gửi với Message Tag (HUMAN_AGENT / POST_PURCHASE_UPDATE)
                </button>
                <p style="font-size: 12px; color: #9ca3af; margin: 0; padding: 0 8px;">
                    Chỉ dùng cho thông báo liên quan đơn hàng (xác nhận, vận chuyển, yêu cầu hành động)
                </p>
                <button onclick="window.switchToCommentMode()"
                    style="padding: 12px 16px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-comment"></i>
                    Chuyển sang reply Comment
                </button>
                <button onclick="window.close24hFallbackModal()"
                    style="padding: 10px 16px; background: transparent; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
                    Hủy
                </button>
            </div>
        </div>
    `;

    // Create modal
    let modal = document.getElementById('fb24hFallbackModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fb24hFallbackModal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10001; display: flex; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `<div style="background: white; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.2);">${modalContent}</div>`;
    modal.style.display = 'flex';
};

window.close24hFallbackModal = function () {
    const modal = document.getElementById('fb24hFallbackModal');
    if (modal) modal.style.display = 'none';
};

window.sendViaFacebookTagFromModal = async function (encodedMessage, pageId, psid, imageUrls = [], postId = null, customerName = null) {
    window.close24hFallbackModal();

    const message = decodeURIComponent(encodedMessage);

    if (window.notificationManager) {
        window.notificationManager.show('Đang gửi qua Facebook Graph API...', 'info');
    }

    const result = await sendMessageViaFacebookTag({ pageId, psid, message, imageUrls, postId, customerName });

    if (result.success) {
        if (window.notificationManager) {
            window.notificationManager.show('Đã gửi tin nhắn thành công qua Facebook!', 'success', 5000);
        }

        // Add optimistic UI update
        const now = new Date().toISOString();
        const tempMessage = {
            Id: `fb_${Date.now()}`,
            id: `fb_${Date.now()}`,
            Message: message + '\n\n[Gửi qua Facebook Message Tag]',
            CreatedTime: now,
            IsOwner: true,
            is_temp: true
        };
        window.allChatMessages.push(tempMessage);
        renderChatMessages(window.allChatMessages, true);

        // Refresh messages after a delay
        setTimeout(async () => {
            try {
                if (window.currentChatPSID && window.currentChatChannelId) {
                    const response = await window.chatDataManager.fetchMessages(
                        window.currentChatChannelId,
                        window.currentChatPSID
                    );
                    if (response.messages && response.messages.length > 0) {
                        window.allChatMessages = response.messages;
                        renderChatMessages(window.allChatMessages, false);
                    }
                }
            } catch (e) {
                console.error('[FB-TAG-SEND] Error refreshing messages:', e);
            }
        }, 1000);
    } else {
        if (window.notificationManager) {
            window.notificationManager.show('Lỗi gửi qua Facebook: ' + result.error, 'error', 8000);
        } else {
            alert('Lỗi gửi qua Facebook: ' + result.error);
        }
    }
};

/**
 * Send message via Extension from 24h fallback modal
 */
window.sendViaExtensionFromModal = async function (encodedMessage, pageId, psid) {
    window.close24hFallbackModal();
    const message = decodeURIComponent(encodedMessage);

    if (!window.tab1ExtensionBridge?.isConnected()) {
        if (window.notificationManager) {
            window.notificationManager.show('Extension chưa kết nối. Vui lòng cài extension và reload.', 'error');
        }
        return;
    }

    try {
        if (window.notificationManager) {
            window.notificationManager.show('Đang gửi qua Extension (bypass 24h)...', 'info');
        }

        // Build conv data for resolving globalUserId
        let convData = { pageId, psid, conversationId: window.currentConversationId, _raw: {}, customers: [] };
        if (window.currentConversationId && window.pancakeDataManager) {
            for (const [key, conv] of window.pancakeDataManager.inboxMapByPSID) {
                if (conv.id === window.currentConversationId) {
                    convData = conv;
                    break;
                }
            }
        }

        const globalUserId = await window.tab1ExtensionBridge.resolveGlobalUserId(convData);
        if (!globalUserId) {
            throw new Error('Không tìm được Global Facebook ID');
        }

        const result = await window.tab1ExtensionBridge.sendMessage({
            text: message,
            pageId,
            psid,
            globalUserId,
            customerName: window.currentCustomerName || ''
        });

        if (window.notificationManager) {
            window.notificationManager.show('Đã gửi qua Extension (bypass 24h)!', 'success');
        }

        // Optimistic UI update
        const tempMessage = {
            Id: result.messageId || `ext_${Date.now()}`,
            id: result.messageId || `ext_${Date.now()}`,
            Message: message,
            message: message,
            CreatedTime: new Date().toISOString(),
            inserted_at: new Date().toISOString(),
            IsOwner: true,
            is_temp: true
        };
        window.allChatMessages.push(tempMessage);
        window._messageIdSet?.add(tempMessage.id);
        renderChatMessages(window.allChatMessages, true);

    } catch (err) {
        console.error('[EXT-MODAL] Extension send failed:', err);
        if (window.notificationManager) {
            window.notificationManager.show('Extension gửi thất bại: ' + err.message, 'error');
        }
    }
};

window.switchToCommentMode = function () {
    window.close24hFallbackModal();
    if (window.notificationManager) {
        window.notificationManager.show('Vui lòng mở lại modal Comment để reply', 'info', 5000);
    }
};

// Expose sendMessageViaFacebookTag for use by tab1-chat-messages.js
window.sendMessageViaFacebookTag = sendMessageViaFacebookTag;

console.log('[Tab1-Chat-Facebook] Loaded successfully.');
