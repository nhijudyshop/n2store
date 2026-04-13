// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// INLINE EDITOR - Multi-user append-mode notes
// Thiếu & Ghi Chú columns — each save appends a new entry
// Admin = black text, other users = red text
// =====================================================

const InlineEditor = {
    _cache: new Map(),          // shipmentId -> [noteRows]
    _pollTimer: null,
    _pollInterval: 5000,
    _activeShipmentIds: new Set(),
    _saving: false,

    _getUsername() {
        return authManager?.getUserInfo()?.username
            || authManager?.getAuthState()?.userType?.split('-')[0]
            || 'unknown';
    },

    _isAdmin() {
        return authManager?.isAdmin() || authManager?.isAdminTemplate() || false;
    },

    // ==================== LIFECYCLE ====================

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
            this._pollTimer = setInterval(() => this._fetchAndRender(), this._pollInterval);
        }
    },

    cleanup() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        this._activeShipmentIds.clear();
    },

    async _fetchAndRender() {
        if (this._activeShipmentIds.size === 0 || this._saving) return;
        try {
            const ids = [...this._activeShipmentIds];
            const rows = await inlineNotesApi.getByShipmentIds(ids);

            // Group by shipment_id
            const grouped = new Map();
            for (const id of ids) grouped.set(id, []);
            for (const row of rows) {
                if (grouped.has(row.shipment_id)) {
                    grouped.get(row.shipment_id).push(row);
                }
            }

            for (const [id, notes] of grouped) {
                this._cache.set(id, notes);
                this._renderAll(id, notes);
            }
        } catch (err) {
            console.warn('[INLINE] Poll error:', err.message);
        }
    },

    // ==================== SAVE THIẾU ====================

    async saveThieu(dotHangId) {
        const input = document.querySelector(`.inline-thieu-input[data-dot-hang-id="${dotHangId}"]`);
        const value = parseInt(input?.value, 10);
        if (!value || value <= 0) return;

        this._saving = true;
        try {
            await inlineNotesApi.create(dotHangId, {
                thieuValue: value,
                isAdmin: this._isAdmin()
            });
            input.value = '';
            await this._fetchAndRender();
        } catch (err) {
            console.error('[INLINE] Save thiếu error:', err);
            window.notificationManager?.error('Không thể lưu');
        } finally {
            this._saving = false;
        }
    },

    // ==================== SAVE GHI CHÚ ====================

    async saveGhiChu(dotHangId) {
        const input = document.querySelector(`.inline-ghichu-input[data-dot-hang-id="${dotHangId}"]`);
        const text = input?.value?.trim();
        if (!text) return;

        this._saving = true;
        try {
            await inlineNotesApi.create(dotHangId, {
                ghichuText: text,
                isAdmin: this._isAdmin()
            });
            input.value = '';
            await this._fetchAndRender();
        } catch (err) {
            console.error('[INLINE] Save ghichu error:', err);
            window.notificationManager?.error('Không thể lưu');
        } finally {
            this._saving = false;
        }
    },

    // ==================== KEY HANDLER ====================

    handleKeyDown(event, type, dotHangId) {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (type === 'thieu') {
                this.saveThieu(dotHangId);
            } else {
                this.saveGhiChu(dotHangId);
            }
        }
    },

    // ==================== IMAGE PASTE / UPLOAD ====================

    async handlePaste(event, dotHangId) {
        const items = event.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) await this._uploadImage(dotHangId, file);
                return;
            }
        }
    },

    async handleFileSelect(event, dotHangId) {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            await this._uploadImage(dotHangId, file);
        }
        event.target.value = '';
    },

    async _uploadImage(dotHangId, file) {
        const cell = document.querySelector(`.inline-ghichu-cell[data-dot-hang-id="${dotHangId}"]`);
        const indicator = cell?.querySelector('.inline-upload-indicator');

        this._saving = true;
        try {
            if (indicator) {
                indicator.style.display = 'flex';
                indicator.textContent = 'Đang tải ảnh...';
            }

            const url = await uploadImage(file, `inline-notes/${dotHangId}`);

            // Create a note entry with the image
            await inlineNotesApi.create(dotHangId, {
                ghichuImages: [url],
                isAdmin: this._isAdmin()
            });

            await this._fetchAndRender();
            window.notificationManager?.success('Đã tải ảnh');
        } catch (err) {
            console.error('[INLINE] Upload error:', err);
            window.notificationManager?.error('Lỗi tải ảnh: ' + err.message);
        } finally {
            this._saving = false;
            if (indicator) indicator.style.display = 'none';
        }
    },

    // ==================== DELETE NOTE ====================

    async deleteNote(noteId, dotHangId) {
        if (!confirm('Xóa ghi chú này?')) return;
        try {
            await inlineNotesApi.deleteNote(noteId);
            await this._fetchAndRender();
        } catch (err) {
            console.error('[INLINE] Delete error:', err);
        }
    },

    // ==================== RENDERING ====================

    _renderAll(dotHangId, notes) {
        this._renderThieu(dotHangId, notes);
        this._renderGhiChu(dotHangId, notes);
    },

    _renderThieu(dotHangId, notes) {
        const container = document.querySelector(`.inline-thieu-entries[data-dot-hang-id="${dotHangId}"]`);
        if (!container) return;

        const thieuNotes = notes.filter(n => n.thieu_value > 0);
        if (thieuNotes.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = thieuNotes.map(n => {
            const colorClass = n.is_admin ? 'inline-entry-admin' : 'inline-entry-user';
            const isOwn = n.username === this._getUsername();
            const deleteBtn = isOwn ? `<button class="inline-delete-btn" onclick="InlineEditor.deleteNote(${n.id}, '${dotHangId}')" title="Xóa">&times;</button>` : '';
            return `<div class="inline-entry ${colorClass}">
                <span class="inline-entry-value">${n.thieu_value}</span>
                <span class="inline-entry-name">${n.username}</span>
                ${deleteBtn}
            </div>`;
        }).join('');
    },

    _renderGhiChu(dotHangId, notes) {
        const container = document.querySelector(`.inline-ghichu-entries[data-dot-hang-id="${dotHangId}"]`);
        if (!container) return;

        const ghichuNotes = notes.filter(n => n.ghichu_text || (n.ghichu_images && n.ghichu_images.length > 0));
        if (ghichuNotes.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = ghichuNotes.map(n => {
            const colorClass = n.is_admin ? 'inline-entry-admin' : 'inline-entry-user';
            const isOwn = n.username === this._getUsername();
            const deleteBtn = isOwn ? `<button class="inline-delete-btn" onclick="InlineEditor.deleteNote(${n.id}, '${dotHangId}')" title="Xóa">&times;</button>` : '';

            const imagesHtml = (n.ghichu_images || []).map(url =>
                `<img src="${url}" class="inline-note-thumb" onclick="InlineEditor.viewImage('${url}')" title="Click để xem">`
            ).join('');

            return `<div class="inline-entry ${colorClass}">
                <span class="inline-entry-name">${n.username}:</span>
                ${n.ghichu_text ? `<span class="inline-entry-text">${this._escapeHtml(n.ghichu_text)}</span>` : ''}
                ${imagesHtml ? `<div class="inline-note-images">${imagesHtml}</div>` : ''}
                ${deleteBtn}
            </div>`;
        }).join('');
    },

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

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

console.log('[INLINE] Inline editor initialized (REST API append mode)');
