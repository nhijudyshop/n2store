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

    const STATE = {
        soOrderData: null,
        walletData: null,
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
        },
        activeSupplier: null,
        detailTab: 'congno',
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
            console.warn('[supplier-debt] load fail:', e.message);
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
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

        // Finalize: compute opening + ending
        for (const supplier of Object.keys(result)) {
            const row = result[supplier];
            row.opening = row._purchasesBefore - row._txBefore;
            row.ending = row.opening + row.debit - row.credit;
        }
        return result;
    }

    function makeRow(supplier) {
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
        body.innerHTML = slice
            .map((r, i) => {
                const stt = start + i + 1;
                const cls = r.ending > 0.5 ? 'is-debt' : r.ending < -0.5 ? 'is-credit' : '';
                return `<tr class="${cls}" data-supplier="${escapeHtml(r.supplier)}">
                    <td class="num-stt">${stt}</td>
                    <td class="col-name">${escapeHtml(r.supplier)}</td>
                    <td class="num">${fmtVnd(r.opening)}</td>
                    <td class="num">${fmtVnd(r.debit)}</td>
                    <td class="num">${fmtVnd(r.credit)}</td>
                    <td class="num col-ending">${fmtVnd(r.ending)}</td>
                </tr>`;
            })
            .join('');
        body.querySelectorAll('tr[data-supplier]').forEach((tr) => {
            tr.addEventListener('click', () => openDetail(tr.dataset.supplier));
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
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

    // ---------- detail modal ----------
    function openDetail(supplier) {
        STATE.activeSupplier = supplier;
        STATE.detailTab = 'congno';
        const row = STATE.rows.find((r) => r.supplier === supplier);
        if (!row) return;
        document.getElementById('sdDetailTitle').textContent = supplier;
        const sub = [];
        if (STATE.filters.from) sub.push('Từ ' + fmtDateVN(STATE.filters.from));
        if (STATE.filters.to) sub.push('Đến ' + fmtDateVN(STATE.filters.to));
        document.getElementById('sdDetailSub').textContent = sub.join(' · ') || 'Toàn bộ thời gian';
        document.getElementById('sdDetailOpening').textContent = fmtVnd(row.opening);
        document.getElementById('sdDetailDebit').textContent = fmtVnd(row.debit);
        document.getElementById('sdDetailCredit').textContent = fmtVnd(row.credit);
        document.getElementById('sdDetailEnding').textContent = fmtVnd(row.ending);
        renderDetailTabs();
        document.getElementById('sdDetailModal').hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderDetailTabs() {
        document.querySelectorAll('#sdDetailModal .sd-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.detailTab === STATE.detailTab);
        });
        document.querySelectorAll('#sdDetailModal .sd-detail-panel').forEach((p) => {
            p.hidden = p.dataset.panel !== STATE.detailTab;
        });
        const row = STATE.rows.find((r) => r.supplier === STATE.activeSupplier);
        if (!row) return;
        if (STATE.detailTab === 'congno') {
            renderDetailCongNo(row);
        } else if (STATE.detailTab === 'purchases') {
            renderDetailPurchases(row);
        } else {
            renderDetailTx(row);
        }
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

    function renderDetailCongNo(row) {
        const tbody = document.getElementById('sdDetailCongnoBody');
        const entries = buildCongNoEntries(row);
        if (!entries.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px;">Không có bút toán trong kỳ.</td></tr>`;
            return;
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
        tbody.innerHTML = rowsHtml;
    }

    function renderDetailPurchases(row) {
        const tbody = document.getElementById('sdDetailPurchasesBody');
        if (!row.purchasesInPeriod.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px;">Không có phiếu mua trong kỳ.</td></tr>`;
            return;
        }
        const sorted = [...row.purchasesInPeriod].sort((a, b) =>
            String(b.date).localeCompare(String(a.date))
        );
        tbody.innerHTML = sorted
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
    }

    function renderDetailTx(row) {
        const tbody = document.getElementById('sdDetailTxBody');
        if (!row.txInPeriod.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px;">Không có giao dịch trong kỳ.</td></tr>`;
            return;
        }
        const sorted = [...row.txInPeriod].sort((a, b) => b.ts - a.ts);
        tbody.innerHTML = sorted
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
        document.getElementById('sdSearchBtn').addEventListener('click', () => {
            readFilters();
            STATE.page = 1;
            applyFilterAndRender();
        });
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
        document.querySelectorAll('#sdDetailModal .sd-tab').forEach((b) => {
            b.addEventListener('click', () => {
                STATE.detailTab = b.dataset.detailTab;
                renderDetailTabs();
            });
        });
        document.querySelectorAll('[data-sd-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.sd-modal')?.setAttribute('hidden', '');
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document
                    .querySelectorAll('.sd-modal:not([hidden])')
                    .forEach((m) => (m.hidden = true));
            }
        });
    }

    function readFilters() {
        STATE.filters.from = document.getElementById('sdDateFrom').value || '';
        STATE.filters.to = document.getElementById('sdDateTo').value || '';
        STATE.filters.search = document.getElementById('sdSearch').value || '';
        const chosen = document.querySelector('input[name="sdDisplay"]:checked');
        STATE.filters.display = chosen ? chosen.value : 'all';
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
