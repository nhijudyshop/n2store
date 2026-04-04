// =====================================================
// tab1-extension-bridge.js - Pancake Extension Bridge for Tab1
// Exact same logic as inbox/js/inbox-main.js + inbox/js/inbox-chat.js
// but adapted for iframe architecture (parent.postMessage relay)
// =====================================================
// ARCHITECTURE:
//   tab1-orders.html runs inside an IFRAME in main.html.
//   Extension contentscript injects into top frame (main.html), NOT iframe.
//   main.html has a relay bridge that forwards messages both ways.
//   Flow: Extension ↔ contentscript ↔ main.html relay ↔ iframe (this code)

// ===== Extension state (same as inbox-main.js window.pancakeExtension) =====
window.pancakeExtension = { connected: false, lastEvents: [] };

// ===== globalUserId cache (same as inbox-chat.js _globalIdCache) =====
window._globalIdCache = {};

/**
 * Post message to extension via parent frame relay.
 * In inbox (top frame): window.postMessage() → contentscript directly
 * In tab1 (iframe): parent.postMessage() → main.html relay → contentscript
 */
function _postToExtension(data) {
    if (window.parent !== window) {
        window.parent.postMessage(data, '*');
    } else {
        window.postMessage(data, '*');
    }
}

/**
 * Initialize extension with page IDs (PREINITIALIZE_PAGES)
 * Same as inbox-main.js line 238-243
 */
function initExtensionPages(pageIds) {
    if (!pageIds || !pageIds.length) return;
    window._extensionPageIds = pageIds;
    if (window.pancakeExtension.connected) {
        _postToExtension({ type: 'PREINITIALIZE_PAGES', pageIds: pageIds });
    }
}

/**
 * Send message via Pancake Extension (bypass 24h)
 * EXACT copy of inbox-chat.js _sendViaExtension (lines 2181-2334)
 * @param {string} text - Message text
 * @param {Object} conv - Conversation data { pageId, psid, _raw, _messagesData, customers, customerName, conversationId, updated_at, type }
 * @returns {Promise<Object>} Extension response
 */
async function sendViaExtension(text, conv) {
    if (!window.pancakeExtension.connected) {
        throw new Error('Pancake Extension chưa kết nối. Vui lòng cài extension và reload trang.');
    }

    const raw = conv._raw || {};
    const psid = conv.psid || raw.from_psid || raw.from?.id || '';
    const conversationUpdatedTime = conv.updated_at ? new Date(conv.updated_at).getTime() : Date.now();
    const accessToken = window.pancakeTokenManager?.currentToken || '';

    // ===== Resolve globalUserId (same 4-step fallback as inbox-chat.js) =====
    const cacheKey = conv.conversationId || conv.id || `${conv.pageId}_${psid}`;
    let globalUserId = window._globalIdCache[cacheKey] || null;

    // Try 1: Cache
    if (globalUserId) {
    }

    // Try 2: page_customer.global_id
    if (!globalUserId) {
        globalUserId = raw.page_customer?.global_id || null;
    }

    // Try 2b: customers[].global_id (from messages API response)
    if (!globalUserId && conv._messagesData?.customers?.length) {
        globalUserId = conv._messagesData.customers[0].global_id || null;
    }

    // Try 2c: conv.customers[] directly
    if (!globalUserId && conv.customers?.length) {
        globalUserId = conv.customers[0].global_id || null;
    }

    // Try 3: GET_GLOBAL_ID_FOR_CONV via extension
    // Now supports 5 strategies: threadId-based (1-3) + customerName-based (4-5)
    // IMPORTANT: Skip thread_id if it equals psid — PSID confuses thread-based strategies
    let fbThreadId = raw.thread_id || null;
    if (fbThreadId && fbThreadId === psid) {
        console.warn('[EXT-SEND] thread_id === psid, skipping thread_id (would confuse extension)');
        fbThreadId = null;
    }
    const custName = conv.customerName || conv.from?.name || '';

    if (!globalUserId && (fbThreadId || custName)) {
        const taskId = Date.now();

        globalUserId = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                console.warn('[EXT-SEND] GET_GLOBAL_ID_FOR_CONV timeout (60s)');
                resolve(null);
            }, 60000);

            const handler = (e) => {
                const d = e.data;
                if (!d || !d.type) return;
                if (d.type === 'GET_GLOBAL_ID_FOR_CONV_SUCCESS' && d.taskId === taskId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    resolve(d.globalId);
                }
                if (d.type === 'GET_GLOBAL_ID_FOR_CONV_FAILURE' && d.taskId === taskId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    console.warn('[EXT-SEND] GET_GLOBAL_ID_FOR_CONV failed:', d);
                    resolve(null);
                }
            };
            window.addEventListener('message', handler);

            _postToExtension({
                type: 'GET_GLOBAL_ID_FOR_CONV',
                pageId: conv.pageId,
                threadId: fbThreadId,
                threadKey: fbThreadId ? 't_' + fbThreadId : null,
                isBusiness: true,
                conversationUpdatedTime,
                customerName: custName,
                convType: conv.type || 'INBOX',
                postId: null, convId: null,
                taskId, from: 'WEBPAGE'
            });
        });
    } else if (!globalUserId) {
        console.warn('[EXT-SEND] No global_id, no thread_id, no customerName');
    }

    if (!globalUserId) {
        throw new Error('Không tìm được Global Facebook ID. Khách hàng này chưa có global_id trong Pancake.');
    }

    // Cache for next time
    window._globalIdCache[cacheKey] = globalUserId;

    // ===== Send REPLY_INBOX_PHOTO (exact same payload as inbox-chat.js) =====
    const sendTaskId = Date.now();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            window.removeEventListener('message', handler);
            console.error('[EXT-SEND] REPLY_INBOX_PHOTO timeout (60s)');
            reject(new Error('Extension gửi tin nhắn timeout (60s)'));
        }, 60000);

        const handler = (e) => {
            const d = e.data;
            if (!d || !d.type) return;
            if (d.type === 'REPLY_INBOX_PHOTO_SUCCESS' && d.taskId === sendTaskId) {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                resolve(d);
            }
            if (d.type === 'REPLY_INBOX_PHOTO_FAILURE' && d.taskId === sendTaskId) {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                console.error('[EXT-SEND] FAILURE:', d);
                reject(new Error(d.error || 'Extension gửi tin nhắn thất bại'));
            }
        };
        window.addEventListener('message', handler);

        const payload = {
            type: 'REPLY_INBOX_PHOTO',
            pageId: conv.pageId,
            igPageId: null,
            accessToken: accessToken,
            tryResizeImage: true,
            contentIds: [],
            message: text,
            attachmentType: 'SEND_TEXT_ONLY',
            globalUserId: globalUserId,
            platform: 'facebook',
            replyMessage: null,
            threadId: psid,
            convId: 't_' + psid,
            customerName: conv.customerName || conv.from?.name || '',
            conversationUpdatedTime: conversationUpdatedTime,
            photoUrls: [],
            isBusiness: false, // MUST be false (same as inbox)
            taskId: sendTaskId,
            from: 'WEBPAGE'
        };

        _postToExtension(payload);
    });
}

/**
 * Build conversation data object for sendViaExtension from available sources
 * Merges data from window.currentConversationData + pancakeDataManager cache
 */
function buildConvData(pageId, psid) {
    const storedData = window.currentConversationData || {};
    const rawFromMerge = storedData._raw || {};

    // IMPORTANT: storedData IS the original conversation from the lookup API.
    // It may have thread_id, page_customer at the TOP level (not inside _raw).
    // _raw was set by _loadMessages() from the messages API response.
    // We need to check BOTH levels.
    if (!rawFromMerge.thread_id && storedData.thread_id) {
        rawFromMerge.thread_id = storedData.thread_id;
    }
    if (!rawFromMerge.page_customer?.global_id && storedData.page_customer?.global_id) {
        if (!rawFromMerge.page_customer) rawFromMerge.page_customer = {};
        rawFromMerge.page_customer.global_id = storedData.page_customer.global_id;
    }

    const conv = {
        pageId: pageId,
        psid: psid,
        conversationId: window.currentConversationId,
        _raw: rawFromMerge,
        customers: storedData.customers || [],
        _messagesData: storedData._messagesData || { customers: storedData.customers || [] },
        updated_at: storedData.updated_at || null,
        customerName: window.currentCustomerName || '',
        type: storedData.type || window.currentConversationType || 'INBOX'
    };

    // Merge from pancakeDataManager cache (additional source)
    if (window.pancakeDataManager?.inboxMapByPSID) {
        for (const [, cached] of window.pancakeDataManager.inboxMapByPSID) {
            if (cached.id === window.currentConversationId ||
                (String(cached.pageId) === String(pageId) && String(cached.psid) === String(psid))) {
                // Merge page_customer from cache
                if (!conv._raw.page_customer?.global_id) {
                    const cachedGlobalId = cached._raw?.page_customer?.global_id
                        || cached.page_customer?.global_id;
                    if (cachedGlobalId) {
                        if (!conv._raw.page_customer) conv._raw.page_customer = {};
                        conv._raw.page_customer.global_id = cachedGlobalId;
                    }
                }
                // Merge thread_id from cache
                if (!conv._raw.thread_id) {
                    conv._raw.thread_id = cached._raw?.thread_id || cached.thread_id || null;
                }
                // Merge customers
                if (cached.customers?.length && !conv.customers?.length) {
                    conv.customers = cached.customers;
                    conv._messagesData = { customers: cached.customers };
                }
                if (!conv.updated_at) conv.updated_at = cached.updated_at;
                conv.from = cached.from;
                if (cached.type) conv.type = cached.type;
                break;
            }
        }
    }

    return conv;
}

/**
 * Upload a single image via extension (UPLOAD_INBOX_PHOTO)
 * @param {File|Blob} file - Image file
 * @param {string} pageId
 * @returns {Promise<string>} fbId from Facebook
 */
async function uploadImageViaExtension(file, pageId) {
    // Convert File to data URL so extension can fetch it
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    // Upload data URL as a blob URL won't work cross-context
    // Instead, upload to CF Worker first, then give extension the URL
    const blob = new Blob([file], { type: file.type });
    const blobUrl = URL.createObjectURL(blob);

    // Extension needs a fetchable URL. Data URLs work in extension context.
    const taskId = Date.now() + Math.random();
    const uploadId = `upload_${Date.now()}`;

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            window.removeEventListener('message', handler);
            reject(new Error('UPLOAD_INBOX_PHOTO timeout (60s)'));
        }, 60000);

        const handler = (e) => {
            const d = e.data;
            if (!d?.type || d.taskId !== taskId) return;
            if (d.type === 'UPLOAD_INBOX_PHOTO_SUCCESS') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                URL.revokeObjectURL(blobUrl);
                resolve(d.fbId);
            }
            if (d.type === 'UPLOAD_INBOX_PHOTO_FAILURE') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                URL.revokeObjectURL(blobUrl);
                reject(new Error(d.error || 'Upload failed'));
            }
        };
        window.addEventListener('message', handler);

        _postToExtension({
            type: 'UPLOAD_INBOX_PHOTO',
            pageId,
            photoUrl: dataUrl,
            name: file.name || 'image.jpg',
            taskId,
            uploadId,
            from: 'WEBPAGE'
        });
    });
}

/**
 * Upload images and send via extension (bypass 24h)
 * @param {File[]} images - Array of image files
 * @param {string} text - Optional text message
 * @param {Object} conv - Conversation data (from buildConvData)
 */
async function sendImagesViaExtension(images, text, conv) {
    if (!window.pancakeExtension.connected) {
        throw new Error('Extension chưa kết nối');
    }

    const pageId = conv.pageId;

    // Step 1: Upload each image → get fbIds
    const fbIds = [];
    for (const file of images) {
        const fbId = await uploadImageViaExtension(file, pageId);
        fbIds.push(fbId);
    }

    // Step 2: Send images via REPLY_INBOX_PHOTO
    if (fbIds.length > 0) {
        await sendViaExtensionWithAttachments(conv, '', 'PHOTO', fbIds);
    }

    // Step 3: Send text if any (separate message, same as inbox pattern)
    if (text) {
        await sendViaExtension(text, conv);
    }
}

/**
 * Send message via extension with attachment support
 * Extended version of sendViaExtension that supports files array
 */
async function sendViaExtensionWithAttachments(conv, text, attachmentType, files) {
    if (!window.pancakeExtension.connected) {
        throw new Error('Extension chưa kết nối');
    }

    const raw = conv._raw || {};
    const psid = conv.psid || raw.from_psid || raw.from?.id || '';
    const conversationUpdatedTime = conv.updated_at ? new Date(conv.updated_at).getTime() : Date.now();
    const accessToken = window.pancakeTokenManager?.currentToken || '';

    // Resolve globalUserId (reuse cache from sendViaExtension)
    const cacheKey = conv.conversationId || conv.id || `${conv.pageId}_${psid}`;
    let globalUserId = window._globalIdCache[cacheKey] || null;

    if (!globalUserId) {
        globalUserId = raw.page_customer?.global_id || null;
    }
    if (!globalUserId && conv._messagesData?.customers?.length) {
        globalUserId = conv._messagesData.customers[0].global_id || null;
    }
    if (!globalUserId && conv.customers?.length) {
        globalUserId = conv.customers[0].global_id || null;
    }

    // Try GET_GLOBAL_ID_FOR_CONV
    const fbThreadId = raw.thread_id || null;
    if (!globalUserId && fbThreadId) {
        const taskId = Date.now();
        globalUserId = await new Promise((resolve) => {
            const timeout = setTimeout(() => { window.removeEventListener('message', h); resolve(null); }, 60000);
            const h = (e) => {
                const d = e.data;
                if (!d?.type || d.taskId !== taskId) return;
                if (d.type === 'GET_GLOBAL_ID_FOR_CONV_SUCCESS') { clearTimeout(timeout); window.removeEventListener('message', h); resolve(d.globalId); }
                if (d.type === 'GET_GLOBAL_ID_FOR_CONV_FAILURE') { clearTimeout(timeout); window.removeEventListener('message', h); resolve(null); }
            };
            window.addEventListener('message', h);
            _postToExtension({ type: 'GET_GLOBAL_ID_FOR_CONV', pageId: conv.pageId, threadId: fbThreadId, threadKey: 't_' + fbThreadId, isBusiness: true, conversationUpdatedTime, customerName: conv.customerName || '', convType: conv.type || 'INBOX', postId: null, convId: null, taskId, from: 'WEBPAGE' });
        });
    }

    if (!globalUserId) {
        throw new Error('Không tìm được Global Facebook ID');
    }
    window._globalIdCache[cacheKey] = globalUserId;

    // Send REPLY_INBOX_PHOTO with attachments
    const sendTaskId = Date.now();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('Extension timeout (60s)')); }, 60000);
        const handler = (e) => {
            const d = e.data;
            if (!d?.type || d.taskId !== sendTaskId) return;
            if (d.type === 'REPLY_INBOX_PHOTO_SUCCESS') { clearTimeout(timeout); window.removeEventListener('message', handler); resolve(d); }
            if (d.type === 'REPLY_INBOX_PHOTO_FAILURE') { clearTimeout(timeout); window.removeEventListener('message', handler); reject(new Error(d.error || 'Gửi ảnh thất bại')); }
        };
        window.addEventListener('message', handler);

        _postToExtension({
            type: 'REPLY_INBOX_PHOTO',
            pageId: conv.pageId,
            igPageId: null,
            accessToken,
            tryResizeImage: true,
            contentIds: [],
            files: files || [],
            message: text || '',
            attachmentType: attachmentType || 'SEND_TEXT_ONLY',
            globalUserId,
            platform: 'facebook',
            replyMessage: null,
            threadId: psid,
            convId: 't_' + psid,
            customerName: conv.customerName || '',
            conversationUpdatedTime,
            photoUrls: [],
            isBusiness: false,
            taskId: sendTaskId,
            from: 'WEBPAGE'
        });
    });
}

/**
 * Send comment via extension (SEND_COMMENT)
 * @param {string} text - Comment text
 * @param {string} pageId - Page ID
 * @param {string} postId - Post ID (ft_ent_identifier)
 * @param {string} commentId - Parent comment ID to reply to (optional)
 * @returns {Promise<Object>} { commentId }
 */
async function sendCommentViaExtension(text, pageId, postId, commentId) {
    if (!window.pancakeExtension.connected) {
        throw new Error('Extension chưa kết nối');
    }

    const taskId = Date.now() + Math.random();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('Extension comment timeout (30s)')); }, 30000);
        const handler = (e) => {
            const d = e.data;
            if (!d?.type || d.taskId !== taskId) return;
            if (d.type === 'SEND_COMMENT_SUCCESS') { clearTimeout(timeout); window.removeEventListener('message', handler); resolve(d); }
            if (d.type === 'SEND_COMMENT_FAILURE') { clearTimeout(timeout); window.removeEventListener('message', handler); reject(new Error(d.error || 'Extension comment failed')); }
        };
        window.addEventListener('message', handler);

        _postToExtension({
            type: 'SEND_COMMENT',
            pageId,
            postId: postId || '',
            commentId: commentId || '',
            message: text,
            taskId,
            from: 'WEBPAGE'
        });
    });
}

/**
 * Send private reply via extension (SEND_PRIVATE_REPLY)
 * @param {string} text - Message text
 * @param {string} pageId - Page ID
 * @param {string} commentId - Comment ID to reply to
 * @returns {Promise<Object>} { threadId }
 */
async function sendPrivateReplyViaExtension(text, pageId, commentId) {
    if (!window.pancakeExtension.connected) {
        throw new Error('Extension chưa kết nối');
    }

    const taskId = Date.now() + Math.random();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('Extension private reply timeout (30s)')); }, 30000);
        const handler = (e) => {
            const d = e.data;
            if (!d?.type || d.taskId !== taskId) return;
            if (d.type === 'SEND_PRIVATE_REPLY_SUCCESS') { clearTimeout(timeout); window.removeEventListener('message', handler); resolve(d); }
            if (d.type === 'SEND_PRIVATE_REPLY_FAILURE') { clearTimeout(timeout); window.removeEventListener('message', handler); reject(new Error(d.error || 'Extension private reply failed')); }
        };
        window.addEventListener('message', handler);

        _postToExtension({
            type: 'SEND_PRIVATE_REPLY',
            pageId,
            commentId,
            message: text,
            taskId,
            from: 'WEBPAGE'
        });
    });
}

// Expose functions globally
window.sendViaExtension = sendViaExtension;
window.sendImagesViaExtension = sendImagesViaExtension;
window.sendCommentViaExtension = sendCommentViaExtension;
window.sendPrivateReplyViaExtension = sendPrivateReplyViaExtension;
window.buildConvData = buildConvData;
window.initExtensionPages = initExtensionPages;

// =====================================================
// EVENT LISTENER - Register immediately (same as inbox-main.js line 207)
// =====================================================
window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || !d.type) return;
    var type = d.type;

    // Log extension-related events (same filter as inbox-main.js)
    var isExtEvent = type.includes('EXTENSION') || type.includes('REPLY_INBOX') ||
        type.includes('UPLOAD_INBOX') || type.includes('PREINITIALIZE') ||
        type.includes('BUSINESS_CONTEXT') || type.includes('GLOBAL_ID') ||
        type.includes('BATCH_GET') || type.includes('CHECK_EXTENSION') ||
        type.includes('SEND_COMMENT') || type.includes('SEND_PRIVATE_REPLY') ||
        type === 'EXT_BRIDGE_PROBE_RESPONSE' ||
        (d.from === 'EXTENSION');

    if (isExtEvent) {
        window.pancakeExtension.lastEvents.push({ type: type, time: new Date().toISOString(), data: d });
        if (window.pancakeExtension.lastEvents.length > 50) window.pancakeExtension.lastEvents.shift();
    }

    // EXTENSION_LOADED (relayed from main.html)
    if (type === 'EXTENSION_LOADED' && d.from === 'EXTENSION') {
        window.pancakeExtension.connected = true;
        if (window.notificationManager) {
            window.notificationManager.show('Pancake Extension đã kết nối', 'success');
        }
        // Send PREINITIALIZE_PAGES if we have page IDs
        if (window._extensionPageIds?.length) {
            _postToExtension({ type: 'PREINITIALIZE_PAGES', pageIds: window._extensionPageIds });
        }
    }

    // Probe response from main.html relay
    if (type === 'EXT_BRIDGE_PROBE_RESPONSE') {
        if (d.connected && !window.pancakeExtension.connected) {
            window.pancakeExtension.connected = true;
            if (window.notificationManager) {
                window.notificationManager.show('Pancake Extension đã kết nối', 'success');
            }
            if (window._extensionPageIds?.length) {
                _postToExtension({ type: 'PREINITIALIZE_PAGES', pageIds: window._extensionPageIds });
            }
        }
    }

    // Extension disconnect
    if (type === 'REPORT_EXTENSION_STATUS' && d.status === 'disconnected') {
        window.pancakeExtension.connected = false;
    }
});

// =====================================================
// PROBE: Check if extension already connected
// =====================================================
if (window.parent !== window) {
    window.parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*');

    setTimeout(function() {
        if (!window.pancakeExtension.connected) {
            window.parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*');
        }
    }, 2000);

    setTimeout(function() {
        if (!window.pancakeExtension.connected) {
            window.parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*');
        }
    }, 5000);
}

