// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// KPI Dashboard — Forecast vs Actual per beneficiary per campaign.
// API: /api/web2/kpi/forecast?campaign_id= và /actual?campaign_id= và /events?...

(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const KPI_API = `${WORKER}/api/web2/kpi`;
    const NATIVE_CAMPAIGNS_API = `${WORKER}/api/native-orders/campaigns`;

    const STATE = {
        campaigns: [],
        currentCampaignId: '',
        currentCampaignName: '',
        view: 'kpi',
    };

    function $(sel) {
        return document.querySelector(sel);
    }
    function escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }
    function fmtVnd(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function fmtDate(ts) {
        if (!ts) return '';
        return new Date(Number(ts)).toLocaleString('vi-VN');
    }

    async function loadCampaigns() {
        try {
            const r = await fetch(NATIVE_CAMPAIGNS_API);
            const d = await r.json();
            STATE.campaigns = d.campaigns || [];
        } catch (e) {
            STATE.campaigns = [];
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

    // KPI gộp (model base-delta) — 1 con số / NV. Xem render.com/routes/v2/kpi.js GET /kpi.
    async function loadKpi() {
        const params = new URLSearchParams();
        if (STATE.currentCampaignId) params.set('campaign_id', STATE.currentCampaignId);
        const r = await fetch(`${KPI_API}/kpi?` + params);
        const d = await r.json();
        return { rows: d.kpi || [], unassigned: Number(d.unassigned_qty) || 0 };
    }

    async function loadEvents() {
        const params = new URLSearchParams({ limit: '100' });
        if (STATE.currentCampaignId) params.set('campaign_id', STATE.currentCampaignId);
        const r = await fetch(`${KPI_API}/events?` + params);
        const d = await r.json();
        return d.events || [];
    }

    function renderLeaderboard(data) {
        const root = $('#kpiContent');
        if (!STATE.currentCampaignId) {
            root.innerHTML = `<div class="kpi-empty"><i data-lucide="filter"></i><p>Chọn chiến dịch để xem KPI.</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        const rows = data.rows || [];
        const unassigned = data.unassigned || 0;
        if (!rows.length && !unassigned) {
            root.innerHTML = `<div class="kpi-empty"><i data-lucide="inbox"></i><p>Chưa có KPI nào trong chiến dịch này.</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        const unassignedRow = unassigned
            ? `<tr style="opacity:.7;"><td class="kpi-rank">—</td>
                 <td><i data-lucide="user-x" style="width:14px;height:14px;vertical-align:-2px;"></i> Chưa gán NV (ngoài khoảng STT)</td>
                 <td class="kpi-qty">${unassigned}</td>
                 <td class="kpi-amount">${fmtVnd(unassigned * 5000)}</td></tr>`
            : '';
        const html = `
            <div class="kpi-leaderboard">
                <table>
                    <thead>
                        <tr>
                            <th class="kpi-rank">#</th>
                            <th>Nhân viên</th>
                            <th class="kpi-qty">SL SP (vượt base)</th>
                            <th class="kpi-amount">KPI (VNĐ)</th>
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
                                <td class="kpi-qty">${r.kpi_qty || 0}</td>
                                <td class="kpi-amount">${fmtVnd(r.kpi_amount)}</td>
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

    function renderEventsLog(events) {
        const root = $('#kpiContent');
        if (!STATE.currentCampaignId) {
            root.innerHTML = `<div class="kpi-empty"><i data-lucide="filter"></i><p>Chọn chiến dịch để xem audit log.</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        if (!events.length) {
            root.innerHTML = `<div class="kpi-empty"><i data-lucide="inbox"></i><p>Chưa có event nào.</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        const html = `
            <div class="kpi-leaderboard">
                <table>
                    <thead>
                        <tr>
                            <th>Thời gian</th>
                            <th>Event</th>
                            <th>Actor</th>
                            <th>Beneficiary</th>
                            <th>Đơn STT</th>
                            <th>SP</th>
                            <th class="kpi-qty">Δ Qty</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${events
                            .map(
                                (e) => `<tr>
                            <td>${fmtDate(e.event_time)}</td>
                            <td><code>${escapeHtml(e.event_type)}</code></td>
                            <td>${escapeHtml(e.actor_name || '#' + e.actor_user_id)}</td>
                            <td>${escapeHtml(e.beneficiary_name || '#' + e.beneficiary_user_id)}<small style="color:#9ca3af;"> (${e.beneficiary_source || ''})</small></td>
                            <td>${e.order_campaign_stt || '—'} <small style="color:#9ca3af;">${escapeHtml(e.order_code)}</small></td>
                            <td>${escapeHtml(e.product_code)}</td>
                            <td class="kpi-qty" style="color:${e.qty_delta > 0 ? '#16a34a' : '#dc2626'};">${e.qty_delta > 0 ? '+' : ''}${e.qty_delta}</td>
                            <td><span class="badge-${escapeHtml(e.source)}">${escapeHtml(e.source)}</span></td>
                        </tr>`
                            )
                            .join('')}
                    </tbody>
                </table>
            </div>
        `;
        root.innerHTML = html;
    }

    async function refresh() {
        const root = $('#kpiContent');
        root.innerHTML = `<div class="kpi-empty"><p>Đang tải…</p></div>`;
        if (STATE.view === 'audit') {
            const events = await loadEvents();
            renderEventsLog(events);
        } else {
            const data = await loadKpi();
            renderLeaderboard(data);
        }
    }

    async function init() {
        await loadCampaigns();
        renderCampaignDropdown();

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
        if (window.Web2SSE) {
            let _sseTimer = null;
            Web2SSE.subscribe('web2:kpi-dashboard', () => {
                clearTimeout(_sseTimer);
                _sseTimer = setTimeout(() => {
                    if (STATE.currentCampaignId) refresh();
                }, 600);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
