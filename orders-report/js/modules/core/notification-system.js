/**
 * Enhanced Notification System - ES Module
 * Toast notifications with Lucide icons
 */

// =====================================================
// NOTIFICATION MANAGER CLASS
// =====================================================
export class NotificationManager {
    constructor() {
        this.container = null;
        this.notifications = new Map();
        this.notificationCounter = 0;
        this.stylesInjected = false;
    }

    init() {
        if (this.container) return;

        // Inject styles first
        if (!this.stylesInjected) {
            this.injectStyles();
            this.stylesInjected = true;
        }

        this.container = document.createElement("div");
        this.container.id = "notification-container";
        this.container.className = "toast-container";
        document.body.appendChild(this.container);
    }

    injectStyles() {
        if (document.getElementById('notification-system-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'notification-system-styles';
        styles.textContent = NOTIFICATION_STYLES;
        document.head.appendChild(styles);
    }

    show(message, type = "info", duration = 3000, options = {}) {
        // Ensure initialized
        if (!this.container) this.init();

        const {
            showOverlay = false,
            showProgress = true,
            persistent = false,
            icon = null,
            title = null,
        } = options;

        if (showOverlay || persistent) this.clearAll();

        const notificationId = ++this.notificationCounter;
        const notification = document.createElement("div");
        notification.className = `toast ${type}`;
        notification.dataset.id = notificationId;

        const iconMap = {
            success: "check-circle",
            error: "x-circle",
            warning: "alert-triangle",
            info: "info",
            loading: "loader",
        };

        const selectedIcon = icon || iconMap[type] || "bell";

        const iconHtml = `<i data-lucide="${selectedIcon}" class="toast-icon ${type === "loading" ? "spinning" : ""}"></i>`;
        const titleHtml = title ? `<div class="toast-title">${title}</div>` : "";
        const messageHtml = `<div class="toast-message">${message}</div>`;
        const closeBtn = !persistent
            ? `<button class="toast-close"><i data-lucide="x"></i></button>`
            : "";

        notification.innerHTML = `
            ${iconHtml}
            <div class="toast-content">
                ${titleHtml}
                ${messageHtml}
            </div>
            ${closeBtn}
            ${showProgress && duration > 0 ? '<div class="toast-progress"></div>' : ""}
        `;

        const closeBtnEl = notification.querySelector(".toast-close");
        if (closeBtnEl) {
            closeBtnEl.onclick = () => this.remove(notificationId);
        }

        if (showProgress && duration > 0) {
            notification.style.setProperty("--duration", duration + "ms");
        }

        this.container.appendChild(notification);

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }

        this.notifications.set(notificationId, {
            element: notification,
            type,
            timeout: null,
            showOverlay,
        });

        if (showOverlay) {
            this.showOverlay();
            document.body.style.overflow = "hidden";
        }

        requestAnimationFrame(() => notification.classList.add("show"));

        if (duration > 0 && !persistent) {
            const timeoutId = setTimeout(() => this.remove(notificationId), duration);
            this.notifications.get(notificationId).timeout = timeoutId;
        }

        return notificationId;
    }

    remove(notificationId) {
        const notification = this.notifications.get(notificationId);
        if (!notification) return;

        if (notification.timeout) clearTimeout(notification.timeout);
        notification.element.classList.remove("show");

        setTimeout(() => {
            if (notification.element?.parentNode) {
                notification.element.parentNode.removeChild(notification.element);
            }
            this.notifications.delete(notificationId);
            if (notification.showOverlay) this.hideOverlay();
        }, 300);
    }

    clearAll() {
        for (const [id] of this.notifications) this.remove(id);
        this.forceHideOverlay();
    }

    forceHideOverlay() {
        const overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.classList.remove("show");
        document.body.style.overflow = "auto";
    }

    showOverlay() {
        let overlay = document.getElementById("loading-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "loading-overlay";
            overlay.className = "loading-overlay";
            document.body.appendChild(overlay);
        }
        overlay.classList.add("show");
    }

    hideOverlay() {
        const overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.classList.remove("show");
        document.body.style.overflow = "auto";
    }

    // Convenience methods
    loading(message = "Đang xử lý...", title = null) {
        return this.show(message, "info", 0, {
            showOverlay: true,
            persistent: true,
            icon: "loader",
            title: title || "Đang tải",
        });
    }

    success(message, duration = 2000, title = null) {
        return this.show(message, "success", duration, {
            showProgress: true,
            title: title || "Thành công",
        });
    }

    error(message, duration = 4000, title = null) {
        return this.show(message, "error", duration, {
            showProgress: true,
            title: title || "Lỗi",
        });
    }

    warning(message, duration = 3000, title = null) {
        return this.show(message, "warning", duration, {
            showProgress: true,
            title: title || "Cảnh báo",
        });
    }

    info(message, duration = 3000, title = null) {
        return this.show(message, "info", duration, {
            showProgress: true,
            title: title,
        });
    }

    uploading(current, total) {
        return this.show(`Đang tải lên ${current}/${total} ảnh`, "info", 0, {
            showOverlay: true,
            persistent: true,
            icon: "upload-cloud",
            title: "Upload",
        });
    }

    deleting(message = "Đang xóa...") {
        return this.show(message, "warning", 0, {
            showOverlay: true,
            persistent: true,
            icon: "trash-2",
            title: "Xóa dữ liệu",
        });
    }

    saving(message = "Đang lưu...") {
        return this.show(message, "info", 0, {
            showOverlay: true,
            persistent: true,
            icon: "save",
            title: "Lưu",
        });
    }

    confirm(message, title = "Xác nhận") {
        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.className = "custom-confirm-overlay";
            overlay.id = "customConfirmOverlay";

            const modal = document.createElement("div");
            modal.className = "custom-confirm-modal";
            modal.innerHTML = `
                <div class="custom-confirm-header">
                    <i data-lucide="alert-circle" class="custom-confirm-icon"></i>
                    <h3>${title}</h3>
                </div>
                <div class="custom-confirm-body">
                    <p>${message}</p>
                </div>
                <div class="custom-confirm-footer">
                    <button class="custom-confirm-btn custom-confirm-cancel">
                        <i data-lucide="x"></i>
                        Hủy
                    </button>
                    <button class="custom-confirm-btn custom-confirm-ok">
                        <i data-lucide="check"></i>
                        Đồng ý
                    </button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }

            requestAnimationFrame(() => overlay.classList.add("show"));

            const closeModal = (result) => {
                overlay.classList.remove("show");
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 200);
            };

            modal.querySelector(".custom-confirm-cancel").onclick = () => closeModal(false);
            modal.querySelector(".custom-confirm-ok").onclick = () => closeModal(true);

            overlay.onclick = (e) => {
                if (e.target === overlay) closeModal(false);
            };

            const handleKeydown = (e) => {
                if (e.key === "Escape") {
                    closeModal(false);
                    document.removeEventListener("keydown", handleKeydown);
                } else if (e.key === "Enter") {
                    closeModal(true);
                    document.removeEventListener("keydown", handleKeydown);
                }
            };
            document.addEventListener("keydown", handleKeydown);

            modal.querySelector(".custom-confirm-ok").focus();
        });
    }
}

// =====================================================
// STYLES
// =====================================================
const NOTIFICATION_STYLES = `
.toast-container {
    position: fixed;
    top: 80px;
    right: 24px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
    max-width: 420px;
}

.toast {
    min-width: 320px;
    padding: 16px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    opacity: 0;
    transform: translateX(400px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: auto;
    position: relative;
    overflow: hidden;
    border-left: 4px solid;
}

.toast.show { opacity: 1; transform: translateX(0); }
.toast.success { border-left-color: #10b981; }
.toast.error { border-left-color: #ef4444; }
.toast.warning { border-left-color: #f59e0b; }
.toast.info { border-left-color: #3b82f6; }

.toast-icon { width: 24px; height: 24px; flex-shrink: 0; margin-top: 2px; }
.toast.success .toast-icon { color: #10b981; }
.toast.error .toast-icon { color: #ef4444; }
.toast.warning .toast-icon { color: #f59e0b; }
.toast.info .toast-icon { color: #3b82f6; }
.toast-icon.spinning { animation: spin 1s linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

.toast-content { flex: 1; min-width: 0; }
.toast-title { font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 0.9375rem; }
.toast-message { font-size: 0.875rem; color: #6b7280; line-height: 1.5; }

.toast-close {
    width: 28px; height: 28px;
    border: none; background: transparent;
    color: #9ca3af; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.toast-close:hover { background: #f3f4f6; color: #111827; }
.toast-close i { width: 16px; height: 16px; }

.toast-progress {
    position: absolute; bottom: 0; left: 0;
    height: 3px; width: 100%;
    background: linear-gradient(90deg, #6366f1, #818cf8);
    transform-origin: left;
    animation: progress var(--duration, 3000ms) linear forwards;
}
.toast.success .toast-progress { background: linear-gradient(90deg, #10b981, #34d399); }
.toast.error .toast-progress { background: linear-gradient(90deg, #ef4444, #f87171); }
.toast.warning .toast-progress { background: linear-gradient(90deg, #f59e0b, #fbbf24); }

@keyframes progress { to { transform: scaleX(0); } }

.loading-overlay {
    position: fixed; top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 2999; opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    backdrop-filter: blur(2px);
}
.loading-overlay.show { opacity: 1; pointer-events: auto; }

.custom-confirm-overlay {
    position: fixed; top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10010;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s ease-out;
    backdrop-filter: blur(2px);
}
.custom-confirm-overlay.show { opacity: 1; }

.custom-confirm-modal {
    background: white; border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    max-width: 420px; width: 90%;
    transform: scale(0.95) translateY(-20px);
    transition: transform 0.2s ease-out;
    overflow: hidden;
}
.custom-confirm-overlay.show .custom-confirm-modal {
    transform: scale(1) translateY(0);
}

.custom-confirm-header {
    padding: 20px 24px 16px;
    display: flex; align-items: center; gap: 12px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: white;
}
.custom-confirm-header h3 { margin: 0; font-size: 18px; font-weight: 600; }
.custom-confirm-icon { width: 24px; height: 24px; }
.custom-confirm-body { padding: 24px; }
.custom-confirm-body p { margin: 0; font-size: 15px; color: #374151; line-height: 1.6; }

.custom-confirm-footer {
    padding: 16px 24px;
    display: flex; gap: 12px; justify-content: flex-end;
    background: #f9fafb; border-top: 1px solid #e5e7eb;
}

.custom-confirm-btn {
    padding: 10px 20px; border-radius: 8px;
    font-size: 14px; font-weight: 500;
    cursor: pointer; display: flex;
    align-items: center; gap: 6px;
    transition: all 0.15s; border: none;
}
.custom-confirm-btn i { width: 16px; height: 16px; }
.custom-confirm-cancel { background: white; color: #6b7280; border: 1px solid #d1d5db; }
.custom-confirm-cancel:hover { background: #f3f4f6; border-color: #9ca3af; }
.custom-confirm-ok { background: linear-gradient(135deg, #10b981, #059669); color: white; }
.custom-confirm-ok:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); }

@media (max-width: 768px) {
    .toast-container { top: 12px; right: 12px; left: 12px; max-width: none; }
    .toast { min-width: auto; width: 100%; }
}
`;

// =====================================================
// SINGLETON & EXPORTS
// =====================================================

// Create singleton instance
export const NotificationSystem = new NotificationManager();

// Convenience functions
export function showNotification(message, type = 'info', duration = 3000, options = {}) {
    return NotificationSystem.show(message, type, duration, options);
}

export function showToast(message, type = 'info', duration = 3000) {
    return NotificationSystem.show(message, type, duration);
}

export function showLoading(message = 'Đang xử lý...') {
    return NotificationSystem.loading(message);
}

export function hideLoading(id) {
    NotificationSystem.remove(id);
}

export function showConfirm(message, title = 'Xác nhận') {
    return NotificationSystem.confirm(message, title);
}

console.log('[NOTIFICATION] ES Module loaded');

export default NotificationSystem;
