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

**⏳ Fix backend cần deploy Render mới có hiệu lực** (`POST /services/srv-d4e5pd3gk3sc73bgv600/deploys`). Frontend GH Pages tự live sau push. ⚠ Auth enforcement: admin phải đăng nhập hệ thống web2-users (token `web2_auth`) — verify trước khi deploy auth lên prod để tránh khoá nhầm.

---

> **⚠ RULE BẢO TRÌ (BẮT BUỘC):** Khi code/sửa phần QUAN TRỌNG của Web 2.0 (route mới, đổi luồng data, fix bug trong danh sách này, thêm trang menu) → **PHẢI cập nhật 2 nơi**: file này **và** trang sống [`web2/overview/index.html`](../../web2/overview/index.html) (section `#auditPages`). Fix xong 1 bug → đổi ⬜ → ✅ kèm commit sha.

---

## 1. 🔥 DANH SÁCH BUG ĐANG MỞ (canonical — vòng 2, 2026-06-11)

> Đây là danh sách chuẩn để fix. Mỗi bug đã được 2 agent độc lập confirm. ⬜ = chưa fix.

### 1A. CRITICAL — tiền / kho / crash

| #   | Bug                                                                                                                                                                                                                                                                                                                                | File:Line                                                       | Trạng thái |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------- |
| C1  | **`bulk-cancel` PBH không restock + không hoàn ví, và CHẶN recover vĩnh viễn**: `_bulkStateChange` chỉ UPDATE state; sau đó `/cancel` đơn lẻ thấy state đã 'cancel' nên không restock nữa. Nút còn sống trên UI (`pbh-app.js:832`)                                                                                                 | `fast-sale-orders.js:776-807`                                   | ⬜         |
| C2  | **Huỷ phiếu Thu Về race double**: `DELETE /:code` đọc status không FOR UPDATE, UPDATE không guard `AND status='active'` → 2 request đồng thời trừ kho 2 lần + rút ví 2 lần; rollback ví chạy SAU COMMIT best-effort                                                                                                                | `web2-returns.js:837-910`                                       | ⬜         |
| C3  | **Reassign SePay A→B→A→B mất tiền im lặng**: deposit có idempotency (`ref sepay:reassign:phone` trùng → skip cộng) nhưng withdraw KHÔNG → vẫn trừ; route không check `depositResult.alreadyProcessed`. (Nếu unique index `idx_web2_wallet_tx_unique_sepay` đã tồn tại → fail 500 thay vì mất tiền — vẫn là bug, failure mode khác) | `v2/web2-balance-history.js:432-460` + `web2-wallet-service.js` | ⬜         |
| C4  | **Audit log reassign KHÔNG BAO GIỜ ghi**: `web2MatchAudit` dùng ở :488 nhưng file không `require` → ReferenceError bị nuốt bởi try/catch                                                                                                                                                                                           | `v2/web2-balance-history.js:488`                                | ⬜         |
| C5  | **`confirm-purchase-partial` FOR UPDATE vô hiệu**: `pool.query('SELECT…FOR UPDATE')` autocommit nhả lock ngay, UPDATE bằng pool.query khác → lost update kho khi 2 máy cùng nhận hàng (upsert-pending + confirm-purchase full ĐÃ có transaction, riêng partial bị bỏ sót)                                                          | `web2-products.js:1295-1383`                                    | ⬜         |
| C6  | **Quick refund NCC: thiếu `await SW.load()`** → `state` là Promise → TypeError → **ví NCC không bao giờ được ghi** trong flow Trả NCC chính (phiếu + trừ kho đã chạy xong, UI báo "thất bại" gây hiểu lầm)                                                                                                                         | `purchase-refund-app.js:1233`                                   | ⬜         |
| C7  | **Gộp đơn/tách đơn sinh mã COUNT+1 không retry**: `/merge` DELETE đơn nguồn → COUNT < MAX → lần merge sau sinh mã đã tồn tại → 23505 → 500 (tất yếu trong sequence merge→create→merge). `/split-order` + `/merge-to-pbh` cùng pattern; cả 3 dùng `new Date()` UTC thay vì +7h VN                                                   | `native-orders.js:2458-2463, 2305-2310, 2608-2613`              | ⬜         |

### 1B. CRITICAL — bảo mật (mọi route đều public qua CF worker, CORS không phải auth)

| #   | Bug                                                                                                                                                                                                                                                           | File:Line                                                                                       | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| S1  | **`web2-generic` không auth toàn bộ**: `POST /:entity/delete-all` (chỉ cần `confirm:true`) wipe được từng entity trong 78+ (gồm `web2_records` multi-tenant); `POST /_vacuum` public                                                                          | `web2-generic.js:453, 481`                                                                      | ⬜         |
| S2  | **`payment-signals /approve` (cộng ví tiền thật + gửi tin Pancake) không auth**, userName từ body — giả mạo được; confirm/dismiss/link-order cùng pattern                                                                                                     | `web2-payment-signals.js:376`                                                                   | ⬜         |
| S3  | **`GET /api/pancake-accounts` trả FULL JWT Pancake của mọi account, không auth** (SELECT \* gồm cột token) → chiếm account Pancake (đọc hội thoại, gửi tin thay shop); PUT/DELETE/sync cũng mở                                                                | `pancake-accounts.js:22-44`                                                                     | ⬜         |
| S4  | **`web2-pancake-refresh` không auth** → server thành proxy brute-force mật khẩu pancake.vn; `{save:true}` ghi đè creds đã mã hoá; GET /status leak `login_identity`                                                                                           | `web2-pancake-refresh.js:114-210`                                                               | ⬜         |
| S5  | **`GET /sse` (hub Web 2.0) không auth** → subscribe được `web2:wallet:<phone>` / `web2:_admin:sse-log`; payload wallet broadcast **nguyên object wallet + transaction (số dư, PII)** — vi phạm rule "chỉ {action,id,ts}"                                      | `realtime-sse-web2.js:78, 361-376`                                                              | ⬜         |
| S6  | **Stored XSS attribute-injection**: `escapeHtml` (textContent→innerHTML) KHÔNG escape `"` `'`; nhúng vào `title="…"`, `src="…"`, `onclick='…'` → note/imageUrl (ghi được qua API không auth) chèn handler. Lan **87 trang** qua `page-builder.js` cùng helper | `web2-products-app.js:33,54,69,85,112` + `page-builder.js:33,236-247,450-461`                   | ⬜         |
| S7  | **Stored XSS qua `url` notification**: POST / không auth nhận url tuỳ ý; frontend render `href` không chặn scheme `javascript:` → click noti là chạy JS. Bell hiện trên 40+ trang                                                                             | `v2/notifications.js:122` + `notifications/index.html:145,246` + `web2-notification-bell.js:59` | ⬜         |

### 1C. HIGH

| #   | Bug                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | File:Line                                                                                                                | Trạng thái |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| H1  | Mọi đường cancel PBH (`/:number/cancel`, `/by-source/:code/cancel`, bulk) **không hoàn `wallet_deducted`** — comment schema tự ghi "lưu để hoàn khi huỷ" nhưng chỉ `native-orders.js cancelOrder` có `_refundWalletForNativeOrder`                                                                                                                                                                                                                                      | `fast-sale-orders.js:1958-2201`                                                                                          | ⬜         |
| H2  | `/:number/confirm` không state machine → PBH `cancel` → `done` được, stock đã restore không bị trừ lại → tồn kho ảo                                                                                                                                                                                                                                                                                                                                                     | `fast-sale-orders.js:1907-1912, 2202-2231`                                                                               | ⬜         |
| H3  | Manual create PBH (`POST /`): INSERT rồi trừ stock bằng pool.query rời, lỗi nuốt warn (nhánh from-native-order đã withTransaction, nhánh manual chưa)                                                                                                                                                                                                                                                                                                                   | `fast-sale-orders.js:1274-1290`                                                                                          | ⬜         |
| H4  | `purchase-refund /reject` không transaction/FOR UPDATE → reject đồng thời restock đôi; cho phép reject từ `refunded` (NCC đã hoàn tiền vẫn restock)                                                                                                                                                                                                                                                                                                                     | `purchase-refund.js:368-412`                                                                                             | ⬜         |
| H5  | Ví NCC: `loadAndRender` khi so-order load fail (`null`) → `mergeAggregation` set `totalPurchased=0` cho MỌI NCC → mutated → **push state hỏng lên Firestore**                                                                                                                                                                                                                                                                                                           | `supplier-wallet-app.js:454-461, 124-138`                                                                                | ⬜         |
| H6  | **SSE ví đứt nhiều lớp**: (a) hub emit eventType `wallet_update` — bridge chỉ nghe update/created/deleted/change; (b) wildcard gửi `key='web2:wallet'` ≠ topic subscriber `web2:wallet:*`/`web2:wallet:<phone>` → 5 subscriber là dead code; (c) supplier-wallet + supplier-debt subscribe `wallet:all` — topic không tồn tại trên hub web2 (`web2-sse-topics.js` còn export `WALLET_ALL` sai convention). Chỉ nhánh `web2:customer-wallet` (eventType update) còn sống | `realtime-sse-web2.js:361-376` + `web2-sse-bridge.js:85-88` + `supplier-wallet-app.js:592` + `supplier-debt-app.js:1201` | ⬜         |
| H7  | **Trang Phân quyền (users-permissions) CHẾT hoàn toàn**: đọc `d?.items` (server trả `{users}`), `d?.permissions` (server trả `{user:{…}}`), PUT gửi `{view,edit,admin}` boolean (server đòi `{slug:[actions]}`) → dropdown rỗng + matrix trống + save 400                                                                                                                                                                                                               | `users-permissions/index.html:141, 174, 221-254`                                                                         | ⬜         |
| H8  | Báo cáo giao hàng: cột "Nhà vận chuyển" luôn trống — client đọc `r.carrierName`, API trả `groupName`                                                                                                                                                                                                                                                                                                                                                                    | `report-delivery/index.html:313` vs `pbh-reports.js:175-183`                                                             | ⬜         |
| H9  | `web2-users GET /list` + `GET /:id` không auth → leak username/email/phone/role/permissions mọi user (mutation đã gate, read quên)                                                                                                                                                                                                                                                                                                                                      | `web2-users.js:456-495`                                                                                                  | ⬜         |
| H10 | `pbh-reports` cả 6 route không auth → leak doanh thu + `partner_name`/`partner_phone` KH thật                                                                                                                                                                                                                                                                                                                                                                           | `pbh-reports.js` (toàn file)                                                                                             | ⬜         |
| H11 | live-chat delta fetch: comment bị **UPDATE** (poller fill phone, has_order máy khác, sửa message) KHÔNG render realtime — delta lọc `created_time >= since` + prepend dedupe-skip id tồn tại. Cần param `sinceUpdated` server (lọc `updated_at` + merge field vào row trùng id) hoặc safety-net silent full reload thưa                                                                                                                                                 | `live-init.js _fetchLiveCommentDelta` + `web2-live-comments.js:316`                                                      | ⬜         |
| H12 | web2-generic PATCH: đọc data → append `history` JS-side → ghi lại, KHÔNG transaction/lock → 2 update đồng thời mất history + lost-update field (áp dụng 78 entity)                                                                                                                                                                                                                                                                                                      | `web2-generic.js:385-446`                                                                                                | ⬜         |
| H13 | PATCH /:code products: UPDATE + cascade native_orders + cascade fast_sale_orders là 3 query rời không transaction → snapshot đơn lệch khi fail giữa chừng                                                                                                                                                                                                                                                                                                               | `web2-products.js:669-813`                                                                                               | ⬜         |
| H14 | native `/merge` không FOR UPDATE + không guard `status='draft'` → gộp được đơn đã có PBH rồi DELETE → PBH dangling, hoàn-ví-khi-huỷ không chạy được; campaign_stt trong merge cũng MAX+1 không advisory lock                                                                                                                                                                                                                                                            | `native-orders.js:2411-2530`                                                                                             | ⬜         |
| H15 | so-order **double-pending**: `confirmReceiveFromModal` luôn `upsertPending` với qty đặt gốc TRƯỚC khi confirm-partial; row đã Lưu Nháp sync → server `pending += qty` lặp → pending ảo, "Đã nhận: 0" sai                                                                                                                                                                                                                                                                | `so-order-app.js:1877-1889` + `web2-products.js:1171`                                                                    | ⬜         |
| H16 | Rate-limit login key theo `x-forwarded-for` client-controlled → rotate XFF bypass 429; seed admin mặc định `admin@@` hardcode (trùng password ghi khắp docs repo); PATCH /:id không guard "admin cuối" (DELETE có) → tự lockout                                                                                                                                                                                                                                         | `web2-users.js:51-55, 381, 543-590`                                                                                      | ⬜         |

### 1D. MEDIUM (chọn lọc — đáng fix khi đụng file)

- ⬜ `refunds.js` flow cũ vẫn được PBH page gọi (`pbh-app.js:529` → `/api/refunds/from-pbh`) — không hoàn kho/ví; nên trỏ sang web2-returns hoặc khai tử (bug vòng 1 #5/#10 còn lại).
- ⬜ `DELETE /api/fast-sale-orders/:number` xoá draft không restock (manual create đã trừ stock lúc tạo) — `fast-sale-orders.js:2253-2273`.
- ⬜ reconcile `/pack` `/ship` `/deliver` `/cancel-pack` read-then-update không lock, `/pack` cho state lùi shipped→packed — `reconcile.js:653-821`.
- ⬜ XSS `openHistory` PBH: `h.userName` (client tự khai) vào innerHTML không escape — `pbh-app.js:931-963`.
- ⬜ `linkTransaction` 2 bước không transaction + không FOR UPDATE; manual-deposit INSERT rồi mới credit ví (rollback best-effort) — `web2-balance-history.js:48-116, 844-921`.
- ⬜ link/reassign/resolve KHÔNG notify SSE `web2:balance-history` (chỉ manual-deposit có) — tab khác stale.
- ⬜ Phone không normalize khi lưu `linked_customer_phone` + `native_orders.phone` raw (`84xxx`) → backfill/merge/topic ví lệch; `normPhoneWeb2` slice(-10) sai với 84xxx 11 số — `web2-balance-history.js:64-97`, `native-orders.js:970,628,2421,2118`, `web2-customers-schema.js`.
- ⬜ `POST /merge` customers mất data KH phụ (alt_phones không gộp, ví secondary orphan) — `web2-customers.js:741-790`.
- ⬜ Wallet event emit `process.nextTick` TRƯỚC COMMIT khi chạy trong transaction caller — `web2-wallet-service.js:234-249`.
- ⬜ `POST /api/web2/wallets/:phone/deposit|withdraw` không idempotency key (manual, reference NULL) → retry/double-click nhân đôi tiền — `web2-wallets.js:107-125`.
- ⬜ Bridge force-reopen connection mỗi lần refocus > 60s (track connect time thay vì event time) + không có resync hook sau reconnect — `web2-sse-bridge.js:167-176`.
- ⬜ `notifyClientsWildcard` separator `'/'` không bao giờ match convention `:` — `realtime-sse-web2.js:234`.
- ⬜ `/sse/relay-notify` fail-open khi `CLEANUP_SECRET` chưa set — `realtime-sse-web2.js:313-315`.
- ⬜ Token Web 2.0 chấp nhận qua `?token=` query (lộ vào access log) + session token plaintext trong DB (nên lưu sha256) — `middleware/web2-auth.js:22-29`, `web2-users.js:730-736`.
- ⬜ kpi `/kpi` default-open: không token → thấy KPI mọi nhân viên; `/backlog/:id/reclassify` mutation không auth (dead endpoint); `/forecast`+`/actual` vẫn là dead API 2 nguồn — `kpi.js:838-996`.
- ⬜ `web2-live-comments /poll-now` không auth + không cap số posts (giờ là warm-up one-shot nhưng vẫn fan-out 50 trang/post) — `web2-live-comments.js:247-268`; mutation poller-pages cũng không auth (:553-592).
- ⬜ so-order: Firestore 1 doc `main` last-write-wins (architectural — đợt riêng); `pullOnce` conflict window khi push in-flight; `codeByKey` ghép theo index (nhánh collision map sai SP); URL hardcode workers.dev — `so-order-storage.js`, `so-order-app.js:1891-1910`.
- ⬜ Ví NCC/Công nợ NCC cụm Firestore client-write (lost update 2 tab/2 user, confirmPay fire-and-forget + không double-click guard, match SP bằng tên không variant, SePay substring tên, purge 30 ngày mất audit, `Sync.init` đè local) — kiến trúc, cần chuyển server route + SSE (đợt E).
- ⬜ dashboard SSE reload không truyền `?nocache=1` → nhận cache 30s cũ; `revenue_7d` group theo UTC lệch 7h — `dashboard/index.html:200,284` + `dashboard-kpi.js:50`.
- ⬜ notifications: không cron auto-scan (chỉ nút tay); scan loop serial ~200 query; bell `_refresh` không debounce.
- ⬜ ck-dashboard SSE không debounce (burst N×3 request) — `ck-dashboard-app.js:415-421`.
- ⬜ report-revenue vẫn WS `pbh:*` legacy thay vì Web2SSE (chạy được, lệch convention); CSS import từ native-orders/css.
- ⬜ report-delivery không validate from≤to; không realtime.
- ⬜ printer-settings tải .bat/.ps1 bằng `location.origin + '/scripts/…'` → 404 trên GH Pages origin (OK trên nhijudy.store) — `printer-settings/index.html:824,859`.
- ⬜ delivery-zone + services-dashboard vẫn load `firebase-app/auth-compat` thừa (~200KB) dù đã gỡ Firestore.
- ⬜ Cache-bust `?v=` của bridge/optimistic phân mảnh 7 giá trị trên ~30 trang → lần sửa bridge tiếp theo dễ sót trang chạy bản cũ.
- ⬜ `page-shell.js` là dead code (0 trang dùng `Web2Shell`) — docs UI-FIRST/CLAUDE.md mô tả lệch thực tế.
- ⬜ `_tablesCreated` flag share giữa 2 pool (cold-start fallback chatDb → web2Db skip ensureTables) — `web2-products.js:106`, `web2-variants.js:37`, `web2-generic.js:30`.
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

| Quy ước                              | Đạt                                        | Vi phạm chính còn lại                                                                       |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Pool `web2Db \|\| chatDb`            | ✅ 100% route đã đọc                       | — (web2-generic đã fix)                                                                     |
| SSE notify sau commit trước res.json | ✅ hầu hết                                 | balance-history link/reassign không notify; wallet event nextTick trước commit khi trong tx |
| Client SSE debounce 500-600ms        | ✅ đa số                                   | ck-dashboard 0ms; purchase-refund 400ms; bell không debounce                                |
| UI-first `Web2Optimistic.run`        | ✅ đa số handler chính                     | users/pancake-settings modal (ngoại lệ hợp lệ); reconcile scanner-driven (ngoại lệ)         |
| Money ops await + loading            | ✅ ví KH core                              | supplier-wallet confirmPay sync; purchase-refund ví fire-and-forget + **C6 thiếu await**    |
| Auth server-side                     | web2-users mutation, kpi ranges, SSE admin | **S1-S5, H9, H10, 1D** — coverage rất mỏng, mọi route tiền/PII khác vẫn public              |
| XSS escape                           | text node đa số ✅                         | **S6 attribute-injection (87 trang), S7 javascript: URL**, pbh openHistory                  |
| Lookup KH kho trước Pancake sau      | ✅ đa số                                   | live-chat showPancakeCustomerInfo                                                           |
| Topic SSE prefix `web2:`             | ✅ đa số                                   | `wallet:all` (chết), `WALLET_ALL` trong sse-topics                                          |

---

## 5. Lộ trình fix khuyến nghị (vòng 2)

1. **Đợt A — chặn mất tiền/kho ngay (1 buổi):** C1 (bulk-cancel restock+ví hoặc tạm ẩn nút), C2 (DELETE returns FOR UPDATE + guard + ví trong tx), C3+C4 (reassign idempotency withdraw + require web2MatchAudit), C5 (transaction partial), C6 (`await SW.load()` — 1 dòng), H4 (/reject), H5 (guard null so-order data).
2. **Đợt B — auth blanket (1 buổi):** gắn `requireWeb2Auth`/`requireWeb2Admin` cho: web2-generic mutation (delete-all/\_vacuum → admin), payment-signals mutation, pancake-accounts (toàn bộ), web2-pancake-refresh, web2-users GET, pbh-reports, wallets deposit/withdraw, notifications POST/DELETE, live-comments poll-now/pages. SSE wallet payload bỏ số dư (chỉ `{action, phone, ts}` — client re-fetch). Cân nhắc token cho `GET /sse`.
3. **Đợt C — XSS + chức năng chết (nửa buổi):** helper `escAttr` escape quote + dùng cho mọi attribute (products + page-builder); validate scheme url noti (`^https?://|^/`); fix users-permissions shape (3 chỗ); carrierName→groupName (1 dòng); C7 merge/split dùng insertWithCodeRetry + giờ VN.
4. **Đợt D — SSE ví + realtime:** bridge thêm listener `wallet_update` (hoặc hub đổi về `update`); wildcard gửi `key=matchedKey`; supplier-wallet/debt đổi `wallet:all` → topic web2 thật; xóa WALLET_ALL; H11 live-chat sinceUpdated/safety-net; H1+H2 (hoàn ví khi cancel PBH + state machine confirm).
5. **Đợt E — kiến trúc NCC (giữ từ vòng 1):** chuyển supplier-wallet/debt sang server route + SSE; thống nhất 1 đường trả hàng NCC; so-order per-tab doc.

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
