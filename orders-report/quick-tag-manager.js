// =====================================================
// QUICK TAG MANAGER
// =====================================================

// LocalStorage key for quick access tags
const QUICK_TAGS_KEY = 'quickAccessTags';

// Default quick access tag names
const DEFAULT_QUICK_TAGS = [
    'Thẻ Khách Lạ',
    'Giỏ Trống',
    'OK',
    'Xử Lý',
    'CK'
];

// Global quick tag manager
const quickTagManager = {
    currentOrderId: null,
    currentOrderCode: null,
    currentDropdown: null,

    /**
     * Initialize quick tag manager
     */
    initialize() {
        console.log('[QUICK-TAG] Initializing quick tag manager...');

        // Initialize default quick tags if not exists
        const saved = this.getQuickTags();
        if (saved.length === 0) {
            this.setQuickTags(DEFAULT_QUICK_TAGS);
            console.log('[QUICK-TAG] Initialized with default tags:', DEFAULT_QUICK_TAGS);
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tag-btn-container') && !e.target.closest('.quick-tag-dropdown')) {
                this.closeAllDropdowns();
            }
        });

        console.log('[QUICK-TAG] Quick tag manager initialized');
    },

    /**
     * Get quick access tags from localStorage
     */
    getQuickTags() {
        try {
            const saved = localStorage.getItem(QUICK_TAGS_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.error('[QUICK-TAG] Error loading quick tags:', error);
        }
        return [];
    },

    /**
     * Set quick access tags to localStorage
     */
    setQuickTags(tagNames) {
        try {
            localStorage.setItem(QUICK_TAGS_KEY, JSON.stringify(tagNames));
            console.log('[QUICK-TAG] Quick tags saved:', tagNames);
        } catch (error) {
            console.error('[QUICK-TAG] Error saving quick tags:', error);
        }
    },

    /**
     * Add tag to quick access
     */
    addQuickTag(tagName) {
        const tags = this.getQuickTags();
        if (!tags.includes(tagName)) {
            tags.push(tagName);
            this.setQuickTags(tags);
            return true;
        }
        return false;
    },

    /**
     * Remove tag from quick access
     */
    removeQuickTag(tagName) {
        const tags = this.getQuickTags();
        const index = tags.indexOf(tagName);
        if (index > -1) {
            tags.splice(index, 1);
            this.setQuickTags(tags);
            return true;
        }
        return false;
    },

    /**
     * Check if tag is in quick access
     */
    isQuickTag(tagName) {
        return this.getQuickTags().includes(tagName);
    },

    /**
     * Toggle quick tag
     */
    toggleQuickTag(tagName) {
        if (this.isQuickTag(tagName)) {
            this.removeQuickTag(tagName);
            return false;
        } else {
            this.addQuickTag(tagName);
            return true;
        }
    },

    /**
     * Open quick tag dropdown
     */
    openDropdown(orderId, orderCode, buttonElement) {
        // Close any existing dropdowns
        this.closeAllDropdowns();

        this.currentOrderId = orderId;
        this.currentOrderCode = orderCode;

        // Get or create dropdown
        let dropdown = buttonElement.nextElementSibling;
        if (!dropdown || !dropdown.classList.contains('quick-tag-dropdown')) {
            dropdown = this.createDropdown();
            buttonElement.parentElement.appendChild(dropdown);
        }

        // Load current order tags
        this.loadOrderTags(orderId).then(() => {
            // Update dropdown with current tags
            this.updateDropdown(dropdown);

            // Show dropdown
            dropdown.classList.add('show');
            this.currentDropdown = dropdown;
        });
    },

    /**
     * Close all dropdowns
     */
    closeAllDropdowns() {
        document.querySelectorAll('.quick-tag-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
        this.currentDropdown = null;
    },

    /**
     * Create dropdown element
     */
    createDropdown() {
        const dropdown = document.createElement('div');
        dropdown.className = 'quick-tag-dropdown';
        dropdown.innerHTML = `
            <div class="quick-tag-dropdown-header">
                <h4><i class="fas fa-bolt"></i> Chọn nhanh TAG</h4>
            </div>
            <div class="quick-tag-list" id="quickTagList">
                <!-- Will be populated dynamically -->
            </div>
            <div class="quick-tag-dropdown-footer">
                <button class="quick-tag-open-modal-btn" onclick="quickTagManager.openFullModal()">
                    <i class="fas fa-th"></i>
                    Quản lý đầy đủ
                </button>
            </div>
        `;
        return dropdown;
    },

    /**
     * Update dropdown with quick tags
     */
    async updateDropdown(dropdown) {
        const listContainer = dropdown.querySelector('#quickTagList');
        if (!listContainer) return;

        const quickTagNames = this.getQuickTags();

        // Get all available tags
        if (!availableTags || availableTags.length === 0) {
            await loadAvailableTags();
        }

        // Filter tags that are in quick access
        const quickTags = availableTags.filter(tag => quickTagNames.includes(tag.Name));

        // Get current order tags
        const currentOrder = allData.find(o => o.Id === this.currentOrderId);
        let currentTagIds = [];
        if (currentOrder && currentOrder.Tags) {
            try {
                currentTagIds = JSON.parse(currentOrder.Tags).map(t => t.Id);
            } catch (e) {
                console.error('[QUICK-TAG] Error parsing order tags:', e);
            }
        }

        // Render quick tags
        if (quickTags.length === 0) {
            listContainer.innerHTML = `
                <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
                    <i class="fas fa-info-circle"></i>
                    <p style="margin: 8px 0 0 0;">Chưa có tag nào được đánh dấu chọn nhanh.</p>
                    <p style="margin: 4px 0 0 0;">Bấm "Quản lý đầy đủ" để thêm.</p>
                </div>
            `;
        } else {
            listContainer.innerHTML = quickTags.map(tag => {
                const isSelected = currentTagIds.includes(tag.Id);
                return `
                    <div class="quick-tag-item ${isSelected ? 'selected' : ''}" data-tag-id="${tag.Id}" onclick="quickTagManager.toggleTag('${tag.Id}', '${tag.Name.replace(/'/g, "\\'")}', this)">
                        <div class="quick-tag-item-color" style="background-color: ${tag.Color || '#6b7280'}"></div>
                        <span class="quick-tag-item-name">${tag.Name}</span>
                        ${isSelected ? '<i class="fas fa-check-circle" style="margin-left: auto; color: #10b981;"></i>' : ''}
                    </div>
                `;
            }).join('');
        }
    },

    /**
     * Load order tags from API
     */
    async loadOrderTags(orderId) {
        // Tags are already loaded in allData, no need to fetch again
        return Promise.resolve();
    },

    /**
     * Toggle tag for current order
     */
    async toggleTag(tagId, tagName, element) {
        // Get current order
        const order = allData.find(o => o.Id === this.currentOrderId);
        if (!order) {
            console.error('[QUICK-TAG] Order not found:', this.currentOrderId);
            return;
        }

        // Parse current tags
        let orderTags = [];
        if (order.Tags) {
            try {
                orderTags = JSON.parse(order.Tags);
            } catch (e) {
                console.error('[QUICK-TAG] Error parsing tags:', e);
                orderTags = [];
            }
        }

        // Check if tag is currently selected
        const tagIndex = orderTags.findIndex(t => t.Id === tagId);
        const isCurrentlySelected = tagIndex > -1;

        console.log(`[QUICK-TAG] Toggling tag "${tagName}" for order ${this.currentOrderId}: ${!isCurrentlySelected ? 'ADD' : 'REMOVE'}`);

        try {
            // Toggle tag
            if (!isCurrentlySelected) {
                // Add tag
                const tag = availableTags.find(t => t.Id === tagId);
                if (tag) {
                    orderTags.push({ Id: tag.Id, Name: tag.Name, Color: tag.Color });
                }
            } else {
                // Remove tag
                orderTags.splice(tagIndex, 1);
            }

            // Save to API
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `${API_CONFIG.TPOS_ODATA}/Order(${this.currentOrderId})`;
            const response = await API_CONFIG.smartFetch(
                apiUrl,
                {
                    method: 'PATCH',
                    headers: {
                        ...headers,
                        'accept': 'application/json',
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        Tags: JSON.stringify(orderTags)
                    })
                }
            );

            if (response.ok) {
                // Update local data
                order.Tags = JSON.stringify(orderTags);

                // Update UI - toggle selected class and check icon
                element.classList.toggle('selected');
                const checkIcon = element.querySelector('.fa-check-circle');
                if (checkIcon) {
                    checkIcon.remove();
                } else {
                    element.insertAdjacentHTML('beforeend', '<i class="fas fa-check-circle" style="margin-left: auto; color: #10b981;"></i>');
                }

                // Re-render table to update tag display
                renderTable();

                console.log(`[QUICK-TAG] Tag "${tagName}" ${!isCurrentlySelected ? 'added' : 'removed'} successfully`);

                // Show notification
                if (window.notificationManager) {
                    window.notificationManager.show(
                        `${!isCurrentlySelected ? '✅ Đã thêm' : '🗑️ Đã bỏ'} tag "${tagName}"`,
                        !isCurrentlySelected ? 'success' : 'info'
                    );
                }
            } else {
                throw new Error('Failed to update tags');
            }
        } catch (error) {
            console.error('[QUICK-TAG] Error toggling tag:', error);
            if (window.notificationManager) {
                window.notificationManager.show('❌ Lỗi khi cập nhật tag', 'error');
            } else {
                alert('❌ Lỗi khi cập nhật tag: ' + error.message);
            }
        }
    },

    /**
     * Open full modal
     */
    openFullModal() {
        this.closeAllDropdowns();
        openTagModal(this.currentOrderId, this.currentOrderCode);
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    quickTagManager.initialize();
});

// Export to window
window.quickTagManager = quickTagManager;
