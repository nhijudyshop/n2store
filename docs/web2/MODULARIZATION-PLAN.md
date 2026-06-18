<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 — kế hoạch tách module toàn bộ Web 2.0. Cập nhật checkbox khi xong từng file. -->

# WEB2 MODULARIZATION PLAN — Tách module toàn bộ Web 2.0

> **Mục tiêu**: đưa MỌI file Web 2.0 về **200–400 dòng (max 800)**, gom logic trùng vào **shared 1 nguồn** (`web2/shared/`), trang chỉ điều phối. Dễ bảo trì + logic thống nhất.
>
> **2 file quản lý đi kèm (đọc TRƯỚC khi code)**:
>
> - [`WEB2-CODEMAP.md`](WEB2-CODEMAP.md) — bản đồ code AUTO-GENERATED (trang nào, file gì, hàm gì, shared nào, hàm trùng ở đâu). Sinh lại: `node scripts/gen-web2-codemap.js`.
> - [`modularization-blueprints.json`](modularization-blueprints.json) — blueprint chi tiết từng file (29 file) + waves + 13 shared dedup, từ discovery 29-agent (2026-06-18).

## Hiện trạng (2026-06-18)

30 file > 800 dòng (xem §5 codemap). Tệ nhất: `native-orders-app.js` 9456, `so-order-app.js` 5931, `live-livestream-snap.js` 4568.
138 → 103 tên hàm trùng ≥3 file (sau denoise) — phần lớn là util đã/nên có shared.

---

## Wave 0 — Foundation shared modules (LÀM TRƯỚC TIÊN)

Gom các util trùng khắp nơi thành shared 1 nguồn. **Làm trước** vì mọi wave sau import shared thay vì copy → split nhẹ hơn, và đây CHÍNH LÀ "share dùng chung" mà codemap §4 chỉ ra.

| Shared mới/mở rộng                                                       | Global                     | Thay cho (hàm trùng)                                    | #file dùng |
| ------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------- | ---------- |
| `web2/shared/web2-escape.js` (đã có)                                     | `Web2Escape`               | `escapeHtml` / `_esc` (38 file)                         | adopt rộng |
| `web2/shared/web2-format.js` (MỚI)                                       | `Web2Format`               | `fmtVnd`/`fmtMoney`/`fmtDate`/`fmtTime` GMT+7 (48 file) | ~30        |
| `web2/shared/web2-auth.js` (mở rộng)                                     | `Web2Auth.authHeaders`     | `_authHeaders`/`authHeaders`/`_w2Auth` (40 file)        | ~25        |
| `web2/shared/web2-api-fetch.js` (MỚI)                                    | `Web2ApiFetch`             | `jsonFetch`/`_fetchJson`/`withFallback` (11 file)       | ~8         |
| `web2/shared/web2-phone-utils.js` (MỚI) hoặc gom vào `Web2CustomerStore` | `Web2PhoneUtils.normPhone` | `normPhone` (10 file)                                   | ~8         |
| `web2/shared/web2-text-utils.js` (MỚI)                                   | `Web2TextUtils`            | `stripDiacritics`/`searchNormalize`/`asciiUpper`        | ~6         |
| `web2/shared/web2-avatar-utils.js` (MỚI)                                 | `Web2AvatarUtils`          | avatar color/initial + img proxy fallback               | ~5         |
| `web2/shared/web2-jwt-utils.js` (MỚI)                                    | `Web2JwtUtils`             | base64url decode + expiry (`isTokenExpired`)            | ~3         |
| `web2/shared/web2-notify.js` (MỚI)                                       | `Web2Notify`               | `notify` (notificationManager + Popup fallback)         | ~5         |
| `web2/shared/web2-so-order-utils.js` (MỚI)                               | `Web2SoOrderUtils`         | parse + group received items theo (NCC, shipment)       | ~4         |
| `web2/shared/web2-image-lightbox.js` (MỚI)                               | `Web2ImageLightbox`        | lightbox + thumbnail strip                              | ~3         |
| `web2/shared/web2-canvas-utils.js` (MỚI)                                 | `Web2CanvasUtils`          | sizeCanvas/canvasToBlob/blobToBase64/fileToDataUrl      | ~3         |
| `web2/shared/web2-pancake-import.js` (MỚI)                               | `Web2PancakeImport`        | lookupDeep/searchConversations fallback                 | ~3         |

**Adoption**: mỗi shared mới làm xong → thêm `<script src>` vào các trang dùng + thay hàm cục bộ bằng shared (giữ fallback defensive `window.Web2Format?.vnd ?? localFmt`). KHÔNG xoá hàng loạt một lúc — adopt dần theo wave để dễ verify.

- [x] **Web2Format** — `web2/shared/web2-format.js` (num/vnd/date/time/dateTime/rel/parseTs, GMT+7). Verified live.
- [x] **Web2Auth.authHeaders** — đã có sẵn (`web2-auth.js:196`), KHÔNG cần tạo, chỉ adopt.
- [x] **Web2ApiFetch** — `web2/shared/web2-api-fetch.js` (json/withFallback/authHeaders).
- [x] **Web2Escape** — đã có sẵn (`web2-escape.js`); nay auto-load mọi trang qua sidebar.
- [x] **Web2PhoneUtils** — `web2/shared/web2-phone-utils.js` (norm/isValid/display). _Web2CustomerStore.normPhone delegate dần sau._
- [x] **Web2TextUtils** — `web2/shared/web2-text-utils.js` (stripDiacritics/searchNormalize/asciiUpper/includes).
- [x] **Web2Notify** — `web2/shared/web2-notify.js` (show/success/error/warning/info).
- [x] **Auto-load**: 5 module mới + Web2Escape đăng ký trong `web2-sidebar.js` → có mặt MỌI trang. Verified live overview (7/7 global true, vnd/dateTime GMT+7/phone/search OK).
- [ ] Web2AvatarUtils / Web2JwtUtils (làm khi chạm wave dùng)
- [ ] Web2SoOrderUtils / Web2ImageLightbox / Web2CanvasUtils / Web2PancakeImport (feature-specific, làm khi chạm wave liên quan)
- [ ] **Adoption**: thay hàm copy cục bộ bằng shared — làm DẦN theo từng wave (giữ fallback defensive).

---

## Wave 1 — Low-risk standalone (5 file)

Mỗi file 1 agent sở hữu end-to-end, verify độc lập. Không đụng global dùng chung phức tạp.

- [ ] **`live-chat/server/server.js`** (1216) → 11 module (relay, event-store, db, firebase-loader, pancake-api, page-selection-db, pancake-client, client-manager, browser-broker, routes, middleware) + entry 120L. _Node-side, không hazard DOM._
- [ ] **`web2/jt-tracking/js/jt-tracking-app.js`** (1090) → constants / api / state / render / modals / actions / app(orchestrator). Đã dùng Web2CustomerChat.
- [ ] **`web2/fastsaleorder-invoice/pbh-app.js`** (1027) → state / api / render-table / render-modals / actions / filters / customer-filter / bulk-selection / utils / app. _Gom render-modals + bulk vào ít file hơn nếu nhỏ._
- [ ] **`web2/zalo/js/web2-zalo-app.js`** (886) → utils / state / tabs / accounts / chat / lookup / zns / bind.
- [ ] **`web2/returns/js/returns-app.js`** (867) → state / constants / utils / customer / form-controls / order / items / cod / submit / list / pending / main. _Gộp xuống ~7 file (tránh file 40L)._

## Wave 2 — Medium coupling + shared API/token (6 file)

Đụng token/auth/money hoặc là shared module nhiều trang dùng → tách TRƯỚC monster (Web2Chat/token namespace phải ổn định). Verify kỹ.

- [ ] **`live-chat/js/pancake/pancake-token-manager.js`** (1310) → token-manager(class) / token-storage / token-codec / page-access-tokens / token-sources.
- [ ] **`web2/shared/web2-chat-client.js`** (1199) → chat-utils / chat-tokens / chat-settings / chat-api / chat-live / chat-tags / chat-client(facade). **Giữ `window.Web2Chat` byte-identical.**
- [ ] **`web2/products/js/web2-products-print.js`** (1293) → print-modal / print-render / print-barcode / print-overlay / print-utils.
- [ ] **`web2/customer-wallet/js/web2-customer-wallet-app.js`** (1314) → state / api / render / events / app. ⚠ money flow → giữ await + loading.
- [ ] **`web2/balance-history/js/web2-balance-history-app.js`** (1280) → utils / state / dom-cache / render / data-load / actions / link-customer / reassign-modal / customer-chat / export / events / init. _Gộp xuống ~8 file._
- [ ] **`web2/balance-history/js/web2-pending-match.js`** (914) → api / format / modal-dom / search / customer-search / fb-inline / picker / resolve / render / state / badge / main. _Gộp xuống ~7-8 file._

## Wave 3 — Monsters & high-coupling (18 file)

Deep shared mutable STATE, multi-subsystem, cross-module closures, realtime/extension coupling. Làm sau cùng, mỗi file 1 phiên riêng cẩn thận + smoke kỹ. **native-orders + so-order là trang user dùng nhiều nhất → ưu tiên an toàn, side-by-side verify.**

- [ ] **`native-orders/js/native-orders-app.js`** (9456) → ~22 module (state, columns, dom-helpers, avatar, snapshots, customer-panel, rows-render, delivery-badge, edit-modal, product-picker, bill-print, data-load, filters, campaign-filter, bulk-ops, sse, init, **interactions-modal → Web2CustomerChat (Task 1 chat unification)**, extension-bridge, inbox-create, sidebar-filter, chat-state…). Gộp về ~12-15 module thực dụng. **CHẬM + kỹ.**
- [ ] **`so-order/js/so-order-app.js`** (5931) + **`so-order/js/so-order-storage.js`** (961)
- [ ] **live-chat cluster**: `live-livestream-snap.js` (4568), `live-comment-list.js` (2459), `live-init.js` (1136), `comments-mobile.js` (1131), `inventory-panel.js` (1177)
- [ ] **`web2/photo-studio/photo-studio.js`** (2348)
- [ ] **`web2/products/js/web2-products-app.js`** (2010)
- [ ] **`web2/purchase-refund/js/purchase-refund-app.js`** (1634)
- [ ] **`web2/supplier-debt/js/supplier-debt-app.js`** (1394)
- [ ] **`web2/supplier-wallet/js/supplier-wallet-app.js`** (912)
- [ ] **`web2/customers/js/customers-app.js`** (914)
- [ ] **`web2/pancake-settings/js/pancake-settings.js`** (1305)
- [ ] **`web2/reconcile/js/reconcile-app.js`** (1106)
- [ ] **`web2/shared/web2-msg-template.js`** (961)
- [ ] **`web2/shared/web2-customer-chat.js`** (842) — chính là component chat hợp nhất; tách view/launcher/modal.

---

## Split Protocol (vanilla-JS, KHÔNG bundler) — MỌI agent split TUÂN THỦ

1. **IIFE → namespace**: file gốc là 1 IIFE với `let/var` private. Split → đưa state/dùng-chung lên 1 object namespace tường minh (vd `window.NativeOrders = window.NativeOrders || {}`), các module con đọc/ghi qua đó. KHÔNG để 2 module giữ bản sao state.
2. **Script load order = dependency graph mới**: thứ tự `<script>` trong HTML quyết định đúng/sai (no bundler). Thứ tự an toàn: constants/state → utils → api → render → actions/events → app(orchestrator) cuối. Cập nhật `index.html` đúng thứ tự.
3. **Public API facade byte-identical**: HTML render inline `onclick="window.NativeOrdersApp.foo()"`. Sau split, file orchestrator phải re-export Y HỆT `window.NativeOrdersApp` (mọi method cũ). Không đổi tên global đối ngoại.
4. **Shared mutable STATE + generation tokens**: `_renderGen`/`_loadGen`/`_seq` chống stale-render. Giữ nguyên cơ chế, đặt trong state module dùng chung.
5. **Timers / observers / listeners**: debounce/poll/heartbeat, IntersectionObserver, MutationObserver, SSE/WS — giữ teardown/cleanup đúng chỗ, đừng để leak khi tách.
6. **Realtime hub tách lớp**: Web 2.0 = `Web2SSE` topic `web2:<entity>`; KHÔNG dùng hub Web 1.0. Giữ nguyên topic.
7. **Money/token/auth await-preserving**: ví/deposit/refund + DELETE force-confirm là NGOẠI LỆ UI-first → giữ `await` + loading state (xem CLAUDE.md quy tắc 8).
8. **Extension bridge**: gửi tin extension-first (bypass 24h) → Web2Chat fallback → error, kèm global-ID resolve. Giữ nguyên nhánh.
9. **GMT+7**: Pancake `inserted_at` UTC không `Z` → append `Z`; Render server TZ=+7. Convert chỉ ở tầng hiển thị.
10. **Cross-layer ban**: web2/ KHÔNG import orders-report/legacy; được dùng `shared/js/*`. shared mới đặt ở `web2/shared/`.
11. **Inline CSS convention**: modal/CSS Web 2.0 thường inline — giữ pattern, đừng tách ra file CSS ngoài trừ khi đã vậy.
12. **Cohesion > fragmentation**: nhắm 200–400 dòng/module; **đừng tạo file 30–50 dòng** vụn vặt (blueprint đôi chỗ over-split → gộp lại cho hợp lý).

## Execution model

- 1 agent / 1 file (worktree isolation khi chạy song song nhiều file để tránh đụng `index.html` chung folder).
- Sau mỗi file: `node scripts/gen-web2-codemap.js` (cập nhật bản đồ) + smoke trang qua browser session (load không lỗi console + flow chính chạy).
- Commit theo từng trang/file. Cập nhật checkbox file này + dev-log.
- Wave 1 → 2 → 0-adopt-dần → 3. (Wave 0 foundation có thể làm xen kẽ: tạo module trước, adopt theo wave.)

---

## Tiến độ tổng

- [x] Discovery 29-agent + synthesis (2026-06-18) → blueprints.json
- [x] Codemap generator + WEB2-CODEMAP.md (auto) — 2026-06-18
- [ ] Wave 0 foundation shared
- [ ] Wave 1 (5)
- [ ] Wave 2 (6)
- [ ] Wave 3 (18)
- [ ] Task 1 chat unification (native-orders interactions-modal → Web2CustomerChat) — nằm trong Wave 3 native-orders
