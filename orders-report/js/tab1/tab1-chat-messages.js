/* =====================================================
   TAB1 CHAT MESSAGES - Rendering + Sending
   Adapted from inbox/js/inbox-chat.js
   ===================================================== */

console.log('[Chat-Msg] Loading...');

// =====================================================
// MESSAGE RENDERING
// =====================================================

/**
 * Render chat messages into the messages container
 * @param {Array} messages - Array of message objects
 */
window.renderChatMessages = function(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="chat-empty-state"><p>Chưa có tin nhắn</p></div>';
        return;
    }

    let lastDate = '';
    const html = messages
        .filter(msg => {
            const t = (msg.text || '').trim();
            if (t.startsWith('Đã thêm nhãn tự động:') || t.startsWith('Đã đặt giai đoạn')) return false;
            if (t === '[Tin nhắn trống]') return false;
            return true;
        })
        .map(msg => {
            // Date separator
            const msgDate = _formatDate(msg.time);
            let dateSeparator = '';
            if (msgDate !== lastDate) {
                lastDate = msgDate;
                dateSeparator = `<div class="chat-date-separator"><span>${msgDate}</span></div>`;
            }

            const isOutgoing = msg.sender === 'shop';
            const isHidden = msg.isHidden || false;
            const isRemoved = msg.isRemoved || false;

            // Attachments
            let mediaHtml = '';
            const mediaAttachments = (msg.attachments || []).filter(a => a.type !== 'reaction');
            if (mediaAttachments.length > 0) {
                mediaHtml = _renderAttachments(mediaAttachments);
            }

            // Text
            let textHtml = '';
            if (msg.text) {
                textHtml = `<div class="message-text">${_formatMessageText(msg.text)}</div>`;
            }

            // Status
            let statusClass = '';
            if (isRemoved) statusClass = ' removed';
            if (isHidden) statusClass = ' hidden-msg';

            // Reply type badge
            let replyBadge = '';
            if (msg.privateReplyConversation) {
                replyBadge = '<span class="msg-reply-badge private">Nhắn riêng</span>';
            }

            // Sender name (for outgoing from shop staff)
            const senderHtml = isOutgoing && msg.senderName
                ? `<span class="message-sender-name">${_escapeHtml(msg.senderName)}</span>`
                : '';

            // Actions
            const actionsHtml = _buildMessageActions(msg);

            // Avatar
            const avatarHtml = !isOutgoing
                ? `<div class="message-avatar" data-sender-id="${msg.fromId || ''}">${_getAvatarContent(msg)}</div>`
                : '';

            return `
                ${dateSeparator}
                <div class="message-row ${isOutgoing ? 'outgoing' : 'incoming'}${statusClass}" data-msg-id="${msg.id}">
                    ${avatarHtml}
                    <div class="message-bubble">
                        ${actionsHtml}
                        ${mediaHtml}
                        ${textHtml}
                        <div class="message-meta">
                            ${replyBadge}
                            ${senderHtml}
                            <span class="message-time">${_formatTime(msg.time)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
};

// =====================================================
// AVATAR HELPER
// =====================================================

function _getAvatarContent(msg) {
    const psid = msg.fromId || window.currentChatPSID || '';
    const initial = (msg.senderName || 'K').charAt(0).toUpperCase();
    if (psid) {
        const pageId = window.currentChatChannelId || '';
        const imgUrl = window._getChatAvatarUrl
            ? window._getChatAvatarUrl(psid, pageId)
            : `https://graph.facebook.com/${psid}/picture?type=small`;
        return `<img src="${imgUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.textContent='${initial}'">`;
    }
    return initial;
}

// =====================================================
// ATTACHMENT RENDERING (from inbox-chat.js renderAttachments)
// =====================================================

function _renderAttachments(attachments) {
    return attachments.map(att => {
        // Quoted/replied message
        if (att.type === 'replied_message') {
            const quotedText = att.message || '';
            const quotedFrom = att.from?.name || att.from?.admin_name || '';
            let attachPreview = '';
            if (att.attachments?.length > 0) {
                const qAtt = att.attachments[0];
                const qUrl = qAtt.url || qAtt.file_url || '';
                if ((qAtt.type === 'photo' || qAtt.mime_type?.startsWith('image/')) && qUrl) {
                    attachPreview = `<img src="${qUrl}" style="max-width:60px;max-height:40px;border-radius:4px;margin-top:3px;object-fit:cover;" loading="lazy">`;
                }
            }
            const content = quotedText
                ? `<div class="quoted-text">${_escapeHtml(quotedText)}</div>`
                : (attachPreview || '<span class="quoted-placeholder">[Tin nhắn]</span>');
            return `<div class="quoted-message">
                <div class="quoted-from">↩ ${_escapeHtml(quotedFrom)}</div>
                ${content}${quotedText && attachPreview ? `<div>${attachPreview}</div>` : ''}
            </div>`;
        }

        const url = att.url || att.file_url || att.preview_url || att.payload?.url || att.src || '';
        if (!url) return '';

        // Image
        if (att.type === 'image' || att.type === 'photo' || att.mime_type?.startsWith('image/')) {
            return `<div class="message-media"><img class="message-image" src="${url}" alt="Ảnh" onclick="window.showImageZoom ? showImageZoom('${url.replace(/'/g, "\\'")}') : window.open('${url}','_blank')" loading="lazy"></div>`;
        }
        // Sticker / GIF
        if (att.type === 'sticker' || att.sticker_id || att.type === 'animated_image_url') {
            return `<div class="message-media"><img class="message-sticker" src="${url}" alt="Sticker" loading="lazy"></div>`;
        }
        // Video
        if (att.type === 'video' || att.mime_type?.startsWith('video/')) {
            return `<div class="message-media"><video controls src="${url}" preload="metadata" style="max-width:240px;border-radius:8px;"></video></div>`;
        }
        // Audio
        if (att.type === 'audio' || att.mime_type?.startsWith('audio/')) {
            return `<div class="message-media"><audio controls src="${url}" preload="metadata"></audio></div>`;
        }
        // File
        if (att.type === 'file' || att.type === 'document') {
            const fileName = att.name || att.filename || 'Tệp đính kèm';
            return `<div class="message-file"><a href="${url}" target="_blank" rel="noopener">📄 ${_escapeHtml(fileName)}</a></div>`;
        }
        // Like
        if (att.type === 'like' || att.type === 'thumbsup') {
            return `<div class="message-like">👍</div>`;
        }
        return '';
    }).join('');
}

function _buildMessageActions(msg) {
    if (msg.sender !== 'customer') return '';

    const actions = [];
    actions.push(`<button class="msg-action-btn" onclick="window.setReplyMessage('${msg.id}')" title="Trả lời">↩</button>`);

    if (window.currentConversationType === 'COMMENT') {
        if (msg.canLike) {
            actions.push(`<button class="msg-action-btn" onclick="window.toggleLikeComment('${msg.id}')" title="Thích">👍</button>`);
        }
        if (msg.canHide) {
            actions.push(`<button class="msg-action-btn" onclick="window.toggleHideComment('${msg.id}')" title="Ẩn">👁</button>`);
        }
    }

    if (actions.length === 0) return '';
    return `<div class="message-actions">${actions.join('')}</div>`;
}

// =====================================================
// MESSAGE SENDING (exact inbox pattern)
// =====================================================

/**
 * Main send message entry point
 * Fallback chain: Pancake API → Extension Bypass → Error
 */
window.sendMessage = async function() {
    if (window.isSendingMessage || !window.currentConversationId) return;

    const inputEl = document.getElementById('chatInput');
    const text = inputEl?.value?.trim() || '';
    const pendingImages = window.getPendingImages ? window.getPendingImages() : [];

    if (!text && pendingImages.length === 0) return;

    // COMMENT: reply_comment requires a reply target
    if (!pendingImages.length && window.currentConversationType === 'COMMENT' &&
        !window.currentReplyMessage && window.currentReplyType === 'reply_comment') {
        _showToast('Chọn bình luận để trả lời, hoặc đổi sang "Nhắn riêng".', 'warning');
        return;
    }

    window.isSendingMessage = true;
    const sendBtn = document.querySelector('.send-btn');
    if (sendBtn) sendBtn.disabled = true;

    // Clear input immediately
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    if (window.clearImagePreviews) window.clearImagePreviews();

    // Capture reply state
    const replyData = window.currentReplyMessage;
    window.cancelReply();

    // Optimistic UI update
    if (text) {
        window.allChatMessages.push({
            id: 'opt_' + Date.now(),
            text: text,
            time: new Date(),
            sender: 'shop',
            senderName: '',
            attachments: [],
        });
        window.renderChatMessages(window.allChatMessages);
    }

    const pageId = window.currentSendPageId || window.currentChatChannelId;
    const convId = window.currentConversationId;

    try {
        const pdm = window.pancakeDataManager;
        if (!pdm) throw new Error('pancakeDataManager not available');

        const pat = await pdm.getPageAccessToken(pageId);
        if (!pat) throw new Error('Không tìm thấy page_access_token');

        // Upload images first
        if (pendingImages.length > 0) {
            _showToast('Đang tải ảnh lên...', 'info');
            for (const file of pendingImages) {
                const uploadResult = await pdm.uploadMedia(pageId, file, pat);
                if (uploadResult?.content_url) {
                    // Send image as separate message (content_url and message are mutually exclusive)
                    await pdm.sendMessage(pageId, convId, {
                        action: 'reply_inbox',
                        message: '',
                        content_url: uploadResult.content_url
                    }, pat);
                } else if (uploadResult?.id) {
                    await pdm.sendMessage(pageId, convId, {
                        action: 'reply_inbox',
                        content_ids: [uploadResult.id]
                    }, pat);
                } else {
                    console.warn('[Chat-Msg] Upload failed:', uploadResult);
                }
            }
            if (text) await new Promise(r => setTimeout(r, 300));
        }

        // Send text
        if (text) {
            if (window.currentConversationType === 'COMMENT') {
                await _sendComment(pdm, pageId, convId, text, pat, replyData);
            } else {
                await _sendInbox(pdm, pageId, convId, text, pat, replyData);
            }
        }

        // Reload messages after 2s to get server-confirmed versions
        setTimeout(async () => {
            if (window.currentConversationId === convId) {
                pdm.clearMessagesCache(pageId, convId);
                const result = await pdm.fetchMessages(pageId, convId);
                if (result.messages?.length > 0 && window.currentConversationId === convId) {
                    const messages = result.messages.map(msg => {
                        const isFromPage = msg.from?.id === pageId;
                        return {
                            id: msg.id,
                            text: msg.original_message || window._stripHtml(msg.message || ''),
                            time: window._parseTimestamp(msg.inserted_at) || new Date(),
                            sender: isFromPage ? 'shop' : 'customer',
                            senderName: msg.from?.name || '',
                            fromId: msg.from?.id || '',
                            attachments: msg.attachments || [],
                            isHidden: msg.is_hidden || false,
                            isRemoved: msg.is_removed || false,
                        };
                    });
                    window.allChatMessages = messages;
                    window.currentChatCursor = messages.length;
                    window.renderChatMessages(messages);
                }
            }
        }, 2000);

    } catch (error) {
        console.error('[Chat-Msg] Send error:', error);
        const fb = error.fbError;
        if (fb?.is24HourError) {
            _showToast('Đã quá 24h. Khách cần nhắn tin trước mới gửi lại được.', 'error');
        } else if (fb?.isUserUnavailable) {
            _showToast('Không thể gửi: Khách chưa từng inbox hoặc đã block page.', 'error');
        } else {
            _showToast('Lỗi gửi tin nhắn: ' + error.message, 'error');
        }
    } finally {
        window.isSendingMessage = false;
        if (sendBtn) sendBtn.disabled = false;
    }
};

// =====================================================
// SEND HELPERS (exact inbox pattern)
// =====================================================

/**
 * Send INBOX message. Fallback: Extension Bypass
 */
async function _sendInbox(pdm, pageId, convId, text, pat, replyData) {
    const payload = { action: 'reply_inbox', message: text };
    if (replyData?.id) payload.replied_message_id = replyData.id;

    try {
        const result = await _sendApi(pdm, pageId, convId, payload, pat);
        console.log('[Chat-Msg] reply_inbox succeeded:', result);
    } catch (err) {
        // Fallback: Extension Bypass 24h
        if (window.pancakeExtension?.connected && window.sendViaExtension) {
            console.log('[Chat-Msg] API failed, trying Extension Bypass...', err.message);
            _showToast('Đang gửi qua Extension...', 'warning');
            const conv = window.buildConvData(pageId, window.currentChatPSID);
            await window.sendViaExtension(text, conv);
            _showToast('Đã gửi qua Extension (bypass 24h)', 'success');
            return;
        }
        throw err;
    }
}

/**
 * Send COMMENT message. Fallback chain: reply_comment → private_replies → reply_inbox → Extension
 */
async function _sendComment(pdm, pageId, convId, text, pat, replyData) {
    const conv = window.currentConversationData || {};
    const raw = conv._raw || {};
    const postId = raw.post_id || conv._messagesData?.post?.id || '';
    const fromId = window.currentChatPSID || raw.from?.id || '';
    const messageId = replyData?.id || convId;
    const type = window.currentReplyType || 'reply_comment';

    if (type === 'reply_comment') {
        try {
            await _sendApi(pdm, pageId, convId, {
                action: 'reply_comment', message_id: messageId, message: text
            }, pat);
            return;
        } catch (err) {
            console.warn('[Chat-Msg] reply_comment failed:', err.message);
            // Fallback: private_replies
            try {
                await _sendApi(pdm, pageId, convId, {
                    action: 'private_replies', post_id: postId, message_id: messageId, from_id: fromId, message: text
                }, pat);
                _showToast('Bình luận thất bại, đã gửi nhắn riêng', 'warning');
                return;
            } catch (err2) {
                // Fallback: Extension
                if (window.pancakeExtension?.connected && window.sendViaExtension) {
                    const convData = window.buildConvData(pageId, window.currentChatPSID);
                    await window.sendViaExtension(text, convData);
                    _showToast('Đã gửi qua Extension', 'success');
                    return;
                }
                throw err;
            }
        }
    } else {
        // private_replies mode
        try {
            await _sendApi(pdm, pageId, convId, {
                action: 'private_replies', post_id: postId, message_id: messageId, from_id: fromId, message: text
            }, pat);
            _showToast('Đã nhắn riêng', 'info');
            return;
        } catch (err) {
            // Fallback: reply_inbox
            try {
                await _sendApi(pdm, pageId, convId, { action: 'reply_inbox', message: text }, pat);
                _showToast('Đã gửi qua Messenger', 'info');
                return;
            } catch (err2) {
                // Fallback: Extension
                if (window.pancakeExtension?.connected && window.sendViaExtension) {
                    const convData = window.buildConvData(pageId, window.currentChatPSID);
                    await window.sendViaExtension(text, convData);
                    _showToast('Đã gửi qua Extension', 'success');
                    return;
                }
                throw err;
            }
        }
    }
}

/**
 * API helper - sends message and checks response
 * Checks both HTTP status and Pancake success field
 */
async function _sendApi(pdm, pageId, convId, payload, pat) {
    const result = await pdm.sendMessage(pageId, convId, payload, pat);

    // Pancake may return success:false with error details
    if (result && result.success === false) {
        const parsed = _parseFbError(JSON.stringify(result));
        const err = new Error(parsed.message);
        err.fbError = parsed;
        throw err;
    }

    return result;
}

/**
 * Parse Facebook/Pancake error response
 */
function _parseFbError(responseText) {
    try {
        const data = JSON.parse(responseText);
        const eCode = data.e_code || data.error_code || data.error?.code || 0;
        const eSubcode = data.e_subcode || data.error_subcode || data.error?.error_subcode || 0;
        const message = data.message || data.error?.message || responseText;
        const is24HourError = (eCode === 10 && eSubcode === 2018278) ||
            (message && message.includes('khoảng thời gian cho phép'));
        const isUserUnavailable = (eCode === 551) ||
            (message && message.includes('không có mặt'));
        return { eCode, eSubcode, message, is24HourError, isUserUnavailable, raw: data };
    } catch {
        return { eCode: 0, eSubcode: 0, message: responseText, is24HourError: false, isUserUnavailable: false, raw: null };
    }
}

// =====================================================
// COMMENT ACTIONS
// =====================================================

window.toggleLikeComment = async function(msgId) {
    const pdm = window.pancakeDataManager;
    if (!pdm) return;
    const msg = window.allChatMessages.find(m => m.id === msgId);
    if (!msg) return;

    if (msg.userLikes) {
        await pdm.unlikeComment(window.currentChatChannelId, msgId);
        msg.userLikes = false;
    } else {
        await pdm.likeComment(window.currentChatChannelId, msgId);
        msg.userLikes = true;
    }
};

window.toggleHideComment = async function(msgId) {
    const pdm = window.pancakeDataManager;
    if (!pdm) return;
    const msg = window.allChatMessages.find(m => m.id === msgId);
    if (!msg) return;

    if (msg.isHidden) {
        await pdm.unhideComment(window.currentChatChannelId, msgId);
        msg.isHidden = false;
    } else {
        await pdm.hideComment(window.currentChatChannelId, msgId);
        msg.isHidden = true;
    }
    window.renderChatMessages(window.allChatMessages);
};

// =====================================================
// FORMATTING HELPERS
// =====================================================

function _escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _formatMessageText(text) {
    if (!text) return '';
    let escaped = _escapeHtml(text);
    // Convert URLs to links
    escaped = escaped.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    // Convert newlines
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
}

function _formatTime(date) {
    if (!date) return '';
    if (!(date instanceof Date)) date = new Date(date);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', hour12: false
    }).format(date);
}

function _formatDate(date) {
    if (!date) return '';
    if (!(date instanceof Date)) date = new Date(date);
    if (isNaN(date.getTime())) return '';

    const vnFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const now = new Date();
    const dateParts = vnFmt.formatToParts(date);
    const nowParts = vnFmt.formatToParts(now);
    const getVal = (parts, type) => parseInt(parts.find(p => p.type === type)?.value || '0');

    const isSameDay = getVal(dateParts, 'year') === getVal(nowParts, 'year') &&
                      getVal(dateParts, 'month') === getVal(nowParts, 'month') &&
                      getVal(dateParts, 'day') === getVal(nowParts, 'day');
    if (isSameDay) return 'Hôm nay';

    const vnDateObj = new Date(getVal(dateParts, 'year'), getVal(dateParts, 'month') - 1, getVal(dateParts, 'day'));
    const vnNowObj = new Date(getVal(nowParts, 'year'), getVal(nowParts, 'month') - 1, getVal(nowParts, 'day'));
    if (Math.floor((vnNowObj - vnDateObj) / 86400000) === 1) return 'Hôm qua';

    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
    }).format(date);
}

function _showToast(message, type) {
    if (window.notificationManager?.show) {
        window.notificationManager.show(message, type);
    } else {
        console.log(`[Toast-${type}]`, message);
    }
}

// Expose escapeHtml globally (used by other modules)
window.escapeHtml = _escapeHtml;

console.log('[Chat-Msg] Loaded.');
