// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// INLINE EDITOR - Multi-user real-time inline editing
// Thiếu & Ghi Chú columns with image paste support
// =====================================================

/**
 * Firestore collection: inventory_inline_notes
 * Document key: dotHangId (e.g. "dot_xxx")
 * Structure:
 * {
 *   thieu: { [username]: { value: number, updatedAt: string } },
 *   ghichu: { [username]: { text: string, images: [url], updatedAt: string } }
 * }
 */

const InlineEditor = {
    _listeners: new Map(),  // dotHangId -> unsubscribe function
    _cache: new Map(),      // dotHangId -> document data
    _debounceTimers: new Map(),

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
     * Check if a given username is admin (cached from Firestore users doc)
     */
    _adminUsersCache: null,
    async _isUserAdmin(username) {
        if (!this._adminUsersCache) {
            this._adminUsersCache = new Map();
            try {
                const snapshot = await usersRef?.get();
                snapshot?.forEach(doc => {
                    const data = doc.data();
                    const isAdmin = data.isAdmin === true
                        || data.roleTemplate === 'admin'
                        || data.detailedPermissions?.inventoryTracking?.edit_soMonThieu === true;
                    this._adminUsersCache.set(doc.id, isAdmin);
                });
            } catch (e) {
                console.warn('[INLINE] Could not load admin users cache:', e);
            }
        }
        return this._adminUsersCache.get(username) || false;
    },

    /**
     * Setup real-time listener for a dotHang document
     */
    setupListener(dotHangId) {
        if (this._listeners.has(dotHangId) || !inlineNotesRef) return;

        const unsubscribe = inlineNotesRef.doc(dotHangId).onSnapshot(snapshot => {
            const data = snapshot.exists ? snapshot.data() : { thieu: {}, ghichu: {} };
            this._cache.set(dotHangId, data);
            this._renderEntries(dotHangId, data);
        }, err => {
            console.warn('[INLINE] Listener error for', dotHangId, err);
        });

        this._listeners.set(dotHangId, unsubscribe);
    },

    /**
     * Cleanup all listeners
     */
    cleanup() {
        this._listeners.forEach(unsub => unsub());
        this._listeners.clear();
        this._cache.clear();
    },

    /**
     * Setup listeners for all visible dotHang entries
     */
    setupAllListeners() {
        this.cleanup();
        const cells = document.querySelectorAll('[data-dot-hang-id]');
        const ids = new Set();
        cells.forEach(cell => {
            const id = cell.dataset.dotHangId;
            if (id && !ids.has(id)) {
                ids.add(id);
                this.setupListener(id);
            }
        });
    },

    // ==================== THIẾU ====================

    /**
     * Save thiếu value (debounced)
     */
    saveThieu(dotHangId, value) {
        const key = `thieu_${dotHangId}`;
        clearTimeout(this._debounceTimers.get(key));
        this._debounceTimers.set(key, setTimeout(() => {
            this._saveThieuNow(dotHangId, value);
        }, 500));
    },

    async _saveThieuNow(dotHangId, value) {
        const username = this._getUsername();
        const numValue = parseInt(value, 10) || 0;

        try {
            const docRef = inlineNotesRef.doc(dotHangId);
            await docRef.set({
                thieu: {
                    [username]: {
                        value: numValue,
                        updatedAt: new Date().toISOString()
                    }
                }
            }, { merge: true });
        } catch (err) {
            console.error('[INLINE] Error saving thiếu:', err);
            window.notificationManager?.error('Không thể lưu số thiếu');
        }
    },

    // ==================== GHI CHÚ ====================

    /**
     * Save ghi chú text (debounced)
     */
    saveGhiChu(dotHangId, text) {
        const key = `ghichu_${dotHangId}`;
        clearTimeout(this._debounceTimers.get(key));
        this._debounceTimers.set(key, setTimeout(() => {
            this._saveGhiChuNow(dotHangId, text);
        }, 500));
    },

    async _saveGhiChuNow(dotHangId, text) {
        const username = this._getUsername();
        const cached = this._cache.get(dotHangId);
        const existing = cached?.ghichu?.[username] || {};

        try {
            const docRef = inlineNotesRef.doc(dotHangId);
            await docRef.set({
                ghichu: {
                    [username]: {
                        text: text,
                        images: existing.images || [],
                        updatedAt: new Date().toISOString()
                    }
                }
            }, { merge: true });
        } catch (err) {
            console.error('[INLINE] Error saving ghi chú:', err);
            window.notificationManager?.error('Không thể lưu ghi chú');
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
     * Upload image and attach to ghi chú
     */
    async _uploadAndAttach(dotHangId, file) {
        const username = this._getUsername();
        const cell = document.querySelector(`.inline-ghichu-cell[data-dot-hang-id="${dotHangId}"]`);
        const uploadIndicator = cell?.querySelector('.inline-upload-indicator');

        try {
            if (uploadIndicator) {
                uploadIndicator.style.display = 'flex';
                uploadIndicator.textContent = 'Đang tải...';
            }

            const url = await uploadImage(file, `inline-notes/${dotHangId}`);

            // Get existing images
            const cached = this._cache.get(dotHangId);
            const existing = cached?.ghichu?.[username] || {};
            const images = [...(existing.images || []), url];

            // Save to Firestore
            const docRef = inlineNotesRef.doc(dotHangId);
            await docRef.set({
                ghichu: {
                    [username]: {
                        text: existing.text || '',
                        images: images,
                        updatedAt: new Date().toISOString()
                    }
                }
            }, { merge: true });

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
        const username = this._getUsername();
        const cached = this._cache.get(dotHangId);
        const existing = cached?.ghichu?.[username] || {};
        const images = (existing.images || []).filter(url => url !== imageUrl);

        try {
            const docRef = inlineNotesRef.doc(dotHangId);
            await docRef.set({
                ghichu: {
                    [username]: {
                        text: existing.text || '',
                        images: images,
                        updatedAt: new Date().toISOString()
                    }
                }
            }, { merge: true });
        } catch (err) {
            console.error('[INLINE] Error removing image:', err);
        }
    },

    // ==================== RENDERING ====================

    /**
     * Render all entries for a dotHang into the table cells
     */
    async _renderEntries(dotHangId, data) {
        await this._renderThieuEntries(dotHangId, data.thieu || {});
        await this._renderGhiChuEntries(dotHangId, data.ghichu || {});
    },

    /**
     * Render thiếu entries (display area only, not the input)
     */
    async _renderThieuEntries(dotHangId, thieu) {
        const container = document.querySelector(`.inline-thieu-entries[data-dot-hang-id="${dotHangId}"]`);
        if (!container) return;

        const currentUser = this._getUsername();
        const entries = Object.entries(thieu).filter(([, v]) => v.value > 0);

        if (entries.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '';
        for (const [username, entry] of entries) {
            if (username === currentUser) continue; // Skip own entry (shown in input)
            const isAdmin = await this._isUserAdmin(username);
            const colorClass = isAdmin ? 'inline-entry-admin' : 'inline-entry-user';
            html += `<div class="inline-entry ${colorClass}" title="${username}">
                <span class="inline-entry-value">${entry.value}</span>
                <span class="inline-entry-name">${username}</span>
            </div>`;
        }
        container.innerHTML = html;

        // Update own input value from cache
        const input = document.querySelector(`.inline-thieu-input[data-dot-hang-id="${dotHangId}"]`);
        if (input && document.activeElement !== input) {
            input.value = thieu[currentUser]?.value || '';
        }
    },

    /**
     * Render ghi chú entries
     */
    async _renderGhiChuEntries(dotHangId, ghichu) {
        const container = document.querySelector(`.inline-ghichu-entries[data-dot-hang-id="${dotHangId}"]`);
        if (!container) return;

        const currentUser = this._getUsername();
        const entries = Object.entries(ghichu).filter(([, v]) => v.text || (v.images && v.images.length > 0));

        // Render other users' entries
        let html = '';
        for (const [username, entry] of entries) {
            if (username === currentUser) continue;
            const isAdmin = await this._isUserAdmin(username);
            const colorClass = isAdmin ? 'inline-entry-admin' : 'inline-entry-user';
            const imagesHtml = (entry.images || []).map(url =>
                `<img src="${url}" class="inline-note-thumb" onclick="InlineEditor.viewImage('${url}')" title="Click để xem">`
            ).join('');
            html += `<div class="inline-entry ${colorClass}" title="${username}">
                <span class="inline-entry-name">${username}:</span>
                <span class="inline-entry-text">${this._escapeHtml(entry.text || '')}</span>
                ${imagesHtml ? `<div class="inline-note-images">${imagesHtml}</div>` : ''}
            </div>`;
        }
        container.innerHTML = html;

        // Update own input
        const input = document.querySelector(`.inline-ghichu-input[data-dot-hang-id="${dotHangId}"]`);
        if (input && document.activeElement !== input) {
            input.value = ghichu[currentUser]?.text || '';
        }

        // Render own images
        const ownImagesContainer = document.querySelector(`.inline-own-images[data-dot-hang-id="${dotHangId}"]`);
        if (ownImagesContainer) {
            const ownImages = ghichu[currentUser]?.images || [];
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

console.log('[INLINE] Inline editor initialized');
