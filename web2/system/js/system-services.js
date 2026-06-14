// #Note: WEB2.0 module — System / Cấu hình → tab "Dịch vụ & Hệ thống".
// Fetch /api/services-overview + render cards (DB + service inventory + process).
// Tách từ services-dashboard.js cũ; expose window.SystemServices cho system-app.js orchestrate.

(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/services-overview`;

    // Limits per DB (used for usage bar calc). Cả 2 đều Render Postgres Basic 1GB.
    const DB_LIMITS = {
        chatDb: { bytes: 1024 * 1024 * 1024, label: '1 GB (Render PG Basic)' },
        web2Db: { bytes: 1024 * 1024 * 1024, label: '1 GB (Render PG Basic)' },
    };

    const REFRESH_MS = 60000;
    let _refreshTimer = null;
    let _started = false;

    function $(id) {
        return document.getElementById(id);
    }
    function fmtBytes(n) {
        if (n == null) return '—';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let v = Number(n);
        let i = 0;
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024;
            i++;
        }
        return v.toFixed(v >= 100 ? 0 : 1) + ' ' + units[i];
    }
    function fmtNumber(n) {
        return (Number(n) || 0).toLocaleString('vi-VN');
    }
    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    async function load() {
        try {
            const r = await fetch(API);
            const data = await r.json();
            if (!data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
            renderAll(data);
        } catch (e) {
            console.error('[system-services] load fail:', e);
            const u = $('sysUpdated');
            if (u) u.textContent = `Lỗi: ${e.message}`;
            if (window.notificationManager?.show) {
                window.notificationManager.show(`Tải data fail: ${e.message}`, 'error');
            }
        }
    }

    function renderAll(data) {
        const d = new Date(data.ts || Date.now());
        const u = $('sysUpdated');
        if (u)
            u.textContent = `Cập nhật: ${d.toLocaleTimeString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
            })}`;

        renderCostSummary(data);
        renderDatabases(data.databases || {});
        renderServices(data.services || []);
        renderProcess(data.process || {});

        if (window.lucide) lucide.createIcons();
    }

    function renderCostSummary(data) {
        const services = data.services || [];
        let total = 0;
        let paidCount = 0;
        let freeCount = 0;
        for (const s of services) {
            const cost = Number(s.costMonth);
            if (cost > 0) {
                total += cost;
                paidCount++;
            } else {
                freeCount++;
            }
        }
        $('sdCostTotal').textContent = `~${total.toFixed(0)} USD`;
        $('sdCostPaidCount').textContent = `${paidCount} dịch vụ`;
        $('sdCostFreeCount').textContent = `${freeCount} dịch vụ`;
        $('sdProcUptime').textContent = data.process?.uptimePretty || '—';
    }

    function renderDatabases(databases) {
        const grid = $('sdDbGrid');
        const dbCards = [];

        for (const [poolKey, stats] of Object.entries(databases)) {
            const limit = DB_LIMITS[poolKey] || { bytes: 0, label: '—' };
            const pct = limit.bytes > 0 ? (stats.dbSizeBytes / limit.bytes) * 100 : 0;
            const usageClass = pct >= 80 ? 'danger' : pct >= 60 ? 'warn' : '';
            const planClass = poolKey === 'web2Db' ? 'sd-plan-free' : '';
            const planLabel = 'Basic 1GB';
            const provider =
                poolKey === 'chatDb'
                    ? 'Render PG — n2store-chat-db'
                    : 'Render PG — n2store-web2-db';
            const purpose =
                poolKey === 'chatDb'
                    ? 'DB Web 1.0 (n2store_chat) — customers, balance_history, customer_wallets, app_users… Web 2.0 KHÔNG còn ở đây.'
                    : 'DB Web 2.0 (n2store_web2) — TOÀN BỘ data Web 2.0: web2_*, native_orders, fast_sale_orders, web2_customers, web2_balance_history, ví KH/transactions… (cutover xong 2026-06-03).';

            const tablesHtml = (stats.tables || [])
                .slice(0, 8)
                .map(
                    (t) =>
                        `<tr>
                            <td><code>${escapeHtml(t.name)}</code></td>
                            <td class="num">${fmtNumber(t.rowCount)}</td>
                            <td class="num">${escapeHtml(t.totalPretty || fmtBytes(t.totalBytes))}</td>
                        </tr>`
                )
                .join('');

            dbCards.push(`<div class="sd-db-card">
                <div class="sd-db-head">
                    <h3><i data-lucide="database"></i> ${escapeHtml(provider)} <small style="color:var(--web2-text-faded);font-weight:500;">(${poolKey})</small></h3>
                    <span class="sd-db-plan ${planClass}">${planLabel}</span>
                </div>
                <div class="sd-db-body">
                    <div class="sd-db-purpose">${escapeHtml(purpose)}</div>

                    <div class="sd-db-metric ${usageClass === 'danger' ? 'sd-metric-danger' : usageClass === 'warn' ? 'sd-metric-warn' : ''}">
                        <span>📊 Dung lượng DB</span>
                        <strong>${escapeHtml(stats.dbSizePretty || fmtBytes(stats.dbSizeBytes))} / ${escapeHtml(limit.label)}</strong>
                    </div>
                    <div class="sd-db-usage-bar">
                        <div class="sd-db-usage-fill ${usageClass}" style="width:${Math.min(100, pct).toFixed(1)}%;"></div>
                    </div>
                    <div style="font-size:11px;color:var(--web2-text-3);text-align:right;">${pct.toFixed(1)}% đã dùng</div>

                    <div class="sd-db-metric">
                        <span>📁 Tổng bảng</span>
                        <strong>${stats.totalTables ?? '—'}</strong>
                    </div>
                    <div class="sd-db-metric">
                        <span>🔌 Connection pool</span>
                        <strong>${
                            stats.poolInternal
                                ? `${stats.poolInternal.total} total · ${stats.poolInternal.idle} idle · ${stats.poolInternal.waiting} waiting`
                                : '—'
                        }</strong>
                    </div>
                    <div class="sd-db-metric">
                        <span>⚙️ DB connections</span>
                        <strong>${
                            (stats.connections || [])
                                .map((c) => `${c.state || 'unknown'}: ${c.n}`)
                                .join(' · ') || '—'
                        }</strong>
                    </div>

                    ${
                        tablesHtml
                            ? `<div class="sd-db-tables">
                                <h4>Top tables theo size</h4>
                                <table>
                                    <thead><tr><th>Tên</th><th class="num">Rows</th><th class="num">Size</th></tr></thead>
                                    <tbody>${tablesHtml}</tbody>
                                </table>
                            </div>`
                            : ''
                    }

                    ${
                        stats.dbError
                            ? `<div class="sd-db-metric sd-metric-danger">⚠️ Lỗi: ${escapeHtml(stats.dbError)}</div>`
                            : ''
                    }
                </div>
            </div>`);
        }
        grid.innerHTML = dbCards.join('');
    }

    function renderServices(services) {
        const grid = $('sdServiceGrid');
        const cards = services.map((s) => {
            const isPaid = Number(s.costMonth) > 0;
            const costLabel = isPaid ? `$${s.costMonth}/mo` : `Free`;
            const freeRows = s.freeTier
                ? Object.entries(s.freeTier)
                      .map(
                          ([k, v]) =>
                              `<div class="sd-svc-limits-row"><span class="sd-svc-limits-label">${escapeHtml(k)}:</span> <span>${escapeHtml(v)}</span></div>`
                      )
                      .join('')
                : '';
            const paidRows = s.paidLimit
                ? Object.entries(s.paidLimit)
                      .map(
                          ([k, v]) =>
                              `<div class="sd-svc-limits-row"><span class="sd-svc-limits-label">${escapeHtml(k)}:</span> <span>${escapeHtml(v)}</span></div>`
                      )
                      .join('')
                : '';

            return `<div class="sd-svc-card sd-cat-${escapeHtml(s.category || 'other')}">
                <div class="sd-svc-head">
                    <span class="sd-svc-name">${escapeHtml(s.name)}</span>
                    <span class="sd-svc-cost ${isPaid ? 'paid' : 'free'}">${costLabel}</span>
                </div>
                <div class="sd-svc-provider">${escapeHtml(s.provider)} · ${escapeHtml(s.plan)}</div>
                <div class="sd-svc-purpose">${escapeHtml(s.purpose || '')}</div>
                ${
                    freeRows
                        ? `<div class="sd-svc-limits"><strong style="font-size:10px;color:#16a34a;">🆓 Free Tier:</strong>${freeRows}</div>`
                        : ''
                }
                ${
                    paidRows
                        ? `<div class="sd-svc-limits"><strong style="font-size:10px;color:#d97706;">💸 Paid:</strong>${paidRows}</div>`
                        : ''
                }
                ${
                    s.url
                        ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="sd-svc-link">→ Dashboard ngoài</a>`
                        : ''
                }
            </div>`;
        });
        grid.innerHTML = cards.join('');
    }

    function renderProcess(proc) {
        const grid = $('sdProcGrid');
        const mem = proc.memory || {};
        const cards = [
            { label: '🕒 Uptime', value: proc.uptimePretty || '—' },
            { label: '🧠 RSS Memory', value: fmtBytes(mem.rss) },
            { label: '📦 Heap Used', value: `${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}` },
            { label: '🟢 Node.js', value: proc.nodeVersion || '—' },
        ];
        grid.innerHTML = cards
            .map(
                (c) =>
                    `<div class="sd-proc-card">
                        <div class="sd-proc-label">${escapeHtml(c.label)}</div>
                        <div class="sd-proc-value">${escapeHtml(c.value)}</div>
                    </div>`
            )
            .join('');
    }

    // Auto-refresh 60s qua setTimeout chain (không setInterval): tự dừng khi tab
    // ẩn (tiết kiệm fetch) + clear hẳn khi rời trang.
    function _scheduleRefresh() {
        clearTimeout(_refreshTimer);
        _refreshTimer = setTimeout(async () => {
            if (document.visibilityState === 'visible') await load();
            _scheduleRefresh();
        }, REFRESH_MS);
    }
    function _stopRefresh() {
        clearTimeout(_refreshTimer);
        _refreshTimer = null;
    }

    // Khởi động lần đầu (idempotent): load + auto refresh + cleanup wiring.
    function start() {
        if (_started) {
            load();
            return;
        }
        _started = true;
        load();
        _scheduleRefresh();
        window.addEventListener('pagehide', _stopRefresh);
        window.addEventListener('beforeunload', _stopRefresh);
    }

    window.SystemServices = { start, reload: load };
})();
