// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// ============================================
// TAB1 SCROLL RESTORE
// Lưu vị trí scroll của bảng Tab1 vào sessionStorage, khôi phục sau F5.
// - Save: debounced khi user scroll #tableWrapper
// - Restore: sau lần render đầu tiên, tự động load thêm rows qua loadMoreRows()
//   tới khi scrollHeight đủ cho vị trí đã lưu rồi set scrollTop.
// - Chỉ restore 1 lần/page load (F5). Khi user đổi campaign/filter sẽ không restore nhầm.
// ============================================

(function () {
    'use strict';

    const STORAGE_KEY = 'tab1_scroll_state_v1';
    const SAVE_DEBOUNCE_MS = 200;
    const MAX_RESTORE_TRIES = 60;
    const RESTORE_TICK_MS = 40;
    const RESTORE_STALE_MS = 30 * 60 * 1000; // 30 phút

    let wrapper = null;
    let saveTimer = null;
    let hasRestored = false;

    function loadState() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const state = JSON.parse(raw);
            if (!state || typeof state !== 'object') return null;
            if (Date.now() - (state.savedAt || 0) > RESTORE_STALE_MS) return null;
            return state;
        } catch (_) {
            return null;
        }
    }

    function persistState(state) {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {
            // quota / disabled storage — bỏ qua
        }
    }

    function clearState() {
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (_) {
            /* noop */
        }
    }

    function getDisplayedLength() {
        if (Array.isArray(window.displayedData)) return window.displayedData.length;
        if (typeof displayedData !== 'undefined' && Array.isArray(displayedData))
            return displayedData.length;
        return 0;
    }

    function getCurrentCampaignKey() {
        const el = document.getElementById('campaignFilter');
        return el?.value || '';
    }

    function saveScroll() {
        if (!wrapper) return;
        const top = wrapper.scrollTop;
        if (top <= 0) {
            clearState();
            return;
        }
        persistState({
            scrollTop: top,
            displayedLength: getDisplayedLength(),
            campaign: getCurrentCampaignKey(),
            savedAt: Date.now(),
        });
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveScroll, SAVE_DEBOUNCE_MS);
    }

    function triggerLoadMoreIfPossible() {
        if (typeof window.loadMoreRows === 'function') {
            window.loadMoreRows();
            return true;
        }
        if (typeof loadMoreRows === 'function') {
            loadMoreRows();
            return true;
        }
        return false;
    }

    async function restoreScroll() {
        if (hasRestored || !wrapper) return;
        const state = loadState();
        if (!state || !state.scrollTop || state.scrollTop <= 0) return;

        // Kiểm tra có phải cùng campaign + data tương đương không. Nếu khác,
        // bỏ qua (user đổi campaign sau lần save cuối).
        const currentLen = getDisplayedLength();
        if (currentLen === 0) return; // chưa có data, chờ lần render sau
        if (state.campaign && state.campaign !== getCurrentCampaignKey()) return;
        // Cho phép chênh lệch nhỏ (±20) vì có thể có đơn mới vào qua realtime
        if (
            state.displayedLength &&
            Math.abs(currentLen - state.displayedLength) > Math.max(20, state.displayedLength * 0.1)
        ) {
            return;
        }

        hasRestored = true;
        const target = state.scrollTop;

        // Load thêm rows tới khi scrollHeight đủ lớn (virtualization/infinite scroll)
        let tries = 0;
        let lastScrollHeight = wrapper.scrollHeight;
        while (tries < MAX_RESTORE_TRIES) {
            const needed = target + wrapper.clientHeight + 200;
            if (wrapper.scrollHeight >= needed) break;

            if (!triggerLoadMoreIfPossible()) break;
            await new Promise((r) => setTimeout(r, RESTORE_TICK_MS));

            // Nếu scrollHeight không tăng thêm 2 tick liền, coi như không còn data
            if (wrapper.scrollHeight === lastScrollHeight) {
                await new Promise((r) => setTimeout(r, RESTORE_TICK_MS));
                if (wrapper.scrollHeight === lastScrollHeight) break;
            }
            lastScrollHeight = wrapper.scrollHeight;
            tries++;
        }

        // Giới hạn trong biên scroll tối đa
        const maxTop = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
        wrapper.scrollTop = Math.min(target, maxTop);
    }

    function observeFirstRender() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;

        // Nếu đã có rows sẵn (data load rất nhanh), restore luôn
        const hasRealRows = tbody.querySelectorAll('tr[data-order-id]').length > 0;
        if (hasRealRows) {
            setTimeout(restoreScroll, 0);
            return;
        }

        // Nếu chưa có, dùng MutationObserver đợi render đầu tiên
        const observer = new MutationObserver(() => {
            const realRows = tbody.querySelectorAll('tr[data-order-id]');
            if (realRows.length > 0) {
                observer.disconnect();
                // Chờ 1 tick để renderTable xong xuôi
                setTimeout(restoreScroll, 50);
            }
        });
        observer.observe(tbody, { childList: true });

        // Fallback: disconnect sau 30s để không observe mãi
        setTimeout(() => observer.disconnect(), 30000);
    }

    function init() {
        wrapper = document.getElementById('tableWrapper');
        if (!wrapper) return;

        wrapper.addEventListener('scroll', scheduleSave, { passive: true });

        // Lưu ngay khi rời trang (pagehide cover cả F5 và đóng tab)
        window.addEventListener('pagehide', () => {
            clearTimeout(saveTimer);
            saveScroll();
        });

        observeFirstRender();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose để debug / reset từ console
    window.Tab1ScrollRestore = {
        clear: clearState,
        save: saveScroll,
        getState: loadState,
    };
})();
