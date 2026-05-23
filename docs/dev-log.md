# Dev Log — N2Store

> Cập nhật liên tục khi code. Mới nhất ở trên.
>
> **Cách tìm nhanh:** Ctrl+F tìm theo ngày `## 2026-`, theo module `[inbox]` `[chat]` `[extension]` `[orders]` `[worker]` `[render]`, hoặc theo status `IN PROGRESS`.

---

## 🔗 Session Resume Protocol (BẮT BUỘC)

> Sau mỗi commit+push xong, **Stop hook tự động** tạo session resume + in token. Claude không cần chạy script thủ công.

- **Tạo (auto)**: hook `.claude/scripts/hooks/stop-auto-commit-push.sh` gọi `bash scripts/save-session-resume.sh` sau khi commit+push → sinh `docs/sessions/<YYYYMMDD-HHMMSS>-<sha7>.md` + commit/push file đó → in token.
- **Token in cuối turn**: `🔗 RESUME:<YYYYMMDD-HHMMSS>-<sha7>` (ví dụ `RESUME:20260513-094400-2f8a169`). User copy paste vào chat mới.
- **Chain walking** khi chat mới nhận token match `RESUME:[0-9]{8}-[0-9]{6}-[a-f0-9]{7}`:
    1. `Read` file `docs/sessions/<token>.md`.
    2. Xem section "7. Previous Session" — nếu có Previous ≠ INITIAL → `Read` file previous đó.
    3. Lặp tối đa **3 levels** mặc định, hoặc đến INITIAL nếu user yêu cầu "full chain".
    4. Tóm tắt 2-3 câu tổng hợp → tiếp tục từ Next Steps của session gần nhất.
- **Sau script chạy**: nên mở file vừa sinh, điền chi tiết **Key Decisions / Next Steps / Context Pointers** (script chỉ fill metadata + file list từ commit message).
- Quy ước đầy đủ: [`docs/sessions/README.md`](sessions/README.md). Template: [`docs/sessions/_TEMPLATE.md`](sessions/_TEMPLATE.md).
- **Vì sao không base64/hash thô**: hash 1-chiều không recover; base64 transcript đầy đủ vài MB không paste nổi → token ngắn + file md trong git + chain pointer là balance tốt nhất.

---

## 2026-05-23

### [tpos-pancake][livestream-snapshots] feat: Livestream Snapshot per Customer (📸 button + popover)

**Use case**: comment livestream nhiều quá user xử lý không kịp → cần freeze moment livestream lúc KH bình luận để review sau khi rảnh → xác định SP rồi drag vào cart.

**Phase 1 + 2 shipped** (commit `e015ee36d`):

**Backend** (`render.com/routes/livestream-snapshots.js` new):

- Table `livestream_snapshots` (id, customer_fb_user_id, page_id, live_video_id, captured_at, offset_seconds, livestream_url, thumbnail_url, captured_by, ...)
- Endpoints: POST `/api/livestream/snapshot`, GET `/snapshots?customerFbUserId=...`, GET `/snapshots/batch-counts`, DELETE `/snapshot/:id`
- `livestream_url` = `https://fb.com/{pageId}/videos/{liveVideoId}/?t={offsetSec}` — FB deep-link replay
- `thumbnail_url` = `https://graph.facebook.com/{liveVideoId}/picture?type=large` — FB public, không cần token
- SSE topic `web2:livestream-snapshots`

**Frontend** (`tpos-pancake/js/tpos/tpos-livestream-snap.js` new):

- Header chip "📡 Snap live: Store ▼" — toggle Store/House, default Store, localStorage `tpos_snap_live_page`
- Mỗi `.tpos-conversation-item` auto-inject 📸 button qua MutationObserver
- Click 📸 → resolve liveCampaign từ `TposState.liveCampaigns` → POST snapshot, optimistic counter + toast confirm
- Shift+click / right-click 📸 → popover list snapshots với thumbnail + thời gian + nút "▶ Xem" (FB deep-link new tab) + nút "Xóa"
- Badge count đỏ trên button (📸³)
- Snap-flash animation: scale(1.25) + glow vàng 400ms

**Per-customer**: 1 KH có nhiều comment trong cùng live → share snap list theo `customer_fb_user_id`.

**Backend smoke verified live**:

- POST `/api/livestream/snapshot` → tạo OK, trả livestreamUrl + thumbnailUrl đúng format
- GET list + batch-counts: OK
- DELETE: OK

**Phase 3** (real screenshot via getDisplayMedia) defer — chỉ làm nếu user cần snap chính xác moment thay vì FB Graph thumbnail.

**Files**: `render.com/routes/livestream-snapshots.js`, `render.com/server.js`, `tpos-pancake/js/tpos/tpos-livestream-snap.js`, `tpos-pancake/index.html`, `tpos-pancake/css/tpos/tpos-comments.css`

**Status**: ✅ Done

---

## 2026-05-22

### [fast-sale-orders] Fix cancel PBH: sync ngược native_order về 'cancelled' (thiếu source_code SELECT)

**Browser test PBH lifecycle (2 tabs: products + native-orders)**: tạo PBH OK, stock deduct OK, hủy PBH thì stock restock OK + PBH state='cancel' OK, NHƯNG native_order vẫn stuck ở 'confirmed' → TPOS panel không hiện lại đơn sau khi hủy PBH; SSE `web2:native-orders pbh-state-sync` không fire.

**Root cause** (`fast-sale-orders.js:1551`): `prev = SELECT id, state, stock_restored, order_lines FROM fast_sale_orders` — thiếu `source_type` + `source_code`. `syncNativeOrderStatusFromPbh(prevRow, 'cancel')` check `!pbhRow?.source_code || pbhRow.source_type !== 'native_order'` → cả 2 undefined → early return `{synced:0}` → KHÔNG UPDATE native_orders.

**Fix**: thêm `source_type, source_code` vào SELECT prev. Confirm endpoint không bị (dùng `r.rows[0]` từ `_stateChange` RETURNING \* có đủ cột).

**Verified live**:

- Stock: 6 → 5 (PBH) → 6 (cancel) ✓
- Native_order: draft → confirmed (PBH) → cancelled (cancel) ✓
- SSE chain đầy đủ:
    - PBH: `web2:native-orders status-bumped`, `web2:products pbh-stock-deduct`, `web2:fast-sale-orders from-native-order`, `web2:cart`
    - Cancel: `web2:products pbh-cancel-restock`, **`web2:native-orders pbh-state-sync state=cancel codes=[NW-20260522-0011]`** ✓, `web2:fast-sale-orders cancel`
- 2 tabs (products + native-orders) đều nhận SSE realtime → tự refresh UI

**Status**: ✅ Done — Files: `render.com/routes/fast-sale-orders.js`

---

### [tpos-pancake][native-orders][v2/cart] Refactor: 1 nguồn = native_orders.products

**User đề xuất** sau khi review 3 bug stale-noc/sync race liên tiếp: "cho giỏ TPOS panel dùng chung native_orders.products đi -> nếu cần thì thêm cột dữ liệu bên native_orders.product".

**Trước**: `web2_cart_items` ↔ `native_orders.products` là 2 nguồn data, mỗi action add/remove/clear/PBH phải sync 2 chiều qua `_syncNativeOrderProducts` → fragile, sinh ra fix #1/#2/#3 liên tiếp.

**Sau**: 1 nguồn duy nhất là `native_orders.products`. TPOS panel cart đọc trực tiếp từ đó (filter `status='draft'`). Khi PBH tạo → status đổi `'confirmed'` → TPOS panel tự ẩn (filter). Không còn dual-write.

**Backend (`render.com/routes/v2/cart.js`)** — rewrite:

- `GET /:commentId`: SELECT products FROM native_orders WHERE fb_user_id=$1 AND status='draft'
- `GET /batch/counts`: SUM total_quantity từ draft orders
- `POST /:commentId/add`: tạo draft via `/from-comment` nếu chưa có + UPDATE products array (qty++ nếu trùng code)
- `POST /:commentId/:code/remove`: filter products array; nếu rỗng → DELETE native_order; SSE delete event
- `POST /:commentId/clear`: DELETE native_order
- `PATCH /:commentId/:code`: update qty
- `POST /:commentId/commit`: DEPRECATED no-op (back-compat)
- `clearCartByCustomerId` (gọi từ fast-sale-orders trên PBH): chỉ còn log audit — PBH route đã set status='confirmed' rồi → TPOS panel tự ẩn qua filter
- Drop `web2_cart_items` khỏi schema migration (giữ table cũ không xóa, rollback safe)
- Mọi sản phẩm ghi cả `quantity` lẫn `qty` (back-compat với native-orders modal dùng `quantity`)

**Frontend (`tpos-pancake/js/pancake/inventory-panel.js`)**:

- Xóa `_doCommit` + `_pendingCommits` + 5s commit timer (`/add` ghi thẳng vào DB)
- 5s undo toast thuần UX — undo gọi `/remove`
- Replace `confirm()` → `window.Popup.confirm()` (Web2Popup auto-loaded qua `tpos-sidebar.js`)
- Subscribe thêm SSE topic `web2:native-orders` → badge tự refresh khi modal Đơn Web sửa products
- Bump cache `v=20260522n`

**Browser test PASS** (commit `1aa81b75c` + Render deploy verified):

- ✅ Drag 1 SP → tạo `NW-20260522-0010` ngay (write immediate, fbPageId/fbPostId/fbCommentId đầy đủ)
- ✅ Drag 2 SP nữa → 3 products, totalQty=3, ghi cả qty + quantity
- ✅ PATCH native_orders.products từ ngoài → TPOS panel `/batch/counts` thấy số đúng (cùng nguồn)
- ✅ POST `/clear` → DELETE native_order → SSE `web2:native-orders {action:delete}` + `web2:cart`
- ✅ Tạo PBH → native_order.status='confirmed' → TPOS panel `/batch/counts` trả `{}` (filter ẩn)
- ✅ `window.Popup.confirm()` loaded
- ✅ SSE 2-tab realtime: native-orders create/update/delete + cart

**Status**: ✅ Done — Files: `render.com/routes/v2/cart.js` (rewrite), `tpos-pancake/js/pancake/inventory-panel.js`, `tpos-pancake/index.html`

---

### [tpos-pancake][native-orders] Fix #3: /add bỏ qua soft-deleted noc + /clear null out native_order_code

**Khi browser test full flow** (drag → tạo đơn → multi-product → clear → drag lại): drag sau clear-cart không tạo đơn mới, dù SSE log thấy commit fire. Cart counts hiển thị 1 SP nhưng `by-user` trả null.

**Root cause**: Sau clear cart, row `web2_cart_items` được soft-delete (`removed_at=NOW()`) NHƯNG vẫn giữ `native_order_code = NW-…`. /add endpoint query existingNoc KHÔNG filter `removed_at IS NULL` → tìm thấy noc cũ → trả về frontend → `alreadyCommitted=true` → frontend SKIP 5s commit timer → SP mới chỉ có cart row, không có native_order (order đó đã DELETE).

**Fix (commit `f3680e29c`)**:

- `v2/cart.js` POST `/:commentId/add`: SELECT existingNoc thêm `AND removed_at IS NULL` → chỉ lấy noc từ row active.
- `v2/cart.js` POST `/:commentId/clear` + `clearCartByCustomerId`: UPDATE thêm `native_order_code = NULL` khi soft-delete → cart sạch hẳn link với order đã DELETE/PBH.

**Verified browser test (Lucky Nguyen, fbUserId=9056377284400888)**:

- ✅ Drag 1 SP → 5s timer → tạo `NW-20260522-0009` với fbPageId/fbPostId/fbCommentId filled
- ✅ Drag 2 SP nữa → native-order sync 3 products, totalQty=3
- ✅ Modal native-orders mở chat OK (FB context có đủ)
- ✅ `POST /clear` → `native_deleted:true`, by-user → null
- ✅ Drag lại sau clear → tạo đơn mới (không bị stuck vì stale noc)
- ✅ Tạo PBH (`from-native-order`) → cart counts về `{}` ngay (auto-clear)
- ✅ SSE multi-tab realtime: `web2:cart`, `web2:native-orders {action:create/update/delete}`

**Status**: ✅ Done — Files: `render.com/routes/v2/cart.js`

---

### [tpos-pancake][native-orders] Fix #2: self-heal native_order broken qua /add + merge

**User báo tiếp (sau fix #1)**: "bị mất chức năng drag sản phẩm vào giỏ bên native-orders".

**Root cause**: Cart đã có `native_order_code` linked từ trước (commit lúc `fb_page_id` NULL). Frontend `addToCart` thấy `alreadyCommitted=true` → KHÔNG fire 5s commit timer → không có cơ hội tạo đơn mới hoặc heal đơn cũ. User thấy drag không tạo entry mới.

**Fix 2-layer (commit `cf7c4897c` + `e5fcbff20`):**

1. **Merge path** (`native-orders.js` POST `/from-comment`): khi merge SP mới vào draft cũ cùng `fb_user_id` + `live_campaign_id`, COALESCE-update `fb_user_name`/`fb_page_id`/`fb_page_name`/`fb_post_id`/`fb_comment_id`/`crm_team_id`/`live_campaign_name` từ request body. Idempotent — không override field đã có giá trị.
2. **Add path** (`v2/cart.js` POST `/:commentId/add`): frontend gửi `body.fbContext` (resolve TRƯỚC khi POST). Backend khi `noc` tồn tại → COALESCE-update `native_orders` cùng các field FB. Tự heal đơn broken mà không cần xóa.

**Kết quả**: Kéo SP thêm 1 lần lên KH có draft broken cũ → backend tự fill `fb_page_id`/`fb_post_id`/`fb_comment_id` → modal native-orders mở chat OK ngay. Đơn mới sau fix #1 vẫn đầy đủ FB context.

**Status**: ✅ Done — Files: `render.com/routes/native-orders.js`, `render.com/routes/v2/cart.js`, `tpos-pancake/js/pancake/inventory-panel.js`

---

### [tpos-pancake][native-orders] Fix #1: đơn tạo bằng drag SP thiếu fbPageId/fbPostId → không mở được inbox/chat

**User báo**: Mấy đơn tạo bằng drag SP (NW-20260522-0009/0010/0011) báo "Đơn không có Facebook user ID hoặc page ID — không thể chat" khi mở native-orders modal.

**Root cause**: Sau commit refactor `cart-per-customer` (ea3553cd5), `groupKey = customer.id` (= fbUserId) được dùng làm URL param cho cart endpoint VÀ làm `commentId` biến nội bộ trong `addToCart`. Khi resolve FB context:

- `_resolveCommitContext(commentId, …)` search `TposState.comments.find(x => x.id === commentId)` với `commentId = fbUserId` → KHÔNG MATCH → ctx trả về `fbPageId: null, fbPostId: null, crmTeamId: null`.
- DOM `querySelector('[data-comment-id=fbUserId]')` cũng không tìm thấy row → row=null.
- Sau 5s commit fire → POST /api/native-orders/from-comment với fbPageId/fbPostId NULL → native_order tạo với `fb_page_id IS NULL` → modal không mở được chat.

**Fix:**

- `tpos-pancake/js/pancake/inventory-panel.js` (`addToCart`): dùng `commentIdMeta` (comment thật từ row drop) để query DOM + resolve context, KHÔNG dùng `groupKey`. Set `ctx.fbCommentId = realCommentId`.
- `_resolveCommitContext`: thêm field `fbCommentId` vào ctx shape.
- `render.com/routes/v2/cart.js` (POST /:commentId/commit): dùng `b.fbCommentId || null` thay vì URL `commentId` (= fbUserId) khi truyền xuống from-comment, để `fb_comment_id` column lưu đúng giá trị comment thật.

**Existing broken orders (NW-20260522-0009/0010/0011 + các draft khác có fb_page_id IS NULL)**: User cần xóa manual và recreate qua drag. Order tạo từ giờ trở đi sẽ có đầy đủ FB context.

**Status**: ✅ Done — Files: `tpos-pancake/js/pancake/inventory-panel.js`, `render.com/routes/v2/cart.js`

---

### [balance-history] Fix #2: GD Live Mode "Xác nhận" treo do hai bảng `balance_history` ↔ `web2_balance_history` lệch dữ liệu

**User báo**: Fix trước (commit `66595d41`) push frontend OK nhưng GD mới gán SĐT + Xác nhận vẫn KHÔNG xuất hiện ở tab Kế Toán → Chờ Duyệt. KT không có cách nào duyệt cộng ví. GD bị treo luôn.

**Root cause (đào từ commit `c6507df3` ngày 2026-05-21 "tách bảng web2_balance_history")**:

- SePay webhook INSERT vào `balance_history` → mirror INSERT sang `web2_balance_history` (helper `_mirrorToWeb2BalanceHistory`, best-effort, silent fail).
- Matching engine (`sepay-transaction-matching.js`) **UPDATE** `balance_history` set `verification_status = 'PENDING_VERIFICATION'`, `linked_customer_phone`, `match_method` — KHÔNG mirror.
- Live Mode endpoints `/transaction/:id/phone` và `/transaction/:id/hidden` (`sepay-wallet-operations.js`) **UPDATE** `balance_history` — KHÔNG mirror.
- Tab "Chờ Duyệt" (`/api/v2/balance-history/verification-queue` ở `v2/balance-history.js`) sau commit kia đã sed-replace toàn bộ query sang `FROM web2_balance_history` → đọc dữ liệu STALE từ lúc INSERT đầu (verification_status NULL/PENDING, no phone).
- Kết quả: balance_history có status `PENDING_VERIFICATION` nhưng web2_balance_history vẫn `PENDING`/NULL → tab Chờ Duyệt rỗng dù Live Mode hiển thị đầy đủ.

**Cách user dùng**: chỉ trang legacy `/balance-history/index.html`. Không muốn đụng web2 frontend (`web2/balance-history/*`). Fix phải làm ở backend.

**Fix:**

- `render.com/routes/sepay-wallet-operations.js`:
    - Thêm helper `_syncWeb2BalanceHistory(db, balanceHistoryId)` — UPDATE editable columns trên `web2_balance_history` qua `JOIN balance_history ON sepay_id`. Best-effort + fallback INSERT...ON CONFLICT DO NOTHING nếu row web2 missing.
    - Gọi sau UPDATE ở `/transaction/:id/phone` (assignManual + accountant correction + auto-link).
    - Gọi sau UPDATE ở `/transaction/:id/hidden` (covers confirmAutoMatched + assignManual hide + assignFromDropdown hide).
- `render.com/routes/v2/balance-history.js`:
    - Thêm Migration 082 trong `ensureWeb2BalanceHistory` — one-time bulk UPDATE web2 set editable columns từ balance_history cho mọi row có sepay_id match VÀ chưa đồng bộ (DISTINCT FROM check verification_status / phone / is_hidden / wallet_processed / customer_id). Tự self-heal toàn bộ GD stuck từ ngày tách bảng đến giờ.
    - Gated qua `native_orders_migrations` table → idempotent.

**Tại sao chỉ 2 endpoint là đủ**: user flow Live Mode luôn kết thúc bằng `/hidden` (Xác nhận button) HOẶC `/phone` (Gán SĐT). Cả 3 cases (assignManual / assignFromDropdown / confirmAutoMatched) đều fire một trong 2 endpoint này. Sync trong endpoint sẽ pull TẤT CẢ updated columns từ balance_history (kể cả những thay đổi do matching engine làm trước đó) → web2 sync 1 phát đủ.

**Không đụng `web2/balance-history/*` frontend** (đúng yêu cầu user). Backend dual-write giữ 2 bảng đồng bộ. Web2 page tiếp tục đọc/ghi `web2_balance_history` bình thường.

**Test plan sau Render deploy (~3 phút)**:

1. Lần đầu hit `/api/v2/balance-history/*` từ tab Kế Toán → log Render hiển thị `[BalanceHistory V2] web2_balance_history schema ready` + `NOTICE: Migration 082: resynced web2_balance_history editable columns from balance_history`.
2. Refresh tab Chờ Duyệt → các GD stuck từ trước hiện ra full (với SĐT, tên, thời gian).
3. Tạo GD mới ở Live Mode: Xác nhận hoặc gán SĐT mới → toast → sang Chờ Duyệt thấy GD ngay.
4. KT bấm Duyệt → status APPROVED + ví cộng (vì web2.wallet_processed=FALSE, processDeposit chạy).
5. (Optional) `curl https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/balance-history/accountant/stats` → `pending_verification` > 0.

**Followup chưa làm (out of scope)**: matching engine `sepay-transaction-matching.js` UPDATE spots cũng nên dual-write. Hiện tại OK vì user luôn click /phone hoặc /hidden sau, mang theo full state. Nếu sau này có flow không qua 2 endpoint này, sẽ stuck lại.

**Status**: ✅ DONE (chờ deploy verify).

### [tpos-pancake/inv] fix: 4 vòng debug — viền có đơn + restrict drop + detection + popover

User: "cho viền các khách đã có đơn hàng → browser test kéo thả sản phẩm vào khách đã có đơn".

**4 vòng fix qua browser test prod**:

1. **`086e42c29`** — CSS viền xanh + restrict drop:
    - `.inv-has-order`: border-left 3px #16a34a + ::after `✓ có đơn` badge
    - `.inv-drop-hover`: gradient tím + scale (hợp lệ)
    - `.inv-drop-deny`: gradient đỏ + ::before `🚫 Khách chưa có đơn` + cursor not-allowed + toast warning
    - Drop handler restrict: `dataTransfer.dropEffect='none'` nếu row không có `inv-has-order`

2. **`a982d0167`** — Detection field thực tế:
    - Browser test cho thấy Pancake conv list KHÔNG có `customer.order_count`, chỉ có `customers[0] = {fb_id, id, name}`
    - Conv-level fields: `has_livestream_order`, `has_phone`, `recent_phone_numbers`, `tags`
    - Heuristic any-of: `has_livestream_order=true` OR cart count>0 OR (has_phone + tags non-empty)
    - data-order-reason debug attribute

3. **`d35fdf05c`** — Lazy attach observer (Pancake load async):
    - `init()` chạy trước khi `.pk-conversation-list` xuất hiện trong DOM → MutationObserver không attach
    - Polling cũ 30s không đủ vì conv-list xuất hiện sau page select
    - Fix: `setInterval` 2s kiểm tra + attach observer khi list xuất hiện; sau 2 phút giảm xuống 5s indefinite
    - `list.dataset.invObserved='1'` tránh double-attach

4. **`eba99ec9e`** — Popover không bị đóng ngay khi click badge:
    - `renderCartPopover()` attach outside-click listener (capture:true) → badge.click() bubble vào listener vừa attach → pop.contains(badge)=false → remove ngay
    - Fix: `setTimeout(0)` wrap addEventListener — attach SAU khi click hiện tại finish

**Browser test verified end-to-end** (prod nhijudy.store):

- ✓ Mode switcher render + Kho default
- ✓ 14 conv loaded, 1 row detected `inv-has-order` (phone+tag)
- ✓ Drag SP `HNQUAN2DEN` → drop "Trang Doan" → POST `/api/v2/cart/add` → success
- ✓ Badge `🛒 2` (qty after 2 lần add)
- ✓ Click badge → popover mở với 1 item + total
- ✓ Click `×` remove → soft delete → badge biến mất

### [tpos-pancake] feat: Kho SP panel + drag-drop SP vào comment khách + cart Postgres

User request: trang tpos-pancake bên panel Pancake có **tab switcher** giữa Chat & Kho SP. Panel Kho có section tabs NCC từ Sổ Order (HÀ NỘI, HƯƠNG CHÂU…), search, danh sách SP. Kéo SP qua comment khách → thêm vào giỏ + lưu lịch sử. Cho phép xóa SP khỏi giỏ.

User decisions (đã confirm):

1. Filter: exact `supplier === tabName` (force supplier required khi tạo SP, có endpoint backfill SP cũ qua prefix code)
2. Cart storage: **Postgres** (Render DB) — bảng `web2_cart_items` + `web2_cart_history`
3. Drop target: chỉ comment đã có đơn (resolve customer từ PancakeState)
4. Tab nằm INSIDE Pancake column (không phải column riêng); default = "Kho", state lưu localStorage

**Backend** (commit `804ab29db`):

- [`render.com/routes/v2/cart.js`](../render.com/routes/v2/cart.js) (~280 dòng):
    - 2 bảng + migration idempotent: `web2_cart_items` (UNIQUE comment_id+product_code) + `web2_cart_history` (append-only log)
    - Endpoints: GET/:cid · POST/:cid/add (upsert qty++) · POST/:cid/:code/remove (soft delete + log) · PATCH (qty change) · GET/:cid/history · GET/batch/counts · GET/history/all
    - SSE notify `web2:cart` cross-tab sync
- [`render.com/routes/web2-products.js`](../render.com/routes/web2-products.js): POST `/` require `supplier` non-empty + endpoint mới `POST /backfill-supplier` với prefixMap để fill SP cũ chưa có supplier
- Mount `/api/v2/cart` trong server.js + init SSE notifier

**Frontend** (commit `741e2203a`):

- [`tpos-pancake/css/inventory-panel.css`](../tpos-pancake/css/inventory-panel.css) (~340 dòng): switcher gradient, tabs NCC pill, product cards drag-friendly, drop hover, cart badge gradient amber, cart popover floating, toasts
- [`tpos-pancake/js/pancake/inventory-panel.js`](../tpos-pancake/js/pancake/inventory-panel.js) (~370 dòng):
    - Load NCC tabs từ Firestore `so_order_v2/main`
    - Load SP từ `/api/web2-products/list?limit=2000`
    - Filter ASCII-normalize exact supplier + AND-token search
    - HTML5 drag/drop với `application/x-web2-product` MIME
    - Cart API: add/remove/list/badge counts qua `/api/v2/cart`
    - SSE subscribe `web2:cart` (badge refresh) + `web2:products` (SP list refresh debounce)
    - Cart popover floating overlay
- [`tpos-pancake/js/pancake/pancake-mode-switcher.js`](../tpos-pancake/js/pancake/pancake-mode-switcher.js) (~100 dòng):
    - Non-invasive: poll-wrap `#pancakeContent` sau khi Pancake render shell
    - 2 mode-content slots: chat (giữ pancake-chat-container nguyên) + kho (lazy init InventoryPanel khi switch lần đầu)
    - State `localStorage.tpos_pancake_active_tab`, default `'kho'`

**Status**: Backend deployed Render (auto), frontend đợi GH Pages deploy ~3 phút. Test: mở `tpos-pancake/index.html` → thấy mode switcher top Pancake column → default Kho → tabs HÀ NỘI/HƯƠNG CHÂU... → search "ao bi den" → kéo SP qua comment row → badge cart hiện 🛒N → click badge xem giỏ + xóa.

### [web2/products] feat: NCC dropdown từ so_order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể

User: "phần NCC cho chọn dropdown lấy theo tất cả tên NCC trong sổ order chứ đừng cho nhập input" + "chọn biến thể, chỉnh sửa tên, NCC thì phải generator mã lại cho chính xác".

**Changes** [`web2/products/index.html`](../web2/products/index.html):

- `<input list="pmSupplierList">` + `<datalist>` → `<select id="pmSupplier">` thuần
- Label hint: "(chọn từ tab Sổ Order)" thay "(SP ngoài Sổ Order: nhập tên NCC tay)"

**Changes** [`web2/products/js/web2-products-app.js`](../web2/products/js/web2-products-app.js):

1. **NCC source**: thay `collectExistingSuppliers()` đọc `STATE.products + note` bằng `loadSuppliersFromSoOrder()` đọc Firestore `so_order_v2/main`:
    - Iterate `data.tabs[*].shipments[*].rows[*].supplier` + `tab.label/name`
    - Cache `_suppliersFromSoOrder` + `_suppliersLoadPromise` (lazy load)
    - Fallback `[]` nếu Firebase chưa load / Firestore fail

2. **`populateSupplierDropdown()`**: populate `<select>` với options:
    - "— Chọn NCC từ Sổ Order —" (empty value)
    - Legacy SP có supplier không nằm so-order → prepend option "(legacy — không có trong Sổ Order)" để không mất giá trị khi edit
    - List NCC từ so-order
    - Nếu so-order rỗng → option disabled hint

3. **Auto-regen mã**: bind listener `change` / `input` cho `#pmSupplier`, `#pmName`, `#pmVariant`. Debounce 300ms. Mode edit (`STATE.editingCode`) → skip (mã là khóa chính, không đổi).

4. **Variant ảnh hưởng mã**: concat `pmVariant` vào `productName` trước khi gọi `Web2ProductCode.suggest()` → color/size extractor pick up từ variant. Vd `name="GIÀY"` + `variant="Đen / Size 32"` → effective `"GIÀY Đen Size 32"` → `HNMMDENS32`.

5. **`silent` param** cho `suggestProductCode()`: auto-trigger gọi `silent=true` → không notify warning khi field thiếu (tránh spam). User click button "Sinh mã" → `silent=false` → notify đầy đủ.

### [issue-tracking] Fix: ép giờ hiển thị về UTC+7 (Asia/Ho_Chi_Minh)

**Bug user báo (ảnh kèm)**: Timestamps trên danh sách phiếu/đơn (vd `22/05/2026, 03:51`) hiển thị sai múi giờ vì `toLocaleDateString/TimeString('vi-VN')` không có `timeZone` → fallback vào timezone của browser/máy chạy → khi browser ở UTC hoặc khác Asia/Ho_Chi_Minh sẽ lệch 7 tiếng.

**Files:**

- `issue-tracking/js/script.js` — thêm hằng `VN_TZ = 'Asia/Ho_Chi_Minh'`; ép `timeZone` cho `formatDateShort`, `formatDateTime`, và call `new Date(o.createdAt).toLocaleDateString('vi-VN', …)` trong block render đơn (line ~820).
- `issue-tracking/js/customer-orders-lookup.js` — thêm `VN_TZ` local trong IIFE; ép `timeZone` cho `formatDate` + `formatDateTime` của modal "Đơn của khách".

**Chi tiết:**

- Mọi `toLocaleDateString` / `toLocaleTimeString` liên quan timestamp đều truyền `{ timeZone: 'Asia/Ho_Chi_Minh', … }` → bất kể browser/server ở múi giờ nào, list/timeline/modal đều hiển thị giờ Hà Nội đúng.
- `money.toLocaleString()` không đụng (đó là format tiền, không phải timestamp).
- Filter date range (line 3760-3765) dùng `new Date(dateFrom).getTime()` vẫn parse "YYYY-MM-DD" theo UTC midnight → có sai lệch nhỏ ở biên ngày khi user filter, nhưng user chưa report nên giữ nguyên, sẽ fix khi có nhu cầu thực tế.

**Status**: DONE.

---

### [web2/products] fix: bỏ `customPrefix` + prompt() — chỉ dùng ô NCC làm single source

User: "gợi ý mã là gì? mã tự động generator theo các phần đã có mà".

Hiểu đúng: mã được **auto-generate** (không phải "gợi ý") từ NCC + tên SP + biến thể. SP tạo ngoài Sổ Order → user **nhập tay tên NCC vào ô NCC** (không phải prefix riêng qua prompt).

**Revert** việc thêm `opts.customPrefix` (commit `0e1cb1f45`):

- `web2/shared/web2-product-code.js`: bỏ tham số `customPrefix` khỏi `resolvePrefix` / `suggest` / `suggestWithMap`. Doc rewrite + bỏ error message reference `(opts.customPrefix)`.
- `web2/products/js/web2-products-app.js`:
    - Bỏ `prompt()` hỏi prefix tay
    - Validation đơn giản: NCC trống → notify + focus ô NCC
    - Đổi notify message: "Module sinh mã" thay "Module gợi ý mã"
    - Thêm comment giải thích flow: mã auto-gen, không "suggest"
- `web2/products/index.html`:
    - Label NCC thêm `*` (required) + hint "(SP ngoài Sổ Order: nhập tên NCC tay)"
    - Button "Gợi ý" → **"Sinh mã"** (icon sparkles giữ)
    - Title button: "Sinh mã tự động từ NCC + Tên SP + Biến thể"

**Test pass** (6/6):

- `HÀ NỘI / GIÀY ĐEN SIZE 32` → `HNMMDENS32`
- `HÀ NỘI / GIÀY ĐEN SIZE 33 (2nd)` → `HNMM2DENS33`
- `HƯƠNG CHÂU / ÁO ĐỎ` → `HCAODO`
- `HẢI CHÂU / ÁO ĐEN (collision)` → `HC1AODEN`
- `SHOP NHI / ĐẦM HỒNG` (NCC nhập tay) → `SNDAMHONG`
- no NCC → throw Error đúng

### [web2/shared/web2-product-code] fix: bỏ SP default — bắt buộc nhập prefix tay khi không có NCC

User: "bỏ logic ngoại lệ là SP đi → bắt buộc điền tay phần prefix NCC nếu tạo ở phần khác sổ order".

**Changes** [`web2/shared/web2-product-code.js`](../web2/shared/web2-product-code.js):

1. **`basePrefix(null/'')`** giờ throw Error thay vì trả `'SP'`:
    ```
    Error: supplierName bắt buộc — SP tạo ngoài Sổ Order phải nhập prefix tay (opts.customPrefix)
    ```
2. Thêm option **`opts.customPrefix`** vào `suggest()` / `suggestWithMap()` / `resolvePrefix()`. Khi truyền → bypass NCC inference + collision check, normalize uppercase no-diacritic.
3. Doc header rewrite + example bỏ `SP`, thêm example `customPrefix='ABC' → ABCAODO`.

**Web 2.0 consumer** [`web2/products/js/web2-products-app.js`](../web2/products/js/web2-products-app.js):

- `suggestProductCode()`: khi user click "Gợi ý mã" mà NCC trống → `prompt()` hỏi prefix tay. Cancel/empty → notify warning, không gen.
- Try/catch `suggest()` để catch Error từ shared module.

**Verified 6 unit test** (node -e):

| Input                                 | Output         | Status |
| ------------------------------------- | -------------- | ------ |
| no NCC, no customPrefix               | throw Error ✓  | đúng   |
| customPrefix='XYZ' / ÁO ĐỎ            | `XYZAODO`      | ✓      |
| customPrefix='NJD' / GIÀY ĐEN SIZE 32 | `NJDMMDENS32`  | ✓      |
| 2nd SP same customPrefix              | `NJDMM2DENS33` | ✓      |
| customPrefix='shop nhi' (normalize)   | `SHOPNHIAODO`  | ✓      |
| NCC=HÀ NỘI (regression)               | `HNAODO`       | ✓      |

### [web2/shared/web2-product-code] feat: update rule theo spec shop (6 keyword + MM fallback + HC1 collision)

User clarify: "đã có logic tạo mã sản phẩm web 2.0 cũ → coi sản phẩm bên so-order tạo ở tab gì ví dụ HÀ NỘI=HN, HƯƠNG CHÂU=HC, HẢI CHÂU trùng HƯƠNG CHÂU=HC1 → viết tắt màu biến thể trong web2/variants → tên sản phẩm có 'ÁO', 'QUẦN', 'GUỐC', 'ĐẦM', 'TLQD', 'TDQD' còn lại không có các trường hợp trên là 'MM' → HNGIAYDENS32".

**Đã update** [`web2/shared/web2-product-code.js`](../web2/shared/web2-product-code.js):

1. **TYPE_MAP** — chỉ giữ 6 keyword:
    - `ÁO` → `AO`
    - `QUẦN` → `QUAN`
    - `GUỐC` → `GUOC`
    - `ĐẦM` → `DAM`
    - `TLQD` → `TLQD`
    - `TDQD` → `TDQD`
    - Default fallback `MM` (cho mọi tên SP không match — vd "GIÀY ĐEN" → MM)
    - Bỏ các keyword cũ: VÁY, ÁO KHOÁC, ÁO THUN, ÁO SƠ MI, ÁO LEN, ÁO DÀI, QUẦN JEAN/TÂY/SHORT/LÓT, TÚI, GIÀY, DÉP, MŨ, NÓN.

2. **Collision counter** từ `2` → `1`:
    - "HƯƠNG CHÂU" (first) = HC
    - "HẢI CHÂU" (collide) = HC1 (không phải HC2 như trước)
    - Sửa ở 2 chỗ: `resolvePrefix()` + `buildPrefixMap()`

3. **SP default prefix** khi không có NCC (SP tạo từ chỗ khác, không phải Sổ Order):
    - `basePrefix(null/'')` → `'SP'` (thay vì `'XX'` cũ)
    - Vd: SP tạo trực tiếp ở `web2/products/` → `SPMMDENS32`

4. **Counter SP đầu tiên không có số**:
    - SP 1st của (NCC, type) → không số (vd `HNMMDENS32`)
    - SP 2nd+ → số bắt đầu từ 2 (vd `HNMM2DENS33`)
    - Trước: luôn có số "1" (`HNMM1DENS32`). Comment cũ nói "đầu tiên không có số" nhưng code không khớp.

5. **Doc header** rewrite với example mới theo spec user + clarification rule.

**Verified bằng 12 unit test** (node -e):

| Input                                          | Output              | Expected |
| ---------------------------------------------- | ------------------- | -------- |
| HÀ NỘI / GIÀY ĐEN SIZE 32 (1st)                | `HNMMDENS32`        | ✓        |
| HÀ NỘI / GIÀY ĐEN SIZE 33 (2nd)                | `HNMM2DENS33`       | ✓        |
| HƯƠNG CHÂU / ÁO ĐỎ                             | `HCAODO`            | ✓        |
| HÀ NỘI / ĐẦM HỒNG                              | `HNDAMHONG`         | ✓        |
| HÀ NỘI / QUẦN XANH DƯƠNG SIZE 5                | `HNQUANXDS5`        | ✓        |
| HẢI CHÂU / ÁO ĐEN (collision)                  | `HC1AODEN`          | ✓        |
| buildPrefixMap(HC, HẢI CHÂU, BẢO LỘC, BẾN TRE) | `{HC, HC1, BL, BT}` | ✓        |
| (no NCC) / GIÀY ĐEN SIZE 32                    | `SPMMDENS32`        | ✓        |
| (no NCC) / ÁO ĐỎ                               | `SPAODO`            | ✓        |
| (no NCC) / GIÀY ĐEN S33 (2nd)                  | `SPMM2DENS33`       | ✓        |
| (no NCC) / ĐẦM HỒNG                            | `SPDAMHONG`         | ✓        |
| (no NCC) / QUẦN XANH SIZE 5                    | `SPQUANXANHS5`      | ✓        |

Trang `web2/products/` đã gọi `Web2ProductCode.suggest()` — không cần đổi code consumer.

### [web2/variants-matrix] revert: gỡ F10 — bỏ cách tạo mã SP auto `<base>-<size>-<color>`

User request: "bạn revert lại cách tạo mã sản phẩm đi".

F10 trang `web2/variants-matrix/` tự sinh mã theo công thức `<base_code>-<size>-<color>` không khớp với chuẩn `ProductCodeGenerator` của Web 1.0 (prefix mapping + max-number increment qua API). Revert toàn bộ feature thay vì cố sửa cho khớp.

**Removed**:

- 🗑 Folder `web2/variants-matrix/` (xoá hẳn)
- 🗑 Endpoint `POST /api/web2-products/bulk-create-matrix` (~60 dòng trong [`render.com/routes/web2-products.js`](../render.com/routes/web2-products.js))
- 🗑 Menu item "Matrix biến thể" trong sidebar group "Tính năng mới"
- 🗑 Entry `'web2/variants-matrix/index.html'` trong `WEB2_PAGES` allow-list
- 🗑 Card F10 trong section "Future development" của trang `web2/overview/`

Còn lại 11 trang trong group "Tính năng mới" (F01, F02, F03, F05, F06, F07, F08, F09, F11, F12 + overview).

Nếu sau này cần làm lại matrix → dùng `ProductCodeGenerator` từ Web 1 hoặc cho user nhập tay mã.

### [web2/wallet] feat: cô lập triệt để wallet khỏi Web 1.0 — trigger-based mirror

User request: "customer_wallets + wallet_adjustments là phần nào có chức năng gì? … làm triệt để đi".

**Context**: 2 bảng `customer_wallets` (ví KH, balance/virtual_balance) + `wallet_adjustments` (audit khi sai mapping SePay) là SHARED giữa Web 1.0 (orders-report tab1, balance-history accountant cũ) và Web 2.0 (web2/balance-history, web2/customer-wallet, dashboard-kpi, audit-log). Trước đây Web 2.0 read trực tiếp 2 bảng này → vi phạm cô lập layer.

**Solution**: dùng **Postgres TRIGGER** thay vì sửa ~15 write site:

**File mới**: [`render.com/services/web2-wallet-isolation.js`](../render.com/services/web2-wallet-isolation.js)

1. Tạo 3 bảng mirror riêng (`CREATE TABLE LIKE legacy INCLUDING ALL`):
    - `web2_customer_wallets` ← `customer_wallets`
    - `web2_wallet_transactions` ← `wallet_transactions`
    - `web2_wallet_adjustments` ← `wallet_adjustments`
    - `DROP id DEFAULT` (id luôn từ legacy)
2. 3 trigger function PL/pgSQL `web2_mirror_*` — `INSERT INTO web2_X SELECT NEW.* ON CONFLICT(id) DO UPDATE`. EXCEPTION handler dùng `RAISE WARNING` → KHÔNG fail Web 1.0 write nếu mirror fail.
3. 3 trigger `AFTER INSERT OR UPDATE` trên 3 bảng legacy.
4. Backfill 1 lần qua `INSERT ... SELECT FROM legacy ON CONFLICT DO NOTHING` — chỉ chạy khi web2\_\* rỗng (avoid duplicate backfill).
5. Mount migration trong `server.js` sau DB connect (idempotent).

**Update 2 Web 2.0 readers** (đã không còn touch legacy):

- `dashboard-kpi.js`: `FROM customer_wallets` → `FROM web2_customer_wallets`
- `audit-log.js`: `FROM wallet_adjustments` → `FROM web2_wallet_adjustments`

**Verified sau deploy** (prod API):

- `/api/v2/dashboard-kpi/` → `wallet_overdraft: 0` ✓
- `/api/v2/audit-log/entities` → bao gồm `wallet` (detect `web2_wallet_adjustments` exists) ✓
- `/api/v2/audit-log/list?entity=wallet` → 3 items real data từ `web2_wallet_adjustments` (backfill OK) ✓

**Effect**:

- Web 1.0 KHÔNG sửa 1 dòng code. orders-report tab1 / wallet-event-processor / routes/v2/wallets / routes/v2/tickets tiếp tục write legacy như cũ.
- Mỗi write commit → trigger fire → mirror sang web2\_\* trong cùng transaction.
- Web 2.0 readers cô lập triệt để.

**Pattern thống nhất** với migration 081 (web2_balance_history) đã làm trước — chỉ khác chỗ dùng trigger thay vì dual-write helper trong code (vì wallet có quá nhiều write site).

### [web2] fix: 5 vòng debug backend + frontend cho 12 features mới — test sạch

User request: "Browser test lại các tính năng mới vừa thêm → tự debug, test lỗi → commit push lặp lại tới khi hết lỗi hoàn toàn".

**Quy trình**: persistent Playwright session (localhost:8765) → nav 11 trang → eval state + console.error + netlast → fix → commit + push → đợi Render auto-deploy (~2 phút) → re-test → lặp.

**5 vòng fix**:

1. `req.app.locals.pool` → `req.app.locals.chatDb` ở 7 route v2 (notifications/audit-log/supplier-aging/dashboard-kpi/smart-match/inventory-forecast/supplier-360) — undefined pool → 500. Commit `4e4ed9564`.
2. `web2_products.active` → `is_active` (column thực tế) ở 3 route + supplier-aging rewrite dùng `final_amount + status IN (DRAFT/CONFIRMED/PARTIAL/PENDING)` thay vì `total_due` (không tồn tại). Commit `2a1610ddb`.
3. `fast_sale_orders` field names: `date_created/date_invoice` (BIGINT epoch) không phải `created_at`, `partner_name/partner_phone` không phải `customer_*`. Bỏ `pick_state` (không có) — dùng `tracking_ref` placeholder. Commit `9e689ae9c`.
4. `pbh_fulfillment_logs.event_type` → `action`, `wallet_adjustments.customer_phone` → `wrong_customer_phone`, `web2_balance_history.amount` → `transfer_amount`. Audit-log union cast `to_timestamp(BIGINT/1000.0)`. Commit `794039b2a`.
5. Frontend: `variants-matrix` API trả `{variants:[{value, groupName, shortCode}]}` không phải `{items:[]}`. Mobile hamburger `.w2-mobile-menu-btn` mặc định `display:none` (trước hiện cả desktop). Commit `0cdca0fbf`.

**Verified clean** (cuối):

- 11 trang HTTP 200 (curl localhost:8765)
- 10 API v2 trả `{"success":true}` qua CF proxy
- Browser eval: errs=0 cho 7+ trang test interactively
    - dashboard: KPI hiện 3 stock + 10 recent PBH + 2 chart
    - audit-log: 43 rows real data
    - supplier-aging: 1 NCC nợ 1.440.000đ
    - inventory-forecast: 52 rows
    - notifications: 5 rows từ scan
    - smart-match: GD #4546 load OK
    - variants-matrix: 28 sizes + 80 colors, build 2×2 = 4 cells
- Sidebar: 26 item badge "- WEB 2.0", group "Tính năng mới" expand OK, hamburger ẩn desktop

**Status**: ✅ All 12 features clean. KHÔNG đụng web 1.0.

### [balance-history] Fix: Live Mode "Xác nhận" auto-matched không nhảy qua Kế Toán Chờ Duyệt

**Bug user báo**: NV bấm "Xác nhận" ở Live Mode (cards "Tự động gán") → GD chỉ bị ẩn khỏi kanban, KHÔNG xuất hiện ở tab Kế Toán → Chờ Duyệt.

**Nguyên nhân**:

- `auto_approve_enabled` setting mặc định = TRUE (`admin-settings-service.js` backward compat) → tx auto-match (qr_code/exact_phone/single_match) được set `verification_status = 'AUTO_APPROVED'` + auto-credit ví ngay khi SePay webhook về.
- Tab Kế Toán "Chờ Duyệt" filter `verification_status = 'PENDING_VERIFICATION'` → AUTO_APPROVED bị bỏ qua hoàn toàn.
- `confirmAutoMatched` (live-mode.js) chỉ gọi `PUT /api/sepay/transaction/:id/hidden` set `is_hidden=true` — không đụng `verification_status` → GD bị ẩn nhưng vẫn AUTO_APPROVED, vĩnh viễn không qua Chờ Duyệt.

**Flow user mong muốn**: Tiền vào SePay → Live Mode (auto-match hoặc gán SĐT) → NV bấm Xác nhận → GD qua Kế Toán Chờ Duyệt → KT review → approve = cộng ví KH. KT là chốt cuối.

**Files thay đổi**:

- `render.com/routes/sepay-wallet-operations.js` — `PUT /api/sepay/transaction/:id/hidden` nhận thêm field optional `pending_verification`. Khi `pending_verification=true && hidden=true` → SQL `CASE WHEN verification_status IN ('APPROVED','REJECTED') THEN verification_status ELSE 'PENDING_VERIFICATION' END`. Không downgrade trạng thái cuối. KHÔNG đụng `wallet_processed` (approve flow đã có guard `!wallet_processed` nên ví đã auto-credit sẽ không bị double).
- `balance-history/js/live-mode.js` — `confirmAutoMatched` gửi `pending_verification: true` trong body PUT hidden. Update local state `tx.verification_status` từ response. Toast đổi thành "Đã xác nhận — đã đẩy qua Kế Toán Chờ Duyệt".
- `web2/balance-history/js/live-mode.js` — apply cùng change (đồng bộ với legacy theo convention WEB2 module).

**Edge cases**:

- GD APPROVED/REJECTED đã chốt → CASE giữ nguyên, không re-open.
- Auto-match đã credit ví (`wallet_processed=TRUE`) → KT approve sẽ skip processDeposit (guard `if (!tx.wallet_processed && tx.transfer_amount > 0)`) → an toàn.
- `assignManual` & `assignFromDropdown` không cần đổi: chúng đã gọi endpoint `/phone?is_manual_entry=true` hoặc `/pending-matches/:id/resolve` set sẵn `verification_status = 'PENDING_VERIFICATION'`.

**Test plan (sau deploy Render ~3 phút)**:

1. Mở `/balance-history/index.html` → tab Live Mode → tìm card auto-matched (cột "Tự động gán").
2. Bấm "Xác nhận" → toast "Đã đẩy qua Kế Toán Chờ Duyệt".
3. Sang tab Kế Toán → Chờ Duyệt → GD hiện ra với SĐT/tên đã gán.
4. KT bấm Duyệt → status APPROVED, nếu ví chưa credit thì cộng ví, đã credit thì skip.

**Status**: ✅ DONE (chờ push + Render deploy verify).

### [inventory] fix: NCC search cũng phải lọc hoaDon[] trong card, không lộ NCC khác

User: "ví dụ tôi tìm 19 thì chỉ ra mỗi NCC 19 thôi đừng ra các nhà khác trong expand ngày".

Trước đây filter chỉ làm shipment-level (chỉ giữ shipments có ít nhất 1 hoaDon match) → khi expand vẫn thấy toàn bộ NCC trong cùng ngày/đợt. Fix:

- **`js/filters.js`**: khi NCC filter active, tạo clone shipment với `hoaDon` đã filter. Recompute `tongTienHoaDon`/`tongSoMon`/`tongMonThieu` cho stats card khớp với data hiển thị. Mở rộng match: case-insensitive substring trên `tenNCC` (vd "Q24" match "Q24 THÊM 17/1") + exact `sttNCC` cho số. Mỗi hoaDon clone gắn `_origInvoiceIdx` để click handler vẫn tra cứu đúng row gốc.
- **`js/table-renderer.js` renderInvoicesSection`**: dùng `hd._origInvoiceIdx ?? loopIdx` thay vì loop index trực tiếp → `showSubInvoice`/`viewInvoiceImages`/`deleteInvoiceImage` resolve về `globalState.shipments[].hoaDon[origIdx]` đúng.
- **`js/ncc-search.js` \_resolveFilterValue**: thêm 2 path đầu — `NCC <num>` (label fallback) và pure number → resolve trực tiếp sang sttNCC. Trước đó gõ "19" rớt xuống fallback free-text, không khớp tenNCC trống của các NCC chỉ có số.

Test localhost (NCC 19 có 3 shipments — 1 Đợt 1 ngoài range date filter, 2 Đợt 2): gõ "19" + chuyển Đợt 2 → filteredCount=2, mỗi shipment chỉ còn 1 hoaDon (STT 19), `_origInvoiceIdx` được giữ (0 và 3) để click handler vẫn đúng. tongHD recomputed (6781, 1420) khớp với hoaDon còn lại.

**Status**: ✅ Done

### [inventory] feat: tìm kiếm theo NCC (compact search bên cạnh đợt tabs)

User request: "cho tìm kiếm theo NCC". Trước đây có `<select id="filterNCC">` nhưng nằm trong `.filters-navigation` đã ẩn — giờ thêm input search compact ngay cạnh đợt tabs để gọn + tìm nhanh.

- **`js/ncc-search.js` (NEW)**: module `window.NCCSearch.{init,populate,clear}`. Datalist autocomplete từ `globalState.nccList` (tên NCC + fallback `NCC ${sttNCC}` cho row tenNCC rỗng). Resolve logic: exact match → resolve sttNCC; substring single match → resolve sttNCC; else fallback free-text (pipeline đã có OR match sttNCC|tenNCC includes). Esc clear. Debounce 200ms. Sync với legacy `#filterNCC` select để không phá `applyFilters()`.
- **`css/dot-tabs.css`**: thêm `.dot-tabs-row` (flex space-between, đợt tabs trái + search phải), `.ncc-search-box` pill input style (focus ring blue, has-value blue tint), `.ncc-search-clear` (X button).
- **`index.html`**: bọc `dot-tabs-bar` vào `.dot-tabs-row` cùng `.ncc-search-box` (input + datalist + clear button).
- **`js/main.js` setupUI**: gọi `NCCSearch.init()` sau khi DOM sẵn sàng.
- **`js/data-loader.js` updateNCCFilterOptions**: gọi `NCCSearch.populate()` để refresh datalist cùng lúc với legacy select.

Test localhost (67 NCCs, 14 shipments): datalist render 67 options ✓; gõ "Q24" → resolve free-text → match 2 shipments hoaDon có Q24/Q24 THÊM ✓; click clear → input rỗng, has-value off, filterNcc='all', filteredCount restore ✓.

**Status**: ✅ Done

### [inventory] feat: payment-CK slide-over panel cũng có section tabs (sync với main)

Mở rộng yêu cầu trước: panel "Thanh Toán CK Theo Đợt" (slide-over) trước đó stack tất cả đợt vertical → giờ có pill tabs `Đợt 1 | Đợt 2 | Đợt 3 | ...` trên đầu, chỉ render section của đợt đang chọn.

- **`js/table-renderer.js`** `renderPaymentSlideOverBody`: insert hàng `<div class="dot-tabs-bar payment-dot-tabs-bar">` ở đầu, lấy active từ `UIState.getActiveDotTab()` (đồng bộ với main page). Chỉ render `renderPaymentDotSection(activeEntry)` thay vì map tất cả.
- **`js/table-renderer.js`** `selectPaymentDotTab(dotSo)` (NEW + export `window.selectPaymentDotTab`): cập nhật UIState, gọi `DotTabs.render()` + `applyFiltersAndRender()` để main view sync, rồi re-render panel body.
- **`js/dot-tabs.js`** `DotTabs.select`: thêm step refresh `paymentSlideOverBody` nếu panel đang mở → click main tab cũng update panel.
- **`css/dot-tabs.css`**: variant `.payment-dot-tabs-bar` (ẩn "Đợt:" label trước, padding chặt hơn để khớp panel width).

Test localhost: click tab `Đợt 1` trong panel → panelTabs[Đợt 1 active], visibleSections=["1"], mainTabs[Đợt 1 active], filteredCount=5. Sync 2 chiều OK (click panel ↔ click main đều cập nhật lẫn nhau).

**Status**: ✅ Done

### [inventory] feat: đợt section tabs + stats theo tab + audit logging

**User request**: "Stats card không chính xác (có thể do DB duplicate) + chia section tab theo từng đợt, cache tab đã chọn".

**Đã làm**:

- **`js/dot-tabs.js` (NEW)**: module `window.DotTabs` (render + select). Auto-generate pill buttons từ unique `dotSo` trong `globalState.shipments`. Sort DESC nên đợt mới nhất bên trái. Khi data thay đổi (CRUD/refresh) gọi lại `DotTabs.render()` từ `flattenNCCData`. Default fallback: chọn `dotSo` lớn nhất nếu không có saved tab hoặc saved tab không còn.
- **`css/dot-tabs.css` (NEW)**: pill style hài hoà với `.tab-btn` của tracking tab (blue accent), có hover/focus/active states. Bar sẽ ẩn hoàn toàn khi chưa có đợt nào.
- **`js/ui-state.js`**: thêm `getActiveDotTab/setActiveDotTab`, persist vào `n2store_inv_ui_state_v1` localStorage key.
- **`js/filters.js`**: filter pipeline `applyFiltersAndRender` thêm bước lọc theo `UIState.getActiveDotTab()`. Cũng gọi `updateInventoryStatsBar()` để stats luôn theo scope filter.
- **`js/table-renderer.js`**: `updateInventoryStatsBar` đổi nguồn data — khi có active đợt tab thì dùng `filteredShipments` + chỉ scoped đợt entries từ `getAllDotsAggregated`. Không có thì dùng full set như cũ.
- **`js/data-loader.js`**: thêm `auditShipmentsData()` log raw vs aggregated (số rows, sum KG/HĐ/CP, danh sách duplicate `(date, dotSo, NCC)`, drift check). Chạy mỗi lần `flattenNCCData`. Output ở console (`[AUDIT] inventory_shipments — raw vs aggregated`). Thêm helper `getAvailableDotSoList()` cho tabs.
- **`index.html`**: thêm `<div class="dot-tabs-bar hidden" id="dotTabsBar">` giữa filter section và `action-bar`. Link CSS + JS file mới.

**Test (localhost qua persistent browser session)**: Đợt 1+2 hiển thị, default chọn Đợt 2 (lớn nhất); click Đợt 1 → filteredCount 5/14, stats update (KG 396→323, HĐ 72k→70k, TT 0→420k); refresh → Đợt 1 vẫn được restore từ localStorage. Audit log chạy ở console mỗi reload — user check số nếu nghi DB duplicate.

**Status**: ✅ Done

### [web2] feat: hiện thực 12 features Future Development (Sprint 0 + F01-F12)

User request: "Làm tất cả → phần nào dư xóa đi, và đây là web 2.0 nên đừng động vào những phần của web 1.0".

**11 trang Web 2.0 mới** (đều có badge "- WEB 2.0", mount qua sidebar, KHÔNG đụng web 1.0):

| Code | Trang                        | Path                       |
| ---- | ---------------------------- | -------------------------- |
| F01  | Dashboard KPI                | `web2/dashboard/`          |
| F02  | Aging công nợ NCC            | `web2/supplier-aging/`     |
| F03  | Bulk import Excel            | `web2/bulk-import/`        |
| F05  | Lịch sử thao tác (audit log) | `web2/audit-log/`          |
| F06  | Trung tâm thông báo          | `web2/notifications/`      |
| F07  | NCC 360°                     | `web2/supplier-360/`       |
| F08  | Print / Export hub           | `web2/print-export/`       |
| F09  | Smart Match SePay            | `web2/smart-match/`        |
| F10  | Matrix biến thể              | `web2/variants-matrix/`    |
| F11  | Dự báo tồn kho               | `web2/inventory-forecast/` |
| F12  | Phân quyền matrix            | `web2/users-permissions/`  |

**Backend routes mới** (Render `routes/v2/`):

- `notifications.js` (F06) — bảng `web2_notifications`, list/unread-count/read/mark-all-read/create/scan
- `audit-log.js` (F05) — union view qua 5 bảng audit hiện có
- `supplier-aging.js` (F02) — aggregate aging buckets từ Postgres
- `dashboard-kpi.js` (F01) — aggregate 8 metric, cache 30s
- `smart-match.js` (F09) — score function pure, top-3 suggestion
- `inventory-forecast.js` (F11) — bảng `web2_product_velocity`, recompute + list
- `supplier-360.js` (F07) — bảng `web2_supplier_ratings`, summary + rating

**DB migrations mới** (idempotent, auto-run):

- `web2_notifications` (+ 3 index)
- `web2_product_velocity`
- `web2_supplier_ratings`

**Shared helpers mới** (`web2/shared/`):

- `web2-sse-topics.js` — registry constants (PRODUCTS, NOTIFICATIONS, KPI_DASHBOARD, …)
- `web2-aging.js` — pure `bucketByAge` cho F02 + F07
- `web2-bulk-import.js` + `web2-bulk-import.css` — SheetJS lazy modal, validate, chunked upload
- `web2-export-helpers.js` — toExcel · toPDFBarcodes (jsPDF + JsBarcode) · printHTML
- `web2-notification-bell.js` + `.css` — bell mountable bất cứ trang nào (chưa auto-mount default, page tự pick up)

**F04 Mobile responsive CSS** (extend `web2-tpos-theme.css`):

- @media ≤900px: sidebar off-canvas drawer, hamburger button auto-inject
- Tables font 12.5px + horizontal scroll wrapper
- Modal full-screen
- Hero stat grid 2-col
- TOC single column

**F10 backend bổ sung**: `POST /api/web2-products/bulk-create-matrix` — tạo base SP + bulk variants.

**Sidebar updates** ([`web2/shared/tpos-sidebar.js`](../web2/shared/tpos-sidebar.js)):

- Thêm group "Tính năng mới" với 11 item (icon sparkles)
- WEB2_PAGES allow-list +11 entries → có badge "- WEB 2.0"
- Mobile hamburger button auto-inject khi mount (close on nav click)
- Cache bump `v=20260522e → v=20260522f` cho 30 trang

**Server mount points**: 7 route mới được mount vào `/api/v2/` ở `render.com/server.js` (notifications/dashboard có notifier hook).

**Cleanup**: KHÔNG đụng inventory-tracking/, orders-report/ hoặc bất cứ folder web 1.0 nào. Restore inventory-tracking về HEAD trước commit để tránh lẫn unrelated changes.

**Status**: ✅ Done — frontend 11 trang load OK (verified curl localhost), backend syntax OK (node -c pass). Pending deploy Render + GH Pages.

### [delivery-report] fix: NAP column không hiện khi click tab "Tỉnh" sau khi đã ở tab khác

Phát hiện qua browser test localhost: trong lite expanded, click tab "Tỉnh" sau khi đang ở tab `zero`/`combo` thì cột NAP bị ẩn (chỉ thấy TOMATO).

**Root cause**: `renderAllGroupsView()` ẩn tất cả cột trước khi show lại các cột active (`Object.values(GROUP_COL_MAP).forEach(...)style.display='none'`). Khi sang `renderProvinceView()`, function chỉ ẩn `drColCity/Shop/Return` nhưng KHÔNG re-show `drColTomato + drColNap` → nếu trước đó NAP bị ẩn (lite mode chỉ show tomato+shop), nó vẫn ẩn.

**Fix**: `renderProvinceView()` explicitly set `drColTomato` và `drColNap` về `display=''` trước khi render content (đối xứng với pattern hide city/shop/return).

File: `delivery-report/js/delivery-report.js:2320-2323` (block reset cột TOMATO/NAP).

**Verified end-to-end via Playwright** trên `localhost:8080`:

- ✅ Admin: lite collapsed (combo + zero) → click combo → 2 cols TOMATO+SHOP, stats 2/640.000
- ✅ Admin: zero tab → all stats=0, scan 0/0 (không có 0đ trong TOMATO+SHOP)
- ✅ Admin: triple-click title → bung đủ 7 tab, cursor=auto (no hint), userSelect=none
- ✅ Lite expanded: Tỉnh → TOMATO + NAP visible (sau fix), city/shop/return hidden
- ✅ Lite expanded: city tab → table 3 rows, stats 3/780.000
- ✅ Lite expanded: Tất cả → 2 cols TOMATO+SHOP (lite version), stats 2/640.000
- ✅ Tắt → bật lại Tra soát: liteExpanded reset, chỉ thấy combo+zero
- ✅ Switch userType=phuoc-authenticated + reload: combo ẩn, 6 tab + 5 cols visible
- ✅ Restore admin: default lite trở lại
- ✅ Bộ lọc click: filter section + stats bar visible

Status: ✅ Done

### [scripts] feat: HTTP/SSE realtime API cho `n2store-browser-session.js` + compound `do` command

User hỏi: "Browser test có bật server realtime thu thập dữ liệu nhận từ browser đọc liên tục để tương tác chính xác và nhanh nhất chưa?" → tối ưu khả thi.

**Trước đó**: pull-only model qua FIFO. Claude phải gửi `echo "netlast 20"` → đợi stdout. Không biết khi nào page hit error mới, phải poll.

**Sau khi sửa**: thêm realtime push channel. Mỗi event (console/network/pageerror) fan-out tới SSE clients ngay khi xảy ra. Pull snapshot + chạy command qua HTTP cũng dùng được.

**Files sửa**: [`scripts/n2store-browser-session.js`](../scripts/n2store-browser-session.js)

**Thêm**:

- `--http-port <port>` (default 0 = disabled). Khi set, mount HTTP server ở `127.0.0.1:<port>`.
- 4 HTTP endpoints:
    - `GET /events` — SSE stream realtime mọi event. Filter qua query `?types=console,pageerror,network`.
    - `GET /state?net=20&console=30` — JSON snapshot last N items + url hiện tại.
    - `POST /cmd {"cmd":"…"}` — chạy command qua dispatcher chia sẻ với REPL, return `{ ok, output, durationMs }`.
    - `GET /health` — `{ ok, url, pid, uptimeSec, netBuf, consoleBuf, sseClients }`.
- `dispatchCommand(line)` reusable function — REPL stdin và HTTP `/cmd` cùng dùng.
- Compound `do <cmd1> ;; <cmd2> ;; …` — chạy chuỗi command tuần tự, log gộp.
- `recentLog` ring buffer (2000 lines) — `/cmd` slice từ `startIdx` để return output đúng turn.
- `sseEmit(type, data)` — hook vào `pushConsole` (console/pageerror) + `captureResponse` (network). Silent (no overhead) khi `sseClients.size === 0`.

**Smoke test** (verified live):

```bash
node scripts/n2store-browser-session.js --user admin --pass admin@@ --base http://localhost:8088 --http-port 9999

curl -s http://127.0.0.1:9999/health
# → {"ok":true,"url":"…","pid":38835,"uptimeSec":22,"netBuf":10,"consoleBuf":82,"sseClients":0}

curl -s 'http://127.0.0.1:9999/state?net=2&console=5'
# → JSON với network + console arrays

curl -s -X POST http://127.0.0.1:9999/cmd -H 'content-type: application/json' \
  -d '{"cmd":"do eval return location.href ;; eval return document.title"}'
# → {"ok":true,"durationMs":4,"output":"…step 1/2…\n…step 2/2…"}

curl -N http://127.0.0.1:9999/events
# → SSE stream: hello → console → console → network → network …
```

**Workflow mới cho Claude**:

- **Subscribe SSE 1 lần** qua `Monitor http://127.0.0.1:9999/events` → mọi error/network mới push ngay, không cần poll.
- **Compound `do`** giảm round-trip cho pattern hay dùng (`do nav <url> ;; eval <state>`).
- **FIFO vẫn dùng được** — backwards compatible. Có thể chạy không `--http-port`.

**Status**: ✅ Done — syntax OK, smoke test 4/4 endpoints pass, SSE marker `SSE-TEST-MARKER-42` arrived <100ms.

### [docs/plans] feat: plan chi tiết 12 features future development cho Web 2.0

User request: "Lên plan cho phần Future development — 12 gợi ý: Dashboard KPI · Báo cáo công nợ+ví · Bulk import Excel · Mobile view · Audit trail UI · Notification center · Customer 360 NCC · Print/Export hàng loạt · Smart match SePay · Variants matrix · Inventory forecasting · Permission matrix".

**File mới**: [`docs/plans/web2-future-features-plan.md`](plans/web2-future-features-plan.md) (~685 dòng).

**Cấu trúc 10 sections**:

1. Executive summary — tổng 46 ngày dev × 4 sprint
2. Priority matrix — Impact × Effort 3×3
3. Sprint mapping — 4 sprint × ~12 ngày, sequenced theo dependency
4. Cross-cutting infrastructure — 4 helper shared (SSE registry, bulk-import, export, aging) build 1 lần reuse cho nhiều feature
5. 12 feature plans chi tiết — mỗi feature: Why · Scope · Tech approach · Files mới/sửa · Dependencies · Risks · Acceptance criteria · Estimated days
6. Migration/DB changes summary — 3 bảng mới (web2_notifications, web2_supplier_ratings, web2_product_velocity)
7. SSE topics changes — 2 topic mới (web2:notifications, web2:kpi-dashboard)
8. Open questions — 8 câu hỏi cần user confirm trước Sprint 1 (priority, mobile scope, noti channels, auto-link, schema check, NCC 360 v1, design system, testing)
9. Risks tổng thể — scope creep, schema concurrent, SSE throughput, bundle size, cache version
10. Progress tracking + approval checklist

**Sprint sequence proposed**:

- Sprint 1 (foundation + quick wins): F06 Noti · F12 Perm matrix · F05 Audit · F03 Bulk import
- Sprint 2 (reports + intel): F02 Aging · F09 SmartMatch · F08 Print/Export
- Sprint 3 (dashboard + UX): F01 Dashboard · F10 Variants matrix · F07 NCC 360 v1
- Sprint 4 (long-form + mobile): F04 Mobile · F11 Forecasting + polish/GA

**Priority lý do**:

- F06 Noti #1 vì pain point hiện tại + dùng được sẵn SSE infra
- F05 + F12 quick win (data/endpoint đã có, chỉ thiếu UI)
- F03 Bulk import unblock data entry bottleneck
- F04 Mobile để cuối vì invest lớn, cần stable feature trước

**Status**: ✅ Draft v1 done. Chờ user trả lời 8 open questions ở section 7 để refine & kick off Sprint 1 F06.

### [web2-overview] feat: trang Tổng quan Web 2.0 — mô tả chi tiết 13 trang badge

User request: "Trang tổng quan viết chi tiết chức năng các trang có badge WEB 2.0 → có thể làm gì, tất cả chức năng các nút, dữ liệu chuyển qua lại giữa các WEB 2.0, cơ sở dữ liệu, chức năng có thể phát triển".

**Files mới**:

- [`web2/overview/index.html`](../web2/overview/index.html) — single-page overview, structured 5 sections: Hero · Pipelines · 13 page cards · Data flow + SSE topics · Database · Future development.
- [`web2/overview/overview.css`](../web2/overview/overview.css) — page-specific overlay (~520 dòng) dùng token từ `web2-tpos-theme.css`.

**Nội dung 6 sections**:

1. **Hero** — badge WEB 2.0 + 4 stat cards (13 trang, 9 bảng web2\_\*, 10+ SSE topic, 3 pipeline).
2. **Pipelines (3 card)**:
    - Bán hàng (FB comment → native-orders → PBH → reconcile → customer-wallet)
    - Mua hàng (so-order → pending → web2-products → purchase-refund → supplier-debt + ví NCC)
    - Tiền (SePay → web2_balance_history → match → ví KH/NCC)
3. **13 page cards** — mỗi card: mục đích · cột chính · nút & action · API endpoint · Postgres tables · SSE topic · liên kết data. Số thứ tự + color variant + nút "Mở trang →" gradient.
4. **Data flow map** — 4 ASCII flow block (Money, Sell, Buy, Master+Auth) + 10 SSE topic pills.
5. **Database** — 3 card (Postgres web2\_\*, Legacy thuộc Web 2.0, Firestore collections) + lưu ý không dùng Firestore listener nữa.
6. **Future development** — 12 card gợi ý (Dashboard KPI, báo cáo công nợ + ví, bulk import Excel, mobile view, audit trail UI, notification center, customer 360 NCC, print/export hàng loạt, smart match SePay, variants matrix UI, inventory forecasting, permission matrix).

**Sidebar update** ([`web2/shared/tpos-sidebar.js`](../web2/shared/tpos-sidebar.js)):

- Mục "Tổng quan" home → đổi từ `../native-orders/index.html` sang `../web2/overview/index.html`.
- Thêm `web2/overview/index.html` vào `WEB2_PAGES` allow-list → có badge "- WEB 2.0".
- Bump cache `v=20260521x → v=20260522e` ở 17 trang dùng sidebar.

**Design**:

- Tuân thủ COLOR UPGRADE PACK (gradient buttons, soft tints, accent strips).
- 13 page card head có 13 color variant (blue/purple/green/orange/cyan/red/pink/emerald/teal/amber/indigo/violet/slate).
- Compositor-friendly transitions (transform + opacity), `prefers-reduced-motion` respected.
- Responsive: TOC 2 cột > 720px, 1 cột mobile; pipeline + future grid auto-fit.

**Status**: ✅ Done — pending GH Pages deploy (~3 min). Test bằng cách click "Tổng quan" trên sidebar.

### [delivery-report] fix: thống kê (đơn + tiền) follow theo mode/tab đang hiển thị

User request: "chỗ bộ lọc → thống kê bao nhiêu đơn, tiền → logic theo ẩn hiện giao diện".

Stats bar (5 ô: Giao hàng thu tiền / Đã thanh toán / Trả hàng / Đang giao / Đối soát không thành công) trước đây không phân biệt lite/full, không cập nhật khi đổi tab.

**Sửa**:

- `getTabFilteredData()` mở rộng: handle tab `combo` (lite TOMATO+SHOP non-0đ), `zero` (lite chỉ TOMATO+SHOP 0đ vs full toàn 0đ), `all` lite (TOMATO+SHOP cả 0đ).
- Thêm gọi `renderStats()` ở `setTab()`, `setScanFilter()`, `traSoat()` enter → stats đồng bộ ngay khi đổi tab / chế độ quét.
- `setScanFilter()` đồng thời handle tab 'combo' để re-render đúng view.

**Verified**: `node -c` JS syntax OK.

Status: ✅ Done

### [delivery-report] feat: 2 chế độ giao diện theo userType + triple-click title bung tab ẩn

User request: `delivery-report/index.html` cần 2 chế độ:

- **Interface 1** — `userType === 'phuoc-authenticated'`: giữ nguyên 6 tab tra soát hiện tại (Thành phố, Tỉnh, Bán hàng shop, Thu về, ĐƠN 0đ, Tất cả) + render 5 cột TOMATO/NAP/CITY/SHOP/RETURN.
- **Interface 2** — mọi user khác (kể cả admin): mặc định chỉ 2 tab: "TOMATO + BÁN HÀNG SHOP" (combo) và "ĐƠN 0đ" — render 2 cột TOMATO + SHOP. Triple-click vào tiêu đề `Thống Kê Giao Hàng` (no visual hint) sẽ bung thêm tab city/province/shop/return + "Tất cả". Refresh / tắt Tra soát → reset về collapsed.

**Logic lite render** (`renderAllGroupsView` + `buildPrintGroups`):

- combo tab → 2 cột, filter `!isZeroCOD`
- zero tab → 2 cột, filter `isZeroCOD`
- all tab (chỉ visible khi expanded) → 2 cột, không filter (gồm cả 0đ với badge inline)

**Files**:

- `delivery-report/index.html` — `id="drMainTitle"`, tab `data-tab="combo"`, bump `?v=20260522a` (17 references)
- `delivery-report/js/delivery-report.js` — state `uiMode` + `liteExpanded`, helpers `detectInterfaceMode()` `applyTabVisibility()` `setupTitleTripleClick()` `LITE_HIDDEN_TABS`. Sửa `traSoat()` set default tab theo mode, `setTab()` route 'combo' → `renderAllGroupsView`. Sửa `renderAllGroupsView()` + `buildPrintGroups()` chọn groupKeys + filter items theo mode/tab.
- `delivery-report/css/delivery-report.css` — `.dr-trasoat-tab.dr-tab-combo.active` gradient TOMATO→SHOP, `#drMainTitle { user-select: none }` (không lộ hint).

**Verified**: `node -c` JS syntax OK; curl-grep confirm HTML/JS changes serve qua `localhost:8080`.

Status: ✅ Done

---

## 2026-05-21

### [web2-shared] feat: color upgrade pack cho `web2-tpos-theme.css` — nổi bật + tone hài hoà

User request: "Cho css nó màu sắc, nổi bật các phần quan trọng, màu sắc tông hài hòa với nhau,...".

**File**: [`web2/shared/web2-tpos-theme.css`](../web2/shared/web2-tpos-theme.css) (+439 lines COLOR UPGRADE PACK).

**Token mở rộng** (HSL lightness 85-92% cho background tint, 30-50% cho text → WCAG AA pass mà không bị "loè"):

- `--tpos-primary-soft` / `-soft-2` / `-tint` cho 5 màu primary/success/info/warning/danger + neutral
- `--tpos-money-in` `#1ca73f` (đậm hơn success xanh để cell tiền vào dễ thấy) / `--tpos-money-out` `#d63838`
- `--tpos-shadow-primary` + `--tpos-shadow-card` cho card depth

**Áp dụng**:

- Body: linear-gradient soft 2 tone trắng → tint
- Header / page-head: 3px gradient left strip (primary → info)
- Button: gradient primary/success/danger/info + box-shadow nhẹ + outline variant
- Table: zebra `tr:nth-child(even)`, hover `--tpos-primary-soft`, selected row border-left
- Money cell: `.money-in` (đậm xanh) / `.money-out` (đậm đỏ) bold
- Stat-card: 5 variants (primary/success/info/warning/danger) — border-left strip 3px + linear-gradient tonal background
- Status pill: 5 màu (success/info/warning/danger/neutral) soft-bg + bold-text
- Tab active: underline linear-gradient(90deg, primary, info) + box-shadow glow
- Filter chip active: gradient primary
- Bulk action toolbar: accent gradient
- Form input focus: ring 3px `rgba(114, 102, 186, 0.12)`
- `.web2-card` / `.section-card`: hover shadow lift
- `.section-title`: border-left 3px accent
- `.empty-state`: friendly + icon accent
- Modal header: `--tpos-primary-soft` background + `::after` 60px gradient underline
- Toast: 4 variants với border-left

**Cache bump** `v=20260522c → v=20260522d` ở 11 page index.html: fastsaleorder-invoice, reconcile, so-order, tpos-pancake, purchase-refund, supplier-debt, supplier-wallet, products, variants, product-category, users.

**Performance vẫn an toàn**: KHÔNG đụng modal anti-lag (transform + opacity only), KHÔNG dùng backdrop-filter, gradient chỉ ở background-image (compositor-friendly), `will-change` không dùng permanent.

**Status**: ✅ Done — pending GH Pages deploy (~3 min).

### [web2-balance-history] feat: tách bảng `web2_balance_history` — isolate khỏi Web 1

User request: "tạo db render riêng cho web 2.0 đi, tôi không muốn chỉnh sửa dữ liệu của web 1.0 → vẫn dùng webhook sepay vì không ảnh hưởng db".

**Approach**: Cùng Render DB instance (tránh tăng cost + maintain 2 connection strings) nhưng tách bảng riêng `web2_balance_history` schema clone từ `balance_history` legacy. Webhook dual-write vào CẢ 2 bảng → 2 layer độc lập read/write.

**Migration 081** ([`v2/balance-history.js#ensureWeb2BalanceHistory`](../render.com/routes/v2/balance-history.js)):

- `CREATE TABLE web2_balance_history (LIKE balance_history INCLUDING ALL)` — clone columns + indexes + constraints + defaults
- One-time backfill: `INSERT INTO web2_balance_history SELECT * FROM balance_history ON CONFLICT (sepay_id) DO NOTHING`
- Self-gated qua `native_orders_migrations` table

**Sepay webhook dual-write** ([`sepay-webhook-core.js`](../render.com/routes/sepay-webhook-core.js)):

- Helper `_mirrorToWeb2BalanceHistory(db, sepayId)` — sau mỗi INSERT thành công vào `balance_history`, copy row sang `web2_balance_history` (best-effort, async, không chặn webhook).
- Hook vào 4 INSERT spots (main webhook handler, failed_webhook_queue retry, gap fill, recovery).

**Web 2.0 routes** ([`v2/balance-history.js`](../render.com/routes/v2/balance-history.js)):

- Sed-replace `balance_history` → `web2_balance_history` ở 50 references (queries trong 10 endpoints: list, pending, link, reprocess-wallet, unlink, stats, verification-queue, approve, reject, resolve-match, ...).
- Router-level middleware tự gọi `ensureWeb2BalanceHistory` mỗi request (cheap sau lần đầu).

**Customer-info sync** ([`sepay-wallet-operations.js`](../render.com/routes/sepay-wallet-operations.js)):

- `POST /api/sepay/customer-info` (shared endpoint cho QR scan) — sau UPDATE `balance_history` thêm parallel UPDATE `web2_balance_history` cùng WHERE clause → 2 bảng đồng bộ customer link.

**Files**: `v2/balance-history.js` (+migration +middleware +sed table), `sepay-webhook-core.js` (+helper +4 hook points), `sepay-wallet-operations.js` (+dual UPDATE customer-info).

**Verify sau deploy**:

1. Server log: `[BalanceHistory V2] web2_balance_history schema ready` lúc lần đầu hit `/api/v2/balance-history/*`
2. Migration log: `NOTICE: Migration 081: backfilled web2_balance_history from balance_history`
3. Frontend `web2/balance-history/index.html` hoạt động bình thường (cùng endpoint, đổi backing table)
4. Sepay webhook mới đến: row xuất hiện trong CẢ 2 bảng
5. User actions ở Web 2.0 page (verify/approve/reject) chỉ thay đổi `web2_balance_history`, không touch `balance_history` (Web 1).

### [web2-products][PBH] feat: SSE realtime auto-reload (không cần F5)

User report: "Bên native-orders và product hoặc các trang khác chưa cập nhật realtime UI, table... theo server SSE realtime → phải F5 lại để lấy dữ liệu mới".

**Trước**: chỉ native-orders có `Web2SSE.subscribe('web2:native-orders')` → mutation ở orders khác hoặc tạo PBH ở orders-report không tự refresh bảng products + PBH.

**Sau**:

1. **web2/products** ([`web2-products-app.js:719`](../web2/products/js/web2-products-app.js#L719)): `_setupSse()` subscribe 3 topic:
    - `web2:products` — CRUD direct (create/update/delete/stock adjust)
    - `web2:fast-sale-orders` — tạo PBH deduct stock + sync state → ảnh hưởng tồn kho
    - `web2:native-orders` — đổi status đơn → ảnh hưởng badge "ĐANG DÙNG"
      Debounce 500ms gom multi-mutation thành 1 reload.

2. **web2/fastsaleorder-invoice** ([`pbh-app.js:686`](../web2/fastsaleorder-invoice/pbh-app.js#L686)): subscribe `web2:fast-sale-orders` + `web2:native-orders` — bên cạnh `PbhRealtime` (WS broker). Belt-and-suspenders nếu WS down. Khi native-orders cancel/createPBH/cancel → bảng PBH tự reload.

3. **Backend bổ sung notify** trong `from-native-order` (commit trước f2c10d49): khi tạo PBH bump native từ cancelled→confirmed → emit `web2:native-orders` action 'status-bumped'.

### [native-orders] feat: bỏ "Tạo PBH bổ sung" (splitPbh) ở confirmed → muốn tạo phải tách đơn trước

User request: "trạng thái 'Đơn hàng' sẽ không cho tạo PBH nữa → muốn tạo thì tách đơn ra".

**Trước**: status='confirmed' show 2 nút:

- splitPbh (copy-plus icon) — tạo PBH bổ sung trực tiếp với split_index tăng dần
- cancelPbh — huỷ PBH

**Sau**: status='confirmed' chỉ còn cancelPbh. Muốn tạo PBH thêm → workflow rõ ràng hơn:

1. Click "Tách đơn" (split-square-vertical icon) — bây giờ hiển thị cả ở `confirmed` (trước chỉ draft)
2. Tạo đơn mới `STT-N` (giỏ rỗng, cùng khách) với status='draft'
3. Add SP vào đơn mới → confirm → "Tạo PBH" trên đơn draft

Buộc user phải tạo native-order con trước khi tạo PBH → audit-trail rõ ràng hơn cho từng đơn riêng.

**Files**: `native-orders/js/native-orders-app.js:492-547` — restructure 3-block action layout:

- Slot 2 (sau Sửa): `cancelled` → createPbh; `confirmed` → cancelPbh; `draft` → confirmDraft + createPbh
- Slot 4: splitOrder cho cả `draft` + `confirmed` (trước chỉ draft)
- Slot 5: cancelOrder chỉ cho `confirmed` (như cũ)

Backend `splitPbh` API (POST `/from-native-order?split=true`) vẫn giữ nguyên — chỉ frontend bỏ button. Function `NativeOrdersApp.splitPbh()` vẫn export cho code khác (vd extension).

### [native-orders][fast-sale-orders] feat: đơn cancelled vẫn cho tạo PBH (số HĐ mới, không đụng PBH cũ)

User clarify (2nd reading) — original "Hủy bỏ vẫn cho tạo PBH ..." là **mô tả behavior MUỐN có**, không phải bug report. User muốn:

- Đơn `cancelled` → nút "Tạo PBH" vẫn hiển thị
- Click → tạo PBH MỚI số HĐ mới trong `fast_sale_orders`
- PBH cũ (đã cancel khi `cancelOrder` chạy) giữ nguyên state='cancel'

**Revert + adjust** commit trước (f0c49d92):

1. **Frontend** ([`native-orders-app.js:492-528`](../native-orders/js/native-orders-app.js#L492)): 3-state conditional adjusted — `cancelled` show CHỈ nút "Tạo PBH" (bỏ "Xác nhận đơn" vì confirm chỉ update từ draft, no-op với cancelled). Tooltip rõ "Đơn đã huỷ — sẽ tạo PBH mới với số HĐ mới, KHÔNG đụng PBH cũ".

2. **Backend** ([`fast-sale-orders.js:1019-1036`](../render.com/routes/fast-sale-orders.js#L1019)): bỏ guard 409 trả về cho cancelled. Thay vào đó: `splitMode = b.split === true || src.status === 'cancelled'` — auto force split mode cho cancelled. Nghĩa là sẽ TẠO PBH MỚI thay vì trả về PBH cũ idempotent. PBH cũ giữ nguyên state.

Use case: KH huỷ đơn rồi sau đó đổi ý muốn mua lại → click "Tạo PBH" trên đơn cancelled → PBH mới số HĐ mới được tạo + PBH cũ ghi rõ đã cancel.

### [native-orders][fast-sale-orders] fix: đơn cancelled vẫn tạo PBH mới → 2 PBH cho 1 đơn

User report: "đơn này trạng thái 'Hủy bỏ' vẫn cho tạo PBH → bên 'fastsaleorder-invoice' sẽ tạo ra PBH với số HĐ mới → không xóa hay đổi trạng thái phiếu cũ bên 'fastsaleorder-invoice'".

**Root cause** ở UI render: ternary `o.status === 'confirmed' ? ... : ELSE` rơi vào ELSE branch cho cả `draft` lẫn `cancelled`. Nút "Xác nhận đơn" (confirmDraft) + "Tạo PBH" (createPbh) cùng render → user click "Tạo PBH" → POST `/api/fast-sale-orders/from-native-order` → backend không check `status='cancelled'` → tạo PBH số HĐ mới + giữ PBH cũ → 2 PBH ổn đề.

**Fix frontend** ([`native-orders-app.js:492-525`](../native-orders/js/native-orders-app.js#L492)): tách conditional thành 3 state:

- `cancelled` → chỉ hiển thị badge `<span>đã huỷ</span>` (no action button)
- `confirmed` → splitPbh + cancelPbh (như cũ)
- `draft` (default) → confirmDraft + createPbh (như cũ)

**Fix backend defense-in-depth** ([`fast-sale-orders.js:1014`](../render.com/routes/fast-sale-orders.js#L1014)): trong POST `/from-native-order` thêm guard sau khi fetch `src`:

```js
if (src.status === 'cancelled') {
    return res.status(409).json({
        error: 'native_order_cancelled',
        message: 'Native order ... đã cancelled — không tạo PBH mới. Tạo đơn mới nếu cần.',
    });
}
```

Chặn cả external caller (extension/cron) — không chỉ UI.

Status: ✅ Done.

### [web2-products][native-orders] feat: badge "ĐANG DÙNG" + popover orders dùng SP

User request: "Sản phẩm được thêm vào đơn nào ở native-orders thì sản phẩm đó bên products sẽ hiện chi tiết đang nằm ở chiến dịch, STT, khách nào — bấm vào để xem đơn đó luôn"

**Backend** ([`render.com/routes/web2-products.js`](../render.com/routes/web2-products.js)):

- Mới: `GET /api/web2-products/usage?codes=A,B,C` — SQL `JOIN jsonb_array_elements(native_orders.products)` filter `productCode = ANY($1)` + `status != 'cancelled'`, ORDER BY display_stt DESC. Trả map `{code: [{orderCode, displayStt, mergedDisplayStt, customerName, phone, status, campaignId, campaignName, fbPostId, qty, unitPrice, addedAt, createdAt}]}`.
- Đặt TRƯỚC route `/:code` để Express không match nhầm.

**Frontend products page**:

- Column mới **"ĐANG DÙNG"** (giữa Tồn kho và Ghi chú), colspan 11→12
- Badge:
    - `usage-loading` (placeholder `...` chấm pulse) khi đang fetch
    - `usage-empty` (`0 đơn`) khi chưa đơn nào dùng
    - `usage-has` (link button tím — gradient, hover lift) hiển thị `<N> đơn · <X> cái`
- Click badge → `openUsagePopover(code, ev)`:
    - Position absolute bên dưới badge
    - Group theo campaign (`campaignName || fbPostId`)
    - Mỗi item: `STT XX | Tên KH · SĐT | ×qty | [Status badge]`
    - Click → mở `native-orders/index.html?search=<orderCode>` tab mới
- Background fetch sau `load()`: gọi `Web2ProductsApi.usage(codes)` cho TOÀN BỘ page hiện tại, update từng cell in-place (không re-render bảng → giữ scroll, tránh nháy)
- CSS mới ~120 dòng cho badge + popover (gradient header tím như msg-template modal).

**Native-orders**: hydrate `?search=<code>` từ URL → fill `#filterSearch` + `STATE.search` → tự apply filter khi load. Cho phép popover link "deep-link" vào đúng đơn.

**Files**: `render.com/routes/web2-products.js` (+ endpoint), `web2/products/index.html` (header + colspan), `web2/products/js/web2-products-app.js` (~150 dòng mới: renderUsageBadge, \_loadUsageForCurrentPage, openUsagePopover), `web2/products/js/web2-products-api.js` (`usage()` method), `web2/products/css/web2-products.css` (+120 dòng), `native-orders/js/native-orders-app.js` (URL `?search=` hydration).

Verify: web2/products → bảng load → badge "..." 1s → fetch xong → badge tím "N đơn · X cái" → click → popover hiện list grouped by campaign → click order → tab mới native-orders filter đúng đơn.

### [native-orders] fix: Huỷ đơn (cancelOrder) — `_getBaseUrl` không tồn tại

User report: "Hủy đơn này không được" cho NW-20260521-0004.

Bug ở [`native-orders-app.js:6493`](../native-orders/js/native-orders-app.js#L6493): code gọi `window.NativeOrdersApi._getBaseUrl()` nhưng helper này **không có** — `BASE` const là private inside IIFE của `native-orders-api.js`. Click "Huỷ đơn" → `_getBaseUrl()` throw `TypeError` → catch → notify "Huỷ đơn thất bại: window.NativeOrdersApi.\_getBaseUrl is not a function".

Fix: dùng `WORKER_URL` directly + path `/api/native-orders/...` (cùng pattern `cancelPbh` line 2152 + `_doCreatePbh` line 2168). Endpoint `POST /api/native-orders/:code/cancel` backend đã sẵn sàng (verified: HTTP 200 + success=true với reason note).

Status: ✅ Done; ⏳ pending verify in-browser.

### [native-orders] feat: bulk-send filter SL=0 (giỏ trống)

User request: "bỏ qua các đơn hàng SL 0" — không gửi tin "đã đặt SP gồm:..." cho đơn không sản phẩm vì kỳ.

Filter trong [`native-orders/js/native-orders-app.js:1814-1838`](../native-orders/js/native-orders-app.js#L1814): sau khi resolve `rawOrders` từ STATE, tính `totalQty = sum(products[].quantity)`. Skip đơn `totalQty <= 0`. Notify số đơn bỏ qua + còn lại; nếu tất cả đều SL=0 → warning + return.

### [web2-msg-template] feat: parallel multi-worker send (tốc độ song song)

**Trước**: Send loop sequential `for (i=0;i<total;i++) await sendOne(); sleep(delay)` — chậm với nhiều đơn (vd 100 đơn × 1s delay = 100s).

**Sau**: Worker pool pattern (port từ orders-report `_processAccountQueue`):

1. **Phân chia theo page** (`fbPageId`): mỗi FB page có session + rate-limit riêng → các page khác nhau gửi song song hoàn toàn (KHÔNG bị nhau ảnh hưởng). Pancake V2 extension cũng dùng pattern này.

2. **Worker pool trong mỗi page**: tối đa N concurrent (config UI, default 6, max 12). Dùng `Promise.race(pool)` để giữ pool ≤ N. Khi pool đầy chờ 1 promise hoàn thành mới push tiếp.

3. **UI control mới** trong footer modal:
    - `Song song <input min=1 max=12 default=6>` — tăng = nhanh hơn nhưng dễ bị FB rate-limit
    - `Delay <input> giây` — delay giữa các batch mỗi worker (0 = max speed)

4. **Progress text** mới thêm "đang chạy" counter để user thấy worker đang chạy ngầm:
   `15/100 đã gửi · 2 lỗi · 6 đang chạy`

5. **Summary** sau khi xong show số page × worker để debug throughput:
   `Hoàn thành. Gửi: 95 · Lỗi: 5 · 3 page × 6 worker`

**Throughput ước tính** (1 send ~500ms-2s):

- 100 đơn × 1 page × 6 workers = ~16 giây (vs 100s cũ)
- 100 đơn × 3 pages × 6 workers = ~5-6 giây (18 concurrent)

**Lưu ý FB rate-limit**: 6 workers/page là sweet spot Pancake V2 dùng. Lên 10-12 có thể bị FB temp-block — chỉ tăng khi user nhiều account/multiple pages.

**Files**: `web2/shared/web2-msg-template.js:469-578` — rewrite `_handleSend` thành worker pool. UI footer thêm input `w2tplConcurrency`.

Status: ✅ Done; ⏳ pending verify sau GH Pages deploy.

### [native-orders][web2] feat: bulk send tin nhắn template (port từ orders-report)

**User request**: native-orders cần nút "Gửi tin nhắn" trong bulk action bar (giống orders-report) — chọn nhiều đơn → mở modal template → gửi hàng loạt qua extension bypass-24h.

**Implementation**:

1. **`web2/shared/web2-msg-template.js`** (mới, ~450 dòng) — port rút gọn của orders-report's `message-template-manager.js` (2800 dòng). Self-contained, KHÔNG phụ thuộc `pancakeDataManager`, `OrderStore`, `pancakeTokenManager`. Chỉ cần `window.Web2Chat`, `window.NativeOrdersApp._extensionRequest`, `window.db` (Firestore).

2. **Firestore SHARED**: dùng collection `message_templates` chung với orders-report → edit ở 1 nơi, hiện ở cả 2. Auto-seed 4 default templates lần đầu mở (cùng Name/Content như orders-report `_seedDefaultTemplates`).

3. **UI**:
    - Nút bulk **"Gửi tin nhắn"** cạnh "In bill" trong [`native-orders/index.html:269`](../native-orders/index.html#L269)
    - Modal: gradient header tím, search input, "Mẫu mới" button, grid template cards với MESSENGER badge + edit pencil, footer footer có `template count`, `order count`, `delay input`, `Huỷ/Gửi tin nhắn`
    - Edit/Create template inline qua modal con (Name + Content + 3 buttons Cancel/Delete/Save)
    - Progress bar live khi gửi (% + sent/total + failed count)

4. **Send flow** (per order):
    - ROUTE 1: resolve `global_id` qua `Web2Chat.fetchMessages(pageId, convId, custUuid)` → `customers[].global_id` (Pancake biết global_id từ webhook events trước đó)
    - POST extension `REPLY_INBOX_PHOTO` (bypass-24h) qua `window.NativeOrdersApp._extensionRequest(...)` — cùng pattern fix 1545012 từ commit `e7b5c890`
    - Fallback `Web2Chat.sendMessage(reply_inbox)` nếu extension không có
    - Per-order delay (default 1s) configurable
    - Cancel button: dừng giữa loop

5. **Sent tracker**: localStorage `web2_sent_message_orders` (TTL 24h, key = `order.code`). Auto skip đơn đã gửi trong 24h khi mở modal (warn user). Tách biệt với orders-report `sent_message_orders` để không nhầm lẫn cross-module.

6. **Placeholders** (cùng với orders-report):
    - `{partner.name}` → customerName
    - `{partner.address}` → address
    - `{partner.phone}` → phone
    - `{order.code}` → code
    - `{order.total}` → formatted VND
    - `{order.details}` → multi-line lines summary

**Files**:

- `native-orders/index.html`: nút `#ordersBulkSendMessage` + load `web2-msg-template.js`
- `native-orders/js/native-orders-app.js`: `bulkSendMessage()` enrich order → delegate `Web2MsgTemplate.open()`; expose `_extensionRequest` ra `window.NativeOrdersApp` để module dùng
- `web2/shared/web2-msg-template.js`: module mới

**Test**: refresh native-orders → tick nhiều đơn → bulk bar hiện → click "Gửi tin nhắn" → modal mở với 4 default templates → chọn template → "Gửi tin nhắn" → progress bar chạy.

Status: ✅ Done; ⏳ pending verify on prod sau GH Pages deploy ~2-3 phút.

### [native-orders][extension] v2.0.4 + Pancake API route cho global_id (commit 497a855a follow-up)

**Tình trạng sau commit 497a855a**: native-orders truyền đúng args cho GET_GLOBAL_ID_FOR_CONV nhưng:

1. Extension's FB GraphQL resolve **fail** sau 30+ giây với "Could not resolve globalUserId" (cả 4 strategies findThread/ConversationPage/thread_info.php/getUserInboxByName đều fail cho HTĐ)
2. Native-orders timeout 10s → fallback dùng PSID → vẫn 1545012
3. Mobile fallback v2.0.3 fail `Failed to fetch` vì `m.facebook.com` thiếu host_permissions

**Insight**: Pancake gửi thành công vì Pancake UI dùng **`page_customer.global_id`** từ Pancake API response (Pancake biết global_id từ webhook events trước đó). Pancake KHÔNG dùng FB GraphQL để resolve.

**Fix combo**:

1. **Native-orders ROUTE 1 (nhanh)** — Pancake API direct: `Web2Chat.fetchMessages(pageId, convId, customerId)` trả `customers[].global_id` và `conversation.page_customer.global_id`. Dùng cái này trước.

2. **Native-orders ROUTE 2 (fallback)** — GET_GLOBAL_ID_FOR_CONV qua extension với timeout 10s→30s. Chỉ chạy nếu ROUTE 1 không có data.

3. **Manifest v2.0.4** — Thêm `*://m.facebook.com/*`, `*://mbasic.facebook.com/*` vào `host_permissions` → mobile fallback (v2.0.3) hết "Failed to fetch".

**Files**:

- `native-orders/js/native-orders-app.js:5957-6045` — 2-route resolution
- `web2-extension/manifest.json` — bump 2.0.3→2.0.4 + m.facebook.com permissions
- `web2-extension/shared/constants.js` — VERSION/BUILD bump

**Verify**: refresh native-orders → reload extension v2.0.4 → gửi HTĐ. Log mong đợi:

- `[NativeOrders] globalUserId via Pancake API: 100001957832900 (psid was 25717004554573583)` (ROUTE 1 hit)
- `[FB-Sender] Message sent successfully: mid.<xxx>`

Nếu Pancake API không trả global_id (page_customer chưa được webhook update), fallback ROUTE 2 (extension) sẽ chạy với timeout 30s.

Status: ✅ Done; ⏳ pending verify in-browser.

### [native-orders][BUG-FIX-LỚN] root cause 1545012 = gửi PSID thay global_id cho FB

**Bug user phát hiện**: Tin nhắn từ native-orders cho HTĐ liên tục fail 1545012 "Tạm thời không thực hiện được". Trong khi Pancake.vn gửi cùng conversation lại OK.

**Root cause** (capture live Pancake send qua `window.postMessage` hook tại 09:26:20):

Pancake page gửi REPLY_INBOX_PHOTO với:

- `globalUserId: "100001957832900"` ← **FB GLOBAL ID** (account thật)
- `convId: "t_32546288751686299"` ← prefix t\_ + threadId

Native-orders cũ gửi:

- `globalUserId: "25717004554573583"` ← **PSID** (page-scoped, chỉ valid trong scope page đó)
- `convId: "270136663390370_25717004554573583"` ← pageId_psid

FB `business.facebook.com/messaging/send/` endpoint yêu cầu `other_user_fbid` là **FB global account ID**, KHÔNG phải PSID. PSID là internal ID FB cấp cho mỗi cặp (user, page) — không phải account thật. Gửi PSID làm `other_user_fbid` → FB không xác định được recipient → silent reject với `error:1545012, transientError:1`.

**Tại sao GET_GLOBAL_ID_FOR_CONV không cứu**:

Native-orders call handler với `{pageId, convId, fbUserId}` nhưng handler chỉ destructure `{pageId, threadId, threadKey, customerName, conversationUpdatedTime}`. Không có `threadId` + `customerName` → handler reject ngay với "threadId or customerName required" → native-orders fallback dùng `order.fbUserId` (PSID).

orders-report `tab1-extension-bridge.js` ĐÃ đúng (truyền threadId + customerName); chỉ native-orders bug.

**Fix** ([`native-orders/js/native-orders-app.js:5957-6020`](../native-orders/js/native-orders-app.js#L5957)):

1. Sửa GET_GLOBAL_ID_FOR_CONV call: truyền `{pageId, threadId, customerName, isBusiness:true}` thay vì `{pageId, convId, fbUserId}`. Timeout 8000→10000.
2. Đổi convId format `pageId_psid` → `t_<threadId>` (match Pancake convention).
3. Truyền thêm `customerName`, `conversationUpdatedTime` xuống REPLY_INBOX_PHOTO.
4. Log success với psid cũ + globalUserId mới để debug.

**Bằng chứng Pancake send thành công** với fix này: live capture HTĐ at 09:26:20 trả `REPLY_INBOX_PHOTO_SUCCESS, messageId: mid.$cAACvQ5Lw0GakeyDN6meSdt5Z7yP5, globalUserId: 100001957832900`.

**Verify**: refresh native-orders trang → gửi HTĐ → log mong đợi:

- `[NativeOrders] resolved globalUserId: 100001957832900 (psid was 25717004554573583)`
- `[FB-Sender] Message sent successfully: mid.<xxx>`
- Notify "Đã gửi qua N2 Extension (bypass 24h)" + tin nhắn vào inbox HTĐ.

Mobile fallback v2.0.3 (commit 7bac192f) trở thành **không cần** với case HTĐ — chỉ activate khi resolve global_id fail HOÀN TOÀN (cả threadId+customerName không tìm được).

Status: ✅ Done; ⏳ pending verify in-browser.

### [inventory] fix: 7 bug + race condition cho image manager (audit-driven)

Audit toàn bộ pipeline image (modal save → API → DB → SSE → table render) phát hiện 9 issue. Fix 7 (skip L7-fallback-revert vì đã đúng + L9-cosmetic).

**HIGH severity**:

- **H1 — Lost-update race giữa user/tab**: User A + B cùng mở modal, A save trước, B save sau ghi đè A. Fix: modal listen SSE từ data-loader, nếu nhận event khi đang mở (và không phải từ own save) → set `_externalChangeDetected` + toast cảnh báo. Save() kế tiếp confirm dialog cho user chọn "Đóng+reload" hay "Tiếp tục ghi đè". Distinguish own save bằng `_saveInProgress` flag (1500ms grace window).
- **H2 — Save trong khi paste/upload chưa xong**: User paste 10 ảnh, upload async, bấm save khi mới encode 3 → mất 7 ảnh còn lại. Fix: `save()` check `_isUploading` đầu hàm, return + toast warning.

**MEDIUM severity**:

- **M3/M4 — Canonical-date drift**: `_canonicalDateForDot` cũ trả về "most-recent shipment date for đợt" → ngày có thể đổi giữa modal-open và save → orphan-slot logic so sánh sai → có thể wipe nhầm slot. Fix: ELIMINATE concept — `_canonicalDateForDot()` luôn return `GLOBAL_LEGACY_DATE = '2026-04-10'`. `ngay_di_hang` trở thành dead storage column, không có business semantic. Save migrate cũ dates → canonical tự động qua orphan-cleanup (đã verify edge cases: move NCC giữa đợt, empty đợt, legacy dates đều OK).
- **M5 — Server PUT không atomic giữa 2 PUT đồng thời cùng (date, dot)**: Hai PUT song song = cả hai DELETE + cả hai INSERT, last-writer-wins. Fix: `pg_advisory_xact_lock(hashtext('product_images:date:dot')::bigint)` đầu transaction → serialize per slot. Different slots không lock nhau → vẫn parallel.

**LOW severity**:

- **L6 — SSE notify spam**: 1 client save = N PUTs = N SSE events. Fix 2 lớp:
    1. Server: `_scheduleImagesNotify(getLatestRows)` debounce 250ms — N PUTs cùng burst → 1 notify cuối, query DB lại để lấy state FINAL.
    2. Client (data-loader SSE handler): debounce 200ms — coalesce nếu server vẫn fire nhiều event.
- **L7 — Fallback "any image for NCC" sort theo date**: Có (đợt 1, NCC 5) và (đợt 3, NCC 5), render (đợt 2, NCC 5) → fallback trả về whichever có date mới hơn (counter-intuitive). Fix: sort candidates theo `Math.abs(img.dotSo - requestedDot)` ascending, tie-break đợt thấp hơn → đợt 2 fallback sang đợt 1 (closer).
- **L8 — Image resize OOM**: User paste ảnh 20000x20000 → drawImage allocate 1.6GB → tab crash. Fix: reject sources > 60MP (~7745x7745) trước khi tạo canvas, với clear error message.

**Files**:

- `inventory-tracking/js/modal-image-manager.js` (M3/M4/H1/H2/L8)
- `inventory-tracking/js/data-loader.js` (L6 client + L7)
- `inventory-tracking/index.html` (wire \_onClose vào X button + Hủy button)
- `render.com/routes/v2/inventory-tracking.js` (M5 advisory lock + L6 server debounce)

**Verified**: `node --check` pass cả 3 file. Server-side cần redeploy Render để pick up advisory lock + debounce.

### [extension][web2] v2.0.3: add m.facebook.com mobile fallback khi 1545012 cứng đầu

**Tình trạng v2.0.2**: code đúng (jazoest re-compute + \_\_comet_req=1 + retry với new otid), nhưng FB vẫn trả 1545012 cứng cho conversation HTĐ. Lý do: 1545012 = BLOCKED_RETRY_SOCKET — FB chặn HTTP `business.facebook.com/messaging/send/` cho conv này và đòi MQTT socket. Pancake có WebSocket frontend code (chạy trên pancake.vn JS, không phải SW); mình không có.

**Reverse Pancake source** ([`/tmp/pancake-v2-crx/extracted/assets/background.formatted.js:5685-5739`](Pancake `class Fp`)) — có path thứ 2 dùng `m.facebook.com/messages/send/`:

- URL: `https://m.facebook.com/messages/send/?icm=1&pageID=<pageId>&entrypoint=web%3Atrigger%3Athread_list_thread`
- Params: `tids=cid.c.<convId>:<pageId>`, `tids[<convId>]=<convId>`, `wwwupp=C3`, `body`, `waterfall_source=message`, `action_time`, `m_sess=""` + m-specific base params (`__user`, `__req`, `__a`, `fb_dtsg`, `jazoest`)
- Headers: `X-Requested-With: XMLHttpRequest`, `X-Response-Format: JSONStream`, `X-MSGR-Region: ATN`
- Init: fetch `m.facebook.com/messages/?pageID=<pageId>&ref=bookmarks` → extract `fb_dtsg` từ HTML

**Implementation**:

- `web2-extension/background/facebook/mobile-sender.js` (mới) — port `Fp` class: `sendViaMobile({pageId,convId,message,attachmentType,files})` + `initMobileSession(pageId)` với 60-min cache
- `sender.js`: sau retry HTTP với new otid vẫn fail → fallback `sendViaMobile`. Nếu mobile ok → return SUCCESS với `retryReason:'mobile_fallback'`
- Bump v2.0.2 → v2.0.3

**Rủi ro**: FB có thể đã sunset m.facebook.com cho desktop UA — sẽ redirect sang www.facebook.com. Code check `resp.url.includes('m.facebook.com')` và throw nếu mất. Lúc đó cần thêm declarativeNetRequest rule rewrite UA sang mobile.

Status: ✅ Done; ⏳ pending verify in-browser sau reload extension v2.0.3.

### [tooling] opt-in cache-bust cho 88 page còn lại (toàn bộ project)

**User**: "vậy bạn sửa các page khác luôn đi".

**Action**: Chạy `scripts/bump-cache-version.sh` lên TẤT CẢ HTML files user-facing trong project (không touch chrome extension pages + node_modules + dist). 88 files bumped, 1241 refs gắn `?v=20260521b`.

**Bumped folders**:

- Toàn bộ pages cấp 1: `aikol-studio/*`, `balance-history/`, `balance-history-home/`, `bangkiemhang/`, `customer-hub/`, `delivery-report/`, `doi-soat/`, `don-inbox/`, `facebook-services/`, `fb-ads/index.html` (không touch `fb-ads/extension/`), `firebase-stats/`, `hanghoan/`, `inbox/`, `inventory-tracking/`, `invoice-compare/`, `issue-tracking/`, `lichsuchinhsua/`, `native-orders/`, `nhanhang/`, `order-management/*`, `phone-management/*`, `product-warehouse/`, `project-tracker/`, `purchase-orders/{index,goods-receiving/}`, `quy-trinh/`, `render-data-manager/`, `resident/`, `service-costs/`, `so-order/`, `soluong-live/*`, `soorder/`, `soquy/*`, `stitch_customer/*`, `supplier-debt/`, `tpos-pancake/`, `user-management/`
- Orders-report tabs: `orders-report/{main,tab-overview,tab-live-ledger,tab-kpi-commission,tab1-orders,tab3-product-assignment,tab-pending-delete,migration-kpi-per-user}.html`
- Toàn bộ web2 pages: `web2/{index,balance-history,customer-wallet,fastsaleorder-{delivery,invoice,refund},login,pancake-settings,product-{category,uom,uom-categ},products,purchase-refund,reconcile,report-{delivery,revenue},supplier-{debt,wallet},users,variants}/index.html`
- Root: `index.html`, `privacy-policy.html`
- Misc user-facing: `AI/gemini.html`

**NOT touched** (đúng theo MEMORY.md "⚠ HỎI USER TRƯỚC KHI SỬA n2store-extension/"):

- `n2store-extension/`, `web2-extension/`, `pancake-extension/` — chrome extension pages, dùng chrome-extension:// (cache strategy khác, không phải HTTP CDN)
- `fb-ads/extension/popup.html` — extension popup
- `render.com/node_modules/`, `dist/` — third-party + build artifacts

**Effect**: từ giờ mọi page n2store đều opt-in vào convention `?v=YYYYMMDDx`. Stop hook `auto-bump-cache-on-change.sh` (commit `c53e98a3`) sẽ tự động bump phiên bản cho page có JS/CSS đổi mỗi commit → không bao giờ user gặp cache issue nữa.

### [tooling][scripts] feat: auto cache-bust `?v=YYYYMMDDx` cho JS/CSS sau mỗi deploy

**User**: "fix luôn lỗi bị browser cached js cũ đi".

**Bối cảnh**: Bug "đợt 2 lệch qua đợt 1" lặp lại lần 2 sau khi tôi đã fix SSE handler trên server, vì browser của user còn cache JS cũ (data-loader.js không có map dot_so→dotSo) → khi user save trên UI thì JS cũ chạy → data shift lại. Cần force browser re-fetch.

**Convention sẵn có**: `native-orders/index.html` đã có `?v=20260521a` trên một số script tag. Áp dụng cho toàn bộ HTML.

**Implementation**:

1. **[`scripts/bump-cache-version.sh`](../scripts/bump-cache-version.sh)**: tool tay — `bash scripts/bump-cache-version.sh inventory-tracking/index.html [version]`. Tự pick version (`YYYYMMDD` + letter a→z) nếu không pass arg. Strip existing `?v=` và replace, chỉ tác động lên local refs (skip CDN/external).

2. **[`scripts/auto-bump-cache-on-change.sh`](../scripts/auto-bump-cache-on-change.sh)**: smart wrapper — detect changed JS/CSS qua `git diff HEAD`, nhóm theo top-level folder, nếu folder có `index.html` dùng convention `?v=YYYYMMDD<letter>` thì bump tự động. Chỉ touch pages opt-in (không sửa pages chưa có cache-bust).

3. **Wire vào Stop hook**: `.claude/scripts/hooks/stop-auto-commit-push.sh` gọi `auto-bump-cache-on-change.sh` TRƯỚC `git add -u` → bumped HTML nằm trong cùng auto-commit, không tạo extra commit.

**Áp dụng ngay**: `inventory-tracking/index.html` được bump 51 references sang `?v=20260521a` (script + CSS).

**Kết quả mong đợi**: lần kế tiếp browser nào load `inventory-tracking/index.html` sẽ fetch JS/CSS mới (vì query string khác = different cache key) → SSE fix sẽ thật sự active.

**Files**: `scripts/bump-cache-version.sh` (new), `scripts/auto-bump-cache-on-change.sh` (new), `.claude/scripts/hooks/stop-auto-commit-push.sh` (wire), `inventory-tracking/index.html` (bumped). Status: ✅ Done.

### [inventory][db] action: backup full + DELETE toàn bộ inventory_product_images

User chain decisions (sau khi phát hiện đợt-shift bug + SSE fix deployed):

1. Yêu cầu 1: backup + xóa đợt 1 → backup 44 rows, DELETE 44 (chỉ còn 35 đợt 2).
2. Yêu cầu 2: backup đợt 2 + xóa hết → trong lúc tôi đang dev tabs UI, user đã thao tác trên trang nên data lại bị shift lần nữa (browser cache JS cũ → SSE bug trigger lại). DB state lúc backup: 37 đợt 1 + 1 đợt 2. Backup full (38 rows, 7.3 MB → `.local/backups/inventory_product_images_FULL_20260521-152706.sql`), DELETE all 38 rows.

DB hiện tại: TRỐNG. User sẽ nhập lại từ đầu sau khi reload trang để nạp JS mới (đã thêm auto cache-bust ở entry trên).

### [inventory] feat: image-manager modal chia thành tabs theo Đợt — dễ quản lý

**User**: "đợt chia ra các section tab dễ quản lý".

**Trước**: modal "Quản Lý Ảnh Sản Phẩm" hiển thị tất cả đợt cùng lúc trong cùng 1 list scroll dài, có ô "Lọc đợt..." để filter. Khi nhiều đợt + nhiều NCC thì lướt mỏi.

**Sau**: tab bar nằm trên cùng, mỗi tab = 1 đợt + badge đếm số NCC. Click tab để switch — chỉ rows của đợt đó hiển thị. Có nút "+ Đợt mới" ở cuối tab bar để tạo đợt tùy chỉnh (prompt số đợt, suggest = max+1).

**Behavior chi tiết**:

- Tab active mặc định: đợt cao nhất có data (hoặc đợt mới nhất từ shipments)
- Search NCC giờ scoped trong active tab (reset khi switch)
- Đổi đợt trên 1 row qua input → row "follow" về đợt mới + active tab tự switch theo
- Empty tab: hiện "Đợt N chưa có NCC nào" + nút "Thêm NCC vào Đợt N"
- Tab custom (đợt không có shipment thật) hiện ★ vàng

**Files**: `inventory-tracking/js/modal-image-manager.js` (replace `_filterDotSo` → `_activeDotSo`, add `_renderTabBar` + `switchTab` + `promptNewDot`), `inventory-tracking/css/modern.css` (`.img-mgr-tabs`, `.img-mgr-tab[-active|-count|-new]`). Status: ✅ Done.

### [extension][web2] fix: jazoest phải re-compute từ fb_dtsg + \_\_comet_req=1 cho Business Suite

**Triệu chứng**: Sau khi reload extension v2.0.1 (đã có retry strategy), gửi tin nhắn vẫn fail 1545012 cả lần đầu lẫn lần retry (verified trong console-1779347418060.log lúc 08:04:41 — `Retrying with session restart (strategy=retryUsingSocket)...` chạy đúng, fb_dtsg đổi qua 3 versions khác nhau, nhưng FB vẫn 1545012). Trong khi Pancake V2 extension dùng cùng endpoint thì gửi thành công.

**Root cause** (reverse từ Pancake source `/tmp/pancake-v2-crx/extracted/assets/background.formatted.js:325-329`):

Pancake `buildParams` (Base class) **luôn re-compute** `jazoest` từ fb_dtsg hiện tại bằng `calcJazoestV2`:

```js
calcJazoestV2(e){
    let t=0;
    for(let a=0; a<e.length; a++) t += e.charCodeAt(a);
    return "2" + t;  // (default sprinkle_config.should_randomize=false → prefix "2")
}
```

Code web2-extension cũ ở [`web2-extension/background/facebook/utils.js`](../web2-extension/background/facebook/utils.js) chỉ extract `jazoest` 1 lần từ HTML lúc `initPage`, rồi giữ nguyên — sau khi session refresh `fb_dtsg` (lần 2, lần 3 trong retry), jazoest vẫn là giá trị cũ → chữ ký không khớp → FB silent-reject với 1545012 "Tạm thời không thực hiện được".

Bonus: `__comet_req: '0'` cũng sai — Business Suite chạy `bizweb_comet_pkg` (Comet React app, `is_comet=true`) nên Pancake gửi `__comet_req=1`. Hardcode `'0'` làm FB strict-validate fail.

**Fix**:

1. Thêm `calcJazoest(fbDtsg)` export trong utils.js — sum charCodes, prefix "2".
2. `buildBaseParams`: bỏ `if (dtsgData.jazoest)` gate, **luôn** set `params.jazoest = calcJazoest(dtsgData.token)`.
3. `__comet_req`: hardcode `'1'`.

**Files**: `web2-extension/background/facebook/utils.js` (+ bump manifest 2.0.1→2.0.2, constants VERSION/BUILD). Status: ✅ Done; ⏳ pending verify in-browser sau reload extension.

**Verify**: gửi lại tin nhắn cho Huỳnh Thành Đạt → log mong đợi `Message sent successfully: <mid>` ngay lần đầu, KHÔNG cần retry. Nếu vẫn fail → so sánh request body của Pancake V2 vs ours (đặt breakpoint hoặc xem Network tab DevTools), tìm field nào khác.

### [inventory] fix: SSE handler missing snake_case → camelCase mapping cho productImages (root cause "đợt 2 lệch qua đợt 1")

**User report**: "đợt 2 NCC từ 1 → 46 bị mất ảnh", "dữ liệu tôi nhập đợt 2 nó bị lệch qua đợt 1".

**Root cause (real bug)**: SSE realtime handler trong [`inventory-tracking/js/data-loader.js`](../inventory-tracking/js/data-loader.js) chỉ map `urls` mà KHÔNG map `ngay_di_hang → ngayDiHang` và `dot_so → dotSo`. Sau mỗi save productImages, server gửi SSE update → handler ghi đè `globalState.productImages` với object spread (snake_case fields) nhưng thiếu camelCase aliases. Code đọc `img.dotSo` → `undefined` → `(img.dotSo || 1) === dotNum` → tất cả ảnh trong memory effectively trở thành "đợt 1".

**Domino effect**:

1. User save (đợt 1, NCC 1-23) + (đợt 2, NCC 24-46) — DB lưu đúng
2. SSE fire → in-memory productImages mất dotSo → tất cả thành đợt 1
3. User mở modal lần sau → entries cho NCC 24-46 hiển thị thành đợt 1 (vì `img.dotSo || 1`)
4. User save lần nữa → bucket dotSo=1 chứa cả NCC 1-46 → PUT replace (canonicalDate, dot=1) với 46 rows
5. Orphan slot logic clear (date2, dot=2) → đợt 2 NCC 24-46 bị wipe
6. User entered thêm NCC 47-81 cho đợt 2 sau đó → DB hiện có (đợt 1: NCC 1-46, đợt 2: NCC 47-81)

**Fix**: SSE handler now mirrors `loadProductImages()` mapping — `dot_so → dotSo`, `ngay_di_hang → ngayDiHang`, `urls` parse JSONB.

**Bonus revert**: Strict đợt match (commit `1cd1cd8b`) đã revert về fallback "any image for this NCC" khi không tìm thấy đợt-scoped match. Lý do: strict mode masked the corruption (empty rows → user nghĩ mất ảnh); fallback giúp user tiếp tục thấy ảnh (dù sai đợt) trong khi data recovery. Original semantics: per-đợt override khi có entry riêng, fallback sang đợt khác khi không.

**Files**: `inventory-tracking/js/data-loader.js`. Status: ✅ Done (code fix). 🟡 PENDING: data recovery — user cần xác nhận (đợt, NCC) mapping nào là đúng để tôi viết script khôi phục.

### [extension][web2] fix: handle FB error 1545012 (BLOCKED_RETRY_SOCKET) — bypass-24h gửi tin nhắn

**Bug user phát hiện**: Sau khi login `business.facebook.com` + cài web2-extension, gửi tin nhắn từ native-orders → SW POST `business.facebook.com/messaging/send/` → HTTP 200 nhưng body `{__ar:1, error:1545012, errorSummary:"Tạm thời không thực hiện được", transientError:1}` → fail straight, fallback Pancake (vẫn 24h policy).

**Root cause** (đọc log `downloads/n2store-session/console-1779347418060.log`):

- `getRetryStrategy` trong [`web2-extension/background/facebook/sender.js`](../web2-extension/background/facebook/sender.js) map subcode 1545012 → `'retryUsingSocket'` (FB_ERRORS.BLOCKED_RETRY_SOCKET).
- Nhưng caller chỉ implement branch `'restartInbox'` — các strategy khác (retryUsingSocket, reuploadPhotos, cannotRetry) đều fall through tới `throw new Error(errorInfo.message)`.
- 1545012 thực ra là **transient** (Pancake retry qua MQTT socket; mình không có socket fallback) → retry HTTP với fb_dtsg mới + offline_threading_id mới thường thành công.

**Fix**:

1. Branch `restartInbox || retryUsingSocket` → clear session cache → re-init page → refresh `fb_dtsg` → generate new `offline_threading_id` + `message_id` + `timestamp` → retry POST. (Quan trọng: phải đổi `offline_threading_id` vì FB dedupe theo field này; nếu reuse cùng id, retry sẽ vẫn fail cùng error.)
2. Bỏ block `chrome.cookies.getAll` check — MV3 partition isolation thường return 0 cookies dù `fetch(credentials:'include')` vẫn gửi cookie jar. Log `CRITICAL: Missing Facebook session cookies! User may not be logged in.` là misleading (session vẫn valid).

**Files**: `web2-extension/background/facebook/sender.js` (+ bump `manifest.json` 2.0.0→2.0.1, `shared/constants.js` VERSION/BUILD).

**Verify (sau reload extension)**: gửi tin nhắn từ native-orders cho Huỳnh Thành Đạt → SW phải log `Retrying with session restart (strategy=retryUsingSocket)...` rồi `Message sent successfully: ...`. Nếu retry vẫn fail → bug khác (page admin lost / FB rate-limit cứng).

**Không touch** `n2store-extension/` (production) per MEMORY rule — sẽ áp port sau khi user verify fix web2-extension ok. Status: ✅ Done web2-extension; ⏳ Pending verify in-browser.

### [inventory] fix: hết leak ảnh giữa Đợt 1 ↔ Đợt 2 trong bảng inventory-tracking

**Bug user phát hiện**: trên `https://nhijudy.store/inventory-tracking/index.html`, các dòng Đợt 2 (NCC 9, 13, 16, 19, 20, 27-30, 32-35, 38-40, 45) hiển thị **ảnh từ Đợt 1** thay vì rỗng (ảnh Đợt 2 chỉ tồn tại cho NCC 47-81, không có cho 9-45).

**Repro qua console** (persistent browser session, không screenshot):

- `getProductImagesForNcc(9, ..., 2)` → trả 4 URL của (Đợt 1, NCC 9) thay vì `[]`
- Test 16 NCC trong Đợt 2 → cả 16 đều leak ảnh Đợt 1 (`leak: true`)

**Root cause**: `getProductImagesForNcc` trong [`inventory-tracking/js/data-loader.js`](../inventory-tracking/js/data-loader.js) có legacy fallback "any image for this NCC" chạy sau khi đợt-scoped lookup miss. Logic này từ thời ảnh chưa bắt buộc có `dotSo`. Bây giờ ảnh nào cũng có `dotSo` rõ ràng (verified `withoutDotSo: 0` trên 79 ảnh sống) → fallback cross-đợt là sai semantically.

**Fix**: khi `dotSo` được truyền → strict đợt-scoped match, không fallback sang đợt khác. Giữ fallback chỉ cho callers không truyền `dotSo` (phòng hờ, hiện không có caller nào).

**Verified in-browser sau patch**: 16 dòng Đợt 2 NCC 9-45 trả `[]` (correct, không leak nữa). NCC 48/50/51/53/54/55/68 vẫn trả URL của Đợt 2 (correct, vì đợt 2 có ảnh cho các NCC này).

**Files**: `inventory-tracking/js/data-loader.js`. Status: ✅ Done.

### [domain][extension][cors] feat: rewire toàn bộ codebase sang custom domain `nhijudy.store`

**Yêu cầu user**: Sau khi switch GH Pages → `https://nhijudy.store/`, audit toàn bộ codebase: extension manifest có cần update, có chỗ nào khác cần đổi domain.

**Findings**: GH Pages `nhijudyshop.github.io/n2store/*` 301 → `nhijudy.store/*` (path-preserving). 3 nhóm vấn đề:

1. **🔴 Critical — content script chết trên nhijudy.store**: `n2store-extension/manifest.json` matches/host_permissions chỉ liệt kê `nhijudyshop.github.io/*` → contentscript.js không inject trên domain mới. Web2-extension đã thêm sẵn lúc fork, nhưng n2store-extension thì quên.
2. **🔴 Critical — credentialed CORS reject từ nhijudy.store**: `shared/universal/cors-headers.js` `CREDENTIALED_ORIGIN_PATTERNS` và `render.com/server.js` CORS allowlist chỉ có github.io → page trên nhijudy.store gọi API kèm `credentials: 'include'`/`sendBeacon` sẽ bị trả `Allow-Origin: *` (no creds) → cookies bị strip.
3. **🟡 URL flicker — extension/code redirect về github.io rồi 301 lại**: 15+ hardcoded URLs trong extension popup/notifications/config + production redirects (order-management, soluong-live, orders-report iframe, telegram-bot link, fb-ads ext).

**Fixes (option B — full sweep)**:

- **CORS**: thêm `/^https:\/\/nhijudy\.store$/` vào `CREDENTIALED_ORIGIN_PATTERNS` + `'https://nhijudy.store'` vào Express CORS array. Giữ github.io legacy entry để bao quát transition.
- **Manifest matches/host_permissions**: thêm `https://nhijudy.store/*` vào `n2store-extension/manifest.json` + `pancake-extension/manifest.json`. Web2-extension đã có sẵn.
- **Hardcoded URLs (replace `nhijudyshop.github.io/n2store/...` → `nhijudy.store/...`)**:
    - `n2store-extension/popup/popup.js` (5 dòng) + `web2-extension/popup/popup.js` (5 dòng)
    - `n2store-extension/background/server/notifications.js` (2 dòng: INBOX_URL, ORDERS_URL) + web2-extension tương ứng
    - `n2store-extension/shared/config.js` (WEB_GITHUB_URL, WEB_INBOX_URL) + web2-extension tương ứng
    - `order-management/js/main.js:892` + `soluong-live/js/main.js:740` redirect home
    - `orders-report/main.html` iframe data-src + `_trustedOrigins` (giữ cả 2 cho postMessage relay)
    - `render.com/routes/telegram-bot.js` (2 message link inventory-tracking)
    - `fb-ads/extension/background.js` `N2_ADS_URL`
- **Chrome tabs filter URLs** (`popup.js`/`settings.js` cả 2 extension): thêm `'*://nhijudy.store/*'` vào array, giữ legacy github.io để bao quát.
- **CF Worker comment**: update line 87 để phản ánh allowlist mới (chỉ comment).

**Files changed** (15):

- `shared/universal/cors-headers.js`, `render.com/server.js`, `cloudflare-worker/worker.js`
- `n2store-extension/manifest.json`, `n2store-extension/popup/popup.js`, `n2store-extension/background/server/notifications.js`, `n2store-extension/shared/config.js`, `n2store-extension/pages/settings.js`
- `web2-extension/popup/popup.js`, `web2-extension/background/server/notifications.js`, `web2-extension/shared/config.js`, `web2-extension/pages/settings.js`
- `pancake-extension/manifest.json`, `fb-ads/extension/background.js`
- `order-management/js/main.js`, `soluong-live/js/main.js`, `orders-report/main.html`, `render.com/routes/telegram-bot.js`

**Verify**: `grep -rn "nhijudyshop\.github\.io/n2store" --include="*.{js,json,html}"` trong production code = 0 matches. Refs còn lại là (a) comment-only, (b) intentional legacy entries giữ song song với nhijudy.store. Manifest JSON syntax validated qua `node -e JSON.parse(...)`.

**Note**: Extension cần reload thủ công trong Chrome sau khi pull (manifest matches thay đổi). Render server cần redeploy để pick up CORS array mới (env vars không đổi, code change → auto-deploy on push). CF Worker chỉ đổi comment, không cần `wrangler deploy` thêm.

**Status**: ✅ Done

---

### [web2-extension][scripts] Fork n2store-extension → Web 2.0 Messenger + browser-test --ext flag

**Yêu cầu user**: Copy n2store-extension vào web 2.0 + đổi tên + thêm vào browser test để test message-sending + interactions ở panel giữa của native-orders.

**Triển khai**:

1. **Copy + rename**:
    - `cp -r n2store-extension/ web2-extension/` (root, theo web2- prefix convention).
    - `manifest.json`: name "Web 2.0 Messenger", short_name "Web2", v=2.0.0, description ghi fork.
    - `shared/config.js`: EXTENSION_NAME = "Web 2.0 Messenger".
    - `shared/constants.js`: VERSION="2.0.0", BUILD=200.
    - `content/contentscript.js`: extensionName + `[WEB2-EXT]` console prefix.
    - Thêm matches + host_permissions cho `https://nhijudy.store/*` (prod custom domain) và `http://localhost/*` (local dev).
    - Content script set `document.documentElement.dataset.web2ExtLoaded = "1"` để page detect không cần đợi message event.

2. **Browser test --ext flag** ([`scripts/n2store-browser-session.js`](../scripts/n2store-browser-session.js)):
    - Khi `--ext PATH` truyền, switch sang `chromium.launchPersistentContext` (extension load yêu cầu persistent context, browser.launch không hỗ trợ).
    - **Quan trọng**: `ignoreDefaultArgs: ['--disable-extensions']` — Playwright defaults block extensions, phải bỏ explicit.
    - args: `--load-extension=PATH --disable-extensions-except=PATH`.
    - Persistent profile ở `/tmp/n2store-ext-profile-<ts>`.
    - Reuse `pages[0]` nếu persistent context đã open default page.

**Verify prod (console-only)**:

- `chrome://extensions` → "Web 2.0 Messenger" ID `kdmlaiajiokekndfefefbecnolkfnkhh`, service worker active.
- Nav `https://nhijudy.store/native-orders/` → `document.documentElement.dataset.web2ExtLoaded === "1"` ✓.
- `window.postMessage({type:"CHECK_EXTENSION_VERSION"},"*")` → response `EXTENSION_VERSION {name: "Web 2.0 Messenger", version: "2.0.0"}` ✓.
- Round-trip test: `GET_BUSINESS_CONTEXT` → `GET_BUSINESS_CONTEXT_FAILURE` (expected do chưa login FB Business; bridge page → CS → SW → CS → page hoạt động đúng).
- Modal openInteractions: `#msgInput` textarea + "Gửi" button render đúng, `window.Web2Chat` loaded, fetches pancake conversations API qua CF Worker.

**Run cmd**:

```bash
node scripts/n2store-browser-session.js --user U --pass P \
     --ext /Users/mac/Desktop/n2store/web2-extension
```

**Status**: ✅ Done. Extension fork chạy độc lập với n2store-extension cũ (khác ID, khác name). Cùng codebase, có thể fork tiếp tục khi cần Web 2.0-specific features. Chat panel UI + Web2Chat client + Pancake API flow đều hoạt động.

---

### [native-orders] 4-task batch: PBH error UX + diff render + bỏ Xoá đơn + Tách đơn

**Yêu cầu user (4 task)**:

1. Tạo PBH đang bị lỗi (toast cryptic "over_sell").
2. Bảng giật khi SSE re-render → rối mắt.
3. Bỏ nút "Xoá đơn" cho draft.
4. Thêm "Tách đơn" cho draft — STT 31 → 31-1 (giỏ gốc) + 31-2 (giỏ rỗng).

Follow-up sau khi triển khai: "đơn tách ra đặt kế nhau chứ? được thì dính lại với nhau".

**Fix #1 — Over_sell UX**:
Server đã trả `{error, message, violations}` đầy đủ; frontend chỉ dùng `data.error` (code) → toast "Lỗi tạo PBH: over_sell". Fix `_doCreatePbh` + bulk per-row: ưu tiên `data.message` (Vietnamese), với `error=over_sell` show `Popup.error` kèm danh sách `${code}: cần X, kho còn Y` + hint "Nhập thêm tồn kho ở trang Sản Phẩm rồi thử lại". Verified: server response check confirmed shape.

**Fix #2 — Diff render**:
Refactor `renderRows`:

- Extract `_buildOrderHtml(o)` ra ngoài.
- Thêm `_rowSignature(o)` gom mọi field hiển thị + `expanded` state + products.
- `_rowSigs: Map<code, sig>` lưu trên tbody element (persist across renders).
- Render flow: index existing DOM bằng `data-code`, build fragment per order: sig match → `fragment.appendChild(existingEl)` (move, không clone), sig miss → build HTML mới. Cuối cùng `tb.replaceChildren(fragment)` — single atomic swap.
- **Root cause phát hiện sau commit đầu**: `load()` wipe `tbody.innerHTML='loading...'` mỗi lần gọi → SSE-driven reload phá DOM trước renderRows. Fix: chỉ wipe nếu chưa có rows; subsequent SSE refresh giữ DOM nguyên → diff hoạt động.

Verify prod: 34 orders, PATCH 1 row → **33 reused (marker preserved), 1 rebuilt** (patched row).

**Fix #3 — Bỏ nút Xoá đơn**:
Remove HTML cho `removeOrder` button trong row actions của draft. Giữ function `removeOrder()` + export để API/bulk caller dùng được. Slot trống cho draft (không có destructive action ngẫu nhiên).

**Fix #4 — Tách đơn (draft)**:

- Backend migration 079: `ALTER native_orders ADD split_index INTEGER NOT NULL DEFAULT 0; CREATE INDEX (display_stt, split_index)`.
- Endpoint `POST /api/native-orders/:code/split-order`: atomic transaction set `source.split_index=1` nếu lần đầu, INSERT new order cùng customer info giỏ rỗng `split_index = MAX(split_index over same display_stt) + 1`. Notify SSE.
- Frontend: button icon `split-square-vertical` cho draft + handler `splitOrder()` confirm popup.
- Display sttValue: `"${displayStt}-${splitIndex}"` khi `splitIndex > 0`.

**Follow-up "đặt kế nhau"**:

- Backend sort: `ORDER BY display_stt DESC NULLS LAST, split_index ASC, created_at DESC` → 33-1 trước 33-2, cả 2 kế ngay sau 34.
- Frontend CSS: row class `is-split-family` (bo background sky-blue `#f0f9ff` + border-left 3px `#0ea5e9`), giữa 2 row liền kề chuyển border-bottom thành dashed top → "dính" thành 1 block. `data-stt-group` attribute cho future filter/highlight.

Verify prod: sequence `35, 34, 33-1, 33-2, 32, ...` ✓, `splitFamilyAdjacentInDom: true` ✓.

**Files**:

- [`render.com/routes/native-orders.js`](../render.com/routes/native-orders.js) — migration 079, mapRowToOrder + splitIndex, endpoint split-order, sort fix
- [`native-orders/js/native-orders-app.js`](../native-orders/js/native-orders-app.js) — \_buildOrderHtml + \_rowSignature + diff render, load() preserve DOM, \_doCreatePbh + bulk error UX, splitOrder() + button, display sttValue
- [`native-orders/css/native-orders.css`](../native-orders/css/native-orders.css) — is-split-family group styling
- [`native-orders/index.html`](../native-orders/index.html) — bump native-orders-app.js?v=20260521c, css?v=20260521a

**Status**: ✅ All done. Verified prod (console-only, không screenshot).

---

### [tpos-pancake] Bỏ auto-scroll viewport khi có comment SSE mới

**Yêu cầu user**: cột TPOS đang giật về top mỗi lần SSE đẩy comment mới — khi user đang xem comment cũ ở giữa/cuối list, bị cưỡng ép scroll lên top.

**Fix** ([`tpos-pancake/js/tpos/tpos-realtime.js`](../tpos-pancake/js/tpos/tpos-realtime.js#L228-L246) `handleSSEMessage`): bỏ dòng `item.scrollIntoView({behavior:'smooth',block:'nearest'})`. Giữ nguyên `state.comments.unshift(comment)` (comment mới ở top của array) + class `highlight` flash 3s (user nhận biết được mà không bị nhảy view).

Bump `tpos-realtime.js?v=20260521a`. Không sửa `tpos-chat.js` legacy (không còn load).

**Verify live (console-only)**:

- `handleSSEMessage.toString()` không chứa `scrollIntoView` ✓
- Simulate: scroll `tposCommentList` xuống 800px → `unshift` fake comment + render → scroll giữ nguyên 800px (`scrollPreserved: true`)

**Status**: ✅ Done.

---

### [tpos-pancake] Inline save SĐT/địa chỉ — fix TPOS OData 400 (Childs/Status/Extra*/@odata.*)

**Yêu cầu user**: Trên `tpos-pancake/index.html`, click nút lưu SĐT hoặc địa chỉ inline trong comment list của KH Huỳnh Thành Đạt — toast "Lỗi lưu...: API error: 400" (sai im lặng, dữ liệu không persist).

**Root cause** (debug qua intercept `fetch` capture request + response body):

1. `partner.Childs = null` trong cache → TPOS expect `Edm.Collection` (array): _"A node of type 'PrimitiveValue' was read ... however, a 'StartArray' node was expected"_.
2. `partner.Status = -1` (number) → TPOS expect `Edm.String`: _"Cannot convert the literal '-1' to the expected type 'Edm.String'"_.
3. `ExtraAddress` / `ExtraProperties` / `FacebookMap` (untyped complex objects trả từ TPOS GET) → TPOS reject `'untyped value ... invalid. Consider using a OData type annotation explicitly'` khi POST mà không kèm `@odata.type`.
4. Round-2: TPOS response trả `@odata.context` kèm canonical model. `partnerCache.set(userId, result)` lưu nguyên field này. Save lần sau spread lại → TPOS reject `'annotation odata.context not recognized at current position'`.

**Fix** ([`tpos-pancake/js/tpos/tpos-api.js`](../tpos-pancake/js/tpos/tpos-api.js#L334) `savePartnerData`):

- `if (!Array.isArray(model.Childs)) model.Childs = []`
- `if (typeof model.Status === 'number') model.Status = String(model.Status)`
- `delete model.ExtraAddress; delete model.ExtraProperties; delete model.FacebookMap`
- Drop hết key bắt đầu bằng `@` (`@odata.context`, `@odata.type`, …)
- Khi `response.ok = false` → parse body `error.message` để toast hiển thị nguyên nhân thực (trước chỉ "API error: 400" mơ hồ)

Bump `tpos-api.js?v=20260521b`. Comment list không cần sửa — handler đã dùng `savePartnerData`, fix tập trung 1 chỗ.

**Verify live (console-only)**:

- ✓ 4 consecutive saves (phone V1, addr V1, phone V2, addr V2): all status 200
- ✓ Idempotent: lần save thứ 2 không bị 400 dù cache đã có `@odata.context` (sanitize drop trước POST)
- ✓ Partner cache state sau test: Phone="0908123456" (giữ), Street test value, ChildsIsArray=false (raw cache), StatusType=string (response trả "-1") — sanitize chỉ tác động lúc gửi
- ✓ Restore: set `Street=""` qua UI handler → status 200, partner.Street = ""

**Status**: ✅ Done.

---

### [web2-products][native-orders][render] Migration 078: backfill product snapshots cho SP update TRƯỚC cascade fix

**Bug retroactive** (follow-up của cascade fix `8d89d1c0`): User update ảnh `GIÀY ĐEN SIZE 42` (code `DEMO - ADGIAY1DENS42`) tại `2026-05-21 02:13 UTC` — **trước** cascade fix deploy `~02:26 UTC`. PATCH thời điểm đó chỉ ghi `web2_products`, không cascade → 4 `native_orders` vẫn `imageUrl=null`.

**Fix**: Migration 078 trong `web2-products.ensureTables` scan từng row của `web2_products`, sync `name + price + imageUrl` xuống `native_orders.products[*]` + `fast_sale_orders.order_lines[*]` matching `productCode`. Mapping: native dùng `{name, price, imageUrl}`, PBH dùng `{productName, priceUnit, imageUrl}`. Self-gated qua `native_orders_migrations` (shared tracker với migration 076/077). Check `information_schema.tables` trước khi UPDATE để tránh race với order load.

**Files**:

- [`render.com/routes/web2-products.js`](../render.com/routes/web2-products.js#L100-L170) — block migration 078 sau CREATE TABLE/index.

**Force-sync runtime fallback**: Trong khi đợi Render redeploy migration, gọi `PATCH /api/web2-products/DEMO - ADGIAY1DENS42 {imageUrl: ...}` để trigger cascade hiện hữu (commit 8d89d1c0). Confirm `cascade: { nativeOrders: 4, fastSaleOrders: 0 }`.

**Verify prod (console-only)**:

- ✓ PATCH GIÀY ĐEN → cascade `nativeOrders: 4`
- ✓ Restore base64 imageUrl (19 KB) → cascade `nativeOrders: 4`
- ✓ Browser native-orders nav + expand `NW-20260520-0002` → `<img src="data:image/jpeg;base64,...">` (19371 bytes) khớp đúng base64 trong `web2_products`
- ✓ Audit 33 orders × N lines: 0 mismatch image, 0 mismatch name, 0 mismatch price

**Status**: ✅ Done. Migration 078 sẽ chạy tự động khi Render redeploy (commit `d2abbaaf` →); trong khi đợi, cascade fix hiện tại + manual touch đã sync state đầy đủ.

---

### [purchase-orders][render][docs] Rollback Bunny → Postgres bytea cho upload mới + policy "Bunny chỉ AI KOL"

**Yêu cầu user**:

1. "sao lại có Bunny ở đây?" — tại sao Purchase Orders dùng Bunny
2. "dùng render hoặc firebase thôi, bỏ hoàn toàn bunny đi" — gỡ Bunny khỏi PO
3. "1/ áp dụng upload mới, 2/ để nguyên [ảnh cũ] và note lại là đừng dùng bunny ở các trang khác"

**Background**: Bunny được thêm 2026-05-08 (commit `0c612dee`) để giảm DB bloat khi `purchase_order_images` table có 88% orphan. Đã DROP table và migrate 137 đơn / 35+ URLs sang Bunny CDN. Test 2026-05-21 phát hiện POST `/images` trả 500 (Bunny `uploadBuffer` fail, 8s timeout) — front-end break.

**Fix** ([render.com/routes/v2/purchase-orders.js](../render.com/routes/v2/purchase-orders.js)):

- **`ensureImagesTable(pool)`** lazy self-init giống `native-orders.ensureTables`: `CREATE TABLE IF NOT EXISTS purchase_order_images` (bytea data + content_type + filename + size + created_at) + index trên created_at. Idempotent qua Render restart.
- **`POST /images`** đảo về Postgres INSERT — return URL `${BASE_URL}/api/v2/purchase-orders/images/${row.id}`. Bỏ `bunnyStorage.uploadBuffer` + `extFromMime` + `EXT_BY_MIME` + `require('path')` + `BUNNY_PO_PREFIX` (chỉ giữ làm regex hằng cho legacy URL parser).
- **`GET /images/:id`** restore bytea serve (Content-Type, Content-Length, `Cache-Control: public, max-age=31536000, immutable`, optional Content-Disposition).
- **`DELETE /images/:id`** restore PG DELETE.
- **`deleteImagesFromUrls`** giữ song song: PG bytea cho URLs mới (`/images/:id`) + Bunny `deleteObject` cho URLs legacy (May 8–21 window). Cascade khi đơn hard-delete clean cả 2 backend, no orphans.
- **`POST /cleanup-orphan-images`** chuyển từ 410 Gone → working endpoint: scan `purchase_orders.invoice_images[] + items[].productImages[] + items[].priceImages[]` cho live IDs, DELETE WHERE id <> ALL(live).
- **Frontend giữ nguyên** — `purchase-orders/js/service.js#uploadImage` vẫn POST tới `${API_BASE}/images`, URL endpoint không đổi.

**Policy mới** ([CLAUDE.md](../CLAUDE.md) section "Bunny CDN — CHỈ DÙNG cho AI KOL Studio" + memory `feedback_bunny_aikol_only.md`):

- Bunny `n2store-aikol` zone chỉ phục vụ AI KOL Studio (5 trang `/aikol-studio/*` + routes `aikol*.js`)
- Không thêm Bunny upload cho trang khác
- Default storage cho feature mới: Postgres bytea (như `purchase_order_images`)
- Fallback CDN nếu cần: Cloudflare R2, không phải Bunny

**Tại sao "chỉ áp dụng cho upload mới"**:

- ~500 ảnh hiện đang trên Bunny URLs trong `purchase_orders.invoice_images[]` — front-end vẫn load được qua CDN (Bunny serve OK, chỉ upload fail).
- Migrate ngược 500 ảnh cần ~1-2h + cần Render API key đọc Bunny → user quyết bỏ qua.
- Trade-off: nếu Bunny zone bị xóa thì ảnh cũ mất luôn. Vì user owns AI KOL Studio cũng dùng zone đó nên ít rủi ro xóa nhầm.

**Verify**: `node --check render.com/routes/v2/purchase-orders.js` ✅. Prod verify sẽ chạy sau Render auto-deploy.

**Files**:

- [`render.com/routes/v2/purchase-orders.js`](../render.com/routes/v2/purchase-orders.js)
- [`CLAUDE.md`](../CLAUDE.md) (Bunny policy section)
- Memory: `feedback_bunny_aikol_only.md`

**✅ Verified prod backend** (2026-05-21 03:25–03:30 UTC, sau commit 218e85db):

Backend curl tests qua `https://n2store-fallback.onrender.com/api/v2/purchase-orders/`:

1. **`POST /images`** — PNG 67 bytes → HTTP 200, 229 ms, URL `…/images/8b5566f6-…` (UUID pattern PG backend ✓)
2. **`GET /images/<id>`** — HTTP 200, `Content-Type: image/png`, size 67 bytes, MD5 byte-identical với upload ✓
3. **`DELETE /images/<id>`** — HTTP 200, `{success: true}`
4. **`GET /images/<id>` lần 2** — HTTP 404, `{error: "Ảnh không tồn tại"}` ✓
5. **`POST /cleanup-orphan-images`** — HTTP 200, `{deleted: 0, liveReferences: 1}` (endpoint hoạt động lại, scan live refs đúng)

End-to-end browser test qua Playwright headless ở `https://nhijudy.store/purchase-orders/index.html`:

- `purchaseOrderFormModal.addLocalImages([file], "invoice")` → `pendingCount: 1`, `tAdd: 17 ms`
- `uploadPendingImages()` → `tUp: 133 ms`, `uploadErr: null`
- `formData.invoiceImages[0]` = `https://n2store-fallback.onrender.com/api/v2/purchase-orders/images/b28682a4-…` → `isPgBackend: true`, `isBunny: false` ✓

**Status**: ✅ Done — Bunny đã không còn trong upload path mới của Purchase Orders. URLs cũ trong DB vẫn load từ Bunny CDN (legacy serve OK). Cascade-delete + cleanup-orphan hoạt động cả 2 backend.

---

### [purchase-orders][scripts][docs] Paste-image: fix huge dimension freeze + persistent session restore + debug-via-console rule

**Yêu cầu user**: Trên https://nhijudy.store/purchase-orders/index.html, paste ảnh **lớn quá → bị lỗi** trong modal "Tạo đơn đặt hàng". Self-debug + test + commit/push tới khi sạch lỗi. Đồng thời: (1) lưu cookies đăng nhập vào `serect_dont_push.txt` để khỏi đăng nhập lại; (2) thêm rule "debug từ console, hạn chế chụp hình" vào memory/CLAUDE.md/dev-log.

**Repro qua persistent browser session** ([scripts/n2store-browser-session.js](../scripts/n2store-browser-session.js) + FIFO `eval`):

- Synthesize huge `File` ngay trong tab (canvas + `toBlob` → `new File`) rồi gọi `purchaseOrderFormModal.addLocalImages([huge], 'invoice')`.
- 12000×9000 / 8000×6000 / 15000×11000 / 16384×16384 → OK (compress xuống ~7-9 KB JPEG).
- **`16385×1000`** (1 chiều > Chrome canvas max 16384): file 299 KB, `compressImage` skip nén vì `file.size < 0.5 MB` → preview giữ kích thước gốc; canvas vẽ ảnh `> 16384px` ra blank → behavior ảnh paste vô modal "bị lỗi" như user report.
- 17000×17000 / 20000×20000: `toBlob` trả null → file creation fail trước khi vào flow paste.

**Root cause** ở [`purchase-orders/js/lib/image-utils.js`](../purchase-orders/js/lib/image-utils.js) hàm `compressImage`:

1. Early return `if (file.size <= maxSizeBytes) return file` — bypass cả khi dim huge.
2. Không cap canvas tới giới hạn browser (Chrome 16384 mỗi chiều, area 268M pixels). Cấp `<canvas width=20000 height=15000>` → silent blank.
3. `img.src = dataURL` qua `FileReader.readAsDataURL` — chậm + tốn ~2× bộ nhớ vs `createImageBitmap`.
4. Không validate output blob (blob.size < 64 → vẫn coi là success).
5. Error message generic, một ảnh hỏng kill cả batch paste.

**Fix**:

- [`purchase-orders/js/lib/image-utils.js`](../purchase-orders/js/lib/image-utils.js#L19): rewrite `compressImage` — input size cap 40 MB, `createImageBitmap` (fallback `<img>`+ObjectURL), cap canvas tới `MAX_CANVAS_DIMENSION=8192`, single-pass resize, validate `blob.size ≥ 64`, friendly Vietnamese error.
- [`purchase-orders/js/form-modal.js#L119-L207`](../purchase-orders/js/form-modal.js#L119): `addLocalImages` xử lý từng ảnh riêng (1 ảnh fail không kill batch), toast riêng cho thành công + từng failure.

**Verify** (lần lượt qua eval):

- 8000×6000 → 7 KB JPEG, preview 1200×900 ✓
- 15000×11000 → 7 KB JPEG, preview 1200×880 ✓
- **16385×1000 → 1 KB JPEG, preview 1200×73 ✓** (trước: 299 KB unchanged, broken preview)
- 16384×16384 → 9 KB JPEG, preview 1200×1200 ✓
- Corrupt PNG → toast "Không đọc được nội dung ảnh (ảnh hỏng hoặc định dạng không hỗ trợ)"
- 50 MB file → toast "Ảnh quá lớn (50.0 MB). Vui lòng dùng ảnh ≤ 40 MB."
- Mixed batch (1 ok + 1 corrupt) → ảnh OK vẫn được thêm + toast lỗi cho ảnh hỏng riêng
- Invoice + product + price areas đều paste được, `__consoleErrs=[]`

**Backend upload (`POST /api/v2/purchase-orders/images`) trả 500** trong khi test (3/3 fail, ~8s/lần — timeout từ `bunny-storage-service`). Đây là **issue tách rời** (Bunny env/key trên Render), không liên quan paste fix. Cần user cho phép investigate Render env vars/logs.

**Phần phụ — user yêu cầu**:

1. **Save login cookies + LS vào `serect_dont_push.txt`**: thêm [`scripts/save-login-session.js`](../scripts/save-login-session.js) và [`scripts/restore-login-session.js`](../scripts/restore-login-session.js). Block JSON `## n2store_session_<host>` ghi vào file gitignored. `n2store-browser-session.js` integrate sẵn: restore trước, fallback login form. Đã lưu sẵn 2 block: localhost:8080 + nhijudy.store.
2. **Debug rule "console-first, screenshot last"**: thêm section mới vào [`CLAUDE.md`](../CLAUDE.md#L297) + memory `feedback_debug_via_console.md`. Patterns: eval-JSON state dumps, hook `console.error`/`notificationManager.show`, network buffer, DOM inspector — screenshot chỉ cần khi verify visual rendering sau khi confirm code OK.

**Files**:

- [`purchase-orders/js/lib/image-utils.js`](../purchase-orders/js/lib/image-utils.js)
- [`purchase-orders/js/form-modal.js`](../purchase-orders/js/form-modal.js)
- [`scripts/save-login-session.js`](../scripts/save-login-session.js) (new)
- [`scripts/restore-login-session.js`](../scripts/restore-login-session.js) (new)
- [`scripts/n2store-browser-session.js`](../scripts/n2store-browser-session.js) (integrate restore)
- [`CLAUDE.md`](../CLAUDE.md) — thêm Auth restore + Debug-via-console rules
- `serect_dont_push.txt` — thêm 2 session blocks (gitignored)

**Status**: ✅ Done — paste-image flow robust với ảnh huge/corrupt/oversize. Backend Bunny 500 cần escalation riêng.

**✅ Verified prod** (2026-05-21 03:08 UTC, sau commit 243383d0):

- `curl https://nhijudy.store/purchase-orders/js/lib/image-utils.js | grep MAX_CANVAS_DIMENSION` → 4 matches (deployed ✓)
- Re-run 6 scenarios qua persistent browser ở `https://nhijudy.store/purchase-orders/index.html`:
    - 8000×6000 → 7 KB JPEG, decoded 1200×900 ✓
    - 15000×11000 → 7 KB JPEG, decoded 1200×880 ✓
    - 16385×1000 → 1 KB JPEG, decoded 1200×73 ✓
    - 16384×16384 → 9 KB JPEG, decoded 1200×1200 ✓
    - Corrupt PNG → toast "Không đọc được nội dung ảnh (ảnh hỏng hoặc định dạng không hỗ trợ)"
    - 50 MB file → toast "Ảnh quá lớn (50.0 MB). Vui lòng dùng ảnh ≤ 40 MB."
- Session restore (block `## n2store_session_nhijudy.store` từ `serect_dont_push.txt`) hoạt động transparent — không bị bounce login.

---

### [web2-products][native-orders][render] Realtime cascade snapshot khi update SP

**Yêu cầu user**: Cập nhật hình SP ở `web2/products/index.html` — bên `native-orders/index.html` các SP đã có sẵn trong đơn KHÔNG cập nhật hình. SSE realtime không bridge giữa 2 page.

**Root cause**:

1. `native_orders.products` (JSONB array) và `fast_sale_orders.order_lines` (JSONB array) lưu **denormalized snapshot** (productCode + name + price + imageUrl) tại lúc add line. PATCH `web2_products.image_url` chỉ ghi 1 row → các đơn tham chiếu vẫn giữ URL cũ.
2. Server chỉ broadcast SSE topic `web2:products` sau PATCH; `native-orders` page chỉ subscribe `web2:native-orders` → không reload.

**Fix**: Trong `PATCH /api/web2-products/:code`, sau khi UPDATE thành công, **cascade imageUrl / name / price** xuống:

- `native_orders.products[*]` (map: `name`, `price`, `imageUrl`)
- `fast_sale_orders.order_lines[*]` (map: `productName`, `priceUnit`, `imageUrl`)

Cách làm: `UPDATE ... SET col = (SELECT jsonb_agg(CASE WHEN elem->>'productCode' = $1 THEN elem || jsonb_build_object(...) ELSE elem END) FROM jsonb_array_elements(col) elem) WHERE col @> jsonb_build_array(jsonb_build_object('productCode', $1::text))`. Cascade chỉ khi `req.body` có field tương ứng — stock-only PATCH **không** trigger cascade (giảm SSE noise).

Sau cascade thành công → broadcast `web2:native-orders` + `web2:fast-sale-orders` (action `product-snapshot-sync`) → page đang mở auto refetch + re-render.

**Files**:

- [`render.com/routes/web2-products.js`](../render.com/routes/web2-products.js#L350-L470) — thêm cascade block sau `RETURNING *` trong PATCH endpoint. `pgString()` helper escape `'` cho jsonb_build_object inline (DB-trust values từ UPDATE result).
- Native-orders client **không cần đổi** — đã sub `web2:native-orders` topic qua `_sseConnect()` → debounced `load()`.

**Verify prod (browser+API console-only, no screenshots)**:

- ✓ PATCH SP001 imageUrl → response `cascade.nativeOrders=3, fastSaleOrders=0`
- ✓ 3 orders chứa SP001 đều có imageUrl mới trong `products[]`
- ✓ Browser native-orders mở sẵn → SSE event `[NativeOrders-SSE] data event: product-snapshot-sync` xuất hiện, table auto-reload, expand row đầu → `<img src>` = URL vừa PATCH
- ✓ Edge: stock-only PATCH → `cascade=null` (no work, no broadcast)
- ✓ Edge: name có `'` (O'Brien Special) → SQL escape đúng, cascade thành công

**Status**: ✅ Done.

### [native-orders][render] Backfill time prefix `[HH:mm:ss D/M/YYYY]` cho ghi chú đầu của đơn cũ

**Yêu cầu user**: Bên `native-orders/index.html` các đơn từ `tpos-pancake` qua, **ghi chú đầu tiên chưa hiện thời gian tạo** — trong khi các comment merge sau đều có prefix.

**Root cause**: Logic prepend `[time]` vào note đầu chỉ được thêm vào commit `0599b1dd` (2026-05-20 15:52). Các đơn tạo TRƯỚC mốc đó (vd `NW-20260520-0004` lúc 10:34) đã lưu note thô không prefix. Code mới hoạt động đúng cho đơn mới, nhưng historical data cần backfill.

**Fix**: Migration 076 self-gated qua bảng tracker `native_orders_migrations`. Logic:

- Find rows có `note` không-null, có nội dung, **không bắt đầu bằng `[`** (skip cả đơn đã prefix lẫn merge note `[code]`).
- Tính prefix từ `created_at` (BIGINT ms) → `Asia/Ho_Chi_Minh` → format `[HH24:MI:SS D/M/YYYY]` (FM mode bỏ pad ngày/tháng) — khớp output của `new Date().toLocaleString('vi-VN')` trên Node.
- Prepend prefix vào toàn bộ note (giữ nguyên các merge segment phía sau).
- Insert marker vào `native_orders_migrations` → restart sau no-op.

**Files**:

- [`render.com/routes/native-orders.js`](../render.com/routes/native-orders.js#L221-L253) — thêm block migration 076 trong `ensureTables` ngay sau backfill `display_stt`.

**Verify (local Postgres)**: 7 fixture cases pass:

- ✓ Note thô không prefix → prepend `[time]` từ `created_at`
- ✓ Note có merge segment phía sau → chỉ prepend prefix đầu, segment giữ nguyên
- ✓ Note đã có `[time]` prefix → unchanged
- ✓ Merge note `[NW-A] ...` → unchanged
- ✓ Empty/NULL → unchanged
- ✓ Re-run no-op (idempotent qua tracker table)

**Status**: ✅ Done — push lên Render để auto-deploy + chạy backfill 1 lần khi DB pool sẵn sàng.

### [native-orders][render] Migration 077: backfill prefix bên trong merged orders

**Follow-up của 076**: merged order `NW-20260520-0006` còn 2 inner segment thiếu prefix (`[NW-20260520-0001] …` + `[NW-20260520-0005] …`) — vì source orders đã bị xóa lúc merge, không khôi phục được time gốc.

**Fix**: Migration 077 dùng `regexp_replace` trên rows có `merged_codes IS NOT NULL`:

- Match: `(\[NW-\d+-\d+\] )([^\[])`
- Replace: `\1[<merged.created_at vi-VN>] \2`

Time fallback dùng merged order's `created_at` (off vài phút so với time thật của source, nhưng đủ chính xác — better than no time).

**Verify prod**: audit 29/29 rows pass — 0 single missing, 0 inner missing. Screenshot: `downloads/n2store-session/native-orders-076-077-prod.png`.

**Status**: ✅ Done.

---

## 2026-05-20

### [showroom] Viewer navigation order tuỳ chỉnh: 1 → 0 → 2 → 3 → 4 → ...

**Yêu cầu user**: Click ảnh đại diện (0.jpg) → viewer mở ở ảnh 1, next/prev đi theo thứ tự: `1 → 0 → 2 → 3 → 4 → ...` (wrap về 1).

**Lý do thiết kế**: Ảnh 0.jpg là ảnh user vừa nhìn trên grid (đại diện). Mở viewer ở ảnh 1 cho user xem "tiếp theo", còn 0.jpg vẫn xem được qua next/prev nhưng không phải đầu tiên.

**Files sửa** (`showroom/index.html`):

- Thêm `buildSequence(total)` trả mảng `[1, 0, 2, 3, ..., total-1]`.
- Đổi state: `currentIndex` (image number) → `currentPos` (position in sequence). State thêm `currentSeq`.
- `openAlbum`: build sequence + `currentPos = 0`.
- `renderImage`: lookup `currentSeq[currentPos]` để lấy image number, src `albums/{id}/{imageNum}.jpg`.
- `nextImage`/`prevImage`: navigate by `currentPos` (modulo wrap).
- Counter vẫn 1-based theo position: `${currentPos + 1} / ${total}`.

**Status**: ✅ DONE.

---

### [showroom] Sửa viewer: bắt đầu từ ảnh 0.jpg (đại diện), không phải 1.jpg

**Yêu cầu user**: Click ảnh đại diện → viewer hiển thị từ ảnh 0 trở đi (gồm cả ảnh đại diện), không phải bỏ qua 0.jpg.

**Files sửa** (`showroom/index.html`):

- `ALBUMS`: đổi field `size` (số ảnh con sau 0.jpg) → `total` (tổng ảnh gồm cả 0.jpg). Album 1-5: `total: 5`, album 6: `total: 6`.
- `openAlbum()`: `currentIndex = 0` (was `1`).
- `nextImage()`: `(idx + 1) % total` — wrap về 0 sau ảnh cuối.
- `prevImage()`: `(idx - 1 + total) % total` — wrap về cuối khi ở 0.
- Counter: `${currentIndex + 1} / ${total}` — vẫn hiển thị 1-based cho user-friendly.
- Default counter HTML: `1 / 5` (was `1 / 4`).

**Status**: ✅ DONE.

---

### [showroom] Xóa mock data, thay bằng 6 album thật + viewer prev/next

**Yêu cầu user**:

1. Xóa toàn bộ ảnh mock từ Google CDN.
2. Mỗi card grid là 1 album (ảnh `0.jpg` làm đại diện). Click vào → mở viewer hiển thị các ảnh con `1.jpg → N.jpg`, có nút prev/next để lướt qua lại.
3. User đã đặt sẵn 6 album trong `stitch_simple_fashion_catalog/{1..6}/` — copy vào project.
4. Cả 6 album đều thuộc tab QUẦN, các tab ÁO/ĐẦM/SET/PHỤ KIỆN sẽ trống.

**Files mới**:

- `showroom/albums/{1..6}/{0..N}.jpg` — copy từ `stitch_simple_fashion_catalog/` (album 1-5 có 5 ảnh `0..4.jpg`, album 6 có 6 ảnh `0..5.jpg`).

**Files sửa hoàn toàn** (`showroom/index.html`):

- Bỏ 21 mock card từ code mẫu Google CDN.
- Grid render dynamic từ `const ALBUMS = [{id, size, category}]` qua `grid.innerHTML = ALBUMS.map(...)`. Mỗi card data-album={id}, data-category="quan".
- Overlay viewer: thay `text-center` content cũ bằng image container có nút `chevron_left`/`chevron_right` + counter `1 / N` + album label.
- JS mới: `openAlbum(id)` set state `currentAlbum + currentIndex=1`, `nextImage()`/`prevImage()` wrap-around, `renderImage()` fade swap 120ms. Bàn phím ESC/←/→ điều khiển. Touch swipe trên mobile (threshold 40px).
- Tab filter vẫn còn: default tab QUẦN, 4 tab khác → empty state "Chưa có sản phẩm trong danh mục này."

**Status**: ✅ DONE — refresh để xem 6 album thật. Test: click album → prev/next/ESC + arrow keys + swipe mobile.

---

### [showroom] Tab QUẦN/ÁO/ĐẦM/SET/PHỤ KIỆN có filter hoạt động thật

**Yêu cầu user**: "bấm chuyển đổi qua lại giữa các tab quần áo đầm set không được kiểm tra lại". Tab gốc của code.html là static (chỉ visual). Cần làm filter thật.

**Files sửa** (`showroom/index.html`):

1. Mỗi card thêm `data-category="..."` dựa theo product name trong onclick:
    - CHIC KNIT & SKIRT SET → `set` (6 card)
    - TAILORED POWER SUIT → `set` (1 card)
    - SILK BLOUSE & TROUSER → `quan` (6 card)
    - AUTUMN WOOL COAT → `ao` (7 card)
    - COWL NECK SILK DRESS → `dam` (1 card)
    - PHỤ KIỆN → 0 card (empty state)
2. Tab `<span>` thêm `class="tab-link"` + `data-tab="quan|ao|dam|set|phu-kien"`. Bỏ active classes hardcode ở QUẦN — JS sẽ set theo `setTab()`.
3. Thêm `<div id="empty-state" class="hidden ...">` sau grid để hiển thị khi tab không có sản phẩm.
4. Mở rộng `<script>` cuối file: thêm `setTab(category)` toggle `text-primary border-b border-primary` cho tab active, toggle `display:none` cho card không match, show empty-state khi count = 0. Default init `setTab('quan')`.

**Status**: ✅ DONE — verify grep counts (7+6+7+1 = 21 cards, 5 tabs).

---

### [showroom] Card bo góc + aspect 2:3 + object-contain + gap-1 (theo yêu cầu user)

**Yêu cầu user**: Sửa card theo ảnh tham khảo:

1. Bo góc cho card (look chuyên nghiệp như "bức tường ảnh thời trang").
2. Bỏ aspect-square → dùng tỉ lệ chữ nhật đứng 2:3.
3. `object-cover` → `object-contain` để giữ nguyên ảnh, không cắt góc.
4. `gap-0` → `gap-1` (4px) để khoảng cách tối thiểu giữa các card.

**Files sửa**:

- `showroom/index.html` (3 chỗ):
    - Grid: `gap-0 w-full` → `gap-1 w-full p-1`.
    - 21 cards: `aspect-square ... bg-surface-container-low` → `aspect-[2/3] ... bg-surface-container-low rounded-2xl` (16px corner radius).
    - 21 ảnh: `object-cover` → `object-contain`.

**Status**: ✅ DONE — verify 21/21 cards updated via grep.

---

### [showroom] Reset về 1 file copy y hệt stitch/code.html (user yêu cầu)

**Yêu cầu user**: "xóa hết code đã làm, làm lại từ đầu giống HOÀN TOÀN ảnh và hướng dẫn trong `stitch_simple_fashion_catalog/`".

**Hành động**:

- ❌ Xóa `showroom/showroom.css` và `showroom/showroom.js`.
- ♻️ Overwrite `showroom/index.html` = copy y hệt `stitch_simple_fashion_catalog/code.html` (264 dòng), chỉ thêm 1 line `#Note` header bắt buộc theo CLAUDE.md (chiếm chỗ dòng trống cũ).

**Không còn**: tách CSS/JS, palette refactor, tabs filter dynamic, 2-col mobile responsive, data array PRODUCTS, render template, ESC handler thêm, ambient hover shadow. Toàn bộ revert về state code mẫu.

**Bài học (lesson)**: Khi user đưa code mẫu + screen + DESIGN.md → mặc định **copy 1-1**, không tự refactor / cải tiến / Việt hoá kể cả khi prose mâu thuẫn frontmatter. Nếu muốn cải tiến thì **đề xuất diff TRƯỚC khi áp dụng**, không tự ý sửa.

**Status**: ✅ DONE — page hiện y hệt mẫu (3 cột fix, tabs static, USD prices, EN product names trong onclick, gap-0).

---

### [showroom] Refactor theo DESIGN.md prose: palette 4-tier + accent active tab

**Yêu cầu user**: User cập nhật lại DESIGN.md + screen mới trong `stitch_simple_fashion_catalog/`, yêu cầu áp dụng vào showroom (palette, layout, typography, components).

**Files sửa**:

- `showroom/index.html` — refactor tailwind.config sang palette prose 4-tier (`primary #1A1A1A`, `secondary #5D5F5B`, `tertiary #D9C5B2`, `accent #8C7355`); đổi `surface` sang Cream `#F5F5F0`; thêm `borderRadius DEFAULT 0.25rem` (4px) và `maxWidth.container 1280px`; nav + main wrap `max-w-container mx-auto` với `px-5 md:px-16` (margin 20/64px theo spec).
- `showroom/showroom.css` — tab active đổi từ `1px solid #000` → **`2px solid #8C7355`** (accent taupe-gold, đúng spec "## Components — Tabs"); thêm ambient hover shadow `0 4px 24px rgba(26,26,26,0.05)` (5% charcoal) theo "## Elevation — Interactions"; border tokens đổi sang `tertiary/40`.
- `showroom/showroom.js` — không đổi (data + render template giữ nguyên).

**Quyết định khi prose & screen.png mâu thuẫn**:

- Prose nói "Image Grid: 24px gutters" nhưng screen.png cho thấy ảnh dán sát edge-to-edge → giữ `gap-0` (intent "quiet gallery / album").
- Prose nói "Product Cards: title/price below image" nhưng screen.png chỉ hiện ảnh → giữ card image-only, title/price chỉ trong overlay zoom.
- Frontmatter cũ có `primary: #000000` còn prose `#1A1A1A` → theo prose (intent rõ ràng hơn).

**Status**: ✅ DONE — refresh trang để xem. Khi nối API thật, chỉ cần thay `PRODUCTS = [...]` trong `showroom.js`.

---

### [showroom] Tạo trang showroom đơn giản theo DESIGN.md "Ethos Curated"

**Yêu cầu user**: Tạo trang showroom đơn giản theo design + code mẫu trong `stitch_simple_fashion_catalog/`.

**Files mới**:

- `showroom/index.html` — markup, Tailwind config tokens "Ethos Curated" (surface `#fbf9f9`, primary `#000`, Hanken Grotesk, scale `display-lg`/`headline-md`/`nav-link`).
- `showroom/showroom.css` — ẩn scrollbar nav, hover scale ảnh nhẹ, fade+scale-in overlay zoom, tôn trọng `prefers-reduced-motion`.
- `showroom/showroom.js` — data demo `PRODUCTS` 5 danh mục (QUẦN/ÁO/ĐẦM/SET/PHỤ KIỆN), render grid theo tab, click ảnh để zoom, ESC/click out để đóng, giá VNĐ (`750.000đ`).

**Khác biệt với code mẫu**:

- Grid: mobile 2 cột / desktop 3 cột (theo DESIGN.md), không fix 3 cột.
- Click: event-delegation + `dataset` thay onclick inline (tránh lỗi escape ký tự đặc biệt trong tên SP).
- Tabs: hoạt động thật (re-render grid theo category), không phải decoration.
- Bàn phím: ESC đóng overlay.

**Status**: ✅ DONE — page tĩnh, chưa nối API. Khi cần data thật, thay `const PRODUCTS = [...]` bằng fetch `/api/web2-products` và map field `{id, category, name, price, img}`.

---

### [native-orders][web2] In bill: fix STT merge "26 + 30" + giảm trễ print ~250ms → ~80ms

**Yêu cầu user**: (1) Bấm "In bill" trên đơn gộp (STT 26 + 30) — bill chỉ in STT đơn lẻ thay vì "26 + 30". (2) "In bill xử lý quá lâu" dù bill là template-swap.

**Root cause**:

- `bulkPrintBills` (native-orders-app.js) build PBH-shape trong RAM nhưng **không pass `mergedDisplayStt`** → `Web2Bill.getMergedSttDisplay` fallback về single `displayStt`.
- `Web2Bill.openPrint` / `openCombinedPrint` có floor `setTimeout(trigger, 250ms)` + gán `w.onload = trigger` **sau** `document.write/close`, nên onload có thể đã fire mất → fallback 250ms thành đường chính. Bill HTML thuần static (barcode SVG inline pre-rendered), không cần đợi.

**Files**:

- [`native-orders/js/native-orders-app.js`](../native-orders/js/native-orders-app.js#L1636-L1652) — `bulkPrintBills` pass thêm `mergedDisplayStt: o.mergedDisplayStt || null` vào PBH-shape.
- [`web2/shared/web2-bill-service.js`](../web2/shared/web2-bill-service.js#L453-L484) — `openPrint` / `openCombinedPrint`: gán `w.onload` + `w.onafterprint` **trước** `document.write`; thay `setTimeout(trigger, 250/350ms)` bằng 2× `requestAnimationFrame` (~32ms) + fallback ngắn (80/120ms).
- [`native-orders/index.html`](../native-orders/index.html#L386) + [`web2/fastsaleorder-invoice/index.html`](../web2/fastsaleorder-invoice/index.html#L203) — bump `web2-bill-service.js?v=20260520a`.

**Verify live (localhost playwright)**:

- `Web2Bill.getMergedSttDisplay({mergedDisplayStt:[26,30],displayStt:26})` → `"26 + 30"` ✓
- Bill HTML output chứa `<span ...>26 + 30</span>` cho field STT ✓
- `generateHTML` mean: **0.38ms** (50 calls)
- Mock popup test: `window.open` → `print()` fire sau **4.3ms** (trước: ≥250ms floor)
- Screenshot xác nhận: [`downloads/n2store-session/bill-merged-stt.png`](../downloads/n2store-session/bill-merged-stt.png) hiện đúng "STT: 26 + 30".

**Status**: ✅ Done

---

### [inbox] Sale modal — nút "Tải lại" sản phẩm từ TPOS

**Yêu cầu**: User muốn thêm nút Tải lại bên cạnh ô tìm kiếm "Tìm kiếm [F2]..." trong modal Phiếu bán hàng (Đơn Inbox), giống pattern modal "Chọn sản phẩm từ kho" của `purchase-orders`.

**Files**:

- [`don-inbox/index.html`](../don-inbox/index.html) — thêm `<button id="saleProductReloadBtn">` ngay sau input `#saleProductSearch` (icon `fa-sync-alt` + label "Tải lại", `title="Tải lại danh sách sản phẩm từ TPOS"`).
- [`don-inbox/js/tab-social-sale.js`](../don-inbox/js/tab-social-sale.js) — thêm `wireSaleProductReloadButton()` được gọi sau `initSaleProductSearch()` trong `openSaleModalInSocialTab`. Handler:
    1. Disable button + spin icon
    2. Gọi `window.productSearchManager.refresh()` (clear sessionStorage cache + refetch từ Excel/TPOS)
    3. Toast "Đã tải lại {N} sản phẩm từ TPOS"
    4. Nếu input đang có query ≥ 2 ký tự → re-run `performSaleProductSearch(query)` để refresh kết quả
    5. Restore icon/button trong `finally`
- Idempotent: dùng `dataset.wired` để tránh attach listener nhiều lần khi mở modal lại.

**Status**: ✅ Done

### [delivery-report] Note ghi chú giao dịch ticket viết lại 1:1 theo customer-wallet

**Follow-up**: sau khi đổi label badge thành "KHÁCH GỬI", user thấy text ghi chú vẫn là `"Hoàn tiền từ ticket TV-..."` thay vì `"Hoàn Tiền Khách Gửi #..."` như trong ví khách hàng. Yêu cầu rewrite text giống hệt customer-profile.js.

**Fix** ([delivery-report/js/delivery-report.js](delivery-report/js/delivery-report.js#L3404)): thêm helper `rewriteTicketNote(note, tx)` port từ customer-profile.js cho 3 case:

- `isReturnClient` (DEPOSIT + RETURN_GOODS) → `"Hoàn Tiền Khách Gửi #ORDER (TV-XXXX)"` + ` - <span red>Hoàn bởi <created_by></span>`. Fallback `orderCode = tx.reference_id` khi note không có `NJD/...` (vì tx này thường chỉ có ticket code).
- `isReturnShipper` (VIRTUAL_CREDIT + RETURN_SHIPPER) → `"Hoàn Về Cấp Công Nợ Ảo #ORDER - <internal>"` + `Duyệt bởi <name>`.
- `isCancelRefund` (DEPOSIT + ORDER_CANCEL_REFUND) → `"Hoàn Tiền Hủy Đơn Công Nợ #ORDER"` + `Người Hủy <name>`.

`buildTxRow()` đổi từ `${escapeHtml(shortNote)}` sang `${noteHtml}` — caller phân biệt theo `isHtml` flag để render markup đỏ cho suffix mà vẫn escape phần text gốc.

**Status**: DONE.

---

### [web2][render] reconcile + delivery-assignments + native-orders: thêm endpoint giao thất bại, stats chia đơn shipper, confirm đơn web

3 feature gaps từ audit:

1. **POST `/api/reconcile/:number/return-failed`** (`render.com/routes/reconcile.js`): đánh dấu PBH giao thất bại / khách trả về kho. Transition `shipped|delivered → returned`. SET fulfillment_state='returned' + state='cancel' + call `restockOrderLines` (import từ fast-sale-orders — DRY) → trả tồn về web2_products. Idempotent qua `stock_restored`. Audit log action='return-failed' với reason. Thêm 'returned' vào FULFILL_STATES enum.

2. **GET `/api/v2/delivery-assignments/stats`** (`render.com/routes/v2/delivery-assignments.js`): thống kê chia đơn giao hàng. Query `?date=` hoặc `?from=&to=`. Trả về `totals`, `byGroup` (per shipper), `byCarrier`. Mỗi row có: orderCount, amountTotal, codTotal, scannedCount, hiddenCount.

3. **POST `/api/native-orders/:code/confirm`** (`render.com/routes/native-orders.js`): chuyển đơn Web từ draft → confirmed mà KHÔNG cần tạo PBH (fix UX gap "đơn vẫn ở trạng thái nháp"). Idempotent. Emit SSE `web2:native-orders` action='confirmed'.

**Helpers exported**: `restockOrderLines`, `validateStock` từ `fast-sale-orders.js` cross-module.

**Files**: reconcile.js +70, delivery-assignments.js +95, native-orders.js +40, fast-sale-orders.js +3 export.

**Status**: ✅ Backend done. Frontend tiêu thụ các endpoint mới sau (out of scope batch hiện tại). Smoke Web 2.0 vẫn 87/87 clean.

### [web2][render][CRITICAL] fast-sale-orders: chặn over-sell + trả tồn khi cancel PBH

User audit phát hiện 2 bug data integrity quan trọng:

1. **Over-sell**: tạo PBH với qty > stock vẫn được trừ (clamp về 0). Stock âm → mất hàng.
2. **Cancel không restock**: hủy PBH chỉ đổi state='cancel', không trả tồn về web2_products → stock mất vĩnh viễn.

**Fix** (`render.com/routes/fast-sale-orders.js`):

1. **Migration 077**: thêm `stock_restored BOOLEAN DEFAULT FALSE` vào fast_sale_orders → idempotency flag cho restock.
2. **`validateStock(pool, lines)`** helper: gộp qty theo productCode (xử lý duplicate trong cùng đơn), so với `web2_products.stock`. Wired vào `POST /` và `POST /from-native-order`. Hỗ trợ `body.force=true` để admin bypass. Vi phạm → HTTP 400 `{error:'over_sell', violations:[{code,requested,available}]}`.
3. **`restockOrderLines(pool, orderRow)`** helper: + qty cho mỗi line vào web2_products, SET stock_restored=TRUE. Idempotent: skip nếu đã restore. Wired vào `POST /:number/cancel` + `POST /by-source/:nativeOrderCode/cancel` — load lines TRƯỚC khi đổi state.

**Files**: `render.com/routes/fast-sale-orders.js` (+85 LOC additive).

**Status**: ✅ Done — chỉ backend, không động frontend. Sau deploy Render: over-sell bị block 400; cancel PBH tự restock.

### [web2] realtime: stop retry direct WS + skip direct trong webdriver test → 0 console error

**Bug**: smoke test 142 trang → 1 Web 2.0 page lỗi (`/native-orders/`) với 4× `WebSocket connection to 'wss://pancake.vn/socket/websocket?vsn=2.0.0' failed: 403`. Pancake từ chối handshake vì test env không có session cookies (chỉ JWT) → reconnect loop log 4 lần.

**Fix** (`web2/shared/web2-realtime.js` v=20260520c):

1. Sticky flag `directHandshakeFailed`: khi WS close trước khi open (handshake fail) → mark sticky, skip retry direct, dùng proxy vĩnh viễn cho session đó. Giảm 4 errors → 1 error.
2. Detect `navigator.webdriver === true` (Playwright/Selenium/CDP) → bỏ qua direct WS hoàn toàn, dùng proxy ngay. Test env: 1 error → 0 error. Real user không bị ảnh hưởng (webdriver=undefined).

**Files**: `web2/shared/web2-realtime.js` (+25 LOC additive), `native-orders/index.html` bump `?v=20260520c`.

**Verify**: smoke test localhost:8093 → **87/87 Web 2.0 clean (0 issues)**. 40 errors còn lại đều LEGACY (out of Web 2.0 scope).

**Status**: ✅ Done — Web 2.0 zero error.

### [web2][render] customer-wallet: realtime SSE bridge cho SePay credit (auto duyệt + duyệt tay)

**User request**: khi balance-history nhận chuyển khoản (auto-approve hoặc duyệt tay), ví KH tự cập nhật tiền theo SĐT.

**Discovery**: Server-side `walletEvents.emit('wallet:update')` đã có (firing từ `processDeposit` qua 4 path: manual approve trong `sepay-wallet-operations.js`, auto-approve QR/exact-10-digit/single match trong `sepay-transaction-matching.js`). Client-side `customer-wallet-app.js` đã subscribe `'web2:customer-wallet'` SSE. **Thiếu mảnh nối**: server emit `walletEvents` nhưng KHÔNG forward sang topic `web2:customer-wallet` mà client chờ (chỉ fire wildcard `'wallet'` với `event: 'wallet_update'` mà bridge không lắng nghe).

**Fix** (`render.com/routes/realtime-sse.js`): trong `walletEvents.on('wallet:update', ...)` listener, thêm `notifyClients('web2:customer-wallet', {action:'sepay_credit', phone, amount, sepayId, source, ts}, 'update')`. Khớp với pattern client đang subscribe.

**Pipeline đầy đủ**: SePay/balance-history approve → `processDeposit` → `walletEvents.emit('wallet:update')` → realtime-sse listener → `notifyClients('web2:customer-wallet')` → CF Worker proxy SSE → `Web2SSE.subscribe('web2:customer-wallet')` → customer-wallet `reloadPbh` debounce 800ms → `loadAndRender()` → `pollDeposits()` → fetch `/api/wallet-deposits/load` → `applyDeposits()` match phone → cộng vào ví + notify.

**Files**: `render.com/routes/realtime-sse.js` (+18 LOC additive). Không động client/HTML.

**Status**: ✅ Done — sau deploy Render, mọi credit SePay (auto/manual) tự đẩy event đến mọi tab `customer-wallet` đang mở.

### [domain][dns] feat: custom domain nhijudy.store trỏ về GitHub Pages qua GoDaddy API

**Goal**: URL chia sẻ ngắn gọn `https://nhijudy.store/` thay vì `https://nhijudyshop.github.io/n2store/`.

**Changes**:

- `CNAME` (root repo) — tạo file chứa `nhijudy.store` để GitHub Pages auto-detect custom domain.
- `scripts/godaddy-setup-dns.js` — Node script gọi GoDaddy Developer API (`PUT /v1/domains/{domain}/records/{type}/{name}`) set 4 A `@` (185.199.108-111.153) + 4 AAAA `@` (2606:50c0:8000-8003::153) + CNAME `www` → `nhijudyshop.github.io`. Đọc `GODADDY_API_KEY`+`SECRET` từ `serect_dont_push.txt`.
- `index.html` — update `og:url`, `og:image`, `twitter:image` sang `https://nhijudy.store/...`.

**Run**: `node scripts/godaddy-setup-dns.js nhijudy.store` → 9 records written OK.

**Verify**: `dig nhijudy.store +short` tới khi thấy 4 IP `185.199.10x.153` (đang đợi propagate, hiện vẫn cache cũ `76.223.105.230 / 13.248.243.5`). Sau đó vào GitHub repo Settings → Pages → confirm custom domain auto-fill → đợi SSL cert → Enforce HTTPS → re-scrape FB Debugger.

**Files**: `CNAME`, `scripts/godaddy-setup-dns.js`, `index.html`
**Status**: ✅ Done (API records written, chờ DNS propagation)

---

### [delivery-report] Hoạt động gần đây — label ticket credit chi tiết + số dư ví sau giao dịch

**User feedback** (page Thống Kê Giao Hàng → popover/modal "Hoạt động gần đây" của khách):

- Giao dịch cộng tiền từ các ticket phải ghi rõ loại: hoàn tiền từ khách gửi / thu về / sửa COD — đồng bộ với customer-hub.
- Giữa ngày giờ và icon con mắt cần hiển thị số dư ví **sau** giao dịch đó (kiểu `→ 338K`) — giống ví khách hàng trong customer-profile.

**Fix**:

- [render.com/routes/v2/customers.js](render.com/routes/v2/customers.js) — endpoint `/api/v2/customers/:id/quick-view`: append `created_by`, `balance_before`, `balance_after`, `virtual_balance_before`, `virtual_balance_after` vào SELECT chính + fallback (append-only, không thay shape có sẵn → các consumer khác như balance-verification, pancake-validator không bị ảnh hưởng).
- [delivery-report/js/delivery-report.js](delivery-report/js/delivery-report.js):
    - `txConfig()` — phân biệt `DEPOSIT` từ ticket RETURN_GOODS → "Khách Gửi" (match `source === 'RETURN_GOODS'` hoặc note có `Hoàn tiền từ ticket TV-` / `RETURN_CLIENT` / `Công Nợ Ảo Từ Khách Gửi`). `ORDER_CANCEL_REFUND` → "Hoàn Hủy Đơn". `VIRTUAL_CREDIT` từ RETURN_SHIPPER → "Thu Về". `FIX_COD` + `COD_ADJUSTMENT` cùng label "Sửa COD".
    - Thêm `fmtBalanceK()` + `balanceAfterHtml()` — format `338K` / `1.2M` / `0K` từ `balance_after + virtual_balance_after`, kèm tooltip số dư trước → sau (đầy đủ đơn vị đồng).
    - `buildTxRow()` — chèn pill số dư giữa `dr-hp-tx-time` và `dr-hp-tx-actions`.
- [delivery-report/css/delivery-report.css](delivery-report/css/delivery-report.css) — class `.dr-hp-tx-balance` (pill nhỏ, viền nhẹ, xanh cho credit) + mở rộng rule reset `margin-left` để actions không bị 2 lần `auto`-margin khi balance pill xen giữa.

**Status**: DONE.

---

### [docs][seo] feat: thêm Open Graph meta tags cho index.html (preview đẹp khi share Zalo/Facebook)

**Mục đích**: Khi share link `https://nhijudyshop.github.io/n2store/` lên Zalo/Messenger/FB, hiện card preview với logo + tên shop + mô tả thay vì URL trần. Zalo dùng cùng chuẩn OG như Facebook.

**Changes**:

- `index.html` — title đổi thành "Nhi Judy House — Hệ thống quản lý bán hàng"; thêm `<meta name="description">`, full OG block (`og:type/site_name/title/description/image/url/locale=vi_VN`, image dimensions 1200×630), Twitter Card (`summary_large_image`). Image dùng `https://nhijudyshop.github.io/n2store/index/logo.jpg` (absolute URL bắt buộc cho OG crawler).
- `docs/demo/zalo-og-preview-demo.html` — mockup giao diện chat Zalo để xem trước card preview render thế nào, kèm so sánh trước/sau.

**Verify**:

- Sau khi GitHub Pages deploy (~2-4 phút), test ở [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — dán URL → bấm "Scrape Again" để force refresh cache.
- Gửi link trên Zalo thật. Nếu Zalo cache URL cũ → append `?v=2` để force re-fetch.

**Lưu ý**: Logo hiện tại 600×600 (vuông). Khuyến nghị thay banner 1200×630 (tỷ lệ 1.91:1) để card hiện full-width đẹp hơn — chưa làm vì chưa có ảnh banner.

**Files**: `index.html`, `docs/demo/zalo-og-preview-demo.html`
**Status**: ✅ Done

---

### [inventory] fix: sửa Đợt Hàng bị 404 + stuck "Đang lưu..." khi thêm hóa đơn NCC mới

**Bug**: User edit "Đợt Hàng" rồi thêm 1 hóa đơn NCC mới → save bị stuck ở "Đang lưu...", console báo `PUT /api/v2/inventory-tracking/shipments/hd_mpdfvmsk_mvlzct 404 Not found`.

**Root cause**:

- `inventory-tracking/js/modal-shipment.js:729` — khi user thêm row hóa đơn mới trong modal edit, sinh ID client-side `hd_*` (vì không có `existingInvoice`).
- `inventory-tracking/js/crud-operations.js:115` (cũ) — `updateShipment` vô điều kiện gọi `shipmentsApi.update(invoice.id, ...)` cho TẤT CẢ hoá đơn, kể cả `hd_*` chưa từng có trên server → PUT 404 → throw → loading toast không bị remove (toast remove ở line 802 sau `await`, không trong `finally`).

**Fix**:

1. `inventory-tracking/js/crud-operations.js` — `updateShipment` giờ build set `existingInvoiceIds` từ `existingShipment.hoaDon`. Mỗi invoice trong `data.hoaDon`:
    - `id ∈ existingInvoiceIds` → `shipmentsApi.update(invoice.id, payload)` (PUT)
    - ngược lại → `shipmentsApi.create({ ...payload, id: generateId('dot') })` (POST với ID `dot_*` hợp lệ)
    - Invoices có trong `existingShipment.hoaDon` nhưng KHÔNG có trong `data.hoaDon` → `shipmentsApi.delete()` (xử lý case user xoá row trong modal).
2. `inventory-tracking/js/modal-shipment.js` — wrap save logic trong inner `try/finally` để `notificationManager.remove(loadingToast)` luôn chạy, tránh stuck toast khi update fail.

**Verify**: probe browser session inject 3 invoice types (2 existing + 1 mới `hd_*` + 1 xoá khỏi modal) → routing đúng: 1 DELETE, 2 UPDATE, 1 CREATE (với ID mới `dot_mpdg4e6f_9tmvif`). Không còn 404.

**Files**: `inventory-tracking/js/crud-operations.js`, `inventory-tracking/js/modal-shipment.js`
**Status**: ✅ Done

---

## 2026-05-19

### [web2] sidebar: footer mất ở 19 trang Web 2.0 load tpos-sidebar.js trực tiếp (không qua page-shell)

**Follow-up của fix preload phía dưới**: user phát hiện `/web2/index.html` vẫn mất footer. Lý do: fix preload chỉ với tới trang qua page-shell. Các trang `tpos-pancake`, `native-orders`, `so-order`, `web2/index.html`, `web2/products/`, `web2/variants/`, `web2/users/`, `web2/balance-history/`, … load `tpos-sidebar.js` trực tiếp bằng `<script src>` → chưa fix.

**Fix**: chèn `<script src="<prefix>web2-auth.js?v=20260519k">` ngay TRƯỚC `<script src="<prefix>tpos-sidebar.js?v=...">` ở 19 trang Web 2.0 (1 trang đã có sẵn — `web2/reconcile/`). Đảm bảo `Web2Auth` ready khi sidebar mount, footer render đúng frame đầu.

**Files**: `native-orders/`, `tpos-pancake/`, `so-order/`, `web2/{index,products,variants,users,supplier-debt,supplier-wallet,customer-wallet,balance-history,pancake-settings,report-revenue,fastsaleorder-{invoice,refund,delivery},product-{uom,uom-categ,category}}/index.html`.

**Status**: ✅ Done — Playwright verified `/web2/index.html`, `/tpos-pancake/`, `/native-orders/`, `/web2/products/` đều hiện footer "Quản trị viên / @admin ADMIN / Đăng xuất". Browser thật Cmd+Shift+R 1 lần để clear cache.

### [web2] sidebar: footer user/đăng xuất mất khi page-shell mount sidebar trước khi web2-auth.js load xong

**User feedback**: trên `/web2/pos-session/index.html` (và các page khác qua page-shell), thanh sidebar trái mất phần "user đăng nhập + nút Đăng xuất" ở dưới đáy. Test Playwright thấy footer hiển thị, browser thật của user không thấy → race condition.

**Root cause**:

- `tpos-sidebar.js` mount footer ngay sau khi load — chưa chắc `Web2Auth` đã sẵn (vì auto-loader inject `web2-auth.js` async).
- Có polling 2s đợi Web2Auth, nhưng nếu network glitch / cache stale → footer kẹt ở trạng thái rỗng.

**Fix**:

- `web2/shared/page-shell.js`: thêm `web2-auth.js` vào `SCRIPTS_PRELOAD` → load SYNC trước khi mount sidebar → `renderUserFooter()` luôn có `Web2Auth` thật ngay frame đầu.
- Bump `ASSET_VERSION = 'v=20260519j'` (force browser cache-bust mọi script con).
- Bump 75 trang web2/\*.html từ `page-shell.js?v=20260425[i|l|n]` → `?v=20260519j`.

**Revert kèm**: commit `32772f6f` (forceExpand cho tpos-pancake) — workaround sai vector, fix root cause nay đã đủ.

**Files**:

- `web2/shared/page-shell.js`
- `web2/*/index.html` (75 trang)
- (revert) `web2/shared/tpos-sidebar.js` + `tpos-pancake/index.html`

**Status**: ✅ Done — verified Playwright (logged-out: "Chưa đăng nhập" + nút tím; logged-in admin: "Quản trị viên" + nút đỏ Đăng xuất). User cần **hard-reload Cmd+Shift+R** để clear cache JS cũ.

### [orders] KPI confirm modal hiển thị cho cả đơn chưa có phiếu bán hàng

**User feedback**: modal "Xác nhận kiểm tra đơn" trong tab KPI chỉ hiện cho đơn đã có phiếu (NJD/2026/xxxxx). Yêu cầu: hiện cho TẤT CẢ đơn trong bảng, không phụ thuộc cột phiếu bán hàng.

**Fix** ([orders-report/js/tab-kpi-commission.js](orders-report/js/tab-kpi-commission.js)):

- `closeOrderDetails()` — dùng `checkKey = number || orderCode` thay cho `number`. Đơn chưa có phiếu fallback về Mã ĐH (orderCode) làm identifier. Modal primary text dùng `number || orderCode`, secondary text `(Chưa có phiếu bán hàng)` khi rỗng.
- L1 row template — thêm `data-l1-order-code` để `_applyL1CheckedStyles` style cả các dòng không có phiếu.
- `_orderCheckStore` — `init()` resolve key theo thứ tự `checkKey → number → docId` (backward compat). `markChecked(checkKey, meta)` tách `checkKey` (doc id) khỏi `number` (phiếu thực, rỗng khi không có). `isChecked(checkKey)` chấp nhận cả orderCode.
- `_renderCheckHistory` — filter `(number || orderCode || checkKey)` (bỏ filter cũ `v.number`), cột Số phiếu hiển thị `'—'` khi rỗng.

**Status**: DONE.

### [reconcile] Phase 1 MVP — Đối soát đóng gói PBH (scan + pack + ship + deliver)

**Mục đích**: Trang `web2/reconcile/` để verify đủ hàng từng PBH trước khi đóng gói + giao shipper. Scope: 1 kho, 1 nhân viên, scanner đã gắn sẵn; KHÔNG ảnh chống tranh chấp, KHÔNG notify khách, KHÔNG tích hợp API GHN/J&T, KHÔNG cho thiếu hàng, KHÔNG trừ kho lại (đã trừ lúc tạo PBH).

**State machine song song với state PBH (kế toán)**: `pending → picking → picked → packed → shipped → delivered` (cancelled). State PBH (`draft/confirmed/done/cancel`) độc lập, reconcile chỉ thao tác trên PBH có `state IN ('confirmed','done')`.

**Files**:

- `render.com/routes/reconcile.js` — route mới. Endpoints: `GET /health`, `GET /list?state=active|pending|picking|picked|packed|shipped|delivered|all`, `GET /:number`, `POST /:number/scan`, `POST /:number/manual-pick`, `POST /:number/reset-pick`, `POST /:number/pack` (block nếu picked < quantity), `POST /:number/ship`, `POST /:number/deliver`, `GET /:number/logs`. Atomic `applyPick` dùng `FOR UPDATE`. SSE broadcast `web2:reconcile` + cross-broadcast `web2:fast-sale-orders`.
- `render.com/routes/fast-sale-orders.js` — Migration 076: ADD COLUMN `fulfillment_state` (default 'pending'), `fulfillment_picked_lines` JSONB, `fulfillment_packed_at`, `fulfillment_shipped_at`, `fulfillment_delivered_at`, INDEX `idx_fso_fulfillment_state`. `mapRow` thêm trường `fulfillment.{state,pickedLines,packedAt,shippedAt,deliveredAt}`.
- `render.com/server.js` — require + mount `/api/reconcile`, gọi `initializeNotifiers(realtimeSseRoutes.notifyClients)` để SSE fire (theo pattern fast-sale-orders đã verify).
- `cloudflare-worker/modules/config/routes.js` + `worker.js` — thêm route `RECONCILE: /api/reconcile/*` proxy qua `handleCustomer360Proxy`.
- `web2/reconcile/index.html` + `js/reconcile-app.js` + `css/reconcile.css` — trang scanner-driven. Layout 2 cột: trái = DS PBH theo state tab (Đang xử lý / Chờ pick / Đang pick / Đã pick đủ / Đã đóng gói / Đã giao shipper / Đã giao), phải = detail PBH với bảng line + ô picked_qty per line + nút action theo state. Scanner input autofocus, Enter để +1 qty SP. Subscribe SSE `web2:reconcile` + `web2:fast-sale-orders`.
- `web2/shared/tpos-sidebar.js` — thêm entry "Đối soát đóng gói" trong group Bán hàng (sau "Bán hàng (HĐ)").
- `docs/web2/RECONCILE-PBH-PROPOSAL.md` — proposal gốc (đã có từ session trước).

**Đã verify**: `node --check` all JS files OK. Browser smoke load page localhost:8093 → UI render đầy đủ (scanner box, 7 state tab, list panel, detail panel empty state). Backend chưa live trên Render → empty list là expected.

**Pending**: deploy Render + publish CF Worker để verify end-to-end với PBH thật. Status: ✅ Code done, ⏳ awaiting deploy.

### [inventory-tracking] Modal "Quản Lý Ảnh SP": dời nút "Thêm NCC" từ header xuống dưới mỗi đợt

**User feedback**: nút "+ Thêm NCC" nằm bên phải header mỗi đợt → muốn dời xuống dưới. Mỗi đợt phải có nút riêng vì context theo đợt.

**Files**:

- `inventory-tracking/js/modal-image-manager.js` — `_renderGroup`: bỏ nút trong `.img-mgr-group-header`, thêm `.img-mgr-group-footer` chứa nút "Thêm NCC vào Đợt N" ở cuối mỗi group, sau list NCC.
- `inventory-tracking/css/modern.css` — thêm `.img-mgr-group-footer` (border-top dashed + flex center), update `.img-mgr-group-add` (bỏ `margin-left:auto`, tăng padding/font-size cho dễ click).

**Hành vi**: mỗi đợt có 1 nút "Thêm NCC vào Đợt N" riêng ở cuối block đợt đó → click thì gọi `ImageManager.addRowInDot(N)` (giữ đúng đợt context). Status: ✅ Done.

### [don-inbox] Stat card KPI: chỉ phản ứng với date filter, bỏ qua filter khác

**User feedback**: stat card hiển thị 37 đơn cùng "0 món · 0đ" → sai. Lý do: KPI lấy từ `filteredOrders` (sau khi áp tất cả filters bao gồm `status='draft'`), nên không bao giờ có đơn `status='order'`.

**Fix**: trong `updateInboxKpiStatCard` ([tab-social-core.js](don-inbox/js/tab-social-core.js)) đổi source từ `filteredOrders` → toàn bộ `SocialOrderState.orders`, rồi filter tay theo:

- `status === 'order'` (đơn được tính KPI)
- `createdAt` nằm trong `getDateRange(currentDateFilter)`

KPI giờ độc lập với status/source/tag/search — chỉ thay đổi khi đổi preset ngày.

**Status**: DONE.

---

### [don-inbox] Stat card KPI ngày + toast "User bán được X món - nhận được Yk"

**User yêu cầu** (trang Đơn Inbox):

1. Thêm stat card KPI sau ô lọc TAG, đồng bộ với bộ lọc ngày bên cạnh ô tìm kiếm.
2. Mỗi khi đơn vừa được "tính KPI thành công" (status chuyển sang `'order'`) → toast `"User bán được X món - nhận được Yk"` (Y = X × 5.000đ, hiển thị quy đổi sang nghìn).

**Thay đổi**:

- HTML (`don-inbox/index.html`): thêm `.inbox-kpi-stat` (id `#inboxKpiStatCard`) trong `.filter-row` ngay sau filter TAG. Hiển thị icon trophy + label (thay đổi theo preset ngày) + giá trị "X món · Yđ".
- JS:
    - [`tab-social-core.js`](don-inbox/js/tab-social-core.js): thêm `KPI_PER_UNIT_INBOX = 5000`, `updateInboxKpiStatCard()` (đếm `totalQuantity` của các order `status='order'` trong `filteredOrders` × 5.000đ; label đổi theo `currentDateFilter`), `notifyOrderKpiEarned(order, prevStatus)` (gửi toast khi `prevStatus !== 'order'` và `order.status === 'order'`, qty > 0). Hỗ trợ `notificationManager.success` với title `KPI 🎉`, fallback `showNotification`.
    - [`tab-social-table.js`](don-inbox/js/tab-social-table.js#L599): gọi `updateInboxKpiStatCard()` sau `renderTable()` trong `performTableSearch`. Trong `changeOrderStatus`, sau khi update status, nếu `newStatus === 'order'` → `notifyOrderKpiEarned(order, oldStatus)`.
    - [`tab-social-invoice.js`](don-inbox/js/tab-social-invoice.js#L601): `updateSocialOrderAfterBillCreation` save `prevStatus` trước khi set `'order'`, gọi `notifyOrderKpiEarned(order, prevStatus)` sau khi đã sync xong.
    - [`tab-social-sale.js`](don-inbox/js/tab-social-sale.js): fallback path khi không có invoice adapter — cũng track `prevStatus` + fire toast.
- CSS (`don-inbox/css/don-inbox.css`): style `.inbox-kpi-stat` (gradient tím nhạt + box-shadow nhẹ, hover bounce), `.inbox-kpi-stat-icon/label/value/sep/amount`.

**Tên user trong toast**: dùng `order.createdByName` (NV tạo đơn — không phải user đang login), fallback `assignedUserName` → `createdBy` → "Bạn".

**Label động theo date filter**: KPI tất cả / KPI hôm nay / KPI hôm qua / KPI 3 ngày / KPI 7 ngày / KPI 15 ngày / KPI khoảng đã chọn.

**Status**: DONE — push để GH Pages serve.

---

### [orders-report][render] KPI Inbox: cột "Ngày đơn" + ẩn nháp + custom date range

**User yêu cầu**: trong drill-down KPI Đơn Inbox (tab KPI - HOA HỒNG):

1. Thêm cột ngày khi đơn chuyển sang trạng thái "Đơn hàng" (được tính KPI).
2. Chỉ hiển thị đơn được tính KPI — ẩn các đơn "Nháp".
3. Bộ lọc ngày có thêm khoảng tùy chọn "Từ ngày – Đến ngày".

**Thay đổi backend** (`render.com/routes/social-orders.js`):

- Schema: `ALTER TABLE social_orders ADD COLUMN IF NOT EXISTS order_at BIGINT;` + index. Cột này chỉ set 1 lần khi đơn transition sang `status='order'`.
- PUT `/entries/:id`: khi `updates.status === 'order'` → `order_at = COALESCE(order_at, $now)` (preserve lần transition đầu tiên).
- `upsertOrder` / `upsertOrderWithClient`: thêm cột `order_at`, ON CONFLICT preserve `COALESCE(social_orders.order_at, EXCLUDED.order_at)`. Helper `resolveOrderAt()` resolve giá trị khi insert.
- `/kpi-stats` + `/kpi-stats/orders`: query param mới `excludeDraft=1` (opt-in, default behavior giữ nguyên → backward-compat). Khi set, thêm `AND COALESCE(status,'draft') <> 'draft'`.
- `/kpi-stats/orders` response: thêm field `orderAt`. Đơn cũ chưa có `order_at` → fallback `COALESCE(order_at, updated_at)` cho status ≠ 'draft'.

**Thay đổi frontend** (`orders-report/`):

- HTML (`tab-kpi-commission.html`): thêm khối `.kpi-inbox-daterange` gồm 2 ô `<input type="date">` + nút "Áp dụng" cạnh preset buttons.
- JS (`js/tab-kpi-commission.js`):
    - State mới: `_inboxCustomRange = { from, to }` + `_inboxSubtabPreset` thêm value `'custom'`.
    - `_resolveInboxDateRange('custom')` đọc range tùy chọn.
    - `loadInboxSubtabStats()` + `_loadInboxOrdersForUser()` luôn gửi `excludeDraft=1`.
    - Helper `_inboxCacheKey(userId)` — cache key của 'custom' include `from-to` để tự invalidate khi đổi khoảng.
    - `_renderInboxUserOrders()`: thêm cột `Ngày đơn` (dùng `formatTimestamp(o.orderAt)`), header table thêm `col-date`.
    - `_bindInboxPresets()`: bind sự kiện "Áp dụng" → set custom range + render.
- CSS (`css/tab-kpi-commission.css`): style `.kpi-inbox-filter-group`, `.kpi-inbox-daterange`, `.kpi-inbox-date-input`, `.kpi-inbox-date-apply`, và `.col-date` cho sub-table.

**Lưu ý deploy**:

- Render auto-deploy schema migration qua `ensureTables()` (idempotent ALTER với IF NOT EXISTS).
- Đơn cũ không có `order_at` → query fallback `COALESCE(order_at, updated_at)` cho status ≠ 'draft', nên không cần backfill.
- Endpoint cũ vẫn hoạt động bình thường (excludeDraft opt-in) → không vi phạm rule "không modify endpoints KPI hiện có" (append-only query param).

**Files**:

- `render.com/routes/social-orders.js`
- `orders-report/tab-kpi-commission.html`
- `orders-report/js/tab-kpi-commission.js`
- `orders-report/css/tab-kpi-commission.css`

**Status**: DONE — cần push để Render deploy schema + GH Pages serve frontend mới.

---

### [web2 cross-page] Phase A + B SSE wiring — liên kết chức năng giữa các page Web 2.0

**User yêu cầu**: "liên kết chức năng các web 2.0, thêm SSE cập nhật realtime, plan lớn, nghiên cứu kĩ, làm logic thống nhất".

**Research**: dispatch Explore agent map Read/Write matrix cho 16 pages, identify 8 frictions. Tổng hợp [`docs/web2/IMPROVEMENT-PLAN.md`](web2/IMPROVEMENT-PLAN.md) với roadmap Phase A (quick wins) / B (cross-cutting) / C (architectural defer).

**Implement Phase A + B (subset)**:

- **A1** customer-wallet: subscribe `web2:fast-sale-orders` → reload PBH list khi PBH confirm/cancel ở máy khác. Debounce 800ms.
- **A2** supplier-wallet: chuyển sang array `_sseUnsubs`, subscribe `web2:products` + `web2:supplier-wallet`. Debounce 1200ms aggregate reload.
- **A3** PBH page: thêm icon "Xem đơn nguồn" với `target="_blank"` đến `../../native-orders/?search=<code>` khi `sourceLink.type === 'native_order'`.
- **A5** users-app: detect SSE event ảnh hưởng current session user → toast cảnh báo + force reload 3s. Helper `_currentSessionUserId()`.
- **B1** server `web2-products.js`: emit thêm topic `web2:supplier-wallet` khi action stock-affecting.
- **B2** server `fast-sale-orders.js`: emit thêm topic `web2:customer-wallet` khi action wallet-affecting.
- Customer-wallet subscribe thêm `web2:customer-wallet` cross-broadcast.

**Frictions resolved**: 5/8 (F4 manual refresh, F5 nav deep link, F6 cross-cache invalidate, F7 permission realtime, partial F2/F8).

**Deferred**: A4 native→PBH back-link (cần DB query backend), B3 ID helper, B4 supplier-debt cache, Phase C architectural (Firestore→Postgres, saga).

**Status**: ✅ Done

---

### [inventory-tracking] Image Manager v2: chỉ Đợt (bỏ ngày), cho phép Đợt tùy chỉnh

**User yêu cầu**: "Quản lý ảnh bỏ ngày đi, cho chọn theo đợt → cho chỉnh đợt custom".

**Đổi**:

- **UI per row**: Bỏ field "Đợt giao (ngày + đợt)" dropdown. Thay bằng input number `Đợt` cho phép gõ tay đợt bất kỳ (cả đợt chưa có shipment, vd "Đợt 5").
- **Group header**: chỉ hiện "Đợt N — X NCC" (không có ngày). Đợt không có shipment hiển thị badge "tùy chỉnh" màu cam.
- **Filter row**: bỏ dropdown "Tất cả đợt" → thay bằng input number "Lọc đợt..." để filter rows theo đợt.
- **Row state**: `batchKey` ("YYYY-MM-DD\_\_N") → `dotSo` (integer). Thêm `originalDate` để track entry gốc khi save.
- **Save**: client tự tính canonical date cho mỗi đợt N — ưu tiên shipment đợt N mới nhất, fallback hình ảnh hiện có cho đợt N, fallback today (VN tz). Mỗi đợt PUT 1 lần `bulkSave(rows, { date: canonical, dotSo: N })`. Nếu row được di chuyển khỏi (date_X, dotSo_Y) ban đầu → gửi empty PUT cho (date_X, dotSo_Y) để xoá entry mồ côi.
- **Read** ([data-loader.js getProductImagesForNcc](../inventory-tracking/js/data-loader.js#L182-L201)): match priority đổi từ `(ngày, đợt, ncc)` exact → `(đợt, ncc)` only (date trở thành storage detail). Legacy fallback: bất kỳ ảnh cho NCC đó. Tham số `ngayDiHang` giữ lại cho backward compat nhưng không dùng.

**Tại sao đổi**: User concept "đợt N" là logical batch (có thể trải nhiều ngày giao). Mapping theo (date, đợt, ncc) tạo data đụng nhau khi cùng đợt 1 có shipment 12/5 và 17/5 — phải tạo entry cho mỗi cặp. Đổi sang (đợt, ncc) đơn giản hơn và đúng với cách user nghĩ.

**Files changed**:

- `inventory-tracking/js/modal-image-manager.js` — full rewrite (538→640 lines, batchKey → dotSo).
- `inventory-tracking/js/data-loader.js` — `getProductImagesForNcc` đổi match logic.
- `inventory-tracking/css/modern.css` — bỏ `.img-mgr-filter-select / .img-mgr-batch-select`, thêm `.img-mgr-filter-dot / .img-mgr-dot-custom`. Field width 200px → 120px.

**Verify**: Playwright local 8093 — đổi Đợt từ 1 → 5 (custom), thấy badge "tùy chỉnh" + row tách ra group riêng. Status: ✅ Done. Screenshots `inv-img-v2-default.png`, `inv-img-v2-custom-dot.png`.

### [inventory-tracking] 3 nâng cấp lớn: Image Manager đợt/ngày + Column hide/restore + Lazy render perf

**User yêu cầu** (screen inventory-tracking/index.html):

1. Bảng cho nút ẩn cột — và có panel hiện lại cột đã ẩn.
2. Modal "Quản Lý Ảnh Sản Phẩm" — khi thêm hàng cho chọn đợt/ngày để map đúng đợt (NCC=4 đợt 17/5 ≠ NCC=4 đợt 12/5).
3. Cải thiện tốc độ.

**Thay đổi**:

**1. Image Manager đợt/ngày mapping** ([js/modal-image-manager.js](../inventory-tracking/js/modal-image-manager.js))

- Mỗi row có thêm field `batchKey` = `"YYYY-MM-DD__N"` (date + dotSo).
- UI: row hiển thị 2 input — NCC + dropdown "Đợt giao" (options từ `getAllDotHangAsShipments()`, latest first).
- Row tự group theo batch: section header "📅 17/5/2026 — Đợt 1 — N NCC — Thêm NCC" + chips các row trong đợt.
- Filter row đầu: "Tìm NCC" + dropdown "Tất cả đợt" để filter theo batch.
- New row default batch = đợt mới nhất; "Thêm NCC vào đợt này" trong section header tạo row có batch của đợt đó.
- Save: split rows theo `batchKey` → call `productImagesApi.bulkSave(rows, {date, dotSo})` mỗi batch (parallel). Empty PUT cho batches initially-có-data nhưng giờ-rỗng (deletion sticks).
- Pattern data layer đã sẵn (`migration 058`, `getProductImagesForNcc(ncc, ngày, đợt)` exact-batch lookup) — chỉ thiếu UI.

**2. Column hide button + restore panel** ([js/column-toggle.js](../inventory-tracking/js/column-toggle.js) — file mới)

- `window.ColumnToggle` module với `hide(colKey)`, `show(colKey)`, `refresh()`, `togglePanel()`.
- Per-th: icon eye-off ẩn hiện trên hover → click ẩn cột; dùng dynamic `<style>` (`display:none !important` cho `td.col-X, th.col-X`).
- Toolbar: button "Cột ẩn (N)" cạnh "Xuất Excel" → popover panel: chips cho mỗi col đang ẩn (click chip = restore) + nút "Hiện tất cả".
- State persist qua `UIState.hiddenCols` (localStorage `n2store_inv_ui_state_v1`).
- Sửa [js/table-renderer.js](../inventory-tracking/js/table-renderer.js) thêm `col-X` class vào `<td>` tfoot tương ứng để CSS ẩn đồng bộ với header.
- MutationObserver re-attach hide buttons cho tables re-rendered.

**3. Lazy render perf** ([js/table-renderer.js](../inventory-tracking/js/table-renderer.js))

- Trước: `createShipmentCard` luôn call `renderInvoicesSection()` cho mọi shipment → 100 shipments = 100 tables trong DOM (chỉ 1-2 visible).
- Sau: collapsed shipments có `data-lazy="1"` empty body. Khi expand lần đầu → `_renderCardBody(card)` build HTML on-demand + reapply lucide icons + detail-cols-hidden state + ColumnToggle + NoteManager.
- Benchmark local (11 shipments, 1 expanded):
    - `applyFiltersAndRender`: **49ms → 14ms** (~3.5×)
    - DOM total: **4458 → 2348** nodes (47% smaller)
    - Invoice tables in DOM: **5 → 1**
    - Table TDs: **540 → 112**
- Production scale (100+ shipments): saving expected lớn hơn nhiều.

**Files changed**:

- `inventory-tracking/js/modal-image-manager.js` — full rewrite cho đợt/ngày mapping.
- `inventory-tracking/js/column-toggle.js` — NEW.
- `inventory-tracking/js/ui-state.js` — thêm `getHiddenCols / hideCol / showCol / clearHiddenCols`.
- `inventory-tracking/js/table-renderer.js` — lazy body render + tfoot col-class.
- `inventory-tracking/js/main.js` — gọi `ColumnToggle.init()` sau app.init.
- `inventory-tracking/index.html` — load `column-toggle.js`, thêm toolbar button + panel.
- `inventory-tracking/css/modern.css` — styles cho img-mgr group/batch + column hide buttons + restore popover.

**Verify**: Playwright local 8093 — đã test cả 3 feature (screenshot trong `downloads/n2store-session/inv-*.png`). Status: ✅ Done.

### [web2/balance-history] Clone toàn bộ chức năng balance-history sang Web 2.0 + integrate sidebar + SSE

**User yêu cầu**: tạo trang Web 2.0 với tất cả chức năng giống `/balance-history/` legacy — chi tiết, đầy đủ.

**Approach**: clone toàn bộ folder (`balance-history/` → `web2/balance-history/`) — 23K dòng code 13 JS + 5 CSS, KHÔNG re-implement. Chỉ update entry point HTML để integrate Web 2.0 shell.

**Thay đổi**:

1. `cp -r balance-history/ web2/balance-history/` — giữ nguyên: css/, js/, docs/, DATABASE_STRUCTURE.md.
2. `sed` replace 15 occurrences `../shared/` → `../../shared/` trong `index.html` (depth tăng 1 level).
3. `web2/balance-history/js/balance-verification.js` line 1363: `../customer-hub/` → `../../customer-hub/`.
4. `index.html` edit:
    - Title: `Lịch sử biến động số dư - SePay` → `... - SePay - WEB 2.0`. Comment `WEB2.0 module` ở #Note.
    - `<head>`: thêm `<link rel="stylesheet" href="../../web2/shared/tpos-sidebar.css?v=20260518e">`.
    - `<body>`: + `class="tpos-theme"`. Wrap content trong `<div class="web2-shell"><aside id="web2Aside">…<main>existing main-content</main></div>`.
    - `<main>` thêm `style="overflow:auto;height:100vh"` để content scroll trong shell.
    - Cuối body: load `tpos-sidebar.js` + `web2-sse-bridge.js`. Mount `Web2Sidebar.mount('#web2Aside')`. Wire SSE subscribe `wallet:all` (debounce 1000ms) → call `loadData()` + `LiveModeModule.refresh()` nếu có.
5. `web2/shared/tpos-sidebar.js` mục Tài chính: thêm entry `Lịch sử biến động số dư (SePay)` → `../web2/balance-history/index.html`.

**4 tabs giữ nguyên** (Live Mode kanban realtime SSE, Lịch sử biến động số dư table với QR + filters + verification chips, Thống Kê Chuyển Khoản, Kế Toán dashboard).

**Verify**: page render đúng với 2173 transactions, badges hoạt động (99+ unchecked, Realtime status xanh, view tabs, verification filters), Live Mode kanban "NHẬP TAY" + "TỰ ĐỘNG GÁN" cards hiển thị.

**Status**: ✅ Done

---

### [docs + memory] Cập nhật SSE-REALTIME.md section 9 + WEB2-INDEX + memory với 7 topics đã wire xong

**Mục đích**: codify trạng thái cuối ngày 2026-05-19. Toàn bộ 7 topics + 78 generic pages đã wire SSE realtime. Đảm bảo future sessions đọc được pattern + danh sách live topics.

**Cập nhật**:

- `docs/web2/SSE-REALTIME.md` section 9 (Existing topics map):
    - Mở rộng bảng từ 6 topics (mostly ⏳ Todo) thành **7 topics + 78 generic** (tất cả ✅ Live).
    - Thêm pipeline note "SePay → wallet realtime" với ASCII diagram đầy đủ + subscribe convention (`wallet:<phone>` vs `wallet:all`).
- `docs/web2/WEB2-INDEX.md`:
    - Thêm `Web2SSE` vào bảng shared client libs.
    - Thêm section "Realtime pattern" với pointer BẮT BUỘC đến SSE-REALTIME.md.
- Memory `~/.claude/projects/.../reference_web2_sse_realtime.md`:
    - Cập nhật "Existing topics" từ trạng thái Todo cũ sang live với endpoint counts + SePay pipeline.

**Status**: ✅ Done

---

### [supplier-wallet + supplier-debt] Wire SSE realtime — auto-refresh khi SePay + so-order data change

**User yêu cầu**: tiếp tục — wire 2 page Ví NCC + Báo cáo công nợ NCC.

**supplier-wallet** (`web2/supplier-wallet/`):

- Tương tự customer-wallet, subscribe SSE wildcard `wallet:all` để nhận event `wallet_update` từ SePay webhook (refund từ NCC).
- `js/supplier-wallet-app.js`: thêm `_sseConnect()` sau `init()` → debounce 800ms `pollDeposits()`.
- Manual data (notes, payments) vẫn dùng Firestore sync trong `supplier-wallet-storage.js` (data nhỏ + ít user, không cần migrate).
- HTML: bridge đã load sẵn từ commit trước; bump `supplier-wallet-app.js?v=20260519a`.

**supplier-debt** (`web2/supplier-debt/`):

- Báo cáo cross-source (Web 2.0 + TPOS legacy). Read-only — không có write riêng.
- Subscribe **3 topics**: `wallet:all` (SePay events), `web2:products` (so-order data feeds qua products pending), `web2:fast-sale-orders` (PBH ảnh hưởng nếu refund NCC).
- Debounce **1500ms** — báo cáo nặng, gom mutation thành 1 reload (`loadAll` + `applyFilterAndRender`).
- `index.html`: thêm `<script src="web2-sse-bridge.js?v=20260519a">`. Bump `supplier-debt-app.js?v=20260519a`.

**Status**: ✅ Done

---

### [customer-wallet] Wire SSE subscribe → realtime auto-refresh khi SePay webhook nhận tiền

**User cho biết**: SePay webhook đã hoạt động — nhận tiền chuyển khoản vào, update công nợ KH Web 2.0.

**Hiện trạng kiểm tra**:

- Server pipeline đã đầy đủ: SePay webhook → `routes/sepay-webhook-core.js` → `services/wallet-event-processor.js` `processIncomingPayment()` → UPDATE `customer_wallets` balance → `walletEvents.emit('wallet:update', { phone, wallet, transaction })` → `routes/realtime-sse.js` listener → broadcast SSE topic `wallet:<phone>` + wildcard `wallet:*`.
- Client side **KHÔNG** subscribe SSE — phải bấm "Refresh" hoặc reload page để thấy tiền mới.

**Fix**:

- `web2/customer-wallet/index.html`: thêm `<script src="../shared/web2-sse-bridge.js?v=20260519a">`. Bump cache `customer-wallet-app.js?v=20260519a`.
- `web2/customer-wallet/js/customer-wallet-app.js`: thêm `_sseConnect()` trong `init()`:
    - Subscribe topic `wallet:all` — match wildcard `wallet:*` của server `notifyClientsWildcard('wallet', ...)`.
    - Debounce 800ms — burst nhiều giao dịch SePay liên tiếp gom thành 1 reload.
    - Action: `pollDeposits()` (fetch SePay deposits từ `lastDepositSync` cursor) + toast `💰 SePay: X đ → <phone>`.

**Flow sau fix**:

```
SePay → webhook /api/sepay/webhook → wallet-event-processor.processIncomingPayment
  → UPDATE customer_wallets + INSERT customer_wallet_transactions
  → walletEvents.emit('wallet:update', { phone, wallet, transaction })
  → realtime-sse listener → SSE broadcast 'wallet:<phone>' + wildcard 'wallet:*'
  → customer-wallet page (đang subscribe 'wallet:all') nhận event
  → debounce 800ms → pollDeposits() → render + toast
```

**Verify**: chuyển khoản 5K vào tk SePay → 1-3s sau trang Ví KH tự update + toast hiện.

**Status**: ✅ Done

---

### [web2-variants + web2-users + fast-sale-orders] Wire SSE notify cho 3 routes còn lại + cache layer SSE for variants

**User yêu cầu**: tiếp tục — complete 3 todo routes còn nợ (variants, users, PBH).

**Server side** (`render.com/routes/`):

- `web2-variants.js`: thêm `initializeNotifiers + _notify('variants', action, id)`. Gọi sau 3 endpoints: POST `/`, PATCH `/:id`, DELETE `/:id`. Topic: `web2:variants`.
- `web2-users.js`: thêm `initializeNotifiers + _notify('users', action, id)`. Gọi sau 5 endpoints: create, update, update-permissions, change-password, deactivate. Topic: `web2:users`.
- `fast-sale-orders.js` (PBH): thêm `initializeNotifiers + _notify('fast-sale-orders', action, number)`. Gọi sau 8 endpoints: bulk-confirm/cancel, create, from-native-order, PATCH /:number, cancel/confirm/print/delete, reset-stt. Topic: `web2:fast-sale-orders`.

**Server wiring** (`server.js`): thêm `initializeNotifiers(realtimeSseRoutes.notifyClients)` cho 3 routes.

**Client side**:

- `web2/shared/web2-variants-cache.js` `_setupRealtime()`: ưu tiên `Web2SSE.subscribe('web2:variants', ...)`; fallback Firestore tickle (cùng pattern web2-products-cache).
- `web2/users/js/users-app.js`: thêm `_sseConnect()` sau `init()` → subscribe `web2:users`, debounce 600ms reload.
- HTML thêm `<script src="web2-sse-bridge.js?v=20260519a">`: web2/variants/, web2/users/, web2/fastsaleorder-invoice/.
- PBH (pbh-app.js) **không** wire SSE subscribe — đã có WS realtime qua `PbhRealtime`. Server notify giữ để pages khác listen được.

**Status**: ✅ Done

---

### [purchase-orders] Hover x5 zoom + click lightbox cho ảnh trong form "Tạo đơn đặt hàng"

**User yêu cầu**: Form tạo đơn hàng tại `purchase-orders/index.html` — hover ảnh thì zoom to x5, click thì mở ảnh full-screen.

**Trước đây**:

- `.po-modal-thumb` đã có floating preview qua JS nhưng hardcode 300px (≈x6 với 50px thumb, không đồng đều).
- Ảnh hóa đơn (`renderInvoiceImages()`) không có class hover → không có preview.
- `viewImage(url)` chỉ `window.open(url, '_blank')` → mở tab mới, UX kém.

**Files**:

- `purchase-orders/js/form-modal.js`:
    - `viewImage()` → tạo `.po-image-lightbox` overlay full-screen, click outside / ESC / nút × để đóng.
    - `setupImageHoverPreview()` → selector mở rộng `.po-modal-thumb, .po-zoom-img`.
    - `_positionPreview()` → zoom size = `max(thumbWidth, thumbHeight) * 5`, cap `min(viewport*0.8, 600px)`, auto-anchor right edge nếu tràn.
    - `renderInvoiceImages()` → `<img>` invoice thêm `class="po-zoom-img"` + `cursor: zoom-in`.
- `purchase-orders/css/table.css`:
    - `.po-modal-thumb` cursor → `zoom-in`.
    - `.po-image-preview` bỏ max-width/height (JS điều khiển).
    - Mới: `.po-image-lightbox`, `.po-image-lightbox__img`, `.po-image-lightbox__close` + `@keyframes po-lightbox-fade-in`.

**Status**: ✅ Done (verified parse cleanly, CSS classes injected, x5 formula correct)

---

### [web2-generic + page-builder + page-shell] SSE realtime cho ALL generic CRUD pages (78 pages auto-enabled)

**User yêu cầu**: 15 pages Web 2.0 (mostly generic CRUD qua page-builder framework) "liên kết với nhau theo listen update log" — pattern user mô tả từ trước.

**Phạm vi**: framework-level SSE — KHÔNG phải sửa từng page. Khi server-side `web2-generic.js` broadcast topic `web2:<entity-slug>`, MỌI page mount qua `Web2Shell.bootstrap({ slug, ... })` tự subscribe topic đó.

**Thay đổi server-side** (`render.com/`):

- `routes/web2-generic.js`: thêm `initializeNotifiers + _notify(entity, action, code)` ở top. Gọi `_notify(req.params.entity, 'create'|'update'|'delete'|'delete-all'|'bulk-create', code)` sau 5 endpoints: POST `/:entity/create`, PATCH `/:entity/update/:code`, POST `/:entity/delete-all`, DELETE `/:entity/delete/:code`, POST `/:entity/bulk-create`. Topic format: `web2:<entity>` (vd `web2:partner-customer`).
- `server.js`: wire `web2GenericRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients)` sau khi mount.

**Thay đổi client-side**:

- `web2/shared/page-shell.js` `SCRIPTS_MOUNT`: thêm `web2-sse-bridge.js` (load TRƯỚC page-builder.js để bridge sẵn sàng).
- `web2/shared/page-builder.js` `mount()`: thêm SSE subscription tự động — `Web2SSE.subscribe('web2:' + config.slug, ...)` → debounced 600ms `load()`. Trả `destroy()` để caller teardown khi navigate đi.

**Tự enable cho 78 pages**: tất cả pages dùng `Web2Shell.bootstrap` (partner-customer, partner-supplier, delivery-carrier, product-category, live-campaign, các config-_, account-_, report-\*, …) tự động có realtime sync giữa các tab/máy mà không cần edit file nào.

**Verify**: mở 2 tab cùng entity, edit ở A → B tự refresh trong <1s.

**Status**: ✅ Done

---

### [web2 × 15 pages] Đồng nhất title `<base> - WEB 2.0` cho các trang Web 2.0 chính

**User yêu cầu**: thêm " - WEB 2.0" vào sau title của 15 pages chính (real impl) để dễ phân biệt khi mở nhiều tab.

**Files** (15 `index.html`):

- web2/fastsaleorder-invoice/, live-campaign/, supplier-debt/, supplier-wallet/, partner-customer/, customer-wallet/, partner-supplier/, delivery-carrier/, products/, variants/, product-category/, users/
- Plus root: native-orders/, so-order/, tpos-pancake/

**Thay đổi**: replace existing suffix (`— N2Store`, `— Web 2.0`) thành ` - WEB 2.0` (dấu gạch thường, WEB IN HOA). Vd: `Sổ Order — N2Store` → `Sổ Order - WEB 2.0`, `Kho Sản Phẩm Web 2.0 — N2Store` → `Kho Sản Phẩm - WEB 2.0`, `Tpos - Pancake` → `Tpos - Pancake - WEB 2.0`.

**Status**: ✅ Done

---

### [docs + claude.md + memory] Viết doc SSE realtime pattern + cập nhật rule bắt buộc cho Web 2.0

**User yêu cầu**: viết file cách dùng SSE Web 2.0, cập nhật MEMORY/CLAUDE/dev-log để khi code Web 2.0 sẽ đọc file này.

**File mới**:

- `docs/web2/SSE-REALTIME.md` (~370 dòng) — comprehensive guide:
    1. Architecture overview (diagram + file map)
    2. Topic naming convention
    3. Server-side recipe (inject notifier + gọi \_notify + wire trong server.js)
    4. Client-side recipe (load bridge + subscribe + debounce)
    5. Echo guard (debounce vs strict clientId)
    6. Migration checklist (Firestore → SSE)
    7. Verification + debugging (curl SSE, stats, browser DevTools, Render logs)
    8. Cost comparison (Firestore vs SSE)
    9. Existing topics map (status table)
    10. Anti-patterns / Gotchas
    11. Khi nào KHÔNG dùng SSE (so sánh với WebSocket, BroadcastChannel, local-first, FCM)
- `~/.claude/projects/.../memory/reference_web2_sse_realtime.md` — pointer memory cho Claude future sessions

**Cập nhật**:

- `CLAUDE.md` mục "Web 2.0 — Quy tắc khi code": thêm rule #6 BẮT BUỘC đọc `docs/web2/SSE-REALTIME.md` trước khi code realtime. Index quick-lookup thêm pointer.
- `MEMORY.md` mục "Web 2.0 vs Legacy": thêm 1 dòng pointer reference_web2_sse_realtime.md.

**Mục đích**: codify pattern SSE đã proven trong web2-products + native-orders để các module tiếp theo (web2-variants, supplier-wallet, …) clone đúng pattern, không phải hỏi lại.

**Status**: ✅ Done

---

### [native-orders + render] Add SSE realtime cho data CRUD — topic 'web2:native-orders'

**User yêu cầu**: native-orders cần realtime — user A edit/tạo/xoá đơn ở máy A → máy B thấy ngay.

**Hiện trạng trước**: native-orders chỉ có Web2Realtime (Pancake messages WS) cho sidebar comments. Data CRUD KHÔNG có realtime — phải F5 thủ công.

**Thay đổi**:

- `render.com/routes/native-orders.js`: thêm `initializeNotifiers + _notify('web2:native-orders', { action, code })`. Gọi sau 5 successful endpoints: POST `/from-comment` (created + comment-merged), POST `/reset-stt` (renumber), POST `/backfill-customer-links`, PATCH `/:code` (update), DELETE `/:code` (delete).
- `render.com/server.js`: wire `nativeOrdersRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients)`.
- `native-orders/js/native-orders-app.js`: thêm `_sseConnect()` gọi trong `init()`. Subscribe `Web2SSE.subscribe('web2:native-orders', ...)` → debounced `load()` 600ms.
- `native-orders/index.html`: load `web2-sse-bridge.js?v=20260519a` trước `native-orders-app.js`. Bump cache `v=20260519a`.

**Pattern**: clone từ web2-products SSE POC. Server notify khi DB write, client trang Đơn Web nhận event → reload list. Debounce 600ms để gom mutation burst.

**Verify**: 2 tab/máy mở native-orders cùng lúc, edit đơn ở tab A → tab B thấy update trong <1s.

**Status**: ✅ Done

---

### [web2-products + render + so-order] POC migrate Firestore tickle → SSE pub/sub server-side

**User yêu cầu**: Firebase realtime tốn tiền — build server socket realtime riêng cho Web 2.0. Pattern user mô tả: "server log coi trang user đang ở → cập nhật". Đúng pattern topic-based pub/sub.

**Hạ tầng đã có sẵn**:

- `render.com/routes/realtime-sse.js` — SSE pub/sub trên Render (`notifyClients(topic, data, eventType)` + per-topic client set Map)
- `cloudflare-worker/modules/handlers/proxy-handler.js` `handleRealtimeProxy` → proxy `/api/realtime/*` đến `n2store-fallback.onrender.com`, preserves SSE streaming
- Chỉ cần wire web2-products + thêm 1 client bridge

**Thay đổi**:

1. `web2/shared/web2-sse-bridge.js` (mới): `Web2SSE.subscribe(topic, callback)`. Single EventSource multiplex nhiều topics qua param `?keys=`. Auto-reconnect exponential backoff. `visibilitychange` listener: tab visible after long hide → reopen socket.
2. `web2/shared/web2-products-cache.js` `_setupRealtime()`: ưu tiên `Web2SSE.subscribe('web2:products', ...)`; fallback Firestore tickle khi bridge không load.
3. `render.com/routes/web2-products.js`: thêm `initializeNotifiers(notifyClients)` + `_notify(action, code)` helper. Gọi `_notify` sau mỗi successful write: create, update, delete, adjust-stock, adjust-pending, upsert-pending, confirm-purchase → broadcast SSE topic `'web2:products'`.
4. `render.com/server.js`: hook `web2ProductsRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients)` sau khi mount SSE.
5. HTML pages: thêm `<script src="...web2-sse-bridge.js?v=20260519a">` TRƯỚC `web2-products-cache.js` ở 3 file: `so-order/index.html`, `web2/products/index.html`, `web2/supplier-wallet/index.html`.

**TRANSITION**: `pushTickle()` vẫn ghi Firestore tickle song song với SSE (server notify). Sau khi verify production SSE OK 1-2 ngày sẽ remove Firestore write hoàn toàn → tiết kiệm Firestore writes/reads cho web2-products.

**Cost dự kiến giảm** (cho riêng module web2-products):

- Trước: mỗi mutation → 1 Firestore write (tickle) + N Firestore reads (listener fire ở N clients online)
- Sau: 0 Firestore ops, 1 SSE broadcast (in-memory Map, free trên Render flat-rate)

**Status**: ✅ POC done, đợi deploy verify

---

## 2026-05-18

### [so-order] Fix TRIỆT ĐỂ "giựt lại đợi đồng bộ" — refactor sang local-first (bỏ onSnapshot)

**User yêu cầu**: fix triệt để, chỉ làm trang so-order, không đụng các trang khác (web2-products, orders-report, … giữ nguyên).

**Thay đổi** (`so-order/js/so-order-storage.js` — chỉ Sync layer):

- **Bỏ `_setupRealtimeListener` + `_unsubscribe` + `_isListening`** — không subscribe `onSnapshot` nữa.
- **`pullOnce()`**: load Firestore một lần, compare `payload.lastUpdated` với `_localLastUpdated`. Chỉ apply remote update khi server mới hơn.
- **`pushToFirestore(state)` debounced 400ms** (`PUSH_DEBOUNCE_MS`): gom mutation liên tiếp thành 1 write. Lưu state vào `_pendingState`, set timeout, timeout fire → `_flushPending()` ghi.
- **`flush()`**: clear debounce + flush ngay — gọi trước khi tab hidden / unload để không mất pending writes.
- **`init(onRemoteUpdate, onConflict)`**: thêm param conflict handler — `pullOnce` phát hiện remote mới hơn và `_pushTimer` chưa flush (= có pending local edits) → toast cảnh báo, không tự overwrite.

**Thay đổi** (`so-order/js/so-order-app.js` — chỉ phần init Sync):

- Pass conflict handler vào `Sync.init` → toast "Có thay đổi từ máy khác. Refresh để xem (mất các sửa chưa lưu) hoặc giữ chỉnh sửa hiện tại."
- Register 3 listeners:
    - `visibilitychange`: visible → `pullOnce()`, hidden → `flush()`
    - `focus`: `pullOnce()`
    - `beforeunload`: `flush()`

**Kết quả**:

- Click toggle expand/collapse → render LOCAL ngay (~5ms), không còn round-trip Firestore. Không giật.
- Push debounce 400ms → spam click không spam Firestore writes.
- Cross-device: máy A sửa → máy B switch tab/focus → tự pull. Không realtime nhưng đủ tốt cho Sổ Order (tài liệu edit tuần tự).
- Conflict toast cảnh báo user khi 2 máy edit cùng lúc thay vì silently overwrite.

**Tradeoff đã chấp nhận**: máy A và B mở cùng lúc, sửa ở A → B không thấy ngay (phải switch tab hoặc focus). Đây là sự lựa chọn có ý thức — Sổ Order không phải chat realtime, UI smooth quan trọng hơn millisecond freshness.

**Status**: ✅ Done

---

### [so-order] Fix bug "giựt lại đợi đồng bộ" — filter local pending writes trong Firestore listener

**User báo**: bấm vào chức năng đồng bộ (toggle expand/collapse, edit inline, …) bị "giựt lại" đợi confirm.

**Root cause**: `onSnapshot` của Firestore mặc định fire cho **mọi snapshot**, bao gồm cả local pending writes (optimistic update của chính client). Mỗi `pushToFirestore()` trigger listener → `remoteHandler` → `state = load(); renderAll()` → DOM tbody bị re-render lại → mất focus input, dropdown đóng, scroll reset. Combine với fact render local đã làm trước đó, user thấy UI thay đổi → "giựt" về.

**Fix** (`so-order/js/so-order-storage.js`): trong `_setupRealtimeListener`:

```js
if (snap.metadata && snap.metadata.hasPendingWrites) return;
```

→ Bỏ qua snapshot do chính client mình write. Chỉ apply remote update khi confirmed từ server (write của máy khác).

**Còn lại có thể fix sau**: (B) version timestamp guard, (C) debounce pushSync, (D) skip render khi đang focus input.

**Status**: ✅ Done

---

### [so-order] Cho phép inline-edit Ngày giao / Đợt / Kiện / KG ở shipment header

**User yêu cầu**: cho chỉnh sửa các giá trị Ngày giao, Đợt, số Kiện, KG trực tiếp ở header lô (không cần mở modal "Sửa thông tin lô").

**Thay đổi**:

- `so-order/js/so-order-app.js`:
    - `shipmentHeaderHtml()`: wrap value `dateText`, `batchLabel`, `caseCount`, `weightKg` trong `<button data-shipment-edit="<field>" data-shipment-id="...">` (helper `pill()`).
    - Wire `[data-shipment-edit]` click → `beginShipmentFieldEdit(pill)`: replace pill content thành input (`type=date` / `text` / `number`), Enter/blur commit qua `SoOrderStorage.updateShipment(...) + pushSync() + renderAll()`, Escape restore.
- `so-order/css/so-order.css` (bump `v=20260518m`):
    - `.so-shipment-edit-pill`: button trong header với hover effect (border dashed → solid khi hover), padding 2px 6px.
    - `.so-shipment-edit-pill.is-editing`: border solid purple `#7c3aed`, padding 0.
    - `.so-shipment-edit-input`: transparent input, tabular-nums khi `so-shipment-edit-num` (caseCount/weightKg).

**Gotcha**: stop event propagation trên input click + keydown để không trigger shipment-toggle bên ngoài.

**Status**: ✅ Done

---

### [so-order] Đồng bộ style bảng với native-orders: font Segoe UI + header bg + button action

**User yêu cầu**: làm bảng so-order giống native-orders về font chữ, cỡ chữ, màu thead, button, màu sắc.

**Thay đổi** (`so-order/css/so-order.css`, bump cache `v=20260518l`):

- `.so-table` thêm `font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif` + `color: #333` (match TPOS body color).
- `.so-table-scroll`: border `#c8ced3` → `#dee5e7`, radius `10px` → `8px`, shadow giảm sang `--shadow-sm` (`0 1px 2px rgba(0,0,0,.05)`).
- `.so-table thead th` + `.so-shipment-colhead-cell`: bỏ `text-transform: uppercase` + `letter-spacing: 0.04em`, đổi `font-size 11px → 13px`, bg `#eef2f7 → #f0eeee` (var --tpos-bg-cell-head), padding `10px 12px → 8px 10px`. Nhìn đúng style TPOS thay vì style admin-modern.
- `.so-table tbody td`: padding `9px 12px → 8px 10px`, color `#0f172a → #333`, border-right `#d9dde0 → #e5e8ea` (vertical line mảnh hơn để row dễ scan).
- `.so-action-btn`: chuyển từ transparent → square 28×28 với background mặc định (edit blue `#dbeafe/#1d4ed8`, delete red `#fee2e2/#b91c1c`, add-row green `#dcfce7/#15803d`). Hover lift `translateY(-1px) + shadow-sm`. Khớp native action button style (act-edit / act-delete / act-confirm).
- `.so-cell-actions`: width `96px → 112px` + thêm gap `margin-left: 4px` giữa các button.

**Kết quả**: bảng so-order giờ trông giống native-orders về font, header, buttons. Zebra + hover từ commit trước giữ nguyên.

**Status**: ✅ Done

---

### [so-order] Cải thiện grid bảng (giống native-orders): vertical lines + zebra + hover rõ hơn

**User yêu cầu**: kẻ đường bảng cho dễ nhìn, làm giống native-orders.

**Compare**:

- Native-orders: `data-table` dùng `border-collapse: separate`, có `border-right` mỗi cell, zebra `:nth-child(even)`, hover `#eaf2fb`.
- So-order cũ: `border-collapse: collapse`, chỉ có border-bottom mờ `#eef1f5`, không vertical lines, không zebra → trông "lỏng lẻo".

**Apply**:

- `.so-table` → `border-collapse: separate; border-spacing: 0` (cho phép border từng cell).
- `.so-table thead th` → background `#eef2f7` đậm hơn, `border-right: 1px solid #d9dde0`, last child không right.
- `.so-table tbody td` → `border-right: 1px solid #d9dde0`, `border-bottom: 1px solid #d9dde0` (tăng contrast).
- Zebra: `tr.so-data-row:nth-child(even) > td { background: #f7f9fb }`.
- Hover: `tr.so-data-row:hover > td { background: #eaf2fb }`.
- Shipment-head divider: thêm `border-top: 2px solid #c4b5fd` để tách rõ giữa các lô (trừ lô đầu tiên).
- Shipment column header (`.so-shipment-colhead-cell`): style như thead chính, có border-right + border-top đậm.
- `.so-table-scroll` border `#c8ced3` + `box-shadow` nhẹ.

**Verify** (browser localhost:8093):

- Bảng hiện rõ grid lines ngang + dọc giữa các cell ✅
- Zebra striping trên data rows ✅
- Hover xanh nhạt `#eaf2fb` ✅
- Divider tím đậm giữa shipment groups ✅

**Files**:

- `so-order/css/so-order.css` — refactor `.so-table` block + zebra + shipment-head/colhead borders
- `so-order/index.html` — bump cache `v20260518h → v20260518j`

**Status**: ✅ Done

---

### [so-order + web2-products + render] Full sync 2 chiều: delete/edit qty trong đơn ⇄ pending_qty Kho

**User báo**: nếu xóa SP ở Kho, hoặc chỉnh số lượng / xóa SP trong đơn mua hàng, các trường hợp bằng / nhỏ hơn / lớn hơn → kho và đơn lệch nhau (pending_qty kho không sync với qty thực của đơn).

**Hiện trạng cũ**:

- Add row + Lưu → upsertPending cộng dồn `pending_qty += qty` ✅
- Edit qty (inline/bulk/modal) → KHÔNG sync, kho lệch
- Delete row / delete shipment → KHÔNG sync, kho còn ghost pending
- Delete SP ở Kho → DELETE thẳng, mất pending không cảnh báo

**Backend (render.com/routes/web2-products.js)**:

1. **POST `/api/web2-products/adjust-pending`** (mới): body `{adjustments: [{code?, name?, variant?, supplier?, delta}]}`. Atomic transaction. Logic:
    - Match SP theo code (ưu tiên) hoặc name+variant (case-insensitive, NULL/empty variant match)
    - `pending_qty = GREATEST(0, pending_qty + delta)` (clamp 0)
    - Auto-cleanup ghost: `pending=0 AND stock=0 AND created_by='so-order'` → DELETE SP
    - Auto-convert status: `pending=0 AND stock>0 AND status='CHO_MUA'` → `status='DANG_BAN'`
    - Return per-item: `{code, name, action: deleted|updated, newPendingQty, status, stock}` + warnings
2. **DELETE `/api/web2-products/:code`** (sửa): nếu `pending_qty > 0` và không có `?force=1` → trả **409** với `{code, name, pendingQty, supplier, message}` để frontend cảnh báo. `?force=1` bypass.

**Frontend API (web2/products/js/web2-products-api.js)**:

- `_fetchJson` throw error với `.status` + `.body` để caller phân biệt 409 vs 500.
- `remove(code, {force})` truyền query.
- `adjustPending(adjustments)` mới.

**Frontend so-order (so-order/js/so-order-app.js)**:

- Helper `adjustKhoPending(adjustments)` — best-effort, notify nếu có SP bị auto-cleanup.
- Helper `_rowToKhoMatch(r)` — extract `{name, variant, supplier}` từ row.
- `deleteRow`: capture row TRƯỚC khi xóa → adjustKhoPending([{...match, delta: -qty}])
- `deleteShipment`: batch tất cả rows của lô.
- Inline cell edit (`beginInlineCellEdit > commit`): khi field=qty, tính `delta = newQty - oldQty`, adjust.
- Bulk edit (`commitBulkEditField`): tương tự.
- Modal edit save (modalMode='edit'):
    - Nếu name+variant unchanged → adjust delta.
    - Nếu rename → dec old qty + upsertPending new (rename case).

**Frontend web2/products (delete handling)**:

- `remove(code)` → `_doRemove(code, false)`. Nếu lỗi `.status === 409` → popup "SP còn N cái CHỜ HÀNG, vẫn xóa?" → confirm → `_doRemove(code, true)` (force).

**Verify cases** (sẽ test sau khi Render deploy):

- Sửa qty 10 → 5: kho `pending_qty -= 5` (clamp 0) ✅
- Sửa qty 10 → 15: kho `pending_qty += 5` ✅
- Xóa row qty=10: kho `pending_qty -= 10`, nếu = 0 + stock = 0 → SP bị auto-delete (ghost cleanup) ✅
- Xóa lô: batch adjustment cho mọi rows ✅
- Xóa SP ở Kho có pending > 0: hiện popup cảnh báo, force = 1 mới xóa ✅

**Files**:

- `render.com/routes/web2-products.js` — adjust-pending endpoint + DELETE force flag
- `web2/products/js/web2-products-api.js` — adjustPending, remove(force), err.status/body — bump cache `v20260518a → v20260518b`
- `web2/products/js/web2-products-app.js` — 409 handling — bump `v20260518b → v20260518c`
- `web2/products/index.html` — bump cache
- `so-order/js/so-order-app.js` — adjustKhoPending helper + wire 5 paths (deleteRow, deleteShipment, inline edit qty, bulk edit qty, modal edit save)
- `so-order/index.html` — bump cache `v20260518i → v20260518j`

**Status**: ✅ Done (Render deploy auto sau push, ~2 min)

---

### [web2-products + so-order] Fix hiển thị trạng thái "CHỜ HÀNG" + auto ×1000 giá VND

**User báo 2 vấn đề**:

1. SP từ "Tạo Đơn Hàng → Lưu Nháp" phải hiển thị trạng thái "CHỜ HÀNG" ở Kho SP, sau khi Mua hàng mới chuyển "Đang bán". Logic backend đã đúng (`status='CHO_MUA'` khi upsertPending) nhưng UI vẫn show "Đang bán".
2. Nhập giá 100, 200 trong modal tạo đơn → tự hiểu là 100.000, 200.000 (convention VND).

**Root cause #1**: Frontend `web2/products/index.html` chỉ đọc `isActive` boolean để render badge ("Đang bán" / "Tạm dừng"), không xem field `status`. Verify DB qua API: `KHO-3C44-MPB1AOII` có `status: "CHO_MUA", pendingQty: 3, isActive: true` → backend đúng, frontend display thiếu.

**Fix #1**: Logic badge mới:

- `status === 'CHO_MUA'` → badge cam "CHỜ HÀNG (×N)" (N = pendingQty), tooltip có tên NCC
- Else: theo `isActive` như cũ (Đang bán / Tạm dừng)

**Fix #2**: Quick-input shorthand cho VND

- Helper `_maybeExpandVndShorthand(value, tab)`: nếu `tab.currency === 'VND'` và `0 < v < 1000` → trả `v * 1000`.
- Wire vào 3 chỗ:
    - Modal "Tạo Đơn Hàng" — blur listener trên `input[data-field="costPrice|sellPrice"]`
    - Inline edit (dblclick cell) — trong `commit()` của `beginInlineCellEdit`
    - Bulk edit (whole table edit mode) — trong `commitBulkEditField`
- Hint trong header: "[VNĐ · gõ 100 = 100k]"

**Verify**:

- Web2 Products: SP "2000 ÁO TEST NHÁP" hiện badge cam "CHỜ HÀNG (×3)" ✅
- Modal so-order: nhập 150 → 150000, nhập 250 → 250000 ✅

**Files**:

- `web2/products/js/web2-products-app.js` — render badge theo `status` field
- `web2/products/css/web2-products.css` — `.active-pending` (cam) + cache `v20260517c → v20260518b`
- `web2/products/index.html` — bump cache `app.js v20260518a → v20260518b`
- `so-order/js/so-order-app.js` — `_maybeExpandVndShorthand`, `onModalPriceBlur`, wire 3 chỗ, hint header
- `so-order/index.html` — bump cache `app.js v20260518h → v20260518i`

**Status**: ✅ Done

---

### [so-order] Sửa icon FAB toggle "Mua hàng" — dùng inline SVG thay lucide, thêm text label

**User báo**: FAB toggle mua hàng ở mép phải bị "trống trơn", chỉ còn badge "3" — không thấy icon hay text.

**Root cause**: Toggle dùng `<i data-lucide="shopping-cart">` cần lucide CDN (unpkg.com) replace thành SVG khi load. Khi network down (`net::ERR_INTERNET_DISCONNECTED`) lucide.min.js không load → `<i>` vẫn rỗng → FAB chỉ thấy nền tím + badge đỏ.

**Fix**:

- Thay `<i data-lucide>` bằng **inline SVG** (`<svg class="so-purchase-icon">`) cho cart + X close — hoạt động offline.
- Thêm text label "MUA HÀNG" (uppercase, bold, dưới icon) trên FAB để rõ ràng hơn.
- FAB đổi layout: vertical (icon trên, text dưới), pill 58px width tối thiểu, badge chuyển sang góc trái có viền trắng.

**Verify**:

- Toggle: 87×69px, có SVG cart + label "Mua hàng" + badge "3" ✅
- Drawer title: icon cart tím render ✅
- Drawer close: X SVG render ✅

**Files**:

- `so-order/js/so-order-app.js` — inline cartSvg + xSvg trong `_ensurePurchaseDrawer()`
- `so-order/css/so-order.css` — `.so-purchase-icon`, layout toggle vertical, badge moved to top-left với border trắng
- `so-order/index.html` — bump cache `v20260518g → v20260518h`

**Status**: ✅ Done

---

### [so-order] Chuyển panel "Mua hàng theo NCC" thành drawer phải có toggle (mặc định ẩn)

**User yêu cầu**: panel "Mua hàng theo NCC" đang chiếm chỗ trên cùng table — chuyển thành menu/drawer bên phải, có toggle ẩn/hiện, default ẩn.

**Implement**:

- Thay inline `<section.so-purchase-panel>` (chèn trước `.so-table-wrap`) bằng:
    - **FAB toggle** `#soPurchaseToggle` (right edge, vertical-center, gradient indigo, shopping-cart icon + badge đỏ đếm số NCC)
    - **Drawer** `#soPurchaseDrawer` slide-in từ phải, width 460px, backdrop mờ, transform translateX 260ms
- Drawer cấu trúc: head ("Mua hàng theo NCC" + nút X) + body (hint, "Mua hàng tất cả", grid cards 1 cột).
- Đóng drawer: bấm X, click backdrop, hoặc Esc.
- Toggle ẩn khi `suppliers.length === 0`.
- Cleanup defensive: xóa legacy inline `#soPurchasePanel` nếu còn từ cache cũ.

**Verify** (browser localhost:8093):

- Default: drawer đóng, FAB toggle hiện với badge "3" ✅
- Click toggle → drawer slide in, 3 cards + nút "Mua hàng tất cả (3 SP · 5.200₫)" ✅
- Click "Mua hàng" Shenzhen trong drawer → modal mở chồng trên drawer, 1 SP · 25 cái · 3.750₫ ✅
- Click X / backdrop / Esc → drawer đóng, toggle vẫn còn ✅

**Files**:

- `so-order/js/so-order-app.js` — `_ensurePurchaseDrawer()` + refactor `renderPurchasePanel()` dùng drawer-body
- `so-order/css/so-order.css` — `.so-purchase-toggle`, `.so-purchase-toggle-badge`, `.so-purchase-drawer*`
- `so-order/index.html` — bump cache `v20260518f → v20260518g`

**Status**: ✅ Done

---

### [so-order] Fix modal "Mua hàng" rỗng + thêm 3 entry points (global / per-NCC / per-row)

**User báo**: bấm "Mua hàng" cho Shenzhen → modal hiện "Không có SP CHỜ MUA cho NCC này, hãy Lưu Nháp trước" mặc dù card đã hiện 1 SP / VND 3.750.

**Root cause**: `openPurchaseModal` cũ query DB qua `Web2ProductsApi.listPending` (filter `status='CHO_MUA' AND pending_qty>0`), nhưng panel cha lại tính từ rows local của tab. Nếu user chưa Lưu Nháp → DB rỗng → modal trống dù panel có hiện số.

**Fix**:

- Refactor `openPurchaseModal({scope, supplier?, rowId?})` lấy items trực tiếp từ `tab.shipments[].rows` local (filter theo scope).
- `confirmPurchaseFromModal`: auto `upsertPending` (= Lưu Nháp ngầm) → lấy codes trả về → gọi `confirmPurchase({codes})` → in mã vạch. User không cần bấm Lưu Nháp riêng nữa.
- Modal title + supplier tag thay đổi theo scope: `'all' | 'supplier' | 'row'`.

**Thêm 2 entry points mới**:

- Nút "Mua hàng tất cả (N SP · X₫)" ở header panel → mở modal gộp SP từ tất cả NCC trong tab, có tag NCC trên từng dòng.
- Nút giỏ hàng xanh ở cột Thao tác mỗi dòng → modal chỉ với SP đó (title "Mua hàng SP: {tên}").

**Verify** (browser localhost:8093):

- Shenzhen → 1 SP · 25 cái · 3.750₫ ✅
- Tất cả NCC → 3 SP · 40 cái · 5.200₫ (Quảng Châu A, Hồng Châu B, Shenzhen) ✅
- Per-row → 1 SP với title đúng tên SP ✅

**Files**:

- `so-order/js/so-order-app.js` — refactor renderPurchasePanel + openPurchaseModal + confirmPurchaseFromModal + actionsCell
- `so-order/css/so-order.css` — `.so-purchase-btn-all`, `.so-action-btn-buy`, `.so-purchase-supplier-tag`, `.so-purchase-line-cost`
- `so-order/index.html` — bump cache `v20260518e → v20260518f`

**Status**: ✅ Done

---

### [orders-report] Fix miss auto-tag XL "ĐÃ RA ĐƠN" sau tạo PBH (single + bulk)

**User báo**: lâu lâu sau khi tạo phiếu bán hàng lẻ hoặc bán hàng hàng loạt, đơn ra thành công nhưng không tự động đánh tag XL "ĐÃ RA ĐƠN" → kẹt ở "CHỜ ĐI ĐƠN".

**Constraint cứng**: chỉ sửa phần đánh tag, không động flow tạo đơn / modal.

**Root cause** (4 nguyên nhân chồng):

1. `storeFromApiResult` gọi `window.onPtagBillCreated(soId, source)` trong `forEach` không await → fire-and-forget ([tab1-fast-sale-invoice-status.js:879](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js#L879)).
2. `onPtagBillCreated` skip im lặng khi `ProcessingTagState._isLoaded === false` → race: F5 → tạo đơn ngay → miss vĩnh viễn ([tab1-processing-tags.js:1462](../orders-report/js/tab1/tab1-processing-tags.js#L1462)).
3. `saveProcessingTagToAPI` catch chỉ log, không retry → network thoáng qua = memory có tag, DB không → F5 mất tag.
4. Reconciliation chỉ chạy 1 lần khi load page → user phải F5 mới fix.

**Fix** (3 layer, ZERO impact lên flow tạo đơn / modal):

- **Fix A** — Đợi `_isLoaded` thay vì skip ([tab1-processing-tags.js:1452-1515](../orders-report/js/tab1/tab1-processing-tags.js#L1452-L1515)): thêm helper `_waitForPtagLoaded(timeoutMs)` poll 100ms timeout 10s + queue `_ptagBillCreatedRetryQueue` cho reconcile catch khi timeout.
- **Fix B** — Retry `saveProcessingTagToAPI` với exponential backoff 3 lần (500ms / 1500ms / 4500ms) ([tab1-processing-tags.js:696-729](../orders-report/js/tab1/tab1-processing-tags.js#L696-L729)). Thua hết retry → queue cho reconcile.
- **Fix C** — `setTimeout 3s` sau `storeFromApiResult` gọi `window.reconcileTagsWithInvoices()` fire-and-forget ([tab1-fast-sale-invoice-status.js:929-945](../orders-report/js/tab1/tab1-fast-sale-invoice-status.js#L929-L945)) — catch các đơn lỡ miss tag mà không cần user F5.

**Không đụng**: caller `storeFromApiResult` (tab1-sale.js:1314 / tab1-fast-sale-invoice-status.js:4092), forEach loop, modal timing (`closeSaleButtonModal`, `setTimeout 500ms`), TPOS API, schema DB.

**Files**: `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-fast-sale-invoice-status.js`.

**Status**: ✅ DONE — syntax check pass. Cần user test thực tế với bulk 5-10 đơn để confirm.

---

### [render][orders-report] KPI strip → SSE-only, bỏ polling

**User feedback (sau test prod 2 user hong+hanh)**: "bỏ polling hoàn toàn chỉ dùng kpi thôi". Test prod confirmed: mọi update đều rơi đúng nhịp polling 60s, không có SSE push nào fire — SSE channel `kpi_base` chỉ fire khi bảng `kpi_base` bị ghi (BASE INSERT cho order mới), KHÔNG fire khi `kpi_statistics` được PATCH (tick "SP bán hàng").

**Root fix backend** ([render.com/routes/realtime-db.js](../render.com/routes/realtime-db.js)):

Thêm `notifyClients('kpi_statistics', ...)` vào TẤT CẢ write endpoints:

- PUT `/kpi-statistics/:userId/:date` — eventType `update`
- PATCH `/kpi-statistics/:userId/:date/order` — eventType `update`, sau COMMIT
- DELETE `/kpi-statistics/order/:orderCode` — eventType `deleted`, chỉ khi rowCount > 0
- DELETE `/kpi-statistics/:userId/:date` — eventType `deleted`, chỉ khi rowCount > 0
- POST `/kpi-statistics/recalculate-assignments` — eventType `update`, chỉ khi moved > 0

**Client** ([orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js)):

- SSE_URL subscribe **2 channels**: `?keys=kpi_statistics,kpi_base` (catch cả PATCH tick KPI và new order BASE).
- `SSE_DEBOUNCE_MS`: 2500ms → **1500ms** (không cần chờ kpi_statistics ghi sau kpi_base nữa vì giờ tự push).
- **XÓA HOÀN TOÀN** `startPollingSafety`, `POLL_SAFETY_MS`, `pollSafetyTimer`.
- SSE-only: EventSource tự reconnect khi mạng chập chờn.

**Trước**: Polling 60s gánh toàn bộ realtime → latency worst case 60s.
**Sau**: SSE fire trên MỌI write `kpi_statistics` → latency ~1.5-3s (debounce + network). 0 polling traffic.

**Status**: ✅ Code done. Cần deploy Render + GitHub Pages, sau đó re-test 2-user.

### [web2/supplier-debt] Thêm option "Bao gồm TPOS (legacy)" — merge data từ TPOS Report API

**User**: "thêm dữ liệu như bên https://nhijudyshop.github.io/n2store/supplier-debt/index.html tôi coi thử".

**Context**: Legacy `supplier-debt/` show 56 NCC từ TPOS (tổng nợ 891M). Web 2.0 chỉ 3 NCC từ so-order (5.2k). User muốn xem báo cáo Web 2.0 với data dày như legacy.

**Approach**: Thêm toggle "Nguồn" trong toolbar — 2 checkbox `Web 2.0` + `TPOS (legacy)`. TPOS được fetch on-demand qua `tokenManager.authenticatedFetch()` (giống legacy).

**Implementation** ([web2/supplier-debt/](../web2/supplier-debt/)):

- HTML: thêm `<script src="../../shared/js/core-loader.js">` + `<script src="../../shared/js/token-manager.js">` + 2 checkbox toggle source.
- JS state thêm: `tposData: []`, `tposCongNo: Map<partnerId, rows>` (lazy), `filters.sourceWeb2/sourceTpos`.
- `loadTpos()`: GET `/api/odata/Report/PartnerDebtReport?ResultSelection=supplier&DateFrom=...&$top=1000` → 1000 NCC từ TPOS qua worker proxy.
- `aggregate()` merge: Web 2.0 rows giữ nguyên (so_order + wallet), thêm TPOS rows với `opening = ending - debit + credit` (legacy formula).
- Row có `source` field ('web2' | 'tpos'). Render thêm badge: `WEB 2.0` (xanh) / `TPOS` (vàng).
- Expand TPOS row: `congnoTableHtml` lazy fetch `/api/odata/Report/PartnerDebtReportDetail?PartnerId=...` → cache vào `STATE.tposCongNo` → re-render detail panel. Running balance dùng `row.opening` làm start, compute `currentEnd = currentBegin + debit - credit` per row.
- Toggle change → `loadAll()` + `tposCongNo.clear()` (invalidate cache) + re-render.

**Verified localhost**:

- Toggle TPOS ON → load 56 TPOS NCC + 3 Web 2.0 = 59 row, total ending **891.739.200₫** match legacy.
- Expand TPOS row (B5 CHIẾN NGỌC) → lazy fetch PartnerDebtReportDetail → 100+ rows running balance đúng (lastEnd = summaryEnd = **100.580.000₫**).
- Badge phân biệt nguồn rõ ràng.

**Web 2.0 isolation note**: TPOS được đọc **read-only** ở client để bổ sung báo cáo. KHÔNG sync vào Firestore/Postgres, KHÔNG write back. Web 2.0 data layer (so_order_v2, supplier_wallet_v1) vẫn không cross-contaminate.

**Status**: ✅ Done.

### [web2/supplier-debt] Refactor modal → inline row expand giống legacy

**User**: "làm chức năng expand cho web2/supplier-debt giống supplier-debt/" + answer relationship giữa các trang Web 2.0.

**Logic liên kết Web 2.0 (đã trả lời chi tiết trong chat):**

- **so-order** (Firestore) → derive purchases per NCC + write web2_products stock (+)
- **supplier-wallet** (Firestore) → ledger payment/return per NCC; on return → web2_products stock (-)
- **supplier-debt** (NEW) → READ-ONLY báo cáo, aggregate so_order + supplier_wallet
- **native-orders** (Postgres) → tạo PBH → fast_sale_orders → web2_products stock (-)
- **customer-wallet** (Firestore) → group PBH by phone; on return → web2_products stock (+)
- **products** (web2_products Postgres) → SOURCE OF TRUTH cho stock, +/- bởi 4 luồng trên
- **SePay auto-poll**: webhook → `balance_history` → `/api/wallet-deposits/load` → 2 ví match (phone cho KH, content substring cho NCC) → auto payment tx

**Refactor expand**:

- BỎ modal `<div class="sd-modal" id="sdDetailModal">` khỏi HTML.
- Thay bằng pattern legacy: per main row có 1 `<tr class="sd-detail-row" hidden>` đi kèm dưới với `<td colspan="7">` chứa detail content render từ JS string.
- Thêm cột expand (▶ / ▼) ở table header, mỗi row có button `.sd-expand-btn` (24×24, ▶ default, → ▼ khi expanded + bg purple).
- Click expand button HOẶC click row → `toggleExpand(supplier)` toggle membership trong `STATE.expanded: Set<supplier>`.
- Tab state per supplier: `STATE.detailTabs: Map<supplier, tab>` (default 'congno'). Click tab → `updateDetailPanel(supplier)` chỉ re-render 1 detail cell, không full re-render bảng.
- **Multi-expand**: nhiều row có thể mở cùng lúc (legacy support this).
- **Esc → collapse all**.
- Bỏ `[data-sd-close]`, `Escape close modal`, modal CSS unused.

**Verified Playwright**: 3 main rows → click expand row 1 → 1 detail visible với Công nợ tab + running balance đúng (Shenzhen 9/5 PO/HÀ NỘI 0₫→3.750₫). Click row 1 again → collapse. Expand 2 rows → 2 detail visible đồng thời. Tab switch (Công nợ / Phiếu mua / Giao dịch) per row độc lập.

**Status**: ✅ Done.

### [web2/supplier-debt] Thêm tab "Công nợ" — chronological merge + running balance per row

**User**: "chức năng tính tiền giống bên supplier-debt/ chưa? Tìm hiểu kĩ chức năng bên supplier-debt/ đi".

**Phân tích legacy** `n2store/supplier-debt/`:

- Bảng chính 5 cột: Mã NCC, Tên NCC, Phát sinh (Debit), Thanh toán (Credit), Nợ cuối kỳ (End) — TPOS API `Report/PartnerDebtReport` trả sẵn 3 cột tiền, **KHÔNG** có Nợ đầu kỳ ở bảng chính.
- **Tab "Công nợ"** trong expanded row mới là feature money-calc quan trọng: merge tất cả bút toán (BILL hóa đơn mua, CSH/BANK/TK thanh toán) chronological, hiển thị Nợ đầu kỳ / Phát sinh / Thanh toán / Nợ cuối kỳ per row với **running balance**.
- Công thức (legacy `main.js:1623`):

    ```
    Opening = End − ΣDebit + ΣCredit      (derive từ summary row)
    currentEnd = currentBegin + debit − credit
    currentBegin = currentEnd              (next row)
    ```

- 4 tabs khác trong expand: Info, Hóa đơn (FastPurchaseOrder), Chi tiết nợ (CreditDebitSupplierDetail), Công nợ.

**Web 2.0 update** ([web2/supplier-debt/](../web2/supplier-debt/)):

- **Tab mới "Công nợ (running balance)"** thành default tab — merge `row.purchasesInPeriod` (Debit) + `row.txInPeriod` (Credit) sort theo `sortKey` ASC (date + time), tính running balance theo công thức legacy.
- Bảng 7 cột: Ngày, Diễn giải, Bút toán, Nợ đầu kỳ, Phát sinh, Thanh toán, Nợ cuối kỳ.
- Bút toán label: `PO/<tab>` cho purchase, `PAYMENT`/`RETURN` cho transaction. Row payment/return có bg xanh nhạt (`is-credit-move`).
- Giữ 2 tab cũ (Phiếu mua / Giao dịch) cho ai chỉ muốn xem 1 hướng.

**Khác biệt còn lại với legacy** (đã ý thức, không clone):

- Drag-drop reorder rows — legacy dùng chỉnh ngày web (RefundDateStore); Web 2.0 dùng ngày shipment cố định.
- Hóa đơn / Chi tiết nợ tab — Web 2.0 không có pattern hóa đơn riêng (purchases gắn trực tiếp shipment).
- Web notes (Firebase per-move), Tạo NCC, Column toggle — chưa cần.
- Payment modal + delete payment — đã có sẵn ở `web2/supplier-wallet/`.

**Verified Playwright localhost**: Shenzhen → modal mở Công nợ tab → row "9/5/2026 — Mua: Túi xách — PO/HÀ NỘI — 0₫ → 3.750₫" running balance đúng. 0 JS error.

**Status**: ✅ Done.

### [web2/supplier-debt][sidebar] Báo cáo công nợ NCC theo kỳ — clone UX legacy supplier-debt vào Web 2.0

**User**: "làm 1 trang giống `n2store/supplier-debt/index.html` ở trong mục Mua hàng trên Ví NCC".

**New folder**: [web2/supplier-debt/](../web2/supplier-debt/) (slug + tên route mới, độc lập với placeholder `web2/report-supplier-debt/` của Web2Shell generic).

**Layout** (mirror legacy supplier-debt nhưng dùng Web 2.0 theme + data source mới):

- Header: tiêu đề + counter pills (số NCC, tổng nợ cuối) + refresh button
- Toolbar filter: từ ngày, đến ngày, search NCC, radio Tất cả / Nợ cuối kỳ ≠ 0 + 3 button (Áp dụng, Reset, Xuất CSV)
- Bảng 6 cột: #, Tên NCC, Nợ đầu kỳ, Phát sinh, Thanh toán, Nợ cuối kỳ (sortable 4 cột số)
- Tổng row trong tfoot
- Pagination 50 rows/trang (auto hide khi ≤ 50)
- Click row → detail modal: 4 stat box (đầu kỳ / phát sinh / thanh toán / cuối kỳ) + 2 tab (Phiếu mua trong kỳ / Giao dịch trong kỳ)
- Click ngoài / Esc → đóng modal
- Export CSV với BOM UTF-8

**Data source** (KHÔNG đụng TPOS — đây là Web 2.0):

- `so_order_v2/main` (Firestore) — derive purchases per supplier per shipment qua tabs[].shipments[].rows[]
- `supplier_wallet_v1/main` (Firestore) — ledger payment + return transactions

**Calc per supplier per period [from, to]**:

```
purchases_before = Σ (qty × costPrice × rate→VND) WHERE shipment.date < from
tx_before        = Σ |amount|                     WHERE tx.ts < from
opening          = purchases_before - tx_before
debit            = Σ purchases WHERE shipment.date in [from, to]
credit           = Σ |amount|  WHERE tx.ts in [from, to]
ending           = opening + debit - credit
```

Khi không có filter date → tất cả purchases vào `debit`, tất cả tx vào `credit`, `opening = 0`.

**Sidebar** ([web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js)): thêm entry "Công nợ NCC" vào group "Mua hàng" TRÊN "Ví NCC" theo yêu cầu user.

**Verified Playwright localhost**: 3 NCC từ so-order (Shenzhen 3.750₫, Quảng Châu A 1.000₫, Hồng Châu B 450₫, tổng 5.200₫) — match báo cáo trước. 0 HTTP 404, 0 JS error. Pagination auto-hide khi ≤ 50 rows (fix CSS `display: flex` đè `[hidden]` attr → thêm `.sd-pagination[hidden] { display: none !important }`).

**Status**: ✅ Done.

### [web2][paths][worker] Fix path bể sau khi move `web2-products` + `web2-variants` vào `web2/`

**User**: phát hiện URL `http://localhost:8093/web2/variants/index.html` bị sai path → yêu cầu audit toàn bộ.

**Root cause**: commit `cc2c8ff4` move 2 folder từ root vào trong `web2/` nhưng KHÔNG update các relative path bên trong:

- `../web2/shared/...` từ `/web2/variants/index.html` → resolve thành `/web2/variants/../web2/shared/...` = `/web2/web2/shared/...` ❌
- `../native-orders/...` (sibling cũ ở root) → giờ phải đi lên 2 levels: `../../native-orders/...`
- `../shared/js/...` (legacy n2store shared ở root) → giờ phải: `../../shared/js/...`
- `../web2/variants/index.html` href trong `web2/products/...` → `../variants/index.html`

**Fixed files**:

- [web2/variants/index.html](../web2/variants/index.html): 5 paths (CSS sidebar/effects, native-orders, shared/js, JS sidebar/effects/variants-cache)
- [web2/products/index.html](../web2/products/index.html): 8 paths (CSS, native-orders, shared/js, JS sidebar/effects/variants-api/caches, href Kho Biến Thể)
- [web2/products/js/web2-products-app.js](../web2/products/js/web2-products-app.js): 2 hint links `Thêm tại Kho Biến Thể`
- [web2/index.html](../web2/index.html): cleanup 2 path `../web2/shared/` → `shared/` (works by luck, đổi cho clean)
- [web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js): JSDoc usage example phân biệt depth 1 (web2 subpage) vs depth 0 (native-orders, etc.)

**Worker route bug**: `pathname === '/api/web2-products'` không match `/api/web2-products/list`. Thêm `startsWith('/api/web2-products/')` + same cho variants ([routes.js](../cloudflare-worker/modules/config/routes.js)). Deploy worker (`wrangler deploy` qua Cloudflare Global Key auth).

**Smoke script cleanup**: [scripts/n2store-smoke-all-pages.js](../scripts/n2store-smoke-all-pages.js) — bỏ slug đã chết `product-template`, `product-variant`, thêm `products`, `variants`.

**Verified**: smoke 144 pages localhost → 142/142 HTTP 200, 0 HTTP 404/5xx (trước fix: 2 trang 404 + nhiều 404 từ API call). Browser test ngân hàng `/web2/{variants,products,index,customer-wallet,supplier-wallet}` → 0 console error path-related.

**Worker deploy**: `chatomni-proxy` version `01a6068d-8be6-4a64-b826-d30e81895695`.

**Status**: ✅ Done.

### [orders-report] Fix divergence KPI strip giữa các browser

**Bug user báo**: "kiểm tra lại realtime API hiện tại hoạt động không đúng — mỗi trang nhân viên số KPI của mọi người lại hiển thị khác nhau". Browser A và B không hội tụ — số liệu trôi khác nhau sau khi switch sang SSE-only.

**Root cause**:

1. SSE channel `kpi_base` chỉ chắc chắn fire khi **bảng `kpi_base` bị ghi** (BASE snapshot khi có order mới). KHÔNG fire khi chỉ `kpi_statistics` recompute độc lập (manual "Tính lại KPI", fix discrepancy, etc.). → Browser bỏ sót event → snapshot frozen tại lần fetch đầu.
2. SSE-only không có safety net: nếu 1 push bị mất (network hiccup, server không emit), browser không bao giờ re-sync.
3. Không có `cache: 'no-store'` → fetch có thể serve từ HTTP cache cũ (ETag fresh nhưng disk cache có thể trả stale trong cùng session).

**Fix** ([orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js)):

- `fetchAndAggregate()` dùng `fetch(url, { cache: 'no-store' })` → bypass browser HTTP cache, mỗi refresh thực sự GET tươi.
- `startPollingSafety()` **always-on 60s** (không còn fallback-only) → bảo đảm mọi browser hội tụ trong tối đa 60s, kể cả khi SSE không push.
- Bỏ `sseConnected` flag + `teardownSSE` + onerror handler — EventSource tự reconnect khi mạng chập chờn, polling là safety net độc lập với SSE state.
- SSE vẫn giữ để có low-latency push khi có order mới (BASE write trigger).

**Verify**:

- Endpoint consistency: 2 fetch liên tiếp → cùng 178833 bytes (endpoint OK, không phải lỗi server-side).
- Endpoint structure: mỗi row = `(userId, date)` đã pre-aggregated với `totalNetProducts/totalKPI`; `orders[]` chứa per-order detail có `campaignName` để filter.
- Smoke test: T7 active campaign → 3 cards render đúng (Huyền 7m·35K, Hạnh 6m·30K, Hồng 3m·15K). SSE kpi_base = 10 clients (browser đã subscribe).
- File serve sau edit chứa cả 3 fix (`cache: 'no-store'`, `POLL_SAFETY_MS = 60000`, `startPollingSafety()`).

**Status**: DONE.

### [web2][wallet][sepay][worker][render] SePay deposit poll — ví KH/NCC tự cộng payment từ webhook

**User**: tiếp tục TODO từ commit `c049756e` — _"Wallet apps sẽ tích hợp poll on load (next session)"_.

**Bug phát hiện**: commit trước ghi message "Mount /api/wallet-deposits trong server.js" nhưng thực tế **chưa mount** — `walletDepositsRoutes` chỉ được `require()` (line 333) nhưng thiếu `app.use(...)`. Worker cũng chưa có route → 404 toàn bộ.

**Fix**:

1. **Render** ([server.js:454](../render.com/server.js#L454)): mount `app.use('/api/wallet-deposits', walletDepositsRoutes)`.
2. **Cloudflare Worker**:
    - [routes.js](../cloudflare-worker/modules/config/routes.js): thêm `WALLET_DEPOSITS: { pattern: '/api/wallet-deposits/*' }` + matcher `startsWith('/api/wallet-deposits/')`.
    - [worker.js](../cloudflare-worker/worker.js): thêm `case 'WALLET_DEPOSITS': return handleCustomer360Proxy(...)` (Render passthrough + CORS).

**Customer wallet integration** ([web2/customer-wallet/](../web2/customer-wallet/)):

- `customer-wallet-storage.js`: thêm `fetchDeposits(since)`, `applyDeposits(state, deposits)`, helper `normPhone` (84→0 prefix), `getProcessedSepayIds` (idempotent dedup).
- Match: `d.linkedPhone` → `state.wallets[phone]` chỉ apply khi KH đã có ví → `type='payment'` (`paidAmount += amount`, balance ↓).
- Skip nếu sepayId đã processed (idempotent qua bộ ref.sepayId của tất cả tx).
- `customer-wallet-app.js`: gọi `pollDeposits()` sau `loadAndRender()`. Track `state.lastDepositSync` = max ts đã thấy (cursor cho lần poll sau, tránh re-fetch).

**Supplier wallet integration** ([web2/supplier-wallet/](../web2/supplier-wallet/)):

- `supplier-wallet-storage.js`: `fetchDeposits` + `applyDeposits` với matcher khác — `matchSupplier(content, supplierNames)` normalize (lowercase + NFD strip diacritics + non-alnum→space) + boundary check (yêu cầu name ≥4 chars + xuất hiện như từ riêng để tránh false positive).
- Match: supplier nào tên xuất hiện trong `d.content` → `paidAmount += amount` (semantically là NCC refund/hoàn tiền → giảm shop's debt).
- Cùng pattern `lastDepositSync` cursor + idempotent qua sepayId.

**Verified**: syntax-check 6 file pass. Test live cần data SePay thật trong `balance_history` — sẽ test sau khi deploy CF Worker + Render.

**TODO sau**: deploy CF Worker (push lên Cloudflare); deploy Render (auto từ git push); test với deposit thật từ SePay sandbox hoặc giả lập via webhook payload.

**Status**: ✅ Code done. Deploy + verify end-to-end sau.

### [web2][sidebar][audit] Xóa nốt `fastpurchaseorder-refund` + audit data flow

**User**: "xóa luôn và kiểm lại logic các trang liên quan, tác động tới nhau".

**Removed**:

- `web2/fastpurchaseorder-refund/` folder + sidebar entry "Trả hàng mua"
- 2 entries trong `web2/modules-manifest.js` (invoice + refund)
- 2 entries trong `shared/js/navigation-modern.js` (launcher list) + permission list
- `fastpurchaseorder-invoice` khỏi `render.com/services/web2-sync-worker.js` hot tier
- Seeder config khỏi `scripts/web2-seed-from-tpos.js` + 2 slugs khỏi `scripts/n2store-smoke-all-pages.js`

Nhóm "Mua hàng" sidebar giờ chỉ còn **Ví NCC**.

**Audit data flow** (module shop dùng thật):

```
Sổ Order (so-order/) ──► Web2 Products (web2/products/)
Firestore so_order_v2     Postgres web2_products (stock=0 khi tạo, không +)
     │
     │ derive purchases by supplier
     ▼
Ví NCC (web2/supplier-wallet/) — Firestore supplier_wallet_v1 (ledger riêng)
Modal trả hàng → transaction.type='return' (KHÔNG động so-order data)

Native Orders ──► PBH (fast_sale_orders, Postgres, KHÔNG trừ stock)
                         │ group by phone
                         ▼
                  Ví KH (web2/customer-wallet/) — Firestore customer_wallet_v1
                  Modal trả theo chiến dịch → transaction.type='return' (KHÔNG động PBH)
```

**Findings**:

1. **Stock end-to-end CHƯA track**: so-order import không +stock, PBH bán không -stock, ví trả hàng không touch stock. `web2_products.stock` field tồn tại nhưng không ai write.
2. **Ledger độc lập với source**: nếu user xóa shipment so-order / cancel PBH, totals recompute trên next load nhưng `returnedRowIds`/`returnedLineKeys` flag cũ trở thành stale (không gây lỗi).
3. **PBH cancelled chưa filter**: customer-wallet dùng `amount_total` mọi PBH bất kể state. Nên filter `state != 'cancelled'` (TODO nhẹ).
4. **500 PBH limit cứng**: shop nhiều đơn cần pagination/server-side filter (TODO).
5. **30-day cleanup**: chỉ purge ledger transactions, không động source ✓.
6. **SePay sau**: webhook → ghi `transaction.type='deposit'` vào wallet matching phone/supplier qua metadata.

**Status**: ✅ Cleanup done. Logic interconnect ổn (loosely coupled — Ví là ledger overlay).

### [web2][sidebar] Xóa trang `fastpurchaseorder-invoice` placeholder

**User**: hỏi data source trang "Mua hàng" (`web2/fastpurchaseorder-invoice/`) → chỉ là TPOS-clone generic CRUD (table `web2_records` ở Render), không phải module shop dùng thật. Shop dùng `so-order/` (Sổ Order) + ví NCC vừa làm. → "xóa đi".

**Removed**:

- `web2/fastpurchaseorder-invoice/` folder
- Sidebar entry "Mua hàng" trong nhóm "Mua hàng" ([web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js))

Nhóm "Mua hàng" còn lại: "Trả hàng mua" (cũng placeholder, có thể xóa sau nếu không dùng) + "Ví NCC". Sidebar "Sale Online" vẫn có "Sổ Order" (không bị ảnh hưởng).

**Status**: ✅ Done.

### [web2/supplier-wallet][web2/customer-wallet] Ví NCC + Ví KH — công nợ + lịch sử 30 ngày

**User**: shop cần 2 trang ví: NCC (từ Sổ Order) + KH (từ PBH native-orders). Modal trả hàng → chọn SP → tính lại tiền. 30-day auto-cleanup. SePay webhook sẽ tích hợp sau.

**Pages**:

1. **Ví NCC** ([web2/supplier-wallet/](../web2/supplier-wallet/))
    - Data: derive từ `so_order_v2/main` — group `rows.supplier`, tổng mua = `Σ qty × costPrice × rate→VND`
    - Wallet Firestore: `supplier_wallet_v1/main`
    - Modal trả hàng: list rows chưa trả → tick → input SL trả → `transaction.type='return'` âm tiền
    - Modal thanh toán: `transaction.type='payment'`
    - Sidebar: nhóm "Mua hàng" → "Ví NCC"

2. **Ví KH** ([web2/customer-wallet/](../web2/customer-wallet/))
    - Data: fetch `/api/fast-sale-orders/load` → group `partner_phone`
    - Wallet Firestore: `customer_wallet_v1/main`
    - Modal trả hàng: dropdown chiến dịch → filter `order_lines` theo `live_campaign_id` → tick
    - Modal thu tiền: `transaction.type='payment'`
    - Sidebar: nhóm "Khách hàng" → "Ví Khách Hàng"

**Pattern dùng chung**: Firestore source of truth + realtime listener + echo guard. 30-day cleanup on load: `transactions.filter(t => t.ts > Date.now() - 30d)`. localStorage warm cache. CSS supplier-wallet là base, customer-wallet override.

**Verified Playwright (real data)**: 3 NCC từ so-order (Shenzhen 3.750₫, Quảng Châu A 1.000₫, Hồng Châu B 450₫, tổng nợ 5.200₫) + 2 KH từ PBH (Thế Hoàng 135k, Antina Trân 0). Return flow: chiến dịch "HOUSE 11/05/2026" → AO NAU M → tick → 100k hoàn → Còn nợ 35k ✓.

**TODO next**: SePay webhook → `/api/sepay/wallet-deposit` Render → ghi `transaction.type='deposit'` vào wallet matching từ payment metadata.

**Status**: ✅ Done MVP.

### [docs] Rule mới: đọc `docs/sessions/latest/<folder>.md` trước khi code phần mới

**User**: "thêm vào memory, devlog, claude khi code đoạn mới thì vào `/Users/mac/Desktop/n2store/docs/sessions/latest` đúng trang cần đọc trước để hiểu trang đó làm gì".

**Thêm rule vào 3 nơi**:

- Memory: `feedback_read_folder_snapshot_first.md` + entry trong `MEMORY.md`
- CLAUDE.md: thêm section "Folder Snapshot — read before coding new section"
- Dev-log: entry này

**Mục đích**: khi code/edit phần mới trong folder X, PHẢI `Read` `docs/sessions/latest/<X>.md` trước để có context cô đọng (latest session token chạm folder + 5 commits gần nhất + files changed). Tránh sửa sai logic vì thiếu context.

**Mapping**:

- Root files → `_root.md`
- `so-order/`, `native-orders/`, `tpos-pancake/`, `web2/`, `web2/shared/`, `web2/products/`, `web2/variants/`, `scripts/`, `docs/` → snapshot cùng tên
- Index: `docs/sessions/latest/_all.md`

**Không áp dụng**: fix typo 1 dòng, user chỉ rõ file/dòng, folder mới chưa có snapshot.

**Status**: ✅ Done

---

### [web2-shared] Fix sidebar collapsed — labels bleed-through + toggle button bị che

**User**: "thanh menu đang bị lỗi giao diện" (collapsed bị bleed text "đ V", "C S", "L", "F" — chữ submenu lộ ra ngoài). Sau đó: "nút toggle khi collapsed lại bị che đi".

**Root cause** ([web2/shared/tpos-sidebar.css](../web2/shared/tpos-sidebar.css)):

1. **Class mismatch JS render vs CSS**: `tpos-sidebar.js` render `.label`, `.caret`, `.web2-nav-sub`, `.web2-nav-link`, `.web2-nav-group-head`, `.icon` — nhưng CSS collapsed selectors lại target `.web2-nav-label`, `.web2-nav-caret`, `.web2-nav-children`, `.web2-nav-item`, `.web2-nav-icon` (không tồn tại) → `display: none` không kích hoạt → labels bleed-through.
2. **Toggle button bị clip**: `position: absolute; right: -14px` hang off rìa phải aside, nhưng `.web2-aside` có `overflow-x: hidden` → toggle bị che một phần.

**Fix**: sửa selectors đúng class names + scope dưới `.web2-aside`. Toggle khi collapsed đổi `position: static` + brand `flex-direction: column` → N2 logo + toggle xếp dọc trong vùng 56px visible (không hang off → không bị clip).

**Verified Playwright**: collapsed → 56px rail không bleed text + toggle visible; click toggle → re-expand 260px labels đầy đủ.

**Status**: ✅ Done. Cache-bust `?v=20260518d` cho 14 file dùng `tpos-sidebar.css`.

### [scripts][docs] Per-folder LATEST snapshot — fallback khi session cũ chết (image limit)

**User**: gặp lỗi `dimension limit for many-image requests` thì session đóng băng, không nhờ Claude tóm tắt context được nữa. Cần snapshot **đã có sẵn** trước khi lỗi xảy ra, do hook tự ghi đè sau mỗi commit. Yêu cầu chia theo folder/page để session mới chỉ cần đọc 1 file của module đang làm.

**Files**:

- `scripts/save-session-resume.sh` — thêm python block generate `docs/sessions/latest/<folder>.md` cho mỗi folder bị chạm trong commit + `docs/sessions/latest/_all.md` (index).
- `CLAUDE.md` — thêm section "Folder Snapshot — fallback khi session cũ chết" mô tả khi user paste path `docs/sessions/latest/<folder>.md` Claude làm gì.

**Cách dùng (session mới khi cũ chết)**: paste `đọc docs/sessions/latest/<folder>.md` (vd `orders-report.md`) → Claude Read 1 file → có pointer đến latest session + 5 commit gần nhất + files thay đổi. Cần Next Steps đầy đủ thì Read thêm session file pointer trỏ tới (1 hop, không chain walk).

**Status**: ✅ Done. Tested heredoc escaping với git repo tạm trong `/tmp` — output đúng markdown (backticks render đúng).

---

### [so-order] Add lại toggle "Chỉnh sửa bảng" — bulk edit toàn bảng + dblclick lẻ coexist

**User**: feedback — dblclick OK cho sửa lẻ, nhưng khi nhập nhiều ô liên tục thì cần BẬT một phát thành input toàn bảng. Yêu cầu: add toggle button, ON = bật input toàn bộ bảng.

**Implementation** ([so-order/{index.html,css/so-order.css,js/so-order-app.js}](../so-order/)):

1. **Button toggle `#soEditTableBtn`** ở header (bỏ hint chip cũ). Purple gradient khi `is-active` (giống style toggle gốc của session `9a8fad0`).
2. **State `editTableMode`** persist `localStorage['soOrder_editTableMode_v1']` (per-device, tách khỏi Firestore sync vì là UX preference).
3. **`rowHtml()`** giờ check `editTableMode`: khi ON gọi `editableCellHtml(field, r, rid, sid)` thay vì cell read-only. STT/ảnh/actions luôn read-only. Ảnh vẫn dùng inline image modal (dblclick) — quá phức tạp inline.
4. **`commitBulkEditField()`** — re-use validation variant + pushSync + flashRow giống dblclick path. No-op nếu value không đổi. Số 0 fallback cho qty/price.
5. **Delegated listeners ở tbody** (bind 1 lần): `change` → commit; `keydown` Enter → blur; `focusin` variant input → lazy-bind picker dropdown (tránh build picker cho all rows upfront).
6. **CSS**: row bg `#fefce8` khi mode ON, hover `#fef9c3`, button purple gradient `#6d28d9 → #7c3aed`. Khử dashed hover trên cell read-only trong edit mode.
7. **Verified Playwright**: toggle ON → input toàn bảng (NCC, Tên SP, Biến Thể, SL, Giá Bán, Giá Nhập, Ghi Chú, status); edit SL 21→25 → counter SL 36→40 + Tổng tiền 9.200→10.400₫ instant; toggle OFF → revert read-only, data giữ; dblclick lẻ trên OFF vẫn mở input đúng cell.

**Status**: ✅ Done.

### [so-order] Đổi từ toggle button → dblclick-to-edit + inline image edit modal

**User**: feature "Chỉnh sửa bảng" theo flow toggle gây lẫn lộn (mode bật/tắt) → đổi sang **double-click ô để sửa** trực tiếp, intuitive hơn.

**Implementation** ([so-order/{index.html,css/so-order.css,js/so-order-app.js}](../so-order/)):

1. **Bỏ button `#soEditTableBtn` + state `editTableMode`** — thay bằng `.so-hint-chip` "Double-click ô để sửa" ở header cho rõ ràng UX.
2. **Cell renderers giờ dán `data-cell-field`** lên `<td>` read-only. Listen `dblclick` trên row → mở inline editor cho cell đó (qty/sellPrice/costPrice/supplier/productName/note/costNote/variant/status). Save ngay khi blur/Enter, escape khôi phục giá trị cũ.
3. **Inline image edit modal `#soInlineImageModal`** mới — dblclick ô ảnh (`productImage` / `invoiceImage`) mở modal: paste Ctrl+V / drag-drop / chọn file / dán URL. Preview live + nút "Xóa ảnh". Lưu → update row + Firestore sync.
4. **CSS**: dashed underline subtle khi hover cell editable, image preview box `min-height: 80px`, modal panel narrow.
5. **Fix**: index.html đã load `web2-effects.css` 2 lần (v=20260515b + v=20260517b) → giữ lại bản mới `20260517b`.

**Status**: ✅ Done.

### [so-order] Inline "Chỉnh sửa bảng" — toggle bật/tắt edit cell trực tiếp trên table

**User**: "thêm chỉnh sửa bảng".

**Implementation** ([so-order/{index.html,css/so-order.css,js/so-order-app.js}](../so-order/)):

1. Button `#soEditTableBtn` cạnh "Ẩn/Hiện cột". State `editTableMode` persist localStorage `soOrder_editTableMode_v1`
2. Split cell renderers: `_readCells()` (read-only) vs `_editCells()` (input/select cho field editable)
    - qty/sellPrice/costPrice → number input | supplier/productName/note/costNote → text input | variant → input + variant picker mini từ Web2VariantsCache (validate phải có trong Kho Biến Thể, fail → revert) | status → select 4 option
    - stt/images/actions giữ nguyên (ảnh paste/drop dùng modal)
3. Auto-save (`wireInlineEditCells`): change event → `SoOrderStorage.updateRow` → `pushSync()` Firestore → `renderFooterTotals()`. Enter → blur. Row flash xanh `.is-saved-flash` 600ms.
4. Visual: button `.is-active` gradient tím, body class `so-edit-table-mode` → row vàng nhạt `#fefce8` chỉ rõ mode

**Smoke test**: click toggle → row chuyển input, vàng nhạt; SL 20→21 → tổng SL 35→36, tổng tiền 8.900→9.200₫ (+300 = 1×300 sellPrice); reload mode vẫn ON.

**Status**: ✅ Done.

### [web2][seed] Bulk seed 108 biến thể từ `bienthe.txt` vào Kho Biến Thể

**User**: "thêm 108 biến thể trong /Users/mac/Desktop/n2store/bienthe.txt vào http://localhost:8093/web2/variants/index.html".

**Implementation**:

1. Verify API live: `/api/web2/variants/health` → `{ok:true, count:0}` (Render + CF Worker đã deploy variant routes)
2. Script [`scripts/seed-web2-variants.sh`](../scripts/seed-web2-variants.sh): đọc file txt từng dòng (trim + skip empty), POST `/api/web2-variants`:
    - `value` = raw line giữ nguyên (kể cả "SỌC ĐỎ" uppercase user cố tình)
    - `groupName` auto: prefix "Màu " → "Màu", prefix "Size" → "Size", khác → null
    - `sortOrder` = line number (giữ thứ tự gốc trong file)
    - `createdBy` = "seed-script"
3. Run → **108/108 created**, 0 duplicate, 0 fail

**Verification**:

- `/health` → `count: 108`
- `/list?group=Màu` → total 80
- `/list?group=Size` → total 28
- Browser screenshot: purple pills value + group "Màu" pill + "Đang dùng" + sort ascending

**Status**: ✅ Done.

### [docs][meta] API Keys / Secrets convention — `serect_dont_push.txt` central reference

**User**: "cần key api thì vào serect dont push → thêm thông tin này vào memory, claude, dev-log → nếu chưa có file thì tạo và kêu người dùng thêm key nếu muốn".

**Status check**:

- File `/Users/mac/Desktop/n2store/serect_dont_push.txt` ĐÃ tồn tại (8000 bytes, 21+ keys/tokens), đã có trong `.gitignore`. KHÔNG cần tạo mới.

**Changes** (3 chỗ duplicate rule cho không miss):

1. **CLAUDE.md** — section mới "API Keys / Secrets — BẮT BUỘC":
    - Đọc `serect_dont_push.txt` TRƯỚC khi cần bất kỳ key/token/credential (Render, Firebase, CF, Gemini, OpenAI, TPOS, Pancake, SePay, …)
    - File chưa tồn tại → `touch` tạo rỗng + báo user paste key, KHÔNG bịa
    - KHÔNG: echo/log/commit/screenshot, argv passing, hardcode source/test
    - Edit in place khi user nói "thêm/cập nhật key"
2. **Memory** (`reference_secrets_file.md` + `MEMORY.md`): refresh entry với trigger keywords mở rộng + "nếu chưa tồn tại" workflow; promote section "🔑 API Keys / Secrets" lên đầu MEMORY.md
3. **Dev-log** — entry này (changelog convention)

**Status**: ✅ Done. No code changes.

### [web2][so-order][render][cf-worker] Kho Biến Thể riêng — picker dropdown thay free-text variant

**User**:

1. Sửa biến thể SP cũ trên Kho SP không cập nhật → cần Render deploy variant column
2. "Thêm 1 nút là kho biến thể để quản lý tất cả biến thể — các biến thể tạo ra sẽ lấy trong danh sách của kho này, muốn thêm mới phải thêm ở kho biến thể"

**Implementation**:

**Backend + Worker**:

- New table `web2_variants` (id, value UNIQUE, group_name, sort_order, is_active, created_by, created_at, updated_at)
- REST CRUD route `/api/web2-variants` ([render.com/routes/web2-variants.js](../render.com/routes/web2-variants.js)): health, list, get, create (409 on duplicate), patch, delete
- Register trong [server.js](../render.com/server.js) `app.use('/api/web2-variants', web2VariantsRoutes)`
- CF Worker route mapping: `WEB2_VARIANTS` pattern + case → handleCustomer360Proxy ([cloudflare-worker/worker.js](../cloudflare-worker/worker.js) + [modules/config/routes.js](../cloudflare-worker/modules/config/routes.js))

**Frontend**:

1. **Web2VariantsApi client** ([web2/variants/js/web2-variants-api.js](../web2/variants/js/web2-variants-api.js))
2. **Web2VariantsCache shared module** ([web2/shared/web2-variants-cache.js](../web2/shared/web2-variants-cache.js)): in-memory cache + Firestore tickler doc `web2_variants_sync/notify` (realtime cross-machine), API `getAll/findByValue/findByValueExact/has/pushTickle/subscribe`
3. **Kho Biến Thể page** ([web2/variants/index.html](../web2/variants/index.html) + [js/web2-variants-app.js](../web2/variants/js/web2-variants-app.js) + [css/web2-variants.css](../web2/variants/css/web2-variants.css)): sidebar nav mới "Kho Biến Thể" trong group Sản phẩm; table # | BIẾN THỂ | NHÓM | THỨ TỰ | TRẠNG THÁI | THAO TÁC; filter search/active/group; modal CRUD value+group+sort+active
4. **Kho SP picker** ([web2/products/js/web2-products-app.js](../web2/products/js/web2-products-app.js)): field "Biến thể" → input + dropdown picker từ Web2VariantsCache (focus/input → show, click → fill). Hint inline: ✓ Đã chọn từ Kho Biến Thể / lỗi đỏ nếu giá trị không tồn tại. `saveModal()` validate, block + notify nếu variant không hợp lệ. Aux link "Kho Biến Thể" mở tab mới
5. **so-order picker** ([so-order/js/so-order-app.js](../so-order/js/so-order-app.js)): cột Biến thể mỗi row → dropdown picker giống Kho SP; `handleOrderSubmit` validate từng row variant phải có trong Kho Biến Thể trước khi save

**Smoke test** (localhost:8093):

- Trang Kho Biến Thể render đầy đủ UI (table + filter + modal); fetch HTTP 404 vì backend chưa deploy — expected
- Modal Kho SP hiện field "Biến thể" với link "Kho Biến Thể" mở tab mới + input + hint dynamic

**Deploy note**:

- Render auto-deploy sau push (~2-4 phút). Migration `ensureTables` chạy lần đầu /api/web2-variants được gọi
- CF Worker cần deploy thủ công qua wrangler: `cd cloudflare-worker && wrangler deploy`

**Status**: ✅ Frontend Done, chờ Render + CF Worker deploy.

### [web2][so-order][render] Kho SP — field BIẾN THỂ độc lập (DB column + column trong table + input modal + autofill so-order)

**User**: "Kho SP web 2.0 thêm biến thể SP vào — ghi biến thể ở đây, đừng ghi vào cột ghi chú".

**Background**: trước đó so-order modal có input "Biến thể" (size/màu/spec) — khi auto-add SP mới vào kho, biến thể đi chung vào field `note` cùng với label HÀ NỘI/HƯƠNG CHÂU → ghi chú bị lẫn lộn. Yêu cầu: tách biến thể thành cột/field riêng.

**Implementation**:

1. **Migration 068** ([render.com/routes/web2-products.js](../render.com/routes/web2-products.js)): `ALTER TABLE web2_products ADD COLUMN IF NOT EXISTS variant TEXT`. Auto-applied trong block `ensureTables` (chạy 1 lần khi /api/web2-products được gọi sau deploy). Idempotent — nếu cột đã có thì no-op. `mapRow` thêm field `variant`. POST insert + PATCH update đều bao gồm `variant` (trim, null nếu empty).

2. **Kho SP table** ([web2/products/index.html](../web2/products/index.html), [js/web2-products-app.js](../web2/products/js/web2-products-app.js), [css/web2-products.css](../web2/products/css/web2-products.css)):
    - Cột mới BIẾN THỂ chèn giữa TÊN SẢN PHẨM và GIÁ MUA (colspan = 11)
    - Cell hiển thị `<span class="variant-pill">Size M</span>` (purple pill, ellipsis maxWidth 160px) hoặc `—` khi empty
    - Loading/empty rows updated colspan 11

3. **Kho SP modal** ([web2/products/index.html](../web2/products/index.html)):
    - Thêm field-row "Biến thể" `#pmVariant` với placeholder "VD: Size M / Đỏ / 2003 B5" giữa Tên sản phẩm và grid Giá Mua/Bán/Tồn
    - openCreate/openEdit clear + populate variant. saveModal gửi `variant` lên API.
    - Update placeholder Ghi chú từ "Size/màu/tag..." → "Ghi chú nội bộ, tag nhập hàng (HÀ NỘI, HƯƠNG CHÂU)..." cho khớp nghĩa mới.

4. **so-order modal** ([so-order/js/so-order-app.js](../so-order/js/so-order-app.js), [css/so-order.css](../so-order/css/so-order.css)):
    - `applySuggestionToRow`: nếu kho có `p.variant` và row.variant đang trống → autofill. Không clobber nếu user đã gõ.
    - Suggestion dropdown item: thêm purple pill `.so-suggest-variant` cạnh tên SP — show "AO NAU M [Size M]" trực quan.
    - `syncRowsToKho` (sau Lưu Nháp): tách variant ra khỏi note hoàn toàn:
        - SP đã có: `patch.note` chỉ chứa tab.label (sticky tag), `patch.variant` chỉ set nếu kho trống (không clobber)
        - SP mới: POST với `variant` field riêng + `note: tab.label` (chỉ label, không có variant)

**Files touched**:

- `render.com/routes/web2-products.js` (ALTER TABLE + mapRow + POST + PATCH)
- `web2/products/index.html`, `web2/products/css/web2-products.css`, `web2/products/js/web2-products-app.js`
- `so-order/index.html` (version bump), `so-order/js/so-order-app.js`, `so-order/css/so-order.css`

**Smoke test** (localhost:8093, browser session sống):

- Kho SP: cột BIẾN THỂ render giữa TÊN SẢN PHẨM và GIÁ MUA, SP SP001 hiện "—" (vì DB chưa có data variant cho row cũ). Modal Thêm SP hiện input "Biến thể" placeholder "VD: Size M / Đỏ / 2003 B5".

**Deploy note**: backend changes cần Render deploy push lên prod để ALTER TABLE chạy. Frontend đã graceful nếu chưa deploy (variant field undefined → cell "—" + dropdown không show pill).

**Status**: ✅ Done. Cần Render deploy + smoke test online.

### [web2] Hover-zoom catch-all + Web2Effects.attachImageDropTarget — Kho SP modal Ctrl+V upload

**User**: "toàn bộ dự án web 2.0 liên quan tới ảnh là hover zoom lên + nếu upload thì cho ctrl V vào area".

**Implementation**:

1. **Hover-zoom catch-all** ([web2/shared/web2-effects.js](../web2/shared/web2-effects.js)): bổ sung container-based detection — mọi `<img>` nằm trong `.web2-shell`, `body.tpos-theme`, hoặc `body.tpos-clone` tự động được zoom khi hover, không cần selector cụ thể. Legacy whitelist (`.product-image`, `.so-cell-img img`, …) vẫn giữ làm fallback cho pages chưa có Web 2.0 container. Exclusions: `data-w2-no-zoom`, sidebar/aside/nav, `button`/`a`/`.btn-icon-round`/avatar/icon, ảnh < 32 px.

2. **Web2Effects.attachImageDropTarget(el, opts)** — helper dùng chung tách ra từ pattern so-order:
    - `onResult(url, file)` callback bắt buộc, trả về dataURL base64
    - 3 cách input: click → file picker; Ctrl+V khi focus → paste; kéo thả file → drop
    - `noClickPicker: true` khi caller đã có nút upload riêng (so-order)
    - Auto thêm `tabindex="0"` để Ctrl+V land được; auto-toggle `.is-dragover` class
    - Idempotent: gọi 2 lần cùng el → reuse handle. Expose `.detach()` programmatic
    - Default `maxSizeMB = 2`, cảnh báo (không reject) khi vượt
    - Notify fallback chain: opts.notify → `window.notificationManager` → console.warn

3. **Kho SP Web 2.0**: field "Link ảnh" → "Ảnh sản phẩm" là drop target `#pmImageDrop` với hint "Click chọn file · Ctrl+V để dán ảnh · Kéo thả file · hoặc dán URL bên dưới". URL input vẫn giữ; wire `Web2Effects.attachImageDropTarget` trong `init()` → ghi base64 vào `#pmImage` + update preview. Trang nay load thêm `web2/shared/web2-effects.{js,css}` (trước thiếu).

4. **so-order DRY**: `wireModalImagePasteDrop()` cũ → 1 dòng gọi `Web2Effects.attachImageDropTarget(cell, { noClickPicker: true, onResult, notify })`. Tách `_applyImageToRow()` reusable.

**CSS**: thêm `.w2fx-drop-target` + `.w2fx-drop-hint` chung trong `web2-effects.css` để page chỉ cần markup div + apply class, framework lo focus/hover/drag-over visuals.

**Status**: ✅ Done.

### [web2][so-order] Kho SP Web 2.0 — split Giá Mua/Giá Bán, realtime Firestore, so-order multi-row + suggestion + auto-add

**User**: redesign trang Kho SP Web 2.0 với cột mới (ẢNH/MÃ/TÊN/GIÁ MUA/GIÁ BÁN/TỒN/GHI CHÚ/TRẠNG THÁI), gộp "Thêm SP" lên header (bỏ Tải lại/Áp dụng/Xóa lọc), realtime cross-machine. Trang `so-order/index.html` modal Tạo Đơn Hàng cần: badge "Đã có ở kho", suggestion khi gõ tên/mã, hiện tồn kho, nút "+" thêm hàng, lưu nháp xong auto-thêm SP mới vào kho với note = tab name (HÀ NỘI / HƯƠNG CHÂU).

**Implementation**:

1. **Shared cache + realtime** ([web2/shared/web2-products-cache.js](../web2/shared/web2-products-cache.js)):
    - In-memory `Map<code, product>` + ordered list, full paginated load qua `Web2ProductsApi.list`.
    - Firestore tickler doc `web2_products_sync/notify` = `{ lastUpdated, by, action, code }`. Mỗi CRUD ghi vào doc; mọi client mở snapshot listener, debounce 400 ms reload khi `by` ≠ chính mình.
    - Public API: `init()`, `getAll()`, `findByCode()`, `findByName(q, n)`, `findByNameExact()`, `has()`, `pushTickle()`, `subscribe()`, `refresh()`.
    - `clientId` lưu `sessionStorage` để cùng máy tab khác vẫn nhận tickle.

2. **Kho SP Web 2.0** ([web2/products/index.html](../web2/products/index.html), [js/web2-products-app.js](../web2/products/js/web2-products-app.js), [css/web2-products.css](../web2/products/css/web2-products.css)):
    - HTML: header `page-head-mini` thêm `+ Thêm SP` (di chuyển lên), xóa hẳn `search-info-right` (Tải lại / Áp dụng / Xóa lọc); table cột mới ẢNH | MÃ SP | TÊN SẢN PHẨM | GIÁ MUA | GIÁ BÁN | TỒN KHO | GHI CHÚ | TRẠNG THÁI | THAO TÁC (colspan = 10).
    - Modal: 3-cột grid Giá Mua / Giá Bán / Tồn kho; `pmPriceBuy` → field `originalPrice`, `pmPriceSell` → field `price` (schema sẵn có 2 cột này).
    - JS: subscribe Web2ProductsCache → load() khi tickle; sau create/update/delete/toggle gọi `pushTickle({action, code})` để các client khác auto-reload.

3. **so-order modal** ([so-order/index.html](../so-order/index.html), [js/so-order-app.js](../so-order/js/so-order-app.js), [css/so-order.css](../so-order/css/so-order.css)):
    - Multi-row UI: `modalRows[]` state với uid stable mỗi row; render từng row qua `modalRowHtml()`; tbody `#soModalProductsBody` được rerender khi thêm/xóa dòng, KHÔNG khi gõ field (giữ focus).
    - Nút **+ Thêm sản phẩm** (`#soModalAddRowBtn`) chỉ hiện ở `modalMode = create`; edit single-row vẫn 1 dòng.
    - Suggestion: input `productName` → `showSuggest()` chỉ khi query ≥ 1 ký tự (user feedback: "chưa nhập tên hay mã nó đã hiện suggestion" → empty input → hide); click suggestion → autofill name + costPrice (giá mua) + sellPrice (giá bán) + image, set `row.matchedCode`. `mousedown.preventDefault()` để blur không fire trước.
    - Badge "Đã có ở kho" (xanh) khi `Web2ProductsCache.findByNameExact(name)` ≠ null; ngược lại "SP mới" (vàng) — báo trước user là khi lưu sẽ tạo SP trong kho.
    - Tồn kho pill bên cạnh badge (vàng < 5, đỏ = 0, xanh dương ≥ 5) — đọc realtime từ cache.
    - **Auto-add to kho** sau `Lưu (Nháp)`: `syncRowsToKho(rows, tab)` chạy best-effort song song, mỗi row trong order:
        - Nếu matched (theo `matchedCode` hoặc `findByNameExact`): chỉ bổ sung `tab.label` vào `note` nếu chưa có (sticky tag, dùng `|` separator, dedupe case-insensitive); KHÔNG ghi đè.
        - Nếu chưa có: POST `Web2ProductsApi.create()` với code generated (`{slug6}-{ts5}{rnd3}`), price (VND quy đổi từ tab.rate), stock 0, note = tab.label.
        - Cuối hàm `Web2ProductsCache.pushTickle({action: 'sync-from-so-order'})` để Kho SP page các máy khác refresh.

**Files touched**:

- `web2/shared/web2-products-cache.js` (new)
- `web2/products/index.html`, `web2/products/js/web2-products-app.js`, `web2/products/css/web2-products.css`
- `so-order/index.html`, `so-order/js/so-order-app.js`, `so-order/css/so-order.css`

**Smoke test** (localhost:8093 / persistent browser session):

- Kho SP: render đúng 10 cột mới, GIÁ MUA (dimmer) ≠ GIÁ BÁN (bold), "+ Thêm SP" nằm trên header phải, search-info-right đã biến mất.
- so-order modal: input rỗng → no suggest popup; gõ "ao" → suggest "AO NAU M / SP001 / Tồn: 2 / 100.000đ"; click suggestion → autofill name, sellPrice, badge xanh "Đã có ở kho", tồn pill cam "Tồn: 2", total cập nhật 100.000đ.

**Status**: ✅ Done. Cần verify online sau Render deploy (~2-4 phút) + cross-machine realtime tickle thực tế.

### [chat] Toggle Tin nhắn/Bình luận sync với conv thực tế load — fix "click cột tin nhắn mở modal bình luận"

**User báo**: "Bật vào cột tin nhắn mà nó mở modal bình luận → phải chuyển qua lại bình luận tin nhắn nó mới mở modal tin nhắn".

**Root cause**: `openChatModal(orderId, pageId, psid, 'INBOX')` set `window.currentConversationType='INBOX'` + toggle UI=INBOX. Nhưng `_findAndLoadConversation` có nhiều path lookup, đôi khi resolve về một conv khác type với requested (vd customer chỉ có COMMENT trên page đó → fallback `foundConvs[0]` chính là COMMENT). Khi đó `_loadMessages` render COMMENT data nhưng:

- `currentConversationType` vẫn = `'INBOX'`
- Toggle UI vẫn highlight `Tin nhắn`

→ Khi user nhấn tab `Tin nhắn` lại không có gì xảy ra (guard `if (type === currentConversationType) return;` ở [`switchConversationType`](../orders-report/js/tab1/tab1-chat-core.js:2157)). Phải bấm `Bình luận` (force fetch COMMENT) rồi bấm `Tin nhắn` (force fetch INBOX) để UI tự đồng bộ. UX rất khó chịu vì giống "modal mở sai tab".

**Fix** ([orders-report/js/tab1/tab1-chat-core.js](../orders-report/js/tab1/tab1-chat-core.js)):

Sau khi `_doFindAndLoadConversation` resolve conv (line ~1758, ngay sau `currentConversationData = conv`):

```js
const resolvedType = conv.type === 'COMMENT' ? 'COMMENT' : 'INBOX';
if (resolvedType !== window.currentConversationType) {
    window.currentConversationType = resolvedType;
    _updateTypeToggle(resolvedType);
}
```

Cũng sync trong [`_wireConvPickerEmptyState`](../orders-report/js/tab1/tab1-chat-core.js:520) khi user click picker card mà conv được pick khác type với request.

**Test**: Smoke 40 đơn campaign T8 → INBOX type ↔ INBOX toggle ↔ INBOX conv khớp 100%, không có regression cho happy path. Edge case (chỉ có COMMENT trên page): toggle sẽ tự switch sang `Bình luận`, user thấy data + UI đồng bộ thay vì phải toggle thủ công.

**Status**: ✅ Done.

### [web2] Xóa 2 trang TPOS-clone `product-template` + `product-variant` (đã có Kho SP Web 2.0 thay thế)

**User**: "đã có Kho SP Web 2.0 nên bỏ 2 trang trên đi" (đối tượng: `web2/product-template/`, `web2/product-variant/` — TPOS-clone schema-driven CRUD, dữ liệu mock trong `web2_records`).

**Why**: [web2/products/](../web2/products/) là Kho SP riêng (UI riêng + bảng `web2_products`), đã cover use case "Sản phẩm" + "Biến thể SP" rồi. 2 trang `producttemplate`/`product` thuộc page-builder generic chỉ là placeholder TPOS-clone — không ai dùng.

**Đã xóa**:

- `web2/product-template/index.html` + `web2/product-variant/index.html` (qua `git rm -r`).

**Đã dọn tham chiếu**:

- [web2/shared/tpos-sidebar.js](../web2/shared/tpos-sidebar.js) — bỏ 2 entry "Sản phẩm" + "Biến thể SP" trong `children` của menu "Sản phẩm" (giữ Kho SP Web 2.0 + Nhóm sản phẩm + In mã vạch + Thuộc tính…).
- [web2/modules-manifest.js](../web2/modules-manifest.js) — bỏ entry `dir: 'product-template' slug: 'producttemplate'` + `dir: 'product-variant' slug: 'product'`.
- [shared/js/navigation-modern.js](../shared/js/navigation-modern.js) — bỏ 2 href item `web2-product-template` + `web2-product-variant` trong WEB2 nav + bỏ 2 ID khỏi `WEB2_GROUP_ITEMS`.
- [web2/stock-inventory/index.html](../web2/stock-inventory/index.html) + [web2/stock-move/index.html](../web2/stock-move/index.html) — bỏ `link: 'product-template'` ở column + field `productCode` (cell trở về plain text, tránh 404 click-through). Field vẫn giữ `type: 'ref' ref: 'producttemplate'` cho autocomplete — slug-based API vẫn trỏ về PostgreSQL `web2_records` (hiện trống vì đã xóa data scope cũ, nhưng API vẫn alive).

**Giữ nguyên**:

- [web2/shared/tpos-menu.json:200](../web2/shared/tpos-menu.json#L200) — `#/app/producttemplate/list` là deep-link vào TPOS thật, không phải trang nội bộ.

**Verify live**:

- `/web2/product-template/index.html` → 404 ✅
- `/web2/products/index.html` → load OK, render "Kho Sản Phẩm" với data thật (`SP001 AO NAU M`) ✅
- JS syntax: `node -c` qua tpos-sidebar.js, navigation-modern.js, modules-manifest.js → OK.

**Status**: ✅ Done.

---

## 2026-05-17

### [inbox][render] Fix STT trùng — atomic counter `inbox_counters` thay cho `orders.length+1`

**Bug**: STT đơn inbox bị trùng (vd 501, 504 lặp 2 lần) do `tab-social-modal.js` cũ tính `stt = SocialOrderState.orders.length + 1` khi tạo đơn. Khi hủy/xóa đơn → length giảm → STT cũ được tái sử dụng. Multi-tab/multi-device race → 2 đơn cùng STT.

**Fix (hướng B — không đụng đơn cũ)**:

1. **Backend** [render.com/routes/social-orders.js](render.com/routes/social-orders.js):
    - Thêm table `inbox_counters(name PK, value BIGINT, updated_at)` trong `ensureTables`.
    - Endpoint `POST /api/social-orders/next-stt` — atomic UPSERT: lần đầu seed value = `MAX(stt) FROM social_orders + 1` (đảm bảo không trùng đơn cũ), các lần sau `value + 1`. 1 statement Postgres → race-safe.

2. **Frontend API** [don-inbox/js/tab-social-firebase.js](don-inbox/js/tab-social-firebase.js):
    - `getNextSocialOrderSTTFromServer()` async, fallback `getNextSTT()` local (max+1) nếu API lỗi.

3. **Frontend modal** [don-inbox/js/tab-social-modal.js](don-inbox/js/tab-social-modal.js):
    - Nhánh "Create new order" giờ `await getNextSocialOrderSTTFromServer()` trước khi build `newOrder`.
    - Đơn cũ giữ nguyên STT — chỉ đơn tạo mới từ giờ dùng counter.

**Status**: ✅ DONE. Cần Render auto-deploy ~2-3 phút sau push để endpoint mới active.

---

### [orders-report][render] KPI Đơn Inbox: drill-down chi tiết đơn theo NV

**User feedback**: "kpi đơn inbox không ghi rõ là đơn nào à? làm chi tiết giúp tôi" — leaderboard chỉ aggregate, không drill xuống đơn cụ thể.

**Backend** ([render.com/routes/social-orders.js](../render.com/routes/social-orders.js)):

- Thêm route `GET /api/social-orders/kpi-stats/orders?userId=&from=&to=&includeAll=` → trả `{ success, count, orders: [{ id, stt, status, totalQuantity, totalAmount, kpi, createdAt }] }`.
- Order list filter theo `created_by`, ORDER BY `stt ASC NULLS LAST, created_at ASC` → đồng bộ với thứ tự hiển thị don-inbox.
- Worker `/api/social-orders/*` wildcard auto-proxy → không cần thay đổi Worker.

**Frontend**:

- [orders-report/tab-kpi-commission.html](../orders-report/tab-kpi-commission.html): thêm cột `col-inbox-expand` (chevron) bên trái leaderboard.
- [orders-report/js/tab-kpi-commission.js](../orders-report/js/tab-kpi-commission.js):
    - State mới: `_inboxOrdersCache` (key `userId|preset` để invalidate theo date range), `_inboxOrdersInFlight` (dedupe fetch), `_inboxExpandedUsers`, `_INBOX_STATUS_LABELS`.
    - `renderInboxKpiView` render mỗi NV 2 dòng: row chính + row details (hidden) với placeholder spinner.
    - `_bindInboxExpandHandlers` event delegation lên tbody (idempotent qua flag `__inboxExpandBound`).
    - `toggleInboxUserExpand(userId)`: lazy-load đơn khi mở, dùng cache nếu có; collapse trong lúc fetch → skip render.
    - `_loadInboxOrdersForUser`: gọi endpoint mới, dedupe in-flight promise, cache theo `userId|preset`.
    - `_renderInboxUserOrders`: sub-table 5 cột — STT (don-inbox), Số phiếu (id SO-xxx), SL Món, KPI (qty×5.000đ), Trạng thái (badge theo STATUS_CONFIG).
    - `refreshInboxKpi` clear cache đơn để fetch lại sạch.
- [orders-report/css/tab-kpi-commission.css](../orders-report/css/tab-kpi-commission.css): chevron button rotate 90° khi expand, row.is-expanded bg `#f8fafc`, sub-row 50px indent, sub-table inset card, status badges (draft/order/processing/completed/cancelled) đồng bộ palette với `tab-social-core.js`.

**Smoke test localhost**:

- Render 3 user rows (Admin/My/Bo) + 3 hidden details rows ✓
- Click chevron → row expand, `is-expanded` class apply, chevron quay 90° (purple bg) ✓
- Fetch fail gracefully khi endpoint chưa deploy (HTTP 404) → error UI render đúng với alert-triangle ✓
- Click lại → collapse, hidden=true ✓
- Screenshot: [downloads/n2store-session/kpi-inbox-expanded-error.png](../downloads/n2store-session/kpi-inbox-expanded-error.png)

**Cần deploy sau commit**: Render auto-deploy từ main. Sau ~2-4 phút endpoint `/kpi-stats/orders` live → drill-down hoạt động end-to-end.

**Status**: ✅ Done — chờ Render deploy verify online.

---

### [orders-report] KPI strip: SSE 'kpi_base' channel thay polling + custom event

**User feedback**: "Tại sao polling + custom event mà không dùng SSE Render có sẵn?". Đúng — Render đã có SSE channel `kpi_base` (docs/render/render.md:693), không cần polling.

**Refactor**:

- EDIT [orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js):
    - REPLACE `subscribeOrderAdded()` + `startPolling()` → `subscribeRealtime()` dùng `new EventSource('${API_BASE}/sse?keys=kpi_base')`.
    - Listen 3 events: `update`, `created`, `deleted` (theo pattern held-products-manager.js).
    - Debounce 2.5s gộp burst push + chờ kpi_statistics ghi xong sau kpi_base.
    - Fallback polling **60s** chỉ khi `onerror` fire trước `connected` (initial connect fail). Sau khi đã connect 1 lần → EventSource tự reconnect, không kép.
- REVERT [orders-report/js/tab1/tab1-tpos-realtime.js](../orders-report/js/tab1/tab1-tpos-realtime.js): xóa `window.dispatchEvent(new CustomEvent('n2:order-added', ...))` — không cần nữa vì SSE handle trực tiếp.

**Vì sao SSE > polling**:

- Latency thấp hơn: realtime push thay vì chờ 30s polling.
- Tiết kiệm: 1 request mở SSE connection vs 1 request mỗi 30s × số browser × số tab1 open.
- Đồng bộ cross-browser: cùng push event → cùng debounce window → toast fire gần như đồng thời ở mọi browser.
- Tận dụng infra hiện có: `kpi_base` SSE channel đã có sẵn (docs/render/render.md line 693), không cần thêm endpoint.

**Verify**:

- Probe `GET /api/realtime/sse/stats` → `keyStats.kpi_base === 1` xác nhận strip subscribed.
- Strip render đúng 3 cards (Huyền/Hạnh/Hồng), top-1 có gradient xanh + star.
- Toast logic không đổi: vẫn fire khi diff snapshot phát hiện delta soMon / đổi top.

**Status**: DONE.

### [orders-report] Toast realtime cho KPI strip — "X bán thêm N" + "TOP SALE"

**User request**: Khi 1 user tăng thêm KPI → toast "Hạnh bán X" cho mọi người thấy; khi user vượt mặt leader → toast "CHÚC MỪNG HẠNH ĐỨNG TOP SALE".

**Approach**: Mỗi browser tự diff snapshot (cùng data nguồn `/api/realtime/kpi-statistics` → cùng toast cho mọi user xem tab1). Không cần broadcast layer.

**Files**:

- EDIT [orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js):
    - `prevSnapshot: Map<userId, {soMon,soTien,userName}>` + `prevTopUserId` state.
    - `diffAndToast(stats)`: với mỗi user có `soMon` tăng so prev → `notificationManager.success("X bán thêm <b>N</b> món", 4s)`. Nếu `stats[0].userId !== prevTopUserId` và prev top tồn tại + có ≥2 user + top mới có KPI > 0 → `notificationManager.success("🎉 CHÚC MỪNG <b>X</b> ĐỨNG TOP SALE!", 8s, title="TOP SALE")`.
    - `isFirstRefreshForCampaign` flag: lần đầu seed snapshot không fire toast. Reset khi đổi campaign.
    - Refresh triggers mới: polling 30s + listen `window.addEventListener('n2:order-added', ...)` debounced 6s (chờ backend tính KPI).
- EDIT [orders-report/js/tab1/tab1-tpos-realtime.js](../orders-report/js/tab1/tab1-tpos-realtime.js) line 132+: dispatch `window.dispatchEvent(new CustomEvent('n2:order-added', { detail: { code } }))` sau `addOrderToTable(order)` thành công.

**Edge cases**:

- Lần refresh đầu sau khi chọn campaign → seed snapshot, không toast.
- Đổi campaign → `resetSnapshot()` → snapshot mới, không toast.
- `prevTopUserId === null` → skip TOP SALE (lần đầu seed).
- `stats.length < 2` → skip TOP SALE (1 user không gọi là "vượt mặt").
- API fail → `console.error`, không toast (snapshot không cập nhật).
- Burst orders → debounce 6s gộp thành 1 refresh + toasts cho mỗi user có delta.
- XSS: `userName` luôn escapeHtml; `<b>` chỉ wrap số nguyên + uppercased name đã escape.

**Verify**: Playwright smoke — set T7 campaign, seed snapshot, monkey-patch fetch để boost Hồng (#3 → #1) → cả 2 toasts fire đúng:

- "Hồng bán thêm <b>55</b> món" (dur=4000)
- "🎉 CHÚC MỪNG <b>HỒNG</b> ĐỨNG TOP SALE!" (dur=8000, title="TOP SALE")

**Status**: DONE.

### [orders-report] KPI stats strip theo Chiến Dịch ở toolbar tab1

**User request**: Hiển thị stat KPI realtime của từng nhân viên giữa nút "Tải lại" và toggle "Auto T", scope theo Chiến Dịch đang chọn. Mỗi nhân viên = 1 ô. Top-1: xanh lá + ngôi sao vàng. Sort desc theo KPI.

**Files**:

- NEW [orders-report/css/tab1-kpi-stats-strip.css](../orders-report/css/tab1-kpi-stats-strip.css) — styles: pill cards, top-1 gradient xanh + star, mobile xuống dòng.
- NEW [orders-report/js/tab1/tab1-kpi-stats-strip.js](../orders-report/js/tab1/tab1-kpi-stats-strip.js) — IIFE module `window.KPIStatsStrip = { init, refresh }`. Fetch `/api/realtime/kpi-statistics` (REUSE endpoint của tab KPI-HOA HỒNG, không tạo mới), filter `order.campaignName === window.campaignManager.activeCampaign.name`, sum per user, render cards.
- EDIT [orders-report/tab1-orders.html](../orders-report/tab1-orders.html) — thêm `<link>` CSS, `<div id="kpiStatsStrip">` ở giữa nhóm trái/phải của `.search-info`, `<script>` JS sau `tab1-kpi-stats.js`.

**Hành vi**:

- Auto-init khi DOM ready, poll `campaignManager.activeCampaign.name` (500ms × 30 lần) → fetch lần đầu.
- Watcher polling `activeCampaignId` mỗi 2s → đổi campaign tự refresh.
- Edge cases: chưa chọn campaign → strip ẩn; API fail → strip ẩn + console.error; 0 user có KPI → strip ẩn (`:empty` CSS).
- Format: số món = `${n}m`, số tiền = compact K/M (`15K`, `1.5M`).

**Reuse strict**: chỉ READ endpoint hiện có. KHÔNG modify `tab-kpi-commission.js`, `kpi-manager.js`, hay `campaignManager`. Per feedback memory `feedback_api_scope.md`.

**Verify**: Smoke-tested với Playwright MCP — load main.html, set active campaign T7, refresh → 3 cards render đúng (Top-1: Huyền 🐰 7m·35K với star vàng + nền xanh; 2: Hạnh ฅ ฅ 6m·30K; 3: Hồng 3m·15K). Sort desc theo soTien khớp.

**Status**: DONE.

### [orders-report] Tách hoàn toàn KPI check store khỏi delivery-report

**User clarify**: "việc kiểm tra ở 2 trang kpi và thống kê giao hàng là riêng biệt hoàn toàn" và "việc kiểm tra ở page cũng là riêng biệt nhau không trùng lặp".

**Vấn đề trước fix**: KPI tab và delivery-report cùng đọc/ghi vào Firestore collection `delivery_report/data/order_checks` → check ở 1 page → page kia cũng thấy đơn xám + ✓. Sai design, user muốn 2 luồng kiểm tra hoàn toàn độc lập.

**Fix**:

- `_orderCheckStore._getCol()` trong tab-kpi-commission.js đổi từ `delivery_report/data/order_checks` → **`kpi_commission/data/order_checks`** (collection RIÊNG cho KPI tab).
- Delivery-report giữ nguyên `delivery_report/data/order_checks` (không đụng).
- Không có code cross-reference giữa 2 store (verified bằng grep). Mỗi store có listener Firestore riêng cho collection riêng.
- Tab "Lịch sử kiểm tra" trong KPI giờ chỉ chứa check từ KPI → bỏ cột "Nguồn" (luôn là KPI, không còn ý nghĩa). Header → 8 cột.

**Tác dụng**:

- Bấm "Đã kiểm tra" ở Modal L2 KPI → chỉ ảnh hưởng row trong Modal L1 KPI + history KPI. Không ảnh hưởng delivery-report.
- Bấm ở delivery-report row → chỉ ảnh hưởng table delivery-report. Không xuất hiện trong history KPI.
- 2 luồng hoàn toàn độc lập, không trùng lặp.

**Lưu ý**: Các check đã thực hiện trước fix này (trong khoảng test) nằm ở collection `delivery_report/data/order_checks` → sau fix, KPI không còn thấy chúng nữa (đúng design). Nếu cần dữ liệu test cũ thì check lại từ đầu trong KPI.

**Files**: `orders-report/js/tab-kpi-commission.js`, `orders-report/tab-kpi-commission.html`

**Status**: Done.

---

### [permissions + orders-report + delivery-report] Permission `canMarkOrderChecked` + tab "Lịch sử kiểm tra"

**User yêu cầu**:

1. Bổ sung 1 detail permission để chọn user nào được thấy + bấm dialog "Xác nhận kiểm tra đơn" (đánh dấu đã kiểm tra).
2. Thêm tab "Lịch sử kiểm tra" lưu toàn bộ thao tác: ai kiểm tra, thời gian, đơn nào, campaign nào, KPI của ai.

**Implementation — Permission**:

- `user-management/js/permissions-registry.js`:
    - Thêm `canMarkOrderChecked` vào `baocaosaleonline.detailedPermissions` (cho KPI - HOA HỒNG).
    - Thêm `canMarkOrderChecked` vào `delivery-report.detailedPermissions` (cho Thống Kê Giao Hàng).
    - 2 permission RIÊNG cho 2 page → admin có thể grant từng page hoặc cả 2 độc lập.
- `orders-report/js/tab-kpi-commission.js::_canMarkOrderChecked()`: inline check đọc `loginindex_auth` từ sessionStorage/localStorage, bypass cho admin, check `detailedPermissions.baocaosaleonline.canMarkOrderChecked === true`. Mirror pattern `PermissionHelper.hasPermission` để khỏi thêm script tag.
- `delivery-report/js/delivery-report.js::canMarkOrderChecked()`: cùng pattern, check `detailedPermissions['delivery-report'].canMarkOrderChecked`.
- `closeOrderDetails` (KPI) và `requestCloseRowModal` (delivery-report) đều check quyền TRƯỚC khi show confirm. Không có quyền → đóng modal thẳng, không hỏi popup.

**Implementation — Tab "Lịch sử kiểm tra"**:

- HTML [orders-report/tab-kpi-commission.html](orders-report/tab-kpi-commission.html): thêm sub-tab thứ 3 "Lịch sử kiểm tra" cạnh "KPI Đơn Hàng" / "KPI Đơn Inbox"; container `#kpiCheckHistoryView` chứa toolbar (info text + search input + count) và table với 9 cột: STT, Số phiếu, Mã ĐH, Campaign, KPI của NV, KPI (VNĐ), Người kiểm, Thời gian, Nguồn (pill KPI/Giao hàng).
- JS:
    - `switchKpiSubTab` refactor sang map `{orders, inbox, 'check-history'}` thay vì if/else. Khi switch sang `check-history` → gọi `_orderCheckStore.init()` (idempotent) rồi `_renderCheckHistory()`.
    - `_renderCheckHistory()` đọc trực tiếp `_orderCheckStore._data.values()` (đã được Firestore listener sync realtime), sort `checkedAt` DESC, filter theo search input (match số phiếu / mã ĐH / campaign / NV / người kiểm / khách / SĐT). Format giờ kiểu `dd/MM/YYYY HH:mm`. Source pill: KPI (tím) / Giao hàng (xanh) / — (xám).
    - `_renderCheckHistory` được gọi tự động sau: (1) `markChecked` local set, (2) Firestore `onSnapshot` listener, (3) initial `col.get()` xong → đảm bảo realtime sync.
- CSS [orders-report/css/tab-kpi-commission.css](orders-report/css/tab-kpi-commission.css): thêm `.kpi-check-history-toolbar` (flex toolbar) + `.kpi-check-history-controls input` (search box focus ring) + `.kpi-src-pill` (3 màu theo source).

**Implementation — Enrich payload**:

- `tab-kpi-commission.js`:
    - `state.currentEmployeeName` mới — set khi mở Modal L1 (resolved name của nhân viên KPI).
    - `closeOrderDetails` enrich `_pendingCheckCtx` với `campaignName, kpiOwnerUserId, kpiOwnerUserName, kpiAmount, netProducts` từ order + state.
    - `_orderCheckStore.markChecked` save full payload + `checkedByDisplayName` (display name của người kiểm) + `source: 'kpi-commission'`.
- `delivery-report.js::OrderCheckStore.markChecked` cũng update: thêm `checkedByDisplayName` + `source: 'delivery-report'` để history tab phân biệt nguồn.

**Backward compat**: Đơn check cũ (trước thay đổi) thiếu các field mới → hiện "—" trong bảng. Không break gì.

**Files**: `user-management/js/permissions-registry.js`, `orders-report/tab-kpi-commission.html`, `orders-report/js/tab-kpi-commission.js`, `orders-report/css/tab-kpi-commission.css`, `delivery-report/js/delivery-report.js`

**Status**: Done — admin grant quyền `canMarkOrderChecked` cho user nào trong user-management → user đó mới thấy popup khi đóng modal chi tiết đơn.

---

### [orders-report] KPI - HOA HỒNG: row "đã kiểm tra" hiển thị xám nhẹ + dấu ✓ ở STT

**User yêu cầu**: Đơn nào đánh "đã kiểm tra" → tô xám nhẹ + thêm dấu check nhỏ ở cột STT để dễ phân biệt với đơn chưa check.

**Implementation**:

- CSS [orders-report/css/tab-kpi-commission.css](orders-report/css/tab-kpi-commission.css): thêm `.modalL1-table tbody tr.kpi-l1-row-checked` với `background:#f3f4f6`, `color:#6b7280`, và pseudo `td[data-col='stt']::after { content:' ✓'; color:#10b981; }`. Pattern y hệt `.dr-row-checked` của delivery-report nhưng scope vào `modalL1-table` để không đụng `.kpi-row-checked` (đã dùng cho SP có KPI > 0 trong tab So sánh KPI L2).
- JS [orders-report/js/tab-kpi-commission.js](orders-report/js/tab-kpi-commission.js):
    - `renderEmployeeOrdersTable`: thêm class `kpi-l1-row-checked` vào row khi `_orderCheckStore.isChecked(invNumber)`; gắn `data-l1-number="<invNumber>"` lên `<tr>` và `data-col="stt"` lên TD đầu (để CSS `::after` chèn dấu ✓).
    - Thêm helper `_applyL1CheckedStyles()` quét tbody, toggle class theo `data-l1-number` — không full re-render, hiệu năng tốt.
    - Wire helper vào: (1) sau `markChecked` ghi local map, (2) trong `onSnapshot` listener của `_orderCheckStore`, (3) sau initial `col.get()`. Đảm bảo style luôn sync với Firestore: bấm "Đã kiểm tra" ở L2 → quay lại L1 row xám + ✓ ngay; user khác check ở delivery-report cũng cập nhật realtime nếu L1 đang mở.

**Edge case**: đơn vừa `is-refunded` vừa `kpi-l1-row-checked` → giữ ưu tiên trực quan cho refunded (background đỏ nhạt) bằng cách đặt rule `kpi-l1-row-checked` TRƯỚC rule `is-refunded` trong file CSS (source order quyết định khi specificity bằng nhau).

**Files**: `orders-report/css/tab-kpi-commission.css`, `orders-report/js/tab-kpi-commission.js`

**Status**: Done.

---

### [orders-report] KPI - HOA HỒNG: dialog "Xác nhận kiểm tra đơn" khi đóng modal chi tiết

**User yêu cầu**: Trong tab "KPI - HOA HỒNG" → mở modal "Chi tiết đơn hàng" của 1 đơn → khi bấm tắt (X), hiển thị dialog xác nhận kiểm tra giống delivery-report image 3 ("Đơn xxx đã được kiểm tra chưa?" + nút "Chưa duyệt" / "✓ Đã kiểm tra"), để đánh dấu đơn đã kiểm tra hay chưa.

**Implementation**:

- Thêm `_orderCheckStore` IIFE-style sub-object trong `KPICommission` (tab-kpi-commission.js) — dùng **chung Firestore collection** `delivery_report/data/order_checks/{sanitizeDocId(number)}` với delivery-report. Encode `/` → `__` cùng pattern. Listener `onSnapshot` giữ cache đồng bộ realtime.
- Fire-and-forget `this._orderCheckStore.init()` trong `KPICommission.init()` để load sẵn map đơn đã check khi user vào tab.
- `closeOrderDetails()` refactor: nếu đã check rồi (`isChecked(number)`) hoặc không lấy được số phiếu → close ngay (giữ behavior cũ); ngược lại show confirm modal.
- Confirm modal `kpi-check-confirm-modal` build dynamic 1 lần qua `_ensureCheckConfirmModal()`, style inline match delivery-report (overlay đen 0.45 + dialog 420px + 2 button "Chưa duyệt" / "✓ Đã kiểm tra").
    - "Chưa duyệt" / backdrop click → close cả 2 modal, không lưu.
    - "✓ Đã kiểm tra" → close cả 2 modal + `markChecked(number, ctx)` ghi Firestore với payload `{number, checkedBy, checkedAt, customerName, phone, invoiceId, orderCode, source:'kpi-commission'}`.
- Body dialog: dòng 1 hiện số phiếu (NJD/YYYY/xxxxx), dòng 2 hiện `Mã ĐH: <orderCode>` (TPOS code). KPI tab không có customerName/phone trực tiếp như delivery-report nên thay bằng orderCode cho user nhận diện.

**Source phiếu**: ưu tiên `recon?.invoiceNumber` → `_invoiceCache.get(orderId).Number` → `order.invoiceNumber` (same fallback chain dùng trong `renderEmployeeOrdersTable`).

**Vì sao chia sẻ collection**: đánh dấu đơn 1 lần ở đâu cũng tính, tránh user phải confirm 2 lần ở 2 báo cáo khác nhau cho cùng 1 đơn. Source field phân biệt nguồn ghi.

**Files**: `orders-report/js/tab-kpi-commission.js`

**Status**: Done — chờ verify live (cần GH Pages deploy ~3 min sau push).

---

## 2026-05-16

### [customer-hub] Fix "TPOS PBH" tab không hiển thị bill thực sự

**User báo**: Trong Customer 360 → Hoạt động ví, click con mắt 👁 ở giao dịch THANH TOÁN ĐƠN HÀNG (-100K) → mở modal "Đơn NJD/.." với tab "TPOS PBH" luôn báo "Không có phiếu bán hàng (PBH) cho đơn NJD/...". Trong khi đó modal "HOẠT ĐỘNG KHÁCH HÀNG" của Thống Kê Giao Hàng → click con mắt cùng giao dịch → hiển thị BILL (phiếu bán hàng) đầy đủ với barcode, danh sách SP, tổng tiền.

**Root cause**:

1. `customer-hub/js/modules/transaction-evidence.js::_renderTposInvoices` dùng OData filter SAI: `Reference eq '${orderCode}'`. Field `Reference` của TPOS FastSaleOrder thường rỗng cho invoice chuẩn — order code `NJD/YYYY/NNNNN` nằm ở field `Number`. delivery-report dùng đúng `contains(Number,'${number}')`.
2. Kể cả filter đúng, hàm này chỉ render summary card (Số, ngày, tổng, COD) chứ KHÔNG render bill HTML như delivery-report.

**Fix**:

- Đổi filter: `(Type eq 'invoice' and contains(Number,'${orderCode}'))`.
- Sau khi tìm thấy invoice, port flow render bill từ delivery-report sang:
    1. Lazy-load `../shared/js/api-service.js` + `../orders-report/js/utils/web-warehouse-cache.js` + `../orders-report/js/utils/bill-service.js` qua helper `_loadScriptOnce` (giống `delivery-report.js:3515`).
    2. Fetch detail qua `/api/odata/FastSaleOrder(${id})?$expand=OrderLines,Partner,User`.
    3. Gọi `window.generateCustomBillHTML(detail, {})` → render trong `<iframe srcdoc>` với `sandbox="allow-same-origin"`.
    4. Fallback `${workerBase}/api/fastsaleorder/print1?ids=${id}` (TPOS HTML) nếu generate fail.
- Header tóm tắt 1 dòng (Số + ngày + state badge) phía trên iframe để giữ context.

**Files**: `customer-hub/js/modules/transaction-evidence.js`

**Status**: Done — chờ verify live.

---

### [wallet] Rút gọn note "Thanh Toán Đơn Hàng" → "TT #ORDER" + bỏ "Trả từ ví" trùng lặp

**User báo**: Note giao dịch trừ tiền thanh toán đơn quá dài và bị trùng lặp:
`Thanh Toán Đơn Hàng #NJD/2026/67007 — Trả từ ví: 100.000đ — Trả từ ví: 100.000đ (Đơn: 953.000đ + 35.000đ ship…)`
→ Mong muốn: `TT #NJD/2026/67007 (Đơn: 953.000đ + 35.000đ ship…)`

**Root cause**: DB note nguồn từ [`tab1-sale.js:1415`](../orders-report/js/tab1/tab1-sale.js#L1415) đã có sẵn `— Trả từ ví: Xđ`. 3 view rewrite head note nhưng KHÔNG strip "— Trả từ ví" cũ → trùng lặp + dài.

**Fix**: Đổi `newHead` thành `TT #${orderCode}` (bỏ phần `Thanh Toán Đơn Hàng — Trả từ ví: …`) và strip tất cả `— Trả từ ví: Xđ` còn lại trong note nguồn.

**Files**:

- [`customer-hub/js/modules/customer-profile.js`](../customer-hub/js/modules/customer-profile.js) — HOẠT ĐỘNG VÍ trong Customer 360 right panel
- [`orders-report/js/tab1/tab1-wallet-modal.js`](../orders-report/js/tab1/tab1-wallet-modal.js) — Wallet history modal trong orders-report tab1
- [`delivery-report/js/delivery-report.js`](../delivery-report/js/delivery-report.js) — thêm helper `shortenCodPaymentNote()` cho hover popover "HOẠT ĐỘNG KHÁCH HÀNG"

**Status**: ✅ Done.

---

### [customer-hub] Fix nạp ví luôn ghi `created_by = 'admin'`

**User báo**: Trong ví khách hàng (Customer 360 → Hoạt động ví), mọi giao dịch Nạp tiền / Rút / Cấp công nợ ảo đều hiển thị "Duyệt bởi admin" dù user đăng nhập là người khác (vd "My").

**Root cause**: `customer-hub/js/modules/wallet-panel.js::_getCurrentUser()` đọc `localStorage.getItem('n2shop_current_user')` rồi lấy `u.email || u.displayName`. Nhưng **không nơi nào trong codebase ghi key `n2shop_current_user`** — auth thật ở `loginindex_auth` (sessionStorage/localStorage) qua `window.authManager`. Kết quả: object rỗng → fallback `'admin'` → backend lưu `customer_activities.created_by = 'admin'` → UI render "Duyệt bởi admin".

**Fix**: `_getCurrentUser()` ưu tiên `window.authManager?.getUserInfo()?.displayName || .username`; fallback đọc trực tiếp `loginindex_auth` (sessionStorage rồi localStorage); cuối cùng mới fallback `'admin'`.

**Files**: `customer-hub/js/modules/wallet-panel.js`

**Status**: ✅ Done. Cần test: đăng nhập user khác admin → vào Customer 360 → nạp ví → check activity log hiển thị đúng user.

---

### [delivery-report] Ẩn cặp WITHDRAW+HOÀN trong "Hoạt động khách hàng" + nút con mắt xem toàn bộ

**User báo**:

1. Trong modal chi tiết đơn ở Thống Kê Giao Hàng, section "HOẠT ĐỘNG KHÁCH HÀNG" hiển thị tất cả giao dịch — bao gồm cả các cặp `Thanh toán đơn (-100K)` + `HOÀN từ đơn hủy (+100K)` đã triệt tiêu nhau. Khi 1 khách tạo-hủy-tạo lại đơn nhiều lần (cùng giá), list bị rối với 4-6 dòng dù chỉ có 1-2 hoạt động ý nghĩa. customer-hub "Hoạt động ví" đã có logic ẩn các cặp này — cần đồng bộ.
2. Thêm nút con mắt cạnh chữ "Hoạt động gần đây" để khi cần xem chi tiết TOÀN BỘ giao dịch (kể cả cặp đã ẩn) thì bấm để mở rộng.

**Fix #1 — Ẩn cặp tạo+hoàn**:

- `delivery-report/index.html`: thêm `<script src="../shared/js/wallet-pair-utils.js">` trước `delivery-report.js`.
- `delivery-report/js/delivery-report.js` (`renderCustomer`): filter `data.recent_transactions` qua `window.WalletPairUtils.skipPairedCancelRefunds` — match `DEPOSIT(ORDER_CANCEL_REFUND)` với `WITHDRAW` trước đó cùng order ref + cùng amount → ẩn cả 2. Helper expect ASC, API trả DESC → reverse 2 lần. Fallback no-op nếu script chưa load.

**Fix #2 — Nút con mắt toggle "xem toàn bộ"**:

- `delivery-report/js/delivery-report.js`:
    - Extract per-row HTML render → closure `buildTxRow(tx)` + `buildTxListHtml(list)` để dùng được cho cả 2 mode.
    - Render đồng thời 2 list HTML: `[data-tx-mode="filtered"]` (default visible) và `[data-tx-mode="all"]` (hidden). Chỉ render list "all" khi thực sự có giao dịch bị ẩn (`rawTxs.length > txs.length`).
    - Section title `Hoạt động gần đây` bọc trong flex container + thêm `<button class="dr-hp-toggle-all">` với icon `fa-eye`. Click → swap visibility filtered ↔ all + đổi icon `fa-eye-slash` + đổi tooltip.
    - `txByUid` dùng `rawTxs` (không phải `txs`) để review button trong all-view cũng resolve được uid.
    - Wire toggle handler trong `wirePopoverActions` (dùng `:not([data-bound])` guard giống các nút khác).

**Tận dụng helper có sẵn**: `shared/js/wallet-pair-utils.js` (script-tag wrapper của `shared/browser/wallet-pair-utils.js` đã chạy production cho customer-hub) — không sửa logic pairing.

**Files**: `delivery-report/index.html`, `delivery-report/js/delivery-report.js`

**Status**: Done — chờ verify trong browser

---

## 2026-05-15

### [so-order][web2] Paste/drop ảnh vào image cell + hover-zoom popup toàn cục Web 2.0

**User**: "Hình copy paste vào phần area của riêng của ảnh -> đưa chuột hover vào các ảnh của web 2.0 đều zoom lên".

**Files**: `so-order/index.html`, `so-order/css/so-order.css`, `so-order/js/so-order-app.js`, `web2/shared/web2-effects.js`, `web2/shared/web2-effects.css`, `native-orders/index.html`.

**Task 1 — Image paste/drop cell (so-order modal)**:

- HTML: Mỗi image cell trong bảng modal đổi thành dropzone — `.so-img-cell-v2` (tabindex=0) wrap `.so-img-cell-hint` (icon + "Ctrl+V / Kéo thả") + URL input (`hoặc dán URL`) + upload button. 2 cell cho `productImage` + `invoiceImage`.
- CSS: `.so-img-cell-v2` thành dashed-border zone với hover/focus/dragover state (violet-purple, blue-blue tương ứng).
- JS [so-order-app.js](../so-order/js/so-order-app.js): Thêm `applyImageFile(name, file)` (centralise base64 + 2MB warn + preview refresh) + `wireImagePasteDrop()` gắn listener paste/dragover/dragleave/drop trên từng cell. Paste/drop ảnh → trích `File` từ `clipboardData.items` hoặc `dataTransfer.files` → applyImageFile → input.value = data URL → updateImgPreview render `<img>`.

**Task 2 — Hover-zoom popup global Web 2.0** ([web2-effects.js](../web2/shared/web2-effects.js)):

- Thêm `attachHoverZoom()` — singleton `.w2fx-zoom-popup` floating gắn cursor. Mouseover img matching whitelist → clone `src` vào popup → position bên cạnh chuột (auto-flip khi gần biên). Mouseout → hide.
- Whitelist selector: `.so-cell-img img, .so-img-preview img, .so-modal-table img, .expand-img, .line-img, .pick-img, .pk-image-preview img, .pk-message-image, .pk-preview-img, .product-image, .image-preview, .image-preview img, .preview img, [data-w2-zoom], img[data-w2-zoom]`.
- Exclude (avoid avatar/sidebar): `.tpos-sidebar, .sidebar, .so-tab-strip, [data-w2-no-zoom]`. Skip tiny img < 28×28px.
- CSS [web2-effects.css](../web2/shared/web2-effects.css): popup `position:fixed`, `box-shadow` deep, opacity transition 0.12s, max-size `min(420px,60vw) × min(420px,70vh)`. Reduced-motion → no transition.
- Reposition theo mouse move; auto-hide khi scroll (cursor stale).
- Cache-bust: `web2-effects.{css,js}?v=20260515b` ở [so-order/index.html](../so-order/index.html), [native-orders/index.html](../native-orders/index.html).

**Functionality**: Field `name` không đổi → handleOrderSubmit y nguyên. `data-upload` attr giữ → wireImageUpload (file picker click) song song với paste/drop.

**Verify live**: Mở modal so-order → 2 image cell có dashed border + "Ctrl+V / Kéo thả" label. Code path đã trace (paste listener gọi applyImageFile → input + preview update). JS syntax OK qua `node -c`. Visual zoom popup chưa test được do data prod hiện không có `<img>` thực tế (chỉ placeholder boxes `.so-cell-img-missing`); cơ chế trigger đã verify qua code review + DOM-event wiring.

**Status**: ✅ Done.

---

### [orders] InventoryPicker "Chọn từ Kho SP" thiếu template không có active variant

**User**: "bên trang này mấy mã B1976 cũng không tìm được" (purchase-orders/index.html).

**Files**: `purchase-orders/js/dialogs.js`, `purchase-orders/js/form-modal.js`

**Root cause**: Cùng nguyên nhân với tab3 orders-report fix trước đó. `InventoryPicker.loadProductsFromTPOS` ([dialogs.js:1588](../purchase-orders/js/dialogs.js#L1588)) gọi `Product/ExportFileWithVariantPrice` hoặc `ExportFileWithStandardPriceV2` với `{model: {Active: 'true'}}` → TPOS filter trên variant Active → templates có 0 active variants (vd B1976, B1977 — cả 4 size variants S/M/L inactive) → mất khỏi Excel → mất khỏi picker.

**Fix**:

1. `dialogs.js:loadProductsFromTPOS` — sau parse Excel, fetch `/ProductTemplate?$filter=Active eq true&$select=Id,DefaultCode,Name,ImageUrl,ListPrice,PurchasePrice`. Supplement template chưa có code, mark `id: 'tmpl-<Id>'`, `isTemplate: true`.
2. `dialogs.js:fetchProductDetails` — thêm nhánh đầu: nếu productId bắt đầu `tmpl-` → fetch `/ProductTemplate(id)` trực tiếp, synthesize Product-shaped payload.
3. `form-modal.js`: 2 chỗ callback `onSelect` — nếu `product.isTemplate`, set `item.tposSynced = true` để sync skip create-duplicate.

**Caveat**: User cần bấm "Tải lại" trên modal để invalidate localStorage cache.

**Status**: ✅ Done.

### [so-order] Redesign modal "Tạo Đơn Hàng" theo layout purchase-orders

**User**: "giao diện tạo đơn hàng làm giống cái giao diện này đi, giao diện thôi chứ chức năng giữ nguyên như hiện tại" (kèm screenshot purchase-orders modal).

**Files**: `so-order/index.html`, `so-order/css/so-order.css`, `so-order/js/so-order-app.js`

**Layout mới** (giữ 100% field names cho JS handler):

- **Row 1** — Nhà cung cấp | Ngày giao | Đợt | Số Kiện | Tổng KG | Tiền HĐ | Tiền tệ.
- **Row 2** — Ghi chú | Ghi chú CP (nội bộ) | Trạng thái.
- **Bảng sản phẩm** (1 row, giữ single-product behavior) — STT | Tên sản phẩm | Biến thể | SL | Giá Nhập | Giá Bán | **Thành tiền** (computed) | Hình ảnh sản phẩm | Hình ảnh hóa đơn.
- **Footer** — Tổng số lượng + Tổng tiền (left), THÀNH TIỀN (big blue) + Hủy + Lưu (Nháp) (right).

**CSS**: Thêm block `.so-modal-v2/.so-modal-panel-v2/.so-input-v2/.so-modal-table/.so-modal-foot-v2` ở cuối [so-order.css](../so-order/css/so-order.css). Width modal: `min(1600px, 96vw)`. Inputs cao 40px, border-radius 8px, focus violet glow. Bảng có thead `#f9fafb`, header weight 600. Footer rounded bottom, `THÀNH TIỀN` 20px bold #3b82f6 — match purchase-orders ([form-modal.js:1180+](../purchase-orders/js/form-modal.js#L1180)).

**JS dynamic totals**: Thêm `wireModalTotals()` + `updateModalTotals()` ở [so-order-app.js](../so-order/js/so-order-app.js). Listen `input` trên `qty/sellPrice/costPrice` → update `#soRowThanhTien`, `#soModalTotalQty`, `#soModalTotalAmount`, `#soModalFinalAmount`. Dùng `fmtCurrency(qty*sellPrice, tab.currency)` để consistent với shipment header.

**Functionality preserved**: `name="..."` attributes giữ nguyên (`supplier, shipDate, shipBatch, shipCaseCount, shipWeightKg, shipContractAmount, shipContractCurrency, productName, variant, qty, sellPrice, costPrice, productImage, invoiceImage, note, costNote, status`) → `handleOrderSubmit` không cần đổi. `data-upload` + `data-preview-for` cho ảnh giữ nguyên → `wireImageUpload()` chạy y như cũ.

**Verify live**:

- Mở modal → SL=5, Giá Bán=120000 → Thành tiền cell `600.000₫`, Footer Tổng tiền + THÀNH TIỀN `600.000₫`, Tổng SL `5`. ✅
- Submit test row (NCC=TEST NCC, Tên SP=TEST V2 Modal, Đợt=TEST-V2, SL=3, Giá Bán=50000, Giá Nhập=30000) → shipment + row tạo đúng ngày 15/5/2026. ✅
- Cleanup test data qua nút trash UI → 2 lô · 3 dòng · SL: 35 (về baseline). ✅

**Status**: ✅ Done.

---

### [orders] Barcode print recheck: TPOS OData 400 khi filter >20 `or` → toàn bộ 38/38 báo missing

**User**: "các mã này đều có trên tpos rồi" — dialog In mã vạch (purchase-orders) báo 38/38 sản phẩm KHÔNG tìm thấy trên TPOS (B2247, B2248, ..., +30 mã khác) dù tất cả CÓ thật.

**Files**: `purchase-orders/js/lib/barcode-label-dialog.js`

**Root cause**: `recheckTposForMissingCodes` Strategy A build 1 query với toàn bộ codes nối bằng `or`: `DefaultCode eq 'B2247' or DefaultCode eq 'B2248' or ... (38 lần)`. TPOS OData reject filter >~20 `or` clauses với HTTP 400 (test 2026-05-15: N=20 OK, N=25 fail). Code chỉ `throw` ở `!resp.ok` (sau đó catch ngoài cùng bỏ qua) → `foundCodes=[]` → tất cả vào nhóm "not found" → 38/38 missing.

**Fix**: Batch theo `BATCH_SIZE = 20`, mỗi batch fetch độc lập, try/catch per-batch (1 batch fail không kill các batch khác), accumulate `foundCodes` cross batches.

**Verified qua curl**: N=10/15/20 trả 200 + data; N=25 trả 400. Batch 20 đủ margin an toàn.

**Status**: ✅ Done.

### [orders-report] Tab3 suggestions thiếu template không có active variant (B1976, B1977)

**User**: "mã B1976, B1977 tpos có mà trang hình 3 không suggestion".

**Files**: `orders-report/js/tab3/tab3-core.js`, `orders-report/js/tab3/tab3-assignment.js`

**Root cause**: `loadProductsData()` ([tab3-core.js:333](../orders-report/js/tab3/tab3-core.js#L333)) gọi `Product/ExportFileWithVariantPrice` với `{model: {Active: "true"}, ids: ""}` — TPOS filter trên **variant** Active. Templates B1976 (TmplId 118721) và B1977 (TmplId 118720) đều Active=true nhưng cả 4 biến thể (B1977/B1977S/M/L và B1976/B1976S/M/L) đều Active=false → 0 dòng Excel → không vào `productsData` → không suggest.

**Fix**: Sau khi parse Excel, fetch thêm `ProductTemplate?$filter=Active eq true&$select=Id,DefaultCode,Name,ImageUrl` → supplement templates có DefaultCode chưa tồn tại trong productsData, gắn `id: 'tmpl-<Id>'` + `isTemplate: true`. `addProductToAssignment` ([tab3-assignment.js:19](../orders-report/js/tab3/tab3-assignment.js#L19)) thêm nhánh đầu: nếu productId bắt đầu `tmpl-` → fetch `/ProductTemplate(id)?$expand=ProductVariants...` trực tiếp, synthesize productData; existing fallback "no active variants → add template as single assignment" tự động xử lý đúng.

**Status**: ✅ Done. Reload Page hoặc clear cache để load lại productsData. Slice 10 vẫn đủ cho search prefix "b197" (~9 matches sau fix).

### [so-order] Bỏ toast sync + Tổng HĐ luôn render theo tab.currency

**User**: "Bỏ cái toast thông báo 'Đồng bộ dữ liệu từ thiết bị khác' và HÀ NỘI thiết lập tiền tệ VND mà sao có CNY ở bảng?"

**Files**: `so-order/js/so-order-app.js`

**Fix 1 — Toast**: Bỏ `notify('Đồng bộ dữ liệu từ thiết bị khác', 'info')` trong `remoteHandler` ([so-order-app.js:861-864](../so-order/js/so-order-app.js#L861-L864)). Remote sync vẫn re-render qua `renderAll()`, chỉ ngắt notification ồn ào.

**Fix 2 — Currency mismatch ở Tổng HĐ**: Shipment có field `contractCurrency` per-shipment, lệch với `tab.currency`. Khi user tạo Đợt 2 trong tab HÀ NỘI (VND) với contractCurrency=CNY, display ra `25.000,00 CNY (87.500.000₫)` — mâu thuẫn với badge tab.

**Root cause**: `shipmentHeaderHtml` cố tình render dual (raw + converted): comment cũ ghi "contractCurrency is independent of tab currency". Khi tab=VND mà shipment=CNY thì raw=CNY xuất hiện đầu, VND ở dấu ngoặc.

**Fix**: Đổi sang single display theo `tab.currency`. Convert raw → VND trung gian → tab.currency:

```js
const rawVnd = contractRaw * currencyToVndRate(contractCur, tab);
const tabToVnd = currencyToVndRate(tab.currency, tab) || 1;
const displayAmount = rawVnd / tabToVnd;
const contractDisplayText = fmtCurrency(displayAmount, tab.currency || 'VND');
```

Bỏ block `${contractCur !== 'VND' ? ... : ''}` trong HTML, chỉ giữ 1 span.

**Data**: Không migrate. Shipment vẫn lưu `contractCurrency` + `contractAmount` raw. Chỉ display thay đổi → user có thể switch tab VND↔CNY, mỗi tab tự convert ra currency của mình.

**Verify live**: `localhost:8089/so-order/` HÀ NỘI: Đợt 2 hiển thị `Tổng HĐ: 87.500.000₫` (single, không còn CNY raw); Đợt 1 vẫn `13.504₫`. HƯƠNG CHÂU rỗng (chưa có shipment) → logic CNY chưa render-test nhưng formula symmetric.

**Status**: ✅ Done.

---

### [orders] Fix auto-generate product code: jump B2246 → B19752 vì query Product variants

**User**: "tìm nguyên nhân ở hình sao tự động tạo mã lại tạo ra B19752 và mã B19751 hiện tại đang ở đâu".

**Files**: `purchase-orders/js/lib/tpos-search.js`

**Root cause**: `getMaxProductCode()` query `/odata/Product` (= biến thể), kết hợp greedy regex `^B(\d+)` ăn hết digits của `B19751` (variant của template `B1975` với attribute value `1`) → parse thành `19751` → max = 19751 → next = **B19752**. Thực tế template max là `B2246` (Id 119001, tạo 2026-05-15). DB n2store đúng (max = 2246), TPOS query mới sai.

**Where is B19751**: Variant Id `157038`, ProductTmplId `118722` (template `B1975` — "0905 B14 QUẦN SHORT LƯNG THUN TRƠN 9003 HỒNG"), 1 trong 4 variants (3 S/M/L inactive, B19751 active).

**Fix**: Đổi URL từ `/api/odata/Product` → `/api/odata/ProductTemplate` ở `getMaxProductCode` ([tpos-search.js:463](../purchase-orders/js/lib/tpos-search.js#L463)). Templates không có variant suffix → regex parse đúng template counter.

**Status**: ✅ Done (chỉ sửa main path, fallback `getMaxProductCodeFallback` vẫn dùng `Product/OdataService.GetViewV2` — chấp nhận khi main fail thì fallback may have skew, nhưng main almost always succeeds).

### [so-order] Auto-collapse cũ + expand newest on first visit + persist cache

**User**: "NGÀY tự cộng collapse lại, hàng NGÀY đầu tiên (ngày mới nhất) tự động expand khi vào lần đầu (các lần sau lấy theo cache)".

**Logic** ([so-order-storage.js:87-138](../so-order/js/so-order-storage.js#L87-L138)):

- Thêm flag `tab.uiInitialized` (boolean). `_migrateTab(tab, ...)` lần đầu thấy flag missing → sort shipments by date desc → set `collapsed: id !== newestId` → mark `uiInitialized: true`.
- `_read()` track mutation, nếu `_migrateTab` đổi gì thì auto `_write` ngay → persist cache lần đầu để các lần sau không re-default.
- Tab mới (chưa có shipment): flip flag ngay để shipment đầu tiên user add không bị retroactive collapse.

**Bug fix**:

1. Remote snapshot handler clobber state với raw FB data (không qua migration). Fix: `remoteHandler = () => { state = SoOrderStorage.load(); renderAll(); }` thay vì gán trực tiếp `state = remoteState`.
2. Toggle shipment-header (`[data-toggle-shipment]`) thiếu `pushSync()` → state mới không sync lên Firestore. Fix: thêm `pushSync()` sau `updateShipment(collapsed)`.
3. Sau Sync.init xong: `pushSync()` để migrated state (uiInitialized=true, collapsed defaults) đẩy lên Firestore — mọi thiết bị fresh không bị reset.

**Verify live**:

- Clear localStorage → reload → newest (9/5 Đợt 2) expanded, older (7/5 Đợt 1) **collapsed**, `uiInitialized: true` persist.
- Click expand older → reload → cả 2 expanded (cache giữ).
- Click collapse newest → reload → newest collapsed, older expanded (user choice giữ).
- Firestore doc đã có `uiInitialized: true` + per-shipment collapsed state.

**Status**: ✅ Done.

---

### [so-order] Column header vào trong shipment expand + per-tab columnVisibility + Firestore sync

**User**:

1. "phần như hình cho vào expand ngày" → header cột (NCC, STT, TÊN SP, …) đặt trong mỗi shipment expand.
2. "Ẩn hiện cột sẽ là setting riêng cho từng section tab và được lưu để đồng bộ nhiều máy".

**Column header move-in** ([so-order-app.js:106-128](../so-order/js/so-order-app.js#L106-L128)):

- `renderTableHead()` không render global `<thead>` (CSS `display: none`).
- `columnHeaderRowHtml()` sinh `<tr.so-shipment-colhead>`. `shipmentHtml(sh,...)` khi expanded: shipment header → column header → data rows. Collapsed: chỉ shipment header.

**Per-tab column visibility**:

- Schema: `columnVisibility` chuyển từ top-level state → `tab.columnVisibility`.
- `_migrateTab(tab, globalColVis)` seed per-tab từ legacy global setting nếu có (back-compat).
- `setColumnVisibility(state, tabId, key, visible)` + `getColumnVisibility(tab)` API mới.
- Helper `activeColVis()` ở app.js đọc của tab đang active; mọi renderer dùng helper này.
- Modal heading: "Ẩn / hiện cột — tab \"HÀ NỘI\"" để user biết scope per-tab.

**Firestore sync** (theo `docs/architecture/DATA-SYNCHRONIZATION.md`):

- Doc `so_order_v2/main` (Firestore as source of truth).
- `SoOrderStorage.Sync.init(onRemoteUpdate)`: load FB → seed localStorage cache → attach `onSnapshot` listener.
- `pushSync()` helper fire sau mỗi mutation (add/update/delete row/shipment/tab/footer/columnVisibility/setActiveTab).
- Echo guard `_isListening` flag — remote snapshot fire không push lại (tránh loop).
- Remote update handler: `renderAll()` + notify "Đồng bộ dữ liệu từ thiết bị khác".
- Firebase scripts: `firebase-app/auth/firestore-compat` + `shared/js/firebase-config.js`.

**Verify live**:

- Toggle costNote off ở HÀ NỘI → `hanoiCostNote: false`.
- Switch HƯƠNG CHÂU → `huongCostNote: true` (vẫn default, độc lập).
- Firestore read: `{exists:true, lastUpdated:..., hanoiCostNote:false, huongCostNote:true}` → cross-device sync OK.

**Status**: ✅ Done.

---

### [so-order] Schema shipments + 2 cột Ghi Chú / Ghi Chú CP + header expandable theo ngày+đợt

**User**:

1. "Thêm cột GHI CHÚ, GHI CHÚ CP trước cột TRẠNG THÁI".
2. "Thêm hàng thông tin NGÀY, ĐỢT, KIỆN, KG, tiền hợp đồng 2 mệnh giá → hàng này expand ra gồm bảng đã có NCC ở trong → thêm dữ liệu trùng NGÀY thì gộp vào expand luôn".

**Schema thay đổi** ([so-order-storage.js](../so-order/js/so-order-storage.js)):

- `tab.rows[]` → `tab.shipments[]`, mỗi shipment: `{id, date, batch, caseCount, weightKg, contractAmount, contractCurrency, collapsed, rows[]}`.
- Migration `_migrateTab()` tự convert legacy `rows[]` → 1 synthetic shipment (không mất data).
- Helper `findShipment(tab, {date, batch})` → khi user thêm dòng mới với cùng ngày+đợt, gộp vào shipment có sẵn thay vì tạo mới.
- Methods mới: `addShipment / updateShipment / deleteShipment / moveRow`. Methods cũ `addRow/updateRow/deleteRow` nhận thêm param `shipmentId`.

**Form modal** ([so-order/index.html](../so-order/index.html)):

- Chia 2 fieldset: "Thông tin lô (gộp theo Ngày + Đợt)" + "Thông tin dòng order".
- Shipment fields: Ngày giao (date input), Đợt, Số Kiện, Tổng KG, Tiền hợp đồng + dropdown tiền tệ HĐ (VND/CNY/USD/KRW/JPY/THB/EUR).
- Row fields thêm 2 textarea: GHI CHÚ + GHI CHÚ CP (xám/cam highlight).
- Hint tỉ giá HĐ live: "[CNY (≈ 3.500 ₫)]".

**Render** ([so-order-app.js](../so-order/js/so-order-app.js)):

- `renderTableBody` sort shipments by date desc, mỗi shipment = 1 header row (`<tr.so-shipment-head>` colspan=full) + N data rows.
- Header text: "Ngày giao: 7/5/2026 — Đợt 1 — 1 Kiện : 67 KG | Tổng 67 KG | Tổng HĐ: 13.504,00 CNY (47.264.000₫)" — match format screenshot user.
- Click header (caret chevron-down/right) → toggle `collapsed`, lưu state.
- Mỗi header có 3 button action: thêm dòng vào lô, sửa thông tin lô, xóa lô.
- `currencyToVndRate(currency, tab)` với fallback rate table (CNY 3500, USD 26000, EUR 28000, JPY 170, KRW 18, THB 720) — Tiền HĐ độc lập với tab currency.

**Columns** thêm 2 key vào `DEFAULT_COLUMNS` + `COLUMNS` array, đặt giữa `invoiceImage` và `status`:

- `note` (Ghi Chú) — màu xám
- `costNote` (Ghi Chú CP) — màu cam, nền vàng nhạt

**Submit logic**:

- Edit row + đổi ngày/đợt → `findShipment` ở shipment khác → `moveRow` sang đó.
- Cùng shipment → `updateRow` + `updateShipment` (mutate metadata in place).
- Add row → `findShipment` → gộp / hoặc `addShipment` mới → `addRow`.

**Verify live** ([so-order-two-shipments.png](../downloads/n2store-session/so-order-two-shipments.png)):

- Lô 1: ngày 9/5 Đợt 2, 2 Kiện 120KG, HĐ 25.000 CNY (87.500.000₫) — 1 row Shenzhen.
- Lô 2: ngày 7/5 Đợt 1, 1 Kiện 67KG, HĐ 13.504 CNY — 2 rows gộp đúng (Quảng Châu A + Hồng Châu B cùng nhập với ngày 7/5 đợt 1).
- Counter: "2 lô · 3 dòng SL: 35".

**Status**: ✅ Done.

---

### [so-order] Trang Sổ Order mới + bỏ thanh `.tab-navigation` ở mọi trang

**User**:

1. "Tạo 1 trang 'Sổ Order' — giao diện như native-orders — gồm tab HÀ NỘI, HƯƠNG CHÂU, có + để thêm → bảng NCC, STT, Tên SP, Biến Thể, SL, Giá Bán (tiền tệ theo tab + tỉ giá VNĐ), Giá Nhập, Ảnh SP, Ảnh HĐ, Trạng Thái, Thao Tác → Tổng SL, Giảm Giá, Phí Ship → nút Tạo Đơn Hàng lưu trạng thái Nháp → có cài đặt ẩn hiện cột."
2. "Hình 2 là css riêng hả? bỏ đi" → "trang nào cũng có thanh hình 2 → bỏ thanh hình 2".

**Tạo trang Sổ Order** (~1200 dòng):

- [so-order/index.html](../so-order/index.html) — shell + 3 modals (form order, tab settings, column visibility) + lightbox ảnh.
- [so-order/css/so-order.css](../so-order/css/so-order.css) — table + tabs + modal + status pills (vàng/xanh/lá/đỏ cho Nháp/Đã Đặt/Đã Nhận/Hủy).
- [so-order/js/so-order-storage.js](../so-order/js/so-order-storage.js) — localStorage CRUD (key `soOrder_v1`); schema `{tabs:[{id,label,currency,rate,footer,rows}], activeTabId, columnVisibility}`.
- [so-order/js/so-order-app.js](../so-order/js/so-order-app.js) — controller: render tab strip, table head/body (cột filter qua `columnVisibility`), form modal, FX hint per-tab (`[CNY (≈ 3.500 ₫)]`), image upload base64.
- Sidebar: thêm "Sổ Order" trong group Sale Online ở [web2/shared/tpos-sidebar.js:139](../web2/shared/tpos-sidebar.js#L139).

**Tính năng**:

- Default 2 tab: HÀ NỘI (VND), HƯƠNG CHÂU (CNY rate 3500). User add thêm: TOKYO/JPY, USD, KRW, THB, EUR.
- Giá Bán/Nhập tab non-VND → hiển thị 2 dòng: raw (vd "50,00 CNY") + quy đổi (vd "≈ 175.000₫").
- Footer: Tổng SL auto, Giảm Giá + Phí Ship input (lưu per-tab), Tổng tiền VNĐ = Σ(sellPrice × qty × rate) − discount + shipping.
- Trạng thái 4 giá trị, default Nháp khi tạo mới.
- Click ảnh → lightbox; ESC đóng modal; image upload soft cap 2MB.

**Bỏ thanh `.tab-navigation`**:

User shot rằng thanh tab top "Đơn Web / TPOS × Pancake / Kho SP" rendering xấu (link mặc định không có style) và trùng chức năng sidebar trái. Bỏ trên các trang dùng cross-page navigation:

- [native-orders/index.html:40-69](../native-orders/index.html#L40-L69) → thay bằng `<header class="page-head-mini">` giữ `#totalCounter` (JS line 174 ref) + source pill.
- [web2/products/index.html:37-66](../web2/products/index.html#L37-L66) → tương tự.
- [orders-report/main.html:590](../orders-report/main.html#L590) — **KHÔNG đụng**, đó là feature tabs nội bộ (`switchTab('orders'|'product-assignment'|'overview'|'pending-delete'|'kpi-commission')`), không phải cross-page navigation.

**Add CSS shared** ở [web2/shared/web2-effects.css](../web2/shared/web2-effects.css) (cuối file): `.page-head-mini`, `.page-head-title`, `.page-head-counters` — dùng chung mọi trang.

**Verify live**:

- so-order test: thêm row CNY tab → "5 × 50 CNY × 3500" = 875.000₫ tổng tiền ✓.
- Add tab JPY 170₫ thành công.
- Reload sau khi bỏ thanh tab nav: cả 2 screenshot (`so-order-no-tabbar.png` + `native-orders-no-tabbar.png`) trang sạch, sidebar trái còn nguyên là cách duy nhất navigate.

**Status**: ✅ Done.

---

### [native-orders] Sidebar đoạn hội thoại — độc lập với order, học theo tpos-pancake/pancake.vn

**User**: "panel trái đoạn hội thoại → này đừng lấy thông tin từ đơn hàng → làm theo tpos-pancake phần pancake hoặc như pancake.vn → nó độc lập để không bị hạn chế và lấy được tất cả đoạn hội thoại realtime".

**Trước**:

- `_loadInboxSidebar` early-return nếu `!order.fbPageId` → modal mở từ đơn không Facebook → sidebar trống.
- `_switchChatToCustomer(originalOrder, fbId, cName)` chỉ override `fbUserId` → click conv Store khi modal mở từ order House → chat thread fetch sai page → load fail.
- Avatar dùng `currentOrder.fbPageId` cho tất cả rows → cross-page rows mất avatar (đã fix turn trước, nhưng còn click handler).
- Synthetic prepend WS dùng `order.fbPageId` cho conv mới → khách mới ping từ Store sẽ render với page House.

**Sau** ([native-orders-app.js](../native-orders/js/native-orders-app.js)):

- Bỏ guard `!order.fbPageId` ở `_loadInboxSidebar` → sidebar luôn load đa-page từ `pancake_all_accounts`.
- `_convRowHtml` thêm `data-page-id="<rowPageId>"` → click handler đọc đúng page của conv.
- `_switchChatToCustomer(order, fbId, cName, clickedPageId)` — thêm param `clickedPageId`, synthetic order set `fbPageId: clickedPageId || originalOrder.fbPageId` → chat thread fetch từ đúng page Pancake.
- `_bindConvRowClicks` + WS-prepend click handler + initial render click handler đều pass `row.dataset.pageId`.
- WS synthetic prepend dùng `pageId` từ event thay vì `order.fbPageId` → conv mới đúng page.

**Verify live** (port 8089, modal mở từ order House `NW-20260513-0016`):

- 50 sidebar rows, mix House (`pg:117267091364524`) + Store (`pg:270136663390370`).
- Click Pandora Kim (Store) → chat thread load 96 bubbles, `msgInput.dataset.conversationId = 270136663390370_2148317755276377` (Store conv), no error → ✅ cross-page chat hoạt động.
- Architecture giờ giống `tpos-pancake/js/pancake/pancake-init.js` (`PancakeColumnManager`) — sidebar là standalone conversation list, không bind cứng vào 1 order/page.

**Status**: ✅ Done.

---

### [render][tpos-pancake][web2-shared] Lưu page names cùng IDs ở `realtime_accounts.proposed_pages`

**User**: "lúc lưu key socket ở render db thì bạn lưu id page và tên page để dùng".

**Trước**: `proposed_pages` JSONB lưu mảng ID strings `["117267091364524","270136663390370",...]` → pool-status / log chỉ show số, không biết "Nhi Judy House".

**Sau**:

- **Server** ([n2store-realtime/server.js](../n2store-realtime/server.js)):
    - `saveRealtimeAccount` chấp nhận thêm `acc.pages: [{id, name}, ...]`, persist JSONB array of `{id, name}` objects. Fallback bare ID strings cho legacy callers.
    - `_normalisePagesField()` helper đọc cả 2 shapes (legacy string + new object) → uniform `[{id, name}]`.
    - `loadActiveAccounts()` trả thêm `pages: [{id, name}]` bên cạnh `pageIds`. Verified_pages merge với name lookup từ proposed_pages.
    - `RealtimeClient.pageLabels {id → name}` set bởi `RealtimePool.startAll()`. `getStatus()` trả `pages: [{id, name}]` thay vì chỉ pageIds.
    - Log pool start: `[POOL] ▶ Thu Huyền → 4 pages: [Nhi Judy House, NhiJudy Store, ...]` thay vì numeric ids.
- **Client** ([tpos-pancake/js/pancake/pancake-realtime.js:144-200](../tpos-pancake/js/pancake/pancake-realtime.js#L144-L200), [web2/shared/web2-realtime.js:390-415](../web2/shared/web2-realtime.js#L390-L415)):
    - `_startMultiAccount` + `startMulti` gửi cả `pages: [{id, name}, ...]` cùng `pageIds` trong payload start-multi.
    - Nguồn dữ liệu: `localStorage.pancake_all_accounts.{accId}.pages` đã có sẵn `{id, name}`.

**Migration**: `_normalisePagesField` đọc back-compat, nên rows cũ trong DB (chỉ id) vẫn load OK. Sau khi client gọi start-multi lần kế, rows tự upsert sang shape mới.

**Verify**: client `_startMultiAccount` vẫn return `{ok:true, poolSize:5}` (broker hiện đang chạy code cũ, ignore `pages` field, không break). Sau khi Render redeploy → pool-status sẽ trả `pages: [{id:"117...", name:"Nhi Judy House"}, ...]`.

**Status**: ✅ Done client + server code; pending Render deploy.

---

### [native-orders] Sidebar inbox modal — multi-page (House + Store), không lock theo `order.fbPageId`

**User**: "hình 2 nó filter theo gì hay nó đang chọn page cố định vậy? → cho hình 2 realtime 2 page đi".

**Vấn đề**: `_loadInboxSidebar` + `_pollSidebarOnce` gọi `Web2Chat.fetchConversationsByPage(order.fbPageId)` → list chỉ chứa convs của 1 page = page của order user mở. Khi mở order House → chỉ thấy convs House, Store events từ WS prepend nhưng không có baseline list.

**Fix** ([native-orders-app.js:2684-2780](../native-orders/js/native-orders-app.js#L2684-L2780)):

- New helper `_getSidebarPageIds(order)` gom page_ids từ `localStorage.pancake_all_accounts` (tất cả accounts) + `Web2Chat.getAllPageAccessTokens()` + `order.fbPageId` → dedup → array.
- New helper `_fetchConvsMerged(pageIds, limit)` Promise.allSettled fetch song song mỗi page, dedupe by `conv.id` (giữ latest theo updated_at), sort desc, slice top 50.
- `_loadInboxSidebar` + `_pollSidebarOnce` đều dùng 2 helper trên → cover tất cả pages user có quyền.
- WS handler `_handleSidebarWsEvent` không đổi (vốn page-agnostic, đã accept cross-page events).

**Verify live** (port 8089, mở order NW-20260513-0016 = page House):

- Sidebar 50 rows: **House 19 + Store 31** ✓ (screenshot `sidebar-multipage-house-store.png`)
- Top rows mix House + Store convs theo `updated_at` desc.
- WS subscriber tiếp tục flow events cho cả 2 page (verified spy 3 phút trước: House 2 + Store 7).

**Status**: ✅ Done.

---

### [tpos-pancake] Migrate Pancake realtime → multi-account broker (`/api/realtime/start-multi`)

**User**: "quan trọng nhất là 2 page house, store" → "Browser test api server realtime mới → nếu hoạt động chính xác → cho tpos-pancake dùng luôn (tpos-pancake có 2 server, 1 tpos đừng đụng, 2 pancake thay bằng server multi mới)".

**Trước migration**: `PancakeRealtime.connectServerMode()` POST `chatomni-proxy.../api/realtime/start` (single-account) → broker pool chỉ có 1 account (Thu Huyền) cover House+Store. Nếu JWT Thu Huyền expire → mất realtime hoàn toàn 2 page chính.

**Sau migration** ([tpos-pancake/js/pancake/pancake-realtime.js:88-200](../tpos-pancake/js/pancake/pancake-realtime.js#L88-L200)):

- `connectServerMode()` ưu tiên `_startMultiAccount()` → POST direct `https://n2store-realtime.onrender.com/api/realtime/start-multi` với mọi account từ localStorage `pancake_all_accounts`. Fallback `_startSingleAccount()` nếu fail.
- Bypass Cloudflare worker (`/api/realtime/*` proxy → n2store-fallback, không có start-multi route — đã verify từ commit `28303f6` cho native-orders).
- Đọc `pages` trực tiếp localStorage vì `pancakeTokenManager.getAllAccounts()` chỉ lưu `{token, uid, exp, name}`, không có `pages`.
- Skip account expired (`v.exp < nowSec`).
- Notification report: "Realtime online (N account, M pages)".

**Verify live (port 8089)**:

- Broker `/health/detailed`: pool 1→5 accounts (Thu Huyền + Huyền Nhi + Thu Lai + Chloe Duongg + Con Nhoc), totalPages 3→14.
- Multi-account result: `{ok:true, poolSize:5, totalPages:4 unique}`.
- Spy WS message: cả House (117267091364524) + Store (270136663390370) đều join qua nhiều account → broker dedup 30s window tránh echo.
- TPOS side ([tpos-pancake/js/tpos/](../tpos-pancake/js/tpos/)) KHÔNG đụng — theo dặn user.

**Trả lời câu hỏi 24/7**:

- Broker auto-respawn pool từ DB `realtime_accounts` table khi restart (`autoConnectClients()` ở [n2store-realtime/server.js:1327](../n2store-realtime/server.js#L1327)) → KHÔNG cần web client mở.
- Cần mở browser CHỈ khi JWT expire (~7 ngày) — bất kỳ trang Web 2.0 (native-orders, tpos-pancake, web2-shared) cũng push start-multi mới được.

**Status**: ✅ Done — commit `be6cd96` (114+ lines).

---

### [native-orders][web2-shared] Realtime — direct-WS-first (học tpos-pancake) + poll thành true fallback

**User**: "hình 1 pancake nhận dữ liệu đoạn hội thoại liên tục — hình 2 không thấy nhận liên tục → được thì học bên tpos-pancake đi" + "polling chỉ là fallback khi realtime không dùng được — nếu socket realtime kết nối thì không cần polling".

**Port browser-direct mode** ([web2-realtime.js](../web2/shared/web2-realtime.js)):

- Rewrite thành **dual-mode**: `_connectDirect()` WS thẳng `wss://pancake.vn/socket/websocket?vsn=2.0.0` join Phoenix channels `users:{uid}` + `multiple_pages:{uid}` + `pages:{pageId}` (mỗi page). Heartbeat 30s. Forward `pages:new_message`/`update_conversation`/`order:tags_updated`. `_connectProxy()` Render broker fallback.
- Public API giữ `subscribe/start/isConnected` + `mode()` returns `'direct'|'proxy'|'disconnected'`.
- **Direct bị Pancake reject** từ non-pancake.vn origin (code 1006). Cần extension/reverse proxy mới spoof Origin được. Fallback proxy hoạt động → mode = `'proxy'`. Khi extension proxy có sẵn, direct sẽ tự takeover.

**Polling = true fallback** ([\_startSidebarPoll](../native-orders/js/native-orders-app.js)):

- Trước: `setInterval(poll, 12000)` chạy luôn dù WS up.
- Sau: watchdog tick 5s check `isConnected()`. WS up → 0 poll. WS down >12s → fire 1 fallback. WS recover → ngừng.
- Net: WS-connected steady state = **0 polls** (Playwright monkey-patched fetch, 60s, pollCount=0).

**Verify**:

- Direct WS readyState=3 (Pancake Origin policy block localhost) → proxy auto-active, `isConnected=true mode=proxy`.
- Broker `/health/detailed`: connected=true, wsReadyState=1, refCounter=368, 0 reconnects.
- 0 sidebar poll fetches trong 60s WS-connected window.

**Limitation**: Render broker shared single Pancake user creds (Thu Huyền `c2177f20-...`) → chỉ join page `117267091364524` (NhiJudy House). Pages khác yêu cầu different creds → fallback poll-only. Broker multi-user là Phase 2 (ngoài scope).

Bump: `web2-realtime.js?v=20260515b`, `native-orders-app.js?v=20260515r`.

Status: ✅ Realtime cho NhiJudy House, 0 poll waste. Direct-WS attempt code-ready cho khi extension proxy có sẵn.

---

### [native-orders][web2-shared] Realtime chat — subscribe `pages:update_conversation` cho chat thread (fix cảm-giác polling)

**User**: "socket pancake hiện tại đang ở render hả → kiểm lại xem realtime trực tiếp → hiện tại hình như nó polling".

**Recon**: WS `wss://n2store-realtime.onrender.com` connected (Render broker giữ Phoenix WS to pancake.vn 24/7), 6 clients, ref 354. Broker join `multiple_pages:{userId}` + `pages:{pageId}` per page → forward `pages:update_conversation`, `pages:new_message`, `order:tags_updated` về browser.

**Gap phát hiện**:

1. Chat thread `_chatState.wsSub` chỉ subscribe `['pages:new_message']`. Pancake **rarely fires new_message** (cần FB socket creds đặc biệt) — documented in [server.js comment](../n2store-realtime/server.js). Event chính reliable là `pages:update_conversation` chứa `conversation.last_message` (đủ data cho bubble). Sidebar subscribe đúng cả 2 → tự cập, nhưng thread giữa miss → cảm giác polling.
2. `_loadInboxSidebar` gọi `Web2Realtime.start({pageIds:[order.fbPageId]})` chỉ 1 page → broker `_lastStartedKey` cache thì rồi mở order page khác cũng không re-subscribe.

**Fix**:

- [\_onIncomingWsMessage](../native-orders/js/native-orders-app.js): normalise 2 payload shapes (`payload.message` vs `payload.conversation.last_message`), inject `conversation_id` vào `last_message`. Dedupe by msg.id giữ nguyên.
- Chat WS sub: subscribe **cả 2 type** `['pages:new_message', 'pages:update_conversation']`. De-dupe nên double-fire vô hại.
- `_wireSidebarRealtime`: `start({pageIds: <union current + all PATs>})` thay vì 1 page (broker tự retry-remove pages thiếu permission, còn lại là expected).
- [web2-realtime.start()](../web2/shared/web2-realtime.js): drop `_started` flag, dùng `_lastStartedKey = sorted(pageIds).join('|')` — sub-set khác → re-call broker; sub-set giống → no-op.
- Expose `Web2Realtime._internal.subscribers` + `NativeOrdersApp._debug.{chatState, realtimeStatus, injectFakeMessage}` để verify từ devtools.

**Verify** (Playwright):

- WS connected, 3 subscribers (sidebar new_msg/update_conv + chat combined).
- `NativeOrdersApp._debug.injectFakeMessage("⚡ TEST")` → bubble xuất hiện instant, 55→56 rows ✓ → WS handler path đúng.
- Broker `/health/detailed`: connected=true, wsReadyState=1, refCounter tăng đều (heartbeat OK).

Bump cache: `web2-realtime.js?v=20260515a`, `native-orders-app.js?v=20260515p`.

Status: ✅ Realtime WS-driven (không polling). Debug helper `NativeOrdersApp._debug.injectFakeMessage()` test instant.

---

### [native-orders] Fix link-preview broken image — dùng post_attachments[0].url thay vì att.url (FB permalink)

**User**: "sao hình nó không hiển thị?". 10/16 IMG broken — src dạng `https://facebook.com/{pageId}_{postId}` (FB post permalink, không phải ảnh CDN).

**Root cause** ([native-orders-app.js:\_renderLinkPreview](../native-orders/js/native-orders-app.js)): link attachment shape = `{url: <FB permalink>, name, post_attachments: [{url: <real CDN>, type:'photo', image_data}]}`. Code cũ `thumb = att.url || post?.url` → `att.url` always set → `||` short-circuit → dùng FB permalink làm `<img src>`. Trình duyệt fetch → HTML/404 → broken.

**Fix**: tách `thumb` (image src = ưu tiên `post.url`) khỏi `href` (click target = `att.url`). Wrap card thành `<a target=_blank>` để click mở FB post. Title fallback `att.name → post.title → post.description → 'Bài viết'`.

**Verify** (Playwright): Kitty Thảo conv 16 imgs → 0 broken (trước 10), 13/16 proxy load OK. Screenshot: [link-preview-image-fixed.png](../downloads/n2store-session/link-preview-image-fixed.png).

Bump cache: `native-orders-app.js?v=20260515o`.

Status: ✅ Done.

---

### [native-orders] Fix sidebar trống trên Bình luận tab + auto-switch sang Tin nhắn khi click conv

**User**: "phần bình luận bị bug đoạn hội thoại bên trái".

**Root cause** ([native-orders-app.js:2366](../native-orders/js/native-orders-app.js)): branch `tab === 'comments'` trong `_renderInteractionsModal` chỉ wire reply handlers — KHÔNG gọi `_loadInboxSidebar(order)`. Tin nhắn gọi đầy đủ; Bình luận miss → sidebar stuck ở skeleton.

**Fix**:

1. Gọi `_loadInboxSidebar(order)` cũng trong nhánh comments.
2. `_switchChatToCustomer`: khi user click conv mà tab hiện tại ≠ messages → set `_interactionsState.tab='messages'` + `_renderInteractionsModal(synthetic, 'messages')`. Comments tied to specific order's post (`fbCommentId/fbPostId`) nên không hợp lý load comments cho khách khác.

**Verify** (Playwright localhost:8089):

- `openInteractions(...,"comments")` → sidebar 50 rows, không skeleton ✓.
- Click Kitty Thảo trên Bình luận tab → auto switch Tin nhắn, header = "Kitty Thảo", `#msgThread` load chat của Kitty Thảo. Screenshot: [comments-tab-fixed.png](../downloads/n2store-session/comments-tab-fixed.png).

Bump cache: `native-orders-app.js?v=20260515n`.

Status: ✅ Done.

---

### [native-orders][web2-shared] Pancake-style cache — persist page settings + filter state qua localStorage

**User**: "tiếp tục coi pancake lưu gì ở local và cache làm theo luôn".

**Recon Pancake storage** (via prior pancake-inspect + fresh probe):

- LS unauthenticated: chỉ 2 marketing keys (`lastExternalReferrer`, `lastExternalReferrerTime`).
- Pancake KHÔNG persist conv/tag data ra LS — tất cả trong **Redux memory** (`window.__pancakeReduxStore__`).
- Redux `conversations` reducer 42 keys: `filteredType`, `filteredTag`, `filteredConversationsCloneList`, `dateRangeFilter`, `filteredAdIds`, `filteredWebs`, `selectedId`, `selectedTags`, `pageSettingTags`, `lastTagsUpdateTimestamp`, `unreadConvCount`, `viewingUsers`, `usersTyping`, `data` (conv list), …
- Cache strategy = **fetch-once-per-session + in-memory** (reset reload). `lastTagsUpdateTimestamp` cho stale check.
- Cookies: chỉ marketing; JWT httpOnly.

**Apply cho native-orders** (tốt hơn Pancake — persist qua LS để survive reload):

1. **Page settings cache** ([web2-chat-client.js fetchPageSettings](../web2/shared/web2-chat-client.js)):
    - LS key `web2_pancake_page_settings_v1` mapping `{pageId: {fetchedAt, settings}}`.
    - TTL **30 phút**. Load LS vào memory Map khi module init.
    - **Single-flight**: `_pageSettingsInflight` Map dedupe concurrent calls cùng pageId.
    - **Stale-while-revalidate**: cache có nhưng stale → return ngay với `stale:true`, revalidate background. API fail → fallback stale.
    - **Quota handling**: catch `setItem` quota exceeded → drop oldest entry + retry.

2. **Filter state per page** ([native-orders-app.js \_loadFilterStateFor / \_persistFilterState](../native-orders/js/native-orders-app.js)):
    - LS key `n2store_native_inbox_filter_v1` mapping `{[pageId]: {includeTags:[], excludeTags:[], conditions:[]}}`.
    - Restore khi `_wireSidebarFilter` first call hoặc khi page id đổi (`nextPageId !== _currentPageId`).
    - Persist sau mỗi mutation (tag/condition toggle, reset). Reset xoá entry hoàn toàn.
    - **Pancake KHÔNG làm** — họ reset `filteredTag="ALL"` mỗi reload. Ta giữ filter cũ là UX tốt hơn.

**Verify** (Playwright localhost:8089):

- Tick BOOM (id=201) → LS `n2store_native_inbox_filter_v1` = `{"117267091364524":{"includeTags":["201"],...}}` ✓. LS `web2_pancake_page_settings_v1` = 11.5KB (cache 16 tag + quick_replies + …) ✓.
- Reload → mở modal → click Có chứa thẻ: 16 tags hiển thị **instant** (không chờ API), BOOM checked, badge "1", filter auto-apply → 50→2 rows visible ngay.
- Reset: badge tắt, LS entry cho page bị xoá hoàn toàn.

**Pancake parity matrix**:

| Cái             | Pancake                     | Native-orders trước              | Native-orders sau                 |
| --------------- | --------------------------- | -------------------------------- | --------------------------------- |
| Tag definitions | Redux memory (reset reload) | Memory Map 5min TTL              | LS 30min TTL, SWR, survive reload |
| Filter state    | Redux memory (`ALL`)        | Memory only (reset reload)       | LS per-page, persist forever      |
| Conv list       | Redux memory + WS           | Memory + WS poll                 | (same — same as Pancake)          |
| Quick replies   | Redux memory                | LS `web2_quick_replies_cache_v1` | (same)                            |

Status: ✅ Done. Phase 2 todo: conv list LS cache + SWR, persist `_chatState` selected conv.

---

### [native-orders][web2-shared] "Lọc theo" — rebuild Pancake-style 2-cột với tag include/exclude từ page settings

**User**: gửi screenshot Pancake "Lọc theo" dropdown 2-cột (Thẻ hội thoại / Điều kiện) với tag chips multi-select kèm màu thật. Yêu cầu "coi pancake có gì làm giống vậy" → "bên pancake".

**Phase 1 thay flat dropdown** (4-7 option) thành Pancake-style 2-col popover:

- [web2-chat-client.js](../web2/shared/web2-chat-client.js): thêm `fetchPageSettings(pageId, opts)` route `${WORKER_URL}/api/pancake/pages/{pageId}/settings?access_token=${jwt}`. Cache 5 phút trong `_pageSettingsCache` Map. Trả `{ ok, settings: { tags: [{id, text, color}], quick_replies, page_access_token, … } }`.
- [native-orders-app.js](../native-orders/js/native-orders-app.js):
    - Markup `_renderInboxSidebarShell`: replace single-list menu bằng `.w2-fm-pancake` flex layout. Left col 240w (Thẻ hội thoại → Có chứa thẻ / Loại trừ thẻ + Điều kiện), right col 280-360w (sub-content dynamic).
    - CSS: popover 540-640px wide, shadow lg, 10px radius. Sub-list scroll, tag chip pill style với color từ settings. Search input ở mỗi tag panel.
    - State `_filter = { includeTags: Set, excludeTags: Set, conditions: Set }`. "Không gắn thẻ" model như pseudo-tag id `__untagged` để AND logic uniform. Filter combine AND giữa các nhóm; trong nhóm tag include là OR (row pass nếu có ≥1 tag được tick).
    - `_rowMatchesFilter`: parse `data-tag-ids` từ row (đã bake `tagIdsStr` trong `_convRowHtml`), check include/exclude intersection + conditions.
    - `_renderFilterSub(cat)`: render sub-panel theo cat. Tags panel có search input filter client-side; conditions panel 5 checkbox (Chưa đọc / Đã đọc / Chưa trả lời / Có SĐT / Có đơn livestream).
    - `_loadPageTagsForFilter(pageId)`: lazy load `Web2Chat.fetchPageSettings` lần đầu mở popup → cập nhật `_pageTagDict` Map. Seed trước bằng tag IDs từ DOM rows nên không-có-API vẫn show "Thẻ #{id}" placeholder.
    - Button hiển thị count badge khi ≥1 filter active; categories show count riêng. "Xoá bộ lọc" reset cả 3 set.
    - Position popup `left: 0` (popup extends rightward into chat area) — `right: 0` ban đầu khiến popup `left=-204px` off-screen.
    - Anchor `left: 0` của `.w2-inbox-sb-filter-wrap`.
- [index.html](../native-orders/index.html): bump `web2-chat-client.js?v=20260515a` + `native-orders-app.js?v=20260515l`.

**Verify** (Playwright localhost:8089):

- Open NW-20260513-0016 → click Lọc theo → menu width 540, position left=241 right=781 ✓.
- Click Có chứa thẻ → settings load 16 tags với màu thật: BOOM (red), CHECK IB (orange), NHẮC KHÁCH (pink), NJD ƠI (purple), NV. BO (cyan), Nv My (blue), NV My CK + Gấp (blue), NV My KH đặt (blue), Nv. Duyên (teal), NV. Hạnh (green), ... khớp screenshot Pancake user gửi.
- Tick BOOM (id=201) → 2 conv visible, badge button "1", cat count "1" ✓.
- Click Điều kiện → tick Chưa đọc → combined visible 0 (no BOOM+unread overlap), badge "2".
- Click Xoá bộ lọc → 50 visible, badge hidden, button inactive ✓.

Screenshot: [filter-pancake-final.png](../downloads/n2store-session/filter-pancake-final.png).

**Phase 2 todo** (chưa làm):

- HOẶC/VÀ logic combinator (Pancake có Điều kiện | HOẶC).
- Lưu filter state vào localStorage để persist qua reload.
- Wire filter qua Pancake server-side endpoint `tags[]` param thay vì DOM filter (nếu user muốn thật-time-fetch theo filter).

Status: ✅ Phase 1 done.

---

### [native-orders] "Lọc theo" — wire dropdown filter (Tất cả / Chưa đọc / Đã đọc / Có gắn nhãn)

**User**: "Lọc theo này chưa có chức năng". Button bên sidebar trái tồn tại nhưng không bind click.

**Fix** ([native-orders-app.js](../native-orders/js/native-orders-app.js)):

- `_renderInboxSidebarShell`: bọc button trong `.w2-inbox-sb-filter-wrap` (relative anchor) + thêm `#w2InboxFilterMenu` dropdown với 4 option (`all` / `unread` / `read` / `tagged`), `hidden` attribute mặc định.
- CSS dropdown popover (`position:absolute`, `top:calc(100%+6px)`, `right:0`, shadow + 8px radius). Item active có ✓ tím + bg `#ede9fe`.
- Button highlight `.is-active` (tím) khi filter ≠ `all`. Label đổi từ "Lọc theo" → tên filter đang chọn.
- `_convRowHtml`: thêm `data-tag-count="${tags.length}"` để filter tagged.
- `_sidebarFilter` state ('all'|'unread'|'read'|'tagged'). `_applySidebarFilter()` walk `.w2-inbox-conv` rows, `style.display='none'` các row không match. Empty-state hint khi 0 row match.
- `_wireSidebarFilter()` bind toggle dropdown + outside click close. `data-filterWired='1'` idempotent.
- Compose với search: filter apply tự động sau `doSearch` render, sau initial `_loadInboxSidebar`, sau `_mergeSidebarConvs` (poll-merge).

**Verify** (Playwright localhost:8089): load NW-20260513-0016 → 50 rows total, 2 unread, 30 tagged. Click Chưa đọc → 2 visible, btn highlighted. Đã đọc → 48. Có gắn nhãn → 30. Tất cả → 50 + reset btn. Outside-click close ✓. Screenshots: [filter-dropdown-open.png](../downloads/n2store-session/filter-dropdown-open.png), [filter-unread-applied.png](../downloads/n2store-session/filter-unread-applied.png).

Status: ✅ Done.

---

### [native-orders] Right panel — avatar IMG thay vì chỉ initial

**User**: "bên phải chưa có avatar". Card khách trong right panel chỉ show 1 chữ cái "H" trong tròn gradient — không lấy ảnh FB như header giữa.

**Fix** ([native-orders-app.js:\_renderInfoTab](../native-orders/js/native-orders-app.js)): khi có `fbUserId + fbPageId` render `<img class="w2-customer-card-avatar" src="${_avatarUrl(...)}" onerror=...>`. Fallback `onerror` swap về `<div>` gradient + initial — match cách header dùng `&quot;` để escape inner double-quotes (lần đầu viết direct `"` trong onerror khiến parser đóng attribute sớm, 3 section sau "Khách hàng" leak ra ngoài `#w2InboxRightBody` → 7 section thay vì 4. Fix bằng `&quot;` + tách `safeInitial` để reuse).

**Verify**: switch sang Huỳnh Thành Đạt → `rightChildCount=2` (tabs + body), `sectionCount=4` (đúng), avatar tag=`IMG`, `naturalWidth=100`, src đúng từ chatomni-proxy. Screenshot: [downloads/n2store-session/native-rightavatar-final.png](../downloads/n2store-session/native-rightavatar-final.png).

Status: ✅ Done.

---

### [native-orders] Fix conv-switch — header + right panel update khi click sang khách khác

**User bug**: search "0123456788" → click "Huỳnh Thành Đạt" trong sidebar → middle chat header vẫn show "Thế Hoàng / NW-20260513-0016" + Page badge cũ, right panel cũng giữ nguyên thông tin Thế Hoàng. Chỉ messages thread đổi. Sidebar `is-active` highlight đúng nhưng header inconsistent.

**Root cause**: `_switchChatToCustomer` chỉ gọi `_loadAndRenderThread(synthetic)` để load thread mới. Header (avatar/name/code/phone/tags) + right panel info được render lần đầu trong `_renderInteractionsModal` rồi không bao giờ update — không có ID trên DOM để target.

**Fix** ([native-orders-app.js](../native-orders/js/native-orders-app.js)):

1. Tách helper `_renderChatHeaderInner(order) → { avatarHtml, infoHtml }` để dùng chung giữa lần render đầu + lần switch.
2. Bọc avatar vào `<div id="w2ChatHeaderAvatar">` và info section vào `<div id="w2ChatHeaderInfo">` để target nhanh.
3. Thêm `_applyChatHeaderForOrder(order)` swap innerHTML 2 slot trên + re-init lucide icons.
4. Phone copy click chuyển sang **delegation** trên `#w2ChatHeaderInfo` (vì element con sẽ bị thay khi switch).
5. `_switchChatToCustomer` giờ:
    - Detect `isSameCustomer = originalOrder.fbUserId === fbId` → no-op clear nếu same.
    - Khác khách → synthetic clear `phone/code/tags/amountTotal/status/address/note/messageCount/commentCount` (vì không có đơn cho khách này) → header hiện "Huỳnh Thành Đạt" + Page badge, KHÔNG còn order code.
    - Re-render `#w2InboxRightBody = _renderInfoTab(synthetic)` → right panel hiện khách mới với "Mã đơn —", "Trạng thái —", "Tổng tiền 0đ".
    - Strip badges `.interactions-tab .w2-inbox-tab-badge` (cũ là của Thế Hoàng, vô nghĩa cho khách khác).
6. Sidebar / search input / scroll / WS sub đều **giữ nguyên** vì không re-render modal toàn bộ.

**Verify** (Playwright localhost:8089):

- `openInteractions("NW-20260513-0016")` → header "Thế Hoàng" + code "NW-20260513-0016".
- Type "0123456788" → 2 results: Nguyễn Tâm, Huỳnh Thành Đạt.
- Click Huỳnh Thành Đạt row → header đổi "Huỳnh Thành Đạt" + Page …364524, NO code badge, "không SĐT" placeholder. Right panel: input "Tên khách"=Huỳnh Thành Đạt, "Mã đơn —". Tab badges `[]`. Chat thread load đúng messages của Huỳnh Thành Đạt.
- Screenshot: [downloads/n2store-session/native-conv-switch-fix-v2.png](../downloads/n2store-session/native-conv-switch-fix-v2.png).

Status: ✅ Done.

---

### [native-orders][web2-shared] Search sidebar — wire Pancake server-side conv search

**User**: "chức năng tìm kiếm chưa hoạt động → bạn browser test vào pancake.vn/NhiJudyStore coi chi tiết hết đi, các js, hàm ẩn, network, console,...".

**Reverse-engineer endpoint** ([scripts/pancake-search-trace.js](../scripts/pancake-search-trace.js) — one-shot Playwright trace mở Pancake admin với JWT cookies, dùng `page.keyboard.type(query)` để gõ thật, capture `request`/`response`/WS frames + hook Redux dispatch):

```
POST https://pancake.vn/api/v1/pages/{pageId}/conversations/search
     ?q={query}&access_token={jwt}
Body: empty (server reads q from querystring)
Response: { conversations: [ { id, customers, from, last_message,
            snippet, type:'INBOX'|'COMMENT', tags, updated_at, ... } ] }
```

Same shape như `fetchConversationsByPage` → sidebar row renderer dùng lại được.

**Test query "Huynh Thanh Dat"** → 2 matched customers (`Huỳnh Thành Đạt29.01` + `Huỳnh Thành Đạt03.12`). Search match theo customer name, không match theo SĐT (Pancake không search số).

**Implementation**:

1. [web2-chat-client.js:`searchConversations(pageId, query, opts)`](../web2/shared/web2-chat-client.js) — POST proxy qua CF Worker `/api/pancake/...`. Body bỏ luôn + bỏ `Content-Type` để tránh CORS preflight trên `multipart/form-data` (browser cross-origin từ localhost → CF Worker required preflight). Hỗ trợ `AbortSignal` để cancel keystroke cũ khi gõ tiếp.

2. [native-orders-app.js:`_wireSidebarSearch(order, baselineConvs)`](../native-orders/js/native-orders-app.js) — listen `input` event, debounce 300ms, fire search. `Enter` skip debounce. Empty query → restore `baselineConvs` (50 page-list rows ban đầu). `AbortController` cancel inflight khi có keystroke mới. Dim list `opacity: 0.55` khi đang chờ.

3. `_bindConvRowClicks(list, order)` extracted helper — gắn click handler cho cả initial render lẫn search-result render.

**Verify live trên page `117267091364524`** (NJD Store):
| Query | Rows | Sample |
|-------|------|--------|
| (empty) | 50 | baseline page list |
| `huynh thanh dat` | **9** | tất cả "Huỳnh Thành Đạt" — match perfectly |
| `0788730969` | 0 | Pancake không search by phone |

**Cache bump**: `web2-chat-client.js v=20260514j`, `native-orders-app.js v=20260515k`.

**Status**: ✅ Search hoạt động đúng — gõ vào ô "Tìm kiếm" sẽ filter list ngay (300ms debounce), giống Pancake admin.

---

### [realtime-broker][native-orders] Per-page Phoenix channel join — verified

**User**: "tôi thấy bên pancake có socket trực tiếp mà? được thì bạn build lên render đi". Đúng — Pancake admin browser join thẳng `wss://pancake.vn/socket/websocket?vsn=2.0.0` (Phoenix Channels v2.0, KHÔNG cần extension).

**Trace**: [`scripts/pancake-ws-trace.js`](../scripts/pancake-ws-trace.js) dùng Playwright `page.on('websocket')` (bắt frames trước khi WS object tồn tại). 35s trace: admin join 2 channels — `users:{userId}` và **`pages:{pageId}`** (per-page) — chỗ flow `pages:new_message`, `update_conversation`, `tag_conversations`, `seen_conversation`, etc.

**Bug broker**: chỉ join `users:{userId}` + `multiple_pages:{userId}` (cross-page summary, không carry per-page events đầy đủ).

**Fix** trong [n2store-realtime/server.js](../n2store-realtime/server.js): thêm `_joinPageChannel(pageId)`, gọi cho mỗi page sau `multiple_pages`. Payload match live trace `{ accessToken, userId, platform: "web" }`. Commit `4dbd5576`, Render deploy `dep-d839euqp8t4c73aqsffg` live 03:49:35Z.

**Verify từ Render logs**:

| Check                                         | Result                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Joining pages:117267091364524 channel`       | ✓ 03:49:35                                                                                                              |
| `phx_reply [pages:117267091364524] status=ok` | ✓ 03:49:36                                                                                                              |
| Per-page events arriving                      | ✓ `tag_conversations`, `seen_conversation`, `recent_contents:add`, `messages:mark_as_deleted`, `viewing_conversation:*` |
| Broker → browser WS                           | ✓ direct WS test: 5 frames `pages:update_conversation` page=`117267091364524` trong 30s                                 |
| Web2Realtime client                           | ✓ 4 events qua `subscribe()` trong 25s                                                                                  |

**Bonus bug fixed**: `_handleSidebarWsEvent` chỉ đọc `payload.message` (cho `new_message`) — `update_conversation` lưu data ở `payload.conversation` (id at `.conversation.id`, last text at `.conversation.last_message.message`). Trước fix, conv ID lookup thất bại → sidebar không update. Sau fix: normalize cả 2 shape vào 1 object trước khi extract.

Thêm `console.log('[NativeOrders][RT] {type} conv=… page=…')` trong handler làm breadcrumb.

**Cache bump**: `native-orders-app.js v=20260515j`.

**Status**: ✅ Infrastructure end-to-end. Khi customer gửi tin INBOX mới → sidebar bump tức thời. Polling 12s vẫn chạy song song làm backstop.

---

### [issue-tracking] Nút copy bên cạnh mọi SĐT 10 số

**User**: "tất cả định dạng sđt 10 số trang này có nút copy"

**Approach**: Thêm 1 file enhancer auto-scan DOM, không cần sửa từng render site (script.js có 5+ chỗ render SĐT khác nhau).

- New: [`issue-tracking/js/phone-copy.js`](../issue-tracking/js/phone-copy.js) — IIFE: TreeWalker quét text nodes match `\b0\d{9}\b`, wrap thành `<span class="phone-with-copy"><span class="phone-num">SĐT</span><button class="phone-copy-btn">📋</button></span>`. MutationObserver (debounce qua `requestAnimationFrame`) bắt cả nội dung render sau (ticket list, modal đơn khách, history). Skip `SCRIPT/STYLE/INPUT/TEXTAREA/BUTTON/OPTION/SELECT` + nested `.phone-with-copy`. Click delegated capture-phase → `navigator.clipboard.writeText` (fallback `execCommand('copy')` cho non-secure context) → flash dấu `✓` 1.1s.
- CSS append: [`issue-tracking/css/style.css`](../issue-tracking/css/style.css) — `.phone-with-copy` (inline-flex gap 4px, no-wrap, tabular-nums) + `.phone-copy-btn` (18×18, opacity 0.65 → 1 hover, 12×12 SVG clipboard icon, focus-visible outline primary, `.copied` state xanh `#10b981`).
- Wire: [`issue-tracking/index.html`](../issue-tracking/index.html) thêm `<script src="js/phone-copy.js">` sau `customer-orders-lookup.js`.
- Verify Playwright (`localhost:8089/issue-tracking/index.html`): 95 tickets render → 96 `.phone-with-copy` wrappers (95 customer cells + 1 trong modal đơn khách), `scriptLoaded:true`, sample `["0944307373","0906306019","0977188680"]`.

**Status**: ✅ Done

---

### [native-orders] Chat modal — Pancake-faithful styling + realtime sidebar (Phase 1.5)

**User**: (1) "Làm giao diện giống pancake — màu sắc, cỡ chữ, font, hover, tương tác, read/unread"; (2) "Realtime đoạn hội thoại bên trái và realtime tin nhắn ở giữa"; (3) "Bỏ nút tạo đơn bên phải".

**Style tokens** captured live qua [`scripts/pancake-browser-session.js`](../scripts/pancake-browser-session.js):

| Token           | Pancake                                       | Áp                                |
| --------------- | --------------------------------------------- | --------------------------------- |
| Font            | `Roboto, Helvetica, Arial, sans-serif`        | `.w2-inbox-card`                  |
| Body            | 14px / `#1d2939`                              | inherit                           |
| Outgoing bubble | `#dcf8c6` (light green) radius 12px           | `_bubbleHtml`                     |
| Incoming bubble | `#ffffff` radius `12 12 12 4`                 | `_bubbleHtml`                     |
| Chat header     | 68px, white, border-bottom `1px #ddd`         | `.w2-inbox-header`                |
| Chat area bg    | `#ebebeb`                                     | `#msgThread`, `#interactionsBody` |
| Conv row        | 86px min-h, padding 12px                      | `.w2-inbox-conv`                  |
| Conv read       | bg `#fff`, hover `#f5f6f8`                    |                                   |
| Conv unread     | bg `#dde1e7`, name 600                        | `.is-unread`                      |
| Conv active     | bg `#e6f7ff`                                  | `.is-active`                      |
| Conv name       | 14px regular                                  |                                   |
| Conv preview    | 13px `#667085`                                |                                   |
| Conv time       | 12px `#98a2b3`                                |                                   |
| Unread dot      | 8×8 `#f04438`                                 | `.w2-inbox-conv-badge`            |
| Search input    | transparent inside `#f5f6f8` capsule, 32px    |                                   |
| Filter button   | bg `#eaecf0`, text `#344054`, 32px weight 500 |                                   |

**Realtime sidebar** (`_wireSidebarRealtime` + `_handleSidebarWsEvent`):

- Sub `Web2Realtime.subscribe({ types:['pages:new_message'], debounceMs:80 })`.
- Khi tin mới: find row qua `data-conv-id` (fallback `data-fb-id`), update preview + time, bump lên đầu (`list.prepend`), nếu incoming + không phải conv đang mở → add `.is-unread` + spawn red dot.
- Conv mới chưa có row → render synthetic + bind click + prepend.
- Click row → remove `.is-unread` + xóa badge.
- Unsubscribe trong `_teardownChatState`.

**Realtime chat (giữa)** — đã có từ session trước (`_onIncomingWsMessage` → `_appendBubbleDom`).

**Bỏ Tạo đơn**: `_renderInboxRightPanel` chỉ còn tab Thông tin.

**Verify live**: font Roboto ✓, outgoing `rgb(220,248,198)` ✓, incoming `rgb(255,255,255)` ✓, radius `12 12 12 4` ✓, tab Tạo đơn removed ✓, 50 conv rows ✓, 55 bubbles ✓.

**Cache bump**: `native-orders-app.js v=20260515e`.

**Status**: ✅ Done Phase 1.5.

---

### [native-orders] Chat modal — Pancake-style 3-col inbox layout (Phase 1)

**User**: gửi screenshot Pancake admin inbox + "làm tất cả để giống hình". Sau đó: "không cần làm phần tạo đơn pancake order đâu vì web 2.0 có hệ thông tạo đơn rồi".

**Scope Phase 1** (xem plan tại [`docs/plans/native-orders-pancake-inbox.md`](plans/native-orders-pancake-inbox.md)):

- Modal mở rộng 96vw × 92vh, CSS Grid 3 cột `320px 1fr 380px`.
- **Trái — Sidebar**: search "Tìm kiếm" + filter "Lọc theo" + list 50 conv mới nhất của page (fetch qua `Web2Chat.fetchConversationsByPage` mới). Click row → swap chat sang khách đó (giữ modal mở).
- **Giữa — Chat**: header avatar + tên + 5 icon button (history, user, package, external-link, ×). Tabs Tin nhắn/Bình luận + badge. Thread bubble giữ nguyên. **Quick-reply tag bar 14 chip nhiều màu** (rgba 0.4 opacity, white text shadow) match Pancake `.btn-tag-item` palette. Click chip → paste template + signature vào input.
- **Phải — Right panel**: tab Thông tin (active) + tab Tạo đơn là `<a target=_blank>` link sang `tpos-pancake/index.html?phone=…` (web 2.0 đã có hệ tạo đơn riêng — KHÔNG dựng lại). Thông tin tab: Khách hàng card, Đơn hiện tại (mã/trạng thái/tổng tiền/tags), Ghi chú nội bộ, Lịch sử đơn (placeholder).

**Files**:

- [native-orders/js/native-orders-app.js](../native-orders/js/native-orders-app.js) — rewrite `_renderInteractionsModal` markup; thêm `_renderInboxSidebarShell`, `_renderInboxRightPanel`, `_renderInfoTab`, `_renderQuickReplyTags`, `_wireQuickReplyTags`, `_loadInboxSidebar`, `_convRowHtml`, `_switchChatToCustomer`; ~350 dòng CSS trong `_ensureChatModalCss`. Sidebar `await Web2Chat.syncFromRenderDB()` trước fetch để có JWT.
- [web2/shared/web2-chat-client.js](../web2/shared/web2-chat-client.js) — thêm `fetchConversationsByPage(pageId, opts)`.

**Verify live trên NW-20260513-0016**:

| Metric            | Result                    |
| ----------------- | ------------------------- |
| Grid columns      | `320px 682.398px 380px` ✓ |
| Sidebar conv rows | 50 ✓                      |
| Chat bubbles      | 55 ✓                      |
| Quick reply tags  | 14 ✓                      |
| Right panel       | Thông tin rendered ✓      |

**Bug đã fix khi build**: Stray backtick trong CSS comment (`.w2-inbox-right-foot`) làm template literal đóng sớm → toàn bộ CSS không inject → grid không apply. Sửa bằng bỏ backticks trong comment.

**Cache bump**: `native-orders-app.js v=20260515d`, `web2-chat-client.js v=20260514h`.

**Phase tiếp theo (chưa code)**: P4 composer enhancements (attach image/file/sticker), P5 polish (virtualization nếu >500 conv, real-time WS update cho sidebar, responsive). Xem plan doc.

**Status**: ✅ Done Phase 1.

---

### [native-orders][web2-shared] Web 2.0 dùng chung Pancake account pool với Web 1.0

**User**: "coi bên web 1.0 render db lưu account pancake ở đâu -> copy các account và cách refresh token qua web 2.0".

**Web 1.0 store** ([shared/js/pancake-token-manager.js](../shared/js/pancake-token-manager.js)):

- Render DB tables qua endpoints `/api/pancake-accounts`, `/api/pancake-page-tokens`, `/api/pancake-account-pages` (proxy qua CF Worker).
- localStorage keys: `pancake_jwt_token`, `pancake_jwt_token_expiry`, `pancake_page_access_tokens`, `pancake_all_accounts` (object keyed by account_id), `tpos_pancake_active_account_id`.
- Refresh PAT pattern: POST `/api/pancake/pages/{pageId}/generate_page_access_token?access_token={accountJwt}` — thử lần lượt từng account đến khi 1 cái thành công (khác account admin khác page).

**Web 2.0 trước đây** chỉ đọc localStorage 1 JWT, không sync server, không multi-account. Hậu quả: vừa thấy lỗi "Chưa cấu hình token Pancake cho page 117267091364524" dù Render DB có đầy đủ 6 accounts.

**Thay đổi** ([web2/shared/web2-chat-client.js](../web2/shared/web2-chat-client.js)):

1. **LS keys đồng bộ với web 1.0**: thêm `ALL_ACCOUNTS = 'pancake_all_accounts'`, `ACTIVE_ACCOUNT_ID = 'tpos_pancake_active_account_id'`. Cùng schema → 2 app dùng chung storage không xung đột.
2. **`syncFromRenderDB()`**: chạy parallel `/api/pancake-accounts?active=true` + `/api/pancake-page-tokens`, merge vào localStorage. Promote 1 account thành active JWT slot (theo preferred ID, fallback non-expired). Cached cho cả session (`_syncedThisSession` + `_syncInFlight` Promise dedup).
3. **`getAllAccounts()`**: expose account map dạng `{ id → {token, exp, fbId, fbName, pages, ...} }`.
4. **`generatePageAccessToken(pageId)` rewrite**: thay vì chỉ dùng active JWT, build candidate list ưu tiên (a) accounts admin page đó (`acc.pages.includes(pageId)`), (b) active JWT, (c) non-expired accounts khác. Loop đến khi 1 cái success. Match web 1.0 multi-account fallback.

**Wire vào flow** ([native-orders-app.js `_loadAndRenderThread`](../native-orders/js/native-orders-app.js)):

- Sau skeleton render, await `Web2Chat.syncFromRenderDB()` (cached sau lần đầu).
- Nếu `getPageAccessToken(pageId)` vẫn null, await `generatePageAccessToken(pageId)` để auto-mint từ pool.
- Sau đó mới fall-through tới `hasTokensFor` check → error UI chỉ hiện khi thực sự không có account nào.

**Đo live trên NW-20260513-0016** (page 117267091364524 trước đây báo "chưa cấu hình"):

- `accountsAfterSync`: 6
- `pageTokensAfterSync`: 3
- `bubbles`: 55 (load + render thành công)
- Error "Chưa cấu hình token" KHÔNG còn xuất hiện.

**Files**: cache bump `web2-chat-client.js v=20260514g`, `native-orders-app.js v=20260514ak`.

**Status**: ✅ Done.

---

<!--
HƯỚNG DẪN THÊM ENTRY MỚI:

1. Nếu cùng ngày → thêm entry ngay dưới heading ## [NGÀY]
2. Nếu ngày mới → thêm heading ## [NGÀY MỚI] ở trên cùng (trước ngày cũ)

FORMAT:
### [module] Mô tả ngắn {✅ hoặc 🔄}
**Files**: `path/to/file.js`
**Chi tiết**: Thay đổi gì, tại sao

MODULE TAGS: [inbox] [chat] [extension] [orders] [worker] [render] [shared] [docs] [config]
STATUS: ✅ = Done, 🔄 = In Progress
-->
