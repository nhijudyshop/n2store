// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   TAB1 KPI STATS — counter + hover tooltip cạnh KPI filter dropdown.

   Hiển thị "(N)" badge với N = số đơn KPI hiện tại. Hover → tooltip:
   - Tổng đơn KPI (chính xác từ KpiSaleFlagStore bulk set)
   - KPI chưa duyệt (đơn KPI có StatusText !== 'Đơn hàng' — vẫn ở Nháp)
   - Tổng SP đánh dấu (sum entries có is_sale=true qua các order đã load chi tiết)
   - Lịch sử check/uncheck (10 entries gần nhất từ server, lazy fetch on hover)

   History server-side auto-cleanup >90 ngày (cron daily).
   ===================================================== */
(function () {
    'use strict';

    const COUNTER_ID = 'kpiStatsCounter';
    const TOOLTIP_ID = 'kpiStatsTooltip';
    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';

    // ─── Helpers ───
    function _ensureCounter() {
        let counter = document.getElementById(COUNTER_ID);
        if (counter) return counter;
        const filter = document.getElementById('kpiFilter');
        if (!filter || !filter.parentNode) return null;

        counter = document.createElement('span');
        counter.id = COUNTER_ID;
        counter.style.cssText = [
            'display: none', // shown when count > 0
            'align-items: center',
            'justify-content: center',
            'min-width: 22px',
            'height: 20px',
            'padding: 0 6px',
            'margin-left: 4px',
            'background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            'color: #78350f',
            'border-radius: 10px',
            'font-size: 11px',
            'font-weight: 700',
            'cursor: help',
            'box-shadow: 0 1px 2px rgba(245, 158, 11, 0.3)',
            'transition: transform 120ms',
        ].join(';');
        counter.addEventListener('mouseenter', _onHover);
        counter.addEventListener('mouseleave', _onLeave);
        filter.parentNode.appendChild(counter);
        return counter;
    }

    function _ensureTooltip() {
        let tooltip = document.getElementById(TOOLTIP_ID);
        if (tooltip) return tooltip;
        tooltip = document.createElement('div');
        tooltip.id = TOOLTIP_ID;
        tooltip.style.cssText = [
            'position: absolute',
            'display: none',
            'z-index: 10000',
            'min-width: 320px',
            'max-width: 420px',
            'padding: 12px 14px',
            'background: #ffffff',
            'border: 1px solid #e5e7eb',
            'border-radius: 10px',
            'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12)',
            'font-size: 12px',
            'color: #111827',
            'line-height: 1.5',
        ].join(';');
        tooltip.addEventListener('mouseenter', () => {
            // Keep tooltip open when hovering tooltip itself.
            _hoverLock = true;
        });
        tooltip.addEventListener('mouseleave', () => {
            _hoverLock = false;
            _hideTooltip();
        });
        document.body.appendChild(tooltip);
        return tooltip;
    }

    function _computeStats() {
        const all = window.allData || [];
        const store = window.KpiSaleFlagStore;
        if (!store?.hasKpiFlag) {
            return { total: 0, notApproved: 0, totalProducts: 0, kpiOrders: [] };
        }

        let total = 0;
        let notApproved = 0;
        const kpiOrders = [];
        for (const o of all) {
            if (!o?.Code) continue;
            if (store.hasKpiFlag(o.Code)) {
                total++;
                kpiOrders.push(o);
                const status = o.StatusText || o.Status || '';
                // "Đơn hàng" = approved/confirmed; mọi state khác (Nháp, …) = chưa duyệt.
                if (status !== 'Đơn hàng') notApproved++;
            }
        }

        // Tổng SP đánh dấu — ưu tiên server count (chính xác, không phụ thuộc cache).
        // Fallback per-order cache nếu store chưa expose getter (legacy).
        let totalProducts = 0;
        let hasIncompleteCache = false;
        if (typeof store.getTotalKpiProductsServer === 'function') {
            totalProducts = store.getTotalKpiProductsServer();
            // Nếu server count = 0 nhưng có order trong KPI set → có thể bulk-summary chưa
            // đầy đủ (legacy server không trả totalProducts). Fallback sum cache.
            if (totalProducts === 0 && total > 0) {
                hasIncompleteCache = true;
                for (const o of kpiOrders) {
                    const map = store.getAll ? store.getAll(o.Code) : null;
                    if (!map || map.size === 0) continue;
                    for (const v of map.values()) {
                        if (v === true) totalProducts++;
                    }
                }
            }
        } else {
            // Legacy fallback
            hasIncompleteCache = true;
            for (const o of kpiOrders) {
                const map = store.getAll ? store.getAll(o.Code) : null;
                if (!map || map.size === 0) continue;
                for (const v of map.values()) {
                    if (v === true) totalProducts++;
                }
            }
        }
        return { total, notApproved, totalProducts, kpiOrders, hasIncompleteCache };
    }

    function _refreshCounter() {
        const counter = _ensureCounter();
        if (!counter) return;
        const stats = _computeStats();
        if (stats.total === 0) {
            counter.style.display = 'none';
            counter.textContent = '';
            return;
        }
        counter.style.display = 'inline-flex';
        counter.textContent = stats.total;
        counter.title = `${stats.total} đơn KPI — hover để xem chi tiết`;
    }

    // ─── Hover behavior ───
    let _hoverLock = false;
    let _hoverTimeout = null;

    function _onHover(e) {
        clearTimeout(_hoverTimeout);
        _hoverTimeout = setTimeout(() => _showTooltip(e.target), 200);
    }
    function _onLeave() {
        clearTimeout(_hoverTimeout);
        // Delay hide để user kịp di chuột vào tooltip.
        _hoverTimeout = setTimeout(() => {
            if (!_hoverLock) _hideTooltip();
        }, 200);
    }

    async function _showTooltip(anchor) {
        const tooltip = _ensureTooltip();
        const stats = _computeStats();

        // Loading skeleton trước khi history fetch xong.
        tooltip.innerHTML = _renderTooltipHtml(stats, null, true);
        _positionTooltip(anchor, tooltip);
        tooltip.style.display = 'block';

        // Fetch history (lazy — chỉ fetch khi hover).
        try {
            const codes = stats.kpiOrders.map((o) => o.Code).filter(Boolean);
            const url = `${API_BASE}/kpi-sale-flag/history?limit=10${codes.length ? `&codes=${encodeURIComponent(codes.join(','))}` : ''}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                tooltip.innerHTML = _renderTooltipHtml(stats, data.history || [], false);
            } else {
                tooltip.innerHTML = _renderTooltipHtml(stats, [], false);
            }
        } catch (e) {
            console.warn('[KPI-STATS] history fetch failed:', e?.message);
            tooltip.innerHTML = _renderTooltipHtml(stats, [], false);
        }
    }

    function _hideTooltip() {
        const tooltip = document.getElementById(TOOLTIP_ID);
        if (tooltip) tooltip.style.display = 'none';
    }

    function _positionTooltip(anchor, tooltip) {
        const rect = anchor.getBoundingClientRect();
        const top = rect.bottom + window.scrollY + 6;
        let left = rect.left + window.scrollX;
        // Tránh tràn viewport phải.
        const tipW = 420;
        const maxLeft = window.scrollX + window.innerWidth - tipW - 12;
        if (left > maxLeft) left = Math.max(window.scrollX + 12, maxLeft);
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    function _escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _formatTime(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch (e) {
            return '';
        }
    }

    function _renderTooltipHtml(stats, history, loading) {
        // Server count chính xác → hiển thị số. Fallback cache → "≥X".
        const totalProductsLabel = stats.hasIncompleteCache
            ? `≥ ${stats.totalProducts}`
            : `${stats.totalProducts}`;
        const totalProductsHint =
            stats.hasIncompleteCache && stats.totalProducts === 0
                ? ' <span style="font-size:10px; color:#9ca3af; font-weight:400;" title="Chưa load — backend đang deploy hoặc chưa có data">(đang chờ data)</span>'
                : stats.hasIncompleteCache
                  ? ' <span style="font-size:10px; color:#9ca3af; font-weight:400;" title="Một số đơn chưa load chi tiết — số đếm có thể chưa đầy đủ">(open chi tiết để cập nhật)</span>'
                  : '';

        const historyHtml = loading
            ? `<div style="color:#9ca3af; padding: 6px 0;"><i class="fas fa-spinner fa-spin"></i> Đang tải lịch sử...</div>`
            : history && history.length > 0
              ? history
                    .map((h) => {
                        const action = h.action === 'check' ? '✓ Check' : '✗ Uncheck';
                        const color = h.action === 'check' ? '#10b981' : '#ef4444';
                        const userName = _escapeHtml(h.userName || h.userId || '?');
                        const code = _escapeHtml(h.orderCode);
                        return `
                            <div style="display:flex; gap:8px; padding:4px 0; border-top:1px dashed #f3f4f6; font-size:11px; align-items:center;">
                                <span style="color:${color}; font-weight:600; min-width:60px;">${action}</span>
                                <span style="color:#6b7280; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${userName} → ${code}</span>
                                <span style="color:#9ca3af; font-size:10px;">${_formatTime(h.createdAt)}</span>
                            </div>`;
                    })
                    .join('')
              : `<div style="color:#9ca3af; padding: 6px 0; font-style:italic;">Chưa có lịch sử check / uncheck.</div>`;

        return `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #e5e7eb;">
                <i class="fas fa-star" style="color:#f59e0b; font-size:14px;"></i>
                <strong style="font-size:13px;">Thống kê đơn KPI</strong>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px 12px; margin-bottom:10px;">
                <div>
                    <div style="font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Tổng đơn KPI</div>
                    <div style="font-size:16px; font-weight:700; color:#f59e0b;">${stats.total}</div>
                </div>
                <div>
                    <div style="font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Chưa duyệt</div>
                    <div style="font-size:16px; font-weight:700; color:${stats.notApproved > 0 ? '#dc2626' : '#10b981'};">${stats.notApproved}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Tổng SP đã đánh dấu KPI</div>
                    <div style="font-size:14px; font-weight:600; color:#111827;">${totalProductsLabel}${totalProductsHint}</div>
                </div>
            </div>

            <div style="margin-top:8px;">
                <div style="font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">
                    Lịch sử check / uncheck (10 gần nhất)
                </div>
                <div style="max-height:220px; overflow-y:auto;">
                    ${historyHtml}
                </div>
                <div style="font-size:10px; color:#9ca3af; margin-top:6px; font-style:italic;">
                    Lịch sử tự xoá sau 90 ngày.
                </div>
            </div>
        `;
    }

    // ─── Wire events ───

    // Refresh counter sau mỗi performTableSearch (filter / load thay đổi sẽ ảnh hưởng tới allData / set).
    function _wrapPerformTableSearch() {
        if (window.__kpiStatsWrappedSearch) return;
        if (typeof window.performTableSearch !== 'function') return;
        const orig = window.performTableSearch;
        window.performTableSearch = function (...args) {
            const ret = orig.apply(this, args);
            setTimeout(_refreshCounter, 60);
            return ret;
        };
        window.__kpiStatsWrappedSearch = true;
    }

    // Toggle KPI flag → counter có thể đổi (add/remove order khỏi KPI set).
    window.addEventListener('kpi-sale-flag-changed', () => {
        setTimeout(_refreshCounter, 50);
    });

    // Init: chờ DOM + KpiSaleFlagStore + allData ready.
    function _init() {
        _ensureCounter();
        _wrapPerformTableSearch();
        _refreshCounter();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    // Retry init mỗi giây × 10s phòng KPI filter dropdown render sau DOMContentLoaded.
    let attempts = 0;
    const retryInterval = setInterval(() => {
        attempts++;
        if (document.getElementById('kpiFilter') && !document.getElementById(COUNTER_ID)) {
            _init();
        }
        // Refresh after data potentially loaded
        _refreshCounter();
        if (attempts >= 10) clearInterval(retryInterval);
    }, 1000);

    // Public API
    window.refreshKpiStatsCounter = _refreshCounter;
    window.computeKpiStats = _computeStats;
})();
