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
// with the web2-pancake module.

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
    let _accountsCache = [];
    let _refreshStatus = {}; // accountId → { has_creds, auto_refresh, login_identity, last_refresh_status }
    let _credsKeyConfigured = false;
    let _refreshStatusLoaded = false; // true once getRefreshStatus() đã resolve (tránh race "Gia hạn")
    let _refreshStatusPromise = null; // promise đang load để await khi cần

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
                const platClass = isIG ? 'instagram' : 'facebook';
                return `
                <div class="ps-page-item" data-page-id="${escapeHtml(p.id)}">
                    ${img ? `<img src="${escapeHtml(img)}" alt="" />` : `<div class="pg-avatar-fallback">${escapeHtml((p.name || '?').charAt(0).toUpperCase())}</div>`}
                    <div class="info">
                        <div class="name">${escapeHtml(p.name || '(no name)')}</div>
                        <div class="meta">
                            <span class="mid">${escapeHtml(p.username || p.id)}</span>
                            <span class="plat-chip ${platClass}">${escapeHtml(platform)}</span>
                            ${has ? `<span class="tok-chip">${escapeHtml(shortToken(stored[p.id].token))}</span>` : ''}
                        </div>
                    </div>
                    <span class="status ${has ? 'has' : 'no'}">${has ? 'Có token' : 'Chưa có'}</span>
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
        // Lưu account vào DB (đồng bộ mọi máy) + đặt active trên máy này
        await persistActiveToDb(cleaned, decoded);
        // auto-load pages after save
        loadPages();
    }

    /**
     * Lưu token đang active vào DB pancake_accounts (account_id = uid) + set
     * active local + refresh danh sách accounts. Không chặn flow nếu lỗi mạng.
     */
    async function persistActiveToDb(token, decoded) {
        if (!window.Web2PancakeAccounts) return;
        try {
            const r = await window.Web2PancakeAccounts.addFromToken(token);
            if (r.ok) {
                window.Web2PancakeAccounts.setActiveLocal({
                    account_id: r.accountId,
                    token,
                    exp: (decoded || r.decoded)?.exp,
                });
                await loadAccounts();
            }
        } catch {
            /* DB offline — token vẫn lưu localStorage, không chặn */
        }
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
            await persistActiveToDb(window.Web2Chat.getJwt(), res.decoded);
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
            pasteSave.addEventListener('click', async () => {
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
                await persistActiveToDb(window.Web2Chat.getJwt(), r.decoded);
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

    // =====================================================
    // Accounts (DB-backed multi-account management)
    // =====================================================

    function _expChip(exp) {
        const PA = window.Web2PancakeAccounts;
        if (!exp) return '<span class="exp-chip bad">không rõ HSD</span>';
        if (PA.isExpired(exp)) return '<span class="exp-chip bad">Hết hạn</span>';
        const days = Math.max(0, Math.floor((Number(exp) - Date.now() / 1000) / 86400));
        const cls = days <= 3 ? 'bad' : 'good';
        return `<span class="exp-chip ${cls}">còn ${days} ngày</span>`;
    }

    function renderAccountList(accounts) {
        const list = $('accountList');
        const badge = $('accountsBadge');
        const PA = window.Web2PancakeAccounts;
        const activeId = PA?.getActiveId();
        if (!Array.isArray(accounts) || accounts.length === 0) {
            list.innerHTML = `<div class="ps-loading">Chưa có tài khoản nào. Bấm "Thêm tài khoản" để lưu account đầu tiên.</div>`;
            badge.textContent = '0 tài khoản';
            badge.className = 'badge warn';
            return;
        }
        badge.textContent = `${accounts.length} tài khoản`;
        badge.className = 'badge ok';
        list.innerHTML = accounts
            .map((a) => {
                const id = a.account_id;
                const isActive = id === activeId;
                const name = a.name || a.fb_name || a.uid || id;
                const disabled = a.is_active === false;
                const st = _refreshStatus[id] || {};
                const hasCreds = !!st.has_creds;
                const autoOn = hasCreds && st.auto_refresh;
                const lastFail =
                    st.last_refresh_status && /^fail/.test(st.last_refresh_status)
                        ? `<span class="exp-chip bad" title="${escapeHtml(st.last_refresh_status)}">gia hạn lỗi</span>`
                        : '';
                return `
                <div class="ps-account-item ${isActive ? 'active' : ''}" data-acc-id="${escapeHtml(id)}">
                    <div class="acc-avatar">${escapeHtml((name || '?').charAt(0).toUpperCase())}</div>
                    <div class="info">
                        <div class="name">
                            ${escapeHtml(name)}
                            ${isActive ? '<span class="acc-active-pill">Đang dùng</span>' : ''}
                            ${autoOn ? '<span class="auto-pill" title="Tự động gia hạn khi sắp hết hạn">🔄 Tự động</span>' : ''}
                        </div>
                        <div class="meta">
                            <span class="mid">${escapeHtml(id)}</span>
                            ${a.fb_id ? `<span class="tok-chip">fb ${escapeHtml(a.fb_id)}</span>` : ''}
                            ${_expChip(a.token_exp)}
                            ${disabled ? '<span class="exp-chip bad">tắt sync</span>' : ''}
                            ${lastFail}
                        </div>
                    </div>
                    <div class="acc-actions">
                        <button class="ps-btn" data-act="renew" data-acc-id="${escapeHtml(id)}" title="${hasCreds ? 'Gia hạn ngay bằng mật khẩu đã lưu' : 'Cần lưu mật khẩu trước'}">
                            <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Gia hạn
                        </button>
                        <button class="ps-btn" data-act="creds" data-acc-id="${escapeHtml(id)}" title="Lưu mật khẩu / bật tự động gia hạn">
                            <i data-lucide="${hasCreds ? 'lock' : 'lock-open'}" style="width:13px;height:13px;"></i>
                        </button>
                        ${
                            isActive
                                ? ''
                                : `<button class="ps-btn primary" data-act="use" data-acc-id="${escapeHtml(id)}"><i data-lucide="check-circle" style="width:13px;height:13px;"></i> Dùng</button>`
                        }
                        <button class="ps-btn danger" data-act="del" data-acc-id="${escapeHtml(id)}" title="Xoá khỏi DB">
                            <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                        </button>
                    </div>
                </div>`;
            })
            .join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();

        list.querySelectorAll('button[data-act]').forEach((btn) => {
            const id = btn.dataset.accId;
            const act = btn.dataset.act;
            btn.addEventListener('click', () => {
                if (act === 'use') useAccount(id);
                else if (act === 'del') deleteAccount(id);
                else if (act === 'renew') renewAccount(id, btn);
                else if (act === 'creds') openCredsModal(id);
            });
        });
    }

    async function loadAccounts() {
        const list = $('accountList');
        const PA = window.Web2PancakeAccounts;
        if (!PA) {
            if (list) list.innerHTML = `<div class="ps-loading">Module accounts chưa load.</div>`;
            return;
        }
        if (list) list.innerHTML = `<div class="ps-loading">Đang tải danh sách tài khoản…</div>`;
        const r = await PA.list();
        if (!r.ok) {
            if (list)
                list.innerHTML = `<div class="ps-loading" style="color:#b91c1c;">Lỗi tải tài khoản: ${escapeHtml(r.reason || 'unknown')}</div>`;
            $('accountsBadge').textContent = 'lỗi';
            $('accountsBadge').className = 'badge err';
            return;
        }
        _accountsCache = r.accounts;
        renderAccountList(r.accounts);
        // Lấy trạng thái auto-refresh (creds/auto) rồi render lại — không chặn.
        // Lưu promise để renewAccount có thể await tránh race (bấm "Gia hạn" khi status chưa load).
        _refreshStatusLoaded = false;
        _refreshStatusPromise = PA.getRefreshStatus()
            .then((s) => {
                if (s.ok) {
                    _refreshStatus = s.map;
                    _credsKeyConfigured = s.credsKeyConfigured;
                    renderAccountList(_accountsCache);
                }
                _refreshStatusLoaded = true;
            })
            .catch(() => {
                _refreshStatusLoaded = true;
            });
    }

    // ---- Gia hạn ngay 1 account (dùng creds đã lưu) ----
    async function renewAccount(id, btn) {
        const PA = window.Web2PancakeAccounts;
        // Race guard: nút "Gia hạn" render trước khi getRefreshStatus() resolve →
        // _refreshStatus[id].has_creds chưa biết. Await status (có loading) trước khi quyết định.
        if (!_refreshStatusLoaded && _refreshStatusPromise) {
            _setBtnLoading(btn, 'Đang kiểm tra…');
            try {
                await _refreshStatusPromise;
            } catch {
                /* status load lỗi — fallback xuống nhánh openCredsModal */
            }
            _restoreBtn(btn);
        }
        const st = _refreshStatus[id] || {};
        if (!st.has_creds) {
            // chưa lưu mật khẩu → mở modal nhập
            openCredsModal(id);
            return;
        }
        _setBtnLoading(btn, 'Đang gia hạn…');
        const r = await PA.refreshNow(id, {});
        _restoreBtn(btn);
        if (r.ok) {
            notify(
                `Đã gia hạn ${r.name || id} → ${r.exp ? new Date(r.exp * 1000).toLocaleDateString('vi-VN') : ''}`,
                'success'
            );
            await loadAccounts();
            renderJwtInfo();
            renderBanner();
        } else {
            notify('Gia hạn lỗi: ' + (r.reason || 'unknown'), 'error');
        }
    }

    // ---- Creds modal ----
    let _credsAccountId = null;
    function openCredsModal(id) {
        _credsAccountId = id;
        const acc = _accountsCache.find((a) => a.account_id === id);
        const st = _refreshStatus[id] || {};
        $('credsModalTitle').textContent = `Tự động gia hạn — ${acc?.name || id}`;
        // Server cố ý KHÔNG trả login_identity → đã lưu thì chỉ hiện placeholder
        const idInput = $('credsIdentity');
        idInput.value = '';
        idInput.placeholder = st.has_creds
            ? 'Đã lưu — nhập lại nếu muốn đổi'
            : 'Email / SĐT / Tên người dùng Pancake';
        $('credsPassword').value = '';
        $('credsAuto').checked = st.auto_refresh !== false;
        $('credsKeyWarn').style.display = _credsKeyConfigured ? 'none' : 'block';
        $('credsDelete').style.display = st.has_creds ? '' : 'none';
        $('credsModal').hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => $('credsIdentity').focus(), 50);
    }
    function closeCredsModal() {
        $('credsModal').hidden = true;
        _credsAccountId = null;
    }

    async function credsSave(alsoRefresh) {
        const PA = window.Web2PancakeAccounts;
        const id = _credsAccountId;
        const identity = $('credsIdentity').value.trim();
        const password = $('credsPassword').value;
        const auto = $('credsAuto').checked;
        if (!identity || !password) {
            notify('Nhập đủ tài khoản + mật khẩu', 'warning');
            return;
        }
        const btn = alsoRefresh ? $('credsSaveRefresh') : $('credsSaveOnly');
        _setBtnLoading(btn, alsoRefresh ? 'Đang gia hạn…' : 'Đang lưu…');
        if (alsoRefresh) {
            // POST refresh kèm save (login luôn + lưu creds)
            const r = await PA.refreshNow(id, {
                identity,
                password,
                save: true,
                auto_refresh: auto,
            });
            _restoreBtn(btn);
            if (r.ok) {
                notify(`Đã lưu + gia hạn ${r.name || id}`, 'success');
                closeCredsModal();
                await loadAccounts();
                renderJwtInfo();
                renderBanner();
            } else {
                notify('Lỗi: ' + (r.reason || 'unknown') + ' — mật khẩu đúng chưa?', 'error');
            }
        } else {
            const r = await PA.saveCreds(id, identity, password, auto);
            _restoreBtn(btn);
            if (r.ok) {
                notify('Đã lưu mật khẩu (mã hoá)', 'success');
                closeCredsModal();
                await loadAccounts();
            } else {
                notify('Lưu lỗi: ' + (r.reason || 'unknown'), 'error');
            }
        }
    }

    async function credsDelete() {
        const PA = window.Web2PancakeAccounts;
        const id = _credsAccountId;
        if (!confirm('Xoá mật khẩu đã lưu? Sẽ tắt tự động gia hạn cho account này.')) return;
        const r = await PA.deleteCreds(id);
        if (r.ok) {
            notify('Đã xoá mật khẩu', 'success');
            closeCredsModal();
            await loadAccounts();
        } else {
            notify('Xoá lỗi: ' + (r.reason || 'unknown'), 'error');
        }
    }

    function wireCredsModal() {
        $('credsModalClose')?.addEventListener('click', closeCredsModal);
        $('credsSaveRefresh')?.addEventListener('click', () => credsSave(true));
        $('credsSaveOnly')?.addEventListener('click', () => credsSave(false));
        $('credsDelete')?.addEventListener('click', credsDelete);
        const overlay = $('credsModal');
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) closeCredsModal();
        });
    }

    function useAccount(id) {
        const acc = _accountsCache.find((a) => a.account_id === id);
        if (!acc) return;
        if (window.Web2PancakeAccounts.isExpired(acc.token_exp)) {
            if (
                !confirm(
                    'Token của tài khoản này đã hết hạn — chọn dùng vẫn sẽ lỗi khi gửi tin. Tiếp tục?'
                )
            )
                return;
        }
        const r = window.Web2PancakeAccounts.setActiveLocal(acc);
        if (!r.ok) {
            notify('Không đặt được active: ' + r.reason, 'error');
            return;
        }
        notify(`Đang dùng tài khoản: ${acc.name || acc.account_id}`, 'success');
        renderAccountList(_accountsCache);
        renderJwtInfo();
        renderBanner();
        loadPages();
    }

    function deleteAccount(id) {
        const acc = _accountsCache.find((a) => a.account_id === id);
        const label = acc?.name || acc?.fb_name || id;
        if (!confirm(`Xoá tài khoản "${label}" khỏi DB? Mọi máy sẽ không còn account này.`)) return;
        const snapshot = _accountsCache;
        const apply = () => {
            _accountsCache = snapshot.filter((a) => a.account_id !== id);
            renderAccountList(_accountsCache);
        };
        const run = async () => {
            const r = await window.Web2PancakeAccounts.remove(id);
            if (!r.ok) throw new Error(r.reason || 'delete_failed');
        };
        const rollback = () => {
            _accountsCache = snapshot;
            renderAccountList(snapshot);
        };
        const onSuccess = () => {
            renderJwtInfo();
            renderBanner();
        };
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run({
                snapshot,
                apply,
                run,
                rollback,
                onSuccess,
                successMsg: 'Đã xoá tài khoản',
                errLabel: 'Xoá tài khoản',
            });
        } else {
            apply();
            run()
                .then(() => {
                    notify('Đã xoá tài khoản', 'success');
                    onSuccess();
                })
                .catch((e) => {
                    rollback();
                    notify('Lỗi xoá tài khoản: ' + e.message, 'error');
                });
        }
    }

    function toggleAddPanel(show) {
        const panel = $('addAccountPanel');
        if (!panel) return;
        const willShow = show === undefined ? panel.hasAttribute('hidden') : show;
        if (willShow) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        if (willShow) $('addAccountInput')?.focus();
    }

    async function addAccountFromInput() {
        const PA = window.Web2PancakeAccounts;
        const input = $('addAccountInput');
        const txt = (input?.value || '').trim();
        if (!txt) {
            notify('Paste JWT token của account mới trước đã', 'warning');
            return;
        }
        const btn = $('btnAddSave');
        _setBtnLoading(btn, 'Đang thêm…');
        const r = await PA.addFromToken(txt);
        _restoreBtn(btn);
        if (!r.ok) {
            const map = {
                empty: 'Token rỗng',
                decode: 'Token không hợp lệ (không decode được)',
                expired: 'Token đã hết hạn — đăng nhập lại pancake.vn',
            };
            notify('Không thêm được: ' + (map[r.reason] || r.reason), 'error');
            return;
        }
        // account mới → đặt làm active luôn cho tiện
        PA.setActiveLocal({
            account_id: r.accountId,
            token: txt.replace(/^(?:jwt|token)=/i, '').trim(),
            exp: r.decoded?.exp,
        });
        notify('Đã thêm tài khoản vào DB', 'success');
        input.value = '';
        toggleAddPanel(false);
        await loadAccounts();
        renderJwtInfo();
        renderBanner();
        loadPages();
    }

    async function addAccountAuto() {
        const PK = window.Web2PancakeToken;
        const btn = $('btnAddAuto');
        if (!PK || !PK.isExtensionPresent()) {
            notify(REASON_MSG.no_extension, 'warning');
            return;
        }
        _setBtnLoading(btn, 'Đang lấy…');
        const res = await PK.fetchFromExtension();
        _restoreBtn(btn);
        if (!res.ok) {
            notify('Không lấy được token: ' + (REASON_MSG[res.reason] || res.reason), 'error');
            return;
        }
        const input = $('addAccountInput');
        if (input) input.value = res.token;
        notify('Đã lấy token — bấm "Thêm vào danh sách"', 'success');
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

        // Accounts card
        $('btnAddAccount')?.addEventListener('click', () => toggleAddPanel());
        $('btnAddCancel')?.addEventListener('click', () => toggleAddPanel(false));
        $('btnReloadAccounts')?.addEventListener('click', loadAccounts);
        $('btnAddSave')?.addEventListener('click', addAccountFromInput);
        $('btnAddAuto')?.addEventListener('click', addAccountAuto);

        wireModal();
        wireCredsModal();

        renderJwtInfo();
        renderExtStatus();
        loadAccounts();
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
