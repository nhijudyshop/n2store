// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — FORM: method/issue/subtype/reason handlers,
// reason dropdown builder, summary preview, validation, submit, reset.
// ⚠ Money ops (create return / cộng ví / kho) — giữ await + loading state.
// =====================================================================
(function () {
    'use strict';

    const C = window.ReturnsCore;
    const {
        api,
        fmt,
        esc,
        $,
        toast,
        REASON_LABEL,
        KHACH_REASONS_FULL,
        KHACH_REASONS_KHACHGUI,
        STATE,
    } = C;

    // ---------------- Cách hàng về / Vấn đề / Loại ----------------
    function onMethodChange(v) {
        STATE.method = v;
        $('stockHint').innerHTML =
            v === 'shipper_gui'
                ? '<i data-lucide="clock"></i> Tồn kho <b>THU VỀ</b> — chờ duyệt mới cộng kho thật. SP có badge "Thu về" ở Kho SP.'
                : '<i data-lucide="package-check"></i> Cộng <b>tồn kho thật</b> ngay lập tức.';
        // #4: Khách gửi → "Khách không nhận hàng" đổi nhãn "Thu cả đơn".
        const lbl = $('lblCaDon');
        if (lbl) lbl.textContent = v === 'khach_gui' ? 'Thu cả đơn' : 'Khách không nhận hàng';
        if (window.lucide) lucide.createIcons();
        buildReasonSelect();
        renderSummary();
    }

    function onIssueChange(v) {
        STATE.issue = v;
        const isShip = v === 'van_de_shipper';
        $('panelKhach').hidden = isShip;
        $('panelShipper').hidden = !isShip;
        // Loại thu về chỉ ý nghĩa với Vấn đề khách → ẩn khi shipper cho gọn.
        $('subTypeBlock').hidden = isShip;
        $('orderPickTitle').textContent = isShip ? 'Chọn đơn (áp COD)' : 'Chọn đơn';
        buildReasonSelect();
        // Re-render nội dung đơn theo flow
        if (STATE.sourceOrder) {
            window.ReturnsItems.renderOrderItems();
            window.ReturnsCod.renderCodCalc();
            window.ReturnsCod.renderCodWallet();
        }
        renderSummary();
    }

    function onSubTypeChange(v) {
        STATE.subType = v;
        window.ReturnsItems.renderOrderItems();
        renderSummary();
    }

    // Build lại dropdown Lý do (khách) theo (issue, method).
    function buildReasonSelect() {
        const sel = $('reasonSelect');
        if (!sel) return;
        const codes = STATE.method === 'khach_gui' ? KHACH_REASONS_KHACHGUI : KHACH_REASONS_FULL;
        sel.innerHTML = codes
            .map((c) => `<option value="${c}">${esc(REASON_LABEL[c])}</option>`)
            .join('');
        if (!codes.includes(STATE.reason)) STATE.reason = codes[0];
        sel.value = STATE.reason;
        $('reasonNoteWrap').hidden = STATE.reason !== 'khac';
    }

    function onReasonChange(v) {
        STATE.reason = v;
        $('reasonNoteWrap').hidden = v !== 'khac';
        renderSummary();
    }

    function onReasonShipChange(v) {
        STATE.reasonShip = v;
        window.ReturnsCod.renderCodWallet();
        renderSummary();
    }

    // ---------------- Summary + submit ----------------
    function renderSummary() {
        const el = $('creditPreview');
        if (STATE.issue === 'van_de_shipper') {
            const giam = STATE.codReduction || 0;
            const truVi = STATE.reasonShip === 'tru_cong_no_khach';
            el.innerHTML = truVi
                ? `Trừ ví khách: <b>${fmt(giam)}</b> · Phải trả ĐVVC: <b>${fmt(giam)}</b>`
                : `Phải trả ĐVVC: <b>${fmt(giam)}</b> <span class="rt-muted">(không trừ ví)</span>`;
        } else if (STATE.subType === 'thu_ve_1_phan') {
            const credit = window.ReturnsItems.selectedLines().reduce(
                (s, l) => s + l.price * l.qty,
                0
            );
            el.innerHTML = `Cộng ví khách: <b>${fmt(credit)}</b> <span class="rt-muted">(giá bán × SL)</span>`;
        } else {
            const so = STATE.sourceOrder;
            if (!so) el.innerHTML = 'Chọn 1 đơn của khách để hoàn.';
            else if (so.walletDeducted != null)
                el.innerHTML =
                    so.walletDeducted > 0
                        ? `Hoàn cả đơn <b>${esc(so.code)}</b> — cộng ví <b>${fmt(so.walletDeducted)}</b> <span class="rt-muted">(phần đã trừ ví)</span>`
                        : `Hoàn cả đơn <b>${esc(so.code)}</b> — <span class="rt-muted">đơn chưa trừ ví → chỉ +kho</span>`;
            else el.innerHTML = `Hoàn cả đơn <b>${esc(so.code)}</b> …`;
        }
        $('btnSubmit').disabled = !canSubmit();
    }

    function canSubmit() {
        if (!STATE.customer || !STATE.sourceOrder || STATE.sourceOrder.items == null) return false;
        if (STATE.issue === 'van_de_shipper') {
            if (!(STATE.codReduction > 0)) return false;
            if (
                STATE.reasonShip === 'tru_cong_no_khach' &&
                STATE.codReduction > STATE.walletBalance
            )
                return false; // ví không đủ
            return true;
        }
        if (STATE.subType === 'thu_ve_1_phan')
            return window.ReturnsItems.selectedLines().length > 0;
        return true; // khong_nhan_hang: đã có đơn
    }

    async function submit() {
        if (!canSubmit()) return;
        const btn = $('btnSubmit');
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = 'Đang lưu…';
        const c = STATE.customer;
        const so = STATE.sourceOrder;
        let payload;
        if (STATE.issue === 'van_de_shipper') {
            payload = {
                phone: c.phone,
                customerName: c.name,
                customerId: c.customerId,
                method: 'shipper_gui',
                subType: 'cod_shipper',
                issue: 'van_de_shipper',
                reason: STATE.reasonShip,
                sourceOrderCode: so.code,
                sourceOrderType: so.type,
                codReduction: STATE.codReduction,
                note: $('noteInput').value.trim() || null,
            };
        } else {
            const base = {
                phone: c.phone,
                customerName: c.name,
                customerId: c.customerId,
                method: STATE.method,
                issue: 'van_de_khach',
                sourceOrderCode: so.code,
                sourceOrderType: so.type,
                note: $('noteInput').value.trim() || null,
            };
            if (STATE.subType === 'thu_ve_1_phan') {
                payload = {
                    ...base,
                    subType: 'thu_ve_1_phan',
                    items: window.ReturnsItems.selectedLines().map((l) => ({
                        productCode: l.productCode,
                        productName: l.productName,
                        quantity: l.qty,
                        price: l.price,
                    })),
                };
            } else {
                payload = {
                    ...base,
                    subType: 'khong_nhan_hang',
                    reason: STATE.reason,
                    reasonNote: STATE.reason === 'khac' ? $('reasonNote').value.trim() : null,
                };
            }
        }
        try {
            const d = await api.create(payload);
            const r = d.return;
            const msg =
                STATE.issue === 'van_de_shipper'
                    ? `Đã tạo ${r.code} — COD giảm ${fmt(r.codReduction)}${r.walletCredited < 0 ? ' · trừ ví ' + fmt(-r.walletCredited) : ''}`
                    : `Đã tạo ${r.code} — ví +${fmt(r.walletCredited)}${STATE.method === 'shipper_gui' ? ' · kho thu về chờ duyệt' : ' · đã vào kho'}`;
            toast(msg, 'success');
            resetForm();
            window.ReturnsTabs.switchTab('list');
        } catch (err) {
            toast('Lỗi tạo phiếu: ' + err.message, 'error');
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    }

    function resetForm() {
        STATE.sourceOrder = null;
        STATE.lines = [];
        STATE.codReduction = 0;
        if ($('noteInput')) $('noteInput').value = '';
        if ($('reasonNote')) $('reasonNote').value = '';
        if ($('codReduction')) $('codReduction').value = '';
        $('orderItems').hidden = true;
        $('orderSummary').hidden = true;
        $('codCalc').hidden = true;
        $('codWallet').hidden = true;
        if (STATE.customer) window.ReturnsCustomer.loadCustomerOrders();
    }

    window.ReturnsForm = {
        onMethodChange,
        onIssueChange,
        onSubTypeChange,
        buildReasonSelect,
        onReasonChange,
        onReasonShipChange,
        renderSummary,
        canSubmit,
        submit,
        resetForm,
    };
})();
