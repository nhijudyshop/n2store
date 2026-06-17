// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Quick Reply system
// =====================================================
//
// Self-contained quick-reply manager for Web 2.0 chat surfaces.
//
// Backed by Render PostgreSQL via `/api/web2-quick-replies` —
// bảng `web2_quick_replies` trên web2Db, FORK 2026-06-12 (3W1 audit vòng 3)
// khỏi `/api/web2-quick-replies` (bảng quick_replies chatDb = Web 1.0 PROD).
// Trước đây "share data" nghĩa là xoá quick-reply ở trang beta Web 2.0
// MẤT luôn ở chat Web 1.0 → đã tách; server auto-seed one-time (read-only)
// từ bảng Web 1.0 khi bảng mới rỗng.
//
// Features:
//   - Browse / pick reply via popup modal
//   - `/shortcut` autocomplete in any <textarea>/<input>:
//        Vietnamese diacritics-insensitive matching
//        Up/Down/Enter/Escape keyboard nav
//        Auto-send on shortcut `/CAMON` (matches the web 1.0 magic word)
//   - CRUD inside the modal (add / edit / delete)
//   - localStorage cache for instant load (Render is source of truth)
//
// Public API (window.Web2QuickReply):
//   await Web2QuickReply.loadReplies(forceFresh?)  → Reply[]
//   Web2QuickReply.getReplies()                    → Reply[] (sync, cached)
//   await Web2QuickReply.addReply(reply)           → Reply
//   await Web2QuickReply.updateReply(id, reply)    → Reply
//   await Web2QuickReply.deleteReply(id)           → void
//   Web2QuickReply.attachAutocomplete(inputEl, { onSelect, onAutoSend })
//   Web2QuickReply.detachAutocomplete(inputEl)
//   Web2QuickReply.openModal({ onSelect, anchorInputId? })
//   Web2QuickReply.signature()                     → "\nNv. <name>" or ""
//
// Reply shape:
//   { id, sortOrder, shortcut, topic, topicColor, message, imageUrl, contentId }

(function (global) {
    'use strict';

    if (global.Web2QuickReply) return;

    const WORKER_BASE =
        global.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const LS_CACHE = 'web2_quick_replies_cache_v1';
    const AUTO_SEND_SHORTCUTS = new Set(['/CAMON', '/camon']);

    let _replies = [];
    let _loadPromise = null;
    const _attached = new WeakMap(); // input → { handlers, dropdown }

    // -----------------------------------------------------
    // Utilities
    // -----------------------------------------------------

    function _stripDiacritics(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/gi, (m) => (m === 'Đ' ? 'D' : 'd'))
            .toLowerCase();
    }

    function _escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _loadCache() {
        try {
            const raw = localStorage.getItem(LS_CACHE);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) _replies = arr;
            }
        } catch {
            /* ignore */
        }
    }

    function _saveCache() {
        try {
            localStorage.setItem(LS_CACHE, JSON.stringify(_replies));
        } catch {
            /* quota */
        }
    }

    function _notify(msg, type) {
        if (global.notificationManager) {
            global.notificationManager[type || 'info'](msg);
        } else {
            console.log('[Web2QuickReply notify]', type, msg);
        }
    }

    function signature() {
        const name =
            global.authManager?.getUserInfo?.()?.displayName ||
            global.authManager?.getAuthState?.()?.displayName ||
            '';
        return name ? `\nNv. ${name}` : '';
    }

    // -----------------------------------------------------
    // REST API
    // -----------------------------------------------------

    // ENFORCE-PREP (2026-06-12): POST/PUT/DELETE /api/web2-quick-replies sắp
    // gate WEB2_AUTH_ENFORCE=1 (GET không gate). Page load web2-auth.js →
    // Web2Auth.authHeaders; không load → đọc thẳng localStorage 'web2_auth'.
    function _authHeaders(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* ignore */
        }
        return h;
    }

    async function loadReplies(forceFresh) {
        if (_loadPromise && !forceFresh) return _loadPromise;
        _loadPromise = (async () => {
            try {
                const r = await fetch(`${WORKER_BASE}/api/web2-quick-replies`);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                if (data?.success && Array.isArray(data.replies)) {
                    _replies = data.replies;
                    _saveCache();
                }
                return _replies;
            } catch (e) {
                console.warn('[Web2QuickReply] loadReplies failed:', e.message);
                return _replies; // fall back to cache
            } finally {
                _loadPromise = null;
            }
        })();
        return _loadPromise;
    }

    function getReplies() {
        return _replies.slice();
    }

    async function addReply(reply) {
        const r = await fetch(`${WORKER_BASE}/api/web2-quick-replies`, {
            method: 'POST',
            // ENFORCE-PREP (2026-06-12)
            headers: _authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(reply),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!data?.success) throw new Error(data?.error || 'add failed');
        _replies.push(data.reply);
        _saveCache();
        return data.reply;
    }

    async function updateReply(id, patch) {
        const r = await fetch(`${WORKER_BASE}/api/web2-quick-replies/${encodeURIComponent(id)}`, {
            method: 'PUT',
            // ENFORCE-PREP (2026-06-12)
            headers: _authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!data?.success) throw new Error(data?.error || 'update failed');
        const idx = _replies.findIndex((x) => x.id === id);
        if (idx >= 0) _replies[idx] = data.reply;
        _saveCache();
        return data.reply;
    }

    async function deleteReply(id) {
        const r = await fetch(`${WORKER_BASE}/api/web2-quick-replies/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: _authHeaders(), // ENFORCE-PREP (2026-06-12)
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        _replies = _replies.filter((x) => x.id !== id);
        _saveCache();
    }

    // -----------------------------------------------------
    // Autocomplete (in-input `/shortcut` matching)
    // -----------------------------------------------------

    function _ensureStyle() {
        if (document.getElementById('w2-qr-style')) return;
        const css = `
            .w2-qr-dropdown {
                position: absolute;
                z-index: 9999;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(15,23,42,0.18);
                min-width: 280px;
                max-width: 420px;
                max-height: 280px;
                overflow-y: auto;
                font-size: 12px;
                padding: 4px;
            }
            .w2-qr-dropdown-item {
                display: block;
                padding: 7px 9px;
                border-radius: 6px;
                cursor: pointer;
                color: #0f172a;
            }
            .w2-qr-dropdown-item:hover,
            .w2-qr-dropdown-item.active {
                background: #e8f2ff;
            }
            .w2-qr-dropdown-item .shortcut {
                font-family: ui-monospace, monospace;
                color: #0068ff;
                font-weight: 600;
                margin-right: 6px;
            }
            .w2-qr-dropdown-item .topic {
                display: inline-block;
                font-size: 10px;
                padding: 1px 6px;
                border-radius: 999px;
                margin-left: 4px;
                color: #fff;
                font-weight: 600;
                vertical-align: middle;
            }
            .w2-qr-dropdown-item .preview {
                display: block;
                color: #64748b;
                margin-top: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .w2-qr-dropdown-empty { padding: 10px; color: #94a3b8; font-style: italic; text-align: center; }
            .w2-qr-fab {
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 0 8px;
                height: 38px;
                cursor: pointer;
                color: #0068ff;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                font-weight: 600;
            }
            .w2-qr-fab:hover { background: #e8f2ff; }
            .w2-qr-modal-overlay {
                position: fixed; inset: 0; background: rgba(15,23,42,0.45);
                z-index: 10000; display: flex; align-items: center; justify-content: center;
            }
            .w2-qr-modal {
                background: #fff; border-radius: 10px; width: min(640px, 92vw); max-height: 80vh;
                display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                overflow: hidden;
            }
            .w2-qr-modal header {
                padding: 14px 18px; border-bottom: 1px solid #f1f5f9;
                display: flex; align-items: center; gap: 10px;
            }
            .w2-qr-modal header h3 { margin: 0; font-size: 15px; font-weight: 700; flex: 1; }
            .w2-qr-modal .body { padding: 12px 18px; overflow-y: auto; flex: 1; }
            .w2-qr-modal .footer {
                padding: 10px 18px; border-top: 1px solid #f1f5f9;
                display: flex; gap: 8px; justify-content: flex-end;
            }
            .w2-qr-row {
                display: flex; align-items: center; gap: 10px;
                padding: 8px; border-radius: 6px; border: 1px solid #f1f5f9;
                margin-bottom: 6px; cursor: pointer;
            }
            .w2-qr-row:hover { background: #f8fafc; }
            .w2-qr-row .col-shortcut { font-family: ui-monospace, monospace; color: #0068ff; font-weight: 600; min-width: 80px; }
            .w2-qr-row .col-msg { flex: 1; color: #0f172a; font-size: 12px; }
            .w2-qr-row .col-msg .topic-pill { font-size: 10px; padding: 1px 6px; border-radius: 999px; color:#fff; margin-right: 6px; vertical-align: middle; }
            .w2-qr-row .col-act { display: flex; gap: 4px; }
            .w2-qr-icon-btn {
                width: 26px; height: 26px; border: 1px solid #e2e8f0; background: #fff;
                border-radius: 6px; cursor: pointer; color: #64748b;
                display: inline-flex; align-items: center; justify-content: center;
            }
            .w2-qr-icon-btn:hover { background: #f8fafc; color: #0f172a; }
            .w2-qr-icon-btn.danger:hover { background: #fef2f2; color: #b91c1c; }
        `;
        const el = document.createElement('style');
        el.id = 'w2-qr-style';
        el.textContent = css;
        document.head.appendChild(el);
    }

    function _matchShortcut(input) {
        const val = input.value || '';
        const caret = input.selectionEnd ?? val.length;
        // find token starting with `/` ending at caret
        const before = val.slice(0, caret);
        const m = /(^|\s)(\/[^\s]{0,30})$/.exec(before);
        if (!m) return null;
        return { start: caret - m[2].length, query: m[2], end: caret };
    }

    function _findCandidates(query) {
        const q = _stripDiacritics(query.replace(/^\//, ''));
        if (!q) return _replies.slice(0, 8);
        return _replies
            .filter((r) => {
                const shortcut = _stripDiacritics((r.shortcut || '').replace(/^\//, ''));
                const message = _stripDiacritics(r.message || '');
                const topic = _stripDiacritics(r.topic || '');
                return shortcut.includes(q) || message.includes(q) || topic.includes(q);
            })
            .slice(0, 10);
    }

    function _positionDropdown(dropdown, input) {
        const rect = input.getBoundingClientRect();
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        dropdown.style.top = `${rect.bottom + window.scrollY + 2}px`;
        dropdown.style.minWidth = `${Math.max(280, rect.width)}px`;
    }

    function _renderDropdown(dropdown, items, activeIdx) {
        if (!items.length) {
            dropdown.innerHTML = `<div class="w2-qr-dropdown-empty">Không tìm thấy mẫu phù hợp</div>`;
            return;
        }
        dropdown.innerHTML = items
            .map((r, i) => {
                const sc = r.shortcut ? _escapeHtml(r.shortcut) : '';
                const topic = r.topic
                    ? `<span class="topic" style="background:${_escapeHtml(r.topicColor || '#6b7280')}">${_escapeHtml(r.topic)}</span>`
                    : '';
                const preview = _escapeHtml((r.message || '').slice(0, 80));
                return `<div class="w2-qr-dropdown-item ${i === activeIdx ? 'active' : ''}" data-idx="${i}">
                    ${sc ? `<span class="shortcut">${sc}</span>` : ''}${topic}
                    <span class="preview">${preview}</span>
                </div>`;
            })
            .join('');
    }

    function attachAutocomplete(input, opts = {}) {
        if (!input || _attached.has(input)) return;
        _ensureStyle();
        const dropdown = document.createElement('div');
        dropdown.className = 'w2-qr-dropdown';
        dropdown.style.display = 'none';
        document.body.appendChild(dropdown);

        let candidates = [];
        let activeIdx = 0;
        let match = null;

        function show() {
            dropdown.style.display = '';
            _positionDropdown(dropdown, input);
        }
        function hide() {
            dropdown.style.display = 'none';
        }

        function applySelected(idx) {
            const chosen = candidates[idx];
            if (!chosen || !match) return;
            const before = input.value.slice(0, match.start);
            const after = input.value.slice(match.end);
            input.value = before + (chosen.message || '') + signature() + after;
            // place caret at end of inserted text
            const pos = before.length + (chosen.message || '').length + signature().length;
            input.setSelectionRange(pos, pos);
            hide();
            // notify host so it can update UI / send if shortcut is auto-send
            if (opts.onSelect) opts.onSelect(chosen);
            if (chosen.shortcut && AUTO_SEND_SHORTCUTS.has(chosen.shortcut) && opts.onAutoSend) {
                opts.onAutoSend(chosen);
            }
        }

        const onInput = () => {
            match = _matchShortcut(input);
            if (!match) return hide();
            candidates = _findCandidates(match.query);
            activeIdx = 0;
            _renderDropdown(dropdown, candidates, activeIdx);
            show();
        };

        const onKey = (e) => {
            if (dropdown.style.display === 'none') return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = (activeIdx + 1) % Math.max(candidates.length, 1);
                _renderDropdown(dropdown, candidates, activeIdx);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = (activeIdx - 1 + candidates.length) % Math.max(candidates.length, 1);
                _renderDropdown(dropdown, candidates, activeIdx);
            } else if (e.key === 'Enter' && !e.shiftKey && candidates.length) {
                e.preventDefault();
                applySelected(activeIdx);
            } else if (e.key === 'Escape') {
                hide();
            }
        };

        const onBlur = () => {
            // small delay so click on dropdown still works
            setTimeout(hide, 120);
        };

        dropdown.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.w2-qr-dropdown-item');
            if (item) {
                e.preventDefault(); // keep input focused
                applySelected(Number(item.dataset.idx));
            }
        });

        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKey);
        input.addEventListener('blur', onBlur);
        window.addEventListener('resize', () => _positionDropdown(dropdown, input));

        _attached.set(input, { dropdown, onInput, onKey, onBlur });
    }

    function detachAutocomplete(input) {
        const ctx = _attached.get(input);
        if (!ctx) return;
        input.removeEventListener('input', ctx.onInput);
        input.removeEventListener('keydown', ctx.onKey);
        input.removeEventListener('blur', ctx.onBlur);
        ctx.dropdown.remove();
        _attached.delete(input);
    }

    // -----------------------------------------------------
    // Browse modal (full picker + CRUD)
    // -----------------------------------------------------

    function _renderModalList(container, opts) {
        if (!_replies.length) {
            container.innerHTML = `<div style="color:#94a3b8;font-style:italic;padding:24px;text-align:center;">
                Chưa có mẫu trả lời. Bấm "Thêm mẫu mới" bên dưới.
            </div>`;
            return;
        }
        container.innerHTML = _replies
            .map((r) => {
                const topicPill = r.topic
                    ? `<span class="topic-pill" style="background:${_escapeHtml(r.topicColor || '#6b7280')}">${_escapeHtml(r.topic)}</span>`
                    : '';
                return `<div class="w2-qr-row" data-id="${_escapeHtml(r.id)}">
                    <div class="col-shortcut">${_escapeHtml(r.shortcut || '—')}</div>
                    <div class="col-msg">${topicPill}${_escapeHtml((r.message || '').slice(0, 120))}${(r.message || '').length > 120 ? '…' : ''}</div>
                    <div class="col-act">
                        <button class="w2-qr-icon-btn" data-act="edit" title="Sửa"><i data-lucide="pencil" style="width:13px;height:13px;"></i></button>
                        <button class="w2-qr-icon-btn danger" data-act="del" title="Xoá"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>
                    </div>
                </div>`;
            })
            .join('');
        if (global.lucide?.createIcons) global.lucide.createIcons();

        container.querySelectorAll('.w2-qr-row').forEach((row) => {
            row.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-act]');
                if (btn) {
                    e.stopPropagation();
                    const id = row.dataset.id;
                    if (btn.dataset.act === 'del') {
                        window.Popup.danger('Xoá mẫu này?', { okText: 'Xoá' }).then((ok) => {
                            if (!ok) return;
                            deleteReply(id)
                                .then(() => _renderModalList(container, opts))
                                .catch((err) => _notify('Lỗi xoá: ' + err.message, 'error'));
                        });
                    } else if (btn.dataset.act === 'edit') {
                        _openForm(
                            _replies.find((x) => x.id == id),
                            opts
                        );
                    }
                    return;
                }
                // row click → select
                const chosen = _replies.find((x) => x.id == row.dataset.id);
                if (chosen && opts.onSelect) opts.onSelect(chosen);
                _closeModal();
            });
        });
    }

    let _modalEl = null;

    function _closeModal() {
        if (_modalEl) {
            _modalEl.remove();
            _modalEl = null;
        }
    }

    function openModal(opts = {}) {
        _ensureStyle();
        _closeModal();
        const overlay = document.createElement('div');
        overlay.className = 'w2-qr-modal-overlay';
        overlay.innerHTML = `
            <div class="w2-qr-modal" role="dialog">
                <header>
                    <i data-lucide="zap" style="width:18px;height:18px;color:#0068ff;"></i>
                    <h3>Trả lời nhanh</h3>
                    <button class="w2-qr-icon-btn" data-act="close" title="Đóng"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
                </header>
                <div class="body" id="w2qrList">Đang load…</div>
                <div class="footer">
                    <button class="w2-qr-icon-btn" data-act="add" style="width:auto;padding:0 10px;height:32px;font-size:12px;font-weight:600;color:#0068ff;border-color:#dbeafe;">
                        <i data-lucide="plus" style="width:13px;height:13px;"></i> Thêm mẫu mới
                    </button>
                </div>
            </div>
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) _closeModal();
        });
        overlay.querySelector('[data-act=close]').addEventListener('click', _closeModal);
        overlay
            .querySelector('[data-act=add]')
            .addEventListener('click', () => _openForm(null, opts));
        document.body.appendChild(overlay);
        _modalEl = overlay;
        if (global.lucide?.createIcons) global.lucide.createIcons();

        loadReplies().then(() => {
            const list = overlay.querySelector('#w2qrList');
            if (list) _renderModalList(list, opts);
        });
    }

    function _openForm(reply, opts) {
        _ensureStyle();
        const isEdit = !!reply;
        const overlay = document.createElement('div');
        overlay.className = 'w2-qr-modal-overlay';
        overlay.style.zIndex = '10001';
        overlay.innerHTML = `
            <div class="w2-qr-modal" style="width:min(520px,92vw);">
                <header>
                    <i data-lucide="${isEdit ? 'pencil' : 'plus'}" style="width:18px;height:18px;color:#0068ff;"></i>
                    <h3>${isEdit ? 'Sửa' : 'Thêm'} mẫu trả lời</h3>
                    <button class="w2-qr-icon-btn" data-act="close-form"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
                </header>
                <div class="body" style="display:flex;flex-direction:column;gap:8px;">
                    <label style="font-size:12px;color:#475569;">Shortcut (vd <code>/cam</code>)
                        <input id="qrShortcut" type="text" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;font-family:ui-monospace,monospace;" value="${_escapeHtml(reply?.shortcut || '')}" />
                    </label>
                    <div style="display:flex;gap:8px;">
                        <label style="font-size:12px;color:#475569;flex:1;">Topic
                            <input id="qrTopic" type="text" style="width:100%;padding:7px 9px;border:1px solid #e2e8f0;border-radius:6px;" value="${_escapeHtml(reply?.topic || '')}" />
                        </label>
                        <label style="font-size:12px;color:#475569;width:90px;">Màu
                            <input id="qrColor" type="color" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;" value="${_escapeHtml(reply?.topicColor || '#6b7280')}" />
                        </label>
                    </div>
                    <label style="font-size:12px;color:#475569;">Nội dung
                        <textarea id="qrMessage" rows="5" style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-family:inherit;resize:vertical;min-height:90px;">${_escapeHtml(reply?.message || '')}</textarea>
                    </label>
                </div>
                <div class="footer">
                    <button class="w2-qr-icon-btn" data-act="cancel" style="width:auto;padding:0 12px;height:32px;font-size:12px;">Huỷ</button>
                    <button class="w2-qr-icon-btn" data-act="save" style="width:auto;padding:0 12px;height:32px;font-size:12px;background:#0068ff;color:#fff;border-color:#0068ff;font-weight:600;">
                        ${isEdit ? 'Lưu' : 'Tạo'}
                    </button>
                </div>
            </div>
        `;
        const close = () => overlay.remove();
        overlay.querySelector('[data-act=close-form]').addEventListener('click', close);
        overlay.querySelector('[data-act=cancel]').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.querySelector('[data-act=save]').addEventListener('click', async () => {
            const payload = {
                shortcut: overlay.querySelector('#qrShortcut').value.trim(),
                topic: overlay.querySelector('#qrTopic').value.trim(),
                topicColor: overlay.querySelector('#qrColor').value,
                message: overlay.querySelector('#qrMessage').value.trim(),
            };
            if (!payload.message) {
                _notify('Nội dung không được để trống', 'warning');
                return;
            }
            try {
                if (isEdit) await updateReply(reply.id, payload);
                else await addReply(payload);
                _notify(isEdit ? 'Đã lưu' : 'Đã tạo mẫu mới', 'success');
                close();
                const list = _modalEl?.querySelector('#w2qrList');
                if (list) _renderModalList(list, opts);
            } catch (e) {
                _notify('Lỗi: ' + e.message, 'error');
            }
        });
        document.body.appendChild(overlay);
        if (global.lucide?.createIcons) global.lucide.createIcons();
        overlay.querySelector('#qrShortcut').focus();
    }

    // -----------------------------------------------------
    // Bootstrap: warm cache from localStorage + fetch fresh
    // -----------------------------------------------------

    _loadCache();
    // kick off background fetch (non-blocking)
    loadReplies();

    global.Web2QuickReply = {
        loadReplies,
        getReplies,
        addReply,
        updateReply,
        deleteReply,
        attachAutocomplete,
        detachAutocomplete,
        openModal,
        signature,
        _internal: { WORKER_BASE, LS_CACHE, AUTO_SEND_SHORTCUTS },
    };
})(window);
