<!-- AUTO-GENERATED bởi scripts/gen-web2-codemap.js — KHÔNG SỬA TAY. Regenerate: node scripts/gen-web2-codemap.js -->

# WEB2-CODEMAP — Bản đồ code Web 2.0

> **Auto-generated** • 2026-06-18 15:24 • 177 files, 75 shared modules, 2546 hàm, 28 file > 800 dòng.
> Sinh lại: `node scripts/gen-web2-codemap.js` (chạy sau khi đổi cấu trúc/ tách module / thêm trang).

## 0. Cách dùng (Claude / dev đọc TRƯỚC khi code)

1. **Cần 1 capability** (chat KH, sinh QR, popup/confirm, quét barcode, đếm SP, ví, SSE realtime, NCC, kho KH…) → tra **§1 Shared Modules TRƯỚC**. Có sẵn → tái dùng, **KHÔNG viết lại**.
2. **Cần biết 1 trang làm gì / có hàm gì / tìm ở đâu** → **§3 Pages** (mỗi file: mục đích + globals + shared đang dùng + danh sách hàm).
3. **Viết hàm mới mà thấy tên đã có ≥2 nơi** → **§4 Hàm trùng** → cân nhắc rút vào `web2/shared/` (1 nguồn dùng chung).
4. **File > 800 dòng** → **§5** (nợ kỹ thuật, cần tách module).

> Quy tắc gốc (CLAUDE.md): Web 2.0 tách **nhiều module nhỏ** (200-400 dòng, max 800); cái gì ≥2 nơi cần → **shared 1 nguồn**, trang chỉ điều phối.

## 1. Shared Modules Registry — `web2/shared/` (NGUỒN DÙNG CHUNG)

| Module (global)                            | File                                                                                  | Mục đích                                                                                                | Consumers |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| `Web2ChatEmoji`                            | [web2-chat-emoji-data.js](../../web2/shared/chat-panel/web2-chat-emoji-data.js)       | WEB2.0 — emoji dataset + recent helper cho Web2ChatPanel (tách từ pancake-chat-window).                 | 1         |
| `Web2ChatEntityDetect`                     | [web2-chat-entity-detect.js](../../web2/shared/chat-panel/web2-chat-entity-detect.js) | WEB2.0 — nhận diện SĐT + địa chỉ trong tin nhắn chat (Feature 3).                                       | 1         |
| `Web2ChatPanel`                            | [web2-chat-panel.js](../../web2/shared/chat-panel/web2-chat-panel.js)                 | WEB2.0 — component chat HỢP NHẤT (Web2ChatPanel) dùng chung native-orders/web2-pancake/balance-history. | 7         |
| `Web2ChatStickers`                         | [web2-chat-sticker-data.js](../../web2/shared/chat-panel/web2-chat-sticker-data.js)   | WEB2.0 — bộ sticker built-in cho Web2ChatPanel (Feature 2 sticker-send).                                | 1         |
| `DeliveryMethodPicker`                     | [delivery-method-picker.js](../../web2/shared/delivery-method-picker.js)              | Web 2.0 — Delivery method picker (Vietnam-aware)                                                        | 2         |
| `Web2Page`                                 | [page-builder.js](../../web2/shared/page-builder.js)                                  | Web 2.0 generic CRUD page builder — same look as WEB2 list views.                                       | 0         |
| `Popup`                                    | [popup.js](../../web2/shared/popup.js)                                                | Web 2.0 — Custom Popup (alert / confirm / prompt)                                                       | 34        |
| `Web2ApiFetch`                             | [web2-api-fetch.js](../../web2/shared/web2-api-fetch.js)                              | WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.                                  | 1         |
| `Web2Api`                                  | [web2-api.js](../../web2/shared/web2-api.js)                                          | Web 2.0 generic API client — talks to /api/web2/:entity/\*                                              | 1         |
| `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`    | [web2-auth.js](../../web2/shared/web2-auth.js)                                        | Token storage + verify + page guard.                                                                    | 80        |
| `Web2BarcodeScanner`                       | [web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js)                  | WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.               | 4         |
| `Web2Bill`                                 | [web2-bill-service.js](../../web2/shared/web2-bill-service.js)                        | WEB2.0 module.                                                                                          | 2         |
| `Web2Chat`                                 | [web2-chat-client.js](../../web2/shared/web2-chat-client.js)                          | Web 2.0 — Chat client (Pancake + Extension)                                                             | 20        |
| `Web2CkAssignPicker`                       | [web2-ck-assign-picker.js](../../web2/shared/web2-ck-assign-picker.js)                | WEB2.0 — picker gán giao dịch CK (balance-history) cho đơn chưa nhận CK.                                | 1         |
| `Web2CkReview`                             | [web2-ck-review.js](../../web2/shared/web2-ck-review.js)                              | WEB2.0 module — đối chiếu & duyệt tín hiệu CK (dùng chung 3 trang).                                     | 2         |
| `Web2CommandPalette`                       | [web2-command-palette.js](../../web2/shared/web2-command-palette.js)                  | WEB2.0 shared — Command Palette (Ctrl/Cmd+K) toàn cục.                                                  | 1         |
| `Web2CustomerChat`                         | [web2-customer-chat.js](../../web2/shared/web2-customer-chat.js)                      | WEB2.0 — Web2CustomerChat: launcher chat KH (Pancake + Zalo) dùng chung mọi trang.                      | 5         |
| `Web2CustomerDetailModal`                  | [web2-customer-detail-modal.js](../../web2/shared/web2-customer-detail-modal.js)      | WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/\*.                  | 3         |
| `PartnerCustomerApi`, `Web2CustomerLookup` | [web2-customer-lookup.js](../../web2/shared/web2-customer-lookup.js)                  | WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.                                                   | 5         |
| `Web2CustomerStore`                        | [web2-customer-store.js](../../web2/shared/web2-customer-store.js)                    | WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.                                                 | 6         |
| `Web2DbBadge`                              | [web2-db-badge.js](../../web2/shared/web2-db-badge.js)                                | Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"                                   | 0         |
| `Web2Deeplink`                             | [web2-deeplink.js](../../web2/shared/web2-deeplink.js)                                | WEB2.0 module.                                                                                          | 4         |
| `Web2Effects`                              | [web2-effects.js](../../web2/shared/web2-effects.js)                                  | Web 2.0 — Effects / animations library                                                                  | 3         |
| `Web2Escape`                               | [web2-escape.js](../../web2/shared/web2-escape.js)                                    | WEB2.0 module.                                                                                          | 1         |
| `Web2Export`                               | [web2-export-helpers.js](../../web2/shared/web2-export-helpers.js)                    | WEB2.0 module.                                                                                          | 0         |
| `Web2Ext`                                  | [web2-extension-bridge.js](../../web2/shared/web2-extension-bridge.js)                | WEB2 EXTENSION BRIDGE                                                                                   | 2         |
| `Web2Format`                               | [web2-format.js](../../web2/shared/web2-format.js)                                    | WEB2.0 shared — 1 NGUỒN format tiền/ngày/giờ (GMT+7) cho Web 2.0.                                       | 1         |
| `Web2HistoryTimeline`                      | [web2-history-timeline.js](../../web2/shared/web2-history-timeline.js)                | Web2HistoryTimeline — render lịch sử chỉnh sửa kèm tên user                                             | 6         |
| `Web2IdbStore`                             | [web2-idb-store.js](../../web2/shared/web2-idb-store.js)                              | Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.                                   | 3         |
| `Web2Import`                               | [web2-import.js](../../web2/shared/web2-import.js)                                    | WEB2.0 module.                                                                                          | 2         |
| `Web2LabelOcr`                             | [web2-label-ocr.js](../../web2/shared/web2-label-ocr.js)                              | WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.    | 3         |
| `Web2Lottie`                               | [web2-lottie.js](../../web2/shared/web2-lottie.js)                                    | WEB2.0 module.                                                                                          | 6         |
| `Web2Motion`                               | [web2-motion.js](../../web2/shared/web2-motion.js)                                    | WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.                                 | 0         |
| `Web2MsgTemplate`                          | [web2-msg-template.js](../../web2/shared/web2-msg-template.js)                        | Web 2.0 — Bulk Message Template Modal                                                                   | 1         |
| `Web2NewMsgBadge`                          | [web2-new-msg-badge.js](../../web2/shared/web2-new-msg-badge.js)                      | Web 2.0 — New-message badge for native-orders rows                                                      | 1         |
| `Web2NotificationBell`                     | [web2-notification-bell.js](../../web2/shared/web2-notification-bell.js)              |                                                                                                         | 0         |
| `Web2Notify`                               | [web2-notify.js](../../web2/shared/web2-notify.js)                                    | WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.                                                       | 1         |
| `Web2Optimistic`                           | [web2-optimistic.js](../../web2/shared/web2-optimistic.js)                            | Codifies pattern: snapshot → apply optimistic UI → fire backend background →                            | 19        |
| `Web2PackCounter`                          | [web2-pack-counter.js](../../web2/shared/web2-pack-counter.js)                        | WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.               | 0         |
| `Web2PancakeAccounts`                      | [web2-pancake-accounts.js](../../web2/shared/web2-pancake-accounts.js)                | Web 2.0 — Pancake ACCOUNTS manager (DB-backed)                                                          | 2         |
| `Web2PancakeToken`                         | [web2-pancake-token.js](../../web2/shared/web2-pancake-token.js)                      | Web 2.0 — Pancake JWT token monitor + auto-refresh                                                      | 1         |
| `Web2PhoneUtils`                           | [web2-phone-utils.js](../../web2/shared/web2-phone-utils.js)                          | WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.                                                   | 1         |
| `Web2Printer`                              | [web2-printer.js](../../web2/shared/web2-printer.js)                                  | WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.             | 3         |
| `Web2ProductCode`                          | [web2-product-code.js](../../web2/shared/web2-product-code.js)                        | WEB2.0 module.                                                                                          | 3         |
| `Web2ProductCounter`                       | [web2-product-counter.js](../../web2/shared/web2-product-counter.js)                  | WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.                       | 3         |
| `Web2ProductsCache`                        | [web2-products-cache.js](../../web2/shared/web2-products-cache.js)                    | Web2 Products — Shared cache + Firestore tickler realtime                                               | 4         |
| `Web2QrModal`                              | [web2-qr-modal.js](../../web2/shared/web2-qr-modal.js)                                | WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.                     | 1         |
| `Web2QR`                                   | [web2-qr.js](../../web2/shared/web2-qr.js)                                            | WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.                                 | 2         |
| `Web2QuickReply`                           | [web2-quick-reply.js](../../web2/shared/web2-quick-reply.js)                          | Web 2.0 — Quick Reply system                                                                            | 2         |
| `Web2Realtime`                             | [web2-realtime.js](../../web2/shared/web2-realtime.js)                                | Web 2.0 — Realtime client (Pancake WS)                                                                  | 3         |
| `NativeReturnBill`                         | [web2-return-bill.js](../../web2/shared/web2-return-bill.js)                          | WEB2.0 module.                                                                                          | 1         |
| `Web2Sidebar`                              | [web2-sidebar.js](../../web2/shared/web2-sidebar.js)                                  | WEB2-clone sidebar for Web 2.0 pages.                                                                   | 8         |
| `Web2SoOrder`                              | [web2-so-order-reader.js](../../web2/shared/web2-so-order-reader.js)                  | WEB2.0 module.                                                                                          | 4         |
| `Web2SSE`                                  | [web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js)                            | WEB2.0 module.                                                                                          | 46        |
| `Web2SSETopics`                            | [web2-sse-topics.js](../../web2/shared/web2-sse-topics.js)                            | WEB2.0 module.                                                                                          | 0         |
| `Web2SuppliersCache`                       | [web2-suppliers-cache.js](../../web2/shared/web2-suppliers-cache.js)                  | WEB2.0 module.                                                                                          | 6         |
| `Web2TextUtils`                            | [web2-text-utils.js](../../web2/shared/web2-text-utils.js)                            | WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.                                 | 1         |
| `Web2UnreadPanel`                          | [web2-unread-panel.js](../../web2/shared/web2-unread-panel.js)                        | WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).                | 1         |
| `Web2UserInfo`                             | [web2-user-info.js](../../web2/shared/web2-user-info.js)                              | WEB2.0 module.                                                                                          | 21        |
| `Web2VariantMulti`                         | [web2-variant-multi.js](../../web2/shared/web2-variant-multi.js)                      | WEB2.0 module.                                                                                          | 2         |
| `Web2VariantsCache`                        | [web2-variants-cache.js](../../web2/shared/web2-variants-cache.js)                    | Web2 Variants — Shared cache + Firestore tickler realtime                                               | 4         |
| `Web2WalletApi`                            | [web2-wallet-api.js](../../web2/shared/web2-wallet-api.js)                            | WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).                                           | 2         |
| `Web2WalletBalance`                        | [web2-wallet-balance.js](../../web2/shared/web2-wallet-balance.js)                    | WEB2.0 — shared helper hiển thị số dư ví KH.                                                            | 15        |
| `ZaloApi`                                  | [web2-zalo-api.js](../../web2/shared/web2-zalo-api.js)                                | WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).                                                       | 6         |
| `Web2Zalo`                                 | [web2-zalo.js](../../web2/shared/web2-zalo.js)                                        | WEB2.0 shared — Web2Zalo helper (single-source Zalo).                                                   | 4         |
| `WZChat`                                   | [bubbles.js](../../web2/shared/zalo-chat/bubbles.js)                                  | WEB2.0 module — Zalo chat message renderer.                                                             | 11        |
| `WZChat`                                   | [chat-actions.js](../../web2/shared/zalo-chat/chat-actions.js)                        | WEB2.0 module — Zalo chat actions (network + optimistic).                                               | 11        |
| `WZChat`                                   | [chat-store.js](../../web2/shared/zalo-chat/chat-store.js)                            | WEB2.0 module — Zalo chat shared store + utils (WZChat.\*).                                             | 11        |
| `WZChat`                                   | [chat-view.js](../../web2/shared/zalo-chat/chat-view.js)                              | WEB2.0 shared — Zalo chat VIEW (mount 1 hội thoại vào bất kỳ container).                                | 11        |
| `WZChat`                                   | [composer.js](../../web2/shared/zalo-chat/composer.js)                                | WEB2.0 module — Zalo chat composer (input đầy đủ).                                                      | 11        |
| `WZChat`                                   | [emoji-picker.js](../../web2/shared/zalo-chat/emoji-picker.js)                        | WEB2.0 module — Zalo chat emoji picker (client-only).                                                   | 11        |
| `WZChat`                                   | [lightbox.js](../../web2/shared/zalo-chat/lightbox.js)                                | WEB2.0 module — Zalo chat lightbox (xem ảnh full + prev/next).                                          | 11        |
| `WZChat`                                   | [reactions.js](../../web2/shared/zalo-chat/reactions.js)                              | WEB2.0 module — Zalo chat reaction bar (add-only).                                                      | 11        |
| `WZChat`                                   | [realtime.js](../../web2/shared/zalo-chat/realtime.js)                                | WEB2.0 module — Zalo chat realtime (SSE patch).                                                         | 11        |
| `WZChat`                                   | [sticker-picker.js](../../web2/shared/zalo-chat/sticker-picker.js)                    | WEB2.0 module — Zalo chat sticker picker.                                                               | 11        |

<details><summary><b>Chi tiết API từng shared module</b> (bấm mở)</summary>

#### `Web2ChatEmoji` — [web2/shared/chat-panel/web2-chat-emoji-data.js](../../web2/shared/chat-panel/web2-chat-emoji-data.js) · 212 dòng

WEB2.0 — emoji dataset + recent helper cho Web2ChatPanel (tách từ pancake-chat-window).
**Dùng bởi:** `web2/shared/chat-panel/web2-chat-panel.js`

#### `Web2ChatEntityDetect` — [web2/shared/chat-panel/web2-chat-entity-detect.js](../../web2/shared/chat-panel/web2-chat-entity-detect.js) · 116 dòng

WEB2.0 — nhận diện SĐT + địa chỉ trong tin nhắn chat (Feature 3).
**Dùng bởi:** `web2/shared/chat-panel/web2-chat-panel.js`

#### `Web2ChatPanel` — [web2/shared/chat-panel/web2-chat-panel.js](../../web2/shared/chat-panel/web2-chat-panel.js) · 1049 dòng

WEB2.0 — component chat HỢP NHẤT (Web2ChatPanel) dùng chung native-orders/web2-pancake/balance-history.
**Dùng bởi:** `live-chat/js/live/live-chat-modal.js`, `live-chat/js/pancake/inventory-panel.js`, `live-chat/js/pancake/pancake-chat-window.js`, `native-orders/js/native-orders-app.js`, `web2/shared/chat-panel/web2-chat-emoji-data.js`, `web2/shared/chat-panel/web2-chat-sticker-data.js`, `web2/shared/web2-customer-chat.js`

#### `Web2ChatStickers` — [web2/shared/chat-panel/web2-chat-sticker-data.js](../../web2/shared/chat-panel/web2-chat-sticker-data.js) · 33 dòng

WEB2.0 — bộ sticker built-in cho Web2ChatPanel (Feature 2 sticker-send).
**Dùng bởi:** `web2/shared/chat-panel/web2-chat-panel.js`

#### `DeliveryMethodPicker` — [web2/shared/delivery-method-picker.js](../../web2/shared/delivery-method-picker.js) · 617 dòng

Web 2.0 — Delivery method picker (Vietnam-aware)
**Dùng bởi:** `native-orders/js/native-orders-app.js`, `web2/shared/web2-sidebar.js`

#### `Web2Page` — [web2/shared/page-builder.js](../../web2/shared/page-builder.js) · 728 dòng

Web 2.0 generic CRUD page builder — same look as WEB2 list views.

#### `Popup` — [web2/shared/popup.js](../../web2/shared/popup.js) · 469 dòng

Web 2.0 — Custom Popup (alert / confirm / prompt)
**Dùng bởi:** `live-chat/js/layout/settings-manager.js`, `live-chat/js/live/live-campaign-manager.js`, `live-chat/js/live/live-comment-list.js`, `live-chat/js/live/live-livestream-gallery.js`, `live-chat/js/live/live-livestream-snap.js`, `live-chat/js/pancake/inventory-panel.js`, `live-chat/js/pancake/pancake-context-menu.js`, `native-orders/js/native-orders-app.js`, `so-order/js/so-order-app.js`, `web2/balance-history/js/web2-balance-history-app.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customers/js/customers-app.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/pancake-settings/js/pancake-settings.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-products-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/reconcile/js/reconcile-app.js`, `web2/returns/js/returns-tabs.js`, `web2/shared/page-builder.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-export-helpers.js`, `web2/shared/web2-msg-template.js`, `web2/shared/web2-notify.js`, `web2/shared/web2-quick-reply.js`, `web2/shared/web2-return-bill.js`, `web2/shared/web2-sidebar.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/system/js/system-sse.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/zalo/js/web2-zalo-app.js`

#### `Web2ApiFetch` — [web2/shared/web2-api-fetch.js](../../web2/shared/web2-api-fetch.js) · 82 dòng

WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Api` — [web2/shared/web2-api.js](../../web2/shared/web2-api.js) · 94 dòng

Web 2.0 generic API client — talks to /api/web2/:entity/\*
**Dùng bởi:** `web2/shared/page-builder.js`

#### `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth` — [web2/shared/web2-auth.js](../../web2/shared/web2-auth.js) · 243 dòng

Token storage + verify + page guard.
**Dùng bởi:** `live-chat/js/api-config.js`, `live-chat/js/live/comments-mobile.js`, `live-chat/js/live/live-api.js`, `live-chat/js/live/live-campaign-manager.js`, `live-chat/js/live/live-comment-list.js`, `live-chat/js/live/live-hidden-commenters.js`, `live-chat/js/live/live-init.js`, `live-chat/js/live/live-livestream-snap.js`, `live-chat/js/live/live-native-orders-api.js`, `live-chat/js/live/live-state.js`, `live-chat/js/pancake/inventory-panel.js`, `live-chat/js/pancake/pancake-api.js`, `live-chat/js/pancake/pancake-chat-window.js`, `live-chat/js/pancake/pancake-state.js`, `live-chat/js/pancake/pancake-token-manager.js`, `live-chat/js/shared/debt-manager.js`, `live-chat/js/shared/live-customer-sync.js`, `native-orders/js/native-orders-api.js`, `native-orders/js/native-orders-app.js`, `native-orders/js/native-orders-kpi.js`, `so-order/js/so-order-app.js`, `so-order/js/so-order-storage.js`, `web2/balance-history/js/web2-balance-history-app.js`, `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/balance-history/js/web2-pending-match.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customers/js/customers-api.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/jt-tracking/js/jt-tracking-api.js`, `web2/jt-tracking/js/jt-tracking-constants.js`, `web2/kpi/js/kpi-assignments.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/multi-tool/js/multi-tool.js`, `web2/pancake-settings/js/pancake-settings.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/photo-studio/photo-studio.js`, `web2/products/js/web2-products-api.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-print.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/reconcile/js/reconcile-app.js`, `web2/returns/js/returns-api.js`, `web2/shared/chat-panel/web2-chat-panel.js`, `web2/shared/delivery-method-picker.js`, `web2/shared/web2-api-fetch.js`, `web2/shared/web2-api.js`, `web2/shared/web2-chat-client.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-customer-store.js`, `web2/shared/web2-msg-template.js`, `web2/shared/web2-notification-bell.js`, `web2/shared/web2-pancake-accounts.js`, `web2/shared/web2-printer.js`, `web2/shared/web2-product-counter.js`, `web2/shared/web2-qr-modal.js`, `web2/shared/web2-quick-reply.js`, `web2/shared/web2-realtime.js`, `web2/shared/web2-return-bill.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-so-order-reader.js`, `web2/shared/web2-suppliers-cache.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-user-info.js`, `web2/shared/web2-wallet-api.js`, `web2/shared/web2-wallet-balance.js`, `web2/shared/web2-zalo-api.js`, `web2/shared/web2-zalo.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`, `web2/system/js/system-services.js`, `web2/system/js/system-sse.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-api.js`

#### `Web2BarcodeScanner` — [web2/shared/web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js) · 443 dòng

WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/reconcile/js/reconcile-app.js`, `web2/shared/web2-label-ocr.js`, `web2/shared/web2-pack-counter.js`

#### `Web2Bill` — [web2/shared/web2-bill-service.js](../../web2/shared/web2-bill-service.js) · 745 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-app.js`, `web2/fastsaleorder-invoice/pbh-app.js`

#### `Web2Chat` — [web2/shared/web2-chat-client.js](../../web2/shared/web2-chat-client.js) · 1199 dòng

Web 2.0 — Chat client (Pancake + Extension)
**Dùng bởi:** `live-chat/js/live/comments-mobile.js`, `live-chat/js/live/live-chat-modal.js`, `live-chat/js/live/live-comment-list.js`, `live-chat/js/live/live-init.js`, `live-chat/js/pancake/pancake-api.js`, `live-chat/js/pancake/pancake-chat-window.js`, `live-chat/js/pancake/pancake-realtime.js`, `live-chat/js/pancake/pancake-token-manager.js`, `native-orders/js/native-orders-app.js`, `web2/balance-history/js/web2-pending-match.js`, `web2/customers/js/customers-app.js`, `web2/jt-tracking/js/jt-tracking-actions.js`, `web2/multi-tool/js/multi-tool.js`, `web2/pancake-settings/js/pancake-settings.js`, `web2/shared/chat-panel/web2-chat-panel.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-msg-template.js`, `web2/shared/web2-pancake-accounts.js`, `web2/shared/web2-pancake-token.js`, `web2/shared/web2-realtime.js`

#### `Web2CkAssignPicker` — [web2/shared/web2-ck-assign-picker.js](../../web2/shared/web2-ck-assign-picker.js) · 256 dòng

WEB2.0 — picker gán giao dịch CK (balance-history) cho đơn chưa nhận CK.
**Dùng bởi:** `native-orders/js/native-orders-app.js`

#### `Web2CkReview` — [web2/shared/web2-ck-review.js](../../web2/shared/web2-ck-review.js) · 490 dòng

WEB2.0 module — đối chiếu & duyệt tín hiệu CK (dùng chung 3 trang).
**Dùng bởi:** `native-orders/js/native-orders-app.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`

#### `Web2CommandPalette` — [web2/shared/web2-command-palette.js](../../web2/shared/web2-command-palette.js) · 269 dòng

WEB2.0 shared — Command Palette (Ctrl/Cmd+K) toàn cục.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2CustomerChat` — [web2/shared/web2-customer-chat.js](../../web2/shared/web2-customer-chat.js) · 842 dòng

WEB2.0 — Web2CustomerChat: launcher chat KH (Pancake + Zalo) dùng chung mọi trang.
**Dùng bởi:** `web2/balance-history/js/web2-balance-history-app.js`, `web2/balance-history/js/web2-pending-match.js`, `web2/jt-tracking/js/jt-tracking-modals.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-product-counter.js`

#### `Web2CustomerDetailModal` — [web2/shared/web2-customer-detail-modal.js](../../web2/shared/web2-customer-detail-modal.js) · 413 dòng

WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/\*.
**Dùng bởi:** `web2/balance-history/js/web2-balance-history-app.js`, `web2/customers/js/customers-app.js`, `web2/shared/web2-wallet-balance.js`

#### `PartnerCustomerApi`, `Web2CustomerLookup` — [web2/shared/web2-customer-lookup.js](../../web2/shared/web2-customer-lookup.js) · 66 dòng

WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.
**Dùng bởi:** `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/balance-history/js/web2-partner-enricher.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/shared/web2-customer-store.js`

#### `Web2CustomerStore` — [web2/shared/web2-customer-store.js](../../web2/shared/web2-customer-store.js) · 402 dòng

WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.
**Dùng bởi:** `live-chat/js/live/live-api.js`, `live-chat/js/live/live-comment-list.js`, `live-chat/js/shared/live-customer-sync.js`, `live-chat/js/shared/live-status.js`, `web2/shared/web2-customer-lookup.js`, `web2/shared/web2-phone-utils.js`

#### `Web2DbBadge` — [web2/shared/web2-db-badge.js](../../web2/shared/web2-db-badge.js) · 145 dòng

Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"

#### `Web2Deeplink` — [web2/shared/web2-deeplink.js](../../web2/shared/web2-deeplink.js) · 101 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/products/js/web2-products-app.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`

#### `Web2Effects` — [web2/shared/web2-effects.js](../../web2/shared/web2-effects.js) · 794 dòng

Web 2.0 — Effects / animations library
**Dùng bởi:** `native-orders/js/native-orders-app.js`, `so-order/js/so-order-app.js`, `web2/products/js/web2-products-app.js`

#### `Web2Escape` — [web2/shared/web2-escape.js](../../web2/shared/web2-escape.js) · 64 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Export` — [web2/shared/web2-export-helpers.js](../../web2/shared/web2-export-helpers.js) · 160 dòng

WEB2.0 module.

#### `Web2Ext` — [web2/shared/web2-extension-bridge.js](../../web2/shared/web2-extension-bridge.js) · 86 dòng

WEB2 EXTENSION BRIDGE
**Dùng bởi:** `live-chat/js/pancake/pancake-chat-window.js`, `web2/shared/web2-customer-chat.js`

#### `Web2Format` — [web2/shared/web2-format.js](../../web2/shared/web2-format.js) · 92 dòng

WEB2.0 shared — 1 NGUỒN format tiền/ngày/giờ (GMT+7) cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2HistoryTimeline` — [web2/shared/web2-history-timeline.js](../../web2/shared/web2-history-timeline.js) · 238 dòng

Web2HistoryTimeline — render lịch sử chỉnh sửa kèm tên user
**Dùng bởi:** `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-app.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/reconcile/js/reconcile-app.js`, `web2/shared/web2-ck-review.js`

#### `Web2IdbStore` — [web2/shared/web2-idb-store.js](../../web2/shared/web2-idb-store.js) · 183 dòng

Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.
**Dùng bởi:** `so-order/js/so-order-storage.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`

#### `Web2Import` — [web2/shared/web2-import.js](../../web2/shared/web2-import.js) · 564 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/products/js/web2-products-app.js`

#### `Web2LabelOcr` — [web2/shared/web2-label-ocr.js](../../web2/shared/web2-label-ocr.js) · 433 dòng

WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/reconcile/js/reconcile-app.js`, `web2/shared/web2-pack-counter.js`

#### `Web2Lottie` — [web2/shared/web2-lottie.js](../../web2/shared/web2-lottie.js) · 391 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/popup.js`, `web2/shared/web2-barcode-scanner.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-optimistic.js`, `web2/shared/web2-product-counter.js`, `web2/shared/web2-sidebar.js`

#### `Web2Motion` — [web2/shared/web2-motion.js](../../web2/shared/web2-motion.js) · 98 dòng

WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.

#### `Web2MsgTemplate` — [web2/shared/web2-msg-template.js](../../web2/shared/web2-msg-template.js) · 962 dòng

Web 2.0 — Bulk Message Template Modal
**Dùng bởi:** `native-orders/js/native-orders-app.js`

#### `Web2NewMsgBadge` — [web2/shared/web2-new-msg-badge.js](../../web2/shared/web2-new-msg-badge.js) · 305 dòng

Web 2.0 — New-message badge for native-orders rows
**Dùng bởi:** `native-orders/js/native-orders-app.js`

#### `Web2NotificationBell` — [web2/shared/web2-notification-bell.js](../../web2/shared/web2-notification-bell.js) · 186 dòng

#### `Web2Notify` — [web2/shared/web2-notify.js](../../web2/shared/web2-notify.js) · 49 dòng

WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Optimistic` — [web2/shared/web2-optimistic.js](../../web2/shared/web2-optimistic.js) · 110 dòng

Codifies pattern: snapshot → apply optimistic UI → fire backend background →
**Dùng bởi:** `live-chat/js/live/live-comment-list.js`, `live-chat/js/live/live-livestream-gallery.js`, `native-orders/js/native-orders-app.js`, `so-order/js/so-order-app.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-app.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/jt-tracking/js/jt-tracking-actions.js`, `web2/pancake-settings/js/pancake-settings.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-products-app.js`, `web2/shared/chat-panel/web2-chat-panel.js`, `web2/shared/page-builder.js`, `web2/shared/web2-lottie.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`

#### `Web2PackCounter` — [web2/shared/web2-pack-counter.js](../../web2/shared/web2-pack-counter.js) · 427 dòng

WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.

#### `Web2PancakeAccounts` — [web2/shared/web2-pancake-accounts.js](../../web2/shared/web2-pancake-accounts.js) · 299 dòng

Web 2.0 — Pancake ACCOUNTS manager (DB-backed)
**Dùng bởi:** `live-chat/js/pancake/pancake-token-manager.js`, `web2/pancake-settings/js/pancake-settings.js`

#### `Web2PancakeToken` — [web2/shared/web2-pancake-token.js](../../web2/shared/web2-pancake-token.js) · 206 dòng

Web 2.0 — Pancake JWT token monitor + auto-refresh
**Dùng bởi:** `web2/pancake-settings/js/pancake-settings.js`

#### `Web2PhoneUtils` — [web2/shared/web2-phone-utils.js](../../web2/shared/web2-phone-utils.js) · 38 dòng

WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Printer` — [web2/shared/web2-printer.js](../../web2/shared/web2-printer.js) · 704 dòng

WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.
**Dùng bởi:** `web2/products/js/web2-products-print.js`, `web2/shared/web2-bill-service.js`, `web2/shared/web2-qr.js`

#### `Web2ProductCode` — [web2/shared/web2-product-code.js](../../web2/shared/web2-product-code.js) · 594 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/products/js/web2-products-app.js`, `web2/shared/web2-variants-cache.js`

#### `Web2ProductCounter` — [web2/shared/web2-product-counter.js](../../web2/shared/web2-product-counter.js) · 539 dòng

WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.
**Dùng bởi:** `web2/product-counter/js/product-counter.js`, `web2/shared/web2-barcode-scanner.js`, `web2/shared/web2-label-ocr.js`

#### `Web2ProductsCache` — [web2/shared/web2-products-cache.js](../../web2/shared/web2-products-cache.js) · 450 dòng

Web2 Products — Shared cache + Firestore tickler realtime
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/products/js/web2-products-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`

#### `Web2QrModal` — [web2/shared/web2-qr-modal.js](../../web2/shared/web2-qr-modal.js) · 299 dòng

WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.
**Dùng bởi:** `web2/customers/js/customers-app.js`

#### `Web2QR` — [web2/shared/web2-qr.js](../../web2/shared/web2-qr.js) · 348 dòng

WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.
**Dùng bởi:** `web2/products/js/web2-products-print.js`, `web2/shared/web2-bill-service.js`

#### `Web2QuickReply` — [web2/shared/web2-quick-reply.js](../../web2/shared/web2-quick-reply.js) · 656 dòng

Web 2.0 — Quick Reply system
**Dùng bởi:** `native-orders/js/native-orders-app.js`, `web2/shared/chat-panel/web2-chat-panel.js`

#### `Web2Realtime` — [web2/shared/web2-realtime.js](../../web2/shared/web2-realtime.js) · 599 dòng

Web 2.0 — Realtime client (Pancake WS)
**Dùng bởi:** `live-chat/server/server.js`, `native-orders/js/native-orders-app.js`, `web2/shared/web2-new-msg-badge.js`

#### `NativeReturnBill` — [web2/shared/web2-return-bill.js](../../web2/shared/web2-return-bill.js) · 59 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-app.js`

#### `Web2Sidebar` — [web2/shared/web2-sidebar.js](../../web2/shared/web2-sidebar.js) · 629 dòng

WEB2-clone sidebar for Web 2.0 pages.
**Dùng bởi:** `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/jt-tracking/js/jt-tracking-app.js`, `web2/multi-tool/js/multi-tool.js`, `web2/pancake-settings/js/pancake-settings.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/returns/js/returns-app.js`, `web2/system/js/system-app.js`

#### `Web2SoOrder` — [web2/shared/web2-so-order-reader.js](../../web2/shared/web2-so-order-reader.js) · 53 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/pancake/inventory-panel.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`

#### `Web2SSE` — [web2/shared/web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js) · 244 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/live/comments-mobile.js`, `live-chat/js/live/live-chat-modal.js`, `live-chat/js/live/live-hidden-commenters.js`, `live-chat/js/live/live-init.js`, `live-chat/js/live/live-livestream-gallery.js`, `live-chat/js/live/live-livestream-snap.js`, `live-chat/js/pancake/inventory-panel.js`, `live-chat/js/pancake/pancake-realtime.js`, `live-chat/js/shared/live-comments-stream.js`, `native-orders/js/native-orders-app.js`, `native-orders/js/native-orders-kpi.js`, `so-order/js/so-order-storage.js`, `web2/balance-history/js/web2-balance-history-app.js`, `web2/balance-history/js/web2-pending-match.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customers/js/customers-app.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/jt-tracking/js/jt-tracking-app.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-products-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/reconcile/js/reconcile-app.js`, `web2/returns/js/returns-app.js`, `web2/shared/page-builder.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-store.js`, `web2/shared/web2-msg-template.js`, `web2/shared/web2-notification-bell.js`, `web2/shared/web2-printer.js`, `web2/shared/web2-products-cache.js`, `web2/shared/web2-sse-topics.js`, `web2/shared/web2-suppliers-cache.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-variants-cache.js`, `web2/shared/web2-wallet-balance.js`, `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/realtime.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/zalo/js/web2-zalo-app.js`

#### `Web2SSETopics` — [web2/shared/web2-sse-topics.js](../../web2/shared/web2-sse-topics.js) · 29 dòng

WEB2.0 module.

#### `Web2SuppliersCache` — [web2/shared/web2-suppliers-cache.js](../../web2/shared/web2-suppliers-cache.js) · 223 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/products/js/web2-products-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`

#### `Web2TextUtils` — [web2/shared/web2-text-utils.js](../../web2/shared/web2-text-utils.js) · 41 dòng

WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2UnreadPanel` — [web2/shared/web2-unread-panel.js](../../web2/shared/web2-unread-panel.js) · 149 dòng

WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).
**Dùng bởi:** `web2/ck-dashboard/js/ck-dashboard-app.js`

#### `Web2UserInfo` — [web2/shared/web2-user-info.js](../../web2/shared/web2-user-info.js) · 154 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/live/live-hidden-commenters.js`, `native-orders/js/native-orders-app.js`, `native-orders/js/native-orders-packing-slip.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/kpi/js/kpi-assignments.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-product-detail.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/reconcile/js/reconcile-app.js`, `web2/returns/js/returns-api.js`, `web2/shared/web2-api.js`, `web2/shared/web2-bill-service.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-msg-template.js`, `web2/shared/web2-wallet-api.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`, `web2/zalo/js/web2-zalo-app.js`

#### `Web2VariantMulti` — [web2/shared/web2-variant-multi.js](../../web2/shared/web2-variant-multi.js) · 192 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/products/js/web2-products-app.js`

#### `Web2VariantsCache` — [web2/shared/web2-variants-cache.js](../../web2/shared/web2-variants-cache.js) · 231 dòng

Web2 Variants — Shared cache + Firestore tickler realtime
**Dùng bởi:** `so-order/js/so-order-app.js`, `web2/products/js/web2-products-app.js`, `web2/shared/web2-variant-multi.js`, `web2/variants/js/web2-variants-app.js`

#### `Web2WalletApi` — [web2/shared/web2-wallet-api.js](../../web2/shared/web2-wallet-api.js) · 212 dòng

WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).
**Dùng bởi:** `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/shared/web2-wallet-balance.js`

#### `Web2WalletBalance` — [web2/shared/web2-wallet-balance.js](../../web2/shared/web2-wallet-balance.js) · 315 dòng

WEB2.0 — shared helper hiển thị số dư ví KH.
**Dùng bởi:** `live-chat/js/live/live-comment-list.js`, `live-chat/js/live/live-customer-panel.js`, `native-orders/js/native-orders-app.js`, `web2/balance-history/js/web2-balance-history-app.js`, `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-pending-match.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-app.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/returns/js/returns-customer.js`, `web2/returns/js/returns-tabs.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-wallet-api.js`, `web2/shared/web2-zalo.js`

#### `ZaloApi` — [web2/shared/web2-zalo-api.js](../../web2/shared/web2-zalo-api.js) · 200 dòng

WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/sticker-picker.js`, `web2/zalo/js/web2-zalo-app.js`

#### `Web2Zalo` — [web2/shared/web2-zalo.js](../../web2/shared/web2-zalo.js) · 296 dòng

WEB2.0 shared — Web2Zalo helper (single-source Zalo).
**Dùng bởi:** `web2/jt-tracking/js/jt-tracking-modals.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/bubbles.js](../../web2/shared/zalo-chat/bubbles.js) · 227 dòng

WEB2.0 module — Zalo chat message renderer.
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-actions.js](../../web2/shared/zalo-chat/chat-actions.js) · 90 dòng

WEB2.0 module — Zalo chat actions (network + optimistic).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-store.js](../../web2/shared/zalo-chat/chat-store.js) · 214 dòng

WEB2.0 module — Zalo chat shared store + utils (WZChat.\*).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-view.js](../../web2/shared/zalo-chat/chat-view.js) · 647 dòng

WEB2.0 shared — Zalo chat VIEW (mount 1 hội thoại vào bất kỳ container).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/composer.js](../../web2/shared/zalo-chat/composer.js) · 457 dòng

WEB2.0 module — Zalo chat composer (input đầy đủ).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/emoji-picker.js](../../web2/shared/zalo-chat/emoji-picker.js) · 105 dòng

WEB2.0 module — Zalo chat emoji picker (client-only).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/lightbox.js](../../web2/shared/zalo-chat/lightbox.js) · 86 dòng

WEB2.0 module — Zalo chat lightbox (xem ảnh full + prev/next).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/reactions.js](../../web2/shared/zalo-chat/reactions.js) · 65 dòng

WEB2.0 module — Zalo chat reaction bar (add-only).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/realtime.js](../../web2/shared/zalo-chat/realtime.js) · 56 dòng

WEB2.0 module — Zalo chat realtime (SSE patch).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/sticker-picker.js](../../web2/shared/zalo-chat/sticker-picker.js) · 113 dòng

WEB2.0 module — Zalo chat sticker picker.
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-app.js`

</details>

## 3. Pages / Surfaces

### live-chat — API Configuration

- **[api-config.js](../../live-chat/js/api-config.js)** ·104 — API Configuration
    - exposes: `API_CONFIG`
    - uses shared: `API_CONFIG`
    - funcs (6): facebookSend, getStatus, pancake, pancakeDirect, pancakeOfficial, smartFetch
- **[config.js](../../live-chat/js/config.js)** ·39 — js/config.js - Configuration & Firebase Setup
    - exposes: `APP_CONFIG`
- **[app-init.js](../../live-chat/js/layout/app-init.js)** ·86 — App Initialization - Orchestrates all module initialization
    - exposes: `AppInit`
    - funcs (2): \_setupCrossColumnEvents, initializeApp
- **[column-manager.js](../../live-chat/js/layout/column-manager.js)** ·317 — Column Manager - Dual column layout management
    - exposes: `ColumnManager`
    - funcs (18): ColumnManager, \_doResize, \_initResize, \_initSettingsPanel, \_refreshIcons, \_startResize, \_stopResize, \_updateSelectValues, applyOrder, getOrder, initialize, loadOrder, refreshColumns, saveOrder, setColumnContent, showNotification, swapColumns, toggleFullscreen
- **[settings-manager.js](../../live-chat/js/layout/settings-manager.js)** ·224 — Settings Manager - Live and Pancake settings modals
    - exposes: `SettingsManager`
    - uses shared: `Popup`
    - funcs (11): SettingsManager, \_handleAddAccount, \_initLiveSettings, \_initModalCloseOnOutside, \_initPancakeSettings, \_loadLiveSettingsValues, \_loadPancakeAccounts, \_updateServerModeIndicator, deleteAccount, initialize, selectAccount
- **[comments-mobile.js](../../live-chat/js/live/comments-mobile.js)** ⚠️1132 — WEB2.0 — controller viewer comment live (mobile, chỉ xem).
    - exposes: `LiveState`, `LiveCommentList`
    - uses shared: `API_CONFIG`, `Web2Chat`, `Web2SSE`
    - funcs (73): $, addrOf, applyDelta, applyView, avHash, avatarHtml, buildCard, cardHtml, cardSig, closePicker, closeSheet, doRender, enrichDelta, enrichWarehouse, esc, fetchThumbs, field, fmtFull, fmtTime, getCreatedMs, getPostIds, getWorkerUrl, hiddenCount, isHiddenPerson, isHousePg, isShopOwn, isStorePg, livingIds, livingSet, load, loadNativeOrders, loadPosts, mapRow, nameOf, nativeOrder, normP, onDelta, openPicker, openSheet, ordered, overrideRealCounts, pageOf, parseTs, pass, passLive, phoneOf, pickerRow, postJson, postLabel, postLiving, primeFromData, realCommentTotal, reconcileList, refreshWarehouse, renderComments, renderPicker, scheduleLoadNative, scheduleRender, selectAll, selectLive …
- **[live-api.js](../../live-chat/js/live/live-api.js)** ·443 — Live API Layer
    - exposes: `LiveApi`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2CustomerStore`
    - funcs (19): \_fillCampaignPageNames, \_getWorkerUrl, \_patchWarehouseByFb, \_w2AuthHeaders, getPartnerInfo, getPartnerInfoBatch, hasMoreLiveCampaigns, hideComment, loadCRMTeams, loadComments, loadLiveCampaigns, loadLiveCampaignsFromAllPages, loadMoreLiveCampaigns, loadSessionIndex, replyToComment, savePartnerData, saveToLive, updatePartnerStatus, updatePartnerStatusViaProxy
- **[live-campaign-manager.js](../../live-chat/js/live/live-campaign-manager.js)** ·362 — WEB2.0 — quản lý chiến dịch cha (gom bài livestream) ngay trong live-chat.
    - exposes: `LiveCampaignManager`
    - uses shared: `Popup`, `Web2Auth`
    - funcs (15): API, \_api, \_close, \_injectStyles, \_mount, \_open, \_pagePosts, \_removeBackBanner, \_render, \_showBackBanner, \_viewCampaign, \_w2AuthHeaders, campOpts, esc, exitCampaignView
- **[live-chat-modal.js](../../live-chat/js/live/live-chat-modal.js)** ·208 — WEB2.0 module.
    - exposes: `LiveChatModal`
    - uses shared: `Web2ChatPanel`, `Web2Chat`, `Web2SSE`
    - funcs (7): \_ensureOverlay, \_esc, \_hostMsg, \_setHeader, \_wireSse, close, open
- **[live-comment-list.js](../../live-chat/js/live/live-comment-list.js)** ⚠️2460 — Live Comment List UI
    - exposes: `LiveCommentList`
    - uses shared: `Popup`, `Web2Auth`, `Web2Chat`, `Web2CustomerStore`, `Web2Optimistic`, `Web2WalletBalance`
    - funcs (77): \_appendOlderBatch, \_applyBadge, \_attachWalletBalances, \_bindCampaignScroll, \_bindCustomerModalDelegation, \_bindListDelegation, \_campaignRowHtml, \_campaignSentinelHtml, \_docClickHandler, \_dragEndFlushHandler, \_ensureScrollSentinel, \_filteredAll, \_flushDeferredAfterDrag, \_liveW2Auth, \_onListClick, \_orderCount, \_patchRowsChunked, \_renderCustomerPopup, \_renderDispatch, \_rowSig, \_setKho, \_shouldAnimateNew, \_updateRealCommentTotal, \_updateTotalBadge, \_visibleComments, apply, chunkRefresh, clearCampaignSelection, createOrder, getStatusColor, getStatusOptions, handleSaveToLive, handleScroll, isHidden, liveAttr, liveSvgIcon, loadMoreCampaigns, mapWarehouse, markNew, pancakePhone, prependComments, refreshCommentItem, renderCommentItem, renderComments, renderCommentsNow, renderContainer, renderCrmTeamOptions, renderFn, renderLiveCampaignOptions, resetRenderLimit, rollback, run, saveInlineAddress, saveInlinePhone, schedule, selectComment, selectInlineStatus, selectTodayCampaigns, sendReply, setDebtDisplaySettings …
- **[live-customer-panel.js](../../live-chat/js/live/live-customer-panel.js)** ·316 — Live Customer Info Panel
    - exposes: `LiveCustomerPanel`
    - uses shared: `Web2WalletBalance`
    - funcs (8): closeModal, formatDate, getStatusClass, lcpAttr, renderCustomerInfoModal, selectStatus, showCustomerInfo, toggleStatusDropdown
- **[live-hidden-commenters.js](../../live-chat/js/live/live-hidden-commenters.js)** ·383 — WEB2.0 module — ẩn comment theo NGƯỜI (commenter) + danh sách quản lý.
    - exposes: `LiveHiddenCommenters`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`, `Web2UserInfo`
    - funcs (24): \_apiBase, \_boot, \_esc, \_hideRemote, \_injectStyles, \_lhcHeaders, \_load, \_mountBtn, \_normName, \_rebuildNameSet, \_renderManagerBody, \_rerender, \_save, \_toast, \_unhideRemote, \_updateBtnCount, hide, isHidden, list, openManager, rollback, run, trySub, unhide
- **[live-init.js](../../live-chat/js/live/live-init.js)** ⚠️1137 — Live Column Initializer & Orchestrator
    - exposes: `LiveColumnManager`
    - uses shared: `Web2Auth`, `Web2Chat`, `Web2SSE`
    - funcs (53): \_captureAltPhones, \_dbRowToComment, \_fetchLiveCommentDelta, \_fetchLiveVideosForPage, \_harvestCommentCustomers, \_mapDbComment, \_onRtConnected, \_onRtDisconnected, \_resolveCampaignLivePosts, \_resolveSelectedPostIds, \_restoreCampaignSelection, \_saveCommentsToDb, \_w2AuthHeaders, \_waitForPancakeAccounts, closeCustomerInfoModal, destroy, getCacheStats, getPostIds, getWorkerUrl, handleSaveToLive, hasOption, initialize, isExpired, loadComments, loadDebtForPartners, loadMoreComments, loadNativeOrdersForPost, loadPartnerInfoForComments, loadSessionIndex, mapRow, norm, onCrmTeamChange, onDelta, onLiveCampaignChange, onMultiCampaignChange, pancakePhoneOf, ready, refresh, restoreSelection, saveInlineAddress, saveInlinePhone, selectComment, selectInlineStatus, selectStatus, setDebtDisplaySettings, setupEventListeners, setupRealtimeListeners, shouldFetch, showCustomerInfo, toggleHideComment, toggleInlineStatusDropdown, toggleStatusDropdown, updateSaveButtonToCheckmark
- **[live-kho-enricher.js](../../live-chat/js/live/live-kho-enricher.js)** ·219 — WEB2.0 — enrich live-chat từ kho khách hàng.
    - exposes: `LiveKhoEnricher`
    - funcs (12): commentPhone, flush, gather, init, needsEnrich, normPhone, postBatch, renderComments, reset, scan, scheduleFlush, setKho
- **[live-livestream-gallery.js](../../live-chat/js/live/live-livestream-gallery.js)** ·577 — WEB2.0 module.
    - exposes: `LiveLivestreamGallery`
    - uses shared: `Popup`, `Web2Optimistic`, `Web2SSE`
    - funcs (32): \_deleteImage, \_ensurePreview, \_esc, \_extractImage, \_fmtTime, \_hidePreview, \_loadCampaignsInto, \_makeChip, \_prependTempTile, \_removeTile, \_renderGrid, \_setupSSE, \_showPreview, \_snapApi, \_tileHtml, \_toast, \_user, apply, captureAndSave, closeSidebar, doPost, ensureButtons, ensureSidebar, finish, g, init, onSuccess, openSidebar, reload, rollback, run, toggleSidebar
- **[live-livestream-snap.js](../../live-chat/js/live/live-livestream-snap.js)** ⚠️4569 — WEB2.0 module.
    - exposes: `LiveLivestreamSnap`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (153): \_acquireCaptureLock, \_base64ToBlob, \_blobToBase64, \_buildFbLiveUrl, \_buildSeekPlayer, \_captureAtCommentTime, \_captureExtensionFrame, \_captureExtensionFrameThrottled, \_captureFrameJpeg, \_captureViaExtension, \_clientCaptureAtOffset, \_clientCaptureAtOffsetInner, \_clientRestoreLive, \_cmpVersions, \_createMetadataSnap, \_deleteSnapByComment, \_enableEmbeddedLiveCapture, \_encodeBitmapInWorker, \_ensureEmbeddedIframe, \_ensureFbSdk, \_ensureFloatingHost, \_ensureSeekPlayer, \_ensureVideoDock, \_ensureWorkerStrip, \_esc, \_extractThumbnailForComment, \_fetchLiveVideoInfo, \_findActiveLiveCampaign, \_findCommentContainer, \_findNearestBufferedFrame, \_flushSnapByCommentBatch, \_fmtOffset, \_forceExtractVideoBlocked, \_getBufferCount, \_getEncodeWorker, \_getLatestFrame, \_getSnapMode, \_getSnapPagePref, \_getStreamActive, \_handleNewCommentAuto, \_hideZoomPreview, \_holderId, \_invalidateSnapCacheAndRefresh, \_isAutoMode, \_isFrameBlank, \_isInlineThumbOn, \_isStaffComment, \_isVanitySlug, \_lockApiBase, \_lockFetch, \_machineId, \_maybeShowAutoSnapBanner, \_offlineSnapOne, \_openSnapLightbox, \_pageActiveForCapture, \_postAcquire, \_postCapturedSnap, \_queueSnapByComment, \_readLock, \_refreshPopoverContent …
- **[live-native-orders-api.js](../../live-chat/js/live/live-native-orders-api.js)** ·104 — Native Orders API (frontend client)
    - exposes: `NativeOrdersApi`
    - uses shared: `API_CONFIG`
    - funcs (7): \_fetchJson, \_getBaseUrl, createFromComment, getByUser, list, remove, update
- **[live-order-history.js](../../live-chat/js/live/live-order-history.js)** ·228 — WEB2.0 — danh sách đơn đã tạo theo chiến dịch (STT + tìm kiếm) trong live-chat.
    - exposes: `LiveOrderHistory`
    - funcs (13): \_base, \_close, \_fetchOrders, \_filtered, \_injectStyles, \_mount, \_open, \_renderBody, \_selectedCampaignIds, esc, fmtMoney, fmtTime, g
- **[live-realtime.js](../../live-chat/js/live/live-realtime.js)** ·114 — Live Realtime Manager — transport cũ đã NEUTERED (Web 2.0).
    - exposes: `LiveRealtime`
    - funcs (6): connectWebSocket, disconnectWebSocket, handleSSEMessage, initializeWebSocket, startSSE, stopSSE
- **[live-source.js](../../live-chat/js/live/live-source.js)** ·318 — WEB2.0 — nguồn comment live qua Pancake (pages.fm) + FB Graph EAA optional. Thay Live.
    - exposes: `LiveSource`
    - funcs (17): \_accountJwtForPage, \_convToComment, \_eaaTokenForPage, \_pfmGet, \_postEpoch, \_postToCampaign, enabled, fetchPagesAsCrmTeams, fetchVideosAsCampaigns, fullPostId, loadComments, nowS, startRealtime, stopAll, stopRealtime, videoId, worker
- **[live-state.js](../../live-chat/js/live/live-state.js)** ·159 — Live State Management
    - exposes: `LiveState`
    - uses shared: `API_CONFIG`
    - funcs (8): clearAllCaches, getCacheStats, getSavedCampaignSelection, getSavedPageSelection, saveCampaignSelection, savePageSelection, startCacheCleanup, stopCacheCleanup
- **[inventory-panel.js](../../live-chat/js/pancake/inventory-panel.js)** ⚠️1178 — - Tabs lấy từ Firestore web2_so_order/main → data.tabs[].label/name.
    - exposes: `PancakeInventoryPanel`
    - uses shared: `Web2ChatPanel`, `Popup`, `API_CONFIG`, `Web2SoOrder`, `Web2SSE`
    - funcs (43): \_addProductToComposer, \_getCmtMap, \_markHasOrderRows, \_mutationsTouchRows, \_outside, \_relTime, \_renderBadgeFor, \_renderBadgeForRow, \_resolveCommitContext, \_resolveLiveCustomer, \_scheduleRefresh, \_showToast, \_showUndoToast, \_snapTickerCancel, \_subscribeSSE, \_user, \_wireLiveObserver, addToCart, applyFilter, asciiUpper, attachAddButtons, attachDragSources, attachDropTargets, cleanup, clearOrder, close, escapeHtml, fmtPrice, init, loadProducts, loadTabsFromSoOrder, onUndo, onclick, openCartHistory, refresh, refreshCartCounts, removeFromCart, renderBadges, renderCartPopover, renderProductList, renderShell, renderTabs, togglePopover
- **[pancake-api.js](../../live-chat/js/pancake/pancake-api.js)** ·637 — PANCAKE API - All Pancake API calls (extracted from pancake-data-manager.js)
    - exposes: `PancakeAPI`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Chat`
    - funcs (24): \_extractPageAccessTokens, \_getPhoneFromConv, \_w2AuthHeaders, addCustomerNote, addRemoveTag, deleteComment, fetchConversations, fetchCustomerInfo, fetchMoreConversations, fetchPages, fetchPagesWithUnreadCount, fetchTags, getPageAccessToken, getToken, hideComment, likeComment, loadDebtForConversations, loadLiveSavedIds, markAsRead, markAsUnread, privateReplyN2Store, removeFromLiveSaved, searchConversations, sendTypingIndicator
- **[pancake-chat-window.js](../../live-chat/js/pancake/pancake-chat-window.js)** ·377 — WEB2.0 — wrapper mỏng bọc Web2ChatPanel (component chat hợp nhất). Giữ public API cũ cho conversation-list + realtime.
    - exposes: `PancakeChatWindow`
    - uses shared: `Web2ChatPanel`, `API_CONFIG`, `Web2Auth`, `Web2Chat`, `Web2Ext`
    - funcs (18): \_buildAdapter, \_fileToDataUrl, \_performSend, \_trySendViaExtension, loadMessages, loadOlder, markRead, onAddEntity, onConversationUpdate, onerror, onload, quickReplies, renderChatWindow, renderMessages, scrollToBottom, send, sendMessage, sendSticker
- **[pancake-context-menu.js](../../live-chat/js/pancake/pancake-context-menu.js)** ·189 — PANCAKE CONTEXT MENU - Right-click context menu
    - exposes: `PancakeContextMenu`
    - uses shared: `Popup`
    - funcs (4): handleAction, hide, renderTagSubmenu, show
- **[pancake-conversation-list.js](../../live-chat/js/pancake/pancake-conversation-list.js)** ·454 — PANCAKE CONVERSATION LIST - Sidebar conversation rendering
    - exposes: `PancakeConversationList`
    - funcs (17): \_getAvatarHtml, \_getPhoneFromConv, \_getTagsHtml, \_pageBadge, \_pageLabel, \_parseMessageHtml, applyFilter, clearSearch, handleSearch, loadMore, performApiSearch, removeFromLiveSaved, renderConversationItem, renderConversationList, selectConversation, setPageFilter, updateConversationInDOM
- **[pancake-init.js](../../live-chat/js/pancake/pancake-init.js)** ·341 — PANCAKE INIT - Orchestrate Pancake column initialization
    - exposes: `PancakeColumnManager`
    - funcs (11): \_bindEvents, \_loadConversations, \_preloadPageAccessTokens, \_renderErrorState, \_renderLoadingState, \_renderShell, \_switchTab, initialize, refresh, setServerMode, setTimeout
- **[pancake-mobile-shell.js](../../live-chat/js/pancake/pancake-mobile-shell.js)** ·143 — WEB2.0 — mobile shell cho Chat Pancake: app-height keyboard-aware + single-pane swap (list↔chat) + swipe-back. KHÔNG đụng data layer.
    - exposes: `Web2PancakeMobile`
    - funcs (10): applyViewport, bindSwipeBack, container, currentView, ensureBackBtn, init, isMobile, setView, showChat, showList
- **[pancake-mode-switcher.js](../../live-chat/js/pancake/pancake-mode-switcher.js)** ·142 — State lưu localStorage. Mặc định = Kho. Wrap content sau khi Pancake init xong.
    - exposes: `PancakeModeSwitcher`
    - funcs (7): \_attachObserver, \_renderSwitcher, applyMode, getMode, init, setMode, wrap
- **[pancake-page-selector.js](../../live-chat/js/pancake/pancake-page-selector.js)** ·167 — PANCAKE PAGE SELECTOR - Page dropdown selector
    - exposes: `PancakePageSelector`
    - funcs (6): loadPages, renderPageSelector, selectPage, toggleDropdown, updateSelectedDisplay, updateUnreadCounts
- **[pancake-realtime.js](../../live-chat/js/pancake/pancake-realtime.js)** ·212 — WEB2.0 — realtime qua SSE (single source), KHÔNG còn WebSocket riêng.
    - exposes: `PancakeRealtime`
    - uses shared: `Web2Chat`, `Web2SSE`
    - funcs (12): \_fetchNewMessagesForActive, \_handleNewMessage, \_handleOrderTagsUpdate, \_handleUpdateConversation, \_onSseEvent, \_scheduleActiveRefresh, \_scheduleListRefresh, \_updateStatusUI, \_wireSse, connect, connectServerMode, disconnect
- **[pancake-state.js](../../live-chat/js/pancake/pancake-state.js)** ·204 — PANCAKE STATE - Centralized state for Pancake column
    - exposes: `PancakeState`
    - uses shared: `API_CONFIG`
    - funcs (7): clearSearch, getDebtCache, loadSelectedPage, resetMessageState, saveSelectedPage, setDebtCache, setServerMode
- **[pancake-token-manager.js](../../live-chat/js/pancake/pancake-token-manager.js)** ⚠️1310 — PANCAKE TOKEN MANAGER (Web 2.0 live-chat) — 1 NGUỒN: pancake_accounts
    - uses shared: `API_CONFIG`, `Web2Chat`, `Web2PancakeAccounts`
    - funcs (35): addAccount, base64UrlDecode, clearPageAccessTokensFromLocalStorage, clearToken, clearTokenFromLocalStorage, debugToken, decodeToken, deleteAccount, genPromise, generatePageAccessToken, getAccountInfo, getAllAccounts, getAllPageAccessTokens, getOrGeneratePageAccessToken, getPageAccessToken, getPageAccessTokensFromLocalStorage, getToken, getTokenFromCookie, getTokenFromFirestore, getTokenFromLocalStorage, getTokenFromWeb2Chat, getTokenInfo, initialize, isTokenExpired, loadAccounts, loadFromLocalStorage, loadPageAccessTokens, savePageAccessToken, savePageAccessTokensToLocalStorage, saveTokenToFirestore, saveTokenToLocalStorage, setActiveAccount, setTokenManual, valid, withTimeout
- **[cache-manager.js](../../live-chat/js/shared/cache-manager.js)** ·164 — Shared Cache Manager for Live-Pancake
    - exposes: `SharedCache`
    - funcs (8): \_evictOldest, cleanup, clear, destroy, entries, has, startCleanup, stopCleanup
- **[debt-manager.js](../../live-chat/js/shared/debt-manager.js)** ·186 — Shared Debt Manager for Live-Pancake
    - exposes: `DebtManager`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (9): \_w2Auth, clear, destroy, formatBadge, getDebt, loadBatch, loadSingle, setDebt, startCleanup
- **[event-bus.js](../../live-chat/js/shared/event-bus.js)** ·105 — Shared Event Bus for Live-Pancake
    - exposes: `EventBus`
    - funcs (6): emit, off, on, once, removeAll, wrapper
- **[live-comments-stream.js](../../live-chat/js/shared/live-comments-stream.js)** ·176 — LiveCommentsStream — engine realtime comment livestream DÙNG CHUNG
    - exposes: `LiveCommentsStream`
    - uses shared: `Web2SSE`
    - funcs (7): create, cursor, fetchDelta, primeCursor, schedule, start, stop
- **[live-customer-sync.js](../../live-chat/js/shared/live-customer-sync.js)** ·198 — LiveCustomerSync — NGUỒN CHUNG đồng bộ KH giữa 2 trang comment livestream
    - exposes: `LiveCustomerSync`
    - uses shared: `API_CONFIG`, `Web2CustomerStore`
    - funcs (10): enrich, flushHarvest, harvest, norm, pickFb, pickName, pickPageId, pickPhone, post, reset
- **[live-status.js](../../live-chat/js/shared/live-status.js)** ·39 — LiveStatus — chuẩn hoá "trạng thái KH" lấy từ KHO web2_customers (cột status)
    - exposes: `LiveStatus`
    - uses shared: `Web2CustomerStore`
    - funcs (1): normalize
- **[live-time.js](../../live-chat/js/shared/live-time.js)** ·130 — LiveTime — formatter thời gian tương đối + bộ đếm TỰ TICK dùng chung cho
    - exposes: `LiveTime`
    - funcs (7): absShort, escAttr, format, markup, parseMs, start, tick
- **[utils.js](../../live-chat/js/shared/utils.js)** ·276 — Shared Utilities for Live-Pancake
    - exposes: `SharedUtils`
    - funcs (13): debounce, escapeHtml, formatDebt, formatFullTime, formatTime, getAvatarPlaceholder, getAvatarUrl, getPartValue, normalizePhone, parseTimestamp, throttle, toEpochMs, truncate
- **[facebook-routes.js](../../live-chat/server/facebook-routes.js)** ·452 — Facebook Graph API routes — merged into web2-realtime (2026-06-14).
    - funcs (4): fetch, getPageToken, isCommentConversation, loadTokensFromFile
- **[server.js](../../live-chat/server/server.js)** ⚠️1216 — N2STORE PANCAKE WEBSOCKET CLIENT (Multi-Account)
    - uses shared: `Web2Realtime`
    - funcs (26): \_bDedupKey, autoConnect, broadcastToBrowsers, connect, discoverPageIds, doPost, ensureSelectionTable, forwardToFallback, generateClientSession, getDisabledPageIds, getStatus, gracefulShutdown, handleMessage, initFirebase, joinChannels, loadTokensFromFirebase, makeRef, requireRelaySecret, savePageSelection, start, startClient, startHeartbeat, stop, stopHeartbeat, storeEvent, tag
- **[alert.js](../../live-chat/server/utils/alert.js)** ·34
    - funcs (1): sendAlert

### native-orders — Native Orders — API client cho trang Đơn Web.

- **[native-orders-api.js](../../native-orders/js/native-orders-api.js)** ·182 — Native Orders — API client cho trang Đơn Web.
    - exposes: `NativeOrdersApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (13): \_authHeaders, \_fetchJson, campaigns, createManual, getByUser, getKpiScope, health, list, markPrinted, markProductsPrinted, remove, searchProducts, update
- **[native-orders-app.js](../../native-orders/js/native-orders-app.js)** ⚠️9457 — Native Orders — main app logic.
    - exposes: `NativeOrdersApp`
    - uses shared: `Web2ChatPanel`, `DeliveryMethodPicker`, `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Bill`, `Web2Chat`, `Web2CkAssignPicker`, `Web2CkReview`, `Web2Effects`, `Web2MsgTemplate`, `Web2NewMsgBadge`, `Web2Optimistic`, `Web2QuickReply`, `Web2Realtime`, `NativeReturnBill`, `Web2SSE`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (290): $, \_appendBubbleDom, \_appendOutgoing, \_applyChatHeaderForOrder, \_applySidebarFilter, \_attachLabel, \_attachScrollLoader, \_attachmentKind, \_avatarHtml, \_avatarInitial, \_avatarUrl, \_billShipPriceOf, \_bindConvRowClicks, \_bubbleHtml, \_bubbleSlotHtml, \_buildNativeAdapter, \_buildOrderHtml, \_buildPbhShape, \_clearPendingAttachment, \_closeDeliveryMenu, \_closeInteractions, \_convRowHtml, \_dateInputToIsoWithNowTime, \_dateLabel, \_dateSeparatorHtml, \_deliveryBadgeHtml, \_deliveryOpts, \_deliveryShort, \_detectDelivery, \_doCreatePbh, \_ensureChatModalCss, \_ensureCustPanelEl, \_extensionRequest, \_fetchConvsMerged, \_fetchCustomerPanelData, \_fileToDataUrl, \_filterActiveCount, \_flushSnapFetch, \_fmtVnTime, \_getDeliveryOpts, \_getSidebarPageIds, \_handleReplyComment, \_handleSendMessage, \_handleSidebarWsEvent, \_hasChatClient, \_hasExtension, \_hideCustPanel, \_hydrateInboxAvatars, \_isRealFbId, \_loadAndRenderScopeBanner, \_loadAndRenderThread, \_loadFilterStateFor, \_loadInboxSidebar, \_loadOlderIndicatorHtml, \_loadOlderMessages, \_loadPageTagsForFilter, \_loadQuickTags, \_markPrintedCodes, \_mergeSidebarConvs, \_mountChatPanel …
- **[native-orders-kpi.js](../../native-orders/js/native-orders-kpi.js)** ·114 — WEB2.0 module.
    - exposes: `NativeOrdersKpi`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (7): authHeaders, esc, fmtVnd, init, load, render, scheduleReload
- **[native-orders-packing-slip.js](../../native-orders/js/native-orders-packing-slip.js)** ·325 — WEB2.0 module — Phiếu Soạn Hàng cho đơn NHÁP (native-orders).
    - exposes: `NativeOrdersPackingSlip`
    - uses shared: `Web2UserInfo`
    - funcs (10): \_buildPrintHTML, \_ensureModal, \_esc, \_notify, \_print, \_renderRows, \_seller, close, go, open

### so-order — Sổ Order — page controller: tab strip, table render, modals.

- **[so-order-app.js](../../so-order/js/so-order-app.js)** ⚠️5932 — Sổ Order — page controller: tab strip, table render, modals.
    - uses shared: `Popup`, `Web2Auth`, `Web2BarcodeScanner`, `Web2Deeplink`, `Web2Effects`, `Web2Import`, `Web2LabelOcr`, `Web2Optimistic`, `Web2ProductCode`, `Web2ProductsCache`, `Web2SuppliersCache`, `Web2VariantMulti`, `Web2VariantsCache`
    - funcs (188): \_addRowFromScannedCode, \_anchorFloatPanel, \_applyDeeplink, \_applyImageToRow, \_applyShipMetaUi, \_assignKhoCodes, \_bindModalScrollCloseDropdowns, \_buildRowDeleteConfirm, \_buildShipmentDeleteConfirm, \_checkRowsHaveStock, \_checkRowsHaveStockSync, \_clearInlineImage, \_commitSoImport, \_computeRowSpans, \_currentStateSuppliers, \_daysUntilPurge, \_ensureSupplierAsync, \_ensureSupplierCacheSubscription, \_ensureSupplierWithFeedback, \_etaBadgeHtml, \_explodeVariants, \_finalizeDeleteShipment, \_fmtTrashDate, \_generateKhoCode, \_getFloatPanel, \_groupMetaSubHeaderHtml, \_hideFloatPanels, \_hideOtherShipments, \_imgPasteCellHtml, \_isRowLocked, \_isStockCacheReady, \_lookupKhoCode, \_lookupProductStateForRows, \_markDeletePending, \_maybeExpandVndShorthand, \_mostCommonSupplier, \_newModalRow, \_normImportDate, \_noteHasLabel, \_orderInvoiceImageHtml, \_orderReceivedGroupsLast, \_patchReceiveRowFromLookup, \_rImg, \_rInt, \_rPick, \_randomRow, \_readPerOrderMeta, \_refreshInlineImagePreview, \_renderOrderInvoiceImage, \_renderPerOrderMeta, \_rowToKhoMatch, \_saveInlineImage, \_setOrderInvoiceImage, \_shipMetaFlags, \_showAllShipments, \_soImportConfig, \_syncShipMetaAllCheckbox, \_unmarkDeletePending, \_updateBarcodeSummary, \_updateReceiveRowStatus …
- **[so-order-storage.js](../../so-order/js/so-order-storage.js)** ⚠️962 — Sổ Order — IndexedDB cache + Postgres sync (web2Db).
    - exposes: `SoOrderStorage`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2IdbStore`, `Web2SSE`
    - funcs (44): \_defaultState, \_flushPending, \_flushWrite, \_getStore, \_loadFromServer, \_migrateTab, \_mkId, \_read, \_soAuthHeaders, \_subscribeSSE, \_write, addRow, addShipment, addTab, deleteRow, deleteShipment, deleteTab, findShipment, flush, getActiveTab, getColumnVisibility, getOrderAdjustment, getShipmentAdjustTotals, getTrash, init, load, loadCached, moveRow, pullOnce, purgeFromTrash, purgeOldTrash, pushToFirestore, restoreFromTrash, save, setActiveTab, setColumnVisibility, setOrderAdjustment, softDeleteShipment, teardown, updateFooter, updateInvoiceImageForGroup, updateRow, updateShipment, updateTab

### web2/balance-history — WEB2.0 — balance-history app (Phase 3 — 100% Web 2.0).

- **[web2-balance-history-app.js](../../web2/balance-history/js/web2-balance-history-app.js)** ⚠️1280 — WEB2.0 — balance-history app (Phase 3 — 100% Web 2.0).
    - exposes: `Web2BalanceHistoryApp`
    - uses shared: `Popup`, `Web2Auth`, `Web2CustomerChat`, `Web2CustomerDetailModal`, `Web2SSE`, `Web2WalletBalance`
    - funcs (48): \_applyDatePreset, \_currentPresetKey, \_currentUser, \_datePresetRange, \_extractUserFromRow, \_normalizePhoneInput, \_toISODate, \_updateDatePresetActive, authHeaders, autoAssign, autoMatchSingle, autoReprocessOnLoad, bindEvents, cacheDom, debounce, ensureReassignModalDom, ensureReassignStyles, escape, escapeHtml, exportCsv, fbConversation, fmtTime, fmtVnd, init, jsonFetch, linkManual, load, notify, openChatForPhone, openLinkPrompt, openReassignModal, parse, pushBtn, reload, renderChips, renderPagination, renderRow, renderStats, renderTable, reprocessUnmatched, searchCustomers, searchNormalize, setupSSE, stripDiacritics, submitReassign, url, verifBadge, withFallback
- **[web2-link-customer-modal.js](../../web2/balance-history/js/web2-link-customer-modal.js)** ·295 — WEB2.0 — smart customer search modal cho balance-history.
    - exposes: `Web2LinkCustomerModal`
    - uses shared: `Web2Auth`, `PartnerCustomerApi`, `Web2WalletBalance`
    - funcs (15): authHeaders, closeModal, ensureModalDom, ensureStyles, escapeHtml, fmtVnd, jsonFetch, linkAndClose, notify, onManualSubmit, onSearchInput, openModal, renderRow, runSearch, statusBadge
- **[web2-manual-deposit.js](../../web2/balance-history/js/web2-manual-deposit.js)** ·655 — WEB2.0 — manual deposit modal cho balance-history page.
    - exposes: `Web2ManualDeposit`
    - uses shared: `Web2Auth`, `PartnerCustomerApi`, `Web2SuppliersCache`
    - funcs (28): \_cacheGet, \_cacheSet, authHeaders, clearKh, close, doKhSearch, ensureStyles, escapeAttr, escapeHtml, getCurrentUserName, getNccValue, hideNccNewInput, init, isAdmin, jsonFetch, loadNccList, notify, open, pickKh, postManualDeposit, renderKhResults, scheduleSearch, searchKh, searchKhAggregate, searchKhWeb2, showNccNewInput, submit, toggleTargetPanel
- **[web2-partner-enricher.js](../../web2/balance-history/js/web2-partner-enricher.js)** ·148 — WEB2.0 — enrich balance-history rows với WEB2 Partner status.
    - exposes: `Web2PartnerEnricher`
    - uses shared: `PartnerCustomerApi`
    - funcs (10): enrichRow, escapeHtml, flush, init, linkHtml, normPhone, scanAll, scheduleFlush, startObserver, statusPillHtml
- **[web2-pending-match.js](../../web2/balance-history/js/web2-pending-match.js)** ⚠️915 — WEB2.0 — pending match modal.
    - exposes: `Web2PendingMatch`
    - uses shared: `Web2Auth`, `Web2Chat`, `Web2CustomerChat`, `Web2SSE`, `Web2WalletBalance`
    - funcs (39): \_fbRowHtml, \_fetchFbByTail, \_fillFbList, \_filterPendingList, \_normalize, \_normalizePhoneInput, \_renderCustomItem, \_resolveFromChat, \_searchCustomers, \_searchPancakeByPhone, \_setupFbObserver, authHeaders, closeModal, ensureBadge, ensureModalDom, ensureStyles, escapeHtml, fmtTime, fmtVnd, getCurrentUserName, init, jsonFetch, linkManual, listPending, notify, onCustomResolveClick, onCustomSearchInput, onResolveClick, onSearchInput, openModal, refresh, refreshModal, renderItem, renderModalBody, resolvePending, tryFetch, updateBadge, url, withFallback

### web2/ck-dashboard — WEB2.0 module — Dashboard đối soát CK.

- **[ck-dashboard-app.js](../../web2/ck-dashboard/js/ck-dashboard-app.js)** ·458 — WEB2.0 module — Dashboard đối soát CK.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2CkReview`, `Web2HistoryTimeline`, `Web2Optimistic`, `Web2Sidebar`, `Web2SSE`, `Web2UnreadPanel`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (30): ageTxt, apply, bindIntents, bindSig, doFetch, esc, fetchJson, fmtTime, histCard, historyHtml, intentCard, loadCol, loadHistory, onCount, onDone, onSuccess, onchange, onclick, oninput, reloadAll, renderCol, renderHistory, renderStats, rollback, showColSkeletons, sigCard, snapshot, switchTab, wireHistory, wireTabs

### web2/customer-wallet — WEB2.0 — customer-wallet Phase 4 (100% Web 2.0 isolation, NO Firestore).

- **[web2-customer-wallet-app.js](../../web2/customer-wallet/js/web2-customer-wallet-app.js)** ⚠️1314 — WEB2.0 — customer-wallet Phase 4 (100% Web 2.0 isolation, NO Firestore).
    - exposes: `Web2CustomerWalletApp`
    - uses shared: `Popup`, `API_CONFIG`, `PartnerCustomerApi`, `Web2SSE`, `Web2WalletApi`
    - funcs (49): aggregateFromPbh, cacheDom, cardHtml, copyQrCode, csvEscape, debounce, enrichWeb2ForCurrentPage, escapeHtml, exportCsv, fetchAggregateStats, fetchAggregateWeb2Only, fetchAllWeb2Wallets, fetchNativeOrders, fetchOverlay, fetchPbhList, fetchPbhListForPhone, fetchWalletReturns, fetchWeb2ReturnAmountsBatch, fetchWeb2Wallets, fmtDate, fmtTime, fmtVnd, hardReset, init, jsonFetch, load, mergeNativeOrders, normPhone, normalizeOrder, notify, openDetail, push, qrFetch, refreshSinglePhone, renderDetailExtras, renderDetailTabs, renderHistory, renderList, renderOrders, renderPagination, renderQrData, renderQrEmpty, renderQrTab, searchNormalize, setupSSE, stripDiacritics, upsertQr, web2PartnerBadge, wireUi

### web2/customers — WEB2.0 module — Kho KH warehouse (web2_customers). warehouse riêng.

- **[customers-api.js](../../web2/customers/js/customers-api.js)** ·105 — WEB2.0 module — Kho KH warehouse (web2_customers). warehouse riêng.
    - exposes: `CustomersApi`
    - uses shared: `Web2Auth`
    - funcs (10): \_authHeaders, \_fetch, \_qs, create, list, lookupDeep, merge, remove, update, upsert
- **[customers-app.js](../../web2/customers/js/customers-app.js)** ⚠️915 — WEB2.0 module — Kho KH warehouse UI. warehouse riêng.
    - uses shared: `Popup`, `Web2Chat`, `Web2CustomerDetailModal`, `Web2HistoryTimeline`, `Web2Optimistic`, `Web2QrModal`, `Web2SSE`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (37): $, \_getPageIds, \_importPancakeConv, \_searchPancake, addAltAddress, addAltPhone, addPancakeToKho, bind, closeModal, collectForm, doMerge, esc, exportCsv, fbBadges, finishImported, fmtMoney, g, hidePancakeResults, init, load, mk, normPhone, notify, onAction, openModal, renderAltAddresses, renderAltPhones, renderPagination, renderPancakeCards, renderTable, runPancakeFallback, saveModal, scheduleReload, setPrimaryAltAddr, setPrimaryAltPhone, subscribeSse, v

### web2/fastsaleorder-delivery

- **[dlv-app.js](../../web2/fastsaleorder-delivery/dlv-app.js)** ·255
    - exposes: `DlvApp`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Optimistic`, `Web2SSE`
    - funcs (26): $, apply, applyFilters, badge, cancel, changeState, clearFilters, deliver, detail, escapeHtml, fmtDate, goPage, init, load, notify, onSuccess, renderCounters, renderPagination, renderRows, return\_, rollback, run, ship, snapshot, w2pAlert, w2pConfirm

### web2/fastsaleorder-invoice — PBH (Fast Sale Orders) — list/filter/state/print/cancel/delete.

- **[pbh-app.js](../../web2/fastsaleorder-invoice/pbh-app.js)** ⚠️1028 — PBH (Fast Sale Orders) — list/filter/state/print/cancel/delete.
    - exposes: `PbhApp`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Bill`, `Web2Optimistic`, `Web2SSE`
    - funcs (49): $, \_authHeaders, \_fetch, \_findPbhRow, \_loadAndRenderScopeBanner, apply, applyFilters, bulkAction, bulkMerge, bulkPrint, cancelOrder, clearCustomerFilter, clearFilters, confirmOrder, createDelivery, createRefund, detail, escapeHtml, exportCsv, filterByCustomer, fmtDate, fmtMoney, getSelectedNumbers, goPage, init, load, notify, onSuccess, onclick, openCustomer, openHistory, printOrder, reload, renderCounters, renderCustomerChip, renderPagination, renderRow, renderRows, resetStt, rollback, run, snapshot, stateBadge, tbody, unselectAll, updateBulkBar, w2pAlert, w2pConfirm, w2pPrompt

### web2/fastsaleorder-refund

- **[rf-app.js](../../web2/fastsaleorder-refund/rf-app.js)** ·258
    - exposes: `RfApp`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Optimistic`, `Web2SSE`, `Web2UserInfo`
    - funcs (27): $, \_by, apply, applyFilters, approve, badge, cancel, changeState, clearFilters, complete, detail, escapeHtml, fmtDate, fmtMoney, goPage, init, load, notify, onSuccess, renderCounters, renderPagination, renderRows, rollback, run, snapshot, w2pAlert, w2pConfirm

### web2/jt-tracking — WEB2.0 module.

- **[jt-tracking-actions.js](../../web2/jt-tracking/js/jt-tracking-actions.js)** ·314 — WEB2.0 module.
    - exposes: `JtTrackingActions`
    - uses shared: `Web2Chat`, `Web2Optimistic`
    - funcs (12): apply, getPancakePageIds, quickAdd, refreshAll, resolvePancakeConv, rollback, rowAction, run, scanHistory, scanZalo, setBusy, tagPancake
- **[jt-tracking-api.js](../../web2/jt-tracking/js/jt-tracking-api.js)** ·43 — WEB2.0 module.
    - exposes: `JtTrackingApi`
    - uses shared: `Web2Auth`
    - funcs (3): AUTHH, api, relTime
- **[jt-tracking-app.js](../../web2/jt-tracking/js/jt-tracking-app.js)** ·133 — WEB2.0 — Tra cứu vận đơn J&T (orchestrator).
    - exposes: `JtTrackingApp`
    - uses shared: `Web2Sidebar`, `Web2SSE`
    - funcs (3): debounce, init, load
- **[jt-tracking-constants.js](../../web2/jt-tracking/js/jt-tracking-constants.js)** ·116 — WEB2.0 module.
    - exposes: `JtTrackingConst`
    - uses shared: `API_CONFIG`
    - funcs (5): $, ST, esc, icons, notify
- **[jt-tracking-modals.js](../../web2/jt-tracking/js/jt-tracking-modals.js)** ·230 — WEB2.0 module.
    - exposes: `JtTrackingModals`
    - uses shared: `Web2CustomerChat`, `Web2Zalo`
    - funcs (9): bring, close, done, findMessageInChat, jtConfirm, onReady, openChat, openMsgModal, openPasteModal
- **[jt-tracking-render.js](../../web2/jt-tracking/js/jt-tracking-render.js)** ·280 — WEB2.0 module.
    - exposes: `JtTrackingRender`
    - funcs (15): approvedTag, close, copyText, deriveFromDesc, fallbackCopy, fmtDesc, fmtSrcMsg, ok, onEsc, openTimeline, parseOrderInfo, renderKpi, renderList, rowHtml, timelineHtml
- **[jt-tracking-state.js](../../web2/jt-tracking/js/jt-tracking-state.js)** ·125 — WEB2.0 module.
    - exposes: `JtTrackingState`
    - funcs (11): \_persistTag, \_saveTagged, destroyLottie, getGroupConvId, loadBcTags, loadTagged, markTagged, playLottie, setGroupConvId, setTagButtons, unmarkTagged

### web2/kpi — WEB2.0 module.

- **[kpi-assignments.js](../../web2/kpi/js/kpi-assignments.js)** ·413 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2UserInfo`
    - funcs (20): $, authToken, escapeHtml, fmtDate, init, loadCampaigns, loadHistory, loadRanges, loadTotalOrders, loadUsers, notify, onAddRow, onCampaignChange, onSave, renderCampaignDropdown, renderHistory, renderRangesTable, renderStats, validateRanges, wireRowEvents
- **[kpi-dashboard.js](../../web2/kpi/js/kpi-dashboard.js)** ·280 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (13): $, \_authHeaders, escapeHtml, fmtDate, fmtVnd, init, loadCampaigns, loadEvents, loadKpi, refresh, renderCampaignDropdown, renderEventsLog, renderLeaderboard

### web2/modules-manifest.js — Re-run script after adding/removing web2/\* pages.

- **[modules-manifest.js](../../web2/modules-manifest.js)** ·19 — Re-run script after adding/removing web2/\* pages.
    - exposes: `WEB2_MODULES_MANIFEST`

### web2/multi-tool — WEB2.0 — trang Đa dụng: tab tiện ích nội bộ. Tab "Tăng comment" = reply_comment qua Web2Chat (như Pancake gõ+Enter).

- **[multi-tool.js](../../web2/multi-tool/js/multi-tool.js)** ·493 — WEB2.0 — trang Đa dụng: tab tiện ích nội bộ. Tab "Tăng comment" = reply_comment qua Web2Chat (như Pancake gõ+Enter).
    - uses shared: `Web2Auth`, `Web2Chat`, `Web2Sidebar`
    - funcs (27): $, authHeaders, cleanConv, esc, flushMarks, fmtDate, init, loadConvs, loadPages, loadPosts, logLine, markBoost, markBoostIds, nextIdx, notify, onchange, optHtml, parseTs, randText, run, setStat, sleep, updateHint, waitWeb2Chat, wireTabs, worker, workerBase

### web2/pancake-settings — Web 2.0 — Pancake settings page

- **[pancake-settings.js](../../web2/pancake-settings/js/pancake-settings.js)** ⚠️1306 — Web 2.0 — Pancake settings page
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Chat`, `Web2Optimistic`, `Web2PancakeAccounts`, `Web2PancakeToken`, `Web2Sidebar`
    - funcs (48): $, \_expChip, \_restoreBtn, \_setBtnLoading, addAccountAuto, addAccountFromInput, apply, clearJwt, clearPageTokens, closeCredsModal, closeExpiryModal, credsDelete, credsSave, deleteAccount, doAutoFetch, escapeHtml, formatExpiry, generateAll, init, loadAccounts, loadPages, loadRelayPages, notify, nuke, onSuccess, openCredsModal, openExpiryModal, persistActiveToDb, renderAccountList, renderBanner, renderExtStatus, renderJwtInfo, renderPageAdminStats, renderPageList, renderRelayPages, renewAccount, rollback, run, runMonitor, saveJwt, saveRelaySelection, shortToken, syncAccountPages, testJwt, toggleAddPanel, useAccount, wireCredsModal, wireModal

### web2/payment-confirm — Web 2.0 — Trang "Xác nhận Chuyển Khoản"

- **[payment-confirm-app.js](../../web2/payment-confirm/js/payment-confirm-app.js)** ·400 — Web 2.0 — Trang "Xác nhận Chuyển Khoản"
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2HistoryTimeline`, `Web2Optimistic`, `Web2Sidebar`, `Web2SSE`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (28): apply, authHeaders, bindActions, doAction, esc, fetchSignals, fetchUnread, fmtMoney, fmtTime, historyHtml, init, linkOrder, looksLikePaymentMsg, normalize, onchange, onclick, orderLink, reload, reloadNow, reloadUnread, renderSignals, renderUnread, rollback, run, switchTab, toast, updateCounts, userBody

### web2/photo-studio — Studio chụp tách nền — giao diện camera-app mobile-first.

- **[photo-studio.js](../../web2/photo-studio/photo-studio.js)** ⚠️2349 — Studio chụp tách nền — giao diện camera-app mobile-first.
    - exposes: `PhotoStudio`
    - uses shared: `Web2Auth`
    - funcs (128): activate, addPickPoint, applyActiveBg, applyLogoDataUrl, applyMirrorClass, applyMobileDefaults, applyPickMask, authHeaders, autoStartIfAllowed, backToCamera, batchCutout, bgRowHTML, bind, bindReviewGestures, bindSlider, blobToImage, browserName, buildSilhouette, cache, cameraErrorMsg, canvasToBlob, capture, captureSize, chipKey, clamp, closeSheet, cloudCutout, composeAI, cropRect, currentSourceEl, deleteSavedBg, downloadBatchZip, drawBg, drawCover, drawLogo, drawPreset, drawShadow, enterPickMode, exitPickMode, extractPickedObject, fileToImage, finishBrush, frame, getSam, getUpscaler, hexToRgb, hideLoading, id, imgToCanvas, init, initLegacySeg, initSegmentation, isIOS, isMobile, keyOut, lanczos2x, loadImageSrc, loadImgly, loadLogo, loadSavedBgs …
- **[sw.js](../../web2/photo-studio/sw.js)** ·77 — WEB2.0 module.

### web2/product-counter — WEB2.0 module.

- **[product-counter.js](../../web2/product-counter/js/product-counter.js)** ·38 — WEB2.0 module.
    - exposes: `ProductCounterPage`
    - uses shared: `Web2ProductCounter`
    - funcs (2): init, onCount

### web2/products — WEB2.0 module.

- **[web2-product-detail.js](../../web2/products/js/web2-product-detail.js)** ·626 — WEB2.0 module.
    - exposes: `Web2ProductDetail`
    - uses shared: `Web2UserInfo`
    - funcs (29): \_activateTab, \_ensureWired, \_histEntryHtml, \_pane, \_renderEdit, \_renderHistory, \_renderOrders, \_renderOverview, \_renderTab, \_saveEdit, \_setBadge, \_shellHtml, \_wireRowClick, api, app, close, cssEscape, done, esc, fmt, fmtTime, fmtVnd, icons, notify, open, originHint, proxyBase, safeImg, val
- **[web2-products-api.js](../../web2/products/js/web2-products-api.js)** ·148 — Web2 Products API client — /api/web2/products/\* qua Cloudflare Worker.
    - exposes: `Web2ProductsApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (14): \_fetchJson, \_w2Auth, adjustPending, adjustStock, confirmPurchase, create, getBatch, health, list, listPending, remove, update, upsertPending, usage
- **[web2-products-app.js](../../web2/products/js/web2-products-app.js)** ⚠️2011 — Web2 Products — main app: render bảng + CRUD qua modal.
    - exposes: `Web2ProductsApp`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Deeplink`, `Web2Effects`, `Web2Import`, `Web2Optimistic`, `Web2ProductCode`, `Web2ProductsCache`, `Web2SSE`, `Web2SuppliersCache`, `Web2VariantMulti`, `Web2VariantsCache`
    - funcs (80): $, \_bulkCreateVariants, \_bulkPrint, \_clearSelection, \_combinedVariant, \_commitProductImport, \_doRemove, \_handleDeeplink, \_isSizeGroup, \_loadUsageForCurrentPage, \_productImportConfig, \_renderCombinedHint, \_renderVariantMultiPreview, \_requiredBlur, \_rowHtml, \_selectAllVisible, \_setVariantPickers, \_setupSse, \_show, \_toggleSelect, \_updateBulkBar, \_updateRowInPlace, \_updateRowsBatch, \_updateSelectAllState, \_variantKind, \_wireVariantPicker, \_wireVariantPickerFor, apply, applyFilters, autoRegen, clearFilters, closeModal, collectExistingSuppliers, copyCode, counter, cssEscape, debouncedFullLoad, escJs, escapeHtml, fmt, fmtPrice, getColorShortMap, getProduct, getUsage, goPage, init, load, loadSuppliersFromSoOrder, modal, notify, onDocClick, onDone, onResult, onSuccess, openCreate, openEdit, openHistory, openUsagePopover, originPriceHover, pag …
- **[web2-products-print.js](../../web2/products/js/web2-products-print.js)** ⚠️1293 — WEB2.0 module — In tem mã vạch cho web2/products.
    - exposes: `Web2ProductsPrint`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Printer`, `Web2QR`
    - funcs (30): $, \_markProductsPrinted, \_qrKey, \_w2Auth, buildLabelHTML, closeModal, closePrint, draw, escapeHtml, fitName, fitText, formatPrice, genQrDataUrl, generateAndPrint, init, loadJsBarcode, loadQrLib, notify, onclick, onerror, onload, open, renderTableRows, showPrintOverlay, showSelectionModal, stripBrackets, tooTall, tooWide, updateCount, updateSelectAllState

### web2/purchase-refund — CRUD generic qua /api/web2/purchase-refund/\* + state machine qua /api/purchase-refund/:code/{approve|cancel-approve|refunded|reject}.

- **[purchase-refund-app.js](../../web2/purchase-refund/js/purchase-refund-app.js)** ⚠️1635 — CRUD generic qua /api/web2/purchase-refund/\* + state machine qua /api/purchase-refund/:code/{approve|cancel-approve|refunded|reject}.
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2HistoryTimeline`, `Web2IdbStore`, `Web2ProductsCache`, `Web2Sidebar`, `Web2SoOrder`, `Web2SSE`, `Web2SuppliersCache`, `Web2UserInfo`
    - funcs (50): $, \_authHeaders, \_collectBulkLines, \_currentUserInfo, \_orderGroupKey, \_orderGroupLabel, \_populateSupplierDatalist, applyFilters, closeBulkRefund, closeModal, closePicker, closeQuickRefund, confirmPicker, escapeHtml, fetchJson, fmtDate, fmtDateTime, fmtMoney, handleAction, handleFormSubmit, init, loadList, loadSoOrderReceivedItems, loadSourceItems, notify, openBulkRefund, openImageLightbox, openModal, openPicker, openQuickRefund, parseProducts, renderBulkRows, renderDetail, renderList, renderPicker, renderSourceList, safeImageUrl, selectRefund, setupSSE, submitBulkRefund, submitQuickRefund, thumbHtml, updateBulkTotal, updatePickerCount, updateQuickTotal, updateSupplierWallet, wireBulkModal, wirePicker, wireQuickModal, wireSourceList

### web2/reconcile — WEB2.0 module.

- **[reconcile-app.js](../../web2/reconcile/js/reconcile-app.js)** ⚠️1107 — WEB2.0 module.
    - uses shared: `Popup`, `API_CONFIG`, `Web2BarcodeScanner`, `Web2HistoryTimeline`, `Web2LabelOcr`, `Web2SSE`, `Web2UserInfo`
    - funcs (45): \_scheduleSseDetail, \_scheduleSseList, api, b, bindAuditUi, bindUi, cancelPack, closeAuditModal, deliverOrder, escapeHtml, feedback, fetchAudit, fmtDateInvoice, fmtMoney, fmtSttDisplay, fmtTs, fmtTsFull, focusScanner, historyNote, init, inputToTs, loadHistory, loadList, lockBody, notify, onResult, onScan, onScannerSubmit, openAuditModal, packOrder, pad2, renderActionButtons, renderAuditResults, renderDetail, renderLine, renderList, resetPick, returnFailedOrder, selectPbh, setupSse, shipOrder, syncAuditInputs, toggleManualPick, tsToInput, unlockBody

### web2/returns — WEB2.0 module.

- **[returns-api.js](../../web2/returns/js/returns-api.js)** ·114 — WEB2.0 module.
    - exposes: `Web2ReturnsApi`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2UserInfo`
    - funcs (13): \_json, \_user, \_w2Auth, approve, create, customerOrders, list, pending, remove, searchCustomers, searchProducts, sourceOrder, walletBalance
- **[returns-app.js](../../web2/returns/js/returns-app.js)** ·188 — WEB2.0 module.
    - exposes: `Web2Returns`
    - uses shared: `Web2Sidebar`, `Web2SSE`
    - funcs (3): bind, init, setupSse
- **[returns-cod.js](../../web2/returns/js/returns-cod.js)** ·65 — WEB2.0 module.
    - exposes: `ReturnsCod`
    - funcs (3): onCodInput, renderCodCalc, renderCodWallet
- **[returns-core.js](../../web2/returns/js/returns-core.js)** ·73 — WEB2.0 module.
    - exposes: `ReturnsCore`
    - funcs (4): $, esc, fmt, toast
- **[returns-customer.js](../../web2/returns/js/returns-customer.js)** ·145 — WEB2.0 module.
    - exposes: `ReturnsCustomer`
    - uses shared: `Web2WalletBalance`
    - funcs (4): clearCustomer, loadCustomerOrders, onCustInput, pickCustomer
- **[returns-form.js](../../web2/returns/js/returns-form.js)** ·217 — WEB2.0 module.
    - exposes: `ReturnsForm`
    - funcs (10): buildReasonSelect, canSubmit, onIssueChange, onMethodChange, onReasonChange, onReasonShipChange, onSubTypeChange, renderSummary, resetForm, submit
- **[returns-order-items.js](../../web2/returns/js/returns-order-items.js)** ·136 — WEB2.0 module.
    - exposes: `ReturnsItems`
    - funcs (6): pickOrder, renderOrderItems, renderOrderSummary, selectedLines, setLineQty, toggleLine
- **[returns-tabs.js](../../web2/returns/js/returns-tabs.js)** ·192 — WEB2.0 module.
    - exposes: `ReturnsTabs`
    - uses shared: `Popup`, `Web2WalletBalance`
    - funcs (8): \_typeLabel, approve, loadList, loadPending, removeReturn, renderList, renderPending, switchTab

### web2/supplier-debt — WEB2.0 module.

- **[supplier-debt-app.js](../../web2/supplier-debt/js/supplier-debt-app.js)** ⚠️1395 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Deeplink`, `Web2SoOrder`, `Web2SSE`, `Web2SuppliersCache`, `Web2UserInfo`
    - funcs (54): \_onDateChange, \_populateNccNameDatalist, \_sseConnect, aggregate, api, applyFilterAndRender, authHeaders, buildCongNoEntries, confirmNote, confirmPay, congnoTableHtml, cssAttrEscape, csvEscape, currentMonthRange, detailPanelHtml, escapeHtml, exportCsv, fmtDateVN, fmtTime, fmtVnd, getNoteForRow, init, isBefore, isInPeriod, isoToTs, loadAll, loadServerState, loadSoOrder, loadWeb2, makeRow, nfc, notify, openNoteModal, openPayModal, pad, purchasesTableHtml, rateToVnd, readFilters, recordPayment, renderPagination, renderTable, renderTotals, resolveCodeForSupplier, saveSupplier, saveSupplierNote, scheduleReload, setDefaultDateRange, toggleExpand, transactionsTableHtml, updateDetailPanel, updateSortIcons, vnDate, wireDetailTabs, wireUi

### web2/supplier-wallet — WEB2.0 module.

- **[supplier-wallet-app.js](../../web2/supplier-wallet/js/supplier-wallet-app.js)** ⚠️913 — WEB2.0 module.
    - exposes: `SW_DEBUG`
    - uses shared: `Web2Deeplink`, `Web2ProductsCache`, `Web2SSE`, `Web2SuppliersCache`, `Web2UserInfo`
    - funcs (33): \_dbg, \_isRowFullyReturned, \_sseConnect, \_swBy, aggregateSuppliers, cardHtml, confirmCreate, confirmPay, confirmReturn, ensure, escapeHtml, fmtDateVN, fmtTime, fmtVnd, init, loadAndRender, mergeAggregation, nfc, notify, openCreateModal, openDetail, openPayModal, openReturnModal, pollDeposits, pushSync, rateToVnd, recalcReturnTotal, renderDetailTabs, renderHistory, renderList, renderPurchases, scheduleAggregateReload, wireUi
- **[supplier-wallet-storage.js](../../web2/supplier-wallet/js/supplier-wallet-storage.js)** ·420 — WEB2.0 module.
    - exposes: `SupplierWalletStorage`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2IdbStore`, `Web2SoOrder`
    - funcs (21): \_api, \_authHeaders, \_getStore, \_readSoOrderLocal, addTransaction, applyDeposits, cleanupOldTransactions, emptyState, fetchDeposits, flush, getOrCreateWallet, getProcessedSepayIds, init, load, loadCached, loadSoOrderData, matchSupplier, normalize, push, recalcBalance, save

### web2/system — Mount sidebar, điều phối tab (Dịch vụ / Realtime SSE / Các trang), build danh

- **[system-app.js](../../web2/system/js/system-app.js)** ·191 — Mount sidebar, điều phối tab (Dịch vụ / Realtime SSE / Các trang), build danh
    - uses shared: `Web2Sidebar`
    - funcs (9): $, \_cleanLabel, \_esc, \_parseLink, activate, buildPages, init, wireReload, wireTabs
- **[system-services.js](../../web2/system/js/system-services.js)** ·292 — Fetch /api/services-overview + render cards (DB + service inventory + process).
    - exposes: `SystemServices`
    - uses shared: `API_CONFIG`
    - funcs (13): $, \_scheduleRefresh, \_stopRefresh, escapeHtml, fmtBytes, fmtNumber, load, renderAll, renderCostSummary, renderDatabases, renderProcess, renderServices, start
- **[system-sse.js](../../web2/system/js/system-sse.js)** ·365 — Đọc/hiển thị live SSE activity từ server. Tách từ admin-sse-monitor/js/monitor.js;
    - exposes: `SystemSSE`
    - uses shared: `Popup`, `Web2Auth`
    - funcs (21): $, \_scheduleStatsPoll, appendLogRow, authToken, bootstrapLog, esc, fmtTime, isAdmin, matchesFilter, onerror, pollStats, reload, renderLogBody, renderTopics, rerenderAllLogs, setConn, showAccessDenied, start, subscribeLive, tagClass, wireToolbar

### web2/users — WEB2.0 module.

- **[users-app.js](../../web2/users/js/users-app.js)** ·552 — WEB2.0 module.
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Optimistic`, `Web2SSE`
    - funcs (28): \_currentSessionUserId, \_sseConnect, api, apply, authToken, bulkCheck, confirmPasswordSave, confirmPermsSave, confirmUserSave, deactivateUser, escapeHtml, fmtTs, handleAction, init, loadAll, notify, onSuccess, openKpiAssignments, openPasswordModal, openPermsModal, openUserModal, renderList, renderPermsGrid, resetPermsToRoleDefaults, rollback, run, snapshot, wireUi

### web2/variants — Web2 Variants API client — /api/web2/variants/\* qua Cloudflare Worker.

- **[web2-variants-api.js](../../web2/variants/js/web2-variants-api.js)** ·87 — Web2 Variants API client — /api/web2/variants/\* qua Cloudflare Worker.
    - exposes: `Web2VariantsApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (9): \_fetchJson, \_w2Auth, backfillShortCodes, create, health, list, remove, suggestShortCode, update
- **[web2-variants-app.js](../../web2/variants/js/web2-variants-app.js)** ·490 — Kho Biến Thể Web 2.0 — main app: render bảng + CRUD qua modal.
    - exposes: `Web2VariantsApp`
    - uses shared: `Popup`, `Web2Optimistic`, `Web2SSE`, `Web2VariantsCache`
    - funcs (25): $, \_reenable, apply, applyFilters, closeModal, counter, escapeHtml, init, load, modal, notify, onSuccess, openCreate, openEdit, remove, renderCounters, renderGroupOptions, renderRows, rollback, run, saveModal, snapshot, suggestShortCode, tbody, toggleActive

### web2/zalo — WEB2.0 module — Zalo single-source page app.

- **[web2-zalo-app.js](../../web2/zalo/js/web2-zalo-app.js)** ⚠️886 — WEB2.0 module — Zalo single-source page app.
    - uses shared: `Popup`, `Web2SSE`, `Web2UserInfo`, `ZaloApi`, `Web2Zalo`, `WZChat`
    - funcs (46): $, \_\_wzAvErr, \_trap, accCardHtml, addPersonal, avatarHtml, bind, bindConvHead, choiceCardsHtml, closeOaModal, closeQrModal, doLookup, esc, fillAccountSelect, fmtTime, focusTab, getForwardTargets, gridActivate, hideModal, init, initial, loadAccounts, loadConversations, loadTemplates, loadZnsLog, maybeAutoSync, notify, onAccAction, openConversation, openOaModal, openQrModal, pollQr, renderAccounts, renderConvList, renderStatusStrip, saveAddPersonal, saveOa, sendZns, setBusy, showModal, showSelf, skelCards, startQr, subscribeSse, switchTab, syncConversations

### web2/shared — WEB2.0 — emoji dataset + recent helper cho Web2ChatPanel (tách từ pancake-chat-window).

- **[web2-chat-emoji-data.js](../../web2/shared/chat-panel/web2-chat-emoji-data.js)** ·212 — WEB2.0 — emoji dataset + recent helper cho Web2ChatPanel (tách từ pancake-chat-window).
    - exposes: `Web2ChatEmoji`
    - uses shared: `Web2ChatPanel`
    - funcs (2): pushRecent, readRecent
- **[web2-chat-entity-detect.js](../../web2/shared/chat-panel/web2-chat-entity-detect.js)** ·116 — WEB2.0 — nhận diện SĐT + địa chỉ trong tin nhắn chat (Feature 3).
    - exposes: `Web2ChatEntityDetect`
    - funcs (5): addresses, normalizePhone, phones, scan, scanMessages
- **[web2-chat-panel.js](../../web2/shared/chat-panel/web2-chat-panel.js)** ⚠️1049 — WEB2.0 — component chat HỢP NHẤT (Web2ChatPanel) dùng chung native-orders/web2-pancake/balance-history.
    - exposes: `Web2ChatPanel`
    - uses shared: `Web2ChatEmoji`, `Web2ChatEntityDetect`, `Web2ChatStickers`, `API_CONFIG`, `Web2Chat`, `Web2Optimistic`, `Web2QuickReply`
    - funcs (61): $, apply, attachKind, avatarBig, avatarSmall, bindCommon, bindInput, clearAttach, clearReply, createInstance, custOf, dayKey, destroy, doSend, esc, fbAvatarUrl, fmtTime, getState, gradientFor, initialOf, insertEmoji, isOutgoing, jump, loadOlder, loadThread, mount, msgPlain, msgTs, nameOf, onClick, onOutsideClick, onSuccess, onload, open, pageIdOf, parseTs, psidOf, pushMessage, quoted, reJump, reactions, renderAll, renderAttachment, renderDetect, renderMessage, renderPicker, renderQuick, renderShell, renderStats, renderStatus, renderTags, rollback, run, scrollToBottom, sendStickerOptimistic, setAttachment, setMessages, setReply, togglePicker, updateScrollUi …
- **[web2-chat-sticker-data.js](../../web2/shared/chat-panel/web2-chat-sticker-data.js)** ·33 — WEB2.0 — bộ sticker built-in cho Web2ChatPanel (Feature 2 sticker-send).
    - exposes: `Web2ChatStickers`
    - uses shared: `Web2ChatPanel`
    - funcs (1): list
- **[delivery-method-picker.js](../../web2/shared/delivery-method-picker.js)** ·617 — Web 2.0 — Delivery method picker (Vietnam-aware)
    - exposes: `DeliveryMethodPicker`
    - uses shared: `API_CONFIG`
    - funcs (17): \_cleanAddress, \_detectProvince, \_goongToOption, \_hasFuzzy, \_isHcmc, \_lev, \_normalizeFromRecord, \_parseKeywords, fetchFromBackend, geocodeGoong, getOptionsAsync, hasKeyword, normalize, pick, pickAsync, pickOffline, pickRobust
- **[page-builder.js](../../web2/shared/page-builder.js)** ·728 — Web 2.0 generic CRUD page builder — same look as WEB2 list views.
    - exposes: `Web2Page`
    - uses shared: `Popup`, `Web2Api`, `Web2Optimistic`, `Web2SSE`
    - funcs (26): apply, applyFilters, clearFilters, closeModal, destroy, escapeHtml, fmtTime, getPath, goPage, inferRefPageUrl, load, loadName, mount, notify, openCreate, openEdit, removeRecord, renderCounters, renderForm, renderPagination, renderRows, rollback, run, saveModal, setPath, showDropdown
- **[popup.js](../../web2/shared/popup.js)** ·469 — Web 2.0 — Custom Popup (alert / confirm / prompt)
    - exposes: `Popup`
    - uses shared: `Web2Lottie`
    - funcs (19): alert, cleanup, confirm, danger, ensureRoot, ensureStyles, error, exit, finishCancel, finishOk, hexToRgba, info, lockScroll, onKey, open, prompt, success, unlockScroll, warning
- **[web2-api-fetch.js](../../web2/shared/web2-api-fetch.js)** ·82 — WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.
    - exposes: `Web2ApiFetch`
    - uses shared: `WEB2_CONFIG`, `Web2Auth`
    - funcs (4): \_defaultBases, authHeaders, json, withFallback
- **[web2-api.js](../../web2/shared/web2-api.js)** ·94 — Web 2.0 generic API client — talks to /api/web2/:entity/\*
    - exposes: `Web2Api`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2UserInfo`
    - funcs (8): \_authHeaders, \_fetchJson, create, forEntity, health, list, remove, update
- **[web2-auth.js](../../web2/shared/web2-auth.js)** ·243 — Token storage + verify + page guard.
    - exposes: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (11): apiUrl, authHeaders, can, clear, getStored, guardPage, loginUrl, logout, requireAuth, storeLogin, verify
- **[web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js)** ·443 — WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.
    - exposes: `Web2BarcodeScanner`
    - uses shared: `Web2Lottie`, `Web2ProductCounter`
    - funcs (23): beep, cleanup, close, createScanner, destroy, emit, ensureStyles, getCount, loadModule, loop, mount, notify, off, on, onHit, onKey, open, resolveTarget, setTorch, start, stop, stopTracks, vibrate
- **[web2-bill-service.js](../../web2/shared/web2-bill-service.js)** ·745 — WEB2.0 module.
    - exposes: `Web2Bill`
    - uses shared: `Web2Printer`, `Web2QR`, `Web2UserInfo`
    - funcs (19): \_buildBillBody, \_esc, \_fmtDate, \_fmtMoney, \_nl2br, \_printViaIframe, \_renderBarcodeSvg, \_renderCodeMarkup, \_shop, close, generateHTML, generateImage, getMergedSttDisplay, go, onKey, onload, openCombinedPrint, openPreview, openPrint
- **[web2-chat-client.js](../../web2/shared/web2-chat-client.js)** ⚠️1199 — Web 2.0 — Chat client (Pancake + Extension)
    - exposes: `Web2Chat`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (43): \_authHeaders, \_fetchJson, \_isExpired, \_isInstagram, \_loadPageSettingsLs, \_pagesHas, \_persistPageSettingsLs, \_tagContrast, clearAllTokens, decodeJwt, e, enrichCustomer, ensureTags, fetchConversations, fetchConversationsByPage, fetchLivePosts, fetchMessages, fetchPageSettings, fetchTags, generateAllPageAccessTokens, generatePageAccessToken, getAllAccounts, getAllPageAccessTokens, getJwt, getPageAccessToken, getPageAccountJwts, hasTokensFor, listPages, local, p, push, replyComment, resolveTags, searchConversations, sendLiveComment, sendMessage, setJwt, setPageAccessToken, syncFromRenderDB, tagDefsFor, tagPillsHtml, toggleTag, uploadMedia
- **[web2-ck-assign-picker.js](../../web2/shared/web2-ck-assign-picker.js)** ·256 — WEB2.0 — picker gán giao dịch CK (balance-history) cho đơn chưa nhận CK.
    - exposes: `Web2CkAssignPicker`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2UserInfo`
    - funcs (15): authHeaders, close, ensureDom, esc, fmtDate, fmtVnd, getJSON, last9, load, onclick, oninput, open, patchJSON, pick, toast
- **[web2-ck-review.js](../../web2/shared/web2-ck-review.js)** ·490 — WEB2.0 module — đối chiếu & duyệt tín hiệu CK (dùng chung 3 trang).
    - exposes: `Web2CkReview`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2HistoryTimeline`, `Web2SSE`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (24): authHeaders, close, closeOverlay, deb, esc, fmtMoney, fmtTime, historyHtml, injectCss, load, makeOverlay, makePager, normPhone, onDone, onchange, onclick, openReview, openSignalList, scoreTx, sigRowHtml, subscribeRefresh, toast, txRowHtml, userBody
- **[web2-command-palette.js](../../web2/shared/web2-command-palette.js)** ·269 — WEB2.0 shared — Command Palette (Ctrl/Cmd+K) toàn cục.
    - exposes: `Web2CommandPalette`
    - funcs (13): build, close, collectItems, ensureStyles, escapeHtml, norm, onKey, open, renderList, run, score, scrollActive, toggle
- **[web2-customer-chat.js](../../web2/shared/web2-customer-chat.js)** ⚠️842 — WEB2.0 — Web2CustomerChat: launcher chat KH (Pancake + Zalo) dùng chung mọi trang.
    - exposes: `Web2CustomerChat`
    - uses shared: `Web2ChatPanel`, `API_CONFIG`, `Web2Chat`, `Web2Ext`, `Web2Lottie`, `Web2Zalo`
    - funcs (45): \_convRowHtml, \_copyPhone, \_fileToDataUrl, \_getPageIds, \_hasScript, \_loadCss, \_loadScript, \_mAvatarUrl, \_mColor, \_mInitial, \_mTime, \_mergeConvs, \_pageName, \_performSend, \_resolveConvByFbId, \_scrollZalo, \_stateHtml, \_trySendViaExtension, buildPancakeAdapter, close, done, ensureStyles, esc, getPanel, loadInitial, loadMessages, loadOlder, loadPanelBundle, markSelected, mountPancake, mountZalo, notify, onEsc, onerror, onload, open, openModal, paneEl, quickReplies, renderRows, resolvePancakeConv, selectConv, send, showTab, wireSearch
- **[web2-customer-detail-modal.js](../../web2/shared/web2-customer-detail-modal.js)** ·413 — WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/\*.
    - exposes: `Web2CustomerDetailModal`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2CustomerChat`
    - funcs (17): \_notify, \_w2Auth, close, ensureDom, esc, fmtDate, fmtVnd, getJSON, injectStyle, normPhone, open, openChat, renderInfo, renderOrders, renderWallet, saveCustomer, switchTab
- **[web2-customer-lookup.js](../../web2/shared/web2-customer-lookup.js)** ·66 — WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.
    - exposes: `PartnerCustomerApi`, `Web2CustomerLookup`
    - uses shared: `Web2CustomerStore`
    - funcs (6): detectCarrier, formatCurrency, list, listByPhones, statusClass, statusText
- **[web2-customer-store.js](../../web2/shared/web2-customer-store.js)** ·402 — WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.
    - exposes: `Web2CustomerStore`
    - uses shared: `API_CONFIG`, `Web2Auth`, `PartnerCustomerApi`, `Web2CustomerLookup`, `Web2SSE`
    - funcs (25): \_lite, \_post, authHeaders, base, batchByFbIds, batchByPhones, detectCarrier, enrich, formatCurrency, getByFbId, getByPhone, harvestComments, isValidPhone, list, listByPhones, normPhone, normalize, patch, patchByFbId, statusClass, statusText, subscribe, updateStatus, upsert, workerUrl
- **[web2-db-badge.js](../../web2/shared/web2-db-badge.js)** ·145 — Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"
    - exposes: `Web2DbBadge`
    - funcs (6): \_escape, \_findTargetHeading, \_injectCss, \_renderBadge, \_resolveType, mount
- **[web2-deeplink.js](../../web2/shared/web2-deeplink.js)** ·101 — WEB2.0 module.
    - exposes: `Web2Deeplink`
    - funcs (11): enc, go, linkBtn, nativeOrders, param, product, reconcile, root, soOrder, supplierDebt, supplierWallet
- **[web2-effects.js](../../web2/shared/web2-effects.js)** ·794 — Web 2.0 — Effects / animations library
    - exposes: `Web2Effects`
    - funcs (44): \_animate, \_compressImage, \_dur, \_ensureRippleStyle, \_ensureZoomPopup, \_fileToDataUrl, \_hideZoom, \_isZoomable, \_positionZoomPopup, \_showZoom, \_w2Notify, apply, attachHoverZoom, attachImageDropTarget, bounce, confetti, countUp, detach, fadeIn, fadeOut, flash, highlightRow, init, loadConfetti, morphHeight, notify, onDragleave, onDragover, onDrop, onMouseEnter, onPaste, onerror, onload, pulse, ripple, scan, shake, slideIn, slideOut, smoothScroll, staggerIn, step, stop, typewriter
- **[web2-escape.js](../../web2/shared/web2-escape.js)** ·64 — WEB2.0 module.
    - exposes: `Web2Escape`
    - funcs (4): escJs, escapeHtml, safeImageUrl, safeUrl
- **[web2-export-helpers.js](../../web2/shared/web2-export-helpers.js)** ·160 — WEB2.0 module.
    - exposes: `Web2Export`
    - uses shared: `Popup`
    - funcs (9): \_buildBarcodeCanvas, ensureJsBarcode, ensureJsPDF, ensureXLSX, loadScript, onerror, printHTML, toExcel, toPDFBarcodes
- **[web2-extension-bridge.js](../../web2/shared/web2-extension-bridge.js)** ·86 — WEB2 EXTENSION BRIDGE
    - exposes: `Web2Ext`
    - funcs (4): hasExtension, onMsg, request, version
- **[web2-format.js](../../web2/shared/web2-format.js)** ·92 — WEB2.0 shared — 1 NGUỒN format tiền/ngày/giờ (GMT+7) cho Web 2.0.
    - exposes: `Web2Format`
    - funcs (8): \_fmt, date, dateTime, num, parseTs, rel, time, vnd
- **[web2-history-timeline.js](../../web2/shared/web2-history-timeline.js)** ·238 — Web2HistoryTimeline — render lịch sử chỉnh sửa kèm tên user
    - exposes: `Web2HistoryTimeline`
    - funcs (5): \_escapeHtml, \_fmtDateTime, \_injectCss, render, renderEntry
- **[web2-idb-store.js](../../web2/shared/web2-idb-store.js)** ·183 — Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.
    - exposes: `Web2IdbStore`
    - funcs (13): \_idbGet, \_idbRemove, \_idbSet, \_key, \_maybeMigrateFromLs, \_openConnection, onblocked, onerror, onsuccess, onupgradeneeded, open, ready, remove
- **[web2-import.js](../../web2/shared/web2-import.js)** ·564 — WEB2.0 module.
    - exposes: `Web2Import`
    - funcs (31): buildHeaderMap, buildSampleCsv, close, detectDelimiter, downloadSample, downloadText, esc, escClose, escapeHtml, handleFile, normKey, normalizeRecords, notify, onCommit, onProgress, onchange, onclick, onerror, onload, open, parseBool, parseCsv, parseInput, parseNumber, q, renderFromText, renderPreview, sampleJson, structureHtml, switchTab, validateRows
- **[web2-label-ocr.js](../../web2/shared/web2-label-ocr.js)** ·433 — WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.
    - exposes: `Web2LabelOcr`
    - uses shared: `Web2BarcodeScanner`, `Web2ProductCounter`
    - funcs (20): captureRoi, cleanup, ensureStyles, getTrocr, getWorker, loadTesseract, notify, onKey, onerror, onload, open, p, recognizeHandwritten, setLoading, shoot, showCamera, showResult, start, stopTracks, use
- **[web2-lottie.js](../../web2/shared/web2-lottie.js)** ·391 — WEB2.0 module.
    - exposes: `Web2Lottie`
    - uses shared: `Web2Optimistic`
    - funcs (21): ASSET_BASE, SCRIPT_SRC, \_enhanceDeclarative, \_enhanceEmptyStates, \_enhanceOneEmptyIcon, \_reap, \_resolveEl, \_startObserver, boot, burst, cleanup, destroy, ensureLib, error, injectCss, loadingOverlay, onerror, onload, play, scan, success
- **[web2-motion.js](../../web2/shared/web2-motion.js)** ·98 — WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.
    - exposes: `Web2Motion`
    - funcs (4): enterOnLoad, pop, reveal, staggerIn
- **[web2-msg-template.js](../../web2/shared/web2-msg-template.js)** ⚠️962 — Web 2.0 — Bulk Message Template Modal
    - exposes: `Web2MsgTemplate`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Chat`, `Web2SSE`, `Web2UserInfo`
    - funcs (35): \_authHeaders, \_cancelActiveJob, \_closeModal, \_deleteTemplate, \_drainExtension, \_ensureModal, \_ensurePill, \_extSendOne, \_fetchJob, \_fillTemplate, \_formatLines, \_formatVnd, \_handleSend, \_hidePill, \_isSent, \_loadSent, \_loadTemplates, \_mapIn, \_markSent, \_maybeReattachActive, \_onProgress, \_openEditModal, \_pollJob, \_refreshIcons, \_renderCards, \_saveSent, \_saveTemplate, \_sendItemViaExtension, \_sleep, \_startWatch, \_stopWatch, \_toast, \_updatePill, onclick, open
- **[web2-new-msg-badge.js](../../web2/shared/web2-new-msg-badge.js)** ·305 — Web 2.0 — New-message badge for native-orders rows
    - exposes: `Web2NewMsgBadge`
    - uses shared: `Web2Realtime`
    - funcs (13): \_ensureStyle, \_loadFromStorage, \_pruneRecentlyReplied, \_saveReplied, \_saveToStorage, clearAll, clearPendingForCustomer, getPendingCustomers, init, onEvent, onIncomingMessage, reapply, setPendingCustomers
- **[web2-notification-bell.js](../../web2/shared/web2-notification-bell.js)** ·186
    - exposes: `Web2NotificationBell`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (16): \_attachOutsideClick, \_authHeaders, \_fetchList, \_fetchUnreadCount, \_markAllRead, \_markRead, \_refresh, \_relTime, \_render, \_resolveOverviewBase, \_subscribeSSE, escapeAttr, escapeHtml, mount, onclick, safeUrl
- **[web2-notify.js](../../web2/shared/web2-notify.js)** ·49 — WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.
    - exposes: `Web2Notify`
    - uses shared: `Popup`
    - funcs (5): error, info, show, success, warning
- **[web2-optimistic.js](../../web2/shared/web2-optimistic.js)** ·110 — Codifies pattern: snapshot → apply optimistic UI → fire backend background →
    - exposes: `Web2Optimistic`
    - uses shared: `Web2Lottie`
    - funcs (6): \_notify, apply, onSuccess, rollback, run, snapshot
- **[web2-pack-counter.js](../../web2/shared/web2-pack-counter.js)** ·427 — WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.
    - exposes: `Web2PackCounter`
    - uses shared: `Web2BarcodeScanner`, `Web2LabelOcr`
    - funcs (22): cleanup, computeImgToDisp, drawMarkers, ensureStyles, estimateCenters, fitOverlay, loadCv, notify, onKey, onTap, onerror, onload, open, poll, ready, recount, setLoading, shoot, showCamera, start, stopTracks, use
- **[web2-pancake-accounts.js](../../web2/shared/web2-pancake-accounts.js)** ·299 — Web 2.0 — Pancake ACCOUNTS manager (DB-backed)
    - exposes: `Web2PancakeAccounts`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Chat`
    - funcs (15): \_authHeaders, \_decode, \_json, addFromToken, deleteCreds, getActiveId, getRefreshStatus, isExpired, list, refreshNow, remove, saveCreds, setActiveLocal, setEnabled, updatePages
- **[web2-pancake-token.js](../../web2/shared/web2-pancake-token.js)** ·206 — Web 2.0 — Pancake JWT token monitor + auto-refresh
    - exposes: `Web2PancakeToken`
    - uses shared: `Web2Chat`
    - funcs (8): \_decode, applyToken, cleanup, ensureFresh, fetchFromExtension, getStatus, isExtensionPresent, onMessage
- **[web2-phone-utils.js](../../web2/shared/web2-phone-utils.js)** ·38 — WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.
    - exposes: `Web2PhoneUtils`
    - uses shared: `Web2CustomerStore`
    - funcs (3): display, isValid, norm
- **[web2-printer.js](../../web2/shared/web2-printer.js)** ·704 — WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.
    - exposes: `Web2Printer`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (37): \_ascii, \_b64, \_canvasToEscpos, \_canvasToTsplBitmap, \_fire, \_genId, \_isLabelLang, \_loadScript, \_migrateToServer, \_printers, \_read, \_recToPrinter, \_w2Auth, bridgeAlive, dotsWidth, escposRasterFromHtml, escposRasterFromHtmlPhysical, escposRasterFromSvg, getPrinter, getPrinterFor, getPrinters, getRoles, loadPrinters, onPrintersChanged, onerror, onload, printBillHtml, printEscpos, printHtml, printSvg, put, removePrinter, roleIsBridge, setRole, testConnection, tsplFromHtmlPhysical, upsertPrinter
- **[web2-product-code.js](../../web2/shared/web2-product-code.js)** ·594 — WEB2.0 module.
    - exposes: `Web2ProductCode`
    - funcs (15): basePrefix, buildColorShortMap, buildPrefixMap, clean, extractColor, extractColorWithMap, extractSize, extractType, generate, isColorWord, removeDiacritics, resolvePrefix, suggest, suggestWithMap, toAsciiUpper
- **[web2-product-counter.js](../../web2/shared/web2-product-counter.js)** ·539 — WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.
    - exposes: `Web2ProductCounter`
    - uses shared: `WEB2_CONFIG`, `Web2CustomerChat`, `Web2Lottie`
    - funcs (32): categoryName, close, createController, destroy, drawBoxes, emit, ensureStyles, filterDets, flipCamera, getCount, getDetections, getDetector, isRunning, loadVision, loop, make, median, mount, notify, off, on, onKey, open, p, resolveTarget, setCount, setStatus, setToggleUi, start, stop, stopTracks, toggle
- **[web2-products-cache.js](../../web2/shared/web2-products-cache.js)** ·450 — Web2 Products — Shared cache + Firestore tickler realtime
    - exposes: `Web2ProductsCache`
    - uses shared: `Web2SSE`
    - funcs (34): \_emit, \_ensureApi, \_generateClientId, \_idbGet, \_idbSet, \_loadFromPersist, \_loadList, \_migrateLegacyLsToIdb, \_normalize, \_openIdb, \_removeLocal, \_saveToPersist, \_scheduleRefresh, \_setupRealtime, \_upsertLocal, findByCode, findByName, findByNameExact, findByNameVariant, getAll, has, hasByName, init, initPromise, isReady, onblocked, onerror, onsuccess, onupgradeneeded, pushTickle, refresh, scoreFor, sortTier, subscribe
- **[web2-qr-modal.js](../../web2/shared/web2-qr-modal.js)** ·299 — WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.
    - exposes: `Web2QrModal`
    - uses shared: `Web2Auth`
    - funcs (12): \_w2Auth, close, copyCode, ensureDom, ensureStyles, fetchOrCreate, open, qrRequest, refresh, renderData, showError, showLoading
- **[web2-qr.js](../../web2/shared/web2-qr.js)** ·348 — WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.
    - exposes: `Web2QR`
    - uses shared: `Web2Printer`
    - funcs (16): \_EC, \_finderTopLeft, \_loadScript, \_moduleShape, \_styledEye, \_svgToDataUrl, \_xmlEsc, card, cardDataUrl, isDark, matrix, onerror, onload, ready, toDataUrl, toSvg
- **[web2-quick-reply.js](../../web2/shared/web2-quick-reply.js)** ·656 — Web 2.0 — Quick Reply system
    - exposes: `Web2QuickReply`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`
    - funcs (31): \_authHeaders, \_closeModal, \_ensureStyle, \_escapeHtml, \_findCandidates, \_loadCache, \_matchShortcut, \_notify, \_openForm, \_positionDropdown, \_renderDropdown, \_renderModalList, \_saveCache, \_stripDiacritics, addReply, applySelected, attachAutocomplete, close, deleteReply, detachAutocomplete, getReplies, hide, loadReplies, onBlur, onInput, onKey, onResize, openModal, show, signature, updateReply
- **[web2-realtime.js](../../web2/shared/web2-realtime.js)** ·599 — Web 2.0 — Realtime client (Pancake WS)
    - exposes: `Web2Realtime`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Chat`
    - funcs (27): \_clientSession, \_connectDirect, \_connectProxy, \_decodeUser, \_emit, \_joinDirectChannels, \_joinDirectPage, \_makeRef, \_onDirectMessage, \_safeCall, \_scheduleDirectReconnect, \_scheduleProxyReconnect, \_startDirectHeartbeat, \_stopDirectHeartbeat, fetchPendingCustomers, isConnected, markReplied, mode, onclose, onerror, onmessage, onopen, rnd, start, startMulti, subscribe, unsubscribe
- **[web2-return-bill.js](../../web2/shared/web2-return-bill.js)** ·59 — WEB2.0 module.
    - exposes: `NativeReturnBill`
    - uses shared: `Popup`, `API_CONFIG`
    - funcs (3): \_normPhone, collect, fetchQueued
- **[web2-sidebar.js](../../web2/shared/web2-sidebar.js)** ·629 — WEB2-clone sidebar for Web 2.0 pages.
    - exposes: `Web2Sidebar`
    - uses shared: `DeliveryMethodPicker`, `Popup`, `Web2ApiFetch`, `Web2Auth`, `Web2CommandPalette`, `Web2Escape`, `Web2Format`, `Web2Lottie`, `Web2Notify`, `Web2PhoneUtils`, `Web2TextUtils`
    - funcs (17): SCRIPT_BASE_URL, \_isAdmin, alertSoon, autoLoadSharedModules, escapeHtml, inject, isCollapsed, isOurRoute, isWeb2Item, mount, onclick, renderGroup, renderItem, renderUserFooter, resolveOur, setCollapsed, toggleCollapse
- **[web2-so-order-reader.js](../../web2/shared/web2-so-order-reader.js)** ·53 — WEB2.0 module.
    - exposes: `Web2SoOrder`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (2): \_authHeaders, load
- **[web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js)** ·244 — WEB2.0 module.
    - exposes: `Web2SSE`
    - funcs (10): \_dispatchResync, \_openConnection, \_refreshConnectionForTopicChange, \_scheduleReconnect, close, handleData, onerror, subscribe, topics, unsubscribe
- **[web2-sse-topics.js](../../web2/shared/web2-sse-topics.js)** ·29 — WEB2.0 module.
    - exposes: `Web2SSETopics`
    - uses shared: `Web2SSE`
- **[web2-suppliers-cache.js](../../web2/shared/web2-suppliers-cache.js)** ·223 — WEB2.0 module.
    - exposes: `Web2SuppliersCache`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (14): \_attachSse, \_authHeaders, \_loadFromServer, \_normalize, \_notify, \_setNames, ensure, getNames, has, init, initPromise, refresh, search, subscribe
- **[web2-text-utils.js](../../web2/shared/web2-text-utils.js)** ·41 — WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.
    - exposes: `Web2TextUtils`
    - funcs (4): asciiUpper, includes, searchNormalize, stripDiacritics
- **[web2-unread-panel.js](../../web2/shared/web2-unread-panel.js)** ·149 — WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).
    - exposes: `Web2UnreadPanel`
    - uses shared: `API_CONFIG`, `Web2SSE`, `Web2WalletBalance`
    - funcs (10): \_debouncedReload, ensureStyles, esc, fetchUnread, fmtTime, looksLikePaymentMsg, mount, normalize, reload, render
- **[web2-user-info.js](../../web2/shared/web2-user-info.js)** ·154 — WEB2.0 module.
    - exposes: `Web2UserInfo`
    - uses shared: `Web2Auth`
    - funcs (6): \_readLegacyAuth, \_readWeb2Auth, attachToBody, attachToPayload, detectSourcePage, label
- **[web2-variant-multi.js](../../web2/shared/web2-variant-multi.js)** ·192 — WEB2.0 module.
    - exposes: `Web2VariantMulti`
    - uses shared: `Web2VariantsCache`
    - funcs (9): \_combine, \_dedupe, \_isSizeGroup, cartesian, classifyToken, detect, expand, parse, split
- **[web2-variants-cache.js](../../web2/shared/web2-variants-cache.js)** ·231 — Web2 Variants — Shared cache + Firestore tickler realtime
    - exposes: `Web2VariantsCache`
    - uses shared: `Web2ProductCode`, `Web2SSE`
    - funcs (17): \_clientId, \_emit, \_loadList, \_normalize, \_scheduleRefresh, \_setupRealtime, findByValue, findByValueExact, getAll, getAllIncludingInactive, getColorShortMap, has, init, initPromise, pushTickle, refresh, subscribe
- **[web2-wallet-api.js](../../web2/shared/web2-wallet-api.js)** ·212 — WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).
    - exposes: `Web2WalletApi`
    - uses shared: `Web2Auth`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (12): \_authHeaders, \_userName, deposit, formatVnd, getTransactions, getWallet, getWalletsByPhones, jsonFetch, listWallets, normPhone, tryBatch, withdraw
- **[web2-wallet-balance.js](../../web2/shared/web2-wallet-balance.js)** ·315 — WEB2.0 — shared helper hiển thị số dư ví KH.
    - exposes: `Web2WalletBalance`
    - uses shared: `Web2Auth`, `Web2CustomerDetailModal`, `Web2SSE`, `Web2WalletApi`
    - funcs (20): \_ensureModal, \_fetchBalance, \_fetchBatch, \_openDetail, \_ownBase, \_w2Auth, \_wireClick, \_wireSse, attachBalances, ensureStyles, fmtVnd, getBalance, getBalances, invalidate, normPhone, onerror, onload, p, pillHtml, tryFetch
- **[web2-zalo-api.js](../../web2/shared/web2-zalo-api.js)** ·200 — WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).
    - exposes: `ZaloApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (38): \_authHeaders, \_fetch, \_qs, accounts, backfill, conversations, createAccount, deleteAccount, disconnect, forward, friends, groupMembers, groups, loadHistory, loginQr, lookup, messages, oaConnect, qr, quickReplies, react, recall, reconnect, seen, self, sendCs, sendFile, sendImage, sendMessage, sendSticker, sendZns, status, stickers, syncConversations, syncTemplates, typing, znsLog, znsTemplates
- **[web2-zalo.js](../../web2/shared/web2-zalo.js)** ·296 — WEB2.0 shared — Web2Zalo helper (single-source Zalo).
    - exposes: `Web2Zalo`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`, `Web2WalletBalance`, `ZaloApi`, `WZChat`
    - funcs (18): \_authHeaders, \_btnHtml, \_fetch, \_hasScript, \_loadCss, \_loadScript, \_wireClick, attachZaloButtons, ensureStyles, getConversation, loadChatEngine, mountChat, normPhone, onerror, openChat, sendMessage, sendZNS, status
- **[bubbles.js](../../web2/shared/zalo-chat/bubbles.js)** ·227 — WEB2.0 module — Zalo chat message renderer.
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (11): \_legacy, \_msgUrl, body, bubbleKind, fmtText, imgTag, reactionsRow, renderMessages, replyRow, statusTick, tools
- **[chat-actions.js](../../web2/shared/zalo-chat/chat-actions.js)** ·90 — WEB2.0 module — Zalo chat actions (network + optimistic).
    - exposes: `WZChat`
    - uses shared: `Web2Optimistic`, `ZaloApi`, `WZChat`
    - funcs (6): emitTyping, forward, markSeen, react, recall, throttled
- **[chat-store.js](../../web2/shared/zalo-chat/chat-store.js)** ·214 — WEB2.0 module — Zalo chat shared store + utils (WZChat.\*).
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (24): \_closeMenu, \_find, \_onMenuDoc, \_previewOf, addPending, avatarHtml, clearPending, clearReply, dayKey, dayLabel, esc, fmtTime, getPending, getReplyTarget, initial, markRecalled, markSeen, notify, openMenu, patchReaction, removePending, setConversation, setMessages, setReplyTarget
- **[chat-view.js](../../web2/shared/zalo-chat/chat-view.js)** ·647 — WEB2.0 shared — Zalo chat VIEW (mount 1 hội thoại vào bất kỳ container).
    - exposes: `WZChat`
    - uses shared: `Popup`, `ZaloApi`, `Web2Zalo`, `WZChat`
    - funcs (39): \_bindSearch, \_clearSearch, \_computeMatches, \_gotoMatch, \_loadAllForSearch, \_markInline, \_paintSearch, \_retry, \_runSearch, \_srchNorm, \_toggleSearch, \_updateSearchCount, bindBody, body, destroy, doForward, doReact, doRecall, findMsg, headName, loadOlder, mountConversation, near, onSendFile, onSendMedia, onSendSticker, onSendText, onTyping, optimistic, reconcile, refetch, refresh, reload, renderBody, sendMediaRaw, sendTextRaw, setTyping, shell, updateHead
- **[composer.js](../../web2/shared/zalo-chat/composer.js)** ·457 — WEB2.0 module — Zalo chat composer (input đầy đủ).
    - exposes: `WZChat`
    - uses shared: `ZaloApi`, `WZChat`
    - funcs (25): \_applyMent, \_buildMentions, \_closeMent, \_isGroup, \_loadMembers, \_mentionCtx, \_normMent, \_renderMent, \_updateMent, addFiles, doSend, focus, grow, items, mountComposer, onerror, onload, openQuickReplies, readFile, refresh, renderReplyBar, renderTray, reset, setReply, store
- **[emoji-picker.js](../../web2/shared/zalo-chat/emoji-picker.js)** ·105 — WEB2.0 module — Zalo chat emoji picker (client-only).
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (7): \_position, close, gridHtml, onDoc, openEmojiPicker, pushRecent, recents
- **[lightbox.js](../../web2/shared/zalo-chat/lightbox.js)** ·86 — WEB2.0 module — Zalo chat lightbox (xem ảnh full + prev/next).
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (6): close, collectThreadImages, go, onKey, openLightbox, render
- **[reactions.js](../../web2/shared/zalo-chat/reactions.js)** ·65 — WEB2.0 module — Zalo chat reaction bar (add-only).
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (5): close, onDoc, onKey, openReactionBar, reactionEmoji
- **[realtime.js](../../web2/shared/zalo-chat/realtime.js)** ·56 — WEB2.0 module — Zalo chat realtime (SSE patch).
    - exposes: `WZChat`
    - uses shared: `Web2SSE`, `WZChat`
    - funcs (5): handle, onTyping, refetch, subscribeRealtime, unsub
- **[sticker-picker.js](../../web2/shared/zalo-chat/sticker-picker.js)** ·113 — WEB2.0 module — Zalo chat sticker picker.
    - exposes: `WZChat`
    - uses shared: `ZaloApi`
    - funcs (8): cellHtml, close, load, onDoc, openStickerPicker, pushRecent, recents, setGrid

## 4. Hàm trùng tên (≥3 file) — ứng viên rút vào `web2/shared/`

| Hàm                | Số file | Gợi ý                                                 | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escapeHtml`       | 31      | → `Web2Escape` (web2-escape.js)                       | inventory-panel.js, utils.js, native-orders-app.js, so-order-app.js, web2-balance-history-app.js, web2-link-customer-modal.js, web2-manual-deposit.js, web2-partner-enricher.js, web2-pending-match.js, web2-customer-wallet-app.js, dlv-app.js, pbh-app.js, rf-app.js, kpi-assignments.js, kpi-dashboard.js, pancake-settings.js, web2-products-app.js, web2-products-print.js, purchase-refund-app.js, reconcile-app.js, page-builder.js, web2-command-palette.js, web2-escape.js, web2-import.js, web2-notification-bell.js, web2-sidebar.js, supplier-debt-app.js, supplier-wallet-app.js, system-services.js, users-app.js, web2-variants-app.js |
| `_authHeaders`     | 17      | → `Web2Auth.authHeaders`                              | native-orders-api.js, customers-api.js, pbh-app.js, kpi-dashboard.js, purchase-refund-app.js, web2-api.js, web2-chat-client.js, web2-msg-template.js, web2-notification-bell.js, web2-pancake-accounts.js, web2-quick-reply.js, web2-so-order-reader.js, web2-suppliers-cache.js, web2-wallet-api.js, web2-zalo-api.js, web2-zalo.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                      |
| `fmtTime`          | 17      | → shared format ngày/giờ GMT+7 (nên gom `Web2Format`) | comments-mobile.js, live-order-history.js, web2-balance-history-app.js, web2-pending-match.js, ck-dashboard-app.js, web2-customer-wallet-app.js, payment-confirm-app.js, web2-product-detail.js, web2-chat-panel.js, page-builder.js, web2-ck-review.js, web2-unread-panel.js, chat-store.js, supplier-debt-app.js, supplier-wallet-app.js, system-sse.js, web2-zalo-app.js                                                                                                                                                                                                                                                                           |
| `authHeaders`      | 14      | → `Web2Auth.authHeaders`                              | native-orders-kpi.js, web2-balance-history-app.js, web2-link-customer-modal.js, web2-manual-deposit.js, web2-pending-match.js, multi-tool.js, payment-confirm-app.js, photo-studio.js, web2-api-fetch.js, web2-auth.js, web2-ck-assign-picker.js, web2-ck-review.js, web2-customer-store.js, supplier-debt-app.js                                                                                                                                                                                                                                                                                                                                     |
| `ensureStyles`     | 14      | → CSS shared / theme thay vì inject lặp               | web2-link-customer-modal.js, web2-manual-deposit.js, web2-pending-match.js, popup.js, web2-barcode-scanner.js, web2-command-palette.js, web2-customer-chat.js, web2-label-ocr.js, web2-pack-counter.js, web2-product-counter.js, web2-qr-modal.js, web2-unread-panel.js, web2-wallet-balance.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                         |
| `fmtVnd`           | 13      | → shared format tiền (nên gom `Web2Format`)           | native-orders-kpi.js, so-order-app.js, web2-balance-history-app.js, web2-link-customer-modal.js, web2-pending-match.js, web2-customer-wallet-app.js, kpi-dashboard.js, web2-product-detail.js, web2-ck-assign-picker.js, web2-customer-detail-modal.js, web2-wallet-balance.js, supplier-debt-app.js, supplier-wallet-app.js                                                                                                                                                                                                                                                                                                                          |
| `_w2Auth`          | 10      | → `Web2Auth.authHeaders`                              | debt-manager.js, so-order-app.js, web2-products-api.js, web2-products-print.js, returns-api.js, web2-customer-detail-modal.js, web2-printer.js, web2-qr-modal.js, web2-wallet-balance.js, web2-variants-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `fmtDate`          | 10      | → shared format ngày/giờ GMT+7 (nên gom `Web2Format`) | web2-customer-wallet-app.js, dlv-app.js, pbh-app.js, rf-app.js, kpi-assignments.js, kpi-dashboard.js, multi-tool.js, purchase-refund-app.js, web2-ck-assign-picker.js, web2-customer-detail-modal.js                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `normPhone`        | 10      | → `Web2CustomerStore` (normPhone)                     | live-kho-enricher.js, web2-partner-enricher.js, web2-customer-wallet-app.js, customers-app.js, web2-ck-review.js, web2-customer-detail-modal.js, web2-customer-store.js, web2-wallet-api.js, web2-wallet-balance.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `renderPagination` | 10      | → `Web2Page` (page-builder) nếu là list-page          | native-orders-app.js, web2-balance-history-app.js, web2-customer-wallet-app.js, customers-app.js, dlv-app.js, pbh-app.js, rf-app.js, web2-products-app.js, page-builder.js, supplier-debt-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `closeModal`       | 9       | → `Web2Page` (page-builder) nếu là list-page          | live-customer-panel.js, web2-link-customer-modal.js, web2-pending-match.js, customers-app.js, web2-products-app.js, web2-products-print.js, purchase-refund-app.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `applyFilters`     | 8       | → `Web2Page` (page-builder) nếu là list-page          | native-orders-app.js, dlv-app.js, pbh-app.js, rf-app.js, web2-products-app.js, purchase-refund-app.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `fmtMoney`         | 8       | → shared format tiền (nên gom `Web2Format`)           | live-order-history.js, customers-app.js, pbh-app.js, rf-app.js, payment-confirm-app.js, purchase-refund-app.js, reconcile-app.js, web2-ck-review.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `renderList`       | 8       | → `Web2Page` (page-builder) nếu là list-page          | web2-customer-wallet-app.js, jt-tracking-render.js, purchase-refund-app.js, reconcile-app.js, returns-tabs.js, web2-command-palette.js, supplier-wallet-app.js, users-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `renderRows`       | 8       | → `Web2Page` (page-builder) nếu là list-page          | native-orders-app.js, dlv-app.js, pbh-app.js, rf-app.js, web2-products-app.js, page-builder.js, web2-customer-chat.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `_esc`             | 7       | → `Web2Escape` (web2-escape.js)                       | live-chat-modal.js, live-hidden-commenters.js, live-livestream-gallery.js, live-livestream-snap.js, native-orders-packing-slip.js, web2-bill-service.js, system-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `reload`           | 7       |                                                       | live-livestream-gallery.js, web2-balance-history-app.js, pbh-app.js, payment-confirm-app.js, web2-unread-panel.js, chat-view.js, system-sse.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `renderCounters`   | 7       |                                                       | native-orders-app.js, dlv-app.js, pbh-app.js, rf-app.js, web2-products-app.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `_fetchJson`       | 6       |                                                       | live-native-orders-api.js, native-orders-api.js, web2-products-api.js, web2-api.js, web2-chat-client.js, web2-variants-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `clearFilters`     | 6       |                                                       | native-orders-app.js, dlv-app.js, pbh-app.js, rf-app.js, web2-products-app.js, page-builder.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `goPage`           | 6       |                                                       | native-orders-app.js, dlv-app.js, pbh-app.js, rf-app.js, web2-products-app.js, page-builder.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `jsonFetch`        | 6       |                                                       | web2-balance-history-app.js, web2-link-customer-modal.js, web2-manual-deposit.js, web2-pending-match.js, web2-customer-wallet-app.js, web2-wallet-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `normalize`        | 6       |                                                       | live-status.js, payment-confirm-app.js, delivery-method-picker.js, web2-customer-store.js, web2-unread-panel.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `openModal`        | 6       |                                                       | web2-link-customer-modal.js, web2-pending-match.js, customers-app.js, purchase-refund-app.js, web2-customer-chat.js, web2-quick-reply.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `switchTab`        | 6       |                                                       | ck-dashboard-app.js, payment-confirm-app.js, returns-tabs.js, web2-customer-detail-modal.js, web2-import.js, web2-zalo-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `toast`            | 6       |                                                       | comments-mobile.js, live-livestream-snap.js, payment-confirm-app.js, returns-core.js, web2-ck-assign-picker.js, web2-ck-review.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `_notify`          | 5       |                                                       | native-orders-packing-slip.js, web2-customer-detail-modal.js, web2-optimistic.js, web2-quick-reply.js, web2-suppliers-cache.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `_w2AuthHeaders`   | 5       | → `Web2Auth.authHeaders`                              | live-api.js, live-campaign-manager.js, live-init.js, live-livestream-snap.js, pancake-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `exportCsv`        | 5       |                                                       | web2-balance-history-app.js, web2-customer-wallet-app.js, customers-app.js, pbh-app.js, supplier-debt-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `initialize`       | 5       |                                                       | column-manager.js, settings-manager.js, live-init.js, pancake-init.js, pancake-token-manager.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `loadOlder`        | 5       |                                                       | pancake-chat-window.js, native-orders-app.js, web2-chat-panel.js, web2-customer-chat.js, chat-view.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `norm`             | 5       |                                                       | live-init.js, live-customer-sync.js, so-order-app.js, web2-command-palette.js, web2-phone-utils.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `_fetch`           | 4       |                                                       | customers-api.js, pbh-app.js, web2-zalo-api.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `_fileToDataUrl`   | 4       |                                                       | pancake-chat-window.js, native-orders-app.js, web2-customer-chat.js, web2-effects.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `_loadScript`      | 4       |                                                       | web2-customer-chat.js, web2-printer.js, web2-qr.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `_normalize`       | 4       |                                                       | web2-pending-match.js, web2-products-cache.js, web2-suppliers-cache.js, web2-variants-cache.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `_scheduleRefresh` | 4       |                                                       | inventory-panel.js, web2-products-cache.js, web2-variants-cache.js, system-services.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `_sseConnect`      | 4       |                                                       | native-orders-app.js, supplier-debt-app.js, supplier-wallet-app.js, users-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `_toast`           | 4       |                                                       | live-hidden-commenters.js, live-livestream-gallery.js, live-livestream-snap.js, web2-msg-template.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `_user`            | 4       |                                                       | live-livestream-gallery.js, live-livestream-snap.js, inventory-panel.js, returns-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `debounce`         | 4       |                                                       | utils.js, web2-balance-history-app.js, web2-customer-wallet-app.js, jt-tracking-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `deleteAccount`    | 4       |                                                       | settings-manager.js, pancake-token-manager.js, pancake-settings.js, web2-zalo-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `flush`            | 4       |                                                       | live-kho-enricher.js, so-order-storage.js, web2-partner-enricher.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `health`           | 4       |                                                       | native-orders-api.js, web2-products-api.js, web2-api.js, web2-variants-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `loadHistory`      | 4       |                                                       | ck-dashboard-app.js, kpi-assignments.js, reconcile-app.js, web2-zalo-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `openEdit`         | 4       |                                                       | native-orders-app.js, web2-products-app.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `parseTs`          | 4       |                                                       | comments-mobile.js, multi-tool.js, web2-chat-panel.js, web2-format.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `quickReplies`     | 4       |                                                       | pancake-chat-window.js, native-orders-app.js, web2-customer-chat.js, web2-zalo-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ready`            | 4       |                                                       | live-init.js, web2-idb-store.js, web2-pack-counter.js, web2-qr.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `renderHistory`    | 4       |                                                       | ck-dashboard-app.js, web2-customer-wallet-app.js, kpi-assignments.js, supplier-wallet-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `renderRow`        | 4       |                                                       | native-orders-app.js, web2-balance-history-app.js, web2-link-customer-modal.js, pbh-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `renderStats`      | 4       |                                                       | web2-balance-history-app.js, ck-dashboard-app.js, kpi-assignments.js, web2-chat-panel.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `saveModal`        | 4       |                                                       | customers-app.js, web2-products-app.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `scan`             | 4       |                                                       | live-kho-enricher.js, web2-chat-entity-detect.js, web2-effects.js, web2-lottie.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `sendMessage`      | 4       |                                                       | pancake-chat-window.js, web2-chat-client.js, web2-zalo-api.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `stopTracks`       | 4       |                                                       | web2-barcode-scanner.js, web2-label-ocr.js, web2-pack-counter.js, web2-product-counter.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `tbody`            | 4       |                                                       | native-orders-app.js, pbh-app.js, web2-products-app.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `w2pAlert`         | 4       |                                                       | native-orders-app.js, dlv-app.js, pbh-app.js, rf-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `w2pConfirm`       | 4       |                                                       | native-orders-app.js, dlv-app.js, pbh-app.js, rf-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `wireUi`           | 4       |                                                       | web2-customer-wallet-app.js, supplier-debt-app.js, supplier-wallet-app.js, users-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

_…và 48 hàm trùng khác (xem web2-codemap.json)._

## 5. File quá lớn (> 800 dòng) — cần tách module

| File                                                                                                             | Dòng |
| ---------------------------------------------------------------------------------------------------------------- | ---- |
| [native-orders/js/native-orders-app.js](../../native-orders/js/native-orders-app.js)                             | 9457 |
| [so-order/js/so-order-app.js](../../so-order/js/so-order-app.js)                                                 | 5932 |
| [live-chat/js/live/live-livestream-snap.js](../../live-chat/js/live/live-livestream-snap.js)                     | 4569 |
| [live-chat/js/live/live-comment-list.js](../../live-chat/js/live/live-comment-list.js)                           | 2460 |
| [web2/photo-studio/photo-studio.js](../../web2/photo-studio/photo-studio.js)                                     | 2349 |
| [web2/products/js/web2-products-app.js](../../web2/products/js/web2-products-app.js)                             | 2011 |
| [web2/purchase-refund/js/purchase-refund-app.js](../../web2/purchase-refund/js/purchase-refund-app.js)           | 1635 |
| [web2/supplier-debt/js/supplier-debt-app.js](../../web2/supplier-debt/js/supplier-debt-app.js)                   | 1395 |
| [web2/customer-wallet/js/web2-customer-wallet-app.js](../../web2/customer-wallet/js/web2-customer-wallet-app.js) | 1314 |
| [live-chat/js/pancake/pancake-token-manager.js](../../live-chat/js/pancake/pancake-token-manager.js)             | 1310 |
| [web2/pancake-settings/js/pancake-settings.js](../../web2/pancake-settings/js/pancake-settings.js)               | 1306 |
| [web2/products/js/web2-products-print.js](../../web2/products/js/web2-products-print.js)                         | 1293 |
| [web2/balance-history/js/web2-balance-history-app.js](../../web2/balance-history/js/web2-balance-history-app.js) | 1280 |
| [live-chat/server/server.js](../../live-chat/server/server.js)                                                   | 1216 |
| [web2/shared/web2-chat-client.js](../../web2/shared/web2-chat-client.js)                                         | 1199 |
| [live-chat/js/pancake/inventory-panel.js](../../live-chat/js/pancake/inventory-panel.js)                         | 1178 |
| [live-chat/js/live/live-init.js](../../live-chat/js/live/live-init.js)                                           | 1137 |
| [live-chat/js/live/comments-mobile.js](../../live-chat/js/live/comments-mobile.js)                               | 1132 |
| [web2/reconcile/js/reconcile-app.js](../../web2/reconcile/js/reconcile-app.js)                                   | 1107 |
| [web2/shared/chat-panel/web2-chat-panel.js](../../web2/shared/chat-panel/web2-chat-panel.js)                     | 1049 |
| [web2/fastsaleorder-invoice/pbh-app.js](../../web2/fastsaleorder-invoice/pbh-app.js)                             | 1028 |
| [so-order/js/so-order-storage.js](../../so-order/js/so-order-storage.js)                                         | 962  |
| [web2/shared/web2-msg-template.js](../../web2/shared/web2-msg-template.js)                                       | 962  |
| [web2/balance-history/js/web2-pending-match.js](../../web2/balance-history/js/web2-pending-match.js)             | 915  |
| [web2/customers/js/customers-app.js](../../web2/customers/js/customers-app.js)                                   | 915  |
| [web2/supplier-wallet/js/supplier-wallet-app.js](../../web2/supplier-wallet/js/supplier-wallet-app.js)           | 913  |
| [web2/zalo/js/web2-zalo-app.js](../../web2/zalo/js/web2-zalo-app.js)                                             | 886  |
| [web2/shared/web2-customer-chat.js](../../web2/shared/web2-customer-chat.js)                                     | 842  |
