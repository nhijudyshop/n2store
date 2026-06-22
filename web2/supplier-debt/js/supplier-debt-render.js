// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Báo cáo công nợ NCC — render (filter + bảng list + tổng + phân trang + sort
// icon + inline detail panel: công nợ / phiếu mua / giao dịch) + export CSV.
// MOVE-only split (2026-06-18) khỏi supplier-debt-app.js — body giữ nguyên byte.
// Cross-module: state utils + aggregate/getNoteForRow (api) + open*Modal (actions)
// gọi qua namespace SD tại runtime (sau khi mọi <script> load).

(function () {
    'use strict';

    const SD = (window.__SupplierDebt = window.__SupplierDebt || {});
    const STATE = SD.STATE;
    const { vnDate, fmtVnd, escapeHtml, fmtDateVN, fmtTime, notify, cssAttrEscape, csvEscape } = SD;

    // ---------- filter + render ----------
    function applyFilterAndRender() {
        const agg = SD.aggregate();
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
                const sourceBadge = `<span class="sd-source-badge is-web2" title="Dữ liệu từ Web 2.0 (so-order + ví NCC)">WEB 2.0</span>`;
                // Display format: [code] code name (if code), else just name.
                // For created suppliers, r.supplier === `${code} ${name}` already.
                // For matched legacy rows, r.supplier already includes code prefix.
                const codeBadge = r.code
                    ? `<span class="sd-code-pill">${escapeHtml(r.code)}</span>`
                    : '<span class="sd-code-pill is-empty">—</span>';
                const displayName = r.code
                    ? r.supplier.startsWith(r.code + ' ')
                        ? r.supplier
                        : `${r.code} ${r.supplier}`
                    : r.supplier;
                const note = SD.getNoteForRow(r);
                const noteHtml = note ? `<div class="sd-row-note">${escapeHtml(note)}</div>` : '';
                const _dlVi =
                    window.Web2Deeplink?.linkBtn({
                        label: 'Ví',
                        icon: 'wallet',
                        url: window.Web2Deeplink.url.supplierWallet(r.supplier),
                        title: 'Ví NCC: ' + r.supplier,
                    }) ?? '';
                const _dlSo =
                    window.Web2Deeplink?.linkBtn({
                        label: 'Sổ Order',
                        icon: 'notebook',
                        url: window.Web2Deeplink.url.soOrder({ supplier: r.supplier }),
                        title: 'Sổ Order NCC: ' + r.supplier,
                    }) ?? '';
                const actionBtns = `<span class="sd-row-actions">
                    <button class="sd-action-btn sd-action-pay" type="button" data-action-pay="${escapeHtml(r.supplier)}" title="Thanh toán" aria-label="Thanh toán">💳</button>
                    <button class="sd-action-btn sd-action-note ${note ? 'has-note' : ''}" type="button" data-action-note="${escapeHtml(r.supplier)}" title="Sửa ghi chú" aria-label="Sửa ghi chú">✏️</button>
                    ${_dlVi}${_dlSo}
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
                    <td class="num" title="Thanh toán: ${fmtVnd(r.creditPayment || 0)} • Trả hàng: ${fmtVnd(r.creditReturn || 0)}">${fmtVnd(r.credit)}</td>
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
                if (e.target.closest('.sd-tab, .sd-expand-btn, .sd-action-btn, .w2-xlink')) return;
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
                SD.openNoteModal(btn.dataset.actionNote);
            });
        });
        body.querySelectorAll('[data-action-pay]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                SD.openPayModal(btn.dataset.actionPay);
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
                <div class="sd-stat sd-stat-credit" title="Thanh toán: ${fmtVnd(row.creditPayment || 0)} • Trả hàng: ${fmtVnd(row.creditReturn || 0)}">
                    <span class="sd-stat-label">Đã giảm nợ</span>
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
            const dateIso = d ? vnDate(d) : '';
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

    function congnoTableHtml(row) {
        const entries = buildCongNoEntries(row);
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
        return `<table class="data-table sd-detail-table sd-congno-table">
            <thead><tr>
                <th>Ngày</th><th>Diễn giải</th><th>Bút toán</th>
                <th class="num">Nợ đầu kỳ</th>
                <th class="num">Phát sinh</th>
                <th class="num">Đã giảm nợ</th>
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
        return `<table class="data-table sd-detail-table">
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
        return `<table class="data-table sd-detail-table">
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

    // expose to namespace
    SD.applyFilterAndRender = applyFilterAndRender;
    SD.renderTable = renderTable;
    SD.wireDetailTabs = wireDetailTabs;
    SD.toggleExpand = toggleExpand;
    SD.updateDetailPanel = updateDetailPanel;
    SD.renderTotals = renderTotals;
    SD.renderPagination = renderPagination;
    SD.updateSortIcons = updateSortIcons;
    SD.detailPanelHtml = detailPanelHtml;
    SD.buildCongNoEntries = buildCongNoEntries;
    SD.congnoTableHtml = congnoTableHtml;
    SD.purchasesTableHtml = purchasesTableHtml;
    SD.transactionsTableHtml = transactionsTableHtml;
    SD.exportCsv = exportCsv;
})();
