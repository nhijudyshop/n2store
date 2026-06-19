// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — delivery method detect/badge/menu + setDeliveryMethod. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // ============================================================
    // Phương thức giao hàng — auto-detect (offline) + lưu lại + chỉnh tay
    // Hiện badge ở cột Địa chỉ; click để đổi tay; đổi địa chỉ → tự nhận lại
    // (trừ khi đã chỉnh tay). value/label lưu vào native_orders qua PATCH.
    // ============================================================
    NO._deliveryOptsCache = null;

    NO._deliveryOpts = function _deliveryOpts() {
        const DMP = window.DeliveryMethodPicker;
        if (!DMP) return [];
        if (NO._deliveryOptsCache) return NO._deliveryOptsCache;
        // OPTIONS hardcoded sẵn (đồng bộ với dropdown tạo PBH). Nạp async để
        // đồng bộ option backend nếu admin có override.
        NO._deliveryOptsCache = DMP.OPTIONS || [];
        if (DMP.getOptionsAsync) {
            DMP.getOptionsAsync()
                .then((opts) => {
                    if (Array.isArray(opts) && opts.length) NO._deliveryOptsCache = opts;
                })
                .catch(() => {});
        }
        return NO._deliveryOptsCache;
    };

    // Nhận diện offline (sync) — { value, label, short, confidence, note } | null
    NO._detectDelivery = function _detectDelivery(address) {
        const DMP = window.DeliveryMethodPicker;
        if (!DMP || !DMP.pickOffline) return null;
        const r = DMP.pickOffline(address || '', NO._deliveryOpts());
        if (!r || !r.option) return null;
        return {
            value: r.option.value,
            label: r.option.label,
            short: r.option.short || r.option.label,
            confidence: r.confidence,
            note: r.note || '',
        };
    };

    NO._deliveryShort = function _deliveryShort(value, label) {
        const opt = NO._deliveryOpts().find((o) => o.value === value);
        return (opt && (opt.short || opt.label)) || label || value || '';
    };

    // Codes đã chốt giá trị (đã lưu/đã chọn) — không lazy-persist nữa.
    NO._deliveryPersisted = new Set();

    // Build badge HTML cho cột địa chỉ. Ưu tiên giá trị đã lưu; nếu chưa có →
    // detect offline để HIỂN THỊ (không tự PATCH, tránh SSE storm cross-tab —
    // chỉ lưu khi user chọn tay hoặc đổi địa chỉ). Click badge → menu đổi tay.
    NO._deliveryBadgeHtml = function _deliveryBadgeHtml(o) {
        if (!window.DeliveryMethodPicker) return '';
        let value = o.deliveryMethod || null;
        let label = o.deliveryMethodLabel || null;
        const manual = o.deliveryMethodManual === true;
        let cls = 'is-saved';
        let title = 'Phương thức giao hàng đã lưu — bấm để đổi';
        if (!value) {
            const det = NO._detectDelivery(o.address || '');
            if (det) {
                value = det.value;
                label = det.label;
                cls = det.confidence === 'high' ? 'is-auto-ok' : 'is-auto-low';
                title = 'Tự nhận diện: ' + (det.note || det.label) + ' — bấm để đổi tay (sẽ lưu)';
            }
        } else if (manual) {
            cls = 'is-manual';
            title = 'Đã chọn tay — bấm để đổi';
        }
        if (!value) return '';
        const short = NO.escapeHtml(NO._deliveryShort(value, label));
        const icon = manual ? 'hand' : 'truck';
        return `<span class="no-delivery-badge ${cls}" title="${NO.escapeHtml(title)}"
            onclick="event.stopPropagation();NativeOrdersApp.openDeliveryMenu('${NO.escapeHtml(o.code)}', this)">
            <i data-lucide="${icon}" style="width:10px;height:10px;"></i>${short}${manual ? ' ✎' : ''}
        </span>`;
    };

    // ── Phương thức giao hàng: menu chọn tay ──────────────────────────
    // Mở popover ngay cạnh badge với danh sách option. Chọn → setDeliveryMethod.
    NO._deliveryMenuEl = null;

    NO._closeDeliveryMenu = function _closeDeliveryMenu() {
        if (NO._deliveryMenuEl) {
            NO._deliveryMenuEl.remove();
            NO._deliveryMenuEl = null;
            document.removeEventListener('click', NO._closeDeliveryMenu, true);
        }
    };

    NO.openDeliveryMenu = function openDeliveryMenu(code, anchorEl) {
        NO._closeDeliveryMenu();
        const order = NO.STATE.orders.find((x) => x.code === code);
        if (!order) return;
        const opts = NO._deliveryOpts();
        if (!opts.length) return;
        const cur = order.deliveryMethod || NO._detectDelivery(order.address || '')?.value || '';
        const menu = document.createElement('div');
        menu.className = 'no-delivery-menu';
        menu.innerHTML =
            `<div class="no-delivery-menu-head">Phương thức giao hàng</div>` +
            opts
                .map(
                    (o) =>
                        `<button type="button" class="no-delivery-menu-item${o.value === cur ? ' is-current' : ''}"
                        onclick="event.stopPropagation();NativeOrdersApp.setDeliveryMethod('${NO.escapeHtml(code)}','${NO.escapeHtml(o.value)}')">
                        ${NO.escapeHtml(o.short || o.label)}${o.value === cur ? ' ✓' : ''}
                    </button>`
                )
                .join('') +
            `<button type="button" class="no-delivery-menu-item no-delivery-menu-redetect"
                onclick="event.stopPropagation();NativeOrdersApp.setDeliveryMethod('${NO.escapeHtml(code)}','__auto__')">
                ↻ Tự nhận lại theo địa chỉ</button>`;
        document.body.appendChild(menu);
        const rect = anchorEl.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
        menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 240)}px`;
        NO._deliveryMenuEl = menu;
        // Đóng khi click ngoài (capture, ở tick sau để né click hiện tại)
        setTimeout(() => document.addEventListener('click', NO._closeDeliveryMenu, true), 0);
    };

    // Chọn tay (manual=true) hoặc '__auto__' để re-detect offline (manual=false).
    NO.setDeliveryMethod = function setDeliveryMethod(code, value) {
        NO._closeDeliveryMenu();
        const order = NO.STATE.orders.find((x) => x.code === code);
        if (!order) return;
        const isAuto = value === '__auto__';
        let nextVal, nextLabel, nextManual;
        if (isAuto) {
            const det = NO._detectDelivery(order.address || '');
            if (!det) {
                NO.notify('Không nhận diện được khu vực từ địa chỉ', 'warning');
                return;
            }
            nextVal = det.value;
            nextLabel = det.label;
            nextManual = false;
        } else {
            const opt = NO._deliveryOpts().find((o) => o.value === value);
            if (!opt) return;
            nextVal = opt.value;
            nextLabel = opt.label;
            nextManual = true;
        }
        const prev = {
            deliveryMethod: order.deliveryMethod,
            deliveryMethodLabel: order.deliveryMethodLabel,
            deliveryMethodManual: order.deliveryMethodManual,
        };
        const apply = () => {
            order.deliveryMethod = nextVal;
            order.deliveryMethodLabel = nextLabel;
            order.deliveryMethodManual = nextManual;
            NO._deliveryPersisted.add(code); // đã có giá trị → không lazy-persist nữa
            NO.renderRows();
        };
        const payload = {
            deliveryMethod: nextVal,
            deliveryMethodLabel: nextLabel,
            deliveryMethodManual: nextManual,
        };
        const successMsg = isAuto
            ? 'Đã tự nhận lại phương thức'
            : `Đã chọn ${NO._deliveryShort(nextVal, nextLabel)}`;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => prev,
                apply,
                run: async () => window.NativeOrdersApi.update(code, payload),
                onSuccess: (resp) => {
                    if (resp?.order) {
                        const idx = NO.STATE.orders.findIndex((x) => x.code === code);
                        if (idx !== -1) NO.STATE.orders[idx] = resp.order;
                        NO.renderRows();
                    }
                },
                rollback: (p) => {
                    order.deliveryMethod = p.deliveryMethod;
                    order.deliveryMethodLabel = p.deliveryMethodLabel;
                    order.deliveryMethodManual = p.deliveryMethodManual;
                    NO.renderRows();
                },
                successMsg,
                errLabel: `lưu phương thức giao ${code}`,
            });
        } else {
            apply();
            window.NativeOrdersApi.update(code, payload)
                .then(() => NO.notify(successMsg, 'success'))
                .catch((e) => NO.notify('Lỗi: ' + e.message, 'error'));
        }
    };
})();
