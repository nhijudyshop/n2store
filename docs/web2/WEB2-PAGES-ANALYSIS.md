<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 docs. -->

# Web 2.0 — Phân tích toàn diện 35 trang menu

> **Vòng 1:** 2026-06-10 (9 agent audit + 12 agent fix Wave 1+2 — chi tiết: commit `78def00e0`).
> **Vòng 2:** 2026-06-11 (8 agent re-audit + 3 đối chứng → 25 bug C1-C7/S1-S7/H1-H16 → fix đợt A-D cùng ngày — chi tiết: commit `1781023d5`).
> **Vòng 3:** 2026-06-12 — **54 agent** (10 audit nhóm + sweep tách Web1/Web2 chuyên sâu + 2 adversarial verifier/finding). Mọi finding CRITICAL/HIGH trong file này đã qua 2 verifier độc lập HOẶC spot-check tay (ghi chú từng dòng).
> Menu hiện tại: **36 entry / 35 trang unique**.

---

## 0. Trạng thái tổng sau vòng 3 (2026-06-12)

**🔒 ĐÃ BẬT `WEB2_AUTH_ENFORCE=1` (2026-06-13, deploy `07f4a0e02`):** auth Web 2.0 nay BẮT BUỘC — route `requireWeb2AuthSoft` trả **401 nếu thiếu/sai `x-web2-token`**. Hoàn tất ENFORCE-PREP (commit `248532b73`): wire token vào ~30 client file (helper `Web2Auth.authHeaders()` + fallback inline localStorage `web2_auth` cho cả file Web 1.0 cùng origin) — cụm live-chat/livestream, tài chính/pages (pbh-reports, dashboard-kpi, audit-log, notifications, payment-signals, wallets, balance-history ×4, customers, cutout), pancake token-managers (cả 2 file Web 1.0), ví NCC storage, quick-reply, purchase-refund. **Verify prod:** gated no-token→401 / with-token→200 / ungated GET→200; pancake-accounts list strip token khi unauth; 8 trang money (dashboard/audit-log/notifications/report-revenue/customer-wallet/supplier-wallet/customers/native-orders) load **0 × 401** với token. ⚠ **Vận hành:** browser chưa từng login Web 2.0 (`web2/login`, token sống 30 ngày, localStorage chung origin) sẽ 401 mọi thao tác ghi — gồm cả đọc token Pancake ở trang Web 1.0 (orders-report/inbox) → operator cần login web2 1 lần/máy. Rollback: env `WEB2_AUTH_ENFORCE=0` + redeploy. `WEB2_REQUIRE_DB=1` cũng đang BẬT.

**✅ Fix đợt A-D (vòng 2) VERIFY LẠI TOÀN BỘ — KHÔNG regression, trừ 1:**

- Spot-check code thật từng cụm: C1 bulk-cancel · C2 returns DELETE tx · C3+C4 reassign dup-check + matchAudit · C5 partial tx · C6 SW.load · H2 state machine · H3 manual atomic · H4 reject tx · H5 wipe guard · H6 wildcard `:` + eventType update · H8 groupName · H9 users gate · H10 pbh-reports soft · H12 generic history tx · H13 cascade atomic · H15 double-pending (confirmReceive) · H16 XFF + admin-cuối PATCH · S1 delete-all admin · S2 paysig soft · S3 strip JWT · S4 rate-limit · S5 strip payload ví · S6 escapeHtml 5 ký tự (products-app + page-builder) · S7 safeUrl · DELETE draft restock · linkTransaction atomic — **tất cả còn nguyên**.
- ❌ **1 REGRESSION do fix H9 gây ra:** `kpi-assignments.js` không gửi `x-web2-token` khi GET `/api/web2-users/list` (giờ gate HARD) → 401 → dropdown nhân viên rỗng → trang phân công KPI chết chức năng chính (→ 3H19).
- ⚠ **2 fix có RESIDUAL:** S5 còn topic `web2:customer-wallet` broadcast phone+amount không auth (3M-S5r); S6 còn escapeHtml 3-ký-tự ở `web2-variants-app.js` + `web2-products-print.js` (3M-S6r — ✅ `8947639bb`).

**🔴 Vòng 3 phát hiện cụm bug mới:** 1 CRITICAL + ~21 HIGH (mục 1) — 3 họ chính: (a) **các route gộp/tách/sync bị bỏ quên** khi Wave trước làm atomic cho đường chính (merge PBH mất tiền ví, merge-to-pbh không trừ kho, huỷ đơn web không restock, PATCH bypass transition); (b) **auth vẫn mỏng ở route tiền ngoài wallets** (balance-history, monitoring revert, cutout, dashboard-kpi — thiếu hẳn middleware kể cả soft); (c) **hệ quả phụ của rework PUSH-only live-chat** (auto-snap chết vì event không ai emit, filter người-ẩn bị bypass ở path incremental).

**✅ ĐỢT MEDIUM-SWEEP + ENV (2026-06-12 tối, commits `723d23fc8`+`a90ddc488`+`d9c3ba96b`):** bật `WEB2_REQUIRE_DB=1` trên Render (fail-fast active, deploy live) · 1D-reconcile-no-lock ✅ · 1D-refunds-old-flow KHAI TỬ ✅ (PBH → Thu về prefill, /from-pbh 410) · ~21 MEDIUM/LOW đóng (atomicity: admin-cuối TOCTOU, /refunded tx, dedicated PATCH/DELETE/\_ready, variants WeakSet, upsert-pending variant, DELETE products, deductStock rowCount · hiển thị: Bomb filter, phones84, reassign_out aggregate, card doanh thu, A5 identity, kpi overlap, hint mật khẩu, pancake identity, monitor pause, ck-review · SSE: S5-residual strip, key cap 50, dead topic, bridge test, notify bulk ops, dashboard debounce).

**✅ ĐỢT I + ĐỢT E HOÀN TẤT (2026-06-12 tối, commit `01cb771dd` + sweep `7bb139d21`/`5ecfc792f`):** Đợt I — 3W1 fork `web2_quick_replies` (route mới + auto-seed read-only) · 3W2 fork Firestore `web2_message_templates` · 3W3 live-chat chốt 1 nguồn ví/KH Web 2.0 (batch-summary mới `/api/web2/wallets/batch-summary` + kho `web2_customers`) · 3W4 gỡ WS legacy khỏi 4 route + 5 trang → Web2SSE (đóng SO-ws-sse-double) · 3W5 suppliers-cache bỏ onSnapshot → server + SSE · 3W7 boot guard `WEB2_REQUIRE_DB=1`. Đợt E — ví NCC chuyển server ledger `/api/web2-supplier-wallet` (bảng `web2_supplier_ledger` UNIQUE tx_id + `web2_supplier_meta`, sequence bút toán, import one-time từ Firestore, SSE `web2:supplier-wallet`); supplier-wallet/debt/purchase-refund/suppliers-cache swap storage, money ops await + idempotent. **Chừa lại có chủ đích:** so-order Firestore 1-doc (kiến trúc riêng), hợp nhất UX 2 đường trả NCC, 3W6 sidebar `_isAdmin` Web 1.0 (UI gating nhẹ).

**✅ ĐỢT H HOÀN TẤT (2026-06-12, commits `276a64355` + `cf11709bb`):** ✅ 3H6 (auto-snap emit) + ✅ 3H7 (lọc người-ẩn mọi path) + ✅ H11 + bug mất-tin-multi-campaign (cursor `sinceUpdated`/updated_at + merge-by-id) + 🟨 3H8 (relay mutation auth, live-saved route mới `web2_live_saved`, host chết `n2store-live-chat`→`n2store-tpos-pancake`) + **BONUS drag-drop tạo đơn 500: `crm_team_id` INT4 tràn FB Page Id 15 chữ số → ALTER BIGINT (native_orders + fast_sale_orders)**. Server prod verify toàn chuỗi KHOẺ (relay WS → ingest → DB 22s → SSE push). Phần cuối `cf11709bb`: ✅ 3H9 (offlineBatchAll per-campaign + lọc người-ẩn) · ✅ /api/events\* gate relay-secret · ✅ LC-pollnow-auth (16 route soft + cap fan-out/payload) · ✅ 3H15 (XSS Lịch sử SP — vốn nhóm Khác, gộp luôn).

**✅ ĐỢT G HOÀN TẤT (2026-06-12, commit `11b6d0717`):** auth blanket (3H14, 3H17, 3H18, 3H19 + 7 nhóm 1D) + enforce-prep 3H21 phần server/client trung tâm. ✅ **`WEB2_AUTH_ENFORCE=1` ĐÃ BẬT 2026-06-13** (ENFORCE-PREP `248532b73` wire ~30 file + verify prod — xem mục 0 đầu file).

**✅ ĐỢT F HOÀN TẤT (2026-06-12, commit `904bc62d5`):** 11 bug tiền/kho đã fix — 3C1 + 3H1-3H5 + 3H10-3H13 + 3H16 (chi tiết từng dòng mục 1). Còn mở: đợt G (auth + enforce-prep: 3H14, 3H17-3H19, 3H21 + cụm 1D auth), đợt H (🟨 gần xong — còn 3H9), đợt I (tách Web1: 3W1-3W7), đợt E (ví NCC).

**🔵 Tách biệt Web 1.0 ⊥ Web 2.0 (sweep chuyên sâu — mục 2): nhìn chung TỐT.** 100% route backend dùng pool `web2Db || chatDb`, không ghi bảng nghiệp vụ Web 1.0, SSE đúng hub, Firestore data đã prefix `web2_`. **CHỈ CÒN 2 vi phạm GHI thật sự**: `web2-quick-reply.js` (CRUD bảng `quick_replies` chatDb prod) và `web2-msg-template.js` (ghi Firestore `message_templates` không prefix — collection prod Web 1.0). Còn lại là đọc-nhầm-nguồn ở live-chat (customers + ví), lệch convention (WS legacy, onSnapshot), và shared-credential cố ý (pancake).

**⏳ Fix backend cần deploy Render mới có hiệu lực** (auto-deploy theo push, lưu ý Build Filters chỉ build khi chạm `render.com/**`). Frontend GH Pages tự live sau push.

**🔑 Auth 2 mức (giữ nguyên thiết kế):** endpoint nguy hiểm ngoài page-flow gate **HARD** ngay; endpoint page đang gọi gate **SOFT** (`requireWeb2AuthSoft`, enforce khi env `WEB2_AUTH_ENFORCE=1`). **✅ Enforce ĐÃ BẬT (2026-06-13):** blocker 3H21 đã giải — web2-api.js/notification-bell/raw fetch native-orders/so-order + ~30 file đã wire `x-web2-token` (ENFORCE-PREP `248532b73`). Verify prod: mục 0 đầu file.

---

> **⚠ RULE BẢO TRÌ (BẮT BUỘC):** Khi code/sửa phần QUAN TRỌNG của Web 2.0 (route mới, đổi luồng data, fix bug trong danh sách này, thêm trang menu) → **PHẢI cập nhật 2 nơi**: file này **và** trang sống [`web2/overview/index.html`](../../web2/overview/index.html) (section `#auditPages`). Fix xong 1 bug → đổi ⬜ → ✅ kèm commit sha.

---

## 1. 🔥 DANH SÁCH BUG ĐANG MỞ (canonical — vòng 3, 2026-06-12)

> ⬜ = chưa fix. Mỗi bug CRITICAL/HIGH đã được 2 verifier độc lập confirm (✓✓) hoặc spot-check tay bằng code thật (✓tay). ID vòng cũ còn mở giữ nguyên ở mục 1C.

### 1A. CRITICAL — tiền / kho

| #   | Bug                                                                                                                                                                                                                                                                                          | File:Line                       | Verify | Trạng thái     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------ | -------------- |
| 3C1 | **/merge PBH làm MẤT TIỀN VÍ đã trừ + xoá công nợ nguồn**: INSERT PBH gộp KHÔNG carry `payment_amount/deposit/residual/cash_on_delivery/wallet_deducted` (rơi về 0), DELETE nguồn raw không hoàn `wallet_deducted`. Deterministic — merge 1 PBH có ví trừ/residual>0 là dính, không cần race | `fast-sale-orders.js:1033-1100` | ✓✓     | ✅ `904bc62d5` |

### 1B. HIGH mới (vòng 3)

**Bán Hàng:**

| #   | Bug                                                                                                                                                                                                                      | File:Line                     | Verify | Trạng thái     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------ | -------------- |
| 3H1 | /merge SELECT nguồn không FOR UPDATE → race với /cancel: đơn vừa huỷ+restock vẫn vào PBH gộp → tồn kho dôi, ví hoàn nhưng line vẫn bán                                                                                   | `fast-sale-orders.js:961-964` | ✓✓     | ✅ `904bc62d5` |
| 3H2 | Thu về `khong_nhan_hang` không gắn vòng đời PBH nguồn (không zero-out `wallet_deducted`/`stock_restored`) → cancel PBH sau đó = **double hoàn ví + double restock**; không guard 2 phiếu active cùng `source_order_code` | `web2-returns.js:600-713`     | ✓✓     | ✅ `904bc62d5` |

**Sale Online (native-orders + so-order):**

| #   | Bug                                                                                                                                                                                                      | File:Line                            | Verify | Trạng thái     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ | -------------- |
| 3H3 | **Huỷ đơn web KHÔNG hoàn tồn kho PBH** — sync chỉ set `state='cancel'`, mọi đường restock sau gate `state !== 'cancel'` → skip vĩnh viễn dù `stock_restored=FALSE`. UI còn hứa "tự trả tồn về kho"       | `native-orders.js:99-115, 2171-2176` | ✓✓     | ✅ `904bc62d5` |
| 3H4 | PATCH /:code không guard transition: `{status:'cancelled'}` bypass hoàn ví+restock; `cancelled→draft` hồi sinh PBH cancel→'done' không trừ lại kho/ví; sửa products đơn confirmed không chặn server-side | `native-orders.js:1797-1846, 86-91`  | ✓✓     | ✅ `904bc62d5` |
| 3H5 | /merge-to-pbh: KHÔNG trừ kho, `combinedLines` thiếu `productCode` (không bao giờ trừ/hoàn được), không FOR UPDATE/guard draft, không idempotent → double-submit 2 PBH + double-bill                      | `native-orders.js:2603-2706`         | ✓✓     | ✅ `904bc62d5` |

**Live Chat:**

| #   | Bug                                                                                                                                                                                                                    | File:Line                                                       | Verify | Trạng thái                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3H6 | **Auto-snap CHẾT sau rework PUSH-only**: `_handleNewCommentAuto` subscribe `live:newComment` nhưng KHÔNG còn chỗ nào emit (luồng mới đi SSE→prependComments không emit). Chip "Auto: ON" xanh nhưng không chụp         | `live-livestream-snap.js:3732` + `live-comment-list.js:910-980` | ✓tay   | ✅ `276a64355` (prependComments emit per-FRESH, verified 5 emit live)                                                                                                                            |
| 3H7 | `prependComments` + `_appendOlderBatch` đọc `state.comments` thô không qua `_visibleComments` → comment người-bị-ẩn (mặc định 2 page shop) lọt realtime/scroll + offset lệch gây **dòng trùng khi cuộn**               | `live-comment-list.js:972, 181-188`                             | ✓✓     | ✅ `276a64355` (`_filteredAll()` chung cho append/sentinel/prepend)                                                                                                                              |
| 3H8 | Relay WS server KHÔNG auth: `/api/stop` kill realtime, `/api/start` inject client lạ, `/api/events*` leak PII khách (tên, fb_id, phone). Kèm: nút "+ Lưu vào Live" POST `/api/live-saved` **không tồn tại** → luôn 404 | `live-chat/server/server.js:761-874` + `live-api.js:287-311`    | ✓tay   | ✅ `276a64355`+`cf11709bb` — 4 mutation routes + GET /api/events\* gate `x-relay-secret`; live-saved → `/api/web2-live-comments/saved` (web2_live_saved, web2Db); fix `livePancakeUrl` host chết |
| 3H9 | `offlineBatchAll` gán TẤT CẢ comment vào 1 video/broadcastStart (không group per-campaign như Force extract chip) → multi-campaign snapshot sai video + sai offset hàng loạt; auto-trigger silent khi campaign offline | `live-livestream-snap.js:708-770` + `live-init.js:687-703`      | ⚠ run1 | ✅ `cf11709bb` (group per-campaign + lọc người-ẩn)                                                                                                                                               |

**Mua hàng:**

| #    | Bug                                                                                                                                                                                                                  | File:Line                                                | Verify | Trạng thái     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------ | -------------- |
| 3H10 | Generic PATCH `/api/web2/purchase-refund/update/:code` merge thô `{...existing, ...payload}` — client ghi đè được `status`/`stock_deducted` → re-approve **double trừ kho** (server không strip field state-machine) | `web2-generic.js:409-413` + `purchase-refund.js:193-208` | ✓tay   | ✅ `904bc62d5` |

**Tài chính + Khách hàng:**

| #    | Bug                                                                                                                                                                                                       | File:Line                                                               | Verify | Trạng thái     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ | -------------- |
| 3H11 | **manual-deposit dual-base retry không idempotent**: CF Worker lỗi/timeout 524 sau khi Render đã COMMIT → client re-POST sang base fallback, server sinh `manualSepayId` MỚI mỗi request → **nạp/rút ×2** | `web2-manual-deposit.js:147-161` + `v2/web2-balance-history.js:899-903` | ✓✓     | ✅ `904bc62d5` |
| 3H12 | Reassign SELECT ngoài tx không FOR UPDATE, không re-check `linked_customer_phone`: 2 admin reassign cùng GD sang 2 KH khác nhau → **ví KH cũ bị withdraw ×2**, 1 GD bank sinh 2×amount credit             | `v2/web2-balance-history.js:403-546`                                    | ✓✓     | ✅ `904bc62d5` |
| 3H13 | `resolveWeb2PendingMatch` không transaction/lock, bỏ qua `alreadyProcessed`/`debt_added` → tiền nằm ví KH A, history ghi KH B (mismatch tiền-sổ im lặng)                                                  | `web2-sepay-matching.js:920-1007`                                       | ✓✓     | ✅ `904bc62d5` |
| 3H14 | **Mutation tiền balance-history + customers KHÔNG có middleware auth nào (kể cả soft)**: manual-deposit/reassign/link/resolve/auto-assign/merge/delete — gate 'admin' chỉ ở client ẩn nút                 | `server.js:673` + `v2/web2-balance-history.js` + `v2/web2-customers.js` | ✓✓     | ✅ `11b6d0717` |

**Sản phẩm:**

| #    | Bug                                                                                                                                                                            | File:Line                       | Verify | Trạng thái     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------ | -------------- |
| 3H15 | **Stored XSS** modal Lịch sử SP: `userName`/`userId` (client tự khai qua body/header, lưu `web2_product_history`) render innerHTML KHÔNG escape                                | `web2-products-app.js:884, 895` | ✓✓     | ✅ `cf11709bb` |
| 3H16 | `adjust-pending` SELECT không FOR UPDATE rồi UPDATE giá trị tuyệt đối → lost update `pending_qty` (2 máy so-order); nhánh ghost-delete có thể xoá nhầm SP khi pending vừa tăng | `web2-products.js:1013-1068`    | ✓✓     | ✅ `904bc62d5` |

**Tính năng mới:**

| #    | Bug                                                                                                                                                                                               | File:Line                                               | Verify | Trạng thái     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------ | -------------- |
| 3H17 | web2-monitoring `/audit/:id/revert` (đảo tiền ví — processWithdraw), `/retry-queue/replay`, blacklist KHÔNG auth; `web2-match-audit.revert()` còn không transaction/FOR UPDATE → double-withdraw  | `v2/web2-monitoring.js:144-248` + `web2-match-audit.js` | ✓✓     | ✅ `11b6d0717` |
| 3H18 | payment-signals `/approve` trên signal `dismissed`: guard chỉ chặn `confirmed` → **cộng ví + auto-reply khách** nhưng UPDATE `AND status='pending'` match 0 row → status kẹt dismissed            | `web2-payment-signals.js:420-424, 467-477`              | ✓tay   | ✅ `11b6d0717` |
| 3H19 | **[REGRESSION fix H9]** kpi-assignments `loadUsers()` fetch không gửi `x-web2-token` (route giờ gate HARD) → 401 → dropdown NV rỗng → trang phân công KPI chết (hàm `authToken()` có sẵn dòng 52) | `web2/kpi/js/kpi-assignments.js:65-67`                  | ✓tay   | ✅ `11b6d0717` |

**Báo cáo + Hạ tầng:**

| #    | Bug                                                                                                                                                                                                                                                                             | File:Line                                               | Verify | Trạng thái                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| 3H20 | pbh-reports bucket ngày theo UTC (`date_invoice::date`, `CURRENT_DATE` — session PG UTC): "Doanh thu hôm nay" sai mỗi sáng trước 7h, series/from-to lệch ranh giới (vi phạm quy tắc 10 GMT+7)                                                                                   | `pbh-reports.js:38-45, 130-138, 180`                    | ✓✓     | ✅ `6020700af`                                                                              |
| 3H21 | **Blocker bật ENFORCE**: `Web2Api._fetchJson` (mọi trang page-builder) + notification-bell + raw fetch native-orders/so-order KHÔNG gửi `x-web2-token`; web2-generic create/update/delete KHÔNG wire cả soft middleware; `userId/userName` history tin body client (spoof được) | `web2/shared/web2-api.js:16-29` + `web2-generic.js:329` | ✓✓     | 🟨 `11b6d0717` (server soft + web2-api/bell token; còn raw fetch native/so-order + bật env) |

### 1C. HIGH/khác carry-over từ vòng 2 (verify vòng 3: VẪN MỞ)

- ✅ **H11** `276a64355` — server GET thêm `sinceUpdated` (updated_at epoch ms) + client cursor `_lastUpdatedMaxMs` overlap 3s + `prependComments` merge theo id (UPDATE patch DOM row, skip khi đang gõ). Cũng vá luôn biến thể MỚI: multi-campaign comment post B về trễ created_time < max(post A) bị mất VĨNH VIỄN (bug 'mất tin nhắn' user báo 2026-06-12) — `live-init.js` + `web2-live-comments.js:406`.
- ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` **1D-refunds-old-flow** — KHAI TỬ: nút "Trả hàng" trang PBH → điều hướng Thu về với prefill `?prefillPhone=&prefillOrder=` (subType `khong_nhan_hang` — atomic kho+ví+vòng đời PBH từ 3H2); server `POST /api/refunds/from-pbh` trả **410 Gone**; GET data refunds cũ giữ read-only. (Các MEDIUM kèm theo — nextNumber retry, validate refundLines — thành moot vì route tạo đã đóng.)
- ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` **1D-reconcile-no-lock** — 4 route `/pack /ship /deliver /cancel-pack` vào `withTransaction` + FOR UPDATE + whitelist transition (pack chỉ từ pending/picking/picked — hết kéo lùi shipped→packed; ship/deliver chặn PBH `state='cancel'`).
- ✅ `01cb771dd` **SO-ws-sse-double** — đã gỡ WS legacy cả server (4 route) lẫn client (rtConnect + PbhRealtime 4 trang) — chỉ còn 1 kênh Web2SSE.
- ⬜ **SO-bulk-double-submit** — `/from-native-order` check-then-act theo `source_id` không FOR UPDATE/unique; retry-23505 bump suffix biến race thành PBH trùng.
- ⬜ **SO-firestore-1doc** — so-order 1 doc `web2_so_order/main` last-write-wins + pullOnce conflict window + URL hardcode workers.dev (architectural — đợt E).
- ✅ `cf11709bb` **LC-pollnow-auth** — live-comments 8 route (poll-now/bulk/campaigns/assign/unassign/saved) gate soft + poll-now cap 10 posts; snapshots 8 route (snapshot/refresh/offline-batch cap 2000/delete/extract-\*/stream-url) gate soft; poller-pages đã gate đợt G.
- 🟨 **LC-web1-lookup / LC-campaign-5000 / LC-enricher-set / LC-sse-nhiem** — ✅ `21da4b762` LC-campaign-5000 (limit 5000→1500 + warn + notify khi chạm cap) · LC-enricher-set (`reset()`/`clearAttempted()` clear Set khi đổi campaign) · LC-sse-nhiem (guard `_fetchLiveCommentDelta` return sớm khi đang xem campaign cha `_origComments!=null` → không advance cursor/prepend nhầm). ⬜ còn LC-web1-lookup (xem mục 2; phần lớn đã đóng ở đợt I).
- 🟨 **Cụm đợt E ví NCC** — ✅ `01cb771dd` PHẦN LỚN ĐÃ ĐÓNG bằng server ledger `/api/web2-supplier-wallet` (transaction + UNIQUE tx_id): recordPayment/confirmPay lost-update ✅ (await + idempotent) · saveSupplierNote dup + saveSupplier RMW ✅ (meta atomic ON CONFLICT) · purge 30d ✅ (server giữ full audit) · Sync.init đè local ✅ (server source of truth) · nextMoveName race ✅ (sequence server) · SePay dup cross-machine ✅ (txId `tx-sepay-<sid>`) · `Web2SuppliersCache.ensure()` RMW ✅ (POST /suppliers) · match SP bằng TÊN ✅ confirmReturn ưu tiên `p.code` row so-order · returnedRowIds qty/amount thật ✅. **CÒN ⬜:** quick-refund 3-step orphan draft khi approve fail (cần endpoint server atomic gộp) · picker không cộng dồn · 2 đường trả hàng NCC (UX — cả 2 giờ đều atomic nhưng vẫn 2 entry point) · SePay match substring tên · partial return filter `!returnedRowIds[rowId]` vẫn khoá phần còn lại (data đã có qty thật — sửa filter là xong) · công nợ tính cả draft/cancelled · bucket ngày UTC (đợt GMT+7) · so-order Firestore 1-doc (kiến trúc riêng).
- 🟨 **TC-cụm** — ✅ `b21df92b5` phone-norm: normPhoneWeb2 strict (84→0, null nếu ≠10) áp /create /upsert /enrich-fb /PATCH · ✅ `21da4b762` merge KH giữ phone phụ + union `alt_phones`/`alt_addresses`/`fb_psids` (primary wins) + cảnh báo ví orphan khi secondary có số dư · ✅ `21da4b762` deposit race window: partial UNIQUE INDEX `idx_web2_wallet_tx_unique_manual` (reference_id,type) WHERE reference_type IN manual/balance_history + dup-check. ⬜ còn: wallet event nextTick trước COMMIT · performedBy fallback 'admin' + modal Gán KH không gửi verifiedBy · openDetail không lookup alt_phones.
- 🟨 **SP-cụm** — ✅ `21da4b762` variants double-render: reload đi DUY NHẤT qua SSE `web2:variants` debounce 600ms (bỏ reload từ cache-subscriber, giữ cache.init data nóng). ⬜ còn: pgString inline (:717,765) · `_tablesCreated` share pool còn `web2-variants.js:37` + `web2-dedicated-entity.js:48` (`_ready`).
- 🟨 **TM-cụm** — ✅ `21da4b762` kpi default-open (no-viewer + enforce → 401; `/kpi` đã gửi token) + reclassify gate `requireWeb2Admin` (0 frontend caller) + forecast/actual dead → gate `requireWeb2AuthSoft` + comment deprecate · ✅ `21da4b762` ck-dashboard SSE 0ms → debounce 550ms · ✅ `21da4b762` audit-log bảng thiếu silent → warning field + `console.warn` · ✅ `6020700af` dashboard revenue_7d pin GMT+7 · ✅ `a90ddc488` monitor pause tab ẩn · ✅ `b21df92b5` firebase compat ĐÃ GỠ (kpi ×2 gỡ 3 thẻ + firestore-compat ~470KB, services-dashboard/delivery-zone/printer-settings gỡ 2 thẻ + firebase-config). ⬜ còn: notifications không cron + scan serial ~400 query.
- 🟨 **BC-cụm** — ✅ `01cb771dd` report-revenue WS legacy → Web2SSE (3W4; CSS import native-orders vẫn ⬜) · 🟨 report-delivery from≤to ✅ `a90ddc488` (realtime vẫn ⬜) · ✅ `21da4b762` printer .bat 404 GH Pages (URL `.ps1` dùng `new URL('../../scripts/...', location.href)` thay `location.origin`). ⬜ còn: CSS import native-orders · token plaintext DB + `?token=` query.
- 🟨 **HT-cụm** — ✅ `21da4b762` bridge refocus dùng `lastEventAt || lastConnectedAt` (chỉ reopen khi im lặng THẬT >60s, hết force-reopen oan) · ✅ `21da4b762` `?v=` đồng nhất `20260613b` cho `web2-sse-bridge.js` trên 28 trang (hết phân mảnh 7 giá trị) · ✅ `d57969738` page-shell.js dead code đã XOÁ (page-builder `Web2Page` thay thế; docs UI-FIRST/CLAUDE.md đã sửa) · ✅ `a90ddc488` `/sse` cap 50 keys. ⬜ còn: bridge recreate toàn bộ EventSource mỗi lần đổi tập topic (churn + miss event) — fix tối thiểu giữ reconnect logic.

### 1D. MEDIUM (chọn lọc — đáng fix khi đụng file)

**Auth lỗ còn lại (cùng họ 3H14/3H17 — gắn soft là xong):** ✅ `11b6d0717` `web2-cutout` soft + rate-limit 20/phút/IP · ✅ `11b6d0717` `dashboard-kpi` GET soft · ✅ `11b6d0717` `audit-log` /list+/entities soft · ✅ `11b6d0717` notifications list/unread/read/mark-all soft (mark-all vẫn global theo thiết kế) · ✅ `11b6d0717` pancake-refresh GET /status soft · ✅ `11b6d0717` poller-pages mutation soft + `_notify` SSE · ✅ `11b6d0717` backfill ×2 gate `requireWeb2Admin`.

**Race/atomicity còn sót (cùng class đã fix nơi khác):** ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` web2-users TOCTOU — check+UPDATE gộp 1 câu atomic (EXISTS admin khác) · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` `/refunded` transaction + FOR UPDATE + whitelist từ approved + idempotent · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` dedicated PATCH theo pattern H12 + DELETE RETURNING→404 + `_ready`→WeakSet · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` upsert-pending ORDER BY exact-variant-match DESC · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` DELETE products 1 câu atomic RETURNING \* (snapshot đủ cột) · ✅ `0661129d1` so-order in-tem: upsert-pending resolveOnly:true (chỉ lấy mã, không cộng pending) · ✅ `0661129d1` from-comment re-check draft DƯỚI advisory lock → merge · ✅ `0661129d1` DELETE native-orders chặn PBH active (409) trừ ?force=1 · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` deductStock/restockStock rowCount=0 → throw rollback · ⬜ hidden-commenters PATCH cả mảng last-writer-wins · ✅ `0661129d1` relay fallback load LIKE 'pancake%'.

**Hiển thị/logic sai:** ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` Bomb filter → `'Bom'` · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` phones overlay + key merge qua normPhone · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` aggregate + overlay trừ CTE `reassign_out` · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` toast generic theo payload strip + refreshSinglePhone · ✅ `b21df92b5` exportCsv ví KH filter vip/warning/bomb export từ state.rows · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` card dùng `d.revenue.total` · ✅ `0661129d1` /summary native/dlv/refund lọc theo range days (cùng cutoff) · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` A5 đọc `Web2Auth.getStored().user.id`, bỏ nhánh Web 1.0 · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` client validate mọi overlap khớp server · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` placeholder "Đã lưu — nhập lại nếu muốn đổi" · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` hint → 8 ký tự · ✅ `b21df92b5` PATCH customers reject name rỗng + phone không 10 số; normPhoneWeb2 strict (84→0, null nếu ≠10).

**GMT+7 cluster — ✅ `6020700af` ĐÃ ĐÓNG TOÀN BỘ (2026-06-12 tối):** supplier-debt bucket helper `vnDate` ✅ · audit-log filter nửa khoảng [from, to+1) pin VN ✅ · page-builder `fmtTime` + history-timeline + products modal + balance-history `fmtTime` pin `Asia/Ho_Chi_Minh` ✅ · pbh-reports `/delivery` default + toàn bộ cast ngày ✅ (3H20).

**SSE/notify thiếu:** ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` cả 3 endpoint notify sau mutation · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` dashboard debounce 600ms · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` S5-residual strip về tickle · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` bridge nghe `test` · ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` xoá dead topic.

**XSS/escape residual:** ✅ `8947639bb` S6-residual variants-app + products-print → 5 ký tự · ✅ `8947639bb` cluster 4-ký-tự thêm nháy đơn (balance-history ×5, purchase-refund, history-timeline) · ✅ `b21df92b5` CSV formula injection — csvEscape prefix nháy đơn khi cell `=+-@` · ✅ `b21df92b5` page-builder saveModal guard disabled + finally.

**Khác:** ✅ `723d23fc8`+`a90ddc488`+`d9c3ba96b` adjust-stock push warning khi clamp chạm 0 (best-effort) · ⬜ manualSepayId wrap ~27.8h → 409 khó hiểu · ✅ `0661129d1` \_batchStatus sweep 10' xoá batch xong + cap 200 · ✅ `0661129d1` auto-snap lọc LiveHiddenCommenters.isHidden · ⬜ returnedRowIds lưu qty:0/amount:0.

---

## 2. 🔵 Tách biệt Web 1.0 ⊥ Web 2.0 — kết quả sweep chuyên sâu (vòng 3)

> Sweep riêng toàn bộ frontend (web2/, native-orders/, so-order/, live-chat/) + backend Web 2.0: pool, bảng, API call, SSE hub, Firestore, cross-import, localStorage. Verdict tổng: **TỐT — đạt ~95%**. Chi tiết theo mức:

### 2.1 ✅ Đạt chuẩn (verify code thật)

- **Pool**: 100% route/service Web 2.0 dùng `web2Db || chatDb`; 0 chỗ INSERT/UPDATE bảng nghiệp vụ Web 1.0 (`customers`, `customer_wallets`, `balance_history`, `invoice_status`, `purchase_order_images` — đều 0 hit).
- **livestream-snapshots/images**: commit `cb45ef604` dời sạch sang `web2Db || chatDb` ở MỌI handler — chỉ còn data nguồn nằm lại chatDb chờ DROP (cố ý) + comment stale `livestream-images.js:10`.
- **SSE**: server.js wire ~20 module đúng hub `web2RealtimeSseRoutes`; frontend chỉ mở EventSource tới `/api/realtime/web2/sse`; route Web 1.0 (order-notes/showroom/web-warehouse) wire hub legacy đúng chủ đích. Không route nào có notifier mà quên wire.
- **Firestore data**: collections nghiệp vụ đã prefix `web2_`. Không cross-import code từ orders-report/inbox/chat.
- **REFUTED (không phải contamination)**: `web2-realtime.js` GET `/pending-customers` + POST `/mark-replied` — verifier bác: bảng thật là `pending_customers` (broker Pancake chung), không phải mutate `realtime_updates` như nghi vấn ban đầu.

### 2.2 🔴 2 vi phạm GHI thật — cần fix (đợt I)

| #   | Vi phạm                                                                                                                                                                                                                  | File                                                                     | Verify | Trạng thái     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------ | -------------- |
| 3W1 | **Web 2.0 CRUD thẳng bảng `quick_replies` (chatDb TRẦN, Web 1.0 prod)** qua `/api/quick-replies` — xoá quick-reply từ trang beta = MẤT luôn ở chat Web 1.0 prod. Fix: fork `web2_quick_replies` (web2Db) + one-time copy | `web2/shared/web2-quick-reply.js:114-166` + `routes/quick-replies.js:16` | ✓✓     | ✅ `01cb771dd` |
| 3W2 | **Web 2.0 ghi Firestore `message_templates` (KHÔNG prefix, collection prod Web 1.0)** — update/add/delete template từ modal Web 2.0 đổi/mất template của chat orders-report. Fix: fork `web2_message_templates` + copy   | `web2/shared/web2-msg-template.js:101-194`                               | ✓✓     | ✅ `01cb771dd` |

### 2.3 🟠 Đọc nhầm nguồn Web 1.0 (hiển thị lệch — nên chốt 1 nguồn)

- ✅ `01cb771dd` **LC-web1-lookup** [KNOWN]: `showPancakeCustomerInfo` gọi `/api/v2/customers/{phone}` + `/by-fb-id/` (bảng `customers` chatDb) TRƯỚC, không qua kho `web2_customers` — trong khi `live-kho-enricher` cùng folder đã dùng đúng `/api/web2/customers/batch-by-fbid` (✓✓ MEDIUM).
- ✅ `01cb771dd` **3W3**: badge "nợ" live-chat (`debt-manager.js:69` + `pancake-api.js:802`) đọc `/api/v2/wallets/batch-summary` (ví Web 1.0 `customer_wallets`) trong khi CÙNG màn hình pill `Web2WalletBalance` đọc ví Web 2.0 → **2 nguồn số dư mâu thuẫn trên 1 KH** (✓✓ MEDIUM).

### 2.4 🟡 Lệch convention (chạy đúng nhưng sai hub/pattern)

- ✅ `01cb771dd` **3W4**: `pbh-realtime.js` — WS legacy `wss://n2store-fallback` (`broadcastToClients` hub chung Web 1.0) với bare topics `pbh:*`/`native_order:*`/`delivery:*`/`refund:*`; phạm vi RỘNG hơn ghi nhận cũ: **4 trang** (report-revenue, fastsaleorder-invoice/-delivery/-refund) + native-orders + **4 route server** broadcast song song cả 2 kênh (gốc của SO-ws-sse-double). Migrate → Web2SSE rồi gỡ broadcastToClients khỏi route Web 2.0.
- ✅ `01cb771dd` **3W5**: `web2-suppliers-cache.js:104-125` dùng Firestore `onSnapshot` (vi phạm quy tắc 6 — Web 2.0 không Firestore listener; collection prefix đúng). Server đã có topic `web2:supplier-wallet` → có đường migrate. Kèm `ensure()` RMW lost-update (1D).
- ⬜ **3W6**: `web2-sidebar.js:_isAdmin()` gate item adminOnly bằng auth Web 1.0 (`loginindex_auth`/`userType`) thay vì Web2Auth role — UI gating trộn 2 hệ auth (server vẫn gate đúng).
- ⬜ Trang Web 2.0 còn load Firebase compat SDK thừa: kpi ×2 (cả **firestore-compat** ~470KB), services-dashboard, delivery-zone, printer-settings.

### 2.5 🟢 Shared CỐ Ý — chấp nhận, giữ trong danh mục theo dõi

- `pancake_accounts` + `pancake_page_access_tokens` (chatDb) — credential store chung 2 layer, có comment "SHARED store web1/web2" (`server.js:775,791,820`; poller/unread-reconcile/msg-send-worker đọc/ghi PAT best-effort); Firestore `pancake_tokens` chỉ relay server còn đọc; localStorage `pancake_all_accounts` cache chung kiểu `loginindex_auth`.
- Đọc data Web 1.0 qua API có chủ đích = hợp lệ theo rule 5b (không đọc trực tiếp bảng).

### 2.6 ⚠ Rủi ro HỆ THỐNG của pattern fallback `|| chatDb`

✅ `01cb771dd` **3W7**: nếu env web2Db thiếu/sai sau deploy hoặc web2Db down lúc boot → TOÀN BỘ ensureTables + write Web 2.0 (kể cả bytea livestream, ví) **âm thầm rơi xuống chatDb prod** — đã có 2 tiền lệ (web2\_\* leftover tables; chatDb full 1GB vì bytea). Đề xuất: log cảnh báo to ở boot khi `web2Pool` null + env `WEB2_REQUIRE_DB=1` để fail-fast.

**Disputed (cần user xác nhận khi đụng):** toggle "Server mode" live-chat split-brain key (`pancake_server_mode` vs `web2_pancake_server_mode`) — verifier xác nhận key lệch là thật nhưng code bị cite là dead code, đường UI sống không rõ → check tay khi sửa settings live-chat.

---

## 3. Pattern lỗi LẶP toàn hệ thống (cập nhật vòng 3)

1. **Route gộp/tách/sync là điểm mù atomic** _(họ bug lớn nhất vòng 3)_: /merge, /merge-to-pbh, /split, PATCH status, sync native↔PBH đều thiếu FOR UPDATE / carry tiền / restock — trong khi đường chính (create/cancel/approve) đã chuẩn. Fix 1 nghiệp vụ → grep TOÀN BỘ đường vào cùng bảng, **kể cả đường sync 2 chiều**.
2. **Auth gắn theo file, không theo posture**: wallets có soft, balance-history/monitoring/cutout/dashboard-kpi/audit-log/notifications-read KHÔNG có gì. Cần `router.use(requireWeb2AuthSoft)` blanket per-file thay vì per-endpoint.
3. **Fix client quên đồng bộ caller** _(mới)_: gate HARD H9 → kpi-assignments 401 (3H19); strip payload S5 → toast customer-wallet đọc field không còn (1D); rework PUSH-only → auto-snap event không ai emit (3H6). Đổi contract server/luồng event → grep mọi consumer.
4. **escapeHtml copy-paste drift**: 3 thế hệ helper (5/4/3 ký tự) rải ~15 file. Cần module shared `web2-escape.js` (đề xuất #2 mục 6).
5. **FOR UPDATE ngoài transaction = vô hiệu** (đã biết) — còn sót: adjust-pending, reassign (SELECT ngoài tx), match-audit revert, dedicated-entity PATCH, /refunded.
6. **Bucket ngày UTC thay vì GMT+7**: pbh-reports, dashboard revenue_7d, audit-log filter, supplier-debt, page-builder fmtTime — cần helper SQL `(ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` + helper JS `Intl.DateTimeFormat(...,{timeZone:'Asia/Ho_Chi_Minh'})` dùng chung.
7. **Idempotency dựa pre-check READ COMMITTED**: manual-deposit (dual-base retry), from-native-order, deposit/withdraw — cần unique index + client idempotency key (đề xuất #3).
8. Firestore client-write money NCC (đợt E) + 1-doc RMW lan sang cả shared cache (suppliers-cache ensure, hidden-commenters, saveSupplier).

---

## 4. Chi tiết theo nhóm trang (verdict vòng 3)

> Mỗi nhóm: cách vận hành đã map đầy đủ trong audit (howItWorks lưu ở transcript wf_a3c6b356-f72); dưới đây là verdict + pointer bug.

### 4.1 Bán Hàng (5 trang) — PBH · reconcile · refund · returns · delivery

Pipeline: PBH (`fast_sale_orders`) ← from-native-order/manual (atomic, retry-23505) → cancel/bulk/delete qua `_cancelPbhInTx` (FOR UPDATE + restock idempotent + hoàn ví) → reconcile state machine fulfillment scanner-driven → Thu về (`web2_returns`) cộng kho+ví trong tx → delivery-invoices state machine FOR UPDATE chuẩn. Realtime đúng hub web2 + WS PbhRealtime song song (3W4).
**Verify vòng 3**: 6 fix cũ giữ vững (C1, C2, H2, H3, DELETE-draft, return-failed). **Mới: 3C1 (merge mất tiền), 3H1, 3H2**. Còn mở: 1D-refunds-old-flow (flow chết), 1D-reconcile-no-lock, delivery PATCH/DELETE force không guard state (1D vòng 1 → giữ), dlv-app không gửi `by` (LOW).

### 4.2 Sale Online — native-orders · so-order

Đơn từ comment livestream (idempotent fb_comment_id) / tạo tay; KH upsert kho; PBH/merge/split sync 2 chiều; so-order local-first IDB + Firestore 1 doc, đẩy Kho SP qua upsert-pending → confirm-purchase-partial.
**Verify vòng 3**: C7/H14/H15 giữ vững (confirmReceive). **Mới: 3H3, 3H4, 3H5** + in-tem double-pending, from-comment 2 draft song song, DELETE mồ côi (1D). Còn mở: SO-ws-sse-double, SO-bulk-double-submit, SO-firestore-1doc, 1D-phone-raw (🟨 — vẫn lưu raw ở from-comment/create-manual/PATCH/merge), SO-token.

### 4.3 Live Chat (2 trang)

PUSH-only: relay WS 24/7 → `/ingest` (gate relay-secret) → `pollPostNow` per-post → `web2_live_comments` → SSE `web2:live-comments` → delta prepend. Capture: auto-snap (eventBus) + Force extract FB SDK Player + offline-batch yt-dlp. Ẩn người qua web2-generic + SSE.
**Verify vòng 3**: Force extract per-comment resolve ✓, capture lock CAS ✓. **Mới: 3H6 (auto-snap chết), 3H7, 3H8 (relay no-auth + live-saved 404), 3H9** + hidden lost-update, relay creds fallback mismatch, `_batchStatus` leak (1D). Còn mở: H11, LC-pollnow-auth (+snapshots routes), LC-web1-lookup (→2.3), LC-campaign-5000, LC-enricher-set, LC-sse-nhiem, 3W3 (badge nợ ví Web 1.0).

### 4.4 Mua hàng (3 trang)

purchase-refund 3-step client (create→approve→ví) + state machine server; supplier-wallet/debt thuần Firestore client-write (đợt E).
**Verify vòng 3**: C6/H4/H5/H6c giữ vững; E-vi-fire-forget 🟨 (double-click guard ĐÃ có, fire-and-forget còn). **Mới: 3H10 (generic PATCH bypass)** + /refunded không tx, deductStock nuốt rowCount, partial return khoá, bucket UTC, công nợ tính draft/cancelled, saveSupplier RMW, CSV injection (1D). Còn mở: nguyên cụm đợt E.

### 4.5 Tài chính + Khách hàng (3 trang)

SePay → `web2_balance_history` → matcher → ví (`processDeposit` idempotent sepay) → pending multi-match; Kho KH warehouse; Ví KH overlay CTE. Realtime qua `web2WalletEvents` → hub (tickle không PII).
**Verify vòng 3**: C3/C4/H6/S5-core/linkTransaction/idempotency-key giữ vững; exportCsv `fetchAggregateWeb2Only` tồn tại thật. **Mới: 3H11, 3H12, 3H13, 3H14** + Bomb filter, phones 84 overlay, aggregate reassign_out, toast strip, auto-assign no-notify, manualSepayId wrap (1D). Còn mở: TC-cụm (1C).

### 4.6 Sản phẩm (3 trang) + generic + dedicated

**Verify vòng 3**: C5/S1/S6-core/H12/H13 giữ vững. **Mới: 3H15 (XSS history), 3H16 (adjust-pending)** + dedicated PATCH no-tx, upsert-pending variant-NULL match, S6-residual variants/print, `_ready` share pool, DELETE TOCTOU, backfill no-admin, adjust-stock clamp silent (1D). Còn mở: SP-cụm (1C).

### 4.7 Tính năng mới (9 trang)

**Verify vòng 3**: S2/S7/H7/H9 giữ vững (H9 sinh regression 3H19). **Mới: 3H17 (monitoring), 3H18 (approve dismissed), 3H19** + cutout/dashboard-kpi/audit-log/notifications-read không auth, dashboard SSE burst, kpi overlap mismatch, ck-review dismiss không check response (1D). Còn mở: TM-cụm (1C).

### 4.8 Báo cáo + Cấu hình (7 trang)

**Verify vòng 3**: S3/S4/H8/H10/H16 giữ vững. **Mới: 3H20 (UTC bucket)** + card 30-ngày, TOCTOU admin cuối, users-app A5 identity, pancake-refresh /status, poller-pages no-auth+no-notify, hint mật khẩu, /summary all-time (1D). Còn mở: BC-cụm (1C).

### 4.9 Hạ tầng chung

Bridge 1 EventSource multiplex; hub Map<topic,Set>; wiring matrix ĐỦ (0 route quên wire); auth middleware 3 mức.
**Verify vòng 3**: H6 wildcard/S5-core/relay-notify fail-closed giữ vững. **Lưu ý quan trọng**: claim "SSE ví đứt vì exact-match" của 1 agent bị HẠ CẤP sau kiểm chứng — ví realtime chạy qua `web2WalletEvents` emitter (mọi mutation ví đi qua wallet-service đều emit) → hoạt động; các call `_notify('web2:wallet:<phone>')` exact-match trong route chỉ là dead code vô hại. **Mới: 3H21 (enforce blocker)** + S5-residual `web2:customer-wallet`, bridge churn, /sse no key-cap, eventType test, supplier-rating dead topic, page-builder fmtTime UTC + saveModal double-submit, history-timeline escape 4-char (1D). Còn mở: HT-cụm (1C).

---

## 5. Ma trận tuân thủ quy ước (sau vòng 3)

| Quy ước                      | Đạt                                                                                                    | Vi phạm chính còn lại                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pool `web2Db \|\| chatDb`    | ✅ 100% route                                                                                          | quick-replies (chatDb trần — 3W1); rủi ro fallback hệ thống (3W7)                                                                                                   |
| Không ghi store Web 1.0      | ✅ bảng nghiệp vụ 0 hit                                                                                | 3W1 `quick_replies` + 3W2 Firestore `message_templates`                                                                                                             |
| SSE hub web2 / topic `web2:` | ✅ wiring matrix đủ                                                                                    | 3W4 WS legacy `pbh:*` (4 trang + native-orders + 4 route); 3W5 onSnapshot suppliers-cache                                                                           |
| Không Firestore listener     | ✅ đa số                                                                                               | 3W5 `web2-suppliers-cache.js`                                                                                                                                       |
| Lookup KH kho trước          | ✅ đa số (enricher, harvest)                                                                           | LC-web1-lookup + 3W3 badge nợ                                                                                                                                       |
| SSE notify sau commit        | ✅ đa số                                                                                               | auto-assign/auto-match/reprocess; poller-pages; wallet event nextTick trong tx                                                                                      |
| Client SSE debounce          | ✅ đa số                                                                                               | dashboard (0ms + nocache), ck-dashboard, bell                                                                                                                       |
| UI-first `Web2Optimistic`    | ✅ handler chính                                                                                       | (ngoại lệ money/modal hợp lệ giữ nguyên)                                                                                                                            |
| Auth server-side             | ✅ HARD: users, delete-all, SSE admin, monitor · SOFT: wallets, paysig, pbh-reports, notifications-CUD | **3H14** balance-history/customers · **3H17** monitoring · cutout, dashboard-kpi, audit-log, notifications-read, poller-pages (1D) · **3H21** client chưa gửi token |
| XSS escape 5 ký tự           | ✅ products-app, page-builder, customers-app                                                           | **3H15** history userName · S6-residual variants/print · cluster 4-ký-tự (1D)                                                                                       |
| GMT+7 hiển thị/bucket        | ✅ revenue_today, SharedUtils.parseTimestamp                                                           | **3H20** pbh-reports · revenue_7d · audit-log filter · supplier-debt · page-builder/history-timeline/products/balance fmt                                           |
| Sinh mã retry-23505/lock     | ✅ 8 chỗ                                                                                               | refunds.js nextNumber; nextMoveName client; from-native-order retry bump suffix                                                                                     |

---

## 6. Lộ trình fix (vòng 3)

1. ✅ **Đợt F — tiền/kho mới (DONE 2026-06-12, commit `904bc62d5`)**: 3C1 + 3H1 (/merge: FOR UPDATE + carry 5 cột tiền) · 3H2 (lock PBH nguồn + zero-out cờ + unique index + DELETE trả cờ) · 3H3 (cancel đơn web → `_cancelPbhInTx` per-PBH cùng tx; gate restock theo cờ — PBH kẹt cũ tự lành) + 3H4 (PATCH guard transition) · 3H5 (merge-to-pbh: guard draft + productCode + trừ kho + idempotent + nguồn→confirmed) · 3H10 (generic strip field state-machine) · 3H11 (idempotencyKey FNV-1a→sepay_id) + 3H12 (reassign FOR UPDATE + re-check) + 3H13 (resolve tx + guard debt_added/alreadyProcessed) · 3H16 (adjust-pending FOR UPDATE).
2. ✅ **Đợt G — auth blanket phần 2 + enforce-prep (DONE 2026-06-12, commit `11b6d0717`)**: 3H14 (16 mutation soft + req.web2User fallback) · 3H17 (HARD admin + revert vào tx, lỗi ví → rollback) · 3H18 (guard ≠ pending → 409) · 3H19 · cụm 1D auth đủ 7 nhóm · 3H21 server-side xong (generic+dedicated soft, identity req.web2User) + client trung tâm (web2-api, bell, kpi-assignments). **✅ ĐÃ BẬT `WEB2_AUTH_ENFORCE=1` (2026-06-13, ENFORCE-PREP `248532b73` + deploy `07f4a0e02`)**: wire token ~30 client file (helper `Web2Auth.authHeaders()`), verify prod 401/200/strip + 8 trang money load 0×401. Xem mục 0 đầu file.
3. ✅ **Đợt H — live-chat realtime (DONE 2026-06-12, `276a64355` + `cf11709bb`)**: ✅ 3H6 · ✅ 3H7 · 🟨 3H8 (mutation auth + live-saved route + host chết; còn /api/events PII) · ✅ H11 + bug mất-tin-multi-campaign · **BONUS: drag-drop tạo đơn 500 — `crm_team_id INTEGER` tràn vì FB Page Id 15 chữ số sau gỡ TPOS → ALTER BIGINT cả native_orders + fast_sale_orders** · ✅ 3H9 · ✅ LC-pollnow-auth + snapshots auth (cf11709bb).
4. ✅ **Đợt I — tách Web 1.0 dứt điểm (DONE 2026-06-12, `01cb771dd`)**: 3W1 ✅ (route `/api/web2-quick-replies` + auto-seed) · 3W2 ✅ (`web2_message_templates` + one-time copy) · 3W3 + LC-web1-lookup ✅ (batch-summary ví Web 2.0 + kho KH) · 3W4 ✅ (17 block WS gỡ khỏi 4 route + 5 trang → Web2SSE, 1 chỗ bù SSE `promoted-to-confirmed`; ⚠ `scripts/pbh-qa-test.js:402` còn assert WS — cần đổi sang SSE khi chạy QA) · 3W5 ✅ · 3W7 ✅ (env `WEB2_REQUIRE_DB=1` chưa bật trên Render — bật khi muốn fail-fast). ⬜ còn 3W6 (sidebar `_isAdmin` đọc auth Web 1.0 — UI gating nhẹ).
5. ✅ **Đợt E — kiến trúc ví NCC (DONE PHẦN LÕI 2026-06-12, `01cb771dd`)**: server ledger + meta + sequence + import one-time + SSE; 4 client swap storage (supplier-wallet, supplier-debt, purchase-refund, suppliers-cache) — đóng ~9 bug Firestore client-write (chi tiết mục 1C cụm đợt E). ⬜ chừa: so-order per-tab doc; hợp nhất UX 2 đường trả NCC; quick-refund server-atomic endpoint.
6. ✅ **Đợt GMT+7 + escape (DONE 2026-06-12)**: ✅ GMT+7 XONG (`6020700af` — 3H20 pbh-reports AT TIME ZONE + revenue_7d + audit-log + supplier-debt vnDate + 4 client fmt). ✅ escape XONG (`8947639bb`): module `web2/shared/web2-escape.js` (escapeHtml 5-ký-tự + escJs + safeUrl + safeImageUrl — trang MỚI dùng module này, ĐỪNG copy); S6-residual variants-app + products-print DOM-based → 5 ký tự; cluster 4-ký-tự thêm nháy đơn (balance-history ×4 + purchase-refund + history-timeline). → **Đợt GMT+7 + escape HOÀN TẤT.**

---

## 7. Đề xuất cải thiện (sau khi sạch bug)

1. **Idempotency-Key chuẩn cho mọi money op** (client UUID/lần bấm + unique index `(reference_id, type)` cho manual/balance_history) — đóng cả họ 3H11/TC-deposit-race/double-submit.
2. **Module escape shared** `web2/shared/web2-escape.js` — S6 phải fix tay 3 lần là bằng chứng copy-paste drift.
3. **Helper `Web2Auth.apiFetch`** tự gắn `x-web2-token` — tránh lặp regression kiểu 3H19.
4. **`Web2SSE.subscribeDebounced(topic, cb, ms)`** trong bridge — fix dứt điểm pattern "SSE không debounce" (dashboard, ck, bell) 1 chỗ.
5. **Cron auto-scan notifications** (10-15') + batch INSERT…ON CONFLICT (đã có unique index) — từ ~400 query serial xuống ~4.
6. **Sequence Postgres cho mã phiếu** thay COUNT/MAX+retry; **hợp nhất normalize phone** server-side về 1 hàm (84→0, trả null nếu ≠10 số).
7. **Hợp nhất `?v=`**: 1 hằng ASSET_VERSION + script bump — hết phân mảnh 7 giá trị.
8. 🟨 **Re-fetch-on-reconnect bridge** + track lastEventAt thay connect-time — ✅ `21da4b762` track `lastEventAt` (refocus reopen đúng); ⬜ còn re-fetch hook + bridge churn khi đổi topic.
9. **Gỡ Firebase compat SDK** khỏi kpi ×2/services-dashboard/delivery-zone/printer-settings (~200-470KB/trang).
10. ✅ **page-shell.js đã XOÁ** (`d57969738`, 0 trang dùng — page-builder `Web2Page` thay thế) + docs UI-FIRST/CLAUDE.md đã sửa cho khớp.

---

_Vòng 3 sinh bởi 54 agent (10 audit + sweep contamination + 2 verifier/finding) ngày 2026-06-12, transcript `wf_a3c6b356-f72`. Bản vòng 1: commit `78def00e0` · vòng 2 + bảng fix A-D đầy đủ: commit `1781023d5`. Cập nhật trạng thái từng dòng khi fix (⬜ → ✅ + sha)._
