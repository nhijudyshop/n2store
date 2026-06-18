// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Ví NCC — render layer: list cards + detail drawer (tabs: purchases / history).
//
// Pure render (đọc state, ghi DOM). Tham chiếu state + utils qua `window.__SW`.

(function () {
    'use strict';

    const SW = (window.__SW = window.__SW || {});
    const _dbg = SW._dbg;
    const fmtVnd = SW.fmtVnd;
    const escapeHtml = SW.escapeHtml;
    const fmtDateVN = SW.fmtDateVN;
    const fmtTime = SW.fmtTime;

    // ---------- Render list ----------
    function renderList(caller) {
        const listEl = document.getElementById('swList');
        const emptyEl = document.getElementById('swEmptyState');
        const search = (document.getElementById('swSearch').value || '').trim().toLowerCase();
        const sortBy = document.getElementById('swSort').value;
        // Hiển thị MỌI wallet entry trong state: derived từ Sổ Order (có
        // purchases) HOẶC manually-created qua nút "Tạo NCC" (transactions
        // rỗng + totalPurchased = 0). Empty entries vẫn hữu ích vì có mặt
        // trong dropdown gợi ý so-order.
        const items = Object.keys(SW.walletState.wallets)
            .map((s) => SW.walletState.wallets[s])
            .filter((w) => !search || w.supplier.toLowerCase().includes(search));

        items.sort((a, b) => {
            if (sortBy === 'balance-desc') return b.balance - a.balance;
            if (sortBy === 'balance-asc') return a.balance - b.balance;
            if (sortBy === 'total-desc') return b.totalPurchased - a.totalPurchased;
            return a.supplier.localeCompare(b.supplier);
        });

        _dbg(
            `renderList #${++SW._renderSeq}`,
            `caller=${caller || '?'}`,
            `sortBy=${sortBy}`,
            `search="${search}"`,
            `n=${items.length}`,
            'order=',
            items.map((w) => `${w.supplier}[bal=${w.balance},tot=${w.totalPurchased}]`)
        );

        if (!items.length) {
            listEl.innerHTML = '';
            emptyEl.hidden = false;
        } else {
            emptyEl.hidden = true;
            listEl.innerHTML = items.map(cardHtml).join('');
            listEl.querySelectorAll('[data-supplier]').forEach((el) => {
                el.addEventListener('click', () => openDetail(el.dataset.supplier));
            });
        }
        // counters
        const totalOutstanding = items.reduce((s, w) => s + Math.max(0, w.balance), 0);
        document.getElementById('swTotalSuppliers').textContent = `${items.length} NCC`;
        document.getElementById('swTotalOutstanding').textContent =
            `Công nợ: ${fmtVnd(totalOutstanding)}`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function cardHtml(w) {
        const debt = w.balance > 0;
        return `<div class="sw-card" data-supplier="${escapeHtml(w.supplier)}">
            <div class="sw-card-head">
                <div class="sw-card-name">${escapeHtml(w.supplier)}</div>
                <span class="sw-card-badge ${debt ? 'is-debt' : ''}">${debt ? 'Còn nợ' : 'Đủ'}</span>
            </div>
            <div class="sw-card-stats">
                <div><span class="label">Tổng mua</span><span class="value">${fmtVnd(w.totalPurchased)}</span></div>
                <div><span class="label">Đã trả</span><span class="value">${fmtVnd(w.paidAmount)}</span></div>
                <div><span class="label">Trả hàng</span><span class="value">${fmtVnd(w.returnedAmount)}</span></div>
                <div class="balance"><span class="label">Còn nợ</span><span class="value">${fmtVnd(w.balance)}</span></div>
            </div>
        </div>`;
    }

    // ---------- Detail drawer ----------
    function openDetail(supplier) {
        SW.activeSupplier = supplier;
        SW.detailTab = 'purchases';
        const w = SW.walletState.wallets[supplier];
        const agg = SW.suppliers[supplier];
        if (!w) return;
        document.getElementById('swDetailTitle').textContent = supplier;
        document.getElementById('swDetailSub').textContent = agg
            ? `${agg.purchases.length} dòng đã mua`
            : '—';
        document.getElementById('swStatTotal').textContent = fmtVnd(w.totalPurchased);
        document.getElementById('swStatPaid').textContent = fmtVnd(w.paidAmount);
        document.getElementById('swStatReturned').textContent = fmtVnd(w.returnedAmount);
        document.getElementById('swStatBalance').textContent = fmtVnd(w.balance);
        // Cross-links: Công nợ + Sổ Order (injected into modal header each open)
        const _xlinks = document.getElementById('swDetailXLinks');
        if (window.Web2Deeplink?.url && window.Web2Deeplink?.linkBtn) {
            const _linksHtml =
                Web2Deeplink.linkBtn({
                    label: 'Công nợ',
                    icon: 'file-text',
                    url: Web2Deeplink.url.supplierDebt(supplier),
                    title: 'Xem bảng công nợ NCC',
                }) +
                Web2Deeplink.linkBtn({
                    label: 'Sổ Order',
                    icon: 'notebook',
                    url: Web2Deeplink.url.soOrder({ supplier }),
                    title: 'Xem Sổ Order của NCC này',
                });
            if (_xlinks) {
                _xlinks.innerHTML = _linksHtml;
            } else {
                const _sub = document.getElementById('swDetailSub');
                const _wrap = document.createElement('div');
                _wrap.id = 'swDetailXLinks';
                _wrap.className = 'sw-detail-xlinks';
                _wrap.innerHTML = _linksHtml;
                _sub.insertAdjacentElement('afterend', _wrap);
            }
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
        renderDetailTabs();
        document.getElementById('swDetailModal').hidden = false;
    }

    function renderDetailTabs() {
        document.querySelectorAll('#swDetailModal .sw-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.detailTab === SW.detailTab);
        });
        document.querySelectorAll('#swDetailModal .sw-detail-panel').forEach((p) => {
            p.hidden = p.dataset.panel !== SW.detailTab;
        });
        if (SW.detailTab === 'purchases') renderPurchases();
        else renderHistory();
    }

    function renderPurchases() {
        const w = SW.walletState.wallets[SW.activeSupplier];
        const agg = SW.suppliers[SW.activeSupplier];
        const tbody = document.getElementById('swPurchasesBody');
        if (!agg || !agg.purchases.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có dòng nào</td></tr>`;
            return;
        }
        const sorted = [...agg.purchases].sort((a, b) =>
            String(b.date).localeCompare(String(a.date))
        );
        tbody.innerHTML = sorted
            .map((p) => {
                // A2 (2026-06-13): 'Đã trả' khi qty đã trả >= qty mua, KHÔNG phải chỉ
                // cần có entry. returnedRowIds[rowId] = {qty,amount,ts} (object) hoặc
                // truthy legacy (boolean cũ = trả đủ). Trả 1 phần (qty<p.qty) → CHƯA
                // returned → vẫn cho trả tiếp.
                const returned = SW._isRowFullyReturned(w.returnedRowIds[p.rowId], p.qty);
                return `<tr class="${returned ? 'is-returned' : ''}">
                    <td>${escapeHtml(fmtDateVN(p.date))}</td>
                    <td>${escapeHtml(p.productName || '—')}</td>
                    <td>${escapeHtml(p.variant || '—')}</td>
                    <td class="num">${p.qty}</td>
                    <td class="num">${fmtVnd(p.costVnd)}</td>
                    <td class="num">${fmtVnd(p.subtotal)}</td>
                    <td><span class="sw-status-pill" data-status="${returned ? 'returned' : p.status}">${returned ? 'Đã trả' : SW.STATUS_LABELS[p.status] || p.status}</span></td>
                </tr>`;
            })
            .join('');
    }

    function renderHistory() {
        const w = SW.walletState.wallets[SW.activeSupplier];
        const tbody = document.getElementById('swHistoryBody');
        if (!w.transactions.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có giao dịch trong 30 ngày</td></tr>`;
            return;
        }
        const sorted = [...w.transactions].sort((a, b) => b.ts - a.ts);
        tbody.innerHTML = sorted
            .map((t) => {
                const sign = t.type === 'return' || t.type === 'payment' ? 'is-neg' : 'is-pos';
                const lbl =
                    t.type === 'return' ? 'Trả hàng' : t.type === 'payment' ? 'Thanh toán' : 'Mua';
                return `<tr>
                    <td>${escapeHtml(fmtTime(t.ts))}</td>
                    <td><span class="sw-txn-type" data-type="${t.type}">${lbl}</span></td>
                    <td class="num sw-txn-amount ${sign}">−${fmtVnd(t.amount)}</td>
                    <td>${escapeHtml(t.performedBy || '—')}</td>
                    <td>${escapeHtml(t.note || '')}</td>
                </tr>`;
            })
            .join('');
    }

    SW.renderList = renderList;
    SW.cardHtml = cardHtml;
    SW.openDetail = openDetail;
    SW.renderDetailTabs = renderDetailTabs;
    SW.renderPurchases = renderPurchases;
    SW.renderHistory = renderHistory;
})();
