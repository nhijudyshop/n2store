/**
 * Common UI Utilities - Các tiện ích giao diện chung
 * File: common-utils.js
 * Sử dụng: Include vào navigation.js hoặc sử dụng độc lập
 */

/**
 * ====================================================================================
 * STATUS & NOTIFICATION SYSTEM
 * ====================================================================================
 */

/**
 * Hiển thị thông báo status
 */
function showStatusMessage(message, type = 'info') {
    const indicator = document.getElementById('statusIndicator');
    if (indicator) {
        indicator.textContent = message;
        indicator.className = `status-indicator ${type} show`;
        
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 3000);
    }
}

/**
 * Enhanced floating alert system
 */
function showFloatingAlert(message, type = 'info', duration = 3000) {
    const alert = document.getElementById('floatingAlert');
    if (alert) {
        const alertText = alert.querySelector('.alert-text');
        const spinner = alert.querySelector('.loading-spinner');
        
        if (alertText) {
            alertText.textContent = message;
        }
        
        // Reset classes
        alert.className = 'show';
        
        if (type === 'loading') {
            alert.classList.add('loading');
            if (spinner) spinner.style.display = 'block';
        } else {
            alert.classList.add(type);
            if (spinner) spinner.style.display = 'none';
        }
        
        if (type !== 'loading') {
            setTimeout(() => {
                alert.classList.remove('show');
            }, duration);
        }
    }
}

/**
 * Hide floating alert (dành cho loading states)
 */
function hideFloatingAlert() {
    const alert = document.getElementById('floatingAlert');
    if (alert) {
        alert.classList.remove('show');
    }
}

/**
 * ====================================================================================
 * CLIPBOARD FUNCTIONALITY
 * ====================================================================================
 */

/**
 * Copy text to clipboard với fallback
 */
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        // Use modern clipboard API
        navigator.clipboard.writeText(text).then(() => {
            showCopyNotification();
        }).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback to older method
            fallbackCopyToClipboard(text);
        });
    } else {
        // Fallback for older browsers or non-secure contexts
        fallbackCopyToClipboard(text);
    }
}

/**
 * Fallback copy method
 */
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showCopyNotification();
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }
    
    document.body.removeChild(textArea);
}

/**
 * Hiển thị thông báo copy thành công
 */
function showCopyNotification() {
    const notification = document.getElementById('copyNotification');
    if (notification) {
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 2000);
    }
}

/**
 * ====================================================================================
 * EVENT HANDLERS SETUP
 * ====================================================================================
 */

/**
 * Setup image click handlers cho copy functionality
 */
function setupImageClickHandlers() {
    // Event delegation for images in table
    const tbody = document.querySelector('tbody');
    
    if (tbody) {
        tbody.addEventListener('click', function(e) {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                e.stopPropagation();
                
                const imgSrc = e.target.dataset.src || e.target.src;
                
                // Copy image source to clipboard
                copyToClipboard(imgSrc);
            }
        });
    }
}

/**
 * Setup clipboard container drag & drop feedback
 */
function setupClipboardContainers() {
    const containers = ['container', 'containerKH'];
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            container.addEventListener('dragover', function(e) {
                e.preventDefault();
                this.style.borderColor = '#667eea';
                this.style.background = '#f0f4ff';
            });

            container.addEventListener('dragleave', function(e) {
                e.preventDefault();
                this.style.borderColor = '#ddd';
                this.style.background = '#f9f9f9';
            });

            container.addEventListener('drop', function(e) {
                e.preventDefault();
                this.style.borderColor = '#28a745';
                this.style.background = '#f8fff9';
                this.classList.add('has-content');
            });
        }
    });
}

/**
 * Setup form monitoring cho better UX
 */
function setupFormMonitoring() {
    const form = document.querySelector('#dataForm form');
    if (form) {
        form.addEventListener('input', function() {
            const addButton = document.getElementById('addButton');
            const requiredFields = form.querySelectorAll('[required]');
            let allFilled = true;

            requiredFields.forEach(field => {
                if (!field.value.trim()) {
                    allFilled = false;
                }
            });

            if (addButton) {
                addButton.style.opacity = allFilled ? '1' : '0.6';
            }
        });
    }
}

/**
 * Setup security and performance indicators
 */
function setupSecurityIndicators() {
    // Update security indicator based on HTTPS
    const securityIndicator = document.getElementById('securityIndicator');
    if (securityIndicator) {
        if (location.protocol !== 'https:') {
            securityIndicator.textContent = 'Insecure';
            securityIndicator.classList.add('insecure');
        }
    }

    // Show performance indicator
    const performanceIndicator = document.getElementById('performanceIndicator');
    if (performanceIndicator) {
        performanceIndicator.style.display = 'block';
        setTimeout(() => {
            performanceIndicator.style.display = 'none';
        }, 3000);
    }
}

/**
 * ====================================================================================
 * MONITORING & ERROR HANDLING
 * ====================================================================================
 */

/**
 * Performance monitoring
 */
function setupPerformanceMonitoring() {
    window.addEventListener('load', function() {
        if (performance && performance.timing) {
            const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
            console.log('Page load time:', loadTime + 'ms');
            
            if (loadTime < 2000) {
                showStatusMessage('Tải trang nhanh!', 'success');
            } else if (loadTime > 5000) {
                showStatusMessage('Tải trang chậm', 'error');
            }
        }
    });
}

/**
 * Global error handler with user feedback
 */
function setupErrorHandling() {
    window.addEventListener('error', function(e) {
        console.error('Global error:', e.error);
        showStatusMessage('Có lỗi xảy ra!', 'error');
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', function(e) {
        console.error('Unhandled promise rejection:', e.reason);
        showStatusMessage('Có lỗi xảy ra!', 'error');
    });
}

/**
 * ====================================================================================
 * INITIALIZATION
 * ====================================================================================
 */

/**
 * Setup all common UI event handlers
 */
function setupCommonEventHandlers() {
    // Enhanced image click handling for copy functionality
    setupImageClickHandlers();
    
    // Enhanced clipboard container feedback
    setupClipboardContainers();
    
    // Monitor form state
    setupFormMonitoring();
    
    // Setup security and performance indicators
    setupSecurityIndicators();
}

/**
 * Initialize all common utilities
 */
function initializeCommonUtils() {
    // Setup common UI handlers
    setupCommonEventHandlers();
    
    // Setup performance monitoring
    setupPerformanceMonitoring();
    
    // Setup error handling
    setupErrorHandling();
    
    console.log('Common UI Utilities initialized');
}

const firebaseConfig = {
    apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
    authDomain: "n2shop-69e37.firebaseapp.com", 
    projectId: "n2shop-69e37",
    storageBucket: "n2shop-69e37-ne0q1",
    messagingSenderId: "598906493303",
    appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
    measurementId: "G-TEJH3S2T1D"
};

/**
 * ====================================================================================
 * EXPORTS
 * ====================================================================================
 */

// Export cho window object để sử dụng globally
if (typeof window !== 'undefined') {
    // Export individual functions
    window.showStatusMessage = showStatusMessage;
    window.showFloatingAlert = showFloatingAlert;
    window.hideFloatingAlert = hideFloatingAlert;
    window.copyToClipboard = copyToClipboard;
    window.showCopyNotification = showCopyNotification;
    
    // Export setup functions
    window.setupImageClickHandlers = setupImageClickHandlers;
    window.setupClipboardContainers = setupClipboardContainers;
    window.setupFormMonitoring = setupFormMonitoring;
    window.setupSecurityIndicators = setupSecurityIndicators;
    window.setupPerformanceMonitoring = setupPerformanceMonitoring;
    window.setupErrorHandling = setupErrorHandling;
    window.setupCommonEventHandlers = setupCommonEventHandlers;
    window.initializeCommonUtils = initializeCommonUtils;
    
    // Export as CommonUtils namespace
    window.CommonUtils = {
        // Notification functions
        showStatusMessage: showStatusMessage,
        showFloatingAlert: showFloatingAlert,
        hideFloatingAlert: hideFloatingAlert,
        
        // Clipboard functions
        copyToClipboard: copyToClipboard,
        showCopyNotification: showCopyNotification,
        
        // Setup functions
        setupImageClickHandlers: setupImageClickHandlers,
        setupClipboardContainers: setupClipboardContainers,
        setupFormMonitoring: setupFormMonitoring,
        setupSecurityIndicators: setupSecurityIndicators,
        setupPerformanceMonitoring: setupPerformanceMonitoring,
        setupErrorHandling: setupErrorHandling,
        setupCommonEventHandlers: setupCommonEventHandlers,
        
        // Main init
        init: initializeCommonUtils
    };
}

// Export cho module systems (Node.js, ES6 modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showStatusMessage,
        showFloatingAlert,
        hideFloatingAlert,
        copyToClipboard,
        showCopyNotification,
        setupImageClickHandlers,
        setupClipboardContainers,
        setupFormMonitoring,
        setupSecurityIndicators,
        setupPerformanceMonitoring,
        setupErrorHandling,
        setupCommonEventHandlers,
        initializeCommonUtils
    };
}
