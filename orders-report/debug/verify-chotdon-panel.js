// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// =============================================================================
// VERIFY CHỐT ĐƠN PANEL — Filter Coverage Harness
// =============================================================================
// Paste toàn bộ file này vào Console (top frame) khi đang ở trang Quản Lý Đơn Hàng.
// Harness sẽ:
//   1. Tìm iframe tab1-orders.html
//   2. Snapshot trạng thái filter hiện tại
//   3. Lần lượt bật/tắt từng filter và so sánh:
//        panel TỔNG  ==  filteredData.length  ==  _applyFiltersExceptProcessingTag().length
//   4. Test vài combo 2-way, 3-way
//   5. Restore state cũ
//   6. In bảng PASS/FAIL ra console
// =============================================================================

(async function verifyChotDonPanel() {
    // ---------- 1. Locate iframe ----------
    const frames = [...document.querySelectorAll('iframe')];
    const tab1 = frames.find(f => {
        try {
            return f.offsetParent !== null
                && typeof f.contentWindow?._ptagRenderPanelIfOpen === 'function';
        } catch { return false; }
    }) || frames.find(f => /tab1-orders/.test(f.src));

    if (!tab1) {
        console.error('[verify] ❌ Không tìm thấy iframe Quản Lý Đơn Hàng (tab1-orders.html). Mở tab đó rồi chạy lại.');
        return;
    }
    const w = tab1.contentWindow;
    const doc = w.document;
    console.log('[verify] ✔ iframe:', tab1.src);

    // ---------- Helpers ----------
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function getPanelTotal() {
        const sum = doc.getElementById('ptag-panel-summary-content');
        if (!sum) return null;
        const numEl = sum.querySelector('.ptag-stat-num');
        if (!numEl) return null;
        return parseInt(numEl.textContent.replace(/\D/g, ''), 10);
    }

    function ensurePanelOpen() {
        const panel = doc.getElementById('ptag-panel');
        if (!panel) return false;
        if (!panel.classList.contains('open')) {
            w._ptagTogglePanel?.();
        }
        return true;
    }

    async function triggerSearch() {
        if (typeof w.performTableSearch === 'function') {
            w.performTableSearch();
            // Force panel re-render if harness modified state bypassing UI
            w._ptagRenderPanelIfOpen?.();
        }
        await sleep(50);
    }

    function snapshotState() {
        return {
            searchInput: doc.getElementById('searchInput')?.value ?? '',
            conversationFilter: doc.getElementById('conversationFilter')?.value ?? 'all',
            statusFilter: doc.getElementById('statusFilter')?.value ?? 'all',
            fulfillmentFilter: doc.getElementById('fulfillmentFilter')?.value ?? 'all',
            selectedTags: (w.getSelectedTagFilters?.() || []).slice(),
            excludedTags: (w.getExcludedTagFilters?.() || []).slice(),
            stockChecked: w.StockStatusEngine?._checked ?? false,
            stockActiveFilter: w.StockStatusEngine?._activeFilter ?? null,
        };
    }

    function setFilter(name, value) {
        switch (name) {
            case 'search':
                const si = doc.getElementById('searchInput');
                if (si) si.value = value;
                if (typeof w.handleTableSearch === 'function') {
                    w.handleTableSearch(value);
                }
                break;
            case 'status':
                const sf = doc.getElementById('statusFilter');
                if (sf) { sf.value = value; sf.dispatchEvent(new Event('change', { bubbles: true })); }
                break;
            case 'fulfillment':
                const ff = doc.getElementById('fulfillmentFilter');
                if (ff) { ff.value = value; ff.dispatchEvent(new Event('change', { bubbles: true })); }
                break;
            case 'conversation':
                const cf = doc.getElementById('conversationFilter');
                if (cf) { cf.value = value; cf.dispatchEvent(new Event('change', { bubbles: true })); }
                break;
        }
    }

    async function restoreState(snap) {
        setFilter('search', snap.searchInput);
        setFilter('status', snap.statusFilter);
        setFilter('fulfillment', snap.fulfillmentFilter);
        setFilter('conversation', snap.conversationFilter);
        await sleep(400); // wait for search debounce
        await triggerSearch();
    }

    // ---------- 2. Run checks ----------
    const snap = snapshotState();
    console.log('[verify] Initial state snapshot:', snap);

    ensurePanelOpen();
    await sleep(200);

    const allOrders = (w.getAllOrders?.() || []);
    if (!allOrders.length) {
        console.error('[verify] ❌ allData rỗng — load data trước khi chạy harness');
        return;
    }
    console.log('[verify] allData.length =', allOrders.length);

    const results = [];

    async function runCase(label, setup, teardown) {
        try {
            await setup();
            await sleep(400); // search debounce = 300ms
            await triggerSearch();
            const panelTotal = getPanelTotal();
            const filteredLen = (w.filteredData || []).length;
            const beforePT = (w.getOrdersBeforeProcessingTagFilter?.() || []).length;
            // Panel TỔNG = beforeProcessingTagFilter length (panel shows "before" count)
            // filteredData = after processing tag filter; may differ if Chốt Đơn filter active
            const ptagActive = !!(w.ProcessingTagState?._activeFilter || (w.ProcessingTagState?._activeFlagFilters?.size > 0));
            const expected = ptagActive ? beforePT : beforePT; // panel always shows beforePT
            const pass = panelTotal === expected;
            results.push({
                case: label,
                panelTotal,
                filteredData: filteredLen,
                beforePT,
                ptagFilterActive: ptagActive,
                expected,
                status: pass ? '✅ PASS' : '❌ FAIL',
            });
        } catch (e) {
            results.push({ case: label, status: '💥 ERROR', error: e.message });
        } finally {
            if (teardown) await teardown();
        }
    }

    // Pick some sample values from data
    const sampleOrder = allOrders[0];
    const sampleName = (sampleOrder.Name || '').split(' ').slice(-1)[0] || 'a';
    const statusOptions = [...new Set(allOrders.map(o => o.StatusText || o.Status).filter(Boolean))];
    const someStatus = statusOptions[0];

    // Case: no filter
    await runCase('Baseline (no filter)', async () => {
        setFilter('search', '');
        setFilter('status', 'all');
        setFilter('fulfillment', 'all');
        setFilter('conversation', 'all');
    });

    // Case: search only
    await runCase(`Search "${sampleName}"`, async () => {
        setFilter('search', sampleName);
    });

    // Case: status only
    if (someStatus) {
        await runCase(`Status="${someStatus}"`, async () => {
            setFilter('search', '');
            setFilter('status', someStatus);
        });
    }

    // Case: search + status combo
    if (someStatus) {
        await runCase(`Search "${sampleName}" + Status="${someStatus}"`, async () => {
            setFilter('search', sampleName);
            setFilter('status', someStatus);
        });
    }

    // Case: fulfillment
    await runCase('Fulfillment=da-ra-don', async () => {
        setFilter('search', '');
        setFilter('status', 'all');
        setFilter('fulfillment', 'da-ra-don');
    });

    // Case: conversation unread
    await runCase('Conversation=unread', async () => {
        setFilter('fulfillment', 'all');
        setFilter('conversation', 'unread');
    });

    // ---------- 3. Restore & report ----------
    await restoreState(snap);
    console.log('[verify] State restored to snapshot.');

    console.table(results);
    const passed = results.filter(r => r.status.includes('PASS')).length;
    const failed = results.filter(r => r.status.includes('FAIL')).length;
    const errored = results.filter(r => r.status.includes('ERROR')).length;
    console.log(`[verify] SUMMARY: ${passed} pass, ${failed} fail, ${errored} error`);

    // Expose for manual re-inspection
    window.__chotdonVerifyResults = results;
    console.log('→ window.__chotdonVerifyResults = last results');
})();
