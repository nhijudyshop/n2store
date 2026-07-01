// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Thu về (scenario-first).
// =====================================================================
// Thu về (Goods Return) — SCENARIO: kịch bản-first UI. Thay bộ ba radio
// method×issue×subType bằng danh sách phẳng 6 kịch bản. Mỗi kịch bản tự set
// method/issue/subType + bật/tắt các khối phụ (đổi hàng, hàng lỗi disposition,
// hình thức hoàn, phí ship, thu về không đơn gốc). Cũng chứa:
//   - Replacement picker (SP đổi lấy) cho đổi hàng
//   - Orphan product search (chọn SP thủ công) cho thu về không đơn gốc
//   - Barcode scan-to-add (Web2BarcodeScanner)
// SOURCE-OF-TRUTH state = ReturnsCore.STATE. Module này chỉ điều phối UI.
// =====================================================================
(function () {
    'use strict';

    const C = window.ReturnsCore;
    const { api, fmt, esc, $, toast, SCENARIOS, STATE } = C;

    const currentScn = () => SCENARIOS[STATE.scenario] || SCENARIOS.boom_ca_don;

    // ---------------- Scenario grid ----------------
    function renderGrid() {
        const grid = $('scenarioGrid');
        if (!grid) return;
        grid.innerHTML = Object.entries(SCENARIOS)
            .map(
                ([key, s]) => `
            <button type="button" class="rt-scn${key === STATE.scenario ? ' is-active' : ''}" data-scn="${key}">
                <i data-lucide="${s.icon}"></i>
                <span class="rt-scn-lbl">${esc(s.label)}</span>
                <span class="rt-scn-desc">${esc(s.desc)}</span>
            </button>`
            )
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    // ---------------- Chọn kịch bản ----------------
    function selectScenario(key) {
        const s = SCENARIOS[key];
        if (!s) return;
        STATE.scenario = key;
        STATE.method = s.method;
        STATE.issue = s.issue;
        STATE.subType = s.subType;
        STATE.disposition = s.defaultDisposition || 'nhap_ban';
        STATE.refundMethod = 'vi';
        STATE.customerBear = 0;
        if ($('customerBearInput')) $('customerBearInput').value = '';
        STATE.feeBearer = s.defaultFeeBearer || null;
        STATE.replacements = [];
        // Đổi kịch bản khi CHƯA cần đơn gốc → bỏ đơn + dòng SP. Khi VẪN cần đơn gốc
        // và đã có đơn đang chọn → GIỮ đơn, rebuild lại dòng SP từ items (đổi kịch bản
        // không được mất dòng SP đã tải — bug browser-test 2026-07-01).
        if (!s.needsSourceOrder) {
            STATE.sourceOrder = null;
            STATE.lines = [];
        } else if (STATE.sourceOrder && STATE.sourceOrder.items) {
            STATE.lines = STATE.sourceOrder.items.map((it) => ({
                productCode: it.productCode,
                productName: it.productName || '',
                price: Number(it.price) || 0,
                maxQty: Number(it.quantity) || 0,
                qty: Number(it.quantity) || 0,
                checked: false,
            }));
        } else {
            STATE.lines = [];
        }

        renderGrid();
        applyUI();
        // Sync radio method + reason list + reload đơn nếu cần.
        document.querySelectorAll('input[name="method"]').forEach((r) => {
            r.checked = r.value === STATE.method;
        });
        document.querySelectorAll('input[name="feeBearer"]').forEach((r) => {
            r.checked = r.value === STATE.feeBearer;
        });
        if ($('dispoSelect')) $('dispoSelect').value = STATE.disposition;
        if ($('refundSelect')) $('refundSelect').value = STATE.refundMethod;
        window.ReturnsForm.buildReasonSelect();
        renderRefundHint();
        // Kịch bản khách flow: hiện panelKhach; shipper: panelShipper.
        window.ReturnsForm.onIssueChange(STATE.issue, /*keepScenario*/ true);
        if (STATE.customer && s.needsSourceOrder) window.ReturnsCustomer.loadCustomerOrders();
        renderManualItems();
        renderReplList();
        renderReplDiff();
        window.ReturnsForm.renderSummary();
    }

    // ---------------- Bật/tắt khối theo kịch bản ----------------
    function applyUI() {
        const s = currentScn();
        const show = (id, on) => {
            const el = $(id);
            if (el) el.hidden = !on;
        };
        show('methodToggleRow', !!s.allowMethodToggle);
        show('orderPickBlock', !!s.needsSourceOrder);
        show('orphanBlock', !!s.needsManualItems);
        show('replBlock', !!s.needsReplacement);
        show('dispoBlock', !!s.showDisposition);
        show('refundBlock', !!s.showRefundMethod);
        show('customerBearBlock', !!s.showRefundMethod);
        show('shipFeeBlock', !!s.showShipFee);
        // Chip xác nhận ý định.
        const chip = $('scnSummaryChip');
        if (chip) {
            chip.innerHTML =
                `<i data-lucide="${s.icon}"></i> <b>${esc(s.label)}</b>` +
                (s.isExchange ? ' · <span class="rt-scn-tag">Đổi hàng</span>' : '') +
                (s.showDisposition
                    ? ' · <span class="rt-scn-tag rt-tag-warn">Hàng lỗi</span>'
                    : '');
        }
        if (window.lucide) lucide.createIcons();
    }

    // ---------------- Disposition / Refund / Ship fee ----------------
    function onDispoChange(v) {
        STATE.disposition = v;
        window.ReturnsForm.renderSummary();
    }
    function onRefundChange(v) {
        STATE.refundMethod = v;
        renderRefundHint();
        window.ReturnsForm.renderSummary();
    }
    function renderRefundHint() {
        const el = $('refundHint');
        if (!el) return;
        const m = STATE.refundMethod;
        el.textContent =
            m === 'tien_mat' || m === 'ck'
                ? 'Trả tiền tay — KHÔNG cộng số dư ví (chỉ ghi nhận).'
                : m === 'cong_no'
                  ? 'Ghi có vào ví khách (công nợ) để lần sau cấn trừ.'
                  : 'Cộng vào số dư ví khách.';
    }
    function onShipFeeInput() {
        const el = $('shipFeeInput');
        STATE.shipFee = window.Web2NumberInput
            ? window.Web2NumberInput.getValue(el) || 0
            : Number((el.value || '').replace(/\D/g, '')) || 0;
        window.ReturnsForm.renderSummary();
    }
    function onCustomerBearInput() {
        const el = $('customerBearInput');
        STATE.customerBear = window.Web2NumberInput
            ? window.Web2NumberInput.getValue(el) || 0
            : Number((el.value || '').replace(/\D/g, '')) || 0;
        window.ReturnsForm.renderSummary();
    }
    function onFeeBearerChange(v) {
        STATE.feeBearer = v;
        window.ReturnsForm.renderSummary();
    }

    // ---------------- Product search helper (repl + orphan) ----------------
    function _mapProduct(p) {
        return {
            productCode: p.code || p.productCode || '',
            productName: p.name || p.productName || '',
            price: Number(p.price ?? p.sellPrice ?? p.priceUnit ?? 0) || 0,
        };
    }
    async function _searchProducts(q) {
        const d = await api.searchProducts(q);
        const list = d.products || d.data || d.items || [];
        return list.map(_mapProduct).filter((x) => x.productCode);
    }
    function _renderDropdown(boxId, list, onPick) {
        const box = $(boxId);
        if (!box) return;
        box.innerHTML = list.length
            ? list
                  .map(
                      (p, i) =>
                          `<div class="rt-opt" data-i="${i}">
                             <strong>${esc(p.productCode)}</strong>
                             <span class="rt-muted">${esc(p.productName)}</span>
                             <span class="rt-opt-price">${fmt(p.price)}</span>
                           </div>`
                  )
                  .join('')
            : '<div class="rt-opt rt-muted">Không tìm thấy SP</div>';
        box.hidden = false;
        box._list = list;
        box.onclick = (e) => {
            const opt = e.target.closest('.rt-opt[data-i]');
            if (!opt) return;
            onPick(list[Number(opt.dataset.i)]);
            box.hidden = true;
        };
    }

    // ---------------- Đổi hàng: SP đổi lấy ----------------
    function onReplSearch(e) {
        const q = e.target.value.trim();
        clearTimeout(STATE._repTimer);
        if (q.length < 2) {
            $('replResults').hidden = true;
            return;
        }
        STATE._repTimer = setTimeout(async () => {
            try {
                _renderDropdown('replResults', await _searchProducts(q), addReplacement);
            } catch (err) {
                toast('Lỗi tìm SP: ' + err.message, 'error');
            }
        }, 300);
    }
    function addReplacement(p) {
        const ex = STATE.replacements.find((x) => x.productCode === p.productCode);
        if (ex) ex.qty += 1;
        else STATE.replacements.push({ ...p, qty: 1 });
        if ($('replSearch')) $('replSearch').value = '';
        renderReplList();
        renderReplDiff();
        window.ReturnsForm.renderSummary();
    }
    function renderReplList() {
        const box = $('replList');
        if (!box) return;
        if (!STATE.replacements.length) {
            box.innerHTML = '<div class="rt-muted" style="padding:4px">Chưa chọn SP đổi lấy.</div>';
            return;
        }
        box.innerHTML = STATE.replacements
            .map(
                (l, i) => `
            <div class="rt-mi-row">
                <span class="rt-mi-name"><b>${esc(l.productCode)}</b> ${esc(l.productName)}</span>
                <input type="number" class="rt-qty" data-replqty="${i}" min="1" value="${l.qty}"/>
                <span class="rt-muted">${fmt(l.price)}</span>
                <button type="button" class="rt-mi-x" data-replx="${i}" title="Bỏ">✕</button>
            </div>`
            )
            .join('');
    }
    function setReplQty(i, v) {
        if (STATE.replacements[i]) STATE.replacements[i].qty = Math.max(1, Number(v) || 1);
        renderReplDiff();
        window.ReturnsForm.renderSummary();
    }
    function removeRepl(i) {
        STATE.replacements.splice(i, 1);
        renderReplList();
        renderReplDiff();
        window.ReturnsForm.renderSummary();
    }
    function renderReplDiff() {
        const el = $('replDiff');
        if (!el) return;
        if (!currentScn().isExchange) {
            el.hidden = true;
            return;
        }
        const retVal = window.ReturnsItems.selectedLines().reduce((s, l) => s + l.price * l.qty, 0);
        const repVal = STATE.replacements.reduce((s, l) => s + l.price * l.qty, 0);
        const diff = repVal - retVal;
        el.hidden = false;
        el.innerHTML =
            `<div class="rt-rd-row"><span class="rt-muted">Giá trị SP trả</span><b>${fmt(retVal)}</b></div>` +
            `<div class="rt-rd-row"><span class="rt-muted">Giá trị SP đổi lấy</span><b>${fmt(repVal)}</b></div>` +
            (diff > 0
                ? `<div class="rt-rd-row rt-rd-emph"><span>Khách bù thêm</span><b class="rt-red">${fmt(diff)}</b></div>`
                : diff < 0
                  ? `<div class="rt-rd-row rt-rd-emph"><span>Shop hoàn khách</span><b class="rt-green">${fmt(-diff)}</b></div>`
                  : `<div class="rt-rd-row rt-rd-emph"><span>Ngang giá</span><b>0₫</b></div>`);
    }

    // ---------------- Thu về không đơn gốc: SP thủ công ----------------
    function onOrphanSearch(e) {
        const q = e.target.value.trim();
        clearTimeout(STATE._orphanTimer);
        if (q.length < 2) {
            $('orphanResults').hidden = true;
            return;
        }
        STATE._orphanTimer = setTimeout(async () => {
            try {
                _renderDropdown('orphanResults', await _searchProducts(q), addManualItem);
            } catch (err) {
                toast('Lỗi tìm SP: ' + err.message, 'error');
            }
        }, 300);
    }
    function addManualItem(p) {
        const ex = STATE.lines.find((x) => x.productCode === p.productCode);
        if (ex) ex.qty += 1;
        else
            STATE.lines.push({
                productCode: p.productCode,
                productName: p.productName,
                price: p.price,
                maxQty: 9999,
                qty: 1,
                checked: true,
            });
        if ($('orphanSearch')) $('orphanSearch').value = '';
        renderManualItems();
        window.ReturnsForm.renderSummary();
    }
    function renderManualItems() {
        const box = $('manualItems');
        if (!box) return;
        if (!currentScn().needsManualItems) {
            box.innerHTML = '';
            return;
        }
        if (!STATE.lines.length) {
            box.innerHTML =
                '<div class="rt-muted" style="padding:4px">Chưa chọn SP. Tìm hoặc quét mã ở trên.</div>';
            return;
        }
        box.innerHTML = STATE.lines
            .map(
                (l, i) => `
            <div class="rt-mi-row">
                <span class="rt-mi-name"><b>${esc(l.productCode)}</b> ${esc(l.productName)}</span>
                <input type="number" class="rt-qty" data-manqty="${i}" min="1" value="${l.qty}"/>
                <button type="button" class="rt-mi-x" data-manx="${i}" title="Bỏ">✕</button>
            </div>`
            )
            .join('');
    }
    function setManualQty(i, v) {
        if (STATE.lines[i]) STATE.lines[i].qty = Math.max(1, Number(v) || 1);
        window.ReturnsForm.renderSummary();
    }
    function removeManual(i) {
        STATE.lines.splice(i, 1);
        renderManualItems();
        window.ReturnsForm.renderSummary();
    }

    // ---------------- Barcode scan-to-add ----------------
    function scan(target) {
        if (!window.Web2BarcodeScanner) {
            toast('Chưa có module quét mã', 'warning');
            return;
        }
        window.Web2BarcodeScanner.open({
            title: 'Quét mã SP thu về',
            onScan: async (code) => {
                try {
                    const list = await _searchProducts(code);
                    const hit =
                        list.find((p) => p.productCode.toLowerCase() === code.toLowerCase()) ||
                        list[0];
                    if (!hit) {
                        toast('Không thấy SP: ' + code, 'warning');
                        return;
                    }
                    if (target === 'repl') addReplacement(hit);
                    else addManualItem(hit);
                    toast('Đã thêm ' + hit.productCode, 'success');
                } catch (err) {
                    toast('Lỗi quét: ' + err.message, 'error');
                }
            },
        });
    }

    // ---------------- Payload extras (form.submit dùng) ----------------
    function payloadExtras() {
        const s = currentScn();
        const extra = {
            disposition: STATE.disposition,
            refundMethod: s.showRefundMethod ? STATE.refundMethod : 'vi',
            customerBear: s.showRefundMethod ? STATE.customerBear || 0 : 0,
            returnShippingFee: s.showShipFee ? STATE.shipFee || 0 : 0,
            feeBearer: s.showShipFee ? STATE.feeBearer || null : null,
        };
        if (s.isExchange) {
            extra.isExchange = true;
            extra.replacementItems = STATE.replacements.map((l) => ({
                productCode: l.productCode,
                productName: l.productName,
                quantity: l.qty,
                price: l.price,
            }));
        }
        return extra;
    }

    window.ReturnsScenario = {
        currentScn,
        renderGrid,
        selectScenario,
        applyUI,
        onDispoChange,
        onRefundChange,
        renderRefundHint,
        onShipFeeInput,
        onCustomerBearInput,
        onFeeBearerChange,
        onReplSearch,
        setReplQty,
        removeRepl,
        renderReplList,
        renderReplDiff,
        onOrphanSearch,
        setManualQty,
        removeManual,
        renderManualItems,
        scan,
        payloadExtras,
    };
})();
