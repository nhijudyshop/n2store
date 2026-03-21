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

console.log('[Tab1-ExtBridge] Loading...');

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
        console.log('[Tab1-ExtBridge] Sent PREINITIALIZE_PAGES:', pageIds);
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
        console.log('[EXT-SEND] Cache hit globalUserId:', globalUserId);
    }

    // Try 2: page_customer.global_id
    if (!globalUserId) {
        globalUserId = raw.page_customer?.global_id || null;
        if (globalUserId) console.log('[EXT-SEND] Got globalUserId from page_customer:', globalUserId);
    }

    // Try 2b: customers[].global_id (from messages API response)
    if (!globalUserId && conv._messagesData?.customers?.length) {
        globalUserId = conv._messagesData.customers[0].global_id || null;
        if (globalUserId) console.log('[EXT-SEND] Got globalUserId from _messagesData.customers[]:', globalUserId);
    }

    // Try 2c: conv.customers[] directly
    if (!globalUserId && conv.customers?.length) {
        globalUserId = conv.customers[0].global_id || null;
        if (globalUserId) console.log('[EXT-SEND] Got globalUserId from conv.customers[]:', globalUserId);
    }

    // Try 3: GET_GLOBAL_ID_FOR_CONV via extension (needs Facebook thread_id, NOT PSID!)
    const fbThreadId = raw.thread_id || null;

    console.log('[EXT-SEND] Extension send:', {
        pageId: conv.pageId, psid, globalUserId, fbThreadId,
        _sources: {
            cache: window._globalIdCache[cacheKey] || null,
            page_customer: raw.page_customer?.global_id || null,
            messagesData_customers: conv._messagesData?.customers?.[0]?.global_id || null,
            conv_customers: conv.customers?.[0]?.global_id || null,
            thread_id: fbThreadId,
        }
    });

    if (!globalUserId && fbThreadId) {
        console.log('[EXT-SEND] No global_id, trying GET_GLOBAL_ID_FOR_CONV with thread_id:', fbThreadId);
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
                    console.log('[EXT-SEND] Got globalUserId from extension:', d.globalId);
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
                threadKey: 't_' + fbThreadId,
                isBusiness: true,
                conversationUpdatedTime,
                customerName: conv.customerName || conv.from?.name || '',
                convType: conv.type || 'INBOX',
                postId: null, convId: null,
                taskId, from: 'WEBPAGE'
            });
        });
    } else if (!globalUserId) {
        console.warn('[EXT-SEND] No global_id AND no thread_id in conversation data');
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
                console.log('[EXT-SEND] SUCCESS:', d.messageId);
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
        console.log('[EXT-SEND] Sent REPLY_INBOX_PHOTO:', { pageId: conv.pageId, psid, globalUserId });
    });
}

/**
 * Build conversation data object for sendViaExtension from available sources
 * Merges data from window.currentConversationData + pancakeDataManager cache
 */
function buildConvData(pageId, psid) {
    const storedData = window.currentConversationData || {};
    const conv = {
        pageId: pageId,
        psid: psid,
        conversationId: window.currentConversationId,
        _raw: storedData._raw || {},
        customers: storedData.customers || [],
        _messagesData: { customers: storedData.customers || [] },
        updated_at: null,
        customerName: window.currentCustomerName || '',
        type: 'INBOX'
    };

    // Merge from pancakeDataManager cache
    if (window.pancakeDataManager?.inboxMapByPSID) {
        for (const [, cached] of window.pancakeDataManager.inboxMapByPSID) {
            if (cached.id === window.currentConversationId ||
                (String(cached.pageId) === String(pageId) && String(cached.psid) === String(psid))) {
                if (!conv._raw.page_customer && cached._raw?.page_customer) {
                    conv._raw.page_customer = cached._raw.page_customer;
                }
                if (!conv._raw.thread_id && cached._raw?.thread_id) {
                    conv._raw.thread_id = cached._raw.thread_id;
                }
                if (cached.customers?.length && !conv.customers?.length) {
                    conv.customers = cached.customers;
                    conv._messagesData = { customers: cached.customers };
                }
                conv.updated_at = cached.updated_at;
                conv.from = cached.from;
                conv.type = cached.type || 'INBOX';
                break;
            }
        }
    }

    return conv;
}

// Expose functions globally
window.sendViaExtension = sendViaExtension;
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
        type === 'EXT_BRIDGE_PROBE_RESPONSE' ||
        (d.from === 'EXTENSION');

    if (isExtEvent) {
        window.pancakeExtension.lastEvents.push({ type: type, time: new Date().toISOString(), data: d });
        if (window.pancakeExtension.lastEvents.length > 50) window.pancakeExtension.lastEvents.shift();
        console.log('[EXT-EVENT]', type, d);
    }

    // EXTENSION_LOADED (relayed from main.html)
    if (type === 'EXTENSION_LOADED' && d.from === 'EXTENSION') {
        window.pancakeExtension.connected = true;
        console.log('[Tab1-ExtBridge] Extension connected!');
        if (window.notificationManager) {
            window.notificationManager.show('Pancake Extension đã kết nối', 'success');
        }
        // Send PREINITIALIZE_PAGES if we have page IDs
        if (window._extensionPageIds?.length) {
            _postToExtension({ type: 'PREINITIALIZE_PAGES', pageIds: window._extensionPageIds });
            console.log('[Tab1-ExtBridge] Sent PREINITIALIZE_PAGES:', window._extensionPageIds);
        }
    }

    // Probe response from main.html relay
    if (type === 'EXT_BRIDGE_PROBE_RESPONSE') {
        if (d.connected && !window.pancakeExtension.connected) {
            window.pancakeExtension.connected = true;
            console.log('[Tab1-ExtBridge] Extension was already connected (probe)');
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
    console.log('[Tab1-ExtBridge] In iframe, probing parent...');
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

console.log('[Tab1-ExtBridge] Loaded - iframe:', window.parent !== window);
