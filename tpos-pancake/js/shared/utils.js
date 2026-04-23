// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared Utilities for TPOS-Pancake
 * Extracted from tpos-chat.js and pancake-chat.js to eliminate duplication
 */

const SharedUtils = {
    /**
     * Escape HTML to prevent XSS
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Normalize Vietnamese phone number to 10-digit format
     * Handles +84, 84 prefixes
     * @param {string} phone
     * @returns {string}
     */
    normalizePhone(phone) {
        if (!phone) return '';
        let normalized = phone.toString().trim().replace(/[\s-]/g, '');
        if (normalized.startsWith('+84')) normalized = '0' + normalized.slice(3);
        if (normalized.startsWith('84') && normalized.length > 9)
            normalized = '0' + normalized.slice(2);
        return normalized;
    },

    /**
     * Format debt amount in Vietnamese currency
     * @param {number|null} amount
     * @returns {string}
     */
    formatDebt(amount) {
        if (amount === null || amount === undefined) return '';
        if (amount === 0) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    },

    /**
     * Parse timestamp to Date object with proper handling
     * Handles: ISO strings, Unix timestamps (seconds/ms), strings without timezone
     * @param {string|number} timestamp
     * @returns {Date|null}
     */
    parseTimestamp(timestamp) {
        if (!timestamp) return null;
        try {
            let date;
            if (typeof timestamp === 'string') {
                if (
                    !timestamp.includes('Z') &&
                    !timestamp.includes('+') &&
                    !timestamp.includes('-', 10)
                ) {
                    date = new Date(timestamp + 'Z');
                } else {
                    date = new Date(timestamp);
                }
            } else if (typeof timestamp === 'number') {
                date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
            } else {
                date = new Date(timestamp);
            }
            return isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    },

    /**
     * Format timestamp to human-readable Vietnamese time
     * Uses Asia/Ho_Chi_Minh timezone for accurate display
     * @param {string|number} timestamp
     * @returns {string}
     */
    formatTime(timestamp) {
        if (!timestamp) return '';
        try {
            const date = this.parseTimestamp(timestamp);
            if (!date) return '';

            const now = new Date();
            const vnFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });

            const getPartValue = (parts, type) =>
                parseInt(parts.find((p) => p.type === type)?.value || '0');
            const dateParts = vnFormatter.formatToParts(date);
            const nowParts = vnFormatter.formatToParts(now);

            const dateYear = getPartValue(dateParts, 'year');
            const dateMonth = getPartValue(dateParts, 'month');
            const dateDay = getPartValue(dateParts, 'day');
            const nowYear = getPartValue(nowParts, 'year');
            const nowMonth = getPartValue(nowParts, 'month');
            const nowDay = getPartValue(nowParts, 'day');

            const isSameDay = dateYear === nowYear && dateMonth === nowMonth && dateDay === nowDay;

            if (isSameDay) {
                return new Intl.DateTimeFormat('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Ho_Chi_Minh',
                    hour12: false,
                }).format(date);
            }

            const vnDateObj = new Date(dateYear, dateMonth - 1, dateDay);
            const vnNowObj = new Date(nowYear, nowMonth - 1, nowDay);
            const diffDays = Math.floor((vnNowObj - vnDateObj) / (24 * 60 * 60 * 1000));

            if (diffDays > 0 && diffDays < 7) {
                const dayOfWeek = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    weekday: 'short',
                }).format(date);
                const days = {
                    Sun: 'CN',
                    Mon: 'T2',
                    Tue: 'T3',
                    Wed: 'T4',
                    Thu: 'T5',
                    Fri: 'T6',
                    Sat: 'T7',
                };
                return days[dayOfWeek] || dayOfWeek;
            }

            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
            }).format(date);
        } catch {
            return '';
        }
    },

    /**
     * Format timestamp with full date + time for tooltips/details
     * @param {string|number} timestamp
     * @returns {string}
     */
    formatFullTime(timestamp) {
        if (!timestamp) return '';
        const date = this.parseTimestamp(timestamp);
        if (!date) return '';
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh',
            hour12: false,
        }).format(date);
    },

    /**
     * Get avatar URL with multiple fallback strategies
     * @param {string} fbId - Facebook user ID
     * @param {string} [pageId] - Facebook page ID for context
     * @param {string} [token] - Access token for authenticated requests
     * @param {string} [directAvatarUrl] - Direct URL from Pancake/TPOS
     * @returns {string}
     */
    getAvatarUrl(fbId, pageId = null, token = null, directAvatarUrl = null) {
        if (directAvatarUrl && typeof directAvatarUrl === 'string') {
            if (directAvatarUrl.includes('content.pancake.vn')) return directAvatarUrl;
            if (/^[a-f0-9]{32,}$/i.test(directAvatarUrl)) {
                return `https://content.pancake.vn/2.1-25/avatars/${directAvatarUrl}`;
            }
            if (directAvatarUrl.startsWith('http')) return directAvatarUrl;
        }

        if (!fbId) {
            return (
                'data:image/svg+xml,' +
                encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
                        '<circle cx="20" cy="20" r="20" fill="#e5e7eb"/>' +
                        '<circle cx="20" cy="15" r="7" fill="#9ca3af"/>' +
                        '<ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>'
                )
            );
        }

        let url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/fb-avatar?id=${fbId}`;
        if (pageId) url += `&page=${pageId}`;
        if (token) url += `&token=${encodeURIComponent(token)}`;
        return url;
    },

    /**
     * Generate gradient placeholder avatar HTML based on name
     * @param {string} name
     * @param {number} [size=40]
     * @returns {string} HTML string
     */
    getAvatarPlaceholder(name, size = 40) {
        const initial = (name || '?').charAt(0).toUpperCase();
        const colors = [
            ['#667eea', '#764ba2'],
            ['#f093fb', '#f5576c'],
            ['#4facfe', '#00f2fe'],
            ['#43e97b', '#38f9d7'],
            ['#fa709a', '#fee140'],
            ['#a18cd1', '#fbc2eb'],
            ['#fccb90', '#d57eeb'],
            ['#e0c3fc', '#8ec5fc'],
        ];
        const hash = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const [c1, c2] = colors[hash % colors.length];

        return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,${c1},${c2});display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:${Math.floor(size * 0.4)}px;flex-shrink:0">${initial}</div>`;
    },

    /**
     * Debounce function execution
     * @param {Function} fn
     * @param {number} delay - milliseconds
     * @returns {Function}
     */
    debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * Throttle function execution
     * @param {Function} fn
     * @param {number} limit - milliseconds
     * @returns {Function}
     */
    throttle(fn, limit) {
        let inThrottle = false;
        return function (...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
        };
    },

    /**
     * Truncate text with ellipsis
     * @param {string} text
     * @param {number} maxLength
     * @returns {string}
     */
    truncate(text, maxLength) {
        if (!text || text.length <= maxLength) return text || '';
        return text.substring(0, maxLength) + '...';
    },
};

// Export for script-tag usage
if (typeof window !== 'undefined') {
    window.SharedUtils = SharedUtils;
}
