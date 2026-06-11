<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 docs. -->

# Web 2.0 — Phân tích toàn diện 34 trang menu

> **Ngày audit:** 2026-06-10 · **Phương pháp:** 9 agent đọc song song toàn bộ frontend (HTML/JS) + route backend (render.com/routes) + DB/SSE wiring của từng trang trong menu Web 2.0.
> **Trạng thái:** ✅ **ĐÃ FIX phần lớn (2026-06-10, Wave 1+2)** — xem mục 0 bên dưới. Bug được liệt kê kèm `file:line` + severity.

---

## 0. Trạng thái fix (2026-06-10 — Wave 1 + Wave 2)

> Fix qua 12 agent song song theo cụm file không chồng chéo, mỗi file `node --check` PASS. **Browser test click UI thật 34/34 trang Web 2.0 SẠCH** (`scripts/web2-ui-test.js` → `downloads/n2store-session/web2-ui-test.md`; lỗi duy nhất `getUserMedia NotSupported` = môi trường headless, không phải code). Browser test còn **bắt được 1 regression tự gây** (gỡ Firebase SDK làm vỡ 3 trang) → đã fix bằng guard `initializeFirestore`.

**✅ ĐÃ FIX (đã commit + push, FRONTEND đã live qua GH Pages):**

- **Tất cả 8 Top CRITICAL** (auth web2-users/SSE-monitor/kpi · `pool`→`client` purchase-refund · `stock:m.quantity`→`m.stock` · `fetchAggregate`→`fetchAggregateWeb2Only` · sinh mã atomic retry/advisory-lock 4 route · bỏ `KHO-<rnd>` · ví NCC — xem ghi chú).
- **Pattern lỗi lặp** #1-6: data-attr selector (3 trang) · transaction quanh tiền/kho (purchase-refund, web2-returns, fast-sale-orders, native-orders cancel, balance-history reassign) · FOR UPDATE check-then-update · Web2Optimistic cho handler còn thiếu · SSE debounce (reconcile, notifications) · web2-generic `web2Db||chatDb`.
- **Money atomicity**: web2-returns cộng ví VÀO transaction · balance-history reassign 1 transaction · payment-signals `_appendHistory` + approve idempotency FOR UPDATE.
- **Realtime live-chat**: adaptive poll (5s khi có bài live / 30s idle) + pagination flag + passive listener.
- **Auth**: middleware `render.com/middleware/web2-auth.js` gate mutation (KHÔNG gate login/me/view → không lockout) + rate-limit login + password min 8 + WEB2_PAGES +7 trang.

**⏳ CẦN DEPLOY RENDER để có hiệu lực**: mọi fix BACKEND (route `render.com/`) đã commit nhưng chỉ chạy thật sau khi deploy Render (`POST /services/srv-d4e5pd3gk3sc73bgv600/deploys`). Frontend (GH Pages) đã live. ⚠ Auth enforcement: admin phải đăng nhập hệ thống web2-users (token `web2_auth`) — verify trước khi deploy auth lên prod để tránh khoá nhầm.

**🔲 CHƯA fix (ưu tiên thấp / cần thêm context)**: supplier-wallet/supplier-debt Firestore client-write (cần chuyển server route — đợt sau) · so-order Firestore 1-doc last-write-wins (architectural) · native-orders frontend merge/split thiếu `x-web2-token` (chỉ cần khi backend native-orders gate auth — hiện chưa gate) · 1 số LOW/NGHI VẤN trong mục 3.

---

> **⚠ RULE BẢO TRÌ (BẮT BUỘC):** Khi code/sửa phần QUAN TRỌNG của Web 2.0 (route mới, đổi luồng data, fix bug trong danh sách này, thêm trang menu) → **PHẢI cập nhật 2 nơi**: file này (`docs/web2/WEB2-PAGES-ANALYSIS.md`) **và** trang sống [`web2/overview/index.html`](../../web2/overview/index.html). Fix xong 1 bug → đổi trạng thái dòng tương ứng thành ✅ kèm commit sha.

---

## 1. Tổng quan kết quả

| Mức độ            | Số lượng (xấp xỉ) | Ý nghĩa                                                                  |
| ----------------- | ----------------- | ------------------------------------------------------------------------ |
| 🔴 CRITICAL       | 8                 | Crash production / mất tiền / lỗ hổng bảo mật / hỏng chức năng hoàn toàn |
| 🟠 HIGH           | ~25               | Sai data, race mất dữ liệu, vi phạm quy ước nặng                         |
| 🟡 MEDIUM         | ~35               | Sai sót có điều kiện, UX/perf, inconsistency                             |
| ⚪ LOW / NGHI VẤN | ~25               | Style, dead code, cần verify thêm                                        |

### 🔥 Top việc cần fix ngay (xếp theo độ nguy hiểm)

| #   | Bug                                                                                                                                                                                                                                    | File:Line                                                                                         | Severity      | Trạng thái |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| 1   | **`web2-users.js` KHÔNG có auth middleware trên BẤT KỲ endpoint nào** — anonymous tạo được admin, reset mật khẩu, leo thang quyền (`POST /`, `DELETE /:id`, `PUT /:id/permissions`, `POST /:id/password`). Login cũng không rate-limit | `render.com/routes/web2-users.js`                                                                 | 🔴 SECURITY   | ⬜         |
| 2   | SSE monitor endpoints `/stats` `/log` `/test` không auth — `POST /test` cho phép inject event tới MỌI client; gate admin của trang monitor chỉ check localStorage (bypass 1 dòng console)                                              | `render.com/routes/realtime-sse-web2.js` + `web2/admin-sse-monitor/js/monitor.js:15`              | 🔴 SECURITY   | ⬜         |
| 3   | `/cancel-approve` gọi `saveRefundData(pool, …)` nhưng biến `pool` **không tồn tại trong scope** (chỉ có `recordsPool`) → ReferenceError SAU khi đã hoàn kho → record kẹt `approved + stock_deducted=true`                              | `render.com/routes/purchase-refund.js:261`                                                        | 🔴 CRASH      | ⬜         |
| 4   | `confirm-purchase-partial` trả `stock: m.quantity` — `mapRow()` không có field `quantity` → response luôn `stock: undefined` cho so-order                                                                                              | `render.com/routes/web2-products.js:1330`                                                         | 🔴            | ⬜         |
| 5   | Nút Export CSV trang Ví KH gọi `fetchAggregate()` — hàm **không tồn tại** (chỉ có `fetchAggregateWeb2Only`) → ReferenceError, export hỏng hoàn toàn                                                                                    | `web2/customer-wallet/js/web2-customer-wallet-app.js:~1102`                                       | 🔴            | ⬜         |
| 6   | Sinh mã đơn/PBH không atomic: `nextDailyCode()` (native-orders) + `nextNumber()` (fast-sale-orders, delivery-invoices) + `_genCode` (web2-returns) đều SELECT MAX/COUNT rồi +1 → burst tạo trùng mã → UNIQUE violation 500             | `native-orders.js:~521`, `fast-sale-orders.js:456`, `delivery-invoices.js:124`, `web2-returns.js` | 🔴 RACE       | ⬜         |
| 7   | Server còn fallback sinh mã rác `KHO-<rnd>-<ts>` trong `upsert-pending` — vi phạm quy ước `Web2ProductCode.suggest()`                                                                                                                  | `render.com/routes/web2-products.js:1112`                                                         | 🔴 RULE       | ⬜         |
| 8   | Ví NCC: 2 tab cùng ghi Firestore `web2_supplier_wallet/main` → `set({merge:true})` không merge nested array `transactions` → **mất giao dịch** (lost update)                                                                           | `web2/supplier-wallet/js/supplier-wallet-storage.js:228`                                          | 🔴 RACE/MONEY | ⬜         |

---

## 2. Pattern lỗi LẶP LẠI toàn hệ thống (sửa 1 lần áp dụng nhiều nơi)

1. **Data-attribute mismatch phá rollback optimistic** — render row dùng `data-number` nhưng selector tìm `data-pbh-number` / `data-rf-number` / `data-dlv-number` → `Web2Optimistic` rollback không tìm thấy row, UI kẹt trạng thái sai khi server lỗi. Dính 3 trang: `pbh-app.js:295`, `rf-app.js:156`, `dlv-app.js:149`.
2. **Sinh số phiếu bằng SELECT MAX/COUNT + 1** (không sequence/advisory lock) — 4 route (xem Top #6). Fix chung: Postgres sequence hoặc retry-on-unique-violation.
3. **Thiếu transaction quanh mutation nhiều bước** — `upsert-pending`, `deductStock`+`saveRefundData` (purchase-refund), trừ stock sau INSERT PBH (`from-native-order`), cộng ví SAU COMMIT (`web2-returns:683`), reassign 3 bước (`web2-balance-history.js:349`), cancel→refund ví (native-orders). Crash giữa chừng = lệch kho/tiền.
4. **Thiếu `SELECT … FOR UPDATE` ở check-then-update** — `_changeState` (refunds, delivery-invoices), approve (web2-returns, purchase-refund), `applyWalletToUnpaidPbhs` (fast-sale-orders:60), `_appendHistory` JSONB (web2-payment-signals:45 — concurrent mất history entry).
5. **Mutation handler chưa qua `Web2Optimistic.run`** — `saveModal` (products, variants), so-order toàn bộ, live-chat inline edits, livestream-poller toggle, users (3/4 modal), pancake-settings (3/4), printer-settings, users-permissions, ck-dashboard `bindIntents`.
6. **SSE client thiếu debounce 500-600ms** — reconcile (0ms), notifications (0ms), purchase-refund (400ms). Burst event → N request đồng thời, response race.
7. **Ghi Firestore trực tiếp từ client cho money ops** — supplier-wallet/supplier-debt (`recordPayment`, `confirmPay` sync fire-and-forget, không server validation, không SSE notify) — vi phạm rule money ops phải await + nên đi qua server.
8. **2 luồng song song không đồng nhất cùng 1 nghiệp vụ** — (a) Trả hàng KH: `refunds.js` (không hoàn kho, không cộng ví) vs `web2-returns.js` (đầy đủ) — PBH page đang gọi nhầm `refunds`; (b) Trả hàng NCC: supplier-wallet `adjustStock` trực tiếp vs purchase-refund approve → dùng cả 2 đường cho cùng SP = trừ kho đôi.
9. **Load Firebase Firestore SDK thừa (~200KB/trang)** — delivery-zone, printer-settings, services-dashboard chỉ cần auth nhưng load cả firestore-compat.

---

## 3. Chi tiết theo nhóm trang

### 3.1 Bán Hàng (5 trang)

**`web2/fastsaleorder-invoice/` — Bán hàng (PBH)** · BE `fast-sale-orders.js` (2197 dòng) · bảng `fast_sale_orders` (web2Db ✓) · SSE `web2:fast-sale-orders` ✓
| Bug | File:Line | Sev |
|---|---|---|
| `_findPbhRow` selector `data-pbh-number` không tồn tại → rollback hỏng | `pbh-app.js:295` | 🟠 |
| `applyWalletToUnpaidPbhs` không FOR UPDATE → 2 deposit SePay gần nhau double-apply | `fast-sale-orders.js:60-137` | 🟠 |
| Merge sinh số bằng COUNT → race UNIQUE | `fast-sale-orders.js:874` | 🟡 |
| Trừ stock NGOÀI transaction INSERT PBH (`from-native-order`) | `fast-sale-orders.js:~1240` | 🟡 |
| `createRefund` gọi `/api/refunds/from-pbh` (flow cũ, không hoàn kho/ví) thay vì web2-returns | `pbh-app.js:529` | 🟡 |

**`web2/reconcile/` — Đối soát đóng gói** · BE `reconcile.js` · `fast_sale_orders` + `pbh_fulfillment_logs` ✓ · scan có FOR UPDATE ✓
| Bug | File:Line | Sev |
|---|---|---|
| SSE callback KHÔNG debounce → burst scan = N+1 loadList + N GET race | `reconcile-app.js:889-908` | 🟡 |
| `return-failed`: UPDATE state + restock không atomic | `reconcile.js` | 🟡 |
| `reset-pick` thiếu FOR UPDATE (idempotent nên vô hại) | `reconcile.js:590` | ⚪ |

**`web2/fastsaleorder-refund/` — Trả hàng** · BE `refunds.js` · bảng `refunds` (web2Db ✓)
| Bug | File:Line | Sev |
|---|---|---|
| `changeState` selector `data-rf-number` sai → rollback hỏng | `rf-app.js:156` | 🟠 |
| `_changeState` không state-machine guard + không FOR UPDATE → backward transition, double-approve | `refunds.js` | 🟡 |
| Không hoàn kho khi approve/complete (chỉ web2-returns có) → lệch tồn | `refunds.js` | 🟡 |
| SSE pub qua `req.app.locals` trực tiếp, không `initializeNotifiers` (hoạt động nhưng lệch pattern) | `refunds.js` | ⚪ |

**`web2/returns/` — Thu về** · BE `web2-returns.js` · `web2_returns` + ví KH (web2Db ✓) · SSE ✓ cross-pub `web2:products`, `web2:wallet:<phone>` ✓
| Bug | File:Line | Sev |
|---|---|---|
| Cộng ví KH **SAU COMMIT** (ngoài transaction) — crash → phiếu có + stock cộng nhưng ví KHÔNG nhận tiền, không retry | `web2-returns.js:683-708` | 🟠 MONEY |
| `approve` không FOR UPDATE → 2 admin double-approve = stock cộng 2 lần | `web2-returns.js` | 🟡 |
| `_genCode` LIKE+MAX race | `web2-returns.js` | 🟡 |
| SUM `wallet_deducted` không filter `state <> 'cancel'` → hoàn ví dư | `web2-returns.js:260-278` | 🟡 |

**`web2/fastsaleorder-delivery/` — Phiếu giao hàng** · BE `delivery-invoices.js` · `delivery_invoices` (web2Db ✓)
| Bug | File:Line | Sev |
|---|---|---|
| `changeState` selector `data-dlv-number` sai → rollback hỏng | `dlv-app.js:149` | 🟠 |
| `_changeState` không state machine + không FOR UPDATE | `delivery-invoices.js:319` | 🟡 |
| `nextNumber` LIKE+MAX race | `delivery-invoices.js:124` | 🟡 |
| `o.fso.number` null → in "PBH: null" | `dlv-app.js:137` | 🟡 |

### 3.2 Sale Online (3 trang)

**`native-orders/` — Đơn Web** · BE `native-orders.js` · `native_orders`, `web2_order_customers` (web2Db ✓) · SSE `web2:native-orders` ✓ (+ WS legacy song song)
| Bug | File:Line | Sev |
|---|---|---|
| `nextDailyCode()` SELECT MAX không atomic → trùng mã đơn khi burst (poller + manual) | `native-orders.js:~521` | 🔴 RACE |
| `bulkMergeOrders` + `splitOrder` + `bulkCreatePbhShop` raw fetch **thiếu header `x-web2-token`** | `native-orders-app.js` | 🟠 |
| Cột `fb_page_name` được UPDATE nhưng không có trong `ensureTables` migrations (schema drift — NGHI VẤN) | `native-orders.js` /from-comment | 🟠 |
| `campaign_stt` = MAX+1 không lock → STT trùng trong campaign | `native-orders.js:~851` | 🟠 |
| Wallet lookup `WHERE phone = ANY($1)` không normalize SĐT (84xxx vs 0xxx) → pill "Chưa nhận CK" sai | `native-orders.js:~1532` | 🟡 |
| WS + SSE cùng reload (2 cơ chế realtime song song) → request thừa | `native-orders-app.js` | 🟡 |
| Cancel → hoàn ví không cùng transaction | `native-orders.js` /:code/cancel | 🟡 |
| `from-comment` bỏ idempotency khi thiếu `fbCommentId` → đơn trùng | `native-orders.js:~657` | 🟡 |
| `bulkCreatePbh` không double-submit guard | `native-orders-app.js:~3735` | 🟡 |

**`so-order/` — Sổ Order (xuất hiện 2 mục menu)** · Local-first: IDB + Firestore `web2_so_order/main` · gọi API web2-products
| Bug | File:Line | Sev |
|---|---|---|
| Firestore lưu TOÀN BỘ state trong 1 doc `main`, `tabs[]` là array → merge không deep-merge → **last-write-wins, 2 máy cùng sửa mất data** | `so-order-storage.js` | 🟠 RACE |
| 2 tab cùng `upsert-pending` → cả 2 đọc pending=0, cả 2 SET 0+3 → undercount | `web2-products.js:1085` | 🟠 RACE |
| Conflict detection `pullOnce()` dựa `_pushTimer` — push in-flight nhưng timer cleared → remote đè local | `so-order-storage.js` | 🟡 |
| Không dùng `Web2Optimistic.run` (đã load helper); không subscribe SSE `web2:products` | `so-order-app.js` | 🟡 |
| Double-receive: server an toàn (FOR UPDATE) nhưng client hiện "Đã nhận 0" không giải thích | client UX | 🟡 |
| `soOrder_v1` localStorage không clear sau IDB migration → stale fallback | `so-order-storage.js` | 🟡 |

**`live-chat/` — Live Chat** · BE `web2-live-comments.js` + poller `web2-livestream-poller.js` · `web2_live_comments` (web2Db ✓) · SSE `web2:live-comments` ✓

> **🆕 2026-06-11 — TÁCH KIẾN TRÚC live-chat (2 trang):** `index.html` = cột comment Live FULL + panel Kho SP 320px (drag SP → comment tạo đơn) + capture iframe/Force extract; mỗi comment có nút 💬 mở **modal hội thoại full chức năng** (`live-chat-modal.js`: Web2ChatPanel + adapter PancakeChatWindow — như native-orders). `chat.html` (MỚI) = trang chat Pancake full stack riêng (sidebar "Chat Pancake"). **Capture leader lock 1 MÁY duy nhất**: web2-generic `/api/web2/capture-lock` TTL 90s + heartbeat 30s + SSE `web2:capture-lock` (máy bị cướp tự dừng) — chống nhiều máy POST frame đè nhau.
> **🆕 2026-06-11 — Mobile/tablet read-mode (`html.lc-mobile`):** detect UA trong `<head>` → mobile/tablet chỉ hiện cột comment Live full màn hình (ẩn Kho SP + sidebar + topbar phải); input 16px chống iOS zoom, touch target ≥38px; skip auto-snap iframe/ext-prompt trên mobile (mobile KHÔNG capture — PC lo).
> **✅ FIX 2026-06-11:** tin nhắn inbox bên cột Pancake làm cột Live full re-render trắng ("Đang tải comment…") — bỏ subscribe `web2:messages` reload cột Live trong `live-init.js`; SSE `web2:live-comments` reload chuyển **silent** (giữ list hiển thị, không showLoading, không churn SSE, diff render patch tại chỗ).

> **📢 YÊU CẦU USER (2026-06-10): xem comment livestream PHẢI realtime trực tiếp.** Hiện trạng: hop server→browser đã realtime (SSE `web2:live-comments`), nhưng hop upstream Pancake→Render chỉ POLL (server 30s / client 4s) vì không có FB EAA token. Lộ trình đạt realtime thật (ưu tiên trên xuống):
>
> 1. **Quick win — adaptive poll:** poller giảm interval xuống 3-5s khi có bài "ĐANG live" (giữ 30-60s khi không live). Gần realtime, không cần hạ tầng mới.
> 2. **Realtime thật — tap websocket Pusher của Pancake:** Render giữ 1 kết nối websocket tới kênh realtime Pancake (pancake.vn dùng Pusher cho comment live) → nhận comment push → ghi DB + broadcast SSE ngay. Cần reverse-engineer channel/auth từ JWT account.
> 3. FB Webhook chính chủ: cần FB App + EAA token (Pancake không cấp) — dài hạn, khó.
>    | Bug | File:Line | Sev |
>    |---|---|---|
>    | SSE reload `loadComments()` KHÔNG giữ filter campaign hiện tại → list nhảy về toàn bộ | `live-comment-list.js` | 🟠 RACE |
>    | Scroll listener thiếu `{passive:true}` (vi phạm MODAL-ANTI-LAG) | `live-comment-list.js:270` | 🟠 |
>    | `selectInlineStatus`/`saveInlinePhone`/`saveInlineAddress` không Web2Optimistic | `live-comment-list.js:1029` | 🟠 |
>    | `showPancakeCustomerInfo` lookup `/api/v2/customers` (Web 1.0) trước, KHÔNG query kho `web2_customers` trước — vi phạm rule lookup | `live-comment-list.js` | 🟡 |
>    | Poller: `cv.length < 20` page-size heuristic fragile; `MAX_COMMENT_PAGES=12` (~240 comment) có thể bỏ sót live dài | `web2-livestream-poller.js:~180` | 🟡 NGHI VẤN |
>    | Multi-post: N interval × 5 page = N×5 request đồng thời không semaphore | `live-source.js` | 🟡 |
>    | `_viewCampaign` load 5000 rows không paginate | `live-campaign-manager.js` | 🟡 |
>    | Kho enricher `attempted` Set không clear khi đổi campaign → data cũ | `live-kho-enricher.js` | 🟡 |

### 3.3 Mua hàng (3 trang)

**`web2/purchase-refund/` — Trả hàng NCC** · BE `purchase-refund.js` + `web2-generic.js` · `web2_records` + `web2_products` (web2Db ✓) · SSE `web2:purchase-refund` ✓
| Bug | File:Line | Sev |
|---|---|---|
| **`pool` undefined trong `/cancel-approve`** → crash sau restock (xem Top #3) | `purchase-refund.js:261` | 🔴 |
| `deductStock` + `saveRefundData` không cùng transaction → crash giữa chừng = trừ kho nhưng `stock_deducted=false` → approve lại trừ tiếp (root cause vụ stock 10→−2; commit b805f263d chỉ fix NOW()/BIGINT) | `purchase-refund.js:201-218` | 🟠 |
| Double-approve: idempotent check optimistic, không FOR UPDATE → CF Worker retry trừ kho đôi | `purchase-refund.js` | 🟠 |
| Quick refund 3 step (create→approve→ví) không rollback nếu step 2 fail → phiếu draft mồ côi | `purchase-refund-app.js:1169` | 🟡 |
| Picker lần 2 không cộng dồn totalQty/totalAmount (chỉ fill khi trống) | `purchase-refund-app.js:847` | 🟡 |
| Ghi ví NCC fire-and-forget (`SW.Sync.push().catch(console.warn)`) | `purchase-refund-app.js:1251` | 🟡 |

**`web2/supplier-debt/` — Công nợ NCC** · Thuần client: đọc 3 Firestore collection, KHÔNG có server route
| Bug | File:Line | Sev |
|---|---|---|
| `recordPayment` ghi thẳng Firestore từ client — không server validation, không SSE notify, tab khác stale | `supplier-debt-app.js:235-291` | 🟠 |
| 2 user ghi thanh toán cùng NCC → get→mutate→set lost update | same | 🟠 RACE |
| Dedup window 3s dùng `ts` (ngày thanh toán) fallback → bypass khi chọn ngày quá khứ | `supplier-debt-app.js:258` | 🟡 |
| `saveSupplierNote` tạo duplicate entry `code=''` cho NCC legacy | `supplier-debt-app.js:183` | 🟡 |

**`web2/supplier-wallet/` — Ví NCC** · Local-first Firestore `web2_supplier_wallet/main` + `/api/wallet-deposits/load`
| Bug | File:Line | Sev |
|---|---|---|
| **2 tab cùng ghi ví → mất transaction** (xem Top #8) | `supplier-wallet-storage.js:228` | 🔴 RACE/MONEY |
| `confirmPay` là hàm sync, fire-and-forget Firestore — **vi phạm rule money ops phải await + loading** | `supplier-wallet-app.js:426` | 🟠 |
| 2 đường trả hàng song song (adjustStock trực tiếp vs purchase-refund approve) → trừ kho đôi nếu dùng cả 2 | `supplier-wallet-app.js:341` | 🟠 |
| `confirmReturn` match SP bằng TÊN exact (không mã) → trừ nhầm SP trùng tên | `supplier-wallet-app.js:347` | 🟠 |
| SePay match NCC bằng substring tên → false positive cộng ví sai NCC | `supplier-wallet-storage.js:280` | 🟡 |
| `cleanupOldTransactions` xóa lịch sử >30 ngày → mất audit trail đối chiếu | `supplier-wallet-storage.js:113` | 🟡 |

### 3.4 Tài chính + Khách hàng (3 trang)

**`web2/balance-history/` — SePay** · BE `v2/web2-balance-history.js` · `web2_balance_history`, `web2_sepay_transactions` (web2Db ✓) · SSE `web2:balance-history`, `web2:wallet:<phone>` ✓
| Bug | File:Line | Sev |
|---|---|---|
| Reassign 3 bước (withdraw cũ → deposit mới → UPDATE) KHÔNG trong 1 transaction — rollback fail = mất tiền | `web2-balance-history.js:349-535` | 🟠 MONEY |
| Manual deposit `sepay_id = -floor(Date.now()/1000)` — 2 request cùng giây → ON CONFLICT nuốt GD thứ 2 im lặng | `web2-balance-history.js:~756` | 🟡 |
| Double-link concurrent: ví được unique index bảo vệ ✓, chỉ history ghi 2 lần | route | ⚪ |
| `performedBy` fallback `'admin'` → audit trail sai | client | ⚪ |

**`web2/customers/` — Kho KH** · BE `v2/web2-customers.js` · `web2_customers` (web2Db ✓) · SSE `web2:customers` ✓ · route order đúng ✓
| Bug | File:Line | Sev |
|---|---|---|
| `_harvestOneComment`: `ON CONFLICT DO NOTHING` KHÔNG có target — nếu `fb_id` không có unique index → duplicate KH khi harvest concurrent | `web2-customers.js:~1012` | 🟠 |
| Phone từ Pancake comment lưu as-is (84xxx) không normalize → lookup `0xxx` miss | lookup-deep | 🟡 |
| `/search` không paginate với 63K KH | route | 🟡 |
| Pseudo-phone `fb_<id>` không merge khi KH có SĐT thật → 1 KH 2 row (NGHI VẤN) | `native-orders.js` upsert | 🟡 |

**`web2/customer-wallet/` — Ví KH** · BE `v2/web2-customer-wallet.js` + `v2/web2-wallets.js` · `web2_customer_wallets` (web2Db ✓) · core deposit/withdraw **ĐÚNG** (FOR UPDATE + unique idempotency) ✓ · regression `performed_by` đã fix ✓
| Bug | File:Line | Sev |
|---|---|---|
| **Export CSV gọi `fetchAggregate()` không tồn tại** (xem Top #5) | `web2-customer-wallet-app.js:~1102` | 🔴 |
| `SHOP_BANK` (số TK + tên chủ TK) hardcode trong source | `web2-customer-wallet.js:26-31` | 🟠 SECURITY |
| TPOS OData vẫn là PRIMARY source list KH — trái policy "đã gỡ TPOS" (NGHI VẤN: exception cố ý?) | `web2-customer-wallet-app.js` | 🟡 |
| `openDetail` chỉ lookup phone chính, bỏ sót đơn của `alt_phones` | client | ⚪ |

### 3.5 Sản phẩm (3 trang)

**`web2/products/`** · BE `web2-products.js` · `web2_products` + `web2_product_history` (web2Db ✓) · SSE `web2:products` ✓ cache IDB SWR ✓
| Bug | File:Line | Sev |
|---|---|---|
| Server fallback `KHO-<rnd>` (xem Top #7) | `web2-products.js:1112` | 🔴 RULE |
| `stock: m.quantity` → undefined (xem Top #4) | `web2-products.js:1330` | 🔴 |
| `upsert-pending` không transaction → lost update 2 tab | `web2-products.js:1085` | 🟠 RACE |
| `suggestProductCode` chỉ check trùng trong trang hiện tại (50 SP) thay vì cache full 20K | `web2-products-app.js:661` | 🟡 |
| `saveModal` không Web2Optimistic (toggle đã đúng) | `web2-products-app.js:~890` | 🟡 |
| `pgString()` inline escape thay vì parameterized | `web2-products.js:715,765` | 🟡 |

**`web2/variants/`** · BE `web2-variants.js` (web2Db ✓, SSE ✓): `saveModal` thiếu Web2Optimistic (🟡); cache `findByValueExact` trả cả variant inactive (🟡); double render sau update (⚪); không IDB persistence (⚪).

**`web2/product-category/`** · qua `web2-generic.js`: **`web2-generic.js` dùng `web2Db` TRẦN không fallback `|| chatDb` ở 9 chỗ** → cold-start window crash cho **87 trang generic** (🟠, `web2-generic.js:149,169,221,…`); `GET /list` không default limit cap (⚪).

### 3.6 Tính năng mới (10 trang)

**`web2/dashboard/` — Dashboard KPI** · BE `v2/dashboard-kpi.js` (web2Db ✓): server cache 30s không invalidate khi SSE → reload nhận data cũ, mất realtime feeling (🟡); `CURRENT_DATE` UTC lệch 7h đầu ngày VN (⚪); `initializeNotifiers` wired nhưng dead (⚪).

**`web2/kpi/` — KPI Nhân viên** · BE `v2/kpi.js` (web2Db ✓):
| Bug | File:Line | Sev |
|---|---|---|
| `PUT /employee-ranges/:name` KHÔNG auth — ai cũng đổi được phân công KPI | `kpi.js:576` + `kpi-assignments.js:334` | 🟠 SECURITY |
| `/kpi` (tính từ native_orders) vs `/forecast`+`/actual` (ledger) = 2 nguồn lệch nhau; UI dùng `/kpi`, 2 API kia dead | `kpi.js:762` | 🟠 |
| `_idempotencyKey` không gồm `qty_delta` → confirm lần 2 với qty khác bị drop im lặng | `kpi.js:135-152` | 🟡 RACE |
| `_scopeCache` Map không LRU → memory leak dần; không sync multi-instance | `kpi.js:290` | ⚪ |

**`web2/notifications/`** · BE `v2/notifications.js` (web2Db ✓, SSE pub ✓): comment scan liệt kê 5 nguồn nhưng item 2 (PBH cancel) + 3 (ví âm) KHÔNG implement, item 5 đổi logic (🟠 doc-drift); `_insertDedupe` SELECT→INSERT không ON CONFLICT → 2 user scan cùng lúc = noti trùng (🟡 RACE); SSE client KHÔNG debounce (🟡); không có cron auto-scan — noti chỉ sinh khi user bấm nút (⚪); scan N×2 query sequential (🟡).

**`web2/audit-log/`** · BE `v2/audit-log.js` (web2Db ✓, read-only): `/list` không trả `total` (🟡); 4 lần `_tableExists` serial mỗi request ~40ms (🟡); `web2_wallet_adjustments` + `fast_sale_order_history` có thể thiếu trên web2Db → silently vắng khỏi audit (⚪ NGHI VẤN); không SSE (⚪).

**`web2/ck-dashboard/` — Đối soát CK** · BE `web2-payment-signals.js` + `web2-customer-intents.js` (web2Db ✓, SSE ✓):
| Bug | File:Line | Sev |
|---|---|---|
| `_appendHistory` JSONB read-modify-write KHÔNG lock → 2 user thao tác cùng signal = mất history entry | `web2-payment-signals.js:45-58` | 🟠 RACE |
| `/approve` (money op) không idempotency nonce → double-submit ghi 2 history (ví được bảo vệ bởi `alreadyProcessed`) | `web2-payment-signals.js:332` | 🟠 |
| `confirm`+`approve` concurrent không guard `status='pending'` → last-write-wins mất `matchedTxId` | route | 🟡 |
| `bindIntents` không Web2Optimistic, không check `r.ok` | `ck-dashboard-app.js:162` | 🟠 |
| `loadCol` catch silent — lỗi API không hiện gì | `ck-dashboard-app.js:127` | 🟡 |
| Stats đếm items đã tải (PAGE=10) thay vì tổng thực | `ck-dashboard-app.js:185` | ⚪ |

**`web2/photo-studio/`** (client-only): MediaPipe CDN không SRI (🟡); withoutbg API key plaintext localStorage (⚪); SW cache WASM version cũ (⚪).

**`web2/users-permissions/`**: server không auth (xem Top #1) (🔴); `PAGE_GROUPS` hardcode client drift với server `WEB2_PAGES` (🟠); PUT không Web2Optimistic + double-submit (🟠); không subscribe SSE `web2:users` (🟡).

**`web2/admin-sse-monitor/`**: xem Top #2 (🔴); poll stats 2s không pause khi tab hidden (⚪).

**`web2/services-dashboard/`** · BE `services-overview.js` (cả 2 pool — cố ý ✓): Firebase SDK thừa ~300KB (🟡); không auto-refresh (⚪).

### 3.7 Báo cáo (2 trang)

**`web2/report-revenue/`** · BE `pbh-reports.js` (web2Db ✓): dùng `PbhRealtime.subscribe` topic `pbh:created` — KHÔNG phải chuẩn `Web2SSE` topic `web2:fast-sale-orders` → cần verify bridge map topic, nếu không UI không bao giờ auto-update (🟠); innerHTML với data server không escape (🟡 XSS); filter đổi nhanh không AbortController → response cũ đè mới (🟡); CSS import từ `native-orders/css/` thay vì shared (⚪).

**`web2/report-delivery/`** · BE `pbh-reports.js` `/delivery` (web2Db ✓): không validate from≤to (⚪); không realtime/refresh button (⚪).

### 3.8 Cấu hình (5 trang)

**`web2/livestream-poller/`**: dùng `alert()` thay notificationManager (🟠); toggle/delete không Web2Optimistic (🟠); poll stat `setInterval 15s` thay vì SSE đã có (⚪); poller server `_cycle` có `_running` guard ✓.

**`web2/users/`** · BE `web2-users.js` (web2Db ✓, SSE `web2:users` ✓): **không auth toàn route** (xem Top #1) (🔴); `api()` thiếu `credentials:'include'` (🟠); 3/4 modal save không Web2Optimistic (🟠); password min 6 ký tự (🟠); login không rate-limit (🟡); `WEB2_PAGES` registry **thiếu 7 trang** (photo-studio, admin-sse-monitor, services-dashboard, report-revenue, report-delivery, delivery-zone, printer-settings) → các trang này không phân quyền được (🟡); log password admin mặc định ra console (⚪).

**`web2/pancake-settings/`** · BE `web2-pancake-accounts.js` (web2Db ✓): `renewAccount`/`addAccount`/`credsSave` không Web2Optimistic (🟡); race `_refreshStatus` chưa load mà bấm Gia hạn → redirect sai modal (🟡); JWT localStorage là design intent (⚪).

**`web2/delivery-zone/`** · qua web2-generic + page-builder (✓ pattern tốt nhất nhóm): Firebase SDK thừa (🟡); field `code` sửa được sau khi tạo → đơn cũ mất reference (🟡).

**`web2/printer-settings/`**: config thuần localStorage KHÔNG sync giữa máy (🟠); upsert/remove không Web2Optimistic (🟠); Bridge URL hardcode `127.0.0.1:17777` (🟡); BAT fetch path cần verify tồn tại (🟡); Firebase SDK thừa (🟡).

---

## 4. Ma trận tuân thủ quy ước (tóm tắt)

| Quy ước                                         | Đạt                   | Vi phạm chính                                                                                                                                                  |
| ----------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pool `web2Db \|\| chatDb`                       | Hầu hết route ✓       | `web2-generic.js` (web2Db trần, 87 trang)                                                                                                                      |
| SSE hub web2 + notify sau commit trước res.json | Hầu hết ✓             | refunds/delivery-invoices/balance-history dùng `app.locals` trực tiếp (chạy được, lệch pattern); dashboard-kpi cache không invalidate                          |
| Client SSE debounce 500-600ms                   | Đa số ✓               | reconcile (0), notifications (0), purchase-refund (400)                                                                                                        |
| UI-first `Web2Optimistic.run`                   | toggle/delete đa số ✓ | saveModal products/variants, so-order, live-chat inline, users, pancake-settings, printer-settings, users-permissions, livestream-poller, ck-dashboard intents |
| Money ops await + loading                       | Ví KH core ✓          | supplier-wallet `confirmPay` sync; purchase-refund ví fire-and-forget                                                                                          |
| Mã SP qua `Web2ProductCode.suggest()`           | client ✓              | server fallback `KHO-<rnd>`                                                                                                                                    |
| Auth server-side                                | —                     | **web2-users, kpi employee-ranges, SSE monitor: KHÔNG auth**                                                                                                   |
| Lookup KH kho trước Pancake sau                 | đa số ✓               | live-chat `showPancakeCustomerInfo`                                                                                                                            |

## 5. Lộ trình fix khuyến nghị

1. **Đợt 1 — an toàn & crash (1 buổi):** Top #1→#5 (auth web2-users + SSE monitor; `pool`→`recordsPool`; `m.quantity`→`m.stock`; `fetchAggregate`→`fetchAggregateWeb2Only`) + 3 selector `data-*` mismatch.
2. **Đợt 2 — tiền & kho atomic:** transaction cho purchase-refund approve/cancel-approve, web2-returns ví trong tx, reassign balance-history trong tx, FOR UPDATE cho các `_changeState`/approve, `applyWalletToUnpaidPbhs`.
3. **Đợt 3 — race sinh mã:** Postgres sequence cho 4 chỗ sinh số phiếu/đơn.
4. **Đợt 4 — ví NCC kiến trúc:** chuyển recordPayment/confirmPay qua server route + SSE; thống nhất 1 đường trả hàng NCC; Firestore → transaction hoặc per-supplier doc.
5. **Đợt 5 — quy ước UI:** Web2Optimistic cho các handler còn thiếu, debounce SSE, bỏ Firebase SDK thừa, WEB2_PAGES bổ sung 7 trang.

---

_Sinh bởi audit 9-agent ngày 2026-06-10. Cập nhật trạng thái từng dòng khi fix (⬜ → ✅ + sha)._
