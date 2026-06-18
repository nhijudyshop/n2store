// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — server API (ledger /api/web2-supplier-wallet) + load +
// mutations data-layer (saveSupplier/saveSupplierNote/recordPayment) + aggregate.
// MOVE-only split (2026-06-18) khỏi supplier-debt-app.js — body giữ nguyên byte.
//
// Data sources (ĐỢT E 2026-06-12 — server ledger, audit vòng 3):
//   1. web2_so_order/main (Firestore) — derive purchases per supplier per shipment.
//   2. GET /api/web2-supplier-wallet/state — wallets (ledger payment|return) + suppliers meta.

(function () {
    'use strict';

    const SD = (window.__SupplierDebt = window.__SupplierDebt || {});
    const STATE = SD.STATE;
    const { vnDate, notify, rateToVnd, isInPeriod, isBefore } = SD;

    // ---------- server API (ĐỢT E — ledger /api/web2-supplier-wallet) ----------
    const WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API_BASE = `${WORKER_URL}/api/web2-supplier-wallet`;
    const API_FALLBACK = 'https://web2-api-kv04.onrender.com/api/web2-supplier-wallet';

    function authHeaders() {
        const h = { 'Content-Type': 'application/json' };
        const token = window.Web2Auth?.getStored?.()?.token;
        if (token) h['x-web2-token'] = token;
        return h;
    }

    // Dual-base (worker → Render direct). Mutation idempotent theo txId nên
    // retry fallback an toàn (server ON CONFLICT trả alreadyProcessed).
    async function api(path, options) {
        const opts = options || {};
        try {
            const r = await fetch(API_BASE + path, opts);
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            return d;
        } catch (e) {
            const r = await fetch(API_FALLBACK + path, opts);
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            return d;
        }
    }

    // ---------- load ----------
    async function loadAll() {
        const tasks = [];
        if (STATE.filters.sourceWeb2) tasks.push(loadWeb2());
        await Promise.all(tasks);
    }

    async function loadWeb2() {
        // C8 (2026-06-13): so-order đọc Postgres (Web2SoOrder), KHÔNG còn Firestore
        // (đã migrate; Firestore frozen → công nợ sẽ stale). Ví NCC + suppliers = server ledger.
        await Promise.all([loadSoOrder(), loadServerState()]);
    }

    async function loadSoOrder() {
        try {
            if (!window.Web2SoOrder || !window.Web2SoOrder.load) {
                console.warn('[supplier-debt] Web2SoOrder reader chưa load');
                STATE.soOrderData = null;
                return;
            }
            STATE.soOrderData = await window.Web2SoOrder.load();
        } catch (e) {
            console.warn('[supplier-debt] load so-order fail:', e.message);
            notify('Lỗi tải dữ liệu Sổ Order: ' + e.message, 'error');
        }
    }

    async function loadServerState() {
        try {
            const d = await api('/state');
            // data.wallets shape tương thích doc Firestore cũ ({[supplier]: {…transactions[]}}).
            STATE.walletData = { wallets: d?.data?.wallets || {} };
            // suppliers server: [{name, code, note, createdAt}].
            STATE.suppliersList = Array.isArray(d?.data?.suppliers) ? d.data.suppliers : [];
        } catch (e) {
            // Fail → toast + giữ data đã load trước đó (nếu có), KHÔNG fallback Firestore.
            console.warn('[supplier-debt] load server ledger fail:', e.message);
            notify('Lỗi tải ví NCC từ server: ' + e.message, 'error');
            if (!STATE.walletData) STATE.walletData = { wallets: {} };
            if (!Array.isArray(STATE.suppliersList)) STATE.suppliersList = [];
        }
    }

    // Tạo NCC qua server (upsert atomic ON CONFLICT — hết RMW lost-update Firestore).
    async function saveSupplier(code, name) {
        const codeUp = code.trim().toUpperCase();
        const list = STATE.suppliersList || [];
        // Check trùng mã trên list đã load (server upsert theo TÊN, không khoá mã).
        if (list.find((s) => String(s.code).toUpperCase() === codeUp)) {
            throw new Error(`Mã NCC "${codeUp}" đã tồn tại`);
        }
        const d = await api('/suppliers', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name: name.trim(), code: codeUp }),
        });
        const sup = d?.supplier || { name: name.trim(), code: codeUp, note: '' };
        // Update list local để render ngay (full reload qua SSE sau).
        const idx = list.findIndex((s) => s.name === sup.name);
        if (idx >= 0) list[idx] = { ...list[idx], ...sup };
        else list.push({ ...sup, createdAt: Date.now() });
        STATE.suppliersList = list;
    }

    // Lưu ghi chú NCC qua server (upsert theo TÊN — atomic, hết dup/lost-update).
    // Logic match giữ như cũ: tìm entry theo code → theo name patterns; không có
    // entry → server tự tạo meta mới với name = rowKey, code rỗng.
    async function saveSupplierNote(rowKey, code, note) {
        const list = STATE.suppliersList || [];
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
        const targetName = entry ? entry.name : rowKey;
        const noteStr = String(note || '').trim();
        const d = await api('/suppliers', {
            method: 'POST',
            // code rỗng KHÔNG đè code cũ (server NULLIF) — gửi an toàn.
            headers: authHeaders(),
            body: JSON.stringify({
                name: targetName,
                code: entry?.code || code || '',
                note: noteStr,
            }),
        });
        const sup = d?.supplier || {
            name: targetName,
            code: entry?.code || code || '',
            note: noteStr,
        };
        if (entry) Object.assign(entry, sup);
        else list.push({ ...sup, createdAt: Date.now() });
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

    // Ghi thanh toán NCC qua server ledger (POST /tx) — MONEY OP: await server
    // TRƯỚC, thành công mới apply local. Server TỰ SINH moveName PAY/<năm>/<seq>
    // từ sequence (hết race MAX+1 client). Idempotent theo txId — retry dual-base
    // / double-submit → alreadyProcessed, không ghi đôi.
    async function recordPayment(supplierKey, amount, date, note, txIdArg) {
        if (!supplierKey) throw new Error('Thiếu NCC');
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền không hợp lệ');
        const ts = date ? new Date(date + 'T12:00:00+07:00').getTime() : Date.now();
        const noteStr = note || 'Thanh toán nhà cung cấp';
        // HIGH-3 FIX (2026-06-18): txId idempotent từ caller (sinh khi mở modal) →
        // double-submit/retry dùng cùng txId → server ON CONFLICT(tx_id) chặn ghi đôi.
        const txId = txIdArg || 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        const d = await api('/tx', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                supplier: supplierKey,
                type: 'payment',
                amount,
                ts,
                note: noteStr,
                ref: { source: 'supplier-debt' },
                performedBy: window.Web2UserInfo?.get?.()?.userName || null,
                txId,
                // KHÔNG gửi moveName — server sinh từ sequence.
            }),
        });
        const tx = d?.tx || { id: txId, ts, type: 'payment', amount, note: noteStr, moveName: '' };
        // Apply local để caller re-render ngay (SSE web2:supplier-wallet refresh đầy đủ sau).
        if (!STATE.walletData) STATE.walletData = { wallets: {} };
        if (!STATE.walletData.wallets) STATE.walletData.wallets = {};
        const w = STATE.walletData.wallets[supplierKey] || {
            supplier: supplierKey,
            totalPurchased: 0,
            paidAmount: 0,
            returnedAmount: 0,
            balance: 0,
            returnedRowIds: {},
            transactions: [],
        };
        w.transactions = Array.isArray(w.transactions) ? w.transactions : [];
        // Guard: chỉ apply nếu tx chưa có local (alreadyProcessed/retry).
        if (!w.transactions.some((t) => t.id === tx.id)) {
            w.transactions.push(tx);
            w.paidAmount = (Number(w.paidAmount) || 0) + (Number(tx.amount) || amount);
        }
        STATE.walletData.wallets[supplierKey] = w;
        return tx.moveName || '';
    }

    // Lookup code for a supplier name string.
    // Match rules (in order):
    //   1. supplierKey starts with "<code> " (legacy data: "B5 CHIẾN NGỌC ...")
    //   2. supplierKey ends with " name" exactly (created via "Tạo NCC" + linked to existing row)
    //   3. supplierKey === name
    function resolveCodeForSupplier(supplierKey) {
        const list = STATE.suppliersList || [];
        if (!list.length) return null;
        const lower = String(supplierKey).toLowerCase();
        // Prefer code prefix match (legacy format)
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
                const groupSupplier = {}; // invoiceGroupId → NCC (đơn có hàng đã nhận)
                for (const r of sh.rows || []) {
                    const supplier = (r.supplier || '').trim();
                    if (!supplier) continue;
                    // 2026-06-16: công nợ NCC phát sinh khi NHẬN HÀNG — chỉ tính dòng
                    // 'received' / 'partial_received'. 'ordered' (Đã Đặt) đã KHAI TỬ;
                    // 'draft'/'cancelled' không tính.
                    const st = r.status || 'draft';
                    if (st !== 'received' && st !== 'partial_received') continue;
                    groupSupplier[r.invoiceGroupId || r.id] = supplier; // đơn đã nhận
                    // qty bill: received → qty đặt đủ; partial → đúng phần đã nhận.
                    const orderedQty = Number(r.qty) || 0;
                    const qty =
                        st === 'partial_received'
                            ? Math.min(Number(r.qtyReceived) || 0, orderedQty)
                            : orderedQty;
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
                // 2026-06-16: giảm giá / phí ship PER-ĐƠN ("tất cả nguồn tiền") —
                // net = −giảm giá + phí ship, áp 1 lần / đơn đã nhận, bucket theo
                // ngày lô. 1 đơn = 1 NCC nên gán thẳng NCC của đơn.
                const adjMap = sh.orderAdjustments || {};
                for (const [gid, sup] of Object.entries(groupSupplier)) {
                    const a = adjMap[gid];
                    if (!a) continue;
                    const net = (-(Number(a.discount) || 0) + (Number(a.shipping) || 0)) * rate;
                    if (!net) continue;
                    if (!result[sup]) result[sup] = makeRow(sup);
                    if (isBefore(sh.date, from)) result[sup]._purchasesBefore += net;
                    else if (isInPeriod(sh.date, from, to)) result[sup].debit += net;
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
                const txDate = ts ? vnDate(ts) : '';
                if (from && txDate && txDate < from) {
                    row._txBefore += amount;
                } else if (isInPeriod(txDate, from, to)) {
                    row.credit += amount;
                    if (tx.type === 'payment') row.creditPayment += amount;
                    else row.creditReturn += amount;
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
                    if (tx.type === 'payment') row.creditPayment += amount;
                    else row.creditReturn += amount;
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

        // Finalize: compute opening + ending for Web 2.0 rows + attach code từ suppliers meta (server)
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
            // Meta auto-tạo từ /tx (code rỗng, name = wallet key) → fullName = name,
            // tránh ghost row " <name>" (leading space) sau khi đổi sang server ledger.
            const fullName = s.code ? `${s.code} ${s.name}` : s.name;
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

        return result;
    }

    function makeRow(supplier, opts) {
        return {
            supplier,
            opening: 0,
            debit: 0,
            credit: 0,
            // MED-7 FIX (2026-06-18): tách credit = thanh toán + trả hàng (cột gộp
            // gây nhầm khi đối chiếu sổ NCC). ending vẫn = opening+debit-credit (đúng).
            creditPayment: 0,
            creditReturn: 0,
            ending: 0,
            _purchasesBefore: 0,
            _txBefore: 0,
            purchasesInPeriod: [],
            txInPeriod: [],
            source: opts?.source || 'web2',
            code: opts?.code || '',
            partnerId: opts?.partnerId || null,
        };
    }

    // expose to namespace
    SD.authHeaders = authHeaders;
    SD.api = api;
    SD.loadAll = loadAll;
    SD.loadWeb2 = loadWeb2;
    SD.loadSoOrder = loadSoOrder;
    SD.loadServerState = loadServerState;
    SD.saveSupplier = saveSupplier;
    SD.saveSupplierNote = saveSupplierNote;
    SD.getNoteForRow = getNoteForRow;
    SD.recordPayment = recordPayment;
    SD.resolveCodeForSupplier = resolveCodeForSupplier;
    SD.aggregate = aggregate;
    SD.makeRow = makeRow;
})();
