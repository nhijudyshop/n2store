// =====================================================
// UTILITY FUNCTIONS FOR HIDDEN PRODUCTS
// =====================================================

const Utils = {
    // Debounce function for search input
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Format date to Vietnamese format
    formatDate(date) {
        if (!date) return "Chưa có";
        const d = new Date(date);
        if (isNaN(d.getTime())) return "Không hợp lệ";

        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    },

    // Calculate days ago from a date
    daysAgo(date) {
        if (!date) return 0;
        const now = new Date();
        const then = new Date(date);
        if (isNaN(then.getTime())) return 0;

        const diffTime = Math.abs(now - then);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    },

    // Sanitize input to prevent XSS
    sanitizeInput(input) {
        if (!input) return "";
        const div = document.createElement("div");
        div.textContent = input;
        return div.innerHTML;
    },

    // Remove Vietnamese tones for search
    removeVietnameseTones(str) {
        if (!str) return "";
        str = str.toLowerCase();
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
        str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
        str = str.replace(/đ/g, "d");
        return str;
    },

    // Show notification message
    showNotification(message, type = 'info', duration = 3000) {
        const alertDiv = document.getElementById('floatingAlert');
        const alertText = alertDiv.querySelector('.alert-text');

        if (!alertDiv || !alertText) return;

        // Set message
        alertText.textContent = message;

        // Set style based on type
        const colors = {
            success: '#4caf50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196f3'
        };

        alertDiv.style.background = 'white';
        alertDiv.style.borderLeft = `4px solid ${colors[type] || colors.info}`;
        alertDiv.style.display = 'block';

        // Auto hide after duration
        setTimeout(() => {
            alertDiv.style.display = 'none';
        }, duration);
    },

    // Open image modal
    openImageModal(imageSrc) {
        const overlay = document.getElementById('imageHoverOverlay');
        const image = document.getElementById('hoverImage');

        if (!overlay || !image) return;

        image.src = imageSrc;
        overlay.style.display = 'flex';

        // Close on click
        overlay.onclick = () => {
            overlay.style.display = 'none';
        };

        // Close on ESC key
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                overlay.style.display = 'none';
                document.removeEventListener('keydown', escHandler);
            }
        });
    },

    // Get authentication state
    getAuthState() {
        try {
            const authData = localStorage.getItem(APP_CONFIG.AUTH_STORAGE_KEY);
            if (!authData) return null;
            return JSON.parse(authData);
        } catch (error) {
            console.error("Error getting auth state:", error);
            return null;
        }
    },

    // Check if user is authenticated
    checkAuth() {
        const auth = this.getAuthState();
        if (!auth || !auth.isLoggedIn) {
            window.location.href = "../loginindex/login.html";
            return false;
        }
        return true;
    },

    // Format number with thousand separators
    formatNumber(num) {
        if (!num && num !== 0) return "0";
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
};

// Export utilities to global scope
window.Utils = Utils;

console.log("✅ Utilities loaded");
