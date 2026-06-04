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

    // =====================================================
    // Token expiry monitor + auto-refresh qua extension
    // =====================================================

    const REASON_MSG = {
        no_extension: 'Chưa phát hiện extension N2Store trong trình duyệt này',
        timeout: 'Extension không phản hồi (thử lại hoặc mở pancake.vn)',
        not_logged_in: 'Chưa đăng nhập pancake.vn trong trình duyệt này',
        apply_decode: 'Token lấy về không hợp lệ',
        apply_expired: 'Token trên pancake.vn cũng đã hết hạn — đăng nhập lại pancake.vn',
    };

    function _setBtnLoading(btn, label) {
        if (!btn) return;
        btn.dataset._html = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> ${escapeHtml(label)}`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }
    function _restoreBtn(btn) {
        if (!btn || !btn.dataset._html) return;
        btn.disabled = false;
        btn.innerHTML = btn.dataset._html;
        delete btn.dataset._html;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderExtStatus() {
        const el = $('extStatus');
        if (!el || !window.Web2PancakeToken) return;
        const on = window.Web2PancakeToken.isExtensionPresent();
        el.innerHTML = on
            ? `<span class="ext-pill on"><i data-lucide="plug" style="width:12px;height:12px;"></i> Extension đã kết nối — lấy token tự động được</span>`
            : `<span class="ext-pill off"><i data-lucide="plug-zap" style="width:12px;height:12px;"></i> Chưa thấy extension — chỉ lấy token thủ công</span>`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderBanner() {
        const el = $('expiryBanner');
        if (!el || !window.Web2PancakeToken) return;
        const st = window.Web2PancakeToken.getStatus();
        if (st.state === 'ok' || st.state === 'none') {
            // 'none' đã được modal xử lý; banner chỉ cho soon/critical/expired
            el.style.display = 'none';
            return;
        }
        let cls, msg;
        if (st.state === 'soon') {
            cls = 'soon';
            const days = Math.max(0, Math.floor(st.daysLeft));
            msg = `Token Pancake còn <strong>${days} ngày</strong> là hết hạn. Nên gia hạn sớm để không gián đoạn gửi tin/chốt đơn.`;
        } else if (st.state === 'critical') {
            cls = 'critical';
            const hrs = Math.max(0, Math.floor(st.secondsLeft / 3600));
            msg = `⚠ Token Pancake sắp hết hạn (còn ~${hrs} giờ). Gia hạn ngay.`;
        } else {
            cls = 'critical';
            msg = `⚠ Token Pancake <strong>đã hết hạn</strong>. Gửi tin/chốt đơn sẽ lỗi cho tới khi gia hạn.`;
        }
        el.className = 'ps-banner ' + cls;
        el.style.display = 'flex';
        el.innerHTML = `
            <i data-lucide="alert-triangle" style="width:18px;height:18px;flex-shrink:0;"></i>
            <span class="ps-banner-msg">${msg}</span>
            <button class="ps-btn" id="bannerRenew"><i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Gia hạn ngay</button>`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        const b = $('bannerRenew');
        if (b)
            b.addEventListener('click', () => openExpiryModal(window.Web2PancakeToken.getStatus()));
    }

    // ---- Auto-fetch dùng chung cho nút card + nút modal ----
    async function doAutoFetch(btn) {
        const PK = window.Web2PancakeToken;
        if (!PK) {
            notify('Module token chưa load — refresh trang', 'error');
            return { ok: false, reason: 'no_module' };
        }
        if (!PK.isExtensionPresent()) {
            notify(REASON_MSG.no_extension, 'warning');
            return { ok: false, reason: 'no_extension' };
        }
        _setBtnLoading(btn, 'Đang lấy…');
        const res = await PK.ensureFresh({ force: true });
        _restoreBtn(btn);
        if (res.refreshed) {
            notify('Đã lấy token Pancake mới', 'success');
            renderJwtInfo();
            renderBanner();
            loadPages();
            return res;
        }
        notify('Không lấy được token: ' + (REASON_MSG[res.reason] || res.reason || 'lỗi'), 'error');
        return res;
    }

    // ---- Modal ----
    function openExpiryModal(status, autoFailReason) {
        const overlay = $('expiryModal');
        if (!overlay) return;
        const st = status || window.Web2PancakeToken.getStatus();
        const icon = $('expiryModalIcon');
        const title = $('expiryModalTitle');
        const desc = $('expiryModalDesc');

        let iconCls = '',
            iconName = 'key-round',
            titleTxt = 'Token Pancake sắp hết hạn',
            descTxt = '';
        if (st.state === 'none') {
            iconCls = 'none';
            iconName = 'key-round';
            titleTxt = 'Chưa cấu hình token Pancake';
            descTxt =
                'Web 2.0 cần token Pancake để gửi tin nhắn / comment. Lấy token ngay bên dưới.';
        } else if (st.state === 'expired') {
            iconCls = 'critical';
            iconName = 'alert-octagon';
            titleTxt = 'Token Pancake đã hết hạn';
            descTxt = 'Token đã hết hạn — gửi tin và chốt đơn sẽ lỗi. Lấy token mới để tiếp tục.';
        } else {
            // critical
            iconCls = 'critical';
            iconName = 'alert-triangle';
            const hrs = Math.max(0, Math.floor(st.secondsLeft / 3600));
            titleTxt = 'Token Pancake sắp hết hạn';
            descTxt = `Chỉ còn ~${hrs} giờ nữa là hết hạn. Gia hạn ngay để không gián đoạn.`;
        }
        icon.className = 'ps-modal-icon ' + iconCls;
        icon.innerHTML = `<i data-lucide="${iconName}" style="width:26px;height:26px;"></i>`;
        title.textContent = titleTxt;
        desc.textContent = descTxt;

        // Nếu auto đã fail (silent) → mở sẵn phần thủ công + nói lý do
        const manual = $('expiryManual');
        if (autoFailReason) {
            if (manual) manual.open = true;
            const hint = $('expiryAutoHint');
            if (hint)
                hint.innerHTML =
                    'Tự động không lấy được: <strong>' +
                    escapeHtml(REASON_MSG[autoFailReason] || autoFailReason) +
                    '</strong>. Thử lại hoặc dùng cách thủ công.';
        } else if (manual) {
            manual.open = false;
        }

        overlay.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }
    function closeExpiryModal() {
        const overlay = $('expiryModal');
        if (overlay) overlay.hidden = true;
    }

    function wireModal() {
        const closeBtn = $('expiryModalClose');
        const dismiss = $('expiryDismiss');
        const autoBtn = $('expiryAutoBtn');
        const copyBtn = $('btnCopySnippet');
        const pasteSave = $('expiryPasteSave');
        const overlay = $('expiryModal');

        if (closeBtn) closeBtn.addEventListener('click', closeExpiryModal);
        if (dismiss) dismiss.addEventListener('click', closeExpiryModal);
        if (overlay)
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeExpiryModal();
            });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && !overlay.hidden) closeExpiryModal();
        });

        if (autoBtn)
            autoBtn.addEventListener('click', async () => {
                const res = await doAutoFetch(autoBtn);
                if (res.refreshed) {
                    closeExpiryModal();
                } else {
                    // mở phần thủ công để user tự xử lý
                    const manual = $('expiryManual');
                    if (manual) manual.open = true;
                }
            });

        if (copyBtn)
            copyBtn.addEventListener('click', async () => {
                const snippet = $('consoleSnippet')?.textContent || '';
                try {
                    await navigator.clipboard.writeText(snippet);
                    notify('Đã copy đoạn console', 'success');
                } catch {
                    notify('Không copy được — bôi đen copy tay', 'warning');
                }
            });

        if (pasteSave)
            pasteSave.addEventListener('click', () => {
                const txt = $('expiryPasteInput')?.value || '';
                const r = window.Web2PancakeToken.applyToken(txt);
                if (!r.ok) {
                    notify(
                        'Token không hợp lệ: ' + (REASON_MSG['apply_' + r.reason] || r.reason),
                        'error'
                    );
                    return;
                }
                notify('Đã lưu token Pancake', 'success');
                $('expiryPasteInput').value = '';
                closeExpiryModal();
                renderJwtInfo();
                renderBanner();
                loadPages();
            });
    }

    // Chạy khi load: thử auto-refresh ngầm nếu token critical/expired/none.
    async function runMonitor() {
        const PK = window.Web2PancakeToken;
        if (!PK) return;
        renderExtStatus();
        const st = PK.getStatus();
        const needs = st.state === 'none' || st.state === 'expired' || st.state === 'critical';
        if (!needs) {
            renderBanner();
            return;
        }
        // Thử lấy token mới ngầm (không UI) nếu có extension
        if (PK.isExtensionPresent()) {
            const res = await PK.ensureFresh({});
            if (res.refreshed) {
                notify('Đã tự động cập nhật token Pancake mới', 'success');
                renderJwtInfo();
                renderBanner();
                loadPages();
                return;
            }
            // ngầm fail → hiện modal kèm lý do
            openExpiryModal(PK.getStatus(), res.reason);
            renderBanner();
            return;
        }
        // không có extension → hiện modal hướng dẫn thủ công
        openExpiryModal(st);
        renderBanner();
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

        const autoBtn = $('btnAutoJwt');
        if (autoBtn) autoBtn.addEventListener('click', () => doAutoFetch(autoBtn));

        wireModal();

        renderJwtInfo();
        renderExtStatus();
        if (window.Web2Chat.getJwt()) {
            // auto-load if JWT already present
            loadPages();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // Theo dõi expiry + auto-refresh (chạy sau cùng, không chặn render)
        setTimeout(runMonitor, 350);
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
