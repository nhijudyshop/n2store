<!-- AUTO-GENERATED bởi scripts/gen-web2-codemap.js — KHÔNG SỬA TAY. Regenerate: node scripts/gen-web2-codemap.js -->

# WEB2-CODEMAP — Bản đồ code Web 2.0

> **Auto-generated** • 2026-06-29 09:57 • 457 files, 148 shared modules, 3767 hàm, 15 file > 800 dòng.
> Sinh lại: `node scripts/gen-web2-codemap.js` (chạy sau khi đổi cấu trúc/ tách module / thêm trang).

## 0. Cách dùng (Claude / dev đọc TRƯỚC khi code)

1. **Cần 1 capability** (chat KH, sinh QR, popup/confirm, quét barcode, đếm SP, ví, SSE realtime, NCC, kho KH…) → tra **§1 Shared Modules TRƯỚC**. Có sẵn → tái dùng, **KHÔNG viết lại**.
2. **Cần biết 1 trang làm gì / có hàm gì / tìm ở đâu** → **§3 Pages** (mỗi file: mục đích + globals + shared đang dùng + danh sách hàm).
3. **Viết hàm mới mà thấy tên đã có ≥2 nơi** → **§4 Hàm trùng** → cân nhắc rút vào `web2/shared/` (1 nguồn dùng chung).
4. **File > 800 dòng** → **§5** (nợ kỹ thuật, cần tách module).

> Quy tắc gốc (CLAUDE.md): Web 2.0 tách **nhiều module nhỏ** (200-400 dòng, max 800); cái gì ≥2 nơi cần → **shared 1 nguồn**, trang chỉ điều phối.

## 1. Shared Modules Registry — `web2/shared/` (NGUỒN DÙNG CHUNG)

| Module (global)                                         | File                                                                                  | Mục đích                                                                                                | Consumers |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| —                                                       | [web2-beauty-face-worker.js](../../web2/shared/beauty/web2-beauty-face-worker.js)     | WEB2.0 — MODULE worker: nhận diện khuôn mặt NỀN (không đứng UI).                                        | 0         |
| `Web2BeautyFace`                                        | [web2-beauty-face.js](../../web2/shared/beauty/web2-beauty-face.js)                   | WEB2.0 shared — beauty face landmarks.                                                                  | 4         |
| `Web2BeautyFilters`                                     | [web2-beauty-filters.js](../../web2/shared/beauty/web2-beauty-filters.js)             | WEB2.0 shared — beauty engine (pure pixel ops).                                                         | 5         |
| `Web2BeautyStudio`                                      | [web2-beauty-studio.js](../../web2/shared/beauty/web2-beauty-studio.js)               | WEB2.0 shared — beauty studio UI.                                                                       | 1         |
| —                                                       | [web2-beauty-worker.js](../../web2/shared/beauty/web2-beauty-worker.js)               | WEB2.0 — Web Worker xử lý lọc làm đẹp NỀN (không đứng UI).                                              | 0         |
| `Web2ChatEmoji`                                         | [web2-chat-emoji-data.js](../../web2/shared/chat-panel/web2-chat-emoji-data.js)       | WEB2.0 — emoji dataset + recent helper cho Web2ChatPanel (tách từ pancake-chat-window).                 | 1         |
| `Web2ChatEntityDetect`                                  | [web2-chat-entity-detect.js](../../web2/shared/chat-panel/web2-chat-entity-detect.js) | WEB2.0 — nhận diện SĐT + địa chỉ trong tin nhắn chat (Feature 3).                                       | 2         |
| —                                                       | [web2-chat-panel-compose.js](../../web2/shared/chat-panel/web2-chat-panel-compose.js) | WEB2.0 module.                                                                                          | 0         |
| —                                                       | [web2-chat-panel-render.js](../../web2/shared/chat-panel/web2-chat-panel-render.js)   | WEB2.0 module.                                                                                          | 0         |
| —                                                       | [web2-chat-panel-state.js](../../web2/shared/chat-panel/web2-chat-panel-state.js)     | WEB2.0 module.                                                                                          | 0         |
| `Web2ChatPanel`                                         | [web2-chat-panel.js](../../web2/shared/chat-panel/web2-chat-panel.js)                 | WEB2.0 — component chat HỢP NHẤT (Web2ChatPanel) dùng chung native-orders/web2-pancake/balance-history. | 13        |
| `Web2ChatStickers`                                      | [web2-chat-sticker-data.js](../../web2/shared/chat-panel/web2-chat-sticker-data.js)   | WEB2.0 — bộ sticker built-in cho Web2ChatPanel (Feature 2 sticker-send).                                | 1         |
| `DeliveryMethodPicker`                                  | [delivery-method-picker.js](../../web2/shared/delivery-method-picker.js)              | Web 2.0 — Delivery method picker (Vietnam-aware)                                                        | 4         |
| `Web2Page`                                              | [page-builder.js](../../web2/shared/page-builder.js)                                  | Web 2.0 generic CRUD page builder — same look as WEB2 list views.                                       | 0         |
| `Popup`                                                 | [popup.js](../../web2/shared/popup.js)                                                | Web 2.0 — Custom Popup (alert / confirm / prompt)                                                       | 58        |
| `Web2AiAssistant`                                       | [web2-ai-assistant.js](../../web2/shared/web2-ai-assistant.js)                        | WEB2.0 shared module.                                                                                   | 3         |
| `Web2AiDescribe`                                        | [web2-ai-describe.js](../../web2/shared/web2-ai-describe.js)                          | WEB2.0 shared module.                                                                                   | 4         |
| `Web2CkReview`, `Web2UnreadPanel`, `Web2AiPageRegistry` | [web2-ai-page-registry.js](../../web2/shared/web2-ai-page-registry.js)                | WEB2.0 shared module.                                                                                   | 13        |
| `Web2AiPresets`, `AiPresets`                            | [web2-ai-presets.js](../../web2/shared/web2-ai-presets.js)                            | WEB2.0 module.                                                                                          | 5         |
| `Web2ApiFetch`                                          | [web2-api-fetch.js](../../web2/shared/web2-api-fetch.js)                              | WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.                                  | 1         |
| `Web2Api`                                               | [web2-api.js](../../web2/shared/web2-api.js)                                          | Web 2.0 generic API client — talks to /api/web2/:entity/\*                                              | 1         |
| `Web2AttendanceInstaller`                               | [web2-attendance-installer.js](../../web2/shared/web2-attendance-installer.js)        | WEB2.0 shared — 1-click tải & cài agent Chấm công DG-600.                                               | 0         |
| `Web2AuditLogData`, `Web2AuditLog`                      | [web2-audit-log.js](../../web2/shared/web2-audit-log.js)                              | WEB2.0 module.                                                                                          | 20        |
| `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`                 | [web2-auth.js](../../web2/shared/web2-auth.js)                                        | Token storage + verify + page guard.                                                                    | 144       |
| `Web2AvatarUtils`                                       | [web2-avatar-utils.js](../../web2/shared/web2-avatar-utils.js)                        | WEB2.0 shared module.                                                                                   | 1         |
| `Web2BarcodeScanner`                                    | [web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js)                  | WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.               | 4         |
| `Web2BgScene`                                           | [web2-bg-scene.js](../../web2/shared/web2-bg-scene.js)                                | WEB2.0 shared module.                                                                                   | 2         |
| `Web2BgRemover`                                         | [web2-bgremover.js](../../web2/shared/web2-bgremover.js)                              | WEB2.0 module.                                                                                          | 3         |
| `Web2Bill`                                              | [web2-bill-service.js](../../web2/shared/web2-bill-service.js)                        | WEB2.0 module.                                                                                          | 3         |
| `Web2Campaign`                                          | [web2-campaign.js](../../web2/shared/web2-campaign.js)                                | WEB2.0 shared.                                                                                          | 4         |
| `Web2CanvasUtils`                                       | [web2-canvas-utils.js](../../web2/shared/web2-canvas-utils.js)                        | WEB2.0 shared module.                                                                                   | 2         |
| —                                                       | [web2-chat-api.js](../../web2/shared/web2-chat-api.js)                                | WEB2.0 module.                                                                                          | 0         |
| `Web2Chat`                                              | [web2-chat-client.js](../../web2/shared/web2-chat-client.js)                          | WEB2.0 module.                                                                                          | 41        |
| —                                                       | [web2-chat-live.js](../../web2/shared/web2-chat-live.js)                              | WEB2.0 module.                                                                                          | 0         |
| —                                                       | [web2-chat-settings.js](../../web2/shared/web2-chat-settings.js)                      | WEB2.0 module.                                                                                          | 0         |
| —                                                       | [web2-chat-tags.js](../../web2/shared/web2-chat-tags.js)                              | WEB2.0 module.                                                                                          | 0         |
| —                                                       | [web2-chat-tokens.js](../../web2/shared/web2-chat-tokens.js)                          | WEB2.0 module.                                                                                          | 0         |
| —                                                       | [web2-chat-utils.js](../../web2/shared/web2-chat-utils.js)                            | WEB2.0 module.                                                                                          | 0         |
| `Web2CkAssignPicker`                                    | [web2-ck-assign-picker.js](../../web2/shared/web2-ck-assign-picker.js)                | WEB2.0 — picker gán giao dịch CK (balance-history) cho đơn chưa nhận CK.                                | 1         |
| `Web2CkReview`                                          | [web2-ck-review.js](../../web2/shared/web2-ck-review.js)                              | WEB2.0 module — đối chiếu & duyệt tín hiệu CK (dùng chung 3 trang).                                     | 3         |
| `Web2CommandPalette`                                    | [web2-command-palette.js](../../web2/shared/web2-command-palette.js)                  | WEB2.0 shared — Command Palette (Ctrl/Cmd+K) toàn cục.                                                  | 1         |
| `Web2ContentMaker`                                      | [web2-content-maker.js](../../web2/shared/web2-content-maker.js)                      | WEB2.0 shared module.                                                                                   | 2         |
| —                                                       | [web2-customer-chat-core.js](../../web2/shared/web2-customer-chat-core.js)            | WEB2.0 module.                                                                                          | 0         |
| —                                                       | [web2-customer-chat-modal.js](../../web2/shared/web2-customer-chat-modal.js)          | WEB2.0 module.                                                                                          | 0         |
| `Web2CustomerChat`                                      | [web2-customer-chat.js](../../web2/shared/web2-customer-chat.js)                      | WEB2.0 module.                                                                                          | 12        |
| `Web2CustomerDetailModal`                               | [web2-customer-detail-modal.js](../../web2/shared/web2-customer-detail-modal.js)      | WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/\*.                  | 3         |
| `PartnerCustomerApi`, `Web2CustomerLookup`              | [web2-customer-lookup.js](../../web2/shared/web2-customer-lookup.js)                  | WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.                                                   | 7         |
| `Web2CustomerStore`                                     | [web2-customer-store.js](../../web2/shared/web2-customer-store.js)                    | WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.                                                 | 12        |
| `Web2DbBadge`                                           | [web2-db-badge.js](../../web2/shared/web2-db-badge.js)                                | Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"                                   | 0         |
| `Web2Deeplink`                                          | [web2-deeplink.js](../../web2/shared/web2-deeplink.js)                                | WEB2.0 module.                                                                                          | 7         |
| `Web2DicebearCustomizer`                                | [web2-dicebear-customizer.js](../../web2/shared/web2-dicebear-customizer.js)          | WEB2.0 shared module.                                                                                   | 1         |
| `Web2Effects`                                           | [web2-effects.js](../../web2/shared/web2-effects.js)                                  | Web 2.0 — Effects / animations library                                                                  | 9         |
| `Web2Escape`                                            | [web2-escape.js](../../web2/shared/web2-escape.js)                                    | WEB2.0 module.                                                                                          | 52        |
| `Web2Export`                                            | [web2-export-helpers.js](../../web2/shared/web2-export-helpers.js)                    | WEB2.0 module.                                                                                          | 0         |
| `Web2Ext`                                               | [web2-extension-bridge.js](../../web2/shared/web2-extension-bridge.js)                | WEB2 EXTENSION BRIDGE                                                                                   | 6         |
| `Web2FbClient`, `FBPostsApi`                            | [web2-fb-client.js](../../web2/shared/web2-fb-client.js)                              | WEB2.0 shared — Facebook Graph API client (1 NGUỒN cho mọi trang FB).                                   | 9         |
| `Web2FbPostPreview`                                     | [web2-fb-post-preview.js](../../web2/shared/web2-fb-post-preview.js)                  | WEB2.0 shared — xem trước bài Facebook (giống FB) trước khi đăng.                                       | 1         |
| `Web2FbShare`                                           | [web2-fb-share.js](../../web2/shared/web2-fb-share.js)                                | WEB2.0 shared — handoff "Đăng lên FB": chuyển ảnh + caption từ 1 trang sang trang Đăng bài.             | 3         |
| `Web2Format`                                            | [web2-format.js](../../web2/shared/web2-format.js)                                    | WEB2.0 shared — 1 NGUỒN format tiền/ngày/giờ (GMT+7) cho Web 2.0.                                       | 21        |
| `Web2GeminiChat`                                        | [web2-gemini-chat.js](../../web2/shared/web2-gemini-chat.js)                          | WEB2.0 shared module.                                                                                   | 2         |
| `Web2GeminiClient`                                      | [web2-gemini-client.js](../../web2/shared/web2-gemini-client.js)                      | WEB2.0 shared module.                                                                                   | 1         |
| `Web2HistoryTimeline`                                   | [web2-history-timeline.js](../../web2/shared/web2-history-timeline.js)                | Web2HistoryTimeline — render lịch sử chỉnh sửa kèm tên user                                             | 8         |
| `Web2HtmlSkill`                                         | [web2-html-skill.js](../../web2/shared/web2-html-skill.js)                            | WEB2.0 shared — sinh HTML đẹp từ data bằng AI free.                                                     | 3         |
| `Web2IdbStore`                                          | [web2-idb-store.js](../../web2/shared/web2-idb-store.js)                              | Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.                                   | 5         |
| `Web2ImageEditor`                                       | [web2-image-editor.js](../../web2/shared/web2-image-editor.js)                        | WEB2.0 shared.                                                                                          | 2         |
| `Web2ImageLightbox`                                     | [web2-image-lightbox.js](../../web2/shared/web2-image-lightbox.js)                    | WEB2.0 shared module.                                                                                   | 7         |
| `Web2ImagePaste`                                        | [web2-image-paste.js](../../web2/shared/web2-image-paste.js)                          | WEB2.0 shared module.                                                                                   | 8         |
| `Web2Import`                                            | [web2-import.js](../../web2/shared/web2-import.js)                                    | WEB2.0 module.                                                                                          | 3         |
| `Web2JwtUtils`                                          | [web2-jwt-utils.js](../../web2/shared/web2-jwt-utils.js)                              | WEB2.0 shared module.                                                                                   | 3         |
| `Web2Kpi`                                               | [web2-kpi.js](../../web2/shared/web2-kpi.js)                                          | WEB2.0 module.                                                                                          | 5         |
| `Web2LabelOcr`                                          | [web2-label-ocr.js](../../web2/shared/web2-label-ocr.js)                              | WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.    | 2         |
| `Web2LiveTvDisplay`                                     | [web2-live-tv-display.js](../../web2/shared/web2-live-tv-display.js)                  | WEB2.0 shared — quy tắc HIỂN THỊ màn TV livestream.                                                     | 2         |
| `Web2LogoEraser`                                        | [web2-logo-eraser.js](../../web2/shared/web2-logo-eraser.js)                          | WEB2.0 shared.                                                                                          | 3         |
| `Web2Lottie`                                            | [web2-lottie.js](../../web2/shared/web2-lottie.js)                                    | WEB2.0 module.                                                                                          | 8         |
| `Web2Motion`                                            | [web2-motion.js](../../web2/shared/web2-motion.js)                                    | WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.                                 | 0         |
| `W2MT`                                                  | [web2-msg-template-core.js](../../web2/shared/web2-msg-template-core.js)              | WEB2.0 module.                                                                                          | 3         |
| `W2MT`                                                  | [web2-msg-template-send.js](../../web2/shared/web2-msg-template-send.js)              | WEB2.0 module.                                                                                          | 3         |
| `W2MT`                                                  | [web2-msg-template-ui.js](../../web2/shared/web2-msg-template-ui.js)                  | WEB2.0 module.                                                                                          | 3         |
| `W2MT`, `Web2MsgTemplate`                               | [web2-msg-template.js](../../web2/shared/web2-msg-template.js)                        | WEB2.0 module.                                                                                          | 5         |
| `Web2NewMsgBadge`                                       | [web2-new-msg-badge.js](../../web2/shared/web2-new-msg-badge.js)                      | Web 2.0 — New-message badge for native-orders rows                                                      | 1         |
| `Web2NotificationBell`                                  | [web2-notification-bell.js](../../web2/shared/web2-notification-bell.js)              |                                                                                                         | 0         |
| `Web2Notify`                                            | [web2-notify.js](../../web2/shared/web2-notify.js)                                    | WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.                                                       | 1         |
| `Web2NumberInput`                                       | [web2-number-input.js](../../web2/shared/web2-number-input.js)                        | WEB2.0 shared — 1 NGUỒN format số khi NHẬP (live thousand "." + decimal ",") cho Web 2.0.               | 16        |
| `Web2Optimistic`                                        | [web2-optimistic.js](../../web2/shared/web2-optimistic.js)                            | Codifies pattern: snapshot → apply optimistic UI → fire backend background →                            | 26        |
| `Web2OrderTagDetail`                                    | [web2-order-tag-detail.js](../../web2/shared/web2-order-tag-detail.js)                | WEB2.0 module.                                                                                          | 2         |
| `Web2OrderTagPill`                                      | [web2-order-tag-pill.js](../../web2/shared/web2-order-tag-pill.js)                    | WEB2.0 module.                                                                                          | 3         |
| `Web2PackCounter`                                       | [web2-pack-counter.js](../../web2/shared/web2-pack-counter.js)                        | WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.               | 0         |
| `Web2PancakeAccounts`                                   | [web2-pancake-accounts.js](../../web2/shared/web2-pancake-accounts.js)                | Web 2.0 — Pancake ACCOUNTS manager (DB-backed)                                                          | 4         |
| `Web2PancakeImport`                                     | [web2-pancake-import.js](../../web2/shared/web2-pancake-import.js)                    | WEB2.0 shared module.                                                                                   | 1         |
| `Web2PancakeToken`                                      | [web2-pancake-token.js](../../web2/shared/web2-pancake-token.js)                      | Web 2.0 — Pancake JWT token monitor + auto-refresh                                                      | 2         |
| `Web2Perm`                                              | [web2-perm.js](../../web2/shared/web2-perm.js)                                        | WEB2.0 shared — phân quyền (enforcement).                                                               | 3         |
| `Web2PhoneUtils`                                        | [web2-phone-utils.js](../../web2/shared/web2-phone-utils.js)                          | WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.                                                   | 5         |
| `Web2PosInstaller`                                      | [web2-pos-installer.js](../../web2/shared/web2-pos-installer.js)                      | WEB2.0 shared — kho đa dụng.                                                                            | 2         |
| `Web2Printer`                                           | [web2-printer.js](../../web2/shared/web2-printer.js)                                  | WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.             | 3         |
| `Web2ProductCode`                                       | [web2-product-code.js](../../web2/shared/web2-product-code.js)                        | WEB2.0 module.                                                                                          | 5         |
| `Web2ProductCounter`                                    | [web2-product-counter.js](../../web2/shared/web2-product-counter.js)                  | WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.                       | 4         |
| `Web2ProductGroup`                                      | [web2-product-group.js](../../web2/shared/web2-product-group.js)                      | WEB2.0 shared.                                                                                          | 2         |
| `Web2ProductPicker`                                     | [web2-product-picker.js](../../web2/shared/web2-product-picker.js)                    | WEB2.0 shared — chọn SP từ Kho SP (1 hoặc NHIỀU) trả full object.                                       | 1         |
| `Web2ProductTypesCache`                                 | [web2-product-types-cache.js](../../web2/shared/web2-product-types-cache.js)          | WEB2.0 module.                                                                                          | 5         |
| `Web2ProductUnits`                                      | [web2-product-units.js](../../web2/shared/web2-product-units.js)                      | WEB2.0 shared.                                                                                          | 4         |
| `Web2ProductsApi`                                       | [web2-products-api.js](../../web2/shared/web2-products-api.js)                        | WEB2.0 shared — Web2ProductsApi client (1 NGUỒN cho mọi trang dùng Kho SP).                             | 12        |
| `Web2ProductsCache`                                     | [web2-products-cache.js](../../web2/shared/web2-products-cache.js)                    | WEB2.0 module.                                                                                          | 25        |
| `Web2PWA`                                               | [web2-pwa.js](../../web2/shared/web2-pwa.js)                                          | WEB2.0 shared — PWA (Thêm vào Màn hình chính) cho MỌI trang, không cần App Store.                       | 1         |
| `Web2QrModal`                                           | [web2-qr-modal.js](../../web2/shared/web2-qr-modal.js)                                | WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.                     | 1         |
| `Web2QR`                                                | [web2-qr.js](../../web2/shared/web2-qr.js)                                            | WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.                                 | 3         |
| `Web2QuickReply`                                        | [web2-quick-reply.js](../../web2/shared/web2-quick-reply.js)                          | Web 2.0 — Quick Reply system                                                                            | 1         |
| `Web2Realtime`                                          | [web2-realtime.js](../../web2/shared/web2-realtime.js)                                | Web 2.0 — Realtime client (Pancake WS)                                                                  | 5         |
| `NativeReturnBill`                                      | [web2-return-bill.js](../../web2/shared/web2-return-bill.js)                          | WEB2.0 module.                                                                                          | 1         |
| `Web2ShelfMap`                                          | [web2-shelf-map.js](../../web2/shared/web2-shelf-map.js)                              | WEB2.0 shared.                                                                                          | 1         |
| `Web2Sidebar`                                           | [web2-sidebar.js](../../web2/shared/web2-sidebar.js)                                  | WEB2-clone sidebar for Web 2.0 pages.                                                                   | 17        |
| `Web2Skeleton`                                          | [web2-skeleton.js](../../web2/shared/web2-skeleton.js)                                | WEB2.0 module — GitHub-style skeleton loading.                                                          | 34        |
| `Web2SmartCache`                                        | [web2-smart-cache.js](../../web2/shared/web2-smart-cache.js)                          | WEB2.0 module.                                                                                          | 8         |
| `Web2SoOrder`                                           | [web2-so-order-reader.js](../../web2/shared/web2-so-order-reader.js)                  | WEB2.0 module.                                                                                          | 5         |
| `Web2SoOrderUtils`                                      | [web2-so-order-utils.js](../../web2/shared/web2-so-order-utils.js)                    | WEB2.0 shared module.                                                                                   | 1         |
| `Web2SSE`                                               | [web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js)                            | WEB2.0 module.                                                                                          | 69        |
| `Web2SSETopics`                                         | [web2-sse-topics.js](../../web2/shared/web2-sse-topics.js)                            | WEB2.0 module.                                                                                          | 0         |
| `Web2SupplierPay`                                       | [web2-supplier-pay.js](../../web2/shared/web2-supplier-pay.js)                        | WEB2.0 module.                                                                                          | 4         |
| `Web2SuppliersCache`                                    | [web2-suppliers-cache.js](../../web2/shared/web2-suppliers-cache.js)                  | WEB2.0 module.                                                                                          | 9         |
| `Web2TextUtils`                                         | [web2-text-utils.js](../../web2/shared/web2-text-utils.js)                            | WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.                                 | 1         |
| `Web2Translate`                                         | [web2-translate.js](../../web2/shared/web2-translate.js)                              | WEB2.0 module dùng chung.                                                                               | 2         |
| `Web2Tryon`                                             | [web2-tryon.js](../../web2/shared/web2-tryon.js)                                      | WEB2.0 shared module.                                                                                   | 2         |
| `Web2UnitReprint`                                       | [web2-unit-reprint.js](../../web2/shared/web2-unit-reprint.js)                        | WEB2.0 shared — In lại tem ĐƠN VỊ (per-unit reprint). Đặc tả: docs/web2/PER-UNIT-QR-PLAN.md             | 1         |
| `Web2UnreadPanel`                                       | [web2-unread-panel.js](../../web2/shared/web2-unread-panel.js)                        | WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).                | 2         |
| `Web2UserInfo`                                          | [web2-user-info.js](../../web2/shared/web2-user-info.js)                              | WEB2.0 module.                                                                                          | 27        |
| `Web2UserProfile`                                       | [web2-user-profile.js](../../web2/shared/web2-user-profile.js)                        | WEB2.0 module — Hồ sơ user + đổi avatar DiceBear (dùng chung mọi trang).                                | 3         |
| `Web2VariantGroup`                                      | [web2-variant-group.js](../../web2/shared/web2-variant-group.js)                      | WEB2.0 shared.                                                                                          | 5         |
| `Web2VariantMulti`                                      | [web2-variant-multi.js](../../web2/shared/web2-variant-multi.js)                      | WEB2.0 module.                                                                                          | 6         |
| `Web2VariantPicker`                                     | [web2-variant-picker.js](../../web2/shared/web2-variant-picker.js)                    | WEB2.0 module.                                                                                          | 3         |
| `Web2VariantsCache`                                     | [web2-variants-cache.js](../../web2/shared/web2-variants-cache.js)                    | WEB2.0 module.                                                                                          | 14        |
| `Web2VideoRender`                                       | [web2-video-render.js](../../web2/shared/web2-video-render.js)                        | WEB2.0 shared — render HTML→MP4 qua máy shop (HyperFrames).                                             | 5         |
| `Web2Vieneu`                                            | [web2-vieneu.js](../../web2/shared/web2-vieneu.js)                                    | WEB2.0 shared — kho Voice.                                                                              | 2         |
| `Web2VnAddress`                                         | [web2-vn-address.js](../../web2/shared/web2-vn-address.js)                            | WEB2.0 shared — Web2VnAddress: bộ chọn Tỉnh/TP → Phường/Xã (2 cấp, dùng chung).                         | 2         |
| `Web2WalletApi`                                         | [web2-wallet-api.js](../../web2/shared/web2-wallet-api.js)                            | WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).                                           | 4         |
| `Web2WalletBalance`                                     | [web2-wallet-balance.js](../../web2/shared/web2-wallet-balance.js)                    | WEB2.0 — shared helper hiển thị số dư ví KH.                                                            | 19        |
| `Web2Watermark`                                         | [web2-watermark.js](../../web2/shared/web2-watermark.js)                              | WEB2.0 shared module.                                                                                   | 1         |
| `Web2ZaloOwner`, `ZaloApi`                              | [web2-zalo-api.js](../../web2/shared/web2-zalo-api.js)                                | WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).                                                       | 11        |
| `Web2ZaloPresence`                                      | [web2-zalo-presence.js](../../web2/shared/web2-zalo-presence.js)                      | WEB2.0 module.                                                                                          | 0         |
| `Web2Zalo`                                              | [web2-zalo.js](../../web2/shared/web2-zalo.js)                                        | WEB2.0 shared — Web2Zalo helper (single-source Zalo).                                                   | 6         |
| `WZChat`                                                | [bubbles.js](../../web2/shared/zalo-chat/bubbles.js)                                  | WEB2.0 module — Zalo chat message renderer.                                                             | 11        |
| `WZChat`                                                | [chat-actions.js](../../web2/shared/zalo-chat/chat-actions.js)                        | WEB2.0 module — Zalo chat actions (network + optimistic).                                               | 11        |
| `WZChat`                                                | [chat-store.js](../../web2/shared/zalo-chat/chat-store.js)                            | WEB2.0 module — Zalo chat shared store + utils (WZChat.\*).                                             | 11        |
| `WZChat`                                                | [chat-view.js](../../web2/shared/zalo-chat/chat-view.js)                              | WEB2.0 shared — Zalo chat VIEW (mount 1 hội thoại vào bất kỳ container).                                | 11        |
| `WZChat`                                                | [composer.js](../../web2/shared/zalo-chat/composer.js)                                | WEB2.0 module — Zalo chat composer (input đầy đủ).                                                      | 11        |
| `WZChat`                                                | [emoji-picker.js](../../web2/shared/zalo-chat/emoji-picker.js)                        | WEB2.0 module — Zalo chat emoji picker (client-only).                                                   | 11        |
| `WZChat`                                                | [lightbox.js](../../web2/shared/zalo-chat/lightbox.js)                                | WEB2.0 module — Zalo chat lightbox (xem ảnh full + prev/next).                                          | 11        |
| `WZChat`                                                | [reactions.js](../../web2/shared/zalo-chat/reactions.js)                              | WEB2.0 module — Zalo chat reaction bar (add-only).                                                      | 11        |
| `WZChat`                                                | [realtime.js](../../web2/shared/zalo-chat/realtime.js)                                | WEB2.0 module — Zalo chat realtime (SSE patch).                                                         | 11        |
| `WZChat`                                                | [sticker-picker.js](../../web2/shared/zalo-chat/sticker-picker.js)                    | WEB2.0 module — Zalo chat sticker picker.                                                               | 11        |

<details><summary><b>Chi tiết API từng shared module</b> (bấm mở)</summary>

#### `Web2BeautyFace` — [web2/shared/beauty/web2-beauty-face.js](../../web2/shared/beauty/web2-beauty-face.js) · 448 dòng

WEB2.0 shared — beauty face landmarks.
**Dùng bởi:** `web2/shared/beauty/web2-beauty-studio.js`, `web2/video-beauty/js/video-beauty-export.js`, `web2/video-beauty/js/video-beauty-render.js`, `web2/video-beauty/js/video-beauty.js`

#### `Web2BeautyFilters` — [web2/shared/beauty/web2-beauty-filters.js](../../web2/shared/beauty/web2-beauty-filters.js) · 399 dòng

WEB2.0 shared — beauty engine (pure pixel ops).
**Dùng bởi:** `web2/shared/beauty/web2-beauty-face.js`, `web2/shared/beauty/web2-beauty-studio.js`, `web2/shared/beauty/web2-beauty-worker.js`, `web2/video-beauty/js/video-beauty-render.js`, `web2/video-beauty/js/video-beauty.js`

#### `Web2BeautyStudio` — [web2/shared/beauty/web2-beauty-studio.js](../../web2/shared/beauty/web2-beauty-studio.js) · 607 dòng

WEB2.0 shared — beauty studio UI.
**Dùng bởi:** `web2/ai-photo/js/ai-photo.js`

#### `Web2ChatEmoji` — [web2/shared/chat-panel/web2-chat-emoji-data.js](../../web2/shared/chat-panel/web2-chat-emoji-data.js) · 212 dòng

WEB2.0 — emoji dataset + recent helper cho Web2ChatPanel (tách từ pancake-chat-window).
**Dùng bởi:** `web2/shared/chat-panel/web2-chat-panel-compose.js`

#### `Web2ChatEntityDetect` — [web2/shared/chat-panel/web2-chat-entity-detect.js](../../web2/shared/chat-panel/web2-chat-entity-detect.js) · 142 dòng

WEB2.0 — nhận diện SĐT + địa chỉ trong tin nhắn chat (Feature 3).
**Dùng bởi:** `web2/shared/chat-panel/web2-chat-panel-compose.js`, `web2/shared/chat-panel/web2-chat-panel-render.js`

#### `Web2ChatPanel` — [web2/shared/chat-panel/web2-chat-panel.js](../../web2/shared/chat-panel/web2-chat-panel.js) · 120 dòng

WEB2.0 — component chat HỢP NHẤT (Web2ChatPanel) dùng chung native-orders/web2-pancake/balance-history.
**Dùng bởi:** `live-chat/js/live/live-chat-modal.js`, `live-chat/js/pancake/inventory-panel-render.js`, `live-chat/js/pancake/pancake-chat-window.js`, `native-orders/js/native-orders-interactions.js`, `native-orders/js/native-orders-public-api.js`, `web2/shared/chat-panel/web2-chat-emoji-data.js`, `web2/shared/chat-panel/web2-chat-panel-compose.js`, `web2/shared/chat-panel/web2-chat-panel-render.js`, `web2/shared/chat-panel/web2-chat-panel-state.js`, `web2/shared/chat-panel/web2-chat-sticker-data.js`, `web2/shared/web2-customer-chat-core.js`, `web2/shared/web2-customer-chat-modal.js`, `web2/shared/web2-customer-chat.js`

#### `Web2ChatStickers` — [web2/shared/chat-panel/web2-chat-sticker-data.js](../../web2/shared/chat-panel/web2-chat-sticker-data.js) · 33 dòng

WEB2.0 — bộ sticker built-in cho Web2ChatPanel (Feature 2 sticker-send).
**Dùng bởi:** `web2/shared/chat-panel/web2-chat-panel-compose.js`

#### `DeliveryMethodPicker` — [web2/shared/delivery-method-picker.js](../../web2/shared/delivery-method-picker.js) · 617 dòng

Web 2.0 — Delivery method picker (Vietnam-aware)
**Dùng bởi:** `native-orders/js/native-orders-bulk-operations.js`, `native-orders/js/native-orders-delivery.js`, `native-orders/js/native-orders-pbh-bill.js`, `web2/shared/web2-sidebar.js`

#### `Web2Page` — [web2/shared/page-builder.js](../../web2/shared/page-builder.js) · 763 dòng

Web 2.0 generic CRUD page builder — same look as WEB2 list views.

#### `Popup` — [web2/shared/popup.js](../../web2/shared/popup.js) · 481 dòng

Web 2.0 — Custom Popup (alert / confirm / prompt)
**Dùng bởi:** `live-chat/js/layout/settings-manager.js`, `live-chat/js/live/live-campaign-manager.js`, `live-chat/js/live/live-comment-list-events.js`, `live-chat/js/live/live-livestream-gallery.js`, `live-chat/js/live/live-livestream-snap-actions.js`, `live-chat/js/live/live-livestream-snap-lock.js`, `live-chat/js/live/live-livestream-snap-render.js`, `live-chat/js/live/live-livestream-snap-ui.js`, `live-chat/js/pancake/inventory-panel-render.js`, `live-chat/js/pancake/pancake-context-menu.js`, `native-orders/js/native-orders-bulk-operations.js`, `native-orders/js/native-orders-interactions.js`, `native-orders/js/native-orders-pbh-bill.js`, `native-orders/js/native-orders-state.js`, `so-order/js/so-order-image-manager.js`, `web2/ai-hub/js/ai-chat.js`, `web2/ai-hub/js/ai-image.js`, `web2/balance-history/js/web2-bh-link-customer.js`, `web2/cham-cong/js/cham-cong-app.js`, `web2/cham-cong/js/cham-cong-employees.js`, `web2/chi-tieu/js/chi-tieu-app.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customers/js/customers-detail.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-state.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/fb-ads-stats/js/fb-ads-manual.js`, `web2/fb-posts/js/fb-posts-app.js`, `web2/fb-posts/js/fb-posts-composer.js`, `web2/fb-posts/js/fb-posts-drafts.js`, `web2/fb-posts/js/fb-posts-list.js`, `web2/goods-weight/js/goods-weight.js`, `web2/live-control/js/live-control.js`, `web2/order-tags/js/order-tags-app.js`, `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/product-types/js/web2-product-types-app.js`, `web2/products/js/web2-products-actions.js`, `web2/purchase-refund/js/purchase-refund-actions.js`, `web2/reconcile/js/reconcile-actions.js`, `web2/returns/js/returns-tabs.js`, `web2/shared/page-builder.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-export-helpers.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`, `web2/shared/web2-notify.js`, `web2/shared/web2-quick-reply.js`, `web2/shared/web2-return-bill.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-user-profile.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/system/js/system-modules.js`, `web2/system/js/system-sse.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/zalo/js/web2-zalo-accounts.js`

#### `Web2AiAssistant` — [web2/shared/web2-ai-assistant.js](../../web2/shared/web2-ai-assistant.js) · 1335 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/ai-assistant/js/ai-assistant.js`, `web2/shared/web2-ai-page-registry.js`, `web2/shared/web2-sidebar.js`

#### `Web2AiDescribe` — [web2/shared/web2-ai-describe.js](../../web2/shared/web2-ai-describe.js) · 302 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/ai-hub/js/ai-image.js`, `web2/shared/web2-ai-assistant.js`, `web2/shared/web2-content-maker.js`, `web2/shared/web2-tryon.js`

#### `Web2CkReview`, `Web2UnreadPanel`, `Web2AiPageRegistry` — [web2/shared/web2-ai-page-registry.js](../../web2/shared/web2-ai-page-registry.js) · 1871 dòng

WEB2.0 shared module.
**Dùng bởi:** `native-orders/js/native-orders-realtime-init.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/fb-insights/js/fb-insights.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/order-tags/js/order-tags-app.js`, `web2/shared/web2-ai-assistant.js`, `web2/shared/web2-ai-page-registry.js`, `web2/shared/web2-audit-log.js`, `web2/shared/web2-sidebar.js`, `web2/system/js/system-ai-suggestions.js`, `web2/users/js/users-app.js`

#### `Web2AiPresets`, `AiPresets` — [web2/shared/web2-ai-presets.js](../../web2/shared/web2-ai-presets.js) · 897 dòng

WEB2.0 module.
**Dùng bởi:** `web2/ai-hub/js/ai-chat.js`, `web2/ai-hub/js/ai-image.js`, `web2/shared/web2-gemini-chat.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-tryon.js`

#### `Web2ApiFetch` — [web2/shared/web2-api-fetch.js](../../web2/shared/web2-api-fetch.js) · 82 dòng

WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Api` — [web2/shared/web2-api.js](../../web2/shared/web2-api.js) · 94 dòng

Web 2.0 generic API client — talks to /api/web2/:entity/\*
**Dùng bởi:** `web2/shared/page-builder.js`

#### `Web2AttendanceInstaller` — [web2/shared/web2-attendance-installer.js](../../web2/shared/web2-attendance-installer.js) · 245 dòng

WEB2.0 shared — 1-click tải & cài agent Chấm công DG-600.

#### `Web2AuditLogData`, `Web2AuditLog` — [web2/shared/web2-audit-log.js](../../web2/shared/web2-audit-log.js) · 477 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-public-api.js`, `so-order/js/so-order-toolbar.js`, `web2/balance-history/js/web2-bh-render.js`, `web2/customers/js/customers-detail.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/fb-posts/js/fb-posts-drafts.js`, `web2/fb-posts/js/fb-posts-list.js`, `web2/jt-tracking/js/jt-tracking-app.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/live-control/js/live-control.js`, `web2/order-tags/js/order-tags-app.js`, `web2/reconcile/js/reconcile-render.js`, `web2/returns/js/returns-app.js`, `web2/shared/page-builder.js`, `web2/shared/web2-ai-page-registry.js`, `web2/shared/web2-sidebar.js`, `web2/supplier-debt/js/supplier-debt-render.js`, `web2/supplier-wallet/js/supplier-wallet-render.js`, `web2/users/js/users-app.js`

#### `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth` — [web2/shared/web2-auth.js](../../web2/shared/web2-auth.js) · 308 dòng

Token storage + verify + page guard.
**Dùng bởi:** `live-chat/js/api-config.js`, `live-chat/js/live/comments-mobile-actions.js`, `live-chat/js/live/comments-mobile-state.js`, `live-chat/js/live/live-api.js`, `live-chat/js/live/live-campaign-manager.js`, `live-chat/js/live/live-comment-list-base.js`, `live-chat/js/live/live-hidden-commenters.js`, `live-chat/js/live/live-init-state.js`, `live-chat/js/live/live-kho-enricher.js`, `live-chat/js/live/live-livestream-snap-lock.js`, `live-chat/js/live/live-livestream-snap-state.js`, `live-chat/js/live/live-native-orders-api.js`, `live-chat/js/live/live-state.js`, `live-chat/js/pancake/inventory-panel-actions.js`, `live-chat/js/pancake/inventory-panel-state.js`, `live-chat/js/pancake/pancake-api.js`, `live-chat/js/pancake/pancake-chat-window.js`, `live-chat/js/pancake/pancake-livestream-filter.js`, `live-chat/js/pancake/pancake-page-access-tokens.js`, `live-chat/js/pancake/pancake-state.js`, `live-chat/js/shared/debt-manager.js`, `live-chat/js/shared/live-comments-stream.js`, `live-chat/js/shared/live-customer-sync.js`, `native-orders/js/native-orders-api.js`, `native-orders/js/native-orders-bulk-operations.js`, `native-orders/js/native-orders-customer-panel.js`, `native-orders/js/native-orders-customer360.js`, `native-orders/js/native-orders-inbox-resolve.js`, `native-orders/js/native-orders-kpi.js`, `native-orders/js/native-orders-pbh-bill.js`, `native-orders/js/native-orders-product-picker.js`, `native-orders/js/native-orders-render.js`, `native-orders/js/native-orders-snapshots.js`, `native-orders/js/native-orders-state.js`, `native-orders/js/native-orders-unit-serials.js`, `so-order/js/so-order-image-manager.js`, `so-order/js/so-order-payments.js`, `so-order/js/so-order-state.js`, `so-order/js/so-order-storage-sync.js`, `web2/ai-assistant/js/ai-assistant.js`, `web2/ai-hub/js/ai-hub.js`, `web2/balance-history/js/web2-bh-core.js`, `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/balance-history/js/web2-pm-core.js`, `web2/cham-cong/js/cham-cong-api.js`, `web2/cham-cong/js/cham-cong-app.js`, `web2/chi-tieu/js/chi-tieu-api.js`, `web2/chi-tieu/js/chi-tieu-app.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/clearance/js/clearance.js`, `web2/customer-wallet/js/web2-customer-wallet-events.js`, `web2/customer-wallet/js/web2-customer-wallet-render.js`, `web2/customer-wallet/js/web2-customer-wallet-state.js`, `web2/customers/js/customers-api.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-api.js`, `web2/fastsaleorder-invoice/pbh-state.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/fb-ads-stats/js/fb-ads-manual.js`, `web2/fb-posts/js/fb-posts-composer.js`, `web2/goods-weight/js/goods-weight.js`, `web2/jt-tracking/js/jt-tracking-api.js`, `web2/jt-tracking/js/jt-tracking-constants.js`, `web2/kpi/js/kpi-assignments.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/live-control/js/live-control.js`, `web2/multi-tool/js/multi-tool.js`, `web2/order-tags/js/order-tags-app.js`, `web2/overview/overview.js`, `web2/pancake-settings/js/pancake-settings-api.js`, `web2/pancake-settings/js/pancake-settings-state.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/photo-studio/photo-studio-bg.js`, `web2/product-types/js/web2-product-types-api.js`, `web2/products/js/web2-product-detail.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-print-barcode.js`, `web2/products/js/web2-products-print-utils.js`, `web2/products/js/web2-products-state.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/purchase-refund/js/purchase-refund-state.js`, `web2/reconcile/js/reconcile-state.js`, `web2/returns/js/returns-api.js`, `web2/shared/beauty/web2-beauty-face.js`, `web2/shared/chat-panel/web2-chat-panel-state.js`, `web2/shared/delivery-method-picker.js`, `web2/shared/web2-ai-assistant.js`, `web2/shared/web2-ai-describe.js`, `web2/shared/web2-ai-page-registry.js`, `web2/shared/web2-api-fetch.js`, `web2/shared/web2-api.js`, `web2/shared/web2-attendance-installer.js`, `web2/shared/web2-audit-log.js`, `web2/shared/web2-avatar-utils.js`, `web2/shared/web2-bgremover.js`, `web2/shared/web2-campaign.js`, `web2/shared/web2-chat-utils.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-chat-core.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-customer-store.js`, `web2/shared/web2-fb-client.js`, `web2/shared/web2-gemini-client.js`, `web2/shared/web2-html-skill.js`, `web2/shared/web2-kpi.js`, `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-notification-bell.js`, `web2/shared/web2-order-tag-detail.js`, `web2/shared/web2-pancake-accounts.js`, `web2/shared/web2-perm.js`, `web2/shared/web2-printer.js`, `web2/shared/web2-product-counter.js`, `web2/shared/web2-product-units.js`, `web2/shared/web2-products-api.js`, `web2/shared/web2-qr-modal.js`, `web2/shared/web2-quick-reply.js`, `web2/shared/web2-realtime.js`, `web2/shared/web2-return-bill.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-so-order-reader.js`, `web2/shared/web2-suppliers-cache.js`, `web2/shared/web2-translate.js`, `web2/shared/web2-tryon.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-user-info.js`, `web2/shared/web2-user-profile.js`, `web2/shared/web2-video-render.js`, `web2/shared/web2-vieneu.js`, `web2/shared/web2-wallet-api.js`, `web2/shared/web2-wallet-balance.js`, `web2/shared/web2-zalo-api.js`, `web2/shared/web2-zalo.js`, `web2/supplier-debt/js/supplier-debt-actions.js`, `web2/supplier-debt/js/supplier-debt-api.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`, `web2/system/js/system-services.js`, `web2/system/js/system-sse.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-api.js`, `web2/video-maker/js/video-ai-script.js`, `web2/video-maker/js/video-stock.js`, `web2/video-maker/js/video-tts.js`

#### `Web2AvatarUtils` — [web2/shared/web2-avatar-utils.js](../../web2/shared/web2-avatar-utils.js) · 140 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2BarcodeScanner` — [web2/shared/web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js) · 443 dòng

WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.
**Dùng bởi:** `web2/reconcile/js/reconcile-app.js`, `web2/shared/web2-label-ocr.js`, `web2/shared/web2-pack-counter.js`, `web2/unit-scan/js/unit-scan.js`

#### `Web2BgScene` — [web2/shared/web2-bg-scene.js](../../web2/shared/web2-bg-scene.js) · 325 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/ai-photo/js/ai-photo.js`, `web2/product-card/js/product-card.js`

#### `Web2BgRemover` — [web2/shared/web2-bgremover.js](../../web2/shared/web2-bgremover.js) · 86 dòng

WEB2.0 module.

```
Web2BgRemover.listServers(timeoutMs) → [{name, url, ageSec}]
Web2BgRemover.removeBg(serverUrl, input, opts) → dataURL PNG (input: File|Blob|dataURL|url)
Web2BgRemover.removeBgAuto(input, opts) → tự chọn máy online đầu tiên → dataURL (throw nếu ko có máy)
```

**Dùng bởi:** `web2/ai-hub/js/ai-image.js`, `web2/shared/web2-bg-scene.js`, `web2/shared/web2-sidebar.js`

#### `Web2Bill` — [web2/shared/web2-bill-service.js](../../web2/shared/web2-bill-service.js) · 757 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-inbox-add.js`, `native-orders/js/native-orders-pbh-bill.js`, `web2/fastsaleorder-invoice/pbh-actions.js`

#### `Web2Campaign` — [web2/shared/web2-campaign.js](../../web2/shared/web2-campaign.js) · 225 dòng

WEB2.0 shared.
**Dùng bởi:** `live-chat/js/live/live-campaign-manager.js`, `native-orders/js/native-orders-filters-campaigns.js`, `web2/live-control/js/live-control.js`, `web2/live-tv/js/live-tv.js`

#### `Web2CanvasUtils` — [web2/shared/web2-canvas-utils.js](../../web2/shared/web2-canvas-utils.js) · 139 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/shared/web2-image-paste.js`, `web2/shared/web2-sidebar.js`

#### `Web2Chat` — [web2/shared/web2-chat-client.js](../../web2/shared/web2-chat-client.js) · 107 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/live/comments-mobile-actions.js`, `live-chat/js/live/comments-mobile-entry.js`, `live-chat/js/live/live-chat-modal.js`, `live-chat/js/live/live-comment-list-state.js`, `live-chat/js/live/live-init-lifecycle.js`, `live-chat/js/live/live-stats-panel.js`, `live-chat/js/pancake/pancake-api.js`, `live-chat/js/pancake/pancake-chat-window.js`, `live-chat/js/pancake/pancake-realtime.js`, `live-chat/js/pancake/pancake-token-manager.js`, `live-chat/js/pancake/pancake-token-sources.js`, `native-orders/js/native-orders-bulk-operations.js`, `native-orders/js/native-orders-chat-send.js`, `native-orders/js/native-orders-inbox-resolve.js`, `native-orders/js/native-orders-interactions.js`, `web2/balance-history/js/web2-pm-customer-search.js`, `web2/customers/js/customers-events.js`, `web2/jt-tracking/js/jt-tracking-actions.js`, `web2/multi-tool/js/multi-tool.js`, `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/pancake-settings/js/pancake-settings-api.js`, `web2/pancake-settings/js/pancake-settings-render.js`, `web2/pancake-settings/js/pancake-settings-state.js`, `web2/pancake-settings/js/pancake-settings.js`, `web2/shared/chat-panel/web2-chat-panel-render.js`, `web2/shared/chat-panel/web2-chat-panel-state.js`, `web2/shared/web2-avatar-utils.js`, `web2/shared/web2-chat-api.js`, `web2/shared/web2-chat-live.js`, `web2/shared/web2-chat-settings.js`, `web2/shared/web2-chat-tags.js`, `web2/shared/web2-chat-tokens.js`, `web2/shared/web2-chat-utils.js`, `web2/shared/web2-customer-chat-core.js`, `web2/shared/web2-customer-chat-modal.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-pancake-accounts.js`, `web2/shared/web2-pancake-import.js`, `web2/shared/web2-pancake-token.js`, `web2/shared/web2-realtime.js`

#### `Web2CkAssignPicker` — [web2/shared/web2-ck-assign-picker.js](../../web2/shared/web2-ck-assign-picker.js) · 269 dòng

WEB2.0 — picker gán giao dịch CK (balance-history) cho đơn chưa nhận CK.
**Dùng bởi:** `native-orders/js/native-orders-realtime-init.js`

#### `Web2CkReview` — [web2/shared/web2-ck-review.js](../../web2/shared/web2-ck-review.js) · 494 dòng

WEB2.0 module — đối chiếu & duyệt tín hiệu CK (dùng chung 3 trang).
**Dùng bởi:** `native-orders/js/native-orders-realtime-init.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/shared/web2-ai-page-registry.js`

#### `Web2CommandPalette` — [web2/shared/web2-command-palette.js](../../web2/shared/web2-command-palette.js) · 269 dòng

WEB2.0 shared — Command Palette (Ctrl/Cmd+K) toàn cục.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2ContentMaker` — [web2/shared/web2-content-maker.js](../../web2/shared/web2-content-maker.js) · 382 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/ai-hub/js/ai-html.js`, `web2/shared/web2-ai-assistant.js`

#### `Web2CustomerChat` — [web2/shared/web2-customer-chat.js](../../web2/shared/web2-customer-chat.js) · 235 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-chat-send.js`, `native-orders/js/native-orders-inbox-resolve.js`, `native-orders/js/native-orders-interactions.js`, `native-orders/js/native-orders-public-api.js`, `web2/balance-history/js/web2-balance-history-app.js`, `web2/balance-history/js/web2-bh-chat-export.js`, `web2/balance-history/js/web2-pm-render.js`, `web2/jt-tracking/js/jt-tracking-modals.js`, `web2/shared/web2-customer-chat-core.js`, `web2/shared/web2-customer-chat-modal.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-product-counter.js`

#### `Web2CustomerDetailModal` — [web2/shared/web2-customer-detail-modal.js](../../web2/shared/web2-customer-detail-modal.js) · 417 dòng

WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/\*.
**Dùng bởi:** `web2/balance-history/js/web2-bh-render.js`, `web2/customers/js/customers-detail.js`, `web2/shared/web2-wallet-balance.js`

#### `PartnerCustomerApi`, `Web2CustomerLookup` — [web2/shared/web2-customer-lookup.js](../../web2/shared/web2-customer-lookup.js) · 66 dòng

WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.
**Dùng bởi:** `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/balance-history/js/web2-partner-enricher.js`, `web2/customer-wallet/js/web2-customer-wallet-api.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customer-wallet/js/web2-customer-wallet-render.js`, `web2/shared/web2-customer-store.js`

#### `Web2CustomerStore` — [web2/shared/web2-customer-store.js](../../web2/shared/web2-customer-store.js) · 521 dòng

WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.
**Dùng bởi:** `live-chat/js/live/live-api.js`, `live-chat/js/live/live-comment-list-actions.js`, `live-chat/js/live/live-comment-list-render-list.js`, `live-chat/js/live/live-comment-list-render-row.js`, `live-chat/js/shared/live-customer-sync.js`, `live-chat/js/shared/live-status.js`, `web2/balance-history/js/web2-bh-link-customer.js`, `web2/balance-history/js/web2-partner-enricher.js`, `web2/shared/web2-customer-lookup.js`, `web2/shared/web2-pancake-import.js`, `web2/shared/web2-phone-utils.js`, `web2/shared/web2-smart-cache.js`

#### `Web2DbBadge` — [web2/shared/web2-db-badge.js](../../web2/shared/web2-db-badge.js) · 145 dòng

Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"

#### `Web2Deeplink` — [web2/shared/web2-deeplink.js](../../web2/shared/web2-deeplink.js) · 101 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `so-order/js/so-order-render.js`, `web2/products/js/web2-products-app.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-debt/js/supplier-debt-render.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`, `web2/supplier-wallet/js/supplier-wallet-render.js`

#### `Web2DicebearCustomizer` — [web2/shared/web2-dicebear-customizer.js](../../web2/shared/web2-dicebear-customizer.js) · 313 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/shared/web2-user-profile.js`

#### `Web2Effects` — [web2/shared/web2-effects.js](../../web2/shared/web2-effects.js) · 815 dòng

Web 2.0 — Effects / animations library
**Dùng bởi:** `native-orders/js/native-orders-pbh-bill.js`, `native-orders/js/native-orders-render.js`, `so-order/js/so-order-image-manager.js`, `so-order/js/so-order-image-modal.js`, `so-order/js/so-order-modal-image.js`, `web2/products/js/web2-products-app.js`, `web2/shared/web2-image-lightbox.js`, `web2/shared/web2-image-paste.js`, `web2/shared/web2-sidebar.js`

#### `Web2Escape` — [web2/shared/web2-escape.js](../../web2/shared/web2-escape.js) · 64 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-kpi-health.js`, `native-orders/js/native-orders-kpi.js`, `native-orders/js/native-orders-packing-slip.js`, `native-orders/js/native-orders-state.js`, `so-order/js/so-order-format.js`, `web2/balance-history/js/web2-bh-core.js`, `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/balance-history/js/web2-pm-core.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customer-wallet/js/web2-customer-wallet-state.js`, `web2/customers/js/customers-state.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/kpi/js/kpi-assignments.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/live-control/js/live-control.js`, `web2/live-tv/js/live-tv.js`, `web2/multi-tool/js/multi-tool.js`, `web2/order-tags/js/order-tags-app.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/product-card/js/product-card.js`, `web2/product-types/js/web2-product-types-app.js`, `web2/products/js/web2-product-detail.js`, `web2/products/js/web2-products-print-utils.js`, `web2/products/js/web2-products-state.js`, `web2/purchase-refund/js/purchase-refund-state.js`, `web2/reconcile/js/reconcile-state.js`, `web2/shared/page-builder.js`, `web2/shared/web2-avatar-utils.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-image-lightbox.js`, `web2/shared/web2-image-paste.js`, `web2/shared/web2-import.js`, `web2/shared/web2-kpi.js`, `web2/shared/web2-notification-bell.js`, `web2/shared/web2-order-tag-detail.js`, `web2/shared/web2-order-tag-pill.js`, `web2/shared/web2-product-group.js`, `web2/shared/web2-product-picker.js`, `web2/shared/web2-quick-reply.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-supplier-pay.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-variant-picker.js`, `web2/supplier-debt/js/supplier-debt-state.js`, `web2/supplier-wallet/js/supplier-wallet-state.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/video-maker/js/video-maker.js`

#### `Web2Export` — [web2/shared/web2-export-helpers.js](../../web2/shared/web2-export-helpers.js) · 160 dòng

WEB2.0 module.

#### `Web2Ext` — [web2/shared/web2-extension-bridge.js](../../web2/shared/web2-extension-bridge.js) · 91 dòng

WEB2 EXTENSION BRIDGE
**Dùng bởi:** `live-chat/js/pancake/pancake-chat-window.js`, `web2/shared/web2-customer-chat-core.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-zalo-presence.js`, `web2/shared/web2-zalo.js`, `web2/zalo/js/web2-zalo-accounts.js`

#### `Web2FbClient`, `FBPostsApi` — [web2/shared/web2-fb-client.js](../../web2/shared/web2-fb-client.js) · 120 dòng

WEB2.0 shared — Facebook Graph API client (1 NGUỒN cho mọi trang FB).
**Dùng bởi:** `web2/fb-ads-stats/js/fb-ads-manual.js`, `web2/fb-ads-stats/js/fb-ads-stats.js`, `web2/fb-insights/js/fb-insights.js`, `web2/fb-posts/js/fb-posts-app.js`, `web2/fb-posts/js/fb-posts-composer.js`, `web2/fb-posts/js/fb-posts-drafts.js`, `web2/fb-posts/js/fb-posts-list.js`, `web2/fb-posts/js/fb-posts-media.js`, `web2/shared/web2-ai-page-registry.js`

#### `Web2FbPostPreview` — [web2/shared/web2-fb-post-preview.js](../../web2/shared/web2-fb-post-preview.js) · 147 dòng

WEB2.0 shared — xem trước bài Facebook (giống FB) trước khi đăng.
**Dùng bởi:** `web2/fb-posts/js/fb-posts-composer.js`

#### `Web2FbShare` — [web2/shared/web2-fb-share.js](../../web2/shared/web2-fb-share.js) · 100 dòng

WEB2.0 shared — handoff "Đăng lên FB": chuyển ảnh + caption từ 1 trang sang trang Đăng bài.
**Dùng bởi:** `web2/fb-posts/js/fb-posts-composer.js`, `web2/photo-studio/photo-studio-edit.js`, `web2/product-card/js/product-card.js`

#### `Web2Format` — [web2/shared/web2-format.js](../../web2/shared/web2-format.js) · 92 dòng

WEB2.0 shared — 1 NGUỒN format tiền/ngày/giờ (GMT+7) cho Web 2.0.
**Dùng bởi:** `so-order/js/so-order-format.js`, `web2/balance-history/js/web2-bh-core.js`, `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-pm-core.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customer-wallet/js/web2-customer-wallet-state.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/kpi/js/kpi-assignments.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/shared/page-builder.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-supplier-pay.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-wallet-api.js`, `web2/shared/web2-wallet-balance.js`, `web2/supplier-debt/js/supplier-debt-state.js`, `web2/supplier-wallet/js/supplier-wallet-state.js`

#### `Web2GeminiChat` — [web2/shared/web2-gemini-chat.js](../../web2/shared/web2-gemini-chat.js) · 471 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/ai-hub/js/ai-gemini-chat.js`, `web2/ai-hub/js/ai-hub.js`

#### `Web2GeminiClient` — [web2/shared/web2-gemini-client.js](../../web2/shared/web2-gemini-client.js) · 219 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/shared/web2-gemini-chat.js`

#### `Web2HistoryTimeline` — [web2/shared/web2-history-timeline.js](../../web2/shared/web2-history-timeline.js) · 238 dòng

Web2HistoryTimeline — render lịch sử chỉnh sửa kèm tên user
**Dùng bởi:** `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-detail.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/purchase-refund/js/purchase-refund-render.js`, `web2/reconcile/js/reconcile-api.js`, `web2/reconcile/js/reconcile-app.js`, `web2/reconcile/js/reconcile-state.js`, `web2/shared/web2-ck-review.js`

#### `Web2HtmlSkill` — [web2/shared/web2-html-skill.js](../../web2/shared/web2-html-skill.js) · 327 dòng

WEB2.0 shared — sinh HTML đẹp từ data bằng AI free.

````
Web2HtmlSkill.skills() → [{id,label,emoji,surface,size,hint}]
Web2HtmlSkill.skill(id) → meta 1 skill
Web2HtmlSkill.generate({skillId,data,onDelta,signal,extra}) → Promise<htmlString>
Web2HtmlSkill.cleanHtml(raw) → bỏ ```fences / text thừa
Web2HtmlSkill.renderToIframe(iframeEl, html) → srcdoc sandbox
Web2HtmlSkill.exportPng(iframeEl, filename) → html2canvas (nếu có) → tải PNG
Web2HtmlSkill.exportHtml(html, filename) → tải .html
````

**Dùng bởi:** `web2/ai-hub/js/ai-html.js`, `web2/product-card/js/product-card.js`, `web2/shared/web2-content-maker.js`

#### `Web2IdbStore` — [web2/shared/web2-idb-store.js](../../web2/shared/web2-idb-store.js) · 183 dòng

Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.
**Dùng bởi:** `so-order/js/so-order-storage.js`, `web2/cham-cong/js/cham-cong-app.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/shared/web2-smart-cache.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`

#### `Web2ImageEditor` — [web2/shared/web2-image-editor.js](../../web2/shared/web2-image-editor.js) · 295 dòng

WEB2.0 shared.
**Dùng bởi:** `web2/ai-photo/js/ai-photo.js`, `web2/product-card/js/product-card.js`

#### `Web2ImageLightbox` — [web2/shared/web2-image-lightbox.js](../../web2/shared/web2-image-lightbox.js) · 353 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/goods-weight/js/goods-weight.js`, `web2/live-tv/js/live-tv.js`, `web2/purchase-refund/js/purchase-refund-state.js`, `web2/shared/chat-panel/web2-chat-panel-compose.js`, `web2/shared/web2-gemini-chat.js`, `web2/shared/web2-image-paste.js`, `web2/shared/web2-sidebar.js`

#### `Web2ImagePaste` — [web2/shared/web2-image-paste.js](../../web2/shared/web2-image-paste.js) · 598 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/chi-tieu/js/chi-tieu-app.js`, `web2/fb-posts/js/fb-posts-composer.js`, `web2/photo-studio/photo-studio-ui.js`, `web2/shared/web2-gemini-chat.js`, `web2/shared/web2-image-lightbox.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-tryon.js`, `web2/video-maker/js/video-maker.js`

#### `Web2Import` — [web2/shared/web2-import.js](../../web2/shared/web2-import.js) · 595 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-import.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-modal.js`

#### `Web2JwtUtils` — [web2/shared/web2-jwt-utils.js](../../web2/shared/web2-jwt-utils.js) · 96 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/shared/web2-pancake-accounts.js`, `web2/shared/web2-pancake-token.js`, `web2/shared/web2-sidebar.js`

#### `Web2Kpi` — [web2/shared/web2-kpi.js](../../web2/shared/web2-kpi.js) · 97 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-kpi-health.js`, `native-orders/js/native-orders-kpi.js`, `native-orders/js/native-orders-render.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/shared/web2-ai-page-registry.js`

#### `Web2LabelOcr` — [web2/shared/web2-label-ocr.js](../../web2/shared/web2-label-ocr.js) · 433 dòng

WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.
**Dùng bởi:** `web2/reconcile/js/reconcile-app.js`, `web2/shared/web2-pack-counter.js`

#### `Web2LiveTvDisplay` — [web2/shared/web2-live-tv-display.js](../../web2/shared/web2-live-tv-display.js) · 139 dòng

WEB2.0 shared — quy tắc HIỂN THỊ màn TV livestream.
**Dùng bởi:** `web2/live-control/js/live-control.js`, `web2/live-tv/js/live-tv.js`

#### `Web2LogoEraser` — [web2/shared/web2-logo-eraser.js](../../web2/shared/web2-logo-eraser.js) · 496 dòng

WEB2.0 shared.
**Dùng bởi:** `web2/ai-photo/js/ai-photo.js`, `web2/product-card/js/product-card.js`, `web2/shared/web2-watermark.js`

#### `Web2Lottie` — [web2/shared/web2-lottie.js](../../web2/shared/web2-lottie.js) · 391 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/popup.js`, `web2/shared/web2-barcode-scanner.js`, `web2/shared/web2-customer-chat-core.js`, `web2/shared/web2-customer-chat-modal.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-optimistic.js`, `web2/shared/web2-product-counter.js`, `web2/shared/web2-sidebar.js`

#### `Web2Motion` — [web2/shared/web2-motion.js](../../web2/shared/web2-motion.js) · 98 dòng

WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.

#### `W2MT` — [web2/shared/web2-msg-template-core.js](../../web2/shared/web2-msg-template-core.js) · 278 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`

#### `W2MT` — [web2/shared/web2-msg-template-send.js](../../web2/shared/web2-msg-template-send.js) · 500 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`

#### `W2MT` — [web2/shared/web2-msg-template-ui.js](../../web2/shared/web2-msg-template-ui.js) · 264 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`

#### `W2MT`, `Web2MsgTemplate` — [web2/shared/web2-msg-template.js](../../web2/shared/web2-msg-template.js) · 99 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-bulk-operations.js`, `native-orders/js/native-orders-public-api.js`, `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-msg-template-ui.js`

#### `Web2NewMsgBadge` — [web2/shared/web2-new-msg-badge.js](../../web2/shared/web2-new-msg-badge.js) · 305 dòng

Web 2.0 — New-message badge for native-orders rows
**Dùng bởi:** `native-orders/js/native-orders-render.js`

#### `Web2NotificationBell` — [web2/shared/web2-notification-bell.js](../../web2/shared/web2-notification-bell.js) · 188 dòng

#### `Web2Notify` — [web2/shared/web2-notify.js](../../web2/shared/web2-notify.js) · 49 dòng

WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2NumberInput` — [web2/shared/web2-number-input.js](../../web2/shared/web2-number-input.js) · 372 dòng

WEB2.0 shared — 1 NGUỒN format số khi NHẬP (live thousand "." + decimal ",") cho Web 2.0.
**Dùng bởi:** `native-orders/js/native-orders-pbh-bill.js`, `so-order/js/so-order-bulk-edit.js`, `so-order/js/so-order-inline-edit.js`, `so-order/js/so-order-modal-core.js`, `so-order/js/so-order-modal-open.js`, `so-order/js/so-order-modal-random.js`, `so-order/js/so-order-modal-submit.js`, `so-order/js/so-order-payments.js`, `so-order/js/so-order-shipment.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/chi-tieu/js/chi-tieu-app.js`, `web2/products/js/web2-product-detail.js`, `web2/products/js/web2-products-modal.js`, `web2/purchase-refund/js/purchase-refund-actions.js`, `web2/purchase-refund/js/purchase-refund-modal.js`, `web2/shared/web2-supplier-pay.js`

#### `Web2Optimistic` — [web2/shared/web2-optimistic.js](../../web2/shared/web2-optimistic.js) · 110 dòng

Codifies pattern: snapshot → apply optimistic UI → fire backend background →
**Dùng bởi:** `live-chat/js/live/live-comment-list-actions.js`, `live-chat/js/live/live-livestream-gallery.js`, `native-orders/js/native-orders-customer-panel.js`, `native-orders/js/native-orders-delivery.js`, `native-orders/js/native-orders-modal-edit.js`, `so-order/js/so-order-kho-sync.js`, `so-order/js/so-order-payments.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-app.js`, `web2/customers/js/customers-state.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-actions.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/jt-tracking/js/jt-tracking-actions.js`, `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/product-types/js/web2-product-types-app.js`, `web2/products/js/web2-products-actions.js`, `web2/products/js/web2-products-modal.js`, `web2/shared/chat-panel/web2-chat-panel-compose.js`, `web2/shared/page-builder.js`, `web2/shared/web2-lottie.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `Web2OrderTagDetail` — [web2/shared/web2-order-tag-detail.js](../../web2/shared/web2-order-tag-detail.js) · 389 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-public-api.js`, `native-orders/js/native-orders-render.js`

#### `Web2OrderTagPill` — [web2/shared/web2-order-tag-pill.js](../../web2/shared/web2-order-tag-pill.js) · 93 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-render.js`, `web2/order-tags/js/order-tags-app.js`, `web2/shared/web2-ai-page-registry.js`

#### `Web2PackCounter` — [web2/shared/web2-pack-counter.js](../../web2/shared/web2-pack-counter.js) · 427 dòng

WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.

#### `Web2PancakeAccounts` — [web2/shared/web2-pancake-accounts.js](../../web2/shared/web2-pancake-accounts.js) · 300 dòng

Web 2.0 — Pancake ACCOUNTS manager (DB-backed)
**Dùng bởi:** `live-chat/js/pancake/pancake-token-manager.js`, `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/pancake-settings/js/pancake-settings-api.js`, `web2/pancake-settings/js/pancake-settings-render.js`

#### `Web2PancakeImport` — [web2/shared/web2-pancake-import.js](../../web2/shared/web2-pancake-import.js) · 150 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/balance-history/js/web2-pm-customer-search.js`

#### `Web2PancakeToken` — [web2/shared/web2-pancake-token.js](../../web2/shared/web2-pancake-token.js) · 207 dòng

Web 2.0 — Pancake JWT token monitor + auto-refresh
**Dùng bởi:** `web2/pancake-settings/js/pancake-settings-actions.js`, `web2/pancake-settings/js/pancake-settings-render.js`

#### `Web2Perm` — [web2/shared/web2-perm.js](../../web2/shared/web2-perm.js) · 185 dòng

WEB2.0 shared — phân quyền (enforcement).
**Dùng bởi:** `web2/live-control/js/live-control.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-tryon.js`

#### `Web2PhoneUtils` — [web2/shared/web2-phone-utils.js](../../web2/shared/web2-phone-utils.js) · 38 dòng

WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-detail-modal.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-wallet-api.js`, `web2/shared/web2-wallet-balance.js`

#### `Web2PosInstaller` — [web2/shared/web2-pos-installer.js](../../web2/shared/web2-pos-installer.js) · 247 dòng

WEB2.0 shared — kho đa dụng.
**Dùng bởi:** `web2/shared/web2-tryon.js`, `web2/video-maker/js/video-vieneu.js`

#### `Web2Printer` — [web2/shared/web2-printer.js](../../web2/shared/web2-printer.js) · 740 dòng

WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.
**Dùng bởi:** `web2/products/js/web2-products-print-modal.js`, `web2/shared/web2-bill-service.js`, `web2/shared/web2-qr.js`

#### `Web2ProductCode` — [web2/shared/web2-product-code.js](../../web2/shared/web2-product-code.js) · 627 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-kho-sync.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-state.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/shared/web2-variants-cache.js`

#### `Web2ProductCounter` — [web2/shared/web2-product-counter.js](../../web2/shared/web2-product-counter.js) · 570 dòng

WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.
**Dùng bởi:** `web2/product-counter/js/product-counter.js`, `web2/shared/beauty/web2-beauty-face.js`, `web2/shared/web2-barcode-scanner.js`, `web2/shared/web2-label-ocr.js`

#### `Web2ProductGroup` — [web2/shared/web2-product-group.js](../../web2/shared/web2-product-group.js) · 98 dòng

WEB2.0 shared.
**Dùng bởi:** `so-order/js/so-order-modal-suggest.js`, `web2/products/js/web2-products-render.js`

#### `Web2ProductPicker` — [web2/shared/web2-product-picker.js](../../web2/shared/web2-product-picker.js) · 168 dòng

WEB2.0 shared — chọn SP từ Kho SP (1 hoặc NHIỀU) trả full object.
**Dùng bởi:** `web2/fb-posts/js/fb-posts-composer.js`

#### `Web2ProductTypesCache` — [web2/shared/web2-product-types-cache.js](../../web2/shared/web2-product-types-cache.js) · 209 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-modal-random.js`, `web2/product-types/js/web2-product-types-app.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/shared/web2-variant-picker.js`

#### `Web2ProductUnits` — [web2/shared/web2-product-units.js](../../web2/shared/web2-product-units.js) · 158 dòng

WEB2.0 shared.
**Dùng bởi:** `so-order/js/so-order-barcode.js`, `web2/products/js/web2-products-render.js`, `web2/shared/web2-unit-reprint.js`, `web2/unit-scan/js/unit-scan.js`

#### `Web2ProductsApi` — [web2/shared/web2-products-api.js](../../web2/shared/web2-products-api.js) · 159 dòng

WEB2.0 shared — Web2ProductsApi client (1 NGUỒN cho mọi trang dùng Kho SP).
**Dùng bởi:** `so-order/js/so-order-barcode.js`, `so-order/js/so-order-kho-sync.js`, `so-order/js/so-order-receive.js`, `web2/live-control/js/live-control.js`, `web2/products/js/web2-product-detail.js`, `web2/products/js/web2-products-actions.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-render.js`, `web2/products/js/web2-products-state.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/shared/web2-products-cache.js`, `web2/supplier-wallet/js/supplier-wallet-actions.js`

#### `Web2ProductsCache` — [web2/shared/web2-products-cache.js](../../web2/shared/web2-products-cache.js) · 324 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `so-order/js/so-order-barcode.js`, `so-order/js/so-order-kho-sync.js`, `so-order/js/so-order-modal-core.js`, `so-order/js/so-order-modal-suggest.js`, `so-order/js/so-order-receive.js`, `so-order/js/so-order-render.js`, `web2/fb-posts/js/fb-posts-media.js`, `web2/product-card/js/product-card.js`, `web2/products/js/web2-products-actions.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-render.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/purchase-refund/js/purchase-refund-actions.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/purchase-refund/js/purchase-refund-modal.js`, `web2/purchase-refund/js/purchase-refund-render.js`, `web2/shared/web2-ai-page-registry.js`, `web2/shared/web2-product-picker.js`, `web2/shared/web2-smart-cache.js`, `web2/shared/web2-unit-reprint.js`, `web2/supplier-wallet/js/supplier-wallet-actions.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`, `web2/video-maker/js/video-maker.js`

#### `Web2PWA` — [web2/shared/web2-pwa.js](../../web2/shared/web2-pwa.js) · 80 dòng

WEB2.0 shared — PWA (Thêm vào Màn hình chính) cho MỌI trang, không cần App Store.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2QrModal` — [web2/shared/web2-qr-modal.js](../../web2/shared/web2-qr-modal.js) · 301 dòng

WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.
**Dùng bởi:** `web2/customers/js/customers-detail.js`

#### `Web2QR` — [web2/shared/web2-qr.js](../../web2/shared/web2-qr.js) · 354 dòng

WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.
**Dùng bởi:** `web2/product-card/js/product-card.js`, `web2/products/js/web2-products-print-modal.js`, `web2/shared/web2-bill-service.js`

#### `Web2QuickReply` — [web2/shared/web2-quick-reply.js](../../web2/shared/web2-quick-reply.js) · 669 dòng

Web 2.0 — Quick Reply system
**Dùng bởi:** `web2/shared/chat-panel/web2-chat-panel-compose.js`

#### `Web2Realtime` — [web2/shared/web2-realtime.js](../../web2/shared/web2-realtime.js) · 599 dòng

Web 2.0 — Realtime client (Pancake WS)
**Dùng bởi:** `live-chat/server/browser-broker.js`, `live-chat/server/pancake-client.js`, `live-chat/server/routes.js`, `native-orders/js/native-orders-public-api.js`, `web2/shared/web2-new-msg-badge.js`

#### `NativeReturnBill` — [web2/shared/web2-return-bill.js](../../web2/shared/web2-return-bill.js) · 59 dòng

WEB2.0 module.
**Dùng bởi:** `native-orders/js/native-orders-pbh-bill.js`

#### `Web2ShelfMap` — [web2/shared/web2-shelf-map.js](../../web2/shared/web2-shelf-map.js) · 87 dòng

WEB2.0 shared.
**Dùng bởi:** `web2/unit-scan/js/unit-scan.js`

#### `Web2Sidebar` — [web2/shared/web2-sidebar.js](../../web2/shared/web2-sidebar.js) · 981 dòng

WEB2-clone sidebar for Web 2.0 pages.
**Dùng bởi:** `web2/cham-cong/js/cham-cong-app.js`, `web2/chi-tieu/js/chi-tieu-app.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/clearance/js/clearance.js`, `web2/fb-ads-stats/js/fb-ads-stats.js`, `web2/fb-insights/js/fb-insights.js`, `web2/fb-posts/js/fb-posts-app.js`, `web2/jt-tracking/js/jt-tracking-app.js`, `web2/live-control/js/live-control.js`, `web2/multi-tool/js/multi-tool.js`, `web2/order-tags/js/order-tags-app.js`, `web2/pancake-settings/js/pancake-settings.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/returns/js/returns-app.js`, `web2/shared/web2-user-profile.js`, `web2/system/js/system-app.js`

#### `Web2Skeleton` — [web2/shared/web2-skeleton.js](../../web2/shared/web2-skeleton.js) · 268 dòng

WEB2.0 module — GitHub-style skeleton loading.
**Dùng bởi:** `web2/ai-assistant/js/ai-assistant.js`, `web2/ai-hub/js/ai-image.js`, `web2/balance-history/js/web2-bh-render.js`, `web2/cham-cong/js/cham-cong-app.js`, `web2/cham-cong/js/cham-cong-employees.js`, `web2/cham-cong/js/cham-cong-payroll.js`, `web2/chi-tieu/js/chi-tieu-app.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customer-wallet/js/web2-customer-wallet-render.js`, `web2/customers/js/customers-app.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-api.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/fb-ads-stats/js/fb-ads-stats.js`, `web2/fb-insights/js/fb-insights.js`, `web2/fb-posts/js/fb-posts-drafts.js`, `web2/jt-tracking/js/jt-tracking-app.js`, `web2/live-control/js/live-control.js`, `web2/live-tv/js/live-tv.js`, `web2/multi-tool/js/multi-tool.js`, `web2/order-tags/js/order-tags-app.js`, `web2/pancake-settings/js/pancake-settings-api.js`, `web2/product-types/js/web2-product-types-app.js`, `web2/products/js/web2-products-render.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/purchase-refund/js/purchase-refund-render.js`, `web2/returns/js/returns-order-items.js`, `web2/system/js/system-services.js`, `web2/system/js/system-sse.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/video-beauty/js/video-beauty.js`, `web2/video-maker/js/video-library.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `Web2SmartCache` — [web2/shared/web2-smart-cache.js](../../web2/shared/web2-smart-cache.js) · 605 dòng

WEB2.0 module.
**Dùng bởi:** `web2/shared/web2-ai-assistant.js`, `web2/shared/web2-ai-page-registry.js`, `web2/shared/web2-customer-store.js`, `web2/shared/web2-product-types-cache.js`, `web2/shared/web2-products-cache.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-suppliers-cache.js`, `web2/shared/web2-variants-cache.js`

#### `Web2SoOrder` — [web2/shared/web2-so-order-reader.js](../../web2/shared/web2-so-order-reader.js) · 53 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/pancake/inventory-panel-state.js`, `web2/purchase-refund/js/purchase-refund-api.js`, `web2/supplier-debt/js/supplier-debt-api.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`

#### `Web2SoOrderUtils` — [web2/shared/web2-so-order-utils.js](../../web2/shared/web2-so-order-utils.js) · 129 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/purchase-refund/js/purchase-refund-state.js`

#### `Web2SSE` — [web2/shared/web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js) · 289 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/live/comments-mobile-actions.js`, `live-chat/js/live/comments-mobile-entry.js`, `live-chat/js/live/live-chat-modal.js`, `live-chat/js/live/live-hidden-commenters.js`, `live-chat/js/live/live-init-lifecycle.js`, `live-chat/js/live/live-init.js`, `live-chat/js/live/live-livestream-gallery.js`, `live-chat/js/live/live-livestream-snap-init.js`, `live-chat/js/live/live-livestream-snap-lock.js`, `live-chat/js/pancake/inventory-panel-actions.js`, `live-chat/js/pancake/pancake-livestream-filter.js`, `live-chat/js/pancake/pancake-realtime.js`, `live-chat/js/shared/live-comments-stream.js`, `native-orders/js/native-orders-kpi.js`, `native-orders/js/native-orders-realtime-init.js`, `native-orders/js/native-orders-unit-serials.js`, `so-order/js/so-order-image-manager.js`, `so-order/js/so-order-payments.js`, `so-order/js/so-order-storage-sync.js`, `web2/balance-history/js/web2-bh-data.js`, `web2/balance-history/js/web2-pending-match.js`, `web2/cham-cong/js/cham-cong-app.js`, `web2/chi-tieu/js/chi-tieu-app.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/clearance/js/clearance.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customers/js/customers-app.js`, `web2/fastsaleorder-delivery/dlv-app.js`, `web2/fastsaleorder-invoice/pbh-app.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/fb-posts/js/fb-posts-app.js`, `web2/goods-weight/js/goods-weight.js`, `web2/jt-tracking/js/jt-tracking-app.js`, `web2/kpi/js/kpi-assignments.js`, `web2/kpi/js/kpi-dashboard.js`, `web2/live-control/js/live-control.js`, `web2/live-tv/js/live-tv.js`, `web2/multi-tool/js/multi-tool.js`, `web2/order-tags/js/order-tags-app.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/product-types/js/web2-product-types-app.js`, `web2/products/js/web2-products-app.js`, `web2/purchase-refund/js/purchase-refund-app.js`, `web2/reconcile/js/reconcile-api.js`, `web2/returns/js/returns-app.js`, `web2/shared/page-builder.js`, `web2/shared/web2-campaign.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-customer-chat-core.js`, `web2/shared/web2-customer-store.js`, `web2/shared/web2-msg-template-core.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-notification-bell.js`, `web2/shared/web2-printer.js`, `web2/shared/web2-products-cache.js`, `web2/shared/web2-quick-reply.js`, `web2/shared/web2-sidebar.js`, `web2/shared/web2-smart-cache.js`, `web2/shared/web2-sse-topics.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-wallet-balance.js`, `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/realtime.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-app.js`, `web2/unit-scan/js/unit-scan.js`, `web2/users/js/users-app.js`, `web2/variants/js/web2-variants-app.js`, `web2/zalo/js/web2-zalo-app.js`

#### `Web2SSETopics` — [web2/shared/web2-sse-topics.js](../../web2/shared/web2-sse-topics.js) · 28 dòng

WEB2.0 module.

#### `Web2SupplierPay` — [web2/shared/web2-supplier-pay.js](../../web2/shared/web2-supplier-pay.js) · 398 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-payments.js`, `web2/supplier-debt/js/supplier-debt-actions.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-wallet/js/supplier-wallet-actions.js`

#### `Web2SuppliersCache` — [web2/shared/web2-suppliers-cache.js](../../web2/shared/web2-suppliers-cache.js) · 280 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `so-order/js/so-order-inline-edit.js`, `web2/balance-history/js/web2-manual-deposit.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-state.js`, `web2/purchase-refund/js/purchase-refund-modal.js`, `web2/shared/web2-smart-cache.js`, `web2/supplier-debt/js/supplier-debt-filters.js`, `web2/supplier-wallet/js/supplier-wallet-actions.js`

#### `Web2TextUtils` — [web2/shared/web2-text-utils.js](../../web2/shared/web2-text-utils.js) · 41 dòng

WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.
**Dùng bởi:** `web2/shared/web2-sidebar.js`

#### `Web2Translate` — [web2/shared/web2-translate.js](../../web2/shared/web2-translate.js) · 74 dòng

WEB2.0 module dùng chung.
**Dùng bởi:** `web2/shared/web2-sidebar.js`, `web2/video-maker/js/video-maker.js`

#### `Web2Tryon` — [web2/shared/web2-tryon.js](../../web2/shared/web2-tryon.js) · 790 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/ai-hub/js/ai-tryon.js`, `web2/shared/web2-ai-assistant.js`

#### `Web2UnitReprint` — [web2/shared/web2-unit-reprint.js](../../web2/shared/web2-unit-reprint.js) · 294 dòng

WEB2.0 shared — In lại tem ĐƠN VỊ (per-unit reprint). Đặc tả: docs/web2/PER-UNIT-QR-PLAN.md
**Dùng bởi:** `web2/products/js/web2-products-app.js`

#### `Web2UnreadPanel` — [web2/shared/web2-unread-panel.js](../../web2/shared/web2-unread-panel.js) · 151 dòng

WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).
**Dùng bởi:** `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/shared/web2-ai-page-registry.js`

#### `Web2UserInfo` — [web2/shared/web2-user-info.js](../../web2/shared/web2-user-info.js) · 154 dòng

WEB2.0 module.
**Dùng bởi:** `live-chat/js/live/live-hidden-commenters.js`, `native-orders/js/native-orders-inbox-add.js`, `native-orders/js/native-orders-modal-edit.js`, `native-orders/js/native-orders-packing-slip.js`, `native-orders/js/native-orders-product-picker.js`, `so-order/js/so-order-payments.js`, `so-order/js/so-order-state.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-detail.js`, `web2/customers/js/customers-events.js`, `web2/fastsaleorder-refund/rf-app.js`, `web2/kpi/js/kpi-assignments.js`, `web2/live-control/js/live-control.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/products/js/web2-product-detail.js`, `web2/purchase-refund/js/purchase-refund-state.js`, `web2/reconcile/js/reconcile-actions.js`, `web2/returns/js/returns-api.js`, `web2/shared/web2-api.js`, `web2/shared/web2-bill-service.js`, `web2/shared/web2-ck-assign-picker.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-msg-template-send.js`, `web2/shared/web2-wallet-api.js`, `web2/supplier-debt/js/supplier-debt-api.js`, `web2/supplier-wallet/js/supplier-wallet-state.js`, `web2/zalo/js/web2-zalo-lookup-zns.js`

#### `Web2UserProfile` — [web2/shared/web2-user-profile.js](../../web2/shared/web2-user-profile.js) · 479 dòng

WEB2.0 module — Hồ sơ user + đổi avatar DiceBear (dùng chung mọi trang).
**Dùng bởi:** `web2/overview/overview.js`, `web2/shared/web2-sidebar.js`, `web2/users/js/users-app.js`

#### `Web2VariantGroup` — [web2/shared/web2-variant-group.js](../../web2/shared/web2-variant-group.js) · 240 dòng

WEB2.0 shared.
**Dùng bởi:** `web2/live-control/js/live-control.js`, `web2/live-tv/js/live-tv.js`, `web2/products/js/web2-products-render.js`, `web2/shared/web2-live-tv-display.js`, `web2/shared/web2-product-group.js`

#### `Web2VariantMulti` — [web2/shared/web2-variant-multi.js](../../web2/shared/web2-variant-multi.js) · 192 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-modal-submit.js`, `so-order/js/so-order-render.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/shared/web2-variant-group.js`, `web2/shared/web2-variant-picker.js`

#### `Web2VariantPicker` — [web2/shared/web2-variant-picker.js](../../web2/shared/web2-variant-picker.js) · 405 dòng

WEB2.0 module.

```
Deps (đọc, KHÔNG gọi API trực tiếp): Web2VariantsCache (gợi ý Màu/Size),
Web2ProductTypesCache (loại), Web2VariantMulti (cartesian/expand). An toàn dùng
```

**Dùng bởi:** `so-order/js/so-order-inline-edit.js`, `so-order/js/so-order-modal-core.js`, `so-order/js/so-order-storage.js`

#### `Web2VariantsCache` — [web2/shared/web2-variants-cache.js](../../web2/shared/web2-variants-cache.js) · 253 dòng

WEB2.0 module.
**Dùng bởi:** `so-order/js/so-order-app.js`, `so-order/js/so-order-inline-edit.js`, `so-order/js/so-order-kho-sync.js`, `so-order/js/so-order-modal-random.js`, `so-order/js/so-order-modal-suggest.js`, `web2/products/js/web2-products-app.js`, `web2/products/js/web2-products-modal.js`, `web2/products/js/web2-products-state.js`, `web2/products/js/web2-products-variant-picker.js`, `web2/shared/web2-ai-page-registry.js`, `web2/shared/web2-smart-cache.js`, `web2/shared/web2-variant-multi.js`, `web2/shared/web2-variant-picker.js`, `web2/variants/js/web2-variants-app.js`

#### `Web2VideoRender` — [web2/shared/web2-video-render.js](../../web2/shared/web2-video-render.js) · 91 dòng

WEB2.0 shared — render HTML→MP4 qua máy shop (HyperFrames).

```
Web2VideoRender.listMachines() → [{name,url,ageSec}]
Web2VideoRender.pickOnline() → url máy online đầu tiên | null
Web2VideoRender.render({html, machineUrl?, signal}) → { blob, url } (object URL MP4)
```

**Dùng bởi:** `web2/ai-hub/js/ai-html.js`, `web2/shared/web2-content-maker.js`, `web2/video-maker/js/video-maker.js`, `web2/video-maker/js/video-render.js`, `web2/video-maker/js/video-scene-editor.js`

#### `Web2Vieneu` — [web2/shared/web2-vieneu.js](../../web2/shared/web2-vieneu.js) · 205 dòng

WEB2.0 shared — kho Voice.
**Dùng bởi:** `web2/video-maker/js/video-tts.js`, `web2/video-maker/js/video-vieneu.js`

#### `Web2VnAddress` — [web2/shared/web2-vn-address.js](../../web2/shared/web2-vn-address.js) · 319 dòng

WEB2.0 shared — Web2VnAddress: bộ chọn Tỉnh/TP → Phường/Xã (2 cấp, dùng chung).
**Dùng bởi:** `native-orders/js/native-orders-modal-edit.js`, `web2/customers/js/customers-detail.js`

#### `Web2WalletApi` — [web2/shared/web2-wallet-api.js](../../web2/shared/web2-wallet-api.js) · 227 dòng

WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).
**Dùng bởi:** `web2/customer-wallet/js/web2-customer-wallet-api.js`, `web2/customer-wallet/js/web2-customer-wallet-app.js`, `web2/customer-wallet/js/web2-customer-wallet-render.js`, `web2/shared/web2-wallet-balance.js`

#### `Web2WalletBalance` — [web2/shared/web2-wallet-balance.js](../../web2/shared/web2-wallet-balance.js) · 335 dòng

WEB2.0 — shared helper hiển thị số dư ví KH.
**Dùng bởi:** `live-chat/js/live/live-comment-list-render-row.js`, `live-chat/js/live/live-comment-list-state.js`, `live-chat/js/live/live-customer-panel.js`, `native-orders/js/native-orders-render.js`, `web2/balance-history/js/web2-bh-reassign-modal.js`, `web2/balance-history/js/web2-bh-render.js`, `web2/balance-history/js/web2-link-customer-modal.js`, `web2/balance-history/js/web2-pm-customer-search.js`, `web2/balance-history/js/web2-pm-picker.js`, `web2/balance-history/js/web2-pm-render.js`, `web2/ck-dashboard/js/ck-dashboard-app.js`, `web2/customers/js/customers-render.js`, `web2/payment-confirm/js/payment-confirm-app.js`, `web2/returns/js/returns-customer.js`, `web2/returns/js/returns-tabs.js`, `web2/shared/web2-ck-review.js`, `web2/shared/web2-unread-panel.js`, `web2/shared/web2-wallet-api.js`, `web2/shared/web2-zalo.js`

#### `Web2Watermark` — [web2/shared/web2-watermark.js](../../web2/shared/web2-watermark.js) · 212 dòng

WEB2.0 shared module.
**Dùng bởi:** `web2/ai-photo/js/ai-photo.js`

#### `Web2ZaloOwner`, `ZaloApi` — [web2/shared/web2-zalo-api.js](../../web2/shared/web2-zalo-api.js) · 277 dòng

WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).
**Dùng bởi:** `web2/shared/web2-zalo-presence.js`, `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/realtime.js`, `web2/shared/zalo-chat/sticker-picker.js`, `web2/zalo/js/web2-zalo-accounts.js`, `web2/zalo/js/web2-zalo-app.js`, `web2/zalo/js/web2-zalo-chat.js`, `web2/zalo/js/web2-zalo-lookup-zns.js`

#### `Web2ZaloPresence` — [web2/shared/web2-zalo-presence.js](../../web2/shared/web2-zalo-presence.js) · 206 dòng

WEB2.0 module.

#### `Web2Zalo` — [web2/shared/web2-zalo.js](../../web2/shared/web2-zalo.js) · 388 dòng

WEB2.0 shared — Web2Zalo helper (single-source Zalo).
**Dùng bởi:** `web2/jt-tracking/js/jt-tracking-modals.js`, `web2/shared/web2-customer-chat-core.js`, `web2/shared/web2-customer-chat.js`, `web2/shared/web2-zalo-presence.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/zalo/js/web2-zalo-app.js`

#### `WZChat` — [web2/shared/zalo-chat/bubbles.js](../../web2/shared/zalo-chat/bubbles.js) · 269 dòng

WEB2.0 module — Zalo chat message renderer.
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-actions.js](../../web2/shared/zalo-chat/chat-actions.js) · 104 dòng

WEB2.0 module — Zalo chat actions (network + optimistic).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-store.js](../../web2/shared/zalo-chat/chat-store.js) · 214 dòng

WEB2.0 module — Zalo chat shared store + utils (WZChat.\*).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/chat-view.js](../../web2/shared/zalo-chat/chat-view.js) · 810 dòng

WEB2.0 shared — Zalo chat VIEW (mount 1 hội thoại vào bất kỳ container).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/composer.js](../../web2/shared/zalo-chat/composer.js) · 597 dòng

WEB2.0 module — Zalo chat composer (input đầy đủ).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/emoji-picker.js](../../web2/shared/zalo-chat/emoji-picker.js) · 105 dòng

WEB2.0 module — Zalo chat emoji picker (client-only).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/lightbox.js](../../web2/shared/zalo-chat/lightbox.js) · 86 dòng

WEB2.0 module — Zalo chat lightbox (xem ảnh full + prev/next).
**Dùng bởi:** `web2/shared/web2-zalo.js`, `web2/shared/zalo-chat/bubbles.js`, `web2/shared/zalo-chat/chat-actions.js`, `web2/shared/zalo-chat/chat-store.js`, `web2/shared/zalo-chat/chat-view.js`, `web2/shared/zalo-chat/composer.js`, `web2/shared/zalo-chat/emoji-picker.js`, `web2/shared/zalo-chat/lightbox.js`, `web2/shared/zalo-chat/reactions.js`, `web2/shared/zalo-chat/realtime.js`, `web2/zalo/js/web2-zalo-chat.js`

#### `WZChat` — [web2/shared/zalo-chat/reactions.js](../../web2/shared/zalo-chat/reactions.js) · 68 dòng

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
- **[comments-mobile-actions.js](../../live-chat/js/live/comments-mobile-actions.js)** ·381 — WEB2.0 module.
    - exposes: `LCM`
    - uses shared: `Web2Auth`, `Web2Chat`, `Web2SSE`
    - funcs (25): applyDelta, enrichDelta, fetchThumbs, getCreatedMs, getPostIds, getStream, getWorkerUrl, livingIds, livingSet, load, loadNativeOrders, loadPosts, mapRow, onDelta, overrideRealCounts, postLiving, primeFromData, realCommentTotal, scheduleLoadNative, shouldAnimateNew, showNewPill, toast, updateLiveTag, updateOrderCounts, wireSse
- **[comments-mobile-entry.js](../../live-chat/js/live/comments-mobile-entry.js)** ·172 — WEB2.0 module.
    - uses shared: `Web2Chat`, `Web2SSE`
- **[comments-mobile-render.js](../../live-chat/js/live/comments-mobile-render.js)** ·400 — WEB2.0 module.
    - exposes: `LCM`
    - funcs (20): applyView, buildCard, cardHtml, cardSig, closePicker, closeSheet, doRender, field, openPicker, openSheet, pickerRow, postLabel, reconcileList, renderPicker, scheduleRender, selectAll, selectLive, selectPost, skeleton, transplantAvatar
- **[comments-mobile-state.js](../../live-chat/js/live/comments-mobile-state.js)** ·435 — WEB2.0 module.
    - exposes: `LiveState`, `LiveCommentList`, `LCM`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (29): $, addrOf, avHash, avatarHtml, enrichWarehouse, esc, fmtFull, fmtTime, hiddenCount, isHiddenPerson, isHousePg, isShopOwn, isStorePg, nameOf, nativeOrder, normP, ordered, pageOf, parseTs, pass, passLive, phoneOf, postJson, refreshWarehouse, renderComments, statusOf, validPhone, visible, whInfo
- **[live-api.js](../../live-chat/js/live/live-api.js)** ·443 — Live API Layer
    - exposes: `LiveApi`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2CustomerStore`
    - funcs (19): \_fillCampaignPageNames, \_getWorkerUrl, \_patchWarehouseByFb, \_w2AuthHeaders, getPartnerInfo, getPartnerInfoBatch, hasMoreLiveCampaigns, hideComment, loadCRMTeams, loadComments, loadLiveCampaigns, loadLiveCampaignsFromAllPages, loadMoreLiveCampaigns, loadSessionIndex, replyToComment, savePartnerData, saveToLive, updatePartnerStatus, updatePartnerStatusViaProxy
- **[live-campaign-manager.js](../../live-chat/js/live/live-campaign-manager.js)** ·433 — WEB2.0 — quản lý chiến dịch cha (gom bài livestream) ngay trong live-chat.
    - exposes: `LiveCampaignManager`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Campaign`
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
- **[live-comment-list-orders.js](../../live-chat/js/live/live-comment-list-orders.js)** ·458 — WEB2.0 module.
    - funcs (10): \_bindCustomerModalDelegation, \_renderCustomerPopup, chunkRefresh, createOrder, mapWarehouse, refreshCommentItem, renderFn, showOrderDetail, showPancakeCustomerInfo, timeRemaining
- **[live-comment-list-render-list.js](../../live-chat/js/live/live-comment-list-render-list.js)** ·759 — WEB2.0 module.
    - uses shared: `Web2CustomerStore`
    - funcs (26): \_bindCampaignScroll, \_campaignRowHtml, \_campaignSentinelHtml, \_patchRowsChunked, \_renderDispatch, \_rowSig, clearCampaignSelection, handleScroll, isHidden, loadMoreCampaigns, markNew, prependComments, renderComments, renderCommentsNow, renderCrmTeamOptions, renderLiveCampaignOptions, schedule, selectTodayCampaigns, showError, showLoading, step, toggleCampaign, toggleCampaignDropdown, ts, updateCampaignBtnText, updateLoadMoreIndicator
- **[live-comment-list-render-row.js](../../live-chat/js/live/live-comment-list-render-row.js)** ·284 — WEB2.0 module.
    - uses shared: `Web2CustomerStore`, `Web2WalletBalance`
    - funcs (4): getStatusColor, getStatusOptions, pancakePhone, renderCommentItem
- **[live-comment-list-state.js](../../live-chat/js/live/live-comment-list-state.js)** ·278 — WEB2.0 module.
    - uses shared: `Web2Chat`, `Web2WalletBalance`
    - funcs (12): \_appendOlderBatch, \_attachWalletBalances, \_ensureScrollSentinel, \_filteredAll, \_orderCount, \_shouldAnimateNew, \_updateRealCommentTotal, \_updateTotalBadge, \_visibleComments, resetRenderLimit, schedule, step
- **[live-customer-panel.js](../../live-chat/js/live/live-customer-panel.js)** ·316 — Live Customer Info Panel
    - exposes: `LiveCustomerPanel`
    - uses shared: `Web2WalletBalance`
    - funcs (8): closeModal, formatDate, getStatusClass, lcpAttr, renderCustomerInfoModal, selectStatus, showCustomerInfo, toggleStatusDropdown
- **[live-hidden-commenters.js](../../live-chat/js/live/live-hidden-commenters.js)** ·386 — WEB2.0 module — ẩn comment theo NGƯỜI (commenter) + danh sách quản lý.
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
- **[live-init-wiring.js](../../live-chat/js/live/live-init-wiring.js)** ·469 — WEB2.0 module.
    - funcs (10): \_onRtConnected, \_onRtDisconnected, \_restoreCampaignSelection, hasOption, onCrmTeamChange, onLiveCampaignChange, onMultiCampaignChange, restoreSelection, setupEventListeners, setupRealtimeListeners
- **[live-init.js](../../live-chat/js/live/live-init.js)** ·165 — WEB2.0 module.
    - uses shared: `Web2SSE`
    - funcs (22): closeCustomerInfoModal, getCacheStats, getPostIds, getWorkerUrl, handleSaveToLive, initialize, loadComments, mapRow, onDelta, refresh, saveInlineAddress, saveInlinePhone, selectComment, selectInlineStatus, selectStatus, setDebtDisplaySettings, shouldFetch, showCustomerInfo, toggleHideComment, toggleInlineStatusDropdown, toggleStatusDropdown, updateSaveButtonToCheckmark
- **[live-kho-enricher.js](../../live-chat/js/live/live-kho-enricher.js)** ·233 — WEB2.0 — enrich live-chat từ kho khách hàng.
    - exposes: `LiveKhoEnricher`
    - uses shared: `Web2Auth`
    - funcs (12): commentPhone, flush, gather, init, needsEnrich, normPhone, postBatch, renderComments, reset, scan, scheduleFlush, setKho
- **[live-livestream-gallery.js](../../live-chat/js/live/live-livestream-gallery.js)** ·597 — WEB2.0 module.
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
- **[live-livestream-snap-init.js](../../live-chat/js/live/live-livestream-snap-init.js)** ·374 — WEB2.0 module.
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
- **[live-livestream-snap-state.js](../../live-chat/js/live/live-livestream-snap-state.js)** ·391 — WEB2.0 module.
    - exposes: `LiveSnap`
    - uses shared: `Web2Auth`
    - funcs (26): \_buildFbLiveUrl, \_cmpVersions, \_esc, \_fetchLiveVideoInfo, \_findActiveLiveCampaign, \_fmtOffset, \_getSnapMode, \_getSnapPagePref, \_isAutoMode, \_isFrameBlank, \_isInlineThumbOn, \_isStaffComment, \_isVanitySlug, \_pageActiveForCapture, \_resolveActiveCampaign, \_resolveCampaignForComment, \_resolvePageObj, \_resolvePageVanity, \_resolveTopCampaigns, \_setAutoMode, \_setInlineThumb, \_setSnapMode, \_setSnapPagePref, \_toast, \_user, \_w2AuthHeaders
- **[live-livestream-snap-stream.js](../../live-chat/js/live/live-livestream-snap-stream.js)** ·562 — WEB2.0 module.
    - exposes: `LiveSnap`
    - funcs (18): \_enableEmbeddedLiveCapture, \_ensureEmbeddedIframe, \_ensureVideoDock, \_maybeShowAutoSnapBanner, \_requestCaptureStream, \_setupVisibilityWatcher, \_showExtPrompt, \_showPickerTutorial, close, ensureCaptureStream, finish, fire, fireNotification, onclick, startTitleFlash, stopRealSnap, stopTitleFlash, toggleRealSnap
- **[live-livestream-snap-ui.js](../../live-chat/js/live/live-livestream-snap-ui.js)** ·377 — WEB2.0 module.
    - exposes: `LiveSnap`
    - uses shared: `Popup`
    - funcs (15): \_ensureFloatingHost, \_renderProgress, \_resetChip, ensureAutoModeChip, ensureBackfillChip, ensureForceExtractChip, ensureHeaderChip, ensureInlineThumbChip, ensureRealSnapChip, isCancelled, onProgress, renderAutoModeChip, renderHeaderChip, renderInlineThumbChip, renderRealSnapChip
- **[live-native-orders-api.js](../../live-chat/js/live/live-native-orders-api.js)** ·119 — Native Orders API (frontend client)
    - exposes: `NativeOrdersApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (8): \_fetchJson, \_getBaseUrl, \_w2AuthHeaders, createFromComment, getByUser, list, remove, update
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
- **[live-stats-panel.js](../../live-chat/js/live/live-stats-panel.js)** ·182 — WEB2.0 module.
    - exposes: `LiveStatsPanel`
    - uses shared: `Web2Chat`
    - funcs (6): computeStats, fmt, mount, render, scheduleUpdate, update
- **[inventory-panel-actions.js](../../live-chat/js/pancake/inventory-panel-actions.js)** ·329 — WEB2.0 module.
    - uses shared: `Web2Auth`, `Web2SSE`
    - funcs (9): \_cartHeaders, \_scheduleRefresh, \_subscribeSSE, addToCart, clearOrder, onUndo, refresh, refreshCartCounts, removeFromCart
- **[inventory-panel-init.js](../../live-chat/js/pancake/inventory-panel-init.js)** ·147 — WEB2.0 module.
    - exposes: `PancakeInventoryPanel`
    - funcs (4): \_mutationsTouchRows, \_wireLiveObserver, getCartProductStats, init
- **[inventory-panel-render.js](../../live-chat/js/pancake/inventory-panel-render.js)** ·626 — WEB2.0 module.
    - uses shared: `Web2ChatPanel`, `Popup`
    - funcs (21): \_addProductToComposer, \_markHasOrderRows, \_outside, \_renderBadgeFor, \_renderBadgeForRow, \_showToast, \_showUndoToast, \_snapTickerCancel, attachAddButtons, attachDragSources, attachDropTargets, cleanup, close, onclick, openCartHistory, renderBadges, renderCartPopover, renderProductList, renderShell, renderTabs, togglePopover
- **[inventory-panel-state.js](../../live-chat/js/pancake/inventory-panel-state.js)** ·277 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2SoOrder`
    - funcs (11): \_getCmtMap, \_relTime, \_resolveCommitContext, \_resolveLiveCustomer, \_user, applyFilter, asciiUpper, escapeHtml, fmtPrice, loadProducts, loadTabsFromSoOrder
- **[pancake-api.js](../../live-chat/js/pancake/pancake-api.js)** ·639 — PANCAKE API - All Pancake API calls (extracted from pancake-data-manager.js)
    - exposes: `PancakeAPI`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Chat`
    - funcs (24): \_extractPageAccessTokens, \_getPhoneFromConv, \_w2AuthHeaders, addCustomerNote, addRemoveTag, deleteComment, fetchConversations, fetchCustomerInfo, fetchMoreConversations, fetchPages, fetchPagesWithUnreadCount, fetchTags, getPageAccessToken, getToken, hideComment, likeComment, loadDebtForConversations, loadLiveSavedIds, markAsRead, markAsUnread, privateReplyN2Store, removeFromLiveSaved, searchConversations, sendTypingIndicator
- **[pancake-chat-window.js](../../live-chat/js/pancake/pancake-chat-window.js)** ·384 — WEB2.0 — wrapper mỏng bọc Web2ChatPanel (component chat hợp nhất). Giữ public API cũ cho conversation-list + realtime.
    - exposes: `PancakeChatWindow`
    - uses shared: `Web2ChatPanel`, `API_CONFIG`, `Web2Auth`, `Web2Chat`, `Web2Ext`
    - funcs (18): \_buildAdapter, \_fileToDataUrl, \_performSend, \_trySendViaExtension, loadMessages, loadOlder, markRead, onAddEntity, onConversationUpdate, onerror, onload, quickReplies, renderChatWindow, renderMessages, scrollToBottom, send, sendMessage, sendSticker
- **[pancake-context-menu.js](../../live-chat/js/pancake/pancake-context-menu.js)** ·189 — PANCAKE CONTEXT MENU - Right-click context menu
    - exposes: `PancakeContextMenu`
    - uses shared: `Popup`
    - funcs (4): handleAction, hide, renderTagSubmenu, show
- **[pancake-conversation-list.js](../../live-chat/js/pancake/pancake-conversation-list.js)** ·594 — PANCAKE CONVERSATION LIST - Sidebar conversation rendering
    - exposes: `PancakeConversationList`
    - funcs (23): \_computeFiltered, \_detectNewIds, \_getAvatarHtml, \_getPhoneFromConv, \_getTagsHtml, \_pageBadge, \_pageLabel, \_parseMessageHtml, \_patchConversationRow, \_renderEmpty, applyFilter, applyTypeFilter, clearSearch, handleSearch, loadMore, performApiSearch, reconcileConversationList, removeFromLiveSaved, renderConversationItem, renderConversationList, selectConversation, setPageFilter, updateConversationInDOM
- **[pancake-firestore-accounts.js](../../live-chat/js/pancake/pancake-firestore-accounts.js)** ·228 — WEB2.0 module.
    - exposes: `PancakeFirestoreAccounts`
    - funcs (3): getTokenFromFirestore, loadAccounts, saveTokenToFirestore
- **[pancake-init.js](../../live-chat/js/pancake/pancake-init.js)** ·379 — PANCAKE INIT - Orchestrate Pancake column initialization
    - exposes: `PancakeColumnManager`
    - funcs (11): \_bindEvents, \_loadConversations, \_preloadPageAccessTokens, \_renderErrorState, \_renderLoadingState, \_renderShell, \_switchTab, initialize, refresh, setServerMode, setTimeout
- **[pancake-livestream-filter.js](../../live-chat/js/pancake/pancake-livestream-filter.js)** ·433 — WEB2.0 module.
    - exposes: `PancakeLivestreamFilter`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (29): \_api, \_applySelection, \_authHeaders, \_btnLabel, \_campaignRows, \_esc, \_fmtDate, \_loadCampaigns, \_loadPosts, \_normPhone, \_pageLabel, \_persist, \_postRows, \_renderBar, \_restore, \_setSetsFromRows, \_wireBar, \_wireSse, \_worker, \_ymd7, clearAll, commenterCount, hasCampaign, init, isLivestreamConv, onclick, selectCampaign, selectToday, togglePost
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
- **[pancake-realtime.js](../../live-chat/js/pancake/pancake-realtime.js)** ·214 — WEB2.0 — realtime qua SSE (single source), KHÔNG còn WebSocket riêng.
    - exposes: `PancakeRealtime`
    - uses shared: `Web2Chat`, `Web2SSE`
    - funcs (12): \_fetchNewMessagesForActive, \_handleNewMessage, \_handleOrderTagsUpdate, \_handleUpdateConversation, \_onSseEvent, \_scheduleActiveRefresh, \_scheduleListRefresh, \_updateStatusUI, \_wireSse, connect, connectServerMode, disconnect
- **[pancake-state.js](../../live-chat/js/pancake/pancake-state.js)** ·207 — PANCAKE STATE - Centralized state for Pancake column
    - exposes: `PancakeState`
    - uses shared: `API_CONFIG`
    - funcs (7): clearSearch, getDebtCache, loadSelectedPage, resetMessageState, saveSelectedPage, setDebtCache, setServerMode
- **[pancake-token-codec.js](../../live-chat/js/pancake/pancake-token-codec.js)** ·225 — WEB2.0 module.
    - exposes: `PancakeTokenCodec`
    - funcs (5): analyzeToken, base64UrlDecode, cleanToken, decodeToken, isTokenExpired
- **[pancake-token-manager.js](../../live-chat/js/pancake/pancake-token-manager.js)** ·799 — WEB2.0 module.
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
- **[live-comments-stream.js](../../live-chat/js/shared/live-comments-stream.js)** ·179 — LiveCommentsStream — engine realtime comment livestream DÙNG CHUNG
    - exposes: `LiveCommentsStream`
    - uses shared: `Web2Auth`, `Web2SSE`
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
- **[browser-broker.js](../../live-chat/server/browser-broker.js)** ·82 — WEB2.0 module.
    - uses shared: `Web2Realtime`
    - funcs (3): \_bDedupKey, broadcastToBrowsers, createBrowserBroker
- **[client-manager.js](../../live-chat/server/client-manager.js)** ·133 — WEB2.0 module.
    - funcs (3): autoConnect, createClientManager, startClient
- **[db.js](../../live-chat/server/db.js)** ·36 — WEB2.0 module.
    - funcs (1): createDbPool
- **[event-store.js](../../live-chat/server/event-store.js)** ·43 — WEB2.0 module.
    - funcs (2): createEventStore, storeEvent
- **[facebook-routes.js](../../live-chat/server/facebook-routes.js)** ·452 — Facebook Graph API routes — merged into web2-realtime (2026-06-14).
    - funcs (4): fetch, getPageToken, isCommentConversation, loadTokensFromFile
- **[firebase-loader.js](../../live-chat/server/firebase-loader.js)** ·77 — WEB2.0 module.
    - funcs (2): initFirebase, loadTokensFromFirebase
- **[middleware.js](../../live-chat/server/middleware.js)** ·54 — WEB2.0 module.
    - funcs (3): applyMiddleware, makeRequireRelaySecret, requireRelaySecret
- **[page-selection-db.js](../../live-chat/server/page-selection-db.js)** ·67 — WEB2.0 module.
    - funcs (4): createPageSelection, ensureSelectionTable, getDisabledPageIds, savePageSelection
- **[pancake-api.js](../../live-chat/server/pancake-api.js)** ·64 — WEB2.0 module.
    - funcs (1): discoverPageIds
- **[pancake-client.js](../../live-chat/server/pancake-client.js)** ·326 — WEB2.0 module.
    - uses shared: `Web2Realtime`
    - funcs (11): connect, generateClientSession, getStatus, handleMessage, joinChannels, makeRef, start, startHeartbeat, stop, stopHeartbeat, tag
- **[relay.js](../../live-chat/server/relay.js)** ·55 — WEB2.0 module.
    - funcs (3): createRelay, doPost, forwardToFallback
- **[routes.js](../../live-chat/server/routes.js)** ·352 — WEB2.0 module.
    - uses shared: `Web2Realtime`
    - funcs (1): registerRoutes
- **[server.js](../../live-chat/server/server.js)** ·174 — WEB2.0 module.
    - funcs (4): \_broadcastImpl, broadcastToBrowsers, createClient, gracefulShutdown
- **[alert.js](../../live-chat/server/utils/alert.js)** ·34
    - funcs (1): sendAlert

### native-orders — Native Orders — API client cho trang Đơn Web.

- **[native-orders-api.js](../../native-orders/js/native-orders-api.js)** ·183 — Native Orders — API client cho trang Đơn Web.
    - exposes: `NativeOrdersApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (13): \_authHeaders, \_fetchJson, campaigns, createManual, getByUser, getKpiScope, health, list, markPrinted, markProductsPrinted, remove, searchProducts, update
- **[native-orders-bulk-operations.js](../../native-orders/js/native-orders-bulk-operations.js)** ·620 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `DeliveryMethodPicker`, `Popup`, `Web2Auth`, `Web2Chat`, `Web2MsgTemplate`
    - funcs (10): bulkCreatePbh, bulkCreatePbhShop, bulkMergeOrders, bulkSendMessage, collect, createPbhShopOne, fmt, getSelectedCodes, unselectAllOrders, updateBulkBar
- **[native-orders-chat-send.js](../../native-orders/js/native-orders-chat-send.js)** ·72 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Chat`, `Web2CustomerChat`
    - funcs (1): \_handleReplyComment
- **[native-orders-customer-panel.js](../../native-orders/js/native-orders-customer-panel.js)** ·417 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Auth`, `Web2Optimistic`
    - funcs (15): \_ensureCustPanelEl, \_fetchCustomerPanelData, \_hideCustPanel, \_onCustAvatarEnter, \_onCustAvatarLeave, \_renderCustPanelContent, \_scheduleCustPanelHide, \_showCustPanel, apply, fetchCustomerFromWeb2, formatTime, onSuccess, rollback, run, snapshot
- **[native-orders-customer360.js](../../native-orders/js/native-orders-customer360.js)** ·126 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Auth`
    - funcs (4): money, onclick, openCustomer, renderRow
- **[native-orders-delivery.js](../../native-orders/js/native-orders-delivery.js)** ·202 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `DeliveryMethodPicker`, `Web2Optimistic`
    - funcs (12): \_closeDeliveryMenu, \_deliveryBadgeHtml, \_deliveryOpts, \_deliveryShort, \_detectDelivery, apply, onSuccess, openDeliveryMenu, rollback, run, setDeliveryMethod, snapshot
- **[native-orders-filters-campaigns.js](../../native-orders/js/native-orders-filters-campaigns.js)** ·376 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Campaign`
    - funcs (23): \_syncChannelUi, applyFilters, assignPost, clearFilters, clearParentSelection, createParentCampaign, firstMatch, loadAvailableCampaigns, loadCampaignSelection, loadPagePosts, loadParentCampaigns, opts, pickNewestHouseStore, reconcileCampaignSelection, renderCampaignDropdown, renderCampaignLabel, renderPagePosts, renderParentCampaigns, row, saveCampaignSelection, selectParentCampaign, toggleCampaignDropdown, toggleFilter
- **[native-orders-inbox-add.js](../../native-orders/js/native-orders-inbox-add.js)** ·597 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Bill`, `Web2UserInfo`
    - funcs (14): addToCart, avatarHtml, clearSelection, close, closeFbRebind, ensureProdCache, openAddInboxOrder, openFbRebind, pkItemHtml, renderCart, renderProdResults, renderSelectedChip, setFbStatus, whItemHtml
- **[native-orders-inbox-resolve.js](../../native-orders/js/native-orders-inbox-resolve.js)** ·292 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `API_CONFIG`, `Web2Chat`, `Web2CustomerChat`
    - funcs (8): \_avatarUrl, \_getSidebarPageIds, \_hydrateInboxAvatars, \_khoFbByPhone, \_normPhone, \_resolveInboxConvByPhone, \_searchPancakeCustomers, job
- **[native-orders-interactions.js](../../native-orders/js/native-orders-interactions.js)** ·306 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2ChatPanel`, `Popup`, `Web2Chat`, `Web2CustomerChat`
    - funcs (14): \_addDetectedToOrder, \_closeInteractions, \_extensionRequest, \_hasChatClient, \_hasExtension, \_parseNoteComments, \_refreshInteractionsIfOpen, \_renderCommentsPanel, \_renderInteractionsInfoHtml, \_wireCommentReplies, onAddEntity, onMsg, onReady, openInteractions
- **[native-orders-kpi-health.js](../../native-orders/js/native-orders-kpi-health.js)** ·218 — WEB2.0 module.
    - exposes: `NativeOrdersKpiHealth`
    - uses shared: `Web2Escape`, `Web2Kpi`
    - funcs (11): applyFilter, ensureBar, ensureStyles, esc, init, matchFilter, pillInfo, render, scan, schedule, setFilter
- **[native-orders-kpi.js](../../native-orders/js/native-orders-kpi.js)** ·122 — WEB2.0 module.
    - exposes: `NativeOrdersKpi`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Kpi`, `Web2SSE`
    - funcs (7): authHeaders, esc, fmtVnd, init, load, render, scheduleReload
- **[native-orders-modal-edit.js](../../native-orders/js/native-orders-modal-edit.js)** ·493 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Optimistic`, `Web2UserInfo`, `Web2VnAddress`
    - funcs (14): apply, changeLineQty, closeEdit, onSuccess, openEdit, quickStatus, removeLine, renderOrderLines, rollback, run, saveEdit, setLineNote, setLineQty, snapshot
- **[native-orders-packing-slip.js](../../native-orders/js/native-orders-packing-slip.js)** ·326 — WEB2.0 module — Phiếu Soạn Hàng cho giỏ hàng (native-orders chưa PBH).
    - exposes: `NativeOrdersPackingSlip`
    - uses shared: `Web2Escape`, `Web2UserInfo`
    - funcs (10): \_buildPrintHTML, \_ensureModal, \_esc, \_notify, \_print, \_renderRows, \_seller, close, go, open
- **[native-orders-pbh-bill.js](../../native-orders/js/native-orders-pbh-bill.js)** ⚠️849 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `DeliveryMethodPicker`, `Popup`, `Web2Auth`, `Web2Bill`, `Web2Effects`, `Web2NumberInput`, `NativeReturnBill`
    - funcs (29): \_billShipPriceOf, \_buildPbhShape, \_dateInputToIsoWithNowTime, \_doCreatePbh, \_getDeliveryOpts, \_gv, \_markPrintedCodes, bulkPrintBills, cancelOrder, cancelPbh, cancelPbhFromEdit, cleanup, collect, copyCode, createPbh, fmt, goPage, onKey, onMount, onPrint, openCustomFormPopup, openNext, pickedHint, printConfirmedBills, removeOrder, splitOrder, splitPbh, validateOrderForPbh, viewOrderBill
- **[native-orders-product-picker.js](../../native-orders/js/native-orders-product-picker.js)** ·178 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Auth`, `Web2UserInfo`
    - funcs (7): \_pickerOutsideClick, \_renderPickItem, addLineFromPicker, ensureVariantMap, loadEditProductsCache, searchPickerProducts, stripVi
- **[native-orders-public-api.js](../../native-orders/js/native-orders-public-api.js)** ·101 — WEB2.0 module.
    - exposes: `NativeOrders`, `NativeOrdersApp`
    - uses shared: `Web2ChatPanel`, `Web2AuditLog`, `Web2CustomerChat`, `Web2MsgTemplate`, `Web2OrderTagDetail`, `Web2Realtime`
    - funcs (2): openHistory, simulateLineCommentId
- **[native-orders-realtime-init.js](../../native-orders/js/native-orders-realtime-init.js)** ·317 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2CkReview`, `Web2CkAssignPicker`, `Web2SSE`
    - funcs (5): \_loadAndRenderScopeBanner, \_scheduleReload, \_sseConnect, init, onDone
- **[native-orders-render.js](../../native-orders/js/native-orders-render.js)** ⚠️939 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Auth`, `Web2Effects`, `Web2Kpi`, `Web2NewMsgBadge`, `Web2OrderTagDetail`, `Web2OrderTagPill`, `Web2WalletBalance`
    - funcs (24): \_autoTagPills, \_buildOrderHtml, \_renderExpandRow, \_rowSignature, \_rowTagSignature, \_rowTagTriggers, clearCustomerFilter, computeOrderStt, detectCarrier, filterByCustomer, isAdmin, load, lockKpiBase, onAssign, onLock, openTagDetail, orderDerivedBadges, renderCounters, renderCustomerChip, renderPagination, renderRows, swapCaret, toggleExpand, web2StatusText
- **[native-orders-snapshots.js](../../native-orders/js/native-orders-snapshots.js)** ·179 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `API_CONFIG`
    - funcs (7): \_flushSnapFetch, \_queueSnapFetch, \_renderCommentReadonlyBlock, \_renderCommentThumbHtml, \_renderLineSnapThumb, close, openSnapLightbox
- **[native-orders-state.js](../../native-orders/js/native-orders-state.js)** ·418 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Escape`
    - funcs (31): $, \_isRealFbId, \_renderSourceBadge, \_showFbBusinessLoginPrompt, applyColumnVisibility, avatarColor, controlBar, counter, escapeHtml, firstChar, formatFullTime, formatTimeSplit, isAdmin, loadColVisibility, modal, modalBody, modalTitle, notify, pag, renderAvatar, renderColumnTogglePanel, restoreChannel, saveChannel, saveColVisibility, searchCount, statusBadge, tbody, toggleColumnPanel, toggleLabel, w2pAlert, w2pConfirm
- **[native-orders-unit-serials.js](../../native-orders/js/native-orders-unit-serials.js)** ·73 — WEB2.0 module.
    - exposes: `NativeOrders`
    - uses shared: `Web2Auth`, `Web2SSE`
    - funcs (3): \_loadUnitSerials, \_schedule, load

### so-order — WEB2.0 module.

- **[so-order-app.js](../../so-order/js/so-order-app.js)** ·236 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Deeplink`, `Web2ProductsCache`, `Web2SuppliersCache`, `Web2VariantsCache`
    - funcs (7): \_applyDeeplink, conflictHandler, findInDom, init, norm, remoteHandler, tick
- **[so-order-barcode.js](../../so-order/js/so-order-barcode.js)** ·166 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2ProductUnits`, `Web2ProductsApi`, `Web2ProductsCache`
    - funcs (4): \_attachUnitCodes, openBarcodePrintModal, perItemQty, printLabelsFromReceivePanel
- **[so-order-bulk-edit.js](../../so-order/js/so-order-bulk-edit.js)** ·91 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2NumberInput`
    - funcs (5): commitBulkEditField, onBulkEditChange, onBulkEditFocusIn, onBulkEditKeydown, onPick
- **[so-order-confirm.js](../../so-order/js/so-order-confirm.js)** ·214 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (12): \_soLockBody, \_soUnlockBody, close, finish, hideModal, onClick, onKey, render, showModal, soConfirm, soConfirmOpen, update
- **[so-order-delete.js](../../so-order/js/so-order-delete.js)** ·370 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (15): \_buildRowDeleteConfirm, \_buildShipmentDeleteConfirm, \_daysUntilPurge, \_finalizeDeleteShipment, \_fmtTrashDate, \_markDeletePending, \_unmarkDeletePending, deleteRow, deleteShipment, finishWith, handleTrashPurge, handleTrashRestore, openTrashModal, renderTrashList, updateTrashCountBadge
- **[so-order-format.js](../../so-order/js/so-order-format.js)** ·108 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Escape`, `Web2Format`
    - funcs (10): activeColVis, currencyToVndRate, escapeHtml, fmtCurrency, fmtVnd, formatDateVN, fromVnd, notify, pushSync, toVnd
- **[so-order-image-manager.js](../../so-order/js/so-order-image-manager.js)** ·474 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Effects`, `Web2SSE`
    - funcs (27): \_allBatches, \_api, \_base, \_batchLabel, \_imgMgrAutoInvoice, \_imgMgrCardHtml, \_imgMgrDelete, \_imgMgrDeleteNcc, \_imgMgrOpenGalleryForRow, \_imgMgrPromptBatch, \_imgMgrReload, \_imgMgrRender, \_imgMgrRenderBatches, \_imgMgrRenderList, \_imgMgrShowGallery, \_imgMgrUpload, \_imgMgrWireList, \_modalBatch, \_modalOrderNcc, \_tabId, \_worker, curNcc, imgMgrByNcc, imgMgrUrl, onResult, openImageManager, wireImageManager
- **[so-order-image-modal.js](../../so-order/js/so-order-image-modal.js)** ·137 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Effects`
    - funcs (8): \_clearInlineImage, \_refreshInlineImagePreview, \_saveInlineImage, hideLightbox, onResult, openInlineImageModal, openLightbox, wireInlineImageModal
- **[so-order-import.js](../../so-order/js/so-order-import.js)** ·240 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Import`
    - funcs (3): \_commitSoImport, \_normImportDate, \_soImportConfig
- **[so-order-inline-edit.js](../../so-order/js/so-order-inline-edit.js)** ·546 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2NumberInput`, `Web2SuppliersCache`, `Web2VariantPicker`, `Web2VariantsCache`
    - funcs (22): \_beginVariantPickerEdit, \_currentStateSuppliers, \_ensureSupplierAsync, \_ensureSupplierCacheSubscription, \_ensureSupplierWithFeedback, \_maybeExpandVndShorthand, attachSupplierPickerOnDemand, attachVariantPickerOnDemand, beginInlineCellEdit, cancel, cleanup, commit, finish, inPicker, onCellDoubleClick, onDocDown, onKey, onPick, refresh, renderDropdown, restore, updateActiveHighlight
- **[so-order-kho-sync.js](../../so-order/js/so-order-kho-sync.js)** ·551 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Optimistic`, `Web2ProductCode`, `Web2ProductsApi`, `Web2ProductsCache`, `Web2VariantsCache`
    - funcs (14): \_assignKhoCodes, \_checkRowsHaveStock, \_checkRowsHaveStockSync, \_generateKhoCode, \_isStockCacheReady, \_noteHasLabel, \_rowToKhoMatch, adjustKhoPending, assignFlat, computeOverrides, khoHas, norm, reconcileWithKho, syncRowsToKho
- **[so-order-modal-core.js](../../so-order/js/so-order-modal-core.js)** ·551 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2NumberInput`, `Web2ProductsCache`, `Web2VariantPicker`
    - funcs (18): \_gv, \_modalMatchKho, \_mountModalVariantPickers, \_newModalRow, modalRowHtml, onChange, onModalPriceBlur, onModalRowFieldInput, onPick, onclick, renderModalRows, updateModalGrandTotals, updateModalTotals, updateRowImagePreview, updateRowMeta, updateRowTotal, wireModalRowInputs, wireModalTotals
- **[so-order-modal-image.js](../../so-order/js/so-order-modal-image.js)** ·195 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Effects`
    - funcs (10): \_applyImageToRow, \_imgPasteCellHtml, \_orderInvoiceImageHtml, \_renderOrderInvoiceImage, \_setOrderInvoiceImage, \_wireOrderInvoiceImage, fileToDataUrl, onResult, onload, wireModalImagePasteDrop
- **[so-order-modal-open.js](../../so-order/js/so-order-modal-open.js)** ·199 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2NumberInput`
    - funcs (6): \_applyShipMetaUi, \_setMoneyVal, \_shipMetaFlags, onPick, openOrderModal, updateContractHint
- **[so-order-modal-random.js](../../so-order/js/so-order-modal-random.js)** ·223 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2NumberInput`, `Web2ProductTypesCache`, `Web2VariantsCache`
    - funcs (10): \_pickProductForType, \_rImg, \_rInt, \_rPick, \_randomRow, \_typeKey, \_typePool, \_variantPools, fillModalRandom, generateRandomOrders
- **[so-order-modal-submit.js](../../so-order/js/so-order-modal-submit.js)** ·320 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2NumberInput`, `Web2VariantMulti`
    - funcs (2): \_gv, handleOrderSubmit
- **[so-order-modal-suggest.js](../../so-order/js/so-order-modal-suggest.js)** ·382 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2ProductGroup`, `Web2ProductsCache`, `Web2VariantsCache`
    - funcs (13): \_anchorFloatPanel, \_bindModalScrollCloseDropdowns, \_fillRowFromProduct, \_getFloatPanel, \_hideFloatPanels, applyParentSuggestionToRow, applySuggestionToRow, hideSuggest, hideVariantSuggest, itemHtml, reflow, showSuggest, showVariantSuggest
- **[so-order-payments.js](../../so-order/js/so-order-payments.js)** ·429 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `API_CONFIG`, `Web2NumberInput`, `Web2Optimistic`, `Web2SSE`, `Web2SupplierPay`, `Web2UserInfo`
    - funcs (22): \_afterPayExpenseChange, \_mountPayExpenses, \_nccSummaryCards, \_payApi, \_payExpRowHtml, \_payExpRows, \_payExpensesHtml, \_payHeaders, \_paySummaryCards, \_renderPayExpenses, \_shipmentForSupplierInBatch, histFor, loadPayments, onMount, onNccChange, onSubmit, openPaymentModal, paymentsForActiveBatch, recordSoPayment, suppliersInActiveBatch, tabId, wirePaymentPanel
- **[so-order-receive.js](../../so-order/js/so-order-receive.js)** ·790 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2ProductsApi`, `Web2ProductsCache`
    - funcs (12): \_hideOtherShipments, \_lookupProductStateForRows, \_patchReceiveRowFromLookup, \_showAllShipments, \_updateReceiveRowStatus, \_updateReceiveSummary, closePanel, confirmReceiveFromModal, escHandler, matchSupplier, normName, openReceiveShipmentModal
- **[so-order-render-cells.js](../../so-order/js/so-order-render-cells.js)** ·160 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (6): \_isRowLocked, actionsCell, editableCellHtml, imgCell, priceCell, statusCell
- **[so-order-render.js](../../so-order/js/so-order-render.js)** ⚠️1039 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Deeplink`, `Web2ProductsCache`, `Web2VariantMulti`
    - funcs (34): \_computeRowSpans, \_etaBadgeHtml, \_explodeVariants, \_groupMetaSubHeaderHtml, \_lookupKhoCode, \_orderReceivedGroupsLast, \_sp, \_updateVariantMultiPreview, activeBatchKey, applyEditTableModeUi, batchGroups, batchKeyOf, batchLabelOf, beginShipmentFieldEdit, columnHeaderRowHtml, commit, flashRow, gate, getBatchTotals, getNccBatchTotals, pill, pkeyOf, renderAll, renderBatchStrip, renderFooterTotals, renderTabStrip, renderTableBody, renderTableHead, restore, rowHtml, setEditTableMode, shipmentHeaderHtml, shipmentHtml, shipmentsInActiveBatch
- **[so-order-settings.js](../../so-order/js/so-order-settings.js)** ·231 — WEB2.0 module.
    - exposes: `SoOrder`
    - funcs (8): \_syncShipMetaAllCheckbox, \_wireShipMetaAll, buildOpts, finishWith, handleTabDelete, handleTabSettingsSubmit, openColumnModal, openTabSettingsModal
- **[so-order-shipment.js](../../so-order/js/so-order-shipment.js)** ·343 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2NumberInput`
    - funcs (16): \_curEditShipment, \_expenseRowHtml, \_mostCommonSupplier, \_readPerOrderMeta, \_renderExpensesTotal, \_renderPerOrderMeta, \_renderShipmentExpenses, isLocked, num, numField, numMoney, onPick, openShipmentEditAllRows, openShipmentModal, updateContractHint, wireExpensesEditor
- **[so-order-state.js](../../so-order/js/so-order-state.js)** ·121 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2Auth`, `Web2UserInfo`
    - funcs (3): \_isAdmin, \_w2Auth, editTableMode
- **[so-order-storage-sync.js](../../so-order/js/so-order-storage-sync.js)** ·269 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (11): \_flushPending, \_loadFromServer, \_persistSyncedVersion, \_readSyncedVersion, \_soAuthHeaders, \_subscribeSSE, flush, init, pullOnce, pushToFirestore, teardown
- **[so-order-storage.js](../../so-order/js/so-order-storage.js)** ⚠️954 — WEB2.0 module.
    - exposes: `SoOrderStorage`
    - uses shared: `Web2IdbStore`, `Web2VariantPicker`
    - funcs (53): \_applyLocalActiveTab, \_defaultState, \_flushWrite, \_getLocalActiveBatch, \_getLocalActiveTab, \_getStore, \_migrateTab, \_mkId, \_read, \_readBatchMap, \_setLocalActiveBatch, \_setLocalActiveTab, \_write, addExpense, addRow, addShipment, addTab, applyLocalActiveTab, batchKeyOf, deleteExpense, deleteRow, deleteShipment, deleteTab, findShipment, flush, getActiveBatch, getActiveTab, getCachedState, getColumnVisibility, getOrderAdjustment, getShipmentAdjustTotals, getShipmentExpenseTotal, getTrash, load, loadCached, moveRow, purgeFromTrash, purgeOldTrash, restoreFromTrash, save, setActiveBatch, setActiveTab, setCachedState, setColumnVisibility, setLocalActiveTab, setOrderAdjustment, softDeleteShipment, updateExpense, updateFooter, updateInvoiceImageForGroup, updateRow, updateShipment, updateTab
- **[so-order-toolbar.js](../../so-order/js/so-order-toolbar.js)** ·102 — WEB2.0 module.
    - exposes: `SoOrder`
    - uses shared: `Web2AuditLog`
    - funcs (2): wireFooterInputs, wireToolbar

### web2/ai-assistant — WEB2.0 module.

- **[ai-assistant.js](../../web2/ai-assistant/js/ai-assistant.js)** ·215 — WEB2.0 module.
    - exposes: `AiAssistantAdmin`
    - uses shared: `Web2AiAssistant`, `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2Skeleton`
    - funcs (15): $, API, authHeaders, currentCfgFromUi, escAttr, init, loadCfg, loadStatus, renderEnable, renderModels, renderProviders, saveCfg, testAsk, toast, workerBase

### web2/ai-hub — WEB2.0 module.

- **[ai-chat.js](../../web2/ai-hub/js/ai-chat.js)** ·753 — WEB2.0 module.
    - exposes: `AiChat`
    - uses shared: `Popup`, `AiPresets`
    - funcs (43): H, \_hydrateServer, \_mergeServerChats, \_pickDefaultProvider, \_scheduleSync, \_slim, \_syncNow, addImageFile, autoSize, current, currentModelVision, customSystem, deleteConvo, doStream, editSystem, emit, fallback, fillModels, init, load, msgHtml, newConvo, onDelta, onload, paint, providers, regenerate, renderAttachStrip, renderList, renderMessages, renderProviderChips, save, selectConvo, selectProvider, send, setStreaming, stop, streamAssistant, syncBar, updateAttach, updateKeyPill, updateSendState, wireMsgActions
- **[ai-gemini-chat.js](../../web2/ai-hub/js/ai-gemini-chat.js)** ·30 — WEB2.0 module.
    - exposes: `AiGeminiChat`
    - uses shared: `Web2GeminiChat`
    - funcs (2): init, onShow
- **[ai-html.js](../../web2/ai-hub/js/ai-html.js)** ·30 — WEB2.0 module.
    - exposes: `AiHtml`
    - uses shared: `Web2ContentMaker`, `Web2HtmlSkill`, `Web2VideoRender`
    - funcs (2): init, onShow
- **[ai-hub.js](../../web2/ai-hub/js/ai-hub.js)** ·237 — WEB2.0 module.
    - exposes: `AiHub`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2GeminiChat`
    - funcs (16): API, authHeaders, escapeHtml, handle401, init, isAdmin, loadStatus, notifyAuthExpired, onPick, onerror, onload, pickStock, renderMarkdown, switchTab, toast, workerBase
- **[ai-image.js](../../web2/ai-hub/js/ai-image.js)** ·470 — WEB2.0 module.
    - exposes: `AiImage`
    - uses shared: `Popup`, `Web2AiDescribe`, `AiPresets`, `Web2BgRemover`, `Web2Skeleton`
    - funcs (25): H, clearSource, done, enhancePrompt, fail, fillModels, fillProviders, generate, imageProviders, init, loadHistory, onShow, onclick, onerror, onload, refreshQuota, removeBgFromCard, renderCard, renderHistoryCard, setSource, showSource, startFakeProgress, stop, toggleEditField, value
- **[ai-keys.js](../../web2/ai-hub/js/ai-keys.js)** ·221 — WEB2.0 module.
    - exposes: `AiKeys`
    - funcs (9): H, chatCard, imgCard, init, loadVoice, render, testProvider, voiceBase, voiceCard
- **[ai-tryon.js](../../web2/ai-hub/js/ai-tryon.js)** ·29 — WEB2.0 module.
    - exposes: `AiTryon`
    - uses shared: `Web2Tryon`
    - funcs (2): init, onShow

### web2/ai-photo — WEB2.0 module.

- **[ai-photo.js](../../web2/ai-photo/js/ai-photo.js)** ·124 — WEB2.0 module.
    - exposes: `AiPhoto`
    - uses shared: `Web2BeautyStudio`, `Web2BgScene`, `Web2ImageEditor`, `Web2LogoEraser`, `Web2Watermark`
    - funcs (10): $, init, loadImg, notify, onerror, onload, runTool, setSource, showResult, wireInput

### web2/balance-history — WEB2.0 — balance-history app (Phase 3 — 100% Web 2.0).

- **[web2-balance-history-app.js](../../web2/balance-history/js/web2-balance-history-app.js)** ·223 — WEB2.0 — balance-history app (Phase 3 — 100% Web 2.0).
    - exposes: `W2BH`, `Web2BalanceHistoryApp`
    - uses shared: `Web2CustomerChat`
    - funcs (7): \_applyDatePreset, \_currentPresetKey, \_datePresetRange, \_toISODate, \_updateDatePresetActive, bindEvents, init
- **[web2-bh-actions.js](../../web2/balance-history/js/web2-bh-actions.js)** ·155 — WEB2.0 module.
    - exposes: `W2BH`
    - funcs (4): autoAssign, autoMatchSingle, autoReprocessOnLoad, reprocessUnmatched
- **[web2-bh-chat-export.js](../../web2/balance-history/js/web2-bh-chat-export.js)** ·149 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2CustomerChat`
    - funcs (4): escape, exportCsv, fbConversation, openChatForPhone
- **[web2-bh-core.js](../../web2/balance-history/js/web2-bh-core.js)** ·217 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2Auth`, `Web2Escape`, `Web2Format`
    - funcs (13): \_currentUser, \_normalizePhoneInput, authHeaders, cacheDom, debounce, escapeHtml, fmtTime, fmtVnd, jsonFetch, notify, searchNormalize, stripDiacritics, withFallback
- **[web2-bh-data.js](../../web2/balance-history/js/web2-bh-data.js)** ·83 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2SSE`
    - funcs (3): load, reload, setupSSE
- **[web2-bh-link-customer.js](../../web2/balance-history/js/web2-bh-link-customer.js)** ·67 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Popup`, `Web2CustomerStore`
    - funcs (2): linkManual, openLinkPrompt
- **[web2-bh-reassign-modal.js](../../web2/balance-history/js/web2-bh-reassign-modal.js)** ·287 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2WalletBalance`
    - funcs (7): ensureReassignModalDom, ensureReassignStyles, openReassignModal, parse, searchCustomers, submitReassign, url
- **[web2-bh-render.js](../../web2/balance-history/js/web2-bh-render.js)** ·312 — WEB2.0 module.
    - exposes: `W2BH`
    - uses shared: `Web2AuditLog`, `Web2CustomerDetailModal`, `Web2Skeleton`, `Web2WalletBalance`
    - funcs (8): \_extractUserFromRow, pushBtn, renderChips, renderPagination, renderRow, renderStats, renderTable, verifBadge
- **[web2-link-customer-modal.js](../../web2/balance-history/js/web2-link-customer-modal.js)** ·297 — WEB2.0 — smart customer search modal cho balance-history.
    - exposes: `Web2LinkCustomerModal`
    - uses shared: `Web2Auth`, `PartnerCustomerApi`, `Web2Escape`, `Web2Format`, `Web2WalletBalance`
    - funcs (15): authHeaders, closeModal, ensureModalDom, ensureStyles, escapeHtml, fmtVnd, jsonFetch, linkAndClose, notify, onManualSubmit, onSearchInput, openModal, renderRow, runSearch, statusBadge
- **[web2-manual-deposit.js](../../web2/balance-history/js/web2-manual-deposit.js)** ·663 — WEB2.0 — manual deposit modal cho balance-history page.
    - exposes: `Web2ManualDeposit`
    - uses shared: `Web2Auth`, `PartnerCustomerApi`, `Web2Escape`, `Web2NumberInput`, `Web2SuppliersCache`
    - funcs (28): \_cacheGet, \_cacheSet, authHeaders, clearKh, close, doKhSearch, ensureStyles, escapeAttr, escapeHtml, getCurrentUserName, getNccValue, hideNccNewInput, init, isAdmin, jsonFetch, loadNccList, notify, open, pickKh, postManualDeposit, renderKhResults, scheduleSearch, searchKh, searchKhAggregate, searchKhWeb2, showNccNewInput, submit, toggleTargetPanel
- **[web2-partner-enricher.js](../../web2/balance-history/js/web2-partner-enricher.js)** ·149 — WEB2.0 — enrich balance-history rows với trạng thái KH Web 2.0.
    - exposes: `Web2PartnerEnricher`
    - uses shared: `PartnerCustomerApi`, `Web2CustomerStore`
    - funcs (10): enrichRow, escapeHtml, flush, init, linkHtml, normPhone, scanAll, scheduleFlush, startObserver, statusPillHtml
- **[web2-pending-match.js](../../web2/balance-history/js/web2-pending-match.js)** ·114 — WEB2.0 module.
    - exposes: `W2PM`, `Web2PendingMatch`
    - uses shared: `Web2SSE`
    - funcs (4): ensureBadge, init, refresh, updateBadge
- **[web2-pm-core.js](../../web2/balance-history/js/web2-pm-core.js)** ·172 — WEB2.0 module.
    - exposes: `W2PM`
    - uses shared: `Web2Auth`, `Web2Escape`, `Web2Format`
    - funcs (13): \_normalize, \_normalizePhoneInput, authHeaders, escapeHtml, fmtTime, fmtVnd, getCurrentUserName, jsonFetch, linkManual, listPending, notify, resolvePending, withFallback
- **[web2-pm-customer-search.js](../../web2/balance-history/js/web2-pm-customer-search.js)** ·242 — WEB2.0 module.
    - exposes: `W2PM`
    - uses shared: `Web2Chat`, `Web2PancakeImport`, `Web2WalletBalance`
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

### web2/cham-cong — WEB2.0 module — Chấm công: API client.

- **[cham-cong-api.js](../../web2/cham-cong/js/cham-cong-api.js)** ·91 — WEB2.0 module — Chấm công: API client.
    - exposes: `ChamCongApi`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (26): AUTHH, addFullday, addHoliday, addRecord, api, call, createDeviceUser, delFullday, delHoliday, deleteDeviceUser, deleteRecord, getPayroll, getPeriodLock, getSyncStatus, listDayNotes, listDeviceUsers, listEdits, listEmployees, listFullday, listHolidays, listRecords, lockPeriod, patchDeviceUser, putDayNote, putPayroll, unlockPeriod
- **[cham-cong-app.js](../../web2/cham-cong/js/cham-cong-app.js)** ⚠️901 — WEB2.0 module — Chấm công: app core (state + bảng công + import + sync).
    - exposes: `ChamCong`
    - uses shared: `Popup`, `Web2Auth`, `Web2IdbStore`, `Web2Sidebar`, `Web2Skeleton`, `Web2SSE`
    - funcs (33): applyResults, cfgFor, chip, close, confirmBox, curMonthKey, empName, esc, fmtDayHeader, fmtEditTs, init, isFulldaySet, isManualEmp, isVisibleEmp, latestRecordDateKey, listLine, loadAll, monthRange, needsAttendance, onclick, openDay, payrollFor, recordsFor, refreshSyncOnly, renderActive, renderSyncStrip, renderTimesheet, renderTodayHtml, saveDayDetail, setTab, shiftMonth, toast, weekdayShort
- **[cham-cong-employees.js](../../web2/cham-cong/js/cham-cong-employees.js)** ·308 — WEB2.0 module — Chấm công: tab Nhân viên (gán PIN máy ↔ web2_users + cấu hình ca/lương).
    - exposes: `ChamCongEmployees`
    - uses shared: `Popup`, `Web2Skeleton`
    - funcs (13): CC, addManual, checkDupEmp, deleteManual, empOptions, mark, render, rowBody, saveAll, saveRow, setDirtyBanner, validHours, wireDirty
- **[cham-cong-payroll.js](../../web2/cham-cong/js/cham-cong-payroll.js)** ·746 — WEB2.0 module — Chấm công: tab Bảng lương + modal điều chỉnh.
    - exposes: `ChamCongPayroll`
    - uses shared: `Web2Skeleton`
    - funcs (30): CC, close, collect, computeRow, dmy, doLock, doUnlock, entriesForRender, exportPayroll, fmt, fmtLockTime, hm, isLocked, itemLines, itemRows, itemsEditor, lockObj, numOrNull, onclick, onerror, onload, openDetail, openEdit, printPayslip, render, resolveRow, section, sectionHead, snapRow, snapRows
- **[cham-cong-salary.js](../../web2/cham-cong/js/cham-cong-salary.js)** ·303 — WEB2.0 module — Chấm công: tính lương (pure).
    - exposes: `ChamCongSalary`
    - funcs (10): calcDay, calcMonth, dayStatus, daysOfMonth, fmtHM, fmtVnd, hmToMinutes, processDay, sumItems, vnMoment

### web2/chi-tieu — WEB2.0 module — Quản lý chi tiêu: API client.

- **[chi-tieu-api.js](../../web2/chi-tieu/js/chi-tieu-api.js)** ·66 — WEB2.0 module — Quản lý chi tiêu: API client.
    - exposes: `ChiTieuApi`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (20): AUTHH, addCategory, addSource, api, cancelVoucher, createVoucher, delCategory, delSource, deleteVoucher, getVoucher, imageUrl, listCategories, listSources, listVouchers, qs, report, summary, updateVoucher, uploadImage, voucherAudit
- **[chi-tieu-app.js](../../web2/chi-tieu/js/chi-tieu-app.js)** ·638 — WEB2.0 module — Quản lý chi tiêu: app core.
    - exposes: `ChiTieu`
    - uses shared: `Popup`, `Web2Auth`, `Web2ImagePaste`, `Web2NumberInput`, `Web2Sidebar`, `Web2Skeleton`, `Web2SSE`
    - funcs (26): bindFilters, catOptions, close, confirmBox, doCancel, esc, fmtDateTime, fmtVnd, g, init, loadAll, monthStartVN, nowLocalInput, onclick, openAudit, openCatManage, openForm, render, renderBalance, renderList, srcOptions, summaryFilter, syncFormCatSelect, toast, todayVN, typeBadge
- **[chi-tieu-report.js](../../web2/chi-tieu/js/chi-tieu-report.js)** ·118 — WEB2.0 module — Quản lý chi tiêu: tab Báo cáo.
    - exposes: `ChiTieuReport`
    - funcs (3): CT, catBlock, render

### web2/ck-dashboard — WEB2.0 module — Dashboard đối soát CK.

- **[ck-dashboard-app.js](../../web2/ck-dashboard/js/ck-dashboard-app.js)** ·487 — WEB2.0 module — Dashboard đối soát CK.
    - uses shared: `Web2CkReview`, `Web2UnreadPanel`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Format`, `Web2HistoryTimeline`, `Web2Optimistic`, `Web2Sidebar`, `Web2Skeleton`, `Web2SSE`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (30): ageTxt, apply, bindIntents, bindSig, doFetch, esc, fetchJson, fmtTime, histCard, historyHtml, intentCard, loadCol, loadHistory, onCount, onDone, onSuccess, onchange, onclick, oninput, reloadAll, renderCol, renderHistory, renderStats, rollback, showColSkeletons, sigCard, snapshot, switchTab, wireHistory, wireTabs

### web2/clearance — WEB2.0 — Kho rớt xả (derived/lazy, 0 cron). Đặc tả: docs/web2/PER-UNIT-QR-PLAN.md

- **[clearance.js](../../web2/clearance/js/clearance.js)** ·252 — WEB2.0 — Kho rớt xả (derived/lazy, 0 cron). Đặc tả: docs/web2/PER-UNIT-QR-PLAN.md
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2Sidebar`, `Web2SSE`
    - funcs (19): $, \_isAdmin, api, boot, card, chip, esc, fmtVnd, icons, keepGroup, keepUnit, load, render, renderFilters, renderList, renderSummary, toast, token, userName

### web2/customer-wallet — WEB2.0 module.

- **[web2-customer-wallet-api.js](../../web2/customer-wallet/js/web2-customer-wallet-api.js)** ·289 — WEB2.0 module.
    - exposes: `W2CW`
    - uses shared: `PartnerCustomerApi`, `Web2WalletApi`
    - funcs (14): aggregateFromPbh, fetchAggregateStats, fetchAggregateWeb2Only, fetchAllWeb2Wallets, fetchNativeOrders, fetchOverlay, fetchPbhList, fetchPbhListForPhone, fetchWalletReturns, fetchWeb2ReturnAmountsBatch, fetchWeb2Wallets, mergeNativeOrders, normalizeOrder, qrFetch
- **[web2-customer-wallet-app.js](../../web2/customer-wallet/js/web2-customer-wallet-app.js)** ·294 — WEB2.0 module.
    - exposes: `W2CW`, `Web2CustomerWalletApp`
    - uses shared: `Popup`, `PartnerCustomerApi`, `Web2SSE`, `Web2WalletApi`
    - funcs (6): \_flush, hardReset, init, load, refreshSinglePhone, setupSSE
- **[web2-customer-wallet-events.js](../../web2/customer-wallet/js/web2-customer-wallet-events.js)** ·264 — WEB2.0 module.
    - exposes: `W2CW`
    - uses shared: `Web2Auth`
    - funcs (5): copyQrCode, csvEscape, exportCsv, upsertQr, wireUi
- **[web2-customer-wallet-render.js](../../web2/customer-wallet/js/web2-customer-wallet-render.js)** ·454 — WEB2.0 module.
    - exposes: `W2CW`
    - uses shared: `Web2Auth`, `PartnerCustomerApi`, `Web2Skeleton`, `Web2WalletApi`
    - funcs (14): cardHtml, enrichWeb2ForCurrentPage, openDetail, push, renderDetailExtras, renderDetailTabs, renderHistory, renderList, renderOrders, renderPagination, renderQrData, renderQrEmpty, renderQrTab, web2PartnerBadge
- **[web2-customer-wallet-state.js](../../web2/customer-wallet/js/web2-customer-wallet-state.js)** ·196 — WEB2.0 module.
    - exposes: `W2CW`
    - uses shared: `API_CONFIG`, `Web2Escape`, `Web2Format`
    - funcs (11): cacheDom, debounce, escapeHtml, fmtDate, fmtTime, fmtVnd, jsonFetch, normPhone, notify, searchNormalize, stripDiacritics

### web2/customers — WEB2.0 module — Kho KH warehouse (web2_customers). warehouse riêng.

- **[customers-api.js](../../web2/customers/js/customers-api.js)** ·105 — WEB2.0 module — Kho KH warehouse (web2_customers). warehouse riêng.
    - exposes: `CustomersApi`
    - uses shared: `Web2Auth`
    - funcs (10): \_authHeaders, \_fetch, \_qs, create, list, lookupDeep, merge, remove, update, upsert
- **[customers-app.js](../../web2/customers/js/customers-app.js)** ·110 — WEB2.0 module — Kho KH warehouse UI. warehouse riêng.
    - uses shared: `Web2Optimistic`, `Web2Skeleton`, `Web2SSE`
    - funcs (4): init, load, scheduleReload, subscribeSse
- **[customers-detail.js](../../web2/customers/js/customers-detail.js)** ·378 — WEB2.0 module — Kho KH warehouse detail/edit (modal + SĐT/địa chỉ phụ + status + merge). warehouse riêng.
    - uses shared: `Popup`, `Web2AuditLog`, `Web2CustomerDetailModal`, `Web2HistoryTimeline`, `Web2QrModal`, `Web2UserInfo`, `Web2VnAddress`
    - funcs (15): addAltAddress, addAltPhone, closeModal, collectForm, doMerge, exportCsv, g, onAction, openModal, renderAltAddresses, renderAltPhones, saveModal, setPrimaryAltAddr, setPrimaryAltPhone, v
- **[customers-events.js](../../web2/customers/js/customers-events.js)** ·380 — WEB2.0 module — Kho KH warehouse events (search/filter/sort/paginate wiring + Pancake fallback). warehouse riêng.
    - uses shared: `Web2Chat`, `Web2UserInfo`
    - funcs (8): \_getPageIds, \_importPancakeConv, \_searchPancake, addPancakeToKho, bind, finishImported, hidePancakeResults, runPancakeFallback
- **[customers-render.js](../../web2/customers/js/customers-render.js)** ·136 — WEB2.0 module — Kho KH warehouse render (list/pagination/cards). warehouse riêng.
    - uses shared: `Web2WalletBalance`
    - funcs (5): fbBadges, mk, renderPagination, renderPancakeCards, renderTable
- **[customers-state.js](../../web2/customers/js/customers-state.js)** ·81 — WEB2.0 module — Kho KH warehouse state/constants/utils. warehouse riêng.
    - uses shared: `Web2Escape`, `Web2Optimistic`
    - funcs (5): $, esc, fmtMoney, normPhone, notify

### web2/fastsaleorder-delivery

- **[dlv-app.js](../../web2/fastsaleorder-delivery/dlv-app.js)** ·284
    - exposes: `DlvApp`
    - uses shared: `Popup`, `Web2AiPageRegistry`, `Web2AuditLog`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Format`, `Web2Optimistic`, `Web2Skeleton`, `Web2SSE`
    - funcs (27): $, apply, applyFilters, badge, cancel, changeState, clearFilters, deliver, detail, escapeHtml, fmtDate, goPage, init, load, notify, onSuccess, openHistory, renderCounters, renderPagination, renderRows, return\_, rollback, run, ship, snapshot, w2pAlert, w2pConfirm

### web2/fastsaleorder-invoice — WEB2.0 module.

- **[pbh-actions.js](../../web2/fastsaleorder-invoice/pbh-actions.js)** ·336 — WEB2.0 module.
    - exposes: `PbhActions`
    - uses shared: `Web2Bill`, `Web2Optimistic`
    - funcs (18): \_findPbhRow, apply, bulkAction, bulkMerge, bulkPrint, cancelOrder, confirmOrder, createDelivery, createRefund, exportCsv, getSelectedNumbers, load, onSuccess, printOrder, rollback, run, snapshot, updateBulkBar
- **[pbh-api.js](../../web2/fastsaleorder-invoice/pbh-api.js)** ·64 — WEB2.0 module.
    - exposes: `PbhApi`
    - uses shared: `Web2Auth`, `Web2Skeleton`
    - funcs (3): \_authHeaders, \_fetch, load
- **[pbh-app.js](../../web2/fastsaleorder-invoice/pbh-app.js)** ·131 — WEB2.0 module.
    - exposes: `PbhApp`
    - uses shared: `Web2SSE`
    - funcs (3): \_loadAndRenderScopeBanner, init, reload
- **[pbh-filters.js](../../web2/fastsaleorder-invoice/pbh-filters.js)** ·90 — WEB2.0 module.
    - exposes: `PbhFilters`
    - funcs (9): applyFilters, clearCustomerFilter, clearFilters, filterByCustomer, getSelectedNumbers, goPage, load, unselectAll, updateBulkBar
- **[pbh-render.js](../../web2/fastsaleorder-invoice/pbh-render.js)** ·431 — WEB2.0 module.
    - exposes: `PbhRender`
    - funcs (10): detail, injectHistoryCss, onclick, openCustomer, openHistory, renderCounters, renderCustomerChip, renderPagination, renderRow, renderRows
- **[pbh-state.js](../../web2/fastsaleorder-invoice/pbh-state.js)** ·89 — WEB2.0 module.
    - exposes: `PbhState`
    - uses shared: `Popup`, `API_CONFIG`
    - funcs (10): $, escapeHtml, fmtDate, fmtMoney, notify, stateBadge, tbody, w2pAlert, w2pConfirm, w2pPrompt

### web2/fastsaleorder-refund

- **[rf-app.js](../../web2/fastsaleorder-refund/rf-app.js)** ·291
    - exposes: `RfApp`
    - uses shared: `Popup`, `Web2AiPageRegistry`, `Web2AuditLog`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Format`, `Web2Optimistic`, `Web2Skeleton`, `Web2SSE`, `Web2UserInfo`
    - funcs (28): $, \_by, apply, applyFilters, approve, badge, cancel, changeState, clearFilters, complete, detail, escapeHtml, fmtDate, fmtMoney, goPage, init, load, notify, onSuccess, openHistory, renderCounters, renderPagination, renderRows, rollback, run, snapshot, w2pAlert, w2pConfirm

### web2/fb-ads-stats — WEB2.0 — Sổ quảng cáo NHẬP TAY: gắn bài/đợt live + tiền QC + số đơn → tổng hợp ngày/tuần/tháng.

- **[fb-ads-manual.js](../../web2/fb-ads-stats/js/fb-ads-manual.js)** ·348 — WEB2.0 — Sổ quảng cáo NHẬP TAY: gắn bài/đợt live + tiền QC + số đơn → tổng hợp ngày/tuần/tháng.
    - exposes: `FBAdsManual`
    - uses shared: `Popup`, `Web2Auth`, `FBPostsApi`
    - funcs (23): Api, agg, badge, card, close, del, esc, filtered, fmtDay, isoWeek, load, money, mount, n, notify, onclick, openModal, pageName, periodKey, pickPost, render, rowHtml, wire
- **[fb-ads-stats.js](../../web2/fb-ads-stats/js/fb-ads-stats.js)** ·298 — WEB2.0 — Thống kê quảng cáo FB: ad account insights + campaign breakdown.
    - uses shared: `FBPostsApi`, `Web2Sidebar`, `Web2Skeleton`
    - funcs (17): $, Api, actionsHtml, box, card, dec, esc, init, load, loadAuto, money, nfmt, onclick, render, selectorHtml, switchMode, wireSelector

### web2/fb-insights — WEB2.0 — Thống kê tương tác FB: tính từ bài đăng (like/cmt/share) + follower.

- **[fb-insights.js](../../web2/fb-insights/js/fb-insights.js)** ·349 — WEB2.0 — Thống kê tương tác FB: tính từ bài đăng (like/cmt/share) + follower.
    - exposes: `Web2FbInsightsData`
    - uses shared: `Web2AiPageRegistry`, `FBPostsApi`, `Web2Sidebar`, `Web2Skeleton`
    - funcs (17): $, Api, bar, card, dowVN, esc, fmtDate, hourVN, init, load, nfmt, pageSelectorHtml, parseTs, render, topRow, typeLabel, wirePageSelector

### web2/fb-posts — WEB2.0 — Đăng bài FB: orchestrator (sidebar, tabs, kết nối FB, SSE, trạng thái).

- **[fb-posts-app.js](../../web2/fb-posts/js/fb-posts-app.js)** ·272 — WEB2.0 — Đăng bài FB: orchestrator (sidebar, tabs, kết nối FB, SSE, trạng thái).
    - exposes: `FBPosts`
    - uses shared: `Popup`, `FBPostsApi`, `Web2Sidebar`, `Web2SSE`
    - funcs (12): Api, close, esc, init, loadStatus, notify, onclick, openConnect, renderActive, renderPill, setupSSE, switchTab
- **[fb-posts-composer.js](../../web2/fb-posts/js/fb-posts-composer.js)** ·512 — WEB2.0 — Đăng bài FB: soạn bài (page chips + AI caption + media + lịch + đăng).
    - exposes: `FBPostsComposer`
    - uses shared: `Popup`, `Web2Auth`, `FBPostsApi`, `Web2FbPostPreview`, `Web2FbShare`, `Web2ImagePaste`, `Web2ProductPicker`
    - funcs (24): Api, Media, S, confirmDo, defaultSchedule, esc, gather, generate, imgOf, loadDraft, maybeConsumeShare, notify, onConfirm, openKhoPicker, openPreview, pageChipsHtml, product, publish, render, renderProductChips, resetForm, saveDraft, toProd, wire
- **[fb-posts-drafts.js](../../web2/fb-posts/js/fb-posts-drafts.js)** ·189 — WEB2.0 — Đăng bài FB: Lịch & Nháp (agenda theo ngày, sửa/đăng/xoá).
    - exposes: `FBPostsDrafts`
    - uses shared: `Popup`, `Web2AuditLog`, `FBPostsApi`, `Web2Skeleton`
    - funcs (12): Api, S, dayKey, del, esc, load, notify, openHistory, pageNames, render, rowHtml, timeOf
- **[fb-posts-list.js](../../web2/fb-posts/js/fb-posts-list.js)** ·413 — WEB2.0 — Đăng bài FB: quản lý bài viết (liệt kê đã đăng + đã lên lịch, xoá).
    - exposes: `FBPostsList`
    - uses shared: `Popup`, `Web2AuditLog`, `FBPostsApi`
    - funcs (18): Api, S, del, editCaption, esc, fmt, load, loadMore, notify, openHistory, openViewer, postRowHtml, render, renderPostsList, setupInfinite, typeBadge, wireFilterChips, wireRows
- **[fb-posts-media.js](../../web2/fb-posts/js/fb-posts-media.js)** ·201 — WEB2.0 — Đăng bài FB: media picker (URL / upload imgbb / Kho SP).
    - exposes: `FBPostsMedia`
    - uses shared: `FBPostsApi`, `Web2ProductsCache`
    - funcs (17): Api, add, clear, draw, esc, fileToDataUrl, getMedia, handleFiles, imgOf, mountGrid, notify, onload, openProductPicker, promptUrl, removeAt, render, setMedia

### web2/goods-weight — WEB2.0 — Cân nặng hàng khi về kiện.

- **[goods-weight.js](../../web2/goods-weight/js/goods-weight.js)** ·445 — WEB2.0 — Cân nặng hàng khi về kiện.
    - uses shared: `Popup`, `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2ImageLightbox`, `Web2SSE`
    - funcs (34): $, \_auth, addDays, api, boot, clearPhoto, compress, dayLabel, del, esc, fillUserOptions, fmtInt, fmtKg, fmtTime, icons, isAdmin, load, loadReport, money, onPhoto, onerror, onload, render, renderReport, save, setPreset, setupReport, setupSSE, showTab, tickClock, toast, todayHCM, token, username

### web2/jt-tracking — WEB2.0 module.

- **[jt-tracking-actions.js](../../web2/jt-tracking/js/jt-tracking-actions.js)** ·361 — WEB2.0 module.
    - exposes: `JtTrackingActions`
    - uses shared: `Web2Chat`, `Web2Optimistic`
    - funcs (15): apply, autoRefreshActive, getPancakePageIds, quickAdd, refreshAll, resolvePancakeConv, rollback, rowAction, run, scanHistory, scanZalo, setBusy, startAutoRefresh, tagPancake, tick
- **[jt-tracking-api.js](../../web2/jt-tracking/js/jt-tracking-api.js)** ·65 — WEB2.0 module.
    - exposes: `JtTrackingApi`
    - uses shared: `Web2Auth`
    - funcs (5): AUTHH, api, fmtAbs, g, relTime
- **[jt-tracking-app.js](../../web2/jt-tracking/js/jt-tracking-app.js)** ·146 — WEB2.0 — Tra cứu vận đơn J&T (orchestrator).
    - exposes: `JtTrackingApp`
    - uses shared: `Web2AuditLog`, `Web2Sidebar`, `Web2Skeleton`, `Web2SSE`
    - funcs (3): debounce, init, load
- **[jt-tracking-constants.js](../../web2/jt-tracking/js/jt-tracking-constants.js)** ·116 — WEB2.0 module.
    - exposes: `JtTrackingConst`
    - uses shared: `API_CONFIG`
    - funcs (5): $, ST, esc, icons, notify
- **[jt-tracking-modals.js](../../web2/jt-tracking/js/jt-tracking-modals.js)** ·233 — WEB2.0 module.
    - exposes: `JtTrackingModals`
    - uses shared: `Web2CustomerChat`, `Web2Zalo`
    - funcs (9): bring, close, done, findMessageInChat, jtConfirm, onReady, openChat, openMsgModal, openPasteModal
- **[jt-tracking-render.js](../../web2/jt-tracking/js/jt-tracking-render.js)** ·285 — WEB2.0 module.
    - exposes: `JtTrackingRender`
    - funcs (15): approvedTag, close, copyText, deriveFromDesc, fallbackCopy, fmtDesc, fmtSrcMsg, ok, onEsc, openTimeline, parseOrderInfo, renderKpi, renderList, rowHtml, timelineHtml
- **[jt-tracking-state.js](../../web2/jt-tracking/js/jt-tracking-state.js)** ·125 — WEB2.0 module.
    - exposes: `JtTrackingState`
    - funcs (11): \_persistTag, \_saveTagged, destroyLottie, getGroupConvId, loadBcTags, loadTagged, markTagged, playLottie, setGroupConvId, setTagButtons, unmarkTagged

### web2/kpi — WEB2.0 module.

- **[kpi-assignments.js](../../web2/kpi/js/kpi-assignments.js)** ·435 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Format`, `Web2SSE`, `Web2UserInfo`
    - funcs (20): $, authToken, escapeHtml, fmtDate, init, loadCampaigns, loadHistory, loadRanges, loadTotalOrders, loadUsers, notify, onAddRow, onCampaignChange, onSave, renderCampaignDropdown, renderHistory, renderRangesTable, renderStats, validateRanges, wireRowEvents
- **[kpi-dashboard.js](../../web2/kpi/js/kpi-dashboard.js)** ·248 — WEB2.0 module.
    - exposes: `Web2KpiData`
    - uses shared: `Web2AiPageRegistry`, `Web2AuditLog`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Kpi`, `Web2SSE`
    - funcs (11): $, \_authHeaders, escapeHtml, fmtVnd, init, loadCampaigns, loadKpi, refresh, renderAuditLog, renderCampaignDropdown, renderLeaderboard

### web2/live-control — WEB2.0 — Điều khiển TV livestream (user2): gắn SP vào chiến dịch + nhập số NCC báo (pending_qty).

- **[live-control.js](../../web2/live-control/js/live-control.js)** ⚠️1085 — WEB2.0 — Điều khiển TV livestream (user2): gắn SP vào chiến dịch + nhập số NCC báo (pending_qty).
    - uses shared: `Popup`, `Web2AuditLog`, `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2Campaign`, `Web2Escape`, `Web2LiveTvDisplay`, `Web2Perm`, `Web2ProductsApi`, `Web2Sidebar`, `Web2Skeleton`, `Web2SSE`, `Web2UserInfo`, `Web2VariantGroup`
    - funcs (44): $, add, addGroup, applyRegionFilter, applyTvControlSse, boot, cartAvatarUrl, cartRowHtml, close, createCampaign, flatCodes, goTvPage, groupByKey, groupHtml, isAdmin, loadBoard, loadCampaigns, loadPicker, loadTvControl, miniCardHtml, normRegion, onBoardOp, onEsc, onLayoutInput, onSse, openCartDetail, openHistory, pickerItemHtml, refreshPickerAddedFlags, regionChipsHtml, regionOptions, renderBoard, renderPicker, renderTvCtl, savePending, saveTvControl, scheduleBoard, selectCampaign, setTvLayout, setTvRegion, toast, tvPaginate, vrowHtml, wire

### web2/live-tv — WEB2.0 — TV livestream board (user1 xem). Realtime, read-only.

- **[live-tv.js](../../web2/live-tv/js/live-tv.js)** ·424 — WEB2.0 — TV livestream board (user1 xem). Realtime, read-only.
    - uses shared: `Web2Campaign`, `Web2Escape`, `Web2ImageLightbox`, `Web2LiveTvDisplay`, `Web2Skeleton`, `Web2SSE`, `Web2VariantGroup`
    - funcs (18): $, animatePage, applyControl, boot, cardHtml, fmtTime, hasToken, loadControl, onSse, openPicker, reload, render, scheduleReload, setCampaign, setPageInd, showEmpty, variantRowHtml, wire

### web2/modules-manifest.js — Re-run script after adding/removing web2/\* pages.

- **[modules-manifest.js](../../web2/modules-manifest.js)** ·26 — Re-run script after adding/removing web2/\* pages.
    - exposes: `WEB2_MODULES_MANIFEST`

### web2/multi-tool — WEB2.0 — trang Đa dụng: tab tiện ích nội bộ. Tab "Tăng comment" = reply_comment qua Web2Chat (như Pancake gõ+Enter).

- **[multi-tool.js](../../web2/multi-tool/js/multi-tool.js)** ·675 — WEB2.0 — trang Đa dụng: tab tiện ích nội bộ. Tab "Tăng comment" = reply_comment qua Web2Chat (như Pancake gõ+Enter).
    - uses shared: `Web2Auth`, `Web2Chat`, `Web2Escape`, `Web2Sidebar`, `Web2Skeleton`, `Web2SSE`
    - funcs (37): $, BOOST_API, authHeaders, cleanConv, esc, flushMarks, fmtDate, init, isComment, loadConvs, loadJobs, loadPages, loadPosts, logLine, markBoost, markBoostIds, nextIdx, norm, notify, onchange, optHtml, parseTs, randText, renderJobs, run, runBackground, samePost, scheduleJobsReload, setStat, sleep, stopJob, updateHint, updatePostCount, waitWeb2Chat, wireTabs, worker, workerBase

### web2/order-tags — WEB2.0 module.

- **[order-tags-app.js](../../web2/order-tags/js/order-tags-app.js)** ·602 — WEB2.0 module.
    - exposes: `Web2OrderTagsApp`
    - uses shared: `Popup`, `Web2AiPageRegistry`, `Web2AuditLog`, `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2OrderTagPill`, `Web2Sidebar`, `Web2Skeleton`, `Web2SSE`
    - funcs (35): $, allIconNames, apiGet, apiSend, authHeaders, closeModal, esc, fillForm, groupedTriggers, icons, init, load, loadTriggers, notify, openCreate, openEdit, openHistory, openModal, pill, readForm, removeTag, renderCards, renderIconGrid, renderIconPreview, renderSwatches, renderTriggerReference, renderTriggerSelect, saveModal, setupIconPicker, subscribeSSE, toKebab, toggleTag, updatePreview, usedTriggers, wire

### web2/overview — WEB2.0 module — trang giới thiệu (landing) Web 2.0, phong cách Framer.

- **[overview.js](../../web2/overview/overview.js)** ·610 — WEB2.0 module — trang giới thiệu (landing) Web 2.0, phong cách Framer.
    - uses shared: `Web2Auth`, `Web2UserProfile`
    - funcs (19): apply, boot, countUp, esc, firstAccessiblePage, isAdmin, magnetic, navState, observeRise, onScroll, renderAccount, renderEnterButton, renderModules, renderStats, resolveHref, run, step, visibleGroups, wireFilters

### web2/pancake-settings — WEB2.0 module.

- **[pancake-settings-actions.js](../../web2/pancake-settings/js/pancake-settings-actions.js)** ·609 — WEB2.0 module.
    - uses shared: `Popup`, `Web2Chat`, `Web2Optimistic`, `Web2PancakeAccounts`, `Web2PancakeToken`
    - funcs (26): addAccountAuto, addAccountFromInput, apply, clearJwt, clearPageTokens, closeCredsModal, closeExpiryModal, credsDelete, credsSave, deleteAccount, doAutoFetch, generateAll, nuke, onSuccess, openCredsModal, openExpiryModal, renewAccount, rollback, run, runMonitor, saveJwt, testJwt, toggleAddPanel, useAccount, wireCredsModal, wireModal
- **[pancake-settings-api.js](../../web2/pancake-settings/js/pancake-settings-api.js)** ·271 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Chat`, `Web2PancakeAccounts`, `Web2Skeleton`
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

- **[payment-confirm-app.js](../../web2/payment-confirm/js/payment-confirm-app.js)** ·403 — Web 2.0 — Trang "Xác nhận Chuyển Khoản"
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Format`, `Web2HistoryTimeline`, `Web2Optimistic`, `Web2Sidebar`, `Web2SSE`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (28): apply, authHeaders, bindActions, doAction, esc, fetchSignals, fetchUnread, fmtMoney, fmtTime, historyHtml, init, linkOrder, looksLikePaymentMsg, normalize, onchange, onclick, orderLink, reload, reloadNow, reloadUnread, renderSignals, renderUnread, rollback, run, switchTab, toast, updateCounts, userBody

### web2/photo-studio — WEB2.0 module.

- **[photo-studio-bg.js](../../web2/photo-studio/photo-studio-bg.js)** ·447 — WEB2.0 module.
    - exposes: `PS`
    - uses shared: `Web2Auth`
    - funcs (23): applyPickMask, authHeaders, cloudCutout, composeAI, getSam, getUpscaler, initLegacySeg, initSegmentation, lanczos2x, loadImgly, loadScript, localCutout, locateFile, maskToAlpha, onSegResults, onTasksResult, onerror, onload, populateMaskC, runSamDecode, samEmbed, segInputFrame, upscaleCanvas
- **[photo-studio-bgpicker.js](../../web2/photo-studio/photo-studio-bgpicker.js)** ·286 — WEB2.0 module.
    - exposes: `PS`
    - funcs (14): applyActiveBg, bgRowHTML, chipKey, deleteSavedBg, loadSavedBgs, onBgChip, onerror, onload, persistSavedBgs, renderBgRows, saveSavedBg, sceneFull, sceneThumb, selectBg
- **[photo-studio-canvas.js](../../web2/photo-studio/photo-studio-canvas.js)** ·202 — WEB2.0 module.
    - exposes: `PS`
    - funcs (14): blobToImage, buildSilhouette, canvasToBlob, drawBg, drawCover, drawLogo, drawPreset, drawShadow, fileToImage, imgToCanvas, keyOut, loadImageSrc, onerror, onload
- **[photo-studio-edit.js](../../web2/photo-studio/photo-studio-edit.js)** ⚠️806 — WEB2.0 module.
    - exposes: `PS`
    - uses shared: `Web2FbShare`
    - funcs (29): addPickPoint, backToCamera, batchCutout, bindReviewGestures, capture, downloadBatchZip, enterPickMode, exitPickMode, extractPickedObject, finishBrush, freshAiMask, makeCutout, moveCursor, onBatchFiles, paintBrush, pickPointFromEvent, processOne, ratio, renderPick, renderReview, saveBlob, saveReview, schedule, setBrushMode, setPickUI, shareReviewToFb, showReview, undoPickPoint, up
- **[photo-studio-state.js](../../web2/photo-studio/photo-studio-state.js)** ·215 — WEB2.0 module.
    - exposes: `PS`
    - funcs (18): activate, browserName, captureSize, clamp, cropRect, currentSourceEl, hexToRgb, hideLoading, isIOS, isMobile, notify, recomputeSizes, relucide, rgbToHex, showLoading, sizeCanvas, stamp, tickFps
- **[photo-studio-ui.js](../../web2/photo-studio/photo-studio-ui.js)** ·748 — WEB2.0 module.
    - exposes: `PS`
    - uses shared: `Web2ImagePaste`
    - funcs (38): applyLogoDataUrl, applyMirrorClass, applyMobileDefaults, autoStartIfAllowed, bind, bindSlider, cache, cameraErrorMsg, closeSheet, frame, id, loadLogo, onBgFile, onLogoFile, onSourceFile, onchange, onerror, onload, openSheet, permissionStepsHTML, renderChroma, renderPassthrough, revokeSourceImgUrl, sampleKeyFromStage, setMode, showOriginal, showPermissionHelp, showStageError, startCamera, startLoop, stopAll, stopLoop, stopStream, switchCamera, syncMirrorToFacing, toggleCamera, updateHqHint, waitForVideo
- **[photo-studio.js](../../web2/photo-studio/photo-studio.js)** ·59 — WEB2.0 module.
    - exposes: `PS`, `PhotoStudio`
    - funcs (1): init
- **[sw.js](../../web2/photo-studio/sw.js)** ·77 — WEB2.0 module.

### web2/product-card — WEB2.0 module.

- **[product-card-render.js](../../web2/product-card/js/product-card-render.js)** ·439 — WEB2.0 module.
    - exposes: `Web2ProductCard`
    - funcs (15): \_alpha, \_footer, \_placeholder, \_renderBottomBar, \_renderFrame, \_renderSideText, drawContain, drawCover, fmtPrice, loadImage, onerror, onload, render, roundRect, wrapText
- **[product-card.js](../../web2/product-card/js/product-card.js)** ·516 — WEB2.0 module.
    - exposes: `ProductCardPage`
    - uses shared: `Web2BgScene`, `Web2Escape`, `Web2FbShare`, `Web2HtmlSkill`, `Web2ImageEditor`, `Web2LogoEraser`, `Web2ProductsCache`, `Web2QR`
    - funcs (25): $, \_fitPreview, bindField, close, copyPng, doRender, esc, exportPng, fit, init, injectImg, loadProductImage, notify, onDelta, onload, openAiLayout, pickProduct, renderPickers, run, scheduleRender, setImage, setQr, setReady, shareToFb, wireProductPicker

### web2/product-counter — WEB2.0 module.

- **[product-counter.js](../../web2/product-counter/js/product-counter.js)** ·63 — WEB2.0 module.
    - exposes: `ProductCounterPage`
    - uses shared: `Web2ProductCounter`
    - funcs (5): \_bindLifecycle, \_stop, init, onCount, stopCam

### web2/product-types — WEB2.0 module.

- **[web2-product-types-api.js](../../web2/product-types/js/web2-product-types-api.js)** ·77 — WEB2.0 module.
    - exposes: `Web2ProductTypesApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (7): \_fetchJson, \_w2Auth, create, health, list, remove, update
- **[web2-product-types-app.js](../../web2/product-types/js/web2-product-types-app.js)** ·392 — WEB2.0 module.
    - exposes: `Web2ProductTypesApp`
    - uses shared: `Popup`, `Web2Escape`, `Web2Optimistic`, `Web2ProductTypesCache`, `Web2Skeleton`, `Web2SSE`
    - funcs (23): $, \_reenable, apply, applyFilters, closeModal, counter, escapeHtml, init, load, modal, notify, onSuccess, openCreate, openEdit, remove, renderCounters, renderRows, rollback, run, saveModal, snapshot, tbody, toggleActive

### web2/products — WEB2.0 module.

- **[web2-product-detail.js](../../web2/products/js/web2-product-detail.js)** ·642 — WEB2.0 module.
    - exposes: `Web2ProductDetail`
    - uses shared: `Web2Auth`, `Web2Escape`, `Web2NumberInput`, `Web2ProductsApi`, `Web2UserInfo`
    - funcs (30): \_activateTab, \_ensureWired, \_histEntryHtml, \_pane, \_renderEdit, \_renderHistory, \_renderOrders, \_renderOverview, \_renderTab, \_saveEdit, \_setBadge, \_shellHtml, \_wireRowClick, api, app, close, cssEscape, done, esc, fmt, fmtTime, fmtVnd, icons, notify, open, originHint, proxyBase, safeImg, val, valNum
- **[web2-products-actions.js](../../web2/products/js/web2-products-actions.js)** ·154 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `Popup`, `Web2Optimistic`, `Web2ProductsApi`, `Web2ProductsCache`
    - funcs (10): \_doRemove, apply, copyCode, onSuccess, printBarcode, remove, rollback, run, snapshot, toggleActive
- **[web2-products-app.js](../../web2/products/js/web2-products-app.js)** ·361 — WEB2.0 module.
    - exposes: `Web2ProductsApp`
    - uses shared: `Web2Deeplink`, `Web2Effects`, `Web2Import`, `Web2ProductsCache`, `Web2SSE`, `Web2SuppliersCache`, `Web2UnitReprint`, `Web2VariantsCache`
    - funcs (10): \_handleDeeplink, \_requiredBlur, \_setupSse, autoRegen, debouncedFullLoad, getProduct, getUsage, init, onResult, refreshUsageOnly
- **[web2-products-filters.js](../../web2/products/js/web2-products-filters.js)** ·57 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - funcs (4): \_parseActiveFilter, applyFilters, clearFilters, goPage
- **[web2-products-modal.js](../../web2/products/js/web2-products-modal.js)** ·776 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `Web2Auth`, `Web2Import`, `Web2NumberInput`, `Web2Optimistic`, `Web2ProductCode`, `Web2ProductTypesCache`, `Web2ProductsApi`, `Web2ProductsCache`, `Web2VariantMulti`, `Web2VariantsCache`
    - funcs (19): \_commitProductImport, \_productImportConfig, \_saveModalImpl, apply, closeModal, fmt, onDone, onSuccess, openCreate, openEdit, openHistory, populateSupplierDropdown, renderHistEntry, rollback, run, saveModal, snapshot, suggestProductCode, updateImagePreview
- **[web2-products-print-barcode.js](../../web2/products/js/web2-products-print-barcode.js)** ·98 — WEB2.0 module.
    - exposes: `W2PP`
    - uses shared: `API_CONFIG`
    - funcs (6): \_markProductsPrinted, genQrDataUrl, loadJsBarcode, loadQrLib, onerror, onload
- **[web2-products-print-modal.js](../../web2/products/js/web2-products-print-modal.js)** ·610 — WEB2.0 module.
    - exposes: `W2PP`
    - uses shared: `Web2Printer`, `Web2QR`
    - funcs (11): $, closeModal, closePrint, generateAndPrint, onclick, open, renderTableRows, showPrintOverlay, showSelectionModal, updateCount, updateSelectAllState
- **[web2-products-print-render.js](../../web2/products/js/web2-products-print-render.js)** ·533 — WEB2.0 module.
    - exposes: `W2PP`
    - funcs (9): buildLabelHTML, draw, fitName, fitText, init, lh, lines, tooTall, tooWide
- **[web2-products-print-utils.js](../../web2/products/js/web2-products-print-utils.js)** ·186 — WEB2.0 module.
    - exposes: `W2PP`
    - uses shared: `Web2Auth`, `Web2Escape`
    - funcs (6): \_qrKey, \_w2Auth, escapeHtml, formatPrice, notify, stripBrackets
- **[web2-products-print.js](../../web2/products/js/web2-products-print.js)** ·26 — WEB2.0 module.
    - exposes: `Web2ProductsPrint`
- **[web2-products-render.js](../../web2/products/js/web2-products-render.js)** ·729 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `Web2ProductGroup`, `Web2ProductUnits`, `Web2ProductsApi`, `Web2ProductsCache`, `Web2Skeleton`, `Web2VariantGroup`
    - funcs (25): \_attachUnitsForPrint, \_bulkPrint, \_childPanelHtml, \_childRowHtml, \_clearSelection, \_loadUsageForCurrentPage, \_parentDisplayCode, \_parentRowHtml, \_rowActionsHtml, \_rowHtml, \_selectAllVisible, \_statusBadgeHtml, \_toggleSelect, \_updateBulkBar, \_updateRowInPlace, \_updateRowsBatch, \_updateSelectAllState, firstIdx, load, onDocClick, openUsagePopover, renderCounters, renderPagination, renderRows, renderUsageBadge
- **[web2-products-state.js](../../web2/products/js/web2-products-state.js)** ·180 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `API_CONFIG`, `Web2Escape`, `Web2ProductCode`, `Web2ProductsApi`, `Web2SuppliersCache`, `Web2VariantsCache`
    - funcs (17): $, \_suppliersLoadPromise, collectExistingSuppliers, counter, cssEscape, escJs, escapeHtml, fmtPrice, getColorShortMap, loadSuppliersFromSoOrder, modal, notify, originPriceHover, pag, safeImageUrl, searchCount, tbody
- **[web2-products-variant-picker.js](../../web2/products/js/web2-products-variant-picker.js)** ·346 — WEB2.0 module.
    - exposes: `Web2ProductsCore`
    - uses shared: `Web2ProductCode`, `Web2ProductTypesCache`, `Web2ProductsApi`, `Web2ProductsCache`, `Web2VariantMulti`, `Web2VariantsCache`
    - funcs (16): \_bulkCreateVariants, \_combinedVariant, \_genNameFromSelection, \_getSelectedCategory, \_isSizeGroup, \_maybeAutofillName, \_renderCombinedHint, \_renderTypeChips, \_renderVariantMultiPreview, \_setSelectedCategory, \_setVariantPickers, \_show, \_variantKind, \_wireVariantPicker, \_wireVariantPickerFor, split

### web2/purchase-refund — WEB2.0 module.

- **[purchase-refund-actions.js](../../web2/purchase-refund/js/purchase-refund-actions.js)** ·526 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Popup`, `Web2NumberInput`, `Web2ProductsCache`
    - funcs (13): \_collectBulkLines, closeBulkRefund, closeQuickRefund, handleAction, openBulkRefund, openQuickRefund, renderBulkRows, submitBulkRefund, submitQuickRefund, updateBulkTotal, updateQuickTotal, wireBulkModal, wireQuickModal
- **[purchase-refund-api.js](../../web2/purchase-refund/js/purchase-refund-api.js)** ·263 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Web2Auth`, `Web2IdbStore`, `Web2ProductsCache`, `Web2Skeleton`, `Web2SoOrder`
    - funcs (5): \_authHeaders, fetchJson, loadList, loadSoOrderReceivedItems, updateSupplierWallet
- **[purchase-refund-app.js](../../web2/purchase-refund/js/purchase-refund-app.js)** ·112 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Web2Sidebar`, `Web2SSE`
    - funcs (4): init, reloadSource, setupSSE, wireSourceList
- **[purchase-refund-modal.js](../../web2/purchase-refund/js/purchase-refund-modal.js)** ·384 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Web2NumberInput`, `Web2ProductsCache`, `Web2SuppliersCache`
    - funcs (10): \_populateSupplierDatalist, closeModal, closePicker, confirmPicker, handleFormSubmit, openModal, openPicker, renderPicker, updatePickerCount, wirePicker
- **[purchase-refund-render.js](../../web2/purchase-refund/js/purchase-refund-render.js)** ·314 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `Web2HistoryTimeline`, `Web2ProductsCache`, `Web2Skeleton`
    - funcs (6): applyFilters, loadSourceItems, renderDetail, renderList, renderSourceList, selectRefund
- **[purchase-refund-state.js](../../web2/purchase-refund/js/purchase-refund-state.js)** ·275 — WEB2.0 module.
    - exposes: `PurchaseRefund`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2ImageLightbox`, `Web2SoOrderUtils`, `Web2UserInfo`
    - funcs (13): $, \_currentUserInfo, \_orderGroupKey, \_orderGroupLabel, escapeHtml, fmtDate, fmtDateTime, fmtMoney, notify, openImageLightbox, parseProducts, safeImageUrl, thumbHtml

### web2/reconcile — WEB2.0 module.

- **[reconcile-actions.js](../../web2/reconcile/js/reconcile-actions.js)** ·525 — WEB2.0 module.
    - exposes: `RC`
    - uses shared: `Popup`, `Web2UserInfo`
    - funcs (21): bindAuditUi, cancelPack, closeAuditModal, deliverOrder, fetchAudit, fmtTsFull, inputToTs, lockBody, onScannerSubmit, openAuditModal, packOrder, pad2, renderAuditResults, resetPick, returnFailedOrder, selectPbh, shipOrder, syncAuditInputs, toggleManualPick, tsToInput, unlockBody
- **[reconcile-api.js](../../web2/reconcile/js/reconcile-api.js)** ·138 — WEB2.0 module.
    - exposes: `RC`
    - uses shared: `Web2HistoryTimeline`, `Web2SSE`
    - funcs (6): \_scheduleSseDetail, \_scheduleSseList, historyNote, loadHistory, loadList, setupSse
- **[reconcile-app.js](../../web2/reconcile/js/reconcile-app.js)** ·178 — WEB2.0 module.
    - uses shared: `Web2BarcodeScanner`, `Web2HistoryTimeline`, `Web2LabelOcr`
    - funcs (4): bindUi, init, onResult, onScan
- **[reconcile-render.js](../../web2/reconcile/js/reconcile-render.js)** ·292 — WEB2.0 module.
    - exposes: `RC`
    - uses shared: `Web2AuditLog`
    - funcs (5): b, renderActionButtons, renderDetail, renderLine, renderList
- **[reconcile-state.js](../../web2/reconcile/js/reconcile-state.js)** ·169 — WEB2.0 module.
    - exposes: `RC`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2HistoryTimeline`
    - funcs (9): api, escapeHtml, feedback, fmtDateInvoice, fmtMoney, fmtSttDisplay, fmtTs, focusScanner, notify

### web2/returns — WEB2.0 module.

- **[returns-api.js](../../web2/returns/js/returns-api.js)** ·114 — WEB2.0 module.
    - exposes: `Web2ReturnsApi`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2UserInfo`
    - funcs (13): \_json, \_user, \_w2Auth, approve, create, customerOrders, list, pending, remove, searchCustomers, searchProducts, sourceOrder, walletBalance
- **[returns-app.js](../../web2/returns/js/returns-app.js)** ·214 — WEB2.0 module.
    - exposes: `Web2Returns`
    - uses shared: `Web2AuditLog`, `Web2Sidebar`, `Web2SSE`
    - funcs (4): bind, init, openHistory, setupSse
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
- **[returns-order-items.js](../../web2/returns/js/returns-order-items.js)** ·155 — WEB2.0 module.
    - exposes: `ReturnsItems`
    - uses shared: `Web2Skeleton`
    - funcs (6): pickOrder, renderOrderItems, renderOrderSummary, selectedLines, setLineQty, toggleLine
- **[returns-tabs.js](../../web2/returns/js/returns-tabs.js)** ·200 — WEB2.0 module.
    - exposes: `ReturnsTabs`
    - uses shared: `Popup`, `Web2WalletBalance`
    - funcs (8): \_typeLabel, approve, loadList, loadPending, removeReturn, renderList, renderPending, switchTab

### web2/supplier-debt — WEB2.0 module.

- **[supplier-debt-actions.js](../../web2/supplier-debt/js/supplier-debt-actions.js)** ·113 — WEB2.0 module.
    - uses shared: `Web2Auth`, `Web2SupplierPay`
    - funcs (4): confirmNote, onSubmit, openNoteModal, openPayModal
- **[supplier-debt-api.js](../../web2/supplier-debt/js/supplier-debt-api.js)** ·433 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SoOrder`, `Web2UserInfo`
    - funcs (13): aggregate, api, authHeaders, getNoteForRow, loadAll, loadServerState, loadSoOrder, loadWeb2, makeRow, recordPayment, resolveCodeForSupplier, saveSupplier, saveSupplierNote
- **[supplier-debt-app.js](../../web2/supplier-debt/js/supplier-debt-app.js)** ·271 — WEB2.0 module.
    - uses shared: `Web2Deeplink`, `Web2SoOrder`, `Web2SSE`, `Web2SupplierPay`
    - funcs (6): \_onDateChange, \_sseConnect, init, nfc, scheduleReload, wireUi
- **[supplier-debt-filters.js](../../web2/supplier-debt/js/supplier-debt-filters.js)** ·72 — WEB2.0 module.
    - uses shared: `Web2SuppliersCache`
    - funcs (5): \_populateNccNameDatalist, currentMonthRange, pad, readFilters, setDefaultDateRange
- **[supplier-debt-render.js](../../web2/supplier-debt/js/supplier-debt-render.js)** ·524 — WEB2.0 module.
    - uses shared: `Web2AuditLog`, `Web2Deeplink`
    - funcs (15): applyFilterAndRender, buildCongNoEntries, congnoTableHtml, detailPanelHtml, exportCsv, openHistory, purchasesTableHtml, renderPagination, renderTable, renderTotals, toggleExpand, transactionsTableHtml, updateDetailPanel, updateSortIcons, wireDetailTabs
- **[supplier-debt-state.js](../../web2/supplier-debt/js/supplier-debt-state.js)** ·140 — WEB2.0 module.
    - uses shared: `Web2Escape`, `Web2Format`
    - funcs (12): cssAttrEscape, csvEscape, escapeHtml, fmtDateVN, fmtTime, fmtVnd, isBefore, isInPeriod, isoToTs, notify, rateToVnd, vnDate

### web2/supplier-wallet — WEB2.0 module.

- **[supplier-wallet-actions.js](../../web2/supplier-wallet/js/supplier-wallet-actions.js)** ·237 — WEB2.0 module.
    - uses shared: `Web2ProductsApi`, `Web2ProductsCache`, `Web2SupplierPay`, `Web2SuppliersCache`
    - funcs (5): confirmCreate, confirmReturn, openCreateModal, openReturnModal, recalcReturnTotal
- **[supplier-wallet-api.js](../../web2/supplier-wallet/js/supplier-wallet-api.js)** ·162 — WEB2.0 module.
    - funcs (6): aggregateSuppliers, ensure, loadAndRender, mergeAggregation, pollDeposits, pushSync
- **[supplier-wallet-app.js](../../web2/supplier-wallet/js/supplier-wallet-app.js)** ·257 — WEB2.0 module.
    - uses shared: `Web2Deeplink`, `Web2ProductsCache`, `Web2SSE`
    - funcs (5): \_sseConnect, init, nfc, scheduleAggregateReload, wireUi
- **[supplier-wallet-render.js](../../web2/supplier-wallet/js/supplier-wallet-render.js)** ·222 — WEB2.0 module.
    - uses shared: `Web2AuditLog`, `Web2Deeplink`
    - funcs (7): cardHtml, openDetail, openHistory, renderDetailTabs, renderHistory, renderList, renderPurchases
- **[supplier-wallet-state.js](../../web2/supplier-wallet/js/supplier-wallet-state.js)** ·143 — WEB2.0 module.
    - exposes: `SW_DEBUG`
    - uses shared: `Web2Escape`, `Web2Format`, `Web2UserInfo`
    - funcs (9): \_dbg, \_isRowFullyReturned, \_swBy, escapeHtml, fmtDateVN, fmtTime, fmtVnd, notify, rateToVnd
- **[supplier-wallet-storage.js](../../web2/supplier-wallet/js/supplier-wallet-storage.js)** ·437 — WEB2.0 module.
    - exposes: `SupplierWalletStorage`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2IdbStore`, `Web2SoOrder`
    - funcs (21): \_api, \_authHeaders, \_getStore, \_readSoOrderLocal, addTransaction, applyDeposits, cleanupOldTransactions, emptyState, fetchDeposits, flush, getOrCreateWallet, getProcessedSepayIds, init, load, loadCached, loadSoOrderData, matchSupplier, normalize, push, recalcBalance, save

### web2/system — WEB2.0 module.

- **[system-ai-suggestions.js](../../web2/system/js/system-ai-suggestions.js)** ·163 — WEB2.0 module.
    - exposes: `SystemAiSuggestions`
    - uses shared: `Web2AiPageRegistry`
    - funcs (12): $, allEntries, buildToolbar, entryCard, esc, hay, modelLabel, reg, reload, renderList, renderSummary, start
- **[system-app.js](../../web2/system/js/system-app.js)** ·202 — Mount sidebar, điều phối tab (Dịch vụ / Realtime SSE / Các trang), build danh
    - uses shared: `Web2Sidebar`
    - funcs (9): $, \_cleanLabel, \_esc, \_parseLink, activate, buildPages, init, wireReload, wireTabs
- **[system-modules.js](../../web2/system/js/system-modules.js)** ·321 — Tổng hợp TOÀN BỘ module Web 2.0: shared (web2/shared) + trang + backend (Render).
    - exposes: `SystemModules`
    - uses shared: `Popup`
    - funcs (14): $, catLabel, esc, list, load, matchQ, renderAll, renderBackend, renderBody, renderPages, renderShared, renderSummary, renderToolbar, start
- **[system-services.js](../../web2/system/js/system-services.js)** ·606 — Fetch /api/services-overview + render cards (DB + service inventory + process).
    - exposes: `SystemServices`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Skeleton`
    - funcs (29): $, \_ensureModal, \_kvRows, \_scheduleRefresh, \_stopRefresh, \_wireClicks, clearFirstLoadSkeletons, closeModal, escapeHtml, fmtBytes, fmtNumber, fmtV, getData, handler, keyHandler, load, openAllTablesModal, openModal, openServiceModal, openTableModal, renderAll, renderCostSummary, renderDatabases, renderGeminiMachines, renderProcess, renderSepayInvoices, renderServices, showFirstLoadSkeletons, start
- **[system-sse-registry.js](../../web2/system/js/system-sse-registry.js)** ·86 — WEB2.0 module — System/Cấu hình → tab "Realtime (SSE)" → SỔ TAY SSE (registry tĩnh: topic→publisher→subscriber→gap→luật đừng-sửa-hỏng). Nguồn data/web2-sse-regi
    - exposes: `SystemSSERegistry`
    - funcs (4): esc, render, statusClass, topicCard
- **[system-sse.js](../../web2/system/js/system-sse.js)** ·382 — Đọc/hiển thị live SSE activity từ server. Tách từ admin-sse-monitor/js/monitor.js;
    - exposes: `SystemSSE`
    - uses shared: `Popup`, `Web2Auth`, `Web2Skeleton`
    - funcs (21): $, \_scheduleStatsPoll, appendLogRow, authToken, bootstrapLog, esc, fmtTime, isAdmin, matchesFilter, onerror, pollStats, reload, renderLogBody, renderTopics, rerenderAllLogs, setConn, showAccessDenied, start, subscribeLive, tagClass, wireToolbar
- **[system-thirdparty.js](../../web2/system/js/system-thirdparty.js)** ·303 — Tổng hợp TOÀN BỘ dịch vụ / API / thư viện / dự án GitHub / hạ tầng bên thứ 3 dùng
    - exposes: `SystemThirdParty`
    - funcs (14): $, card, catLabel, esc, items, load, matchCost, matchLayer, matchQ, renderAll, renderBody, renderSummary, renderToolbar, start

### web2/unit-scan — WEB2.0 — Quét tem (gộp 2026-06-29): 1 trang 2 CHẾ ĐỘ chung scanner — "Tra/Đóng gói" (resolve 1 món + reprint + sibling + vị trí) & "Chia hàn

- **[unit-scan.js](../../web2/unit-scan/js/unit-scan.js)** ·755 — WEB2.0 — Quét tem (gộp 2026-06-29): 1 trang 2 CHẾ ĐỘ chung scanner — "Tra/Đóng gói" (resolve 1 món + reprint + sibling + vị trí) & "Chia hàng" (9 KỆ/xe + tiến đ
    - uses shared: `Web2BarcodeScanner`, `Web2ProductUnits`, `Web2ShelfMap`, `Web2SSE`
    - funcs (44): $, PU, SM, \_mCard, beep, boot, buildKes, buildScanner, closeSheet, dispatchScan, esc, flash, fmtTime, fmtVnd, go, hideCamRetry, icons, initScanner, initSse, kDone, keOf, loadEvents, loadSiblings, oDone, onScan, onScanSort, openKe, openManifest, parseScan, posLine, refreshKeCard, renderGrid, renderResult, renderStats, reprintUnit, resolve, setMode, showCamRetry, sibRow, sortLoad, toast, toggleTorch, vibe, wireManual

### web2/users — WEB2.0 module.

- **[users-app.js](../../web2/users/js/users-app.js)** ⚠️982 — WEB2.0 module.
    - exposes: `Web2UsersApp`
    - uses shared: `Popup`, `Web2AiPageRegistry`, `Web2AuditLog`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Optimistic`, `Web2Skeleton`, `Web2SSE`, `Web2UserProfile`
    - funcs (38): \_currentSessionUserId, \_reauthSelf, \_sseConnect, api, apply, authToken, bulkCheck, confirmPasswordSave, confirmPermsSave, confirmUserSave, copyUserPassword, deactivateUser, escapeHtml, fillGenPassword, fmtTs, genPassword, handleAction, init, loadAll, notify, onSuccess, openKpiAssignments, openPasswordModal, openPermsModal, openUserHistory, openUserModal, purgeAllInactive, purgeUser, renderList, renderPasswordCell, renderPermsGrid, resetPermsToRoleDefaults, restoreUser, rollback, run, snapshot, userAvatarUrl, wireUi

### web2/variants — Web2 Variants API client — /api/web2/variants/\* qua Cloudflare Worker.

- **[web2-variants-api.js](../../web2/variants/js/web2-variants-api.js)** ·87 — Web2 Variants API client — /api/web2/variants/\* qua Cloudflare Worker.
    - exposes: `Web2VariantsApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (9): \_fetchJson, \_w2Auth, backfillShortCodes, create, health, list, remove, suggestShortCode, update
- **[web2-variants-app.js](../../web2/variants/js/web2-variants-app.js)** ·508 — Kho Biến Thể Web 2.0 — main app: render bảng + CRUD qua modal.
    - exposes: `Web2VariantsApp`
    - uses shared: `Popup`, `Web2Escape`, `Web2Optimistic`, `Web2Skeleton`, `Web2SSE`, `Web2VariantsCache`
    - funcs (25): $, \_reenable, apply, applyFilters, closeModal, counter, escapeHtml, init, load, modal, notify, onSuccess, openCreate, openEdit, remove, renderCounters, renderGroupOptions, renderRows, rollback, run, saveModal, snapshot, suggestShortCode, tbody, toggleActive

### web2/video-beauty — WEB2.0 module.

- **[video-beauty-export.js](../../web2/video-beauty/js/video-beauty-export.js)** ·272 — WEB2.0 module.
    - exposes: `Web2VideoBeautyExport`
    - uses shared: `Web2BeautyFace`
    - funcs (13): R, done, encodeAudio, error, exportRealtime, exportRenderPass, hasWebCodecs, ondataavailable, onended, output, pickMime, seek, step
- **[video-beauty-render.js](../../web2/video-beauty/js/video-beauty-render.js)** ·79 — WEB2.0 module.
    - exposes: `Web2VideoBeautyRender`
    - uses shared: `Web2BeautyFace`, `Web2BeautyFilters`
    - funcs (2): applyFrame, needsSkin
- **[video-beauty.js](../../web2/video-beauty/js/video-beauty.js)** ·327 — WEB2.0 module.
    - exposes: `VideoBeautyPage`
    - uses shared: `Web2BeautyFace`, `Web2BeautyFilters`, `Web2Skeleton`
    - funcs (22): $, \_restoreEmpty, bind, d, doExport, downloadBlob, drawCurrent, fileToVideo, fitView, init, loadFile, notify, pct, playPreview, previewLoop, renderFilters, setProg, setStatus, setupOutputSize, stopPreview, upd, wireSliders

### web2/video-maker — WEB2.0 module.

- **[video-ai-script.js](../../web2/video-maker/js/video-ai-script.js)** ·77 — WEB2.0 module.
    - exposes: `Web2VideoAiScript`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (4): fmtPrice, generate, templateFallback, workerBase
- **[video-anim.js](../../web2/video-maker/js/video-anim.js)** ·156 — WEB2.0 module.
    - exposes: `Web2VideoAnim`
    - funcs (18): clamp, clamp01, cubicBezier, dX, easeInCubic, easeInOutCubic, easeInOutQuad, easeInOutSine, easeInQuad, easeOutBack, easeOutCubic, easeOutQuad, interpolate, linear, sampleX, sampleY, solveX, spring
- **[video-audio.js](../../web2/video-maker/js/video-audio.js)** ·159 — WEB2.0 module.
    - exposes: `Web2VideoAudio`
    - funcs (11): ac, add, bufferToWavBlob, buildMixGraph, decodeFile, downloadWav, karaokeSplit, samplesToBuffer, start, stop, wstr
- **[video-import.js](../../web2/video-maker/js/video-import.js)** ·183 — WEB2.0 module.
    - exposes: `Web2VideoImport`
    - funcs (11): clear, connect, disconnect, draw, el, file, getVolume, isActive, load, onReady, setVolume
- **[video-library.js](../../web2/video-maker/js/video-library.js)** ·743 — WEB2.0 module.
    - exposes: `Web2VideoLibraryUI`
    - uses shared: `Web2Skeleton`
    - funcs (34): $, \_appendProRows, \_appendSharedRows, \_audio, \_buildModal, \_fillLangFilter, \_loadProVoices, \_loadShared, \_onElScroll, \_onProScroll, \_playSamples, \_renderElevenSettings, \_slider, \_stopPreview, \_voiceRow, addEleven, addPiper, addProVoice, addShared, bind, close, esc, init, notify, onerror, open, previewEleven, previewPiper, previewProVoice, render, renderEleven, renderFree, renderPro, restore
- **[video-maker.js](../../web2/video-maker/js/video-maker.js)** ⚠️1616 — WEB2.0 module.
    - exposes: `VideoMakerPage`
    - uses shared: `Web2Escape`, `Web2ImagePaste`, `Web2ProductsCache`, `Web2Translate`, `Web2VideoRender`
    - funcs (73): $, \_assignGlobalCaptions, \_buildStockScenes, \_rand, \_refreshCaptions, \_shuffle, \_stockRatio, \_stopSrc, \_topicFromStock, addImagesFromFiles, addSceneFromUrl, applyCanvasSize, applyLiveVolumes, audioCtx, buildAudioGraph, detail, dims, drawAt, esc, exportVideo, extractCompactWav, fill, fillBulkSelects, findScene, fitPreview, fmtPriceShort, genNarration, genNarrationPerScene, gotoVoiceStep, hasPerSceneNarration, hasTaintedScene, importActive, init, insertAtCursor, loadImage, loadImageCors, loadMusicFile, loop, narrationBuffer, notify, onSelect, onStatus, ondataavailable, oneClickVideo, onended, onerror, onload, pickMime, play, playSample, priceOf, randomGenerate, refit, refresh, renderCues, renderPickers, renderScenes, renderVoices, setMode, setStat …
- **[video-render.js](../../web2/video-maker/js/video-render.js)** ·417 — WEB2.0 module.
    - exposes: `Web2VideoRender`
    - uses shared: `Web2VideoRender`
    - funcs (16): \_chunkCaption, \_drawCaption, \_drawImageMotion, \_drawScene, \_drawText, \_drawTransition, \_filterCss, \_springScale, \_springText, \_wrap, clamp01, drawFrame, easeInOutCubic, easeInOutSine, easeOutCubic, totalDuration
- **[video-scene-editor.js](../../web2/video-maker/js/video-scene-editor.js)** ·89 — WEB2.0 module.
    - exposes: `Web2VideoSceneEditor`
    - uses shared: `Web2VideoRender`
    - funcs (4): \_sel, \_voiceSel, applyDefaults, detailHtml
- **[video-stock.js](../../web2/video-maker/js/video-stock.js)** ·307 — WEB2.0 module.
    - exposes: `Web2VideoStock`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`
    - funcs (12): API, \_updateFoot, close, doSearch, esc, injectCss, open, pick, renderGrid, search, toast, workerBase
- **[video-tts.js](../../web2/video-maker/js/video-tts.js)** ·796 — WEB2.0 module.
    - exposes: `Web2VideoTTS`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Vieneu`
    - funcs (53): \_ELEVEN_BASE, \_PRO_BASE, \_blobB64, \_concat, \_decodeCtx, \_elPost, \_elevenChunk, \_findByProvider, \_getMms, \_getPiper, \_mmsChunk, \_persistLib, \_piperChunk, \_proChunk, \_providerId, \_resample, \_serialize, \_splitSentences, \_vieneuChunk, \_voice, \_w2auth, \_workerBase, addLibraryVoice, addSharedVoice, cancelPreview, downloadPiperVoice, elevenIsolate, elevenSoundEffect, elevenStatus, elevenTranscribe, getElevenSettings, hasVoice, isBrokenVoice, isCueCapable, isPitchCapable, listElevenVoices, listPiperCatalog, listProVoices, listSharedVoices, loadLibraryVoices, piperStored, previewUrlForVoice, proStatus, registerVieneuVoices, removeLibraryVoice, removePiperVoice, samplePreviewUrl, setElevenSettings, speakPreview, stripCues, synthVoiceMeta, synthesize, toAudioBuffer
- **[video-vieneu.js](../../web2/video-maker/js/video-vieneu.js)** ·212 — WEB2.0 module.
    - exposes: `Web2VideoVieneuUI`
    - uses shared: `Web2PosInstaller`, `Web2Vieneu`
    - funcs (10): $, applyRef, connect, init, notify, ondataavailable, onstop, refreshServers, renderServers, setStat

### web2/zalo — WEB2.0 module.

- **[web2-zalo-accounts.js](../../web2/zalo/js/web2-zalo-accounts.js)** ·400 — WEB2.0 module.
    - exposes: `WZApp`
    - uses shared: `Popup`, `Web2Ext`, `ZaloApi`
    - funcs (14): accCardHtml, addPersonal, autoRenewZalo, choiceCardsHtml, closeOaModal, loadAccounts, loginZaloCookie, onAccAction, openOaModal, renderAccounts, renderStatusStrip, saveAddPersonalCookie, saveOa, skelCards
- **[web2-zalo-app.js](../../web2/zalo/js/web2-zalo-app.js)** ·193 — WEB2.0 module — Zalo single-source page app.
    - exposes: `WZApp`
    - uses shared: `Web2SSE`, `Web2ZaloOwner`, `Web2Zalo`
    - funcs (8): bind, focusTab, gridActivate, init, refAcc, refList, subscribeSse, switchTab
- **[web2-zalo-chat.js](../../web2/zalo/js/web2-zalo-chat.js)** ·324 — WEB2.0 module.
    - exposes: `WZApp`
    - uses shared: `Web2Optimistic`, `Web2Skeleton`, `ZaloApi`, `WZChat`
    - funcs (17): \_closeConvMenu, \_convAction, apply, bindConvHead, fillAccountSelect, getForwardTargets, loadConversations, maybeAutoSync, onSuccess, openConvMenu, openConversation, renderConvList, renderInfoPanel, rollback, row, run, syncConversations
- **[web2-zalo-lookup-zns.js](../../web2/zalo/js/web2-zalo-lookup-zns.js)** ·237 — WEB2.0 module.
    - exposes: `WZApp`
    - uses shared: `Web2UserInfo`, `ZaloApi`
    - funcs (8): \_collectZnsData, \_tplParams, doLookup, loadTemplates, loadZnsLog, renderZnsFields, sendZns, showSelf
- **[web2-zalo-notify.js](../../web2/zalo/js/web2-zalo-notify.js)** ·164 — WEB2.0 module — Zalo thông báo tin mới (toast + âm thanh + badge tab + Web Notification).
    - exposes: `WZApp`
    - funcs (11): \_preview, beep, browserNotify, ensurePermission, notify, onclick, setSound, setTabBadge, snapshot, soundOn, totalUnread
- **[web2-zalo-utils.js](../../web2/zalo/js/web2-zalo-utils.js)** ·159 — WEB2.0 module.
    - exposes: `WZApp`
    - funcs (11): $, \_\_wzAvErr, \_trap, avatarHtml, esc, fmtTime, hideModal, initial, notify, setBusy, showModal

### web2/shared — WEB2.0 — MODULE worker: nhận diện khuôn mặt NỀN (không đứng UI).

- **[web2-beauty-face-worker.js](../../web2/shared/beauty/web2-beauty-face-worker.js)** ·57 — WEB2.0 — MODULE worker: nhận diện khuôn mặt NỀN (không đứng UI).
    - funcs (3): getFL, mk, onmessage
- **[web2-beauty-face.js](../../web2/shared/beauty/web2-beauty-face.js)** ·448 — WEB2.0 shared — beauty face landmarks.
    - exposes: `Web2BeautyFace`
    - uses shared: `Web2BeautyFilters`, `WEB2_CONFIG`, `Web2ProductCounter`
    - funcs (24): \_detectMain, \_emit, \_fetchModelBuffer, \_streamFetch, \_streamFetch_fromResponse, \_warmWasm, at, buildAutoBrushes, buildBrushes, detect, detectViaWorker, dist, getFaceWorker, getLandmarker, has, loadVision, midOf, mk, onProgress, onerror, onmessage, progress, ready, warmup
- **[web2-beauty-filters.js](../../web2/shared/beauty/web2-beauty-filters.js)** ·399 — WEB2.0 shared — beauty engine (pure pixel ops).
    - exposes: `Web2BeautyFilters`
    - funcs (16): \_blurSeam, adjustSkinTone, applyBrushBackward, bandFn, beautify, boxBlurFloat, boxBlurH, boxBlurV, buildSkinMask, clamp01, clamp255, rgb2ycbcr, sampleBilinear, smoothSkin, stretchBand, warp
- **[web2-beauty-studio.js](../../web2/shared/beauty/web2-beauty-studio.js)** ·607 — WEB2.0 shared — beauty studio UI.
    - exposes: `Web2BeautyStudio`
    - uses shared: `Web2BeautyFace`, `Web2BeautyFilters`
    - funcs (28): apply, buildWork, cleanup, doApply, drawLegHandles, endDrag, ensureStyles, esc, fit, getWorker, loadImage, notify, onerror, onload, onmessage, open, processImageData, pushHistory, readControls, redraw, reset, resetLegDefaults, runInWorker, setBusy, setWork, showBanner, undo, upd
- **[web2-beauty-worker.js](../../web2/shared/beauty/web2-beauty-worker.js)** ·45 — WEB2.0 — Web Worker xử lý lọc làm đẹp NỀN (không đứng UI).
    - uses shared: `Web2BeautyFilters`
    - funcs (1): onmessage
- **[web2-chat-emoji-data.js](../../web2/shared/chat-panel/web2-chat-emoji-data.js)** ·212 — WEB2.0 — emoji dataset + recent helper cho Web2ChatPanel (tách từ pancake-chat-window).
    - exposes: `Web2ChatEmoji`
    - uses shared: `Web2ChatPanel`
    - funcs (2): pushRecent, readRecent
- **[web2-chat-entity-detect.js](../../web2/shared/chat-panel/web2-chat-entity-detect.js)** ·142 — WEB2.0 — nhận diện SĐT + địa chỉ trong tin nhắn chat (Feature 3).
    - exposes: `Web2ChatEntityDetect`
    - funcs (6): addresses, normalizePhone, phones, push, scan, scanMessages
- **[web2-chat-panel-compose.js](../../web2/shared/chat-panel/web2-chat-panel-compose.js)** ·511 — WEB2.0 module.
    - uses shared: `Web2ChatEmoji`, `Web2ChatEntityDetect`, `Web2ChatPanel`, `Web2ChatStickers`, `Web2ImageLightbox`, `Web2Optimistic`, `Web2QuickReply`
    - funcs (21): apply, attachKind, bindCommon, bindInput, buildCompose, clearAttach, clearReply, doSend, insertEmoji, onClick, onOutsideClick, onSuccess, onload, renderPicker, rollback, run, sendStickerOptimistic, setAttachment, setReply, setSendBusy, togglePicker
- **[web2-chat-panel-render.js](../../web2/shared/chat-panel/web2-chat-panel-render.js)** ·424 — WEB2.0 module.
    - uses shared: `Web2ChatEntityDetect`, `Web2ChatPanel`, `Web2Chat`
    - funcs (18): buildRender, dayKey, jump, loadOlder, loadThread, quoted, reJump, reactions, renderAll, renderDetect, renderMessage, renderQuick, renderShell, renderStats, renderStatus, renderTags, scrollToBottom, updateScrollUi
- **[web2-chat-panel-state.js](../../web2/shared/chat-panel/web2-chat-panel-state.js)** ·202 — WEB2.0 module.
    - uses shared: `Web2ChatPanel`, `API_CONFIG`, `Web2Chat`
    - funcs (14): avatarBig, avatarSmall, createFlags, createState, esc, fbAvatarUrl, fmtTime, gradientFor, initialOf, msgPlain, msgTs, parseTs, renderAttachment, workerUrl
- **[web2-chat-panel.js](../../web2/shared/chat-panel/web2-chat-panel.js)** ·120 — WEB2.0 — component chat HỢP NHẤT (Web2ChatPanel) dùng chung native-orders/web2-pancake/balance-history.
    - exposes: `Web2ChatPanel`
    - funcs (13): $, createInstance, custOf, destroy, getState, isOutgoing, mount, nameOf, open, pageIdOf, psidOf, pushMessage, setMessages
- **[web2-chat-sticker-data.js](../../web2/shared/chat-panel/web2-chat-sticker-data.js)** ·33 — WEB2.0 — bộ sticker built-in cho Web2ChatPanel (Feature 2 sticker-send).
    - exposes: `Web2ChatStickers`
    - uses shared: `Web2ChatPanel`
    - funcs (1): list
- **[delivery-method-picker.js](../../web2/shared/delivery-method-picker.js)** ·617 — Web 2.0 — Delivery method picker (Vietnam-aware)
    - exposes: `DeliveryMethodPicker`
    - uses shared: `API_CONFIG`
    - funcs (17): \_cleanAddress, \_detectProvince, \_goongToOption, \_hasFuzzy, \_isHcmc, \_lev, \_normalizeFromRecord, \_parseKeywords, fetchFromBackend, geocodeGoong, getOptionsAsync, hasKeyword, normalize, pick, pickAsync, pickOffline, pickRobust
- **[page-builder.js](../../web2/shared/page-builder.js)** ·763 — Web 2.0 generic CRUD page builder — same look as WEB2 list views.
    - exposes: `Web2Page`
    - uses shared: `Popup`, `Web2Api`, `Web2AuditLog`, `Web2Escape`, `Web2Format`, `Web2Optimistic`, `Web2SSE`
    - funcs (29): \_escHandler, apply, applyFilters, clearFilters, closeModal, destroy, escapeHtml, fmtTime, getPath, goPage, inferRefPageUrl, load, loadName, mount, notify, open, openCreate, openEdit, openHistory, removeRecord, renderCounters, renderForm, renderPagination, renderRows, rollback, run, saveModal, setPath, showDropdown
- **[popup.js](../../web2/shared/popup.js)** ·481 — Web 2.0 — Custom Popup (alert / confirm / prompt)
    - exposes: `Popup`
    - uses shared: `Web2Lottie`
    - funcs (19): alert, cleanup, confirm, danger, ensureRoot, ensureStyles, error, exit, finishCancel, finishOk, hexToRgba, info, lockScroll, onKey, open, prompt, success, unlockScroll, warning
- **[web2-ai-assistant.js](../../web2/shared/web2-ai-assistant.js)** ⚠️1335 — WEB2.0 shared module.
    - exposes: `Web2AiAssistant`
    - uses shared: `Web2AiDescribe`, `Web2AiPageRegistry`, `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2ContentMaker`, `Web2SmartCache`, `Web2Tryon`
    - funcs (61): API, \_dataAt, \_fetchAllDb, \_hasMore, \_md, \_postAi, \_streamOne, \_tableText, \_topicFor, accs, aiCacheFor, applyEnabledState, ask, authErr, authHeaders, bubbleHtml, buildModelBar, callAiOnce, callAiStream, capHistory, cascadeList, close, dbCacheFresh, encodeArray, ensure, ensureUi, esc, fetchDbSource, fetcher, histKey, injectCss, loadCfg, loadDbThenAsk, loadHistory, loadScript, mount, note, onAuthExpired, onDelta, onerror, onload, open, pageContext, pageModel, pageSuggestions, patchLast, redactPII, reg, reloadConfig, render, renderQuicks, resolveExpr, saveCfg, saveHistory, sharedBase, showMode, stripThink, summarizeDataset, systemPrompt, web2Base …
- **[web2-ai-describe.js](../../web2/shared/web2-ai-describe.js)** ·302 — WEB2.0 shared module.
    - exposes: `Web2AiDescribe`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (13): API, attach, authHeaders, describe, destroy, esc, handler, injectCss, mountPanel, syncPlaceholder, system, toast, workerUrl
- **[web2-ai-page-registry.js](../../web2/shared/web2-ai-page-registry.js)** ⚠️1871 — WEB2.0 shared module.
    - exposes: `Web2CkReview`, `Web2UnreadPanel`, `Web2AiPageRegistry`
    - uses shared: `Web2AiAssistant`, `Web2CkReview`, `Web2UnreadPanel`, `Web2AuditLogData`, `Web2AuditLog`, `Web2Auth`, `Web2FbClient`, `FBPostsApi`, `Web2Kpi`, `Web2OrderTagPill`, `Web2ProductsCache`, `Web2SmartCache`, `Web2VariantsCache`
    - funcs (7): accessorsFor, dbSourcesFor, g, matchPage, modelFor, noteFor, suggestionsFor
- **[web2-ai-presets.js](../../web2/shared/web2-ai-presets.js)** ⚠️897 — WEB2.0 module.
    - exposes: `Web2AiPresets`, `AiPresets`
    - funcs (14): \_ensureOverlay, \_esc, \_injectCss, \_norm, appendBatch, cardHtml, close, onclick, oninput, pickImage, pickRole, renderCats, renderGrid, syncMoreHint
- **[web2-api-fetch.js](../../web2/shared/web2-api-fetch.js)** ·82 — WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.
    - exposes: `Web2ApiFetch`
    - uses shared: `WEB2_CONFIG`, `Web2Auth`
    - funcs (4): \_defaultBases, authHeaders, json, withFallback
- **[web2-api.js](../../web2/shared/web2-api.js)** ·94 — Web 2.0 generic API client — talks to /api/web2/:entity/\*
    - exposes: `Web2Api`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2UserInfo`
    - funcs (8): \_authHeaders, \_fetchJson, create, forEntity, health, list, remove, update
- **[web2-attendance-installer.js](../../web2/shared/web2-attendance-installer.js)** ·245 — WEB2.0 shared — 1-click tải & cài agent Chấm công DG-600.
    - exposes: `Web2AttendanceInstaller`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (10): \_download, \_ensureStyle, \_fetchSecret, batContent, downloadInstaller, downloadInstallerWithSecret, downloadUninstaller, renderButtons, siteRoot, uninstallBatContent
- **[web2-audit-log.js](../../web2/shared/web2-audit-log.js)** ·477 — WEB2.0 module.
    - exposes: `Web2AuditLogData`, `Web2AuditLog`
    - uses shared: `Web2AiPageRegistry`, `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (23): actionLabel, actionOptions, applyScopeUi, authHeaders, buildShell, close, entity, entityOptions, esc, fmtTime, injectStyle, load, mount, onKey, onclick, openRecord, populateActions, populateEntities, rawChanges, reload, resolveHost, rowHtml, wireRetry
- **[web2-auth.js](../../web2/shared/web2-auth.js)** ·308 — Token storage + verify + page guard.
    - exposes: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (15): apiUrl, authHeaders, can, clear, fetch, getStored, guardPage, handleAuthExpired, installWriteAuthGuard, isWeb2WriteUrl, loginUrl, logout, requireAuth, storeLogin, verify
- **[web2-avatar-utils.js](../../web2/shared/web2-avatar-utils.js)** ·140 — WEB2.0 shared module.
    - exposes: `Web2AvatarUtils`
    - uses shared: `API_CONFIG`, `Web2Chat`, `Web2Escape`
    - funcs (7): \_esc, \_isRealFbId, \_workerUrl, color, html, initial, proxyUrl
- **[web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js)** ·443 — WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.
    - exposes: `Web2BarcodeScanner`
    - uses shared: `Web2Lottie`, `Web2ProductCounter`
    - funcs (23): beep, cleanup, close, createScanner, destroy, emit, ensureStyles, getCount, loadModule, loop, mount, notify, off, on, onHit, onKey, open, resolveTarget, setTorch, start, stop, stopTracks, vibrate
- **[web2-bg-scene.js](../../web2/shared/web2-bg-scene.js)** ·325 — WEB2.0 shared module.
    - exposes: `Web2BgScene`
    - uses shared: `Web2BgRemover`
    - funcs (15): \_blobToDataUrl, \_injectCss, \_loadImg, \_rawToDataUrl, \_runBrowserCutout, \_toDataUrl, aiBackgroundUrl, composite, cutout, done, onerror, onload, open, paint, q
- **[web2-bgremover.js](../../web2/shared/web2-bgremover.js)** ·86 — WEB2.0 module.
    - exposes: `Web2BgRemover`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`
    - funcs (7): \_registryBase, \_toBlob, listServers, onerror, onload, removeBg, removeBgAuto
- **[web2-bill-service.js](../../web2/shared/web2-bill-service.js)** ·757 — WEB2.0 module.
    - exposes: `Web2Bill`
    - uses shared: `Web2Printer`, `Web2QR`, `Web2UserInfo`
    - funcs (20): \_buildBillBody, \_esc, \_fmtDate, \_fmtMoney, \_nl2br, \_printViaIframe, \_renderBarcodeSvg, \_renderCodeMarkup, \_shop, cleanup, close, generateHTML, generateImage, getMergedSttDisplay, go, onKey, onload, openCombinedPrint, openPreview, openPrint
- **[web2-campaign.js](../../web2/shared/web2-campaign.js)** ·225 — WEB2.0 shared.
    - exposes: `Web2Campaign`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (25): CP_BASE, LC_BASE, \_json, \_patch, \_post, addProducts, assignPost, authHeaders, create, getCartDetail, getTvControl, list, listAssignments, listPagePosts, listPosts, listProducts, remove, removeProduct, reorder, setPending, setPinned, setTvControl, subscribe, unassignPost, workerBase
- **[web2-canvas-utils.js](../../web2/shared/web2-canvas-utils.js)** ·139 — WEB2.0 shared module.
    - exposes: `Web2CanvasUtils`
    - funcs (9): base64ToBlob, blobToBase64, canvasToBlob, fileToDataUrl, imgToCanvas, loadImage, onerror, onload, sizeCanvas
- **[web2-chat-api.js](../../web2/shared/web2-chat-api.js)** ·403 — WEB2.0 module.
    - uses shared: `Web2Chat`
    - funcs (8): enrichCustomer, fetchConversations, fetchConversationsByPage, fetchMessages, replyComment, searchConversations, sendMessage, uploadMedia
- **[web2-chat-client.js](../../web2/shared/web2-chat-client.js)** ·107 — WEB2.0 module.
    - exposes: `Web2Chat`
- **[web2-chat-live.js](../../web2/shared/web2-chat-live.js)** ·274 — WEB2.0 module.
    - uses shared: `Web2Chat`
    - funcs (6): fetchLivePosts, generateAllPageAccessTokens, generatePageAccessToken, listPages, push, sendLiveComment
- **[web2-chat-settings.js](../../web2/shared/web2-chat-settings.js)** ·140 — WEB2.0 module.
    - uses shared: `Web2Chat`
    - funcs (4): \_loadPageSettingsLs, \_persistPageSettingsLs, fetchPageSettings, p
- **[web2-chat-tags.js](../../web2/shared/web2-chat-tags.js)** ·156 — WEB2.0 module.
    - uses shared: `Web2Chat`
    - funcs (8): \_tagContrast, e, ensureTags, fetchTags, resolveTags, tagDefsFor, tagPillsHtml, toggleTag
- **[web2-chat-tokens.js](../../web2/shared/web2-chat-tokens.js)** ·268 — WEB2.0 module.
    - uses shared: `Web2Chat`
    - funcs (13): \_syncInFlight, clearAllTokens, decodeJwt, getAllAccounts, getAllPageAccessTokens, getJwt, getPageAccessToken, getPageAccountJwts, hasTokensFor, local, setJwt, setPageAccessToken, syncFromRenderDB
- **[web2-chat-utils.js](../../web2/shared/web2-chat-utils.js)** ·128 — WEB2.0 module.
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Chat`
    - funcs (5): \_authHeaders, \_fetchJson, \_isExpired, \_isInstagram, \_pagesHas
- **[web2-ck-assign-picker.js](../../web2/shared/web2-ck-assign-picker.js)** ·269 — WEB2.0 — picker gán giao dịch CK (balance-history) cho đơn chưa nhận CK.
    - exposes: `Web2CkAssignPicker`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Format`, `Web2UserInfo`
    - funcs (15): authHeaders, close, ensureDom, esc, fmtDate, fmtVnd, getJSON, last9, load, onclick, oninput, open, patchJSON, pick, toast
- **[web2-ck-review.js](../../web2/shared/web2-ck-review.js)** ·494 — WEB2.0 module — đối chiếu & duyệt tín hiệu CK (dùng chung 3 trang).
    - exposes: `Web2CkReview`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2Format`, `Web2HistoryTimeline`, `Web2PhoneUtils`, `Web2SSE`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (24): authHeaders, close, closeOverlay, deb, esc, fmtMoney, fmtTime, historyHtml, injectCss, load, makeOverlay, makePager, normPhone, onDone, onchange, onclick, openReview, openSignalList, scoreTx, sigRowHtml, subscribeRefresh, toast, txRowHtml, userBody
- **[web2-command-palette.js](../../web2/shared/web2-command-palette.js)** ·269 — WEB2.0 shared — Command Palette (Ctrl/Cmd+K) toàn cục.
    - exposes: `Web2CommandPalette`
    - funcs (13): build, close, collectItems, ensureStyles, escapeHtml, norm, onKey, open, renderList, run, score, scrollActive, toggle
- **[web2-content-maker.js](../../web2/shared/web2-content-maker.js)** ·382 — WEB2.0 shared module.
    - exposes: `Web2ContentMaker`
    - uses shared: `Web2AiDescribe`, `Web2HtmlSkill`, `Web2VideoRender`
    - funcs (22): $, build, destroy, ensureDeps, esc, fitPreview, generate, injectCss, isVideo, loadScript, meta, mount, onDelta, onResize, onerror, onload, openTab, renderVideo, selectSkill, setBusy, sharedBase, toast
- **[web2-customer-chat-core.js](../../web2/shared/web2-customer-chat-core.js)** ·577 — WEB2.0 module.
    - uses shared: `Web2ChatPanel`, `API_CONFIG`, `Web2Chat`, `Web2CustomerChat`, `Web2Ext`, `Web2Lottie`, `Web2SSE`, `Web2Zalo`
    - funcs (31): \_convRowHtml, \_fileToDataUrl, \_getPageIds, \_hasScript, \_loadCss, \_loadScript, \_mAvatarUrl, \_mColor, \_mInitial, \_mTime, \_mergeConvs, \_pageName, \_performSend, \_resolveConvByFbId, \_stateHtml, \_trySendViaExtension, \_wireMessagesSse, buildPancakeAdapter, ensureStyles, esc, getActive, loadMessages, loadOlder, loadPanelBundle, notify, onerror, onload, quickReplies, resolvePancakeConv, send, setActive
- **[web2-customer-chat-modal.js](../../web2/shared/web2-customer-chat-modal.js)** ·247 — WEB2.0 module.
    - uses shared: `Web2ChatPanel`, `Web2Chat`, `Web2CustomerChat`, `Web2Lottie`
    - funcs (12): close, getInfoEl, getPanel, loadInitial, markSelected, onEsc, openModal, refreshActive, renderRows, selectConv, switchTab, wireSearch
- **[web2-customer-chat.js](../../web2/shared/web2-customer-chat.js)** ·235 — WEB2.0 module.
    - exposes: `Web2CustomerChat`
    - uses shared: `Web2ChatPanel`, `Web2Chat`, `Web2Ext`, `Web2Lottie`, `Web2Zalo`
    - funcs (11): \_copyPhone, \_scrollZalo, close, done, mountPancake, mountZalo, onEsc, open, paneEl, refreshActive, showTab
- **[web2-customer-detail-modal.js](../../web2/shared/web2-customer-detail-modal.js)** ·417 — WEB2.0 — modal chi tiết KH (balance-history). Đọc kho KH chung /api/web2/customers/\*.
    - exposes: `Web2CustomerDetailModal`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2CustomerChat`, `Web2Escape`, `Web2Format`, `Web2PhoneUtils`
    - funcs (17): \_notify, \_w2Auth, close, ensureDom, esc, fmtDate, fmtVnd, getJSON, injectStyle, normPhone, open, openChat, renderInfo, renderOrders, renderWallet, saveCustomer, switchTab
- **[web2-customer-lookup.js](../../web2/shared/web2-customer-lookup.js)** ·66 — WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.
    - exposes: `PartnerCustomerApi`, `Web2CustomerLookup`
    - uses shared: `Web2CustomerStore`
    - funcs (6): detectCarrier, formatCurrency, list, listByPhones, statusClass, statusText
- **[web2-customer-store.js](../../web2/shared/web2-customer-store.js)** ·521 — WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.
    - exposes: `Web2CustomerStore`
    - uses shared: `API_CONFIG`, `Web2Auth`, `PartnerCustomerApi`, `Web2CustomerLookup`, `Web2SmartCache`, `Web2SSE`
    - funcs (33): \_ensureCaches, \_ensureSmartCache, \_getByFbIdRaw, \_getByPhoneRaw, \_invalidateAfterWrite, \_lite, \_post, \_warnAuthExpired, authHeaders, base, batchByFbIds, batchByPhones, detectCarrier, enrich, formatCurrency, getByFbId, getByPhone, harvestComments, isValidPhone, list, listByPhones, normPhone, normalize, onerror, onload, patch, patchByFbId, statusClass, statusText, subscribe, updateStatus, upsert, workerUrl
- **[web2-db-badge.js](../../web2/shared/web2-db-badge.js)** ·145 — Web2DbBadge — hiển thị badge "DB Render 2.0 / Firebase 2.0 / Web 2.0"
    - exposes: `Web2DbBadge`
    - funcs (6): \_escape, \_findTargetHeading, \_injectCss, \_renderBadge, \_resolveType, mount
- **[web2-deeplink.js](../../web2/shared/web2-deeplink.js)** ·101 — WEB2.0 module.
    - exposes: `Web2Deeplink`
    - funcs (11): enc, go, linkBtn, nativeOrders, param, product, reconcile, root, soOrder, supplierDebt, supplierWallet
- **[web2-dicebear-customizer.js](../../web2/shared/web2-dicebear-customizer.js)** ·313 — WEB2.0 shared module.
    - exposes: `Web2DicebearCustomizer`
    - funcs (15): \_esc, \_injectCss, \_label, buildUrl, classify, emit, getOptions, getSchema, load, mount, onChange, render, setSeed, setStyle, wire
- **[web2-effects.js](../../web2/shared/web2-effects.js)** ⚠️815 — Web 2.0 — Effects / animations library
    - exposes: `Web2Effects`
    - funcs (45): \_animate, \_compressImage, \_dur, \_ensureRippleStyle, \_ensureZoomPopup, \_ensureZoomStyle, \_fileToDataUrl, \_hideZoom, \_isZoomable, \_positionZoomPopup, \_showZoom, \_w2Notify, apply, attachHoverZoom, attachImageDropTarget, bounce, confetti, countUp, detach, fadeIn, fadeOut, flash, highlightRow, init, loadConfetti, morphHeight, notify, onDragleave, onDragover, onDrop, onMouseEnter, onPaste, onerror, onload, pulse, ripple, scan, shake, slideIn, slideOut, smoothScroll, staggerIn, step, stop, typewriter
- **[web2-escape.js](../../web2/shared/web2-escape.js)** ·64 — WEB2.0 module.
    - exposes: `Web2Escape`
    - funcs (4): escJs, escapeHtml, safeImageUrl, safeUrl
- **[web2-export-helpers.js](../../web2/shared/web2-export-helpers.js)** ·160 — WEB2.0 module.
    - exposes: `Web2Export`
    - uses shared: `Popup`
    - funcs (9): \_buildBarcodeCanvas, ensureJsBarcode, ensureJsPDF, ensureXLSX, loadScript, onerror, printHTML, toExcel, toPDFBarcodes
- **[web2-extension-bridge.js](../../web2/shared/web2-extension-bridge.js)** ·91 — WEB2 EXTENSION BRIDGE
    - exposes: `Web2Ext`
    - funcs (4): hasExtension, onMsg, request, version
- **[web2-fb-client.js](../../web2/shared/web2-fb-client.js)** ·120 — WEB2.0 shared — Facebook Graph API client (1 NGUỒN cho mọi trang FB).
    - exposes: `Web2FbClient`, `FBPostsApi`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (28): BASE, adAccounts, adEntries, adInsights, caption, connect, del, deleteAdEntry, deleteDraft, disconnect, drafts, engagement, headers, insightsProbe, jget, jpost, list, loginUrl, onload, postDetail, postEdit, publish, refreshPages, saveAdEntry, saveDraft, status, uploadImage, workerBase
- **[web2-fb-post-preview.js](../../web2/shared/web2-fb-post-preview.js)** ·147 — WEB2.0 shared — xem trước bài Facebook (giống FB) trước khi đăng.
    - exposes: `Web2FbPostPreview`
    - funcs (8): cell, close, esc, esc2, mediaGrid, open, renderCaption, srcOf
- **[web2-fb-share.js](../../web2/shared/web2-fb-share.js)** ·100 — WEB2.0 shared — handoff "Đăng lên FB": chuyển ảnh + caption từ 1 trang sang trang Đăng bài.
    - exposes: `Web2FbShare`
    - funcs (4): consume, fbPostsUrl, has, send
- **[web2-format.js](../../web2/shared/web2-format.js)** ·92 — WEB2.0 shared — 1 NGUỒN format tiền/ngày/giờ (GMT+7) cho Web 2.0.
    - exposes: `Web2Format`
    - funcs (8): \_fmt, date, dateTime, num, parseTs, rel, time, vnd
- **[web2-gemini-chat.js](../../web2/shared/web2-gemini-chat.js)** ·471 — WEB2.0 shared module.
    - exposes: `Web2GeminiChat`
    - uses shared: `Web2AiPresets`, `AiPresets`, `Web2GeminiClient`, `Web2ImageLightbox`, `Web2ImagePaste`
    - funcs (21): $, applyMode, bubbleImgs, cur, delChat, destroy, esc, injectCss, loadChats, mdToHtml, mount, newChat, openPresets, refreshStatus, renderList, renderMsgs, resetAttach, saveChats, send, setTyping, toast
- **[web2-gemini-client.js](../../web2/shared/web2-gemini-client.js)** ·219 — WEB2.0 shared module.
    - exposes: `Web2GeminiClient`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (11): \_freeCall, aiApi, authHeaders, buildTryonPrompt, chat, discover, generate, health, paidImage, tryon, workerBase
- **[web2-history-timeline.js](../../web2/shared/web2-history-timeline.js)** ·238 — Web2HistoryTimeline — render lịch sử chỉnh sửa kèm tên user
    - exposes: `Web2HistoryTimeline`
    - funcs (5): \_escapeHtml, \_fmtDateTime, \_injectCss, render, renderEntry
- **[web2-html-skill.js](../../web2/shared/web2-html-skill.js)** ·327 — WEB2.0 shared — sinh HTML đẹp từ data bằng AI free.
    - exposes: `Web2HtmlSkill`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (12): authHeaders, bodyIsEmpty, buildMessages, cleanHtml, exportHtml, exportPng, generate, next, renderToIframe, skill, skills, workerUrl
- **[web2-idb-store.js](../../web2/shared/web2-idb-store.js)** ·183 — Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.
    - exposes: `Web2IdbStore`
    - funcs (13): \_idbGet, \_idbRemove, \_idbSet, \_key, \_maybeMigrateFromLs, \_openConnection, onblocked, onerror, onsuccess, onupgradeneeded, open, ready, remove
- **[web2-image-editor.js](../../web2/shared/web2-image-editor.js)** ·295 — WEB2.0 shared.
    - exposes: `Web2ImageEditor`
    - funcs (14): \_load, \_loadIntoPhotopea, \_openPhotopea, cleanup, ensureStyles, finish, notifyWarn, onMsg, onSave, onerror, onload, open, take, tryNext
- **[web2-image-lightbox.js](../../web2/shared/web2-image-lightbox.js)** ·353 — WEB2.0 shared module.
    - exposes: `Web2ImageLightbox`
    - uses shared: `Web2Effects`, `Web2Escape`, `Web2ImagePaste`
    - funcs (14): \_ensureOverlay, \_esc, \_fullUrl, \_go, \_injectGuardCss, \_isLightboxable, \_normalize, \_onKey, \_render, close, open, requestAnimationFrame, safeImageUrl, thumbStripHtml
- **[web2-image-paste.js](../../web2/shared/web2-image-paste.js)** ·598 — WEB2.0 shared module.
    - exposes: `Web2ImagePaste`
    - uses shared: `Web2CanvasUtils`, `Web2Effects`, `Web2Escape`, `Web2ImageLightbox`
    - funcs (33): \_ensureCss, \_esc, \_fileToDataUrl, \_loadImage, \_notify, addFiles, arm, clear, compress, count, deliver, destroy, detach, disarm, emit, enhance, getDataUrls, getItems, imagesFromClipboard, imagesFromDataTransfer, mount, onAreaPaste, onClickDrop, onDragLeave, onDragOver, onDrop, onFileChange, onKeyDrop, onerror, onload, removeById, renderTray, setBusy
- **[web2-import.js](../../web2/shared/web2-import.js)** ·595 — WEB2.0 module.
    - exposes: `Web2Import`
    - uses shared: `Web2Escape`
    - funcs (33): b64DecodeUtf8, buildHeaderMap, buildSampleCsv, close, decodeN2Token, detectDelimiter, downloadSample, downloadText, esc, escClose, escapeHtml, handleFile, normKey, normalizeRecords, notify, onCommit, onProgress, onchange, onclick, onerror, onload, open, parseBool, parseCsv, parseInput, parseNumber, q, renderFromText, renderPreview, sampleJson, structureHtml, switchTab, validateRows
- **[web2-jwt-utils.js](../../web2/shared/web2-jwt-utils.js)** ·96 — WEB2.0 shared module.
    - exposes: `Web2JwtUtils`
    - funcs (5): base64UrlDecode, decode, expiresAt, isExpired, shortToken
- **[web2-kpi.js](../../web2/shared/web2-kpi.js)** ·97 — WEB2.0 module.
    - exposes: `Web2Kpi`
    - uses shared: `Web2Auth`, `Web2Escape`
    - funcs (7): authHeaders, escapeHtml, fetchEvents, fetchKpi, fmtVnd, isAdmin, rateFrom
- **[web2-label-ocr.js](../../web2/shared/web2-label-ocr.js)** ·433 — WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.
    - exposes: `Web2LabelOcr`
    - uses shared: `Web2BarcodeScanner`, `Web2ProductCounter`
    - funcs (20): captureRoi, cleanup, ensureStyles, getTrocr, getWorker, loadTesseract, notify, onKey, onerror, onload, open, p, recognizeHandwritten, setLoading, shoot, showCamera, showResult, start, stopTracks, use
- **[web2-live-tv-display.js](../../web2/shared/web2-live-tv-display.js)** ·139 — WEB2.0 shared — quy tắc HIỂN THỊ màn TV livestream.
    - exposes: `Web2LiveTvDisplay`
    - uses shared: `Web2VariantGroup`
    - funcs (5): cardState, khConModel, normRegion, orderForDisplay, paginate
- **[web2-logo-eraser.js](../../web2/shared/web2-logo-eraser.js)** ·496 — WEB2.0 shared.
    - exposes: `Web2LogoEraser`
    - funcs (20): \_autoDetect, \_inpaintCv, \_inpaintRect, \_loadCv, \_loadImage, applyErase, autoDetect, cleanup, ensureStyles, evtPos, fit, lum, notify, onerror, onload, open, poll, ready, redraw, undo
- **[web2-lottie.js](../../web2/shared/web2-lottie.js)** ·391 — WEB2.0 module.
    - exposes: `Web2Lottie`
    - uses shared: `Web2Optimistic`
    - funcs (21): ASSET_BASE, SCRIPT_SRC, \_enhanceDeclarative, \_enhanceEmptyStates, \_enhanceOneEmptyIcon, \_reap, \_resolveEl, \_startObserver, boot, burst, cleanup, destroy, ensureLib, error, injectCss, loadingOverlay, onerror, onload, play, scan, success
- **[web2-motion.js](../../web2/shared/web2-motion.js)** ·98 — WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.
    - exposes: `Web2Motion`
    - funcs (4): enterOnLoad, pop, reveal, staggerIn
- **[web2-msg-template-core.js](../../web2/shared/web2-msg-template-core.js)** ·278 — WEB2.0 module.
    - exposes: `W2MT`
    - uses shared: `API_CONFIG`, `Web2Auth`, `W2MT`, `Web2MsgTemplate`, `Web2SSE`
    - funcs (16): \_authHeaders, \_deleteTemplate, \_fillTemplate, \_formatLines, \_formatVnd, \_isSent, \_loadSent, \_loadTemplates, \_mapIn, \_markSent, \_refreshIcons, \_saveSent, \_saveTemplate, \_sleep, \_toast, \_unmarkSent
- **[web2-msg-template-send.js](../../web2/shared/web2-msg-template-send.js)** ·500 — WEB2.0 module.
    - exposes: `W2MT`
    - uses shared: `Popup`, `Web2Chat`, `W2MT`, `Web2SSE`, `Web2UserInfo`
    - funcs (15): \_cancelActiveJob, \_drainExtension, \_ensurePill, \_extSendOne, \_fetchJob, \_handleSend, \_hidePill, \_maybeReattachActive, \_onProgress, \_pollJob, \_sendItemViaExtension, \_startWatch, \_stopWatch, \_unmarkFailed, \_updatePill
- **[web2-msg-template-ui.js](../../web2/shared/web2-msg-template-ui.js)** ·264 — WEB2.0 module.
    - exposes: `W2MT`
    - uses shared: `Popup`, `W2MT`
    - funcs (5): \_closeModal, \_ensureModal, \_openEditModal, \_renderCards, onclick
- **[web2-msg-template.js](../../web2/shared/web2-msg-template.js)** ·99 — WEB2.0 module.
    - exposes: `W2MT`, `Web2MsgTemplate`
    - funcs (1): open
- **[web2-new-msg-badge.js](../../web2/shared/web2-new-msg-badge.js)** ·305 — Web 2.0 — New-message badge for native-orders rows
    - exposes: `Web2NewMsgBadge`
    - uses shared: `Web2Realtime`
    - funcs (13): \_ensureStyle, \_loadFromStorage, \_pruneRecentlyReplied, \_saveReplied, \_saveToStorage, clearAll, clearPendingForCustomer, getPendingCustomers, init, onEvent, onIncomingMessage, reapply, setPendingCustomers
- **[web2-notification-bell.js](../../web2/shared/web2-notification-bell.js)** ·188
    - exposes: `Web2NotificationBell`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2SSE`
    - funcs (16): \_attachOutsideClick, \_authHeaders, \_fetchList, \_fetchUnreadCount, \_markAllRead, \_markRead, \_refresh, \_relTime, \_render, \_resolveOverviewBase, \_subscribeSSE, escapeAttr, escapeHtml, mount, onclick, safeUrl
- **[web2-notify.js](../../web2/shared/web2-notify.js)** ·49 — WEB2.0 shared — 1 NGUỒN toast/notify cho Web 2.0.
    - exposes: `Web2Notify`
    - uses shared: `Popup`
    - funcs (5): error, info, show, success, warning
- **[web2-number-input.js](../../web2/shared/web2-number-input.js)** ·372 — WEB2.0 shared — 1 NGUỒN format số khi NHẬP (live thousand "." + decimal ",") cho Web 2.0.
    - exposes: `Web2NumberInput`
    - funcs (23): \_caretFromSig, \_clampOnBlur, \_init, \_liveDecimal, \_liveInt, \_manualGroup, \_optsFromDataset, \_reformat, \_scheduleScan, \_sigBefore, \_startObserver, attach, attachAll, config, detach, format, getValue, getValueOr, onBlur, onInput, parse, run, setValue
- **[web2-optimistic.js](../../web2/shared/web2-optimistic.js)** ·110 — Codifies pattern: snapshot → apply optimistic UI → fire backend background →
    - exposes: `Web2Optimistic`
    - uses shared: `Web2Lottie`
    - funcs (6): \_notify, apply, onSuccess, rollback, run, snapshot
- **[web2-order-tag-detail.js](../../web2/shared/web2-order-tag-detail.js)** ·389 — WEB2.0 module.
    - exposes: `Web2OrderTagDetail`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Escape`
    - funcs (21): close, cssEsc, ensureStyles, esc, fillHolders, icons, kpiActionsHtml, kpiLineRow, kpiSrcBadge, onKey, open, prodBadge, prodSub, productListHtml, renderKpiUser, statusLabel, thumbHtml, triggerDesc, vnNum, wireKpiActions, workerBase
- **[web2-order-tag-pill.js](../../web2/shared/web2-order-tag-pill.js)** ·93 — WEB2.0 module.
    - exposes: `Web2OrderTagPill`
    - uses shared: `Web2Escape`
    - funcs (7): escapeHtml, html, listHtml, normHex, rgb, rgba, textColor
- **[web2-pack-counter.js](../../web2/shared/web2-pack-counter.js)** ·427 — WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.
    - exposes: `Web2PackCounter`
    - uses shared: `Web2BarcodeScanner`, `Web2LabelOcr`
    - funcs (22): cleanup, computeImgToDisp, drawMarkers, ensureStyles, estimateCenters, fitOverlay, loadCv, notify, onKey, onTap, onerror, onload, open, poll, ready, recount, setLoading, shoot, showCamera, start, stopTracks, use
- **[web2-pancake-accounts.js](../../web2/shared/web2-pancake-accounts.js)** ·300 — Web 2.0 — Pancake ACCOUNTS manager (DB-backed)
    - exposes: `Web2PancakeAccounts`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Chat`, `Web2JwtUtils`
    - funcs (15): \_authHeaders, \_decode, \_json, addFromToken, deleteCreds, getActiveId, getRefreshStatus, isExpired, list, refreshNow, remove, saveCreds, setActiveLocal, setEnabled, updatePages
- **[web2-pancake-import.js](../../web2/shared/web2-pancake-import.js)** ·150 — WEB2.0 shared module.
    - exposes: `Web2PancakeImport`
    - uses shared: `Web2Chat`, `Web2CustomerStore`
    - funcs (5): \_digits, \_pageIds, convToCustomer, lookupDeep, searchByPhone
- **[web2-pancake-token.js](../../web2/shared/web2-pancake-token.js)** ·207 — Web 2.0 — Pancake JWT token monitor + auto-refresh
    - exposes: `Web2PancakeToken`
    - uses shared: `Web2Chat`, `Web2JwtUtils`
    - funcs (8): \_decode, applyToken, cleanup, ensureFresh, fetchFromExtension, getStatus, isExtensionPresent, onMessage
- **[web2-perm.js](../../web2/shared/web2-perm.js)** ·185 — WEB2.0 shared — phân quyền (enforcement).
    - exposes: `Web2Perm`
    - uses shared: `Web2Auth`
    - funcs (11): \_block, \_runGuard, \_user, \_waitAndGuard, can, canView, canViewUrl, isAdmin, isAdminOnlySlug, isAdminOnlyUrl, slugFromUrl
- **[web2-phone-utils.js](../../web2/shared/web2-phone-utils.js)** ·38 — WEB2.0 shared — 1 NGUỒN chuẩn hoá SĐT VN cho Web 2.0.
    - exposes: `Web2PhoneUtils`
    - uses shared: `Web2CustomerStore`
    - funcs (3): display, isValid, norm
- **[web2-pos-installer.js](../../web2/shared/web2-pos-installer.js)** ·247 — WEB2.0 shared — kho đa dụng.
    - exposes: `Web2PosInstaller`
    - funcs (8): \_download, \_ensureStyle, batContent, downloadInstaller, downloadUninstaller, renderButtons, siteRoot, uninstallBatContent
- **[web2-printer.js](../../web2/shared/web2-printer.js)** ·740 — WEB2.0 — DANH SÁCH máy in + gán máy in theo chức năng + in ESC/POS raster qua print-bridge.
    - exposes: `Web2Printer`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SSE`
    - funcs (40): \_ascii, \_b64, \_canvasToEscpos, \_canvasToTsplBitmap, \_defaultPrinterIdForRole, \_fire, \_genId, \_isLabelLang, \_loadScript, \_migrateToServer, \_printers, \_read, \_recToPrinter, \_w2Auth, bridgeAlive, dotsWidth, effectiveRoleId, escposRasterFromHtml, escposRasterFromHtmlPhysical, escposRasterFromSvg, getPrinter, getPrinterFor, getPrinters, getRoles, loadPrinters, norm, onPrintersChanged, onerror, onload, printBillHtml, printEscpos, printHtml, printSvg, put, removePrinter, roleIsBridge, setRole, testConnection, tsplFromHtmlPhysical, upsertPrinter
- **[web2-product-code.js](../../web2/shared/web2-product-code.js)** ·627 — WEB2.0 module.
    - exposes: `Web2ProductCode`
    - funcs (17): basePrefix, buildColorShortMap, buildPrefixMap, childCode, clean, extractColor, extractColorWithMap, extractSize, extractType, generate, isColorWord, parentBaseCode, removeDiacritics, resolvePrefix, suggest, suggestWithMap, toAsciiUpper
- **[web2-product-counter.js](../../web2/shared/web2-product-counter.js)** ·570 — WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.
    - exposes: `Web2ProductCounter`
    - uses shared: `WEB2_CONFIG`, `Web2CustomerChat`, `Web2Lottie`
    - funcs (33): categoryName, close, createController, destroy, drawBoxes, emit, ensureStyles, filterDets, flipCamera, getCount, getDetections, getDetector, getVisionFileset, isRunning, loadVision, loop, make, median, mount, notify, off, on, onKey, open, p, resolveTarget, setCount, setStatus, setToggleUi, start, stop, stopTracks, toggle
- **[web2-product-group.js](../../web2/shared/web2-product-group.js)** ·98 — WEB2.0 shared.
    - exposes: `Web2ProductGroup`
    - uses shared: `Web2Escape`, `Web2VariantGroup`
    - funcs (7): childPanelHtml, codeOf, commonPrefix, esc, group, parentCode, parentOf
- **[web2-product-picker.js](../../web2/shared/web2-product-picker.js)** ·168 — WEB2.0 shared — chọn SP từ Kho SP (1 hoặc NHIỀU) trả full object.
    - exposes: `Web2ProductPicker`
    - uses shared: `Web2Escape`, `Web2ProductsCache`
    - funcs (11): applyRowState, close, draw, esc, imgOf, notify, onclick, open, priceText, rowHtml, updateCount
- **[web2-product-types-cache.js](../../web2/shared/web2-product-types-cache.js)** ·209 — WEB2.0 module.
    - exposes: `Web2ProductTypesCache`
    - uses shared: `Web2SmartCache`
    - funcs (17): \_emit, \_ensureSmartCache, \_fetchTypes, \_getCache, \_normalize, \_rebuild, findByName, getAll, getAllIncludingInactive, has, init, initPromise, onerror, onload, pushTickle, refresh, subscribe
- **[web2-product-units.js](../../web2/shared/web2-product-units.js)** ·158 — WEB2.0 shared.
    - exposes: `Web2ProductUnits`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`
    - funcs (12): URL\_, attachForPrint, base, byProduct, ensure, events, headers, reprint, resolve, sortManifest, token, userName
- **[web2-products-api.js](../../web2/shared/web2-products-api.js)** ·159 — WEB2.0 shared — Web2ProductsApi client (1 NGUỒN cho mọi trang dùng Kho SP).
    - exposes: `Web2ProductsApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (15): \_fetchJson, \_w2Auth, adjustPending, adjustStock, confirmPurchase, create, getBatch, health, list, listChildren, listPending, remove, update, upsertPending, usage
- **[web2-products-cache.js](../../web2/shared/web2-products-cache.js)** ·324 — WEB2.0 module.
    - exposes: `Web2ProductsCache`
    - uses shared: `Web2ProductsApi`, `Web2SmartCache`, `Web2SSE`
    - funcs (26): \_emit, \_ensureApiLoaded, \_ensureSmartCache, \_fetchProducts, \_getCache, \_normalize, \_rebuild, \_removeLocal, \_upsertLocal, findByCode, findByName, findByNameExact, findByNameVariant, getAll, has, hasByName, init, initPromise, isReady, onerror, onload, pushTickle, refresh, scoreFor, sortTier, subscribe
- **[web2-pwa.js](../../web2/shared/web2-pwa.js)** ·80 — WEB2.0 shared — PWA (Thêm vào Màn hình chính) cho MỌI trang, không cần App Store.
    - exposes: `Web2PWA`
    - funcs (5): SCRIPT_SRC, asset, ensureLink, ensureMeta, installed
- **[web2-qr-modal.js](../../web2/shared/web2-qr-modal.js)** ·301 — WEB2.0 shared component — reusable QR modal cho customer-wallet + partner-customer.
    - exposes: `Web2QrModal`
    - uses shared: `Web2Auth`
    - funcs (12): \_w2Auth, close, copyCode, ensureDom, ensureStyles, fetchOrCreate, open, qrRequest, refresh, renderData, showError, showLoading
- **[web2-qr.js](../../web2/shared/web2-qr.js)** ·354 — WEB2.0 shared — 1 NGUỒN sinh QR "trang trí" đen trắng cho tem SP + PBH.
    - exposes: `Web2QR`
    - uses shared: `Web2Printer`
    - funcs (16): \_EC, \_finderTopLeft, \_loadScript, \_moduleShape, \_styledEye, \_svgToDataUrl, \_xmlEsc, card, cardDataUrl, isDark, matrix, onerror, onload, ready, toDataUrl, toSvg
- **[web2-quick-reply.js](../../web2/shared/web2-quick-reply.js)** ·669 — Web 2.0 — Quick Reply system
    - exposes: `Web2QuickReply`
    - uses shared: `Popup`, `API_CONFIG`, `Web2Auth`, `Web2Escape`, `Web2SSE`
    - funcs (31): \_authHeaders, \_closeModal, \_ensureStyle, \_escapeHtml, \_findCandidates, \_loadCache, \_matchShortcut, \_notify, \_openForm, \_positionDropdown, \_renderDropdown, \_renderModalList, \_saveCache, \_stripDiacritics, addReply, applySelected, attachAutocomplete, close, deleteReply, detachAutocomplete, getReplies, hide, loadReplies, onBlur, onInput, onKey, onResize, openModal, show, signature, updateReply
- **[web2-realtime.js](../../web2/shared/web2-realtime.js)** ·599 — Web 2.0 — Realtime client (Pancake WS)
    - exposes: `Web2Realtime`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Chat`
    - funcs (27): \_clientSession, \_connectDirect, \_connectProxy, \_decodeUser, \_emit, \_joinDirectChannels, \_joinDirectPage, \_makeRef, \_onDirectMessage, \_safeCall, \_scheduleDirectReconnect, \_scheduleProxyReconnect, \_startDirectHeartbeat, \_stopDirectHeartbeat, fetchPendingCustomers, isConnected, markReplied, mode, onclose, onerror, onmessage, onopen, rnd, start, startMulti, subscribe, unsubscribe
- **[web2-return-bill.js](../../web2/shared/web2-return-bill.js)** ·59 — WEB2.0 module.
    - exposes: `NativeReturnBill`
    - uses shared: `Popup`, `API_CONFIG`
    - funcs (3): \_normPhone, collect, fetchQueued
- **[web2-shelf-map.js](../../web2/shared/web2-shelf-map.js)** ·87 — WEB2.0 shared.
    - exposes: `Web2ShelfMap`
    - funcs (5): compareWalk, keGrid, keOf, locate, wallOf
- **[web2-sidebar.js](../../web2/shared/web2-sidebar.js)** ⚠️981 — WEB2-clone sidebar for Web 2.0 pages.
    - exposes: `Web2Sidebar`
    - uses shared: `DeliveryMethodPicker`, `Popup`, `Web2AiAssistant`, `Web2AiPageRegistry`, `Web2AiPresets`, `Web2ApiFetch`, `Web2AuditLog`, `Web2Auth`, `Web2AvatarUtils`, `Web2BgRemover`, `Web2CanvasUtils`, `Web2CommandPalette`, `Web2Effects`, `Web2Escape`, `Web2Format`, `Web2ImageLightbox`, `Web2ImagePaste`, `Web2JwtUtils`, `Web2Lottie`, `Web2Notify`, `Web2Perm`, `Web2PhoneUtils`, `Web2PWA`, `Web2SmartCache`, `Web2SSE`, `Web2TextUtils`, `Web2Translate`, `Web2UserProfile`
    - funcs (24): SCRIPT_BASE_URL, \_avatarUrlInline, \_isAdmin, alertSoon, autoLoadSharedModules, cleanLabel, close, escapeHtml, inject, injectMobileCss, isCollapsed, isOurRoute, isWeb2Item, mount, onGroupHead, onclick, openAccountSheet, openProfile, renderGroup, renderItem, renderUserFooter, resolveOur, setCollapsed, toggleCollapse
- **[web2-skeleton.js](../../web2/shared/web2-skeleton.js)** ·268 — WEB2.0 module — GitHub-style skeleton loading.
    - exposes: `Web2Skeleton`
    - funcs (18): bar, cardsHtml, clear, detailHtml, gridHtml, html, injectCss, lines, linesHtml, listHtml, make, resolve, rows, rowsHtml, show, statsHtml, tableHtml, thumb
- **[web2-smart-cache.js](../../web2/shared/web2-smart-cache.js)** ·605 — WEB2.0 module.
    - exposes: `Web2SmartCache`
    - uses shared: `Web2CustomerStore`, `Web2IdbStore`, `Web2ProductsCache`, `Web2SSE`, `Web2SuppliersCache`, `Web2VariantsCache`
    - funcs (34): \_emit, \_ensureEntry, \_ensureIdbStore, \_evictIfNeeded, \_getIdb, \_isStale, \_loadFromPersist, \_makeClientId, \_revalidate, \_saveToPersist, \_scheduleRevalidate, \_setupGlobalRealtime, \_setupRealtime, \_setupRealtimeFor, \_touchLru, applyEvent, create, createKeyed, dispose, fetcher, inflight, init, invalidate, isReady, isStale, keys, mutate, onerror, onload, peek, refresh, size, subscribe, topicFor
- **[web2-so-order-reader.js](../../web2/shared/web2-so-order-reader.js)** ·53 — WEB2.0 module.
    - exposes: `Web2SoOrder`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (2): \_authHeaders, load
- **[web2-so-order-utils.js](../../web2/shared/web2-so-order-utils.js)** ·129 — WEB2.0 shared module.
    - exposes: `Web2SoOrderUtils`
    - funcs (4): \_str, groupByOrder, orderGroupKey, parseReceivedItems
- **[web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js)** ·289 — WEB2.0 module.
    - exposes: `Web2SSE`
    - funcs (11): \_dispatchResync, \_openConnection, \_refreshConnectionForTopicChange, \_scheduleReconnect, \_scheduleResync, close, handleData, onerror, subscribe, topics, unsubscribe
- **[web2-sse-topics.js](../../web2/shared/web2-sse-topics.js)** ·28 — WEB2.0 module.
    - exposes: `Web2SSETopics`
    - uses shared: `Web2SSE`
- **[web2-supplier-pay.js](../../web2/shared/web2-supplier-pay.js)** ·398 — WEB2.0 module.
    - exposes: `Web2SupplierPay`
    - uses shared: `Web2Escape`, `Web2Format`, `Web2NumberInput`
    - funcs (20): \_ensureRoot, \_esc, \_fmtVnd, \_icons, \_injectStyle, \_notify, \_q, \_renderHistory, \_renderNcc, \_renderSummary, \_submit, \_todayVN, close, getSelectedSupplier, isOpen, norm, open, setAmount, setHistory, setSummary
- **[web2-suppliers-cache.js](../../web2/shared/web2-suppliers-cache.js)** ·280 — WEB2.0 module.
    - exposes: `Web2SuppliersCache`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2SmartCache`
    - funcs (17): \_authHeaders, \_ensureSmartCache, \_fetchSuppliers, \_getCache, \_normalize, \_notify, \_rebuildIndex, ensure, getNames, has, init, initPromise, onerror, onload, refresh, search, subscribe
- **[web2-text-utils.js](../../web2/shared/web2-text-utils.js)** ·41 — WEB2.0 shared — 1 NGUỒN chuẩn hoá text/tìm kiếm tiếng Việt cho Web 2.0.
    - exposes: `Web2TextUtils`
    - funcs (4): asciiUpper, includes, searchNormalize, stripDiacritics
- **[web2-translate.js](../../web2/shared/web2-translate.js)** ·74 — WEB2.0 module dùng chung.
    - exposes: `Web2Translate`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`
    - funcs (6): \_auth, \_base, status, toEn, toVi, translate
- **[web2-tryon.js](../../web2/shared/web2-tryon.js)** ·790 — WEB2.0 shared module.
    - exposes: `Web2Tryon`
    - uses shared: `Web2AiDescribe`, `Web2AiPresets`, `AiPresets`, `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`, `Web2ImagePaste`, `Web2Perm`, `Web2PosInstaller`
    - funcs (33): $, API, applyMode, authHeaders, buildPrompt, callGeminiMachine, callPaidNano, compressDataUrl, compressFile, curMax, destroy, discoverGemini, done, esc, hasStock, injectCss, isAdmin, mount, onPick, onerror, onload, pickStock, populateSrc, presets, refreshSrv, renderGarments, renderPerson, renderResultCard, run, startFakeProgress, stop, toast, workerUrl
- **[web2-unit-reprint.js](../../web2/shared/web2-unit-reprint.js)** ·294 — WEB2.0 shared — In lại tem ĐƠN VỊ (per-unit reprint). Đặc tả: docs/web2/PER-UNIT-QR-PLAN.md
    - exposes: `Web2UnitReprint`
    - uses shared: `Web2ProductUnits`, `Web2ProductsCache`
    - funcs (13): close, doPrint, ensureStyle, esc, icons, list, loadUnits, open, render, renderSearch, renderUnits, toggleAll, updateFooter
- **[web2-unread-panel.js](../../web2/shared/web2-unread-panel.js)** ·151 — WEB2.0 — panel "Tin nhắn chưa đọc" dùng chung (gộp từ payment-confirm vào ck-dashboard).
    - exposes: `Web2UnreadPanel`
    - uses shared: `API_CONFIG`, `Web2Escape`, `Web2Format`, `Web2SSE`, `Web2WalletBalance`
    - funcs (10): \_debouncedReload, ensureStyles, esc, fetchUnread, fmtTime, looksLikePaymentMsg, mount, normalize, reload, render
- **[web2-user-info.js](../../web2/shared/web2-user-info.js)** ·154 — WEB2.0 module.
    - exposes: `Web2UserInfo`
    - uses shared: `Web2Auth`
    - funcs (6): \_readLegacyAuth, \_readWeb2Auth, attachToBody, attachToPayload, detectSourcePage, label
- **[web2-user-profile.js](../../web2/shared/web2-user-profile.js)** ·479 — WEB2.0 module — Hồ sơ user + đổi avatar DiceBear (dùng chung mọi trang).
    - exposes: `Web2UserProfile`
    - uses shared: `Popup`, `Web2Auth`, `Web2DicebearCustomizer`, `Web2Sidebar`
    - funcs (18): $, avatarUrl, avatarUrlFor, close, ensureCustomizer, esc, fmtTs, injectCss, onChange, onerror, onload, open, randSeed, refreshBgs, refreshPreview, refreshStyles, saveAvatar, toast
- **[web2-variant-group.js](../../web2/shared/web2-variant-group.js)** ·240 — WEB2.0 shared.
    - exposes: `Web2VariantGroup`
    - uses shared: `Web2VariantMulti`
    - funcs (6): buildKey, cmpVariant, group, imgOf, normalizeName, variantSortKey
- **[web2-variant-multi.js](../../web2/shared/web2-variant-multi.js)** ·192 — WEB2.0 module.
    - exposes: `Web2VariantMulti`
    - uses shared: `Web2VariantsCache`
    - funcs (9): \_combine, \_dedupe, \_isSizeGroup, cartesian, classifyToken, detect, expand, parse, split
- **[web2-variant-picker.js](../../web2/shared/web2-variant-picker.js)** ·405 — WEB2.0 module.
    - exposes: `Web2VariantPicker`
    - uses shared: `Web2Escape`, `Web2ProductTypesCache`, `Web2VariantMulti`, `Web2VariantsCache`
    - funcs (24): bindInput, combinedCategory, combinedVariant, combos, destroy, ensureCss, esc, fire, fireQtyOnly, focus, genName, mount, onChange, payload, refresh, renderAll, renderPieces, renderPreview, renderTypes, setValue, splitPieces, toggleType, totalQty, variantQtys
- **[web2-variants-cache.js](../../web2/shared/web2-variants-cache.js)** ·253 — WEB2.0 module.
    - exposes: `Web2VariantsCache`
    - uses shared: `Web2ProductCode`, `Web2SmartCache`
    - funcs (19): \_emit, \_ensureSmartCache, \_fetchVariants, \_getCache, \_normalize, \_rebuild, findByValue, findByValueExact, getAll, getAllIncludingInactive, getColorShortMap, has, init, initPromise, onerror, onload, pushTickle, refresh, subscribe
- **[web2-video-render.js](../../web2/shared/web2-video-render.js)** ·91 — WEB2.0 shared — render HTML→MP4 qua máy shop (HyperFrames).
    - exposes: `Web2VideoRender`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`, `Web2Auth`
    - funcs (6): REGISTRY, listMachines, pickOnline, render, token, workerUrl
- **[web2-vieneu.js](../../web2/shared/web2-vieneu.js)** ·205 — WEB2.0 shared — kho Voice.
    - exposes: `Web2Vieneu`
    - uses shared: `WEB2_CONFIG`, `API_CONFIG`
    - funcs (15): \_ctx, \_decode, \_headers, \_need, \_registryBase, clone, getSecret, getUrl, health, listServers, listVoices, probeLocal, setSecret, setUrl, synthesize
- **[web2-vn-address.js](../../web2/shared/web2-vn-address.js)** ·319 — WEB2.0 shared — Web2VnAddress: bộ chọn Tỉnh/TP → Phường/Xã (2 cấp, dùng chung).
    - exposes: `Web2VnAddress`
    - funcs (22): \_dataUrl, \_injectStyles, \_opt, \_resolveEl, destroy, fillProvinces, fillWards, findProvince, findWard, getProvinces, getValue, getWards, init, isReady, load, mount, normName, onProvinceChange, onWardChange, refresh, setValue, stripDiacritics
- **[web2-wallet-api.js](../../web2/shared/web2-wallet-api.js)** ·227 — WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).
    - exposes: `Web2WalletApi`
    - uses shared: `Web2Auth`, `Web2Format`, `Web2PhoneUtils`, `Web2UserInfo`, `Web2WalletBalance`
    - funcs (12): \_authHeaders, \_userName, deposit, formatVnd, getTransactions, getWallet, getWalletsByPhones, jsonFetch, listWallets, normPhone, tryBatch, withdraw
- **[web2-wallet-balance.js](../../web2/shared/web2-wallet-balance.js)** ·335 — WEB2.0 — shared helper hiển thị số dư ví KH.
    - exposes: `Web2WalletBalance`
    - uses shared: `Web2Auth`, `Web2CustomerDetailModal`, `Web2Format`, `Web2PhoneUtils`, `Web2SSE`, `Web2WalletApi`
    - funcs (20): \_ensureModal, \_fetchBalance, \_fetchBatch, \_openDetail, \_ownBase, \_w2Auth, \_wireClick, \_wireSse, attachBalances, ensureStyles, fmtVnd, getBalance, getBalances, invalidate, normPhone, onerror, onload, p, pillHtml, tryFetch
- **[web2-watermark.js](../../web2/shared/web2-watermark.js)** ·212 — WEB2.0 shared module.
    - exposes: `Web2Watermark`
    - uses shared: `Web2LogoEraser`
    - funcs (9): \_compose, \_css, \_loadImg, done, onerror, onload, open, q, redraw
- **[web2-zalo-api.js](../../web2/shared/web2-zalo-api.js)** ·277 — WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).
    - exposes: `Web2ZaloOwner`, `ZaloApi`
    - uses shared: `API_CONFIG`, `Web2Auth`
    - funcs (45): \_authHeaders, \_fetch, \_qs, \_zaloOwner, accounts, addQuickReply, backfill, conversations, createAccount, deleteAccount, deleteMessage, disconnect, forward, friends, groupMembers, groups, lease, loadHistory, loginCookie, lookup, markConversation, messages, muteConversation, oaConnect, pinConversation, quickReplies, react, recall, release, releaseBeacon, seen, self, sendCs, sendFile, sendImage, sendMessage, sendSticker, sendZns, status, stickers, syncConversations, syncTemplates, typing, znsLog, znsTemplates
- **[web2-zalo-presence.js](../../web2/shared/web2-zalo-presence.js)** ·206 — WEB2.0 module.
    - exposes: `Web2ZaloPresence`
    - uses shared: `Web2Ext`, `ZaloApi`, `Web2Zalo`
    - funcs (14): \_acquireAll, \_acquireOne, \_api, \_ext, \_focused, \_heartbeat, \_onBlur, \_onFocus, \_onVisibility, \_personalKeys, \_releaseAll, \_state, ensure, start
- **[web2-zalo.js](../../web2/shared/web2-zalo.js)** ·388 — WEB2.0 shared — Web2Zalo helper (single-source Zalo).
    - exposes: `Web2Zalo`
    - uses shared: `API_CONFIG`, `Web2Auth`, `Web2Ext`, `Web2SSE`, `Web2WalletBalance`, `Web2ZaloOwner`, `ZaloApi`, `WZChat`
    - funcs (20): \_authHeaders, \_btnHtml, \_fetch, \_hasScript, \_loadCss, \_loadScript, \_wireClick, \_zaloOwner, attachZaloButtons, ensureStyles, getConversation, getCookieAccountKey, loadChatEngine, mountChat, normPhone, onerror, openChat, sendMessage, sendZNS, status
- **[bubbles.js](../../web2/shared/zalo-chat/bubbles.js)** ·269 — WEB2.0 module — Zalo chat message renderer.
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (11): \_legacy, \_msgUrl, body, bubbleKind, fmtText, imgTag, reactionsRow, renderMessages, replyRow, statusTick, tools
- **[chat-actions.js](../../web2/shared/zalo-chat/chat-actions.js)** ·104 — WEB2.0 module — Zalo chat actions (network + optimistic).
    - exposes: `WZChat`
    - uses shared: `Web2Optimistic`, `ZaloApi`, `WZChat`
    - funcs (7): deleteForMe, emitTyping, forward, markSeen, react, recall, throttled
- **[chat-store.js](../../web2/shared/zalo-chat/chat-store.js)** ·214 — WEB2.0 module — Zalo chat shared store + utils (WZChat.\*).
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (24): \_closeMenu, \_find, \_onMenuDoc, \_previewOf, addPending, avatarHtml, clearPending, clearReply, dayKey, dayLabel, esc, fmtTime, getPending, getReplyTarget, initial, markRecalled, markSeen, notify, openMenu, patchReaction, removePending, setConversation, setMessages, setReplyTarget
- **[chat-view.js](../../web2/shared/zalo-chat/chat-view.js)** ⚠️810 — WEB2.0 shared — Zalo chat VIEW (mount 1 hội thoại vào bất kỳ container).
    - exposes: `WZChat`
    - uses shared: `Popup`, `ZaloApi`, `Web2Zalo`, `WZChat`
    - funcs (44): \_bindSearch, \_clearSearch, \_computeMatches, \_fillAccChip, \_gotoMatch, \_loadAllForSearch, \_markInline, \_paintSearch, \_retry, \_runSearch, \_srchNorm, \_toggleSearch, \_updateSearchCount, bindBody, body, buildReplyQuote, destroy, doDeleteMe, doForward, doReact, doRecall, findMsg, headName, loadOlder, mountConversation, near, onSendFile, onSendMedia, onSendSticker, onSendText, onSendVoice, onTyping, optimistic, paint, reconcile, refetch, refresh, reload, renderBody, sendMediaRaw, sendTextRaw, setTyping, shell, updateHead
- **[composer.js](../../web2/shared/zalo-chat/composer.js)** ·597 — WEB2.0 module — Zalo chat composer (input đầy đủ).
    - exposes: `WZChat`
    - uses shared: `Popup`, `ZaloApi`, `WZChat`
    - funcs (36): \_applyMent, \_buildMentions, \_closeMent, \_fmtRecTime, \_isGroup, \_loadMembers, \_mentionCtx, \_normMent, \_onRecStop, \_recBar, \_renderMent, \_stopTracks, \_tickRec, \_updateMent, addFiles, ask, doSend, focus, grow, insert, items, mountComposer, ondataavailable, onerror, onload, openQuickReplies, readFile, refresh, renderReplyBar, renderTray, reset, saveQuickReply, setReply, startVoice, stopVoice, store
- **[emoji-picker.js](../../web2/shared/zalo-chat/emoji-picker.js)** ·105 — WEB2.0 module — Zalo chat emoji picker (client-only).
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (7): \_position, close, gridHtml, onDoc, openEmojiPicker, pushRecent, recents
- **[lightbox.js](../../web2/shared/zalo-chat/lightbox.js)** ·86 — WEB2.0 module — Zalo chat lightbox (xem ảnh full + prev/next).
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (6): close, collectThreadImages, go, onKey, openLightbox, render
- **[reactions.js](../../web2/shared/zalo-chat/reactions.js)** ·68 — WEB2.0 module — Zalo chat reaction bar (add-only).
    - exposes: `WZChat`
    - uses shared: `WZChat`
    - funcs (5): close, onDoc, onKey, openReactionBar, reactionEmoji
- **[realtime.js](../../web2/shared/zalo-chat/realtime.js)** ·56 — WEB2.0 module — Zalo chat realtime (SSE patch).
    - exposes: `WZChat`
    - uses shared: `Web2SSE`, `Web2ZaloOwner`, `WZChat`
    - funcs (5): handle, onTyping, refetch, subscribeRealtime, unsub
- **[sticker-picker.js](../../web2/shared/zalo-chat/sticker-picker.js)** ·113 — WEB2.0 module — Zalo chat sticker picker.
    - exposes: `WZChat`
    - uses shared: `ZaloApi`
    - funcs (8): cellHtml, close, load, onDoc, openStickerPicker, pushRecent, recents, setGrid

## 4. Hàm trùng tên (≥3 file) — ứng viên rút vào `web2/shared/`

| Hàm                 | Số file | Gợi ý                                                 | Files                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toast`             | 20      |                                                       | comments-mobile-actions.js, live-livestream-snap-actions.js, ai-assistant.js, ai-hub.js, cham-cong-app.js, chi-tieu-app.js, clearance.js, goods-weight.js, live-control.js, payment-confirm-app.js, returns-core.js, web2-ai-describe.js, web2-ck-assign-picker.js, web2-ck-review.js, web2-content-maker.js, web2-gemini-chat.js, web2-tryon.js, web2-user-profile.js, unit-scan.js, video-stock.js                                   |
| `ensureStyles`      | 19      | → CSS shared / theme thay vì inject lặp               | native-orders-kpi-health.js, web2-link-customer-modal.js, web2-manual-deposit.js, web2-pm-modal.js, web2-beauty-studio.js, popup.js, web2-barcode-scanner.js, web2-command-palette.js, web2-customer-chat-core.js, web2-image-editor.js, web2-label-ocr.js, web2-logo-eraser.js, web2-order-tag-detail.js, web2-pack-counter.js, web2-product-counter.js, web2-qr-modal.js, web2-unread-panel.js, web2-wallet-balance.js, web2-zalo.js |
| `escapeHtml`        | 15      | → `Web2Escape` (web2-escape.js)                       | inventory-panel-state.js, utils.js, ai-hub.js, web2-partner-enricher.js, pbh-state.js, pancake-settings-state.js, page-builder.js, web2-command-palette.js, web2-escape.js, web2-import.js, web2-kpi.js, web2-notification-bell.js, web2-order-tag-pill.js, web2-sidebar.js, system-services.js                                                                                                                                        |
| `fmtTime`           | 15      | → shared format ngày/giờ GMT+7 (nên gom `Web2Format`) | comments-mobile-state.js, live-order-history.js, web2-pm-core.js, web2-customer-wallet-state.js, goods-weight.js, live-tv.js, web2-product-detail.js, web2-chat-panel-state.js, web2-audit-log.js, chat-store.js, supplier-debt-state.js, supplier-wallet-state.js, system-sse.js, unit-scan.js, web2-zalo-utils.js                                                                                                                    |
| `openHistory`       | 13      |                                                       | native-orders-public-api.js, dlv-app.js, pbh-render.js, rf-app.js, fb-posts-drafts.js, fb-posts-list.js, live-control.js, order-tags-app.js, web2-products-modal.js, returns-app.js, page-builder.js, supplier-debt-render.js, supplier-wallet-render.js                                                                                                                                                                               |
| `renderList`        | 13      | → `Web2Page` (page-builder) nếu là list-page          | ai-chat.js, chi-tieu-app.js, clearance.js, web2-customer-wallet-render.js, jt-tracking-render.js, purchase-refund-render.js, reconcile-render.js, returns-tabs.js, web2-command-palette.js, web2-gemini-chat.js, supplier-wallet-render.js, system-ai-suggestions.js, users-app.js                                                                                                                                                     |
| `_esc`              | 12      | → `Web2Escape` (web2-escape.js)                       | live-chat-modal.js, live-hidden-commenters.js, live-livestream-gallery.js, live-livestream-snap-state.js, pancake-livestream-filter.js, web2-ai-presets.js, web2-avatar-utils.js, web2-bill-service.js, web2-dicebear-customizer.js, web2-image-lightbox.js, web2-image-paste.js, system-app.js                                                                                                                                        |
| `closeModal`        | 12      | → `Web2Page` (page-builder) nếu là list-page          | live-customer-panel.js, web2-link-customer-modal.js, web2-pm-modal.js, customers-detail.js, order-tags-app.js, web2-product-types-app.js, web2-products-modal.js, web2-products-print-modal.js, purchase-refund-modal.js, page-builder.js, system-services.js, web2-variants-app.js                                                                                                                                                    |
| `isAdmin`           | 11      |                                                       | native-orders-render.js, native-orders-state.js, ai-hub.js, web2-manual-deposit.js, goods-weight.js, live-control.js, overview.js, web2-kpi.js, web2-perm.js, web2-tryon.js, system-sse.js                                                                                                                                                                                                                                             |
| `injectCss`         | 10      |                                                       | web2-ai-assistant.js, web2-ai-describe.js, web2-ck-review.js, web2-content-maker.js, web2-gemini-chat.js, web2-lottie.js, web2-skeleton.js, web2-tryon.js, web2-user-profile.js, video-stock.js                                                                                                                                                                                                                                        |
| `reload`            | 10      |                                                       | live-livestream-gallery.js, web2-bh-data.js, pbh-app.js, live-tv.js, payment-confirm-app.js, web2-audit-log.js, web2-unread-panel.js, chat-view.js, system-ai-suggestions.js, system-sse.js                                                                                                                                                                                                                                            |
| `renderPagination`  | 10      | → `Web2Page` (page-builder) nếu là list-page          | native-orders-render.js, web2-bh-render.js, web2-customer-wallet-render.js, customers-render.js, dlv-app.js, pbh-render.js, rf-app.js, web2-products-render.js, page-builder.js, supplier-debt-render.js                                                                                                                                                                                                                               |
| `workerBase`        | 10      |                                                       | ai-assistant.js, ai-hub.js, multi-tool.js, web2-ai-assistant.js, web2-campaign.js, web2-fb-client.js, web2-gemini-client.js, web2-order-tag-detail.js, video-ai-script.js, video-stock.js                                                                                                                                                                                                                                              |
| `applyFilters`      | 9       | → `Web2Page` (page-builder) nếu là list-page          | native-orders-filters-campaigns.js, dlv-app.js, pbh-filters.js, rf-app.js, web2-product-types-app.js, web2-products-filters.js, purchase-refund-render.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                       |
| `norm`              | 9       |                                                       | live-init-lifecycle.js, live-customer-sync.js, so-order-app.js, so-order-kho-sync.js, multi-tool.js, web2-command-palette.js, web2-phone-utils.js, web2-printer.js, web2-supplier-pay.js                                                                                                                                                                                                                                               |
| `openModal`         | 9       |                                                       | web2-link-customer-modal.js, web2-pm-modal.js, customers-detail.js, fb-ads-manual.js, order-tags-app.js, purchase-refund-modal.js, web2-customer-chat-modal.js, web2-quick-reply.js, system-services.js                                                                                                                                                                                                                                |
| `renderRows`        | 9       | → `Web2Page` (page-builder) nếu là list-page          | native-orders-render.js, dlv-app.js, pbh-render.js, rf-app.js, web2-product-types-app.js, web2-products-render.js, page-builder.js, web2-customer-chat-modal.js, web2-variants-app.js                                                                                                                                                                                                                                                  |
| `switchTab`         | 9       |                                                       | ai-hub.js, ck-dashboard-app.js, fb-posts-app.js, payment-confirm-app.js, returns-tabs.js, web2-customer-chat-modal.js, web2-customer-detail-modal.js, web2-import.js, web2-zalo-app.js                                                                                                                                                                                                                                                 |
| `done`              | 8       |                                                       | ai-image.js, jt-tracking-modals.js, web2-product-detail.js, web2-bg-scene.js, web2-customer-chat.js, web2-tryon.js, web2-watermark.js, video-beauty-export.js                                                                                                                                                                                                                                                                          |
| `fmtVnd`            | 8       | → shared format tiền (nên gom `Web2Format`)           | native-orders-kpi.js, cham-cong-salary.js, chi-tieu-app.js, clearance.js, kpi-dashboard.js, web2-product-detail.js, web2-kpi.js, unit-scan.js                                                                                                                                                                                                                                                                                          |
| `generate`          | 8       |                                                       | pancake-page-access-tokens.js, ai-image.js, fb-posts-composer.js, web2-content-maker.js, web2-gemini-client.js, web2-html-skill.js, web2-product-code.js, video-ai-script.js                                                                                                                                                                                                                                                           |
| `icons`             | 8       |                                                       | clearance.js, goods-weight.js, jt-tracking-constants.js, order-tags-app.js, web2-product-detail.js, web2-order-tag-detail.js, web2-unit-reprint.js, unit-scan.js                                                                                                                                                                                                                                                                       |
| `renderCounters`    | 8       |                                                       | native-orders-render.js, dlv-app.js, pbh-render.js, rf-app.js, web2-product-types-app.js, web2-products-render.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                               |
| `_fetchJson`        | 7       |                                                       | live-native-orders-api.js, native-orders-api.js, web2-product-types-api.js, web2-api.js, web2-chat-utils.js, web2-products-api.js, web2-variants-api.js                                                                                                                                                                                                                                                                                |
| `_notify`           | 7       |                                                       | native-orders-packing-slip.js, web2-customer-detail-modal.js, web2-image-paste.js, web2-optimistic.js, web2-quick-reply.js, web2-supplier-pay.js, web2-suppliers-cache.js                                                                                                                                                                                                                                                              |
| `boot`              | 7       |                                                       | clearance.js, goods-weight.js, live-control.js, live-tv.js, overview.js, web2-lottie.js, unit-scan.js                                                                                                                                                                                                                                                                                                                                  |
| `health`            | 7       |                                                       | native-orders-api.js, web2-product-types-api.js, web2-api.js, web2-gemini-client.js, web2-products-api.js, web2-vieneu.js, web2-variants-api.js                                                                                                                                                                                                                                                                                        |
| `openEdit`          | 7       |                                                       | native-orders-modal-edit.js, cham-cong-payroll.js, order-tags-app.js, web2-product-types-app.js, web2-products-modal.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                         |
| `_emit`             | 6       |                                                       | web2-beauty-face.js, web2-product-types-cache.js, web2-products-cache.js, web2-realtime.js, web2-smart-cache.js, web2-variants-cache.js                                                                                                                                                                                                                                                                                                |
| `_normalize`        | 6       |                                                       | web2-pm-core.js, web2-image-lightbox.js, web2-product-types-cache.js, web2-products-cache.js, web2-suppliers-cache.js, web2-variants-cache.js                                                                                                                                                                                                                                                                                          |
| `_w2AuthHeaders`    | 6       | → `Web2Auth.authHeaders`                              | live-api.js, live-campaign-manager.js, live-init-state.js, live-livestream-snap-state.js, live-native-orders-api.js, pancake-api.js                                                                                                                                                                                                                                                                                                    |
| `card`              | 6       |                                                       | clearance.js, fb-ads-manual.js, fb-ads-stats.js, fb-insights.js, web2-qr.js, system-thirdparty.js                                                                                                                                                                                                                                                                                                                                      |
| `clearFilters`      | 6       |                                                       | native-orders-filters-campaigns.js, dlv-app.js, pbh-filters.js, rf-app.js, web2-products-filters.js, page-builder.js                                                                                                                                                                                                                                                                                                                   |
| `goPage`            | 6       |                                                       | native-orders-pbh-bill.js, dlv-app.js, pbh-filters.js, rf-app.js, web2-products-filters.js, page-builder.js                                                                                                                                                                                                                                                                                                                            |
| `jsonFetch`         | 6       |                                                       | web2-bh-core.js, web2-link-customer-modal.js, web2-manual-deposit.js, web2-pm-core.js, web2-customer-wallet-state.js, web2-wallet-api.js                                                                                                                                                                                                                                                                                               |
| `loadHistory`       | 6       |                                                       | ai-image.js, ck-dashboard-app.js, kpi-assignments.js, reconcile-api.js, web2-ai-assistant.js, web2-zalo-api.js                                                                                                                                                                                                                                                                                                                         |
| `normalize`         | 6       |                                                       | live-status.js, payment-confirm-app.js, delivery-method-picker.js, web2-customer-store.js, web2-unread-panel.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                            |
| `normPhone`         | 6       | → `Web2CustomerStore` (normPhone)                     | live-kho-enricher.js, web2-partner-enricher.js, web2-customer-wallet-state.js, customers-state.js, web2-customer-store.js, web2-zalo.js                                                                                                                                                                                                                                                                                                |
| `ready`             | 6       |                                                       | live-init-lifecycle.js, web2-beauty-face.js, web2-idb-store.js, web2-logo-eraser.js, web2-pack-counter.js, web2-qr.js                                                                                                                                                                                                                                                                                                                  |
| `renderAll`         | 6       |                                                       | so-order-render.js, web2-chat-panel-render.js, web2-variant-picker.js, system-modules.js, system-services.js, system-thirdparty.js                                                                                                                                                                                                                                                                                                     |
| `renderStats`       | 6       |                                                       | web2-bh-render.js, ck-dashboard-app.js, kpi-assignments.js, overview.js, web2-chat-panel-render.js, unit-scan.js                                                                                                                                                                                                                                                                                                                       |
| `rowHtml`           | 6       |                                                       | so-order-render.js, fb-ads-manual.js, fb-posts-drafts.js, jt-tracking-render.js, web2-audit-log.js, web2-product-picker.js                                                                                                                                                                                                                                                                                                             |
| `saveModal`         | 6       |                                                       | customers-detail.js, order-tags-app.js, web2-product-types-app.js, web2-products-modal.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                       |
| `wire`              | 6       |                                                       | fb-ads-manual.js, fb-posts-composer.js, live-control.js, live-tv.js, order-tags-app.js, web2-dicebear-customizer.js                                                                                                                                                                                                                                                                                                                    |
| `workerUrl`         | 6       |                                                       | web2-chat-panel-state.js, web2-ai-describe.js, web2-customer-store.js, web2-html-skill.js, web2-tryon.js, web2-video-render.js                                                                                                                                                                                                                                                                                                         |
| `_api`              | 5       |                                                       | live-campaign-manager.js, pancake-livestream-filter.js, so-order-image-manager.js, web2-zalo-presence.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                                   |
| `_ensureSmartCache` | 5       |                                                       | web2-customer-store.js, web2-product-types-cache.js, web2-products-cache.js, web2-suppliers-cache.js, web2-variants-cache.js                                                                                                                                                                                                                                                                                                           |
| `_injectCss`        | 5       |                                                       | web2-ai-presets.js, web2-bg-scene.js, web2-db-badge.js, web2-dicebear-customizer.js, web2-history-timeline.js                                                                                                                                                                                                                                                                                                                          |
| `_user`             | 5       |                                                       | live-livestream-gallery.js, live-livestream-snap-state.js, inventory-panel-state.js, returns-api.js, web2-perm.js                                                                                                                                                                                                                                                                                                                      |
| `cardHtml`          | 5       |                                                       | comments-mobile-render.js, web2-customer-wallet-render.js, live-tv.js, web2-ai-presets.js, supplier-wallet-render.js                                                                                                                                                                                                                                                                                                                   |
| `ensure`            | 5       |                                                       | web2-ai-assistant.js, web2-product-units.js, web2-suppliers-cache.js, web2-zalo-presence.js, supplier-wallet-api.js                                                                                                                                                                                                                                                                                                                    |
| `exportCsv`         | 5       |                                                       | web2-bh-chat-export.js, web2-customer-wallet-events.js, customers-detail.js, pbh-actions.js, supplier-debt-render.js                                                                                                                                                                                                                                                                                                                   |
| `finish`            | 5       |                                                       | live-livestream-gallery.js, live-livestream-snap-stream.js, so-order-confirm.js, so-order-inline-edit.js, web2-image-editor.js                                                                                                                                                                                                                                                                                                         |
| `flush`             | 5       |                                                       | live-kho-enricher.js, so-order-storage-sync.js, so-order-storage.js, web2-partner-enricher.js, supplier-wallet-storage.js                                                                                                                                                                                                                                                                                                              |
| `fmtDate`           | 5       | → shared format ngày/giờ GMT+7 (nên gom `Web2Format`) | web2-customer-wallet-state.js, pbh-state.js, fb-insights.js, multi-tool.js, purchase-refund-state.js                                                                                                                                                                                                                                                                                                                                   |
| `fmtMoney`          | 5       | → shared format tiền (nên gom `Web2Format`)           | live-order-history.js, customers-state.js, pbh-state.js, purchase-refund-state.js, reconcile-state.js                                                                                                                                                                                                                                                                                                                                  |
| `initialize`        | 5       |                                                       | column-manager.js, settings-manager.js, live-init.js, pancake-init.js, pancake-token-manager.js                                                                                                                                                                                                                                                                                                                                        |
| `openCreate`        | 5       |                                                       | order-tags-app.js, web2-product-types-app.js, web2-products-modal.js, page-builder.js, web2-variants-app.js                                                                                                                                                                                                                                                                                                                            |
| `parseTs`           | 5       |                                                       | comments-mobile-state.js, fb-insights.js, multi-tool.js, web2-chat-panel-state.js, web2-format.js                                                                                                                                                                                                                                                                                                                                      |
| `renderSummary`     | 5       |                                                       | clearance.js, returns-form.js, system-ai-suggestions.js, system-modules.js, system-thirdparty.js                                                                                                                                                                                                                                                                                                                                       |

_…và 123 hàm trùng khác (xem web2-codemap.json)._

## 5. File quá lớn (> 800 dòng) — cần tách module

| File                                                                                           | Dòng |
| ---------------------------------------------------------------------------------------------- | ---- |
| [web2/shared/web2-ai-page-registry.js](../../web2/shared/web2-ai-page-registry.js)             | 1871 |
| [web2/video-maker/js/video-maker.js](../../web2/video-maker/js/video-maker.js)                 | 1616 |
| [web2/shared/web2-ai-assistant.js](../../web2/shared/web2-ai-assistant.js)                     | 1335 |
| [web2/live-control/js/live-control.js](../../web2/live-control/js/live-control.js)             | 1085 |
| [so-order/js/so-order-render.js](../../so-order/js/so-order-render.js)                         | 1039 |
| [web2/users/js/users-app.js](../../web2/users/js/users-app.js)                                 | 982  |
| [web2/shared/web2-sidebar.js](../../web2/shared/web2-sidebar.js)                               | 981  |
| [so-order/js/so-order-storage.js](../../so-order/js/so-order-storage.js)                       | 954  |
| [native-orders/js/native-orders-render.js](../../native-orders/js/native-orders-render.js)     | 939  |
| [web2/cham-cong/js/cham-cong-app.js](../../web2/cham-cong/js/cham-cong-app.js)                 | 901  |
| [web2/shared/web2-ai-presets.js](../../web2/shared/web2-ai-presets.js)                         | 897  |
| [native-orders/js/native-orders-pbh-bill.js](../../native-orders/js/native-orders-pbh-bill.js) | 849  |
| [web2/shared/web2-effects.js](../../web2/shared/web2-effects.js)                               | 815  |
| [web2/shared/zalo-chat/chat-view.js](../../web2/shared/zalo-chat/chat-view.js)                 | 810  |
| [web2/photo-studio/photo-studio-edit.js](../../web2/photo-studio/photo-studio-edit.js)         | 806  |
