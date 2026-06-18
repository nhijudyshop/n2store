// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Pancake settings: render layer
// (jwt info, page list, ext status, expiry banner, accounts list,
//  per-page admin stats, relay pages)
// =====================================================

(function () {
    'use strict';

    const NS = (window.__PancakeSettings = window.__PancakeSettings || {});
    const S = NS.state;
    const $ = NS.$;
    const notify = NS.notify;
    const escapeHtml = NS.escapeHtml;
    const shortToken = NS.shortToken;
    const formatExpiry = NS.formatExpiry;

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
                renderPageList(S._pagesCache);
            });
        });
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
            b.addEventListener('click', () =>
                NS.openExpiryModal(window.Web2PancakeToken.getStatus())
            );
    }

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
                const st = S._refreshStatus[id] || {};
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
                if (act === 'use') NS.useAccount(id);
                else if (act === 'del') NS.deleteAccount(id);
                else if (act === 'renew') NS.renewAccount(id, btn);
                else if (act === 'creds') NS.openCredsModal(id);
            });
        });
    }

    // Gộp số account admin theo từng page (từ _accountsCache — cùng nguồn với mục
    // Tài khoản). "Dùng được" = token CÒN HẠN và account KHÔNG tắt sync — khớp 100%
    // với getPageAccountJwts() mà "Tăng comment" dùng để spawn worker. Mỗi page hiện:
    // tổng admin + số dùng được + tên các account dùng được (và account hết hạn/tắt).
    function renderPageAdminStats() {
        const list = $('pageAdminList');
        const badge = $('pageAdminBadge');
        if (!list) return;
        const accounts = Array.isArray(S._accountsCache) ? S._accountsCache : [];
        if (!accounts.length) {
            list.innerHTML = `<div class="ps-loading">Chưa có tài khoản nào để tổng hợp.</div>`;
            if (badge) {
                badge.textContent = '0 page';
                badge.className = 'badge warn';
            }
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const byPage = new Map(); // pageId → { name, total, usable, usableNames, blockedNames }
        for (const a of accounts) {
            const pages = Array.isArray(a.pages) ? a.pages : [];
            const expired = !!(a.token_exp && Number(a.token_exp) < now);
            const disabled = a.is_active === false;
            const usable = !expired && !disabled;
            const nm = a.name || a.fb_name || a.uid || a.account_id || '?';
            for (const p of pages) {
                const isObj = p && typeof p === 'object';
                const pid = String(isObj ? p.id : p);
                if (!pid || pid === 'undefined' || pid === 'null') continue;
                const pname = (isObj && p.name) || pid;
                let e = byPage.get(pid);
                if (!e) {
                    e = { name: pname, total: 0, usable: 0, usableNames: [], blockedNames: [] };
                    byPage.set(pid, e);
                }
                if (pname && (!e.name || e.name === pid)) e.name = pname;
                e.total++;
                if (usable) {
                    e.usable++;
                    e.usableNames.push(nm);
                } else {
                    e.blockedNames.push(`${nm} (${expired ? 'hết hạn' : 'tắt sync'})`);
                }
            }
        }
        const rows = Array.from(byPage.entries())
            .map(([pid, e]) => ({ pid, ...e }))
            .sort(
                (a, b) =>
                    b.usable - a.usable ||
                    b.total - a.total ||
                    String(a.name).localeCompare(String(b.name), 'vi')
            );
        if (!rows.length) {
            list.innerHTML = `<div class="ps-loading">Các tài khoản chưa gắn page nào. Bấm “Tải lại” hoặc gia hạn token.</div>`;
            if (badge) {
                badge.textContent = '0 page';
                badge.className = 'badge warn';
            }
            return;
        }
        if (badge) {
            badge.textContent = `${rows.length} page`;
            badge.className = 'badge ok';
        }
        list.innerHTML = rows
            .map((r) => {
                const isIG = String(r.pid).startsWith('igo_');
                const usableClass = r.usable > 0 ? 'has' : 'no';
                const usableLine = r.usableNames.length
                    ? escapeHtml(r.usableNames.join(', '))
                    : '<span style="color:#b91c1c;">— không có account dùng được</span>';
                const blockedLine = r.blockedNames.length
                    ? `<div class="meta" style="margin-top:2px;color:#94a3b8;">${escapeHtml(r.blockedNames.join(', '))}</div>`
                    : '';
                return `
                <div class="ps-page-item" data-page-id="${escapeHtml(r.pid)}">
                    <div class="pg-avatar-fallback">${escapeHtml((r.name || '?').charAt(0).toUpperCase())}</div>
                    <div class="info">
                        <div class="name">
                            ${escapeHtml(r.name)}
                            ${isIG ? '<span class="plat-chip instagram">instagram</span>' : ''}
                        </div>
                        <div class="meta">
                            <span class="mid">${escapeHtml(r.pid)}</span>
                            <span class="tok-chip">👤 ${r.usable}/${r.total} dùng được</span>
                        </div>
                        <div class="meta" style="margin-top:2px;">${usableLine}</div>
                        ${blockedLine}
                    </div>
                    <span class="status ${usableClass}">${r.total} admin</span>
                </div>`;
            })
            .join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderRelayPages(accounts) {
        const list = $('relayPageList');
        const badge = $('relayBadge');
        if (!list) return;
        const totalPages = accounts.reduce((n, a) => n + (a.allPages || []).length, 0);
        const totalOn = accounts.reduce(
            (n, a) => n + (a.allPages || []).filter((p) => p.enabled && !p.joinFailed).length,
            0
        );
        if (!accounts.length || totalPages === 0) {
            list.innerHTML = `<div class="ps-loading">Relay chưa có account/trang. Kiểm tra account Pancake ở card trên, hoặc relay chưa kết nối.</div>`;
            if (badge) {
                badge.textContent = '0 trang';
                badge.className = 'badge warn';
            }
            return;
        }
        if (badge) {
            badge.textContent = `${totalOn}/${totalPages} đang nghe`;
            badge.className = 'badge ' + (totalOn > 0 ? 'ok' : 'warn');
        }
        list.innerHTML = accounts
            .map((a) => {
                const pages = (a.allPages || [])
                    .map((p) => {
                        const tag = p.joinFailed
                            ? `<span class="status no" title="Pancake từ chối join — trang này hết gói cước">hết gói cước</span>`
                            : p.enabled
                              ? `<span class="status has">đang nghe</span>`
                              : `<span class="status no">tắt</span>`;
                        return `
                <label class="ps-page-item" style="cursor:pointer;">
                    <input type="checkbox" class="relay-pg" data-uid="${escapeHtml(a.userId)}" data-pid="${escapeHtml(p.id)}" ${p.enabled ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;accent-color:var(--web2-primary,#0068ff);" />
                    ${p.image ? `<img src="${escapeHtml(p.image)}" alt="" />` : `<div class="pg-avatar-fallback">${escapeHtml((p.name || '?').charAt(0).toUpperCase())}</div>`}
                    <div class="info">
                        <div class="name">${escapeHtml(p.name || p.id)}</div>
                        <div class="meta"><span class="mid">${escapeHtml(p.id)}</span></div>
                    </div>
                    ${tag}
                </label>`;
                    })
                    .join('');
                return `<div class="relay-account-group" data-uid="${escapeHtml(a.userId)}">
                    <div class="ps-help" style="margin:8px 0 4px;">Tài khoản: <strong>${escapeHtml(a.name || a.userId)}</strong> ${a.connected ? '🟢 đã kết nối' : '🔴 chưa kết nối'}</div>
                    ${pages}
                </div>`;
            })
            .join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // Expose on namespace.
    NS.renderJwtInfo = renderJwtInfo;
    NS.renderPageList = renderPageList;
    NS.renderExtStatus = renderExtStatus;
    NS.renderBanner = renderBanner;
    NS._expChip = _expChip;
    NS.renderAccountList = renderAccountList;
    NS.renderPageAdminStats = renderPageAdminStats;
    NS.renderRelayPages = renderRelayPages;
})();
