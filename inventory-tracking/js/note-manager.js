// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// NOTE MANAGER - Multi-user notes per invoice
// Each note = 1 row with pencil button
// Modal for create/edit/delete + image paste
// =====================================================

const NoteManager = {
    _cache: {},             // { invoiceId: [noteRow, ...] }
    _tooltipEl: null,       // Fixed-position image preview tooltip
    _currentInvoiceId: null,
    _currentNoteId: null,   // null = create, number = edit
    _pendingImages: [],     // Images being uploaded in modal

    // ==================== INIT ====================

    init() {
        // Create tooltip element once
        if (!this._tooltipEl) {
            const el = document.createElement('div');
            el.id = 'noteTooltip';
            document.body.appendChild(el);
            this._tooltipEl = el;
        }
    },

    _getUsername() {
        return authManager?.getUserInfo()?.username
            || authManager?.getAuthState()?.userType?.split('-')[0]
            || 'unknown';
    },

    _isAdmin() {
        return authManager?.isAdmin() || authManager?.isAdminTemplate() || false;
    },

    // ==================== DATA ====================

    async fetchNotes(invoiceIds) {
        if (!invoiceIds || invoiceIds.length === 0) return;
        try {
            const rows = await notesApi.getByInvoiceIds(invoiceIds);
            // Group by invoice_id
            const grouped = {};
            for (const id of invoiceIds) grouped[id] = [];
            for (const row of rows) {
                if (!grouped[row.invoice_id]) grouped[row.invoice_id] = [];
                grouped[row.invoice_id].push(row);
            }
            Object.assign(this._cache, grouped);
        } catch (err) {
            console.warn('[NOTE] Fetch error:', err.message);
        }
    },

    // Called after table renders
    async onTableRendered() {
        const ids = this._getVisibleInvoiceIds();
        if (ids.length > 0) {
            await this.fetchNotes(ids);
            this.refreshAllCells();
        }
    },

    _getVisibleInvoiceIds() {
        const cells = document.querySelectorAll('.note-cell[data-invoice-id]');
        const ids = new Set();
        cells.forEach(c => { if (c.dataset.invoiceId) ids.add(c.dataset.invoiceId); });
        return [...ids];
    },

    // ==================== CELL RENDERING ====================

    renderCell(invoiceId, legacyGhiChu) {
        const notes = this._cache[invoiceId] || [];

        let html = '<div class="note-cell" data-invoice-id="' + invoiceId + '">';

        // Legacy note (TPOS)
        if (legacyGhiChu) {
            html += '<div class="note-row">';
            html += '<span class="note-text note-legacy">' + this._esc(legacyGhiChu) + '</span>';
            html += '</div>';
        }

        // User notes
        for (const n of notes) {
            const cls = n.is_admin ? 'note-admin' : 'note-user';
            const isOwn = n.username === this._getUsername();
            const imgs = (n.note_images || []).map(url =>
                '<img class="note-thumb" src="' + url + '" ' +
                'onmouseenter="NoteManager.showTooltip(event,\'' + url + '\')" ' +
                'onmouseleave="NoteManager.hideTooltip()" ' +
                'onclick="NoteManager.openLightbox(\'' + url + '\'); event.stopPropagation();">'
            ).join('');

            html += '<div class="note-row">';
            html += '<span class="note-text ' + cls + '">';
            html += '<span class="note-username">' + n.username + ':</span> ';
            html += this._esc(n.note_text || '');
            html += '</span>';
            html += imgs;
            if (isOwn) {
                html += '<button class="note-row-btn" onclick="NoteManager.openModal(\'' + invoiceId + '\',' + n.id + '); event.stopPropagation();" title="Sửa">';
                html += '<i data-lucide="pencil"></i></button>';
            }
            html += '</div>';
        }

        // New note button (always present)
        html += '<div class="note-row note-row-new">';
        html += '<button class="note-row-btn" onclick="NoteManager.openModal(\'' + invoiceId + '\',null); event.stopPropagation();" title="Thêm ghi chú">';
        html += '<i data-lucide="pencil"></i></button>';
        html += '</div>';

        html += '</div>';
        return html;
    },

    refreshAllCells() {
        const cells = document.querySelectorAll('.note-cell[data-invoice-id]');
        cells.forEach(cell => {
            const invoiceId = cell.dataset.invoiceId;
            // Find legacy ghiChu from first .note-legacy if exists
            const legacyEl = cell.querySelector('.note-legacy');
            const legacy = legacyEl ? legacyEl.textContent : '';
            // Re-render inner content
            const tmp = document.createElement('div');
            tmp.innerHTML = this.renderCell(invoiceId, legacy);
            const newCell = tmp.firstElementChild;
            cell.innerHTML = newCell.innerHTML;
        });
        if (window.lucide) lucide.createIcons();
    },

    // ==================== TOOLTIP ====================

    showTooltip(event, url) {
        const el = this._tooltipEl;
        if (!el) return;
        el.innerHTML = '<img src="' + url + '">';
        el.style.display = 'block';
        this._positionTooltip(event);
        // Track mouse
        event.target._tooltipMove = (e) => this._positionTooltip(e);
        event.target.addEventListener('mousemove', event.target._tooltipMove);
    },

    hideTooltip() {
        if (this._tooltipEl) this._tooltipEl.style.display = 'none';
        // Clean up mousemove
        const targets = document.querySelectorAll('.note-thumb');
        targets.forEach(t => {
            if (t._tooltipMove) {
                t.removeEventListener('mousemove', t._tooltipMove);
                delete t._tooltipMove;
            }
        });
    },

    _positionTooltip(event) {
        const el = this._tooltipEl;
        if (!el) return;
        const x = Math.min(event.clientX + 12, window.innerWidth - 320);
        const y = Math.min(event.clientY + 12, window.innerHeight - 320);
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    },

    // ==================== LIGHTBOX ====================

    openLightbox(url) {
        const overlay = document.createElement('div');
        overlay.className = 'note-lightbox';
        overlay.innerHTML = '<img src="' + url + '"><button class="note-lightbox-close">&times;</button>';
        overlay.onclick = (e) => {
            if (e.target === overlay || e.target.classList.contains('note-lightbox-close')) {
                overlay.remove();
            }
        };
        document.body.appendChild(overlay);
    },

    // ==================== MODAL ====================

    openModal(invoiceId, noteId) {
        this._currentInvoiceId = invoiceId;
        this._currentNoteId = noteId;
        this._pendingImages = [];

        const body = document.getElementById('modalNoteBody');
        if (!body) return;

        if (noteId !== null && noteId !== undefined) {
            // Edit mode - find the note
            const notes = this._cache[invoiceId] || [];
            const note = notes.find(n => n.id === noteId);
            if (note) {
                this._pendingImages = [...(note.note_images || [])];
                this._renderModalEdit(body, note);
            }
        } else {
            // Create mode
            this._renderModalCreate(body);
        }

        openModal('modalNote');
        if (window.lucide) lucide.createIcons();
        setTimeout(() => document.getElementById('noteTextInput')?.focus(), 100);
    },

    _renderModalCreate(body) {
        body.innerHTML = `
            <div class="note-modal-form">
                <textarea id="noteTextInput" class="note-modal-textarea" rows="4"
                    placeholder="Nhập ghi chú... (Ctrl+V để dán ảnh)"
                    onpaste="NoteManager.handlePaste(event)"></textarea>
                <div class="note-modal-images" id="noteImagePreview"></div>
                <div class="note-modal-bar">
                    <label class="note-modal-attach" title="Đính kèm ảnh">
                        <i data-lucide="image-plus"></i>
                        <input type="file" accept="image/*" multiple style="display:none"
                               onchange="NoteManager.handleFileSelect(event)">
                    </label>
                    <span class="note-modal-upload-status" id="noteUploadStatus"></span>
                    <div style="flex:1"></div>
                    <button class="btn btn-outline btn-sm" onclick="closeModal('modalNote')">Hủy</button>
                    <button class="btn btn-primary btn-sm" onclick="NoteManager.saveNote()">
                        <i data-lucide="send"></i> Lưu
                    </button>
                </div>
            </div>
        `;
    },

    _renderModalEdit(body, note) {
        const imagesHtml = (note.note_images || []).map((url, i) =>
            '<div class="note-preview-item">' +
            '<img src="' + url + '">' +
            '<button class="note-preview-remove" onclick="NoteManager.removePreviewImage(' + i + ')">&times;</button>' +
            '</div>'
        ).join('');

        body.innerHTML = `
            <div class="note-modal-form">
                <textarea id="noteTextInput" class="note-modal-textarea" rows="4"
                    placeholder="Nhập ghi chú... (Ctrl+V để dán ảnh)"
                    onpaste="NoteManager.handlePaste(event)">${this._esc(note.note_text || '')}</textarea>
                <div class="note-modal-images" id="noteImagePreview">${imagesHtml}</div>
                <div class="note-modal-bar">
                    <label class="note-modal-attach" title="Đính kèm ảnh">
                        <i data-lucide="image-plus"></i>
                        <input type="file" accept="image/*" multiple style="display:none"
                               onchange="NoteManager.handleFileSelect(event)">
                    </label>
                    <span class="note-modal-upload-status" id="noteUploadStatus"></span>
                    <div style="flex:1"></div>
                    <button class="btn btn-danger-outline btn-sm" onclick="NoteManager.deleteNote()">
                        <i data-lucide="trash-2"></i> Xóa
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="closeModal('modalNote')">Hủy</button>
                    <button class="btn btn-primary btn-sm" onclick="NoteManager.saveNote()">
                        <i data-lucide="save"></i> Lưu
                    </button>
                </div>
            </div>
        `;
    },

    // ==================== SAVE / DELETE ====================

    async saveNote() {
        const text = document.getElementById('noteTextInput')?.value?.trim() || '';
        const images = [...this._pendingImages];

        if (!text && images.length === 0) {
            window.notificationManager?.error('Nhập nội dung ghi chú');
            return;
        }

        try {
            if (this._currentNoteId) {
                // Update
                await notesApi.update(this._currentNoteId, { noteText: text, noteImages: images });
            } else {
                // Create
                await notesApi.create(this._currentInvoiceId, {
                    noteText: text,
                    noteImages: images,
                    isAdmin: this._isAdmin()
                });
            }

            closeModal('modalNote');

            // Refresh this invoice's notes
            await this.fetchNotes([this._currentInvoiceId]);
            this.refreshAllCells();
        } catch (err) {
            console.error('[NOTE] Save error:', err);
            window.notificationManager?.error('Không thể lưu ghi chú');
        }
    },

    async deleteNote() {
        if (!this._currentNoteId) return;
        if (!confirm('Xóa ghi chú này?')) return;

        try {
            await notesApi.deleteNote(this._currentNoteId);
            closeModal('modalNote');

            await this.fetchNotes([this._currentInvoiceId]);
            this.refreshAllCells();
        } catch (err) {
            console.error('[NOTE] Delete error:', err);
            window.notificationManager?.error('Không thể xóa');
        }
    },

    // ==================== IMAGE HANDLING ====================

    async handlePaste(event) {
        const items = event.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                event.preventDefault();
                await this._uploadAndPreview(item.getAsFile());
                return;
            }
        }
    },

    async handleFileSelect(event) {
        const files = event.target.files;
        if (!files) return;
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                await this._uploadAndPreview(file);
            }
        }
        event.target.value = '';
    },

    async _uploadAndPreview(file) {
        const status = document.getElementById('noteUploadStatus');
        try {
            if (status) status.textContent = 'Đang tải ảnh...';

            const url = await uploadImage(file, 'notes');
            this._pendingImages.push(url);
            this._renderImagePreviews();

            if (status) status.textContent = '';
        } catch (err) {
            console.error('[NOTE] Upload error:', err);
            if (status) status.textContent = 'Lỗi: ' + err.message;
            window.notificationManager?.error('Lỗi tải ảnh: ' + err.message);
        }
    },

    removePreviewImage(index) {
        this._pendingImages.splice(index, 1);
        this._renderImagePreviews();
    },

    _renderImagePreviews() {
        const container = document.getElementById('noteImagePreview');
        if (!container) return;
        container.innerHTML = this._pendingImages.map((url, i) =>
            '<div class="note-preview-item">' +
            '<img src="' + url + '">' +
            '<button class="note-preview-remove" onclick="NoteManager.removePreviewImage(' + i + ')">&times;</button>' +
            '</div>'
        ).join('');
    },

    // ==================== HELPERS ====================

    _esc(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Auto-init when script loads
NoteManager.init();
console.log('[NOTE] Note manager initialized');
