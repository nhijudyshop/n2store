// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — FORM: method/issue/reason handlers, reason
// dropdown (theo KỊCH BẢN), summary preview, validation, submit, reset.
// Kịch bản (scenario) do returns-scenario.js sở hữu; form đọc currentScn()
// để lái reason list / summary / payload extras.
// ⚠ Money ops (create return / cộng ví / kho) — giữ await + loading state.
// =====================================================================
(function () {
    'use strict';

    const C = window.ReturnsCore;
    const { api, fmt, esc, $, toast, REASON_LABEL, KHACH_REASONS_FULL, STATE } = C;
    const scn = () => window.ReturnsScenario.currentScn();
    const selLines = () => window.ReturnsItems.selectedLines();

    // ---------------- Cách hàng về (method toggle) ----------------
    function onMethodChange(v) {
        STATE.method = v;
        $('stockHint').innerHTML =
            v === 'shipper_gui'
                ? '<i data-lucide="clock"></i> Shipper hoàn / khách gửi <b>bưu điện</b> → tồn kho <b>THU VỀ</b>, chờ duyệt mới cộng kho thật. SP có badge "Thu về" ở Kho SP.'
                : '<i data-lucide="package-check"></i> Khách <b>tới shop</b> trả trực tiếp → cộng <b>tồn kho thật</b> ngay.';
        if (window.lucide) lucide.createIcons();
        renderSummary();
    }

    // issue đổi bởi selectScenario (keepScenario=true để không rebuild reason 2 lần).
    function onIssueChange(v, keepScenario) {
        STATE.issue = v;
        const isShip = v === 'van_de_shipper';
        $('panelKhach').hidden = isShip;
        $('panelShipper').hidden = !isShip;
        $('orderPickTitle').textContent = isShip ? 'Chọn đơn (áp COD)' : 'Chọn đơn';
        if (!keepScenario) buildReasonSelect();
        if (STATE.sourceOrder) {
            window.ReturnsItems.renderOrderItems();
            window.ReturnsCod.renderCodCalc();
            window.ReturnsCod.renderCodWallet();
        }
        renderSummary();
    }

    // Build dropdown Lý do theo reasons của kịch bản đang chọn.
    function buildReasonSelect() {
        const sel = $('reasonSelect');
        if (!sel) return;
        const s = scn();
        const codes = s.reasons && s.reasons.length ? s.reasons : KHACH_REASONS_FULL;
        sel.innerHTML = codes
            .map((c) => `<option value="${c}">${esc(REASON_LABEL[c] || c)}</option>`)
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
        const s = scn();
        if (STATE.issue === 'van_de_shipper') {
            const giam = STATE.codReduction || 0;
            const truVi = STATE.reasonShip === 'tru_cong_no_khach';
            el.innerHTML = truVi
                ? `Trừ ví khách: <b>${fmt(giam)}</b> · Phải trả ĐVVC: <b>${fmt(giam)}</b>`
                : `Phải trả ĐVVC: <b>${fmt(giam)}</b> <span class="rt-muted">(không trừ ví)</span>`;
        } else if (s.needsManualItems) {
            // Thu về không đơn gốc — chỉ +kho, không cộng ví.
            const n = selLines().length;
            el.innerHTML = n
                ? `Thu về <b>${n} SP</b> → chỉ +kho <span class="rt-muted">(chưa gắn đơn, không cộng ví)</span>`
                : 'Chọn / quét SP thu về.';
        } else if (s.isExchange) {
            const retVal = selLines().reduce((a, l) => a + l.price * l.qty, 0);
            const repVal = STATE.replacements.reduce((a, l) => a + l.price * l.qty, 0);
            const diff = repVal - retVal;
            el.innerHTML =
                `Đổi hàng: trả <b>${fmt(retVal)}</b> · lấy <b>${fmt(repVal)}</b> · ` +
                (diff > 0
                    ? `khách bù <b class="rt-red">${fmt(diff)}</b>`
                    : diff < 0
                      ? `shop hoàn <b class="rt-green">${fmt(-diff)}</b>`
                      : 'ngang giá');
        } else if (STATE.subType === 'thu_ve_1_phan') {
            const gross = selLines().reduce((a, l) => a + l.price * l.qty, 0);
            const bear = Math.min(STATE.customerBear || 0, gross);
            const credit = Math.max(0, gross - bear);
            const cash = STATE.refundMethod === 'tien_mat' || STATE.refundMethod === 'ck';
            el.innerHTML =
                `Hoàn khách: <b>${fmt(credit)}</b>` +
                (bear > 0
                    ? ` <span class="rt-muted">(giá ${fmt(gross)} − khách chịu ${fmt(bear)})</span>`
                    : '') +
                (cash
                    ? ' <span class="rt-muted">· trả tiền tay, không cộng ví</span>'
                    : bear > 0
                      ? ''
                      : ' <span class="rt-muted">(giá bán × SL)</span>');
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
        // Ghi chú disposition (hàng lỗi không +kho).
        if (
            s.showDisposition &&
            (STATE.disposition === 'giu_rieng' || STATE.disposition === 'huy')
        ) {
            el.innerHTML += ` · <span class="rt-red">${STATE.disposition === 'huy' ? 'huỷ hàng' : 'giữ riêng'} — KHÔNG +kho bán</span>`;
        }
        // Ghi chú phí ship hoàn.
        if (s.showShipFee && STATE.shipFee > 0) {
            el.innerHTML += ` · Phí ship hoàn <b>${fmt(STATE.shipFee)}</b> <span class="rt-muted">(${STATE.feeBearer === 'khach' ? 'khách' : 'shop'} chịu)</span>`;
        }
        $('btnSubmit').disabled = !canSubmit();
    }

    function canSubmit() {
        if (!STATE.customer) return false;
        const s = scn();
        if (STATE.issue === 'van_de_shipper') {
            if (!STATE.sourceOrder) return false;
            if (!(STATE.codReduction > 0)) return false;
            if (
                STATE.reasonShip === 'tru_cong_no_khach' &&
                STATE.codReduction > (STATE.walletBalance || 0)
            )
                return false; // ví không đủ
            return true;
        }
        if (s.needsManualItems) return selLines().length > 0; // orphan
        if (STATE.subType === 'thu_ve_1_phan') {
            if (!STATE.sourceOrder || STATE.sourceOrder.items == null) return false;
            if (selLines().length === 0) return false;
            if (s.isExchange && STATE.replacements.length === 0) return false;
            return true;
        }
        // khong_nhan_hang
        return !!(STATE.sourceOrder && STATE.sourceOrder.items != null);
    }

    async function submit() {
        if (!canSubmit()) return;
        const btn = $('btnSubmit');
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = 'Đang lưu…';
        const c = STATE.customer;
        const so = STATE.sourceOrder;
        const s = scn();
        const extras = window.ReturnsScenario.payloadExtras();
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
                sourceOrderCode: so ? so.code : null,
                sourceOrderType: so ? so.type : null,
                note: $('noteInput').value.trim() || null,
                ...extras,
            };
            if (STATE.subType === 'thu_ve_1_phan') {
                payload = {
                    ...base,
                    subType: 'thu_ve_1_phan',
                    items: selLines().map((l) => ({
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
                    : s.isExchange
                      ? `Đã tạo ${r.code} — đổi hàng (SP trả lên bill 0đ ở đơn đổi)`
                      : `Đã tạo ${r.code}${r.walletCredited > 0 ? ' — ví +' + fmt(r.walletCredited) : ''}${STATE.method === 'shipper_gui' && !s.needsManualItems ? ' · kho thu về chờ duyệt' : ' · đã vào kho'}`;
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
        STATE.replacements = [];
        STATE.codReduction = 0;
        STATE.shipFee = 0;
        STATE.customerBear = 0;
        if ($('noteInput')) $('noteInput').value = '';
        if ($('reasonNote')) $('reasonNote').value = '';
        if ($('codReduction')) $('codReduction').value = '';
        if ($('shipFeeInput')) $('shipFeeInput').value = '';
        if ($('customerBearInput')) $('customerBearInput').value = '';
        $('orderItems').hidden = true;
        $('orderSummary').hidden = true;
        $('codCalc').hidden = true;
        $('codWallet').hidden = true;
        window.ReturnsScenario.renderManualItems();
        window.ReturnsScenario.renderReplList();
        window.ReturnsScenario.renderReplDiff();
        if (STATE.customer && scn().needsSourceOrder) window.ReturnsCustomer.loadCustomerOrders();
    }

    window.ReturnsForm = {
        onMethodChange,
        onIssueChange,
        buildReasonSelect,
        onReasonChange,
        onReasonShipChange,
        renderSummary,
        canSubmit,
        submit,
        resetForm,
    };
})();
