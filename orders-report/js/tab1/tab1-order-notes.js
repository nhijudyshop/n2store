// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Order Notes — CSKH history per order
 * - Multi-note append history (each note: text + author + timestamp).
 * - Renders inline in the "cs-notes" column of tab1 orders table.
 * - Author-scoped edit/delete (only note creator can edit/delete own notes).
 * - Backend: Render REST API (/api/order-notes) with localStorage offline cache.
 *
 * Module pattern follows tab1-fast-sale-invoice-status.js.
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'orderNotesStore_v1';
    const API_BASE =
        (window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev') +
        '/api/order-notes';
    const SSE_KEY = 'order_notes_global';
    const SSE_URL = 'https://n2store-fallback.onrender.com/api/realtime/sse?keys=' + encodeURIComponent(SSE_KEY);
    const POLL_INTERVAL_MS = 30000; // fallback polling when SSE disconnected

    // =====================================================
    // STORE
    // =====================================================
    const OrderNotesStore = {
        _data: new Map(), // orderId -> Array<Note>  (sorted ASC by createdAt)
        _loaded: false,
        _loadPromise: null,
        _sseSource: null,
        _pollTimer: null,

        async init() {
            if (this._loadPromise) return this._loadPromise;
            this._loadPromise = (async () => {
                const apiOk = await this._loadFromAPI();
                if (!apiOk) this._loadFromLocalStorage();
                this._loaded = true;
                // Re-render all visible notes cells once data is loaded
                this._refreshAllVisibleCells();
                this._setupRealtime();
            })();
            return this._loadPromise;
        },

        _setupRealtime() {
            this._teardownRealtime();
            try {
                const source = new EventSource(SSE_URL);
                this._sseSource = source;
                source.addEventListener('update', ev => {
                    try {
                        const payload = JSON.parse(ev.data);
                        const body = payload.data || payload;
                        this._applyRemoteEvent(body);
                    } catch (err) {
                        console.warn('[OrderNotesStore] SSE parse error:', err.message);
                    }
                });
                source.onerror = () => {
                    console.warn('[OrderNotesStore] SSE error, falling back to polling');
                    this._teardownRealtime();
                    this._startPolling();
                };
            } catch (err) {
                console.warn('[OrderNotesStore] EventSource unavailable:', err.message);
                this._startPolling();
            }
        },

        _teardownRealtime() {
            if (this._sseSource) {
                try { this._sseSource.close(); } catch (_) {}
                this._sseSource = null;
            }
            if (this._pollTimer) {
                clearInterval(this._pollTimer);
                this._pollTimer = null;
            }
        },

        _startPolling() {
            if (this._pollTimer) return;
            this._pollTimer = setInterval(async () => {
                const ok = await this._loadFromAPI();
                if (ok) this._refreshAllVisibleCells();
            }, POLL_INTERVAL_MS);
        },

        _applyRemoteEvent(body) {
            if (!body || !body.action) return;
            if (body.action === 'created' || body.action === 'updated') {
                const n = body.note;
                if (!n?.orderId || !n?.id) return;
                let arr = this._data.get(n.orderId);
                if (!arr) {
                    arr = [];
                    this._data.set(n.orderId, arr);
                }
                const idx = arr.findIndex(x => x.id === n.id);
                if (idx >= 0) arr[idx] = n;
                else arr.push(n);
                this._saveToLocalStorage();
                this._refreshCell(n.orderId);
            } else if (body.action === 'deleted') {
                const { noteId, orderId } = body;
                if (!orderId || !noteId) return;
                const arr = this._data.get(orderId);
                if (arr) {
                    const i = arr.findIndex(x => x.id === noteId);
                    if (i >= 0) arr.splice(i, 1);
                }
                this._saveToLocalStorage();
                this._refreshCell(orderId);
            }
        },

        async _loadFromAPI() {
            try {
                const resp = await fetch(`${API_BASE}/load`, { method: 'GET' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const body = await resp.json();
                if (!body.success || !Array.isArray(body.entries)) throw new Error('Bad payload');

                this._data.clear();
                for (const n of body.entries) {
                    if (!n?.orderId) continue;
                    let arr = this._data.get(n.orderId);
                    if (!arr) {
                        arr = [];
                        this._data.set(n.orderId, arr);
                    }
                    arr.push(n);
                }
                this._saveToLocalStorage();
                return true;
            } catch (err) {
                console.warn('[OrderNotesStore] API load failed, falling back to cache:', err.message);
                return false;
            }
        },

        _loadFromLocalStorage() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') return;
                this._data.clear();
                for (const [orderId, arr] of Object.entries(parsed)) {
                    if (Array.isArray(arr)) this._data.set(orderId, arr);
                }
            } catch (err) {
                console.warn('[OrderNotesStore] localStorage load failed:', err.message);
            }
        },

        _saveToLocalStorage() {
            try {
                const obj = {};
                for (const [k, v] of this._data) obj[k] = v;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
            } catch (err) {
                console.warn('[OrderNotesStore] localStorage save failed:', err.message);
            }
        },

        getAll(orderId) {
            return this._data.get(orderId) || [];
        },

        async add(orderId, text) {
            const author = getCurrentUser();
            const resp = await fetch(`${API_BASE}/entries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, author, text }),
            });
            const body = await resp.json();
            if (!resp.ok || !body.success) {
                throw new Error(body.error || `HTTP ${resp.status}`);
            }
            let arr = this._data.get(orderId);
            if (!arr) {
                arr = [];
                this._data.set(orderId, arr);
            }
            arr.push(body.note);
            this._saveToLocalStorage();
            this._refreshCell(orderId);
            return body.note;
        },

        async edit(noteId, newText) {
            const author = getCurrentUser();
            const resp = await fetch(`${API_BASE}/entries/${encodeURIComponent(noteId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ author, text: newText }),
            });
            const body = await resp.json();
            if (!resp.ok || !body.success) {
                throw new Error(body.error || `HTTP ${resp.status}`);
            }
            const updated = body.note;
            const arr = this._data.get(updated.orderId);
            if (arr) {
                const idx = arr.findIndex(n => n.id === updated.id);
                if (idx >= 0) arr[idx] = updated;
            }
            this._saveToLocalStorage();
            this._refreshCell(updated.orderId);
            return updated;
        },

        async remove(noteId, orderId) {
            const author = getCurrentUser();
            const url = `${API_BASE}/entries/${encodeURIComponent(noteId)}?author=${encodeURIComponent(author)}`;
            const resp = await fetch(url, { method: 'DELETE' });
            const body = await resp.json().catch(() => ({}));
            if (!resp.ok || !body.success) {
                throw new Error(body.error || `HTTP ${resp.status}`);
            }
            const arr = this._data.get(orderId);
            if (arr) {
                const idx = arr.findIndex(n => n.id === noteId);
                if (idx >= 0) arr.splice(idx, 1);
            }
            this._saveToLocalStorage();
            this._refreshCell(orderId);
        },

        _refreshCell(orderId) {
            const cell = document.querySelector(
                `tr[data-order-id="${cssEscape(orderId)}"] td[data-column="cs-notes"]`
            );
            if (cell) cell.innerHTML = renderCellInner(orderId);
        },

        _refreshAllVisibleCells() {
            const cells = document.querySelectorAll('td[data-column="cs-notes"]');
            cells.forEach(cell => {
                const tr = cell.closest('tr[data-order-id]');
                const orderId = tr?.getAttribute('data-order-id');
                if (orderId) cell.innerHTML = renderCellInner(orderId);
            });
        },
    };

    // =====================================================
    // HELPERS
    // =====================================================
    function getCurrentUser() {
        return (
            window.getUserName?.() ||
            (localStorage.getItem('userType') || '').split('-')[0] ||
            'Unknown'
        );
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(s) {
        return escapeHtml(s);
    }

    function cssEscape(s) {
        // Minimal: escape double quotes for selector building.
        return String(s ?? '').replace(/"/g, '\\"');
    }

    function formatTime(ts) {
        const d = new Date(ts);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm} ${hh}:${mi}`;
    }

    // =====================================================
    // RENDERING
    // =====================================================
    function renderCellInner(orderId) {
        const notes = OrderNotesStore.getAll(orderId);
        const currentUser = getCurrentUser();
        const items = notes
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(n => renderNoteItem(n, currentUser))
            .join('');
        const orderIdAttr = escapeAttr(orderId);
        return `
            <div class="cs-notes-wrap">
                ${items}
                <button class="add-note-btn" onclick="window.openAddNoteForm('${orderIdAttr}', this); event.stopPropagation();" title="Thêm ghi chú">
                    <i class="fas fa-pen"></i> Thêm ghi chú
                </button>
            </div>`;
    }

    function renderNotesCell(order) {
        if (!order?.Id) return '<td data-column="cs-notes"></td>';
        return `<td data-column="cs-notes">${renderCellInner(order.Id)}</td>`;
    }

    function renderNoteItem(note, currentUser) {
        const own = note.author === currentUser;
        const editedTag = note.isEdited
            ? `<span class="note-edited-tag">(đã sửa)</span>`
            : '';
        const actions = own
            ? `<span class="note-actions">
                 <button type="button" class="edit-btn" title="Sửa ghi chú"
                         onclick="window.openEditNoteForm('${escapeAttr(note.id)}', this); event.stopPropagation();"><i class="fas fa-pen"></i></button>
                 <button type="button" class="del-btn"  title="Xoá ghi chú"
                         onclick="window.deleteOrderNote('${escapeAttr(note.id)}', '${escapeAttr(note.orderId)}'); event.stopPropagation();"><i class="fas fa-trash"></i></button>
               </span>`
            : '';
        return `
            <div class="note-item ${own ? 'own' : ''}" data-note-id="${escapeAttr(note.id)}">
                <div class="note-text">${escapeHtml(note.text)}</div>
                <div class="note-meta">
                    <span class="note-author">— ${escapeHtml(note.author)} · ${formatTime(note.createdAt)}${editedTag}</span>
                    ${actions}
                </div>
            </div>`;
    }

    // =====================================================
    // FORMS (inline inside cell)
    // =====================================================
    function openAddForm(orderId, btnEl) {
        const wrap = btnEl?.closest('.cs-notes-wrap');
        if (!wrap) return;
        // Avoid duplicate form
        if (wrap.querySelector('.note-form[data-mode="add"]')) return;
        btnEl.style.display = 'none';

        const form = document.createElement('div');
        form.className = 'note-form';
        form.dataset.mode = 'add';
        form.innerHTML = `
            <textarea placeholder="Ghi chú xử lý đơn…" maxlength="2000"></textarea>
            <div class="btn-row">
                <button type="button" class="cancel-btn">Huỷ</button>
                <button type="button" class="save-btn">Lưu</button>
            </div>`;
        wrap.appendChild(form);
        const ta = form.querySelector('textarea');
        ta.focus();

        form.querySelector('.cancel-btn').addEventListener('click', e => {
            e.stopPropagation();
            form.remove();
            btnEl.style.display = '';
        });
        form.querySelector('.save-btn').addEventListener('click', async e => {
            e.stopPropagation();
            const text = ta.value.trim();
            if (!text) {
                ta.focus();
                return;
            }
            const saveBtn = form.querySelector('.save-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Đang lưu…';
            try {
                await OrderNotesStore.add(orderId, text);
                // Cell re-renders via _refreshCell; form is gone with it.
            } catch (err) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Lưu';
                alert('Lỗi lưu ghi chú: ' + err.message);
            }
        });
    }

    function openEditForm(noteId, btnEl) {
        const itemEl = btnEl?.closest('.note-item');
        if (!itemEl) return;
        const orderIdEl = itemEl.closest('tr[data-order-id]');
        const orderId = orderIdEl?.getAttribute('data-order-id');
        if (!orderId) return;
        const arr = OrderNotesStore.getAll(orderId);
        const note = arr.find(n => n.id === noteId);
        if (!note) return;

        // Replace item with an inline edit form
        const form = document.createElement('div');
        form.className = 'note-form';
        form.dataset.mode = 'edit';
        form.dataset.noteId = noteId;
        form.innerHTML = `
            <textarea maxlength="2000"></textarea>
            <div class="btn-row">
                <button type="button" class="cancel-btn">Huỷ</button>
                <button type="button" class="save-btn">Lưu</button>
            </div>`;
        itemEl.replaceWith(form);
        const ta = form.querySelector('textarea');
        ta.value = note.text;
        ta.focus();

        form.querySelector('.cancel-btn').addEventListener('click', e => {
            e.stopPropagation();
            OrderNotesStore._refreshCell(orderId);
        });
        form.querySelector('.save-btn').addEventListener('click', async e => {
            e.stopPropagation();
            const text = ta.value.trim();
            if (!text) {
                ta.focus();
                return;
            }
            if (text === note.text) {
                OrderNotesStore._refreshCell(orderId);
                return;
            }
            const saveBtn = form.querySelector('.save-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Đang lưu…';
            try {
                await OrderNotesStore.edit(noteId, text);
            } catch (err) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Lưu';
                alert('Lỗi sửa ghi chú: ' + err.message);
            }
        });
    }

    async function confirmDelete(noteId, orderId) {
        if (!confirm('Xoá ghi chú này?')) return;
        try {
            await OrderNotesStore.remove(noteId, orderId);
        } catch (err) {
            alert('Lỗi xoá ghi chú: ' + err.message);
        }
    }

    // =====================================================
    // EXPOSE
    // =====================================================
    window.OrderNotesStore = OrderNotesStore;
    window.renderNotesCell = renderNotesCell;
    window.openAddNoteForm = openAddForm;
    window.openEditNoteForm = openEditForm;
    window.deleteOrderNote = confirmDelete;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => OrderNotesStore.init());
    } else {
        OrderNotesStore.init();
    }
})();
