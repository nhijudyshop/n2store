// =====================================================
// tab1-extension-bridge.js - Pancake Extension Bridge for Tab1
// Handles Extension connection + bypass 24h messaging via
// business.facebook.com/messaging/send/ (Extension V2)
// =====================================================
// Reference: inbox/js/inbox-main.js (extension bridge), inbox/js/inbox-chat.js (_sendViaExtension)
// NOTE: This is a SEPARATE module for tab1. Does NOT modify inbox/ code.

console.log('[Tab1-ExtBridge] Loading...');

window.tab1ExtensionBridge = {
    connected: false,
    lastEvents: [],
    _globalIdCache: {},
    _initialized: false,

    /**
     * Initialize extension bridge - listen for EXTENSION_LOADED events
     * @param {string[]} pageIds - Page IDs to pre-initialize
     */
    init(pageIds) {
        if (this._initialized) return;
        this._initialized = true;

        // Listen for ALL extension-related postMessage events
        window.addEventListener('message', (e) => {
            if (e.source !== window) return;
            const type = e.data?.type;
            if (!type) return;

            const isExtEvent = type.includes('EXTENSION') || type.includes('REPLY_INBOX') ||
                type.includes('UPLOAD_INBOX') || type.includes('PREINITIALIZE') ||
                type.includes('BUSINESS_CONTEXT') || type.includes('GLOBAL_ID') ||
                type.includes('BATCH_GET') || type.includes('CHECK_EXTENSION') ||
                (e.data?.from === 'EXTENSION');

            if (isExtEvent) {
                const logEntry = { type, time: new Date().toISOString(), data: e.data };
                this.lastEvents.push(logEntry);
                if (this.lastEvents.length > 50) this.lastEvents.shift();
                console.log('[Tab1-EXT]', type, e.data);
            }

            // Handle EXTENSION_LOADED
            if (type === 'EXTENSION_LOADED' && e.data?.from === 'EXTENSION') {
                this.connected = true;
                console.log('[Tab1-ExtBridge] Extension connected');

                if (window.notificationManager) {
                    window.notificationManager.show('Pancake Extension đã kết nối', 'success');
                }

                // Update UI indicator
                this._updateStatusUI(true);

                // Pre-initialize pages
                if (pageIds && pageIds.length > 0) {
                    window.postMessage({ type: 'PREINITIALIZE_PAGES', pageIds }, '*');
                    console.log('[Tab1-ExtBridge] Sent PREINITIALIZE_PAGES:', pageIds);
                }
            }

            // Handle extension disconnect (REPORT_EXTENSION_STATUS with error)
            if (type === 'REPORT_EXTENSION_STATUS' && e.data?.status === 'disconnected') {
                this.connected = false;
                this._updateStatusUI(false);
            }
        });

        console.log('[Tab1-ExtBridge] Initialized, listening for extension events');
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
                console.log('[Tab1-EXT] Got globalUserId from customers[]:', globalUserId);
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
                    if (e.source !== window) return;
                    if (e.data?.type === 'GET_GLOBAL_ID_FOR_CONV_SUCCESS' && e.data?.taskId === taskId) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        console.log('[Tab1-EXT] Got globalUserId from extension:', e.data.globalId);
                        resolve(e.data.globalId);
                    }
                    if (e.data?.type === 'GET_GLOBAL_ID_FOR_CONV_FAILURE' && e.data?.taskId === taskId) {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        console.warn('[Tab1-EXT] GET_GLOBAL_ID_FOR_CONV failed:', e.data);
                        resolve(null);
                    }
                };
                window.addEventListener('message', handler);

                window.postMessage({
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
                }, '*');
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
     * @param {Object} params
     * @param {string} params.text - Message text
     * @param {string} params.pageId - Facebook Page ID
     * @param {string} params.psid - Customer PSID
     * @param {string} params.globalUserId - Global Facebook User ID (required)
     * @param {number} [params.convUpdatedTime] - Conversation updated timestamp
     * @param {string} [params.customerName] - Customer name
     * @returns {Promise<Object>} Extension response with messageId
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
                if (e.source !== window) return;
                if (e.data?.type === 'REPLY_INBOX_PHOTO_SUCCESS' && e.data?.taskId === sendTaskId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    console.log('[Tab1-EXT] REPLY_INBOX_PHOTO SUCCESS:', e.data.messageId);
                    resolve(e.data);
                }
                if (e.data?.type === 'REPLY_INBOX_PHOTO_FAILURE' && e.data?.taskId === sendTaskId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    console.error('[Tab1-EXT] REPLY_INBOX_PHOTO FAILURE:', e.data);
                    reject(new Error(e.data?.error || 'Extension gửi tin nhắn thất bại'));
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

            window.postMessage(payload, '*');
            console.log('[Tab1-EXT] Sent REPLY_INBOX_PHOTO:', { pageId, psid, globalUserId });
        });
    },

    /**
     * Check if extension is connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connected;
    },

    /**
     * Get current status
     * @returns {Object}
     */
    getStatus() {
        return {
            connected: this.connected,
            cacheSize: Object.keys(this._globalIdCache).length,
            recentEvents: this.lastEvents.slice(-10)
        };
    },

    /**
     * Update extension status indicator in chat modal UI
     * @param {boolean} connected
     */
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

console.log('[Tab1-ExtBridge] Loaded successfully.');
