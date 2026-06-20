// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2CustomerChat — ENTRY (launcher chat KH dùng chung mọi trang web2)
// open()    : drawer phải, 2 tab Pancake | Zalo, lazy-mount khi xem tab.
//             layout:'modal' → route sang openModal (3-cột Pancake).
// openModal : (module web2-customer-chat-modal.js) — 3-cột sidebar+thread.
//
//   Web2CustomerChat.open({ phone, name?, channel? })   // channel: 'pancake'|'zalo'
//   Web2CustomerChat.resolvePancakeConv(phone)          // → conv | null (tái dùng)
//
// Load order (HTML): core → modal → entry (file này) — entry LAST.
// REUSE: Web2ChatPanel (Pancake UI, lazy) · Web2Zalo.mountChat (Zalo) ·
//        Web2Chat (API) · Web2Ext (bypass 24h) · Web2Lottie (hiệu ứng).
// =====================================================================
(function (global) {
    if (global.Web2CustomerChat) return;
    const NS = global.__Web2CustChatNS;
    if (!NS || !NS._coreReady || !NS.openModal) {
        console.error('[Web2CustomerChat] thiếu module phụ thuộc — load core + modal trước entry.');
        return;
    }

    const {
        notify,
        esc,
        getActive,
        setActive,
        loadPanelBundle,
        resolvePancakeConv,
        _resolveConvByFbId,
        buildPancakeAdapter,
        ensureStyles,
        _stateHtml,
        openModal,
    } = NS;

    async function open(opts = {}) {
        // layout:'modal' → giao diện 3-cột Pancake (sidebar tìm kiếm + thread + info).
        // Mặc định 'drawer' (giữ nguyên 11 caller cũ — zero risk).
        if (opts.layout === 'modal') return openModal(opts);
        const phone = String(opts.phone || '').trim();
        const fbId = String(opts.fbId || opts.fbUserId || '').trim();
        const pageId = String(opts.pageId || opts.fbPageId || '').trim();
        if (!phone && !(fbId && pageId) && !opts.conversationId) {
            notify('Thiếu SĐT / Facebook của khách', 'warning');
            return null;
        }
        const _act = getActive();
        if (_act) _act.close();
        ensureStyles();
        const name = opts.name || '';
        // Bật/tắt từng kênh + mở Zalo theo conversationId (vd jt-tracking nhóm Zalo).
        const pancakeEnabled = opts.pancakeEnabled !== false;
        const zaloEnabled = opts.zaloEnabled !== false;
        const convId = String(opts.conversationId || '').trim();
        let channel = opts.channel === 'zalo' ? 'zalo' : 'pancake';
        if (!pancakeEnabled) channel = 'zalo';
        if (!zaloEnabled) channel = 'pancake';

        const back = document.createElement('div');
        back.className = 'w2cc-back web2-theme';
        back.innerHTML = `
            <div class="w2cc-drawer" role="dialog" aria-modal="true" aria-label="Chat với khách">
                <div class="w2cc-head">
                    <div class="w2cc-head-who"><b>${esc(name || 'Khách')}</b>${phone ? `<span class="w2cc-phone" data-w2cc="copyphone" role="button" tabindex="0" title="Bấm để copy SĐT">${esc(phone)}</span>` : `<span style="font-size:12px;color:var(--web2-text-mute,#6b7280)">${fbId ? 'Facebook …' + esc(fbId.slice(-6)) : ''}</span>`}</div>
                    <button class="w2cc-x" data-w2cc="close" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="w2cc-tabs"${pancakeEnabled && zaloEnabled ? '' : ' style="display:none"'}>
                    ${pancakeEnabled ? `<button class="w2cc-tab ${channel === 'pancake' ? 'on' : ''}" data-w2cc-tab="pancake"><i data-lucide="facebook"></i> Pancake</button>` : ''}
                    ${zaloEnabled ? `<button class="w2cc-tab ${channel === 'zalo' ? 'on' : ''}" data-w2cc-tab="zalo"><i data-lucide="message-circle"></i> Zalo</button>` : ''}
                </div>
                <div class="w2cc-panes">
                    <div class="w2cc-pane" data-w2cc-pane="pancake" ${channel === 'pancake' ? '' : 'hidden'}></div>
                    <div class="w2cc-pane" data-w2cc-pane="zalo" ${channel === 'zalo' ? '' : 'hidden'}></div>
                </div>
            </div>`;
        document.body.appendChild(back);
        requestAnimationFrame(() => back.classList.add('show'));
        global.lucide?.createIcons?.();

        const paneEl = (ch) => back.querySelector(`[data-w2cc-pane="${ch}"]`);
        const mounted = { pancake: false, zalo: false };
        let panelInst = null;
        let zaloHandle = null;

        async function mountPancake() {
            if (mounted.pancake) return;
            mounted.pancake = true;
            const host = paneEl('pancake');
            host.innerHTML = _stateHtml('loading', 'Đang tìm hội thoại Pancake…');
            global.Web2Lottie?.scan?.(host);
            try {
                await loadPanelBundle();
                // Ưu tiên resolve theo SĐT (proven, quét mọi page) → fallback fbId+pageId
                // của đơn (khi KH không có / không match SĐT trong hội thoại Pancake).
                let conv = phone ? await resolvePancakeConv(phone) : null;
                if (!conv) conv = await _resolveConvByFbId(fbId, pageId);
                if (!conv || !global.Web2ChatPanel) {
                    host.innerHTML = _stateHtml('empty', 'Khách chưa có hội thoại Pancake');
                    global.Web2Lottie?.scan?.(host);
                    global.lucide?.createIcons?.();
                    return;
                }
                host.innerHTML = '';
                panelInst = global.Web2ChatPanel.mount(host, { mode: 'full' });
                panelInst.open(conv, buildPancakeAdapter(conv));
                // tự cuộn xuống cùng sau khi render (ảnh/layout settle muộn)
                setTimeout(() => panelInst?.scrollToBottom?.(), 500);
            } catch (e) {
                host.innerHTML = _stateHtml('empty', 'Lỗi mở chat Pancake: ' + (e?.message || ''));
                global.lucide?.createIcons?.();
            }
        }
        async function mountZalo() {
            if (mounted.zalo) return;
            mounted.zalo = true;
            const host = paneEl('zalo');
            host.innerHTML = `<div id="w2ccZaloBody" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>`;
            if (!global.Web2Zalo?.mountChat) {
                host.innerHTML = _stateHtml('empty', 'Zalo chưa sẵn sàng');
                global.lucide?.createIcons?.();
                return;
            }
            try {
                // 2026-06-20: chat 1-1 (theo SĐT) → ưu tiên TK đang đăng nhập chat.zalo.me
                // (cookie) để gửi. Nhóm (mở theo convId) giữ TK trong nhóm (không override).
                let preferKey = null;
                if (phone && !convId) {
                    try {
                        preferKey = await global.Web2Zalo.getCookieAccountKey?.();
                    } catch (_) {}
                }
                zaloHandle = await global.Web2Zalo.mountChat(host.querySelector('#w2ccZaloBody'), {
                    phone,
                    convId: convId || undefined, // mở theo conversationId (vd nhóm Zalo jt-tracking)
                    autoSeen: true,
                    preferAccountKey: preferKey || undefined,
                });
                if (!zaloHandle) {
                    host.innerHTML = _stateHtml('empty', 'Khách chưa có hội thoại Zalo');
                    global.Web2Lottie?.scan?.(host);
                    global.lucide?.createIcons?.();
                } else {
                    setTimeout(() => _scrollZalo(host), 500); // tự cuộn xuống cùng
                    // Callback sau khi mount xong (vd jt-tracking cuộn tới tin có mã vận đơn).
                    try {
                        opts.onReady?.(zaloHandle, host);
                    } catch {}
                }
            } catch (e) {
                host.innerHTML = _stateHtml('empty', 'Lỗi mở chat Zalo: ' + (e?.message || ''));
                global.lucide?.createIcons?.();
            }
        }
        function _scrollZalo(host) {
            const b = host?.querySelector('.wz-chat-body');
            if (b) b.scrollTop = b.scrollHeight;
        }

        function showTab(ch) {
            channel = ch;
            // cuộn xuống cùng khi quay lại tab đã mount
            if (ch === 'pancake' && mounted.pancake)
                setTimeout(() => panelInst?.scrollToBottom?.(), 60);
            if (ch === 'zalo' && mounted.zalo) setTimeout(() => _scrollZalo(paneEl('zalo')), 60);
            back.querySelectorAll('.w2cc-tab').forEach((b) =>
                b.classList.toggle('on', b.dataset.w2ccTab === ch)
            );
            back.querySelectorAll('.w2cc-pane').forEach((p) => {
                p.hidden = p.dataset.w2ccPane !== ch;
            });
            if (ch === 'pancake') mountPancake();
            else mountZalo();
        }

        const close = () => {
            try {
                panelInst?.destroy?.();
            } catch {}
            try {
                zaloHandle?.destroy?.();
            } catch {}
            back.classList.remove('show');
            setTimeout(() => back.remove(), 220);
            document.removeEventListener('keydown', onEsc);
            if (getActive() && getActive()._back === back) setActive(null);
        };
        function onEsc(ev) {
            if (ev.key === 'Escape') close();
        }
        back.addEventListener('click', (e) => {
            if (e.target === back) close();
            const tb = e.target.closest?.('[data-w2cc-tab]');
            if (tb) showTab(tb.dataset.w2ccTab);
            if (e.target.closest?.('[data-w2cc="close"]')) close();
            if (e.target.closest?.('[data-w2cc="copyphone"]')) _copyPhone();
        });
        function _copyPhone() {
            const done = () => notify('Đã copy SĐT: ' + phone, 'success');
            if (navigator.clipboard?.writeText)
                navigator.clipboard.writeText(phone).then(done).catch(done);
            else done();
        }
        document.addEventListener('keydown', onEsc);

        const handle = { close, _back: back };
        setActive(handle);
        showTab(channel); // mount kênh mặc định
        return handle;
    }

    global.Web2CustomerChat = { open, resolvePancakeConv };
})(window);
