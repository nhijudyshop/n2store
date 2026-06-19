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

- [x] **`live-chat/server/server.js`** (1216) → **12 module** (relay/middleware/event-store/db/firebase-loader/pancake-api/page-selection-db/pancake-client[325]/client-manager/browser-broker/routes[351]/entry[173]). MOVE-only; modules side-effect-free on require (factory/class), entry làm toàn bộ connect/listen/wire. node --check 12/12 PASS; require-smoke (stub pg/ws) confirm no load-time side-effect. WS Phoenix protocol/heartbeat/token-load priority/relay/dedup/routes/middleware/graceful-shutdown verbatim. ✅ **DEPLOYED + VERIFIED LIVE 2026-06-19**: web2-realtime auto-deploy commit split (44a1df8); smoke 3/3 PASS trên `web2-realtime.onrender.com` (`/health/detailed` báo Pancake WS client **connected:true, 4 pages, 265 events**) → split chạy end-to-end OK. (Host thật = web2-realtime, không phải n2store-tpos-pancake như doc cũ.)
- [x] **`web2/jt-tracking/js/jt-tracking-app.js`** (1090) → 7 module: constants(115) / api(42) / state(124) / render(279) / modals(229) / actions(313) / app(132). ✅ Verified live (0 JS err, 204 rows render). Không có inline onclick (data-\* + delegation).
- [x] **`web2/fastsaleorder-invoice/pbh-app.js`** (1027) → 6 module: state(88) / api(57) / render(422) / actions(366) / filters(89) / app(130). ✅ `window.PbhApp` 12 method byte-identical (8 inline onclick OK). Money/order ops giữ await. Verified live.
- [x] **`web2/zalo/js/web2-zalo-app.js`** (886) → 5 module: utils[WZApp](160) / accounts(311) / chat(184) / lookup-zns(151) / app(177). ✅ 4 tab OK, `__wzAvErr` giữ. Verified live 0 JS err.
- [x] **`web2/returns/js/returns-app.js`** (867) → 7 module: core(72) / customer(144) / order-items(135) / cod(64) / form(216) / tabs(191) / app(187). ✅ Verified live (0 JS err, switchTab OK, COD/wallet money giữ await). `window.Web2Returns` giữ nguyên.

## Wave 2 — Medium coupling + shared API/token (6 file)

Đụng token/auth/money hoặc là shared module nhiều trang dùng → tách TRƯỚC monster (Web2Chat/token namespace phải ổn định). Verify kỹ.

- [→ Wave 3 live-chat pass] **`live-chat/js/pancake/pancake-token-manager.js`** (1310) — là `class PancakeTokenManager` (instance `window.pancakeTokenManager`), 2 HTML (live-chat/index+chat). **Gom vào pass live-chat cluster** (cùng live-livestream-snap/comment-list/init/comments-mobile/inventory-panel) để verify live-chat 1 lần. Class-split: tách helper STATELESS (codec/storage-io/sources) ra module, giữ class orchestrator + 2 global byte-identical.
- [→ Wave 3 chat-infra pass] **`web2/shared/web2-chat-client.js`** (1199) — **10 HTML consumer** (native-orders, live-chat×3, balance-history, jt-tracking, customers, pancake-settings, multi-tool, overview) → split phải update cả 10 HTML load thứ tự + verify nhiều consumer. **Gom cùng Task 1 chat-unification** (native-orders interactions-modal → Web2CustomerChat) vì cùng đụng `Web2Chat`/`Web2CustomerChat`. **Giữ `window.Web2Chat` byte-identical.**
- [ ] **`web2/products/js/web2-products-print.js`** (1293) → print-modal / print-render / print-barcode / print-overlay / print-utils.
- [ ] **`web2/customer-wallet/js/web2-customer-wallet-app.js`** (1314) → state / api / render / events / app. ⚠ money flow → giữ await + loading.
- [x] **`web2/balance-history/js/web2-balance-history-app.js`** (1280) → 8 module: bh-core(213)/render(293)/data(68)/actions(154)/link-customer(65)/reassign-modal(286)/chat-export(149)/app(222). ✅ `Web2BalanceHistoryApp{load,state}` giữ. 50 rows render, 0 JS err.
- [x] **`web2/balance-history/js/web2-pending-match.js`** (914) → 7 module: pm-core(170)/modal(210)/customer-search(233)/picker(85)/resolve(95)/render(159)/entry(93). ✅ `Web2PendingMatch` 6 method giữ. Modal mở OK (13 els), 0 JS err. Money resolve giữ await.

## Wave 3 — Monsters & high-coupling (18 file)

Deep shared mutable STATE, multi-subsystem, cross-module closures, realtime/extension coupling. Làm sau cùng, mỗi file 1 phiên riêng cẩn thận + smoke kỹ. **native-orders + so-order là trang user dùng nhiều nhất → ưu tiên an toàn, side-by-side verify.**

- [x] **`native-orders/js/native-orders-app.js`** (9457) → **23 module** (AST codemod, namespace `window.NativeOrders`, max 786L). `window.NativeOrdersApp` 36 key byte-identical (36 inline onclick), 294 binding mỗi cái 1 lần, equivalence proven. Verified live: 0 JS err, openEdit/openInteractions/toggleExpand OK. `73016bf9e`.
- [x] **Task 1 chat-unification** — `openInteractions` → `Web2CustomerChat.open({layout:'modal', panels:{info: order info + comments}, onReady: wire reply})`. Enhanced shared modal: render `panels.info` cột 3 + fire `onReady`/`getInfoEl` (additive). Verified live: 3-cột (150 conv sidebar + thread + comments info), reply wired, 0 err; regression no-info 2-col OK. `d6c0c7b71`.
    - [ ] **Step 2b (DEFER, careful)**: xoá ~1500 dòng chat trùng (chat-state/render/message-render + old modal/sidebar). ⚠ ENTANGLED — `chat-send.js` chứa `_handleReplyComment` (flow comments-in-info MỚI vẫn dùng) + `inbox-resolve` helpers có thể share; cần trace kỹ để KHÔNG vỡ comment-reply / inbox order-create. Hiện modal cũ = fallback vô hại. Làm pass riêng có verify.
- [x] **`so-order/js/so-order-app.js`** (5932) → **23 module** (state/format/render/render-cells/inline-edit/bulk-edit/modal-core/modal-open/modal-submit/modal-suggest/modal-image/modal-random/receive/barcode/kho-sync/delete/shipment/settings/import/image-modal/confirm/toolbar/app), max 745L. ✅ 154 hàm byte-identical (VM load-sim), 0 public global (giữ), onclick = window.print/close trong print-window giữ. Verified live: 79 rows, order modal mở OK, 0 JS err. | **`so-order-storage.js`** (962) — để nguyên (marginally over, sibling storage layer).
- [ ] **live-chat cluster**: `live-livestream-snap.js` (4568), `live-comment-list.js` (2459), `live-init.js` (1136), `comments-mobile.js` (1131), `inventory-panel.js` (1177)
- [x] **`web2/photo-studio/photo-studio.js`** (2348) → 7 module (state/canvas/bg/edit/bgpicker/ui/app). ✅ 117/117 hàm, `PhotoStudio.init` giữ, BG engines verbatim. 0 JS err.
- [x] **`web2/products/js/web2-products-app.js`** (2010) → 7 module (state/render/modal/variant-picker/actions/filters/app). ✅ `Web2ProductsApp` 12 key byte-identical, 33 rows. 0 JS err.
- [x] **`web2/purchase-refund/js/purchase-refund-app.js`** (1634) → 6 module (state/api/render/modal/actions/app). ✅ group-by-order `aggId` + cumulative `returnedRowIds` over-refund giữ verbatim; quick/bulk refund giữ await+double-submit. 0 JS err.
- [x] **`web2/supplier-debt/js/supplier-debt-app.js`** (1394) → 6 module (state/api/render/actions/filters/app). ✅ 26 rows, 0 JS err. Money settle/adjust giữ await. 0 public global (giữ).
- [x] **`web2/supplier-wallet/js/supplier-wallet-app.js`** (912) → 5 module (state/api/render/actions/app). ✅ 13 cards, 0 JS err. Money deposit/return/pay giữ await + idempotent txId.
- [x] **`web2/customers/js/customers-app.js`** (914) → 5 module (state/render/detail/events/app). ✅ 50 rows, 0 JS err. customers-api.js giữ nguyên; SĐT 10 số validate giữ.
- [x] **`web2/pancake-settings/js/pancake-settings.js`** (1305) → 5 module (state/api/render/actions/app). ✅ token/account writes giữ await+confirm. 0 JS err.
- [x] **`web2/reconcile/js/reconcile-app.js`** (1106) → 5 module (state/api/render/actions/app). ✅ selectPbh race-guard + scanner IME-guard giữ verbatim, match/assign giữ await. 0 JS err.
- [x] **`web2/shared/web2-msg-template.js`** (961) → 4 module (core/ui/send/entry). ✅ `Web2MsgTemplate.open` giữ; native-orders load OK. 0 JS err.
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
