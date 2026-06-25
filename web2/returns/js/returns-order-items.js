// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — ORDER ITEMS: chọn đơn, tải chi tiết, render
// tóm tắt + danh sách SP (cả đơn vs 1 phần), checkbox/qty/select-all.
// =====================================================================
(function () {
    'use strict';

    const C = window.ReturnsCore;
    const { api, fmt, esc, $, STATE } = C;

    // ---------------- Order picker (dùng chung khách + shipper) ----------------
    async function pickOrder(code, type, total) {
        STATE.sourceOrder = {
            code,
            type,
            totalAmount: Number(total) || 0,
            items: null,
            walletDeducted: null,
            cod: 0,
            ship: 0,
        };
        STATE.lines = [];
        document.querySelectorAll('#orderList .rt-order').forEach((el) => {
            el.classList.toggle('is-picked', el.dataset.code === code);
        });
        $('orderSummary').hidden = false;
        $('orderSummary').innerHTML = '<div class="rt-muted">Đang tải chi tiết đơn…</div>';
        // Skeleton chi tiết SP trong lúc fetch (chỉ khi luồng "Vấn đề khách" hiện #orderItems)
        if (STATE.issue === 'van_de_khach') {
            const itemsBox = $('orderItems');
            if (itemsBox) {
                itemsBox.hidden = false;
                if (window.Web2Skeleton) {
                    window.Web2Skeleton.list(itemsBox, { count: 5, avatar: false });
                } else {
                    itemsBox.innerHTML =
                        '<div class="rt-muted" style="padding:6px 4px;">Đang tải sản phẩm…</div>';
                }
            }
        }
        try {
            const d = await api.sourceOrder(type, code);
            if (STATE.sourceOrder?.code !== code) return; // đổi đơn trong lúc tải
            STATE.sourceOrder.items = d.items || [];
            STATE.sourceOrder.walletDeducted = Number(d.walletDeducted) || 0;
            STATE.sourceOrder.cod = Number(d.cod) || 0;
            STATE.sourceOrder.ship = Number(d.ship) || 0;
            // Build lines cho chọn SP (thu về 1 phần / cả đơn)
            STATE.lines = (d.items || []).map((it) => ({
                productCode: it.productCode,
                productName: it.productName || '',
                price: Number(it.price) || 0,
                maxQty: Number(it.quantity) || 0,
                qty: Number(it.quantity) || 0,
                checked: false,
            }));
            renderOrderSummary();
            renderOrderItems();
            window.ReturnsCod.renderCodCalc();
            window.ReturnsCod.renderCodWallet();
            window.ReturnsForm.renderSummary();
        } catch (err) {
            $('orderSummary').innerHTML =
                `<div class="rt-muted">Lỗi tải đơn: ${esc(err.message)}</div>`;
            // Dọn skeleton #orderItems khi lỗi (renderOrderItems không chạy ở nhánh này) → tránh kẹt.
            const itemsBox = $('orderItems');
            if (itemsBox) {
                window.Web2Skeleton?.clear(itemsBox);
                itemsBox.hidden = true;
            }
        }
    }

    function renderOrderSummary() {
        const so = STATE.sourceOrder;
        if (!so || so.items == null) return;
        $('orderSummary').hidden = false;
        $('orderSummary').innerHTML =
            `<div class="rt-os-row"><span class="rt-muted">Tổng tiền</span><b>${fmt(so.totalAmount)}</b></div>` +
            `<div class="rt-os-row"><span class="rt-muted">COD</span><b>${fmt(so.cod)}</b></div>` +
            `<div class="rt-os-row"><span class="rt-muted">Ship</span><b>${fmt(so.ship)}</b></div>`;
    }

    // Render danh sách SP của đơn: cả đơn (read-only) hoặc 1 phần (checkbox + qty).
    function renderOrderItems() {
        const box = $('orderItems');
        if (
            STATE.issue !== 'van_de_khach' ||
            !STATE.sourceOrder ||
            STATE.sourceOrder.items == null
        ) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        if (!STATE.lines.length) {
            box.innerHTML =
                '<div class="rt-muted" style="padding:6px 4px;">Đơn không có dòng SP.</div>';
            return;
        }
        const partial = STATE.subType === 'thu_ve_1_phan';
        const title = partial ? 'Chọn SP thu về' : 'Sản phẩm hoàn (cả đơn)';
        const rows = STATE.lines
            .map((l, i) =>
                partial
                    ? `<div class="rt-oi-row rt-oi-sel">
                         <label class="rt-oi-check"><input type="checkbox" data-line="${i}" ${l.checked ? 'checked' : ''}/>
                           <span><b>${esc(l.productCode)}</b> ${esc(l.productName)}</span></label>
                         <span class="rt-muted">${fmt(l.price)}</span>
                         <input type="number" class="rt-qty" data-lineqty="${i}" min="1" max="${l.maxQty}" value="${l.qty}" ${l.checked ? '' : 'disabled'}/>
                       </div>`
                    : `<div class="rt-oi-row">
                         <span><b>${esc(l.productCode)}</b> ${esc(l.productName)}</span>
                         <span class="rt-muted">${fmt(l.price)} × ${l.qty}</span>
                       </div>`
            )
            .join('');
        // Nút Chọn/Bỏ tất cả — gộp N lần tick thành 1 click (vẫn để user chủ động, không auto-check vì là thao tác cộng ví).
        const allOn = STATE.lines.length > 0 && STATE.lines.every((l) => l.checked);
        const selAllBtn = partial
            ? `<button type="button" id="rtSelAll" class="rt-selall">${allOn ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>`
            : '';
        box.innerHTML =
            `<div class="rt-oi-title"><span>${title} (${STATE.lines.length})</span>${selAllBtn}</div>` +
            rows;
    }

    function toggleLine(i, checked) {
        if (STATE.lines[i]) STATE.lines[i].checked = checked;
        const qtyEl = document.querySelector(`[data-lineqty="${i}"]`);
        if (qtyEl) qtyEl.disabled = !checked;
        window.ReturnsForm.renderSummary();
    }
    function setLineQty(i, qty) {
        const l = STATE.lines[i];
        if (!l) return;
        l.qty = Math.max(1, Math.min(l.maxQty, Number(qty) || 1));
        window.ReturnsForm.renderSummary();
    }

    function selectedLines() {
        return STATE.lines.filter((l) => l.checked && l.qty > 0);
    }

    window.ReturnsItems = {
        pickOrder,
        renderOrderSummary,
        renderOrderItems,
        toggleLine,
        setLineQty,
        selectedLines,
    };
})();
