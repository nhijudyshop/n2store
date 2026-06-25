// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2CustomerChat — MODAL (openModal): giao diện 3-cột Pancake — sidebar
// tìm kiếm hội thoại + danh sách + thread mount + (info panel). Hỗ trợ
// readonly, query (tìm-trước), onPick (picker mode), phone/fbId/pageId.
// Phụ thuộc core qua window.__Web2CustChatNS.
// =====================================================================
(function (global) {
    const NS = (global.__Web2CustChatNS = global.__Web2CustChatNS || {});
    if (NS.openModal) return;

    // ── openModal(): 3-cột Pancake — sidebar tìm kiếm hội thoại + thread ──
    async function openModal(opts = {}) {
        const {
            esc,
            getActive,
            setActive,
            loadPanelBundle,
            _getPageIds,
            resolvePancakeConv,
            _resolveConvByFbId,
            buildPancakeAdapter,
            ensureStyles,
            _stateHtml,
            _convRowHtml,
            _mergeConvs,
        } = NS;

        const phone = String(opts.phone || '').trim();
        const fbId = String(opts.fbId || opts.fbUserId || '').trim();
        const pageId = String(opts.pageId || opts.fbPageId || '').trim();
        const readonly = !!opts.readonly;
        const showInfo = !!(opts.panels && opts.panels.info);
        const _act = getActive();
        if (_act) _act.close();
        ensureStyles();
        await loadPanelBundle();

        const back = document.createElement('div');
        back.className = 'w2cc-mback web2-theme';
        back.innerHTML = `
            <div class="w2cc-modal" role="dialog" aria-modal="true" aria-label="Chat khách hàng">
                <div class="w2cc-mhead">
                    <b><i data-lucide="messages-square" style="width:17px;height:17px;vertical-align:-3px"></i> Chat khách hàng</b>
                    <button class="w2cc-x" data-w2cc="close" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="w2cc-grid${showInfo ? ' has-info' : ''}">
                    <aside class="w2cc-side">
                        <div class="w2cc-side-search"><input type="text" data-w2cc="search" placeholder="Tìm hội thoại theo tên / SĐT…" autocomplete="off"></div>
                        <div class="w2cc-side-list" data-w2cc="list"><div class="w2cc-side-empty">Đang tải hội thoại…</div></div>
                    </aside>
                    <main class="w2cc-main" data-w2cc="thread">${_stateHtml('loading', 'Đang tải…')}</main>
                    ${showInfo ? `<aside class="w2cc-info" data-w2cc="info">${opts.panels.info}</aside>` : ''}
                </div>
            </div>`;
        document.body.appendChild(back);
        requestAnimationFrame(() => back.classList.add('show'));
        global.lucide?.createIcons?.();
        global.Web2Lottie?.scan?.(back);

        const listEl = back.querySelector('[data-w2cc="list"]');
        const threadEl = back.querySelector('[data-w2cc="thread"]');
        const searchEl = back.querySelector('[data-w2cc="search"]');
        let panelInst = null;
        let currentAdapter = null; // giữ adapter để refreshActive() (SSE web2:messages)
        let selectedConvId = null;
        let baseConvs = [];

        function markSelected() {
            listEl
                .querySelectorAll('.w2cc-row')
                .forEach((r) => r.classList.toggle('on', r.dataset.convId === selectedConvId));
        }
        function selectConv(conv) {
            if (!conv || !conv.id || !global.Web2ChatPanel) return;
            selectedConvId = String(conv.id);
            markSelected();
            try {
                panelInst?.destroy?.();
            } catch {}
            threadEl.innerHTML = '';
            currentAdapter = buildPancakeAdapter(conv);
            // Feature 3: caller (vd native-orders) truyền opts.onAddEntity → đính lên
            // adapter để Web2ChatPanel hiện thanh "Phát hiện SĐT/địa chỉ → Thêm vào".
            if (typeof opts.onAddEntity === 'function') {
                currentAdapter.onAddEntity = opts.onAddEntity;
                if (opts.addEntityLabel) currentAdapter.addEntityLabel = opts.addEntityLabel;
            }
            panelInst = global.Web2ChatPanel.mount(threadEl, {
                mode: readonly ? 'readonly' : 'full',
            });
            panelInst.open(conv, currentAdapter);
            setTimeout(() => panelInst?.scrollToBottom?.(), 400);
        }
        function renderRows(convs) {
            if (!convs.length) {
                listEl.innerHTML = `<div class="w2cc-side-empty">Không có hội thoại</div>`;
                return;
            }
            listEl.innerHTML = convs.map(_convRowHtml).join('');
            markSelected();
        }
        async function loadInitial() {
            const pageIds = _getPageIds();
            if (!pageIds.length) {
                listEl.innerHTML = `<div class="w2cc-side-empty">Chưa cấu hình page Pancake</div>`;
                return;
            }
            try {
                await global.Web2Chat?.syncFromRenderDB?.();
            } catch {}
            const settled = await Promise.allSettled(
                pageIds.map((pid) => global.Web2Chat.fetchConversationsByPage(pid, { limit: 50 }))
            );
            baseConvs = _mergeConvs(settled, pageIds);
            renderRows(baseConvs);
        }
        let _sTimer = null;
        let _sSeq = 0;
        function wireSearch() {
            searchEl.addEventListener('keydown', (e) => {
                if (e.isComposing || e.keyCode === 229) return; // IME tiếng Việt
            });
            searchEl.addEventListener('input', () => {
                clearTimeout(_sTimer);
                const q = searchEl.value.trim();
                _sTimer = setTimeout(async () => {
                    if (!q) return renderRows(baseConvs);
                    const seq = ++_sSeq;
                    listEl.innerHTML = `<div class="w2cc-side-empty">Đang tìm…</div>`;
                    const pageIds = _getPageIds();
                    const settled = await Promise.allSettled(
                        pageIds.map((pid) => global.Web2Chat.searchConversations(pid, q))
                    );
                    if (seq !== _sSeq) return; // kết quả cũ
                    renderRows(_mergeConvs(settled, pageIds));
                }, 300);
            });
        }
        const onPick = typeof opts.onPick === 'function' ? opts.onPick : null;
        listEl.addEventListener('click', (e) => {
            const row = e.target.closest('.w2cc-row');
            if (!row) return;
            const conv = baseConvs.find((c) => String(c.id) === row.dataset.convId) || {
                id: row.dataset.convId,
                page_id: row.dataset.pageId,
                type: 'INBOX',
                customers: [{ id: null, name: row.dataset.name, fb_id: row.dataset.fbId }],
            };
            // Chế độ PICKER (opts.onPick): bấm hội thoại = chọn khách (vd đối soát CK
            // pending-match) → trả info khách rồi đóng, KHÔNG mở thread.
            if (onPick) {
                const cust = (conv.customers && conv.customers[0]) || conv.from || {};
                onPick({
                    phone: cust.phone || cust.phone_number || '',
                    name: row.dataset.name || cust.name || '',
                    fbId: row.dataset.fbId || cust.fb_id || '',
                    pageId: row.dataset.pageId || conv.page_id || '',
                    conv,
                });
                close();
                return;
            }
            selectConv(conv);
        });

        // Auto-chọn hội thoại theo identity (phone → fbId), vẫn cho search/đổi tự do.
        // Picker mode (onPick): KHÔNG auto-mở thread — chỉ hiện hint để bấm chọn khách.
        if (onPick) {
            threadEl.innerHTML = _stateHtml('empty', 'Bấm 1 hội thoại bên trái để chọn khách');
            global.lucide?.createIcons?.();
            global.Web2Lottie?.scan?.(threadEl);
        } else {
            (async () => {
                let conv = null;
                if (phone) conv = await resolvePancakeConv(phone);
                if (!conv) conv = await _resolveConvByFbId(fbId, pageId);
                if (conv) selectConv(conv);
                else {
                    threadEl.innerHTML = _stateHtml('empty', 'Chọn hội thoại bên trái để bắt đầu');
                    global.lucide?.createIcons?.();
                    global.Web2Lottie?.scan?.(threadEl);
                }
            })();
        }

        loadInitial();
        wireSearch();
        // Seed ô tìm kiếm CHỈ khi caller truyền opts.query (chế độ tìm-trước / picker).
        // KHÔNG seed bằng phone → cột trái luôn hiện TẤT CẢ hội thoại; hội thoại của
        // SĐT vẫn được auto-chọn + mở thread (logic resolvePancakeConv ở trên).
        const seedQ = String(opts.query || '').trim();
        if (seedQ) {
            searchEl.value = seedQ;
            searchEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const close = () => {
            try {
                panelInst?.destroy?.();
            } catch {}
            back.classList.remove('show');
            setTimeout(() => back.remove(), 200);
            document.removeEventListener('keydown', onEsc);
            if (getActive() && getActive()._back === back) setActive(null);
        };
        function onEsc(e) {
            if (e.key === 'Escape') close();
        }
        back.addEventListener('click', (e) => {
            if (e.target === back) close();
            if (e.target.closest('[data-w2cc="close"]')) close();
        });
        document.addEventListener('keydown', onEsc);
        const handle = {
            close,
            _back: back,
            switchTab() {},
            getPanel: () => panelInst,
            // Cho caller truy cập cột info đã render (vd wire reply handlers).
            getInfoEl: () => back.querySelector('[data-w2cc="info"]'),
            // Realtime SSE web2:messages → reload thread đang chọn (giữ vị trí cuộn
            // nếu đang đọc lịch sử). Readonly vẫn refresh (chỉ xem, không gửi).
            async refreshActive() {
                const p = panelInst;
                const ad = currentAdapter;
                if (!p || !ad) return;
                try {
                    const r = await ad.loadMessages();
                    if (panelInst === p && r && r.messages) p.setMessages(r.messages);
                } catch (_) {}
            },
        };
        setActive(handle);
        // onReady: caller wire thêm hành vi vào info column / thread sau khi mount
        // (vd native-orders: bind nút trả lời bình luận trong cột info).
        try {
            opts.onReady?.(handle, back);
        } catch (e) {
            console.error('[Web2CustomerChat] onReady error:', e);
        }
        return handle;
    }

    NS.openModal = openModal;
})(window);
