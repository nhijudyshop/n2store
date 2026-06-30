// #Note: WEB2.0 module — System / Cấu hình → tab "Dịch vụ & Hệ thống".
// Fetch /api/services-overview + render cards (DB + service inventory + process).
// Tách từ services-dashboard.js cũ; expose window.SystemServices cho system-app.js orchestrate.

(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/services-overview`;

    // Limits per DB (usage bar calc). "basic_1gb" = 1GB RAM; DISK thật = 15 GB (verify Render API
    // /v1/postgres diskSizeGB=15, 2026-06-28). Trước đây hardcode 1GB → báo 101.9% sai (thật ~7%).
    // Fallback: dùng khi payload KHÔNG kèm dung lượng disk thật (xem _diskBytesFor).
    const DB_DISK_BYTES = 15 * 1024 * 1024 * 1024; // 15 GB disk Render (fallback)
    const DB_LIMITS = {
        chatDb: { bytes: DB_DISK_BYTES, label: '15 GB disk (Render PG Basic, 1GB RAM)' },
        web2Db: { bytes: DB_DISK_BYTES, label: '15 GB disk (Render PG Basic, 1GB RAM)' },
    };

    const REFRESH_MS = 60000;
    let _refreshTimer = null;
    let _started = false;
    let _hadData = false; // first-load guard: skeleton only until first successful render
    let _lastData = null; // payload gần nhất → modal chi tiết + AI widget accessor

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
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    // First-load skeletons: chỉ hiện khi CHƯA có data thật (tránh flash khi
    // auto-refresh 60s / reload). Mỗi shape khớp nội dung sắp render.
    function showFirstLoadSkeletons() {
        if (_hadData) return;
        const Sk = window.Web2Skeleton;
        if (!Sk) return; // không có helper → giữ nguyên placeholder "Đang tải..."
        Sk.cards('#sdDbGrid', { count: 2, min: 280 });
        Sk.cards('#sdServiceGrid', { count: 8, min: 200 });
        Sk.stats('#sdProcGrid', { count: 4, min: 170 });
    }

    // Lỗi trên first-load: xóa skeleton để không đứng hình mãi (render lỗi text).
    function clearFirstLoadSkeletons(msg) {
        if (_hadData) return;
        const Sk = window.Web2Skeleton;
        const errHtml = `<div class="sd-loading">⚠️ ${escapeHtml(msg || 'Lỗi tải dữ liệu')}</div>`;
        for (const id of ['sdDbGrid', 'sdServiceGrid', 'sdProcGrid']) {
            const el = $(id);
            if (el) el.innerHTML = errHtml;
            else if (Sk) Sk.clear('#' + id);
        }
    }

    // manual=true (first-load / nút reload) → scrape ngoài (SePay + /health máy Gemini).
    // Auto-refresh 60s gọi load() (manual=false) → CHỈ refresh DB/process, KHÔNG re-scrape
    // (SePay login + N×/health tốn kém; giữ DOM cũ — chỉ làm khi stale/manual).
    async function load(manual = false) {
        try {
            showFirstLoadSkeletons();
            // Endpoint giờ auth-gated (lộ inventory 2 DB + chi phí) → gắn x-web2-token.
            const r = await fetch(API, {
                headers: window.Web2Auth?.authHeaders?.() || {},
            });
            if (r.status === 403) {
                throw new Error('Cần quyền ADMIN để xem Dịch vụ & Hệ thống');
            }
            if (r.status === 401) {
                throw new Error('Cần đăng nhập Web 2.0 để xem Dịch vụ & Hệ thống');
            }
            const data = await r.json();
            if (!data?.ok) throw new Error(data?.error || `HTTP ${r.status}`);
            _lastData = data;
            // Scrape ngoài chạy lần đầu (chưa có data) hoặc khi manual; auto-refresh thì bỏ.
            renderAll(data, manual || !_hadData);
            _hadData = true;
        } catch (e) {
            console.error('[system-services] load fail:', e);
            const u = $('sysUpdated');
            if (u) u.textContent = `Lỗi: ${e.message}`;
            clearFirstLoadSkeletons(e.message);
            if (window.notificationManager?.show) {
                window.notificationManager.show(`Tải data fail: ${e.message}`, 'error');
            }
        }
    }

    function renderAll(data, scrapeExternal) {
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
        // Scrape ngoài tốn kém → chỉ chạy khi first-load/manual (xem load()), KHÔNG mỗi 60s.
        if (scrapeExternal) {
            renderGeminiMachines(); // async — dò registry + /health từng máy shop (độc lập services-overview)
            renderSepayInvoices(); // async — login my.sepay.vn → hóa đơn + QR (độc lập)
        }

        _wireClicks();
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
            // Ưu tiên dung lượng disk thật từ payload (nếu backend kèm stats.diskBytes);
            // else fallback hằng số 15GB hardcode (Render API diskSizeGB=15, 2026-06-28).
            const diskBytes = Number(stats.diskBytes) > 0 ? Number(stats.diskBytes) : limit.bytes;
            const pct = diskBytes > 0 ? (stats.dbSizeBytes / diskBytes) * 100 : 0;
            const usageClass = pct >= 80 ? 'danger' : pct >= 60 ? 'warn' : '';
            // Cả 2 Postgres đều PAID (basic_1gb $19/mo) — KHÔNG dùng badge "free".
            const planClass = '';
            const planLabel = 'Basic 1GB · PAID ($19/mo)';
            const provider =
                poolKey === 'chatDb'
                    ? 'Render PG — n2store-chat-db'
                    : 'Render PG — n2store-web2-db';
            const purpose =
                poolKey === 'chatDb'
                    ? 'DB Web 1.0 (n2store_chat) — customers, balance_history, customer_wallets, app_users… Web 2.0 KHÔNG còn ở đây.'
                    : 'DB Web 2.0 (n2store_web2) — TOÀN BỘ data Web 2.0: web2_*, native_orders, fast_sale_orders, web2_customers, web2_balance_history, ví KH/transactions… (cutover xong 2026-06-03).';

            const allTables = stats.tables || [];
            const tablesHtml = allTables
                .slice(0, 8)
                .map(
                    (t) =>
                        `<tr data-pool="${escapeHtml(poolKey)}" data-table="${escapeHtml(t.name)}" role="button" tabindex="0" title="Bấm xem chi tiết bảng">
                            <td><code>${escapeHtml(t.name)}</code></td>
                            <td class="num">${fmtNumber(t.rowCount)}</td>
                            <td class="num">${escapeHtml(t.totalPretty || fmtBytes(t.totalBytes))}</td>
                        </tr>`
                )
                .join('');
            const moreTables = allTables.length > 8 ? allTables.length - 8 : 0;

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
                                <h4>Top tables theo size <span class="sd-db-tables-hint">· bấm dòng xem chi tiết</span></h4>
                                <table>
                                    <thead><tr><th>Tên</th><th class="num">Rows</th><th class="num">Size</th></tr></thead>
                                    <tbody>${tablesHtml}</tbody>
                                </table>
                                ${moreTables ? `<button type="button" class="sd-db-tables-more" data-pool-all="${escapeHtml(poolKey)}">Xem tất cả ${allTables.length} bảng (+${moreTables}) →</button>` : ''}
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

            return `<div class="sd-svc-card sd-cat-${escapeHtml(s.category || 'other')}" data-svc="${escapeHtml(s.name)}" role="button" tabindex="0" title="Bấm xem chi tiết">
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

    // Hóa đơn SePay: backend login my.sepay.vn → list hóa đơn + QR VietQR cho hóa đơn chưa trả.
    async function renderSepayInvoices() {
        const host = $('sdSepayInvoices');
        if (!host) return;
        const base =
            window.WEB2_CONFIG?.WORKER_URL ||
            window.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        try {
            const r = await fetch(base + '/api/web2-sepay-invoices', {
                signal: AbortSignal.timeout(25000),
            });
            const d = await r.json();
            if (!d.ok) {
                host.innerHTML = `<div style="padding:12px 14px;border:1px solid #fde68a;background:#fffbeb;border-radius:11px;color:#92400e;font-size:.84rem;line-height:1.55">
                    ⚠️ ${escapeHtml(d.error || 'Không tải được hóa đơn SePay')}${d.configured === false ? ' (chưa cấu hình env Render)' : ''}
                    <div style="margin-top:8px">SePay (Cloudflare) chặn scrape từ server. Xem hóa đơn trực tiếp:
                        <a href="https://my.sepay.vn/invoices" target="_blank" rel="noopener" style="color:#0068ff;font-weight:600">my.sepay.vn/invoices ↗</a>
                        — hoặc chạy <code>node scripts/sepay-push.js</code> từ máy IP nhà để đẩy snapshot.</div>
                </div>`;
                return;
            }
            const s = d.summary || {};
            const fmtV = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
            const head = `<div class="sd-cost-strip" style="margin-bottom:12px">
                <div class="sd-cost-card"><span class="sd-cost-label">📅 Gói/tháng</span><strong class="sd-cost-value">${s.monthlyVnd ? fmtV(s.monthlyVnd) : '—'}</strong></div>
                <div class="sd-cost-card ${s.unpaidCount ? 'sd-cost-total' : 'sd-cost-free'}"><span class="sd-cost-label">🔴 Chưa thanh toán</span><strong class="sd-cost-value">${s.unpaidCount || 0} HĐ · ${fmtV(s.unpaidAmountVnd)}</strong></div>
                <div class="sd-cost-card"><span class="sd-cost-label">🧾 Tổng hóa đơn</span><strong class="sd-cost-value">${s.total || 0}</strong></div>
            </div>`;
            const rows = (d.invoices || [])
                .map((inv) => {
                    const badge = inv.paid
                        ? '<span style="color:#16a34a;font-weight:700">✓ Đã trả</span>'
                        : '<span style="color:#dc2626;font-weight:700">● Chưa trả</span>';
                    const qr = inv.qrUrl
                        ? `<div style="margin-top:8px"><img src="${escapeHtml(inv.qrUrl)}" alt="QR thanh toán" style="width:150px;height:150px;border:1px solid #e2e8f0;border-radius:8px" loading="lazy"><div style="font-size:.72rem;color:#64748b;margin-top:3px">Quét VietQR để thanh toán ${escapeHtml(inv.amountStr)}</div></div>`
                        : '';
                    return `<div style="padding:11px 13px;border:1px solid ${inv.paid ? '#e2e8f0' : '#fecaca'};border-radius:11px;background:${inv.paid ? '#fff' : '#fef2f2'};margin-bottom:8px">
                        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
                            <div><strong>${escapeHtml(inv.number || '#' + inv.id)}</strong> · ${escapeHtml(inv.type)} <span style="color:#94a3b8;font-size:.8rem">· ${escapeHtml(inv.date)}</span></div>
                            <div style="display:flex;gap:12px;align-items:center"><span style="font-weight:700">${escapeHtml(inv.amountStr)}</span>${badge}</div>
                        </div>${qr}</div>`;
                })
                .join('');
            host.innerHTML =
                head +
                rows +
                `<div style="font-size:.72rem;color:#94a3b8;margin-top:4px">${d.cached ? '(cache 10 phút) ' : ''}${d.staleError ? '⚠️ ' + escapeHtml(d.staleError) : ''}</div>`;
        } catch (e) {
            host.innerHTML = `<div class="sd-loading" style="color:#b45309">⚠️ ${escapeHtml(e.message || 'Lỗi tải hóa đơn SePay')}</div>`;
        }
    }

    // Giám sát máy shop tự host gemini-tryon: dò registry → /health từng máy → account uses/lỗi.
    // Client-side (độc lập /api/services-overview) vì máy chạy nhà shop, không phải dịch vụ Render.
    async function renderGeminiMachines() {
        const grid = $('sdGeminiMachines');
        if (!grid) return;
        const base =
            window.WEB2_CONFIG?.WORKER_URL ||
            window.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        let machines = [];
        try {
            const r = await fetch(base + '/api/web2-vieneu-registry/list?engine=gemini-tryon', {
                signal: AbortSignal.timeout(8000),
            });
            const d = await r.json();
            machines = (d.servers || []).filter((s) => s && s.url);
        } catch (_) {}
        if (!machines.length) {
            grid.innerHTML =
                '<div class="sd-loading" style="color:var(--web2-text-3)">⚪ Chưa thấy máy nào online — bật sidecar trên máy shop (bộ cài chọn [4] Gemini).</div>';
            return;
        }
        const cards = await Promise.all(
            machines.map(async (m) => {
                const url = m.url.replace(/\/+$/, '');
                let h = null;
                try {
                    const r = await fetch(url + '/health', { signal: AbortSignal.timeout(8000) });
                    h = await r.json();
                } catch (_) {}
                const accts = (h && h.accounts) || [];
                const rows =
                    accts
                        .map((a) => {
                            const dot = a.ready ? (a.cooling ? '🟠' : '🟢') : '🔴';
                            const meta =
                                (a.uses != null ? a.uses + ' ảnh' : '') +
                                (a.cooling ? ' · nghỉ ' + a.cooldownLeftSec + 's' : '');
                            const err = a.lastError
                                ? `<div style="color:#b45309;font-size:10px;line-height:1.4">⚠ ${escapeHtml(String(a.lastError).slice(0, 130))}</div>`
                                : '';
                            return `<div style="padding:5px 0;border-top:1px solid var(--web2-border)"><b>${dot} ${escapeHtml(a.label)}</b> <span style="color:var(--web2-text-3)">${escapeHtml(meta)}</span>${err}</div>`;
                        })
                        .join('') ||
                    '<div style="color:var(--web2-text-3);font-size:12px">(không lấy được /health của máy)</div>';
                const head =
                    h && h.ready
                        ? `<span class="sd-svc-cost free">${h.readyCount} acc sẵn sàng</span>`
                        : `<span class="sd-svc-cost paid">offline/lỗi</span>`;
                return `<div class="sd-svc-card sd-cat-other">
                    <div class="sd-svc-head"><span class="sd-svc-name">👕 ${escapeHtml(m.name)}</span>${head}</div>
                    <div class="sd-svc-provider">cập nhật ${m.ageSec}s trước · ${escapeHtml(url.replace(/^https?:\/\//, '').slice(0, 34))}…</div>
                    ${rows}
                    <a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(url)}" style="display:inline-block;margin-top:9px;padding:5px 11px;border:1px solid var(--web2-primary,#0068ff);color:var(--web2-primary,#0068ff);border-radius:7px;font-size:12px;font-weight:600;text-decoration:none">🔗 Mở giao diện Gemini</a>
                </div>`;
            })
        );
        grid.innerHTML = cards.join('');
        if (window.lucide) lucide.createIcons();
    }

    function renderProcess(proc) {
        const grid = $('sdProcGrid');
        const mem = proc.memory || {};
        const cards = [
            { label: '🕒 Uptime', value: proc.uptimePretty || '—' },
            { label: '🧠 RSS Memory', value: fmtBytes(mem.rss) },
            {
                label: '📦 Heap Used',
                value: `${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}`,
            },
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

    // ── Detail modal (dùng chung cho service + DB table) ──────────────────────
    function _ensureModal() {
        let m = $('sdDetailModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'sdDetailModal';
        m.className = 'sd-modal';
        m.setAttribute('hidden', '');
        m.innerHTML = `
            <div class="sd-modal-backdrop" data-close></div>
            <div class="sd-modal-box" role="dialog" aria-modal="true" aria-labelledby="sdModalTitle">
                <header class="sd-modal-head">
                    <h3 id="sdModalTitle">—</h3>
                    <button type="button" class="sd-modal-close" data-close aria-label="Đóng">✕</button>
                </header>
                <div class="sd-modal-body" id="sdModalBody"></div>
            </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', (e) => {
            if (e.target.closest('[data-close]')) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !m.hasAttribute('hidden')) closeModal();
        });
        return m;
    }
    function openModal(title, bodyHtml) {
        const m = _ensureModal();
        m.querySelector('#sdModalTitle').textContent = title;
        m.querySelector('#sdModalBody').innerHTML = bodyHtml;
        m.removeAttribute('hidden');
        document.body.classList.add('sd-modal-open');
        if (window.lucide) lucide.createIcons();
        const c = m.querySelector('.sd-modal-close');
        if (c) c.focus();
    }
    function closeModal() {
        const m = $('sdDetailModal');
        if (m) m.setAttribute('hidden', '');
        document.body.classList.remove('sd-modal-open');
    }

    function _kvRows(obj) {
        if (!obj || typeof obj !== 'object') return '';
        return Object.entries(obj)
            .map(
                ([k, v]) =>
                    `<div class="sd-kv"><span class="sd-kv-k">${escapeHtml(k)}</span><span class="sd-kv-v">${escapeHtml(v)}</span></div>`
            )
            .join('');
    }

    function openServiceModal(name) {
        const s = (_lastData?.services || []).find((x) => x.name === name);
        if (!s) return;
        const isPaid = Number(s.costMonth) > 0;
        const body = `
            <div class="sd-modal-tags">
                <span class="sd-tag sd-tag-${escapeHtml(s.category || 'other')}">${escapeHtml(s.category || 'other')}</span>
                <span class="sd-tag ${isPaid ? 'sd-tag-paid' : 'sd-tag-free'}">${isPaid ? `$${s.costMonth}/mo` : 'Free'}</span>
            </div>
            <div class="sd-modal-section">
                <div class="sd-kv"><span class="sd-kv-k">Nhà cung cấp</span><span class="sd-kv-v">${escapeHtml(s.provider || '—')}</span></div>
                <div class="sd-kv"><span class="sd-kv-k">Gói</span><span class="sd-kv-v">${escapeHtml(s.plan || '—')}</span></div>
                <div class="sd-kv"><span class="sd-kv-k">Lớp (layer)</span><span class="sd-kv-v">${escapeHtml(s.layer || '—')}</span></div>
            </div>
            <div class="sd-modal-purpose">${escapeHtml(s.purpose || 'Không có mô tả.')}</div>
            ${s.freeTier ? `<div class="sd-modal-section"><h4>🆓 Free tier</h4>${_kvRows(s.freeTier)}</div>` : ''}
            ${s.paidLimit ? `<div class="sd-modal-section"><h4>💸 Giới hạn gói trả phí</h4>${_kvRows(s.paidLimit)}</div>` : ''}
            ${
                s.url
                    ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="sd-modal-link"><i data-lucide="external-link"></i> Mở dashboard</a>`
                    : ''
            }`;
        openModal(s.name, body);
    }

    function openTableModal(poolKey, tableName) {
        const stats = (_lastData?.databases || {})[poolKey];
        const t = (stats?.tables || []).find((x) => x.name === tableName);
        if (!t) return;
        const limitBytes = (DB_LIMITS[poolKey] || {}).bytes || 0;
        const pct = limitBytes > 0 && t.totalBytes ? (t.totalBytes / limitBytes) * 100 : 0;
        const body = `
            <div class="sd-modal-tags">
                <span class="sd-tag">${escapeHtml(poolKey)}</span>
                <span class="sd-tag">${escapeHtml(t.totalPretty || fmtBytes(t.totalBytes))}</span>
            </div>
            <div class="sd-modal-section">
                <div class="sd-kv"><span class="sd-kv-k">Số dòng</span><span class="sd-kv-v">${fmtNumber(t.rowCount)}</span></div>
                <div class="sd-kv"><span class="sd-kv-k">Tổng dung lượng</span><span class="sd-kv-v">${escapeHtml(t.totalPretty || fmtBytes(t.totalBytes))}</span></div>
                ${t.tableBytes != null ? `<div class="sd-kv"><span class="sd-kv-k">Data (không index)</span><span class="sd-kv-v">${escapeHtml(t.tablePretty || fmtBytes(t.tableBytes))}</span></div>` : ''}
                ${t.indexBytes != null ? `<div class="sd-kv"><span class="sd-kv-k">Index</span><span class="sd-kv-v">${escapeHtml(t.indexPretty || fmtBytes(t.indexBytes))}</span></div>` : ''}
                ${t.rowCount && t.totalBytes ? `<div class="sd-kv"><span class="sd-kv-k">Bytes/dòng (TB)</span><span class="sd-kv-v">${fmtBytes(t.totalBytes / t.rowCount)}</span></div>` : ''}
                <div class="sd-kv"><span class="sd-kv-k">% của DB (15GB)</span><span class="sd-kv-v">${pct.toFixed(2)}%</span></div>
            </div>`;
        openModal(`Bảng: ${tableName}`, body);
    }

    function openAllTablesModal(poolKey) {
        const stats = (_lastData?.databases || {})[poolKey];
        const tables = (stats?.tables || []).slice();
        if (!tables.length) return;
        const rows = tables
            .map(
                (t, i) =>
                    `<tr data-pool="${escapeHtml(poolKey)}" data-table="${escapeHtml(t.name)}" role="button" tabindex="0">
                        <td class="num">${i + 1}</td>
                        <td><code>${escapeHtml(t.name)}</code></td>
                        <td class="num">${fmtNumber(t.rowCount)}</td>
                        <td class="num">${escapeHtml(t.totalPretty || fmtBytes(t.totalBytes))}</td>
                    </tr>`
            )
            .join('');
        openModal(
            `${tables.length} bảng · ${poolKey}`,
            `<div class="sd-modal-tablewrap"><table class="sd-modal-table">
                <thead><tr><th class="num">#</th><th>Tên bảng</th><th class="num">Rows</th><th class="num">Size</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>`
        );
    }

    // Event delegation: 1 listener / panel (service grid + DB grid + modal table).
    function _wireClicks() {
        const handler = (e) => {
            const svc = e.target.closest('[data-svc]');
            if (svc) return openServiceModal(svc.getAttribute('data-svc'));
            const all = e.target.closest('[data-pool-all]');
            if (all) return openAllTablesModal(all.getAttribute('data-pool-all'));
            const row = e.target.closest('[data-table][data-pool]');
            if (row)
                return openTableModal(
                    row.getAttribute('data-pool'),
                    row.getAttribute('data-table')
                );
        };
        const keyHandler = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                if (e.target.matches('[data-svc],[data-table][data-pool],[data-pool-all]')) {
                    e.preventDefault();
                    handler(e);
                }
            }
        };
        for (const id of ['sdServiceGrid', 'sdDbGrid']) {
            const el = $(id);
            if (el && !el._sdWired) {
                el.addEventListener('click', handler);
                el.addEventListener('keydown', keyHandler);
                el._sdWired = true;
            }
        }
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

    window.SystemServices = {
        start,
        reload: () => load(true), // nút reload = manual → re-scrape SePay + máy Gemini
        // AI widget accessor — payload services-overview gần nhất (DB + dịch vụ + process).
        getData: () => _lastData,
        get data() {
            return _lastData;
        },
    };
})();
