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
        const invStore = window.InvoiceStatusStore;
        if (!store?.hasKpiFlag) {
            return { total: 0, approved: 0, notApproved: 0, totalProducts: 0, kpiOrders: [] };
        }

        let total = 0;
        let approved = 0;
        let notApproved = 0;
        const kpiOrders = [];
        for (const o of all) {
            if (!o?.Code) continue;
            if (store.hasKpiFlag(o.Code)) {
                total++;
                kpiOrders.push(o);
                // "Đã duyệt" = đơn có invoice đã "Hoàn thành đối soát" (StateCode === 'CrossCheckComplete')
                // — đây mới là KPI thực. Mọi state khác = "Dự tính" (chưa đối soát xong).
                const inv = invStore?.get?.(o.Id);
                if (inv && inv.StateCode === 'CrossCheckComplete') {
                    approved++;
                } else {
                    notApproved++;
                }
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
        return { total, approved, notApproved, totalProducts, kpiOrders, hasIncompleteCache };
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

    function _wireOpenFullHistoryBtn() {
        const btn = document.getElementById('kpiOpenHistoryBtn');
        if (!btn || btn._wired) return;
        btn._wired = true;
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            _hideTooltip();
            _openFullHistoryModal();
        });
    }

    async function _showTooltip(anchor) {
        const tooltip = _ensureTooltip();
        const stats = _computeStats();

        // Loading skeleton trước khi history fetch xong.
        tooltip.innerHTML = _renderTooltipHtml(stats, null, true);
        _positionTooltip(anchor, tooltip);
        tooltip.style.display = 'block';
        _wireOpenFullHistoryBtn();

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
        _wireOpenFullHistoryBtn();
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

    /**
     * Parse Postgres TIMESTAMP (without TZ) → JS Date.
     * Server stores `CURRENT_TIMESTAMP` in UTC nhưng serialize không có 'Z'/TZ
     * suffix → `new Date(iso)` mặc định coi là local → lệch 7h ở Vietnam.
     * Fix: append 'Z' nếu thiếu TZ → parse là UTC → toString() show đúng local.
     */
    function _parseServerTime(iso) {
        if (!iso) return null;
        if (iso instanceof Date) return iso;
        let s = String(iso);
        if (!s.includes('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
            s = s.replace(' ', 'T') + 'Z';
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    function _formatTime(iso) {
        const d = _parseServerTime(iso);
        if (!d) return '';
        const pad = (n) => String(n).padStart(2, '0');
        // toLocaleString implicit dùng timezone của browser → user GMT+7 → đúng giờ VN.
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    /**
     * Map orderCode → STT (SessionIndex). Lookup từ window.allData.
     * Build cache lazy mỗi lần render — allData có thể đổi giữa các renders.
     */
    function _getSttByOrderCode(orderCode) {
        if (!orderCode) return null;
        const all = window.allData || [];
        // Fast path: small linear scan; allData ~vài nghìn rows, vẫn nhanh.
        for (const o of all) {
            if (o?.Code === orderCode) return o.SessionIndex || null;
        }
        return null;
    }

    /**
     * Lookup tên SP đầy đủ từ excelProducts cache (sync, không hit network).
     * Trả null nếu cache chưa có — caller sẽ lazy-fetch hoặc fallback.
     */
    function _getProductNameSync(productId) {
        if (productId == null) return null;
        const psm = window.productSearchManager;
        if (!psm) return null;
        const pid = String(productId);
        // Excel suggestions cache (synchronous)
        const fromExcel = (psm.excelProducts || []).find((p) => String(p.Id) === pid);
        if (fromExcel?.Name) return fromExcel.Name;
        // Full product cache (synchronous)
        const fromFull = psm.fullProductCache?.get?.(Number(productId));
        if (fromFull) return fromFull.NameGet || fromFull.Name || null;
        return null;
    }

    /**
     * Lazy-fetch tên SP cho danh sách productIds chưa có cache. Fire-and-forget;
     * khi xong → re-render rows trong modal nếu vẫn open.
     */
    const _productNameLoading = new Set();
    function _ensureProductNamesAsync(productIds) {
        const psm = window.productSearchManager;
        if (!psm?.getFullProductDetails) return;
        const missing = [];
        for (const pid of productIds) {
            if (pid == null) continue;
            if (_productNameLoading.has(pid)) continue;
            if (_getProductNameSync(pid)) continue;
            missing.push(Number(pid));
        }
        if (missing.length === 0) return;
        // Limit concurrent fetches để tránh hammer API.
        const BATCH = 5;
        const fetchOne = async (pid) => {
            _productNameLoading.add(pid);
            try {
                await psm.getFullProductDetails(pid);
            } catch (e) {
                /* silent — keep showing pid only */
            } finally {
                _productNameLoading.delete(pid);
            }
        };
        (async () => {
            for (let i = 0; i < missing.length; i += BATCH) {
                await Promise.all(missing.slice(i, i + BATCH).map(fetchOne));
            }
            // Re-render modal nếu còn open để hiển thị tên SP vừa load.
            if (_isModalOpen()) _renderFullHistoryRows({ preserveScroll: true });
        })();
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
                        const stt = _getSttByOrderCode(h.orderCode);
                        const orderLabel = stt
                            ? `STT <b>${_escapeHtml(stt)}</b>`
                            : _escapeHtml(h.orderCode);
                        return `
                            <div style="display:flex; gap:8px; padding:4px 0; border-top:1px dashed #f3f4f6; font-size:11px; align-items:center;">
                                <span style="color:${color}; font-weight:600; min-width:60px;">${action}</span>
                                <span style="color:#6b7280; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b style="color:#374151;">${userName}</b> → ${orderLabel}</span>
                                <span style="color:#9ca3af; font-size:10px;" title="Giờ Vietnam (GMT+7)">${_formatTime(h.createdAt)}</span>
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
                    <div style="font-size:10px; color:#10b981; text-transform:uppercase; letter-spacing:0.5px;" title="Đơn đã 'Hoàn thành đối soát' — KPI thực">KPI thực ✓</div>
                    <div style="font-size:16px; font-weight:700; color:#10b981;">${stats.approved || 0}</div>
                </div>
                <div>
                    <div style="font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;" title="Đơn KPI chưa 'Hoàn thành đối soát' — số dự tính, làm động lực">Dự tính ⏳</div>
                    <div style="font-size:16px; font-weight:700; color:#f59e0b;">${stats.notApproved}</div>
                </div>
                <div>
                    <div style="font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Tổng SP đã đánh dấu KPI</div>
                    <div style="font-size:14px; font-weight:600; color:#111827;">${totalProductsLabel}${totalProductsHint}</div>
                </div>
            </div>

            <div style="margin-top:8px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                    <div style="font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">
                        Lịch sử check / uncheck (10 gần nhất)
                    </div>
                    <button type="button" id="kpiOpenHistoryBtn" style="font-size:10px; padding:3px 8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:4px; cursor:pointer; font-weight:600;" title="Mở modal xem full lịch sử">
                        📜 Xem full
                    </button>
                </div>
                <div style="max-height:220px; overflow-y:auto;">
                    ${historyHtml}
                </div>
                <div style="font-size:10px; color:#9ca3af; margin-top:6px; font-style:italic;">
                    KPI thực (đã đối soát) là số chính thức tính lương; dự tính giúp users theo dõi tiến độ. Lịch sử tự xoá sau 90 ngày.
                </div>
            </div>
        `;
    }

    // ─── Full history modal ───
    const MODAL_ID = 'kpiHistoryModal';

    function _ensureFullHistoryModal() {
        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.style.cssText = [
            'position: fixed',
            'inset: 0',
            'display: none',
            'z-index: 10001',
            'background: rgba(15, 23, 42, 0.45)',
            'backdrop-filter: blur(2px)',
            'align-items: center',
            'justify-content: center',
        ].join(';');
        modal.innerHTML = `
            <div id="kpiHistoryModalDialog" style="background:#fff; border-radius:12px; box-shadow:0 16px 48px rgba(0,0,0,0.18); width: min(720px, 92vw); max-height: 86vh; display:flex; flex-direction:column; overflow:hidden;">
                <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%); border-bottom:1px solid #fcd34d;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-history" style="color:#92400e; font-size:16px;"></i>
                        <strong style="font-size:14px; color:#78350f;">Lịch sử check / uncheck KPI (full)</strong>
                    </div>
                    <button type="button" id="kpiHistoryModalClose" style="border:none; background:transparent; font-size:20px; line-height:1; cursor:pointer; color:#78350f;" title="Đóng">×</button>
                </div>
                <div style="display:flex; gap:8px; padding:10px 18px; border-bottom:1px solid #f3f4f6; align-items:center;">
                    <input type="text" id="kpiHistoryFilterInput" placeholder="Lọc theo user / order code…"
                        style="flex:1; padding:6px 10px; border:1px solid #e5e7eb; border-radius:6px; font-size:12px; outline:none;">
                    <select id="kpiHistoryActionFilter" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:6px; font-size:12px; background:#fff; cursor:pointer;">
                        <option value="all">Tất cả</option>
                        <option value="check">Check ✓</option>
                        <option value="uncheck">Uncheck ✗</option>
                    </select>
                    <button type="button" id="kpiHistoryRefresh" style="padding:6px 10px; background:#10b981; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;" title="Làm mới">↻</button>
                </div>
                <div id="kpiHistoryModalBody" style="flex:1; overflow-y:auto; padding:8px 18px 16px;">
                    <div style="color:#9ca3af; padding:24px 0; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Đang tải lịch sử…</div>
                </div>
                <div style="padding:8px 18px; background:#f9fafb; border-top:1px solid #f3f4f6; font-size:11px; color:#6b7280;">
                    Tối đa 200 entry mới nhất. Lịch sử tự xoá sau 90 ngày.
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Close handlers
        modal.addEventListener('click', (ev) => {
            if (ev.target === modal) _closeFullHistoryModal();
        });
        modal
            .querySelector('#kpiHistoryModalClose')
            .addEventListener('click', _closeFullHistoryModal);

        // Filter live
        const inp = modal.querySelector('#kpiHistoryFilterInput');
        const actionFilter = modal.querySelector('#kpiHistoryActionFilter');
        const refresh = modal.querySelector('#kpiHistoryRefresh');
        let _t = null;
        inp.addEventListener('input', () => {
            clearTimeout(_t);
            _t = setTimeout(_renderFullHistoryRows, 120);
        });
        actionFilter.addEventListener('change', _renderFullHistoryRows);
        refresh.addEventListener('click', _loadFullHistory);

        // ESC closes
        modal._escHandler = (ev) => {
            if (ev.key === 'Escape' && modal.style.display !== 'none') _closeFullHistoryModal();
        };
        document.addEventListener('keydown', modal._escHandler);
        return modal;
    }

    let _fullHistoryRows = [];
    let _modalPollTimer = null;
    const MODAL_POLL_MS = 10000; // 10s while modal open — đồng bộ với check/uncheck từ máy khác

    function _isModalOpen() {
        const modal = document.getElementById(MODAL_ID);
        return !!modal && modal.style.display !== 'none';
    }

    async function _openFullHistoryModal() {
        const modal = _ensureFullHistoryModal();
        modal.style.display = 'flex';
        await _loadFullHistory();
        _startModalPolling();
    }

    function _closeFullHistoryModal() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.style.display = 'none';
        _stopModalPolling();
    }

    function _startModalPolling() {
        _stopModalPolling();
        _modalPollTimer = setInterval(() => {
            if (!_isModalOpen()) {
                _stopModalPolling();
                return;
            }
            // Skip nếu tab ẩn — tiết kiệm request.
            if (document.visibilityState === 'hidden') return;
            // Skip nếu user đang gõ trong filter input — tránh re-render làm mất focus.
            const inp = document.getElementById('kpiHistoryFilterInput');
            if (inp && document.activeElement === inp) return;
            // Silent refresh — không show loading skeleton, không re-render nếu data identical.
            _loadFullHistory(true);
        }, MODAL_POLL_MS);
    }

    function _stopModalPolling() {
        if (_modalPollTimer) {
            clearInterval(_modalPollTimer);
            _modalPollTimer = null;
        }
    }

    /**
     * @param {boolean} silent — true = polling/auto refresh: skip loading skeleton,
     *   compare data identity bằng id-set, chỉ re-render khi thay đổi, preserve scrollTop.
     */
    async function _loadFullHistory(silent = false) {
        const body = document.getElementById('kpiHistoryModalBody');
        if (!body) return;
        if (!silent) {
            body.innerHTML = `<div style="color:#9ca3af; padding:24px 0; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Đang tải lịch sử…</div>`;
        }
        let fresh;
        try {
            const res = await fetch(`${API_BASE}/kpi-sale-flag/history?limit=200`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            fresh = data.history || [];
        } catch (e) {
            console.warn('[KPI-STATS] full history fetch failed:', e?.message);
            if (!silent) {
                body.innerHTML = `<div style="color:#dc2626; padding:24px 0; text-align:center;">⚠ Không tải được lịch sử: ${_escapeHtml(e?.message || e)}</div>`;
            }
            return;
        }

        // Identity check: nếu silent và set id giống y hệt → không re-render (tránh giật).
        if (silent && _isHistoryIdentical(_fullHistoryRows, fresh)) return;

        _fullHistoryRows = fresh;
        _renderFullHistoryRows({ preserveScroll: silent });
    }

    function _isHistoryIdentical(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i].id !== b[i].id || a[i].action !== b[i].action) return false;
        }
        return true;
    }

    function _renderFullHistoryRows(opts = {}) {
        const body = document.getElementById('kpiHistoryModalBody');
        if (!body) return;
        const inp = document.getElementById('kpiHistoryFilterInput');
        const actionFilter = document.getElementById('kpiHistoryActionFilter');
        const q = (inp?.value || '').trim().toLowerCase();
        const actionMode = actionFilter?.value || 'all';

        // Preserve scroll position trước khi re-render (silent refresh giữ chỗ scroll user đang xem).
        const prevScrollTop = opts.preserveScroll ? body.scrollTop : 0;

        const filtered = _fullHistoryRows.filter((h) => {
            if (actionMode !== 'all' && h.action !== actionMode) return false;
            if (!q) return true;
            const blob =
                `${h.userName || ''} ${h.userId || ''} ${h.orderCode || ''} ${h.productId || ''}`.toLowerCase();
            return blob.includes(q);
        });

        if (filtered.length === 0) {
            body.innerHTML = `<div style="color:#9ca3af; padding:24px 0; text-align:center; font-style:italic;">Chưa có lịch sử khớp bộ lọc.</div>`;
            return;
        }

        // Trigger lazy load product names cho missing pids (để hover hiển thị tên đầy đủ).
        _ensureProductNamesAsync(filtered.map((h) => h.productId));

        const rows = filtered
            .map((h) => {
                const isCheck = h.action === 'check';
                const actionLabel = isCheck ? '✓ Check' : '✗ Uncheck';
                const actionColor = isCheck ? '#10b981' : '#ef4444';
                const userName = _escapeHtml(h.userName || h.userId || '?');
                const stt = _getSttByOrderCode(h.orderCode);
                const pid = _escapeHtml(h.productId);
                // Hiển thị STT (SessionIndex) thay cho mã đơn hàng — dễ đọc hơn cho user.
                // SP # ẩn mặc định; hover STT → custom tooltip floating hiện tên SP đầy đủ
                // (không dùng native title vì delay 1-2s + style xấu).
                const dataAttrs = `data-product-id="${pid}" data-order-code="${_escapeHtml(h.orderCode)}"`;
                const orderLabel = stt
                    ? `<span class="kpi-history-stt" ${dataAttrs} style="cursor:help; border-bottom:1px dotted #9ca3af;">STT <b>${_escapeHtml(stt)}</b></span>`
                    : `<span class="kpi-history-stt" ${dataAttrs} style="cursor:help; font-family:monospace;">${_escapeHtml(h.orderCode)}</span>`;
                return `
                    <div style="display:grid; grid-template-columns: 70px 1fr 90px 60px; gap:10px; padding:8px 4px; border-bottom:1px solid #f3f4f6; font-size:12px; align-items:center;">
                        <span style="color:${actionColor}; font-weight:700;">${actionLabel}</span>
                        <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            <b style="color:#111827;">${userName}</b>
                            <span style="color:#9ca3af; margin:0 4px;">→</span>
                            <span style="color:#374151;">${orderLabel}</span>
                        </div>
                        <span style="color:#6b7280; font-size:11px;" title="Giờ Vietnam (GMT+7)">${_formatTime(h.createdAt)}</span>
                        <span style="color:#9ca3af; font-size:10px; text-align:right;">${_relativeTime(h.createdAt)}</span>
                    </div>
                `;
            })
            .join('');

        const summary = `<div style="display:flex; justify-content:space-between; padding:6px 4px; font-size:11px; color:#6b7280; background:#f9fafb; border-radius:4px; margin-bottom:6px;">
            <span>${filtered.length} entries${filtered.length !== _fullHistoryRows.length ? ` / ${_fullHistoryRows.length} tổng` : ''}</span>
        </div>`;
        body.innerHTML = summary + rows;
        // Restore scroll position cho silent refresh — tránh giật khi polling.
        if (opts.preserveScroll && prevScrollTop > 0) {
            body.scrollTop = prevScrollTop;
        }
        _wireSttHoverTooltip(body);
    }

    // ─── Custom floating tooltip cho STT hover ───
    // Native `title` chậm (1-2s delay) + style xấu. Tự build floating tooltip
    // hiện ngay khi hover, styled, kèm tên SP đầy đủ + Mã đơn + Product ID.
    const STT_TOOLTIP_ID = 'kpiSttHoverTooltip';

    function _ensureSttTooltip() {
        let tip = document.getElementById(STT_TOOLTIP_ID);
        if (tip) return tip;
        tip = document.createElement('div');
        tip.id = STT_TOOLTIP_ID;
        tip.style.cssText = [
            'position: fixed',
            'display: none',
            'z-index: 10100', // above modal (10001)
            'max-width: 360px',
            'padding: 8px 10px',
            'background: #1f2937',
            'color: #f3f4f6',
            'border-radius: 6px',
            'font-size: 12px',
            'line-height: 1.4',
            'box-shadow: 0 4px 12px rgba(0,0,0,0.25)',
            'pointer-events: none',
        ].join(';');
        document.body.appendChild(tip);
        return tip;
    }

    function _showSttTooltip(anchor) {
        const tip = _ensureSttTooltip();
        const pid = anchor.dataset.productId;
        const orderCode = anchor.dataset.orderCode;
        const productName = _getProductNameSync(pid);
        // Build tooltip HTML
        const nameLine = productName
            ? `<div style="font-weight:600; color:#fbbf24; margin-bottom:4px;">${_escapeHtml(productName)}</div>`
            : `<div style="color:#fbbf24; margin-bottom:4px; font-style:italic;"><i class="fas fa-spinner fa-spin"></i> Đang tải tên SP…</div>`;
        tip.innerHTML = `
            ${nameLine}
            <div style="font-size:11px; color:#d1d5db;">📋 Mã đơn: <span style="font-family:monospace;">${_escapeHtml(orderCode)}</span></div>
            <div style="font-size:11px; color:#9ca3af;">🏷️ Product ID: ${_escapeHtml(pid)}</div>
        `;
        // Position above anchor; flip below if not enough room.
        const r = anchor.getBoundingClientRect();
        tip.style.display = 'block';
        const tipRect = tip.getBoundingClientRect();
        let top = r.top - tipRect.height - 8;
        if (top < 8) top = r.bottom + 8;
        let left = r.left + r.width / 2 - tipRect.width / 2;
        const maxLeft = window.innerWidth - tipRect.width - 8;
        if (left < 8) left = 8;
        else if (left > maxLeft) left = maxLeft;
        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;

        // Kick lazy fetch nếu chưa có name; update tooltip khi xong.
        if (!productName) {
            _ensureProductNamesAsync([pid]);
            // Re-poll a few times to update tooltip text once name arrives.
            const startedAt = Date.now();
            const timer = setInterval(() => {
                if (tip.style.display === 'none' || Date.now() - startedAt > 6000) {
                    clearInterval(timer);
                    return;
                }
                const fresh = _getProductNameSync(pid);
                if (fresh) {
                    tip.querySelector('div').outerHTML =
                        `<div style="font-weight:600; color:#fbbf24; margin-bottom:4px;">${_escapeHtml(fresh)}</div>`;
                    clearInterval(timer);
                }
            }, 400);
        }
    }

    function _hideSttTooltip() {
        const tip = document.getElementById(STT_TOOLTIP_ID);
        if (tip) tip.style.display = 'none';
    }

    function _wireSttHoverTooltip(container) {
        // Idempotent — gắn 1 lần per container instance.
        if (!container || container._sttHoverWired) return;
        container._sttHoverWired = true;
        container.addEventListener('mouseover', (ev) => {
            const stt = ev.target.closest('.kpi-history-stt');
            if (!stt || !container.contains(stt)) return;
            _showSttTooltip(stt);
        });
        container.addEventListener('mouseout', (ev) => {
            const stt = ev.target.closest('.kpi-history-stt');
            if (!stt) return;
            // Chỉ hide nếu không di chuyển sang STT khác trong cùng row.
            const next = ev.relatedTarget?.closest?.('.kpi-history-stt');
            if (next && container.contains(next)) return;
            _hideSttTooltip();
        });
        // Hide khi modal scroll để tooltip không "lơ lửng" sai vị trí.
        container.addEventListener('scroll', _hideSttTooltip, { passive: true });
    }

    function _relativeTime(iso) {
        const dt = _parseServerTime(iso);
        if (!dt) return '';
        const diff = Date.now() - dt.getTime();
        const s = Math.floor(diff / 1000);
        if (s < 60) return s + 's';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h';
        const d = Math.floor(h / 24);
        return d + 'd';
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
    // Đồng thời refresh modal full history nếu đang mở — instant feedback cho local
    // toggle. Cross-machine: polling 10s trong modal lo phần đồng bộ từ máy khác.
    window.addEventListener('kpi-sale-flag-changed', () => {
        setTimeout(_refreshCounter, 50);
        if (_isModalOpen()) {
            // Delay nhỏ để server kịp insert vào history. silent=true để tránh giật.
            setTimeout(() => _loadFullHistory(true), 350);
        }
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
    window.openKpiHistoryModal = _openFullHistoryModal;
})();
