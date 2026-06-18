<!-- AUTO-GENERATED bởi scripts/gen-web2-codemap.js — KHÔNG SỬA TAY. Regenerate: node scripts/gen-web2-codemap.js -->

# WEB2-CODEMAP — Bản đồ code Web 2.0

> **Auto-generated** • 2026-06-18 23:38 • 299 files, 78 shared modules, 2557 hàm, 7 file > 800 dòng.
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
| `Popup`                                    | [popup.js](../../web2/shared/popup.js)                                                | Web 2.0 — Custom Popup (alert / confirm / prompt)                                                       | 38        |
| `Web2ApiFetch`                             | [web2-api-fetch.js](../../web2/shared/web2-api-fetch.js)                              | WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.                                  | 1         |
| `Web2Api`                                  | [web2-api.js](../../web2/shared/web2-api.js)                                          | Web 2.0 generic API client — talks to /api/web2/:entity/\*                                              | 1         |
| `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`    | [web2-auth.js](../../web2/shared/web2-auth.js)                                        | Token storage + verify + page guard.                                                                    | 85        |
| `Web2BarcodeScanner`                       | [web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js)                  | WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.               | 4         |
| `Web2Bill`                                 | [web2-bill-service.js](../../web2/shared/web2-bill-service.js)                        | WEB2.0 module.                                                                                          | 2         |
| `Web2Chat`                                 | [web2-chat-client.js](../../web2/shared/web2-chat-client.js)                          | Web 2.0 — Chat client (Pancake + Extension)                                                             | 26        |
| `Web2CkAssignPicker`                       | [web2-ck-assign-picker.js](../../web2/shared/web2-ck-assign-picker.js)                | WEB2.0 — picker gán giao dịch CK (balance-history) cho đơn chưa nhận CK.                                | 1         |
| `Web2CkReview`                             | [web2-ck-review.js](../../web2/shared/web2-ck-review.js)                              | WEB2.0 module — đối chiếu & duyệt tín hiệu CK (dùng chung 3 trang).                                     | 2         |
| `Web2CommandPalette`                       | [web2-command-palette.js](../../web2/shared/web2-command-palette.js)                  | WEB2.0 shared — Command Palette (Ctrl/Cmd+K) toàn cục.                                                  | 1         |
| `Web2CustomerChat`                         | [web2-customer-chat.js](../../web2/shared/web2-customer-chat.js)                      | WEB2.0 — Web2CustomerChat: launcher chat KH (Pancake + Zalo) dùng chung mọi trang.                      | 6         |
| `Web2CustomerDetailModal`                  | [web2-customer-detail-modal.js](../../web2/shared/web2-customer-detail-modal.js)      | WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/\*.                  | 3         |
| `PartnerCustomerApi`, `Web2CustomerLookup` | [web2-customer-lookup.js](../../web2/shared/web2-customer-lookup.js)                  | WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.                                                   | 7         |
| `Web2CustomerStore`                        | [web2-customer-store.js](../../web2/shared/web2-customer-store.js)                    | WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.                                                 | 8         |
| `Web2DbBadge`                              | [web2-db-badge.js](../../web2/shared/web2-db-badge.js)                                | Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"                                   | 0         |
| `Web2Deeplink`                             | [web2-deeplink.js](../../web2/shared/web2-deeplink.js)                                | WEB2.0 module.                                                                                          | 7         |
| `Web2Effects`                              | [web2-effects.js](../../web2/shared/web2-effects.js)                                  | Web 2.0 — Effects / animations library                                                                  | 4         |
| `Web2Escape`                               | [web2-escape.js](../../web2/shared/web2-escape.js)                                    | WEB2.0 module.                                                                                          | 1         |
| `Web2Export`                               | [web2-export-helpers.js](../../web2/shared/web2-export-helpers.js)                    | WEB2.0 module.                                                                                          | 0         |
| `Web2Ext`                                  | [web2-extension-bridge.js](../../web2/shared/web2-extension-bridge.js)                | WEB2 EXTENSION BRIDGE                                                                                   | 2         |
| `Web2Format`                               | [web2-format.js](../../web2/shared/web2-format.js)                                    | WEB2.0 shared — 1 NGUỒN format tiền/ngày/giờ (GMT+7) cho Web 2.0.                                       | 1         |
| `Web2HistoryTimeline`                      | [web2-history-timeline.js](../../web2/shared/web2-history-timeline.js)                | Web2HistoryTimeline — render lịch sử chỉnh sửa kèm tên user                                             | 8         |
| `Web2IdbStore`                             | [web2-idb-store.js](../../web2/shared/web2-idb-store.js)                              | Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.                                   | 3         |
| `Web2Import`                               | [web2-import.js](../../web2/shared/web2-import.js)                                    | WEB2.0 module.                                                                                          | 4         |
| `Web2LabelOcr`                             | [web2-label-ocr.js](../../web2/shared/web2-label-ocr.js)                              | WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.    | 3         |
| `Web2Lottie`                               | [web2-lottie.js](../../web2/shared/web2-lottie.js)                                    | WEB2.0 module.                                                                                          | 6         |
| `Web2Motion`                               | [web2-motion.js](../../web2/shared/web2-motion.js)                                    | WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.                                 | 0         |
| `W2MT`                                     | [web2-msg-template-core.js](../../web2/shared/web2-msg-template-core.js)              | WEB2.0 module.                                                                                          | 3         |
| `W2MT`                                     | [web2-msg-template-send.js](../../web2/shared/web2-msg-template-send.js)              | WEB2.0 module.                                                                                          | 3         |
| `W2MT`                                     | [web2-msg-template-ui.js](../../web2/shared/web2-msg-template-ui.js)                  | WEB2.0 module.                                                                                          | 3         |
| `W2MT`, `Web2MsgTemplate`                  | [web2-msg-template.js](../../web2/shared/web2-msg-template.js)                        | WEB2.0 module.                                                                                          | 4         |
| `Web2NewMsgBadge`                          | [web2-new-msg-badge.js](../../web2/shared/web2-new-msg-badge.js)                      | Web 2.0 — New-message badge for native-orders rows                                                      | 1         |
| `Web2NotificationBell`                     | [web2-notification-bell.js](../../web2/shared/web2-notification-bell.js)              |                                                                                                         | 0         |
| `Web2Notify`                               | [web2-notify.js](../../web2/shared/web2-notify.js)                                    | WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.                                                       | 1         |
| `Web2Optimistic`                           | [web2-optimistic.js](../../web2/shared/web2-optimistic.js)                            | Codifies pattern: snapshot → apply optimistic UI → fire backend background →                            | 21        |
| `Web2PackCounter`                          | [web2-pack-counter.js](../../web2/shared/web2-pack-counter.js)                        | WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.               | 0         |
| `Web2PancakeAccounts`                      | [web2-pancake-accounts.js](../../web2/shared/web2-pancake-accounts.js)                | Web 2.0 — Pancake ACCOUNTS manager (DB-backed)                                                          | 4         |
| `Web2PancakeToken`                         | [web2-pancake-token.js](../../web2/shared/web2-pancake-token.js)                      | Web 2.0 — Pancake JWT token monitor + auto-refresh                                                      | 2         |
| `Web2PhoneUtils`                           | [web2-phone-utils.js](../../web2/shared/web2-phone-utils.js)                          | WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.                                                   | 1         |
| `Web2Printer`                              | [web2-printer.js](../../web2/shared/web2-printer.js)                                  | WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.             | 3         |
| `Web2ProductCode`                          | [web2-product-code.js](../../web2/shared/web2-product-code.js)                        | WEB2.0 module.                                                                                          | 5         |
| `Web2ProductCounter`                       | [web2-product-counter.js](../../web2/shared/web2-product-counter.js)                  | WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.                       | 3         |
| `Web2ProductsCache`                        | [web2-products-cache.js](../../web2/shared/web2-products-cache.js)                    | Web2 Products — Shared cache + Firestore tickler realtime                                               | 17        |
| `Web2QrModal`                              | [web2-qr-modal.js](../../web2/shared/web2-qr-modal.js)                                | WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.                     | 1         |
| `Web2QR`                                   | [web2-qr.js](../../web2/shared/web2-qr.js)                                            | WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.                                 | 3         |
| `Web2QuickReply`                           | [web2-quick-reply.js](../../web2/shared/web2-quick-reply.js)                          | Web 2.0 — Quick Reply system                                                                            | 2         |
| `Web2Realtime`                             | [web2-realtime.js](../../web2/shared/web2-realtime.js)                                | Web 2.0 — Realtime client (Pancake WS)                                                                  | 3         |
| `NativeReturnBill`                         | [web2-return-bill.js](../../web2/shared/web2-return-bill.js)                          | WEB2.0 module.                                                                                          | 1         |
| `Web2Sidebar`                              | [web2-sidebar.js](../../web2/shared/web2-sidebar.js)                                  | WEB2-clone sidebar for Web 2.0 pages.                                                                   | 8         |
| `Web2SoOrder`                              | [web2-so-order-reader.js](../../web2/shared/web2-so-order-reader.js)                  | WEB2.0 module.                                                                                          | 5         |
| `Web2SSE`                                  | [web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js)                            | WEB2.0 module.                                                                                          | 49        |
| `Web2SSETopics`                            | [web2-sse-topics.js](../../web2/shared/web2-sse-topics.js)                            | WEB2.0 module.                                                                                          | 0         |
| `Web2SuppliersCache`                       | [web2-suppliers-cache.js](../../web2/shared/web2-suppliers-cache.js)                  | WEB2.0 module.                                                                                          | 8         |
| `Web2TextUtils`                            | [web2-text-utils.js](../../web2/shared/web2-text-utils.js)                            | WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.                                 | 1         |
| `Web2UnreadPanel`                          | [web2-unread-panel.js](../../web2/shared/web2-unread-panel.js)                        | WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).                | 1         |
| `Web2UserInfo`                             | [web2-user-info.js](../../web2/shared/web2-user-info.js)                              | WEB2.0 module.                                                                                          | 22        |
| `Web2VariantMulti`                         | [web2-variant-multi.js](../../web2/shared/web2-variant-multi.js)                      | WEB2.0 module.                                                                                          | 4         |
| `Web2VariantsCache`                        | [web2-variants-cache.js](../../web2/shared/web2-variants-cache.js)                    | Web2 Variants — Shared cache + Firestore tickler realtime                                               | 11        |
| `Web2WalletApi`                            | [web2-wallet-api.js](../../web2/shared/web2-wallet-api.js)                            | WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).                                           | 4         |
| `Web2WalletBalance`                        | [web2-wallet-balance.js](../../web2/shared/web2-wallet-balance.js)                    | WEB2.0 — shared helper hiển thị số dư ví KH.                                                            | 19        |
| `ZaloApi`                                  | [web2-zalo-api.js](../../web2/shared/web2-zalo-api.js)                                | WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).                                                       | 8         |
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
**Dùng bởi:** `live-chat/js/live/live-chat-modal.js`, `live-chat/js/pancake/inventory-panel-render.js`, `live-chat/js/pancake/pancake-chat-window.js`, `native-orders/js/native-orders-app.js`, `web2/shared/chat-panel/web2-chat-emoji-data.js`, `web2/shared/chat-panel/web2-chat-sticker-data.js`, `web2/shared/web2-customer-chat.js`

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
**Dùng bởi:** `live-chat/js/layout/settings-manager.js`, `live-chat/js/live/live-campaign-manager.js`, `live-chat/js/live/live-comment-list-events.js`, `live-chat/js/live/live-livestream-gallery.js`, `live-chat/js/live/live-livestream-snap-actions.js`, `live-chat/js/live/live-livestream-snap-lock.js`, `live-chat/js/live/live-livestream-snap-render.js`, `live-chat/js/live/live-livestream-snap-ui.js`, `live-chat/js/pancake/inventory-panel-render.js`, `live-chat/js/pancake/pancake-context-menu.js`, `native-orders/js/native-orders-app.js`, `so-order/js/so-order-toolbar.js`, `web2/balance-history/js/web2-bh-link-customer.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customers/js/customers-detail.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-state.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-products-actions.js`, `web2/purchase-refund/js/purchase-refund-actions.js`, `web2/reconcile/js/reconcile-actions.js`, `web2/returns/js/returns-tabs.js`, `web2/shared/page-builder.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-export-helpers.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`, `web2/shared/web2-notify.js`, `web2/shared/web2-quick-reply.js`, `web2/shared/web2-return-bill.js`, `web2/shared/web2-sidebar.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/system/js/system-sse.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/zalo/js/web2-zalo-accounts.js`

#### `Web2ApiFetch` — [web2/shared/web2-api-fetch.js](../../web2/shared/web2-api-fetch.js) · 82 dòng

WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Api` — [web2/shared/web2-api.js](../../web2/shared/web2-api.js) · 94 dòng

Web 2.0 generic API client — talks to /api/web2/:entity/\*
**Dùng bởi:** `web2/shared/page-builder.js`

#### `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth` — [web2/shared/web2-auth.js](../../web2/shared/web2-auth.js) · 243 dòng

Token storage + verify + page guard.
**Dùng bởi:** `live-chat/js/api-config.js`, `live-chat/js/live/comments-mobile-state.js`, `live-chat/js/live/live-api.js`, `live-chat/js/live/live-campaign-manager.js`, `live-chat/js/live/live-comment-list-base.js`, `live-chat/js/live/live-hidden-commenters.js`, `live-chat/js/live/live-init-state.js`, `live-chat/js/live/live-livestream-snap-lock.js`, `live-chat/js/live/live-livestream-snap-state.js`, `live-chat/js/live/live-native-orders-api.js`, `live-chat/js/live/live-state.js`, `live-chat/js/pancake/inventory-panel-state.js`, `live-chat/js/pancake/pancake-api.js`, `live-chat/js/pancake/pancake-chat-window.js`, `live-chat/js/pancake/pancake-page-access-tokens.js`, `live-chat/js/pancake/pancake-state.js`, `live-chat/js/shared/debt-manager.js`, `live-chat/js/shared/live-customer-sync.js`, `native-orders/js/native-orders-api.js`, `native-orders/js/native-orders-app.js`, `native-orders/js/native-orders-kpi.js`, `so-order/js/so-order-state.js`, `so-order/js/so-order-storage.js`, `web2/balance-history/js/web2-bh-core.js`, `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/balance-history/js/web2-pm-core.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customer-wallet/js/web2-customer-wallet-state.js`, `web2/customers/js/customers-api.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-api.js`, `web2/fastsaleorder-invoice/pbh-state.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/jt-tracking/js/jt-tracking-api.js`, `web2/jt-tracking/js/jt-tracking-constants.js`, `web2/kpi/js/kpi-assignments.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/multi-tool/js/multi-tool.js`, `web2/pancake-settings/js/pancake-settings-api.js`, `web2/pancake-settings/js/pancake-settings-state.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/photo-studio/photo-studio-bg.js`, `web2/products/js/web2-products-api.js`, `web2/products/js/web2-products-print-barcode.js`, `web2/products/js/web2-products-print-utils.js`, `web2/products/js/web2-products-state.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/purchase-refund/js/purchase-refund-state.js`, `web2/reconcile/js/reconcile-state.js`, `web2/returns/js/returns-api.js`, `web2/shared/chat-panel/web2-chat-panel.js`, `web2/shared/delivery-method-picker.js`, `web2/shared/web2-api-fetch.js`, `web2/shared/web2-api.js`, `web2/shared/web2-chat-client.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-customer-store.js`, `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-notification-bell.js`, `web2/shared/web2-pancake-accounts.js`, `web2/shared/web2-printer.js`, `web2/shared/web2-product-counter.js`, `web2/shared/web2-qr-modal.js`, `web2/shared/web2-quick-reply.js`, `web2/shared/web2-realtime.js`, `web2/shared/web2-return-bill.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-so-order-reader.js`, `web2/shared/web2-suppliers-cache.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-user-info.js`, `web2/shared/web2-wallet-api.js`, `web2/shared/web2-wallet-balance.js`, `web2/shared/web2-zalo-api.js`, `web2/shared/web2-zalo.js`, `web2/supplier-debt/js/supplier-debt-api.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`, `web2/system/js/system-services.js`, `web2/system/js/system-sse.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-api.js`

#### `Web2BarcodeScanner` — [web2/shared/web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js) · 443 dòng

WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.
**Dùng bởi:** `so-order/js/so-order-modal-core.js`, `web2/reconcile/js/reconcile-app.js`, `web2/shared/web2-label-ocr.js`, `web2/shared/web2-pack-counter.js`

#### `Web2Bill` — [web2/shared/web2-bill-service.js](../../web2/shared/web2-bill-service.js) · 745 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-app.js`, `web2/fastsaleorder-invoice/pbh-actions.js`

#### `Web2Chat` — [web2/shared/web2-chat-client.js](../../web2/shared/web2-chat-client.js) · 1199 dòng

Web 2.0 — Chat client (Pancake + Extension)
**Dùng bởi:** `live-chat/js/live/comments-mobile-actions.js`, `live-chat/js/live/comments-mobile-entry.js`, `live-chat/js/live/live-chat-modal.js`, `live-chat/js/live/live-comment-list-state.js`, `live-chat/js/live/live-init-lifecycle.js`, `live-chat/js/pancake/pancake-api.js`, `live-chat/js/pancake/pancake-chat-window.js`, `live-chat/js/pancake/pancake-realtime.js`, `live-chat/js/pancake/pancake-token-manager.js`, `live-chat/js/pancake/pancake-token-sources.js`, `native-orders/js/native-orders-app.js`, `web2/balance-history/js/web2-pm-customer-search.js`, `web2/customers/js/customers-events.js`, `web2/jt-tracking/js/jt-tracking-actions.js`, `web2/multi-tool/js/multi-tool.js`, `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/pancake-settings/js/pancake-settings-api.js`, `web2/pancake-settings/js/pancake-settings-render.js`, `web2/pancake-settings/js/pancake-settings-state.js`, `web2/pancake-settings/js/pancake-settings.js`, `web2/shared/chat-panel/web2-chat-panel.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-pancake-accounts.js`, `web2/shared/web2-pancake-token.js`, `web2/shared/web2-realtime.js`

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
**Dùng bởi:** `web2/balance-history/js/web2-balance-history-app.js`, `web2/balance-history/js/web2-bh-chat-export.js`, `web2/balance-history/js/web2-pm-render.js`, `web2/jt-tracking/js/jt-tracking-modals.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-product-counter.js`

#### `Web2CustomerDetailModal` — [web2/shared/web2-customer-detail-modal.js](../../web2/shared/web2-customer-detail-modal.js) · 413 dòng

WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/\*.
**Dùng bởi:** `web2/balance-history/js/web2-bh-render.js`, `web2/customers/js/customers-detail.js`, `web2/shared/web2-wallet-balance.js`

#### `PartnerCustomerApi`, `Web2CustomerLookup` — [web2/shared/web2-customer-lookup.js](../../web2/shared/web2-customer-lookup.js) · 66 dòng

WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.
**Dùng bởi:** `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/balance-history/js/web2-partner-enricher.js`, `web2/customer-wallet/js/web2-customer-wallet-api.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customer-wallet/js/web2-customer-wallet-render.js`, `web2/shared/web2-customer-store.js`

#### `Web2CustomerStore` — [web2/shared/web2-customer-store.js](../../web2/shared/web2-customer-store.js) · 402 dòng

WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.
**Dùng bởi:** `live-chat/js/live/live-api.js`, `live-chat/js/live/live-comment-list-actions.js`, `live-chat/js/live/live-comment-list-render-list.js`, `live-chat/js/live/live-comment-list-render-row.js`, `live-chat/js/shared/live-customer-sync.js`, `live-chat/js/shared/live-status.js`, `web2/shared/web2-customer-lookup.js`, `web2/shared/web2-phone-utils.js`

#### `Web2DbBadge` — [web2/shared/web2-db-badge.js](../../web2/shared/web2-db-badge.js) · 145 dòng

Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"

#### `Web2Deeplink` — [web2/shared/web2-deeplink.js](../../web2/shared/web2-deeplink.js) · 101 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `so-order/js/so-order-render.js`, `web2/products/js/web2-products-app.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-debt/js/supplier-debt-render.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`, `web2/supplier-wallet/js/supplier-wallet-render.js`

#### `Web2Effects` — [web2/shared/web2-effects.js](../../web2/shared/web2-effects.js) · 794 dòng

Web 2.0 — Effects / animations library
**Dùng bởi:** `native-orders/js/native-orders-app.js`, `so-order/js/so-order-image-modal.js`, `so-order/js/so-order-modal-image.js`, `web2/products/js/web2-products-app.js`

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
**Dùng bởi:** `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-detail.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/purchase-refund/js/purchase-refund-render.js`, `web2/reconcile/js/reconcile-api.js`, `web2/reconcile/js/reconcile-app.js`, `web2/reconcile/js/reconcile-state.js`, `web2/shared/web2-ck-review.js`

#### `Web2IdbStore` — [web2/shared/web2-idb-store.js](../../web2/shared/web2-idb-store.js) · 183 dòng

Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.
**Dùng bởi:** `so-order/js/so-order-storage.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`

#### `Web2Import` — [web2/shared/web2-import.js](../../web2/shared/web2-import.js) · 564 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-import.js`, `so-order/js/so-order-toolbar.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-modal.js`

#### `Web2LabelOcr` — [web2/shared/web2-label-ocr.js](../../web2/shared/web2-label-ocr.js) · 433 dòng

WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.
**Dùng bởi:** `so-order/js/so-order-modal-core.js`, `web2/reconcile/js/reconcile-app.js`, `web2/shared/web2-pack-counter.js`

#### `Web2Lottie` — [web2/shared/web2-lottie.js](../../web2/shared/web2-lottie.js) · 391 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/popup.js`, `web2/shared/web2-barcode-scanner.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-optimistic.js`, `web2/shared/web2-product-counter.js`, `web2/shared/web2-sidebar.js`

#### `Web2Motion` — [web2/shared/web2-motion.js](../../web2/shared/web2-motion.js) · 98 dòng

WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.

#### `W2MT` — [web2/shared/web2-msg-template-core.js](../../web2/shared/web2-msg-template-core.js) · 258 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`

#### `W2MT` — [web2/shared/web2-msg-template-send.js](../../web2/shared/web2-msg-template-send.js) · 456 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`

#### `W2MT` — [web2/shared/web2-msg-template-ui.js](../../web2/shared/web2-msg-template-ui.js) · 264 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`

#### `W2MT`, `Web2MsgTemplate` — [web2/shared/web2-msg-template.js](../../web2/shared/web2-msg-template.js) · 88 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-app.js`, `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`

#### `Web2NewMsgBadge` — [web2/shared/web2-new-msg-badge.js](../../web2/shared/web2-new-msg-badge.js) · 305 dòng

Web 2.0 — New-message badge for native-orders rows
**Dùng bởi:** `native-orders/js/native-orders-app.js`

#### `Web2NotificationBell` — [web2/shared/web2-notification-bell.js](../../web2/shared/web2-notification-bell.js) · 186 dòng

#### `Web2Notify` — [web2/shared/web2-notify.js](../../web2/shared/web2-notify.js) · 49 dòng

WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Optimistic` — [web2/shared/web2-optimistic.js](../../web2/shared/web2-optimistic.js) · 110 dòng

Codifies pattern: snapshot → apply optimistic UI → fire backend background →
**Dùng bởi:** `live-chat/js/live/live-comment-list-actions.js`, `live-chat/js/live/live-livestream-gallery.js`, `native-orders/js/native-orders-app.js`, `so-order/js/so-order-kho-sync.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-app.js`, `web2/customers/js/customers-state.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-actions.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/jt-tracking/js/jt-tracking-actions.js`, `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-products-actions.js`, `web2/products/js/web2-products-modal.js`, `web2/shared/chat-panel/web2-chat-panel.js`, `web2/shared/page-builder.js`, `web2/shared/web2-lottie.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`

#### `Web2PackCounter` — [web2/shared/web2-pack-counter.js](../../web2/shared/web2-pack-counter.js) · 427 dòng

WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.

#### `Web2PancakeAccounts` — [web2/shared/web2-pancake-accounts.js](../../web2/shared/web2-pancake-accounts.js) · 299 dòng

Web 2.0 — Pancake ACCOUNTS manager (DB-backed)
**Dùng bởi:** `live-chat/js/pancake/pancake-token-manager.js`, `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/pancake-settings/js/pancake-settings-api.js`, `web2/pancake-settings/js/pancake-settings-render.js`

#### `Web2PancakeToken` — [web2/shared/web2-pancake-token.js](../../web2/shared/web2-pancake-token.js) · 206 dòng

Web 2.0 — Pancake JWT token monitor + auto-refresh
**Dùng bởi:** `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/pancake-settings/js/pancake-settings-render.js`

#### `Web2PhoneUtils` — [web2/shared/web2-phone-utils.js](../../web2/shared/web2-phone-utils.js) · 38 dòng

WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Printer` — [web2/shared/web2-printer.js](../../web2/shared/web2-printer.js) · 704 dòng

WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.
**Dùng bởi:** `web2/products/js/web2-products-print-modal.js`, `web2/shared/web2-bill-service.js`, `web2/shared/web2-qr.js`

#### `Web2ProductCode` — [web2/shared/web2-product-code.js](../../web2/shared/web2-product-code.js) · 594 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-kho-sync.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-state.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/shared/web2-variants-cache.js`

#### `Web2ProductCounter` — [web2/shared/web2-product-counter.js](../../web2/shared/web2-product-counter.js) · 539 dòng

WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.
**Dùng bởi:** `web2/product-counter/js/product-counter.js`, `web2/shared/web2-barcode-scanner.js`, `web2/shared/web2-label-ocr.js`

#### `Web2ProductsCache` — [web2/shared/web2-products-cache.js](../../web2/shared/web2-products-cache.js) · 450 dòng

Web2 Products — Shared cache + Firestore tickler realtime
**Dùng bởi:** `so-order/js/so-order-app.js`, `so-order/js/so-order-kho-sync.js`, `so-order/js/so-order-modal-core.js`, `so-order/js/so-order-modal-suggest.js`, `so-order/js/so-order-receive.js`, `so-order/js/so-order-render.js`, `web2/products/js/web2-products-actions.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-render.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/purchase-refund/js/purchase-refund-actions.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/purchase-refund/js/purchase-refund-modal.js`, `web2/purchase-refund/js/purchase-refund-render.js`, `web2/supplier-wallet/js/supplier-wallet-actions.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`

#### `Web2QrModal` — [web2/shared/web2-qr-modal.js](../../web2/shared/web2-qr-modal.js) · 299 dòng

WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.
**Dùng bởi:** `web2/customers/js/customers-detail.js`

#### `Web2QR` — [web2/shared/web2-qr.js](../../web2/shared/web2-qr.js) · 348 dòng

WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.
**Dùng bởi:** `web2/products/js/web2-products-print-modal.js`, `web2/products/js/web2-products-print-render.js`, `web2/shared/web2-bill-service.js`

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
**Dùng bởi:** `live-chat/js/pancake/inventory-panel-state.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/supplier-debt/js/supplier-debt-api.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`

#### `Web2SSE` — [web2/shared/web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js) · 244 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/live/comments-mobile-actions.js`, `live-chat/js/live/comments-mobile-entry.js`, `live-chat/js/live/live-chat-modal.js`, `live-chat/js/live/live-hidden-commenters.js`, `live-chat/js/live/live-init-lifecycle.js`, `live-chat/js/live/live-init.js`, `live-chat/js/live/live-livestream-gallery.js`, `live-chat/js/live/live-livestream-snap-init.js`, `live-chat/js/live/live-livestream-snap-lock.js`, `live-chat/js/pancake/inventory-panel-actions.js`, `live-chat/js/pancake/pancake-realtime.js`, `live-chat/js/shared/live-comments-stream.js`, `native-orders/js/native-orders-app.js`, `native-orders/js/native-orders-kpi.js`, `so-order/js/so-order-storage.js`, `web2/balance-history/js/web2-bh-data.js`, `web2/balance-history/js/web2-pending-match.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customers/js/customers-app.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/jt-tracking/js/jt-tracking-app.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-products-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/reconcile/js/reconcile-api.js`, `web2/returns/js/returns-app.js`, `web2/shared/page-builder.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-store.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-notification-bell.js`, `web2/shared/web2-printer.js`, `web2/shared/web2-products-cache.js`, `web2/shared/web2-sse-topics.js`, `web2/shared/web2-suppliers-cache.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-variants-cache.js`, `web2/shared/web2-wallet-balance.js`, `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/realtime.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/zalo/js/web2-zalo-app.js`

#### `Web2SSETopics` — [web2/shared/web2-sse-topics.js](../../web2/shared/web2-sse-topics.js) · 29 dòng

WEB2.0 module.

#### `Web2SuppliersCache` — [web2/shared/web2-suppliers-cache.js](../../web2/shared/web2-suppliers-cache.js) · 223 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `so-order/js/so-order-inline-edit.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-state.js`, `web2/purchase-refund/js/purchase-refund-modal.js`, `web2/supplier-debt/js/supplier-debt-filters.js`, `web2/supplier-wallet/js/supplier-wallet-actions.js`

#### `Web2TextUtils` — [web2/shared/web2-text-utils.js](../../web2/shared/web2-text-utils.js) · 41 dòng

WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2UnreadPanel` — [web2/shared/web2-unread-panel.js](../../web2/shared/web2-unread-panel.js) · 149 dòng

WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).
**Dùng bởi:** `web2/ck-dashboard/js/ck-dashboard-app.js`

#### `Web2UserInfo` — [web2/shared/web2-user-info.js](../../web2/shared/web2-user-info.js) · 154 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/live/live-hidden-commenters.js`, `native-orders/js/native-orders-app.js`, `native-orders/js/native-orders-packing-slip.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-detail.js`, `web2/customers/js/customers-events.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/kpi/js/kpi-assignments.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-product-detail.js`, `web2/purchase-refund/js/purchase-refund-state.js`, `web2/reconcile/js/reconcile-actions.js`, `web2/returns/js/returns-api.js`, `web2/shared/web2-api.js`, `web2/shared/web2-bill-service.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-wallet-api.js`, `web2/supplier-debt/js/supplier-debt-api.js`, `web2/supplier-wallet/js/supplier-wallet-state.js`, `web2/zalo/js/web2-zalo-lookup-zns.js`

#### `Web2VariantMulti` — [web2/shared/web2-variant-multi.js](../../web2/shared/web2-variant-multi.js) · 192 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-modal-submit.js`, `so-order/js/so-order-render.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-variant-picker.js`

#### `Web2VariantsCache` — [web2/shared/web2-variants-cache.js](../../web2/shared/web2-variants-cache.js) · 231 dòng

Web2 Variants — Shared cache + Firestore tickler realtime
**Dùng bởi:** `so-order/js/so-order-app.js`, `so-order/js/so-order-inline-edit.js`, `so-order/js/so-order-kho-sync.js`, `so-order/js/so-order-modal-random.js`, `so-order/js/so-order-modal-suggest.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-state.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/shared/web2-variant-multi.js`, `web2/variants/js/web2-variants-app.js`

#### `Web2WalletApi` — [web2/shared/web2-wallet-api.js](../../web2/shared/web2-wallet-api.js) · 212 dòng

WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).
**Dùng bởi:** `web2/customer-wallet/js/web2-customer-wallet-api.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customer-wallet/js/web2-customer-wallet-render.js`, `web2/shared/web2-wallet-balance.js`

#### `Web2WalletBalance` — [web2/shared/web2-wallet-balance.js](../../web2/shared/web2-wallet-balance.js) · 315 dòng

WEB2.0 — shared helper hiển thị số dư ví KH.
**Dùng bởi:** `live-chat/js/live/live-comment-list-render-row.js`, `live-chat/js/live/live-comment-list-state.js`, `live-chat/js/live/live-customer-panel.js`, `native-orders/js/native-orders-app.js`, `web2/balance-history/js/web2-bh-reassign-modal.js`, `web2/balance-history/js/web2-bh-render.js`, `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-pm-customer-search.js`, `web2/balance-history/js/web2-pm-picker.js`, `web2/balance-history/js/web2-pm-render.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-render.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/returns/js/returns-customer.js`, `web2/returns/js/returns-tabs.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-wallet-api.js`, `web2/shared/web2-zalo.js`

#### `ZaloApi` — [web2/shared/web2-zalo-api.js](../../web2/shared/web2-zalo-api.js) · 200 dòng

WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/sticker-picker.js`, `web2/zalo/js/web2-zalo-accounts.js`, `web2/zalo/js/web2-zalo-chat.js`, `web2/zalo/js/web2-zalo-lookup-zns.js`

#### `Web2Zalo` — [web2/shared/web2-zalo.js](../../web2/shared/web2-zalo.js) · 296 dòng

WEB2.0 shared — Web2Zalo helper (single-source Zalo).
**Dùng bởi:** `web2/jt-tracking/js/jt-tracking-modals.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/bubbles.js](../../web2/shared/zalo-chat/bubbles.js) · 227 dòng

WEB2.0 module — Zalo chat message renderer.
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-actions.js](../../web2/shared/zalo-chat/chat-actions.js) · 90 dòng

WEB2.0 module — Zalo chat actions (network + optimistic).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-store.js](../../web2/shared/zalo-chat/chat-store.js) · 214 dòng

WEB2.0 module — Zalo chat shared store + utils (WZChat.\*).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-view.js](../../web2/shared/zalo-chat/chat-view.js) · 647 dòng

WEB2.0 shared — Zalo chat VIEW (mount 1 hội thoại vào bất kỳ container).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/composer.js](../../web2/shared/zalo-chat/composer.js) · 457 dòng

WEB2.0 module — Zalo chat composer (input đầy đủ).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/emoji-picker.js](../../web2/shared/zalo-chat/emoji-picker.js) · 105 dòng

WEB2.0 module — Zalo chat emoji picker (client-only).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/lightbox.js](../../web2/shared/zalo-chat/lightbox.js) · 86 dòng

WEB2.0 module — Zalo chat lightbox (xem ảnh full + prev/next).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/reactions.js](../../web2/shared/zalo-chat/reactions.js) · 65 dòng

WEB2.0 module — Zalo chat reaction bar (add-only).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/realtime.js](../../web2/shared/zalo-chat/realtime.js) · 56 dòng

WEB2.0 module — Zalo chat realtime (SSE patch).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/sticker-picker.js](../../web2/shared/zalo-chat/sticker-picker.js) · 113 dòng

WEB2.0 module — Zalo chat sticker picker.
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

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
- **[comments-mobile-actions.js](../../live-chat/js/live/comments-mobile-actions.js)** ·375 — WEB2.0 module.
    - exposes: `LCM`
    - uses shared: `Web2Chat`, `Web2SSE`
    - funcs (25): applyDelta, enrichDelta, fetchThumbs, getCreatedMs, getPostIds, getStream, getWorkerUrl, livingIds, livingSet, load, loadNativeOrders, loadPosts, mapRow, onDelta, overrideRealCounts, postLiving, primeFromData, realCommentTotal, scheduleLoadNative, shouldAnimateNew, showNewPill, toast, updateLiveTag, updateOrderCounts, wireSse
- **[comments-mobile-entry.js](../../live-chat/js/live/comments-mobile-entry.js)** ·172 — WEB2.0 module.
    - uses shared: `Web2Chat`, `Web2SSE`
- **[comments-mobile-render.js](../../live-chat/js/live/comments-mobile-render.js)** ·400 — WEB2.0 module.
    - exposes: `LCM`
    - funcs (20): applyView, buildCard, cardHtml, cardSig, closePicker, closeSheet, doRender, field, openPicker, openSheet, pickerRow, postLabel, reconcileList, renderPicker, scheduleRender, selectAll, selectLive, selectPost, skeleton, transplantAvatar
- **[comments-mobile-state.js](../../live-chat/js/live/comments-mobile-state.js)** ·422 — WEB2.0 module.
    - exposes: `LiveState`, `LiveCommentList`, `LCM`
    - uses shared: `API_CONFIG`
    - funcs (29): $, addrOf, avHash, avatarHtml, enrichWarehouse, esc, fmtFull, fmtTime, hiddenCount, isHiddenPerson, isHousePg, isShopOwn, isStorePg, nameOf, nativeOrder, normP, ordered, pageOf, parseTs, pass, passLive, phoneOf, postJson, refreshWarehouse, renderComments, statusOf, validPhone, visible, whInfo
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
- **[live-comment-list-actions.js](../../live-chat/js/live/live-comment-list-actions.js)** ·480 — WEB2.0 module.
    - uses shared: `Web2CustomerStore`, `Web2Optimistic`
    - funcs (17): \_applyBadge, \_setKho, apply, handleSaveToLive, rollback, run, saveInlineAddress, saveInlinePhone, selectComment, selectInlineStatus, sendReply, setDebtDisplaySettings, showReplyInput, snapshot, toggleInlineStatusDropdown, updateConnectionStatus, updateSaveButtonToCheckmark
- **[live-comment-list-base.js](../../live-chat/js/live/live-comment-list-base.js)** ·109 — WEB2.0 module.
    - exposes: `LiveCommentList`
    - uses shared: `Web2Auth`
    - funcs (3): \_liveW2Auth, liveAttr, liveSvgIcon
- **[live-comment-list-events.js](../../live-chat/js/live/live-comment-list-events.js)** ·269 — WEB2.0 module.
    - uses shared: `Popup`
    - funcs (7): \_bindListDelegation, \_docClickHandler, \_dragEndFlushHandler, \_flushDeferredAfterDrag, \_onListClick, renderContainer, setupEventHandlers
- **[live-comment-list-orders.js](../../live-chat/js/live/live-comment-list-orders.js)** ·448 — WEB2.0 module.
    - funcs (10): \_bindCustomerModalDelegation, \_renderCustomerPopup, chunkRefresh, createOrder, mapWarehouse, refreshCommentItem, renderFn, showOrderDetail, showPancakeCustomerInfo, timeRemaining
- **[live-comment-list-render-list.js](../../live-chat/js/live/live-comment-list-render-list.js)** ·749 — WEB2.0 module.
    - uses shared: `Web2CustomerStore`
    - funcs (26): \_bindCampaignScroll, \_campaignRowHtml, \_campaignSentinelHtml, \_patchRowsChunked, \_renderDispatch, \_rowSig, clearCampaignSelection, handleScroll, isHidden, loadMoreCampaigns, markNew, prependComments, renderComments, renderCommentsNow, renderCrmTeamOptions, renderLiveCampaignOptions, schedule, selectTodayCampaigns, showError, showLoading, step, toggleCampaign, toggleCampaignDropdown, ts, updateCampaignBtnText, updateLoadMoreIndicator
- **[live-comment-list-render-row.js](../../live-chat/js/live/live-comment-list-render-row.js)** ·283 — WEB2.0 module.
    - uses shared: `Web2CustomerStore`, `Web2WalletBalance`
    - funcs (4): getStatusColor, getStatusOptions, pancakePhone, renderCommentItem
- **[live-comment-list-state.js](../../live-chat/js/live/live-comment-list-state.js)** ·274 — WEB2.0 module.
    - uses shared: `Web2Chat`, `Web2WalletBalance`
    - funcs (12): \_appendOlderBatch, \_attachWalletBalances, \_ensureScrollSentinel, \_filteredAll, \_orderCount, \_shouldAnimateNew, \_updateRealCommentTotal, \_updateTotalBadge, \_visibleComments, resetRenderLimit, schedule, step
- **[live-customer-panel.js](../../live-chat/js/live/live-customer-panel.js)** ·316 — Live Customer Info Panel
    - exposes: `LiveCustomerPanel`
    - uses shared: `Web2WalletBalance`
    - funcs (8): closeModal, formatDate, getStatusClass, lcpAttr, renderCustomerInfoModal, selectStatus, showCustomerInfo, toggleStatusDropdown
- **[live-hidden-commenters.js](../../live-chat/js/live/live-hidden-commenters.js)** ·383 — WEB2.0 module — ẩn comment theo NGƯỜI (commenter) + danh sách quản lý.
    - exposes: `LiveHiddenCommenters`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`, `Web2UserInfo`
    - funcs (24): \_apiBase, \_boot, \_esc, \_hideRemote, \_injectStyles, \_lhcHeaders, \_load, \_mountBtn, \_normName, \_rebuildNameSet, \_renderManagerBody, \_rerender, \_save, \_toast, \_unhideRemote, \_updateBtnCount, hide, isHidden, list, openManager, rollback, run, trySub, unhide
- **[live-init-lifecycle.js](../../live-chat/js/live/live-init-lifecycle.js)** ·534 — WEB2.0 module.
    - uses shared: `Web2Chat`, `Web2SSE`
    - funcs (22): \_captureAltPhones, \_dbRowToComment, \_fetchLiveCommentDelta, \_harvestCommentCustomers, \_mapDbComment, \_resolveSelectedPostIds, \_saveCommentsToDb, \_waitForPancakeAccounts, destroy, isExpired, loadComments, loadDebtForPartners, loadMoreComments, loadNativeOrdersForPost, loadPartnerInfoForComments, loadSessionIndex, norm, pancakePhoneOf, ready, refresh, setDebtDisplaySettings, toggleHideComment
- **[live-init-state.js](../../live-chat/js/live/live-init-state.js)** ·109 — WEB2.0 module.
    - exposes: `LiveColumnManager`
    - uses shared: `Web2Auth`
    - funcs (3): \_fetchLiveVideosForPage, \_resolveCampaignLivePosts, \_w2AuthHeaders
- **[live-init-wiring.js](../../live-chat/js/live/live-init-wiring.js)** ·455 — WEB2.0 module.
    - funcs (10): \_onRtConnected, \_onRtDisconnected, \_restoreCampaignSelection, hasOption, onCrmTeamChange, onLiveCampaignChange, onMultiCampaignChange, restoreSelection, setupEventListeners, setupRealtimeListeners
- **[live-init.js](../../live-chat/js/live/live-init.js)** ·165 — WEB2.0 module.
    - uses shared: `Web2SSE`
    - funcs (22): closeCustomerInfoModal, getCacheStats, getPostIds, getWorkerUrl, handleSaveToLive, initialize, loadComments, mapRow, onDelta, refresh, saveInlineAddress, saveInlinePhone, selectComment, selectInlineStatus, selectStatus, setDebtDisplaySettings, shouldFetch, showCustomerInfo, toggleHideComment, toggleInlineStatusDropdown, toggleStatusDropdown, updateSaveButtonToCheckmark
- **[live-kho-enricher.js](../../live-chat/js/live/live-kho-enricher.js)** ·219 — WEB2.0 — enrich live-chat từ kho khách hàng.
    - exposes: `LiveKhoEnricher`
    - funcs (12): commentPhone, flush, gather, init, needsEnrich, normPhone, postBatch, renderComments, reset, scan, scheduleFlush, setKho
- **[live-livestream-gallery.js](../../live-chat/js/live/live-livestream-gallery.js)** ·577 — WEB2.0 module.
    - exposes: `LiveLivestreamGallery`
    - uses shared: `Popup`, `Web2Optimistic`, `Web2SSE`
    - funcs (32): \_deleteImage, \_ensurePreview, \_esc, \_extractImage, \_fmtTime, \_hidePreview, \_loadCampaignsInto, \_makeChip, \_prependTempTile, \_removeTile, \_renderGrid, \_setupSSE, \_showPreview, \_snapApi, \_tileHtml, \_toast, \_user, apply, captureAndSave, closeSidebar, doPost, ensureButtons, ensureSidebar, finish, g, init, onSuccess, openSidebar, reload, rollback, run, toggleSidebar
- **[live-livestream-snap-actions.js](../../live-chat/js/live/live-livestream-snap-actions.js)** ·580 — WEB2.0 module.
    - exposes: `LiveSnap`
    - uses shared: `Popup`
    - funcs (9): \_createMetadataSnap, \_offlineSnapOne, \_postCapturedSnap, \_renderBadgeFor, offlineBatchAll, offlineManualSnap, refreshCounts, snap, toast
- **[live-livestream-snap-capture.js](../../live-chat/js/live/live-livestream-snap-capture.js)** ·406 — WEB2.0 module.
    - exposes: `LiveSnap`
    - funcs (16): \_base64ToBlob, \_blobToBase64, \_captureExtensionFrame, \_captureFrameJpeg, \_captureViaExtension, \_encodeBitmapInWorker, \_findNearestBufferedFrame, \_getEncodeWorker, \_startFrameBuffer, \_stopFrameBuffer, captureCurrentFrame, fin, onerror, onload, onmessage, tick
- **[live-livestream-snap-extract.js](../../live-chat/js/live/live-livestream-snap-extract.js)** ·413 — WEB2.0 module.
    - exposes: `LiveSnap`
    - funcs (4): \_captureAtCommentTime, \_extractThumbnailForComment, \_handleNewCommentAuto, \_runSilentForceExtract
- **[live-livestream-snap-init.js](../../live-chat/js/live/live-livestream-snap-init.js)** ·365 — WEB2.0 module.
    - exposes: `LiveSnap`, `LiveLivestreamSnap`
    - uses shared: `Web2SSE`
    - funcs (17): \_findCommentContainer, \_getBufferCount, \_getLatestFrame, \_getStreamActive, \_wireSnapDelegation, attach, blockFrames, callback, deferRefresh, flushInject, forceStall, init, scheduleInject, scheduleRefresh, setupObserver, subscribeNewComment, subscribeSSE
- **[live-livestream-snap-lock.js](../../live-chat/js/live/live-livestream-snap-lock.js)** ·187 — WEB2.0 module.
    - exposes: `LiveSnap`
    - uses shared: `Popup`, `API_CONFIG`, `Web2SSE`
    - funcs (12): \_acquireCaptureLock, \_holderId, \_lockApiBase, \_lockFetch, \_machineId, \_postAcquire, \_readLock, \_releaseCaptureLock, \_startLockHeartbeat, \_stopLockHeartbeat, \_subscribeLockSse, \_tabId
- **[live-livestream-snap-render.js](../../live-chat/js/live/live-livestream-snap-render.js)** ·705 — WEB2.0 module.
    - exposes: `LiveSnap`
    - uses shared: `Popup`
    - funcs (20): \_deleteSnapByComment, \_flushSnapByCommentBatch, \_hideZoomPreview, \_invalidateSnapCacheAndRefresh, \_openSnapLightbox, \_queueSnapByComment, \_refreshPopoverContent, \_refreshThumbStripsForCustomer, \_renderThumbStripFor, \_showZoomPreview, closeLb, closeOutside, escClose, getCurrentCampaignContext, getCurrentOffsetSeconds, injectSnapButton, injectSnapButtonsAll, onclick, oncontextmenu, togglePopover
- **[live-livestream-snap-seek.js](../../live-chat/js/live/live-livestream-snap-seek.js)** ·496 — WEB2.0 module.
    - exposes: `LiveSnap`
    - funcs (19): \_buildSeekPlayer, \_captureExtensionFrameThrottled, \_clientCaptureAtOffset, \_clientCaptureAtOffsetInner, \_clientRestoreLive, \_ensureFbSdk, \_ensureSeekPlayer, \_ensureWorkerStrip, \_forceExtractVideoBlocked, \_removeWorkerStrip, \_runForceExtractParallel, \_runForceExtractSerial, \_workerSeekCapture, doWork, gap, handler, onerror, onload, runWorker
- **[live-livestream-snap-state.js](../../live-chat/js/live/live-livestream-snap-state.js)** ·388 — WEB2.0 module.
    - exposes: `LiveSnap`
    - uses shared: `Web2Auth`
    - funcs (26): \_buildFbLiveUrl, \_cmpVersions, \_esc, \_fetchLiveVideoInfo, \_findActiveLiveCampaign, \_fmtOffset, \_getSnapMode, \_getSnapPagePref, \_isAutoMode, \_isFrameBlank, \_isInlineThumbOn, \_isStaffComment, \_isVanitySlug, \_pageActiveForCapture, \_resolveActiveCampaign, \_resolveCampaignForComment, \_resolvePageObj, \_resolvePageVanity, \_resolveTopCampaigns, \_setAutoMode, \_setInlineThumb, \_setSnapMode, \_setSnapPagePref, \_toast, \_user, \_w2AuthHeaders
- **[live-livestream-snap-stream.js](../../live-chat/js/live/live-livestream-snap-stream.js)** ·546 — WEB2.0 module.
    - exposes: `LiveSnap`
    - funcs (18): \_enableEmbeddedLiveCapture, \_ensureEmbeddedIframe, \_ensureVideoDock, \_maybeShowAutoSnapBanner, \_requestCaptureStream, \_setupVisibilityWatcher, \_showExtPrompt, \_showPickerTutorial, close, ensureCaptureStream, finish, fire, fireNotification, onclick, startTitleFlash, stopRealSnap, stopTitleFlash, toggleRealSnap
- **[live-livestream-snap-ui.js](../../live-chat/js/live/live-livestream-snap-ui.js)** ·377 — WEB2.0 module.
    - exposes: `LiveSnap`
    - uses shared: `Popup`
    - funcs (15): \_ensureFloatingHost, \_renderProgress, \_resetChip, ensureAutoModeChip, ensureBackfillChip, ensureForceExtractChip, ensureHeaderChip, ensureInlineThumbChip, ensureRealSnapChip, isCancelled, onProgress, renderAutoModeChip, renderHeaderChip, renderInlineThumbChip, renderRealSnapChip
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
- **[inventory-panel-actions.js](../../live-chat/js/pancake/inventory-panel-actions.js)** ·299 — WEB2.0 module.
    - uses shared: `Web2SSE`
    - funcs (8): \_scheduleRefresh, \_subscribeSSE, addToCart, clearOrder, onUndo, refresh, refreshCartCounts, removeFromCart
- **[inventory-panel-init.js](../../live-chat/js/pancake/inventory-panel-init.js)** ·91 — WEB2.0 module.
    - exposes: `PancakeInventoryPanel`
    - funcs (3): \_mutationsTouchRows, \_wireLiveObserver, init
- **[inventory-panel-render.js](../../live-chat/js/pancake/inventory-panel-render.js)** ·626 — WEB2.0 module.
    - uses shared: `Web2ChatPanel`, `Popup`
    - funcs (21): \_addProductToComposer, \_markHasOrderRows, \_outside, \_renderBadgeFor, \_renderBadgeForRow, \_showToast, \_showUndoToast, \_snapTickerCancel, attachAddButtons, attachDragSources, attachDropTargets, cleanup, close, onclick, openCartHistory, renderBadges, renderCartPopover, renderProductList, renderShell, renderTabs, togglePopover
- **[inventory-panel-state.js](../../live-chat/js/pancake/inventory-panel-state.js)** ·277 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2SoOrder`
    - funcs (11): \_getCmtMap, \_relTime, \_resolveCommitContext, \_resolveLiveCustomer, \_user, applyFilter, asciiUpper, escapeHtml, fmtPrice, loadProducts, loadTabsFromSoOrder
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
- **[pancake-firestore-accounts.js](../../live-chat/js/pancake/pancake-firestore-accounts.js)** ·228 — WEB2.0 module.
    - exposes: `PancakeFirestoreAccounts`
    - funcs (3): getTokenFromFirestore, loadAccounts, saveTokenToFirestore
- **[pancake-init.js](../../live-chat/js/pancake/pancake-init.js)** ·341 — PANCAKE INIT - Orchestrate Pancake column initialization
    - exposes: `PancakeColumnManager`
    - funcs (11): \_bindEvents, \_loadConversations, \_preloadPageAccessTokens, \_renderErrorState, \_renderLoadingState, \_renderShell, \_switchTab, initialize, refresh, setServerMode, setTimeout
- **[pancake-mobile-shell.js](../../live-chat/js/pancake/pancake-mobile-shell.js)** ·143 — WEB2.0 — mobile shell cho Chat Pancake: app-height keyboard-aware + single-pane swap (list↔chat) + swipe-back. KHÔNG đụng data layer.
    - exposes: `Web2PancakeMobile`
    - funcs (10): applyViewport, bindSwipeBack, container, currentView, ensureBackBtn, init, isMobile, setView, showChat, showList
- **[pancake-mode-switcher.js](../../live-chat/js/pancake/pancake-mode-switcher.js)** ·142 — State lưu localStorage. Mặc định = Kho. Wrap content sau khi Pancake init xong.
    - exposes: `PancakeModeSwitcher`
    - funcs (7): \_attachObserver, \_renderSwitcher, applyMode, getMode, init, setMode, wrap
- **[pancake-page-access-tokens.js](../../live-chat/js/pancake/pancake-page-access-tokens.js)** ·148 — WEB2.0 module.
    - exposes: `PancakePageAccessTokens`
    - uses shared: `API_CONFIG`
    - funcs (3): buildEntry, generate, load
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
- **[pancake-token-codec.js](../../live-chat/js/pancake/pancake-token-codec.js)** ·225 — WEB2.0 module.
    - exposes: `PancakeTokenCodec`
    - funcs (5): analyzeToken, base64UrlDecode, cleanToken, decodeToken, isTokenExpired
- **[pancake-token-manager.js](../../live-chat/js/pancake/pancake-token-manager.js)** ⚠️803 — WEB2.0 module.
    - exposes: `PancakeTokenManager`
    - uses shared: `Web2Chat`, `Web2PancakeAccounts`
    - funcs (35): addAccount, base64UrlDecode, clearPageAccessTokensFromLocalStorage, clearToken, clearTokenFromLocalStorage, debugToken, decodeToken, deleteAccount, genPromise, generatePageAccessToken, getAccountInfo, getAllAccounts, getAllPageAccessTokens, getOrGeneratePageAccessToken, getPageAccessToken, getPageAccessTokensFromLocalStorage, getToken, getTokenFromCookie, getTokenFromFirestore, getTokenFromLocalStorage, getTokenFromWeb2Chat, getTokenInfo, initialize, isTokenExpired, loadAccounts, loadFromLocalStorage, loadPageAccessTokens, savePageAccessToken, savePageAccessTokensToLocalStorage, saveTokenToFirestore, saveTokenToLocalStorage, setActiveAccount, setTokenManual, valid, withTimeout
- **[pancake-token-sources.js](../../live-chat/js/pancake/pancake-token-sources.js)** ·56 — WEB2.0 module.
    - exposes: `PancakeTokenSources`
    - uses shared: `Web2Chat`
    - funcs (2): getTokenFromCookie, getWeb2ChatPageAccessTokens
- **[pancake-token-storage.js](../../live-chat/js/pancake/pancake-token-storage.js)** ·140 — WEB2.0 module.
    - exposes: `PancakeTokenStorage`
    - funcs (6): clearPageAccessTokens, clearToken, getPageAccessTokens, getToken, savePageAccessTokens, saveToken
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

### so-order — WEB2.0 module.

- **[so-order-app.js](../../so-order/js/so-order-app.js)** ·212 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Deeplink`, `Web2ProductsCache`, `Web2SuppliersCache`, `Web2VariantsCache`
    - funcs (7): \_applyDeeplink, conflictHandler, findInDom, init, norm, remoteHandler, tick
- **[so-order-barcode.js](../../so-order/js/so-order-barcode.js)** ·259 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (4): \_updateBarcodeSummary, openBarcodePrintModal, printBarcodes, printLabelsFromReceivePanel
- **[so-order-bulk-edit.js](../../so-order/js/so-order-bulk-edit.js)** ·86 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (5): commitBulkEditField, onBulkEditChange, onBulkEditFocusIn, onBulkEditKeydown, onPick
- **[so-order-confirm.js](../../so-order/js/so-order-confirm.js)** ·191 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (10): close, finish, hideModal, onClick, onKey, render, showModal, soConfirm, soConfirmOpen, update
- **[so-order-delete.js](../../so-order/js/so-order-delete.js)** ·341 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (15): \_buildRowDeleteConfirm, \_buildShipmentDeleteConfirm, \_daysUntilPurge, \_finalizeDeleteShipment, \_fmtTrashDate, \_markDeletePending, \_unmarkDeletePending, deleteRow, deleteShipment, finishWith, handleTrashPurge, handleTrashRestore, openTrashModal, renderTrashList, updateTrashCountBadge
- **[so-order-format.js](../../so-order/js/so-order-format.js)** ·106 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (10): activeColVis, currencyToVndRate, escapeHtml, fmtCurrency, fmtVnd, formatDateVN, fromVnd, notify, pushSync, toVnd
- **[so-order-image-modal.js](../../so-order/js/so-order-image-modal.js)** ·137 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Effects`
    - funcs (8): \_clearInlineImage, \_refreshInlineImagePreview, \_saveInlineImage, hideLightbox, onResult, openInlineImageModal, openLightbox, wireInlineImageModal
- **[so-order-import.js](../../so-order/js/so-order-import.js)** ·236 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Import`
    - funcs (3): \_commitSoImport, \_normImportDate, \_soImportConfig
- **[so-order-inline-edit.js](../../so-order/js/so-order-inline-edit.js)** ·431 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2SuppliersCache`, `Web2VariantsCache`
    - funcs (16): \_currentStateSuppliers, \_ensureSupplierAsync, \_ensureSupplierCacheSubscription, \_ensureSupplierWithFeedback, \_maybeExpandVndShorthand, attachSupplierPickerOnDemand, attachVariantPickerOnDemand, beginInlineCellEdit, commit, finish, onCellDoubleClick, onPick, refresh, renderDropdown, restore, updateActiveHighlight
- **[so-order-kho-sync.js](../../so-order/js/so-order-kho-sync.js)** ·370 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Optimistic`, `Web2ProductCode`, `Web2ProductsCache`, `Web2VariantsCache`
    - funcs (9): \_assignKhoCodes, \_checkRowsHaveStock, \_checkRowsHaveStockSync, \_generateKhoCode, \_isStockCacheReady, \_noteHasLabel, \_rowToKhoMatch, adjustKhoPending, syncRowsToKho
- **[so-order-modal-core.js](../../so-order/js/so-order-modal-core.js)** ·480 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2BarcodeScanner`, `Web2LabelOcr`, `Web2ProductsCache`
    - funcs (17): \_addRowFromScannedCode, \_newModalRow, modalRowHtml, onModalPriceBlur, onModalRowFieldInput, onPick, onResult, onScan, onclick, renderModalRows, updateModalGrandTotals, updateModalTotals, updateRowImagePreview, updateRowMeta, updateRowTotal, wireModalRowInputs, wireModalTotals
- **[so-order-modal-image.js](../../so-order/js/so-order-modal-image.js)** ·179 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Effects`
    - funcs (10): \_applyImageToRow, \_imgPasteCellHtml, \_orderInvoiceImageHtml, \_renderOrderInvoiceImage, \_setOrderInvoiceImage, \_wireOrderInvoiceImage, fileToDataUrl, onResult, onload, wireModalImagePasteDrop
- **[so-order-modal-open.js](../../so-order/js/so-order-modal-open.js)** ·186 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (5): \_applyShipMetaUi, \_shipMetaFlags, onPick, openOrderModal, updateContractHint
- **[so-order-modal-random.js](../../so-order/js/so-order-modal-random.js)** ·129 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2VariantsCache`
    - funcs (7): \_rImg, \_rInt, \_rPick, \_randomRow, \_variantPools, fillModalRandom, generateRandomOrders
- **[so-order-modal-submit.js](../../so-order/js/so-order-modal-submit.js)** ·281 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2VariantMulti`
    - funcs (1): handleOrderSubmit
- **[so-order-modal-suggest.js](../../so-order/js/so-order-modal-suggest.js)** ·284 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2ProductsCache`, `Web2VariantsCache`
    - funcs (10): \_anchorFloatPanel, \_bindModalScrollCloseDropdowns, \_getFloatPanel, \_hideFloatPanels, applySuggestionToRow, hideSuggest, hideVariantSuggest, reflow, showSuggest, showVariantSuggest
- **[so-order-receive.js](../../so-order/js/so-order-receive.js)** ·735 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2ProductsCache`
    - funcs (12): \_hideOtherShipments, \_lookupProductStateForRows, \_patchReceiveRowFromLookup, \_showAllShipments, \_updateReceiveRowStatus, \_updateReceiveSummary, closePanel, confirmReceiveFromModal, escHandler, matchSupplier, normName, openReceiveShipmentModal
- **[so-order-render-cells.js](../../so-order/js/so-order-render-cells.js)** ·158 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (6): \_isRowLocked, actionsCell, editableCellHtml, imgCell, priceCell, statusCell
- **[so-order-render.js](../../so-order/js/so-order-render.js)** ·751 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Deeplink`, `Web2ProductsCache`, `Web2VariantMulti`
    - funcs (23): \_computeRowSpans, \_etaBadgeHtml, \_explodeVariants, \_groupMetaSubHeaderHtml, \_lookupKhoCode, \_orderReceivedGroupsLast, \_updateVariantMultiPreview, applyEditTableModeUi, beginShipmentFieldEdit, columnHeaderRowHtml, commit, flashRow, pill, renderAll, renderFooterTotals, renderTabStrip, renderTableBody, renderTableHead, restore, rowHtml, setEditTableMode, shipmentHeaderHtml, shipmentHtml
- **[so-order-settings.js](../../so-order/js/so-order-settings.js)** ·219 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (8): \_syncShipMetaAllCheckbox, \_wireShipMetaAll, buildOpts, finishWith, handleTabDelete, handleTabSettingsSubmit, openColumnModal, openTabSettingsModal
- **[so-order-shipment.js](../../so-order/js/so-order-shipment.js)** ·211 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (9): \_mostCommonSupplier, \_readPerOrderMeta, \_renderPerOrderMeta, num, numField, onPick, openShipmentEditAllRows, openShipmentModal, updateContractHint
- **[so-order-state.js](../../so-order/js/so-order-state.js)** ·99 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Auth`
    - funcs (2): \_w2Auth, editTableMode
- **[so-order-storage.js](../../so-order/js/so-order-storage.js)** ⚠️962 — Sổ Order — IndexedDB cache + Postgres sync (web2Db).
    - exposes: `SoOrderStorage`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2IdbStore`, `Web2SSE`
    - funcs (44): \_defaultState, \_flushPending, \_flushWrite, \_getStore, \_loadFromServer, \_migrateTab, \_mkId, \_read, \_soAuthHeaders, \_subscribeSSE, \_write, addRow, addShipment, addTab, deleteRow, deleteShipment, deleteTab, findShipment, flush, getActiveTab, getColumnVisibility, getOrderAdjustment, getShipmentAdjustTotals, getTrash, init, load, loadCached, moveRow, pullOnce, purgeFromTrash, purgeOldTrash, pushToFirestore, restoreFromTrash, save, setActiveTab, setColumnVisibility, setOrderAdjustment, softDeleteShipment, teardown, updateFooter, updateInvoiceImageForGroup, updateRow, updateShipment, updateTab
- **[so-order-toolbar.js](../../so-order/js/so-order-toolbar.js)** ·93 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Popup`, `Web2Import`
    - funcs (2): wireFooterInputs, wireToolbar

### web2/balance-history — WEB2.0 — balance-history app (Phase 3 — 100% Web 2.0).

- **[web2-balance-history-app.js](../../web2/balance-history/js/web2-balance-history-app.js)** ·223 — WEB2.0 — balance-history app (Phase 3 — 100% Web 2.0).
    - exposes: `W2BH`, `Web2BalanceHistoryApp`
    - uses shared: `Web2CustomerChat`
    - funcs (7): \_applyDatePreset, \_currentPresetKey, \_datePresetRange, \_toISODate, \_updateDatePresetActive, bindEvents, init
- **[web2-bh-actions.js](../../web2/balance-history/js/web2-bh-actions.js)** ·155 — WEB2.0 module.
    - exposes: `W2BH`
    - funcs (4): autoAssign, autoMatchSingle, autoReprocessOnLoad, reprocessUnmatched
- **[web2-bh-chat-export.js](../../web2/balance-history/js/web2-bh-chat-export.js)** ·142 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2CustomerChat`
    - funcs (4): escape, exportCsv, fbConversation, openChatForPhone
- **[web2-bh-core.js](../../web2/balance-history/js/web2-bh-core.js)** ·214 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2Auth`
    - funcs (13): \_currentUser, \_normalizePhoneInput, authHeaders, cacheDom, debounce, escapeHtml, fmtTime, fmtVnd, jsonFetch, notify, searchNormalize, stripDiacritics, withFallback
- **[web2-bh-data.js](../../web2/balance-history/js/web2-bh-data.js)** ·69 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2SSE`
    - funcs (3): load, reload, setupSSE
- **[web2-bh-link-customer.js](../../web2/balance-history/js/web2-bh-link-customer.js)** ·66 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Popup`
    - funcs (2): linkManual, openLinkPrompt
- **[web2-bh-reassign-modal.js](../../web2/balance-history/js/web2-bh-reassign-modal.js)** ·287 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2WalletBalance`
    - funcs (7): ensureReassignModalDom, ensureReassignStyles, openReassignModal, parse, searchCustomers, submitReassign, url
- **[web2-bh-render.js](../../web2/balance-history/js/web2-bh-render.js)** ·294 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2CustomerDetailModal`, `Web2WalletBalance`
    - funcs (8): \_extractUserFromRow, pushBtn, renderChips, renderPagination, renderRow, renderStats, renderTable, verifBadge
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
- **[web2-pending-match.js](../../web2/balance-history/js/web2-pending-match.js)** ·94 — WEB2.0 module.
    - exposes: `W2PM`, `Web2PendingMatch`
    - uses shared: `Web2SSE`
    - funcs (4): ensureBadge, init, refresh, updateBadge
- **[web2-pm-core.js](../../web2/balance-history/js/web2-pm-core.js)** ·170 — WEB2.0 module.
    - exposes: `W2PM`
    - uses shared: `Web2Auth`
    - funcs (13): \_normalize, \_normalizePhoneInput, authHeaders, escapeHtml, fmtTime, fmtVnd, getCurrentUserName, jsonFetch, linkManual, listPending, notify, resolvePending, withFallback
- **[web2-pm-customer-search.js](../../web2/balance-history/js/web2-pm-customer-search.js)** ·234 — WEB2.0 module.
    - exposes: `W2PM`
    - uses shared: `Web2Chat`, `Web2WalletBalance`
    - funcs (8): \_fbRowHtml, \_fetchFbByTail, \_fillFbList, \_searchCustomers, \_searchPancakeByPhone, \_setupFbObserver, tryFetch, url
- **[web2-pm-modal.js](../../web2/balance-history/js/web2-pm-modal.js)** ·211 — WEB2.0 module.
    - exposes: `W2PM`
    - funcs (7): \_filterPendingList, closeModal, ensureModalDom, ensureStyles, onSearchInput, openModal, refreshModal
- **[web2-pm-picker.js](../../web2/balance-history/js/web2-pm-picker.js)** ·86 — WEB2.0 module.
    - exposes: `W2PM`
    - uses shared: `Web2WalletBalance`
    - funcs (2): \_renderCustomItem, onCustomSearchInput
- **[web2-pm-render.js](../../web2/balance-history/js/web2-pm-render.js)** ·160 — WEB2.0 module.
    - exposes: `W2PM`
    - uses shared: `Web2CustomerChat`, `Web2WalletBalance`
    - funcs (2): renderItem, renderModalBody
- **[web2-pm-resolve.js](../../web2/balance-history/js/web2-pm-resolve.js)** ·105 — WEB2.0 module.
    - exposes: `W2PM`
    - funcs (3): \_resolveFromChat, onCustomResolveClick, onResolveClick

### web2/ck-dashboard — WEB2.0 module — Dashboard đối soát CK.

- **[ck-dashboard-app.js](../../web2/ck-dashboard/js/ck-dashboard-app.js)** ·458 — WEB2.0 module — Dashboard đối soát CK.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2CkReview`, `Web2HistoryTimeline`, `Web2Optimistic`, `Web2Sidebar`, `Web2SSE`, `Web2UnreadPanel`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (30): ageTxt, apply, bindIntents, bindSig, doFetch, esc, fetchJson, fmtTime, histCard, historyHtml, intentCard, loadCol, loadHistory, onCount, onDone, onSuccess, onchange, onclick, oninput, reloadAll, renderCol, renderHistory, renderStats, rollback, showColSkeletons, sigCard, snapshot, switchTab, wireHistory, wireTabs

### web2/customer-wallet — WEB2.0 module.

- **[web2-customer-wallet-api.js](../../web2/customer-wallet/js/web2-customer-wallet-api.js)** ·289 — WEB2.0 module.
    - exposes: `W2CW`
    - uses shared: `PartnerCustomerApi`, `Web2WalletApi`
    - funcs (14): aggregateFromPbh, fetchAggregateStats, fetchAggregateWeb2Only, fetchAllWeb2Wallets, fetchNativeOrders, fetchOverlay, fetchPbhList, fetchPbhListForPhone, fetchWalletReturns, fetchWeb2ReturnAmountsBatch, fetchWeb2Wallets, mergeNativeOrders, normalizeOrder, qrFetch
- **[web2-customer-wallet-app.js](../../web2/customer-wallet/js/web2-customer-wallet-app.js)** ·273 — WEB2.0 module.
    - exposes: `W2CW`, `Web2CustomerWalletApp`
    - uses shared: `Popup`, `PartnerCustomerApi`, `Web2SSE`, `Web2WalletApi`
    - funcs (5): hardReset, init, load, refreshSinglePhone, setupSSE
- **[web2-customer-wallet-events.js](../../web2/customer-wallet/js/web2-customer-wallet-events.js)** ·261 — WEB2.0 module.
    - exposes: `W2CW`
    - funcs (5): copyQrCode, csvEscape, exportCsv, upsertQr, wireUi
- **[web2-customer-wallet-render.js](../../web2/customer-wallet/js/web2-customer-wallet-render.js)** ·447 — WEB2.0 module.
    - exposes: `W2CW`
    - uses shared: `PartnerCustomerApi`, `Web2WalletApi`
    - funcs (14): cardHtml, enrichWeb2ForCurrentPage, openDetail, push, renderDetailExtras, renderDetailTabs, renderHistory, renderList, renderOrders, renderPagination, renderQrData, renderQrEmpty, renderQrTab, web2PartnerBadge
- **[web2-customer-wallet-state.js](../../web2/customer-wallet/js/web2-customer-wallet-state.js)** ·194 — WEB2.0 module.
    - exposes: `W2CW`
    - uses shared: `API_CONFIG`
    - funcs (11): cacheDom, debounce, escapeHtml, fmtDate, fmtTime, fmtVnd, jsonFetch, normPhone, notify, searchNormalize, stripDiacritics

### web2/customers — WEB2.0 module — Kho KH warehouse (web2_customers). warehouse riêng.

- **[customers-api.js](../../web2/customers/js/customers-api.js)** ·105 — WEB2.0 module — Kho KH warehouse (web2_customers). warehouse riêng.
    - exposes: `CustomersApi`
    - uses shared: `Web2Auth`
    - funcs (10): \_authHeaders, \_fetch, \_qs, create, list, lookupDeep, merge, remove, update, upsert
- **[customers-app.js](../../web2/customers/js/customers-app.js)** ·89 — WEB2.0 module — Kho KH warehouse UI. warehouse riêng.
    - uses shared: `Web2Optimistic`, `Web2SSE`
    - funcs (4): init, load, scheduleReload, subscribeSse
- **[customers-detail.js](../../web2/customers/js/customers-detail.js)** ·348 — WEB2.0 module — Kho KH warehouse detail/edit (modal + SĐT/địa chỉ phụ + status + merge). warehouse riêng.
    - uses shared: `Popup`, `Web2CustomerDetailModal`, `Web2HistoryTimeline`, `Web2QrModal`, `Web2UserInfo`
    - funcs (15): addAltAddress, addAltPhone, closeModal, collectForm, doMerge, exportCsv, g, onAction, openModal, renderAltAddresses, renderAltPhones, saveModal, setPrimaryAltAddr, setPrimaryAltPhone, v
- **[customers-events.js](../../web2/customers/js/customers-events.js)** ·380 — WEB2.0 module — Kho KH warehouse events (search/filter/sort/paginate wiring + Pancake fallback). warehouse riêng.
    - uses shared: `Web2Chat`, `Web2UserInfo`
    - funcs (8): \_getPageIds, \_importPancakeConv, \_searchPancake, addPancakeToKho, bind, finishImported, hidePancakeResults, runPancakeFallback
- **[customers-render.js](../../web2/customers/js/customers-render.js)** ·135 — WEB2.0 module — Kho KH warehouse render (list/pagination/cards). warehouse riêng.
    - uses shared: `Web2WalletBalance`
    - funcs (5): fbBadges, mk, renderPagination, renderPancakeCards, renderTable
- **[customers-state.js](../../web2/customers/js/customers-state.js)** ·78 — WEB2.0 module — Kho KH warehouse state/constants/utils. warehouse riêng.
    - uses shared: `Web2Optimistic`
    - funcs (5): $, esc, fmtMoney, normPhone, notify

### web2/fastsaleorder-delivery

- **[dlv-app.js](../../web2/fastsaleorder-delivery/dlv-app.js)** ·255
    - exposes: `DlvApp`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Optimistic`, `Web2SSE`
    - funcs (26): $, apply, applyFilters, badge, cancel, changeState, clearFilters, deliver, detail, escapeHtml, fmtDate, goPage, init, load, notify, onSuccess, renderCounters, renderPagination, renderRows, return\_, rollback, run, ship, snapshot, w2pAlert, w2pConfirm

### web2/fastsaleorder-invoice — WEB2.0 module.

- **[pbh-actions.js](../../web2/fastsaleorder-invoice/pbh-actions.js)** ·367 — WEB2.0 module.
    - exposes: `PbhActions`
    - uses shared: `Web2Bill`, `Web2Optimistic`
    - funcs (19): \_findPbhRow, apply, bulkAction, bulkMerge, bulkPrint, cancelOrder, confirmOrder, createDelivery, createRefund, exportCsv, getSelectedNumbers, load, onSuccess, printOrder, resetStt, rollback, run, snapshot, updateBulkBar
- **[pbh-api.js](../../web2/fastsaleorder-invoice/pbh-api.js)** ·58 — WEB2.0 module.
    - exposes: `PbhApi`
    - uses shared: `Web2Auth`
    - funcs (3): \_authHeaders, \_fetch, load
- **[pbh-app.js](../../web2/fastsaleorder-invoice/pbh-app.js)** ·133 — WEB2.0 module.
    - exposes: `PbhApp`
    - uses shared: `Web2SSE`
    - funcs (3): \_loadAndRenderScopeBanner, init, reload
- **[pbh-filters.js](../../web2/fastsaleorder-invoice/pbh-filters.js)** ·90 — WEB2.0 module.
    - exposes: `PbhFilters`
    - funcs (9): applyFilters, clearCustomerFilter, clearFilters, filterByCustomer, getSelectedNumbers, goPage, load, unselectAll, updateBulkBar
- **[pbh-render.js](../../web2/fastsaleorder-invoice/pbh-render.js)** ·423 — WEB2.0 module.
    - exposes: `PbhRender`
    - funcs (10): detail, injectHistoryCss, onclick, openCustomer, openHistory, renderCounters, renderCustomerChip, renderPagination, renderRow, renderRows
- **[pbh-state.js](../../web2/fastsaleorder-invoice/pbh-state.js)** ·89 — WEB2.0 module.
    - exposes: `PbhState`
    - uses shared: `Popup`, `API_CONFIG`
    - funcs (10): $, escapeHtml, fmtDate, fmtMoney, notify, stateBadge, tbody, w2pAlert, w2pConfirm, w2pPrompt

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

### web2/pancake-settings — WEB2.0 module.

- **[pancake-settings-actions.js](../../web2/pancake-settings/js/pancake-settings-actions.js)** ·609 — WEB2.0 module.
    - uses shared: `Popup`, `Web2Chat`, `Web2Optimistic`, `Web2PancakeAccounts`, `Web2PancakeToken`
    - funcs (26): addAccountAuto, addAccountFromInput, apply, clearJwt, clearPageTokens, closeCredsModal, closeExpiryModal, credsDelete, credsSave, deleteAccount, doAutoFetch, generateAll, nuke, onSuccess, openCredsModal, openExpiryModal, renewAccount, rollback, run, runMonitor, saveJwt, testJwt, toggleAddPanel, useAccount, wireCredsModal, wireModal
- **[pancake-settings-api.js](../../web2/pancake-settings/js/pancake-settings-api.js)** ·255 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Chat`, `Web2PancakeAccounts`
    - funcs (6): loadAccounts, loadPages, loadRelayPages, persistActiveToDb, saveRelaySelection, syncAccountPages
- **[pancake-settings-render.js](../../web2/pancake-settings/js/pancake-settings-render.js)** ·394 — WEB2.0 module.
    - uses shared: `Web2Chat`, `Web2PancakeAccounts`, `Web2PancakeToken`
    - funcs (8): \_expChip, renderAccountList, renderBanner, renderExtStatus, renderJwtInfo, renderPageAdminStats, renderPageList, renderRelayPages
- **[pancake-settings-state.js](../../web2/pancake-settings/js/pancake-settings-state.js)** ·110 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Chat`
    - funcs (7): $, \_restoreBtn, \_setBtnLoading, escapeHtml, formatExpiry, notify, shortToken
- **[pancake-settings.js](../../web2/pancake-settings/js/pancake-settings.js)** ·80 — WEB2.0 module.
    - uses shared: `Web2Chat`, `Web2Sidebar`
    - funcs (1): init

### web2/payment-confirm — Web 2.0 — Trang "Xác nhận Chuyển Khoản"

- **[payment-confirm-app.js](../../web2/payment-confirm/js/payment-confirm-app.js)** ·400 — Web 2.0 — Trang "Xác nhận Chuyển Khoản"
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2HistoryTimeline`, `Web2Optimistic`, `Web2Sidebar`, `Web2SSE`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (28): apply, authHeaders, bindActions, doAction, esc, fetchSignals, fetchUnread, fmtMoney, fmtTime, historyHtml, init, linkOrder, looksLikePaymentMsg, normalize, onchange, onclick, orderLink, reload, reloadNow, reloadUnread, renderSignals, renderUnread, rollback, run, switchTab, toast, updateCounts, userBody

### web2/photo-studio — WEB2.0 module.

- **[photo-studio-bg.js](../../web2/photo-studio/photo-studio-bg.js)** ·417 — WEB2.0 module.
    - exposes: `PS`
    - uses shared: `Web2Auth`
    - funcs (23): applyPickMask, authHeaders, cloudCutout, composeAI, getSam, getUpscaler, initLegacySeg, initSegmentation, lanczos2x, loadImgly, loadScript, localCutout, locateFile, maskToAlpha, onSegResults, onTasksResult, onerror, onload, populateMaskC, runSamDecode, samEmbed, segInputFrame, upscaleCanvas
- **[photo-studio-bgpicker.js](../../web2/photo-studio/photo-studio-bgpicker.js)** ·286 — WEB2.0 module.
    - exposes: `PS`
    - funcs (14): applyActiveBg, bgRowHTML, chipKey, deleteSavedBg, loadSavedBgs, onBgChip, onerror, onload, persistSavedBgs, renderBgRows, saveSavedBg, sceneFull, sceneThumb, selectBg
- **[photo-studio-canvas.js](../../web2/photo-studio/photo-studio-canvas.js)** ·186 — WEB2.0 module.
    - exposes: `PS`
    - funcs (14): blobToImage, buildSilhouette, canvasToBlob, drawBg, drawCover, drawLogo, drawPreset, drawShadow, fileToImage, imgToCanvas, keyOut, loadImageSrc, onerror, onload
- **[photo-studio-edit.js](../../web2/photo-studio/photo-studio-edit.js)** ·724 — WEB2.0 module.
    - exposes: `PS`
    - funcs (27): addPickPoint, backToCamera, batchCutout, bindReviewGestures, capture, downloadBatchZip, enterPickMode, exitPickMode, extractPickedObject, finishBrush, makeCutout, moveCursor, onBatchFiles, paintBrush, pickPointFromEvent, processOne, ratio, renderPick, renderReview, saveBlob, saveReview, schedule, setBrushMode, setPickUI, showReview, undoPickPoint, up
- **[photo-studio-state.js](../../web2/photo-studio/photo-studio-state.js)** ·215 — WEB2.0 module.
    - exposes: `PS`
    - funcs (18): activate, browserName, captureSize, clamp, cropRect, currentSourceEl, hexToRgb, hideLoading, isIOS, isMobile, notify, recomputeSizes, relucide, rgbToHex, showLoading, sizeCanvas, stamp, tickFps
- **[photo-studio-ui.js](../../web2/photo-studio/photo-studio-ui.js)** ·701 — WEB2.0 module.
    - exposes: `PS`
    - funcs (37): applyLogoDataUrl, applyMirrorClass, applyMobileDefaults, autoStartIfAllowed, bind, bindSlider, cache, cameraErrorMsg, closeSheet, frame, id, loadLogo, onBgFile, onLogoFile, onSourceFile, onchange, onerror, onload, openSheet, permissionStepsHTML, renderChroma, renderPassthrough, sampleKeyFromStage, setMode, showOriginal, showPermissionHelp, showStageError, startCamera, startLoop, stopAll, stopLoop, stopStream, switchCamera, syncMirrorToFacing, toggleCamera, updateHqHint, waitForVideo
- **[photo-studio.js](../../web2/photo-studio/photo-studio.js)** ·59 — WEB2.0 module.
    - exposes: `PS`, `PhotoStudio`
    - funcs (1): init
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
- **[web2-products-actions.js](../../web2/products/js/web2-products-actions.js)** ·138 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `Popup`, `Web2Optimistic`, `Web2ProductsCache`
    - funcs (10): \_doRemove, apply, copyCode, onSuccess, printBarcode, remove, rollback, run, snapshot, toggleActive
- **[web2-products-api.js](../../web2/products/js/web2-products-api.js)** ·148 — Web2 Products API client — /api/web2/products/\* qua Cloudflare Worker.
    - exposes: `Web2ProductsApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (14): \_fetchJson, \_w2Auth, adjustPending, adjustStock, confirmPurchase, create, getBatch, health, list, listPending, remove, update, upsertPending, usage
- **[web2-products-app.js](../../web2/products/js/web2-products-app.js)** ·325 — WEB2.0 module.
    - exposes: `Web2ProductsApp`
    - uses shared: `Web2Deeplink`, `Web2Effects`, `Web2Import`, `Web2ProductsCache`, `Web2SSE`, `Web2SuppliersCache`, `Web2VariantsCache`
    - funcs (10): \_handleDeeplink, \_requiredBlur, \_setupSse, autoRegen, debouncedFullLoad, getProduct, getUsage, init, onResult, refreshUsageOnly
- **[web2-products-filters.js](../../web2/products/js/web2-products-filters.js)** ·45 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - funcs (3): applyFilters, clearFilters, goPage
- **[web2-products-modal.js](../../web2/products/js/web2-products-modal.js)** ·729 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `Web2Import`, `Web2Optimistic`, `Web2ProductCode`, `Web2ProductsCache`, `Web2VariantMulti`, `Web2VariantsCache`
    - funcs (18): \_commitProductImport, \_productImportConfig, apply, closeModal, fmt, onDone, onSuccess, openCreate, openEdit, openHistory, populateSupplierDropdown, renderHistEntry, rollback, run, saveModal, snapshot, suggestProductCode, updateImagePreview
- **[web2-products-print-barcode.js](../../web2/products/js/web2-products-print-barcode.js)** ·98 — WEB2.0 module.
    - exposes: `W2PP`
    - uses shared: `API_CONFIG`
    - funcs (6): \_markProductsPrinted, genQrDataUrl, loadJsBarcode, loadQrLib, onerror, onload
- **[web2-products-print-modal.js](../../web2/products/js/web2-products-print-modal.js)** ·604 — WEB2.0 module.
    - exposes: `W2PP`
    - uses shared: `Web2Printer`, `Web2QR`
    - funcs (11): $, closeModal, closePrint, generateAndPrint, onclick, open, renderTableRows, showPrintOverlay, showSelectionModal, updateCount, updateSelectAllState
- **[web2-products-print-render.js](../../web2/products/js/web2-products-print-render.js)** ·496 — WEB2.0 module.
    - exposes: `W2PP`
    - uses shared: `Web2QR`
    - funcs (7): buildLabelHTML, draw, fitName, fitText, init, tooTall, tooWide
- **[web2-products-print-utils.js](../../web2/products/js/web2-products-print-utils.js)** ·187 — WEB2.0 module.
    - exposes: `W2PP`
    - uses shared: `Web2Auth`
    - funcs (6): \_qrKey, \_w2Auth, escapeHtml, formatPrice, notify, stripBrackets
- **[web2-products-print.js](../../web2/products/js/web2-products-print.js)** ·26 — WEB2.0 module.
    - exposes: `Web2ProductsPrint`
- **[web2-products-render.js](../../web2/products/js/web2-products-render.js)** ·536 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `Web2ProductsCache`
    - funcs (17): \_bulkPrint, \_clearSelection, \_loadUsageForCurrentPage, \_rowHtml, \_selectAllVisible, \_toggleSelect, \_updateBulkBar, \_updateRowInPlace, \_updateRowsBatch, \_updateSelectAllState, load, onDocClick, openUsagePopover, renderCounters, renderPagination, renderRows, renderUsageBadge
- **[web2-products-state.js](../../web2/products/js/web2-products-state.js)** ·173 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `API_CONFIG`, `Web2ProductCode`, `Web2SuppliersCache`, `Web2VariantsCache`
    - funcs (17): $, \_suppliersLoadPromise, collectExistingSuppliers, counter, cssEscape, escJs, escapeHtml, fmtPrice, getColorShortMap, loadSuppliersFromSoOrder, modal, notify, originPriceHover, pag, safeImageUrl, searchCount, tbody
- **[web2-products-variant-picker.js](../../web2/products/js/web2-products-variant-picker.js)** ·264 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `Web2ProductCode`, `Web2ProductsCache`, `Web2VariantMulti`, `Web2VariantsCache`
    - funcs (11): \_bulkCreateVariants, \_combinedVariant, \_isSizeGroup, \_renderCombinedHint, \_renderVariantMultiPreview, \_setVariantPickers, \_show, \_variantKind, \_wireVariantPicker, \_wireVariantPickerFor, split

### web2/purchase-refund — WEB2.0 module.

- **[purchase-refund-actions.js](../../web2/purchase-refund/js/purchase-refund-actions.js)** ·519 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Popup`, `Web2ProductsCache`
    - funcs (13): \_collectBulkLines, closeBulkRefund, closeQuickRefund, handleAction, openBulkRefund, openQuickRefund, renderBulkRows, submitBulkRefund, submitQuickRefund, updateBulkTotal, updateQuickTotal, wireBulkModal, wireQuickModal
- **[purchase-refund-api.js](../../web2/purchase-refund/js/purchase-refund-api.js)** ·255 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Web2Auth`, `Web2IdbStore`, `Web2ProductsCache`, `Web2SoOrder`
    - funcs (5): \_authHeaders, fetchJson, loadList, loadSoOrderReceivedItems, updateSupplierWallet
- **[purchase-refund-app.js](../../web2/purchase-refund/js/purchase-refund-app.js)** ·100 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Web2Sidebar`, `Web2SSE`
    - funcs (3): init, setupSSE, wireSourceList
- **[purchase-refund-modal.js](../../web2/purchase-refund/js/purchase-refund-modal.js)** ·370 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Web2ProductsCache`, `Web2SuppliersCache`
    - funcs (10): \_populateSupplierDatalist, closeModal, closePicker, confirmPicker, handleFormSubmit, openModal, openPicker, renderPicker, updatePickerCount, wirePicker
- **[purchase-refund-render.js](../../web2/purchase-refund/js/purchase-refund-render.js)** ·307 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Web2HistoryTimeline`, `Web2ProductsCache`
    - funcs (6): applyFilters, loadSourceItems, renderDetail, renderList, renderSourceList, selectRefund
- **[purchase-refund-state.js](../../web2/purchase-refund/js/purchase-refund-state.js)** ·268 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2UserInfo`
    - funcs (13): $, \_currentUserInfo, \_orderGroupKey, \_orderGroupLabel, escapeHtml, fmtDate, fmtDateTime, fmtMoney, notify, openImageLightbox, parseProducts, safeImageUrl, thumbHtml

### web2/reconcile — WEB2.0 module.

- **[reconcile-actions.js](../../web2/reconcile/js/reconcile-actions.js)** ·486 — WEB2.0 module.
    - exposes: `RC`
    - uses shared: `Popup`, `Web2UserInfo`
    - funcs (21): bindAuditUi, cancelPack, closeAuditModal, deliverOrder, fetchAudit, fmtTsFull, inputToTs, lockBody, onScannerSubmit, openAuditModal, packOrder, pad2, renderAuditResults, resetPick, returnFailedOrder, selectPbh, shipOrder, syncAuditInputs, toggleManualPick, tsToInput, unlockBody
- **[reconcile-api.js](../../web2/reconcile/js/reconcile-api.js)** ·135 — WEB2.0 module.
    - exposes: `RC`
    - uses shared: `Web2HistoryTimeline`, `Web2SSE`
    - funcs (6): \_scheduleSseDetail, \_scheduleSseList, historyNote, loadHistory, loadList, setupSse
- **[reconcile-app.js](../../web2/reconcile/js/reconcile-app.js)** ·178 — WEB2.0 module.
    - uses shared: `Web2BarcodeScanner`, `Web2HistoryTimeline`, `Web2LabelOcr`
    - funcs (4): bindUi, init, onResult, onScan
- **[reconcile-render.js](../../web2/reconcile/js/reconcile-render.js)** ·273 — WEB2.0 module.
    - exposes: `RC`
    - funcs (5): b, renderActionButtons, renderDetail, renderLine, renderList
- **[reconcile-state.js](../../web2/reconcile/js/reconcile-state.js)** ·160 — WEB2.0 module.
    - exposes: `RC`
    - uses shared: `API_CONFIG`, `Web2HistoryTimeline`
    - funcs (9): api, escapeHtml, feedback, fmtDateInvoice, fmtMoney, fmtSttDisplay, fmtTs, focusScanner, notify

### web2/returns — WEB2.0 module.

- **[returns-api.js](../../web2/returns/js/returns-api.js)** ·114 — WEB2.0 module.
    - exposes: `Web2ReturnsApi`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2UserInfo`
    - funcs (13): \_json, \_user, \_w2Auth, approve, create, customerOrders, list, pending, remove, searchCustomers, searchProducts, sourceOrder, walletBalance
- **[returns-app.js](../../web2/returns/js/returns-app.js)** ·196 — WEB2.0 module.
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
- **[returns-form.js](../../web2/returns/js/returns-form.js)** ·230 — WEB2.0 module.
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

- **[supplier-debt-actions.js](../../web2/supplier-debt/js/supplier-debt-actions.js)** ·122 — WEB2.0 module.
    - funcs (4): confirmNote, confirmPay, openNoteModal, openPayModal
- **[supplier-debt-api.js](../../web2/supplier-debt/js/supplier-debt-api.js)** ·431 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SoOrder`, `Web2UserInfo`
    - funcs (13): aggregate, api, authHeaders, getNoteForRow, loadAll, loadServerState, loadSoOrder, loadWeb2, makeRow, recordPayment, resolveCodeForSupplier, saveSupplier, saveSupplierNote
- **[supplier-debt-app.js](../../web2/supplier-debt/js/supplier-debt-app.js)** ·266 — WEB2.0 module.
    - uses shared: `Web2Deeplink`, `Web2SoOrder`, `Web2SSE`
    - funcs (6): \_onDateChange, \_sseConnect, init, nfc, scheduleReload, wireUi
- **[supplier-debt-filters.js](../../web2/supplier-debt/js/supplier-debt-filters.js)** ·72 — WEB2.0 module.
    - uses shared: `Web2SuppliersCache`
    - funcs (5): \_populateNccNameDatalist, currentMonthRange, pad, readFilters, setDefaultDateRange
- **[supplier-debt-render.js](../../web2/supplier-debt/js/supplier-debt-render.js)** ·505 — WEB2.0 module.
    - uses shared: `Web2Deeplink`
    - funcs (14): applyFilterAndRender, buildCongNoEntries, congnoTableHtml, detailPanelHtml, exportCsv, purchasesTableHtml, renderPagination, renderTable, renderTotals, toggleExpand, transactionsTableHtml, updateDetailPanel, updateSortIcons, wireDetailTabs
- **[supplier-debt-state.js](../../web2/supplier-debt/js/supplier-debt-state.js)** ·138 — WEB2.0 module.
    - funcs (12): cssAttrEscape, csvEscape, escapeHtml, fmtDateVN, fmtTime, fmtVnd, isBefore, isInPeriod, isoToTs, notify, rateToVnd, vnDate

### web2/supplier-wallet — WEB2.0 module.

- **[supplier-wallet-actions.js](../../web2/supplier-wallet/js/supplier-wallet-actions.js)** ·263 — WEB2.0 module.
    - uses shared: `Web2ProductsCache`, `Web2SuppliersCache`
    - funcs (7): confirmCreate, confirmPay, confirmReturn, openCreateModal, openPayModal, openReturnModal, recalcReturnTotal
- **[supplier-wallet-api.js](../../web2/supplier-wallet/js/supplier-wallet-api.js)** ·156 — WEB2.0 module.
    - funcs (6): aggregateSuppliers, ensure, loadAndRender, mergeAggregation, pollDeposits, pushSync
- **[supplier-wallet-app.js](../../web2/supplier-wallet/js/supplier-wallet-app.js)** ·260 — WEB2.0 module.
    - uses shared: `Web2Deeplink`, `Web2ProductsCache`, `Web2SSE`
    - funcs (5): \_sseConnect, init, nfc, scheduleAggregateReload, wireUi
- **[supplier-wallet-render.js](../../web2/supplier-wallet/js/supplier-wallet-render.js)** ·201 — WEB2.0 module.
    - uses shared: `Web2Deeplink`
    - funcs (6): cardHtml, openDetail, renderDetailTabs, renderHistory, renderList, renderPurchases
- **[supplier-wallet-state.js](../../web2/supplier-wallet/js/supplier-wallet-state.js)** ·141 — WEB2.0 module.
    - exposes: `SW_DEBUG`
    - uses shared: `Web2UserInfo`
    - funcs (9): \_dbg, \_isRowFullyReturned, \_swBy, escapeHtml, fmtDateVN, fmtTime, fmtVnd, notify, rateToVnd
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

### web2/zalo — WEB2.0 module.

- **[web2-zalo-accounts.js](../../web2/zalo/js/web2-zalo-accounts.js)** ·313 — WEB2.0 module.
    - exposes: `WZApp`
    - uses shared: `Popup`, `ZaloApi`
    - funcs (16): accCardHtml, addPersonal, choiceCardsHtml, closeOaModal, closeQrModal, loadAccounts, onAccAction, openOaModal, openQrModal, pollQr, renderAccounts, renderStatusStrip, saveAddPersonal, saveOa, skelCards, startQr
- **[web2-zalo-app.js](../../web2/zalo/js/web2-zalo-app.js)** ·178 — WEB2.0 module — Zalo single-source page app.
    - exposes: `WZApp`
    - uses shared: `Web2SSE`, `Web2Zalo`
    - funcs (6): bind, focusTab, gridActivate, init, subscribeSse, switchTab
- **[web2-zalo-chat.js](../../web2/zalo/js/web2-zalo-chat.js)** ·185 — WEB2.0 module.
    - exposes: `WZApp`
    - uses shared: `ZaloApi`, `WZChat`
    - funcs (8): bindConvHead, fillAccountSelect, getForwardTargets, loadConversations, maybeAutoSync, openConversation, renderConvList, syncConversations
- **[web2-zalo-lookup-zns.js](../../web2/zalo/js/web2-zalo-lookup-zns.js)** ·152 — WEB2.0 module.
    - exposes: `WZApp`
    - uses shared: `Web2UserInfo`, `ZaloApi`
    - funcs (5): doLookup, loadTemplates, loadZnsLog, sendZns, showSelf
- **[web2-zalo-utils.js](../../web2/zalo/js/web2-zalo-utils.js)** ·161 — WEB2.0 module.
    - exposes: `WZApp`
    - funcs (11): $, \_\_wzAvErr, \_trap, avatarHtml, esc, fmtTime, hideModal, initial, notify, setBusy, showModal

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
- **[web2-msg-template-core.js](../../web2/shared/web2-msg-template-core.js)** ·258 — WEB2.0 module.
    - exposes: `W2MT`
    - uses shared: `API_CONFIG`, `Web2Auth`, `W2MT`, `Web2MsgTemplate`
    - funcs (15): \_authHeaders, \_deleteTemplate, \_fillTemplate, \_formatLines, \_formatVnd, \_isSent, \_loadSent, \_loadTemplates, \_mapIn, \_markSent, \_refreshIcons, \_saveSent, \_saveTemplate, \_sleep, \_toast
- **[web2-msg-template-send.js](../../web2/shared/web2-msg-template-send.js)** ·456 — WEB2.0 module.
    - exposes: `W2MT`
    - uses shared: `Popup`, `Web2Chat`, `W2MT`, `Web2SSE`, `Web2UserInfo`
    - funcs (14): \_cancelActiveJob, \_drainExtension, \_ensurePill, \_extSendOne, \_fetchJob, \_handleSend, \_hidePill, \_maybeReattachActive, \_onProgress, \_pollJob, \_sendItemViaExtension, \_startWatch, \_stopWatch, \_updatePill
- **[web2-msg-template-ui.js](../../web2/shared/web2-msg-template-ui.js)** ·264 — WEB2.0 module.
    - exposes: `W2MT`
    - uses shared: `Popup`, `W2MT`
    - funcs (5): \_closeModal, \_ensureModal, \_openEditModal, \_renderCards, onclick
- **[web2-msg-template.js](../../web2/shared/web2-msg-template.js)** ·88 — WEB2.0 module.
    - exposes: `W2MT`, `Web2MsgTemplate`
    - funcs (1): open
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

| Hàm                | Số file | Gợi ý                                                 | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escapeHtml`       | 31      | → `Web2Escape` (web2-escape.js)                       | inventory-panel-state.js, utils.js, native-orders-app.js, so-order-format.js, web2-bh-core.js, web2-link-customer-modal.js, web2-manual-deposit.js, web2-partner-enricher.js, web2-pm-core.js, web2-customer-wallet-state.js, dlv-app.js, pbh-state.js, rf-app.js, kpi-assignments.js, kpi-dashboard.js, pancake-settings-state.js, web2-products-print-utils.js, web2-products-state.js, purchase-refund-state.js, reconcile-state.js, page-builder.js, web2-command-palette.js, web2-escape.js, web2-import.js, web2-notification-bell.js, web2-sidebar.js, supplier-debt-state.js, supplier-wallet-state.js, system-services.js, users-app.js, web2-variants-app.js |
| `_authHeaders`     | 17      | → `Web2Auth.authHeaders`                              | native-orders-api.js, customers-api.js, pbh-api.js, kpi-dashboard.js, purchase-refund-api.js, web2-api.js, web2-chat-client.js, web2-msg-template-core.js, web2-notification-bell.js, web2-pancake-accounts.js, web2-quick-reply.js, web2-so-order-reader.js, web2-suppliers-cache.js, web2-wallet-api.js, web2-zalo-api.js, web2-zalo.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                                  |
| `fmtTime`          | 17      | → shared format ngày/giờ GMT+7 (nên gom `Web2Format`) | comments-mobile-state.js, live-order-history.js, web2-bh-core.js, web2-pm-core.js, ck-dashboard-app.js, web2-customer-wallet-state.js, payment-confirm-app.js, web2-product-detail.js, web2-chat-panel.js, page-builder.js, web2-ck-review.js, web2-unread-panel.js, chat-store.js, supplier-debt-state.js, supplier-wallet-state.js, system-sse.js, web2-zalo-utils.js                                                                                                                                                                                                                                                                                                |
| `authHeaders`      | 14      | → `Web2Auth.authHeaders`                              | native-orders-kpi.js, web2-bh-core.js, web2-link-customer-modal.js, web2-manual-deposit.js, web2-pm-core.js, multi-tool.js, payment-confirm-app.js, photo-studio-bg.js, web2-api-fetch.js, web2-auth.js, web2-ck-assign-picker.js, web2-ck-review.js, web2-customer-store.js, supplier-debt-api.js                                                                                                                                                                                                                                                                                                                                                                     |
| `ensureStyles`     | 14      | → CSS shared / theme thay vì inject lặp               | web2-link-customer-modal.js, web2-manual-deposit.js, web2-pm-modal.js, popup.js, web2-barcode-scanner.js, web2-command-palette.js, web2-customer-chat.js, web2-label-ocr.js, web2-pack-counter.js, web2-product-counter.js, web2-qr-modal.js, web2-unread-panel.js, web2-wallet-balance.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                               |
| `fmtVnd`           | 13      | → shared format tiền (nên gom `Web2Format`)           | native-orders-kpi.js, so-order-format.js, web2-bh-core.js, web2-link-customer-modal.js, web2-pm-core.js, web2-customer-wallet-state.js, kpi-dashboard.js, web2-product-detail.js, web2-ck-assign-picker.js, web2-customer-detail-modal.js, web2-wallet-balance.js, supplier-debt-state.js, supplier-wallet-state.js                                                                                                                                                                                                                                                                                                                                                    |
| `_w2Auth`          | 10      | → `Web2Auth.authHeaders`                              | debt-manager.js, so-order-state.js, web2-products-api.js, web2-products-print-utils.js, returns-api.js, web2-customer-detail-modal.js, web2-printer.js, web2-qr-modal.js, web2-wallet-balance.js, web2-variants-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fmtDate`          | 10      | → shared format ngày/giờ GMT+7 (nên gom `Web2Format`) | web2-customer-wallet-state.js, dlv-app.js, pbh-state.js, rf-app.js, kpi-assignments.js, kpi-dashboard.js, multi-tool.js, purchase-refund-state.js, web2-ck-assign-picker.js, web2-customer-detail-modal.js                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `normPhone`        | 10      | → `Web2CustomerStore` (normPhone)                     | live-kho-enricher.js, web2-partner-enricher.js, web2-customer-wallet-state.js, customers-state.js, web2-ck-review.js, web2-customer-detail-modal.js, web2-customer-store.js, web2-wallet-api.js, web2-wallet-balance.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `renderPagination` | 10      | → `Web2Page` (page-builder) nếu là list-page          | native-orders-app.js, web2-bh-render.js, web2-customer-wallet-render.js, customers-render.js, dlv-app.js, pbh-render.js, rf-app.js, web2-products-render.js, page-builder.js, supplier-debt-render.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `closeModal`       | 9       | → `Web2Page` (page-builder) nếu là list-page          | live-customer-panel.js, web2-link-customer-modal.js, web2-pm-modal.js, customers-detail.js, web2-products-modal.js, web2-products-print-modal.js, purchase-refund-modal.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `applyFilters`     | 8       | → `Web2Page` (page-builder) nếu là list-page          | native-orders-app.js, dlv-app.js, pbh-filters.js, rf-app.js, web2-products-filters.js, purchase-refund-render.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `fmtMoney`         | 8       | → shared format tiền (nên gom `Web2Format`)           | live-order-history.js, customers-state.js, pbh-state.js, rf-app.js, payment-confirm-app.js, purchase-refund-state.js, reconcile-state.js, web2-ck-review.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `renderList`       | 8       | → `Web2Page` (page-builder) nếu là list-page          | web2-customer-wallet-render.js, jt-tracking-render.js, purchase-refund-render.js, reconcile-render.js, returns-tabs.js, web2-command-palette.js, supplier-wallet-render.js, users-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `renderRows`       | 8       | → `Web2Page` (page-builder) nếu là list-page          | native-orders-app.js, dlv-app.js, pbh-render.js, rf-app.js, web2-products-render.js, page-builder.js, web2-customer-chat.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `_esc`             | 7       | → `Web2Escape` (web2-escape.js)                       | live-chat-modal.js, live-hidden-commenters.js, live-livestream-gallery.js, live-livestream-snap-state.js, native-orders-packing-slip.js, web2-bill-service.js, system-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `reload`           | 7       |                                                       | live-livestream-gallery.js, web2-bh-data.js, pbh-app.js, payment-confirm-app.js, web2-unread-panel.js, chat-view.js, system-sse.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `renderCounters`   | 7       |                                                       | native-orders-app.js, dlv-app.js, pbh-render.js, rf-app.js, web2-products-render.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `_fetchJson`       | 6       |                                                       | live-native-orders-api.js, native-orders-api.js, web2-products-api.js, web2-api.js, web2-chat-client.js, web2-variants-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `clearFilters`     | 6       |                                                       | native-orders-app.js, dlv-app.js, pbh-filters.js, rf-app.js, web2-products-filters.js, page-builder.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `goPage`           | 6       |                                                       | native-orders-app.js, dlv-app.js, pbh-filters.js, rf-app.js, web2-products-filters.js, page-builder.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `jsonFetch`        | 6       |                                                       | web2-bh-core.js, web2-link-customer-modal.js, web2-manual-deposit.js, web2-pm-core.js, web2-customer-wallet-state.js, web2-wallet-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `normalize`        | 6       |                                                       | live-status.js, payment-confirm-app.js, delivery-method-picker.js, web2-customer-store.js, web2-unread-panel.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `openModal`        | 6       |                                                       | web2-link-customer-modal.js, web2-pm-modal.js, customers-detail.js, purchase-refund-modal.js, web2-customer-chat.js, web2-quick-reply.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `switchTab`        | 6       |                                                       | ck-dashboard-app.js, payment-confirm-app.js, returns-tabs.js, web2-customer-detail-modal.js, web2-import.js, web2-zalo-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `toast`            | 6       |                                                       | comments-mobile-actions.js, live-livestream-snap-actions.js, payment-confirm-app.js, returns-core.js, web2-ck-assign-picker.js, web2-ck-review.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `_notify`          | 5       |                                                       | native-orders-packing-slip.js, web2-customer-detail-modal.js, web2-optimistic.js, web2-quick-reply.js, web2-suppliers-cache.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `_w2AuthHeaders`   | 5       | → `Web2Auth.authHeaders`                              | live-api.js, live-campaign-manager.js, live-init-state.js, live-livestream-snap-state.js, pancake-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `exportCsv`        | 5       |                                                       | web2-bh-chat-export.js, web2-customer-wallet-events.js, customers-detail.js, pbh-actions.js, supplier-debt-render.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `initialize`       | 5       |                                                       | column-manager.js, settings-manager.js, live-init.js, pancake-init.js, pancake-token-manager.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `loadOlder`        | 5       |                                                       | pancake-chat-window.js, native-orders-app.js, web2-chat-panel.js, web2-customer-chat.js, chat-view.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `norm`             | 5       |                                                       | live-init-lifecycle.js, live-customer-sync.js, so-order-app.js, web2-command-palette.js, web2-phone-utils.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `_fetch`           | 4       |                                                       | customers-api.js, pbh-api.js, web2-zalo-api.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `_fileToDataUrl`   | 4       |                                                       | pancake-chat-window.js, native-orders-app.js, web2-customer-chat.js, web2-effects.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `_loadScript`      | 4       |                                                       | web2-customer-chat.js, web2-printer.js, web2-qr.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `_normalize`       | 4       |                                                       | web2-pm-core.js, web2-products-cache.js, web2-suppliers-cache.js, web2-variants-cache.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `_scheduleRefresh` | 4       |                                                       | inventory-panel-actions.js, web2-products-cache.js, web2-variants-cache.js, system-services.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `_sseConnect`      | 4       |                                                       | native-orders-app.js, supplier-debt-app.js, supplier-wallet-app.js, users-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `_toast`           | 4       |                                                       | live-hidden-commenters.js, live-livestream-gallery.js, live-livestream-snap-state.js, web2-msg-template-core.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `_user`            | 4       |                                                       | live-livestream-gallery.js, live-livestream-snap-state.js, inventory-panel-state.js, returns-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `debounce`         | 4       |                                                       | utils.js, web2-bh-core.js, web2-customer-wallet-state.js, jt-tracking-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `deleteAccount`    | 4       |                                                       | settings-manager.js, pancake-token-manager.js, pancake-settings-actions.js, web2-zalo-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `finish`           | 4       |                                                       | live-livestream-gallery.js, live-livestream-snap-stream.js, so-order-confirm.js, so-order-inline-edit.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `flush`            | 4       |                                                       | live-kho-enricher.js, so-order-storage.js, web2-partner-enricher.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `health`           | 4       |                                                       | native-orders-api.js, web2-products-api.js, web2-api.js, web2-variants-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `loadAccounts`     | 4       |                                                       | pancake-firestore-accounts.js, pancake-token-manager.js, pancake-settings-api.js, web2-zalo-accounts.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `loadComments`     | 4       |                                                       | live-api.js, live-init-lifecycle.js, live-init.js, live-source.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `loadHistory`      | 4       |                                                       | ck-dashboard-app.js, kpi-assignments.js, reconcile-api.js, web2-zalo-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `openEdit`         | 4       |                                                       | native-orders-app.js, web2-products-modal.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `parseTs`          | 4       |                                                       | comments-mobile-state.js, multi-tool.js, web2-chat-panel.js, web2-format.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `quickReplies`     | 4       |                                                       | pancake-chat-window.js, native-orders-app.js, web2-customer-chat.js, web2-zalo-api.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ready`            | 4       |                                                       | live-init-lifecycle.js, web2-idb-store.js, web2-pack-counter.js, web2-qr.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `renderHistory`    | 4       |                                                       | ck-dashboard-app.js, web2-customer-wallet-render.js, kpi-assignments.js, supplier-wallet-render.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `renderRow`        | 4       |                                                       | native-orders-app.js, web2-bh-render.js, web2-link-customer-modal.js, pbh-render.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `renderStats`      | 4       |                                                       | web2-bh-render.js, ck-dashboard-app.js, kpi-assignments.js, web2-chat-panel.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `saveModal`        | 4       |                                                       | customers-detail.js, web2-products-modal.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `scan`             | 4       |                                                       | live-kho-enricher.js, web2-chat-entity-detect.js, web2-effects.js, web2-lottie.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `schedule`         | 4       |                                                       | live-comment-list-render-list.js, live-comment-list-state.js, live-comments-stream.js, photo-studio-edit.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `sendMessage`      | 4       |                                                       | pancake-chat-window.js, web2-chat-client.js, web2-zalo-api.js, web2-zalo.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `stopTracks`       | 4       |                                                       | web2-barcode-scanner.js, web2-label-ocr.js, web2-pack-counter.js, web2-product-counter.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

_…và 52 hàm trùng khác (xem web2-codemap.json)._

## 5. File quá lớn (> 800 dòng) — cần tách module

| File                                                                                                 | Dòng |
| ---------------------------------------------------------------------------------------------------- | ---- |
| [native-orders/js/native-orders-app.js](../../native-orders/js/native-orders-app.js)                 | 9457 |
| [live-chat/server/server.js](../../live-chat/server/server.js)                                       | 1216 |
| [web2/shared/web2-chat-client.js](../../web2/shared/web2-chat-client.js)                             | 1199 |
| [web2/shared/chat-panel/web2-chat-panel.js](../../web2/shared/chat-panel/web2-chat-panel.js)         | 1049 |
| [so-order/js/so-order-storage.js](../../so-order/js/so-order-storage.js)                             | 962  |
| [web2/shared/web2-customer-chat.js](../../web2/shared/web2-customer-chat.js)                         | 842  |
| [live-chat/js/pancake/pancake-token-manager.js](../../live-chat/js/pancake/pancake-token-manager.js) | 803  |
