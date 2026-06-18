// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — COD (shipper flow): nhập COD giảm, tính giảm,
// hiển thị ví (trừ công nợ khách). ⚠ Money display — giữ logic y nguyên.
// =====================================================================
(function () {
    'use strict';

    const C = window.ReturnsCore;
    const { fmt, $, STATE } = C;

    // ---------------- COD (shipper) ----------------
    function onCodInput(v) {
        STATE.codReduction = Math.max(0, Number(v) || 0);
        renderCodCalc();
        renderCodWallet();
        window.ReturnsForm.renderSummary();
    }

    function renderCodCalc() {
        const el = $('codCalc');
        if (STATE.issue !== 'van_de_shipper' || !STATE.sourceOrder) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        const cod = STATE.sourceOrder.cod || 0;
        const giam = STATE.codReduction || 0;
        el.innerHTML =
            `<span>COD còn phải thu: <b class="rt-green">${fmt(cod - giam)}</b></span>` +
            `<span>Phải trả ĐVVC: <b class="rt-red">${fmt(giam)}</b></span>`;
    }

    function renderCodWallet() {
        const el = $('codWallet');
        if (
            STATE.issue !== 'van_de_shipper' ||
            STATE.reasonShip !== 'tru_cong_no_khach' ||
            !STATE.sourceOrder
        ) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        const bal = STATE.walletBalance || 0;
        const giam = STATE.codReduction || 0;
        const conLai = bal - giam;
        const thieu = conLai < 0;
        el.innerHTML =
            `<div class="rt-cw-row"><span>Số dư ví hiện tại: <b>${fmt(bal)}</b></span>` +
            `<span>Trừ vào ví: <b class="rt-red">${fmt(giam)}</b></span></div>` +
            `<div class="rt-cw-row"><span>Ví còn lại: <b>${fmt(Math.max(0, conLai))}</b></span>` +
            (thieu
                ? `<span class="rt-red">⚠ Ví không đủ (thiếu ${fmt(-conLai)})</span>`
                : '<span></span>') +
            `</div>`;
    }

    window.ReturnsCod = {
        onCodInput,
        renderCodCalc,
        renderCodWallet,
    };
})();
