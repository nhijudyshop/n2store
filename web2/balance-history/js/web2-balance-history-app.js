// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — balance-history app (Phase 3 — 100% Web 2.0).
// =====================================================================
// Web2BalanceHistoryApp — orchestrator. init + DOMContentLoaded +
// event binding + date-preset helpers. Logic chia ra các module
// web2-bh-*.js (window.W2BH). Re-export public API window.Web2BalanceHistoryApp.
// KHÔNG dùng /api/sepay/* + /api/v2/balance-history/* nữa — toàn bộ qua
// /api/web2/balance-history/*.
// =====================================================================

(function (global) {
    'use strict';

    const W2BH = global.W2BH || (global.W2BH = {});
    const { state, dom, debounce, notify, load } = W2BH;

    // ----- Events -----
    function bindEvents() {
        if (dom.search) {
            dom.search.addEventListener(
                'input',
                debounce(() => {
                    state.search = dom.search.value.trim();
                    state.page = 1;
                    load();
                }, 350)
            );
        }
        if (dom.pageSize) {
            dom.pageSize.addEventListener('change', () => {
                state.pageSize = Number(dom.pageSize.value) || 50;
                state.page = 1;
                load();
            });
        }
        if (dom.refreshBtn) {
            dom.refreshBtn.addEventListener('click', () => load());
        }
        const chatBtn = document.getElementById('w2bhChatBtn');
        if (chatBtn) {
            chatBtn.addEventListener('click', () => {
                if (window.Web2CustomerChat?.open)
                    window.Web2CustomerChat.open({ layout: 'modal', readonly: true });
                else notify('Module hội thoại chưa load', 'warning');
            });
        }
        if (dom.reprocessBtn) {
            dom.reprocessBtn.addEventListener('click', () => W2BH.reprocessUnmatched());
        }
        if (dom.autoAssignBtn) {
            dom.autoAssignBtn.addEventListener('click', () => W2BH.autoAssign());
        }
        if (dom.dateFrom) {
            dom.dateFrom.addEventListener('change', () => {
                state.dateFrom = dom.dateFrom.value || '';
                state.page = 1;
                _updateDatePresetActive();
                load();
            });
        }
        if (dom.dateTo) {
            dom.dateTo.addEventListener('change', () => {
                state.dateTo = dom.dateTo.value || '';
                state.page = 1;
                _updateDatePresetActive();
                load();
            });
        }
        if (dom.dateClear) {
            dom.dateClear.addEventListener('click', () => {
                state.dateFrom = '';
                state.dateTo = '';
                if (dom.dateFrom) dom.dateFrom.value = '';
                if (dom.dateTo) dom.dateTo.value = '';
                state.page = 1;
                _updateDatePresetActive();
                load();
            });
        }
        if (dom.datePresets) {
            dom.datePresets.addEventListener('click', (e) => {
                const btn = e.target.closest('.w2bh-date-preset');
                if (!btn) return;
                const key = btn.dataset.preset;
                if (!key) return;
                // Toggle: bấm preset đang active → xoá filter (xem tất cả)
                if (btn.classList.contains('is-active')) {
                    state.dateFrom = '';
                    state.dateTo = '';
                    if (dom.dateFrom) dom.dateFrom.value = '';
                    if (dom.dateTo) dom.dateTo.value = '';
                    state.page = 1;
                    _updateDatePresetActive();
                    load();
                    return;
                }
                _applyDatePreset(key);
            });
        }
        if (dom.csvBtn) {
            dom.csvBtn.addEventListener('click', () => W2BH.exportCsv());
        }
        // Cmd/Ctrl + K → focus search
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                dom.search?.focus();
                dom.search?.select();
            }
        });
    }

    function _toISODate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }

    // Tuần bắt đầu Thứ Hai (VN). Date.getDay() trả 0=CN..6=T7 → map Sun→7.
    function _datePresetRange(key, now = new Date()) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (key === 'today') {
            return { from: _toISODate(today), to: _toISODate(today) };
        }
        if (key === 'yesterday') {
            const y = new Date(today);
            y.setDate(today.getDate() - 1);
            return { from: _toISODate(y), to: _toISODate(y) };
        }
        const dowMon = ((today.getDay() + 6) % 7) + 1; // T2=1..CN=7
        if (key === 'thisWeek') {
            const mon = new Date(today);
            mon.setDate(today.getDate() - (dowMon - 1));
            const sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            return { from: _toISODate(mon), to: _toISODate(sun) };
        }
        if (key === 'lastWeek') {
            const monThis = new Date(today);
            monThis.setDate(today.getDate() - (dowMon - 1));
            const monLast = new Date(monThis);
            monLast.setDate(monThis.getDate() - 7);
            const sunLast = new Date(monLast);
            sunLast.setDate(monLast.getDate() + 6);
            return { from: _toISODate(monLast), to: _toISODate(sunLast) };
        }
        if (key === 'thisMonth') {
            const start = new Date(today.getFullYear(), today.getMonth(), 1);
            const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            return { from: _toISODate(start), to: _toISODate(end) };
        }
        if (key === 'lastMonth') {
            const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const end = new Date(today.getFullYear(), today.getMonth(), 0);
            return { from: _toISODate(start), to: _toISODate(end) };
        }
        return null;
    }

    const _PRESET_KEYS = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'];

    function _currentPresetKey(from, to) {
        if (!from || !to) return null;
        const now = new Date();
        for (const key of _PRESET_KEYS) {
            const r = _datePresetRange(key, now);
            if (r && r.from === from && r.to === to) return key;
        }
        return null;
    }

    function _updateDatePresetActive() {
        if (!dom.datePresets) return;
        const active = _currentPresetKey(state.dateFrom, state.dateTo);
        dom.datePresets.querySelectorAll('.w2bh-date-preset').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.preset === active);
        });
    }

    function _applyDatePreset(key) {
        const r = _datePresetRange(key);
        if (!r) return;
        state.dateFrom = r.from;
        state.dateTo = r.to;
        if (dom.dateFrom) dom.dateFrom.value = r.from;
        if (dom.dateTo) dom.dateTo.value = r.to;
        state.page = 1;
        _updateDatePresetActive();
        load();
    }

    function init() {
        W2BH.cacheDom();
        if (!dom.root) {
            console.warn('[Web2BalanceHistory] container #web2BhApp not found');
            return;
        }
        // 2026-05-31: mặc định lọc tháng hiện tại (user feedback "mặc định
        // chọn tháng này"). User vẫn xoá filter bằng nút × để xem all.
        const { from, to } = _datePresetRange('thisMonth');
        state.dateFrom = from;
        state.dateTo = to;
        if (dom.dateFrom) dom.dateFrom.value = from;
        if (dom.dateTo) dom.dateTo.value = to;
        _updateDatePresetActive();
        W2BH.renderChips();
        bindEvents();
        load();
        W2BH.setupSSE();
        // Fire auto-reprocess in background after initial render. Web 2.0 = 100%
        // tự động — không để user thấy "Đang xử lý…" lâu cho rows từ legacy backfill.
        setTimeout(() => W2BH.autoReprocessOnLoad(), 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2BalanceHistoryApp = { load, state };
})(window);
