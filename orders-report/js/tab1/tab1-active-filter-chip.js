// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ACTIVE FILTER CHIP — chip "Đang bật filter (N)" cạnh nút Hiển thị bộ lọc
// + nút × để clear tất cả filter trong 1 click.
// Hook vào performTableSearch để tự refresh sau mỗi filter change.
// =====================================================
(function () {
    'use strict';

    const CHIP_ID = 'activeFilterChip';
    const TOGGLE_BTN_ID = 'toggleControlBarBtn';

    // Dropdown ID select filter — match HTML.
    const SELECT_FILTERS = [
        { id: 'conversationFilter', label: 'Tin nhắn' },
        { id: 'statusFilter', label: 'Trạng thái' },
        { id: 'fulfillmentFilter', label: 'Ra đơn' },
        { id: 'callHistoryFilter', label: 'Cuộc gọi' },
    ];

    function _getSelectActiveLabel(id, fallbackLabel) {
        const el = document.getElementById(id);
        if (!el || el.value === 'all' || el.value === '') return null;
        const opt = el.options?.[el.selectedIndex];
        const optText = opt?.textContent?.trim();
        return `${fallbackLabel}: ${optText || el.value}`;
    }

    // Trả về { count, labels: string[], hasAny }
    function getActiveFilterSummary() {
        const labels = [];

        // 1. Search input
        const searchVal =
            (typeof window.searchQuery === 'string' && window.searchQuery) ||
            document.getElementById('tableSearchInput')?.value?.trim() ||
            '';
        if (searchVal) labels.push(`Tìm: "${searchVal}"`);

        // 2. Select dropdowns
        for (const f of SELECT_FILTERS) {
            const lbl = _getSelectActiveLabel(f.id, f.label);
            if (lbl) labels.push(lbl);
        }

        // 3. TAG filters (selected tags)
        try {
            const selected =
                (typeof window.getSelectedTagFilters === 'function' &&
                    window.getSelectedTagFilters()) ||
                [];
            if (selected.length > 0) labels.push(`TAG (${selected.length})`);
        } catch (e) {}

        // 4. Excluded TAG filters
        try {
            const excluded =
                (typeof window.getExcludedTagFilters === 'function' &&
                    window.getExcludedTagFilters()) ||
                [];
            if (excluded.length > 0) labels.push(`Ẩn TAG (${excluded.length})`);
        } catch (e) {}

        // 5. Tag XL (ProcessingTag) active filter
        try {
            const ptag = window.ProcessingTagState;
            if (ptag) {
                if (ptag._activeFilter != null) labels.push(`Tag XL`);
                const flagSet = ptag._activeFlagFilters;
                const flagSize =
                    flagSet instanceof Set
                        ? flagSet.size
                        : Array.isArray(flagSet)
                          ? flagSet.length
                          : 0;
                if (flagSize > 0) labels.push(`Cờ XL (${flagSize})`);
            }
        } catch (e) {}

        // 6. Excluded Tag XL
        try {
            const exPtag =
                (typeof window.getExcludedPtagXlFilters === 'function' &&
                    window.getExcludedPtagXlFilters()) ||
                [];
            if (exPtag.length > 0) labels.push(`Ẩn Tag XL (${exPtag.length})`);
        } catch (e) {}

        // 7. "Lọc theo ngày" toggle
        const dateModeToggle = document.getElementById('dateModeToggle');
        if (dateModeToggle?.checked) labels.push('Lọc theo ngày');

        // 8. Stock status filter (subtle but real)
        try {
            if (window.StockStatusEngine?._checked && window.StockStatusEngine?._activeFilter) {
                labels.push('Tồn kho');
            }
        } catch (e) {}

        return {
            count: labels.length,
            labels,
            hasAny: labels.length > 0,
        };
    }

    function _ensureChip() {
        let chip = document.getElementById(CHIP_ID);
        if (chip) return chip;
        const toggleBtn = document.getElementById(TOGGLE_BTN_ID);
        if (!toggleBtn || !toggleBtn.parentNode) return null;

        chip = document.createElement('span');
        chip.id = CHIP_ID;
        chip.style.cssText = [
            'display: none',
            'align-items: center',
            'gap: 6px',
            'margin-left: 10px',
            'padding: 4px 10px',
            'background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            'color: #92400e',
            'border: 1px solid #f59e0b',
            'border-radius: 999px',
            'font-size: 12px',
            'font-weight: 600',
            'vertical-align: middle',
            'animation: filterChipFadeIn 250ms ease-out',
            'cursor: default',
        ].join(';');

        const dot = document.createElement('span');
        dot.style.cssText =
            'width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.25); animation: filterChipPulse 1.4s ease-in-out infinite';

        const text = document.createElement('span');
        text.id = `${CHIP_ID}Text`;
        text.textContent = 'Đang bật filter';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.id = `${CHIP_ID}Clear`;
        closeBtn.title = 'Xoá tất cả filter';
        closeBtn.setAttribute('aria-label', 'Xoá tất cả filter');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = [
            'background: rgba(146, 64, 14, 0.12)',
            'border: none',
            'color: #92400e',
            'width: 20px',
            'height: 20px',
            'border-radius: 50%',
            'font-size: 16px',
            'line-height: 1',
            'cursor: pointer',
            'display: inline-flex',
            'align-items: center',
            'justify-content: center',
            'padding: 0',
            'transition: background 120ms',
        ].join(';');
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'rgba(146, 64, 14, 0.25)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'rgba(146, 64, 14, 0.12)';
        });
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearAllFilters();
        });

        chip.appendChild(dot);
        chip.appendChild(text);
        chip.appendChild(closeBtn);

        // Inject keyframes once
        if (!document.getElementById('activeFilterChipStyles')) {
            const style = document.createElement('style');
            style.id = 'activeFilterChipStyles';
            style.textContent = `
                @keyframes filterChipFadeIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes filterChipPulse { 0%,100% { box-shadow: 0 0 0 3px rgba(245,158,11,0.25); } 50% { box-shadow: 0 0 0 6px rgba(245,158,11,0.10); } }
            `;
            document.head.appendChild(style);
        }

        toggleBtn.insertAdjacentElement('afterend', chip);
        return chip;
    }

    function refreshChip() {
        const chip = _ensureChip();
        if (!chip) return;
        const summary = getActiveFilterSummary();
        const text = document.getElementById(`${CHIP_ID}Text`);

        if (!summary.hasAny) {
            chip.style.display = 'none';
            return;
        }

        chip.style.display = 'inline-flex';
        if (text) {
            text.textContent =
                summary.count === 1 ? 'Đang bật filter' : `Đang bật ${summary.count} filter`;
        }
        chip.title = summary.labels.join('\n');
    }

    // Reset mọi filter dropdown / search / tag / ptag / date toggle
    function clearAllFilters() {
        // 1. Search — phải dùng handleTableSearch('') vì `searchQuery` là biến module-scope
        // trong tab1-core.js, không exposed qua window. Chỉ handler chính reset đúng state.
        const searchInput = document.getElementById('tableSearchInput');
        if (searchInput) searchInput.value = '';
        if (typeof window.handleTableSearch === 'function') {
            window.handleTableSearch('');
        }
        const searchClearBtn = document.getElementById('searchClearBtn');
        if (searchClearBtn) searchClearBtn.classList.remove('active');
        // Sticky search input mirror (some layouts have a 2nd input)
        const stickySearch = document.getElementById('stickySearchInput');
        if (stickySearch) stickySearch.value = '';

        // 2. Select dropdowns → reset to 'all'
        for (const f of SELECT_FILTERS) {
            const el = document.getElementById(f.id);
            if (el) {
                el.value = 'all';
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // 3. TAG filters
        try {
            localStorage.removeItem('orderTableSelectedTags');
            localStorage.removeItem('orderTableExcludedTags');
            if (typeof window.renderTagFilterDropdown === 'function') {
                window.renderTagFilterDropdown();
            }
            if (typeof window.renderExcludedTagFilterDropdown === 'function') {
                window.renderExcludedTagFilterDropdown();
            }
        } catch (e) {}

        // 4. Tag XL (ProcessingTag) — gọi public API để rerender panel
        try {
            const ptag = window.ProcessingTagState;
            if (ptag) {
                if (typeof window._ptagSetFilter === 'function') {
                    window._ptagSetFilter(null);
                }
                // Clear flag filters explicitly (setFilter(null) đã clear nhưng phòng case mismatch)
                if (ptag._activeFlagFilters instanceof Set) {
                    ptag._activeFlagFilters.clear();
                } else {
                    ptag._activeFlagFilters = new Set();
                }
            }
        } catch (e) {}

        // 5. Excluded Tag XL
        try {
            localStorage.removeItem('orderTableExcludedPtagXl');
            if (typeof window.renderExcludePtagXlFilterDropdown === 'function') {
                window.renderExcludePtagXlFilterDropdown();
            }
        } catch (e) {}

        // 6. Date filter toggle
        try {
            const cb = document.getElementById('dateModeToggle');
            if (cb && cb.checked) {
                cb.checked = false;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (e) {}

        // 7. Stock status — reset filter
        try {
            if (window.StockStatusEngine?._activeFilter) {
                window.StockStatusEngine._activeFilter = null;
                window.StockStatusEngine._checked = false;
            }
        } catch (e) {}

        // 8. Re-render table
        if (typeof window.performTableSearch === 'function') {
            window.performTableSearch();
        }

        // 9. Persist cleared state
        try {
            window.FilterPersistence?.scheduleSave?.();
        } catch (e) {}

        // 10. Refresh chip + notify
        refreshChip();
        if (window.notificationManager) {
            window.notificationManager.show?.('Đã xoá tất cả filter', 'success', 2000);
        }
    }

    // Hook vào performTableSearch — chip auto-refresh sau mỗi filter change.
    function _wrapPerformTableSearch() {
        if (window.__activeFilterChipWrapped) return;
        if (typeof window.performTableSearch !== 'function') return;
        const orig = window.performTableSearch;
        window.performTableSearch = function (...args) {
            const ret = orig.apply(this, args);
            try {
                refreshChip();
            } catch (e) {}
            return ret;
        };
        window.__activeFilterChipWrapped = true;
    }

    // Khởi tạo: chờ DOM + performTableSearch sẵn sàng.
    function init() {
        _ensureChip();
        _wrapPerformTableSearch();
        refreshChip();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    // Retry sau 2s phòng trường hợp performTableSearch chưa define lúc DOMContentLoaded
    setTimeout(() => {
        _wrapPerformTableSearch();
        refreshChip();
    }, 2000);

    // Public API
    window.clearAllFilters = clearAllFilters;
    window.refreshActiveFilterChip = refreshChip;
    window.getActiveFilterSummary = getActiveFilterSummary;
})();
