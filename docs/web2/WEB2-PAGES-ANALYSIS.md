<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 docs. -->

# Web 2.0 — Phân tích toàn diện 35 trang menu

> **Vòng 1:** 2026-06-10 (9 agent audit + 12 agent fix Wave 1+2).
> **Vòng 2:** 2026-06-11 — 8 agent re-audit toàn bộ (verify từng bug cũ bằng code thật + săn bug mới) + 3 agent đối chứng adversarial. **25/25 phát hiện nghiêm trọng vòng 2 được CONFIRM độc lập.**
> Menu hiện tại: **36 entry / 35 trang unique** (thêm `live-chat/chat.html` Chat Pancake 2026-06-11; so-order xuất hiện 2 mục).

---

## 0. Trạng thái tổng sau vòng 2 (2026-06-11)

**✅ Wave 1+2 (2026-06-10) VERIFY THẬT — đa số fix đứng vững:**

- Tất cả **8 Top CRITICAL vòng 1 đã fix thật** (verify code 2026-06-11): auth web2-users/SSE-monitor/kpi qua `middleware/web2-auth.js` · `pool`→`client` purchase-refund approve/cancel-approve · `stock: m.stock` · `fetchAggregateWeb2Only` · sinh mã retry-23505/advisory-lock (from-comment, create-manual, fast-sale-orders, delivery-invoices, web2-returns) · bỏ `KHO-<rnd>` · rate-limit login + password ≥8 + WEB2_PAGES đủ trang.
- Nhóm Bán Hàng: **16/18 bug cũ đã fix** (selector data-number ✓, FOR UPDATE + withTransaction + state machine ✓, debounce ✓). Còn #5+#10 (cụm flow `refunds.js` cũ).
- Nhóm Sản phẩm: **7/9 fixed** (transaction upsert-pending ✓, suggest full-cache ✓, Web2Optimistic saveModal ✓, web2-generic fallback pool ✓, limit cap ✓).
- Tài chính: reassign đã vào 1 transaction ✓, manual sepay_id granularity ms + 409 ✓, fb_id unique index + ON CONFLICT target ✓, TPOS OData đã thay bằng warehouse lookup ✓.
- Tính năng mới: payment-signals FOR UPDATE + idempotency approve ✓, notifications 4 nguồn + dedupe index ✓, kpi idempotency + LRU + auth employee-ranges ✓, photo-studio SRI + bỏ key localStorage ✓, audit-log total + cache ✓, ck-dashboard Optimistic + error surface ✓.
- Cấu hình: printer-settings sync server + Optimistic ✓, delivery-zone khoá field code ✓, pancake-settings race Gia hạn ✓, livestream-poller notificationManager + Optimistic + SSE ✓.
- **Realtime live-chat: PUSH-only từ 2026-06-11** (relay Pancake WS → ingest → SSE; vòng poll nền đã tắt) + capture lock failover theo capture-health.

**🔴 NHƯNG vòng 2 phát hiện cụm bug mới nghiêm trọng** (mục 1) — chủ yếu 4 họ: (a) **các đường cancel/delete/reject PHỤ bị bỏ quên** khi Wave fix làm đường chính; (b) **auth coverage rất mỏng** — middleware có nhưng mới gắn ~5 chỗ, hàng loạt route tiền/PII vẫn public; (c) **escapeHtml không escape quote** → stored XSS attribute-injection lan 87 trang; (d) **SSE ví đứt 2 lớp** (eventType `wallet_update` + wildcard key mismatch) → realtime ví là dead code phía client.

**✅ ĐỢT FIX A-D HOÀN TẤT (2026-06-11 chiều, commits `22ba307df` + `feb3a0281` + `5e154518b`):** 7 agent fix song song theo cụm file + 1 agent review diff. Kết quả: **C1-C7, S1-S7, H1-H10, H12-H16 + ~10 MEDIUM 1D đều ✅** (chi tiết từng dòng bên dưới). Còn mở: **H11** (live-chat — session khác đang làm folder đó), đợt E kiến trúc ví NCC, và phần MEDIUM 1D còn lại.

**🔑 Auth 2 mức (thiết kế chống vỡ prod):** endpoint nguy hiểm ngoài page-flow (delete-all/\_vacuum, web2-users GET, SSE admin topic) gate **HARD** ngay; endpoint page đang gọi (payment-signals, pbh-reports, notifications POST, wallets deposit/withdraw, pancake-accounts/refresh) gate **SOFT** qua `requireWeb2AuthSoft` — chỉ enforce khi env **`WEB2_AUTH_ENFORCE=1`**. **Checklist TRƯỚC khi bật enforce:** client phải gửi `x-web2-token` ở: 4 token-manager pancake-accounts (`web2/shared/web2-chat-client.js`, `web2/shared/web2-pancake-accounts.js`, `shared/js/pancake-token-manager.js`, `orders-report/js/managers/pancake-token-manager.js`), `web2/payment-confirm/`, pancake-settings, dashboard pbh-reports, notification producers, trang ví KH deposit/withdraw.

**⏳ Fix backend cần deploy Render mới có hiệu lực** (auto-deploy theo push). Frontend GH Pages tự live sau push.

---

> **⚠ RULE BẢO TRÌ (BẮT BUỘC):** Khi code/sửa phần QUAN TRỌNG của Web 2.0 (route mới, đổi luồng data, fix bug trong danh sách này, thêm trang menu) → **PHẢI cập nhật 2 nơi**: file này **và** trang sống [`web2/overview/index.html`](../../web2/overview/index.html) (section `#auditPages`). Fix xong 1 bug → đổi ⬜ → ✅ kèm commit sha.

---

## 1. 🔥 DANH SÁCH BUG ĐANG MỞ (canonical — vòng 2, 2026-06-11)

> Đây là danh sách chuẩn để fix. Mỗi bug đã được 2 agent độc lập confirm. ⬜ = chưa fix.

### 1A. CRITICAL — tiền / kho / crash

| #   | Bug                                                                                                                                                                                                                                                          | File:Line                                | Trạng thái     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | -------------- |
| C1  | **`bulk-cancel` PBH không restock + không hoàn ví, và CHẶN recover vĩnh viễn** → FIX: `/bulk-cancel` handler riêng loop từng PBH qua `withTransaction` + `_cancelPbhInTx` (FOR UPDATE, restock idempotent `stock_restored`, hoàn ví, history per-PBH)        | `fast-sale-orders.js:811-933, 2118-2152` | ✅ `22ba307df` |
| C2  | **Huỷ phiếu Thu Về race double** → FIX: DELETE /:code trong 1 transaction — FOR UPDATE + guard `status='active'` (đã huỷ → 409 idempotent) + revert kho/ví TRONG tx qua wallet-service nhận client + UPDATE double-safety `AND status='active'`              | `web2-returns.js:831-945`                | ✅ `22ba307df` |
| C3  | **Reassign SePay A→B→A→B mất tiền im lặng** → FIX: Step-0 dup-check `reassignRef` trong tx (đã reassign → idempotent no-op), withdraw đổi reference `sepay_reassign_out` (hết collide unique index), guard `depositResult.alreadyProcessed` → throw rollback | `v2/web2-balance-history.js:471-561`     | ✅ `22ba307df` |
| C4  | **Audit log reassign KHÔNG BAO GIỜ ghi** (thiếu require `web2MatchAudit`) → FIX: thêm require                                                                                                                                                                | `v2/web2-balance-history.js:21`          | ✅ `22ba307df` |
| C5  | **`confirm-purchase-partial` FOR UPDATE vô hiệu** → FIX: toàn handler vào 1 transaction (pool.connect + BEGIN/COMMIT, FOR UPDATE + UPDATE cùng client), history post-commit, response shape giữ nguyên                                                       | `web2-products.js:1316-1422`             | ✅ `22ba307df` |
| C6  | **Quick refund NCC: thiếu `await SW.load()`** → FIX: `await SW.load()` + tách try/catch ví — phiếu OK + ví fail → toast warn riêng thay vì báo "thất bại" toàn bộ                                                                                            | `purchase-refund-app.js:1186-1252`       | ✅ `feb3a0281` |
| C7  | **Gộp/tách đơn sinh mã COUNT+1 không retry + giờ UTC** → FIX: helper `nextDailyCodeTx` (MAX-based, +7h VN) + `insertWithCodeRetryTx` (retry 23505 qua SAVEPOINT) cho cả 3 route merge/split-order/merge-to-pbh                                               | `native-orders.js:591-660, 2363-2703`    | ✅ `22ba307df` |

### 1B. CRITICAL — bảo mật (mọi route đều public qua CF worker, CORS không phải auth)

| #   | Bug                                                                                                                                                                                                                                                                                                                                                                                | File:Line                                                                                        | Trạng thái                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| S1  | **`web2-generic` delete-all/\_vacuum public** → FIX: gate HARD `requireWeb2Admin` (giữ `confirm:true` lớp 2). Cùng class: `web2-dedicated-entity.js /delete-all` cũng đã gate                                                                                                                                                                                                      | `web2-generic.js:469-500` + `web2-dedicated-entity.js:264`                                       | ✅ `22ba307df` + `5e154518b`                      |
| S2  | **`payment-signals` mutation không auth** → FIX: `requireWeb2AuthSoft` cho approve/confirm/dismiss/link-order; `_user(req)` ưu tiên `req.web2User` server-side thay vì tin body                                                                                                                                                                                                    | `web2-payment-signals.js`                                                                        | ✅ `22ba307df` (SOFT — bật `WEB2_AUTH_ENFORCE=1`) |
| S3  | **`pancake-accounts` leak FULL JWT** → FIX: GET /:id + mutations gate `_softAuth` (web2 token HOẶC `x-relay-secret=CLEANUP_SECRET` cho service nội bộ); `login_password_enc` luôn strip; `token_preview` 8 ký tự. ⚠ GET / (list) còn trả token khi CHƯA bật enforce — cố ý, vì 4 token-manager frontend đọc token từ list chưa gửi header; bật `WEB2_AUTH_ENFORCE=1` là strip ngay | `pancake-accounts.js`                                                                            | ✅ `feb3a0281` (SOFT)                             |
| S4  | **`web2-pancake-refresh` brute-force proxy** → FIX: POST/PUT/DELETE gate soft + IP rate-limit 5/phút (IP thật: cf-connecting-ip → last XFF hop) + fail-based limit 5/15min per-account; GET /status bỏ `login_identity`                                                                                                                                                            | `web2-pancake-refresh.js`                                                                        | ✅ `feb3a0281`                                    |
| S5  | **`GET /sse` broadcast PII ví + admin topic mở** → FIX: payload wallet strip còn `{action, phone, ts}` (client re-fetch); topic `web2:_admin:*` yêu cầu `?admintoken=` admin (monitor đã wire EventSource trực tiếp + admintoken); relay-notify fail-closed khi thiếu CLEANUP_SECRET                                                                                               | `realtime-sse-web2.js:95-129, 395-420` + `admin-sse-monitor/js/monitor.js`                       | ✅ `22ba307df`                                    |
| S6  | **Stored XSS attribute-injection (escapeHtml không escape quote)** → FIX: escapeHtml replace-based đủ 5 ký tự + `escJs` cho mọi inline onclick + `safeImageUrl` validate scheme — cả products-app lẫn page-builder (87 trang); bump `?v=20260611s6`                                                                                                                                | `web2-products-app.js:33-64` + `page-builder.js:33-43`                                           | ✅ `22ba307df`+`feb3a0281`                        |
| S7  | **Stored XSS qua `url` notification** → FIX: server `_safeUrl` validate scheme khi POST; frontend `safeUrl()` allowlist `https?://`, `/`, `../`, `#` (chặn javascript:/data:/vbscript:) ở trang notifications + bell                                                                                                                                                               | `v2/notifications.js` + `notifications/index.html:262-268` + `web2-notification-bell.js:165-168` | ✅ `22ba307df`+`feb3a0281`                        |

### 1C. HIGH

| #   | Bug                                                                                                                                                                                                                                                                                                                                                                                                         | File:Line                                                                                                                   | Trạng thái            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| H1  | Cancel PBH không hoàn `wallet_deducted` → FIX: `_refundWalletDeductedForPbh` (trong tx, processDeposit + zero-out wallet_deducted, throw→rollback) wire vào cả 3 đường `/cancel`, `/by-source/cancel`, `/bulk-cancel`                                                                                                                                                                                       | `fast-sale-orders.js:2095-2113`                                                                                             | ✅ `22ba307df`        |
| H2  | `/confirm` không state machine → FIX: `PBH_STATE_TRANSITIONS` + `_isValidPbhTransition`, `_stateChange` FOR UPDATE trong withTransaction, invalid → 409; `cancel` là terminal                                                                                                                                                                                                                               | `fast-sale-orders.js:2057-2083, 2448-2455`                                                                                  | ✅ `22ba307df`        |
| H3  | Manual create PBH không atomic → FIX: INSERT + trừ stock trong 1 withTransaction, lỗi stock → ROLLBACK cả PBH                                                                                                                                                                                                                                                                                               | `fast-sale-orders.js:1303-1407`                                                                                             | ✅ `22ba307df`        |
| H4  | `purchase-refund /reject` race → FIX: transaction + `loadRefund(client, code, true)` FOR UPDATE + whitelist `['draft','sent','approved']` (chặn refunded/cancelled) + idempotent khi đã rejected                                                                                                                                                                                                            | `purchase-refund.js:370-441`                                                                                                | ✅ `22ba307df`        |
| H5  | Ví NCC wipe `totalPurchased=0` khi load fail → FIX: `loadSoOrderData()` null → skip toàn bộ merge/save/pushSync, giữ số liệu cũ                                                                                                                                                                                                                                                                             | `supplier-wallet-app.js:468-485`                                                                                            | ✅ `22ba307df`        |
| H6  | **SSE ví đứt nhiều lớp** → FIX server-side trọn gói (không đụng bridge/`?v=` 28 trang): eventType `wallet_update`→`update`; wildcard gửi `key` = CHÍNH key client đã subscribe; match prefix đúng convention `:`; supplier-wallet + supplier-debt đổi `wallet:all` → `web2:wallet:*`; `WALLET_ALL` trong sse-topics đổi value. ⚠ Toast "+X₫" không hiện nữa (payload strip theo S5 — client re-fetch số dư) | `realtime-sse-web2.js:262-296, 395-420` + `web2-sse-topics.js` + `supplier-wallet-app.js:617` + `supplier-debt-app.js:1201` | ✅ `22ba307df`        |
| H7  | **Trang Phân quyền CHẾT** → FIX: đọc `d.users` + `d.user.permissions`; UI viết lại theo registry thật — fetch `GET /pages` render checkbox theo actions từng trang, `collectPerm` build `{slug:[actions]}`, applyRole dùng `GET /role-defaults/:role`; mọi fetch gửi `x-web2-token`                                                                                                                         | `users-permissions/index.html`                                                                                              | ✅ `feb3a0281`        |
| H8  | Báo cáo giao hàng cột NVC trống → FIX: `r.groupName ?? r.carrierName`                                                                                                                                                                                                                                                                                                                                       | `report-delivery/index.html:313`                                                                                            | ✅ `feb3a0281`        |
| H9  | `web2-users` GET leak PII → FIX: GET /list + GET /:id gate HARD `requireWeb2Auth` (client users-app + users-permissions đã gửi token; login/me/logout không gate)                                                                                                                                                                                                                                           | `web2-users.js:467, 492`                                                                                                    | ✅ `22ba307df`        |
| H10 | `pbh-reports` leak doanh thu + PII → FIX: `router.use(requireWeb2AuthSoft)` toàn bộ 6 GET                                                                                                                                                                                                                                                                                                                   | `pbh-reports.js:18`                                                                                                         | ✅ `22ba307df` (SOFT) |
| H11 | live-chat delta fetch: comment bị **UPDATE** (poller fill phone, has_order máy khác, sửa message) KHÔNG render realtime — delta lọc `created_time >= since` + prepend dedupe-skip id tồn tại. Cần param `sinceUpdated` server (lọc `updated_at` + merge field vào row trùng id) hoặc safety-net silent full reload thưa                                                                                     | `live-init.js _fetchLiveCommentDelta` + `web2-live-comments.js:316`                                                         | ⬜                    |
| H12 | web2-generic PATCH history JSONB race → FIX: BEGIN + `SELECT data … FOR UPDATE` + merge/append + UPDATE cùng client + COMMIT (78 entity)                                                                                                                                                                                                                                                                    | `web2-generic.js:388-463`                                                                                                   | ✅ `22ba307df`        |
| H13 | PATCH /:code products cascade không atomic → FIX: 1 transaction trùm UPDATE product + cascade native_orders + cascade fast_sale_orders, cascade error re-throw → rollback toàn bộ; SSE/history post-commit                                                                                                                                                                                                  | `web2-products.js:610-845`                                                                                                  | ✅ `22ba307df`        |
| H14 | native `/merge` không lock/guard → FIX: FOR UPDATE đơn nguồn + guard `status='draft'` cho TẤT CẢ đơn merge (vi phạm → 400 kèm codes) + advisory lock `lockCampaignSttKey` quanh campaign_stt MAX+1                                                                                                                                                                                                          | `native-orders.js:2469-2530`                                                                                                | ✅ `22ba307df`        |
| H15 | so-order **double-pending** → FIX: trước upsert đọc pending TƯƠI (`Web2ProductsCache.refresh` + lookup) — SP đã có trong Kho chỉ upsert `max(0, qtyNhận − pending)` (đủ thì skip), SP mới giữ qty gốc; kết quả upsert map theo VỊ TRÍ payload (row error giữ chỗ nhưng không map — hết gán nhầm mã khi collision), lệch độ dài → fallback match name                                                        | `so-order-app.js:1875-1962`                                                                                                 | ✅ `5e154518b`        |
| H16 | Rate-limit XFF bypass + PATCH lockout admin cuối → FIX: IP thật `cf-connecting-ip` → last XFF hop → socket; PATCH /:id guard "admin cuối" như DELETE. Seed `admin@@` GIỮ NGUYÊN (quyết định có chủ đích — chuẩn login của shop)                                                                                                                                                                             | `web2-users.js:51-66, 591-610`                                                                                              | ✅ `22ba307df`        |

### 1D. MEDIUM (chọn lọc — đáng fix khi đụng file)

- ⬜ `refunds.js` flow cũ vẫn được PBH page gọi (`pbh-app.js:529` → `/api/refunds/from-pbh`) — không hoàn kho/ví; nên trỏ sang web2-returns hoặc khai tử (bug vòng 1 #5/#10 còn lại).
- ✅ `5e154518b` `web2-dedicated-entity.js /delete-all` không auth (cùng class S1) — đã gate `requireWeb2Admin`.
- ✅ `22ba307df` `DELETE /api/fast-sale-orders/:number` xoá draft không restock — đã fix: transaction + FOR UPDATE → restock idempotent (`stock_restored`) + hoàn `wallet_deducted` trước DELETE (`fast-sale-orders.js:2502-2572`).
- ⬜ reconcile `/pack` `/ship` `/deliver` `/cancel-pack` read-then-update không lock, `/pack` cho state lùi shipped→packed — `reconcile.js:653-821`.
- ✅ `22ba307df` XSS `openHistory` PBH — mọi field history đã qua escapeHtml (verify vòng fix).
- ✅ `22ba307df` `linkTransaction` + manual-deposit — đã bọc transaction + FOR UPDATE + re-check `debt_added` sau lock; manual-deposit INSERT + credit ví chung 1 tx (`web2-balance-history.js`).
- ✅ `22ba307df` link/reassign/resolve đã notify SSE `web2:balance-history` qua `_notifyBalanceHistory` (payload `{action,id,ts}` không PII).
- ⬜ Phone không normalize khi lưu `linked_customer_phone` + `native_orders.phone` raw (`84xxx`) → backfill/merge/topic ví lệch; `normPhoneWeb2` slice(-10) sai với 84xxx 11 số — `web2-balance-history.js:64-97`, `native-orders.js:970,628,2421,2118`, `web2-customers-schema.js`.
- ⬜ `POST /merge` customers mất data KH phụ (alt_phones không gộp, ví secondary orphan) — `web2-customers.js:741-790`.
- ⬜ Wallet event emit `process.nextTick` TRƯỚC COMMIT khi chạy trong transaction caller — `web2-wallet-service.js:234-249`.
- ✅ `feb3a0281` wallets deposit/withdraw — đã support header `x-idempotency-key` (dup-check theo reference_id + type → `alreadyProcessed`, không nhân đôi tiền) + `requireWeb2AuthSoft`. ⚠ Race window cực hẹp vẫn còn (pre-check route-level, chưa có unique index manual — đề xuất #3 mục 6).
- ⬜ Bridge force-reopen connection mỗi lần refocus > 60s (track connect time thay vì event time) + không có resync hook sau reconnect — `web2-sse-bridge.js:167-176`.
- ✅ `22ba307df` `notifyClientsWildcard` separator — match đúng convention `:` + payload key per-connection (xem H6).
- ✅ `22ba307df` `/sse/relay-notify` — fail-closed 503 khi thiếu `CLEANUP_SECRET`.
- ⬜ Token Web 2.0 chấp nhận qua `?token=` query (lộ vào access log) + session token plaintext trong DB (nên lưu sha256) — `middleware/web2-auth.js:22-29`, `web2-users.js:730-736`.
- ⬜ kpi `/kpi` default-open: không token → thấy KPI mọi nhân viên; `/backlog/:id/reclassify` mutation không auth (dead endpoint); `/forecast`+`/actual` vẫn là dead API 2 nguồn — `kpi.js:838-996`.
- ⬜ `web2-live-comments /poll-now` không auth + không cap số posts (giờ là warm-up one-shot nhưng vẫn fan-out 50 trang/post) — `web2-live-comments.js:247-268`; mutation poller-pages cũng không auth (:553-592).
- ⬜ so-order: Firestore 1 doc `main` last-write-wins (architectural — đợt riêng); `pullOnce` conflict window khi push in-flight; URL hardcode workers.dev — `so-order-storage.js`. (`codeByKey` map sai khi collision → ✅ `5e154518b` cùng H15.)
- ⬜ Ví NCC/Công nợ NCC cụm Firestore client-write (lost update 2 tab/2 user, confirmPay fire-and-forget + không double-click guard, match SP bằng tên không variant, SePay substring tên, purge 30 ngày mất audit, `Sync.init` đè local) — kiến trúc, cần chuyển server route + SSE (đợt E).
- ✅ `22ba307df` dashboard SSE reload đã truyền `?nocache=1`. ⬜ còn: `revenue_7d` group theo UTC lệch 7h — `dashboard-kpi.js:50`.
- ⬜ notifications: không cron auto-scan (chỉ nút tay); scan loop serial ~200 query; bell `_refresh` không debounce.
- ⬜ ck-dashboard SSE không debounce (burst N×3 request) — `ck-dashboard-app.js:415-421`.
- ⬜ report-revenue vẫn WS `pbh:*` legacy thay vì Web2SSE (chạy được, lệch convention); CSS import từ native-orders/css.
- ⬜ report-delivery không validate from≤to; không realtime.
- ⬜ printer-settings tải .bat/.ps1 bằng `location.origin + '/scripts/…'` → 404 trên GH Pages origin (OK trên nhijudy.store) — `printer-settings/index.html:824,859`.
- ⬜ delivery-zone + services-dashboard vẫn load `firebase-app/auth-compat` thừa (~200KB) dù đã gỡ Firestore.
- ⬜ Cache-bust `?v=` của bridge/optimistic phân mảnh 7 giá trị trên ~30 trang → lần sửa bridge tiếp theo dễ sót trang chạy bản cũ.
- ⬜ `page-shell.js` là dead code (0 trang dùng `Web2Shell`) — docs UI-FIRST/CLAUDE.md mô tả lệch thực tế.
- ✅ `22ba307df` `_tablesCreated` flag share giữa 2 pool — đã đổi `WeakSet` key theo pool object ở web2-products + web2-generic. ⬜ còn `web2-variants.js:37` (chưa đụng).
- ⬜ Live-chat: `showPancakeCustomerInfo` vẫn lookup `/api/v2/customers` Web 1.0 trước (vi phạm rule kho-trước); `_viewCampaign` limit=5000 1 request; kho-enricher `attempted` Set không clear; SSE delta "nhiễm" vào campaign view (`_viewCampaign` không đổi `selectedCampaignIds`).
- ⬜ pgString() inline escape thay parameterized — `web2-products.js:715,765` (input trusted, rủi ro thấp).

---

## 2. Pattern lỗi LẶP toàn hệ thống (cập nhật vòng 2)

1. **Đường phụ bị bỏ quên khi fix đường chính** _(mới — họ bug lớn nhất vòng 2)_: Wave 1+2 làm atomic cho approve/cancel chính nhưng bỏ sót `bulk-cancel`, `DELETE`, `/reject`, `/confirm`, manual-create, merge/split. Fix 1 nghiệp vụ → grep TOÀN BỘ đường vào cùng bảng.
2. **Auth coverage mỏng**: middleware `web2-auth.js` viết đúng nhưng mới gắn ~5 chỗ. Mọi route tiền (wallets deposit/withdraw, payment-signals approve), wipe (delete-all), token (pancake-accounts), PII (users GET, pbh-reports, SSE wallet payload) vẫn public.
3. **`FOR UPDATE` ngoài transaction = vô hiệu** _(mới)_: `pool.query('SELECT…FOR UPDATE')` autocommit nhả lock ngay. Phải `pool.connect()` + BEGIN…COMMIT cùng client.
4. **escapeHtml textContent→innerHTML không escape quote** _(mới)_: chỉ an toàn cho text node; nhúng vào attribute (`title=`, `src=`, `onclick=`) là injectable. Cần helper `escAttr` escape cả `"` `'` + validate scheme URL.
5. **SSE eventType/key mismatch client-server** _(mới)_: hub emit eventType lạ (`wallet_update`) hoặc wildcard key prefix ≠ topic subscriber → bridge drop im lặng. Thêm eventType mới = phải thêm listener bridge + test bằng SSE Monitor.
6. Sinh số phiếu COUNT/MAX+1: đã fix 5 chỗ bằng retry-23505/advisory-lock, còn sót merge/split/merge-to-pbh (và các chỗ này DELETE nguồn làm COUNT+1 tất yếu đụng).
7. Money op nhiều bước không transaction: còn manual-deposit, linkTransaction, web2-returns DELETE rollback-sau-COMMIT, quick-refund client 3 step.
8. Firestore client-write cho money NCC (supplier-wallet/debt): lost update + fire-and-forget — kiến trúc, cần server route.
9. Normalize SĐT không nhất quán: chuẩn là `0xxxxxxxxx`; native_orders.phone raw, linked_customer_phone raw, topic ví raw, slice(-10) hỏng với `84xxx` 11 số.

---

## 3. Chi tiết theo nhóm trang (verdict verify vòng 2)

> Mỗi nhóm có dòng **Verify 2026-06-11** tóm trạng thái từng bug vòng 1. Bug mới vòng 2 nằm ở mục 1. Chi tiết bảng bug vòng 1 gốc: xem git history file này (bản 2026-06-10, commit `78def00e0`).

### 3.1 Bán Hàng (5 trang)

`web2/fastsaleorder-invoice` (PBH) · `web2/reconcile` · `web2/fastsaleorder-refund` · `web2/returns` (Thu về) · `web2/fastsaleorder-delivery` — BE: `fast-sale-orders.js`, `reconcile.js`, `refunds.js`, `web2-returns.js`, `delivery-invoices.js` (đều web2Db ✓ SSE ✓).

**Verify 2026-06-11: 16/18 ✅** — selector data-number (pbh/rf/dlv) ✅ · applyWalletToUnpaidPbhs FOR UPDATE ✅ · merge PBH retry-23505 ✅ · from-native-order transaction ✅ · reconcile debounce + return-failed atomic ✅ · refunds state-machine + FOR UPDATE ✅ · web2-returns ví-trong-transaction + approve FOR UPDATE + `_genCode` retry + SUM filter cancel ✅ · delivery state-machine + nextNumber retry + "PBH: null" ✅. **⬜ còn:** `pbh-app.js:529` vẫn gọi `/api/refunds/from-pbh` (flow cũ); `refunds.js` không hoàn kho/ví khi approve/complete. **Bug mới:** C1, C2, H1, H2, H3 + 1D (DELETE draft, reconcile pack/ship/deliver, openHistory XSS).

### 3.2 Sale Online (native-orders + so-order)

**Verify 2026-06-11: 6 ✅ · 3 🟨 một phần · 6 ⬜** — fb_page_name migration ✅ · wallet lookup normalize ✅ · cancel hoàn ví 1 transaction ✅ · from-comment fallback dedup 60s ✅ (gap: thiếu cả campaignId) · upsert-pending transaction ✅ · soOrder_v1 cleanup ✅ · so-order SSE qua products-cache + local-first có chủ đích ✅. 🟨 `nextDailyCode` retry chỉ ở from-comment/create-manual (merge/split/merge-to-pbh chưa — C7); campaign_stt advisory lock thiếu ở merge (H14); "Đã nhận 0" UI có panel nhưng gốc double-pending chưa fix (H15). ⬜ x-web2-token raw fetch (chờ backend gate); WS+SSE song song reload đôi; bulkCreatePbh double-submit (server idempotent là check-then-act); so-order 1-doc Firestore (architectural); pullOnce conflict window.

### 3.3 live-chat (2 trang: index + chat.html)

> **🆕 2026-06-11 — TÁCH KIẾN TRÚC live-chat (2 trang):** `index.html` = cột comment Live FULL + panel Kho SP 320px (drag SP → comment tạo đơn) + capture iframe/Force extract; mỗi comment có nút 💬 mở **modal hội thoại full chức năng** (`live-chat-modal.js`). `chat.html` (MỚI) = trang chat Pancake full stack riêng (sidebar "Chat Pancake").
> **✅ ĐÃ ĐẠT REALTIME THẬT (2026-06-11, commit 6416b725a) — PUSH-only, polling đã BỎ HOÀN TOÀN.** Relay Pancake WS (`live-chat/server`, service `n2store-tpos-pancake`, 24/7) nhận event comment → `POST /api/web2-live-comments/ingest` → `pollPostNow(page,post)` fetch đúng post có event (debounce 1.5s) → upsert `web2_live_comments` → SSE `web2:live-comments` → client `_fetchLiveCommentDelta()` (GET since, prepend incremental). Vòng poll nền 5s/30s đã TẮT; client `poll-now` giữ làm warm-up khi mở campaign; TPOS SSE/WS transport neuter NO-OP, TPOS token gỡ khỏi live-api/pancake-api.
> **✅ FIX 2026-06-11 — Force extract 3 bug:** (1) `_isStaffComment` chỉ so selectedPage → multi-page sót 830 comment page khác (chụp vô ích + harvest page vào kho KH) → check `_pageId` + allPages; (2) resolve campaign không dùng `_postId` → 2 live cùng page seek sai video → thêm Path match postId↔`Facebook_LiveId`/`Id`; (3) pending/harvest không skip người bị ẩn → thêm filter `LiveHiddenCommenters.isHidden`.
> **🆕 2026-06-11 — Ẩn comment theo NGƯỜI:** module `live-hidden-commenters.js` — nút 🚫 trên row ẩn mọi comment của 1 người, nút "🙈 Ẩn (N)" topbar mở modal quản lý/bỏ ẩn; mặc định ẩn 2 page shop ("NhiJudy Store"/"NhiJudy House" — 830/1371 comment đo thật). Lưu web2-generic `/api/web2/live-hidden-commenters` (sync mọi máy) + SSE `web2:live-hidden-commenters`; filter tại `_visibleComments()` (không refetch, data giữ nguyên DB).
> **✅ FIX 2026-06-11 — capture lock failover:** heartbeat gắn capture health (`lastFrameAt`) — stall >75s tự nhả lock (máy khác takeover ≤90s); cooldown 3' chống tự cướp lại; standby poll vô hạn; SSE standby auto-takeover. Lock acquire là CAS atomic 1 câu SQL — không race (verified vòng 2).
> **✅ FIX 2026-06-11:** tin nhắn inbox không còn làm cột Live re-render trắng (bỏ subscribe `web2:messages`); mobile/tablet read-mode `html.lc-mobile`.

**Verify 2026-06-11:** filter campaign khi SSE ✅ (delta theo selectedCampaignIds) · passive scroll ✅ · inline edits Web2Optimistic ✅ · poller MAX_COMMENT_PAGES=50 + has_more ✅ · multi-post semaphore ✅ resolved-by-removal (client không fetch Pancake nữa) · XSS comment FB escaping kỹ ✅ (chỉ sót `initial` 1 ký tự — LOW). **⬜ còn:** showPancakeCustomerInfo lookup Web 1.0 trước; `_viewCampaign` 5000 rows; enricher `attempted` Set. **Mới:** **H11** (comment UPDATE không render realtime — regression của delta prepend), `/poll-now` không auth/cap, SSE delta nhiễm campaign view (1D).

### 3.4 Mua hàng (3 trang)

`web2/purchase-refund` · `web2/supplier-debt` (thuần client Firestore) · `web2/supplier-wallet` (local-first Firestore).

**Verify 2026-06-11: 3 ✅ · 12 ⬜** — `pool`→`client` cancel-approve ✅ · approve/cancel-approve transaction + FOR UPDATE ✅ · supplier-debt dedup `_createdAt` + double-click guard ✅. ⬜ còn nguyên cụm Firestore client-write (đợt E): quick-refund không rollback; picker không cộng dồn; ví fire-and-forget; recordPayment/confirmPay lost-update 2 user; saveSupplierNote dup `code=''`; 2 đường trả hàng song song; confirmReturn match SP bằng TÊN; SePay substring tên; purge 30d. **Mới:** **C6** (await SW.load — flow Trả NCC chính đang gãy), **H4** (/reject), **H5** (wipe totalPurchased khi load fail), **H6c** (`wallet:all` topic chết).

### 3.5 Tài chính + Khách hàng (3 trang)

`web2/balance-history` (SePay) · `web2/customers` (Kho KH) · `web2/customer-wallet` (Ví KH) — BE `v2/web2-balance-history.js`, `v2/web2-customers.js`, `v2/web2-customer-wallet.js` + `v2/web2-wallets.js` + `web2-wallet-service.js` (đều web2Db ✓).

**Verify 2026-06-11:** reassign 1 transaction ✅ (nhưng sinh **C3+C4** mới ngay trong fix) · manual sepay_id granularity ms + 409 ✅ · fb_id unique index + ON CONFLICT target ✅ · /search cap 50 + /list paginate ✅ · pseudo-phone bỏ (phone NULL + /merge tay) ✅ · exportCsv `fetchAggregateWeb2Only` ✅ · TPOS OData → warehouse lookup (`web2-customer-lookup.js`) ✅. 🟨 partial: performedBy còn fallback 'admin' vài chỗ + modal Gán KH không gửi verifiedBy; SHOP_BANK đọc env nhưng fallback vẫn hardcode số TK; normalize 84xxx mới wire harvest+lookup-deep (các path /enrich-fb, /upsert, /create chưa). ⬜ openDetail không lookup alt_phones. **Mới:** S5 (SSE wallet PII), H6 (SSE ví đứt), 1D (linkTransaction/manual-deposit atomicity, /merge mất data, deposit không idempotency, notify thiếu).

### 3.6 Sản phẩm (3 trang) + generic

`web2/products` · `web2/variants` · `web2/product-category` — BE `web2-products.js`, `web2-variants.js`, `web2-generic.js` (78+ entity).

**Verify 2026-06-11: 7/9 ✅** — `KHO-<rnd>` bỏ ✅ · `stock: m.stock` ✅ (cả 409 response, commit 7d224f037) · upsert-pending transaction + FOR UPDATE ✅ · suggest full-cache 20K ✅ · saveModal Web2Optimistic ✅ · variants saveModal + findByValueExact chỉ active ✅ · web2-generic fallback `web2Db||chatDb` 12 chỗ ✅ · GET /list cap 2000 ✅. ⬜ pgString inline (rủi ro thấp); variants double-render + không IDB. **Mới:** **C5** (partial FOR UPDATE vô hiệu), **S1** (generic không auth — delete-all/\_vacuum), **S6** (escapeHtml quote XSS lan 87 trang), **H12** (history JSONB race), **H13** (cascade không atomic), 1D (`_tablesCreated` share pool, SSE update không debounce, IDB stale feed suggest).

### 3.7 Tính năng mới (10 trang)

dashboard · kpi · notifications · audit-log · ck-dashboard · photo-studio · users-permissions · admin-sse-monitor · services-dashboard (+ middleware web2-auth).

**Verify 2026-06-11:** SSE monitor auth server-side ✅ · kpi employee-ranges auth ✅ · idempotency qty_delta ✅ · \_scopeCache LRU ✅ · notifications 4 nguồn + ON CONFLICT + client debounce ✅ · audit-log total + cache \_tableExists ✅ · payment-signals FOR UPDATE + idempotency approve + guard pending ✅ · ck-dashboard Optimistic + error surface ✅ · photo-studio SRI + bỏ key localStorage ✅ · services-dashboard auto-refresh ✅. ⬜ /forecast+/actual dead API; dashboard nocache khi SSE + revenue_7d UTC; không cron scan; scan serial; audit-log bảng thiếu silent; monitor poll 2s không pause tab hidden; Firebase app/auth ~200KB; ck stats PAGE=10 (cố ý). **Mới:** **S2** (approve money không auth), **S5** (GET /sse), **S7** (noti url javascript:), **H7** (users-permissions chết — 3 shape mismatch), **H9** (users GET leak), 1D (kpi default-open, reclassify không auth, ck SSE 0ms).

### 3.8 Báo cáo + Cấu hình (7 trang)

report-revenue · report-delivery · livestream-poller · users · pancake-settings · delivery-zone · printer-settings.

**Verify 2026-06-11:** web2-users mutation auth + rate-limit + password ≥8 + WEB2_PAGES đủ 7 trang ✅ · bỏ log password ✅ · report-revenue XSS esc + AbortController+seq ✅ · poller page notificationManager + Optimistic + SSE (interval 15s giữ làm fallback có chủ đích) ✅ · pancake-settings race Gia hạn ✅ · delivery-zone khoá field code ✅ · printer-settings server sync + Optimistic + bridge URL config ✅. ⬜ report-revenue WS `pbh:*` legacy (chạy được — server có broadcast WS — nhưng lệch convention SSE) + CSS import native-orders; report-delivery from≤to + không realtime; users/pancake-settings modal await (ngoại lệ strict-validation hợp lệ — có thể WONTFIX); Firebase app/auth thừa. **Mới:** **S3** (pancake-accounts leak JWT), **S4** (pancake-refresh brute-force proxy), **H8** (carrierName vs groupName), **H10** (pbh-reports leak), **H16** (XFF bypass + admin@@ seed + PATCH lockout), 1D (printer .bat 404 GH Pages, token plaintext DB, ?token= query).

### 3.9 Hạ tầng chung

Wiring matrix `initializeNotifiers` (verify vòng 2): **22 module wire đúng hub web2, KHÔNG có module nào có `_notify` mà server.js quên wire** (dashboard-kpi wired nhưng không bao giờ gọi — dead wire vô hại). Bridge singleton + reconnect backoff ổn; debounce là trách nhiệm caller (đúng docs). `Web2Optimistic`: snapshot là reference nếu caller không tự `structuredClone` + không serialize 2 op cùng state + `apply()` throw giữa chừng không rollback phần đã mutate — caveat khi dùng. Menu: 36 entry / 35 trang (orphan ngoài menu: `web2/payment-confirm/`, `web2/login/`). Bug hạ tầng đang mở: S5, H6 + 1D (bridge refocus reopen, wildcard separator, relay-notify fail-open, `?v=` phân mảnh, page-shell dead code).

---

## 4. Ma trận tuân thủ quy ước (sau vòng 2)

| Quy ước                              | Đạt                                                                                                                                                         | Vi phạm chính còn lại                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pool `web2Db \|\| chatDb`            | ✅ 100% route đã đọc                                                                                                                                        | —                                                                                           |
| SSE notify sau commit trước res.json | ✅ (balance-history link/reassign đã notify)                                                                                                                | wallet event nextTick trước commit khi trong tx (1D)                                        |
| Client SSE debounce 500-600ms        | ✅ đa số                                                                                                                                                    | ck-dashboard 0ms; bell không debounce                                                       |
| UI-first `Web2Optimistic.run`        | ✅ đa số handler chính                                                                                                                                      | users/pancake-settings modal (ngoại lệ hợp lệ); reconcile scanner-driven (ngoại lệ)         |
| Money ops await + loading            | ✅ ví KH core + quick-refund NCC (C6 fixed)                                                                                                                 | supplier-wallet confirmPay sync (đợt E)                                                     |
| Auth server-side                     | ✅ HARD: users GET/mutation, generic+dedicated delete-all, SSE admin · SOFT: payment-signals, pbh-reports, notifications, wallets, pancake-accounts/refresh | bật `WEB2_AUTH_ENFORCE=1` sau khi client gửi token (checklist mục 0); kpi default-open (1D) |
| XSS escape                           | ✅ escapeHtml 5 ký tự + escJs + safeImageUrl + safeUrl (S6+S7 fixed)                                                                                        | `initial` 1 ký tự live-chat (LOW)                                                           |
| Lookup KH kho trước Pancake sau      | ✅ đa số                                                                                                                                                    | live-chat showPancakeCustomerInfo                                                           |
| Topic SSE prefix `web2:`             | ✅ (`wallet:all` đã thay, WALLET_ALL đổi value)                                                                                                             | —                                                                                           |

---

## 5. Lộ trình fix (vòng 2) — TRẠNG THÁI

1. ✅ **Đợt A — chặn mất tiền/kho (DONE 2026-06-11):** C1, C2, C3+C4, C5, C6, H4, H5 + H15.
2. ✅ **Đợt B — auth blanket (DONE 2026-06-11, soft-mode):** S1-S5, H9, H10, H16, wallets idempotency. ⚠ **VIỆC CÒN LẠI để enforce thật:** wire `x-web2-token` vào các client ở checklist mục 0 → bật env `WEB2_AUTH_ENFORCE=1` trên Render → verify không 401 ở page-flow chính. ⬜ live-comments poll-now/pages auth — chừa cho session live-chat (đang active).
3. ✅ **Đợt C — XSS + chức năng chết (DONE 2026-06-11):** S6, S7, H7, H8, C7.
4. ✅ **Đợt D — SSE ví + realtime (DONE 2026-06-11, server-side):** H6, H1+H2. ⬜ còn H11 (live-chat — session khác).
5. ⬜ **Đợt E — kiến trúc NCC (chưa làm, lớn):** chuyển supplier-wallet/debt sang server route + SSE; thống nhất 1 đường trả hàng NCC; so-order per-tab doc Firestore.

---

## 6. Đề xuất cải thiện / tính năng mới (sau khi sạch bug)

1. **Cron auto-scan notifications** (5-15 phút/lần) — noti hiện chỉ sinh khi user bấm nút, mất giá trị cảnh báo sớm (PBH treo, stock thấp, ví âm).
2. **Audit log thống nhất**: mọi mutation backend ghi 1 bảng `web2_audit_log` qua helper chung (hiện mỗi module 1 kiểu: data.history JSONB, state_history, wallet adjustments, match-audit) — trang Lịch sử thao tác đang phải UNION 4 nguồn.
3. **Idempotency-Key header chuẩn** cho mọi money op (client sinh UUID/lần bấm, server unique index) — đóng cả họ double-submit/retry một lần.
4. **Sequence Postgres cho mã phiếu** thay COUNT/MAX+retry (1 sequence/ngày/prefix) — sạch hơn retry-23505.
5. **Hợp nhất version `?v=`**: 1 file `web2/shared/asset-version.js` hoặc script bump tự động — tránh trang chạy bridge cũ.
6. **Dashboard realtime đúng nghĩa**: SSE trigger → fetch `?nocache=1`; revenue_7d theo giờ VN; thêm sparkline tồn kho/ví.
7. **Trang Phân quyền viết lại** dùng đúng API thật (sau H7) + đồng bộ PAGE_GROUPS từ server `WEB2_PAGES` (1 nguồn).
8. **Re-fetch-on-reconnect cho bridge**: hook `onReconnect` để trang tự reload data sau khoảng trống sự kiện (SSE không replay).
9. **Gỡ Firebase compat SDK** khỏi các trang chỉ cần auth (delivery-zone, services-dashboard) — tiết kiệm ~200KB/trang.
10. **Hoàn ví tự động khi huỷ PBH** (sau H1): hiển thị rõ trong modal huỷ "sẽ hoàn X₫ vào ví" — đóng vòng tiền bán hàng.

---

_Vòng 2 sinh bởi 8 agent audit + 3 agent verify ngày 2026-06-11. Bản chi tiết bảng bug vòng 1: commit `78def00e0`. Cập nhật trạng thái từng dòng khi fix (⬜ → ✅ + sha)._
