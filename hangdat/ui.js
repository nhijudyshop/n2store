// =====================================================
// UI MANAGEMENT AND NOTIFICATIONS - FIXED VERSION
// =====================================================

// UI Configuration - ADD THIS
const CONFIG = {
    ui: {
        toastDuration: 3000, // Duration for toast messages
        animationDuration: 300, // Animation duration in ms
        hoverDelay: 500, // Delay before showing image hover
    },
};

class UIManager {
    constructor() {
        this.floatingAlert = document.getElementById("floatingAlert");
        this.alertText = this.floatingAlert?.querySelector(".alert-text");
        this.loadingSpinner =
            this.floatingAlert?.querySelector(".loading-spinner");
        this.copyNotification = document.getElementById("copyNotification");
        this.imageHoverOverlay = document.getElementById("imageHoverOverlay");
        this.hoverImage = document.getElementById("hoverImage");

        this.initializeImageHover();
        this.initializeOverlayClose();
    }

    // Helper: Check if mobile
    isMobile() {
        return (
            window.innerWidth <= 768 ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent,
            )
        );
    }

    // Helper: Get optimal image size
    getOptimalImageSize() {
        const width = Math.min(400, window.innerWidth * 0.9);
        const height = Math.min(400, window.innerHeight * 0.9);
        return { width, height };
    }

    // Show loading message
    showLoading(message = "Đang tải...") {
        if (!this.floatingAlert) return;

        this.alertText.textContent = message;
        this.loadingSpinner.style.display = "flex";
        this.floatingAlert.className = "alert-loading";
        this.floatingAlert.style.display = "block";
    }

    // Show success message
    showSuccess(message = "Thành công!") {
        if (!this.floatingAlert) return;

        this.alertText.textContent = message;
        this.loadingSpinner.style.display = "none";
        this.floatingAlert.className = "alert-success";
        this.floatingAlert.style.display = "block";

        setTimeout(() => this.hideAlert(), CONFIG.ui.toastDuration);
    }

    // Show error message
    showError(message = "Có lỗi xảy ra!") {
        if (!this.floatingAlert) return;

        this.alertText.textContent = message;
        this.loadingSpinner.style.display = "none";
        this.floatingAlert.className = "alert-error";
        this.floatingAlert.style.display = "block";

        setTimeout(() => this.hideAlert(), CONFIG.ui.toastDuration);
    }

    // Hide alert
    hideAlert() {
        if (this.floatingAlert) {
            this.floatingAlert.style.display = "none";
        }
    }

    // Show copy notification
    showCopyNotification(message = "Đã copy link ảnh!") {
        if (!this.copyNotification) return;

        this.copyNotification.textContent = message;
        this.copyNotification.classList.add("show");

        setTimeout(() => {
            this.copyNotification.classList.remove("show");
        }, 2000);
    }

    // Initialize enhanced image hover functionality
    initializeImageHover() {
        let hoverTimeout;

        // Event delegation for better performance
        document.addEventListener("mouseover", (e) => {
            if (e.target.classList.contains("product-image")) {
                hoverTimeout = setTimeout(() => {
                    this.showImageHover(e.target.src, e);
                }, CONFIG.ui.hoverDelay);
            }
        });

        document.addEventListener("mouseout", (e) => {
            if (e.target.classList.contains("product-image")) {
                clearTimeout(hoverTimeout);
                this.hideImageHover();
            }
        });

        // Click to show full overlay
        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("product-image")) {
                e.preventDefault();
                this.showImageOverlay(e.target.src);
            }
        });
    }

    // Show image hover preview
    showImageHover(imageSrc, event) {
        if (!this.imageHoverOverlay || this.isMobile()) return;

        // Create or update preview image
        let previewImg = document.querySelector(".image-preview-hover");
        if (!previewImg) {
            previewImg = document.createElement("img");
            previewImg.className = "image-preview-hover";
            previewImg.src = imageSrc;
            document.body.appendChild(previewImg);
        } else {
            previewImg.src = imageSrc;
        }

        // Position the preview
        const rect = event.target.getBoundingClientRect();
        const optimalSize = this.getOptimalImageSize();

        previewImg.style.display = "block";
        previewImg.style.maxWidth = optimalSize.width + "px";
        previewImg.style.maxHeight = optimalSize.height + "px";

        // Position to avoid viewport edges
        let left = rect.right + 10;
        let top = rect.top;

        if (left + optimalSize.width > window.innerWidth) {
            left = rect.left - optimalSize.width - 10;
        }

        if (top + optimalSize.height > window.innerHeight) {
            top = window.innerHeight - optimalSize.height - 10;
        }

        previewImg.style.left = Math.max(10, left) + "px";
        previewImg.style.top = Math.max(10, top) + "px";
    }

    // Hide image hover preview
    hideImageHover() {
        const previewImg = document.querySelector(".image-preview-hover");
        if (previewImg) {
            previewImg.style.display = "none";
        }
    }

    // Show full image overlay
    showImageOverlay(imageSrc) {
        if (!this.imageHoverOverlay || !this.hoverImage) return;

        this.hoverImage.src = imageSrc;
        this.imageHoverOverlay.style.display = "flex";
        document.body.style.overflow = "hidden"; // Prevent scrolling
    }

    // Hide image overlay
    hideImageOverlay() {
        if (this.imageHoverOverlay) {
            this.imageHoverOverlay.style.display = "none";
            document.body.style.overflow = ""; // Restore scrolling
        }
    }

    // Initialize overlay close functionality
    initializeOverlayClose() {
        if (this.imageHoverOverlay) {
            this.imageHoverOverlay.addEventListener("click", (e) => {
                if (e.target === this.imageHoverOverlay) {
                    this.hideImageOverlay();
                }
            });
        }

        // Close on Escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.hideImageOverlay();
            }
        });
    }

    // Update performance indicator
    updatePerformanceIndicator(loadTime) {
        const indicator = document.getElementById("performanceIndicator");
        if (indicator) {
            if (loadTime < 1000) {
                indicator.textContent = "Fast Load";
                indicator.style.background = "#28a745";
            } else if (loadTime < 3000) {
                indicator.textContent = "Good Load";
                indicator.style.background = "#ffc107";
            } else {
                indicator.textContent = "Slow Load";
                indicator.style.background = "#dc3545";
            }
        }
    }

    // Animate element entrance
    animateIn(element, animation = "fadeIn") {
        if (!element) return;

        element.style.animation = `${animation} ${CONFIG.ui.animationDuration}ms ease-in-out`;
        element.addEventListener(
            "animationend",
            () => {
                element.style.animation = "";
            },
            { once: true },
        );
    }

    // Smooth height transition for elements
    smoothHeight(element, newHeight) {
        if (!element) return;

        element.style.transition = `height ${CONFIG.ui.animationDuration}ms ease`;
        element.style.height = newHeight;

        setTimeout(() => {
            element.style.transition = "";
            element.style.height = "";
        }, CONFIG.ui.animationDuration);
    }

    // Show/hide form with animation
    toggleForm(form, show) {
        if (!form) return;

        if (show) {
            form.style.display = "block";
            this.animateIn(form);
        } else {
            form.style.animation = `fadeOut ${CONFIG.ui.animationDuration}ms ease-in-out`;
            setTimeout(() => {
                form.style.display = "none";
                form.style.animation = "";
            }, CONFIG.ui.animationDuration);
        }
    }

    // Highlight element temporarily
    highlightElement(element, duration = 2000) {
        if (!element) return;

        const originalBackground = element.style.background;
        element.style.background = "rgba(102, 126, 234, 0.1)";
        element.style.transition = "background 0.3s ease";

        setTimeout(() => {
            element.style.background = originalBackground;
            setTimeout(() => {
                element.style.transition = "";
            }, 300);
        }, duration);
    }
}

// Create global UI manager instance
window.uiManager = new UIManager();

// Global functions for backward compatibility
window.showLoading = (message) => window.uiManager.showLoading(message);
window.showSuccess = (message) => window.uiManager.showSuccess(message);
window.showError = (message) => window.uiManager.showError(message);
window.hideFloatingAlert = () => window.uiManager.hideAlert();

console.log("✅ UIManager initialized successfully");
