// =====================================================
// CHAT API SETTINGS - Quản lý cài đặt API source
// =====================================================

class ChatAPISettings {
    constructor() {
        this.STORAGE_KEY = 'chat_api_source';
        // Mặc định: Pancake API
        this.DEFAULT_SOURCE = 'pancake';
    }

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
            detail: { source }
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
     * Toggle giữa 2 sources
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
}

// Khởi tạo global instance
window.chatAPISettings = window.chatAPISettings || new ChatAPISettings();
console.log('[CHAT-SETTINGS] ChatAPISettings loaded, current source:', window.chatAPISettings.getDisplayName());
