// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// NCC SEARCH - INVENTORY TRACKING
// Compact search box bên phải đợt tabs. Datalist autocomplete từ tên NCC
// trong globalState.nccList. Match exact label HOẶC substring (case-insensitive)
// trên tenNCC. Persist value sang globalState.filters.ncc rồi gọi
// applyFiltersAndRender — pipeline lọc shipments theo NCC đã có sẵn.
// =====================================================

window.NCCSearch = (function () {
    'use strict';

    let _input = null;
    let _list = null;
    let _clearBtn = null;
    let _box = null;
    let _debounceTimer = null;

    function _refs() {
        _input = _input || document.getElementById('nccSearchInput');
        _list = _list || document.getElementById('nccSearchDatalist');
        _clearBtn = _clearBtn || document.getElementById('nccSearchClear');
        _box = _box || document.getElementById('nccSearchBox');
    }

    /**
     * Rebuild datalist options from current NCC list. Called after each data
     * load + after CRUD that adds NCC.
     */
    function populate() {
        _refs();
        if (!_list) return;
        const items = (globalState?.nccList || [])
            .filter((n) => n.sttNCC > 0 || n.tenNCC)
            .map((n) => n.tenNCC || `NCC ${n.sttNCC}`)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));

        _list.innerHTML = items
            .map((label) => `<option value="${_escape(label)}"></option>`)
            .join('');
    }

    function _escape(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
            c === '&'
                ? '&amp;'
                : c === '<'
                  ? '&lt;'
                  : c === '>'
                    ? '&gt;'
                    : c === '"'
                      ? '&quot;'
                      : '&#39;'
        );
    }

    /**
     * Resolve text → filter value:
     *   - exact tenNCC match → use sttNCC if > 0 else tenNCC
     *   - substring match (single hit) → resolve to that NCC
     *   - free text → use as tenNCC contains filter (handled in filter pipeline)
     *   - empty → 'all'
     */
    function _resolveFilterValue(text) {
        const q = (text || '').trim();
        if (!q) return 'all';
        const list = globalState?.nccList || [];
        const lower = q.toLowerCase();

        // Exact match (case-insensitive)
        const exact = list.find((n) => (n.tenNCC || '').toLowerCase() === lower);
        if (exact) {
            return exact.sttNCC > 0 ? String(exact.sttNCC) : exact.tenNCC;
        }

        // Substring match: if exactly one NCC matches, lock onto it.
        const matches = list.filter((n) => (n.tenNCC || '').toLowerCase().includes(lower));
        if (matches.length === 1) {
            const m = matches[0];
            return m.sttNCC > 0 ? String(m.sttNCC) : m.tenNCC;
        }

        // Fallback: free-text — pass through as tenNCC substring (filter pipeline
        // already does an OR match on sttNCC|tenNCC includes).
        return q;
    }

    function _apply() {
        const value = _resolveFilterValue(_input?.value);
        if (!globalState.filters) globalState.filters = {};
        globalState.filters.ncc = value;
        // Sync the hidden <select id="filterNCC"> too — keeps `applyFilters()`
        // in filters.js correct if other code triggers it.
        const legacy = document.getElementById('filterNCC');
        if (legacy) {
            const matchOpt = [...legacy.options].some((o) => o.value === value);
            legacy.value = matchOpt ? value : 'all';
        }

        // Toggle clear button + box state.
        if (_box) _box.classList.toggle('has-value', value !== 'all' && value !== '');
        if (_clearBtn) _clearBtn.classList.toggle('hidden', value === 'all' || value === '');

        if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
    }

    function _onInput() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(_apply, 200);
    }

    function clear() {
        if (_input) _input.value = '';
        _apply();
    }

    function init() {
        _refs();
        if (!_input) return;

        populate();

        _input.addEventListener('input', _onInput);
        _input.addEventListener('change', _apply);
        _clearBtn?.addEventListener('click', clear);

        // Press Esc inside input clears.
        _input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                clear();
                _input.blur();
            }
        });
    }

    return { init, populate, clear };
})();

console.log('[NCC-SEARCH] Loaded');
