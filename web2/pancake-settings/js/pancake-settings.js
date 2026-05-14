// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Pancake settings page
// =====================================================
//
// Manages the localStorage keys that Web2Chat reads:
//   pancake_jwt_token         (string)
//   pancake_jwt_token_expiry  (epoch seconds)
//   pancake_page_access_tokens ({ pageId: { token, ... } })
//
// All operations go through window.Web2Chat — no shared code
// with the tpos-pancake module.

(function () {
    'use strict';

    function $(id) {
        return document.getElementById(id);
    }

    function notify(msg, type) {
        if (window.notificationManager) {
            window.notificationManager[type || 'info'](msg);
        } else {
            console.log('[notify]', type, msg);
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function shortToken(t) {
        if (!t) return '';
        return t.length > 40 ? t.slice(0, 20) + '…' + t.slice(-12) : t;
    }

    function formatExpiry(epochSec) {
        if (!epochSec) return 'không rõ';
        const d = new Date(epochSec * 1000);
        const now = Date.now() / 1000;
        const diff = epochSec - now;
        const days = Math.floor(diff / 86400);
        if (diff < 0) return `Hết hạn (${d.toLocaleString('vi-VN')})`;
        if (days < 30) return `${d.toLocaleString('vi-VN')} (còn ${days} ngày)`;
        return d.toLocaleString('vi-VN') + ' (còn ' + days + ' ngày)';
    }

    let _pagesCache = null;

    function renderJwtInfo() {
        const token = window.Web2Chat.getJwt();
        const badge = $('jwtBadge');
        const info = $('jwtInfo');
        if (!token) {
            badge.textContent = 'Chưa có';
            badge.className = 'badge err';
            info.innerHTML = `<div class="ps-row"><span class="label">Trạng thái</span><span class="val muted">Chưa có token — paste vào ô bên dưới và bấm Lưu.</span></div>`;
            return;
        }
        const decoded = window.Web2Chat.decodeJwt(token);
        const expStr = localStorage.getItem('pancake_jwt_token_expiry');
        const exp = expStr ? parseInt(expStr, 10) : decoded?.exp;
        const valid = !exp || exp > Date.now() / 1000;
        badge.textContent = valid ? 'Hoạt động' : 'Hết hạn';
        badge.className = 'badge ' + (valid ? 'ok' : 'err');
        info.innerHTML = `
            <div class="ps-row"><span class="label">Token (rút gọn)</span><span class="val">${escapeHtml(shortToken(token))}</span></div>
            <div class="ps-row"><span class="label">Account ID</span><span class="val">${escapeHtml(decoded?.sub || decoded?.account_id || decoded?.user_id || '—')}</span></div>
            <div class="ps-row"><span class="label">Issued at</span><span class="val">${decoded?.iat ? new Date(decoded.iat * 1000).toLocaleString('vi-VN') : '—'}</span></div>
            <div class="ps-row"><span class="label">Expiry</span><span class="val">${escapeHtml(formatExpiry(exp))}</span></div>
        `;
    }

    function renderPageList(pages) {
        const list = $('pageList');
        const badge = $('pagesBadge');
        if (!Array.isArray(pages) || pages.length === 0) {
            list.innerHTML = `<div class="ps-loading">Chưa có pages. Test JWT để load.</div>`;
            badge.textContent = '0';
            badge.className = 'badge warn';
            return;
        }
        const stored = window.Web2Chat.getAllPageAccessTokens();
        const withToken = pages.filter((p) => stored[p.id]).length;
        badge.textContent = `${withToken}/${pages.length} có token`;
        badge.className = 'badge ' + (withToken === pages.length ? 'ok' : 'warn');

        list.innerHTML = pages
            .map((p) => {
                const has = !!stored[p.id];
                const img = p.image_url || p.avatar_url || '';
                const platform =
                    p.platform || (p.id?.startsWith('igo_') ? 'instagram' : 'facebook');
                const isIG = platform === 'instagram' || p.id?.startsWith('igo_');
                return `
                <div class="ps-page-item" data-page-id="${escapeHtml(p.id)}">
                    ${img ? `<img src="${escapeHtml(img)}" alt="" />` : `<div style="width:40px;height:40px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:18px;font-weight:600;flex-shrink:0;">${escapeHtml((p.name || '?').charAt(0))}</div>`}
                    <div class="info">
                        <div class="name">${escapeHtml(p.name || '(no name)')}</div>
                        <div class="meta">
                            ${escapeHtml(p.username || p.id)} · ${escapeHtml(platform)}
                            ${has ? ' · Token: ' + escapeHtml(shortToken(stored[p.id].token)) : ''}
                        </div>
                    </div>
                    <span class="status ${has ? 'has' : 'no'}">${has ? '✓ Có token' : 'Chưa có'}</span>
                    <button class="ps-btn ${has ? '' : 'primary'}" data-act="gen" data-page-id="${escapeHtml(p.id)}" ${isIG ? 'disabled title="Instagram chưa hỗ trợ"' : ''}>
                        <i data-lucide="${has ? 'refresh-cw' : 'key'}" style="width:13px;height:13px;"></i>
                        ${has ? 'Refresh' : 'Generate'}
                    </button>
                </div>`;
            })
            .join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // wire generate buttons
        list.querySelectorAll('button[data-act=gen]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const pid = btn.dataset.pageId;
                btn.disabled = true;
                btn.innerHTML =
                    '<i data-lucide="loader" style="width:13px;height:13px;animation:spin 1s linear infinite;"></i> Đang tạo…';
                if (window.lucide?.createIcons) window.lucide.createIcons();
                const r = await window.Web2Chat.generatePageAccessToken(pid);
                if (r.ok) {
                    notify(`Đã tạo page_access_token cho ${pid}`, 'success');
                } else {
                    notify('Lỗi: ' + r.reason, 'error');
                }
                renderPageList(_pagesCache);
            });
        });
    }

    async function loadPages() {
        const list = $('pageList');
        list.innerHTML = `<div class="ps-loading">Đang load danh sách pages…</div>`;
        const r = await window.Web2Chat.listPages();
        if (!r.ok) {
            list.innerHTML = `<div class="ps-loading" style="color:#b91c1c;">Lỗi: ${escapeHtml(r.reason || 'unknown')} — kiểm tra JWT.</div>`;
            return;
        }
        _pagesCache = r.pages;
        renderPageList(r.pages);
    }

    async function saveJwt() {
        const txt = $('jwtInput').value.trim();
        if (!txt) {
            notify('Paste JWT vào ô trước đã', 'warning');
            return;
        }
        // strip "token=" prefix if user pasted full cookie
        const cleaned = txt.replace(/^token=/, '').trim();
        const decoded = window.Web2Chat.decodeJwt(cleaned);
        if (!decoded) {
            notify('Token không hợp lệ (không decode được JWT)', 'error');
            return;
        }
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
            notify('Token đã hết hạn — login lại pancake.vn', 'error');
            return;
        }
        window.Web2Chat.setJwt(cleaned);
        $('jwtInput').value = '';
        notify('Đã lưu JWT token', 'success');
        renderJwtInfo();
        // auto-load pages after save
        loadPages();
    }

    async function testJwt() {
        if (!window.Web2Chat.getJwt()) {
            notify('Chưa có JWT — paste và lưu trước', 'warning');
            return;
        }
        notify('Đang test…', 'info');
        await loadPages();
    }

    function clearJwt() {
        if (!confirm('Xoá JWT? Bạn sẽ phải paste lại từ pancake.vn.')) return;
        window.Web2Chat.setJwt(null);
        notify('Đã xoá JWT', 'success');
        renderJwtInfo();
        $('pageList').innerHTML =
            `<div class="ps-loading">Cần JWT token trước khi load pages.</div>`;
        $('pagesBadge').textContent = '—';
        $('pagesBadge').className = 'badge warn';
    }

    function clearPageTokens() {
        if (!confirm('Xoá tất cả page_access_tokens? JWT giữ nguyên — bạn sẽ phải generate lại.'))
            return;
        localStorage.removeItem('pancake_page_access_tokens');
        notify('Đã xoá page tokens', 'success');
        if (_pagesCache) renderPageList(_pagesCache);
    }

    async function generateAll() {
        if (!Array.isArray(_pagesCache) || _pagesCache.length === 0) {
            notify('Load pages trước đã', 'warning');
            return;
        }
        const eligible = _pagesCache.filter((p) => !(p.id || '').startsWith('igo_'));
        notify(`Đang generate token cho ${eligible.length} pages…`, 'info');
        let ok = 0;
        for (const p of eligible) {
            const r = await window.Web2Chat.generatePageAccessToken(p.id);
            if (r.ok) ok++;
            // small delay so we don't hammer the API
            await new Promise((res) => setTimeout(res, 200));
        }
        notify(`Hoàn tất: ${ok}/${eligible.length} pages có token mới`, ok ? 'success' : 'warning');
        renderPageList(_pagesCache);
    }

    function nuke() {
        if (
            !confirm(
                'XOÁ TOÀN BỘ TOKEN (JWT + page tokens)? Tab1 + native-orders sẽ mất chat cho tới khi cấu hình lại.'
            )
        )
            return;
        window.Web2Chat.clearAllTokens();
        notify('Đã xoá toàn bộ token', 'success');
        renderJwtInfo();
        _pagesCache = null;
        $('pageList').innerHTML =
            `<div class="ps-loading">Cần JWT token trước khi load pages.</div>`;
        $('pagesBadge').textContent = '—';
        $('pagesBadge').className = 'badge warn';
    }

    function init() {
        if (!window.Web2Chat) {
            notify('Web2Chat không load — refresh trang', 'error');
            return;
        }
        $('btnSaveJwt').addEventListener('click', saveJwt);
        $('btnTestJwt').addEventListener('click', testJwt);
        $('btnClearJwt').addEventListener('click', clearJwt);
        $('btnRefreshPages').addEventListener('click', loadPages);
        $('btnGenerateAll').addEventListener('click', generateAll);
        $('btnClearPageTokens').addEventListener('click', clearPageTokens);
        $('btnNuke').addEventListener('click', nuke);

        renderJwtInfo();
        if (window.Web2Chat.getJwt()) {
            // auto-load if JWT already present
            loadPages();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // sidebar mount
            if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
            init();
        });
    } else {
        if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
        init();
    }
})();
