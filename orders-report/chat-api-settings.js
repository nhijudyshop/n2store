// =====================================================
// CHAT API SETTINGS - Quản lý cài đặt API source
// =====================================================

class ChatAPISettings {
    constructor() {
        this.STORAGE_KEY = 'chat_api_source';
        this.REALTIME_KEY = 'chat_realtime_enabled';
        this.REALTIME_MODE_KEY = 'chat_realtime_mode'; // 'browser' or 'server'
        // Mặc định: Pancake API
        this.DEFAULT_SOURCE = 'pancake';
    }

    // ... (existing methods)

    /**
     * Get Realtime Connection Mode
     * @returns {string} 'browser' or 'server'
     */
    getRealtimeMode() {
        return localStorage.getItem(this.REALTIME_MODE_KEY) || 'browser';
    }

    /**
     * Set Realtime Connection Mode
     * @param {string} mode 'browser' or 'server'
     */
    setRealtimeMode(mode) {
        if (mode !== 'browser' && mode !== 'server') return;
        localStorage.setItem(this.REALTIME_MODE_KEY, mode);
        console.log(`[CHAT-SETTINGS] Realtime mode set to: ${mode}`);

        // Dispatch event
        window.dispatchEvent(new CustomEvent('chatApiSourceChanged', {
            detail: {
                source: this.getSource(),
                realtime: this.isRealtimeEnabled(),
                realtimeMode: mode
            }
        }));
    }

    /**
     * Set Realtime mode
     * @param {boolean} enabled 
     */
    setRealtimeEnabled(enabled) {
        localStorage.setItem(this.REALTIME_KEY, enabled);
        console.log(`[CHAT-SETTINGS] Realtime enabled: ${enabled}`);

        // Dispatch event
        window.dispatchEvent(new CustomEvent('chatApiSourceChanged', {
            detail: {
                source: this.getSource(),
                realtime: enabled,
                realtimeMode: this.getRealtimeMode()
            }
        }));
    }

    // ... (rest of class)

    /**
     * Lấy API source hiện tại
     * @returns {string} 'pancake' hoặc 'chatomni'
     */
    getSource() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        return saved || this.DEFAULT_SOURCE;
    }

    /**
     * Lưu API source preference
     * @param {string} source - 'pancake' hoặc 'chatomni'
     * @returns {boolean}
     */
    setSource(source) {
        if (source !== 'pancake' && source !== 'chatomni') {
            console.error('[CHAT-SETTINGS] Invalid source:', source);
            return false;
        }

        localStorage.setItem(this.STORAGE_KEY, source);
        console.log(`[CHAT-SETTINGS] API source set to: ${source}`);

        // Dispatch event để các components khác biết đã thay đổi
        window.dispatchEvent(new CustomEvent('chatApiSourceChanged', {
            detail: {
                source,
                realtime: this.isRealtimeEnabled()
            }
        }));

        return true;
    }

    /**
     * Check xem có đang dùng Pancake API không
     * @returns {boolean}
     */
    isPancake() {
        return this.getSource() === 'pancake';
    }

    /**
     * Check xem có đang dùng ChatOmni API không
     * @returns {boolean}
     */
    isChatOmni() {
        return this.getSource() === 'chatomni';
    }

    /**
     * Toggle giữa 2 sources: pancake <-> chatomni
     * @returns {string} New source
     */
    toggle() {
        const currentSource = this.getSource();
        const newSource = currentSource === 'pancake' ? 'chatomni' : 'pancake';
        this.setSource(newSource);
        return newSource;
    }

    /**
     * Get display name cho source
     * @param {string} source
     * @returns {string}
     */
    getDisplayName(source = null) {
        const src = source || this.getSource();
        return src === 'pancake' ? 'Pancake API' : 'ChatOmni API';
    }

    /**
     * Check xem Realtime mode có được bật không
     * @returns {boolean}
     */
    isRealtimeEnabled() {
        return localStorage.getItem(this.REALTIME_KEY) === 'true';
    }

    /**
     * Set Realtime mode
     * @param {boolean} enabled 
     */
    setRealtimeEnabled(enabled) {
        localStorage.setItem(this.REALTIME_KEY, enabled);
        console.log(`[CHAT-SETTINGS] Realtime mode set to: ${enabled}`);

        // Dispatch event
        window.dispatchEvent(new CustomEvent('chatApiSourceChanged', {
            detail: {
                source: this.getSource(),
                realtime: enabled
            }
        }));
    }

    /**
     * Toggle Realtime mode
     * @returns {boolean} New state
     */
    toggleRealtime() {
        const newState = !this.isRealtimeEnabled();
        this.setRealtimeEnabled(newState);
        return newState;
    }
}

// Khởi tạo global instance
window.chatAPISettings = window.chatAPISettings || new ChatAPISettings();
console.log('[CHAT-SETTINGS] ChatAPISettings loaded, current source:', window.chatAPISettings.getDisplayName());
