// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — period-based report.
//
// Data sources:
//   1. so_order_v2/main (Firestore) — derive purchases per supplier per shipment.
//   2. supplier_wallet_v1/main (Firestore) — ledger (payment + return transactions).
//
// Calc per supplier per period [from, to]:
//   purchases_before = Σ (qty × costPrice × rate→VND) WHERE shipment.date < from
//   tx_before        = Σ |amount| WHERE tx.ts < from
//   opening          = purchases_before - tx_before
//   debit            = Σ purchases WHERE shipment.date in [from, to]
//   credit           = Σ |amount|   WHERE tx.ts in [from, to]
//   ending           = opening + debit - credit
//
// State persistence: localStorage filter prefs only. No write-back.

(function () {
    'use strict';

    const FALLBACK_RATES = {
        VND: 1,
        CNY: 3500,
        USD: 26000,
        EUR: 28000,
        JPY: 170,
        KRW: 18,
        THB: 720,
    };

    const TPOS_API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata';

    const STATE = {
        soOrderData: null,
        walletData: null,
        tposData: [], // raw TPOS supplier rows (from Report/PartnerDebtReport)
        tposCongNo: new Map(), // partnerId → congNo rows (lazy fetched on expand)
        rows: [], // aggregated supplier rows after filter
        sortField: 'ending',
        sortDir: 'desc',
        page: 1,
        pageSize: 50,
        filters: {
            from: '', // yyyy-mm-dd
            to: '',
            search: '',
            display: 'all', // 'all' | 'endnonzero'
            sourceWeb2: true,
            sourceTpos: false,
        },
        expanded: new Set(), // expanded supplier names
        detailTabs: new Map(), // supplier → active tab name (default 'congno')
    };

    // ---------- helpers ----------
    function fmtVnd(n) {
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtDateVN(iso) {
        if (!iso) return '—';
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}` : iso;
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts));
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }
    function rateToVnd(currency, tab) {
        if (!currency || currency === 'VND') return 1;
        if (tab && tab.currency === currency) {
            return Number(tab.rate) || FALLBACK_RATES[currency] || 1;
        }
        return FALLBACK_RATES[currency] || 1;
    }
    function isoToTs(iso) {
        if (!iso) return 0;
        const t = Date.parse(iso);
        return Number.isFinite(t) ? t : 0;
    }
    function isInPeriod(date, fromIso, toIso) {
        if (!date) return false;
        const d = String(date).slice(0, 10);
        if (fromIso && d < fromIso) return false;
        if (toIso && d > toIso) return false;
        return true;
    }
    function isBefore(date, fromIso) {
        if (!fromIso) return false;
        if (!date) return false;
        return String(date).slice(0, 10) < fromIso;
    }

    // ---------- load ----------
    async function loadAll() {
        const tasks = [];
        if (STATE.filters.sourceWeb2) tasks.push(loadWeb2());
        if (STATE.filters.sourceTpos) tasks.push(loadTpos());
        await Promise.all(tasks);
    }

    async function loadWeb2() {
        try {
            if (typeof firebase === 'undefined' || !firebase.firestore) {
                notify('Firebase chưa sẵn sàng', 'error');
                return;
            }
            const db = firebase.firestore();
            const [soSnap, walletSnap] = await Promise.all([
                db.collection('so_order_v2').doc('main').get(),
                db.collection('supplier_wallet_v1').doc('main').get(),
            ]);
            STATE.soOrderData = soSnap.exists ? soSnap.data()?.data || null : null;
            STATE.walletData = walletSnap.exists ? walletSnap.data()?.data || null : null;
        } catch (e) {
            console.warn('[supplier-debt] load Web 2.0 fail:', e.message);
            notify('Lỗi tải dữ liệu Web 2.0: ' + e.message, 'error');
        }
    }

    function isoTpos(date, endOfDay) {
        if (!date) return '';
        // yyyy-mm-dd → ISO with TZ for TPOS
        const d = new Date(date + 'T' + (endOfDay ? '23:59:59' : '00:00:00') + '+07:00');
        return d.toISOString();
    }

    async function loadTpos() {
        try {
            if (!window.tokenManager?.authenticatedFetch) {
                notify('TokenManager chưa load — refresh trang', 'warning');
                return;
            }
            const params = new URLSearchParams();
            params.set('Display', 'all');
            const from = STATE.filters.from || '2020-01-01';
            const to = STATE.filters.to || new Date().toISOString().slice(0, 10);
            params.set('DateFrom', isoTpos(from, false));
            params.set('DateTo', isoTpos(to, true));
            params.set('ResultSelection', 'supplier');
            params.set('$top', '1000');
            params.set('$count', 'true');
            params.set('$orderby', 'Code asc');
            const url = `${TPOS_API_BASE}/Report/PartnerDebtReport?${params.toString()}`;
            const res = await window.tokenManager.authenticatedFetch(url, {
                headers: { 'Content-Type': 'application/json', tposappversion: '6.2.6.1' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            STATE.tposData = Array.isArray(json.value) ? json.value : [];
        } catch (e) {
            console.warn('[supplier-debt] load TPOS fail:', e.message);
            notify('Lỗi tải TPOS: ' + e.message, 'error');
            STATE.tposData = [];
        }
    }

    async function loadTposCongNo(partnerId) {
        try {
            if (!window.tokenManager?.authenticatedFetch) return [];
            const params = new URLSearchParams();
            params.set('ResultSelection', 'supplier');
            params.set('PartnerId', String(partnerId));
            const from = STATE.filters.from || '2020-01-01';
            const to = STATE.filters.to || new Date().toISOString().slice(0, 10);
            params.set('DateFrom', isoTpos(from, false));
            params.set('DateTo', isoTpos(to, true));
            params.set('CompanyId', '');
            params.set('$format', 'json');
            params.set('$top', '200');
            params.set('$orderby', 'Date asc');
            const url = `${TPOS_API_BASE}/Report/PartnerDebtReportDetail?${params.toString()}`;
            const res = await window.tokenManager.authenticatedFetch(url, {
                headers: { 'Content-Type': 'application/json', tposappversion: '6.2.6.1' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return Array.isArray(json.value) ? json.value : [];
        } catch (e) {
            console.warn('[supplier-debt] load TPOS congno fail:', e.message);
            return [];
        }
    }

    // ---------- aggregate ----------
    // Returns: { [supplier]: { supplier, opening, debit, credit, ending,
    //                          purchasesInPeriod: [...], txInPeriod: [...] } }
    function aggregate() {
        const { from, to } = STATE.filters;
        const result = {};

        // Pass 1: walk so_order shipments → distribute purchases.
        const tabs = STATE.soOrderData?.tabs || [];
        for (const tab of tabs) {
            const rate = rateToVnd(tab.currency, tab);
            for (const sh of tab.shipments || []) {
                for (const r of sh.rows || []) {
                    const supplier = (r.supplier || '').trim();
                    if (!supplier) continue;
                    const qty = Number(r.qty) || 0;
                    const costVnd = (Number(r.costPrice) || 0) * rate;
                    const subtotal = qty * costVnd;
                    if (subtotal <= 0) continue;

                    if (!result[supplier]) {
                        result[supplier] = makeRow(supplier);
                    }
                    const row = result[supplier];

                    if (isBefore(sh.date, from)) {
                        row._purchasesBefore += subtotal;
                    } else if (isInPeriod(sh.date, from, to)) {
                        row.debit += subtotal;
                        row.purchasesInPeriod.push({
                            date: sh.date,
                            tabLabel: tab.label || '',
                            productName: r.productName || '',
                            variant: r.variant || '',
                            qty,
                            costVnd,
                            subtotal,
                        });
                    }
                }
            }
        }

        // Pass 2: walk wallet transactions → distribute payments+returns.
        const wallets = STATE.walletData?.wallets || {};
        for (const supplier of Object.keys(wallets)) {
            const w = wallets[supplier];
            if (!result[supplier]) {
                result[supplier] = makeRow(supplier);
            }
            const row = result[supplier];
            for (const tx of w.transactions || []) {
                if (tx.type !== 'payment' && tx.type !== 'return') continue;
                const amount = Number(tx.amount) || 0;
                if (amount <= 0) continue;
                const ts = Number(tx.ts) || 0;
                const txDate = ts ? new Date(ts).toISOString().slice(0, 10) : '';
                if (from && txDate && txDate < from) {
                    row._txBefore += amount;
                } else if (isInPeriod(txDate, from, to)) {
                    row.credit += amount;
                    row.txInPeriod.push({
                        ts,
                        type: tx.type,
                        amount,
                        note: tx.note || '',
                    });
                } else if (!from && !to) {
                    // No period filter → all → put in period
                    row.credit += amount;
                    row.txInPeriod.push({
                        ts,
                        type: tx.type,
                        amount,
                        note: tx.note || '',
                    });
                }
            }
        }

        // Finalize: compute opening + ending for Web 2.0 rows
        for (const supplier of Object.keys(result)) {
            const row = result[supplier];
            row.opening = row._purchasesBefore - row._txBefore;
            row.ending = row.opening + row.debit - row.credit;
        }

        // Merge TPOS rows (server-provided Debit/Credit/End; opening derived).
        // Key by "[code] name" so a Web 2.0 supplier matching TPOS code doesn't collide.
        for (const t of STATE.tposData || []) {
            const code = t.Code || '';
            const name = t.PartnerName || '';
            const key = code ? `[${code}] ${name}` : name;
            if (!key) continue;
            const debit = Number(t.Debit) || 0;
            const credit = Number(t.Credit) || 0;
            const ending = Number(t.End) || 0;
            const opening = ending - debit + credit;
            // TPOS row replaces existing key only if Web 2.0 doesn't already have data.
            if (result[key]) continue;
            result[key] = {
                supplier: key,
                opening,
                debit,
                credit,
                ending,
                _purchasesBefore: 0,
                _txBefore: 0,
                purchasesInPeriod: [],
                txInPeriod: [],
                source: 'tpos',
                code,
                partnerId: t.PartnerId || null,
            };
        }
        return result;
    }

    function makeRow(supplier, opts) {
        return {
            supplier,
            opening: 0,
            debit: 0,
            credit: 0,
            ending: 0,
            _purchasesBefore: 0,
            _txBefore: 0,
            purchasesInPeriod: [],
            txInPeriod: [],
            source: opts?.source || 'web2', // 'web2' | 'tpos'
            code: opts?.code || '',
            partnerId: opts?.partnerId || null,
        };
    }

    // ---------- filter + render ----------
    function applyFilterAndRender() {
        const agg = aggregate();
        const search = (STATE.filters.search || '').trim().toLowerCase();
        let rows = Object.values(agg);

        if (search) {
            rows = rows.filter((r) => r.supplier.toLowerCase().includes(search));
        }
        if (STATE.filters.display === 'endnonzero') {
            rows = rows.filter((r) => Math.abs(r.ending) > 0.5);
        }

        const dir = STATE.sortDir === 'asc' ? 1 : -1;
        const f = STATE.sortField;
        rows.sort((a, b) => {
            if (f === 'opening' || f === 'debit' || f === 'credit' || f === 'ending') {
                return (a[f] - b[f]) * dir;
            }
            return a.supplier.localeCompare(b.supplier) * dir;
        });

        STATE.rows = rows;
        if (STATE.page < 1) STATE.page = 1;
        const maxPage = Math.max(1, Math.ceil(rows.length / STATE.pageSize));
        if (STATE.page > maxPage) STATE.page = maxPage;
        renderTable();
        renderTotals();
        renderPagination();
    }

    function renderTable() {
        const body = document.getElementById('sdTableBody');
        const empty = document.getElementById('sdEmpty');
        const { rows, page, pageSize } = STATE;
        if (!rows.length) {
            body.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        const start = (page - 1) * pageSize;
        const slice = rows.slice(start, start + pageSize);

        // Build main row + detail row per supplier
        const html = slice
            .map((r, i) => {
                const stt = start + i + 1;
                const cls = r.ending > 0.5 ? 'is-debt' : r.ending < -0.5 ? 'is-credit' : '';
                const isExpanded = STATE.expanded.has(r.supplier);
                const arrow = isExpanded ? '▼' : '▶';
                const detailContent = isExpanded ? detailPanelHtml(r) : '';
                const sourceBadge =
                    r.source === 'tpos'
                        ? `<span class="sd-source-badge is-tpos" title="Dữ liệu từ TPOS (legacy)">TPOS</span>`
                        : `<span class="sd-source-badge is-web2" title="Dữ liệu từ Web 2.0 (so-order + ví NCC)">WEB 2.0</span>`;
                return `<tr class="sd-main-row ${cls} ${isExpanded ? 'is-expanded' : ''}" data-supplier="${escapeHtml(r.supplier)}">
                    <td class="num-stt">${stt}</td>
                    <td class="col-expand"><button class="sd-expand-btn" type="button" data-toggle-supplier="${escapeHtml(r.supplier)}">${arrow}</button></td>
                    <td class="col-name">${sourceBadge}${escapeHtml(r.supplier)}</td>
                    <td class="num">${fmtVnd(r.opening)}</td>
                    <td class="num">${fmtVnd(r.debit)}</td>
                    <td class="num">${fmtVnd(r.credit)}</td>
                    <td class="num col-ending">${fmtVnd(r.ending)}</td>
                </tr>
                <tr class="sd-detail-row" data-detail-for="${escapeHtml(r.supplier)}" ${isExpanded ? '' : 'hidden'}>
                    <td colspan="7" class="sd-detail-cell">${detailContent}</td>
                </tr>`;
            })
            .join('');
        body.innerHTML = html;

        // Wire row click → toggle expand
        body.querySelectorAll('tr.sd-main-row').forEach((tr) => {
            tr.addEventListener('click', (e) => {
                // Don't intercept clicks on tab buttons (live in detail row, not main row)
                if (e.target.closest('.sd-tab, .sd-expand-btn')) return;
                toggleExpand(tr.dataset.supplier);
            });
        });
        body.querySelectorAll('[data-toggle-supplier]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleExpand(btn.dataset.toggleSupplier);
            });
        });
        wireDetailTabs();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function wireDetailTabs() {
        document.querySelectorAll('.sd-detail-row[data-detail-for]').forEach((tr) => {
            const supplier = tr.dataset.detailFor;
            tr.querySelectorAll('.sd-tab').forEach((b) => {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    STATE.detailTabs.set(supplier, b.dataset.detailTab);
                    updateDetailPanel(supplier);
                });
            });
        });
    }

    function toggleExpand(supplier) {
        if (STATE.expanded.has(supplier)) {
            STATE.expanded.delete(supplier);
        } else {
            STATE.expanded.add(supplier);
            if (!STATE.detailTabs.has(supplier)) {
                STATE.detailTabs.set(supplier, 'congno');
            }
        }
        renderTable();
    }

    function updateDetailPanel(supplier) {
        // Re-render only the detail row for this supplier (no full table re-render).
        const detailTr = document.querySelector(
            `tr.sd-detail-row[data-detail-for="${cssAttrEscape(supplier)}"]`
        );
        const row = STATE.rows.find((r) => r.supplier === supplier);
        if (!detailTr || !row) return;
        const cell = detailTr.querySelector('.sd-detail-cell');
        if (cell) cell.innerHTML = detailPanelHtml(row);
        wireDetailTabs();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function cssAttrEscape(s) {
        return String(s || '').replace(/(["\\])/g, '\\$1');
    }

    function renderTotals() {
        const t = STATE.rows.reduce(
            (acc, r) => {
                acc.opening += r.opening;
                acc.debit += r.debit;
                acc.credit += r.credit;
                acc.ending += r.ending;
                return acc;
            },
            { opening: 0, debit: 0, credit: 0, ending: 0 }
        );
        document.getElementById('sdTotalOpening').textContent = fmtVnd(t.opening);
        document.getElementById('sdTotalDebit').textContent = fmtVnd(t.debit);
        document.getElementById('sdTotalCredit').textContent = fmtVnd(t.credit);
        document.getElementById('sdTotalEnding').textContent = fmtVnd(t.ending);
        document.getElementById('sdCountSuppliers').textContent = `${STATE.rows.length} NCC`;
        document.getElementById('sdCountEnd').textContent = `Nợ cuối: ${fmtVnd(t.ending)}`;
    }

    function renderPagination() {
        const total = STATE.rows.length;
        const maxPage = Math.max(1, Math.ceil(total / STATE.pageSize));
        const wrap = document.getElementById('sdPagination');
        if (total <= STATE.pageSize) {
            wrap.hidden = true;
            return;
        }
        wrap.hidden = false;
        document.getElementById('sdPageInfo').textContent = `Trang ${STATE.page} / ${maxPage}`;
        document.getElementById('sdPagePrev').disabled = STATE.page <= 1;
        document.getElementById('sdPageNext').disabled = STATE.page >= maxPage;
    }

    function updateSortIcons() {
        document.querySelectorAll('th.sortable').forEach((th) => {
            const f = th.dataset.sort;
            th.classList.remove('is-sort-asc', 'is-sort-desc');
            if (f === STATE.sortField) {
                th.classList.add(STATE.sortDir === 'asc' ? 'is-sort-asc' : 'is-sort-desc');
            }
        });
    }

    // ---------- inline detail panel ----------
    function detailPanelHtml(row) {
        const tab = STATE.detailTabs.get(row.supplier) || 'congno';
        const subParts = [];
        if (STATE.filters.from) subParts.push('Từ ' + fmtDateVN(STATE.filters.from));
        if (STATE.filters.to) subParts.push('Đến ' + fmtDateVN(STATE.filters.to));
        const sub = subParts.join(' · ') || 'Toàn bộ thời gian';
        return `
            <div class="sd-detail-stats">
                <div class="sd-stat">
                    <span class="sd-stat-label">Nợ đầu kỳ</span>
                    <span class="sd-stat-value">${fmtVnd(row.opening)}</span>
                </div>
                <div class="sd-stat sd-stat-debit">
                    <span class="sd-stat-label">Phát sinh</span>
                    <span class="sd-stat-value">${fmtVnd(row.debit)}</span>
                </div>
                <div class="sd-stat sd-stat-credit">
                    <span class="sd-stat-label">Thanh toán</span>
                    <span class="sd-stat-value">${fmtVnd(row.credit)}</span>
                </div>
                <div class="sd-stat sd-stat-strong">
                    <span class="sd-stat-label">Nợ cuối kỳ</span>
                    <span class="sd-stat-value">${fmtVnd(row.ending)}</span>
                </div>
            </div>
            <div class="sd-detail-period">${escapeHtml(sub)}</div>
            <div class="sd-detail-tabs">
                <button class="sd-tab ${tab === 'congno' ? 'is-active' : ''}" type="button" data-detail-tab="congno">Công nợ</button>
                <button class="sd-tab ${tab === 'purchases' ? 'is-active' : ''}" type="button" data-detail-tab="purchases">Phiếu mua</button>
                <button class="sd-tab ${tab === 'transactions' ? 'is-active' : ''}" type="button" data-detail-tab="transactions">Giao dịch</button>
            </div>
            <div class="sd-detail-content">
                ${tab === 'congno' ? congnoTableHtml(row) : ''}
                ${tab === 'purchases' ? purchasesTableHtml(row) : ''}
                ${tab === 'transactions' ? transactionsTableHtml(row) : ''}
            </div>
        `;
    }

    // Chronological merge of purchases (Debit) + transactions (Credit) with
    // running balance per row. Mimics legacy supplier-debt "Công nợ" tab.
    //
    // currentBegin starts = opening (đầu kỳ)
    // For mỗi entry sorted by date asc:
    //   currentEnd = currentBegin + debit - credit
    //   currentBegin = currentEnd (for next row)
    //
    // Result: cuối cùng currentEnd === row.ending (sanity check).
    function buildCongNoEntries(row) {
        const entries = [];
        for (const p of row.purchasesInPeriod || []) {
            entries.push({
                sortKey: String(p.date || '') + ' 00:00:00',
                date: p.date || '',
                desc: `Mua: ${p.productName || '—'}${p.variant ? ` (${p.variant})` : ''}`,
                moveName: `PO/${p.tabLabel || ''}`,
                debit: p.subtotal || 0,
                credit: 0,
            });
        }
        for (const t of row.txInPeriod || []) {
            const d = t.ts ? new Date(Number(t.ts)) : null;
            const dateIso = d ? d.toISOString().slice(0, 10) : '';
            const timeStr = d
                ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '';
            const lbl = t.type === 'return' ? 'Trả hàng' : 'Thanh toán';
            entries.push({
                sortKey: dateIso + ' ' + timeStr,
                date: dateIso,
                desc: lbl + (t.note ? ` — ${t.note}` : ''),
                moveName: t.type === 'return' ? 'RETURN' : 'PAYMENT',
                debit: 0,
                credit: t.amount || 0,
            });
        }
        entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        return entries;
    }

    // Build entries from TPOS PartnerDebtReportDetail rows. Each row has
    // { Date, Name (diễn giải), Ref (note), MoveName (bút toán), Debit, Credit }.
    function buildTposCongNoEntries(tposRows) {
        return tposRows.map((r) => ({
            sortKey: String(r.Date || '') + ' ' + String(r.MoveName || ''),
            date: r.Date ? String(r.Date).slice(0, 10) : '',
            desc: r.Name || r.Ref || '',
            moveName: r.MoveName || '',
            debit: Number(r.Debit) || 0,
            credit: Number(r.Credit) || 0,
        }));
    }

    function congnoTableHtml(row) {
        // TPOS source → entries come from `STATE.tposCongNo.get(partnerId)`,
        // fetched lazily on first expand. Show loading placeholder while pending.
        let entries;
        if (row.source === 'tpos' && row.partnerId) {
            const tposRows = STATE.tposCongNo.get(row.partnerId);
            if (tposRows === undefined) {
                // trigger lazy load
                loadTposCongNo(row.partnerId).then((rows) => {
                    STATE.tposCongNo.set(row.partnerId, rows);
                    updateDetailPanel(row.supplier);
                });
                return `<div class="sd-detail-empty"><i data-lucide="loader-2" style="width:18px;height:18px;"></i> Đang tải bút toán TPOS…</div>`;
            }
            entries = buildTposCongNoEntries(tposRows);
        } else {
            entries = buildCongNoEntries(row);
        }
        if (!entries.length) {
            return `<div class="sd-detail-empty">Không có bút toán trong kỳ.</div>`;
        }
        let runningBalance = row.opening;
        const rowsHtml = entries
            .map((e) => {
                const begin = runningBalance;
                const end = begin + (e.debit || 0) - (e.credit || 0);
                runningBalance = end;
                const moveCls =
                    e.moveName === 'PAYMENT' || e.moveName === 'RETURN' ? 'is-credit-move' : '';
                return `<tr class="${moveCls}">
                    <td>${escapeHtml(fmtDateVN(e.date))}</td>
                    <td>${escapeHtml(e.desc)}</td>
                    <td><span class="sd-move-name">${escapeHtml(e.moveName)}</span></td>
                    <td class="num">${fmtVnd(begin)}</td>
                    <td class="num">${e.debit ? fmtVnd(e.debit) : '—'}</td>
                    <td class="num">${e.credit ? fmtVnd(e.credit) : '—'}</td>
                    <td class="num"><strong>${fmtVnd(end)}</strong></td>
                </tr>`;
            })
            .join('');
        return `<table class="sd-detail-table sd-congno-table">
            <thead><tr>
                <th>Ngày</th><th>Diễn giải</th><th>Bút toán</th>
                <th class="num">Nợ đầu kỳ</th>
                <th class="num">Phát sinh</th>
                <th class="num">Thanh toán</th>
                <th class="num">Nợ cuối kỳ</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>`;
    }

    function purchasesTableHtml(row) {
        if (!row.purchasesInPeriod.length) {
            return `<div class="sd-detail-empty">Không có phiếu mua trong kỳ.</div>`;
        }
        const sorted = [...row.purchasesInPeriod].sort((a, b) =>
            String(b.date).localeCompare(String(a.date))
        );
        const rowsHtml = sorted
            .map(
                (p) => `<tr>
                    <td>${escapeHtml(fmtDateVN(p.date))}</td>
                    <td>${escapeHtml(p.tabLabel || '—')}</td>
                    <td>${escapeHtml(p.productName || '—')}</td>
                    <td>${escapeHtml(p.variant || '—')}</td>
                    <td class="num">${p.qty}</td>
                    <td class="num">${fmtVnd(p.costVnd)}</td>
                    <td class="num">${fmtVnd(p.subtotal)}</td>
                </tr>`
            )
            .join('');
        return `<table class="sd-detail-table">
            <thead><tr>
                <th>Ngày</th><th>Tab</th><th>Sản phẩm</th><th>Biến thể</th>
                <th class="num">SL</th><th class="num">Giá</th><th class="num">Thành tiền (VND)</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>`;
    }

    function transactionsTableHtml(row) {
        if (!row.txInPeriod.length) {
            return `<div class="sd-detail-empty">Không có giao dịch trong kỳ.</div>`;
        }
        const sorted = [...row.txInPeriod].sort((a, b) => b.ts - a.ts);
        const rowsHtml = sorted
            .map((t) => {
                const lbl = t.type === 'return' ? 'Trả hàng' : 'Thanh toán';
                return `<tr>
                    <td>${escapeHtml(fmtTime(t.ts))}</td>
                    <td><span class="sd-txn-type" data-type="${t.type}">${lbl}</span></td>
                    <td class="num">${fmtVnd(t.amount)}</td>
                    <td>${escapeHtml(t.note || '')}</td>
                </tr>`;
            })
            .join('');
        return `<table class="sd-detail-table">
            <thead><tr>
                <th>Thời gian</th><th>Loại</th><th class="num">Số tiền</th><th>Ghi chú</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>`;
    }

    // ---------- export CSV ----------
    function exportCsv() {
        const headers = ['#', 'Nhà cung cấp', 'Nợ đầu kỳ', 'Phát sinh', 'Thanh toán', 'Nợ cuối kỳ'];
        const lines = [headers.join(',')];
        STATE.rows.forEach((r, i) => {
            const cells = [
                i + 1,
                csvEscape(r.supplier),
                Math.round(r.opening),
                Math.round(r.debit),
                Math.round(r.credit),
                Math.round(r.ending),
            ];
            lines.push(cells.join(','));
        });
        const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fname = `cong-no-ncc_${STATE.filters.from || 'all'}_${STATE.filters.to || 'all'}.csv`;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify('Đã xuất CSV', 'success');
    }

    function csvEscape(s) {
        const str = String(s == null ? '' : s);
        if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
        return str;
    }

    // ---------- wire UI ----------
    function wireUi() {
        document.getElementById('sdSearchBtn').addEventListener('click', async () => {
            readFilters();
            STATE.page = 1;
            await loadAll();
            STATE.tposCongNo.clear(); // invalidate cached TPOS detail
            applyFilterAndRender();
        });
        const sourceWeb2 = document.getElementById('sdSourceWeb2');
        const sourceTpos = document.getElementById('sdSourceTpos');
        if (sourceWeb2) {
            sourceWeb2.addEventListener('change', async (e) => {
                STATE.filters.sourceWeb2 = e.target.checked;
                await loadAll();
                applyFilterAndRender();
            });
        }
        if (sourceTpos) {
            sourceTpos.addEventListener('change', async (e) => {
                STATE.filters.sourceTpos = e.target.checked;
                if (e.target.checked) notify('Đang tải dữ liệu TPOS…', 'info');
                await loadAll();
                applyFilterAndRender();
                if (e.target.checked) {
                    notify(`Đã tải ${STATE.tposData.length} NCC từ TPOS`, 'success');
                }
            });
        }
        document.getElementById('sdResetBtn').addEventListener('click', () => {
            document.getElementById('sdDateFrom').value = '';
            document.getElementById('sdDateTo').value = '';
            document.getElementById('sdSearch').value = '';
            document
                .querySelectorAll('input[name="sdDisplay"]')
                .forEach((r) => (r.checked = r.value === 'all'));
            readFilters();
            STATE.page = 1;
            applyFilterAndRender();
        });
        document.getElementById('sdExportBtn').addEventListener('click', exportCsv);
        document.getElementById('sdRefreshBtn').addEventListener('click', async () => {
            await loadAll();
            applyFilterAndRender();
            notify('Đã tải lại', 'success');
        });
        document.getElementById('sdSearch').addEventListener('input', (e) => {
            STATE.filters.search = e.target.value;
            STATE.page = 1;
            applyFilterAndRender();
        });
        document.querySelectorAll('input[name="sdDisplay"]').forEach((r) => {
            r.addEventListener('change', () => {
                STATE.filters.display = r.value;
                STATE.page = 1;
                applyFilterAndRender();
            });
        });
        document.querySelectorAll('#sdTable th.sortable').forEach((th) => {
            th.addEventListener('click', () => {
                const f = th.dataset.sort;
                if (STATE.sortField === f) {
                    STATE.sortDir = STATE.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    STATE.sortField = f;
                    STATE.sortDir = 'desc';
                }
                updateSortIcons();
                applyFilterAndRender();
            });
        });
        document.getElementById('sdPagePrev').addEventListener('click', () => {
            if (STATE.page > 1) {
                STATE.page--;
                renderTable();
                renderPagination();
            }
        });
        document.getElementById('sdPageNext').addEventListener('click', () => {
            const maxPage = Math.max(1, Math.ceil(STATE.rows.length / STATE.pageSize));
            if (STATE.page < maxPage) {
                STATE.page++;
                renderTable();
                renderPagination();
            }
        });
        // Esc → collapse all expanded rows
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && STATE.expanded.size > 0) {
                STATE.expanded.clear();
                renderTable();
            }
        });
    }

    function readFilters() {
        STATE.filters.from = document.getElementById('sdDateFrom').value || '';
        STATE.filters.to = document.getElementById('sdDateTo').value || '';
        STATE.filters.search = document.getElementById('sdSearch').value || '';
        const chosen = document.querySelector('input[name="sdDisplay"]:checked');
        STATE.filters.display = chosen ? chosen.value : 'all';
        STATE.filters.sourceWeb2 = document.getElementById('sdSourceWeb2')?.checked ?? true;
        STATE.filters.sourceTpos = document.getElementById('sdSourceTpos')?.checked ?? false;
    }

    // ---------- init ----------
    async function init() {
        wireUi();
        updateSortIcons();
        readFilters();
        await loadAll();
        applyFilterAndRender();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
