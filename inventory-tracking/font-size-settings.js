// =====================================================
// FONT SIZE SETTINGS - INVENTORY TRACKING
// Customize font sizes for different page sections
// =====================================================

const FONT_SIZE_STORAGE_KEY = 'inventory_tracking_font_sizes';

// Default font sizes (in percentage)
const DEFAULT_FONT_SIZES = {
    header: 100,
    filters: 100,
    shipmentCards: 140,
    table: 100,
    modal: 100
};

// CSS selectors for each section
const SECTION_SELECTORS = {
    header: '.top-bar',
    filters: '.filters-navigation',
    shipmentCards: '.shipment-card',
    table: '.invoice-table, .finance-table',
    modal: '.modal-container'
};

// Current font sizes
let currentFontSizes = { ...DEFAULT_FONT_SIZES };

/**
 * Initialize font size settings
 */
function initFontSizeSettings() {
    // Load saved settings
    loadFontSizeSettings();

    // Apply saved settings
    applyAllFontSizes();

    // Setup event listeners
    setupFontSizeEventListeners();

    console.log('[FONT-SIZE] Font size settings initialized');
}

/**
 * Load font size settings from localStorage
 */
function loadFontSizeSettings() {
    try {
        const saved = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            currentFontSizes = { ...DEFAULT_FONT_SIZES, ...parsed };
        }
    } catch (error) {
        console.error('[FONT-SIZE] Error loading settings:', error);
        currentFontSizes = { ...DEFAULT_FONT_SIZES };
    }

    // Update input values in modal
    updateModalInputs();
}

/**
 * Save font size settings to localStorage
 */
function saveFontSizeSettings() {
    try {
        localStorage.setItem(FONT_SIZE_STORAGE_KEY, JSON.stringify(currentFontSizes));
        toast.success('Đã lưu cài đặt cỡ chữ');
    } catch (error) {
        console.error('[FONT-SIZE] Error saving settings:', error);
        toast.error('Lỗi lưu cài đặt');
    }
}

/**
 * Update modal input values
 */
function updateModalInputs() {
    Object.keys(currentFontSizes).forEach(section => {
        const input = document.getElementById(`fontSize-${section}`);
        if (input) {
            input.value = currentFontSizes[section];
        }
        // Update preview
        updatePreview(section, currentFontSizes[section]);
    });
}

/**
 * Update preview text size
 */
function updatePreview(section, size) {
    const preview = document.querySelector(`.font-setting-preview[data-section="${section}"]`);
    if (preview) {
        preview.style.fontSize = `${size}%`;
    }
}

/**
 * Apply font size to a section
 */
function applyFontSize(section, size) {
    const selector = SECTION_SELECTORS[section];
    if (!selector) return;

    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
        el.style.fontSize = `${size / 100}em`;
    });
}

/**
 * Apply all font sizes
 */
function applyAllFontSizes() {
    Object.keys(currentFontSizes).forEach(section => {
        applyFontSize(section, currentFontSizes[section]);
    });
}

/**
 * Setup event listeners
 */
function setupFontSizeEventListeners() {
    // Open modal button
    const openBtn = document.getElementById('fontSizeSettingsBtn');
    openBtn?.addEventListener('click', openFontSizeModal);

    // Close modal button
    const closeBtn = document.getElementById('btnCloseFontSizeModal');
    closeBtn?.addEventListener('click', () => closeModal('modalFontSize'));

    // Modal overlay click
    const modal = document.getElementById('modalFontSize');
    modal?.querySelector('.modal-overlay')?.addEventListener('click', () => closeModal('modalFontSize'));

    // Adjust buttons (+ and -)
    document.querySelectorAll('.btn-font-adjust').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            const action = btn.dataset.action;
            const input = document.getElementById(`fontSize-${section}`);

            if (!input) return;

            let value = parseInt(input.value) || 100;
            const step = 5;

            if (action === 'increase') {
                value = Math.min(200, value + step);
            } else {
                value = Math.max(50, value - step);
            }

            input.value = value;
            currentFontSizes[section] = value;
            updatePreview(section, value);
            applyFontSize(section, value);
        });
    });

    // Input change handlers
    document.querySelectorAll('.font-size-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const section = e.target.id.replace('fontSize-', '');
            let value = parseInt(e.target.value) || 100;

            // Clamp value
            value = Math.max(50, Math.min(200, value));

            currentFontSizes[section] = value;
            updatePreview(section, value);
            applyFontSize(section, value);
        });

        input.addEventListener('blur', (e) => {
            // Ensure valid value on blur
            let value = parseInt(e.target.value) || 100;
            value = Math.max(50, Math.min(200, value));
            e.target.value = value;
        });
    });

    // Reset button
    const resetBtn = document.getElementById('btnResetFontSize');
    resetBtn?.addEventListener('click', resetFontSizes);

    // Save button
    const saveBtn = document.getElementById('btnSaveFontSize');
    saveBtn?.addEventListener('click', () => {
        saveFontSizeSettings();
        closeModal('modalFontSize');
    });
}

/**
 * Open font size settings modal
 */
function openFontSizeModal() {
    updateModalInputs();
    openModal('modalFontSize');
    if (window.lucide) {
        lucide.createIcons();
    }
}

/**
 * Reset font sizes to default
 */
function resetFontSizes() {
    currentFontSizes = { ...DEFAULT_FONT_SIZES };
    updateModalInputs();
    applyAllFontSizes();
    toast.info('Đã đặt lại cỡ chữ mặc định');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initFontSizeSettings);

// Also initialize when page loads (for dynamic content)
window.addEventListener('load', () => {
    // Re-apply font sizes after all content is loaded
    setTimeout(applyAllFontSizes, 500);
});

// Export for use in other modules
window.fontSizeSettings = {
    apply: applyAllFontSizes,
    reset: resetFontSizes,
    get: () => ({ ...currentFontSizes }),
    set: (section, size) => {
        if (SECTION_SELECTORS[section]) {
            currentFontSizes[section] = size;
            applyFontSize(section, size);
        }
    }
};

console.log('[FONT-SIZE] Font size settings module loaded');
