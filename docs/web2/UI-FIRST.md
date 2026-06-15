# UI-First Pattern cho Web 2.0

> **BẮT BUỘC** đọc trước khi code mutation handler trên Web 2.0.

## Why

User feedback (2026-06-01): "thao tác trên Web 2.0 cứ cập nhật UI trước đi, các thao tác chạy background → lỗi thì back lại thông báo user biết → tăng tương tác user".

Lý do: `await fetch(...)` chờ 200-500ms trước khi UI update → user cảm giác lag dù backend đã chấp nhận.

## Helper: `Web2Optimistic.run(opts)`

File: [`web2/shared/web2-optimistic.js`](../../web2/shared/web2-optimistic.js).

```js
Web2Optimistic.run({
    // Optional — return state cũ để rollback nếu lỗi
    snapshot: () => structuredClone(STATE.foo),

    // BẮT BUỘC — apply optimistic UI sync (badge, toast, row, modal close, ...)
    apply: () => {
        STATE.foo = 'newValue';
        renderRow();
    },

    // BẮT BUỘC — backend op. Throw nếu fail (response.success===false, HTTP !ok, …)
    run: async () => {
        const r = await fetch('/api/...', { method: 'PATCH', body: JSON.stringify({...}) });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
    },

    // Optional — sync silent với data authoritative từ response (vd qty thực, server-side calc, …)
    onSuccess: (d) => {
        if (d.product) Object.assign(STATE.foo, d.product);
        renderRow();
    },

    // Optional nhưng RECOMMENDED — restore state cũ khi backend lỗi
    rollback: (prev) => {
        STATE.foo = prev;
        renderRow();
    },

    // Optional — toast NGAY khi apply (qua notificationManager)
    successMsg: 'Đã lưu',

    // Optional nhưng RECOMMENDED — phần tả lỗi → "✗ Lỗi <errLabel>: <msg>"
    errLabel: 'lưu đơn ABC',
});
```

**Returns**: `undefined` (NOT a Promise) — caller KHÔNG cần `await`. Backend chạy fire-and-forget. Errors handled internally.

## Defensive Fallback Pattern

Mọi handler MỚI/REFACTORED nên có fallback nếu helper chưa load:

```js
function someOp(...args) {
    const prev = snapshotState();
    if (window.Web2Optimistic?.run) {
        Web2Optimistic.run({
            snapshot: () => prev,
            apply: () => {
                /* sync UI */
            },
            run: async () => {
                /* fetch + throw */
            },
            onSuccess: (d) => {
                /* sync silent */
            },
            rollback: (p) => {
                /* restore */
            },
            successMsg: '✓ Done',
            errLabel: 'làm X',
        });
    } else {
        // Legacy fallback — keep old async/await behavior
        (async () => {
            try {
                const d = await fetch(/* ... */);
                /* render */
            } catch (e) {
                notify('Lỗi: ' + e.message, 'error');
            }
        })();
    }
}
```

## Khi nào KHÔNG dùng optimistic

⚠ **Giữ `await + loading state`** cho:

1. **Money ops** (wallet, deposit, debt, refund tiền) — rollback gây confuse khi liên quan tiền. User cần thấy confirm thật sự rồi mới UI đổi.
2. **DELETE với 409 force-confirm** — flow phức tạp (server có thể yêu cầu force=true vì pending qty), confirm dialog mid-flow.
3. **Modal save với strict server-side validation** — nếu backend reject vì validation phức tạp (vd cross-entity uniqueness), rollback modal-close gây UX kỳ.
4. **Critical destructive ops** (xóa data có cascading effects) — user kỳ vọng feedback rõ ràng.
5. **Operations cần lock UI để tránh double-submit** — vd "tạo PBH" có side effects đắt.

## Pages đã load helper

### Bán Hàng

- `web2/fastsaleorder-invoice/` (Bán hàng HĐ)
- `web2/fastsaleorder-refund/` (Trả hàng)
- `web2/fastsaleorder-delivery/` (Phiếu giao hàng)
- `web2/reconcile/` (Đối soát đóng gói)

### Sale Online

- `web2/live-campaign/` (Chiến dịch Live)
- `native-orders/` (Đơn Web)
- `so-order/` (Sổ Order)
- `tpos-pancake/` (TPOS × Pancake)

### Mua hàng

- `web2/purchase-refund/` (Trả hàng NCC)
- `web2/supplier-debt/` (Công nợ NCC) — money, dùng cẩn thận
- `web2/supplier-wallet/` (Ví NCC) — money, dùng cẩn thận

### Tài chính

- `web2/balance-history/` — money

### Khách hàng

- `web2/partner-customer/` (Khách hàng)
- `web2/customer-wallet/` (Ví KH) — money

### Sản phẩm

- `web2/products/` (Kho SP)
- `web2/variants/` (Kho Biến Thể)
- `web2/product-category/`

### Báo cáo

- `web2/report-delivery/`
- `web2/report-revenue/`

### Cấu hình

- `web2/users/`
- `web2/users-permissions/`
- `web2/pancake-settings/`

### Tính năng mới

- `web2/dashboard/`, `web2/kpi/`, `web2/notifications/`, `web2/audit-log/`
- `web2/supplier-aging/`, `web2/supplier-360/`, `web2/inventory-forecast/`
- `web2/bulk-import/`, `web2/print-export/`, `web2/smart-match/`
- `web2/admin-sse-monitor/`, `web2/services-dashboard/`, `web2/overview/`

### Page-builder pages (87 TPOS-clone)

Auto-có qua `web2/shared/page-builder.js` (`Web2Page`) preload. (File `page-shell.js`/`Web2Shell` cũ đã bị xoá 2026-06-13 — dead code, 0 trang dùng; page-builder thay thế hoàn toàn.)

**Generic CRUD (2026-06-15)**: `removeRecord` (xoá) của Web2Page nay **UI-first** — sau confirm row biến mất ngay + rollback nếu lỗi. `saveModal` (create/update) GIỮ await + double-submit guard (đúng pattern "tạo/nặng thì chờ"). Mọi Web2Page page tự hưởng, không cần wrap thủ công.

## Pages CHƯA có helper (cần thêm khi refactor)

Nếu page tự build (không qua page-builder) và chưa có `<script src=".../web2-optimistic.js">` — thêm vào trước script app chính:

```html
<script src="../shared/web2-optimistic.js?v=20260601a"></script>
<script src="../shared/tpos-sidebar.js?v=..."></script>
```

Page legacy đặc biệt (KHÔNG ở web2/\* mà ở root: native-orders, so-order, tpos-pancake, orders-report, …):

```html
<script src="../web2/shared/web2-optimistic.js?v=20260601a"></script>
```

## Handlers đã refactor (reference implementations)

| Page                   | Function                                      | File                                               |
| ---------------------- | --------------------------------------------- | -------------------------------------------------- |
| tpos-pancake           | `addToCart` / `removeFromCart` / `clearOrder` | `tpos-pancake/js/pancake/inventory-panel.js`       |
| native-orders          | `saveEdit` / `quickStatus`                    | `native-orders/js/native-orders-app.js`            |
| products               | `toggleActive`                                | `web2/products/js/web2-products-app.js`            |
| variants               | `toggleActive`                                | `web2/variants/js/web2-variants-app.js`            |
| partner-customer       | `changeStatus`                                | `web2/partner-customer/js/partner-customer-app.js` |
| users                  | `deactivateUser`                              | `web2/users/js/users-app.js`                       |
| fastsaleorder-invoice  | `confirmOrder` / `cancelOrder`                | `web2/fastsaleorder-invoice/pbh-app.js`            |
| fastsaleorder-delivery | `changeState`                                 | `web2/fastsaleorder-delivery/dlv-app.js`           |
| fastsaleorder-refund   | `changeState`                                 | `web2/fastsaleorder-refund/rf-app.js`              |
| notifications          | row click + mark-all                          | `web2/notifications/index.html`                    |

## Verify (test tay)

1. Mở DevTools → Network → throttle "Slow 3G" để giả lập backend chậm
2. Click button → quan sát:
    - ✅ UI update NGAY trước khi network call xong
    - ✅ Toast success NGAY
    - ✅ Backend response về → no UI change (đã apply optimistic)
3. Network → Block request URL → click lại:
    - ✅ UI vẫn update NGAY
    - ✅ Backend fail → rollback restore state cũ
    - ✅ Error toast hiện ra
