// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// UI STATE PERSISTENCE - INVENTORY TRACKING
// Giữ trạng thái UI giữa các lần F5 (expand/collapse shipment,
// details column toggle, v.v.) qua localStorage.
// =====================================================

window.UIState = (function () {
    'use strict';

    const KEY = 'n2store_inv_ui_state_v1';

    function _load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return { expanded: [], detailsVisible: false, hiddenCols: [] };
            const p = JSON.parse(raw);
            return {
                expanded: Array.isArray(p.expanded) ? p.expanded.map(String) : [],
                detailsVisible: !!p.detailsVisible,
                hiddenCols: Array.isArray(p.hiddenCols) ? p.hiddenCols.filter(Boolean) : [],
            };
        } catch (_) {
            return { expanded: [], detailsVisible: false, hiddenCols: [] };
        }
    }

    const state = _load();

    function _save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
        } catch (_) {
            /* storage quota / private mode */
        }
    }

    // -------- Expand/collapse state --------
    function isExpanded(shipmentId) {
        return state.expanded.includes(String(shipmentId));
    }

    function setExpanded(shipmentId, flag) {
        const id = String(shipmentId);
        const idx = state.expanded.indexOf(id);
        if (flag && idx === -1) state.expanded.push(id);
        else if (!flag && idx >= 0) state.expanded.splice(idx, 1);
        _save();
    }

    // -------- Detail columns (Mô tả + Chi tiết màu sắc) --------
    function isDetailsVisible() {
        return state.detailsVisible;
    }

    function setDetailsVisible(flag) {
        state.detailsVisible = !!flag;
        _save();
    }

    // -------- Cleanup stale ids (shipment không còn tồn tại) --------
    function pruneExpanded(validIds) {
        const set = new Set(validIds.map(String));
        const before = state.expanded.length;
        state.expanded = state.expanded.filter((id) => set.has(id));
        if (state.expanded.length !== before) _save();
    }

    // -------- Per-column hidden state --------
    function getHiddenCols() {
        return [...state.hiddenCols];
    }
    function setHiddenCols(cols) {
        state.hiddenCols = Array.from(new Set((cols || []).filter(Boolean)));
        _save();
    }
    function isColHidden(colKey) {
        return state.hiddenCols.includes(colKey);
    }
    function hideCol(colKey) {
        if (!colKey || state.hiddenCols.includes(colKey)) return;
        state.hiddenCols.push(colKey);
        _save();
    }
    function showCol(colKey) {
        const idx = state.hiddenCols.indexOf(colKey);
        if (idx < 0) return;
        state.hiddenCols.splice(idx, 1);
        _save();
    }
    function clearHiddenCols() {
        state.hiddenCols = [];
        _save();
    }

    return {
        isExpanded,
        setExpanded,
        isDetailsVisible,
        setDetailsVisible,
        pruneExpanded,
        getHiddenCols,
        setHiddenCols,
        isColHidden,
        hideCol,
        showCol,
        clearHiddenCols,
    };
})();

console.log('[UI-STATE] Loaded');
