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
    tempSelectedTags: [], // Store temporary selections

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

        // Initialize temp tags from current order
        const order = allData.find(o => o.Id === orderId);
        this.tempSelectedTags = [];
        if (order && order.Tags) {
            if (Array.isArray(order.Tags)) {
                this.tempSelectedTags = [...order.Tags];
            } else if (typeof order.Tags === 'string') {
                try {
                    this.tempSelectedTags = JSON.parse(order.Tags);
                } catch (e) {
                    console.error('[QUICK-TAG] Error parsing tags:', e);
                }
            }
        }

        // Auto-open Full Modal
        this.openFullModal();

        // Get or create dropdown
        let dropdown = document.getElementById('quickTagDropdownSingleton');
        if (!dropdown) {
            dropdown = this.createDropdown();
            dropdown.id = 'quickTagDropdownSingleton';
            document.body.appendChild(dropdown);
        }

        // Load current order tags
        this.loadOrderTags(orderId).then(() => {
            // Update dropdown with current tags
            this.updateDropdown(dropdown);

            // Position and show dropdown
            const rect = buttonElement.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.zIndex = '10001';

            dropdown.classList.add('show');
            this.currentDropdown = dropdown;
        });
    },

    /**
     * Close all dropdowns
     */
    closeAllDropdowns() {
        const dropdown = document.getElementById('quickTagDropdownSingleton');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
        this.currentDropdown = null;
    },

    /**
     * Create dropdown element
     */
    createDropdown() {
        const dropdown = document.createElement('div');
        dropdown.className = 'quick-tag-dropdown';
        dropdown.innerHTML = `
            <div class="quick-tag-dropdown-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h4 style="margin: 0;"><i class="fas fa-bolt"></i> Chọn nhanh TAG</h4>
            </div>
            <div class="quick-tag-list" id="quickTagList">
                <!-- Will be populated dynamically -->
            </div>
            <div class="quick-tag-dropdown-footer" style="display: flex; gap: 8px; padding: 8px; border-top: 1px solid #eee;">
                <button class="quick-tag-btn-save" onclick="quickTagManager.saveQuickTags()" style="flex: 1; background: #10b981; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    <i class="fas fa-save"></i> Lưu
                </button>
                <button class="quick-tag-btn-cancel" onclick="quickTagManager.closeAllDropdowns()" style="flex: 1; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; padding: 6px; border-radius: 4px; cursor: pointer;">
                    Hủy
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

        // Use tempSelectedTags instead of order data
        const currentTagIds = this.tempSelectedTags.map(t => t.Id);

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
     * Toggle tag (Local only)
     */
    toggleTag(tagId, tagName, element) {
        // Check if tag is currently selected in temp array
        const tagIndex = this.tempSelectedTags.findIndex(t => t.Id == tagId); // Use loose equality for safety
        const isCurrentlySelected = tagIndex > -1;

        if (!isCurrentlySelected) {
            // Add tag
            const tag = availableTags.find(t => t.Id == tagId);
            if (tag) {
                this.tempSelectedTags.push({ Id: tag.Id, Name: tag.Name, Color: tag.Color });
                element.classList.add('selected');
                if (!element.querySelector('.fa-check-circle')) {
                    element.insertAdjacentHTML('beforeend', '<i class="fas fa-check-circle" style="margin-left: auto; color: #10b981;"></i>');
                }
            }
        } else {
            // Remove tag
            this.tempSelectedTags.splice(tagIndex, 1);
            element.classList.remove('selected');
            const checkIcon = element.querySelector('.fa-check-circle');
            if (checkIcon) checkIcon.remove();
        }
    },

    /**
     * Save quick tags to API
     */
    async saveQuickTags() {
        if (!this.currentOrderId) return;

        try {
            // Show loading state on button
            const saveBtn = this.currentDropdown.querySelector('.quick-tag-btn-save');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lưu...';
            saveBtn.disabled = true;

            const payload = {
                Tags: this.tempSelectedTags.map((tag) => ({
                    Id: tag.Id,
                    Color: tag.Color,
                    Name: tag.Name,
                })),
                OrderId: this.currentOrderId,
            };

            const headers = await window.tokenManager.getAuthHeader();
            const response = await API_CONFIG.smartFetch(
                "https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag",
                {
                    method: "POST",
                    headers: {
                        ...headers,
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (response.ok) {
                // Update local data
                const order = allData.find(o => o.Id === this.currentOrderId);
                if (order) {
                    order.Tags = JSON.stringify(this.tempSelectedTags);

                    // Update displayed data
                    const displayedOrder = displayedData.find(o => o.Id === this.currentOrderId);
                    if (displayedOrder) {
                        displayedOrder.Tags = JSON.stringify(this.tempSelectedTags);
                    }
                }

                // Re-render table
                renderTable();

                // Close dropdown
                this.closeAllDropdowns();

                if (window.notificationManager) {
                    window.notificationManager.show('✅ Đã cập nhật tag thành công', 'success');
                }
            } else {
                throw new Error('Failed to update tags');
            }
        } catch (error) {
            console.error('[QUICK-TAG] Error saving tags:', error);
            if (window.notificationManager) {
                window.notificationManager.show('❌ Lỗi khi lưu tag', 'error');
            } else {
                alert('❌ Lỗi khi lưu tag: ' + error.message);
            }

            // Reset button
            const saveBtn = this.currentDropdown.querySelector('.quick-tag-btn-save');
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu';
                saveBtn.disabled = false;
            }
        }
    },

    /**
     * Open full modal
     */
    openFullModal() {
        // this.closeAllDropdowns(); // Allow simultaneous open
        openTagModal(this.currentOrderId, this.currentOrderCode);
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    quickTagManager.initialize();
});

// Export to window
window.quickTagManager = quickTagManager;
