// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// KPI Dashboard — Forecast vs Actual per beneficiary per campaign.
// API: /api/web2/kpi/kpi?campaign_id= (leaderboard). Tab "Lịch sử thao tác" dùng
// MODULE CHÍNH Web2AuditLog (/api/web2/audit-log) — KHÔNG còn KPI-events feed riêng.

(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const KPI_API = `${WORKER}/api/web2/kpi`;
    const NATIVE_CAMPAIGNS_API = `${WORKER}/api/native-orders/campaigns`;

    const STATE = {
        campaigns: [],
        currentCampaignId: '',
        currentCampaignName: '',
        view: 'kpi',
        lastKpi: null, // dữ liệu KPI nạp gần nhất (rows + unassigned + rate) cho widget AI
    };
    // Expose FULL dataset cho widget AI (Web2AiPageRegistry) — không chỉ DOM bảng leaderboard.
    window.Web2KpiData = STATE;

    function $(sel) {
        return document.querySelector(sel);
    }
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Kpi && window.Web2Kpi.escapeHtml) return window.Web2Kpi.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }
    function fmtVnd(n) {
        if (window.Web2Format && window.Web2Format.vnd) return window.Web2Format.vnd(n);
        // Web2Kpi.fmtVnd cũng dùng glyph 'đ' (khớp) → 1 nguồn; fallback inline.
        if (window.Web2Kpi && window.Web2Kpi.fmtVnd) return window.Web2Kpi.fmtVnd(n);
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    async function loadCampaigns() {
        const sel = $('#kpiCampaignFilter');
        if (sel) {
            sel.innerHTML = '<option value="" disabled selected>Đang tải chiến dịch…</option>';
            sel.disabled = true;
        }
        try {
            const r = await fetch(NATIVE_CAMPAIGNS_API);
            const d = await r.json();
            STATE.campaigns = d.campaigns || [];
        } catch (e) {
            STATE.campaigns = [];
        } finally {
            if (sel) sel.disabled = false;
        }
    }

    function renderCampaignDropdown() {
        const sel = $('#kpiCampaignFilter');
        const opts = ['<option value="">— Chọn chiến dịch —</option>'];
        for (const c of STATE.campaigns) {
            const name = c.name || c.label || c.id;
            const id = c.id || c.name;
            if (!name) continue;
            opts.push(
                `<option value="${escapeHtml(id)}" data-name="${escapeHtml(name)}">${escapeHtml(name)} (${c.count || 0} đơn)</option>`
            );
        }
        sel.innerHTML = opts.join('');
    }

    // KPI base-delta, tách Dự báo (đơn draft) / Thực (đơn đã thành PBH). Scope theo
    // token: admin thấy hết, staff thấy của mình. Xem render.com/routes/v2/kpi.js GET /kpi.
    // authHeaders 1 nguồn ở Web2Kpi (gắn x-web2-token → scope đúng). Fallback inline.
    function _authHeaders() {
        if (window.Web2Kpi && window.Web2Kpi.authHeaders) return window.Web2Kpi.authHeaders();
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders();
        try {
            const t = window.Web2Auth?.getStored?.()?.token;
            if (t) return { 'x-web2-token': t };
        } catch {}
        return {};
    }
    async function loadKpi() {
        const params = new URLSearchParams();
        if (STATE.currentCampaignId) params.set('campaign_id', STATE.currentCampaignId);
        const r = await fetch(`${KPI_API}/kpi?` + params, { headers: _authHeaders() });
        const d = await r.json();
        return {
            rows: d.kpi || [],
            unassignedForecast: Number(d.unassigned_forecast_qty) || 0,
            unassignedActual: Number(d.unassigned_actual_qty) || 0,
            viewer: d.viewer || { scope: 'all' },
            rate: Number(d.rate_per_sp) || (window.Web2Kpi ? window.Web2Kpi.RATE_PER_SP : 5000),
        };
    }

    function renderLeaderboard(data) {
        STATE.lastKpi = data; // lưu cho widget AI đọc full (rows/unassigned/rate)
        const root = $('#kpiContent');
        if (!STATE.currentCampaignId) {
            root.innerHTML = `<div class="kpi-empty"><i data-lucide="filter"></i><p>Chọn chiến dịch để xem KPI.</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        const rows = data.rows || [];
        const uF = data.unassignedForecast || 0;
        const uA = data.unassignedActual || 0;
        const RATE = data.rate || (window.Web2Kpi ? window.Web2Kpi.RATE_PER_SP : 5000);
        if (!rows.length && !uF && !uA) {
            root.innerHTML = `<div class="kpi-empty"><i data-lucide="bar-chart-2"></i><p>Chưa có KPI nào trong chiến dịch này.</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        const scopeBadge =
            data.viewer?.scope === 'self'
                ? `<span style="font-size:11px;color:#0068ff;font-weight:600;">(chỉ KPI của bạn)</span>`
                : '';
        const unassignedRow =
            uF || uA
                ? `<tr style="opacity:.7;"><td class="kpi-rank">—</td>
                     <td><i data-lucide="user-x" style="width:14px;height:14px;vertical-align:-2px;"></i> Chưa gán NV (ngoài khoảng STT)</td>
                     <td class="kpi-qty">${uF}</td><td class="kpi-amount">${fmtVnd(uF * RATE)}</td>
                     <td class="kpi-qty">${uA}</td><td class="kpi-amount">${fmtVnd(uA * RATE)}</td></tr>`
                : '';
        const html = `
            <div class="kpi-leaderboard">
                <p style="margin:0 0 8px;font-size:12px;color:#64748b;">
                    <strong>Dự báo</strong> = giỏ hàng chưa thành PBH · <strong>Thực</strong> = đơn đã thành PBH · 5.000đ/SP ${scopeBadge}
                </p>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="kpi-rank">#</th>
                            <th>Nhân viên</th>
                            <th class="kpi-qty">Dự báo (SP)</th>
                            <th class="kpi-amount">Dự báo (đ)</th>
                            <th class="kpi-qty">Thực (SP)</th>
                            <th class="kpi-amount">Thực (đ)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows
                            .map((r, i) => {
                                const rankCls =
                                    i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                                return `<tr>
                                <td class="kpi-rank ${rankCls}">${i + 1}</td>
                                <td>${escapeHtml(r.beneficiary_name || 'NV #' + r.beneficiary_user_id)}</td>
                                <td class="kpi-qty">${r.forecast_qty || 0}</td>
                                <td class="kpi-amount">${fmtVnd(r.forecast_amount)}</td>
                                <td class="kpi-qty" style="font-weight:700;color:#0f766e;">${r.actual_qty || 0}</td>
                                <td class="kpi-amount" style="font-weight:700;color:#0f766e;">${fmtVnd(r.actual_amount)}</td>
                            </tr>`;
                            })
                            .join('')}
                        ${unassignedRow}
                    </tbody>
                </table>
            </div>
        `;
        root.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    }

    // Tab "Lịch sử thao tác" — dùng MODULE CHÍNH Web2AuditLog (chung với trang
    // web2/audit-log). Server tự scope: NV xem thao tác của mình, admin xem tất cả.
    // KHÔNG còn KPI-events feed riêng (đã gộp về 1 nguồn audit-log toàn bộ).
    function renderAuditLog() {
        const root = $('#kpiContent');
        if (window.Web2AuditLog) {
            root.innerHTML = '';
            window.Web2AuditLog.mount(root, { limit: 200 });
        } else {
            root.innerHTML = `<div class="kpi-empty"><i data-lucide="alert-triangle"></i><p>Module lịch sử thao tác chưa tải. Tải lại trang.</p></div>`;
            if (window.lucide) lucide.createIcons();
        }
    }

    async function refresh() {
        const root = $('#kpiContent');
        if (STATE.view === 'audit') {
            renderAuditLog();
            return;
        }
        root.classList.remove('w2al'); // dọn class do Web2AuditLog.mount để lại
        // Skeleton thay text "Đang tải…"
        root.innerHTML =
            `<div class="kpi-empty" style="text-align:left">` +
            '<span class="w2-skel" style="display:block;height:18px;width:45%;margin:6px 0;border-radius:6px"></span>' +
            '<span class="w2-skel" style="display:block;height:44px;width:100%;margin:8px 0;border-radius:8px"></span>'.repeat(
                3
            ) +
            `</div>`;
        try {
            renderLeaderboard(await loadKpi());
        } catch (e) {
            const msg = (e && e.message ? e.message : String(e)).replace(/[<>&]/g, '');
            root.innerHTML = `<div class="kpi-empty"><i data-lucide="alert-triangle"></i><p>Lỗi tải KPI: ${msg}</p><button class="btn btn-sm" id="kpiRetry"><i data-lucide="refresh-cw"></i> Thử lại</button></div>`;
            if (window.lucide) lucide.createIcons();
            $('#kpiRetry')?.addEventListener('click', refresh);
            if (window.notificationManager)
                notificationManager.show('Lỗi tải KPI: ' + msg, 'error');
        }
    }

    async function init() {
        await loadCampaigns();
        renderCampaignDropdown();

        // Focus campaign select on load so keyboard users can pick immediately.
        const _sel = $('#kpiCampaignFilter');
        if (_sel) _sel.focus();

        $('#kpiCampaignFilter').addEventListener('change', (e) => {
            STATE.currentCampaignId = e.target.value;
            const opt = e.target.options[e.target.selectedIndex];
            STATE.currentCampaignName = opt?.dataset?.name || '';
            refresh();
        });
        $('#kpiRefreshBtn').addEventListener('click', refresh);
        document.querySelectorAll('.kpi-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.kpi-tab').forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                STATE.view = tab.dataset.view;
                refresh();
            });
        });

        // Realtime: KPI event mới (forecast/actual/revoke) → auto refresh leaderboard.
        // emitKpiEvent broadcast topic 'web2:kpi-dashboard'. Debounce gom burst.
        // Chỉ refresh khi đang ở tab KPI (tab Lịch sử thao tác có nút Tải riêng).
        if (window.Web2SSE) {
            let _sseTimer = null;
            Web2SSE.subscribe('web2:kpi-dashboard', () => {
                clearTimeout(_sseTimer);
                _sseTimer = setTimeout(() => {
                    if (STATE.currentCampaignId && STATE.view !== 'audit') refresh();
                }, 600);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
