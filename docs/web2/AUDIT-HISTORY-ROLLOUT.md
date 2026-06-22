# Web 2.0 — Per-record History Rollout Tracker

> Module per-record: `Web2AuditLog.openRecord({entityId, entity?, title})` (auto-load qua sidebar).
> Aggregate: trang `web2/audit-log` + tab "Lịch sử thao tác" của `web2/kpi` (`Web2AuditLog.mount`).
> Backend event-sink: `recordAuditEvent(pool, {entity, entityId, action, userId, userName, sourcePage, changes})` (`services/web2-audit-sink.js`) → bảng `web2_audit_events` → audit union đọc.
> ✅ XONG | ⬜ chưa | — không cần
> Cập nhật 2026-06-22 (sau Wave 1+2).

## Kiến trúc nguồn lịch sử (3 lớp)

1. **Bảng history canonical** (đã có, union đọc trực tiếp): `web2_product_history` (entity=product), `fast_sale_order_history` (pbh), `pbh_fulfillment_logs` (reconcile), `web2_wallet_adjustments` (wallet). Trang products/PBH render modal RIÊNG đọc các bảng này (tùy biến đẹp hơn) → giữ nguyên.
2. **Embedded `history` JSONB** render bởi shared `Web2HistoryTimeline`: customers (edit modal), purchase-refund (detail panel). Per-record sẵn.
3. **Event-sink `web2_audit_events`** (mới 2026-06-22): mọi mutation nghiệp vụ còn lại → 1 bảng → union đọc → aggregate "toàn bộ" + `openRecord` per-record.

## Frontend per-record history — trạng thái

| Trang                           | entity          | Cách                            | Status   |
| ------------------------------- | --------------- | ------------------------------- | -------- |
| native-orders                   | native-order    | 🕘 mỗi đơn                      | ✅       |
| so-order                        | so-order        | nút "Lịch sử" toolbar           | ✅       |
| products                        | product         | modal riêng (canonical)         | ✅ (sẵn) |
| product-category, delivery-zone | (slug)          | 🕘 page-builder row             | ✅       |
| fastsaleorder-invoice (PBH)     | pbh             | modal riêng (canonical)         | ✅ (sẵn) |
| customers                       | customer        | 🕘 row + inline timeline        | ✅       |
| purchase-refund                 | purchase-refund | inline timeline (detail)        | ✅ (sẵn) |
| returns                         | return          | 🕘 row → openRecord             | ✅       |
| reconcile                       | (pbh+reconcile) | nút "Toàn bộ thao tác" (gộp)    | ✅       |
| kpi (assignments)               | kpi-assignment  | section history + tab aggregate | ✅ (sẵn) |

## Backend event-sink wiring — trạng thái

| Route                              | entity              | actions                                                                   | Status                     |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------- | -------------------------- |
| web2-generic / dedicated-entity    | (slug)              | create/update/delete                                                      | ✅                         |
| native-orders                      | native-order        | 5 mutation                                                                | ✅                         |
| web2-so-order                      | so-order            | save                                                                      | ✅                         |
| web2-products                      | product             | (canonical table)                                                         | ✅                         |
| web2-variants                      | variant             | create/update/delete                                                      | ✅                         |
| web2-users                         | web2-user           | create/update/perms/password/deactivate                                   | ✅                         |
| purchase-refund                    | purchase-refund     | approve/quick-refund/cancel/refunded/reject                               | ✅                         |
| v2/web2-customers                  | customer            | create/update/archive/delete/merge                                        | ✅                         |
| web2-payment-signals               | payment-signal      | confirm/dismiss/link/approve                                              | ✅                         |
| web2-returns                       | return              | 3 mutation                                                                | ✅                         |
| v2/kpi                             | kpi-assignment      | employee-ranges                                                           | ✅                         |
| **web2-supplier-wallet**           | supplier-wallet     | tx/upsert-supplier/import/delete-supplier                                 | ✅ (Wave 2, verified prod) |
| **refunds**                        | refund              | approve/complete/cancel/delete                                            | ✅ (Wave 2)                |
| **v2/web2-balance-history**        | balance-transaction | manual-deposit/link/reassign/resolve-pending                              | ✅ (Wave 2)                |
| **delivery-invoices**              | delivery-invoice    | create/ship/deliver/return/cancel/update/delete                           | ✅ (Wave 2)                |
| **web2-fb-posts**                  | fb-post             | create/update/schedule/publish/delete                                     | ✅ (Wave 2)                |
| **web2-jt-tracking**               | jt-tracking         | add/approve/update/delete                                                 | ✅ (Wave 2)                |
| **web2-order-tags**                | order-tag           | create/update/delete                                                      | ✅ (Wave 2)                |
| **web2-campaign-products**         | campaign            | add-products/remove-product/set-pending                                   | ✅ (Wave 2)                |
| v2/web2-customer-wallet            | —                   | KHÔNG wire (chỉ /qr — không đổi số dư; deposit qua SePay webhook tự động) | —                          |
| web2-live-comments (poller-config) | —                   | bỏ qua (config poller, không phải thao tác record)                        | —                          |

## Admin

- `DELETE /api/web2/audit-log/purge?entity=&entityId=` (requireWeb2Admin) — dọn audit theo entity HOẶC entityId (per-record). Cần ≥1 tham số (chống wipe toàn bộ).

## Wave 3 (đề xuất tiếp) — thêm nút 🕘 FE cho các trang đã wire sink ở Wave 2

Data đã chảy vào sink, chỉ cần nút mở `openRecord` per-record:

- ⬜ supplier-wallet (card NCC → 🕘, entity=supplier-wallet, id=tên NCC)
- ⬜ supplier-debt (ledger NCC → 🕘, id=tên NCC)
- ⬜ fastsaleorder-refund (bảng phiếu → 🕘, entity=refund, id=number)
- ⬜ fastsaleorder-delivery (phiếu giao → 🕘, entity=delivery-invoice, id=number)
- ⬜ jt-tracking (dòng vận đơn → 🕘, entity=jt-tracking, id=billcode)
- ⬜ fb-posts (draft/scheduled → 🕘, entity=fb-post, id=post id)
- ⬜ balance-history (giao dịch → 🕘, entity=balance-transaction, id=row.id)
- ⬜ order-tags (card thẻ → 🕘, entity=order-tag, id=code)
- ⬜ users (dòng user → 🕘, entity=web2-user, id=u.id)
- ⬜ live-control (header chiến dịch → 🕘, entity=campaign, id=campaignId)

## Không cần (tool/dashboard/report/config thuần)

payment-confirm, ck-dashboard, notifications, pancake-settings, zalo, users-permissions, dashboard, overview, report-delivery, report-revenue, system, services-dashboard, admin-sse-monitor, multi-tool, live-tv, fb-ads-stats, fb-insights, photo-editor, photo-studio, product-card, product-counter, video-beauty, video-maker, login, printer-settings.
