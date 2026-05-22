// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ĐỢT SECTION TABS - INVENTORY TRACKING
// Pill row dưới tab "Theo Dõi Đơn Hàng" cho phép cô lập 1 đợt số.
// - Tabs auto-generate từ unique dotSo trong globalState.shipments.
// - Persist selection vào localStorage qua window.UIState.
// - Khi đổi tab → set filter + re-apply pipeline → stats card update theo.
// =====================================================

window.DotTabs = (function () {
    'use strict';

    let _container = null;

    function _getContainer() {
        if (_container) return _container;
        _container = document.getElementById('dotTabsBar');
        return _container;
    }

    /**
     * Rebuild tab buttons from current data. Called after shipments load and
     * after any CRUD that may change đợt set.
     */
    function render() {
        const bar = _getContainer();
        if (!bar) return;

        const available =
            typeof getAvailableDotSoList === 'function' ? getAvailableDotSoList() : [];

        // No đợt yet → hide bar entirely.
        if (available.length === 0) {
            bar.classList.add('hidden');
            bar.innerHTML = '';
            return;
        }

        bar.classList.remove('hidden');

        const saved = window.UIState?.getActiveDotTab?.();
        // If saved tab no longer exists (deleted last shipment of that đợt),
        // fall back to the largest dotSo (latest đợt).
        const active = saved && available.includes(saved) ? saved : available[available.length - 1];

        // Sync UIState if we had to fall back so subsequent filters see the right value.
        if (active !== saved) {
            window.UIState?.setActiveDotTab?.(active);
        }

        // Order ASC: Đợt 1, Đợt 2, Đợt 3, ... (theo yêu cầu user).
        const ordered = [...available].sort((a, b) => a - b);

        bar.innerHTML = ordered
            .map(
                (n) => `
                <button
                    type="button"
                    class="dot-tab${n === active ? ' active' : ''}"
                    data-dot-so="${n}"
                    title="Xem đợt ${n}"
                >
                    <span class="dot-tab-label">Đợt ${n}</span>
                </button>`
            )
            .join('');

        // Delegated click — replace listener on every render is fine, container
        // is rebuilt with innerHTML.
        bar.onclick = (ev) => {
            const btn = ev.target.closest('.dot-tab[data-dot-so]');
            if (!btn) return;
            const dot = parseInt(btn.dataset.dotSo, 10);
            if (!Number.isFinite(dot)) return;
            select(dot);
        };
    }

    function select(dotSo) {
        const n = parseInt(dotSo, 10);
        if (!Number.isFinite(n) || n <= 0) return;
        const current = window.UIState?.getActiveDotTab?.();
        if (current === n) return;
        window.UIState?.setActiveDotTab?.(n);

        // Update active class without re-render (smoother).
        const bar = _getContainer();
        if (bar) {
            bar.querySelectorAll('.dot-tab').forEach((el) => {
                el.classList.toggle('active', parseInt(el.dataset.dotSo, 10) === n);
            });
        }

        // Re-apply filters → triggers renderShipments + stats bar update.
        if (typeof applyFiltersAndRender === 'function') {
            applyFiltersAndRender();
        }

        // If payment panel is open, refresh it so its tabs + section follow
        // the new active đợt (one source of truth: UIState.activeDotTab).
        const slide = document.getElementById('paymentSlideOver');
        if (slide && slide.classList.contains('open')) {
            const body = slide.querySelector('#paymentSlideOverBody');
            if (body && typeof renderPaymentSlideOverBody === 'function') {
                body.innerHTML = renderPaymentSlideOverBody();
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
        }
    }

    return { render, select };
})();

console.log('[DOT-TABS] Loaded');
