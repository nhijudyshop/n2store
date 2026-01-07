/**
 * Customer Hub Configuration
 * API endpoints and settings
 */

const CONFIG = {
    // API Base URL - Render.com backend
    API_BASE_URL: 'https://n2store-chat.onrender.com/api',

    // Pagination
    PAGE_SIZE: 20,

    // Customer statuses
    STATUSES: {
        'Bình thường': { color: '#10b981', icon: 'user', label: 'Bình thường' },
        'VIP': { color: '#8b5cf6', icon: 'crown', label: 'VIP' },
        'Cảnh báo': { color: '#f59e0b', icon: 'alert-triangle', label: 'Cảnh báo' },
        'Bom hàng': { color: '#ef4444', icon: 'bomb', label: 'Bom hàng' },
        'Nguy hiểm': { color: '#dc2626', icon: 'skull', label: 'Nguy hiểm' }
    },

    // Customer tiers
    TIERS: {
        'bronze': { color: '#cd7f32', label: 'Bronze' },
        'silver': { color: '#c0c0c0', label: 'Silver' },
        'gold': { color: '#ffd700', label: 'Gold' },
        'platinum': { color: '#e5e4e2', label: 'Platinum' },
        'diamond': { color: '#b9f2ff', label: 'Diamond' }
    },

    // Ticket types
    TICKET_TYPES: {
        'complaint': { color: '#ef4444', icon: 'message-circle', label: 'Khiếu nại' },
        'return': { color: '#f59e0b', icon: 'undo-2', label: 'Đổi/Trả hàng' },
        'refund': { color: '#8b5cf6', icon: 'credit-card', label: 'Hoàn tiền' },
        'support': { color: '#3b82f6', icon: 'headphones', label: 'Hỗ trợ' },
        'other': { color: '#6b7280', icon: 'file-text', label: 'Khác' }
    },

    // Ticket priorities
    TICKET_PRIORITIES: {
        'low': { color: '#10b981', label: 'Thấp' },
        'medium': { color: '#3b82f6', label: 'Trung bình' },
        'high': { color: '#f59e0b', label: 'Cao' },
        'urgent': { color: '#ef4444', label: 'Khẩn cấp' }
    },

    // Ticket statuses
    TICKET_STATUSES: {
        'open': { color: '#3b82f6', label: 'Mở' },
        'in_progress': { color: '#f59e0b', label: 'Đang xử lý' },
        'pending': { color: '#8b5cf6', label: 'Chờ xử lý' },
        'resolved': { color: '#10b981', label: 'Đã giải quyết' },
        'closed': { color: '#6b7280', label: 'Đã đóng' }
    },

    // Transaction types
    TRANSACTION_TYPES: {
        'deposit': { color: '#10b981', icon: 'plus-circle', label: 'Nạp tiền' },
        'withdraw': { color: '#ef4444', icon: 'minus-circle', label: 'Trừ tiền' },
        'order_payment': { color: '#f59e0b', icon: 'shopping-cart', label: 'Thanh toán đơn' },
        'refund': { color: '#3b82f6', icon: 'undo-2', label: 'Hoàn tiền' },
        'virtual_credit': { color: '#8b5cf6', icon: 'gift', label: 'Công nợ ảo' },
        'virtual_credit_used': { color: '#6b7280', icon: 'check-circle', label: 'Sử dụng công nợ ảo' },
        'virtual_credit_expired': { color: '#9ca3af', icon: 'x-circle', label: 'Công nợ ảo hết hạn' }
    },

    // Activity types
    ACTIVITY_TYPES: {
        'order': { color: '#3b82f6', icon: 'shopping-cart', label: 'Đơn hàng' },
        'wallet': { color: '#10b981', icon: 'wallet', label: 'Ví' },
        'ticket': { color: '#f59e0b', icon: 'ticket', label: 'Sự vụ' },
        'note': { color: '#8b5cf6', icon: 'sticky-note', label: 'Ghi chú' },
        'status_change': { color: '#ef4444', icon: 'shield', label: 'Thay đổi trạng thái' },
        'tier_change': { color: '#ffd700', icon: 'award', label: 'Thay đổi tier' }
    }
};

// Utility functions
const Utils = {
    /**
     * Format currency in VND
     */
    formatCurrency(amount) {
        if (amount === null || amount === undefined) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    },

    /**
     * Format date to Vietnamese locale
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    /**
     * Format datetime
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Format relative time (e.g., "2 giờ trước")
     */
    formatRelativeTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 7) return `${diffDays} ngày trước`;

        return this.formatDate(dateStr);
    },

    /**
     * Parse amount string (e.g., "100k" → 100000)
     */
    parseAmount(str) {
        if (!str) return 0;
        str = str.toString().replace(/[,.\s]/g, '');
        if (str.toLowerCase().endsWith('k')) {
            return parseInt(str.slice(0, -1)) * 1000;
        }
        if (str.toLowerCase().endsWith('m')) {
            return parseInt(str.slice(0, -1)) * 1000000;
        }
        return parseInt(str) || 0;
    },

    /**
     * Format phone number
     */
    formatPhone(phone) {
        if (!phone) return '-';
        // Remove non-digits
        phone = phone.replace(/\D/g, '');
        // Format as 0xxx xxx xxx
        if (phone.length === 10) {
            return phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
        }
        return phone;
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Remove existing toasts
        document.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: 'check-circle',
            error: 'x-circle',
            warning: 'alert-triangle',
            info: 'info'
        };

        toast.innerHTML = `
            <i data-lucide="${icons[type] || 'info'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);
        lucide.createIcons();

        // Show toast
        setTimeout(() => toast.classList.add('show'), 10);

        // Auto hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * Debounce function
     */
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

    /**
     * Get URL parameter
     */
    getUrlParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }
};
