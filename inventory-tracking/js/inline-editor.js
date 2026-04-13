// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// INLINE EDITOR - Modal-based multi-user notes
// Pencil button → modal to add/edit/delete notes
// Admin = black text, other users = red text
// =====================================================

const InlineEditor = {
    _cache: new Map(),          // shipmentId -> [noteRows]
    _pollTimer: null,
    _pollInterval: 5000,
    _activeShipmentIds: new Set(),
    _currentDotHangId: null,    // Currently open modal's dotHangId

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
        if (this._activeShipmentIds.size === 0) return;
        try {
            const ids = [...this._activeShipmentIds];
            const rows = await inlineNotesApi.getByShipmentIds(ids);

            const grouped = new Map();
            for (const id of ids) grouped.set(id, []);
            for (const row of rows) {
                if (grouped.has(row.shipment_id)) {
                    grouped.get(row.shipment_id).push(row);
                }
            }

            for (const [id, notes] of grouped) {
                this._cache.set(id, notes);
                this._renderCell(id, notes);
            }

            // Also refresh modal if open
            if (this._currentDotHangId && this._cache.has(this._currentDotHangId)) {
                this._renderModalBody(this._currentDotHangId);
            }
        } catch (err) {
            console.warn('[INLINE] Poll error:', err.message);
        }
    },

    // ==================== CELL RENDERING ====================

    _renderCell(dotHangId, notes) {
        // Render thiếu entries in cell
        const thieuContainer = document.querySelector(`.inline-thieu-entries[data-dot-hang-id="${dotHangId}"]`);
        if (thieuContainer) {
            const thieuNotes = notes.filter(n => n.thieu_value > 0);
            if (thieuNotes.length > 0) {
                thieuContainer.innerHTML = thieuNotes.map(n => {
                    const cls = n.is_admin ? 'inline-entry-admin' : 'inline-entry-user';
                    return `<div class="inline-entry ${cls}"><span class="inline-entry-value">${n.thieu_value}</span> <span class="inline-entry-name">${n.username}</span></div>`;
                }).join('');
            }
        }

        // Render ghichu entries in cell (compact preview)
        const ghichuContainer = document.querySelector(`.inline-ghichu-entries[data-dot-hang-id="${dotHangId}"]`);
        if (ghichuContainer) {
            const ghichuNotes = notes.filter(n => n.ghichu_text || (n.ghichu_images && n.ghichu_images.length > 0));
            if (ghichuNotes.length > 0) {
                ghichuContainer.innerHTML = ghichuNotes.map(n => {
                    const cls = n.is_admin ? 'inline-entry-admin' : 'inline-entry-user';
                    const imgs = (n.ghichu_images || []).map(url =>
                        `<img src="${url}" class="inline-note-thumb" onclick="InlineEditor.viewImage('${url}'); event.stopPropagation();">`
                    ).join('');
                    return `<div class="inline-entry ${cls}">
                        <span class="inline-entry-name">${n.username}:</span>
                        ${n.ghichu_text ? `<span class="inline-entry-text">${this._escapeHtml(n.ghichu_text)}</span>` : ''}
                        ${imgs}
                    </div>`;
                }).join('');
            }
        }
    },

    // ==================== MODAL ====================

    openNoteModal(dotHangId) {
        this._currentDotHangId = dotHangId;
        this._renderModalBody(dotHangId);
        openModal('modalInlineNote');
        if (window.lucide) lucide.createIcons();
    },

    _renderModalBody(dotHangId) {
        const body = document.getElementById('modalInlineNoteBody');
        if (!body) return;

        const notes = this._cache.get(dotHangId) || [];
        const currentUser = this._getUsername();
        const isAdmin = this._isAdmin();
        const inputColorClass = isAdmin ? 'inline-input-admin' : 'inline-input-user';

        // Existing notes list
        const notesHtml = notes
            .filter(n => n.ghichu_text || (n.ghichu_images && n.ghichu_images.length > 0) || n.thieu_value > 0)
            .map(n => {
                const cls = n.is_admin ? 'note-modal-admin' : 'note-modal-user';
                const isOwn = n.username === currentUser;
                const imgs = (n.ghichu_images || []).map(url =>
                    `<img src="${url}" class="note-modal-img" onclick="InlineEditor.viewImage('${url}')">`
                ).join('');
                const thieuBadge = n.thieu_value > 0 ? `<span class="note-modal-thieu">Thiếu: ${n.thieu_value}</span>` : '';

                return `<div class="note-modal-item ${cls}">
                    <div class="note-modal-header">
                        <span class="note-modal-username">${n.username}</span>
                        <span class="note-modal-time">${this._formatTime(n.created_at)}</span>
                        ${isOwn ? `<button class="note-modal-delete" onclick="InlineEditor.deleteNote(${n.id})" title="Xóa">&times;</button>` : ''}
                    </div>
                    <div class="note-modal-content">
                        ${thieuBadge}
                        ${n.ghichu_text ? `<span>${this._escapeHtml(n.ghichu_text)}</span>` : ''}
                        ${imgs ? `<div class="note-modal-images">${imgs}</div>` : ''}
                    </div>
                </div>`;
            }).join('');

        body.innerHTML = `
            <div class="note-modal-list">${notesHtml || '<p style="color:var(--gray-400);text-align:center;padding:16px">Chưa có ghi chú</p>'}</div>
            <div class="note-modal-form">
                <div class="note-modal-form-row">
                    <input type="number" id="noteModalThieu" class="${inputColorClass}" placeholder="Số thiếu" style="width:80px" onclick="event.stopPropagation()">
                    <input type="text" id="noteModalText" class="${inputColorClass}" placeholder="Nhập ghi chú..." style="flex:1"
                           onpaste="InlineEditor.handlePaste(event, '${dotHangId}')"
                           onkeydown="if(event.key==='Enter'){event.preventDefault();InlineEditor.saveFromModal('${dotHangId}');}">
                    <label class="inline-attach-btn" title="Đính kèm ảnh (hoặc Ctrl+V vào ô ghi chú)">
                        <i data-lucide="image-plus" style="width:16px;height:16px"></i>
                        <input type="file" accept="image/*" style="display:none"
                               onchange="InlineEditor.handleFileSelect(event, '${dotHangId}')">
                    </label>
                    <button class="btn btn-primary btn-sm" onclick="InlineEditor.saveFromModal('${dotHangId}')">
                        <i data-lucide="send" style="width:14px;height:14px"></i>
                    </button>
                </div>
                <div class="note-modal-upload-indicator" style="display:none"></div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();

        // Focus text input
        setTimeout(() => document.getElementById('noteModalText')?.focus(), 100);
    },

    // ==================== SAVE ====================

    async saveFromModal(dotHangId) {
        const thieuInput = document.getElementById('noteModalThieu');
        const textInput = document.getElementById('noteModalText');

        const thieuValue = parseInt(thieuInput?.value, 10) || 0;
        const ghichuText = textInput?.value?.trim() || '';

        if (!thieuValue && !ghichuText) return;

        try {
            await inlineNotesApi.create(dotHangId, {
                thieuValue,
                ghichuText,
                isAdmin: this._isAdmin()
            });

            // Clear inputs
            if (thieuInput) thieuInput.value = '';
            if (textInput) textInput.value = '';

            // Refresh
            await this._fetchAndRender();
        } catch (err) {
            console.error('[INLINE] Save error:', err);
            window.notificationManager?.error('Không thể lưu ghi chú');
        }
    },

    // ==================== IMAGE ====================

    async handlePaste(event, dotHangId) {
        const items = event.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                event.preventDefault();
                await this._uploadImage(dotHangId, item.getAsFile());
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
        const indicator = document.querySelector('.note-modal-upload-indicator');
        try {
            if (indicator) {
                indicator.style.display = 'block';
                indicator.textContent = 'Đang tải ảnh...';
            }

            const url = await uploadImage(file, `inline-notes/${dotHangId}`);

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
            if (indicator) indicator.style.display = 'none';
        }
    },

    // ==================== DELETE ====================

    async deleteNote(noteId) {
        if (!confirm('Xóa ghi chú này?')) return;
        try {
            await inlineNotesApi.deleteNote(noteId);
            await this._fetchAndRender();
        } catch (err) {
            console.error('[INLINE] Delete error:', err);
            window.notificationManager?.error('Không thể xóa');
        }
    },

    // ==================== HELPERS ====================

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
    },

    _formatTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
};

console.log('[INLINE] Inline editor initialized (modal mode)');
