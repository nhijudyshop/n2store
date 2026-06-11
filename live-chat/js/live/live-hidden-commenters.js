// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — ẩn comment theo NGƯỜI (commenter) + danh sách quản lý.
/**
 * LiveHiddenCommenters — ẩn TẤT CẢ comment của 1 người trong cột Live + quản lý.
 *
 * User 2026-06-11: "cho chức năng chọn ẩn comment của người đó và danh sách
 * quản lý, mặc định ẩn 'NhiJudy Store', 'NhiJudy House'" (comment do chính
 * page tự reply — không phải khách).
 *
 * - Lưu server-side (sync mọi máy): web2-generic record
 *   `/api/web2/live-hidden-commenters` code `global`, data.commenters =
 *   [{fbId, name, hiddenAt, by}]. Ghi kèm `history: []` mỗi lần save để route
 *   generic không phình mảng history (pattern capture-lock).
 * - Realtime: route generic tự _notify → SSE `web2:live-hidden-commenters`
 *   → máy khác reload list + re-render.
 * - Filter áp ở LiveCommentList._visibleComments() (choke point mọi render
 *   path) → hide/unhide là re-render tức thì, KHÔNG refetch DB, comment vẫn
 *   nguyên trong state + DB (bỏ ẩn là hiện lại đủ).
 * - UI-first (rule 8): apply local + render NGAY, save server background,
 *   rollback nếu lỗi.
 */
(function (global) {
    'use strict';
    if (global.LiveHiddenCommenters) return;

    // Mặc định ẩn 2 page của shop (comment page tự reply). User bỏ ẩn được —
    // seed CHỈ khi record server chưa tồn tại (lần đầu).
    const DEFAULTS = [
        { fbId: '117267091364524', name: 'NhiJudy House' },
        { fbId: '270136663390370', name: 'NhiJudy Store' },
    ];

    let _map = new Map(); // fbId -> {fbId, name, hiddenAt, by}
    let _nameSet = new Set(); // normalized names (fallback khi fb_id khác/thiếu)
    let _loaded = false;
    let _sseTimer = null;

    function _apiBase() {
        return (
            (global.LiveState?.workerUrl ||
                global.API_CONFIG?.WORKER_URL ||
                'https://chatomni-proxy.nhijudyshop.workers.dev') +
            '/api/web2/live-hidden-commenters'
        );
    }
    function _normName(s) {
        return String(s || '')
            .replace(/\s+/g, '')
            .toLowerCase();
    }
    function _rebuildNameSet() {
        _nameSet = new Set([..._map.values()].map((c) => _normName(c.name)).filter(Boolean));
    }
    function _toast(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else console.log('[hidden-commenters]', msg);
    }
    function _rerender() {
        global.LiveCommentList?.renderComments?.();
        _updateBtnCount();
    }

    // ---------------- server load/save ----------------

    async function _load(rerenderAfter) {
        try {
            const r = await fetch(`${_apiBase()}/get/global`, {
                signal: AbortSignal.timeout(10000),
            });
            if (r.status === 404) {
                // Lần đầu: seed defaults + tạo record (best-effort).
                _map = new Map(
                    DEFAULTS.map((c) => [c.fbId, { ...c, hiddenAt: Date.now(), by: 'default' }])
                );
                _loaded = true;
                _rebuildNameSet();
                _save('create').catch(() => {});
            } else {
                const j = await r.json();
                const arr = j?.record?.data?.commenters;
                if (Array.isArray(arr)) {
                    _map = new Map(arr.map((c) => [String(c.fbId), c]));
                    _loaded = true;
                    _rebuildNameSet();
                }
            }
        } catch (e) {
            // Offline/lỗi mạng: nếu chưa từng load → fallback defaults (đảm bảo
            // 2 page mặc định vẫn ẩn dù server không tới được).
            if (!_loaded) {
                _map = new Map(
                    DEFAULTS.map((c) => [c.fbId, { ...c, hiddenAt: Date.now(), by: 'default' }])
                );
                _rebuildNameSet();
            }
            console.warn('[hidden-commenters] load fail:', e.message);
        }
        if (rerenderAfter) _rerender();
        else _updateBtnCount();
    }

    async function _save(mode) {
        const data = {
            commenters: [..._map.values()],
            history: [], // chống route generic append history phình record
        };
        const user = global.Web2UserInfo?.get?.() || {};
        const body = JSON.stringify({
            name: 'Live hidden commenters',
            code: 'global',
            data,
            userName: user.name || null,
            sourcePage: 'live-chat',
        });
        const headers = { 'Content-Type': 'application/json' };
        if (mode !== 'create') {
            const r = await fetch(`${_apiBase()}/update/global`, {
                method: 'PATCH',
                headers,
                body,
                signal: AbortSignal.timeout(10000),
            });
            if (r.status !== 404) {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return;
            }
            // record chưa có → rơi xuống create
        }
        const r2 = await fetch(`${_apiBase()}/create`, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(10000),
        });
        // 409 = máy khác vừa create song song → PATCH lại là xong.
        if (r2.status === 409) {
            const r3 = await fetch(`${_apiBase()}/update/global`, {
                method: 'PATCH',
                headers,
                body,
                signal: AbortSignal.timeout(10000),
            });
            if (!r3.ok) throw new Error(`HTTP ${r3.status}`);
        } else if (!r2.ok) {
            throw new Error(`HTTP ${r2.status}`);
        }
    }

    // ---------------- public API ----------------

    /** Comment này có thuộc người đang bị ẩn không (check fb_id, fallback tên). */
    function isHidden(comment) {
        if (!comment) return false;
        const fbId = String(comment.from?.id || comment.fb_id || '');
        if (fbId && _map.has(fbId)) return true;
        if (!_nameSet.size) return false;
        const n = _normName(comment.from?.name || comment.customer_name);
        return !!n && _nameSet.has(n);
    }

    /** Ẩn mọi comment của 1 người. UI-first: apply + render ngay, save nền, rollback nếu lỗi. */
    function hide(fbId, name) {
        fbId = String(fbId || '').trim();
        if (!fbId) return;
        if (_map.has(fbId)) {
            _toast(`"${name || fbId}" đã trong danh sách ẩn`, 'info');
            return;
        }
        const entry = {
            fbId,
            name: name || '',
            hiddenAt: Date.now(),
            by: global.Web2UserInfo?.get?.()?.name || 'user',
        };
        const run = () => {
            _map.set(fbId, entry);
            _rebuildNameSet();
            _rerender();
            _renderManagerBody(); // modal đang mở thì cập nhật
            return _save();
        };
        const rollback = () => {
            _map.delete(fbId);
            _rebuildNameSet();
            _rerender();
            _renderManagerBody();
        };
        Promise.resolve()
            .then(run)
            .then(() => _toast(`🙈 Đã ẩn comment của "${name || fbId}"`, 'success'))
            .catch((e) => {
                rollback();
                _toast(`Lỗi lưu danh sách ẩn: ${e.message}`, 'error');
            });
    }

    /** Bỏ ẩn 1 người. UI-first + rollback. */
    function unhide(fbId) {
        fbId = String(fbId || '');
        const prev = _map.get(fbId);
        if (!prev) return;
        _map.delete(fbId);
        _rebuildNameSet();
        _rerender();
        _renderManagerBody();
        _save()
            .then(() => _toast(`👁 Đã hiện lại comment của "${prev.name || fbId}"`, 'success'))
            .catch((e) => {
                _map.set(fbId, prev);
                _rebuildNameSet();
                _rerender();
                _renderManagerBody();
                _toast(`Lỗi lưu danh sách ẩn: ${e.message}`, 'error');
            });
    }

    function list() {
        return [..._map.values()];
    }

    // ---------------- UI: nút topbar + modal quản lý ----------------

    function _updateBtnCount() {
        const btn = document.getElementById('lhc-btn');
        if (btn) btn.innerHTML = `🙈 Ẩn (${_map.size})`;
    }

    function _injectStyles() {
        if (document.getElementById('lhc-styles')) return;
        const st = document.createElement('style');
        st.id = 'lhc-styles';
        st.textContent = `
            #lhc-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;font-size:12px;font-weight:600;color:#475569;cursor:pointer;white-space:nowrap}
            #lhc-btn:hover{background:#f8fafc;border-color:#cbd5e1}
            .lhc-modal{position:fixed;inset:0;z-index:99990;display:none}
            .lhc-modal.open{display:block}
            .lhc-back{position:absolute;inset:0;background:rgba(15,23,42,.45)}
            .lhc-panel{position:absolute;top:8vh;left:50%;transform:translateX(-50%);width:min(440px,94vw);max-height:80vh;display:flex;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.3);overflow:hidden;contain:layout style paint}
            .lhc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e8f0}
            .lhc-head h3{margin:0;font-size:15px;color:#0f172a}
            .lhc-x{border:none;background:none;font-size:20px;color:#64748b;cursor:pointer;line-height:1}
            .lhc-body{padding:10px 18px 16px;overflow-y:auto;overscroll-behavior:contain}
            .lhc-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9}
            .lhc-row:last-child{border-bottom:none}
            .lhc-name{flex:1;min-width:0;font-size:13px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .lhc-meta{font-size:11px;color:#94a3b8;font-weight:400}
            .lhc-unhide{flex-shrink:0;padding:4px 10px;border:1px solid #bbf7d0;border-radius:8px;background:#f0fdf4;color:#166534;font-size:12px;font-weight:600;cursor:pointer}
            .lhc-unhide:hover{background:#dcfce7}
            .lhc-empty{padding:18px 0;text-align:center;font-size:13px;color:#94a3b8}
            .lhc-hint{margin:0 0 8px;font-size:12px;color:#64748b;line-height:1.5}
        `;
        document.head.appendChild(st);
    }

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _renderManagerBody() {
        const body = document.getElementById('lhc-body');
        if (!body) return;
        const rows = [..._map.values()].sort((a, b) => (b.hiddenAt || 0) - (a.hiddenAt || 0));
        body.innerHTML = `
            <p class="lhc-hint">Comment của những người dưới đây bị ẨN khỏi cột Live (mọi máy).
            Comment vẫn lưu đủ trong hệ thống — "Bỏ ẩn" là hiện lại ngay. Ẩn thêm người:
            bấm nút 🙈 trên dòng comment của người đó.</p>
            ${
                rows.length === 0
                    ? '<div class="lhc-empty">Chưa ẩn ai</div>'
                    : rows
                          .map(
                              (c) => `
                <div class="lhc-row">
                    <div class="lhc-name">${_esc(c.name || '(không tên)')}
                        <div class="lhc-meta">fb_id: ${_esc(c.fbId)}${c.by ? ' · ẩn bởi ' + _esc(c.by) : ''}</div>
                    </div>
                    <button class="lhc-unhide" data-fbid="${_esc(c.fbId)}">👁 Bỏ ẩn</button>
                </div>`
                          )
                          .join('')
            }`;
    }

    function openManager() {
        _injectStyles();
        let modal = document.getElementById('lhc-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'lhc-modal';
            modal.className = 'lhc-modal';
            modal.innerHTML = `
                <div class="lhc-back"></div>
                <div class="lhc-panel">
                    <div class="lhc-head"><h3>🙈 Người bị ẩn comment</h3><button class="lhc-x">×</button></div>
                    <div class="lhc-body" id="lhc-body"></div>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelector('.lhc-back').onclick = () => modal.classList.remove('open');
            modal.querySelector('.lhc-x').onclick = () => modal.classList.remove('open');
            modal.addEventListener('click', (e) => {
                const btn = e.target.closest('.lhc-unhide');
                if (btn) unhide(btn.dataset.fbid);
            });
        }
        _renderManagerBody();
        modal.classList.add('open');
    }

    function _mountBtn() {
        _injectStyles();
        if (document.getElementById('lhc-btn')) return;
        const slot = document.getElementById('liveTopbarActions');
        if (!slot) return; // trang không có topbar Live (vd chat.html) → bỏ qua
        const btn = document.createElement('button');
        btn.id = 'lhc-btn';
        btn.title = 'Danh sách người bị ẩn comment (đồng bộ mọi máy)';
        btn.innerHTML = `🙈 Ẩn (${_map.size})`;
        btn.onclick = openManager;
        slot.appendChild(btn);
    }

    // ---------------- boot ----------------

    function _boot() {
        _mountBtn();
        _load(true);
        // SSE: máy khác sửa danh sách → reload + re-render (debounce gom burst).
        const trySub = () => {
            if (!global.Web2SSE?.subscribe) return false;
            global.Web2SSE.subscribe('web2:live-hidden-commenters', () => {
                clearTimeout(_sseTimer);
                _sseTimer = setTimeout(() => _load(true), 600);
            });
            return true;
        };
        if (!trySub()) setTimeout(trySub, 3000);
    }

    global.LiveHiddenCommenters = { isHidden, hide, unhide, list, openManager };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_boot, 1200));
    } else {
        setTimeout(_boot, 1200);
    }
})(typeof window !== 'undefined' ? window : globalThis);
