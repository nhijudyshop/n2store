// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// INLINE EDITOR - Multi-user real-time inline editing
// Thiếu & Ghi Chú columns with image paste support
// Uses REST API (PostgreSQL) + polling for real-time sync
// =====================================================

const InlineEditor = {
    _cache: new Map(),          // shipmentId -> { [username]: noteRow }
    _debounceTimers: new Map(),
    _pollTimer: null,
    _pollInterval: 5000,        // Poll every 5 seconds
    _activeShipmentIds: new Set(),

    /**
     * Get current username
     */
    _getUsername() {
        return authManager?.getUserInfo()?.username
            || authManager?.getAuthState()?.userType?.split('-')[0]
            || 'unknown';
    },

    /**
     * Check if current user is admin
     */
    _isAdmin() {
        return authManager?.isAdmin() || authManager?.isAdminTemplate() || false;
    },

    /**
     * Collect all visible shipment IDs from the DOM and start polling
     */
    setupAllListeners() {
        this.cleanup();

        const cells = document.querySelectorAll('[data-dot-hang-id]');
        const ids = new Set();
        cells.forEach(cell => {
            const id = cell.dataset.dotHangId;
            if (id) ids.add(id);
        });

        this._activeShipmentIds = ids;

        if (ids.size > 0) {
            this._fetchAndRender();
            this._startPolling();
        }
    },

    /**
     * Cleanup polling
     */
    cleanup() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        this._activeShipmentIds.clear();
    },

    /**
     * Start polling for real-time updates
     */
    _startPolling() {
        if (this._pollTimer) clearInterval(this._pollTimer);
        this._pollTimer = setInterval(() => this._fetchAndRender(), this._pollInterval);
    },

    /**
     * Fetch all inline notes for active shipments and render
     */
    async _fetchAndRender() {
        if (this._activeShipmentIds.size === 0) return;

        try {
            const ids = [...this._activeShipmentIds];
            const rows = await inlineNotesApi.getByShipmentIds(ids);

            // Group by shipment_id
            const grouped = new Map();
            for (const row of rows) {
                if (!grouped.has(row.shipment_id)) {
                    grouped.set(row.shipment_id, {});
                }
                grouped.get(row.shipment_id)[row.username] = row;
            }

            // Update cache and render
            for (const id of ids) {
                const entries = grouped.get(id) || {};
                this._cache.set(id, entries);
                this._renderEntries(id, entries);
            }
        } catch (err) {
            console.warn('[INLINE] Polling error:', err.message);
        }
    },

    // ==================== THIẾU ====================

    /**
     * Save thiếu value (debounced)
     */
    saveThieu(dotHangId, value) {
        const key = `thieu_${dotHangId}`;
        clearTimeout(this._debounceTimers.get(key));
        this._debounceTimers.set(key, setTimeout(() => {
            this._saveNow(dotHangId);
        }, 800));
    },

    // ==================== GHI CHÚ ====================

    /**
     * Save ghi chú text (debounced)
     */
    saveGhiChu(dotHangId, text) {
        const key = `ghichu_${dotHangId}`;
        clearTimeout(this._debounceTimers.get(key));
        this._debounceTimers.set(key, setTimeout(() => {
            this._saveNow(dotHangId);
        }, 800));
    },

    /**
     * Save current user's thieu + ghichu to server
     */
    async _saveNow(dotHangId) {
        const username = this._getUsername();
        const isAdmin = this._isAdmin();

        // Read current input values from DOM
        const thieuInput = document.querySelector(`.inline-thieu-input[data-dot-hang-id="${dotHangId}"]`);
        const ghichuInput = document.querySelector(`.inline-ghichu-input[data-dot-hang-id="${dotHangId}"]`);

        const thieuValue = parseInt(thieuInput?.value, 10) || 0;
        const ghichuText = ghichuInput?.value || '';

        // Preserve existing images from cache
        const cached = this._cache.get(dotHangId);
        const existing = cached?.[username];
        const ghichuImages = existing?.ghichu_images || [];

        try {
            await inlineNotesApi.upsert(dotHangId, {
                thieuValue,
                ghichuText,
                ghichuImages,
                isAdmin
            });
        } catch (err) {
            console.error('[INLINE] Error saving:', err);
            window.notificationManager?.error('Không thể lưu');
        }
    },

    // ==================== IMAGE PASTE ====================

    /**
     * Handle paste event on ghi chú input
     */
    async handlePaste(event, dotHangId) {
        const items = event.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await this._uploadAndAttach(dotHangId, file);
                }
                return;
            }
        }
    },

    /**
     * Handle file input change for image attachment
     */
    async handleFileSelect(event, dotHangId) {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            await this._uploadAndAttach(dotHangId, file);
        }
        event.target.value = '';
    },

    /**
     * Upload image and attach to ghi chú via REST API
     */
    async _uploadAndAttach(dotHangId, file) {
        const cell = document.querySelector(`.inline-ghichu-cell[data-dot-hang-id="${dotHangId}"]`);
        const uploadIndicator = cell?.querySelector('.inline-upload-indicator');

        try {
            if (uploadIndicator) {
                uploadIndicator.style.display = 'flex';
                uploadIndicator.textContent = 'Đang tải...';
            }

            // Upload to Firebase Storage via existing server endpoint
            const url = await uploadImage(file, `inline-notes/${dotHangId}`);

            // Add image to note via REST API
            await inlineNotesApi.addImage(dotHangId, url, this._isAdmin());

            // Refresh display
            await this._fetchAndRender();

            window.notificationManager?.success('Đã tải ảnh lên');
        } catch (err) {
            console.error('[INLINE] Error uploading image:', err);
            window.notificationManager?.error('Không thể tải ảnh: ' + err.message);
        } finally {
            if (uploadIndicator) {
                uploadIndicator.style.display = 'none';
            }
        }
    },

    /**
     * Remove an image from ghi chú
     */
    async removeImage(dotHangId, imageUrl) {
        try {
            await inlineNotesApi.removeImage(dotHangId, imageUrl);
            await this._fetchAndRender();
        } catch (err) {
            console.error('[INLINE] Error removing image:', err);
        }
    },

    // ==================== RENDERING ====================

    /**
     * Render all entries for a shipment into the table cells
     */
    _renderEntries(dotHangId, entries) {
        this._renderThieuEntries(dotHangId, entries);
        this._renderGhiChuEntries(dotHangId, entries);
    },

    /**
     * Render thiếu entries (display area only, not the input)
     */
    _renderThieuEntries(dotHangId, entries) {
        const container = document.querySelector(`.inline-thieu-entries[data-dot-hang-id="${dotHangId}"]`);
        if (!container) return;

        const currentUser = this._getUsername();

        let html = '';
        for (const [username, row] of Object.entries(entries)) {
            if (username === currentUser) continue; // Skip own entry (shown in input)
            if (!row.thieu_value || row.thieu_value <= 0) continue;

            const colorClass = row.is_admin ? 'inline-entry-admin' : 'inline-entry-user';
            html += `<div class="inline-entry ${colorClass}" title="${username}">
                <span class="inline-entry-value">${row.thieu_value}</span>
                <span class="inline-entry-name">${username}</span>
            </div>`;
        }
        container.innerHTML = html;

        // Update own input value from cache (if not focused)
        const input = document.querySelector(`.inline-thieu-input[data-dot-hang-id="${dotHangId}"]`);
        if (input && document.activeElement !== input) {
            const ownEntry = entries[currentUser];
            if (ownEntry?.thieu_value) {
                input.value = ownEntry.thieu_value;
            }
        }
    },

    /**
     * Render ghi chú entries
     */
    _renderGhiChuEntries(dotHangId, entries) {
        const container = document.querySelector(`.inline-ghichu-entries[data-dot-hang-id="${dotHangId}"]`);
        if (!container) return;

        const currentUser = this._getUsername();

        // Render other users' entries
        let html = '';
        for (const [username, row] of Object.entries(entries)) {
            if (username === currentUser) continue;
            const hasContent = row.ghichu_text || (row.ghichu_images && row.ghichu_images.length > 0);
            if (!hasContent) continue;

            const colorClass = row.is_admin ? 'inline-entry-admin' : 'inline-entry-user';
            const imagesHtml = (row.ghichu_images || []).map(url =>
                `<img src="${url}" class="inline-note-thumb" onclick="InlineEditor.viewImage('${url}')" title="Click để xem">`
            ).join('');
            html += `<div class="inline-entry ${colorClass}" title="${username}">
                <span class="inline-entry-name">${username}:</span>
                <span class="inline-entry-text">${this._escapeHtml(row.ghichu_text || '')}</span>
                ${imagesHtml ? `<div class="inline-note-images">${imagesHtml}</div>` : ''}
            </div>`;
        }
        container.innerHTML = html;

        // Update own input (if not focused)
        const input = document.querySelector(`.inline-ghichu-input[data-dot-hang-id="${dotHangId}"]`);
        if (input && document.activeElement !== input) {
            const ownEntry = entries[currentUser];
            if (ownEntry?.ghichu_text) {
                input.value = ownEntry.ghichu_text;
            }
        }

        // Render own images
        const ownImagesContainer = document.querySelector(`.inline-own-images[data-dot-hang-id="${dotHangId}"]`);
        if (ownImagesContainer) {
            const ownImages = entries[currentUser]?.ghichu_images || [];
            ownImagesContainer.innerHTML = ownImages.map(url =>
                `<div class="inline-own-image-wrap">
                    <img src="${url}" class="inline-note-thumb" onclick="InlineEditor.viewImage('${url}')">
                    <button class="inline-remove-img" onclick="InlineEditor.removeImage('${dotHangId}', '${url}')" title="Xóa ảnh">&times;</button>
                </div>`
            ).join('');
        }
    },

    /**
     * View image in lightbox
     */
    viewImage(url) {
        const overlay = document.createElement('div');
        overlay.className = 'inline-image-lightbox';
        overlay.innerHTML = `<img src="${url}"><button class="inline-lightbox-close">&times;</button>`;
        overlay.onclick = (e) => {
            if (e.target === overlay || e.target.classList.contains('inline-lightbox-close')) {
                overlay.remove();
            }
        };
        document.body.appendChild(overlay);
    },

    /**
     * Escape HTML to prevent XSS
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

console.log('[INLINE] Inline editor initialized (REST API mode)');
