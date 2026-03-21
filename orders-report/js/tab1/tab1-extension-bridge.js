// =====================================================
// tab1-extension-bridge.js - Pancake Extension Bridge for Tab1
// Handles Extension connection + bypass 24h messaging via
// business.facebook.com/messaging/send/ (Extension V2)
// =====================================================
// ARCHITECTURE:
//   tab1-orders.html runs inside an IFRAME in main.html.
//   Extension contentscript injects into top frame (main.html), NOT iframe.
//   main.html has a relay bridge that:
//     1. Catches extension events (EXTENSION_LOADED, REPLY_INBOX_PHOTO_SUCCESS, etc.)
//        and forwards them DOWN to this iframe via iframe.contentWindow.postMessage()
//     2. Catches extension commands FROM this iframe (REPLY_INBOX_PHOTO, etc.)
//        and forwards them UP to contentscript via window.postMessage()
//
//   Flow: Extension ↔ contentscript ↔ main.html relay ↔ iframe (this code)
//
// Reference: inbox/js/inbox-main.js (extension bridge), inbox/js/inbox-chat.js

console.log('[Tab1-ExtBridge] Loading...');

window.tab1ExtensionBridge = {
    connected: false,
    lastEvents: [],
    _globalIdCache: {},
    _initialized: false,
    _pageIds: [],

    /**
     * Initialize with page IDs for PREINITIALIZE_PAGES
     * @param {string[]} pageIds - Page IDs to pre-initialize
     */
    init(pageIds) {
        if (this._initialized) return;
        this._initialized = true;
        this._pageIds = pageIds || [];

        // If already connected (from early EXTENSION_LOADED), send PREINITIALIZE now
        if (this.connected && this._pageIds.length > 0) {
            this._postToExtension({ type: 'PREINITIALIZE_PAGES', pageIds: this._pageIds });
            console.log('[Tab1-ExtBridge] Sent PREINITIALIZE_PAGES (deferred):', this._pageIds);
        }

        console.log('[Tab1-ExtBridge] Initialized with', this._pageIds.length, 'page IDs');
    },

    /**
     * Post message to extension via parent frame relay
     * If in iframe: parent.postMessage() → main.html relay → contentscript
     * If top frame: window.postMessage() → contentscript directly
     */
    _postToExtension(data) {
        if (window.parent !== window) {
            // We're in an iframe - send to parent for relay
            window.parent.postMessage(data, '*');
        } else {
            // We're top frame - send directly
            window.postMessage(data, '*');
        }
    },

    /**
     * Resolve globalUserId from conversation data using 5-step fallback
     * @param {Object} conv - Conversation data with fields: pageId, psid, _raw, _messagesData
     * @returns {Promise<string|null>} globalUserId or null
     */
    async resolveGlobalUserId(conv) {
        const raw = conv._raw || conv.raw || {};
        const cacheKey = conv.conversationId || conv.id || `${conv.pageId}_${conv.psid}`;

        // Try 1: Cache (instant)
        let globalUserId = this._globalIdCache[cacheKey] || null;
        if (globalUserId) {
            console.log('[Tab1-EXT] Cache hit globalUserId:', globalUserId);
            return globalUserId;
        }

        // Try 2: Pancake API page_customer.global_id
        globalUserId = raw.page_customer?.global_id || null;
        if (globalUserId) {
            console.log('[Tab1-EXT] Got globalUserId from page_customer:', globalUserId);
            this._globalIdCache[cacheKey] = globalUserId;
            return globalUserId;
        }

        // Try 2b: Messages response customers[].global_id (~1-2s vs ~30-40s extension)
        if (conv._messagesData?.customers?.length) {
            globalUserId = conv._messagesData.customers[0].global_id || null;
            if (globalUserId) {
                console.log('[Tab1-EXT] Got globalUserId from _messagesData.customers[]:', globalUserId);
                this._globalIdCache[cacheKey] = globalUserId;
                return globalUserId;
            }
        }

        // Try 3: If conversation has customers array directly
        if (conv.customers?.length) {
            globalUserId = conv.customers[0].global_id || null;
            if (globalUserId) {
                console.log('[Tab1-EXT] Got globalUserId from conv.customers[]:', globalUserId);
                this._globalIdCache[cacheKey] = globalUserId;
                return globalUserId;
            }
        }

        // Try 4: GET_GLOBAL_ID_FOR_CONV via extension (needs Facebook thread_id, NOT PSID!)
        const fbThreadId = raw.thread_id || null;
        if (fbThreadId) {
            console.log('[Tab1-EXT] Trying GET_GLOBAL_ID_FOR_CONV with thread_id:', fbThreadId);
            const taskId = Date.now();

            globalUserId = await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    window.removeEventListener('message', handler);
                    console.warn('[Tab1-EXT] GET_GLOBAL_ID_FOR_CONV timeout (60s)');
                    resolve(null);
                }, 60000);

                const handler = (e) => {
                    const d = e.data;
                    if (!d || !d.type) return;
                    if (d.type === 'GET_GLOBAL_ID_FOR_CONV_SUCCESS' && d.taskId === taskId) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        console.log('[Tab1-EXT] Got globalUserId from extension:', d.globalId);
                        resolve(d.globalId);
                    }
                    if (d.type === 'GET_GLOBAL_ID_FOR_CONV_FAILURE' && d.taskId === taskId) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        console.warn('[Tab1-EXT] GET_GLOBAL_ID_FOR_CONV failed:', d);
                        resolve(null);
                    }
                };
                window.addEventListener('message', handler);

                this._postToExtension({
                    type: 'GET_GLOBAL_ID_FOR_CONV',
                    pageId: conv.pageId,
                    threadId: fbThreadId,
                    threadKey: 't_' + fbThreadId,
                    isBusiness: true,
                    conversationUpdatedTime: conv.updated_at ? new Date(conv.updated_at).getTime() : Date.now(),
                    customerName: conv.customerName || conv.from?.name || '',
                    convType: conv.type || 'INBOX',
                    postId: null, convId: null,
                    taskId, from: 'WEBPAGE'
                });
            });

            if (globalUserId) {
                this._globalIdCache[cacheKey] = globalUserId;
                return globalUserId;
            }
        } else {
            console.warn('[Tab1-EXT] No global_id AND no thread_id in conversation data');
        }

        return null; // All fallbacks failed
    },

    /**
     * Send message via Pancake Extension (REPLY_INBOX_PHOTO)
     * Bypasses Facebook 24h messaging window
     */
    async sendMessage({ text, pageId, psid, globalUserId, convUpdatedTime, customerName }) {
        if (!this.connected) {
            throw new Error('Pancake Extension chưa kết nối. Vui lòng cài extension và reload trang.');
        }
        if (!globalUserId) {
            throw new Error('Không tìm được Global Facebook ID để gửi qua Extension.');
        }

        // Get Pancake JWT access token
        const accessToken = window.inboxTokenManager?.getTokenSync?.() ||
            window.pancakeTokenManager?.currentToken || '';

        const sendTaskId = Date.now();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                console.error('[Tab1-EXT] REPLY_INBOX_PHOTO timeout (60s)');
                reject(new Error('Extension gửi tin nhắn timeout (60s)'));
            }, 60000);

            const handler = (e) => {
                const d = e.data;
                if (!d || !d.type) return;
                if (d.type === 'REPLY_INBOX_PHOTO_SUCCESS' && d.taskId === sendTaskId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    console.log('[Tab1-EXT] REPLY_INBOX_PHOTO SUCCESS:', d.messageId);
                    resolve(d);
                }
                if (d.type === 'REPLY_INBOX_PHOTO_FAILURE' && d.taskId === sendTaskId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    console.error('[Tab1-EXT] REPLY_INBOX_PHOTO FAILURE:', d);
                    reject(new Error(d.error || 'Extension gửi tin nhắn thất bại'));
                }
            };
            window.addEventListener('message', handler);

            const payload = {
                type: 'REPLY_INBOX_PHOTO',
                pageId: pageId,
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
                customerName: customerName || '',
                conversationUpdatedTime: convUpdatedTime || Date.now(),
                photoUrls: [],
                isBusiness: false, // MUST be false (same as pancake.vn)
                taskId: sendTaskId,
                from: 'WEBPAGE'
            };

            this._postToExtension(payload);
            console.log('[Tab1-EXT] Sent REPLY_INBOX_PHOTO:', { pageId, psid, globalUserId });
        });
    },

    isConnected() {
        return this.connected;
    },

    getStatus() {
        return {
            connected: this.connected,
            inIframe: window.parent !== window,
            cacheSize: Object.keys(this._globalIdCache).length,
            recentEvents: this.lastEvents.slice(-10)
        };
    },

    _updateStatusUI(connected) {
        const indicator = document.getElementById('extensionStatusIndicator');
        if (!indicator) return;
        if (connected) {
            indicator.style.display = 'inline-flex';
            indicator.innerHTML = '<i class="fas fa-plug" style="color: #10b981; font-size: 10px;"></i>';
            indicator.title = 'Pancake Extension đã kết nối (bypass 24h)';
        } else {
            indicator.style.display = 'inline-flex';
            indicator.innerHTML = '<i class="fas fa-plug" style="color: #ef4444; font-size: 10px;"></i>';
            indicator.title = 'Pancake Extension chưa kết nối';
        }
    }
};

// =====================================================
// REGISTER LISTENER IMMEDIATELY
// Listen for messages from BOTH:
//   - parent frame (main.html relay bridge forwards extension events here)
//   - same window (in case contentscript somehow injects directly)
// =====================================================
window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || !d.type) return;

    var bridge = window.tab1ExtensionBridge;
    var type = d.type;

    // Log extension-related events
    var isExtEvent = type.includes('EXTENSION') || type.includes('REPLY_INBOX') ||
        type.includes('UPLOAD_INBOX') || type.includes('PREINITIALIZE') ||
        type.includes('BUSINESS_CONTEXT') || type.includes('GLOBAL_ID') ||
        type.includes('BATCH_GET') || type.includes('CHECK_EXTENSION') ||
        type === 'EXT_BRIDGE_PROBE_RESPONSE' ||
        (d.from === 'EXTENSION');

    if (isExtEvent) {
        bridge.lastEvents.push({ type: type, time: new Date().toISOString(), data: d });
        if (bridge.lastEvents.length > 50) bridge.lastEvents.shift();
        console.log('[Tab1-EXT]', type, d);
    }

    // Handle EXTENSION_LOADED (relayed from main.html or direct)
    if (type === 'EXTENSION_LOADED' && d.from === 'EXTENSION') {
        bridge.connected = true;
        console.log('[Tab1-ExtBridge] Extension connected!');

        if (window.notificationManager) {
            window.notificationManager.show('Pancake Extension đã kết nối', 'success');
        }
        bridge._updateStatusUI(true);

        // Send PREINITIALIZE_PAGES if we have page IDs
        if (bridge._pageIds && bridge._pageIds.length > 0) {
            bridge._postToExtension({ type: 'PREINITIALIZE_PAGES', pageIds: bridge._pageIds });
            console.log('[Tab1-ExtBridge] Sent PREINITIALIZE_PAGES:', bridge._pageIds);
        }
    }

    // Handle probe response from main.html relay
    if (type === 'EXT_BRIDGE_PROBE_RESPONSE') {
        if (d.connected && !bridge.connected) {
            bridge.connected = true;
            console.log('[Tab1-ExtBridge] Extension was already connected (probe response)');
            if (window.notificationManager) {
                window.notificationManager.show('Pancake Extension đã kết nối', 'success');
            }
            bridge._updateStatusUI(true);

            if (bridge._pageIds && bridge._pageIds.length > 0) {
                bridge._postToExtension({ type: 'PREINITIALIZE_PAGES', pageIds: bridge._pageIds });
            }
        }
    }

    // Handle extension disconnect
    if (type === 'REPORT_EXTENSION_STATUS' && d.status === 'disconnected') {
        bridge.connected = false;
        bridge._updateStatusUI(false);
    }
});

// =====================================================
// PROBE: Check if extension already connected before this script loaded
// main.html relay tracks _extensionConnected state
// =====================================================
if (window.parent !== window) {
    // We're in iframe - probe parent for extension status
    console.log('[Tab1-ExtBridge] In iframe, probing parent for extension status...');
    window.parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*');

    // Retry probe after 2s in case main.html relay wasn't ready
    setTimeout(function() {
        if (!window.tab1ExtensionBridge.connected) {
            console.log('[Tab1-ExtBridge] Retry probe...');
            window.parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*');
        }
    }, 2000);

    // Final retry after 5s
    setTimeout(function() {
        if (!window.tab1ExtensionBridge.connected) {
            console.log('[Tab1-ExtBridge] Final probe...');
            window.parent.postMessage({ type: 'EXT_BRIDGE_PROBE' }, '*');
        }
    }, 5000);
}

console.log('[Tab1-ExtBridge] Loaded - listener active, iframe:', window.parent !== window);
