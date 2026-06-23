// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Trang Zalo — tab Tài khoản: load/render accounts + status strip,
// thêm tài khoản cá nhân, đăng nhập QR, kết nối OA.
// =====================================================================

(function () {
    'use strict';

    const WZApp = (window.WZApp = window.WZApp || {});
    const { $, esc, notify, avatarHtml, showModal, hideModal, setBusy, STATUS_LABEL, state } =
        WZApp;

    // ===================================================================
    // ACCOUNTS
    // ===================================================================
    function skelCards(n) {
        return Array.from({ length: n || 2 })
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

    async function loadAccounts() {
        const grid = $('#wzAccGrid');
        if (!state.accounts.length) grid.innerHTML = skelCards(2);
        try {
            const res = await window.ZaloApi.status();
            state.zcaAvailable = res.zcaAvailable !== false;
            state.accounts = res.accounts || [];
            renderAccounts();
            renderStatusStrip(res);
            autoRenewZalo(); // tự gia hạn nền nếu TK rớt + còn phiên Zalo trên trình duyệt (1 lần)
        } catch (e) {
            // Backend chưa deploy / lỗi mạng → vẫn cho onboarding (2 lựa chọn) thay vì màn lỗi cụt
            state.accounts = [];
            renderAccounts();
            renderStatusStrip({ zcaAvailable: false });
        } finally {
            grid.setAttribute('aria-busy', 'false');
        }
    }

    // Đèn sức khoẻ ở chân icon-rail (gọn): N/M kết nối + màu. Cập nhật mỗi loadAccounts
    // (init + SSE web2:zalo:accounts). #wzStatusStrip cũ đã bỏ khi rebuild 3-pane.
    function renderStatusStrip(res) {
        const el = $('#wzRailHealth');
        if (!el) return;
        const conn = state.accounts.filter(
            (a) => a.status === 'connected' || a.status === 'token_ok'
        ).length;
        const total = state.accounts.length;
        const reconnecting = state.accounts.some((a) => a.status === 'reconnecting');
        const kicked = state.accounts.some((a) => a.status === 'kicked');
        const dot = conn ? 'connected' : reconnecting ? 'reconnecting' : total ? 'error' : '';
        el.innerHTML = `<span class="wz-dot ${dot}"></span><span class="wz-rail-health-n">${conn}/${total}</span>`;
        el.title =
            res && res.zcaAvailable === false
                ? 'zca-js chưa sẵn sàng trên server'
                : kicked
                  ? 'Có tài khoản bị giành phiên (mở Zalo Web nơi khác?)'
                  : `${conn}/${total} tài khoản Zalo đang kết nối`;
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
                    `<button class="wz-btn wz-btn-sm" data-act="disconnect" data-key="${esc(a.accountKey)}" aria-label="Ngắt kết nối ${esc(dn)}" title="Ngắt kết nối"><i data-lucide="power"></i></button>`
                );
            } else {
                // CHÍNH: Đăng nhập Zalo 1-click (lấy phiên chat.zalo.me qua extension — không quét QR).
                acts.push(
                    `<button class="wz-btn wz-btn-sm wz-btn-primary" data-act="zalologin" data-key="${esc(a.accountKey)}" title="Đăng nhập bằng phiên Zalo đang mở trên trình duyệt (cần đăng nhập chat.zalo.me)"><i data-lucide="log-in"></i> Đăng nhập Zalo</button>`
                );
                // Phụ: kết nối lại bằng session đã lưu (nếu có).
                if (a.hasSession)
                    acts.push(
                        `<button class="wz-btn wz-btn-sm" data-act="reconnect" data-key="${esc(a.accountKey)}" title="Dùng lại phiên đã lưu"><i data-lucide="refresh-cw"></i> Kết nối lại</button>`
                    );
                // Phụ: quét QR (dự phòng khi không có extension / phiên trình duyệt).
                acts.push(
                    `<button class="wz-btn wz-btn-sm" data-act="qr" data-key="${esc(a.accountKey)}" title="Đăng nhập bằng quét mã QR"><i data-lucide="qr-code"></i> QR</button>`
                );
            }
        } else {
            acts.push(
                `<button class="wz-btn wz-btn-sm" data-act="sync" data-key="${esc(a.accountKey)}"><i data-lucide="refresh-cw"></i> Đồng bộ template</button>`
            );
        }
        // TK cá nhân chưa phải TK chính → cho đặt làm chính (gửi tin KH 1-1 dùng TK này).
        if (t === 'personal' && !a.isPrimary) {
            acts.push(
                `<button class="wz-btn wz-btn-sm" data-act="primary" data-key="${esc(a.accountKey)}" title="Dùng tài khoản này để gửi tin nhắn khách 1-1 (mọi trang)"><i data-lucide="star"></i> Đặt làm chính</button>`
            );
        }
        acts.push(
            `<button class="wz-btn wz-btn-sm" data-act="delete" data-key="${esc(a.accountKey)}" aria-label="Xoá tài khoản ${esc(dn)}" title="Xoá"><i data-lucide="trash-2"></i></button>`
        );
        const primaryBadge =
            t === 'personal' && a.isPrimary
                ? `<span class="wz-acc-primary" title="Tài khoản gửi tin nhắn khách 1-1 cho mọi trang"><i data-lucide="star"></i> TK chính</span>`
                : '';
        // Health watchdog (Phase 1 "không bị văng"): hiện trạng thái sống/đang kết nối lại,
        // cảnh báo khi bị giành phiên, và nhắc đừng mở Zalo Web TK này ở máy khác.
        const h = a.health || {};
        const eff = h.reconnecting ? 'reconnecting' : a.status;
        const stLabel = STATUS_LABEL[eff] || eff;
        const kickWarn =
            t === 'personal' && a.status === 'kicked'
                ? `<div class="wz-kick-warn"><i data-lucide="alert-triangle"></i> Tài khoản đang mở ở nơi khác — máy chủ tạm dừng nghe. Đừng mở <b>chat.zalo.me</b> tài khoản này trên máy/trình duyệt khác (app điện thoại vẫn dùng được), rồi bấm <b>Kết nối lại</b>.</div>`
                : '';
        const liveHint =
            t === 'personal' && a.status === 'connected'
                ? `<div class="wz-live-hint"><i data-lucide="shield-check"></i> Đang nghe realtime trên máy chủ → nhân viên dùng được ở mọi máy. Lưu ý: đừng đăng nhập <b>chat.zalo.me</b> tài khoản này ở nơi khác (sẽ làm rớt; máy chủ tự kết nối lại).</div>`
                : '';
        // TK phụ (cá nhân, không phải TK chính): máy chủ KHÔNG tự kết nối / giữ kết nối.
        // Bấm "Đặt làm chính" để hệ thống tự kết nối + giữ realtime cho TK này.
        const secondaryHint =
            t === 'personal' && !a.isPrimary
                ? `<div class="wz-sec-hint"><i data-lucide="info"></i> TK phụ — máy chủ <b>không tự kết nối / không refresh liên tục</b>. Bấm <b>Đặt làm chính</b> để hệ thống tự kết nối & giữ realtime.</div>`
                : '';
        return `<div class="wz-acc-card${a.isPrimary ? ' is-primary' : ''}">
            <div class="wz-acc-top">
                ${avatar}
                <div style="min-width:0;flex:1">
                    <div class="wz-acc-name">${esc(dn)}</div>
                    <div class="wz-acc-sub">${sub}</div>
                </div>
                ${primaryBadge}
                <span class="wz-acc-type ${t}">${t === 'oa' ? 'OA' : 'Cá nhân'}</span>
            </div>
            <div class="wz-statustxt"><span class="wz-dot ${esc(eff)}"></span>${esc(stLabel)}${a.statusMsg && a.status !== 'kicked' ? ' · <span class="wz-err" style="font-weight:400">' + esc(String(a.statusMsg).slice(0, 60)) + '</span>' : ''}</div>
            ${kickWarn}${liveHint}${secondaryHint}
            <div class="wz-acc-actions">${acts.join('')}</div>
        </div>`;
    }

    function choiceCardsHtml() {
        return (
            `<div class="wz-acc-card wz-choice" id="wzAddPersonal" role="button" tabindex="0" aria-label="Thêm tài khoản cá nhân">
                <div class="wz-acc-top">
                    <span class="wz-choice-ic personal"><i data-lucide="user-plus"></i></span>
                    <div><h3>Tài khoản cá nhân</h3></div>
                </div>
                <p>Đăng nhập bằng QR → chat 2 chiều với khách như người thật, không giới hạn 24h như Facebook.</p>
                <span class="wz-choice-cta">Thêm & quét QR <i data-lucide="arrow-right"></i></span>
            </div>` +
            `<div class="wz-acc-card wz-choice" id="wzAddOa" role="button" tabindex="0" aria-label="Kết nối Zalo OA">
                <div class="wz-acc-top">
                    <span class="wz-choice-ic oa"><i data-lucide="badge-check"></i></span>
                    <div><h3>Zalo OA <span class="wz-tag-safe">An toàn</span></h3></div>
                </div>
                <p>Tài khoản chính thức → gửi ZNS thông báo đơn (~200đ/tin) tới mọi SĐT. Không rủi ro khoá.</p>
                <span class="wz-choice-cta">Kết nối OA <i data-lucide="arrow-right"></i></span>
            </div>`
        );
    }

    function renderAccounts() {
        const grid = $('#wzAccGrid');
        const cards = state.accounts.map(accCardHtml).join('');
        grid.innerHTML = cards + choiceCardsHtml();
        if (window.lucide) lucide.createIcons();
    }

    async function onAccAction(act, key, btn) {
        const a = state.accounts.find((x) => x.accountKey === key);
        try {
            if (act === 'qr') return startQr(key);
            if (act === 'zalologin') {
                setBusy(btn, true);
                await loginZaloCookie(key);
                return;
            }
            if (act === 'reconnect') {
                setBusy(btn, true);
                try {
                    await window.ZaloApi.reconnect(key);
                    notify('Đã kết nối lại', 'success');
                    setTimeout(loadAccounts, 1500);
                } catch (e) {
                    // Phiên đã lưu hết hạn → mời mở chat.zalo.me đăng nhập lại (1 chạm),
                    // rồi bấm "Đăng nhập Zalo". Tránh chỉ toast tan biến.
                    const go = await Popup.confirm(
                        (e.message || 'Phiên Zalo đã hết hạn.') +
                            '\n\nMở chat.zalo.me để đăng nhập lại tài khoản này?',
                        { okText: 'Mở chat.zalo.me', cancelText: 'Để sau' }
                    );
                    if (go) window.open('https://chat.zalo.me/', '_blank', 'noopener');
                    setTimeout(loadAccounts, 800);
                }
                return;
            } else if (act === 'disconnect') {
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
            } else if (act === 'primary') {
                setBusy(btn, true);
                await window.ZaloApi.setPrimary(key);
                notify(`Đã đặt "${a?.displayName || key}" làm TK chính gửi tin khách`, 'success');
                loadAccounts();
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

    // ── Đăng nhập Zalo 1-click (cookie phiên chat.zalo.me qua extension) ──────
    // silent=true: tự gia hạn nền khi mở trang (KHÔNG popup/toast nếu không lấy được phiên).
    async function loginZaloCookie(key, silent) {
        const ext = window.Web2Ext;
        if (!ext || !ext.hasExtension || !ext.hasExtension()) {
            if (!silent)
                await Popup.warning(
                    'Cần cài tiện ích N2Store trên trình duyệt để "Đăng nhập Zalo" 1 chạm. Hoặc dùng nút QR.'
                );
            return false;
        }
        const r = await ext.request('GET_ZALO_CREDS', {}, 15000);
        if (!r || !r.ok) {
            if (silent) return false;
            const reason = (r && r.data && r.data.reason) || (r && r.error) || '';
            if (reason === 'no_session' || reason === 'no_imei') {
                const go = await Popup.confirm(
                    'Chưa thấy phiên Zalo trên trình duyệt. Hãy đăng nhập https://chat.zalo.me/ trước (hoặc tải lại tab Zalo nếu đã đăng nhập), rồi bấm lại "Đăng nhập Zalo".',
                    { okText: 'Mở chat.zalo.me', cancelText: 'Đóng' }
                );
                if (go) window.open('https://chat.zalo.me/', '_blank', 'noopener');
            } else {
                notify('✗ ' + ((r && r.error) || 'Không lấy được phiên Zalo'), 'error');
            }
            return false;
        }
        const { cookie, imei, userAgent } = r.data;
        // silent (tự gia hạn nền) → backend từ chối nếu KHÔNG phải TK chính (chỉ TK
        // chính được tự kết nối). Đăng nhập tay (silent=false) vẫn nối TK phụ được.
        const res = await window.ZaloApi.loginCookie(key, {
            cookie,
            imei,
            userAgent,
            silent: !!silent,
        });
        if (res && res.skipped) return false; // TK phụ — bỏ qua tự gia hạn nền
        if (!silent) notify('Đăng nhập Zalo thành công — đang kết nối…', 'success');
        setTimeout(loadAccounts, 1500);
        return true;
    }

    // Tự gia hạn: khi mở trang, CHỈ TK CHÍNH đang rớt kết nối + có extension + còn phiên Zalo
    // trên trình duyệt → tự login lại nền (1 lần/lần mở trang). TK phụ KHÔNG tự nối (tránh
    // "refresh kết nối liên tục") — user bấm tay khi cần. Không có phiên → im lặng, không nag.
    let _autoRenewTried = false;
    async function autoRenewZalo() {
        if (_autoRenewTried) return;
        _autoRenewTried = true;
        if (!window.Web2Ext?.hasExtension?.()) return;
        const stale = (state.accounts || []).filter(
            (a) =>
                a.accountType === 'personal' &&
                a.isActive &&
                a.isPrimary &&
                a.status !== 'connected'
        );
        for (const a of stale) {
            try {
                await loginZaloCookie(a.accountKey, true); // silent
            } catch (e) {
                /* im lặng */
            }
        }
    }

    // ── QR login flow ──────────────────────────────────────────────────
    async function startQr(key) {
        openQrModal('Đang tạo mã QR…');
        state.qr.key = key;
        try {
            const r = await window.ZaloApi.loginQr(key);
            if (r.alreadyConnected) {
                closeQrModal();
                notify('Tài khoản đã kết nối', 'success');
                return loadAccounts();
            }
            pollQr(key);
        } catch (e) {
            $('#wzQrStatus').innerHTML = `<span class="wz-err">${esc(e.message)}</span>`;
        }
    }

    function pollQr(key) {
        clearInterval(state.qr.timer);
        let errCount = 0;
        state.qr.timer = setInterval(async () => {
            if (state.qr.key !== key) return clearInterval(state.qr.timer);
            try {
                const r = await window.ZaloApi.qr(key);
                errCount = 0;
                if (r.image && $('#wzQrImg')) {
                    $('#wzQrImg').src = r.image;
                    $('#wzQrImg').style.visibility = 'visible';
                    $('#wzQrFrame')?.classList.remove('is-waiting'); // tắt vòng xoay khi đã có QR
                }
                const lbl = STATUS_LABEL[r.status] || r.status || '';
                $('#wzQrStatus').innerHTML = r.scanned?.name
                    ? `Đã quét: <b>${esc(r.scanned.name)}</b> — xác nhận trên điện thoại`
                    : r.status === 'error'
                      ? `<span class="wz-err">${esc(r.error || 'Lỗi đăng nhập')}</span>`
                      : esc(lbl);
                if (r.status === 'connected') {
                    clearInterval(state.qr.timer);
                    closeQrModal();
                    notify('Đăng nhập Zalo thành công!', 'success');
                    loadAccounts();
                } else if (r.status === 'qr_expired' || r.status === 'declined') {
                    clearInterval(state.qr.timer);
                }
            } catch (e) {
                // chịu được vài lần lỗi mạng tạm thời; quá ngưỡng thì dừng + báo
                if (++errCount >= 4) {
                    clearInterval(state.qr.timer);
                    const el = $('#wzQrStatus');
                    if (el)
                        el.innerHTML = `<span class="wz-err">${esc(e.message || 'Lỗi mạng — đóng và thử lại')}</span>`;
                }
            }
        }, 1500);
    }

    function openQrModal(msg) {
        $('#wzQrImg').src = '';
        $('#wzQrImg').style.visibility = 'hidden';
        $('#wzQrFrame')?.classList.add('is-waiting');
        $('#wzQrStatus').textContent = msg || '';
        showModal('#wzQrModal');
    }
    function closeQrModal() {
        clearInterval(state.qr.timer);
        state.qr.key = null;
        hideModal('#wzQrModal');
    }

    // ── Add personal account modal (thay prompt() — thân thiện hơn) ────────
    function addPersonal() {
        $('#wzAddLabel').value = 'Zalo shop';
        showModal('#wzAddModal');
    }
    async function saveAddPersonal() {
        const label = ($('#wzAddLabel').value || '').trim() || 'Zalo shop';
        const btn = $('#wzAddSave');
        setBusy(btn, true);
        try {
            const r = await window.ZaloApi.createAccount(label);
            hideModal('#wzAddModal');
            await loadAccounts();
            if (r.data?.accountKey) startQr(r.data.accountKey);
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    // THÊM tài khoản bằng phiên chat.zalo.me (cookie) — KHÔNG quét QR (2026-06-20).
    // Tạo slot MỚI (chưa có uid) rồi cookie-login → guard expectedUid=null nhận đúng
    // account đang mở trên chat.zalo.me. Đây là đường THÊM account mới qua cookie
    // (trước đây cookie chỉ re-connect slot cũ; thêm account mới chỉ có QR).
    // Login fail (no_session / hủy / WRONG…) → XOÁ slot rỗng vừa tạo (tránh slot rác).
    async function saveAddPersonalCookie() {
        const label = ($('#wzAddLabel').value || '').trim() || 'Zalo shop';
        const btn = $('#wzAddSaveCookie');
        if (!window.Web2Ext?.hasExtension?.()) {
            await Popup.warning(
                'Cần cài tiện ích N2Store để đăng nhập bằng phiên Zalo đang mở. Hoặc dùng "Tạo & quét QR".'
            );
            return;
        }
        setBusy(btn, true);
        let newKey = null;
        try {
            const r = await window.ZaloApi.createAccount(label);
            newKey = r.data?.accountKey;
            if (!newKey) throw new Error('Không tạo được tài khoản');
            const ok = await loginZaloCookie(newKey, false); // hiện feedback
            if (ok) {
                hideModal('#wzAddModal');
            } else if (newKey) {
                // Không lấy được phiên / hủy → xoá slot rỗng vừa tạo.
                try {
                    await window.ZaloApi.deleteAccount(newKey);
                } catch (_) {}
            }
            await loadAccounts();
        } catch (e) {
            notify('✗ ' + e.message, 'error');
            if (newKey) {
                try {
                    await window.ZaloApi.deleteAccount(newKey);
                } catch (_) {}
            }
        } finally {
            setBusy(btn, false);
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
    WZApp.startQr = startQr;
    WZApp.closeQrModal = closeQrModal;
    WZApp.addPersonal = addPersonal;
    WZApp.saveAddPersonal = saveAddPersonal;
    WZApp.saveAddPersonalCookie = saveAddPersonalCookie;
    WZApp.openOaModal = openOaModal;
    WZApp.closeOaModal = closeOaModal;
    WZApp.saveOa = saveOa;
})();
