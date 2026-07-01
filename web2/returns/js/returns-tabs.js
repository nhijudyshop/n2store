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

    // ---------------- List + filters ----------------
    function _listParams() {
        const p = {};
        const search = $('listSearch') ? $('listSearch').value.trim() : '';
        if (search) p.search = search;
        const f = STATE.listFilter;
        if (f.chip === 'pending') p.stockStatus = 'pending';
        else if (f.chip === 'cancelled') p.status = 'cancelled';
        else if (f.chip === 'khach_gui') p.method = 'khach_gui';
        else if (f.chip === 'shipper_gui') p.method = 'shipper_gui';
        else if (f.chip === 'shipper') p.issue = 'van_de_shipper';
        if (f.from) p.from = new Date(f.from + 'T00:00:00').getTime();
        if (f.to) p.to = new Date(f.to + 'T23:59:59').getTime();
        return p;
    }
    function setFilterChip(chip) {
        STATE.listFilter.chip = chip;
        document
            .querySelectorAll('#filterChips .rt-chip-f')
            .forEach((b) => b.classList.toggle('is-active', b.dataset.f === chip));
        loadList();
    }
    function setFilterDates() {
        STATE.listFilter.from = $('filterFrom') ? $('filterFrom').value || '' : '';
        STATE.listFilter.to = $('filterTo') ? $('filterTo').value || '' : '';
        loadList();
    }

    async function loadList() {
        const body = $('returnsBody');
        body.innerHTML =
            '<tr><td colspan="8" class="rt-muted" style="text-align:center;padding:16px;">Đang tải…</td></tr>';
        try {
            const d = await api.list(_listParams());
            STATE.list = d.returns || [];
            renderList();
        } catch (err) {
            body.innerHTML = `<tr><td colspan="8" class="rt-muted" style="text-align:center;">Lỗi: ${esc(err.message)}</td></tr>`;
        }
    }

    function _typeLabel(r) {
        if (r.issue === 'van_de_shipper')
            return `Sửa COD${r.reason ? ' · ' + (REASON_LABEL[r.reason] || r.reason) : ''}`;
        if (r.isExchange) return 'Đổi hàng';
        const dispo =
            r.disposition === 'giu_rieng'
                ? ' · <span class="rt-red">lỗi/giữ riêng</span>'
                : r.disposition === 'huy'
                  ? ' · <span class="rt-red">huỷ</span>'
                  : '';
        if (r.subType === 'thu_ve_1_phan')
            return (r.sourceOrderCode ? 'Thu về 1 phần' : 'Không đơn gốc') + dispo;
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
                        ${
                            cancelled
                                ? '<span class="rt-muted">Đã huỷ</span>'
                                : r.billStatus === 'consumed'
                                  ? '<span class="rt-muted" title="Đã lên bill đổi — huỷ PBH đổi để đảo, không huỷ phiếu trực tiếp">Đã lên bill</span>'
                                  : `<button class="rt-btn-del" data-del="${esc(r.code)}" title="Huỷ phiếu + hoàn lại ví/kho">Huỷ</button>`
                        }
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
                        <div class="rt-pending-acts">
                            <button class="rt-btn-decline" data-decline="${esc(r.code)}"><i data-lucide="x"></i> Từ chối</button>
                            <button class="rt-btn-approve" data-approve="${esc(r.code)}"><i data-lucide="check"></i> Duyệt → cộng kho thật</button>
                        </div>
                    </div>
                </div>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    async function approve(code) {
        const r = STATE.pending.find((x) => x.code === code);
        const nSP = r ? (r.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0) : 0;
        // Xác nhận trước khi cộng kho thật (khó đảo — phải huỷ phiếu). Audit #LOW.
        const ok = await Popup.confirm(
            `Duyệt phiếu ${code}? Cộng ${nSP} SP vào kho BÁN ĐƯỢC (chỉ đảo được bằng cách huỷ phiếu).`,
            { okText: 'Duyệt' }
        );
        if (!ok) return;
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

    // Từ chối hàng shipper gửi về (lỗi/không đúng) — KHÔNG nhập kho, hoàn lại ví đã cộng.
    async function decline(code) {
        const reason = await Popup.prompt(
            `Từ chối phiếu ${code}? Hàng KHÔNG nhập kho, hoàn lại ví/return_qty đã cộng.`,
            { placeholder: 'Lý do (vd: hàng lỗi / không đúng)', okText: 'Từ chối', danger: true }
        );
        if (reason === false || reason == null) return;
        try {
            await api.decline(code, reason || 'Từ chối nhận');
            toast(`Đã từ chối ${code}`, 'success');
            loadPending();
        } catch (err) {
            toast('Lỗi từ chối: ' + err.message, 'error');
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
        decline,
        setFilterChip,
        setFilterDates,
    };
})();
