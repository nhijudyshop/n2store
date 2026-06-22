// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — TABS: tab Danh sách (load/search/render/huỷ)
// + tab Chờ duyệt (load/render thẻ duyệt/duyệt). ⚠ Huỷ/duyệt = money/kho
// ops → giữ await + loading.
// =====================================================================
(function () {
    'use strict';

    const C = window.ReturnsCore;
    const { api, fmt, esc, $, toast, METHOD_LABEL, REASON_LABEL, STOCK_LABEL, STATE } = C;

    // ---------------- Tabs ----------------
    function switchTab(tab) {
        STATE.tab = tab;
        ['create', 'list', 'pending'].forEach((t) => {
            $('tab-' + t)?.classList.toggle('is-active', t === tab);
            const p = $('panel-' + t);
            if (p) p.hidden = t !== tab;
        });
        if (tab === 'list') loadList();
        if (tab === 'pending') loadPending();
    }

    // ---------------- List ----------------
    async function loadList() {
        const body = $('returnsBody');
        body.innerHTML =
            '<tr><td colspan="8" class="rt-muted" style="text-align:center;padding:16px;">Đang tải…</td></tr>';
        try {
            const search = $('listSearch').value.trim();
            const d = await api.list(search ? { search } : {});
            STATE.list = d.returns || [];
            renderList();
        } catch (err) {
            body.innerHTML = `<tr><td colspan="8" class="rt-muted" style="text-align:center;">Lỗi: ${esc(err.message)}</td></tr>`;
        }
    }

    function _typeLabel(r) {
        if (r.issue === 'van_de_shipper')
            return `Sửa COD${r.reason ? ' · ' + (REASON_LABEL[r.reason] || r.reason) : ''}`;
        if (r.subType === 'thu_ve_1_phan') return 'Thu về 1 phần';
        return `Không nhận hàng${r.reason ? ' · ' + (REASON_LABEL[r.reason] || r.reason) : ''}`;
    }

    function renderList() {
        const body = $('returnsBody');
        if (!STATE.list.length) {
            // Task 3: empty state with lucide icon for discoverability.
            body.innerHTML =
                '<tr><td colspan="8"><div class="rt-empty"><i data-lucide="package"></i>Chưa có phiếu thu về.</div></td></tr>';
            if (window.lucide) lucide.createIcons();
            return;
        }
        body.innerHTML = STATE.list
            .map((r) => {
                const isShip = r.issue === 'van_de_shipper';
                const stockCls =
                    r.stockStatus === 'pending'
                        ? 'rt-st-pending'
                        : r.stockStatus === 'approved'
                          ? 'rt-st-approved'
                          : 'rt-st-applied';
                const cancelled = r.status === 'cancelled';
                const billTag =
                    r.billStatus === 'queued'
                        ? '<span class="rt-tag rt-tag-bill">Chờ bill 0đ</span>'
                        : r.billStatus === 'consumed'
                          ? '<span class="rt-tag">Đã lên bill</span>'
                          : '';
                // Cột "Ví cộng": shipper trừ ví → hiện âm; khách → cộng.
                const walletCell = isShip
                    ? r.walletCredited < 0
                        ? `<span class="rt-red">−${fmt(-r.walletCredited)}</span>`
                        : `<span class="rt-muted">COD ${fmt(r.codReduction)}</span>`
                    : fmt(r.walletCredited);
                const stockCell = isShip
                    ? '<span class="rt-muted">—</span>'
                    : `<span class="rt-chip ${stockCls}">${STOCK_LABEL[r.stockStatus] || r.stockStatus}</span>`;
                return `<tr class="${cancelled ? 'rt-row-cancelled' : ''}">
                    <td><b>${esc(r.code)}</b></td>
                    <td>${esc(r.customerName || '')}<div class="rt-muted" data-w2wallet-phone="${esc(r.phone || '')}">${esc(r.phone || '')}</div></td>
                    <td><span class="rt-tag">${isShip ? 'Shipper' : METHOD_LABEL[r.method] || r.method}</span></td>
                    <td>${esc(_typeLabel(r))} ${billTag}</td>
                    <td>${isShip ? '—' : (r.items?.length || 0) + ' SP'}</td>
                    <td>${walletCell}</td>
                    <td>${stockCell}</td>
                    <td class="rt-actions">
                        <button class="rt-btn-hist" data-hist="${esc(r.code)}" title="Lịch sử thao tác phiếu ${esc(r.code)}"><i data-lucide="history"></i></button>
                        ${cancelled ? '<span class="rt-muted">Đã huỷ</span>' : `<button class="rt-btn-del" data-del="${esc(r.code)}" title="Huỷ phiếu + hoàn lại ví/kho">Huỷ</button>`}
                    </td>
                </tr>`;
            })
            .join('');
        try {
            window.Web2WalletBalance?.attachBalances?.(body);
        } catch {}
        if (window.lucide) lucide.createIcons();
    }

    async function removeReturn(code) {
        if (
            !(await Popup.danger(`Huỷ phiếu ${code}? Sẽ hoàn lại ví/kho đã thay đổi.`, {
                okText: 'Huỷ phiếu',
            }))
        )
            return;
        try {
            await api.remove(code);
            toast(`Đã huỷ ${code}`, 'success');
            loadList();
        } catch (err) {
            toast('Lỗi huỷ: ' + err.message, 'error');
        }
    }

    // ---------------- Pending (duyệt) ----------------
    async function loadPending() {
        const wrap = $('pendingList');
        wrap.innerHTML = '<div class="rt-muted">Đang tải…</div>';
        try {
            const d = await api.pending();
            STATE.pending = d.items || [];
            renderPending();
        } catch (err) {
            wrap.innerHTML = `<div class="rt-muted">Lỗi: ${esc(err.message)}</div>`;
        }
    }

    function renderPending() {
        const wrap = $('pendingList');
        $('pendingCount').textContent = STATE.pending.length;
        if (!STATE.pending.length) {
            wrap.innerHTML =
                '<div class="rt-empty"><i data-lucide="check-circle"></i> Không có phiếu nào chờ duyệt.</div>';
            if (window.lucide) lucide.createIcons();
            return;
        }
        wrap.innerHTML = STATE.pending
            .map((r) => {
                const items = (r.items || [])
                    .map(
                        (it) =>
                            `<span class="rt-pill">${esc(it.productCode)} ×${it.quantity}</span>`
                    )
                    .join(' ');
                return `<div class="rt-pending-card ${r.overdue ? 'is-overdue' : ''}">
                    <div class="rt-pending-head">
                        <b>${esc(r.code)}</b>
                        <span class="rt-muted">${esc(r.customerName || '')} · ${esc(r.phone || '')}</span>
                        <span class="rt-age ${r.overdue ? 'is-overdue' : ''}">${r.ageDays} ngày${r.overdue ? ' ⚠ quá hạn' : ''}</span>
                    </div>
                    <div class="rt-pending-items">${items}</div>
                    <div class="rt-pending-foot">
                        <span class="rt-muted">Ví đã cộng: ${fmt(r.walletCredited)}</span>
                        <button class="rt-btn-approve" data-approve="${esc(r.code)}"><i data-lucide="check"></i> Duyệt → cộng kho thật</button>
                    </div>
                </div>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    async function approve(code) {
        const btn = document.querySelector(`[data-approve="${CSS.escape(code)}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = 'Đang duyệt…';
        }
        try {
            await api.approve(code);
            toast(`Đã duyệt ${code} — cộng vào kho thật`, 'success');
            loadPending();
        } catch (err) {
            toast('Lỗi duyệt: ' + err.message, 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Duyệt';
            }
        }
    }

    window.ReturnsTabs = {
        switchTab,
        loadList,
        renderList,
        removeReturn,
        loadPending,
        renderPending,
        approve,
    };
})();
