// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Filter "Ẩn Tag XL" — đối xứng với filter "Ẩn" tag thường.
 * Cho phép user chọn nhiều Tag XL (cat/sub-state/subtag/flag/ttag) để ẩn khỏi bảng.
 * State: localStorage key 'orderTableExcludedPtagXl' (array các filter key).
 * Matching: dùng window._ptagOrderMatchesSingleKey (state swap synchronous).
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'orderTableExcludedPtagXl';

    // ---------------- Storage ----------------

    function getExcluded() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.filter(k => typeof k === 'string' && k) : [];
        } catch (e) {
            console.error('[EXCLUDE-PTAG-XL] parse err:', e);
            return [];
        }
    }

    function saveExcluded(keys) {
        try {
            const clean = Array.from(new Set((keys || []).filter(k => typeof k === 'string' && k)));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
            if (window.FilterPersistence?.scheduleSave) window.FilterPersistence.scheduleSave();
        } catch (e) {
            console.error('[EXCLUDE-PTAG-XL] save err:', e);
        }
    }

    // ---------------- UI ----------------

    function toggleDropdown() {
        const dd = document.getElementById('excludePtagXlFilterDropdown');
        if (!dd) return;
        const isOpen = dd.classList.contains('open');
        document.querySelectorAll('.tag-filter-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) {
            dd.classList.add('open');
            populateOptions('');
            setTimeout(() => {
                const input = document.getElementById('excludePtagXlFilterSearchInput');
                if (input) { input.value = ''; input.focus(); }
            }, 50);
        }
    }

    function closeDropdown() {
        const dd = document.getElementById('excludePtagXlFilterDropdown');
        if (dd) dd.classList.remove('open');
    }

    function populateOptions(searchTerm) {
        const container = document.getElementById('excludePtagXlFilterOptions');
        if (!container) return;
        if (typeof window._ptagXlGetFilterOptions !== 'function') {
            container.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;">Đang tải…</div>';
            return;
        }

        const excluded = new Set(getExcluded());
        const opts = window._ptagXlGetFilterOptions();
        const norm = (typeof window._ptagNormalize === 'function')
            ? window._ptagNormalize(searchTerm || '')
            : (searchTerm || '').toLowerCase();

        const match = (s) => {
            if (!norm) return true;
            if (typeof window._ptagMatchTokens === 'function') return window._ptagMatchTokens(s || '', norm);
            return (s || '').includes(norm);
        };

        let html = '';
        for (const opt of opts) {
            if (opt.section) {
                if (!match(opt.search)) continue;
                html += `<div class="ptag-xl-section-header">${opt.label}</div>`;
                continue;
            }
            if (!match(opt.search)) continue;
            const checked = excluded.has(opt.key) ? 'checked' : '';
            const indent = opt.indent ? ' ptag-xl-option--indent' : '';
            const bg = excluded.has(opt.key) ? 'background:#fef2f2;' : '';
            const colorStyle = opt.labelColor ? ` style="color:${opt.labelColor};"` : '';
            html += `
                <label class="ptag-xl-option${indent}" style="${bg}cursor:pointer;">
                    <input type="checkbox" ${checked} onchange="window._excludePtagXlToggleOption('${escapeForAttr(opt.key)}')" style="margin-right:8px;width:16px;height:16px;cursor:pointer;accent-color:#ef4444;">
                    <span${colorStyle}>${opt.label}</span>
                    <span class="ptag-xl-count">${opt.count || 0}</span>
                </label>
            `;
        }

        if (!html) {
            html = '<div style="padding:12px;text-align:center;color:#9ca3af;">Không tìm thấy</div>';
        }

        container.innerHTML = html;
        updateDisplayText();
    }

    function filterSearch(query) {
        populateOptions(query || '');
    }

    function toggleOption(key) {
        const excluded = new Set(getExcluded());
        if (excluded.has(key)) excluded.delete(key); else excluded.add(key);
        saveExcluded([...excluded]);
        populateOptions(document.getElementById('excludePtagXlFilterSearchInput')?.value || '');
        if (typeof window.performTableSearch === 'function') window.performTableSearch();
    }

    function clearAll() {
        saveExcluded([]);
        populateOptions(document.getElementById('excludePtagXlFilterSearchInput')?.value || '');
        if (typeof window.performTableSearch === 'function') window.performTableSearch();
    }

    function updateDisplayText() {
        const el = document.getElementById('excludePtagXlFilterText');
        if (!el) return;
        const excluded = getExcluded();
        if (excluded.length === 0) {
            el.textContent = 'Không ẩn';
            el.style.color = '';
            return;
        }
        if (excluded.length === 1) {
            const label = (typeof window._ptagXlResolveKeyLabel === 'function')
                ? window._ptagXlResolveKeyLabel(excluded[0])
                : excluded[0];
            el.textContent = label.length > 22 ? label.substring(0, 20) + '…' : label;
        } else {
            el.textContent = `${excluded.length} tag XL`;
        }
        el.style.color = '#ef4444';
    }

    function populateIfOpen() {
        const dd = document.getElementById('excludePtagXlFilterDropdown');
        if (dd?.classList.contains('open')) {
            populateOptions(document.getElementById('excludePtagXlFilterSearchInput')?.value || '');
        } else {
            updateDisplayText();
        }
    }

    function escapeForAttr(s) {
        return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // ---------------- Matching (used by tab1-search.js) ----------------

    function orderHasExcludedPtagXl(orderCodeOrId) {
        const excluded = getExcluded();
        if (excluded.length === 0) return false;
        if (typeof window._ptagOrderMatchesSingleKey !== 'function') return false;
        return excluded.some(key => window._ptagOrderMatchesSingleKey(orderCodeOrId, key));
    }

    function hasExcludedPtagXl() {
        return getExcluded().length > 0;
    }

    // ---------------- Close on outside click ----------------

    document.addEventListener('click', (e) => {
        const dd = document.getElementById('excludePtagXlFilterDropdown');
        if (!dd || !dd.classList.contains('open')) return;
        if (!dd.contains(e.target)) closeDropdown();
    });

    // ---------------- Init display on load ----------------

    document.addEventListener('DOMContentLoaded', () => {
        updateDisplayText();
    });

    // ---------------- Public API ----------------

    window._excludePtagXlToggleDropdown = toggleDropdown;
    window._excludePtagXlCloseDropdown = closeDropdown;
    window._excludePtagXlFilterSearch = filterSearch;
    window._excludePtagXlToggleOption = toggleOption;
    window._excludePtagXlClearAll = clearAll;
    window._excludePtagXlPopulateIfOpen = populateIfOpen;
    window.getExcludedPtagXlFilters = getExcluded;
    window.saveExcludedPtagXlFilters = saveExcluded;
    window.hasExcludedPtagXlFilters = hasExcludedPtagXl;
    window.orderHasExcludedPtagXl = orderHasExcludedPtagXl;
})();
