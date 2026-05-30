// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — period-based report.
//
// Data sources:
//   1. web2_so_order/main (Firestore) — derive purchases per supplier per shipment.
//   2. web2_supplier_wallet/main (Firestore) — ledger (payment + return transactions).
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
        suppliersList: [], // [{ id, code, name, createdAt }] from Firestore web2_suppliers
        tposData: [], // raw TPOS supplier rows (from Report/PartnerDebtReport)
        tposCongNo: new Map(), // partnerId → congNo rows (lazy fetched on expand)
        rows: [], // aggregated supplier rows after filter
        sortField: 'code',
        sortDir: 'asc',
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
            const [soSnap, walletSnap, supSnap] = await Promise.all([
                db.collection('web2_so_order').doc('main').get(),
                db.collection('web2_supplier_wallet').doc('main').get(),
                db.collection('web2_suppliers').doc('main').get(),
            ]);
            STATE.soOrderData = soSnap.exists ? soSnap.data()?.data || null : null;
            STATE.walletData = walletSnap.exists ? walletSnap.data()?.data || null : null;
            STATE.suppliersList = supSnap.exists
                ? Array.isArray(supSnap.data()?.data?.suppliers)
                    ? supSnap.data().data.suppliers
                    : []
                : [];
        } catch (e) {
            console.warn('[supplier-debt] load Web 2.0 fail:', e.message);
            notify('Lỗi tải dữ liệu Web 2.0: ' + e.message, 'error');
        }
    }

    async function saveSupplier(code, name) {
        const db = firebase.firestore();
        const ref = db.collection('web2_suppliers').doc('main');
        const snap = await ref.get();
        const data = snap.exists ? snap.data()?.data || { suppliers: [] } : { suppliers: [] };
        const list = Array.isArray(data.suppliers) ? data.suppliers : [];
        const codeUp = code.trim().toUpperCase();
        if (list.find((s) => String(s.code).toUpperCase() === codeUp)) {
            throw new Error(`Mã NCC "${codeUp}" đã tồn tại`);
        }
        list.push({
            id: 'sup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            code: codeUp,
            name: name.trim(),
            note: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        await ref.set({ data: { suppliers: list }, lastUpdated: Date.now() }, { merge: true });
        STATE.suppliersList = list;
    }

    // Save note for a supplier. If supplier doesn't exist in web2_suppliers yet,
    // auto-create an entry with empty code (legacy/DEMO row).
    async function saveSupplierNote(rowKey, code, note) {
        const db = firebase.firestore();
        const ref = db.collection('web2_suppliers').doc('main');
        const snap = await ref.get();
        const data = snap.exists ? snap.data()?.data || { suppliers: [] } : { suppliers: [] };
        const list = Array.isArray(data.suppliers) ? data.suppliers : [];
        let entry = code
            ? list.find((s) => String(s.code).toUpperCase() === String(code).toUpperCase())
            : null;
        if (!entry) {
            // Match by name (rowKey may be "Supplier Name" or "B5 CHIẾN NGỌC…")
            entry = list.find(
                (s) =>
                    rowKey === s.name ||
                    rowKey === `${s.code} ${s.name}` ||
                    rowKey.toLowerCase() === String(s.name).toLowerCase()
            );
        }
        if (!entry) {
            // Auto-create entry for legacy/DEMO row with empty code, name = rowKey
            entry = {
                id: 'sup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                code: '',
                name: rowKey,
                note: '',
                createdAt: Date.now(),
            };
            list.push(entry);
        }
        entry.note = String(note || '').trim();
        entry.updatedAt = Date.now();
        await ref.set({ data: { suppliers: list }, lastUpdated: Date.now() }, { merge: true });
        STATE.suppliersList = list;
    }

    function getNoteForRow(row) {
        const list = STATE.suppliersList || [];
        if (row.code) {
            const byCode = list.find(
                (s) => String(s.code).toUpperCase() === String(row.code).toUpperCase()
            );
            if (byCode?.note) return byCode.note;
        }
        const byName = list.find(
            (s) =>
                row.supplier === s.name ||
                row.supplier === `${s.code} ${s.name}` ||
                row.supplier.toLowerCase() === String(s.name).toLowerCase()
        );
        return byName?.note || '';
    }

    // Generate next sequential move name for a transaction type within a year.
    // Format: PAY/2026/NNNN (zero-padded 4 digits). Scans all wallets globally.
    function nextMoveName(state, type, year) {
        const prefix = type === 'payment' ? 'PAY' : type === 'return' ? 'RET' : 'TX';
        const re = new RegExp(`^${prefix}/${year}/(\\d+)$`);
        let max = 0;
        for (const supplier of Object.keys(state.wallets || {})) {
            for (const tx of state.wallets[supplier].transactions || []) {
                const m = String(tx.moveName || '').match(re);
                if (m) {
                    const n = parseInt(m[1], 10);
                    if (n > max) max = n;
                }
            }
        }
        return `${prefix}/${year}/${String(max + 1).padStart(4, '0')}`;
    }

    // Record a payment to a supplier: write transaction to web2_supplier_wallet.
    // The supplier may not have a wallet yet (legacy/DEMO row) — auto-create.
    // Dedup: prevent identical (supplier+amount+date+note) trong 3s gần nhất (chống spam).
    async function recordPayment(supplierKey, amount, date, note) {
        if (!supplierKey) throw new Error('Thiếu NCC');
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền không hợp lệ');
        const db = firebase.firestore();
        const ref = db.collection('web2_supplier_wallet').doc('main');
        const snap = await ref.get();
        const state = snap.exists ? snap.data()?.data || { wallets: {} } : { wallets: {} };
        const w = state.wallets[supplierKey] || {
            supplier: supplierKey,
            totalPurchased: 0,
            paidAmount: 0,
            returnedAmount: 0,
            balance: 0,
            returnedRowIds: {},
            transactions: [],
        };
        w.transactions = w.transactions || [];

        // Dedup: trong 3s gần nhất có giao dịch giống hệt (amount + date + note)?
        const ts = date ? new Date(date + 'T12:00:00+07:00').getTime() : Date.now();
        const noteStr = note || 'Thanh toán nhà cung cấp';
        const recent = w.transactions.find(
            (t) =>
                t.type === 'payment' &&
                Number(t.amount) === amount &&
                Number(t.ts) === ts &&
                String(t.note || '') === noteStr &&
                Date.now() - (Number(t._createdAt) || Number(t.ts) || 0) < 3000
        );
        if (recent) {
            throw new Error('Đã ghi giao dịch trùng — chờ vài giây trước khi thử lại');
        }

        const year = new Date(ts).getFullYear();
        const moveName = nextMoveName(state, 'payment', year);
        const entry = {
            id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            ts,
            type: 'payment',
            amount,
            note: noteStr,
            moveName,
            ref: { source: 'supplier-debt' },
            _createdAt: Date.now(),
        };
        w.transactions.push(entry);
        w.paidAmount = (Number(w.paidAmount) || 0) + amount;
        w.balance = (w.totalPurchased || 0) - (w.paidAmount || 0) - (w.returnedAmount || 0);
        state.wallets[supplierKey] = w;
        await ref.set({ data: state, lastUpdated: Date.now() }, { merge: true });
        // Update in-memory state so next render picks it up
        STATE.walletData = state;
        return moveName;
    }

    // Lookup code for a supplier name string.
    // Match rules (in order):
    //   1. supplierKey starts with "<code> " (legacy/TPOS data: "B5 CHIẾN NGỌC ...")
    //   2. supplierKey ends with " name" exactly (created via "Tạo NCC" + linked to existing row)
    //   3. supplierKey === name
    function resolveCodeForSupplier(supplierKey) {
        const list = STATE.suppliersList || [];
        if (!list.length) return null;
        const lower = String(supplierKey).toLowerCase();
        // Prefer code prefix match (legacy/TPOS format)
        for (const s of list) {
            const prefix = String(s.code).toLowerCase() + ' ';
            if (lower.startsWith(prefix)) return s;
        }
        // Exact name match
        for (const s of list) {
            if (lower === String(s.name).toLowerCase()) return s;
        }
        return null;
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
                            id: r.id || sh.id || '',
                            shipmentId: sh.id || '',
                            rowId: r.id || '',
                            invoiceGroupId: r.invoiceGroupId || '',
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
                        id: tx.id || '',
                        moveName: tx.moveName || '',
                        ts,
                        type: tx.type,
                        amount,
                        note: tx.note || '',
                    });
                } else if (!from && !to) {
                    // No period filter → all → put in period
                    row.credit += amount;
                    row.txInPeriod.push({
                        id: tx.id || '',
                        moveName: tx.moveName || '',
                        ts,
                        type: tx.type,
                        amount,
                        note: tx.note || '',
                    });
                }
            }
        }

        // Finalize: compute opening + ending for Web 2.0 rows + attach code from web2_suppliers
        for (const supplier of Object.keys(result)) {
            const row = result[supplier];
            row.opening = row._purchasesBefore - row._txBefore;
            row.ending = row.opening + row.debit - row.credit;
            if (!row.code) {
                const matched = resolveCodeForSupplier(supplier);
                if (matched) row.code = matched.code;
            }
        }

        // Add empty rows for suppliers in list that have no purchases yet
        // (so they show up after "Tạo NCC" before any orders are placed).
        for (const s of STATE.suppliersList || []) {
            const fullName = `${s.code} ${s.name}`;
            const existsExact = result[fullName];
            const existsByCode = Object.values(result).find((r) => r.code === s.code);
            if (existsExact || existsByCode) continue;
            result[fullName] = {
                supplier: fullName,
                opening: 0,
                debit: 0,
                credit: 0,
                ending: 0,
                _purchasesBefore: 0,
                _txBefore: 0,
                purchasesInPeriod: [],
                txInPeriod: [],
                source: 'web2',
                code: s.code,
                partnerId: null,
            };
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
            if (f === 'code') {
                // Rows with code first, then without (regardless of dir, no-code stays last).
                const aHas = !!a.code;
                const bHas = !!b.code;
                if (aHas && !bHas) return -1;
                if (!aHas && bHas) return 1;
                if (aHas && bHas) {
                    const cmp = String(a.code).localeCompare(String(b.code), 'vi', {
                        numeric: true,
                        sensitivity: 'base',
                    });
                    if (cmp !== 0) return cmp * dir;
                }
                return a.supplier.localeCompare(b.supplier, 'vi', { numeric: true }) * dir;
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
                // Display format: [code] code name (if code), else just name.
                // For created suppliers, r.supplier === `${code} ${name}` already.
                // For matched legacy/TPOS rows, r.supplier already includes code prefix.
                const codeBadge = r.code
                    ? `<span class="sd-code-pill">${escapeHtml(r.code)}</span>`
                    : '<span class="sd-code-pill is-empty">—</span>';
                const displayName = r.code
                    ? r.supplier.startsWith(r.code + ' ')
                        ? r.supplier
                        : `${r.code} ${r.supplier}`
                    : r.supplier;
                const note = getNoteForRow(r);
                const noteHtml = note ? `<div class="sd-row-note">${escapeHtml(note)}</div>` : '';
                const actionBtns = `<span class="sd-row-actions">
                    <button class="sd-action-btn sd-action-pay" type="button" data-action-pay="${escapeHtml(r.supplier)}" title="Thanh toán">💳</button>
                    <button class="sd-action-btn sd-action-note ${note ? 'has-note' : ''}" type="button" data-action-note="${escapeHtml(r.supplier)}" title="Sửa ghi chú">✏️</button>
                </span>`;
                return `<tr class="sd-main-row ${cls} ${isExpanded ? 'is-expanded' : ''}" data-supplier="${escapeHtml(r.supplier)}">
                    <td class="num-stt">${stt}</td>
                    <td class="col-expand"><button class="sd-expand-btn" type="button" data-toggle-supplier="${escapeHtml(r.supplier)}">${arrow}</button></td>
                    <td class="col-code">${codeBadge}${actionBtns}</td>
                    <td class="col-name">
                        <div class="sd-name-line">${sourceBadge}${escapeHtml(displayName)}</div>
                        ${noteHtml}
                    </td>
                    <td class="num">${fmtVnd(r.opening)}</td>
                    <td class="num">${fmtVnd(r.debit)}</td>
                    <td class="num">${fmtVnd(r.credit)}</td>
                    <td class="num col-ending">${fmtVnd(r.ending)}</td>
                </tr>
                <tr class="sd-detail-row" data-detail-for="${escapeHtml(r.supplier)}" ${isExpanded ? '' : 'hidden'}>
                    <td colspan="8" class="sd-detail-cell">${detailContent}</td>
                </tr>`;
            })
            .join('');
        body.innerHTML = html;

        // Wire row click → toggle expand
        body.querySelectorAll('tr.sd-main-row').forEach((tr) => {
            tr.addEventListener('click', (e) => {
                // Don't intercept clicks on tab buttons / actions
                if (e.target.closest('.sd-tab, .sd-expand-btn, .sd-action-btn')) return;
                toggleExpand(tr.dataset.supplier);
            });
        });
        body.querySelectorAll('[data-toggle-supplier]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleExpand(btn.dataset.toggleSupplier);
            });
        });
        body.querySelectorAll('[data-action-note]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openNoteModal(btn.dataset.actionNote);
            });
        });
        body.querySelectorAll('[data-action-pay]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openPayModal(btn.dataset.actionPay);
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

    // ---------- Note modal ----------
    function openNoteModal(supplierKey) {
        const row = STATE.rows.find((r) => r.supplier === supplierKey);
        if (!row) return;
        const note = getNoteForRow(row);
        document.getElementById('sdEditNoteSupplier').textContent = row.code
            ? `[${row.code}] ${row.supplier.startsWith(row.code + ' ') ? row.supplier : row.code + ' ' + row.supplier}`
            : row.supplier;
        document.getElementById('sdNoteTextarea').value = note;
        document.getElementById('sdEditNoteModal').hidden = false;
        document.getElementById('sdEditNoteModal').dataset.supplier = supplierKey;
        document.getElementById('sdEditNoteModal').dataset.code = row.code || '';
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => document.getElementById('sdNoteTextarea')?.focus(), 30);
    }

    async function confirmNote() {
        const modal = document.getElementById('sdEditNoteModal');
        const supplier = modal.dataset.supplier;
        const code = modal.dataset.code || '';
        const note = document.getElementById('sdNoteTextarea').value || '';
        try {
            await saveSupplierNote(supplier, code, note);
            notify('Đã lưu ghi chú', 'success');
            modal.hidden = true;
            applyFilterAndRender();
        } catch (e) {
            notify(e.message || 'Lỗi lưu ghi chú', 'error');
        }
    }

    // ---------- Payment modal ----------
    function openPayModal(supplierKey) {
        const row = STATE.rows.find((r) => r.supplier === supplierKey);
        if (!row) return;
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('sdPaySupplier').textContent = row.code
            ? `[${row.code}] ${row.supplier.startsWith(row.code + ' ') ? row.supplier : row.code + ' ' + row.supplier}`
            : row.supplier;
        document.getElementById('sdPaySummary').innerHTML = `
            <div class="sd-pay-row"><span>Tổng mua:</span><strong>${fmtVnd(row.debit + row._purchasesBefore)}</strong></div>
            <div class="sd-pay-row"><span>Đã thanh toán:</span><strong>${fmtVnd(row.credit + row._txBefore)}</strong></div>
            <div class="sd-pay-row sd-pay-row-strong"><span>Còn nợ:</span><strong>${fmtVnd(row.ending)}</strong></div>
        `;
        document.getElementById('sdPayDate').value = today;
        document.getElementById('sdPayAmount').value = '';
        document.getElementById('sdPayNote').value = '';
        document.getElementById('sdPayModal').hidden = false;
        document.getElementById('sdPayModal').dataset.supplier = supplierKey;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => document.getElementById('sdPayAmount')?.focus(), 30);
    }

    async function confirmPay() {
        const modal = document.getElementById('sdPayModal');
        const btn = document.getElementById('sdPayConfirmBtn');
        if (btn?.disabled) return; // guard: already saving
        const supplier = modal.dataset.supplier;
        const date = document.getElementById('sdPayDate').value;
        const amount = Number(document.getElementById('sdPayAmount').value) || 0;
        const note = document.getElementById('sdPayNote').value || '';
        if (amount <= 0) {
            notify('Số tiền phải > 0', 'warning');
            return;
        }
        const origLabel = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2"></i> Đang lưu…';
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
        try {
            const moveName = await recordPayment(supplier, amount, date, note);
            notify(`Đã ghi ${moveName}: ${fmtVnd(amount)} cho ${supplier}`, 'success');
            modal.hidden = true;
            STATE.tposCongNo.clear();
            applyFilterAndRender();
        } catch (e) {
            notify(e.message || 'Lỗi ghi thanh toán', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                if (origLabel) btn.innerHTML = origLabel;
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
        }
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
        // Group purchases theo (date + invoiceGroupId). Rows tạo cùng 1 modal
        // submit chia chung invoiceGroupId = 1 đơn → gộp vào 1 entry chung PO.
        // Fallback rowId/id khi không có invoiceGroupId (rows pre-2026-05-30).
        const groups = new Map();
        for (const p of row.purchasesInPeriod || []) {
            const gid = p.invoiceGroupId || p.rowId || p.id || '';
            const groupKey = String(p.date || '') + '|' + String(gid);
            let entry = groups.get(groupKey);
            if (!entry) {
                const year = String(p.date || '').slice(0, 4) || new Date().getFullYear();
                const idSuffix =
                    String(gid)
                        .replace(/[^A-Za-z0-9]/g, '')
                        .slice(-6)
                        .toUpperCase() || '----';
                entry = {
                    // sortKey không gồm idSuffix → same-date entries giữ stable
                    // insertion order (= thứ tự rows trong so-order state, ~
                    // chronological theo lúc tạo đơn).
                    sortKey: String(p.date || '') + ' 00:00:00',
                    date: p.date || '',
                    moveName: `PO/${year}/${idSuffix}`,
                    debit: 0,
                    credit: 0,
                    _items: [],
                };
                groups.set(groupKey, entry);
            }
            entry.debit += p.subtotal || 0;
            entry._items.push(`${p.productName || '—'}${p.variant ? ` (${p.variant})` : ''}`);
        }
        for (const entry of groups.values()) {
            entry.desc = `Mua: ${entry._items.join(' + ')}`;
            delete entry._items;
            entries.push(entry);
        }
        for (const t of row.txInPeriod || []) {
            const d = t.ts ? new Date(Number(t.ts)) : null;
            const dateIso = d ? d.toISOString().slice(0, 10) : '';
            const timeStr = d
                ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '';
            const lbl = t.type === 'return' ? 'Trả hàng' : 'Thanh toán';
            // Prefer tx.moveName (assigned at save time); fallback to stable derived suffix.
            let moveName = t.moveName;
            if (!moveName) {
                const year = dateIso.slice(0, 4) || String(new Date().getFullYear());
                const prefix = t.type === 'return' ? 'RET' : 'PAY';
                // Stable suffix from id or ts (alnum only, last 6 chars).
                const stable = String(t.id || t.ts || '').replace(/[^A-Za-z0-9]/g, '');
                const idSuf = (stable.slice(-6) || stable.slice(0, 6) || 'XXXXXX').toUpperCase();
                moveName = `${prefix}/${year}/${idSuf}`;
            }
            entries.push({
                sortKey: dateIso + ' ' + timeStr + ' ' + moveName,
                date: dateIso,
                desc: lbl + (t.note ? ` — ${t.note}` : ''),
                moveName,
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
        const headers = [
            '#',
            'Mã NCC',
            'Nhà cung cấp',
            'Nợ đầu kỳ',
            'Phát sinh',
            'Thanh toán',
            'Nợ cuối kỳ',
        ];
        const lines = [headers.join(',')];
        STATE.rows.forEach((r, i) => {
            const cells = [
                i + 1,
                csvEscape(r.code || ''),
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
        document.getElementById('sdResetBtn').addEventListener('click', async () => {
            const { from, to } = currentMonthRange();
            document.getElementById('sdDateFrom').value = from;
            document.getElementById('sdDateTo').value = to;
            document.getElementById('sdSearch').value = '';
            document
                .querySelectorAll('input[name="sdDisplay"]')
                .forEach((r) => (r.checked = r.value === 'all'));
            readFilters();
            STATE.page = 1;
            STATE.tposCongNo.clear(); // period changed → invalidate cache
            await loadAll();
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

        // Create NCC modal
        document.getElementById('sdCreateNccBtn')?.addEventListener('click', () => {
            const m = document.getElementById('sdCreateNccModal');
            document.getElementById('sdNccCode').value = '';
            document.getElementById('sdNccName').value = '';
            m.hidden = false;
            if (window.lucide?.createIcons) window.lucide.createIcons();
            setTimeout(() => document.getElementById('sdNccCode')?.focus(), 30);
        });
        document.querySelectorAll('[data-sd-modal-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.sd-modal')?.setAttribute('hidden', '');
            });
        });
        document.getElementById('sdNoteConfirmBtn')?.addEventListener('click', confirmNote);
        document.getElementById('sdPayConfirmBtn')?.addEventListener('click', confirmPay);
        document.getElementById('sdNccConfirmBtn')?.addEventListener('click', async () => {
            const code = (document.getElementById('sdNccCode')?.value || '').trim();
            const name = (document.getElementById('sdNccName')?.value || '').trim();
            if (!code || !name) {
                notify('Vui lòng nhập đủ Mã + Tên', 'warning');
                return;
            }
            if (!/^[A-Za-z0-9]+$/.test(code)) {
                notify('Mã chỉ được chứa chữ + số (vd B5, A12, MM2)', 'warning');
                return;
            }
            try {
                await saveSupplier(code, name);
                notify(`Đã tạo NCC [${code.toUpperCase()}] ${name}`, 'success');
                document.getElementById('sdCreateNccModal').hidden = true;
                applyFilterAndRender();
            } catch (e) {
                notify(e.message || 'Lỗi tạo NCC', 'error');
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

    // Default period = current month (1 → last day of month, local TZ).
    function currentMonthRange() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const pad = (n) => String(n).padStart(2, '0');
        const lastDay = new Date(y, m + 1, 0).getDate();
        return {
            from: `${y}-${pad(m + 1)}-01`,
            to: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
        };
    }

    function setDefaultDateRange() {
        const fromEl = document.getElementById('sdDateFrom');
        const toEl = document.getElementById('sdDateTo');
        if (!fromEl || !toEl) return;
        if (!fromEl.value && !toEl.value) {
            const { from, to } = currentMonthRange();
            fromEl.value = from;
            toEl.value = to;
        }
    }

    // ---------- init ----------
    async function init() {
        wireUi();
        updateSortIcons();
        setDefaultDateRange();
        readFilters();
        await loadAll();
        applyFilterAndRender();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        _sseConnect();
    }

    // SSE: realtime refresh báo cáo công nợ NCC khi data nguồn thay đổi.
    // Sources ảnh hưởng:
    //   - SePay deposit (wallet:all) — NCC refund/transfer
    //   - web2-products — so-order data feeds via products pending
    //   - web2:fast-sale-orders — PBH ảnh hưởng nếu refund NCC
    // Debounce 1500ms — báo cáo nặng, không cần refresh quá nhanh.
    let _sseUnsubs = [];
    let _sseReloadTimer = null;
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) {
            console.warn('[SupplierDebt-SSE] Web2SSE not loaded — skip realtime');
            return;
        }
        if (_sseUnsubs.length) return;
        const scheduleReload = (topic) => () => {
            if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
            _sseReloadTimer = setTimeout(async () => {
                _sseReloadTimer = null;
                console.log('[SupplierDebt-SSE] reload triggered by:', topic);
                await loadAll();
                applyFilterAndRender();
            }, 1500);
        };
        _sseUnsubs.push(window.Web2SSE.subscribe('wallet:all', scheduleReload('wallet:all')));
        _sseUnsubs.push(window.Web2SSE.subscribe('web2:products', scheduleReload('web2:products')));
        _sseUnsubs.push(
            window.Web2SSE.subscribe(
                'web2:fast-sale-orders',
                scheduleReload('web2:fast-sale-orders')
            )
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
