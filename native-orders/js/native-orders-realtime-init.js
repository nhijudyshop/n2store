// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — SSE subscriptions + KPI scope banner + init() wiring. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // 3W4: gỡ kênh WebSocket legacy (rtConnect → wss://n2store-fallback) — chạy
    // song song với SSE bên dưới gây reload đôi (bug SO-ws-sse-double).
    // Lưu ý: live-refresh modal interactions + flash row (cần full order trong
    // WS payload) không còn — SSE chỉ mang {action, code} → reload bảng debounce.

    // ---------- SSE subscription cho data CRUD (Web2SSE bridge) ----------
    // Server side gọi notifyClients('web2:native-orders', { action, code, ts })
    // sau mỗi POST/PATCH/DELETE → client tự reload list.
    NO._sseUnsubscribe = null;

    NO._sseUnsubCk = null;
    // web2:payment-signals (badge "KH báo đã CK")
    NO._sseUnsubCust = null;
    // web2:customers (kho KH đổi → re-enrich)
    NO._sseReloadTimer = null;

    NO._scheduleReload = function _scheduleReload(reason) {
        // Debounce 600ms để gom nhiều mutation gần nhau thành 1 reload.
        if (NO._sseReloadTimer) clearTimeout(NO._sseReloadTimer);
        NO._sseReloadTimer = setTimeout(() => {
            NO._sseReloadTimer = null;
            console.log('[NativeOrders-SSE] reload:', reason);
            NO.load();
        }, 600);
    };

    NO._sseConnect = function _sseConnect() {
        if (!window.Web2SSE?.subscribe) {
            console.warn('[NativeOrders-SSE] Web2SSE not loaded — skip realtime data sync');
            return;
        }
        if (NO._sseUnsubscribe) return;
        // Đơn web đổi → reload (badge state, total, …).
        NO._sseUnsubscribe = window.Web2SSE.subscribe('web2:native-orders', (msg) =>
            NO._scheduleReload(`native-orders ${msg.data?.action || ''} ${msg.data?.code || ''}`)
        );
        // KH nhắn "đã ck"/"ck xong" (signal mới) HOẶC watcher tự khớp tiền → badge
        // "💸 KH báo đã CK" hiện/đổi xanh LIVE, không cần refresh tay.
        NO._sseUnsubCk = window.Web2SSE.subscribe('web2:payment-signals', (msg) =>
            NO._scheduleReload(`payment-signal ${msg.data?.action || ''}`)
        );
        // Kho KH (web2_customers) đổi ở BẤT KỲ trang nào (trạng thái/tên/SĐT/địa chỉ)
        // → reload để re-enrich → native-orders tự cập nhật (1 nguồn chung, thay nút "Lấy WEB2").
        NO._sseUnsubCust = window.Web2SSE.subscribe('web2:customers', (msg) =>
            NO._scheduleReload(`web2-customers ${msg.data?.action || ''}`)
        );
        // 2026-06-21: TAG đơn auto (cột "Thẻ") phụ thuộc tồn kho/SP (cho_hang, âm mã),
        // PBH (pbh_created), và config thẻ. Đổi ở máy/đơn khác → reload để server tính
        // lại o.autoTags + o.hasChoHang. Tất cả gom vào _scheduleReload (debounce 600ms).
        NO._sseUnsubProducts = window.Web2SSE.subscribe('web2:products', (msg) =>
            NO._scheduleReload(`web2-products ${msg.data?.action || ''}`)
        );
        NO._sseUnsubFso = window.Web2SSE.subscribe('web2:fast-sale-orders', (msg) =>
            NO._scheduleReload(`fast-sale-orders ${msg.data?.action || ''}`)
        );
        NO._sseUnsubOrderTags = window.Web2SSE.subscribe('web2:order-tags', (msg) =>
            NO._scheduleReload(`order-tags ${msg.data?.action || ''}`)
        );
    };

    // ---------- Init ----------
    NO._loadAndRenderScopeBanner = async function _loadAndRenderScopeBanner() {
        try {
            const data = await window.NativeOrdersApi.getKpiScope();
            if (!data?.success) return;
            // Admin / no assignments → no banner (sees all)
            if (data.access !== 'restricted' || !Array.isArray(data.scope) || !data.scope.length) {
                return;
            }
            // Render banner trên đầu page (sau header)
            const banner = document.createElement('div');
            banner.id = 'kpiScopeBanner';
            banner.style.cssText =
                'background:#dbeafe;color:#1e40af;padding:8px 16px;border-bottom:1px solid #93c5fd;' +
                'font-size:13px;display:flex;align-items:center;gap:8px;';
            const summary = data.scope
                .map(
                    (s) =>
                        `<strong>${NO.escapeHtml(s.campaign_name)}</strong> STT ${s.fromSTT}-${s.toSTT}`
                )
                .join(' · ');
            banner.innerHTML = `<i data-lucide="filter" style="width:14px;height:14px;"></i>
                <span>Bạn chỉ thấy đơn trong khoảng được phân công: ${summary}</span>`;
            const tabNav = document.querySelector('.tab-navigation, .web2-page-tabs');
            if (tabNav?.parentElement) {
                tabNav.parentElement.insertBefore(banner, tabNav.nextSibling);
            } else {
                document.body.insertBefore(banner, document.body.firstChild);
            }
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.warn('[native-orders] scope banner load fail:', e.message);
        }
    };

    NO.init = function init() {
        if (window.lucide) lucide.createIcons();
        // Sprint 3 KPI: load + render scope banner (NV được phân khoảng → hiển thị)
        NO._loadAndRenderScopeBanner();
        // Phase 14: hydrate customerId filter from URL
        const urlParams = new URLSearchParams(location.search);
        const urlCid = parseInt(urlParams.get('customerId'), 10);
        if (Number.isFinite(urlCid)) NO.STATE.customerId = urlCid;
        // Hydrate search box from `?search=...` (vd link từ web2-products usage popover)
        const urlSearch = urlParams.get('search');
        if (urlSearch) {
            const inp = document.getElementById('filterSearch');
            if (inp) inp.value = urlSearch;
            NO.STATE.search = urlSearch;
        }
        // 3W4: bỏ rtConnect() (WS legacy) — SSE là kênh realtime duy nhất.
        NO._sseConnect();

        // 2026-06-05: click badge "💸 KH báo đã CK" → web2-ck-review (đối chiếu GD
        // SePay + duyệt). Delegated vì badge render động trong bảng.
        document.addEventListener('click', (e) => {
            const badge = e.target.closest?.('[data-ck-review]');
            if (!badge || !window.Web2CkReview) return;
            e.stopPropagation();
            window.Web2CkReview.openReview({
                signalId: Number(badge.dataset.ckReview),
                phone: badge.dataset.ckPhone || '',
                name: badge.dataset.ckName || '',
                onDone: () => NO.load(),
            });
        });

        // 2026-06-07: click badge "⚠ Chưa nhận CK" → picker gán giao dịch CK từ
        // balance-history (tìm theo tên, sửa được) → link GD vào KH → cộng ví →
        // tự áp vào đơn → hết cảnh báo. Delegated.
        document.addEventListener('click', (e) => {
            const badge = e.target.closest?.('[data-action="assign-ck"]');
            if (!badge || !window.Web2CkAssignPicker) return;
            e.stopPropagation();
            window.Web2CkAssignPicker.open({
                orderCode: badge.dataset.code || '',
                phone: badge.dataset.phone || '',
                name: badge.dataset.name || '',
                total: Number(badge.dataset.total) || 0,
                onDone: () => NO.load(),
            });
        });

        // Apply/Clear/Refresh/Export buttons removed in single-row layout —
        // filters now auto-apply on change (debounced for search input).
        // Reset STT button removed 2026-06-02 — STT giờ auto reset theo campaign
        // (logic backend MAX+1 scoped by campaign group), không cần thao tác thủ công.
        let searchDebounce = null;
        NO.$('#filterSearch')?.addEventListener('input', () => {
            NO.renderSearchSuggest(); // gợi ý tức thì từ data đã tải
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => NO.applyFilters(), 350);
        });
        NO.$('#filterSearch')?.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                if (NO.moveSuggestActive(1)) e.preventDefault();
                return;
            }
            if (e.key === 'ArrowUp') {
                if (NO.moveSuggestActive(-1)) e.preventDefault();
                return;
            }
            if (e.key === 'Escape') return NO.hideSearchSuggest();
            if (e.key === 'Enter') {
                // Đang trỏ 1 gợi ý → chọn nó; ngược lại tìm tự do như cũ.
                if (NO._suggestActive >= 0 && NO._suggestItems[NO._suggestActive]) {
                    e.preventDefault();
                    return NO.pickSuggestion(NO._suggestActive);
                }
                clearTimeout(searchDebounce);
                NO.hideSearchSuggest();
                NO.applyFilters();
            }
        });
        NO.$('#filterSearch')?.addEventListener('focus', () => {
            if (NO.$('#filterSearch').value.trim()) NO.renderSearchSuggest();
        });
        // blur trễ 120ms để mousedown trên item kịp chạy trước khi đóng.
        NO.$('#filterSearch')?.addEventListener('blur', () =>
            setTimeout(() => NO.hideSearchSuggest(), 120)
        );
        // Auto-apply when Status / Limit dropdowns change
        NO.$('#filterStatus')?.addEventListener('change', NO.applyFilters);
        NO.$('#filterLimit')?.addEventListener('change', NO.applyFilters);
        // Thẻ + Thống kê → Bảng điều khiển trượt phải (native-orders-control-drawer.js tự dựng
        // nút toggle + drawer + wiring). Không còn chip/dropdown trên toolbar.
        // 2026-06-04: tab kênh đơn (Livestream / Inbox) + nút Thêm đơn inbox.
        // Đồng bộ UI (tab active + nút Thêm đơn inbox + ẩn bộ lọc chiến dịch) theo
        // STATE.channel hiện tại. Gọi lúc init (channel restore từ localStorage) và
        // mỗi lần đổi tab.
        NO._syncChannelUi();
        NO.$('#channelTabs')?.addEventListener('click', (e) => {
            const tab = e.target.closest('.no-channel-tab');
            if (!tab) return;
            NO.$('#channelTabs')
                .querySelectorAll('.no-channel-tab')
                .forEach((t) => t.classList.remove('is-active'));
            tab.classList.add('is-active');
            NO.STATE.channel = tab.dataset.channel;
            NO.saveChannel(NO.STATE.channel); // nhớ tab qua refresh
            NO._syncChannelUi();
            NO.STATE.page = 1;
            NO.load();
        });
        NO.$('#btnAddInboxOrder')?.addEventListener('click', NO.openAddInboxOrder);
        NO.$('#filterSearchClear')?.addEventListener('click', () => {
            const el = NO.$('#filterSearch');
            if (el) {
                el.value = '';
                NO.STATE.search = '';
                NO.STATE.page = 1;
                NO.hideSearchSuggest();
                NO.load();
            }
        });
        // (đã gỡ cặp listener filterStatus/filterLimit trùng — trước gắn 2 lần làm
        //  applyFilters chạy đôi mỗi lần đổi dropdown. Giữ bản ở trên, audit 2026-06-20)

        // Campaign filter — GOM 1 NGUỒN: Web2CampaignPicker (thay 2 dropdown cha+con cũ).
        // Chọn 1 chiến dịch cha → onChange set parentPostIds → lọc đơn theo fb_post_id.
        // Tạo/gán chiến dịch 1 nguồn = trang campaign-manager (native-orders chỉ CHỌN để lọc).
        NO.mountCampaignPicker();
        // Check-all + per-row check + bulk bar
        NO.$('#checkAll')?.addEventListener('change', (e) => {
            document.querySelectorAll('#ordersTbody .row-check').forEach((c) => {
                c.checked = e.target.checked;
            });
            NO.updateBulkBar();
        });
        // Per-row checkbox event delegation
        NO.$('#ordersTbody')?.addEventListener('change', (e) => {
            if (e.target?.classList?.contains('row-check')) NO.updateBulkBar();
        });
        NO.$('#ordersBulkPbh')?.addEventListener('click', NO.bulkCreatePbh);
        NO.$('#ordersBulkMerge')?.addEventListener('click', NO.bulkMergeOrders);
        NO.$('#ordersBulkPrintBill')?.addEventListener('click', NO.bulkPrintBills);
        NO.$('#ordersBulkSendMessage')?.addEventListener('click', NO.bulkSendMessage);
        NO.$('#ordersBulkUnselect')?.addEventListener('click', NO.unselectAllOrders);

        // Phase 16: column show/hide toggle
        NO.applyColumnVisibility();
        NO.$('#btnColumnToggle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            NO.toggleColumnPanel();
        });
        // Click outside the panel → close it
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('columnTogglePanel');
            if (!panel || panel.style.display === 'none') return;
            if (!panel.contains(e.target) && e.target?.id !== 'btnColumnToggle') {
                panel.style.display = 'none';
            }
        });

        // Modal — click overlay KHÔNG đóng modal (tránh mất data khi nhập dở).
        // Chỉ X / Hủy / ESC mới đóng.
        NO.$('#btnCloseModal')?.addEventListener('click', NO.closeEdit);
        NO.$('#btnCancelEdit')?.addEventListener('click', NO.closeEdit);
        NO.$('#btnSaveEdit')?.addEventListener('click', NO.saveEdit);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && NO.modal()?.classList.contains('active')) NO.closeEdit();
        });

        // First load
        NO.load();
    };
})();
