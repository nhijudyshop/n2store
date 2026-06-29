// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Trang Zalo — tab Tài khoản (CHỈ ADMIN). GLOBAL always-on (2026-06-29):
//   • 1 tài khoản Zalo cá nhân DUY NHẤT dùng chung cả dự án (bỏ per-máy).
//   • Admin bấm "Đăng nhập Zalo" → 2 cách: cookie (tự động qua tiện ích) HOẶC quét QR.
//   • Tự thử cookie nếu trình duyệt còn phiên chat.zalo.me (extension).
//   • Phiên lưu trên server (mã hoá) → boot-restore + auto-reconnect 24/7.
//   • OA giữ riêng cho ZNS.
// =====================================================================

(function () {
    'use strict';

    const WZApp = (window.WZApp = window.WZApp || {});
    const { $, esc, notify, avatarHtml, showModal, hideModal, setBusy, STATUS_LABEL, state } =
        WZApp;

    // ===================================================================
    // RENDER
    // ===================================================================
    function skelCards(n) {
        return Array.from({ length: n || 1 })
            .map(
                () => `<div class="wz-skel-card">
                    <div class="wz-skel-row"><div class="wz-skel" style="width:48px;height:48px;border-radius:14px"></div>
                        <div style="flex:1"><div class="wz-skel" style="width:60%;height:14px;margin-bottom:7px"></div><div class="wz-skel" style="width:40%;height:11px"></div></div></div>
                    <div class="wz-skel" style="width:45%;height:12px"></div>
                    <div class="wz-skel" style="width:100%;height:30px;border-radius:9px"></div>
                </div>`
            )
            .join('');
    }

    // TK cá nhân GLOBAL (chỉ có 1). Ưu tiên cái đang kết nối, rồi tới cái mới nhất.
    function _personal() {
        const list = (state.accounts || []).filter((a) => a.accountType === 'personal');
        return list.find((a) => a.status === 'connected') || list[0] || null;
    }
    function _oa() {
        return (state.accounts || []).filter((a) => a.accountType === 'oa');
    }

    async function loadAccounts() {
        const grid = $('#wzAccGrid');
        if (!grid) return;
        if (!state.accounts.length) grid.innerHTML = skelCards(1);
        try {
            const res = await window.ZaloApi.status();
            state.zcaAvailable = res.zcaAvailable !== false;
            state.accounts = res.accounts || [];
            renderAccounts();
            renderRailHealth();
            autoCookieIfDetected(); // tự đăng nhập cookie nếu trình duyệt còn phiên (admin)
        } catch (e) {
            state.accounts = [];
            renderAccounts();
            renderRailHealth();
        } finally {
            grid.setAttribute('aria-busy', 'false');
        }
    }

    // Đèn sức khoẻ ở chân icon-rail: tài khoản global connected hay chưa.
    function renderRailHealth() {
        const el = $('#wzRailHealth');
        if (!el) return;
        const p = _personal();
        const st = p ? p.status : null;
        const dot =
            st === 'connected'
                ? 'connected'
                : st === 'connecting' || st === 'reconnecting'
                  ? 'reconnecting'
                  : st
                    ? 'error'
                    : '';
        el.innerHTML = `<span class="wz-dot ${dot}"></span>`;
        el.title =
            state.zcaAvailable === false
                ? 'zca-js chưa sẵn sàng trên server'
                : st === 'connected'
                  ? 'Zalo đang kết nối (global)'
                  : p
                    ? 'Zalo chưa đăng nhập / mất kết nối'
                    : 'Chưa đăng nhập Zalo';
    }

    function accCardHtml(a) {
        const t = a.accountType;
        const dn = a.displayName || a.label || (t === 'oa' ? 'Zalo OA' : 'Tài khoản Zalo');
        const sub =
            t === 'oa'
                ? `OA${a.oaId ? ' · ' + esc(a.oaId) : ''}`
                : a.zaloUid
                  ? 'UID ' + esc(a.zaloUid)
                  : 'Cá nhân';
        const avatar = avatarHtml(a.avatarUrl, dn, 'wz-acc-avatar');
        const acts = [];
        if (t === 'personal') {
            if (a.status === 'connected') {
                acts.push(
                    `<button class="wz-btn wz-btn-sm" data-act="chat" data-key="${esc(a.accountKey)}"><i data-lucide="messages-square"></i> Chat</button>`
                );
                acts.push(
                    `<button class="wz-btn wz-btn-sm" data-act="switch" data-key="${esc(a.accountKey)}" title="Đổi sang tài khoản Zalo khác"><i data-lucide="repeat"></i> Đổi tài khoản</button>`
                );
                acts.push(
                    `<button class="wz-btn wz-btn-sm" data-act="disconnect" data-key="${esc(a.accountKey)}" aria-label="Ngắt kết nối ${esc(dn)}" title="Ngắt kết nối"><i data-lucide="power"></i></button>`
                );
            } else {
                acts.push(
                    `<button class="wz-btn wz-btn-sm wz-btn-primary" data-act="login" data-key="${esc(a.accountKey)}" title="Đăng nhập Zalo (cookie hoặc QR)"><i data-lucide="log-in"></i> Đăng nhập Zalo</button>`
                );
            }
        } else {
            acts.push(
                `<button class="wz-btn wz-btn-sm" data-act="sync" data-key="${esc(a.accountKey)}"><i data-lucide="refresh-cw"></i> Đồng bộ template</button>`
            );
        }
        acts.push(
            `<button class="wz-btn wz-btn-sm" data-act="delete" data-key="${esc(a.accountKey)}" aria-label="Xoá tài khoản ${esc(dn)}" title="Xoá"><i data-lucide="trash-2"></i></button>`
        );
        const eff = a.status;
        const stLabel = STATUS_LABEL[eff] || eff;
        const liveHint =
            t === 'personal' && a.status === 'connected'
                ? `<div class="wz-live-hint"><i data-lucide="shield-check"></i> Tài khoản <b>dùng chung cả dự án</b> — luôn online trên máy chủ, tự kết nối lại khi rớt. Đừng mở chat.zalo.me bằng tài khoản này (sẽ bị "Đổi thiết bị").</div>`
                : '';
        const errHint =
            t === 'personal' && (a.status === 'error' || a.status === 'kicked')
                ? `<div class="wz-kick-warn"><i data-lucide="alert-triangle"></i> Mất kết nối (phiên có thể hết hạn hoặc đang mở nơi khác). Bấm <b>Đăng nhập Zalo</b> để nối lại.</div>`
                : '';
        return `<div class="wz-acc-card">
            <div class="wz-acc-top">
                ${avatar}
                <div style="min-width:0;flex:1">
                    <div class="wz-acc-name">${esc(dn)}</div>
                    <div class="wz-acc-sub">${sub}</div>
                </div>
                <span class="wz-acc-type ${t}">${t === 'oa' ? 'OA' : 'Cá nhân'}</span>
            </div>
            <div class="wz-statustxt"><span class="wz-dot ${esc(eff)}"></span>${esc(stLabel)}${a.statusMsg && a.status !== 'kicked' ? ' · <span class="wz-err" style="font-weight:400">' + esc(String(a.statusMsg).slice(0, 60)) + '</span>' : ''}</div>
            ${liveHint}${errHint}
            <div class="wz-acc-actions">${acts.join('')}</div>
        </div>`;
    }

    // Khi CHƯA có tài khoản cá nhân nào → nút lớn "Đăng nhập Zalo".
    function heroLoginHtml() {
        return `<div class="wz-acc-card wz-choice" id="wzHeroLogin" role="button" tabindex="0" aria-label="Đăng nhập Zalo">
                <div class="wz-acc-top">
                    <span class="wz-choice-ic personal"><i data-lucide="log-in"></i></span>
                    <div><h3>Đăng nhập Zalo</h3></div>
                </div>
                <p>1 tài khoản Zalo cá nhân dùng chung cả dự án — chat 2 chiều với khách như người thật (không giới hạn 24h như Facebook). Đăng nhập bằng <b>cookie</b> (tự động) hoặc <b>quét QR</b>.</p>
                <span class="wz-choice-cta">Đăng nhập <i data-lucide="arrow-right"></i></span>
            </div>`;
    }
    function oaChoiceHtml() {
        return `<div class="wz-acc-card wz-choice" id="wzAddOa" role="button" tabindex="0" aria-label="Kết nối Zalo OA">
                <div class="wz-acc-top">
                    <span class="wz-choice-ic oa"><i data-lucide="badge-check"></i></span>
                    <div><h3>Zalo OA <span class="wz-tag-safe">An toàn</span></h3></div>
                </div>
                <p>Tài khoản chính thức → gửi ZNS thông báo đơn (~200đ/tin) tới mọi SĐT. Không rủi ro khoá.</p>
                <span class="wz-choice-cta">Kết nối OA <i data-lucide="arrow-right"></i></span>
            </div>`;
    }

    function renderAccounts() {
        const grid = $('#wzAccGrid');
        if (!grid) return;
        // GLOBAL: thường chỉ 1 TK cá nhân. Render TẤT CẢ personal (để admin dọn TK thừa
        // còn sót từ thời per-máy nếu có) — TK kết nối lên trước. Chưa có TK nào → hero login.
        const personals = (state.accounts || [])
            .filter((a) => a.accountType === 'personal')
            .sort(
                (a, b) => (b.status === 'connected' ? 1 : 0) - (a.status === 'connected' ? 1 : 0)
            );
        const oas = _oa();
        let html = '';
        html += personals.length ? personals.map(accCardHtml).join('') : heroLoginHtml();
        html += oas.map(accCardHtml).join('');
        if (!oas.length) html += oaChoiceHtml();
        grid.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    }

    // ===================================================================
    // ACTIONS
    // ===================================================================
    async function onAccAction(act, key, btn) {
        const a = state.accounts.find((x) => x.accountKey === key);
        try {
            if (act === 'login') {
                openLogin(key);
                return;
            }
            if (act === 'switch') {
                if (
                    !(await Popup.confirm(
                        'Đổi sang tài khoản Zalo khác? Tài khoản hiện tại sẽ bị xoá khỏi máy chủ, rồi đăng nhập tài khoản mới.',
                        { okText: 'Đổi tài khoản' }
                    ))
                )
                    return;
                await window.ZaloApi.deleteAccount(key).catch(() => {});
                state.accounts = state.accounts.filter((x) => x.accountKey !== key);
                openLogin(null); // tạo slot mới + đăng nhập
                return;
            }
            if (act === 'disconnect') {
                await window.ZaloApi.disconnect(key);
                notify('Đã ngắt kết nối', 'success');
                loadAccounts();
            } else if (act === 'delete') {
                if (
                    !(await Popup.danger(`Xoá tài khoản "${a?.displayName || key}"?`, {
                        okText: 'Xoá',
                    }))
                )
                    return;
                await window.ZaloApi.deleteAccount(key);
                notify('Đã xoá', 'success');
                loadAccounts();
            } else if (act === 'sync') {
                setBusy(btn, true);
                const r = await window.ZaloApi.syncTemplates(key);
                notify(`Đã đồng bộ ${r.synced || 0} template`, 'success');
            } else if (act === 'chat') {
                state.conv.accountKey = key;
                WZApp.switchTab('chat');
            }
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    // ===================================================================
    // ĐĂNG NHẬP (modal 2 lựa chọn: cookie tự động / quét QR)
    // ===================================================================
    let _qrUnsub = null; // huỷ subscribe SSE QR khi đóng modal
    let _loginKey = null; // accountKey đang đăng nhập trong modal

    // Tạo/lấy slot tài khoản cá nhân GLOBAL (chỉ 1). Tái dùng nếu có; thiếu thì tạo.
    async function _ensureGlobalKey() {
        const p = _personal();
        if (p) return p.accountKey;
        const r = await window.ZaloApi.createAccount('Zalo shop');
        const key = r?.data?.accountKey;
        if (!key) throw new Error('Không tạo được tài khoản');
        return key;
    }

    function _showOpts() {
        $('#wzLoginOpts').hidden = false;
        $('#wzQrArea').hidden = true;
        $('#wzLoginErr').textContent = '';
        _stopQr();
    }
    function _stopQr() {
        try {
            _qrUnsub?.();
        } catch {}
        _qrUnsub = null;
    }

    async function openLogin(key) {
        $('#wzLoginErr').textContent = '';
        showModal('#wzLoginModal');
        _showOpts();
        try {
            _loginKey = key || (await _ensureGlobalKey());
        } catch (e) {
            $('#wzLoginErr').textContent = e.message;
            return;
        }
        // Tự thử cookie nếu trình duyệt còn phiên chat.zalo.me (im lặng, không lỗi nếu không có).
        autoTryCookieInModal();
    }

    function closeLogin() {
        _stopQr();
        hideModal('#wzLoginModal');
    }

    // Tự dò cookie ngay khi mở modal — có phiên → đăng nhập luôn, không có → giữ 2 lựa chọn.
    async function autoTryCookieInModal() {
        const ext = window.Web2Ext;
        if (!ext?.hasExtension?.()) return; // không có tiện ích → để user chọn QR
        const cr = await ext.request('GET_ZALO_CREDS', {}, 12000).catch(() => null);
        if (!cr || !cr.ok || !cr.data?.cookie || !cr.data?.imei) return; // không có phiên → giữ options
        $('#wzLoginErr').textContent = 'Phát hiện phiên Zalo trên trình duyệt — đang đăng nhập…';
        await doCookieLogin(_loginKey, cr.data);
    }

    // Đăng nhập bằng cookie (creds đã có từ extension hoặc tự lấy).
    async function doCookieLogin(key, creds) {
        const btn = $('#wzLoginCookie');
        setBusy(btn, true);
        try {
            const ext = window.Web2Ext;
            if (!creds) {
                if (!ext?.hasExtension?.()) {
                    await Popup.warning(
                        'Cần cài tiện ích N2Store để đăng nhập bằng cookie. Hoặc dùng "Quét mã QR".'
                    );
                    return;
                }
                const r = await ext.request('GET_ZALO_CREDS', {}, 15000);
                if (!r || !r.ok || !r.data?.cookie) {
                    const reason = (r && r.data && r.data.reason) || '';
                    if (reason === 'no_session' || reason === 'no_imei') {
                        const go = await Popup.confirm(
                            'Chưa thấy phiên Zalo trên trình duyệt. Đăng nhập https://chat.zalo.me/ trước rồi thử lại — hoặc dùng "Quét mã QR".',
                            { okText: 'Mở chat.zalo.me', cancelText: 'Đóng' }
                        );
                        if (go) window.open('https://chat.zalo.me/', '_blank', 'noopener');
                    } else {
                        $('#wzLoginErr').textContent =
                            (r && r.error) || 'Không lấy được phiên Zalo';
                    }
                    return;
                }
                creds = r.data;
            }
            const { cookie, imei, userAgent } = creds;
            await window.ZaloApi.loginCookie(key, { cookie, imei, userAgent });
            notify('Đăng nhập Zalo thành công — đang kết nối…', 'success');
            closeLogin();
            setTimeout(loadAccounts, 1500);
        } catch (e) {
            $('#wzLoginErr').textContent = e.message;
        } finally {
            setBusy(btn, false);
        }
    }

    // Đăng nhập bằng QR: gọi server bắt đầu luồng, nghe SSE để vẽ mã + cập nhật trạng thái.
    async function startQrLogin(key) {
        $('#wzLoginErr').textContent = '';
        $('#wzLoginOpts').hidden = true;
        $('#wzQrArea').hidden = false;
        const box = $('#wzQrBox');
        const stEl = $('#wzQrStatus');
        box.innerHTML = '<div class="wz-qr-spin">Đang tạo mã QR…</div>';
        stEl.textContent = 'Mở Zalo trên điện thoại → Quét mã.';
        _stopQr();
        const topic = `web2:zalo:qr:${key}`;
        if (window.Web2SSE?.subscribe) {
            _qrUnsub = window.Web2SSE.subscribe(topic, (msg) => onQrEvent(msg?.data));
        }
        try {
            await window.ZaloApi.loginQr(key);
        } catch (e) {
            stEl.textContent = '';
            $('#wzLoginErr').textContent = e.message;
        }
    }

    function onQrEvent(d) {
        if (!d) return;
        const box = $('#wzQrBox');
        const stEl = $('#wzQrStatus');
        switch (d.event) {
            case 'qr':
                if (d.image)
                    box.innerHTML = `<img src="${esc(d.image)}" alt="Mã QR đăng nhập Zalo" class="wz-qr-img" width="240" height="240">`;
                stEl.textContent = 'Mở Zalo trên điện thoại → Quét mã.';
                break;
            case 'scanned':
                stEl.textContent = `Đã quét${d.displayName ? ' — ' + d.displayName : ''}. Xác nhận trên điện thoại…`;
                break;
            case 'expired':
                box.innerHTML =
                    '<div class="wz-qr-spin">Mã QR đã hết hạn. Bấm "Chọn cách khác" → "Quét mã QR" lại.</div>';
                break;
            case 'declined':
                stEl.textContent = 'Bạn đã từ chối đăng nhập trên điện thoại.';
                break;
            case 'success':
                stEl.textContent = 'Đăng nhập thành công — đang kết nối…';
                notify('Đăng nhập Zalo thành công', 'success');
                _stopQr();
                closeLogin();
                setTimeout(loadAccounts, 1200);
                break;
            case 'error':
                stEl.textContent = '';
                $('#wzLoginErr').textContent = d.error || 'Đăng nhập QR lỗi';
                break;
        }
    }

    // Tự đăng nhập cookie khi mở tab Tài khoản (admin) nếu CHƯA kết nối + còn phiên
    // chat.zalo.me trên trình duyệt. 1 lần / lần mở trang. Im lặng nếu không có phiên.
    let _autoTried = false;
    async function autoCookieIfDetected() {
        if (_autoTried) return;
        if (WZApp.isAdmin && !WZApp.isAdmin()) return; // chỉ admin mới đăng nhập được
        _autoTried = true;
        if (!window.Web2Ext?.hasExtension?.()) return;
        const p = _personal();
        if (p && p.status === 'connected') return; // đã kết nối → khỏi
        const cr = await window.Web2Ext.request('GET_ZALO_CREDS', {}, 12000).catch(() => null);
        if (!cr || !cr.ok || !cr.data?.cookie || !cr.data?.imei) return; // không phiên → im lặng
        try {
            const key = p ? p.accountKey : await _ensureGlobalKey();
            const { cookie, imei, userAgent } = cr.data;
            await window.ZaloApi.loginCookie(key, { cookie, imei, userAgent });
            notify('Tự đăng nhập Zalo từ phiên trình duyệt', 'success');
            setTimeout(loadAccounts, 1500);
        } catch (e) {
            /* im lặng — WRONG_ACCOUNT / no-session → giữ onboarding */
        }
    }

    // ── OA connect modal ─────────────────────────────────────────────────
    function openOaModal() {
        showModal('#wzOaModal');
    }
    function closeOaModal() {
        hideModal('#wzOaModal');
    }
    async function saveOa() {
        const body = {
            appId: $('#wzOaAppId').value.trim(),
            secret: $('#wzOaSecret').value.trim(),
            code: $('#wzOaCode').value.trim(),
            oaId: $('#wzOaId').value.trim(),
            oaName: $('#wzOaName').value.trim(),
        };
        if (!body.appId || !body.secret || !body.code) {
            $('#wzOaErr').textContent = 'Cần App ID, Secret và Authorization Code';
            return;
        }
        $('#wzOaErr').textContent = '';
        const btn = $('#wzOaSave');
        setBusy(btn, true);
        try {
            await window.ZaloApi.oaConnect(body);
            closeOaModal();
            notify('Đã kết nối Zalo OA', 'success');
            loadAccounts();
        } catch (e) {
            $('#wzOaErr').textContent = e.message;
        } finally {
            setBusy(btn, false);
        }
    }

    // ── Export ─────────────────────────────────────────────────────────────
    WZApp.loadAccounts = loadAccounts;
    WZApp.onAccAction = onAccAction;
    WZApp.openLogin = openLogin;
    WZApp.closeLogin = closeLogin;
    WZApp.doCookieLogin = doCookieLogin;
    WZApp.startQrLogin = startQrLogin;
    WZApp._loginKey = () => _loginKey;
    WZApp.showLoginOpts = _showOpts;
    WZApp.openOaModal = openOaModal;
    WZApp.closeOaModal = closeOaModal;
    WZApp.saveOa = saveOa;
})();
