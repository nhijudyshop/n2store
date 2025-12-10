/**
 * Extension Bridge Module
 * Communicates with Pancake v2 Extension via:
 * 1. Direct contentscript (for pages on matched domains like pancake.vn, nhijudyshop.workers.dev)
 * 2. Iframe postMessage (for pages on other domains)
 * Used as fallback when Pancake API fails
 */

class ExtensionBridge {
    constructor() {
        this.iframe = null;
        this.isReady = false;
        this.isInitializing = false;
        this.pendingRequests = new Map();
        this.extensionId = 'oehooocookcnclgniepdgaiankfifmmn';
        this.timeout = 30000; // 30 seconds timeout for requests
        this.initTimeout = 5000; // 5 seconds timeout for initialization
        this.requestIdCounter = 0;
        this.connectionMode = null; // 'contentscript' or 'iframe'

        // Bind message handler
        this._handleMessage = this._handleMessage.bind(this);
    }

    /**
     * Generate unique request ID
     */
    _generateRequestId() {
        return `ext_req_${Date.now()}_${++this.requestIdCounter}`;
    }

    /**
     * Initialize connection to extension
     * Priority:
     * 1. Check if contentscript is already injected (for matched domains)
     * 2. Try iframe approach as fallback
     * @returns {Promise<boolean>} true if extension is available
     */
    async init() {
        if (this.isReady) {
            console.log('[EXTENSION] Already initialized via', this.connectionMode);
            return true;
        }

        if (this.isInitializing) {
            console.log('[EXTENSION] Initialization in progress...');
            return new Promise((resolve) => {
                const checkReady = setInterval(() => {
                    if (this.isReady || !this.isInitializing) {
                        clearInterval(checkReady);
                        resolve(this.isReady);
                    }
                }, 100);
            });
        }

        this.isInitializing = true;
        console.log('[EXTENSION] Initializing extension bridge...');

        // Start listening for messages
        window.addEventListener('message', this._handleMessage);

        // Step 1: Check if contentscript is already available (for matched domains)
        const contentscriptReady = await this._checkContentscript();
        if (contentscriptReady) {
            console.log('[EXTENSION] ✅ Connected via contentscript (direct)');
            this.connectionMode = 'contentscript';
            this.isReady = true;
            this.isInitializing = false;
            return true;
        }

        // Step 2: Try iframe approach
        console.log('[EXTENSION] Contentscript not available, trying iframe approach...');
        const iframeReady = await this._initIframe();
        if (iframeReady) {
            console.log('[EXTENSION] ✅ Connected via iframe');
            this.connectionMode = 'iframe';
            this.isReady = true;
            this.isInitializing = false;
            return true;
        }

        // Both methods failed
        console.warn('[EXTENSION] ⚠️ Extension not available - both contentscript and iframe methods failed');
        console.warn('[EXTENSION] Please ensure:');
        console.warn('[EXTENSION]   1. Pancake v2 extension is installed');
        console.warn('[EXTENSION]   2. For iframe mode: pancake.vn tab is open');
        this.isInitializing = false;
        window.removeEventListener('message', this._handleMessage);
        return false;
    }

    /**
     * Check if contentscript is already injected (for matched domains)
     * Contentscript posts EXTENSION_LOADED to window on injection
     * @returns {Promise<boolean>}
     */
    async _checkContentscript() {
        return new Promise((resolve) => {
            // Set short timeout for contentscript check (1 second)
            const checkTimeout = setTimeout(() => {
                resolve(false);
            }, 1000);

            // Temporary handler for EXTENSION_LOADED
            const tempHandler = (event) => {
                if (event.data?.type === 'EXTENSION_LOADED' && event.data?.from === 'EXTENSION') {
                    clearTimeout(checkTimeout);
                    window.removeEventListener('message', tempHandler);
                    resolve(true);
                }
            };

            window.addEventListener('message', tempHandler);

            // If extension is already loaded, it should have sent EXTENSION_LOADED
            // We can try to ping it by sending a CHECK_EXTENSION message
            window.postMessage({ type: 'CHECK_EXTENSION' }, '*');
        });
    }

    /**
     * Initialize iframe connection
     * @returns {Promise<boolean>}
     */
    async _initIframe() {
        return new Promise((resolve) => {
            try {
                // Create hidden iframe
                this.iframe = document.createElement('iframe');
                this.iframe.style.display = 'none';
                this.iframe.style.width = '0';
                this.iframe.style.height = '0';
                this.iframe.style.border = 'none';
                this.iframe.id = 'pancake-extension-bridge';

                // Set source to extension's pancext.html
                this.iframe.src = `chrome-extension://${this.extensionId}/pancext.html`;

                // Timeout for initialization
                const initTimeoutId = setTimeout(() => {
                    if (!this.isReady) {
                        console.warn('[EXTENSION] Iframe initialization timeout');
                        this._cleanupIframe();
                        resolve(false);
                    }
                }, this.initTimeout);

                // Handle iframe load error
                this.iframe.onerror = () => {
                    clearTimeout(initTimeoutId);
                    console.warn('[EXTENSION] Failed to load extension iframe');
                    this._cleanupIframe();
                    resolve(false);
                };

                // Store timeout ID for later cleanup
                this._initTimeoutId = initTimeoutId;

                // Listen for EXTENSION_LOADED from iframe
                const iframeLoadHandler = (event) => {
                    if (event.data?.type === 'EXTENSION_LOADED' && event.data?.from === 'EXTENSION') {
                        clearTimeout(initTimeoutId);
                        this._initTimeoutId = null;
                        resolve(true);
                    }
                };
                window.addEventListener('message', iframeLoadHandler, { once: true });

                // Append iframe to document
                document.body.appendChild(this.iframe);

            } catch (error) {
                console.error('[EXTENSION] Failed to initialize iframe:', error);
                this._cleanupIframe();
                resolve(false);
            }
        });
    }

    /**
     * Cleanup iframe resources
     */
    _cleanupIframe() {
        if (this.iframe && this.iframe.parentNode) {
            this.iframe.parentNode.removeChild(this.iframe);
        }
        this.iframe = null;
    }

    /**
     * Cleanup all resources
     */
    _cleanup() {
        this._cleanupIframe();
        window.removeEventListener('message', this._handleMessage);
    }

    /**
     * Handle messages from extension (both contentscript and iframe)
     */
    _handleMessage(event) {
        const data = event.data;

        if (!data || !data.type) return;

        // Handle extension loaded confirmation (for late connections)
        if (data.type === 'EXTENSION_LOADED' && data.from === 'EXTENSION') {
            if (!this.isReady) {
                console.log('[EXTENSION] ✅ Extension connected successfully');
                this.isReady = true;
                this.isInitializing = false;
                if (this._initTimeoutId) {
                    clearTimeout(this._initTimeoutId);
                    this._initTimeoutId = null;
                }
            }
            return;
        }

        // Handle response messages
        const responseType = data.type;

        // Find matching pending request
        for (const [requestId, pending] of this.pendingRequests) {
            if (pending.successType === responseType) {
                this.pendingRequests.delete(requestId);
                clearTimeout(pending.timeoutId);
                pending.resolve({ success: true, data: data });
                return;
            }
            if (pending.failureType === responseType) {
                this.pendingRequests.delete(requestId);
                clearTimeout(pending.timeoutId);
                pending.resolve({ success: false, error: data.error || data.message || 'Extension action failed', data: data });
                return;
            }
        }
    }

    /**
     * Send a request to extension and wait for response
     * Works with both contentscript and iframe modes
     * @param {string} actionType - Action type to send
     * @param {Object} payload - Data to send
     * @param {string} successType - Expected success response type
     * @param {string} failureType - Expected failure response type
     * @returns {Promise<{success: boolean, data?: any, error?: string}>}
     */
    async _sendRequest(actionType, payload, successType, failureType) {
        if (!this.isReady) {
            return { success: false, error: 'Extension not available' };
        }

        const requestId = this._generateRequestId();

        return new Promise((resolve) => {
            // Set timeout
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                resolve({ success: false, error: 'Request timeout' });
            }, this.timeout);

            // Store pending request
            this.pendingRequests.set(requestId, {
                resolve,
                timeoutId,
                successType,
                failureType,
                actionType
            });

            // Build message
            const message = {
                type: actionType,
                requestId: requestId,
                ...payload
            };

            try {
                if (this.connectionMode === 'contentscript') {
                    // Send via window.postMessage (contentscript listens on window)
                    window.postMessage(message, '*');
                    console.log(`[EXTENSION] Sent ${actionType} via contentscript:`, message);
                } else if (this.connectionMode === 'iframe' && this.iframe?.contentWindow) {
                    // Send via iframe postMessage
                    this.iframe.contentWindow.postMessage(message, '*');
                    console.log(`[EXTENSION] Sent ${actionType} via iframe:`, message);
                } else {
                    this.pendingRequests.delete(requestId);
                    clearTimeout(timeoutId);
                    resolve({ success: false, error: 'No valid connection mode' });
                }
            } catch (error) {
                this.pendingRequests.delete(requestId);
                clearTimeout(timeoutId);
                resolve({ success: false, error: error.message });
            }
        });
    }

    /**
     * Check if extension is available
     * @returns {boolean}
     */
    isAvailable() {
        return this.isReady;
    }

    /**
     * Get connection mode info
     * @returns {{mode: string|null, ready: boolean}}
     */
    getStatus() {
        return {
            mode: this.connectionMode,
            ready: this.isReady,
            extensionId: this.extensionId
        };
    }

    /**
     * Send message via extension (REPLY_INBOX_PHOTO)
     * Used for sending text and/or image messages via Messenger
     *
     * @param {Object} params
     * @param {string} params.pageId - Facebook page ID
     * @param {string} params.threadId - Thread/conversation ID
     * @param {string} params.recipientId - Recipient PSID
     * @param {string} params.message - Text message to send
     * @param {Object} [params.imageData] - Optional image data {url, width, height}
     * @returns {Promise<{success: boolean, data?: any, error?: string}>}
     */
    async sendMessage({ pageId, threadId, recipientId, message, imageData }) {
        console.log('[EXTENSION] sendMessage called with:', { pageId, threadId, recipientId, message, hasImage: !!imageData });

        const payload = {
            page_id: pageId,
            thread_id: threadId,
            recipient_id: recipientId,
            message: message || '',
            type: imageData ? 'PHOTO' : 'SEND_TEXT_ONLY'
        };

        // Add image data if present
        if (imageData) {
            payload.url = imageData.url || imageData.content_url;
            payload.width = imageData.width || imageData.image_data?.width || 0;
            payload.height = imageData.height || imageData.image_data?.height || 0;
        }

        return this._sendRequest(
            'REPLY_INBOX_PHOTO',
            payload,
            'REPLY_INBOX_PHOTO_SUCCESS',
            'REPLY_INBOX_PHOTO_FAILURE'
        );
    }

    /**
     * Send comment reply via extension (SEND_COMMENT)
     * Used for replying to Facebook comments
     *
     * @param {Object} params
     * @param {string} params.pageId - Facebook page ID
     * @param {string} params.commentId - Parent comment ID to reply to
     * @param {string} params.message - Reply message
     * @param {Object} [params.imageData] - Optional image data
     * @returns {Promise<{success: boolean, data?: any, error?: string}>}
     */
    async sendComment({ pageId, commentId, message, imageData }) {
        console.log('[EXTENSION] sendComment called with:', { pageId, commentId, message, hasImage: !!imageData });

        const payload = {
            page_id: pageId,
            comment_id: commentId,
            message: message || ''
        };

        // Add image data if present
        if (imageData) {
            payload.attachment_url = imageData.url || imageData.content_url;
        }

        return this._sendRequest(
            'SEND_COMMENT',
            payload,
            'SEND_COMMENT_SUCCESS',
            'SEND_COMMENT_FAILURE'
        );
    }

    /**
     * Send private reply via extension (SEND_PRIVATE_REPLY)
     * Used for sending private message from a comment
     *
     * @param {Object} params
     * @param {string} params.pageId - Facebook page ID
     * @param {string} params.commentId - Comment ID to reply privately
     * @param {string} params.message - Private message
     * @returns {Promise<{success: boolean, data?: any, error?: string}>}
     */
    async sendPrivateReply({ pageId, commentId, message }) {
        console.log('[EXTENSION] sendPrivateReply called with:', { pageId, commentId, message });

        const payload = {
            page_id: pageId,
            comment_id: commentId,
            message: message || ''
        };

        return this._sendRequest(
            'SEND_PRIVATE_REPLY',
            payload,
            'SEND_PRIVATE_REPLY_SUCCESS',
            'SEND_PRIVATE_REPLY_FAILURE'
        );
    }

    /**
     * Upload image via extension (UPLOAD_INBOX_PHOTO)
     * Used for uploading images before sending
     *
     * @param {Object} params
     * @param {string} params.pageId - Facebook page ID
     * @param {Blob|File} params.file - Image file to upload
     * @returns {Promise<{success: boolean, data?: any, error?: string}>}
     */
    async uploadImage({ pageId, file }) {
        console.log('[EXTENSION] uploadImage called with:', { pageId, fileName: file?.name });

        // Convert file to base64 for sending via postMessage
        const base64 = await this._fileToBase64(file);

        const payload = {
            page_id: pageId,
            file_data: base64,
            file_name: file.name || 'image.jpg',
            file_type: file.type || 'image/jpeg'
        };

        return this._sendRequest(
            'UPLOAD_INBOX_PHOTO',
            payload,
            'UPLOAD_INBOX_PHOTO_SUCCESS',
            'UPLOAD_INBOX_PHOTO_FAILURE'
        );
    }

    /**
     * Convert file to base64
     */
    async _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Destroy the bridge and cleanup
     */
    destroy() {
        console.log('[EXTENSION] Destroying extension bridge...');

        // Clear all pending requests
        for (const [requestId, pending] of this.pendingRequests) {
            clearTimeout(pending.timeoutId);
            pending.resolve({ success: false, error: 'Bridge destroyed' });
        }
        this.pendingRequests.clear();

        // Cleanup
        this._cleanup();

        this.isReady = false;
        this.isInitializing = false;
        this.connectionMode = null;
    }
}

// Export as global
window.ExtensionBridge = ExtensionBridge;

// Auto-initialize on load
document.addEventListener('DOMContentLoaded', () => {
    if (!window.extensionBridge) {
        window.extensionBridge = new ExtensionBridge();
        window.extensionBridge.init().then(ready => {
            if (ready) {
                const status = window.extensionBridge.getStatus();
                console.log(`[EXTENSION] ✅ Extension bridge ready (mode: ${status.mode})`);
            } else {
                console.log('[EXTENSION] ⚠️ Extension not available - API-only mode');
            }
        });
    }
});
