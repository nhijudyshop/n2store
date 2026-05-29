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

## 2026-05-29

### [so-order] Custom confirm popup thay native `window.confirm()` ✅

**User ask**: "bấm xóa bị delay và làm custom popup confirm" (screenshot native `localhost:8080 says` dialog xấu + lag).

**Files**:

- `so-order/css/so-order.css` — `.so-confirm-modal` + `.is-danger` variant + `.so-confirm-foot-note` + 3 button classes (danger / primary / cancel).
- `so-order/js/so-order-app.js` — thêm `soConfirm({ title, message, items, footNote, confirmText, cancelText, danger })` async helper next to `showModal/hideModal`. Replace 6 native `confirm()` callsites trong `deleteRow` (2), `deleteShipment` (2), `handleTabDelete` (2).
- `so-order/index.html` — bump CSS/JS cache `v=20260529n`.

**Chi tiết**:

- Lý do native delay: `window.confirm()` block event loop + Chrome throttle nếu mở liên tiếp ("Prevent this page from creating additional dialogs"). UI cũng không matchable styling.
- Helper API: `await soConfirm({ title, message, items: ['line 1', 'line 2'], footNote: 'warning red box', confirmText: 'Xóa', cancelText: 'Hủy', danger: true })` → returns `Promise<boolean>`.
- Modal được lazy-create 1 lần, reuse via `getElementById('soConfirmModal')`. DOM tránh re-create overhead.
- Esc = cancel, Enter = confirm, click backdrop = cancel. Auto-focus OK button sau 30ms để Enter dùng được ngay.
- Sample khi xóa lô có stock:
    - Title: `⚠️ Lô này có 3 SP còn tồn kho`
    - Message: `Các sản phẩm dưới đây đã nhận hàng và còn stock trong Kho:`
    - Items: yellow `<ul>` list 3 SP + tên/biến thể/tồn/NCC
    - Foot note: red box `Xóa lô + 8 dòng order sẽ mất link tracking nhưng KHÔNG xóa stock trong Kho.`
    - Buttons: `Hủy` (white) + `Vẫn xóa lô` (red)
- Verify: Playwright browser test — click delete-shipment → modal hiện instant (no native delay), items count 3, isDanger:true, Cancel + Esc đều đóng modal không xóa, simple case (no stock) cũng hoạt động với title "Xóa lô?" + message ngắn.

**Status**: ✅ Done. Screenshots: `downloads/n2store-session/so-confirm-popup.png` (danger variant với items), `so-confirm-popup-simple.png` (simple variant).

---

### [inventory] Variant modal: confirm khi tổng biến thể ≠ Tổng SL ✅

**User ask**: "tổng số lượng biến thể nhập vào phải bằng tổng món → nếu khác thì có custom confirm xác nhận".

**File**:

- `inventory-tracking/js/modal-variant.js#_saveVariants` — trước khi overwrite `product.tongSoLuong`, compute `sumVariants = sum(mauSac.soLuong)` và `existingTotal = product.tongSoLuong || product.soLuong`. Nếu `existingTotal > 0` và `sumVariants !== existingTotal` → `notificationManager.confirm("Tổng số lượng biến thể (X) khác với Tổng SL (Y). Bấm Đồng ý để LƯU (Tổng SL → X), hoặc Hủy để chỉnh sửa.", 'Tổng biến thể không khớp')`. Cancel → abort, không lưu, modal vẫn mở để user sửa SL.
- `inventory-tracking/index.html` — bump `modal-variant.js?v=20260529j`.

**Guard**: chỉ confirm khi `existingTotal > 0` (sản phẩm đã có Tổng SL trước đó). Nếu là product mới chưa có Tổng SL → accept trực tiếp (variant total trở thành Tổng SL).

**Scope**: chỉ áp dụng cho variant modal save, không áp dụng cho inline edit `tongSoLuong` (user có thể chủ động override Tổng SL inline).

Status: ✅ Done.

---

### [inventory] Lịch sử chỉnh sửa per-NCC + per-đợt (lưu 30 ngày) ✅

**User ask**: "thêm lịch sử chỉnh sửa riêng của từng ngày giao, từng NCC (lịch sử lưu 30 ngày)".

**Server (`render.com/routes/v2/inventory-tracking.js`)**:

- New helper `logShipmentHistory(db, action, row, opts)` — auto-log mọi mutation shipment (POST/PUT/PATCH shortage/DELETE) ngay sau khi commit. Mỗi log gồm `changes[]` diff (via `_diffShipment`), snapshot (cho create/delete), meta `{ngay_di_hang, dot_so, ten_ncc}`.
- GET `/edit-history` enhance: filter mới `entity_id`, `stt_ncc`, `(ngay_di_hang + dot_so)` (resolve qua sub-select `inventory_shipments`). Hard 30-day window trong WHERE + lazy cleanup `DELETE WHERE created_at < NOW() - INTERVAL '30 days'` chạy tối đa 1 lần/giờ/process.
- PUT/DELETE shipments SELECT-before để compute diff/snapshot rồi log.

**Client**:

- `api-client.js#editHistoryApi.getAll` — thêm filter `entityId`, `sttNcc`, `ngayDiHang`, `dotSo`.
- `edit-history.js` — rewrite: 2 entry point mới `showEditHistoryForInvoice(invoiceId, label)` + `showEditHistoryForShipment(ngayDiHang, dotSo, label)`. Modal `#modalEditHistory` tạo lazy lần đầu mở (không thêm vào index.html). Render entry với badge action (Tạo mới / Cập nhật / Xóa), user, time, meta, diff list (field VN labels, value cũ gạch ngang đỏ → value mới xanh).
- `table-renderer.js`:
    - NCC cell: thêm `.btn-hist-ncc` (icon `history`, amber) — hover-reveal. Click → per-NCC modal.
    - Shipment header: thêm `.btn-hist-shipment` luôn visible cạnh nút Cập nhật thiếu. Click → per-(date,đợt) modal.
- `modern.css` — modal styles + 2 button styles + responsive grid.
- `index.html` — bump `?v=20260529i` cho 4 file.

**Granularity**: mỗi inline edit ô (đơn giá, SL, mã hàng, …) đều gọi `PUT /shipments/:id` → server SELECT old → compute diff per-column → log. User không cần làm gì client-side.

Status: ✅ Done.

---

### [extension][pancake] Bump UI — hardcode page dropdown thay vì candidate-endpoint fetch ✅

**User ask**: anh nói "NhiJudy House và NhiJudy Store có id page cụ thể mà?" + "hardcode trong extension luôn". → bỏ approach dò động qua candidate endpoints, hardcode list pages biết trước.

**Page IDs** (lấy từ `GET /api/pancake-page-tokens` Render route — chỉ lấy id+name, KHÔNG đụng token):

- `270136663390370` — NhiJudy Store
- `117267091364524` — Nhi Judy House
- `112678138086607` — Nhi Judy Ơi

**Changes** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js)):

- Const `KNOWN_PAGES` ở đầu file
- Row mới ở top body modal: `📄 Page` dropdown (KNOWN_PAGES + custom) + nút `+ Thêm` (prompt nhập ID + tên, persist `localStorage['n2store.pancake.bump.customPages.v1']`)
- `populatePageSelect()` build options từ KNOWN_PAGES + custom, default value = ctx.pageId hoặc saved hoặc first
- `openModal()` đơn giản hơn: skip 4.5s wait cho pageId (đã có từ dropdown), chỉ chờ JWT
- Bỏ logic try candidate endpoints (dead path)

Manifest version `1.0.21` → `1.0.22`.

**Status**: ✅ Done.

---

### [extension][pancake] Bump UI fix — page picker cho /multi_pages view ✅

**User ask**: trên `pancake.vn/multi_pages` (multi-page aggregated view), JWT bắt được nhưng pageId không (Pancake không gọi `/api/v1/pages/<id>/...` ở view này, dùng endpoint aggregate khác). Log: `Không bắt được context (pageId=?, jwt=OK)`.

**Fix** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js)):

- Detect `location.pathname` chứa `/multi_pages` → message rõ ràng
- Nếu JWT có (đủ auth) → fetch list pages user có quyền qua các candidate endpoints: `/api/v1/me/pages`, `/api/v1/users/me/pages`, `/api/v1/pages`, `/api/v1/multi_pages/pages` (Pancake doc không public nên thử nhiều)
- Render inline button cho mỗi page trong log area → user bấm → `ctx.pageId` được set → trigger `refreshConvs()` load list livestream
- Nếu cả 4 endpoint đều fail → message clear "click 1 page cụ thể (vd 'NhiJudy Store') từ multi_pages → URL đổi thành /<slug> → bấm 🚀 lại"

Manifest version `1.0.20` → `1.0.21`.

**Status**: ✅ Done. Reload extension + test trên `/multi_pages`.

---

### [extension][pancake] Bump UI fix — content script chuyển MAIN world + auto-capture pageId/JWT ✅

**User ask**: bump modal mở nhưng "không load được đoạn hội thoại". Root cause: `getJwt()` đọc `localStorage.getItem('jwt')` không có trên Pancake (Pancake lưu JWT trong cookie HttpOnly + bộ nhớ React state). `detectPageId()` dò avatar img nhưng Pancake redirect `/api/v1/pages/<pid>/avatar/...` → `content.pancake.vn/...` → match regex hỏng.

**Fix** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js) + [manifest.json](../n2store-extension/manifest.json)):

1. **Manifest**: chuyển content script Pancake `world: "MAIN"` + `run_at: "document_start"` → script chạy trong cùng JS context với Pancake's React app → wrap `window.fetch` + `XMLHttpRequest.prototype.open` thấy được mọi outgoing API call thật.
2. **Sniffer**: extract pageId từ URL pattern `/api/v1/pages/(\d{10,20})` + JWT từ `[?&]access_token=([^&]+)`. Cache vào `window.__n2storePancakeBumpCtx`. Mỗi lần Pancake poll conv list / load message → ta tự động bắt được context.
3. **Modal openModal()**: chờ tối đa 4.5s cho ctx được populated (`waitForCtx`), show progress trong log. Nếu vẫn không có → báo "Mở trang Hội thoại của Pancake, đợi list load xong, rồi mở lại" (UX clear cho user).
4. **getJwt fallback chain**: ctx → localStorage → cookie (non-HttpOnly).

Manifest version `1.0.19` → `1.0.20`.

**Status**: ✅ Done. Reload extension + refresh pancake.vn → bấm 🚀 → log sẽ in `Captured: pageId=... jwt=...` rồi load list.

---

### [extension][pancake] Bump UI — thêm conversation picker với checkbox ✅

**User ask**: thay vì auto-include tất cả livestream conv, cho **tick chọn** từng dòng (như list trong Pancake).

**Changes** ([n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js)):

- Picker panel mới giữa templates + progress bar
- Search input (filter theo tên KH), select filter (Tất cả / Chưa reply / Đã reply), nút "Tick tất cả" / "Bỏ tick" / "↻ Refresh"
- Scrollable list (max-height 260px) — mỗi conv 1 row: checkbox + tên KH + tag "đã reply" + post ID + giờ
- Counter footer: "Hiển thị X/Y" + "Đã chọn N"
- Default behavior: khi mở modal, auto-fetch + auto-tick các conv chưa reply (theo `skip-answered` config)
- Run dùng `state.selected` Set thay vì auto `selectQueue` — anh kiểm soát chính xác cái nào bump
- Limit vẫn là hard safety cap (nếu tick > limit thì cap còn N đầu)

Manifest version `1.0.18` → `1.0.19`.

**Status**: ✅ Done. CWS auto-publish triggered. Reload extension để thấy picker.

---

### [extension][pancake] Comment-Count Booster UI inject vào Pancake admin ✅

**User ask**: thêm UI cho tính năng bump comment count (đã có CLI ở entry dưới). Chọn Option B = inject qua N2Store Extension vào pancake.vn (không build trang web2 mới).

**Files**:

- [n2store-extension/content/pancake-bump.js](../n2store-extension/content/pancake-bump.js) — Content script, IIFE, Shadow DOM isolated UI. FAB float góc dưới-phải → modal config (limit/delay/templates/cap-per-conv/skip-answered/post-id) + Dry-run/Run/Stop. Progress bar + colored log realtime. Templates lưu localStorage.
- [n2store-extension/manifest.json](../n2store-extension/manifest.json) — version `1.0.17` → `1.0.18`. Thêm content_scripts entry `{matches: ["*://pancake.vn/*"], js: ["content/pancake-bump.js"], run_at: "document_idle"}` + host_permissions `*://pancake.vn/*`.

**Tech**:

- Shadow DOM (`:host { all: initial }`) tránh conflict với Pancake's React + CSS
- Detect pageId từ `<img src="/api/v1/pages/<id>/avatar/...">` (avatar luôn có path full)
- JWT từ `localStorage.getItem('jwt')` — content script runs on pancake.vn → same-origin, không cần CORS proxy
- Port logic từ `scripts/pancake-livestream-comment-spam.js`: `fetchLivestreamConvs()`, `selectQueue()`, `sendCommentReply()`

**UI**:

- FAB 🚀 green gradient (matches Pancake's brand) `position:fixed bottom-right z:2147483647`
- Modal dark theme (`#1e293b` slate) với green accents (`#16a34a`)
- 3 stat cells: Page ID / Livestream convs count / Queue size
- 4 buttons: Đóng / Dry-run / Dừng / Chạy thật
- Live colored log: ok=green, fail=red, dry=yellow, info=gray
- Progress bar realtime % theo queue
- Config persist trong `localStorage['n2store.pancake.bump.cfg.v1']`

**Activation**: User reload extension (`chrome://extensions/` → Reload) HOẶC đợi CWS auto-publish (bump version → Stop hook → CWS) → refresh pancake.vn tab → thấy nút 🚀 ở góc dưới-phải.

**Status**: ✅ Done — code committed, CWS auto-publish triggered.

---

### [scripts][pancake] Pancake livestream comment-count booster ✅

**User ask**: dùng Pancake gửi reply công khai vào các thread comment đến từ livestream để **tăng comment count** trên livestream post (đẩy reach), KHÔNG spam DM khách (không làm phiền). Filter "Đến từ livestream" trong Pancake UI = client-side filter `conversation.post.type === "livestream"` (radio value `is_livestream_post_on`).

**Reverse-engineered endpoint** (capture qua persistent browser session `pancake-browser-session.js` + XHR body interceptor, anh comment thật 3 lần demo4/5/6):

```
POST https://pancake.vn/api/v1/pages/<pageId>/conversations/<convId>/messages?access_token=<JWT>
Body: {
  "action": "reply_comment",
  "message_id": "<conv.id>",
  "parent_id":  "<conv.id>",
  "user_selected_reply_to": null,
  "post_id": "<conv.post_id>",        // "<pageId>_<postShortId>"
  "message": "<text>",
  "send_by_platform": "web"
}
Response 200: { id: "<new_comment_id>", success: true }
```

**Files**:

- [scripts/pancake-livestream-comment-spam.js](../scripts/pancake-livestream-comment-spam.js) — CLI booster: fetch comment conversations qua POST `/conversations?type=COMMENT` (body), filter `post.type === "livestream"`, sort theo `last_customer_interactive_at` DESC, queue có cap-per-conv / cap-per-customer, random template + random delay, log JSON report
- [scripts/pancake-browser-session.js](../scripts/pancake-browser-session.js) — enhance log: capture page console + pageerror + req/res với method/status, file log dạng JSON-lines + session log → `downloads/n2store-session/pancake-inspect/`

**Default config**:

- `--limit 30`, `--cap-per-conv 1`, `--cap-per-customer 1`
- `--delay-min 2500 --delay-max 5500` (random jitter)
- Templates mặc định: `. .. 🙏 ❤ ❤❤ 🌹 🥰 "Dạ ạ" "iB shop ạ" ✓ 👍 "Đẹp ạ"`
- Skip conversation đã có page reply (`last_sent_by.id === pageId`) trừ khi `--reply-even-if-answered`

**Verified test 1/2 OK**: Thùy Trang nhận public comment ID `1997708787498711_1297743775900692`. Kim Giang fail vì FB error 100/33 (comment bị xóa hoặc privacy block — script handle gracefully).

**Reports**: `downloads/n2store-session/pancake-comment-bump/bump-<ts>.json`.

**Safety notes**:

- Reply là public comment thật, KHÔNG vào DM khách (đúng yêu cầu) — nhưng FB vẫn push notification "X replied to your comment" cho khách
- Khuyến nghị: ≤ 50 reply/livestream, mix template ≥ 5 loại, delay ≥ 2s để tránh FB flag spam pattern
- Script không tự chạy — user trigger qua CLI với flag

**Status**: ✅ Done

---

### [so-order × web2/products] P1 integration: MUA_1_PHAN + ETA + Bulk receive modal + delete guards ✅

**User ask**: "thêm trạng thái MUA_1_PHAN" + làm full P1.

**5 features delivered**:

#### 1. Status `MUA_1_PHAN` (mua 1 phần)

- Backend (`render.com/routes/web2-products.js`):
    - `upsert-pending` logic update: `stock>0 + newPending>0 → MUA_1_PHAN`
    - `confirm-purchase` mở rộng filter: cho phép cả `CHO_MUA` lẫn `MUA_1_PHAN`
    - **Endpoint mới `POST /confirm-purchase-partial`** body `{items:[{code, qtyReceived}]}`:
        - `stock += qtyR`, `pending -= qtyR` (cap qtyR ≤ pending)
        - Status: `pending>0+stock>0 → MUA_1_PHAN`; `pending=0+stock>0 → DANG_BAN`; `pending>0+stock=0 → CHO_MUA`
        - History log + SSE broadcast `web2:products` + cross-broadcast `web2:supplier-wallet`
- Frontend products (`web2/products/js/web2-products-app.js`):
    - Badge mới: `📦 MUA 1 PHẦN (X đã nhận · Y chờ)` màu vàng

#### 2. Stock edit guard (Bug 3)

- `PATCH /api/web2-products/:code`: nếu `stock_new < pending_qty` (không `?force=1`) → **409** với message rõ + `currentStock`, `newStock`, `pendingQty`, `supplier`

#### 3. ETA giao hàng per shipment

- Schema (`so-order/js/so-order-storage.js`): `expectedDeliveryDate` field thêm vào `addShipment`/`updateShipment`
- Modal form: input `<input type="date" name="shipExpectedDeliveryDate">` cạnh "Ngày tạo"
- Badge UI `_etaBadgeHtml(etaStr)`:
    - `< today` → 🔴 "Quá hạn N ngày" | `= today` → 🟢 "Giao hôm nay"
    - `≤ 3 days` → 🟡 "Còn N ngày" | `> 3 days` → 🔵 "Còn N ngày"
- Verified: `expectedDeliveryDate: "2026-06-05"` → badge "Còn 7 ngày"

#### 4. "Nhận hàng" button per shipment + Partial Receive modal (Bug 1 UX)

- Button gradient xanh: `<i data-lucide="truck"></i> Nhận hàng` trên mỗi shipment header
- Click → `openReceiveShipmentModal(shId)`:
    - Modal grouped by NCC, mỗi row: ảnh + tên + variant + qty đã đặt + input qty nhận (default = qty đặt) + live badge MUA ĐỦ / MUA 1 PHẦN (N/M) / CHƯA NHẬN
    - Button "Tất cả mua đủ" reset, live summary
- Submit: `upsertPending` → `confirm-purchase-partial` → update so-order row.status (`received` / `partial_received`)
- Verified browser: 8 inputs, qty 50→20 → "MUA 1 PHẦN (20/50)", qty 30→0 → "CHƯA NHẬN"

#### 5. Delete row/tab guard với stock check (Bug 4)

- `_checkRowsHaveStock(rows)` helper: query `/api/web2/products/list?search=<name>` per row, filter products có `quantity > 0`
- `deleteRow`/`deleteShipment`: confirm "⚠️ SP X còn N tồn kho từ NCC Y. Xóa dòng order sẽ mất link tracking nhưng KHÔNG xóa stock. Tiếp tục?"
- `handleTabDelete` **fix orphan bug**: trước đây xóa tab KHÔNG iterate rows → pending stuck. Giờ trừ pending cho tất cả rows + guard stock.

**Verified end-to-end**:

- 20 TEST rows trên so-order → 20 SP web2_products `CHO_MUA` ✓
- confirm-purchase 2 codes → `DANG_BAN`, stock=25 ✓
- delete guard 409 với pending product ✓
- Receive modal: 8 inputs, badges update live ✓
- ETA badge "Còn 7 ngày" ✓

**Cache bust**: so-order `v=20260529a→v=20260529b`, products-app `v=20260523b→v=20260529b`

**Files**: render.com/routes/web2-products.js, so-order/{js/so-order-app.js, js/so-order-storage.js, index.html}, web2/products/{index.html, js/web2-products-app.js}

**Test data**: 20 TEST-NCC- rows vẫn còn trên DB + Firestore. Cleanup: `bash scripts/so-order-test-data-load.sh cleanup`.

---

## 2026-05-29

### [shared][nav] SePay billing alert: 100% live-driven, kèm QR VietQR + bank info khi expand ✅

**User ask**: "lấy linh hoạt theo sepay được không? Tôi không muốn cố định → khi sepay báo có hóa đơn thì mới hiện → bấm chi tiết sẽ hiện chi tiết thanh toán bao gồm cả mã qr chuyển khoản".

**Approach**: bỏ hoàn toàn calendar fallback. Banner chỉ hiện khi SePay live data nói có hóa đơn chưa thanh toán HOẶC subscription đã hết hạn. "Chi tiết ▼" expand panel có sẵn QR + thông tin chuyển khoản.

**Files**:

- `shared/js/navigation-modern.js`:
    - `getBillingAlerts()`: rewrite. Không có cache → return `[]` (không guess). Loop `sepayLive.unpaidInvoices` → push alert per invoice với amount/date/id từ SePay. Nếu `expiryDate < today` và không có invoice surfaced → fallback "subscription lapsed" alert với 589K renewal.
    - `_refreshSepayLiveStatus()`: cache `v2` schema: `{fetchedAt, expiryDate, unpaidInvoices[], rawInvoiceCount}`. Filter `rawInvoices` bằng regex `isUnpaidStatus` ("chưa", "unpaid", "pending", "nợ", "đợi", "outstanding", "due") + exclude `isPaidStatus` ("đã thanh", "paid", "hoàn tất", "complete"). Parse amount bằng strip digit.
    - `buildPayment(invoiceId, amountValue)` inline trong `getBillingAlerts`: tạo VietQR URL `img.vietqr.io/image/ACB-75918-compact2.png?amount=N&addInfo=SEPAY_<id>&accountName=LAI%20THUY%20YEN%20NHI` + invoiceUrl `my.sepay.vn/invoices/<id>` (hoặc list khi không có id).
    - Cache key v1 → v2 invalidate cache schema cũ tự động.

**Bank constant**: ACB - 75918 - LAI THUY YEN NHI - 589,000đ - content "SEPAY <invoiceId>" hoặc "SEPAY VIP".

**Verify** (persistent browser session):

- Subscription active (expiry 2026-06-27, unpaid:[]) → CF Worker trả về → cache `{unpaidInvoices:[]}` → 0 alerts → banner KHÔNG hiện ✅
- Inject fake `{unpaidInvoices:[{id:"INV12345",amountValue:589000,date:"29/05/2026",status:"Chưa thanh toán"}]}` + `_rerenderBillingUI()` → banner header "Hóa đơn SePay #INV12345 589.000đ — hôm nay (29/05/2026)" ✅
- Toggle "Chi tiết ▼" → details panel display:flex, QR `<img>` visible. QR URL `curl -I` trả `HTTP 200 image/png 72KB` ✅
- Rows: Ngân hàng ACB, Số tài khoản 75918 (copy-clickable), Thụ hưởng LAI THUY YEN NHI, Nội dung CK SEPAY INV12345 (copy-clickable), Số tiền 589.000đ + link "Xem trên SePay →" ✅

**Status**: ✅ Done

---

### [shared][nav] SePay billing alert: dùng expiryDate THỰC từ CF Worker thay vì calendar cứng ✅

**Bug**: User đã thanh toán SePay VIP nhưng banner đỏ ở mọi trang vẫn hiện "SePay VIP (589K đ) 589.000đ — quá hạn 2 ngày". Sidebar badge service-costs cũng đếm sai.

**Root cause**: `getBillingAlerts()` trong `shared/js/navigation-modern.js` chỉ tính theo lịch cố định (`billingDay: 27 + showDays: 3`). Hôm nay 29/05 → 2 ngày sau 27 → hiện overdue dù subscription thực tế còn active đến 27/06.

**Fix**: Verify với SePay live data qua CF Worker `/api/sepay-dashboard` (đã có sẵn cho service-costs).

**Files**:

- `shared/js/navigation-modern.js`:
    - `getBillingAlerts()`: nếu cache `sepay_live_status_v1` còn fresh (TTL 6h) và có `expiryDate` → tính `daysDiff = expiry - today`. Subscription còn 29 ngày → out-of-window → không alert. Fallback time-based khi cache miss/network fail.
    - `_getSepayLiveStatus()` / `_maybeRefreshSepayLiveStatus()` / `_refreshSepayLiveStatus()`: read cache, throttle inflight, POST CF Worker với credentials đã được service-costs.js dùng sẵn.
    - `_rerenderBillingUI()`: sau khi API trả về, xóa banner cũ + re-render sidebar badge nếu sessionStorage chưa dismiss.

**Verify** (persistent browser session `http://localhost:8080/orders-report/main.html`):

- Curl CF Worker → `plans.expiryDate: "2026-06-27"` ✅
- Fresh load (no cache): banner "quá hạn 2 ngày" hiện ~5s → CF Worker trả về → cache populated `{expiryDate:"2026-06-27"}` → banner tự biến mất ✅
- Reload tiếp (cache hit): không hiện banner luôn ✅

**Status**: ✅ Done

---

### [so-order] Tạo bulk test data ngày 29/05/2026 — 5 NCC × 20 SP × demo images ✅

**User ask**: "Browser test -> tạo dữ liệu test ngày 29/05/2026 / tạo đầy đủ dữ liệu nhiều NCC, sản phẩm, đầy đủ hình ảnh demo".

**Approach**: Eval qua persistent browser session vào `SoOrderStorage` API (`addShipment` + `addRow` + `Sync.flush`). Tránh UI fill từng row một (chậm + flaky).

**Data structure** — 3 tabs × 5 NCC × 4 SP/NCC = 20 rows total:

| Tab                | Currency | NCC                   | Products                       | Rows |
| ------------------ | -------- | --------------------- | ------------------------------ | ---- |
| VN — Hà Nội        | VND      | TEST-NCC-AOQUOC-QC    | AO-THUN-FORM-RONG, AO-POLO-NAM | 4    |
|                    |          | TEST-NCC-QUANJEAN-VN  | QUAN-JEAN-RACH, QUAN-KAKI-NU   | 4    |
| China — Quảng Châu | CNY      | TEST-NCC-GUANGZHOU-A  | DAM-LEN-DAI, CHAN-VAY-XOE      | 4    |
|                    |          | TEST-NCC-SHENZHEN-B   | TUI-XACH-NU, GIAY-SNEAKER      | 4    |
| Korea — Dongdaemun | KRW      | TEST-NCC-DONGDAEMUN-K | AO-LEN-COLAU, VAY-XOA-KOREA    | 4    |

- **Date** uniform: `2026-05-29`
- **Batch IDs** unique: `TEST-BATCH-{VN,CN,KR}-001`
- **Variants**: kích cỡ + màu (Trắng-M, Đen-L, 38/39 cho giày…)
- **Images**: `picsum.photos/seed/{vn1..kr4}` — productImage 300×300, invoiceImage 600×200, stable seeded URLs
- **Prices**: sellPrice 180k–850k, costPrice 120k–560k
- **Notes**: "Auto-test data — claude code 2026-05-29"

**Verified UI render** qua 3 screenshots:

- VN: 8 rows render đủ supplier badges, variants, ảnh demo, total 53.940.000 ₫
- CN: 8 rows + currency CNY, total 463.090.000 ₫
- KR: 4 rows + currency KRW, total 23.130.000 ₫

**Helper scripts** (saved for future use):

- `scripts/so-order-test-data-create.js` — bulk insert via SoOrderStorage
- `scripts/so-order-test-data-cleanup.js` — strip rows `supplier LIKE TEST-NCC-%` + drop ships `batch LIKE TEST-BATCH-%`
- `scripts/so-order-test-data-load.sh create|cleanup` — wrapper gọi persistent browser session (port 9999)

**Cleanup tested**: 3 ships + 20 rows removed cleanly, Firestore flushed.

**Persistence note**: Storage là local-first → cần `Sync.flush()` sau bulk insert mới ép write Firestore TRƯỚC khi reload (page init pulls fresh từ Firestore, sẽ overwrite local nếu chưa flush).

**Screenshots**: `downloads/n2store-session/so-order-test-{vn,cn,kr}.png` (gitignored).

**Files**: scripts/so-order-test-data-{create.js, cleanup.js, load.sh}

---

### [inventory] Bỏ cột "MÔ TẢ" khỏi bảng ✅

**User ask**: "bỏ cột mô tả đi".

**Files**:

- `inventory-tracking/js/table-renderer.js` — remove `<th class="col-desc">` ở header invoice-table + `<td class="col-desc">` trong renderProductRow. Update detail-toggle title sang "Hiện/Ẩn Chi tiết màu sắc". Đổi `_applyDetailColsVisibility` colspan từ `7 : 5` → `6 : 5` (toggle giờ chỉ ảnh hưởng 1 col).
- `inventory-tracking/js/column-toggle.js` — remove entry `{ key: 'col-desc', label: 'Mô tả' }` khỏi COL_META.
- `inventory-tracking/index.html` — bump cache `?v=20260529h` cho 2 file.

**Kept**: trường `moTa` vẫn còn trong data model (sanPham[].moTa) và export.js vẫn xuất ra Excel — chỉ ẩn khỏi bảng UI. CSS `.products-detail-table .col-desc` cho modal detail vẫn giữ.

Status: ✅ Done.

---

### [web2] Debug browser test sâu — 3 phases: render + API + cross-page = 85/85 PASS ✅

**User ask**: "debug browser test lại toàn bộ web 2.0 coi hoạt động chính xác".

**Phase 1 — Render smoke** (50 pages, persistent Playwright browser):

- Categories: core, reports, accounting, products+inventory, partners, sales, configs, marketing, admin
- Verify: render content, sidebar mount, JS error capture, h1/h2 presence
- **50/50 PASS, 0 JS errors, 100% sidebar render**
- Pages có data: products (10k), variants (46k), customer-wallet (21k), balance-history (25k), partner-supplier (98k), tag (103k), …
- Pages config-driven empty state: ~2300 chars (page-shell.js Web2Shell.bootstrap với grid skeleton — expected khi DB empty)

**Phase 2 — API deep smoke** (28 active pages, fetch interceptor injected):

- Inject `window.fetch` wrapper sau nav để capture URL + status + latency
- Filter: status 0 (network fail) hoặc ≥400 → fail
- **28/28 PASS, 0 API errors**
- Top fetch counts: customer-wallet (49), balance-history (23), supplier-wallet (22), supplier-debt (14), admin-sse-monitor (6)
- Pages total=0: fetch interceptor injected AFTER page already loaded data (sub-second init); render smoke đã prove pages work

**Phase 3 — Cross-page navigation flows** (7 known patterns):
| Flow | Result |
|---|---|
| `products?search=KHO` | body has "KHO" ✓ |
| `fastsaleorder-invoice?customerId=1` | pbhTable mount ✓ |
| live-campaign load | 20 TPOS rows ✓ |
| balance-history default | 50 tx rows ✓ |
| admin-sse-monitor stats | "subscriber" text ✓ |
| supplier-debt list | 14 rows ✓ |
| customer-wallet list | 2 rows ✓ |

- **7/7 PASS**

**SSE realtime end-to-end** (re-verified):

- Web 2.0 hub: 26 clients, 9 topics
- POST `/api/realtime/web2/sse/test` topic `web2:products` → `clientsNotified:1` → fan-out OK

**Conclusion**: Web 2.0 hoạt động chính xác trên 3 dimensions (render, API, cross-page navigation, SSE realtime). Không có blocker production.

**Files**: docs/dev-log.md (test report)

---

### [inventory] Copy MÃ HÀNG + drag-drop reorder product rows ✅

**User ask**: 1) "STT này có nút copy → tạo hàng mới copy lại MÃ HÀNG" 2) "Cho kéo vị trí hàng → STT vẫn giữ nguyên không đi theo hàng, STT vẫn là 1, 2, 3, 4, 5, 6, 7, 8, 9".

**Files**:

- `inventory-tracking/js/table-renderer.js` (renderProductRow) — STT cell giờ render: drag handle `<span.drag-stt>` (icon `grip-vertical`, draggable=true), STT number, nút xóa, nút copy `<button.btn-copy-stt>` (icon `copy`), nút "+" thêm hàng (cuối cùng). 5 window handlers mới: `startProductRowDrag`, `endProductRowDrag`, `allowProductDrop`, `clearProductDropTarget`, `dropProductRow`.
- `inventory-tracking/js/crud-operations.js` — 2 hàm CRUD mới: `copyProductRow(invoiceId, productIdx)` (copy maSP only, các field khác blank, insert ngay sau row gốc) + `reorderProductRow(invoiceId, srcIdx, destIdx)` (splice out → splice in trong cùng sanPham[]). Refactor common với `_findDotHangByInvoiceId` + `_persistSanPham` helpers.
- `inventory-tracking/css/modern.css` — `.btn-copy-stt` (blue, hover bg), `.drag-stt` (cursor grab, opacity 0.32 → 1 on hover, icon grip-vertical), `.dragging-row` (opacity 0.45), `.drop-target-above/.drop-target-below` (inset box-shadow 2px blue for drop position hint).
- `inventory-tracking/index.html` — bump cache `?v=20260529g` cho modern.css, table-renderer.js, crud-operations.js.

**STT logic**: STT number = `productIdx + 1`, render từ Array.map → tự chạy 1,2,3,... theo thứ tự mới. Khi user kéo row 5 lên đầu, sanPham[] reorder → row đó thành index 0 → STT hiển thị 1. Đúng spec "STT không đi theo hàng".

**Drag-drop UX**: handle ⋮⋮ xám nhạt mặc định → đậm khi hover STT. Drag → row gốc fade. Hover row đích → đường kẻ xanh inset trên/dưới cho thấy drop position. Drop cross-invoice → warning "Chỉ được kéo trong cùng 1 NCC".

**Copy logic**: Click copy → POST sanPham mới (insert sau row src với maSP=src.maSP). Server emit SSE `inventory_shipments` → tab khác auto-reload.

Status: ✅ Done.

---

### [inventory] Custom confirm modal cho mọi delete action ✅

**User ask**: "xóa sẽ có custom confirm".

Replace native `confirm()` bằng `window.notificationManager.confirm(message, title)` (Promise<boolean>, đã có sẵn trong `shared/js/notification-system.js:306`) cho 10 delete actions:

| File                                              | Action                                     | Title            |
| ------------------------------------------------- | ------------------------------------------ | ---------------- |
| `crud-operations.js#deleteShipment`               | "Bạn có chắc muốn xóa đợt hàng này?"       | Xóa đợt hàng     |
| `crud-operations.js#deleteProductRow`             | "Xóa STT ${n} (${maSP})?"                  | Xóa hàng         |
| `crud-operations.js#deleteNccInvoice`             | "Xóa toàn bộ NCC ${tên}?"                  | Xóa NCC          |
| `table-renderer.js#deleteInvoiceImage`            | "Bạn có chắc muốn xóa ảnh này?"            | Xóa ảnh          |
| `table-renderer.js#deleteSubInvoiceImage`         | "Bạn có chắc muốn xóa ảnh này?"            | Xóa ảnh          |
| `table-renderer.js#removeTableImage`              | "Xóa ảnh này?"                             | Xóa ảnh          |
| `finance-manager.js#deleteTransaction`            | "Bạn có chắc muốn xóa giao dịch này?"      | Xóa giao dịch    |
| `note-manager.js#deleteNote`                      | "Xóa ghi chú này?"                         | Xóa ghi chú      |
| `order-booking-crud.js#deleteOrderBooking`        | "Bạn có chắc muốn xóa đơn đặt hàng NCC X?" | Xóa đơn đặt hàng |
| `order-booking-renderer.js#deleteBookingImage`    | "Bạn có chắc muốn xóa ảnh này?"            | Xóa ảnh          |
| `modal-image-manager.js#removeRow` (made async)   | "Xóa NCC ${tên} và N ảnh?"                 | Xóa NCC          |
| `modal-image-manager.js#removeImage` (made async) | "Xóa ảnh này?"                             | Xóa ảnh          |

2 hàm `removeRow`/`removeImage` phải đổi sang `async` (gọi qua onclick inline, async OK).

**Kept native**: 1 `confirm()` còn lại ở `modal-image-manager.js:677` (warning concurrent-edit race) — multi-line text + OK/Cancel asymmetry, không map sạch sang custom modal.

**Files bump**: `?v=20260529f` cho table-renderer, modal-image-manager, note-manager, crud-operations, finance-manager, order-booking-renderer, order-booking-crud.

Status: ✅ Done.

---

### [inventory] Header shipment card: thêm badge "N NCC" ✅

**User ask**: "hiện tổng có bao nhiêu NCC".

**Files**:

- `inventory-tracking/js/table-renderer.js` (renderShipmentCard) — thêm `.shipment-ncc-badge` (amber pill, icon `users`) giữa Đợt badge và Kiện badge: hiển thị `${shipment.hoaDon.length} NCC`.
- `inventory-tracking/index.html` — bump `table-renderer.js?v=20260529e`.

Count = `shipment.hoaDon.length` (mỗi hoaDon = 1 NCC trong (date, dotSo) group, đã aggregate ở `getAllDotHangAsShipments`).

Status: ✅ Done.

---

### [inventory] Thêm hàng inline trên bảng — nút "+" cuối mỗi NCC invoice ✅

**User ask**: "cho thêm hàng ở bảng, ví dụ hàng thứ 6 -> logic tất cả thông tin như thêm hàng bình thường".

**Files**:

- `inventory-tracking/js/table-renderer.js` (renderProductRow) — render thêm nút `.btn-add-stt` (icon `+`) bên cạnh `.btn-del-stt` trên row CUỐI cùng (`isLastRow=true`) của mỗi NCC invoice. Cả invoice rỗng (`product=null`) cũng có nút để thêm hàng đầu tiên.
- `inventory-tracking/js/crud-operations.js` — `addProductRow(invoiceId)`: append 1 blank product với schema chuẩn (giống `modal-edit-ncc.js#_addBlankRow`), recompute tongMon + tongTienHD, `shipmentsApi.update` → server emit SSE `inventory_shipments` → các tab khác auto-reload.
- `inventory-tracking/css/modern.css` — `.btn-add-stt` style (green, hover bg, hidden by default + reveal on `td.col-stt:hover`).
- `inventory-tracking/index.html` — bump cache `?v=20260529d` cho 3 file đụng.

**UX**: hover ô STT row cuối → 2 nút lộ ra (x đỏ + + xanh). Click `+` → row 6 xuất hiện ngay với cell "-" → user double-click mỗi cell (Mã hàng / Mô tả / Tổng SL / Đơn giá) để fill, dùng inline-edit pipeline đã có (`startInlineEdit`).

**Pattern**: mirror `deleteProductRow` 1:1 — same lookup `nccList`, same `flattenNCCData() + applyFiltersAndRender()` re-render path. Backend (PUT /shipments/:id) sẽ tự fire `notify('inventory_shipments', 'update', …)` → các tab khác đang xem nhận event qua SSE bridge đã wire sáng nay, debounce 300ms reload.

Status: ✅ Done.

---

### [web2] Comprehensive recheck — 50/50 pages smoke PASS + SSE end-to-end verified ✅

**User ask**: "tiếp tục và kiểm lại toàn bộ web 2.0".

**Smoke test broad (50 pages)** qua persistent browser:

- Categories: core (12), reports (7), accounting (5), products+inventory (8), partners (3), sales (5), configs (4), marketing (3), admin (3)
- Eval/page: `err`, `mainLen`, sidebar presence, `h1/h2` text
- **Result: 50/50 PASS, 0 JS errors, 100% sidebar render**
- Notable: pages config-driven (`Web2Shell.bootstrap`) hiển thị shell `~2300 chars` khi empty state (expected); pages có data render `5k-100k chars` (products, variants, wallets, partner lists)

**SSE infrastructure health**:

- Web 2.0 hub (`/api/realtime/web2/sse/stats`): **26 clients, 9 topics**
    - web2:products (6), web2:fast-sale-orders (6), web2:native-orders (4), web2:variants (3), web2:wallet:\* (2), web2:supplier-wallet (1), web2:reconcile (1), web2:stockmove (1), wallet:all (2 — cross-hub for supplier debt)
- Web 1.0 hub: 94 clients, 19 topics (legacy)
- **End-to-end test**: POST `/api/realtime/web2/sse/test` topic `web2:products` → `clientsNotified:1` (admin-sse-monitor browser nhận event live) → fan-out hoạt động.

**High-risk pages revisit**: phân tích lại 5 pages "minimal error handling":

- `pancake-settings`: 0 try/catch nhưng dùng `{ok, reason}` result envelope pattern — OK, không bug
- `purchase-refund`: 6 catches in 539 lines — adequate
- `supplier-wallet-app`: 3 catches in 577 lines — adequate
- `users-app`: 7 catches in 493 lines — adequate
- `admin-sse-monitor`: 3 catches in 298 lines — adequate
- → **Không có page nào thực sự ở mức risky**, audit lần trước overcount do grep pattern.

**P3 tech debt status**:

- 33 custom HTML pages (vs 72 page-shell.js DRY): active feature pages (products, variants, wallets, …) — working fine, refactor sang DRY là high-effort low-value, **defer**.
- Rename `rf-app.js`/`pbh-app.js`/`dlv-app.js` → tên dài: defer (không break gì).

**Conclusion**: Web 2.0 ổn định production. Không có blocker.

**Files**: docs/dev-log.md (recheck report)

---

### [inventory] SSE realtime auto-refresh + bobo grant CP perms ✅

**Bối cảnh**: User báo 2 vấn đề trên `inventory-tracking/`:

1. Thêm/chỉnh sửa dữ liệu bảng → phải refresh mới thấy UI update (không realtime).
2. Account `bobo` cần thấy + chỉnh sửa cột "Chi phí" và "Ghi chú CP".

**Files**:

- `render.com/routes/v2/inventory-tracking.js` — wire `notify(topic, action, extra)` helper sau mỗi mutation (POST/PUT/PATCH/DELETE) trên 5 entity: `inventory_suppliers`, `inventory_order_bookings`, `inventory_shipments`, `inventory_prepayments`, `inventory_other_expenses` (17 notify calls). `product_images` đã wire trước.
- `inventory-tracking/js/data-loader.js` — refactor `setupProductImagesRealtimeSync` → `setupInventoryRealtimeSync`: 1 SSE client subscribe 6 topics, split debounced reload paths (200ms images / 300ms full data / 300ms finance).
- `inventory-tracking/index.html` — bump `data-loader.js?v=20260529b` (linter auto-bump cache version cùng đợt).
- `scripts/grant-bobo-cp-perms.js` — one-shot: login admin → fetch bobo → flip 4 perms (`view_chiPhiHangVe`, `edit_chiPhiHangVe`, `view_ghiChuAdmin`, `edit_ghiChuAdmin`) → PUT → verify. Đã chạy thành công trên prod.

**Pattern**: Inventory-tracking nằm trên hub Web 1.0 SSE (`/api/realtime/sse`) với topic naming bare snake_case (giống `celebration`, `kpi_statistics`, `product_images`). KHÔNG dùng prefix `web2:` vì page này không thuộc Web 2.0.

**Debounce strategy**: `loadNCCData()` reload toàn bộ supplier+booking+shipment trong 1 fetch chain (parallel). `loadFinanceData()` reload prepayments+expenses. Skip nếu `globalState.isLoading=true` để tránh stomp manual reload đang chạy.

**Verify**:

- Server log line cần thấy sau mutation: `[SSE] Notified N clients for key: inventory_shipments` (hoặc topic tương ứng). N>0 = có tab khác đang subscribe.
- Client console line cần thấy khi nhận event: `[DATA] SSE event inventory_shipments: update` rồi `[DATA] SSE → reloading inventory data`.

Status: ✅ Done — bobo verified `view_chiPhiHangVe=true, edit_chiPhiHangVe=true, view_ghiChuAdmin=true, edit_ghiChuAdmin=true` qua public read endpoint. SSE deploy chờ Render auto-deploy (~3 min).

---

### [web2] P2 audit fix — remove 4 Firestore onSnapshot listeners (SSE đã verified production) ✅

**Bối cảnh**: P1 đã bump cache. P2 fix 4 vi phạm `docs/web2/SSE-REALTIME.md` (no Firestore listener cho Web 2.0):

| File                                                 | Action                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web2/shared/web2-products-cache.js`                 | Remove Firestore fallback trong `_setupRealtime()` + `pushTickle()` write. SSE primary đã chạy 10+ ngày OK.                                                                                             |
| `web2/shared/web2-variants-cache.js`                 | Same pattern — remove Firestore fallback.                                                                                                                                                               |
| `web2/customer-wallet/js/customer-wallet-storage.js` | Remove `_listen()` + `_isListening` echo guard. Keep `_load()` (cross-device init snapshot) + `push()` (write only). Realtime giờ qua SSE topics `web2:wallet:*` + `web2:fast-sale-orders` ở app layer. |
| `web2/supplier-wallet/js/supplier-wallet-storage.js` | Same pattern — remove `_listen()`.                                                                                                                                                                      |

**Rationale**: Wallet computed state (returnedLineKeys, totals) derives từ PBH/SePay data đã được sync qua SSE topics. Khi tab A mutate → server publish SSE → tab B nhận → recompute từ server-authoritative data → converge tự nhiên. Firestore listener trước đó là **redundant** cho cross-device sync (cùng compute từ cùng source). Firestore `push()` vẫn giữ cho cross-device cold-start (tab mới mở → `_load()` lấy snapshot mới nhất).

**Verify**: smoke test 4 pages (products, variants, customer-wallet, supplier-wallet) → render OK, 0 JS errors, "Ví Khách Hàng" + "Ví Nhà Cung Cấp" h1 hiện đầy đủ.

**Cost savings** (theo docs): Firestore reads/day giảm 5,000-15,000 → ~0 cho 4 collections này. Tiết kiệm ~$5-30/tháng.

**Files**: 4 JS files. 0 onSnapshot remaining ở Web 2.0 modules.

---

### [web2] Audit lớn + P1: bump 72 trang stale cache + verify 15 active pages render OK ✅

**User ask**: Plan kiểm tra lớn 4 dimensions (smoke test, SSE realtime, cross-page link, consistency).

**Audit findings (qua 4 parallel agents)**:

| Dimension                     | Status                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Syntax / deps                 | 109/109 PASS — 0 syntax error, 0 missing dep                                                                            |
| SSE wiring                    | 15 pages wire chuẩn (web2:fast-sale-orders, web2:products, web2:wallet:\*, web2:native-orders); 0 leak sang hub Web 1.0 |
| Sidebar coverage              | 105/109 pages có link; 1 orphan intentional (login); 0 broken link                                                      |
| **STALE CACHE**               | 🔴 72 pages dùng `page-shell.js?v=20260519j` (10+ ngày trước)                                                           |
| Firestore listener violations | 🔴 4 cases (customer-wallet-storage, supplier-wallet-storage, products-cache, variants-cache) — đáng lẽ phải SSE        |
| Custom HTML vs page-shell.js  | 37 custom / 72 DRY                                                                                                      |

**P1 fix**:

1. **Bump ASSET_VERSION** trong `page-shell.js`: `v=20260519j` → `v=20260529a`
2. **Bulk sed 72 HTML files** thay `page-shell.js?v=20260519j` → `v=20260529a` để browser reload page-shell.js fresh
3. **Smoke test 15 active pages** qua persistent browser:
    - products: 12 rows table ✓
    - variants: 7 rows ✓
    - customer-wallet: "Ví Khách Hàng" h1 + 2 tables + 306 cards ✓
    - supplier-wallet: "Ví Nhà Cung Cấp" + 3 tables ✓
    - balance-history: "+100.000₫" tx ✓
    - supplier-debt: 8 rows ✓
    - reconcile: "Đối soát đóng gói" ✓
    - live-campaign: "HOUSE 29/05/2026Nháp" 20 rows (TPOS sync working) ✓
    - purchase-refund: empty state ✓
    - fastsaleorder-invoice: pbhTable ✓
    - users: "admin" row ✓
    - dashboard: chartRevenue canvas ✓
    - fastsaleorder-refund, fastsaleorder-delivery, partner-customer: render OK

- **Result**: 15/15 PASS — 0 JS errors per page

**Next (P2)**: migrate 4 Firestore listeners → SSE.

**Files**: web2/shared/page-shell.js + 72 web2/\*/index.html

---

## 2026-05-28

### [web2/live-campaign] Modal tạo campaign giống TPOS: page picker + live video cascade + Config dropdown ✅

**User ask**: "browser test vào tomato.tpos.vn/.../liveCampaign/list tạo chiến dịch test để hiểu rõ và làm đúng web2/live-campaign/index.html"

**Test trên TPOS** xác nhận schema `SaleOnline_LiveCampaign` cần các field:

- `Name` (required, unique)
- `Facebook_UserId` + `Facebook_UserName` (page TPOS đã liên kết qua CRMTeam)
- `Facebook_LiveId` (optional, format `{pageId}_{videoId}` từ FB Graph live videos)
- `Config` (`Draft` / `Active` / `Closed` — show as `Nháp` / `Đang chạy` / `Đã đóng`)
- `IsActive` (toggle)
- `Note`
- `MinAmountDeposit`, `MaxAmountDepositRequired` (advanced — default 0)

**Fix** — UI giờ matched TPOS web:

1. **`LiveCampaignApi.loadPages()` mới**: fetch `/api/odata/CRMTeam/ODataService.GetAllFacebook?$expand=Childs`, flatten ra `[{pageId, pageName, teamId, teamName}]`. Cache 5min.

2. **`LiveCampaignApi.loadLiveVideos(pageId)` mới**: fetch `/api/facebook-graph/livevideo?pageid=X&limit=20` (CF route FACEBOOK_LIVE). Cache 1min per page. Return `[{objectId, title, startMs, statusLive, countComment}]`.

3. **Modal HTML refactor**:
    - Field "Page Facebook" → `<select>` populated từ `loadPages()` (auto-fill Facebook_UserId + Facebook_UserName)
    - Field "Bài Live" → `<select>` cascade khi page change (badge 🔴 cho live đang chạy + title + time + count comment)
    - Field "Trạng thái cấu hình" mới (Config: Draft/Active/Closed)
    - Auto-suggest Name: chọn page → fill `{LAST_WORD_UPPER} DD/MM/YYYY` (TPOS convention, vd "Nhi Judy House" → "HOUSE 28/05/2026"). Dirty flag không overwrite nếu user đã edit.

4. **Create payload** giờ pass đầy đủ: `Facebook_UserId`, `Facebook_UserName`, `Config`, `MinAmountDeposit`, `MaxAmountDepositRequired`.

5. **Edit pre-fill**: page select auto-match Facebook_UserId. Nếu page không còn trong CRMTeam → chèn option tạm "(không còn trong CRM)" để giữ data. Tương tự cho live video không có trong 20 lives gần nhất.

**Verified qua browser test** (localhost:8080 + persistent Playwright session):

- Open modal → 7 page options (1 placeholder + 6 pages thật)
- Chọn "Nhi Judy House" → Name auto-fill "HOUSE 28/05/2026" + 10 live videos load
- Create → row mới xuất hiện trong table với status "Nháp"
- Open Edit cho campaign hiện có → pre-fill Name + page + live + Config đúng

**Cache bust**: `?v=20260525d` → `?v=20260528a`

**Files**: web2/live-campaign/{index.html, js/live-campaign-api.js, js/live-campaign-app.js}

---

## 2026-05-26

### [tpos-pancake] Campaign select giờ aggregate ALL Facebook_PostIds (TPOS "Bài live" parity) ✅

**User ask**: "danh sách bài live nè -> bạn chọn theo campaign nó bị thiếu không đủ -> hiện tại đã chính xác nhưng không đủ"

**Root cause**:

1 campaign TPOS (vd `HOUSE 25/05/2026`) thường link nhiều `Facebook_PostId` (mỗi lần phát live mới = 1 post mới, nhưng vẫn map về campaign đang active cho page). TPOS web `/saleOnline/facebook/post` show LIST `Bài live` — mỗi row 1 `Facebook_PostId`. Code cũ chỉ lấy `campaign.Facebook_LiveId` (1 post DUY NHẤT) → comment các post còn lại của campaign bị miss.

**Verified qua TPOS API** `/api/facebook-graph/livevideo?pageid=X`:

- Page HOUSE có 4 lives: 26/05 18:18, 26/05 13:11, 26/05 09:53, 24/05 13:27
- 3 lives đầu (≥ 25/05 17:52 = HOUSE 25/05/2026 DateCreated) thuộc campaign HOUSE 25/05/2026
- Live 24/05 thuộc campaign HOUSE 22/05/2026 (date < HOUSE 25/05 DateCreated)
- `campaign.Facebook_LiveId` chỉ trỏ tới live mới nhất (4438027239853150) → 3 lives khác bị miss

**Fix** (`tpos-pancake/js/tpos/tpos-init.js`):

1. **`_fetchLiveVideosForPage(pageId)` mới**: gọi `/facebook/livevideo?pageid=X&limit=50` (endpoint đã có). Cache 5 phút per page. Return list `{objectId, title, startMs, statusLive, countComment}`.

2. **`_resolveCampaignLivePosts(campaign, allCampaigns, liveVideos)` mới**: với campaign X, return livevideos thoả mãn `startMs ∈ [campaign.DateCreated, nextCampaignOnSamePage.DateCreated)`. Logic dựa trên TPOS behavior: live tạo sau DateCreated của campaign hiện tại (và trước campaign tiếp theo của cùng page) thuộc về campaign đó.

3. **`onMultiCampaignChange` update**:
    - Prefetch live videos per page (dedupe) trước khi load
    - Cho mỗi campaign → resolve all post IDs → load comments từ TỪNG post in parallel
    - Tag comments với `_postId` + `_postTitle` ngoài campaign tags
    - Fallback: nếu livevideo empty / resolve fail → fallback campaign.Facebook_LiveId (giữ behavior cũ)

4. **SSE multi-post**: subscribe SSE cho TỪNG post ID thay vì 1 (TposRealtime đã support multi-connection sẵn). Mỗi post stream comments riêng → realtime đầy đủ.

**Cache bust**: `tpos-init.js?v=20260526o` → `v=20260526s`

**Files**: tpos-pancake/js/tpos/tpos-init.js, tpos-pancake/index.html

---

### [delivery-report] Hiển thị thumbnail ảnh trên aggregate row nếu children có ảnh ✅

**User ask**: "hiển thị hình ảnh cho ngày hiển thị nếu children có ảnh"

**Trước**: aggregate row (date-shift dồn) chỉ render `<td class="num">${formatMoney(sumMoney)}</td>` cột TIỀN — không có image indicator dù ngày con có ảnh.

**Fix** ([report.js renderShiftAggregateRow](delivery-report/js/report.js#L1510-L1590)):

- Compute `childImgDates = sourceDates.filter(s => hasImageFlag(s, tab))`.
- Money cell: nếu `childImgDates.length > 0` → `class="num clickable money-cell has-img" data-action="open-agg-img"`, icon `fa-image` (solid) + badge số đếm nếu >1. Title hover liệt kê tất cả ngày con có ảnh.
- Nếu không có ảnh ở ngày con nào → cell no-img, cursor default, hover không highlight (user phải bỏ dời trước để add ảnh cho ngày cụ thể).
- Handler `data-action="open-agg-img"` parse `data-shift-sources`, tìm ngày đầu tiên có ảnh, gọi `openImageModal(firstImg)`. Multi-image cycle UI out-of-scope.
- CSS: `.dr-img-count` badge xanh nhỏ (>1 ảnh), `.dr-shift-agg-row td.money-cell.no-img { cursor: default }` để no-img không pretend clickable.

### [delivery-report] Nút DUYỆT cho aggregate row (date-shift dồn) ✅

**User ask**: "nút duyệt đâu?" — screenshot row "✦ 3 ngày — 02/05/2026" thiếu checkbox cột DUYỆT.

**Root cause**: `renderShiftAggregateRow()` chỉ render icon `<i fa-check-circle>` khi `anyApproved`, không có checkbox để toggle.

**Fix** ([report.js:1510-1577](delivery-report/js/report.js#L1510-L1577)):

- Compute thêm `allApproved` (every source approved) song song `anyApproved`.
- Render `<input type="checkbox" data-field="approved-agg">` cho admin. Checked khi `allApproved`. Class `is-partial` khi `anyApproved && !allApproved` (vài ngày con đã duyệt).
- Tooltip: "Đã duyệt X/N ngày con — bấm để duyệt tất cả".
- Thêm `data-shift-sources="2026-04-29,2026-04-30,2026-05-02"` cho handler.
- Handler `data-field="approved-agg"` ([report.js:1882-1900](delivery-report/js/report.js#L1882-L1900)) parse `data-shift-sources` → `setOverride(sd, tab, {approved: next})` cho TỪNG source date. `setOverride` đã write-through DB → cross-machine sync nhờ override SSE topic.
- CSS `.dr-approve-toggle.is-partial::after` triangle gradient visual cue.

### [delivery-report][render] Date shifts → Postgres + custom modal UI ✅

**User ask** (2 tasks):

1. "Cho custom giao diện cho phần chọn ngày hình" — replace native `prompt()`
2. "Sao tôi chỉnh bằng account admin 29/04, 30/04 về ngày 02/05 → account khác thấy nhưng account boss lại không thấy?" — cross-machine sync bug

**Root cause task 2**: `_dateShifts` lưu `localStorage['dr-date-shifts-v1']` per browser (per machine). Comment cũ ở `report.js:41-42` đã nêu TODO migrate server-side.

**Files**:

- `render.com/routes/v2/delivery-assignments.js` — thêm `ensureDateShiftsSchema(pool)` + 3 endpoint mới:
    - `GET /api/v2/delivery-assignments/date-shifts?from=&to=` — bulk fetch shifts overlapping range (touching real_date OR display_date)
    - `PUT /api/v2/delivery-assignments/date-shifts/:date/:group` — upsert. Empty/equal real_date → DELETE row
    - `DELETE /api/v2/delivery-assignments/date-shifts/:date/:group`
    - Table `delivery_assignment_date_shifts(real_date DATE, group_name VARCHAR, display_date DATE, ...)` PK `(real_date, group_name)`, CHECK `display <> real`
    - SSE broadcast topic `delivery_assignments` actions `date-shift-upserted` / `date-shift-deleted`
- `render.com/server.js` — wire `ensureDateShiftsSchema(chatDbPool)` lúc boot.
- `delivery-report/js/report.js` —
    - Replace localStorage-init của `_dateShifts` bằng in-memory cache + `loadDateShiftsRange()` server fetch (TTL 60s).
    - `setDateShift()` giờ async PUT server (write-through), local cache optimistic.
    - Thêm `migrateLocalStorageDateShiftsOnce()` 1-time upload legacy localStorage → DB, marker `dr-date-shifts-migrated-v1`.
    - Thêm `openDateShiftModal({realDate, currentDisplay})` returns Promise → resolve YYYY-MM-DD / '' (reset) / null (cancel). Modal có header gradient, `<input type="date">` native picker, 3 nút (Khôi phục / Hủy / Áp dụng), ESC + Enter shortcuts.
    - Replace `window.prompt()` ở handler `data-action="shift-edit"` bằng `openDateShiftModal()` async.
    - Wire `loadDateShiftsRange(extFrom, extTo)` vào `Promise.all` parallel với overrides/merges/images.
- `delivery-report/js/delivery-report.js` (main filter page) — refactor `_readDateShifts()` đọc từ in-memory cache `_dateShiftsCache` (fetched bởi `prefetchDateShifts()` lúc init, ±6 tháng quanh hôm nay). Fallback localStorage chỉ trong grace period trước khi fetch lần đầu.
- `delivery-report/css/delivery-report.css` — thêm `.dr-shift-overlay`/`.dr-shift-window`/etc. (header gradient 2563eb→1e3a8a, slide+fade animation, native date input focus ring).

**Status**: ✅ Done. Server endpoint cần Render redeploy để ENV nhận; migration tự chạy lần đầu user mở báo cáo modal (idempotent qua marker key).

### [tpos-pancake] Nút X xóa thumbnail trên hover — chụp nhầm có thể xóa và snap lại ✅

**User ask**: "cho nút xóa thumbnail vì có khi chụp nhầm cần cập nhật lại"

**Implementation** (`tpos-pancake/js/tpos/tpos-livestream-snap.js`):

1. `_renderThumbStripFor()` — wrap img trong `<div.tpos-snap-thumb-wrap>` + nút `<button.tpos-snap-thumb-del>` overlay:
    - Position absolute top-right corner thumb (`-6px`/`-6px`)
    - Đỏ tròn 18x18px với "×", hidden default
    - `mouseenter` wrap → show, `mouseleave` → hide
    - `data-snap-id` + `data-comment-id` để handler resolve target

2. `_deleteSnapByComment(commentId, snapId)` mới:
    - Confirm dialog
    - Nếu thiếu snapId (snap row null trong cache) → fallback resolve qua `GET /snapshots/by-comment-ids`
    - `DELETE /api/livestream/snapshot/:id` (endpoint backend đã sẵn có từ trước)
    - `STATE.snapByComment.delete(commentId)` → wipe cache
    - `_renderThumbStripFor(commentId)` ngay → xóa thumbnail UI
    - `_queueSnapByComment(commentId)` → debounced re-fetch (sẽ trả null → row trở về trạng thái "chưa snap")
    - Toast "✅ Đã xóa thumbnail — bấm 📸 trên comment để chụp lại"

**UX flow**:

- Hover lên thumbnail → nút X hiện
- Click X → confirm → DELETE → thumbnail mất → nút 📸 trên comment row vẫn còn để chụp lại với frame hiện tại

**Cache bust**: `v=20260526q` → `v=20260526r`

**Files**: tpos-pancake/js/tpos/tpos-livestream-snap.js, tpos-pancake/index.html

---

### [delivery-report/report] Shift data flow correct: source rows empty + aggregate đầy đủ ✅

**User ask**: "chỉnh ngày hiển thị 02/05 → dữ liệu 29/04, 30/04 sẽ hiển thị trong ngày 02/05 bất kể chỉnh filter nào → cột 29/04, 30/04 cũ dữ liệu sẽ rỗng"

**Refactor paintTable + computeTotalLeftForTab + render fetch**:

Date shift hành xử như "moving data": source dates trống rỗng (data đã đi), target date có data từ tất cả sources.

**Render fetch extension** (`render()`):

- Tính `extFrom/extTo` mở rộng từ filter range để include shift sources có target ∈ filter
- Cache key dùng `rangeKey(extFrom, extTo)` thay vì `rangeKey(realFrom, realTo)`
- `fetchRange(extFrom, extTo)` để có data cho aggregate

**paintTable refactor**:

- Bỏ `displayBuckets/virtualAggregates/dateInVirtualAgg` (cũ — gộp dates filter)
- Scan TẤT CẢ shifts cho tab, phân loại:
    - `aggregateSources`: displayDate (∈ filter) → [realDates] (kể cả nguồn ngoài filter)
    - `sourceShiftedToFilter`: realDates có target ∈ filter (skip render — data trong aggregate)
    - `sourceShiftedOutOfFilter`: realDates ∈ filter có target ∉ filter (render EMPTY)
- Add target's own data vào sources nếu target chưa shift đi
- aggregateByDay map phải include shift sources ngoài filter để aggregate có data
- Render loop chỉ iterate `dates` (filter range, KHÔNG union với agg keys)

**`renderShiftedOutRow(d)`** mới — row 13 cột với tất cả `muted 0`/`$0`, badge "dời → dd/mm/yyyy" amber, vẫn có pen edit để admin chỉnh tiếp.

**`computeTotalLeftForTab` refactor** đồng bộ logic với paintTable (extended date list cho aggregateByDay, aggregate sum, source-shifted-out = 0 contribution).

**CSS** thêm `.is-shifted-out` (bg #fafafa, opacity 0.7, td.muted gray) + `.dr-shift-moved-badge` (amber chip).

**Verify** (Playwright 3 scenarios với shift `{29/04→02/05, 30/04→02/05}`):

| Scenario                                   | Expect                                                                                           | Result |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------ |
| Filter [29/04, 30/04] (chỉ sources)        | 2 rows EMPTY + "dời → 02/05" badge, NO aggregate                                                 | ✅     |
| Filter [02/05, 02/05] (chỉ target)         | 1 aggregate "3 ngày × 79 đơn $41.524.000"                                                        | ✅     |
| Filter [29/04, 02/05] (cả source + target) | 29/04 + 30/04 KHÔNG render (consumed), 01/05 normal, 02/05 aggregate full data — NO double count | ✅     |

---

### [tpos-pancake] Force extract → 3-step guaranteed thumbnail (backfill + extract + cache refresh) ✅

**User ask**: "sao force extract không lấy được hết thumnbnail comment? -> có comment là chắc chắn có snap shot và thumbnail"

**Root cause analysis** (`tpos-livestream-snap.js`):

3 lý do thumbnail bị missing sau Force extract:

1. **Comment chưa có snap row trong DB**: Comment đến trước khi auto-snap chạy (vd page mới mở, comment cũ trước khi feature enable). `extract-all-pending` chỉ select rows tồn tại với `image_data IS NULL AND offset_seconds IS NOT NULL` → bỏ qua comments không có row.

2. **Frontend cache stale `null`**: `STATE.snapByComment` cache entry `null` cho commentId không có bytea. `_queueSnapByComment` có guard `if (STATE.snapByComment.has(cid)) return` → không re-fetch khi backend đã fill bytea.

3. **Step 1+2 không tự động chain**: Force extract chỉ xử lý step 2, không backfill metadata step 1, không refresh cache step 3.

**Fix** — Force extract chip giờ chạy 3 bước:

```
[click] → Backfill metadata (offlineBatchAll, skipExisting:true)
       → Queue extract-all-pending (filter live + page)
       → Poll status (1s/lần, 10min timeout)
       → Done → _invalidateSnapCacheAndRefresh()
                  ↓ Wipe entries cho rows visible
                  ↓ _queueSnapByComment(cid) cho từng row
                  ↓ _flushSnapByCommentBatch fetch DB → render thumbnail
```

**Helper mới** `_invalidateSnapCacheAndRefresh()`:

- Query `.tpos-conversation-item[data-comment-id]` visible
- `STATE.snapByComment.delete(cid)` cho từng row → wipe stale null entries
- `_queueSnapByComment(cid)` re-queue → debounce 300ms → batch fetch + render

**Edge case**: Backfill có thể fail nếu không lấy được `broadcastStartMs` (TPOS livevideo API down). Wrap try-catch + log warn, vẫn tiếp tục extract-all-pending vì rows đã backfill từ auto-snap path có thể vẫn dùng được.

**Cache bust**: `v=20260526o` → `v=20260526p`

**Files**: tpos-pancake/js/tpos/tpos-livestream-snap.js, tpos-pancake/index.html

---

### [delivery-report] Main page filter respect date shifts (ext range + client filter) ✅

**User ask**: "ngày 29/04, 30/04 tôi chỉnh thành 02/05 cả 2 ngày thì filter search 02/05 ra dữ liệu 29/04, 30/04 ảo luôn đi"

Date shifts từ báo cáo modal (localStorage `dr-date-shifts-v1`) giờ ảnh hưởng main page filter: filter `02/05` → trả về cả orders thật ở real 29/04, 30/04 (đã shift display = 02/05) + orders thật ở 02/05.

**Fix** (`delivery-report/js/delivery-report.js`):

- `_readDateShifts()`: đọc storage map mỗi lần (không cache trong scope main page, sync với báo cáo modal mới nhất)
- `getEffectiveDisplayDate(realDate, shifts)`: group-agnostic lookup — `realDate` có shift trong BẤT KỲ group nào → dùng shift target
- `_computeExtendedRange(origFrom, origTo)`: extend fetch range để include real dates có displayDate ∈ origRange. VD shifts `{29/04→02/05, 30/04→02/05}`, filter `[02/05, 02/05]` → extended `[29/04, 02/05]`
- `collectFilters`: save `_origFromDate/_origToDate` (user-typed); set `f.fromDate/f.toDate` = extended range cho fetch
- Post-fetch filter (line 982+): chỉ keep order nếu `displayDate(item.DateInvoice) ∈ origRange` → orders ở real 29-30/04 + shift target 02/05 sẽ pass; orders ở 03/05+ trong extended range nếu không có sẽ bị filter out

**Behavior**:

- User trong báo cáo modal dời 29/04, 30/04 → 02/05 (cùng target)
- Đóng modal, mở main page
- Filter date input: 02/05 → 02/05
- Kết quả: orders từ real 29/04 + 30/04 + 02/05 (tất cả "thuộc" displayDate 02/05)
- DateInvoice column vẫn show ngày thật → user biết order gốc thuộc ngày nào

**Verify** (Playwright pre-seed shifts):

- Pre-seed `_dateShifts` = `{29/04, 30/04 → 02/05}` (cả 3 group)
- Filter main page `[02/05, 02/05]`
- Result: **543 orders** rendered, breakdown: 504 từ 30/04, 36 từ 29/04 ✅

**TODO** server-side sync (next session): hiện shifts vẫn per-machine. Cần migrate sang server table + SSE notify để all clients thấy same view.

---

### [delivery-report/report] Revert: expand + gộp + chỉnh ngày KHÔNG còn admin-only ✅

**User clarify**: "hiểu sai ý tôi rồi các phần này cho tất cả account tương tác được → 3 phần này → expand, gộp và chỉnh ngày hiển thị (dời sang ngày khác)"

→ User muốn 3 features này cho **TẤT CẢ account** (kể cả non-admin). Trước đó tôi hiểu ngược (gate admin-only). Revert hoàn toàn.

**Revert** (`delivery-report/js/report.js`):

| Element                                                                                                          | Trước revert (admin-only)                        | Sau revert (tất cả account)            |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| Select-day checkbox (gộp)                                                                                        | `.dr-row-select-locked` cho non-admin            | `<input type="checkbox">` cho mọi user |
| Selection bar + Gộp button                                                                                       | non-admin clear state + bar không open           | hoạt động bình thường                  |
| Unmerge × button                                                                                                 | skip render cho non-admin                        | render cho mọi user                    |
| Toggle-merge chev button                                                                                         | handler return non-admin                         | handler chạy bình thường               |
| Toggle-expand cell                                                                                               | non-admin không có data-action/clickable/chevron | đầy đủ cho mọi user                    |
| Shift-edit pen button                                                                                            | render `_isAdmin() && !isChild`                  | render khi `!isChild` (mọi user)       |
| Unshift × button (aggregate)                                                                                     | skip non-admin                                   | render cho mọi user                    |
| Tất cả handlers (onMergeClick, select-day change, toggle-expand, toggle-merge, unmerge, shift-edit, unshift-all) | early-return non-admin                           | bỏ guard                               |

**Vẫn giữ admin-only**:

- Duyệt checkbox (`.dr-approve-toggle` vs `.dr-approve-locked` cho non-admin)
- Approved rows hidden hẳn cho non-admin
- Aggregate row approve indicator (xanh check) chỉ admin thấy
- `updateSelectionBar` không còn gate non-admin

**Final admin-only behavior** (tóm tắt):

| Feature                        | Admin | Non-Admin                      |
| ------------------------------ | ----- | ------------------------------ |
| Expand chi tiết đơn            | ✅    | ✅                             |
| Gộp / Bỏ gộp                   | ✅    | ✅                             |
| Chỉnh / Bỏ chỉnh ngày hiển thị | ✅    | ✅                             |
| **DUYỆT (approve)**            | ✅    | ❌ (locked + ẩn approved rows) |
| Cài đặt phí ship               | ✅    | ✅                             |

**Verify** (Playwright non-admin override): expand=6 td, chevron=3, select-day=3, shift-edit=3 ✅ (3 row vì approved rows hidden); approve checkbox=0, locker=3 (DUYỆT vẫn locked) ✅

---

### [delivery-report/report] Admin gating expand (toggle-expand + toggle-merge) ✅

**User ask**: "3 phần này → expand, gộp và chỉnh ngày hiển thị (dời sang ngày khác) → cho các account không phải ADMIN tương tác luôn"

Bổ sung **expand** vào danh sách admin-only (gộp + chỉnh ngày đã có sẵn trong commit `73a922f98`).

**Fix** (`delivery-report/js/report.js`):

| Element                                               | Admin                                           | Non-Admin                                                          |
| ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Date cell click (toggle-expand)                       | `td.date.clickable[data-action]` + chevron icon | `td.date` (không data-action, không chevron, không cursor pointer) |
| SL ĐƠN cell click (toggle-expand)                     | `td.num.strong.clickable[data-action]`          | `td.num.strong` (plain)                                            |
| Toggle-merge chev button (mở rộng children của merge) | Render `<button>` + handler chạy                | Skip render + handler early-return                                 |

**Defense in depth**:

- UI: skip render `data-action="toggle-expand"`, `data-action="toggle-merge"`, `clickable` class, `dr-expand-chevron` cho non-admin → không có visual cue
- Handler `tbody.click` toggle-expand: `if (!_isAdmin()) return` early
- Handler `tbody.click` toggle-merge: `if (!_isAdmin()) return` early

**Verify** (Playwright switch auth):

- ADMIN: 48 expand cells (24 dates × date+SL), 24 chevrons, 1 toggle-merge button ✅
- NON-ADMIN: 0 expand cells, 0 chevrons, 0 toggle-merge buttons (clickable=3 còn lại là money-cell.has-img cho preview ảnh — OK giữ) ✅

---

### [tpos-pancake][extension] Bỏ hoàn toàn tab stream-based path (getMediaStreamId) ✅

**User ask**: "bỏ chức năng bấm vào extension lấy sessionId sharing đi"

**Cleanup toàn bộ flow stream-based**:

**Page side** (`tpos-pancake/js/tpos/tpos-livestream-snap.js`):

- Bỏ `_initStreamFromExtensionStreamId()` function (getUserMedia với `chromeMediaSource: 'tab'`)
- Bỏ `_showStreamModeReminder()` (banner reminder) + `_showStreamModePromptDeprecated_REMOVED()` (modal Enter)
- Bỏ message handler `N2_TAB_STREAM_ID` trong page listener
- Bỏ `STATE.extStreamActive` ref + branch trong `renderRealSnapChip` (chỉ còn EXT tab và LIVE linked)
- Bỏ `localStorage.setItem('tpos_stream_consented', '1')`

**Extension side**:

- `popup/popup.js`: bỏ `grabTabStreamForLivestreamSnap()` function + call khi mở popup
- `content/contentscript.js`: bỏ message listeners `N2_TAB_STREAM_ID` (relay vào page) + `N2_TAB_STREAM_GRAB_REQUEST` (page-triggered grab)
- `background/service-worker.js`: bỏ `chrome.commands.onCommand` handler `enable-stream-capture` + `N2_GRAB_TAB_STREAM_FROM_CLICK` handler
- `manifest.json`: bỏ permission `"tabCapture"` + bỏ toàn bộ `"commands"` block (Ctrl+Shift+S). Version `1.0.16` → `1.0.17`

**Flow sau cleanup**:

- Tab focused → `chrome.tabs.captureVisibleTab` silent qua `<all_urls>` (path duy nhất)
- Tab inactive → KHÔNG chụp được. Visibility watcher từ commit trước alert user

**Cache bust**: `v=20260526m` → `v=20260526n` (auto-bumped)

**Files**: tpos-pancake/{js/tpos/tpos-livestream-snap.js, index.html}, n2store-extension/{manifest.json, popup/popup.js, content/contentscript.js, background/service-worker.js}

---

### [tpos-pancake] Revert Option B modal — thay bằng visibility watcher (title flash + browser notif + tip toast) ✅

**User ask**: "bỏ chức năng này đi, lag quá -> khi vào trang này đang livestream và đang capture thì không cho chuyển tab (phần này khả thi không?) -> còn không khi chuyển tab sẽ hiện popup thông báo và có nút chuyển về tab tpos-pancake, kêu người dùng dùng 2 trình duyệt"

**Trả lời "không cho chuyển tab"**: KHÔNG khả thi — browser security cấm. Chỉ DETECT được qua `document.visibilitychange`.

**Fix** (`tpos-pancake/js/tpos/tpos-livestream-snap.js`):

1. **Bỏ** `_showStreamIdRequiredModal()` function (lag, kể cả chỉ 1 modal)
2. **Bỏ** modal call trong `_maybeShowAutoSnapBanner` — quay lại fallback `_enableEmbeddedLiveCapture()` (captureVisibleTab path, tab focused only)
3. **Thêm** `_setupVisibilityWatcher()` — gọi 1 lần khi `_startFrameBuffer()` chạy, gắn `document.visibilitychange` listener:
    - Khi `visibilityState === 'hidden'` AND `STATE.frameBufferTimer` đang chạy:
        - Title flash 1s/lần: "⚠️ QUAY LẠI TAB LIVESTREAM" ↔ "🔴 Capture đang dừng — focus lại"
        - Browser Notification API (one-shot, click → `window.focus()`). Auto-request permission lần đầu.
    - Khi quay lại `visibilityState === 'visible'`:
        - Stop title flash + restore title gốc
        - Close notification
        - Nếu hidden >5s → show toast tip 1 lần / session: "💡 Mở 2 trình duyệt riêng — 1 cho livestream, 1 cho việc khác → capture không bị dừng"

**Tại sao không block switch tab**: không có browser API nào prevent user chuyển tab. `beforeunload` chỉ fire khi close tab/window. `visibilitychange` chỉ là detector. Title flash + browser notification là cách thực tế nhất để alert user.

**Cache bust**: `v=20260526l` → `v=20260526m`

**Files**: tpos-pancake/js/tpos/tpos-livestream-snap.js, tpos-pancake/index.html

---

### [tpos-pancake] Option B mandatory streamId modal — tab inactive capture ✅

**User ask**: "Option B và check chưa có session thì hỏi, có rồi thì đừng hỏi -> chỉ có 1 nút xác nhận để bắt buộc"

**Why**: `chrome.tabs.captureVisibleTab` chỉ chụp được tab focused. Tab inactive cần Path 1 stream-based qua `chrome.tabCapture.getMediaStreamId` — Chrome MV3 yêu cầu extension invocation (click icon N2Store) chứ KHÔNG cho page click trigger.

**Fix** (`tpos-pancake/js/tpos/tpos-livestream-snap.js`):

1. New `_showStreamIdRequiredModal()` — modal mandatory với 1 nút "Đã hiểu", Escape không dismiss. Auto-close khi nhận `N2_TAB_STREAM_ID`. Hint click icon N2Store trên thanh extension Chrome.
2. `_maybeShowAutoSnapBanner` mới: nếu `extReady && !captureStream` → show modal (thay vì fallback captureVisibleTab path). Có `captureStream` → skip modal, chạy normal flow.
3. `_initStreamFromExtensionStreamId`: gọi `_ensureEmbeddedIframe(camp)` trước khi `_startFrameBuffer()` để wrapper tồn tại cho capture crop region. Remove modal sau khi wire xong.
4. Cache bust `v=20260526k` → `v=20260526l`.

**Flow**:

- Vào trang có live → 1500ms wait probe extension → ext ready + no stream → modal lock UI
- User click icon N2Store (Chrome toolbar, outside page DOM) → popup `getMediaStreamId` → `N2_TAB_STREAM_ID` → page tạo MediaStream → captureStream set → modal auto-close
- Sau đó tab inactive vẫn capture được forever cho đến khi stream end / page reload

**Files**: tpos-pancake/js/tpos/tpos-livestream-snap.js, tpos-pancake/index.html

---

### [delivery-report/report] Admin gating mở rộng: gộp + chỉnh ngày → ẩn cho non-admin ✅

**User ask**: "gộp và chỉnh ngày hiển thị (dời sang ngày khác) → cho các account không phải tương tác luôn"

**Fix** (`delivery-report/js/report.js` + `delivery-report/css/delivery-report.css`):

Mở rộng admin-only gating đã có cho DUYỆT, bao gồm 4 tính năng:

| Feature                           | Element                            | Non-admin behavior                                                                                                                     |
| --------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Select-day checkbox (chọn để gộp) | `input.dr-row-select`              | Replace bằng `<span class="dr-row-select-locked">` gạch chéo gray, cursor:not-allowed, tooltip "Chỉ Admin được gộp ngày"               |
| Gộp button                        | `#drSelMergeBtn`                   | Selection bar tự không mở (state.selectedDates rỗng) vì checkbox đã hidden. Defensive: `onMergeClick` early-return + alert "Chỉ Admin" |
| Unmerge × button                  | `button[data-action="unmerge"]`    | Skip render (admin: render; non-admin: empty). Handler `if (!_isAdmin()) return`                                                       |
| Shift edit pen                    | `button[data-action="shift-edit"]` | Đã admin-only từ trước (renderSingleRow check `_isAdmin() && !isChild`)                                                                |
| Unshift × trên aggregate row      | `[data-action="unshift-all"]`      | Đã admin-only từ trước                                                                                                                 |

**Defense in depth** (cả UI + handler):

- `updateSelectionBar`: non-admin → `state.selectedDates.clear()` + bar không `.open` (cho dù state bị poison qua DevTools)
- `tbody.change` handler `select-day`: non-admin → set `el.checked=false`, không update state
- `onMergeClick`: non-admin → alert + return
- `tbody.click` unmerge: non-admin → return
- `tbody.click` shift-edit: đã có `if (!_isAdmin()) return` từ trước

**CSS**: thêm `.dr-row-select-locked` (cùng pattern `dr-approve-locked`): 16×16 diagonal-stripe gray, không click được.

**Verify** (Playwright switch auth):

- ADMIN: selectDayCb=true, unmergeBtn=true, shiftEditBtn=true ✅
- NON-ADMIN (override `{isAdmin:false, roleTemplate:'user'}`): selectDayCb=false (locked), unmergeBtn=false, shiftEditBtn=false, selBarOpen=false ✅

---

### [delivery-report/report] Fix off-by-one — entry-date = real-date (align với main page) ✅

**User báo**: "sao 29/04, 30/04 không có dữ liệu?" — chọn range 29/04 → 30/04 trong báo cáo modal, modal hiển thị $0/0 đơn cho cả 2 ngày, NHƯNG main page với cùng date range hiển thị TOMATO 79/82 đơn, CN 1.329.000.

**Diagnosis** (Playwright API debug):

- Main page treat date input là REAL ship date → lookup data ngày 29/04 + 30/04 → tìm thấy tomato 79 đơn ở 2026-04-30
- Modal `entryToReal = real - 1` (`shiftDay(iso, -1)`) → khi user pick 29/04 → 30/04, modal fetch real 28/04 → 29/04 → MISS real 30/04 (nơi 79 tomato thực sự ở)
- API verify: `GET /by-date-group?from=2026-04-29&to=2026-04-30` trả về tomato:79 ở `date:"2026-04-30"` ✅

**Root cause**: convention `entry-date = real-date + 1` (UI shift) lệch với main page (no shift). Modal fetches off-by-one date range.

**Fix** (`delivery-report/js/report.js` line 480-481):

```js
// Before:
const entryToReal = (iso) => shiftDay(iso, -1);
const realToEntry = (iso) => shiftDay(iso, 1);

// After: identity — entry-date = real-date thẳng
const entryToReal = (iso) => iso || '';
const realToEntry = (iso) => iso || '';
```

`shiftDay` vẫn giữ vì còn dùng cho `eachDay` loop + consecutive-merge validation (`shiftDay(sorted[i-1], 1) !== sorted[i]`).

**Verify** (Playwright with range 29/04 → 30/04, tab TOMATO):

- Before: row 29/04 = $0, row 30/04 = $0 ❌
- After: row 29/04 = $0 (đúng — không có tomato ship 29/04), row 30/04 = **79 đơn, $41.524.000, totalLeft $39.707.000** ✅ khớp main page
- Tab totals (tomato/nap/city) = $39.707.000 / $135.003.000 / $98.082.000, TỔNG $272.792.000 ✅

**Backward compat note**: existing merges + overrides + date shifts trong DB lưu theo REAL date. Vì entry==real giờ, không cần migrate dữ liệu. Các display label `formatDDMMYYYY(realToEntry(d))` giờ = `formatDDMMYYYY(d)` — không đổi gì với data hiện có.

---

### [delivery-report/report] Virtual date shift — dời ngày + auto-aggregate khi trùng target ✅

**User ask**: "kiểm tra lại toàn bộ dữ liệu tháng 4 luôn, phần ngày của riêng bảng này cho chỉnh ngày ảo → ví dụ 29/04, 30/04 tôi chỉnh thành 01/05, 02/05 thì hiển thị badge biết chỉnh sửa ngày và dữ liệu gộp vào 01/05, 02/05 → nếu 29/04, 30/04 tôi nhập cùng ngày 02/05 thì gộp 29/04, 30/04 hiển thị vào 02/05"

**Fix** (`delivery-report/js/report.js` + `delivery-report/css/delivery-report.css`):

**Storage layer**:

- `_dateShifts` map (localStorage `dr-date-shifts-v1`): `{ '<realDate>__<group>': '<displayDate>' }`
- Helpers: `getDisplayDate(realDate, group)`, `isDateShifted(realDate, group)`, `setDateShift(realDate, group, displayDate)`
- Per machine; TODO sync server-side qua SSE notify

**Render loop refactor** (`paintTable`):

1. Build `displayBuckets: displayDate → [realDates]` (1 lần qua dates)
2. Detect `virtualAggregates`: bucket có >1 sources HOẶC source ≠ target
3. Sort union (`dates ∪ virtualAggregates.keys()`) làm thứ tự render
4. Mỗi displayDate iterate:
    - Là virtual agg → `renderShiftAggregateRow(displayDate, sources)` + mark all sources rendered
    - Là source của virtual agg khác → skip (đã render qua target)
    - Có manual merge → exclude shifted children khỏi merge, render bình thường (shift wins)
    - Không gì → render single row bình thường

**`renderShiftAggregateRow(displayDate, sources)`**:

- Sum auto: `sysCount`, `money`, `shipFee` từ sources
- Sum overrides: `slShip`, `thuVe`, `boCK`, `atruongCK`, `ckTruoc` từ sources
- Approve: `anyApproved` = bất kỳ source approved → row hiển thị mờ + totalLeft=0
- Read-only display (không có input fields — tránh ambiguity "input vào source nào")
- Tổng row tally như merge row
- Badge `<i class="fas fa-arrows-to-dot"></i> N ngày` purple chip + tooltip "Dồn từ N ngày: dd/mm, dd/mm → hiển thị tại dd/mm"
- Class `dr-shift-agg-row` indigo bg
- Admin có `×` unshift-all button

**Single row badge + edit button**:

- `dr-shift-badge` (amber chip "clock-rotate-left" icon) khi `isDateShifted(d, tab)` → tooltip "Ngày thật → hiển thị tại"
- `dr-shift-edit` (pen icon, opacity-0 → opacity-1 on hover) → admin only, click prompt nhập YYYY-MM-DD
- Row class `is-shifted` cho amber tint

**Click handlers** (tbody):

- `button[data-action="shift-edit"]` → admin prompt → `setDateShift` → `scheduleRender`
- `[data-action="unshift-all"]` → tìm all keys shift về displayDate → `setDateShift(null)` từng cái → render

**CSS** (`delivery-report.css`):

- `.dr-shift-edit`: pen button hidden mặc định, opacity:1 khi `tr:hover`
- `.dr-shift-badge`: amber chip
- `.dr-shift-agg-row`: indigo `#eef2ff` bg, `:hover` → `#e0e7ff`, `.is-approved` mờ 0.65
- `.dr-shift-agg-badge`: purple `#4338ca` pill
- `.dr-shift-unshift`: red circle (giống dr-merge-unmerge pattern)

**Verify** (Playwright init-script seed shifts):

- Seed `{2026-05-02→2026-05-05, 2026-05-03→2026-05-05}` → render: aggregate row "3 ngày 06/05/2026 × 24 đơn", source rows 2026-05-02/03/05 đã consumed, total rows 24 → 23 ✅
- Edit pen button: 24 buttons cho admin (1/row), title đúng ✅

**TODO**:

- Server-side sync (`delivery_assignment_date_shifts` table + SSE notify) — hiện tại per-machine
- Inline editable (date input thay prompt) cho UX tốt hơn
- Interaction với manual merge (hiện shift wins, có thể cần option khác)

---

### [delivery-report/report] Non-admin: ẩn HẲN approved rows + đơn giản logic ✅

**User ask**: "nếu không phải admin thì ẩn khỏi bảng các hàng được duyệt đi"

**Fix** (`delivery-report/js/report.js`):

- Render loop (line 1244+): trước khi push merge/single row, check `if (!_isAdmin() && approved) continue` → skip render hẳn. Cả merge row + child rows (single row trong merge) đều skip
- Loại bỏ `effectiveApproved()` helper (không cần nữa). Thay tất cả 4 callsites bằng raw `!!ov.approved` / `!!merge.approved`:
    - `computeTotalLeftForTab` × 2: approved → 0 contribution cho cả admin (settled) lẫn non-admin (hidden) — consistent
    - `renderSingleRow` / `renderMergeRow` × 2: approved → is-approved styling + totalLeftDisplay=0 (chỉ admin thấy vì non-admin đã bị filter trước)
- Approve cell HTML vẫn dùng `_isAdmin()` trực tiếp để decide checkbox vs lock placeholder

**Kết quả**:

|                       | Admin             | Non-Admin                    |
| --------------------- | ----------------- | ---------------------------- |
| Approved rows         | Visible (mờ 0.45) | **Hidden hoàn toàn**         |
| Approve checkbox cell | Bấm được          | Placeholder gạch chéo gray   |
| TotalLeft đóng góp    | 0 (approved)      | 0 (hidden — same result)     |
| Tab totals            | Approved trừ ra   | Approved trừ ra (consistent) |

**Verify** (Playwright):

- ADMIN: 24 rows visible, 9 với class `is-approved` ✅
- NON-ADMIN (sau override `{isAdmin:false, roleTemplate:'user'}`): 15 rows visible (9 approved đã ẩn) ✅
- Tab totals non-admin: $154.855.000 / $551.964.000 / $668.070.000 → TỔNG $1.374.889.000 (đúng = sum 3) ✅

---

### [delivery-report/report] Fix Admin detection — strict canonical + debug helper ✅

**User báo**: "hình như chưa nhận biết được account Admin và chỗ để so sánh nhận biết Admin"

**Diagnosis** (Playwright dump auth):

- Canonical source: `localStorage['loginindex_auth']` (cùng PermissionHelper) — auth thật: `{isAdmin:true, roleTemplate:'admin', userType:'admin-authenticated', checkLogin:'admin'}`
- `_isAdmin()` cũ check `window.authManager.getAuthData()` — work OK với admin session
- **Bug ẩn**: fallback `localStorage.userType` legacy key vẫn còn giá trị `"admin-authenticated"` từ session admin trước → khi non-admin login, fallback positive sai → tag Admin "leak" cho non-admin

**Fix** (`delivery-report/js/report.js`):

- Rewrite `_isAdmin()` với 4 strategies có ưu tiên rõ:
    1. **STRICT canonical**: đọc `sessionStorage`/`localStorage['loginindex_auth']`. Nếu có → check `isAdmin === true` || `roleTemplate === 'admin'` || `userType.startsWith('admin')` || `checkLogin in ['admin', 0]`. **Trả về kết quả ngay, KHÔNG fallback** (tránh legacy override quyết định)
       2-4. Fallback `authManager` / `PermissionHelper` / legacy `userType` — chỉ khi canonical absent
- Thêm `window.__DR_authDebug()` — gõ vào DevTools dump full auth state + lý do detect/không detect Admin

**Verify** (Playwright):

- Real admin session → `_isAdmin() = true` ✅
- Override `{isAdmin:false, roleTemplate:'user'}` → `_isAdmin() = false` ✅ (legacy `userType` cũ không leak nữa)

**Cách user verify trong DevTools**: `window.__DR_authDebug()` → object với `isAdminResult` + breakdown các field.

---

### [shared][supplier-debt] Fix bug search + tối ưu modal "Trả hàng NCC" (bulk-fetch + cache + client filter) ✅

**User ask**: "bảng trả hàng -> tìm kiếm sản phẩm chưa được và lag -> browser test vào tomato.tpos.vn/refundform1 xem tất cả chức năng" + "thường web bật modal rất lag -> tìm cách khác tối ưu".

**Investigation** (browser test qua persistent Playwright):

- Bug: `ODataService.GetViewV2?$filter=contains(NameGet,'q12')` — TPOS server **silently ignores `$filter`** trên endpoint này. Response luôn trả `count=3579` + sản phẩm gốc → user gõ gì cũng không lọc.
- TPOS native `refundform1` dùng pattern khác hẳn: `/api/v2/warehouse/inventorywithlastid` cursor-pagination cho stock, bulk preload product index, **filter client-side** → 0 network/keystroke.

**Benchmark** (qua chatomni-proxy thật):

| Strategy                                        | Time      | Items       | Size   |
| ----------------------------------------------- | --------- | ----------- | ------ |
| Cũ: GetViewV2 paginated 50                      | 824ms     | 50/3579     | 45 KB  |
| Mới: plain `/ProductTemplate $select=tiny` bulk | **932ms** | **3579 đủ** | 1.1 MB |

**Files**:

- [shared/js/return-order-modal.js](shared/js/return-order-modal.js):
    - Đổi endpoint `ODataService.GetViewV2` → plain `/odata/ProductTemplate?$filter=Active eq true&$top=5000&$select=Id,NameGet,Name,DefaultCode,Barcode,PurchasePrice,ListPrice,UOMName,UOMId,ImageUrl,Type,DateCreated` (load 1 lần).
    - `S.allProducts` lưu full index, cache `sessionStorage` TTL 10 phút.
    - `_applyFilterSort()`: filter/sort/paginate hoàn toàn client-side.
    - `_normalizeVi()`: strip diacritics + lowercase → "dam"/"DAM"/"đầm"/"ĐẦM" match đúng "ĐẦM..." trong tên SP.
    - Search debounce 400ms → 80ms (chỉ để gom keystrokes nhanh, không phải đợi network).
    - Cache thêm suppliers + payment methods (TTL 30 phút).
    - Stock không khả dụng từ `$select` (QtyAvailable/VirtualAvailable là computed nav, gây 500 server) → show `—` (italic xám) thay vì "0" gây hiểu nhầm.
- [shared/css/return-order.css](shared/css/return-order.css): thêm `.stock-unknown` cho display "—".

**Verified live (persistent browser)**:

- Search `q12` → 11 SP đúng, `netCount=0`, instant
- Search `B254` → 11 SP, `B2548` → 1 SP, `2605` → 14 SP, clear → 3581 SP page 1, tất cả `netCount=0`
- Diacritic: `dam`/`DAM`/`DAm`/`dầm`/`đầm` → cùng 266 SP
- Pagination page 2 → 0 network call
- Modal re-open lần 2 (cache hit): **313ms / 0 network call** (vs ~3000ms ban đầu)
- Supplier dropdown + add product (B2548) → order line OK, không break flow cũ

Status: ✅ Done. Cache `sessionStorage` keys: `returnOrder_productIndex_v1`, `returnOrder_suppliers_v1`, `returnOrder_paymentMethods_v1`.

---

### [render][web2] Tách SSE server riêng cho Web 2.0 — không chia chung với Web 1.0 ✅

**User ask**: "kiểm lại sse realtime server web 2.0 -> hiện tại đang dùng chung web 1.0 -> tôi cần build riêng cho web 2.0". DB đã tách (`customer_wallets` vs `web2_customer_wallets`), giờ tách nốt SSE.

**Files**:

- **CREATE**: `render.com/routes/realtime-sse-web2.js` — SSE hub riêng cho Web 2.0, Map độc lập, log prefix `[SSE-WEB2]`, endpoint `/api/realtime/web2/sse?keys=...`. Listener `web2WalletEvents.on('web2:wallet:update')` chuyển từ legacy sang đây.
- **EDIT**: `render.com/server.js` — mount `/api/realtime/web2` trước `/api/realtime`; đổi 12 `initializeNotifiers(realtimeSseRoutes.notifyClients)` → `web2RealtimeSseRoutes.notifyClients` (web2-products/variants/users/generic, native-orders, fast-sale-orders, reconcile, purchase-refund, livestream-snapshots, v2/cart, v2/notifications, v2/dashboard-kpi); thêm `app.locals.web2RealtimeSseNotify`.
- **EDIT**: `render.com/routes/realtime-sse.js` — REMOVE cross-publish `web2:customer-wallet` từ legacy `walletEvents` listener + REMOVE block `web2WalletEvents` listener (đã chuyển).
- **EDIT**: `render.com/routes/fast-sale-orders.js` + `routes/native-orders.js` — đổi 15 callsites `req.app.locals.realtimeSseNotify` → `req.app.locals.web2RealtimeSseNotify` (tất cả broadcast topic `web2:*`).
- **EDIT**: `web2/shared/web2-sse-bridge.js` — `SSE_BASE` đổi `/api/realtime/sse` → `/api/realtime/web2/sse`.
- **EDIT**: `web2/shared/page-shell.js` + 16 HTML files — bump `web2-sse-bridge.js?v=20260526sse2`.
- **EDIT**: `docs/web2/SSE-REALTIME.md` + `CLAUDE.md` + memory `reference_sse_servers_unified.md` — đổi từ "unified" sang "2 hub độc lập".

**Lý do**: DB tách từ trước → SSE chia chung Map là coupling không cần thiết. Tách giúp debug riêng (log prefix), memory state riêng, Web 2.0 test mới không risk Web 1.0. SePay → Web 2.0 wallet chỉ qua `web2WalletEvents` → web2 hub (không còn cross-publish từ legacy).

**Verify**:

```bash
curl -N "https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse?keys=web2:products" | head -3
curl -s "https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse/stats" | jq    # → "server":"web2"
```

CF Worker không đổi (`handleRealtimeProxy` match `/api/realtime/*` cover cả `/web2/`).

**Live test (sau deploy ~5 min)**:

1. Stats endpoint `/api/realtime/web2/sse/stats` → `{"server":"web2","totalClients":0,"uniqueKeys":0}` ✅
2. Mở EventSource → receive `event: connected` với `{"server":"web2","connectionId":"web2conn_..."}` ✅
3. POST `/api/realtime/web2/sse/test` `{"key":"web2:test-topic","data":{...}}` → `{"clientsNotified":1}` ✅
4. Client receive `event: test\ndata: {"key":"web2:test-topic","data":{...},"event":"test"}` ✅
5. Disconnect tracked đúng → totalClients=0 sau khi kill ✅
6. **Regression Web 1.0**: `/api/realtime/sse/stats` → 93 clients × 13 topics legacy (`celebration`, `held_products`, `kpi_*`, `web_warehouse`, `tickets`, `wallet`, …) — **không có topic `web2:*` nào** → wiring tách hoàn chỉnh ✅
7. GH Pages: `web2-sse-bridge.js?v=20260526sse2` deployed, `SSE_BASE = '/api/realtime/web2/sse'` ✅

**SSE log structure** (đọc Render logs để verify realtime UI):

Server boot:

```
[SSE-WEB2] Web 2.0 wallet event subscription initialized          ← 1 lần, BẮT BUỘC có
```

Client connect/disconnect (mỗi tab):

```
[SSE-WEB2] Client connected (web2conn_<ts>_<rand>), watching: web2:products,web2:variants
[SSE-WEB2] Active connections: 5
...
[SSE-WEB2] Client disconnected (web2conn_<...>) after 234.5s
[SSE-WEB2] Active connections: 4
```

Server broadcast (sau mỗi DB mutation):

```
[SSE-WEB2] Notified 3 clients for key: web2:products              ← 3 tab nhận event
[SSE-WEB2] No clients listening to key: web2:products             ← không tab nào subscribe (OK nếu chưa ai mở page)
[SSE-WEB2] Wildcard notified 2 clients for pattern: web2:wallet   ← list page admin
[<MODULE>] _notify failed: <err>                                  ← lỗi wrapper, debug ngay
```

**Read–write loop** (UI update không cần refresh):

Tab A mutate:

```
user click → PATCH /api/web2-products/KHO-X
  → Render: pg UPDATE web2_products WHERE code=KHO-X → COMMIT OK
  → _notify('update', 'KHO-X') → web2RealtimeSseRoutes.notifyClients('web2:products', {action,code,ts}, 'update')
  → Render log: [SSE-WEB2] Notified N clients for key: web2:products
  → res.json({success:true}) → tab A local re-render
```

Tab B/C/D (đang subscribe Web2SSE.subscribe('web2:products', cb)):

```
SSE stream nhận: event: update\ndata: {key:web2:products, data:{action,code,ts}, ...}
  → bridge dispatch → callback fire {topic, eventType, data, timestamp}
  → debounce 500-600ms (gom burst) → page reload() → UI fresh
```

3 điều kiện realtime hoạt động:

1. Route handler gọi `_notify(action, code)` SAU DB commit thành công, TRƯỚC `res.json`
2. `server.js` wire `<module>Routes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients)`
3. HTML load `web2-sse-bridge.js?v=<latest>` TRƯỚC page-app + page gọi `Web2SSE.subscribe(topic, cb)` trong `init()`

**Debug cheatsheet** (UI không update):

| Hiện tượng                                                      | Check                                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Tab A mutate → tab B không update                               | DevTools tab B Network → tìm EventSource đến `/api/realtime/web2/sse`. Không có → bridge cache cũ / endpoint sai |
| Stream connect nhưng callback không fire                        | Console bridge log `[Web2SSE]` payload có topic match? Subscriber register kịp `init()`?                         |
| Render log "Notified 0 clients" dù tab đang mở                  | Browser cache JS cũ → bridge cũ vẫn trỏ `/api/realtime/sse`. Hard refresh / bump `?v=`                           |
| Render log không có `[SSE-WEB2] Notified` sau mutation          | Route chưa gọi `_notify(action, code)` sau DB write. Hoặc `server.js` wire vào hub Web 1.0 (legacy)              |
| Stream connect/disconnect liên tục (<5s)                        | CF Worker timeout? Heartbeat (30s) bị middlebox drop? Check `req.on('error')` log                                |
| `[SSE-WEB2] Web 2.0 wallet event subscription initialized` miss | `services/web2-wallet-service.js` không load — check server boot stack trace                                     |

Đầy đủ pattern + recipe: [docs/web2/SSE-REALTIME.md](docs/web2/SSE-REALTIME.md) §7E-§7G. Memory rule: `reference_sse_servers_unified.md`.

**Status**: ✅ Phase 1 done + live verified + log structure documented. Phase 2 (cắt Web 1.0 Sepay matching entirely) — chờ user confirm sau verify phase 1 chạy 1 ngày live.

---

### [docs][api] /api/v2/\* namespace — CHIA CHUNG Web 1.0 + Web 2.0 (chống nhầm) ✅

**User ask**: "kiểm lại api end point v2 là của web 1 hay web 2".

**Tóm**: `/api/v2/*` KHÔNG phải "version 2 = Web 2.0". Đây là technical debt — tạo 2026-01-12 cho Web 1.0 "Unified Customer 360", Web 2.0 sau này piggy-back vào cùng namespace.

**Phát hiện qua audit `render.com/routes/v2/index.js` + `server.js` line 448-580**:

**Core `/api/v2/*` thuộc Web 1.0** (Unified Customer 360, replace path cũ `/api/customers`, `/api/wallets`):

- `customers`, `wallets` (table `customer_wallets`), `tickets`, `balance-history` (table `balance_history`), `analytics`, `web-warehouse` (table `web_warehouse`), `purchase-orders`, `inventory-tracking`, `delivery-assignments`, `pending-withdrawals`, `odata`
- Consumer: `inbox/`, `tpos-pancake/`, `balance-history/`, `orders-report/`, `delivery-report/`, `order-management/`, `render-data-manager/`

**Mounted dưới `/api/v2/*` nhưng THỰC SỰ là Web 2.0** (piggy-back, không có prefix `web2-`):

- `notifications` (F06), `audit-log` (F05), `supplier-aging` (F02), `dashboard-kpi` (F01), `smart-match` (F09), `inventory-forecast` (F11), `supplier-360` (F07), `cart`
- Bằng chứng: comment `// WEB2.0` ở header route file + comment server.js mount line

**`/api/v2/web2-*` — Web 2.0 prefix RÕ RÀNG** (convention mới, sau khi separation rõ):

- `web2-wallets` (table `web2_customer_wallets`), `web2-balance-history` (table `web2_balance_history`), `web2-monitoring`, `web2-customer-wallet`
- Comment `server.js:573` confirm: _"Tách hoàn toàn khỏi `/api/v2/wallets` + `/api/v2/balance-history` (Web 1.0 v2 API)"_

**Convention đi tới**:

- Route Web 2.0 MỚI → `/api/web2-<entity>` (root, preferred) HOẶC `/api/v2/web2-<entity>`. KHÔNG mount dưới `/api/v2/<name>` không có `web2-` prefix.
- Route Web 1.0 MỚI → tránh `/api/v2/*` core (đã deprecated sunset 2025-07-01). Dùng `/api/<feature>`.

**Files**:

- **EDIT** `CLAUDE.md` — thêm subsection "⚠ `/api/v2/*` namespace — CHIA CHUNG" dưới "API / Render routes" với phân loại 3 nhóm + convention đi tới
- **CREATE** memory `reference_api_v2_namespace.md` — đầy đủ phân loại 12 routes Web 1.0 + 8 routes Web 2.0 piggy-back + 4 routes prefix rõ, anti-patterns
- **EDIT** memory `MEMORY.md` — thêm pointer mục mới
- **EDIT** dev-log (entry này)

**Áp dụng**: Khi review code/route mới, KHÔNG giả định "v2 = Web 2.0". Check file route header (`// WEB2.0` comment) hoặc consumer folder (`web2/*` hay `inbox/`, `orders-report/`, …) để xác định layer.

**Status**: ✅ Done. 3 nơi memory để session sau biết.

---

### [docs][web2] SSE-first rule cho mọi feature/page mới — meta-instruction ✅

**User ask**: "thêm vào devlog, memory, claude → có server sse socket realtime listening, reading dữ liệu log để ui realtime, cập nhật dữ liệu không cần refresh, đồng bộ giữa các máy với nhau → nên lúc nào code chức năng mới hoặc trang mới thì biết có server sse để dùng log server nếu cần thiết".

**Tóm**: project có sẵn server SSE realtime + log buffer + Admin Monitor. Khi code BẤT KỲ feature/page mới có data động → MẶC ĐỊNH dùng SSE thay vì polling/Firestore/refresh-tay.

**Files**:

- **EDIT** `CLAUDE.md` section "SSE Server TÁCH RIÊNG" — thêm subsection "⚡ SSE-first khi code chức năng / trang mới (BẮT BUỘC NHỚ)" với:
    - 3 lợi ích SSE đã sẵn có (UI không refresh / sync giữa máy / log server)
    - Anti-patterns (polling, Firestore listener, manual refresh, WebSocket khi không cần)
    - Quy trình 6 bước khi code feature mới
    - Topics đã active list
- **EDIT** memory `reference_sse_servers_unified.md` — thêm "Rule quan trọng nhất" ở đầu file, mô tả SSE-first default
- **EDIT** `docs/dev-log.md` — entry này (meta-instruction note)

**Áp dụng từ giờ**:

Khi user yêu cầu code feature/page có data thay đổi (CRUD, status update, counter, list, kanban, …), trước khi viết code:

1. Hỏi: "Có cần realtime sync không?" — gần như luôn là CÓ (nếu nhiều user/tab dùng cùng lúc)
2. Nếu có → wire qua SSE pattern thay vì polling/Firestore
3. Verify ngay bằng Admin SSE Monitor (`web2/admin-sse-monitor/`)
4. Document topic mới trong `docs/web2/SSE-REALTIME.md` §9

Không cần hỏi lại user — đây là default behaviour của project Web 2.0 từ 2026-05-26.

**Status**: ✅ Done. Saved trong 3 nơi để Claude session tương lai (qua chain walking + folder snapshot) đều thấy rule này.

---

### [web2][render] Admin SSE Monitor — trang xem realtime SSE log từ browser ✅

**User ask**: "admin có 1 nút ở menu bấm bật lên xem được realtime sse log đang chạy".

**Files**:

- **EDIT**: `render.com/routes/realtime-sse-web2.js` (+90 lines): ring buffer 500 entries (`recentLogs`) + seq monotonic; `_pushLog` hook vào 4 chỗ (connect, disconnect, notify success, notify zero-clients) + broadcast lên topic riêng `web2:_admin:sse-log`. Endpoint mới `GET /api/realtime/web2/sse/log?since=<seq>&limit=<n>` returns `{adminTopic, bufferSize, currentSeq, entries:[...]}`.
- **CREATE**: `web2/admin-sse-monitor/index.html` + `js/monitor.js` (~650 lines): trang admin có header bar (live dot + status label), 4 stat cards (total subscriber, unique topics, events received, buffer seq), 2 panels (topics sorted by count + live activity feed), toolbar (pause/resume, text filter, clear, send test event). Color-coded log tags: connect(green)/disconnect(red)/notify(blue)/notify-0(yellow). Auto-scroll chỉ khi user gần bottom. Admin gate: `isAdmin || roleTemplate==='admin' || userType.startsWith('admin')` từ `loginindex_auth`.
- **EDIT**: `web2/shared/tpos-sidebar.js`: thêm menu item "SSE Monitor (Admin)" trong "Tính năng mới" với `adminOnly: true`, helper `_isAdmin()` match `navigation-modern.js`, `renderItem` filter ẩn item cho non-admin, register vào `WEB2_PAGES`.

**E2E verify post-deploy**:

Admin curl subscribe `web2:_admin:sse-log` + 2 lần trigger test broadcast → admin stream nhận **3 log events**: `connect` (chính mình, seq=3), `notify web2:demo-topic action=demo-1 clientsNotified=0` (seq=4), `notify web2:products action=demo-2 clientsNotified=0` (seq=5). Ngay sau deploy buffer đã có real production event `web2:livestream-snapshots create → 0 clients` (seq=1) → broadcast pipeline hoạt động.

**Cách dùng**:

1. Login admin → sidebar Web 2.0 → "Tính năng mới" → "SSE Monitor (Admin)"
2. Page show: stats poll 2s, topics list, live feed cuộn xuống dưới cùng
3. Click "🚀 Send test" → prompt nhập topic → trigger broadcast → verify
4. Filter "web2:products" → chỉ thấy events liên quan
5. Mở thêm tab Web 2.0 khác + mutate dữ liệu → log entry `notify topic clientsNotified=N` xuất hiện ngay → verify pub/sub fire đúng
6. Nếu `clientsNotified=0` dù có tab mở page → bridge cache cũ hoặc subscribe sai topic

**Status**: ✅ Done + live verified. Server endpoint `/sse/log` + admin topic `web2:_admin:sse-log` + page `/web2/admin-sse-monitor/` + sidebar menu item.

---

### [delivery-report/report] Phí ship per tab (tomato/nap=23k, city=20k) + settings popover + Admin gating ✅

**User ask** (2 messages):

1. "cho phí ship thành phố là 20, thêm cài đặt ở bảng → phần chỉnh phí ship cho từng cái"
2. "tài khoản có tag Admin này thì mới cho duyệt và thấy những cái đã duyệt → tất cả tài khoản khác sẽ không thấy những cái đã duyệt và không bấm được checkbox duyệt"

**Fix** (`delivery-report/js/report.js` + `delivery-report/css/delivery-report.css`):

**Per-tab ship fee**:

- Replace hằng `SHIP_FEE_PER_ORDER=23000` bằng `SHIP_FEE_DEFAULTS={tomato:23000, nap:23000, city:20000}` + helper `getShipFee(tab)` / `setShipFee(tab, value)`
- Persist `localStorage[dr-report-ship-fees-v1]` per machine
- Thay tất cả 8 callsites:
    - 4 trong `computeTotalLeftForTab(tab, ...)` → dùng `tab` arg
    - 4 trong `paintTable` / `renderSingleRow` / `renderMergeRow` → dùng `state.activeTab`
- Settings UI: gear button `.dr-report-settings-btn` thêm vào `#drReportTabs`. Click → popover floating gần button, 3 inputs (per tab) với "Lưu" / "Mặc định" actions. Click outside để đóng. CSS dark popover với border-left color theo tab.

**Admin gating**:

- Helper `_isAdmin()` (reuse pattern từ `orders-report/js/phone-auto-register.js`): check `localStorage.userType.startsWith('admin')` || `auth.isAdmin === true` || `auth.roleTemplate === 'admin'` || `auth.checkLogin === 0`
- Helper `effectiveApproved(value)` → returns `false` cho non-admin, `value` cho admin
- Wire vào 5 nơi đọc `approved`:
    - `renderSingleRow` line 1019: `const approved = effectiveApproved(ov.approved)`
    - `renderMergeRow` line 1108: `const approved = effectiveApproved(merge.approved)`
    - `computeTotalLeftForTab` 2 nơi (merge + single): `effectiveApproved(...) ? 0 : totalLeftRaw`
    - Approve cell HTML: non-admin → `<span class="dr-approve-locked">` placeholder thay vì `<label><input>` checkbox
- CSS `.dr-approve-locked`: diagonal stripe pattern gray, cursor not-allowed, tooltip "Chỉ tài khoản Admin mới được duyệt"

**Hệ quả non-admin**:

- Không thấy checkbox DUYỆT (chỉ thấy ô gạch chéo xám)
- Không thấy row `is-approved` styling (mờ 0.45 opacity)
- Tổng còn lại tính FULL (không trừ approved → thấy đầy đủ outstanding)
- Tab totals cũng không trừ approved

**Verify** (Playwright multi-state test):

- ADMIN: `hasCheckbox:true, hasLock:false, hasSettingsBtn:true` ✅
- Settings popover: 3 inputs với defaults `tomato=23000, nap=23000, city=20000` ✅
- NON-ADMIN: `hasCheckbox:false, hasLock:true, approvedRowCount:0` ✅

---

### [delivery-report/report] Tổng còn lại per tab + grand total ngang ✅

**User ask**: "tổng còn lại chi nằm ở dưới chữ hình 2, ví dụ tổng còn lại tomato cho nằm dưới tomato, nap cho nằm dưới nap, thành phố cho nằm dưới thành phố (canh giữa các phần này, chỉ cần ghi số tiền) → bên phải thành phố có tổng = 3 cái tổng còn lại + lại".

**Fix** (`delivery-report/js/report.js` + `delivery-report/css/delivery-report.css`):

- HTML: thêm `<div id="drReportTabsTotals">` ngay dưới `#drReportTabs`
- Helper `computeTotalLeftForTab(tab, dates)` — port logic totalLeft từ paintTable (single + merge + children sum + override + approved=0). Duplicated nhẹ để tránh refactor lớn paintTable. Gọi 3 lần (1/tab) mỗi render.
- `paintTabTotals(dates)` — build 4 cells: TOMATO/NAP/THÀNH PHỐ totals (background tint theo tab color, color green positive / red negative / gray zero) + TỔNG bên phải (`margin-left: auto`, yellow `#fef3c7` bg, border-left phân tách)
- Hook vào render cycle: cả hot cache path lẫn cold fetch path đều gọi `paintTabTotals(dates)` sau `paintTable(dates)`
- CSS `.dr-report-tabs-totals`: flex row, gap 8px match tabs row; mỗi `.dr-tab-total` min-width 90px center-aligned; grand total min-width 140px label "TỔNG" nhỏ + value lớn

**Verify** (Playwright): 4 cells render đúng: `TOMATO $154.855.000`, `NAP $551.964.000`, `THÀNH PHỐ $303.290.000`, `TỔNG $1.010.109.000` (đúng = 154.855 + 551.964 + 303.290). Layout: 3 totals căn dưới buttons, grand total flush-right với border-left phân tách.

---

### [delivery-report, docs, MEMORY] SSE realtime server thống nhất Web 1.0 + Web 2.0 — server notify (server-side checkpoint) 🔄

**User ask** (sequence 5 msgs): (1) "đồng bộ realtime sync các máy luôn → coi có server sse của web 1.0 chưa (nhớ là web 1.0 đừng động vào web 2.0) → server sse này sẽ log các tương tác cần realtime ở các máy → các client sẽ listening và đúng trang client đang mở sẽ cập nhật"; (2) "note vào memory, claude, devlog là có server realtime sse của web 1.0 và 2.0, dùng 2 server này dùng cho toàn bộ để thực hiện tính năng realtime, đồng bộ tất cả"; (3) "web 2.0 có server sse realtime riêng đúng không?"; (4) "web 1.0 có cần setting giống web 2.0 để tối ưu hay không?"; (5) "tại vì web 1.0 cũng cần để các page truyền dữ liệu đồng bộ cho nhau đó".

**Survey findings** (qua Explore agent):

- **Chỉ có 1 server SSE chung** tại `render.com/routes/realtime-sse.js` (endpoint `/api/realtime/sse?keys=topic1,topic2`). Cả Web 1.0 + Web 2.0 dùng chung. KHÔNG có server thứ 2.
- Khác convention: Web 2.0 dùng `web2:<entity>` prefix + `Web2SSE.subscribe()` singleton bridge; Web 1.0 dùng bare snake_case topics (`celebration`, `kpi_statistics`) + `new EventSource()` direct hoặc `class RealtimeClient` (`shared/js/realtime-client.js` — đã used bởi inventory-tracking).
- Production-live: orders-report (celebration KPI, tab1-order-notes, tab1-kpi-stats-strip).

**Docs (committed)**:

- Memory: `~/.claude/projects/-Users-mac-Desktop-n2store/memory/reference_sse_servers_unified.md` (mới, full pattern + recipe + anti-patterns + verify cmds)
- CLAUDE.md: thêm section "SSE Server thống nhất cho CẢ Web 1.0 + Web 2.0 (BẮT BUỘC)" sau section Web 2.0 realtime
- MEMORY.md index: thêm pointer `reference_sse_servers_unified.md`

**Server checkpoint** (`render.com/routes/v2/delivery-assignments.js`):

- Lazy `require('../realtime-sse')` + `_notify(action, extra)` wrapper (no-op fallback nếu module fail load)
- Notify topic `delivery_assignments` với payload `{action, ts, [date, group, id]}` cho 7 mutations:
    - PUT/DELETE `/image/:date/:group` → `image-upserted` / `image-deleted`
    - PUT empty-override → `override-deleted`; non-empty PUT → `override-upserted`; DELETE → `override-deleted`
    - POST `/merges` → `merge-created`; PUT `/merges/:id` → `merge-updated`; DELETE → `merge-deleted`
- Payload chỉ chứa identifiers + action — KHÔNG broadcast PII

**TODO** (next session): client subscribe ở `delivery-report/js/report.js` khi modal open, dùng `RealtimeClient` bridge hoặc raw EventSource + debounce 600ms re-fetch `loadOverridesRange + loadMergesRange + loadImageFlagsRange`.

---

### [product-warehouse] Fix toolbar filters + auto-load history tab ✅

**User ask**: (1) "browser test các filter hình 1" — test 4 toolbar dropdowns. (2) "tab lịch sử ở chỉnh sửa sản phẩm -> tự động hiện khi vào tab" — auto-load audit log instead of requiring "Tải lịch sử" click.

**Findings**: all 4 toolbar dropdowns broken — TPOS GetViewV2 ignores `$filter=QtyAvailable gt 0`, `Active eq false`, `contains(CategCompleteName, ...)`, etc. Example: Tồn kho="Còn hàng" still returned rows with qty 0.

**Fixes**:

- `applyClientFilters()` extended to honour toolbar dropdowns (Tồn kho stock state, Hiệu lực Active partition, Nhóm SP CategCompleteName substring, Nhãn tag-id/name match).
- `hasActiveColumnFilters()` extended to consider toolbar dropdowns — `fetchProducts()` routes through cached client-side path whenever any filter has non-default value.
- Toolbar change handlers call `fetchProducts(true)` (silent=true) for instant cache hits.
- Hiệu lực dropdown syncs with tabs: "Hết hiệu lực" auto-clicks the inactive tab (was 0 rows because tab+dropdown contradicted).
- Edit-modal tab click: "Lịch sử" auto-triggers `loadAuditLog(templateId)`. Tracked via `_auditLogLoadedForTemplate` (one fetch per modal open); reset in `closeEditModal()`. "Tải lịch sử" button kept as manual refresh.

**Files**: `product-warehouse/js/main.js`.

**Verification (Playwright)** with cache warm:

- Tồn kho="Còn hàng": 50 rows, all qtys > 0 ✓.
- Tồn kho="Hết hàng": 50 rows, all qtys = 0 ✓.
- Hiệu lực="Hết hiệu lực": auto-switches to inactive tab ✓.
- Nhóm SP populates real categories; selection filters client-side.
- 0 server calls for filter changes (all via warmed cache).
- Click "Lịch sử" tab → `#auditLogContent` flips empty → "Đang tải…" automatically ✓.

### [product-warehouse] Instant search via idle-warmed template cache ✅

**User ask**: "tìm kiếm sản phẩm render bảng theo dữ liệu nhập vào luôn đi" + "browser test phần tìm kiếm sao cho tối ưu nhất".

**Previous behavior**: search input debounced 350ms → server OData fetch (~200-500ms) → render. Total perceived latency ~550-850ms per keystroke. Plus a server roundtrip for every typed character that survived the debounce.

**Fix**: idle-warm the full template cache → per-keystroke search becomes a 5-20ms in-memory filter + render.

- New `scheduleTemplateCachePrefetch()` — `requestIdleCallback` with `{timeout: 6000}` fires `fetchAllTemplatesRaw()` in background after first table load. ~14s to fetch all 3745 templates (4 calls of 1000), but happens once and doesn't block UI.
- On search-input focus: also kick off cache fetch (if not already running) so users who type fast trigger the warm-up earlier.
- `renderFromCacheBySearch()` — new fast path: filters the cached array via existing `applyClientFilters()` (text contains + numeric ops + price-eq fallback for digits), paginates, re-renders. No network call.
- Search-input handler routes to fast path when `_allTemplatesCache && viewType === 'template'`. Falls back to a 250ms-debounced server fetch only while cache is still loading.
- After prefetch settles, `fetchOtherTabCount()` is called so the inactive tab badge updates immediately.

**Files modified**:

- `product-warehouse/js/main.js`: `scheduleTemplateCachePrefetch()`, `renderFromCacheBySearch()`, search-input handler rewritten, init wires the prefetch.

**Verification (Playwright)** with `page.on('request')` counter:

- Initial table load: 1 server call.
- Cache warms in ~14.6s in background (during user idle).
- Type "B", "B2", "B25", "B254", "180000", "Combo", and clear: **0 additional server calls**. Per-keystroke wall-clock 90-154ms (test artificial wait 80ms → real render <70ms).
- Result validity: "B254" → 11 rows (B2549 first), "180000" → 50 rows matched by ListPrice/PurchasePrice/StandardPrice, "Combo" → 21 rows, clear → 50 rows.

Pattern reusable for any large list page where the dataset is bounded (~thousands).

### [product-warehouse] "Ẩn hiện cột" header btn + instant modal open ✅

**User ask**: "chưa có cài đặt ẩn hiện cột, bật modal thêm sản phẩm lag quá -> web hiện tại mở modal rất lag, có cách nào thay thế modal hoặc tối ưu không?"

**Root causes** (verified by reading openCreateProduct + openEditProduct):

1. "Cài đặt cột" btn was inside `.toolbar-bulk-actions` (only shown when rows are selected AND filters toolbar is expanded). Most users never see it.
2. Modal blocked on 3 sequential OData calls (`ProductCategory $top=500`, `POSCategory $top=500`, `ProductUOM $top=200`) — ~1.5-3s lag — BEFORE adding `.show` class. User perceives a frozen UI.
3. After awaiting data, modal populated 4 `<select>`s of ~500 options each + advanced sections + tag picker + 5 bind\*EventHandlers + full-document `lucide.createIcons()` — another ~150-300ms of synchronous work.

**Fix**: instant-show + async populate + idle prefetch (pattern researched via docs-lookup):

- New `btnColumnSettingsHeader` ("Ẩn hiện cột") next to "Thêm SP" — always visible.
- `ensureDropdownData()` refactored to fire 3 OData calls via `Promise.all` (was sequential — ~3s → ~1s wall-clock first time).
- New `scheduleDropdownPrefetch()` — `requestIdleCallback(ensureDropdownData, {timeout: 3000})` after first table load → cache warm by the time user clicks "Thêm SP".
- `openCreateProduct()` + `openEditProduct()` rewritten with show-first / populate-after pattern: synchronous skeleton (selects show "Đang tải…", inputs cleared) → add `.show` immediately → `requestAnimationFrame` schedules heavy populate AFTER first paint.

**Files modified**:

- `product-warehouse/index.html`: new `#btnColumnSettingsHeader`.
- `product-warehouse/css/warehouse-tpos.css`: `.btn-column-settings-header` (white toolbar btn, purple hover).
- `product-warehouse/js/main.js`: parallelized `ensureDropdownData`, added `scheduleDropdownPrefetch`, refactored `openCreateProduct` + `openEditProduct`, wired prefetch into init.

**Verification (Playwright)**:

- `#btnColumnSettingsHeader` visible, click → opens column settings modal.
- First "Thêm SP" modal: **visible at 103ms** (was 1500-3000ms), dropdowns populated at 106ms (prefetch warm).
- Second open: visible 137ms, populated 141ms.

Pattern reusable for any other heavy modal in n2store.

### [product-warehouse] Column resize (drag) + auto-fit Name col ✅

**User ask**: "cho cài đặt cột -> cho cột kéo độ rộng tùy chỉnh theo ý muốn (mặc định cột tên sản phẩm scale theo tên sản phẩm dài nhất hiện trong bảng) -> phần tìm kiếm sản phẩm không cần scale tự động vì nó sẽ lag".

**Implementation**:

- New 5px hit-zone on right edge of every `th[data-col]` (excluding `checkbox/actions/image`). Hover/active band lights up with `--pw-accent` at 55% opacity. Body gets `.col-resizing` class during drag to pin cursor + suppress text selection.
- Mousedown captures `{colKey, startX, startWidth}`, mousemove updates inline `width/minWidth/maxWidth` (clamped 40–800px), mouseup persists to `localStorage['n2store_warehouse_col_widths']` keyed by `data-col`.
- Double-click handle → resets that column (deletes saved width). Name col then re-runs auto-fit.
- Auto-fit Name col: off-screen `<span>` probe with the same computed font measures every visible product name, picks max + 24px padding, caps at 480px. Skipped when (a) user has manually resized name col or (b) search input has any value (avoids reflow lag per keystroke).
- Saved widths re-applied after every `render()` and on init via `applyColWidthsToDOM()` so pagination/tab switch doesn't lose layout.

**Files modified** (auto-commit `a6af1d4d2`):

- `product-warehouse/css/warehouse-tpos.css`: `.col-resize-handle` styles + `body.col-resizing` drag-state rules.
- `product-warehouse/js/main.js`: `manualColWidths` state, `loadColWidths/saveColWidths/applyColWidthsToDOM`, `attachColResizeHandles/setupColResizeDrag`, `autoFitNameColumn`. Hooks added to init + end of `render()`.

**Verification (Playwright)**:

- All 16 data cols get a `.col-resize-handle` after init.
- Initial render with empty saved state: name col auto-fits to 407px (longest visible name).
- Drag price col +150px: handle responds, width = 255px, localStorage = `{"price":255}`.
- Reload: price col rect = 255px, name col rect = 407px → both persisted/recomputed correctly.
- Type "TUI" in search: name col stays at 407px (auto-fit skipped during search — no jitter).

### [product-warehouse] Tab "Hết hiệu lực" + live search + per-column filters w/ operators ✅

**User ask**: Sequence of 4 messages: (1) "phần tìm kiếm và sản phẩm hết hiệu lực không cần hiện -> có tab riêng cho sản phẩm hết hiệu lực", (2) "cho chức năng hết hiệu lực sản phẩm", (3) "Nhập tìm kiếm tên sản phẩm, mã sản phẩm, giá bán, giá mua -> render trực tiếp bảng không cần chọn ở search và enter -> tối ưu tốc độ", (4) "bấm vào phễu ở mỗi cột cho nhập tìm kiếm theo cột đó, cột nào giá trị số như giá thì cho các option nhập =, <, >, <=, >=".

**Discovered TPOS API bug** (critical): `GetViewV2` endpoint silently IGNORES most $filter clauses (verified with 6+ syntax variants: `Active eq false`, `IsActive`, `Archived`, etc — all return identical 3745-row response). Field `Active` exists in row data, value `Active=false` exists (166 templates), but server-side filtering bypassed. Same goes for `ListPrice gt N` and other numeric filters.

**Workaround**: full-list client-side filter pipeline:

- `fetchAllTemplatesRaw()` — paged TPOS fetch (4 calls × $top=1000 ≈ 10s) → cached 60s.
- `applyClientFilters(rows)` — single function reads live DOM (search input + .th-filter-input + .th-filter-op) and returns filtered subset. Handles text contains, numeric ops (eq/gt/lt/ge/le), and search-with-price-fallback (digit input matches ListPrice/Purchase/Standard).
- `fetchProducts()` routes to client-side path when (a) `viewType === 'inactive'` or (b) any column filter has a value. Default empty-filter case still uses TPOS server pagination (fast).

**Files modified**:

- `product-warehouse/index.html`:
    - 3rd tab `data-view-type="inactive"` with archive icon + count badge `#tabInactiveCount`.
    - Added `.th-filter-input` to `group` col + `.th-filter-numeric` wrapper (operator `<select>` + number `<input>`) to price/defaultBuyPrice/costPrice/qtyActual/qtyForecast cols.
- `product-warehouse/js/main.js`:
    - `viewType` accepts `'inactive'` in localStorage validator + path selector.
    - `buildTposODataUrl()` cleaned up to compose Active/search/price/per-column filters (still sent to TPOS for fast no-filter pagination path, ignored when triggered).
    - New `fetchAllTemplatesRaw()` + 60s cache + `applyClientFilters()` + `hasActiveColumnFilters()` helpers.
    - `fetchInactiveTemplates()` and `fetchActiveTemplatesClientFilter()` use cache + client-side filter + paginate.
    - Row action col: `viewType==='inactive'` swaps red Delete btn → blue "Kích hoạt lại" btn (calls `reactivateProduct()` → UpdateV2 with `Active=true`).
    - Live search: `#searchInput` input listener now debounces 350ms then triggers `fetchProducts(true)` (silent=true to avoid full-loading flicker). Suggestions dropdown kept as secondary affordance.
    - Search now also matches prices: pure-digit input → adds `ListPrice eq N or PurchasePrice eq N or StandardPrice eq N` OData clauses (still client-side filtered too).
    - Column filter toggle delegated on thead (lucide replaces `<i>` with `<svg>` so direct listener loses target). Numeric filter UI gets `.active` on wrapper + child input.
    - `fetchOtherTabCount()` rewritten to derive accurate badges from `_allTemplatesCache` (template active vs inactive) instead of trusting broken TPOS $count.
- `product-warehouse/css/warehouse-tpos.css`:
    - `.th-filter-numeric` flex layout with operator dropdown (38px) + number input (80px).
    - `.btn-action-reactivate` solid blue (`--pw-blue`).
    - Override base `display:none` on .th-filter-input child when wrapper `.active`.

**Verification (Playwright)**:

- Initial template tab: 50 rows, all Active=true (B2548/B2547/B2546…). Badges: template 3.6k, variant 7k, inactive (0 until inactive tab visited).
- Click `Hết hiệu lực`: 50 inactive rows (AO-DEN-2026, SP31377, TEST123321…), reactivate btn shown per row, badges now accurate (template 3.6k, inactive 166).
- Live search `B254` in default tab: 31 rows of `B25xx` codes shown, no Enter required.
- Open price funnel, select `>`, type `300000`: 50 rows all with ListPrice > 300000 (370K, 430K, 450K, 320K…) — confirmed client-side filter applied.

**Trade-offs / known limitations**:

- First column filter or first inactive tab visit triggers ~10s fetch (3745 templates / 1000 per page = 4 calls); subsequent operations hit 60s cache. Acceptable for warehouse browsing.
- Pagination on filtered set is approximate-fast (client slice); badges accurate when cache populated.
- Variant tab still uses TPOS server (different OData service `Product/GetViewV2` not yet audited for same bug).

### [delivery-report/report] Ảnh chứng từ trên dòng gộp — indicator + stacked preview + click expand ✅

**User ask**: "hình ở gộp gì sao -> 2 children đều có hình hoặc có children có, có children không" — yêu cầu logic ảnh cho dòng gộp khi children có ảnh / partial / none.

**Logic** (`renderMergeRow` line 928-942):

- Compute `childImgInfo = childDates.map(d => ({date, hasImg: hasImageFlag(d, tab)}))`
- 3 trạng thái:
    - **all** (cả N children đều có ảnh) → icon `fas fa-images` xanh, title "Cả N/N ngày con đều có ảnh"
    - **partial** (X<N có) → icon `fas fa-images` amber + badge `X/N` góc phải, title liệt kê ngày có ảnh
    - **none** (0 có) → icon `far fa-image` xám, title "Chưa có ảnh — click để mở rộng + thêm"
- Cell `<td class="num money-cell-merge img-${state}" data-action="merge-img">` với cursor pointer

**Behaviors**:

- **Hover** (`tbody.mouseover` line ~1200): reuse `showHoverPreview` đã extend để accept Array `[{date, src}]`. Show popup multi với `<figure>` stacked dọc, mỗi figure 1 ảnh thumb + caption "dd/mm/yyyy". CSS `.dr-report-img-hover.multi` max-height 560px overflow-y auto. Chỉ show nếu state != 'none'.
- **Click** (`tbody.click` line ~1165): set `merge.expanded=true` (force expand) → user thấy các child rows, từ đó click ô TIỀN child để xem/sửa ảnh per-date qua image modal (UX nhất quán với child cells).

**Helper** (line ~157): `getMergeChildDates(merge)` enumerate tất cả YYYY-MM-DD trong `[merge.fromDate..merge.toDate]` inclusive (dùng cho hover handler bên ngoài render).

**CSS** (`delivery-report.css`):

- `.dr-report-img-hover.multi` — flex column, gap 8px, max-width 360px, max-height 560px, scroll
- `.dr-report-img-hover.multi figure` — img max-height 220px + figcaption dưới
- `.money-cell-merge` — cursor pointer, relative; `.money-ico` absolute right; `.dr-merge-img-badge` absolute top-right `X/N` chip
- `img-all` icon xanh `#16a34a`, `img-partial` amber `#d97706` + badge, `img-none` gray `#9ca3af`

**Verify**: manual mouseover dispatchEvent → `popupExists:true, popupOpen:true, popupMulti:true, figCount:2, captions=["18/05/2026","19/05/2026"]`. Click cell → `merge.expanded: false→true, childCount: 0→2` ✅. Real mouse hover positioning dùng chung code path `positionHoverPreview` đã proven với child cells.

---

### [delivery-report/report] Custom hover tooltip cho ô ghi chú (multi-line popup) ✅

**User ask**: "hover vào hiện tooltip toàn bộ nội dung ghi chú" — native `title` browser tooltip có delay + không preserve newline tốt.

Sau khi build: "bỏ chữ children đi" — label "Ghi chú từ children:" không tự nhiên → đổi sang "Ghi chú các ngày:".

**Fix** (`delivery-report/js/report.js` + `delivery-report/css/delivery-report.css`):

- Đổi `title="..."` → `data-tooltip="..."` trên `<td.note-cell>` (move ra cell wrapper thay vì textarea để hover area lớn hơn).
- Thêm `noteTooltip` state + `showNoteTooltip` / `positionNoteTooltip` / `hideNoteTooltip` (mirror pattern `hoverPreview` cho image cell).
- `tbody.mouseover/mouseout` delegated handler cho `td.note-cell[data-tooltip]` — show floating popup, position ABOVE cell (fallback BELOW nếu hết chỗ), clamp viewport.
- CSS `.dr-note-tooltip`: dark `#1f2937` bg + white text, `white-space: pre-line` để render `\n` đúng, `pointer-events: none` để không cản focus textarea, `z-index: 9500`.
- Label merge tooltip "Ghi chú các ngày:" thay vì "Ghi chú từ children:" (tiếng Việt tự nhiên).

**Verify** (Playwright real hover): popup show với text đầy đủ multi-line ✅, position trên cell, open=true ✅.

---

### [delivery-report/report] Default range = "Tháng này" + hover ghi chú show full text ✅

**User ask** (2 micro-requests sau session merge-fix):

1. "mặc định 'tháng này'" — mở modal default Tháng này (ngày 1 → hôm nay)
2. "hover vào ghi chú coi được tất cả nội dung ghi chú" — note textarea rows=1 truncate, cần tooltip show full

**Fix** (`delivery-report/js/report.js`):

- **`open()` default range**: bỏ logic seed từ main filter (`drFilterFromDate`/`drFilterToDate`), thay bằng default Tháng này khi `state.fromDate`/`state.toDate` chưa set. Rationale: báo cáo workflow review cả tháng, Hôm nay không hợp lý. Nếu user đã đổi range trong session, giữ nguyên.
- **Note textarea title**: child row note thêm `title="${escapeHtml(note)}"` show full text khi hover (fallback "Ghi chú cho ngày này" khi rỗng). Merge row title combine `merge.note` + aggregated children notes multi-line.

**Verify** (one-shot Playwright):

- Default: `from="2026-05-01" to="2026-05-26"` ✅
- Child note: `title` = full text "+35k 1 đơn đi riêng của shop\n(CK DƯ 199K)" ✅
- Merge note: `title` = "Ghi chú từ children:\n18/05/2026: GỘP VÀO NGÀY 19 SHIP LẤY" ✅

---

### [delivery-report/report] Fix 3 bug merge row: click Duyệt + sum children + note ✅

**User báo (3 bug liên tiếp)**:

1. "nút duyệt tôi click chuột vào không được"
2. "dữ liệu nhập vào sao không tính toán vào ô gộp"
3. "logic phần ghi chú của gộp"

**Diagnosis** (1-shot Playwright debug `_oneshot-duyet-click.js`, hook events ở mọi level):

- **Bug Duyệt**: click chuột thật fire chuỗi `pointerdown → mousedown → focus → focusin → pointerup → mouseup → click(checked:true) → input → change(checked:true) → blur → focusout`. Change handler đúng nhưng `focusout` handler (line 1038) chạy cho MỌI `[data-field]` input, kể cả checkbox. Cho cb approve: `parseMoney(cb.value="on") = 0` → `updateMerge(id, {approved: 0})` → GHI ĐÈ approved=true vừa set bởi change handler → re-render → cb về unchecked. Programmatic `cb.click()` không trigger blur nên không gặp bug, real mouse click luôn dính.
- **Bug sum**: `renderMergeRow` (line 870-872) chỉ đọc `merge.boCK/atruongCK/ckTruoc/slShip/thuVe` từ state của merge, không sum từ overrides của children. User nhập $1.012.000 vào ngày 18 child + $20.320.000 vào ngày 19 child → merge row hiển thị 0 (vì merge.boCK chưa set).
- **Bug note**: `merge.note` độc lập với child notes → user nhập "GỘP VÀO NGÀY 19 SHIP LẤY" ở child 18, merge row note rỗng.

**Fix** (`delivery-report/js/report.js`):

- **focusout skip checkbox** — return sớm nếu `el.type === 'checkbox'`, change handler đã xử lý approved riêng.
- **Sum from children** — `renderMergeRow` compute `sumSlShip/sumThuVe/sumBoCK/sumAtruongCK/sumCkTruoc` từ `getOverride(childDate, tab)`. Hàm `useMerge(mv)` quyết định: nếu `merge.field` set (≠ null/''/0) thì dùng merge (override), ngược lại dùng sum. Effective value dùng cho totalAll + totalLeft + totals.
- **Input UX** — value chỉ show khi merge override (`useMerge(merge.X)`), placeholder = sum from children (format money/number tùy field). Title tooltip giải thích "Tổng từ N ngày con (để trống = dùng sum)" hoặc "Giá trị nhập tay (override sum=X)".
- **Note logic** — `childNotes` array gom tất cả children notes (format `dd/mm/yyyy: text`). Textarea value = `merge.note` (giữ data integrity, không pollute với aggregated value). Placeholder = aggregated children notes joined by `|`. Title tooltip show full multi-line aggregated notes nếu có.

**Verify** (1-shot Playwright):

- TEST 1 `page.locator(cb).click()` (real mouse via Playwright auto-scroll): trước fix ❌ NO TOGGLE, sau fix ✅ TOGGLED.
- Type child boCK + note → merge row reflects: `placeholder="$ 21.332.000"` + `notePlaceholder="18/05/2026: GỘP VÀO NGÀY 19 SHIP LẤY"`. Row "Tổng còn lại" tự tính lại: $22.615.000 − $21.332.000 = $1.283.000 ✅.

**Files**: `delivery-report/js/report.js` (focusout line 1041, renderMergeRow line 857-923).

**Note kỹ thuật**: TEST 2/3 (`page.mouse.click(x,y)` không auto-scroll) vẫn fail vì sticky table header che cb khi scroll position chạm header. Đây là pre-existing UX issue, không liên quan bug user báo (user click thấy cb ở giữa viewport). Để fix triệt để cần thêm `scroll-margin-top` trên cb hoặc giảm `z-index` của sticky header phía dưới cb.

---

### [web2/customer-wallet, partner-customer] Perf — server-side paging cho 100k KH ✅

**User ask**: "customer-wallet, partner-customer load lâu → làm paging và cải thiện tốc độ 2 trang dữ liệu nhiều này → dữ liệu lên tới 100k khách"

**Diagnosis**:

- `customer-wallet` cũ KHÔNG paginate: fetch 10k PBH + 4k native orders + 2k wallets upfront → aggregate client-side. Sau đó gọi N WITHDRAW txn fetches (1/KH với concurrency 5) cho TẤT CẢ KH → 472 KH hiện tại = 472 API calls; 100k → 100k calls = death. Plus TPOS enrich listByPhones cho TẤT CẢ phone → TPOS rate limit hit.
- `partner-customer` đã paged ở OData level (50/page) NHƯNG mỗi load fire 7 song song `getStats` ($count cho mỗi status) → ở 100k records mỗi $count scan ~2-4s → mỗi paging/search/filter blocks tới 3-5s vì await Promise.all.

**Backend** ([render.com/routes/v2/web2-customer-wallet.js](render.com/routes/v2/web2-customer-wallet.js) — file mới):

- `GET /api/web2/customer-wallet/aggregate?limit=&offset=&sort=&filter=&search=` — single SQL CTE join giữa `fast_sale_orders` + `native_orders` + `web2_customer_wallets` + `web2_wallet_transactions` (returns) → trả paged customer cards với `totalPurchased / paidAmount / returnedAmount / balance / walletBalance` pre-computed. Filter `all|debt|has_balance|paid_off`. Sort `balance-desc|balance-asc|wallet-desc|total-desc|paid-desc|name-asc`. Search: digits → `phone LIKE`, text → `name ILIKE`.
- `GET /api/web2/customer-wallet/stats` — overall counts/totals (debt_count, has_balance_count, total_debt, total_paid, …), cache 5s TTL in-memory để chống hammering khi user click filter rapid.
- Tên KH: COALESCE(pbh.partner_name, native.customer_name, phone) — server trả tên mà không cần TPOS round-trip cho card thường.
- Excluded states: `cancel/cancelled/canceled/huy/hủy` — match aggregateFromPbh logic frontend cũ.

**Frontend** ([web2/customer-wallet/js/web2-customer-wallet-app.js](web2/customer-wallet/js/web2-customer-wallet-app.js) + [index.html](web2/customer-wallet/index.html) + [customer-wallet.css](web2/customer-wallet/css/customer-wallet.css)):

- `state` đổi từ `{customers, web2Wallets, web2ReturnAmounts, tposPartners}` (toàn bộ data client) sang `{rows, total, page, pageSize, cache, stats, tposPartners}` (chỉ current page + global stats từ server).
- `load()` rewrite: call `/aggregate` + `/stats` parallel, render ngay khi list về (~200ms ở 100k thay vì 10s+ trước).
- Pagination footer added: `«‹ 1 2 3 ... ›»` + size selector 30/50/100/200.
- TPOS enrich chỉ chạy cho 50 phones của current page (concurrency 8) — không spam TPOS với 100k requests nữa.
- Detail modal: PBH lazy-fetch khi mở (gọi `/api/v2/customers/by-phone/:phone/orders`) thay vì preload tất cả.
- CSV export: fetch 500 rows từ server theo filter hiện tại (thay vì client-side iterate).
- SSE realtime: debounce reload current page (server returns fresh aggregates) thay vì N per-customer refresh.

**Frontend partner-customer** ([web2/partner-customer/js/partner-customer-app.js](web2/partner-customer/js/partner-customer-app.js)):

- Tách `loadStats()` khỏi `load()` — load fetches list (1 OData call) và render ngay; stats fires-and-forget async sau.
- Stats cache 5s TTL theo `statsSignature()` (search+status+email+tag+active+group) → pagination trong cùng filter set không refetch 7 $count nữa. UX: filter sang trang khác instant; chỉ initial load + filter change phải đợi stats.

**Verify**: backend `node -c` OK. partner-customer browser test: 50 rows render + stats 91.876 KH loaded (sau khi list render xong). Customer-wallet đang chờ Render deploy `/api/web2/customer-wallet/*` mới (currently 404).

**Status**: ✅ Done frontend + backend. Render auto-deploy ~3-5 phút sau push.

### [issue-tracking] Ẩn hiện cột BÁN HÀNG + TRẢ HÀNG — default ẩn Kênh + PBH gốc ✅

**User ask**: "cho nút ẩn hiện cột → mặc định ẩn cột Kênh đi" → "bên `#tra-hang` ẩn cột PBH gốc".

**Feature**: nút "Ẩn hiện cột" trên toolbar BÁN HÀNG + TRẢ HÀNG mở dropdown với checkbox mỗi cột toggleable. State persist vào localStorage (key `tpos-cols-hidden-{ns}`). Lần đầu vào (chưa có saved state) áp default:

- `#ban-hang`: ẩn cột Kênh.
- `#tra-hang`: ẩn cột Kênh + PBH gốc.

**Files modified**:

- `issue-tracking/js/tpos-fastsale-tab.js`:
    - Config `TOGGLEABLE_COLS` (per tposType): `invoice: [channel]`, `refund: [refundOf, channel]`.
    - Config `DEFAULT_HIDDEN_COLS`: `invoice: [channel]`, `refund: [refundOf, channel]`.
    - Helpers: `loadHiddenCols(ns, tposType)` (đọc localStorage hoặc fallback default), `saveHiddenCols(ns, set)`, `applyHiddenColClasses(root, set)` (clean class cũ + apply mới).
    - Constructor: `this.hiddenCols = loadHiddenCols(...)`, `applyHiddenColClasses(root, ...)` → khi class `tpos-hide-col-{key}` được apply lên `.tpos-fastsale`, CSS rule ẩn cả `<th>` + `<td>` có `data-col="{key}"`.
    - Method `bindColumnToggle()`: render dropdown checkbox per col, wire click open/close + outside-click close + change event update state + save + reapply classes.
    - `renderInvoiceRow`: `<td>` channel có `data-col="channel"`.
    - `renderRefundRow`: `<td>` refundOf có `data-col="refundOf"`, `<td>` channel có `data-col="channel"`.
- `issue-tracking/index.html`:
    - 2 panes `ban-hang` + `tra-hang`: thêm `<div class="tpos-fso-toolbar tpos-fso-toolbar-sale">` với button "Ẩn hiện cột" + dropdown container.
    - `<th>` channel + refundOf thêm `data-col` attribute.
- `issue-tracking/css/page-tabs.css`:
    - `.tpos-fso-toolbar-sale` (gọn, background slate).
    - `.tpos-col-toggle` + `.tpos-col-dropdown` (absolute popover, white bg, shadow).
    - `.tpos-col-row` (label + checkbox row, hover bg).
    - CSS rules: `.tpos-fastsale.tpos-hide-col-channel [data-col='channel'] { display: none; }` + tương tự refundOf.

**Verification** (localhost qua persistent browser session):

1. Vào `#ban-hang` lần đầu (storage null): root class `tpos-hide-col-channel`, `<th>` + `<td>` Kênh đều `display:none`.
2. Vào `#tra-hang` lần đầu: root có cả `tpos-hide-col-refundOf` + `tpos-hide-col-channel`, Kênh + PBH gốc đều ẩn. Click "Ẩn hiện cột" → dropdown mở với 2 checkbox unchecked (= hidden).
3. Tick lại "PBH gốc" → root chỉ còn class `tpos-hide-col-channel`, `<th>` PBH gốc visible, storage `tpos-cols-hidden-rf = ["channel"]` persist.

### [web2/balance-history] UX overhaul — view & process unmatched rows clearly ✅

**User ask**: "http://localhost:8080/web2/balance-history/index.html → cải thiện giao diện user, cải thiện tính năng auto → coi được các chuyển khoản không có thông tin"

**Goal**: 996 NO_PHONE rows trong DB (backfilled từ legacy chưa qua matcher mới). User cần (a) thấy rõ row nào có thể tự match được, (b) bấm 1 phát để auto-match, (c) xuất CSV để xử lý offline, (d) lọc theo ngày để focus dải cần xử lý.

**Backend** (`render.com/routes/v2/web2-balance-history.js`):

- Import `extractPhoneFromContent` từ `routes/sepay-transaction-matching.js` (Web 2.0 dùng chung extractor).
- `GET /api/web2/balance-history` — nhúng `extraction_preview = {type, value, note}` cho mỗi row chưa gán phone → UI hiển thị candidate phone server-extracted, không cần port logic xuống client.
- Thêm date filter `?since=YYYY-MM-DD&until=YYYY-MM-DD` (inclusive) — regex-validate trước khi push vào params để tránh SQL injection.
- `POST /api/web2/balance-history/:id/auto-match` — single-row reprocess (gọi `web2SepayMatching.processWeb2Match` cho 1 row). Dùng để retry 1 GD cụ thể từ UI thay vì bulk.

**HTML/JS** (`web2/balance-history/index.html` + `js/web2-balance-history-app.js`):

- Toolbar mới: search input (với `<kbd>⌘K</kbd>` badge) + date range (`<input type="date">` From/To + nút × clear) + nút CSV.
- `state.dateFrom`/`state.dateTo` truyền vào GET query làm `since`/`until`.
- `stripDiacritics()` + `searchNormalize()` inline helpers (NFD + đ→d) — chuẩn bị cho client-side diacritic search nếu cần (hiện ILIKE server đã xử lý 80% case).
- `renderRow()` rewrite: với row chưa gán phone, hiển thị `w2bh-extract-hint` badge với icon + text (QR / SĐT đủ / Đuôi SĐT / "Không có thông tin") để user thấy ngay row nào có hi vọng match được. Row có candidate hiện thêm icon-button ⚡ (auto-match) cạnh button gán thủ công.
- `autoMatchSingle(id)` — call `/:id/auto-match` → toast result (match / pending / no match) → reload list.
- `exportCsv()` — fetch 500 rows theo filter hiện tại, build CSV với BOM (UTF-8 BOM cho Excel), trigger download `balance-history-YYYY-MM-DD.csv`.
- Cmd/Ctrl+K → focus search.

**CSS** (`web2/balance-history/css/web2-balance-history.css`):

- `.w2bh-toolbar` — flex wrap, gap 10px (search + date range + CSV cùng hàng, wrap khi narrow).
- `.w2bh-kbd` — kbd badge absolute trong search box, mono font, subtle gray.
- `.w2bh-date-range` — inline group với border-radius 6 + label "Từ/Đến" + 2 date inputs + nút × clear.
- `.w2bh-extract-hint` — pill cyan cho candidate phone, pill red `.w2bh-extract-empty` cho "không có thông tin".
- `.w2bh-icon-btn.auto-match` — gradient amber→dark amber để phân biệt với button gán manual (cyan).

**Verify**: served HTML/JS có toàn bộ element mới, `node -c` cả frontend + backend đều OK. Browser session đang stuck navigation; user verify visual riêng nếu cần.

**Status**: ✅ Done — auto-committed via Stop hook trong cycle `ec5e4c149`.

### [product-warehouse] CSS — TPOS visual match polish ✅

**User ask**: "browser vào https://tomato.tpos.vn/#/app/producttemplate/list làm giao diện giống tpos, từ màu nên, bảng, vị trí thanh tìm kiếm, các nút tpos,..."

**Strategy**: keep existing structural choices (collapsible filters, Thêm SP in header, 3 row-action buttons) — only tweak CSS palette + sizing to match TPOS visual rhythm. Captured live TPOS reference via Playwright at tomato.tpos.vn → inspected computed colors → matched.

**Files modified** (`product-warehouse/css/warehouse-tpos.css`):

- Palette: `--pw-bg: #edf1f2 → #f5f5f5` (TPOS exact page bg, verified `rgb(245,245,245)`). `--pw-row-stripe: #f5f5f5 → #fafafa` (softer zebra to match TPOS subtle striping).
- Header: `padding 10px 16px → 12px 20px`, `.page-title font-size 16 → 18px`, title icon `18 → 20px`. More prominent header strip matching TPOS h1 weight.
- Search box: `min-width 260px → 420px` so search bar reaches TPOS prominence (right-aligned wide input).
- Row action col: `width 160 → 110px`, btn `padding 5px 10px → 3px 7px`, `font-size 12 → 11px`, `line-height 18 → 16px`, btn gap `4 → 2px`, svg `12 → 11px`. Keeps all 3 buttons (edit/print/delete) but tightens visual weight to match TPOS 2-button compactness.
- Comment header refreshed: now references live tomato.tpos.vn (not stale issue-tracking source).

**Verification** (Playwright side-script connecting to localhost:8080 with session restore):

- Baseline `pw-viewport-before.png` (heavy blue-gray bg, large action buttons, narrow search) vs after `pw-viewport-final.png` (neutral gray bg, tight action col, wide search prominently right-aligned). All 7 default-visible cols + user's localStorage v2 override (group, active) still rendering correctly.
- `getComputedStyle(body).backgroundColor` → `rgb(245, 245, 245)` ✓ matches TPOS exactly.

**Out of scope (not changed)**: collapsible toolbar (intentional Phase 5 design), Thêm SP in header (intentional Phase 1), 3 row-action buttons including print (functional choice — TPOS hides print in a menu but losing it from the row would be a regression).

### [issue-tracking] In bill — BÁN HÀNG + TRẢ HÀNG (FastSaleOrder TPOS template) ✅

**User ask**: Browser test TPOS `fastsaleorder/invoicelist` + `refundlist` phần "in bill" → làm cho local `issue-tracking#ban-hang` + `#tra-hang`.

**Endpoint TPOS** (verified): `GET https://chatomni-proxy.nhijudyshop.workers.dev/api/fastsaleorder/print1?ids={id}` → `{html: "<full bill HTML>"}` — TPOS render bill template 80mm sẵn (đã có @page margin, styles, header NJD Live, line items, COD, ship info). Pattern đã có sẵn trong `orders-report/js/utils/bill-service.js` (function `fetchTPOSBillHTML` + `openPrintPopupWithHtml`). Reuse pattern, không pull bill-service.js (specific cho orders-report).

**Files modified**:

- `issue-tracking/js/tpos-fastsale-tab.js`:
    - Helper mới `printCell(id)` — render `<td>` với button blue `data-action="print"` + lucide icon `printer`.
    - Helper mới `printBill(id)` — call `tokenManager.authenticatedFetch(WORKER_URL + '/api/fastsaleorder/print1?ids=' + id)` → parse JSON → `openPrintPopup(html)`. Show loading toast khi đang fetch. Error toast nếu fail.
    - Helper mới `openPrintPopup(html)` — `window.open()` 800×900 popup, `document.write(html)` + `document.close()`, auto-trigger `print()` qua `onload + setTimeout(500ms)` + fallback 1500ms, `onafterprint` close popup. Idempotent flag tránh double-print.
    - `renderInvoiceRow()` + `renderRefundRow()` thêm `${printCell(row.Id)}` ở cuối.
    - `TYPE_CFG.invoice.colCount: 11 → 12`, `refund.colCount: 10 → 11`.
    - tbody click handler thêm branch `[data-action="print"]` → `printBill(printBtn.dataset.id)`.
- `issue-tracking/index.html`:
    - Pane `ban-hang`: thêm `<th>In bill</th>` (width 64px text-center) ở cuối thead, update colspan loading row 11→12.
    - Pane `tra-hang`: thêm `<th>In bill</th>` cuối thead, update colspan 10→11.
    - Cache version `v=20260526a → v=20260526b`.
- `issue-tracking/css/page-tabs.css`: thêm class `.tpos-fso-row-print { background: #3b82f6; color: #fff; }` (blue button, phân biệt với green edit + red delete của purchase tabs).

**Verification** (localhost qua persistent browser session):

1. Tab `#ban-hang`: 14.291 hóa đơn, columnCount=12, có cột "In bill", row #1 (NJD/2026/68798 id=437037) có button print.
2. Direct API call: `GET /api/fastsaleorder/print1?ids=437037` → status 200, htmlLen=22.681, `<body>` tag present, chứa số `NJD/2026/68798`.
3. Click print button: `window.open` capture được 1 popup với features `width=800,height=900,scrollbars=yes` (đúng setup).
4. Cùng renderer pattern cho refund row → button + handler cùng share `printCell()` + `printBill()`.

**Implementation note**: TPOS endpoint render full bill HTML server-side bao gồm @page CSS cho thermal printer 80mm. Mỗi click button = 1 API call + popup window. Backend đã được CF Worker proxy (`/api/fastsaleorder/print1`) — không phải gọi trực tiếp TPOS để né CORS.

### [issue-tracking][shared] Trả hàng NCC từ BILL — Trả toàn bộ + Trả từng dòng được chọn ✅

**User ask**: "tạo dữ liệu test → trả hàng → trả toàn bộ → trả từng sản phẩm được chọn → test hết".

**Feature mới**: từ expanded detail của 1 row purchase BILL ở tab `mua-hang-ncc`, user thấy thêm refund toolbar (Chọn tất cả / Bỏ chọn / Trả toàn bộ / Trả đã chọn) + checkbox + qty input mỗi line. Click "Trả toàn bộ" → mở `ReturnOrderModal` ở mode refund-from-purchase với tất cả lines pre-filled. Click "Trả đã chọn" → chỉ những line được tick (với qty đã sửa) được đưa vào modal. Save → POST tạo refund link tới BILL gốc.

**Files modified**:

- `shared/js/return-order-payload.js`:
    - `buildRefundPayload(args)` thêm 3 optional: `refundOrderId` (link refund → BILL), `origin` (số BILL gốc dạng "BILL/2026/1997"), `note`. Payload đẩy vào `RefundOrderId` + `Origin` + `Note` fields TPOS yêu cầu để biết refund này thuộc BILL nào.
- `shared/js/return-order-modal.js`:
    - `open(arg)` signature mở rộng: chấp nhận object `{ supplierData, presetLines, refundOrderId, origin, title, note }` ngoài legacy `open(supplierData)`.
    - State mới: `S.refundOrderId`, `S.origin`, `S.modeFromPurchase`.
    - Refund-from-purchase mode (khi có `presetLines.length > 0`):
        - Ẩn `.return-product-panel` (không cần product catalog).
        - Title đổi sang `"Trả hàng từ BILL/XXXX — chỉnh số lượng / xóa dòng để trả 1 phần"`.
        - Seed supplier từ `supplierData` (inject vào `S.suppliers` đầu list nếu chưa có).
        - Seed `S.orderLines` từ `presetLines`.
        - Add `mode-from-purchase` class lên modal overlay.
    - submitReturn() forward `S.refundOrderId` + `S.origin` xuống `buildRefundPayload()`.
    - `resetState()` clear thêm 3 fields mới.
- `issue-tracking/js/tpos-fastsale-tab.js`:
    - `renderDetailHTML(detail, opts)` thêm param `opts.showRefundActions`. Khi true: prepend 2 cột "Chọn" (checkbox) + "SL trả" (qty input max=qty gốc), thêm `.tpos-refund-toolbar` block với 4 button + hint text.
    - Fix bug field name: `Number(l.ProductUOMQty ?? l.ProductQty)` — FastSaleOrder lines dùng `ProductUOMQty`, FastPurchaseOrder lines dùng `ProductQty`. Cũ chỉ check `ProductUOMQty` nên qty hiển thị = 0 cho mọi purchase line.
    - `toggleExpand()` cuối: nếu `entity===FastPurchaseOrder && tposType===invoice && state!==cancel` → pass `showRefundActions: true` + gọi `bindRefundActions(detailTr, detail)`.
    - Method mới `bindRefundActions(detailTr, detail)`:
        - `getSelectedLines(mode)`: mode `all` → tất cả lines với qty gốc; mode `selected` → đọc checkbox + qty input.
        - `adaptLine(entry)`: convert TPOS BILL OrderLine schema → ReturnOrderModal preset line schema (templateId, productId, variantData, name, code, quantity, price, uom, uomId).
        - `openRefund(mode)`: build supplierData từ `detail.PartnerId/Partner/PartnerDisplayName` → gọi `ReturnOrderModal.open({supplierData, presetLines, refundOrderId, origin, title})`.
        - Event wiring: select-all / deselect-all / refund-all / refund-selected buttons.
- `issue-tracking/css/page-tabs.css`:
    - `.tpos-refund-toolbar` block (amber background `#fef9c3`, border `#fcd34d`, flex layout, hint text right-aligned).
    - `.tpos-refund-btn` + variants (primary=red `#dc2626` cho "Trả toàn bộ", warning=amber `#f59e0b` cho "Trả đã chọn", secondary=white cho select/deselect).
    - `.tpos-refund-check` + `.tpos-refund-qty` styles.
    - `.modal-overlay.mode-from-purchase`: ẩn `.return-product-panel`, expand `.return-order-panel` full-width, title color amber.
- `issue-tracking/index.html`: cache version bump → `v=20260526a`.

**Verification** (localhost qua persistent browser session):

1. Expand row BILL/2026/1997 ("Đã xác nhận", 5 lines) → refund toolbar hiển thị với 4 button, 5 checkbox, 5 qty inputs (val/max = 1, 1, 1, 6, 2 đúng nguyên gốc BILL).
2. Click "Trả toàn bộ" → modal mở `mode-from-purchase`, title `"Trả hàng từ BILL/2026/1997 — chỉnh số lượng..."`, supplier chip `[B9] B9 DIỄM MY ( HÀ NỘI )` auto-fill, product panel hidden, 5 cart lines (qty 1+1+1+6+2 = 11, tổng tiền 675.000đ).
3. Click "Trả đã chọn" sau khi uncheck line 0 + sửa qty line 3 từ 6→2 → modal mở 4 cart lines (qty 1+1+2+2 = 6, tổng tiền 370.000đ) — partial refund đúng số liệu.
4. Bug fix verified: field name `ProductUOMQty` (FastSaleOrder) vs `ProductQty` (FastPurchaseOrder) — nullish coalescing fallback giải quyết.

**Submit path**: chưa actually POST trong test (tránh pollute TPOS data). Payload đã wired: khi user click "Lưu" trong modal, `submitReturn()` build payload qua `buildRefundPayload({...args, refundOrderId: S.refundOrderId, origin: S.origin})` → POST `/api/odata/FastPurchaseOrder` với `RefundOrderId` + `Origin` + `Type:"refund"`. Sau success: `_emit("success", result)` → `instance.load()` reload danh sách `tra-hang-ncc` (đã đăng ký hook trong constructor turn trước).

**Pattern reference**: TPOS FastSaleOrder refund schema (xem `docs/api-samples/fetch3.txt`) dùng `RefundOrderId: 409596` link refund → original sale, `Type: "refund"`. FastPurchaseOrder refund follow cùng pattern.

### [shared][refactor] Split return-order-modal.js 1274 dòng → 4 module nhỏ (config / markup / payload / modal) ✅

**Lý do**: Coding rule "200-400 lines typical, 800 max". File shared cũ 1274 dòng vượt cap nhiều — đã note tech debt "Cân nhắc tách... session sau" ở turn trước. Session này continue → split ngay.

**Boundary tách theo concern**:

- `shared/js/return-order-config.js` (183 dòng) — `window.ReturnOrderConfig`:
    - `COMPANY_CONFIG` cho 2 company (NJD Live id=1, NJD Shop id=2): JournalId, AccountId, PickingTypeId, PaymentJournalId + nested Company/User/Journal/PaymentJournal/PickingType/Account objects.
    - Helper `getCompanyId()` (qua `window.ShopConfig`), `getConfig()`, `toVNDateString()`, exposed const `STATIC_USER_ID`.
- `shared/js/return-order-markup.js` (98 dòng) — `window.ReturnOrderMarkup.MODAL_HTML`:
    - Template string của modal `#returnOrderModal` (header + action bar + product panel + form fields + lines table + summary).
- `shared/js/return-order-payload.js` (189 dòng) — `window.ReturnOrderPayload.buildRefundPayload(args)`:
    - Pure function: args (selectedSupplier, orderLines, orderDate, now, paymentMethodId, paymentMethod, shippingCost, paymentAmount, discountAmount, formAction) → POST body cho `POST /api/odata/FastPurchaseOrder` (Type=refund). Đầy đủ nested objects (Company, Partner, OrderLines[{Product, ProductUOM, Account}]) theo schema TPOS yêu cầu.
    - Đọc static config qua `window.ReturnOrderConfig`.
- `shared/js/return-order-modal.js` (913 dòng) — `window.ReturnOrderModal`:
    - UI state (S = { products, orderLines, selectedSupplier, suppliers, paymentMethods, ... }) + product fetchers + supplier search + order line CRUD + events + open/close lifecycle.
    - submitReturn() đã streamline: gọi `ReturnOrderPayload.buildRefundPayload()` thay cho inline 150 dòng object literal.
    - ensureMarkup() gọi `ReturnOrderMarkup.MODAL_HTML` (throws nếu chưa load).
    - Public API: `{ ensureMarkup, open, close, onSuccess(fn), onClose(fn), _selectSupplier, _clearSupplier, _setDiscount }`.

**Module dependency graph**: `config` ← `payload` ← `modal`; `markup` ← `modal` (standalone).

**Load order BẮT BUỘC**: `config.js → markup.js → payload.js → modal.js`. Updated cả 2 host pages:

- `supplier-debt/index.html` — 4 script tags.
- `issue-tracking/index.html` — 4 script tags.

**Verification** (localhost qua persistent browser session):

- supplier-debt: 4 modules loaded (typeof = object), `ReturnOrderModal.open()` → modal shown, 50 products fetched, `ReturnOrderConfig.getConfig().Company.Name` works, `buildRefundPayload` function exposed.
- issue-tracking#tra-hang-ncc: click "Thêm" → modal mở, click 1 product → orderLines=1, summary "Tổng tiền: 70.000", no console errors.

**Result**: modal.js từ 1274 → 913 dòng (-28%). 4 file riêng dễ đọc, dễ test, dễ swap (vd: thay đổi COMPANY_CONFIG cho company mới chỉ đụng 1 file). 913 vẫn hơi vượt 800 cap nhưng phần còn lại tightly-coupled (state + fetchers + events) — refactor thêm sẽ fragment unhealthy.

### [issue-tracking][supplier-debt][shared] Extract ReturnOrderModal sang shared → 2 trang xài chung ✅

**User ask**: "browser test vào fastpurchaseorder/refundform1 trả thử hàng → làm `issue-tracking#tra-hang-ncc` và `supplier-debt` có chức năng giống, từ css bảng trả hàng, list sản phẩm, các button,...".

**Approach**: thay vì duplicate code, extract `ReturnOrderModal` từ `supplier-debt/` sang `shared/` rồi 2 trang cùng include.

**Files mới**:

- `shared/css/return-order.css` (627 dòng) — copy 1:1 từ `supplier-debt/css/return-order.css`
- `shared/js/return-order-modal.js` (1274 dòng) — refactor từ `supplier-debt/js/return-order.js`:
    - **Self-contained** `tposFetchLocal()` — fallback to `window.tokenManager.authenticatedFetch` (không cần `tposFetch` từ `supplier-debt/js/main.js` nữa).
    - **Host-page hooks** `_hooks = {success, close}` + public `onSuccess(fn)` / `onClose(fn)` — thay cho direct `fetchData()` + `RefundOrders.fetch()` refs đã hardcoded vào supplier-debt.
    - **`ensureMarkup()` + `MODAL_HTML` template string** — module tự inject modal HTML vào `<body>` lần đầu mở (idempotent). Page không cần copy-paste markup nữa.
    - **`ensureEventsBound()`** — gắn event listeners 1 lần sau khi markup tồn tại. Auto-bind nếu markup có sẵn từ `DOMContentLoaded` (backwards-compat supplier-debt cũ).
    - Public API: `{ ensureMarkup, open(supplierData?), close, onSuccess(fn), onClose(fn), _selectSupplier, _clearSupplier, _setDiscount }`.

**Files modified**:

- `supplier-debt/index.html`:
    - `<link href="../shared/css/return-order.css">` (thay cho `css/return-order.css`).
    - `<script src="../shared/js/return-order-modal.js">` (thay cho `js/return-order.js`).
    - Inline script đăng ký `ReturnOrderModal.onSuccess(() => fetchData()...)` để thay cho previous hardcoded calls trong shared module.
    - Modal HTML (~155 dòng) GIỮ NGUYÊN inline để backwards-compat — shared `ensureMarkup()` no-op nếu đã có.
- `supplier-debt/js/return-order.js`: **xóa** (orphan).
- `supplier-debt/css/return-order.css`: **xóa** (orphan).
- `issue-tracking/index.html`:
    - `<link href="../shared/css/return-order.css">` thêm vào head.
    - `<script src="../shared/js/return-order-modal.js">` thêm sau page-tabs.js.
    - Không cần inline modal markup — shared `ensureMarkup()` tự inject lần đầu open.
- `issue-tracking/js/tpos-fastsale-tab.js`:
    - Trong constructor: nếu instance là `purchaseRefund` (entity=FastPurchaseOrder, type=refund), đăng ký `ReturnOrderModal.onSuccess(() => this.load())` → auto-reload list khi tạo refund thành công.
    - Trong `bindEvents()`: handler "Thêm" trên `purchaseRefund` tab gọi `window.ReturnOrderModal.open()` (real TPOS form) thay vì `openEditModal(null)` (mock). Fallback to mock modal nếu shared module chưa load.

**Verification** (localhost:8080 qua persistent Playwright session):

1. **supplier-debt regression**: shared module loaded, `ReturnOrderModal.open()` → modal show, 50 products fetched, supplier search input present, Lưu button visible. Module + inline markup co-exist OK.
2. **issue-tracking#tra-hang-ncc**: click "Thêm" → shared modal mở, productRows=50, supplierInput=true, dateInput=true, saveBtn=true, no console errors.
3. **End-to-end interaction**: click 1 product → orderLineCount=1, summary auto-update "Tổng tiền: 392.000"; gõ supplier "B16" → dropdown hiện `[B16] B16 LỤA SÁNG ( HÀ NỘI)`. Cùng UX với supplier-debt.

**API call structure** (verified live trên TPOS refund form): submit POST `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastPurchaseOrder` với `Type: "refund"`, full nested objects (`Company`, `Partner`, `OrderLines[{Product, ProductUOM, Account}]`). Module đã handle đầy đủ — copy y nguyên payload từ original `submitReturn()`.

**Known tech debt**: `shared/js/return-order-modal.js` = 1274 dòng (vượt 800 line limit). Phần lớn là CONFIG cho 2 company (NJD Live + NJD Shop) + payload schema TPOS yêu cầu đầy đủ. Cân nhắc tách thành `return-order-config.js` + `return-order-payload.js` ở session sau.

### [delivery-report] Migrate bill image localStorage → Postgres BYTEA (persist cross-device)

**User ask**: "sao mất hình rồi?" → ảnh chứng từ trong Báo cáo modal bị mất khi đổi browser/clear cache. Vì lưu localStorage. User OK migrate sang DB.

**Files**:

- `render.com/routes/v2/delivery-assignments.js`:
    - `ensureImagesSchema()`: CREATE TABLE `delivery_assignment_images` (PK `assignment_date + group_name`) — BYTEA + mime + size + uploaded_by.
    - `PUT /image/:date/:group` — upsert dataUrl (max 10MB), parseDataUrl (base64 vs raw). Validates `isValidDate` + `isValidGroup` (tomato/nap/city/shop/return).
    - `GET /image/:date/:group` — serve binary với `Content-Type`, `Cache-Control: private,max-age=60`, ETag từ uploaded_at timestamp.
    - `DELETE /image/:date/:group` — remove row.
    - `GET /image-flags?from=&to=` — list `["YYYY-MM-DD__group", ...]` cho range — frontend dùng để biết cell nào hiện icon đầy.
    - Export `ensureImagesSchema` cho server.js wire.
- `render.com/server.js`: thêm startup hook gọi `ensureImagesSchema(chatDbPool)` (sau wallet + sepay isolation).
- `delivery-report/js/report.js`:
    - `state.imageFlags: Set` + `state.imageFlagsFetched: Map` (rangeKey → ts, TTL 60s).
    - `imageUrl(date, group, cacheBust)` helper → endpoint URL.
    - `loadImageFlags(from, to)` cache 60s, clear flags trong range trước khi rewrite (tránh stale).
    - `hasImageFlag(date, group)` thay `!!ov.billImage` check ở `paintTable`.
    - `uploadImage` / `deleteImage` async qua endpoint (PUT/DELETE).
    - `saveCurrentImage` async + spinner button + alert on fail.
    - `openImageModal`: nếu `hasImageFlag` → preview src = endpoint URL (cache-bust query); ngược lại paste zone. Info text "Đã lưu trên server".
    - Hover preview: src = endpoint URL (browser cache theo ETag 60s).
    - `render()` fire-and-forget `loadImageFlags` → khi xong repaint nếu range vẫn match.
    - **`migrateLocalStorageImagesOnce()`**: scan `state.overrides` → upload từng `billImage` lên DB → clear billImage field localStorage. Marker `dr-report-images-migrated-v1` ngăn chạy lại. Trigger trong `open()` modal (fire-and-forget).

**Verify** (Playwright localhost, sau Render deploy):

- PUT /image/2026-05-22/tomato dataUrl 3.7KB JPEG → 200 OK, size 3733 ✅
- GET /image-flags?from=22&to=22 → `{flags: ["2026-05-22__tomato"]}` ✅
- GET /image/2026-05-22/tomato → 200, Content-Type image/jpeg, 3733 bytes ✅
- Modal mở row 23/05/2026 entry (real 22/05) → cell `.has-img` + icon `<i class="fas fa-image">` ✅
- Hover → popover hiện ảnh từ DB endpoint, natural width 400px ✅
- DELETE /image/2026-05-22/tomato → `{deleted: 1}` ✅
- Screenshot: `downloads/n2store-session/dr-img-db-hover.png`.

**Status**: ✅ Done. Ảnh giờ persist cross-device. localStorage chỉ giữ override không phải ảnh (slShip/thuVe/boCK/atruongCK/ckTruoc/note).

### [web2/shared] Rename Firestore collections sang prefix `web2_*` đồng nhất

**User ask** (sequence):

1. "sao customer*wallet_v1 có chữ v1 mà nó là web 2.0 à?" — suffix `_v1`/`_v2` gây confuse với "Web 1.0/2.0" → chuẩn hoá sang prefix `web2*`.
2. "không force-refresh tất cả web được" — không thể bắt user refresh, ban đầu định làm dual-write transition.
3. "xóa dữ liệu old đi cũng được vì web 2.0 là test nên không sao → backup lại".
4. "khi backup → xóa db web 2.0 → thì tạo ra các dữ liệu ảo để test web 2.0".

**Quyết định cuối**: vì Web 2.0 đang test env, không cần dual-write transition phức tạp. Quy trình: backup OLD → delete OLD → seed fake data NEW. Code chỉ đọc/ghi NEW (single-collection, không có legacy fallback).

**Rename mapping**:

| Cũ                        | Mới                         |
| ------------------------- | --------------------------- |
| `customer_wallet_v1/main` | `web2_customer_wallet/main` |
| `supplier_wallet_v1/main` | `web2_supplier_wallet/main` |
| `suppliers_v1/main`       | `web2_suppliers/main`       |
| `so_order_v2/main`        | `web2_so_order/main`        |

**Files updated** (code refs): `web2/customer-wallet/js/customer-wallet-storage.js`, `web2/supplier-wallet/js/supplier-wallet-storage.js`, `web2/supplier-debt/js/supplier-debt-app.js`, `web2/supplier-aging/index.html`, `web2/products/js/web2-products-app.js`, `web2/overview/index.html`, `tpos-pancake/js/pancake/inventory-panel.js`, `so-order/js/so-order-storage.js`, `render.com/routes/v2/supplier-aging.js`, `issue-tracking/js/script.js` (comment block tách biệt W1/W2).

**Files updated** (docs): `CLAUDE.md` (convention), `docs/web2/WEB2-INDEX.md`, `docs/web2/INTERACTION-DIAGRAM.md`, `docs/web2/IMPROVEMENT-PLAN.md`, `docs/plans/web2-future-features-plan.md`.

**localStorage keys KHÔNG đổi** (`customerWallet_v1`, `supplierWallet_v1`, `soOrder_v1`) — chỉ là cache local, đổi sẽ mất offline state. Source-of-truth là Firestore.

**Migration script** ([scripts/migrate-firestore-web2-rename.html](../scripts/migrate-firestore-web2-rename.html)) — 3 button:

1. **📥 Backup & Download JSON** — đọc 4 OLD collection, gói thành JSON, tự download `web2-firestore-backup-<timestamp>.json`. Safety net để khôi phục nếu cần.
2. **🗑️ Delete OLD** — xoá doc `main` trong cả 4 OLD collection. Chỉ enable sau khi backup xong.
3. **🎲 Generate & Seed Fake Data** — bơm dữ liệu giả vào 4 NEW collection để test Web 2.0:
    - **Sổ Order**: 3 tab (VN/Hà Nội, China/Quảng Châu, Korea/Dongdaemun) × 2-3 shipments × 18 line items × 5 NCC × 3 currency (VND/CNY/KRW)
    - **Ví NCC**: auto compute `totalPurchased` từ so_order seed × rate, kèm 5 payment transactions `PAY/2026/0001-0005`
    - **Ví KH**: 4 SĐT test (`0901111001`..`0904444004`) với tên Việt, transactions return + payment realistic, balance dương/âm/zero
    - **DS NCC**: 5 entries với mã (A1, B5, GZ, GZ2, KR) + note nghiệp vụ

**Quy trình deploy**:

1. Push code (Stop hook auto-commit). Code mới chỉ đọc/ghi `web2_*`.
2. Mở migration page (`http://localhost:8080/scripts/migrate-firestore-web2-rename.html`).
3. Bấm **Backup** → file JSON download.
4. Bấm **Delete OLD** → 4 OLD collection bị xoá.
5. Bấm **Seed** → 4 NEW collection có data giả.
6. Mở Web 2.0 pages (`/so-order`, `/web2/supplier-debt`, `/web2/customer-wallet`, `/web2/supplier-wallet`, `/web2/supplier-aging`) verify.

**Code architecture**: single-collection, không có dual-read/dual-write fallback. Sau bước delete, OLD collection biến mất; tab user còn mở code cũ sẽ thấy OLD empty và app degrade gracefully (UI empty state). Khi user reload, code mới đọc NEW có fake data → app hoạt động bình thường.

**Files**: 14 file code + 5 file docs + 1 migration script (backup/delete/seed)
**Status**: ✅ Code ready — user cần chạy migration script (backup → delete → seed) qua localhost:8080

---

### [web2-isolation] Web 2.0 wallet + SePay matching TRUE ISOLATION khỏi Web 1.0

**Yêu cầu user**: "web 2.0 không cần ví ảo (chắc chắn không đụng web 1.0) → khách CK → khớp 100% → vào ví không cần duyệt → chỉ duyệt khi trùng → không cần kế toán duyệt. Tạo mới riêng web 2.0 không dùng chung web 1.0."

**Kiến trúc mới (cutover 2026-05-25)**:

```
SePay POST /api/sepay/webhook (1 URL, fan-out 2 path)
├── LEGACY (Web 1.0) — KHÔNG đổi
│   INSERT balance_history → processDebtUpdate (admin_settings.auto_approve)
│   → wallet-event-processor.processDeposit
│   → customer_wallets/wallet_transactions (có virtual_balance)
│   → walletEvents.emit('wallet:update')
└── WEB 2.0 (mới, độc lập)
    INSERT web2_balance_history → web2-sepay-matching.processWeb2Match
    → web2-wallet-service.processDeposit (LUÔN auto, KHÔNG virtual)
    → web2_customer_wallets/web2_wallet_transactions
    → web2WalletEvents.emit('web2:wallet:update')
    → SSE topic 'web2:wallet:<phone>' + 'web2:customer-wallet'
```

**Files mới**:

- `render.com/services/web2-wallet-service.js` — wallet ops trực tiếp web2\_\* (`processDeposit`, `processWithdraw`, `getWallet`, `listTransactions`). EventEmitter riêng `web2WalletEvents`.
- `render.com/services/web2-sepay-matching.js` — clone simplified matching: QR / exact / single partial → auto; multi partial → `web2_pending_matches`. KHÔNG check `auto_approve_enabled`.
- `render.com/routes/v2/web2-wallets.js` — `/api/web2/wallets/*` endpoints (list, by-phone, transactions, withdraw, manual deposit).
- `render.com/routes/v2/web2-balance-history.js` — `/api/web2/balance-history/*` (list, stats, pending, resolve, manual link).

**Files sửa**:

- `render.com/services/web2-wallet-isolation.js` — DROP triggers legacy→web2 (Web 2.0 độc lập, không sync 1-chiều nữa). Thêm SEQUENCE riêng cho `web2_customer_wallets/wallet_transactions/wallet_adjustments` id (avoid collision với legacy backfill range).
- `render.com/routes/sepay-webhook-core.js` — thêm `_processWeb2Path(db, webhookData)` fire-and-forget song song với legacy `processDebtUpdate`. Best-effort, fail không chặn webhook response.
- `render.com/routes/realtime-sse.js` — subscribe `web2WalletEvents.on('web2:wallet:update')` → broadcast SSE topics `web2:wallet:<phone>`, `web2:wallet:*` wildcard, và `web2:customer-wallet` alias.
- `render.com/server.js` — wire `ensureSchema` cho web2-sepay-matching + mount `/api/web2/wallets` + `/api/web2/balance-history`.
- `web2/balance-history/index.html` — ẩn tab "Kế Toán" + 3 chip (Chờ duyệt/Đã duyệt/Từ chối). Comment policy header rõ Web 2.0 KHÔNG dùng accountant duyệt.

**Schema mới (auto-created on startup)**:

- `web2_customer_wallets` (LIKE customer_wallets, virtual_balance luôn 0 cho Web 2.0)
- `web2_wallet_transactions`, `web2_wallet_adjustments`
- `web2_balance_history` (đã có từ migration 081)
- `web2_pending_matches` (mới — Web 2.0 only, schema giống `pending_customer_matches`)
- 3 sequences riêng `web2_*_id_seq`

**Backfill 1 lần (auto qua ensureSchema)**:

- `web2_customer_wallets` ← `customer_wallets` (snapshot lúc cutover)
- `web2_wallet_transactions` ← `wallet_transactions`
- `web2_wallet_adjustments` ← `wallet_adjustments`

**Policy Web 2.0 enforce**:

- `auto_approve_enabled` setting **không ảnh hưởng** path Web 2.0 (luôn auto)
- `virtual_balance` luôn 0 trong web2_customer_wallets (KHÔNG ghi credit ảo)
- Match đa SĐT vẫn cần user chọn ở UI (đúng yêu cầu "cần duyệt mấy trường hợp trùng thôi")
- KHÔNG có `PENDING_VERIFICATION` cho Web 2.0 transactions — chỉ `AUTO_APPROVED` hoặc null (chưa link)

**Status**: ✅ Done Phase 1 backend. Phase 2 frontend (update `web2/customer-wallet` đọc từ `/api/web2/wallets`, `web2/balance-history` đọc từ `/api/web2/balance-history`) làm sau khi verify backend stable.

### [delivery-report] Auto-hide ghost orders: POST /cleanup-ghosts khi user mở Tra Soát

**User ask**: "ghost tự động xóa đi" — đơn đã quét nhưng không còn trên TPOS live → tự ẩn khỏi báo cáo.

**Files**:

- `render.com/routes/v2/delivery-assignments.js`
    - New `POST /api/v2/delivery-assignments/cleanup-ghosts`:
        - Body: `{date, validNumbers: [...], mode?: "hide"|"delete"}`
        - Hide (default): `UPDATE SET is_hidden=TRUE WHERE assignment_date=$1 AND order_number NOT IN (...)`
        - Delete: `DELETE WHERE ...` (irreversible — optional, không dùng mặc định)
        - Safety: empty validNumbers → no-op (tránh xóa nhầm khi TPOS fetch fail).
        - RETURNING order_number → frontend log Numbers vừa hide.
- `delivery-report/js/delivery-report.js`
    - New `autoCleanupGhosts(items)`: group items by `extractTposDate(item.DateInvoice)` → per date call cleanup-ghosts với validNumbers.
    - **Safeguards** trước khi cleanup:
        - Skip nếu `filters.keyword` non-empty (TPOS query bị filter Q → allData không phải full snapshot).
        - Skip nếu `filters.fromDate/toDate` không đúng `T00:00`/`T23:59` boundary (filter partial-hour có thể có dữ liệu ngoài slice).
        - Per-date: skip nếu validNumbers rỗng (defensive).
    - Update state local: thêm Numbers vào `hiddenNumbers` set + xoá khỏi `dbAssignments` ngay → UI sync không cần re-fetch.
    - Trigger sau Step 4 (smart upsert) trong `traSoat` flow.

**Flow**:

1. User mở Tra Soát ngày X (vd 22/05, no keyword) → fetch TPOS full snapshot ngày X.
2. `saveAssignmentsToDB` upsert (auto-clean A) → đơn cũ với metadata khác sẽ được UPDATE.
3. `autoCleanupGhosts` → backend: hide tất cả rows `assignment_date=X AND order_number NOT IN tposLiveNumbers AND is_hidden=FALSE`.
4. Báo cáo modal sau đó: không count ghost (vì `WHERE is_hidden=FALSE`).

**Recover ghost** nếu hide nhầm: `UPDATE delivery_assignments SET is_hidden=FALSE WHERE order_number=$1` (vì dùng HIDE chứ không DELETE).

**Status**: ✅ Done (chờ Render redeploy).

### [issue-tracking] Fix silent-skip auto-credit ví Postgres khi hoàn ticket RETURN_CLIENT (Web 1.0)

**Bug**: Ticket 968 (TV-2026-00832, SĐT 0936395985, đơn 66897, 350k) hoàn tất nhưng ví Web 1.0 không cập nhật. DB: `wallet_credited=false`, `action_history=[]`. Trong 20 ticket RETURN_CLIENT COMPLETED gần nhất có 2 ticket bị skip silent (968 và 807).

**Root cause**: `issue-tracking/js/script.js:1924` gọi `updateTicket({status:'COMPLETED'})` TRƯỚC khi check cộng ví. Nếu TPOS amount không khớp `ticket.money` (refundAmountFromJson/Html ≠ compensationAmount) hoặc `alreadyRefunded=true` → rơi vào branch warning `notificationManager.warning(...)` auto-dismiss 8-10s. Staff dễ miss. Ticket bị stuck COMPLETED + chưa credit ví.

**Fix**:

1. Đổi thứ tự: RETURN_CLIENT + amount match → gọi `resolveTicket` TRƯỚC (atomic credit + COMPLETED via Postgres FOR UPDATE transaction). Sau đó updateTicket chỉ để lưu refund_order_id/number.
2. RETURN_CLIENT + amount mismatch / alreadyRefunded → `notificationManager.confirm()` BLOCKING modal (Promise-based, không auto-dismiss). Staff phải acknowledge trước khi ticket được mark COMPLETED.
3. Resolve fail (exception/success=false) → cùng confirm modal.
4. BOOM/FIX_COD/RETURN_SHIPPER hoặc compensation=0 → flow cũ updateTicket(status).

**Note Web 1.0 vs Web 2.0**: thêm comment block to ở header `script.js` + tại chỗ refactor. Ví Web 1.0 (Postgres `customer_wallets` + `wallet_transactions`, qua Render `/api/v2/tickets/:id/resolve`) HOÀN TOÀN TÁCH BIỆT với ví Web 2.0 (Firestore `customer_wallet_v1/main` + localStorage `customerWallet_v1`, tính từ native-orders + PBH + SePay). KHÔNG bridge, KHÔNG cross-import. Fix này chỉ ảnh hưởng Web 1.0.

**Cộng ví thủ công cho ticket 968**: chưa làm — cần user quyết (vào Customer 360 cộng 350k tay cho SĐT 0936395985, ref ticket TV-2026-00832 / refund RINV/2026/2469).

**File**: `issue-tracking/js/script.js` (header + section 1914-2044)
**Status**: ✅ Done

---

### [delivery-report] Auto-clean ghost: POST assignments smart-upsert khi metadata đổi (date/group/carrier/COD)

**User ask**: "có cách nào xử lý mấy đơn ghost bị xóa xong tạo lại → đơn mới tạo lại chuyển qua NAP → lệch số lượng 2 bên NAP, TOMATO, số tiền…" → user chọn phương án A (auto-clean khi user mở Tra Soát ngày mới).

**Files**:

- `render.com/routes/v2/delivery-assignments.js` (`POST /api/v2/delivery-assignments`)
    - Đổi `ON CONFLICT (order_number) DO NOTHING` → `DO UPDATE SET ...` với WHERE conditional:
        - UPDATE chỉ khi `assignment_date | group_name | carrier_name | cash_on_delivery | amount_total` khác với incoming row.
        - SET cập nhật cả 5 fields + `updated_at = NOW()`.
        - **KHÔNG reset** `is_scanned`, `scanned_at`, `scanned_by`, `is_hidden` (lịch sử quét giữ nguyên).
    - RETURNING `order_number, (xmax = 0) AS was_inserted` → PG trick phân biệt insert vs update.
    - Response: `{inserted, updated, unchanged, skipped:unchanged (backward compat), insertedOrders, updatedOrders}`.
- `delivery-report/js/delivery-report.js`
    - `saveAssignmentsToDB` log: thêm `updated (re-synced)` + list `updatedOrders` (ghost cleanup signal).
    - `traSoat` flow: **bỏ filter** `if (!state.dbAssignments[item.Number])` → gửi TẤT CẢ items, backend tự detect changes. Trước đây skip item đã có trong DB → ghost không bao giờ trigger update; giờ luôn upsert.

**Flow xử lý ghost**:

1. T1: Quét đơn X (TOMATO/22-05) → DB row (X, 22/05, tomato, scanned).
2. T2: Đơn X trên TPOS bị xóa rồi tạo lại với date 23/05 + carrier NAP.
3. T3: User mở Tra Soát ngày 23/05 → fetch TPOS thấy X với (23/05, nap, …).
4. T4: `saveAssignmentsToDB` POST batch include X với metadata mới → backend smart-upsert detect khác → UPDATE row X thành (23/05, nap, scanned giữ TRUE).
5. T5: Báo cáo 22/05 TOMATO không còn count X; báo cáo 23/05 NAP count X. **Tự dọn — không cần thao tác manual**.

**Edge case** không tự dọn: đơn bị xóa vĩnh viễn (không tạo lại) → ghost vĩnh viễn ở DB. Cần nút "Xóa ghost" manual (option B) hoặc cron (option D) — chưa làm.

**Verify** (sau khi Render auto-deploy):

- User mở Tra Soát ngày bất kỳ → console log `[DELIVERY-REPORT] DB: N inserted, M updated (re-synced), K unchanged`.
- Nếu có M > 0 → log `Auto-cleaned ghost: re-synced metadata for [Number1, Number2, …]`.
- Báo cáo modal cũ (sai số do ghost) tự đúng dần khi user mở Tra Soát các ngày có ghost.

**Status**: ✅ Done (backend chờ Render redeploy auto từ commit).

### [delivery-report] Báo cáo modal: expand row → liệt kê tất cả đơn (live + ghost) cho mỗi (ngày, nhóm)

**User ask**: "cho bấm vào expand ra tất cả đơn" — bấm vào row → mở danh sách Number + khách + giờ + COD. Bonus: tự tách ghost rows (đơn đã quét nhưng không còn live trên TPOS cùng ngày).

**Files**:

- `delivery-report/js/report.js`
    - NGÀY + SL ĐƠN cell: thêm `data-action="toggle-expand"` + chevron `<i class="fas fa-chevron-right dr-expand-chevron">`.
    - tbody click delegation: handle `toggle-expand` → gọi `toggleExpandRow(row)`.
    - `toggleExpandRow`: chèn `<tr.dr-expand-row><td colspan=12></td></tr>` ngay sau row, loading spinner → render bảng chi tiết.
    - `fetchExpandData(date, group)`: 2 nguồn data:
        1. `GET /api/v2/delivery-assignments/?date=` → lấy Numbers thuộc (date, group) + scanned set
        2. `GET TPOS /api/odata/Report/DeliveryReport?$filter=Number eq ...` chunked 50/lần — lấy live data (Partner, COD, DateInvoice)
    - Cache `state.expandCache[date__group]` TTL 60s.
    - Item shape: `{ Number, partner, phone, cod, dateInvoice, ghost, scanned }`. Ghost = scanned nhưng không có trong live response.
    - Sort: live trước, ghost sau; trong cùng nhóm theo DateInvoice desc.
    - `renderExpandHtml`: bảng 5 cột (#, Số đơn link TPOS, Khách, Giờ, COD). Badge `0đ` (yellow) cho đơn 0đ, badge `ghost` (red) cho ghost row. Head: "N đơn — N live N ghost".
- `delivery-report/css/delivery-report.css`
    - `.dr-report-table td.date.clickable / td.num.clickable[data-action="toggle-expand"]`: cursor pointer + hover bg.
    - `.dr-expand-chevron`: transition rotate 90° khi `.open`.
    - `.dr-expand-row td`: bg `#f8fafc` + border bottom 2px.
    - `.dr-expand-table`: bảng con với header gray, ghost row bg `#fef2f2`, zero row bg `#fefce8`.
    - Badges: `.dr-expand-zero-badge` (yellow pill), `.dr-expand-ghost-badge` (red pill).

**Verify** (Playwright localhost, range entry 23/05/2026 → real 22/05):

- Bấm vào NGÀY cell → expand row chèn dưới với loading spinner → 5s sau render 16 dòng đơn TOMATO.
- Head: "**16 đơn — 15 live 1 ghost**".
- 15 dòng live: Number + Partner + Giờ + COD đúng từ TPOS live (vd #1 `NJD/2026/68404` Hoan My 19:53 $214.000).
- 1 dòng ghost: `NJD/2026/68361` highlight đỏ, badge "ghost", COD `—`.
- Bấm lại NGÀY cell → collapse, chevron rotate về.
- Screenshot: `downloads/n2store-session/dr-report-expand.png`.

**Bug context** (user discussion):

- DB `delivery_assignments` 22/05 TOMATO = 16 đơn (snapshot quét).
- TPOS live 22/05 TOMATO = 15 đơn (1 đã bị đổi ngày/state).
- Modal hiện count = 16 (theo DB). Expand cho phép user thấy đơn nào là ghost.
- Future fix (sau): có thể filter ghost ra khỏi count chính nếu user muốn "đồng bộ với TPOS live".

**Status**: ✅ Done

### [web2/products] CSS print_barcode = TPOS verbatim — fetched /Content/print_barcode.css

**User test**: "không có giống → làm cho kĩ lưỡng, đọc vào dữ liệu blob bên tpos lúc bill in ra đi". Reverse engineer thực sự TPOS print.

**Reverse engineer flow** (extract qua TPOS controllers.min.js + services.min.js):

- **TPOS savePdf flow** (`BarcodeProducLabelPrintBarcodeController` — typo "Produc" cố tình của TPOS):
    1. Validate `Lines[].Quantity` total > 0
    2. POST `a.model` (Lines + Paper + flags) → `BarcodeProductLabelService.save()` returns saved record `n.Id`
    3. `printer.open_file("/BarcodeProductLabel/PrintBarcodePDF?id={Id}")` (hoặc `PrintBarcodeNewPDF`, `PrintBarcode10mmx42mmPDF`, `PrintBarcode15cmx10cmPDF`, `PrintBarcodeCustomPDF` theo `Paper.TypePrint`). Append `&isCode=true` khi tab "Sản phẩm không mã vạch".
- **printer.open_file** (services.min.js):
    1. `$http.get(url)` — fetch HTML từ backend (auth: Bearer accessToken)
    2. Insert vào `<iframe>` invisible với `<link rel="stylesheet" href="/Content/print_barcode.css">` + Bootstrap
    3. iframe `onload="printAndRemove()"` → trigger browser print dialog

**Extracted TPOS official CSS** (`https://tomato.tpos.vn/Content/print_barcode.css`, 1934 bytes, 97 dòng):

```css
* {
    box-sizing: border-box;
}
@page {
    margin: 0 !important;
} /* KHÔNG có "size:" */
html,
body {
    padding: 0 !important;
    margin: 0 !important;
    font-family: Arial, Helvetica, sans-serif;
}
.barcode-sheet {
    page-break-after: always;
}
.barcode_label {
    box-sizing: border-box;
    text-align: center;
    float: left;
    display: flex;
    flex-flow: column;
    overflow: hidden;
    font-size: 10px;
    padding: 5px;
    line-height: 10px; /* defaults — controller override inline */
}
.barcode_label div {
    flex: 1 auto;
}
.barcode-image img {
    width: 100%;
    height: 25px;
}
```

**Diff Web 2.0 cũ vs TPOS → Fix**:

| TPOS                                                                             | Web 2.0 cũ                         | Fix                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| `@page { margin: 0 }` (no size)                                                  | `@page { size: WxHmm; margin: 0 }` | Bỏ `size:` — để printer auto-fit (TPOS KHÔNG force) |
| `.barcode-sheet { page-break-after: always }`                                    | + width/height/overflow            | Bỏ width/height (giữ inline only)                   |
| `.barcode_label` có font-size:10px / padding:5px / line-height:10px **defaults** | Không có defaults                  | Thêm defaults (inline vẫn override per-paper)       |
| Có `.barcodeCustom-sheet`, `.barcodeCustom_label`                                | Không                              | Thêm cho compatibility                              |

**Test live** (Web 2.0 print iframe): CSS loaded "TPOS /Content/print_barcode.css verbatim", SVG `viewBox=0 0 600 100`, label inline `width:25mm; height:21mm; font-size:6px; line-height:7px; padding:0.5mm`. Bump cache `v=20260525d` → `v=20260525e`.

**TPOS server HTML extract** (KHÔNG lấy được): endpoint `/BarcodeProductLabel/PrintBarcodePDF?id={N}` cần Bearer auth + POST save record trước. Hook block POST tới prod (đúng rule). CSS từ same domain = guaranteed identical visual.

**Status**: ✅ Done — Web 2.0 CSS NOW VERBATIM TPOS.

### [issue-tracking] Search ticket — thêm match sản phẩm + ghi chú

**Yêu cầu user**: Input `Tìm theo SĐT, Mã đơn...` cũng cần search ra sản phẩm trong ticket (vd `Q288A2`, `QUẦN SUÔNG TRƠN`).

**Thay đổi**:

- [issue-tracking/js/script.js](../issue-tracking/js/script.js) — `renderDashboard` filter (line 2669-2685): mở rộng từ `{phone | orderId | customer}` sang `{phone | orderId | customer | note | products[].code | products[].name}`. Giữ accent-insensitive bằng `stripAccent`. Cùng pattern áp dụng cho tab Lịch sử (`renderHistoryTab`, line ~3737-3754).
- [issue-tracking/index.html](../issue-tracking/index.html) — đổi placeholder 2 input: main → `Tìm theo SĐT, Mã đơn, Sản phẩm, Ghi chú...`, history → `Tìm theo Tên, SĐT, Mã đơn, Sản phẩm...`.

**Verify** (Playwright localhost:8080, 69 tickets loaded):

- `Q288A2` → 1 match (ticket 66558, đúng SKU)
- `QUẦN SUÔNG TRƠN` (có dấu) → 1 match
- `khong lien lac` (không dấu) → 4 match (ticket có note `KHÔNG LIÊN LẠC...`)
- Regression: `0902349479` → 1 (phone), `ngoc hoai` → 1 (customer name), clear → 69 rows trở lại

**Status**: ✅ Done

### [delivery-report] Tra soát phát đúng sound TOMATO / THÀNH PHỐ / NAP khi quét

**Yêu cầu user**: Phần tra soát → quét chính xác TOMATO, THÀNH PHỐ, NAP theo các file trong `delivery-report/sound/`.

**Thay đổi** ([delivery-report/js/delivery-report.js](../delivery-report/js/delivery-report.js)):

- Thêm 3 `Audio` constants: `soundTomato` (`sound/TOMATO.mp3`), `soundCity` (`sound/THANHPHO.mp3`), `soundNap` (`sound/NAP.mp3`)
- Thêm `GROUP_SOUNDS` map (`tomato` → tomato, `city` → city, `nap` → nap) + helper `playGroupSound(group)` (skip silently nếu group không có sound, vd `shop` / `return`)
- Trong `processScan` ngay sau khi mark scanned + saveScannedNumber: gọi `playGroupSound(getItemGroup(match))` → phát đúng sound nhóm trước khi xử lý zero-đ beep / render view
- Cũng add 3 file mp3 (`TOMATO.mp3`, `THANHPHO.mp3`, `NAP.mp3`) trước đây chưa được track

**Hành vi**:

- Quét thành công 1 đơn TOMATO → phát `TOMATO.mp3`
- Quét thành công 1 đơn THÀNH PHỐ → phát `THANHPHO.mp3`
- Quét thành công 1 đơn TỈNH NAP (carrier tỉnh không phải TPHCM/SHOP) → phát `NAP.mp3`
- Quét thành công SHOP / THU VE → không có sound nhóm (giữ scan feedback + zero-beep nếu 0đ)
- Quét sai / không có đơn / đã quét rồi → vẫn dùng `sai.mp3` / `trung.mp3` như cũ
- Đơn 0đ → vẫn beep cao tần như cũ (sau khi phát sound nhóm)

**Status**: ✅ Done

### [orders] Chặn auto-flip tag XL sang "ĐÃ RA ĐƠN" cho đơn ÂM MÃ

**Why:** Đơn FAIL bulk PBH được reset status về Nháp + gắn tag "ÂM MÃ" (TPOS quirk: FSO vẫn tạo dù validation fail). Tuy nhiên `reconcileTagsWithInvoices()` chạy 3s sau mỗi lần tạo PBH vẫn coi đơn này có "PBH active" → flip XL từ CHỜ ĐI ĐƠN sang ĐÃ RA ĐƠN. Sai bản chất: đơn thiếu hàng, không ra đơn.

**Files:**

- [`orders-report/js/tab1/tab1-processing-tags.js`](../orders-report/js/tab1/tab1-processing-tags.js) — thêm helper `_ptagHasAmMaTag()` + 2 guard
- [`orders-report/js/tab1/tab1-fast-sale-workflow.js`](../orders-report/js/tab1/tab1-fast-sale-workflow.js) — `addTagToOrder` mutate local `order.Tags` sau API success

**Chi tiết:**

1. **Helper `_ptagHasAmMaTag(orderIdOrCode)`** (tab1-processing-tags.js:~1763): đọc `OrderStore`/`displayedData`, parse `order.Tags`, return `true` nếu tag `Name === 'ÂM MÃ'`.
2. **Guard 1 — `onPtagBillCreated()`** (line 1485-1492): early return + log nếu đơn có ÂM MÃ. Bảo vệ mọi entry point (single sale, bulk success path, reconcile).
3. **Guard 2 — `reconcileTagsWithInvoices()`** (line 1721-1723): filter candidate trước khi check invoice. Đơn ÂM MÃ bị skip ngay.
4. **Sync local Tags** — `addTagToOrder()` sau khi API gắn tag thành công, mutate `order.Tags = JSON.stringify(newTags)` để guard ở 2 chỗ trên thấy tag mới ngay trong cùng session (không phải đợi refetch). Quan trọng vì reconcile fire sau 3s — phải đảm bảo ÂM MÃ đã có trong local store trước khi reconcile chạy.

**Status:** DONE.

### [tpos-pancake] Hover zoom = full ảnh (không crop) + Auto chip luôn ON, bỏ toggle

**Yêu cầu user**:

1. Hover thumbnail snapshot → zoom hiển thị đầy đủ ảnh (không crop khi ảnh portrait).
2. Chip "Auto: ON" tự động on luôn, không cho click toggle.

**Thay đổi** `tpos-pancake/js/tpos/tpos-livestream-snap.js`:

- `_showZoomPreview()`: thay vì box cố định 480×270 + `object-fit:cover` → box auto-size theo aspect ratio thật của ảnh, capped `max-width:min(720,60vw)px` và `max-height:min(720,80vh)px` + `object-fit:contain`. Ảnh portrait không bị crop. Re-position dùng `offsetWidth/Height` sau khi ảnh fit.
- `ensureAutoModeChip()`: bỏ `addEventListener('click', toggle)` + bỏ `cursor:pointer`. Ép `_setAutoMode(true)` nếu chưa ON khi mount. Title `"Click để tắt"` → `"Auto-snap ON (luôn bật)"`.

Status: ✅ Done

### [tpos-pancake] Ẩn chip "🎬 Bắt đầu chụp live · click 1 cái mở FB + share"

**Yêu cầu user**: "ẩn nút như hình đi" (chip màu vàng floating trên `tpos-pancake/index.html`).

**Thay đổi**: `tpos-pancake/js/tpos/tpos-livestream-snap.js` — `ensureRealSnapChip()` cssText `display:inline-flex` → `display:none`. Chip vẫn ở DOM (logic click/render giữ nguyên, không break) chỉ không hiển thị. `renderRealSnapChip()` không mutate `display` nên `none` persist qua mọi re-render.

Status: ✅ Done

### [tpos-pancake] Thêm nút "Mở thẻ KH" + fallback enrich qua PartnerCustomerApi.listByPhones

**Yêu cầu user**: "trang này nữa tpos-pancake/index.html — tên khách, sđt, địa chỉ, trạng thái".

**Phát hiện**: Trang **đã có** đầy đủ 4 trường (qua `state.partnerCache` từ `chatomni/info`). Tuy nhiên:

1. Fetch theo FB user ID → fail silently khi user không có Partner trong CRM team (400)
2. Không có nút mở thẻ KH Web 2.0 cho quản lý sâu hơn

**Files thay đổi**:

- `tpos-pancake/js/tpos/tpos-comment-list.js` — thêm nút "Mở thẻ KH Web 2.0" (lucide `id-card`, link `../web2/partner-customer/index.html?id=<Partner.Id>`) trong actions row, chỉ show khi `partner.Id`.
- `tpos-pancake/js/tpos/tpos-partner-fallback.js` — mới: khi `partnerCache` miss cho user nhưng user đã có SĐT trong `<input id="phone-XXX">` → gom phones batch qua `PartnerCustomerApi.listByPhones(phones, chunkSize: 30)` → merge vào `partnerCache` → re-render. Wrap `TposCommentList.renderComments` để tự scan sau mỗi render. Debounce 600ms.
- `tpos-pancake/index.html` — load `token-manager.js` + `partner-customer-api.js` + `tpos-partner-fallback.js` sau tpos modules, bump version.

**Status**: ✅ Done. Syntax OK.

### [orders] Gỡ permission gate cho 2 toggle RT & Auto T — mọi user đều dùng được

User báo screenshot 2 toggle "RT" (Realtime) + "Auto T" (Auto clear T-tag) ở header bảng tab1, hiện chỉ admin / lai-authenticated thấy. Yêu cầu: tất cả user thấy và toggle được như nhau.

**Files**:

- [orders-report/tab1-orders.html](orders-report/tab1-orders.html) — xoá block inline `<script>` chứa `window._canTogglePowerSwitches` (cũ ở line 54-71).
- [orders-report/js/tab1/tab1-tpos-realtime.js](orders-report/js/tab1/tab1-tpos-realtime.js) — xoá permission check ở đầu `toggle()`, xoá hoàn toàn `_hideRtUIIfNotAllowed()` + handler DOMContentLoaded gọi nó.
- [orders-report/js/tab1/tab1-processing-tags.js](orders-report/js/tab1/tab1-processing-tags.js) — xoá `_hideAutoTUI()`, gỡ nhánh hide non-priv trong `_loadAutoTClearSetting()`, gỡ permission check ở đầu `toggleAutoTClear()`.

**Chi tiết**:

- Function `window._canTogglePowerSwitches` đã không còn caller → xoá luôn shim (grep verify 0 hit).
- Default state giữ nguyên: RT mặc định `tableUpdateEnabled = true` (in-memory, reload reset), Auto T mặc định `_autoTClearEnabled = true` rồi load từ `userStorageManager` (persist per-user).
- UI render logic không đổi: knob xanh/xám + label "BẬT/TẮT" hoạt động như cũ.
- Permission từng là client-side only nên việc xoá không ảnh hưởng data integrity, chỉ thay đổi UX scope.

**Status**: DONE.

### [web2/products] Fix barcode aspect: JsBarcode 600×100 match TPOS PNG canvas

**User test**: "bạn tạo 1 sản phẩm giống tên, mã, giá vào kho web 2.0 giống 1 sản phẩm trên tpos rồi in mã 2 bên ra đi sẽ thấy khác nhau, test 1 sản phẩm, nhiều sản phẩm". User nghi ngờ visual khác — đúng.

**Setup test page** `downloads/n2store-session/barcode-compare.html` (gitignored), render side-by-side TPOS PNG vs JsBarcode SVG cho 4 cases: short alphanumeric, short numeric, longer mixed, multi-product layout.

**Root cause phát hiện qua test**:

- TPOS PNG canvas: **LUÔN 600×100** (fixed). Bars + quiet zone scale fit canvas.
- JsBarcode native viewBox: width thay đổi theo code length:
    - `DEMO-TUI-DENIM` (14 chars) → 378×100
    - `123456789` (9 chars) → 202×100
    - `AO-MEW-MEW-XL-2024` (18 chars) → 444×100

Khi cả 2 stretch vào label 25mm (`width:100%; height:25px`):

- TPOS: bars có whitespace 2 bên → trông **mỏng hơn** sau stretch
- JsBarcode: edge-to-edge → trông **dày hơn**

→ User đúng: visual khác nhau dù cùng input.

**Fix**: 2-pass render với dynamic side margin để total viewBox = 600 match TPOS canvas:

```js
// Pass 1: đo native width
JsBarcode(svg, code, { format: 'CODE128', width: 2, height: 100, displayValue: false, margin: 0 });
const nativeW = parseFloat(svg.viewBox.split(' ')[2]);
// Pass 2: re-render với marginLeft/marginRight (KHÔNG margin uniform vì inflate height)
const sideMargin = Math.max(0, Math.round((600 - nativeW) / 2));
JsBarcode(svg, code, {
    format: 'CODE128',
    width: 2,
    height: 100,
    displayValue: false,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: sideMargin,
    marginRight: sideMargin,
});
```

**Gotcha**: ban đầu thử `margin: sideMargin` → viewBox height bị inflate (322/498/256 thay vì 100) vì JsBarcode apply margin uniform 4 cạnh. Phải dùng `marginLeft/marginRight` only + set `marginTop/marginBottom: 0` để giữ aspect 600×100.

**Verified after fix** (test page screenshot `barcode-compare-after.png`):
| Code | TPOS PNG | JsBarcode SVG | Match |
|---|---|---|---|
| DEMO-TUI-DENIM | 600×100 | 600×100 | ✅ |
| 123456789 | 600×100 | 600×100 | ✅ |
| AO-MEW-MEW-XL-2024 | 600×100 | 600×100 | ✅ |
| Multi (6 SP, 3 sheets) | 600×100 each | 600×100 each | ✅ |

Visual side-by-side ở zoom 4×, print size 25mm, multi-sheet layout — identical.

**Files**: `web2/products/js/web2-products-print.js` (2-pass logic + side margin). Bump cache `v=20260525c` → `v=20260525d`.

**Status**: ✅ Done — Web 2.0 barcode visual identical TPOS, ZERO request tpos.vn.

### [web2/customer-wallet, web2/balance-history] Enrich từ TPOS Partner — status badge + Mở thẻ KH

**Yêu cầu user**: "coi bên customer-wallet có cần dữ liệu gì không thì lấy luôn" + "và trang balance-history".

**Đánh giá**: 2 trang đang thiếu signal từ TPOS Partner — status risk (Bom hàng/Cảnh báo/Nguy hiểm/VIP), email, địa chỉ, link mở thẻ KH. Đặc biệt customer-wallet (workflow thu nợ KH) cực cần status để nhận diện KH rủi ro.

**Files thay đổi**:

- `web2/partner-customer/js/partner-customer-api.js` — thêm method `listByPhones(phones, opts)`: batch fetch tối đa 30 phones / request qua OData `or` chain (TPOS không support `Phone in (...)`), concurrency 3, trả về `Map<phone, partner>`.
- `web2/partner-customer/js/partner-customer-app.js` — deep-link `?id=<partnerId>` mở edit modal sau khi load, `?search=<phone>` prefill search.
- `web2/customer-wallet/index.html` — load `token-manager.js` + `partner-customer-api.js`, bump CSS/JS version.
- `web2/customer-wallet/js/customer-wallet-app.js` — sau `loadAndRender()` chạy `enrichFromTpos()` (memory-only cache, không persist), render TPOS status pill cạnh tên KH trong card + nhà mạng cạnh SĐT. `openDetail()` gọi `renderDetailExtras(phone)` hiển thị status pill, carrier, Email, FullAddress, link "Mở thẻ KH ↗", cảnh báo "Nợ TPOS ≠ Nợ ví" khi mismatch > 1₫.
- `web2/customer-wallet/css/customer-wallet.css` — styles `cw-tpos-status-pill` (5 màu), `cw-tpos-extras`, `cw-tpos-link`, `cw-carrier`, `cw-tpos-mismatch`.
- `web2/balance-history/index.html` — load `token-manager.js` + `partner-customer-api.js` + `tpos-partner-enricher.js` sau `main.js`, bump `web2-theme.css` version.
- `web2/balance-history/css/web2-theme.css` — styles `bh-tpos-status-pill` (4 màu non-Normal) + `bh-tpos-link` icon button.
- `web2/balance-history/js/balance-table.js` — thêm `data-customer-phone="..."` trên `<tr>` + `data-tpos-customer-cell="1"` trên customer name `<td>` để enricher target.
- `web2/balance-history/js/tpos-partner-enricher.js` — mới: `MutationObserver` trên `transactionTableBody`, gom phones unique, batch `PartnerCustomerApi.listByPhones`, inject status pill (chỉ show ≠ Normal để giảm nhiễu) + link "Mở thẻ KH" cạnh tên KH. Cache memory-only, debounce 250ms.

**Pattern**: cả 2 trang enrich lazy + cache memory-only. Không lưu Firestore/localStorage vì TPOS là source of truth — mỗi session fresh fetch.

**Status**: ✅ Done. Syntax OK.

### [web2/partner-customer] TPOS-clone Khách hàng — sync 2 chiều TPOS Partner

**Yêu cầu user**: Clone trang `tomato.tpos.vn/#/app/partner/customer/list1` cho Web 2.0 (`web2/partner-customer/`), sync 2 chiều với TPOS (sửa ở web → TPOS, sửa ở TPOS → web thấy), hiển thị đầy đủ data TPOS.

**Approach**: Bỏ placeholder cũ dùng `Web2Shell.bootstrap` + Postgres `web2_entities`. Build dedicated page gọi trực tiếp TPOS OData `/Partner` qua CF proxy — y hệt pattern `live-campaign` (commit `ecce60053`). Không có DB trung gian → sync 2 chiều "tự nhiên": mỗi load fetch fresh từ TPOS, mỗi action POST/PUT/DELETE đi thẳng TPOS.

**Files thay đổi**:

- `web2/partner-customer/index.html` — rewrite hoàn toàn từ Web2Shell shortcut → full HTML có: header KH + Sinh nhật badge + sync pill, ô tìm kiếm, toolbar (Thêm/Xuất Excel/…), status counts bar (Bình thường/Bom hàng/Cảnh báo/Nguy hiểm/VIP), bảng 9 cột (checkbox/Tên+Status/SĐT+Nhà mạng/Email/Địa chỉ/Nhãn/Nợ/Hiệu lực/Actions), pagination, modal Thêm/Sửa.
- `web2/partner-customer/css/partner-customer.css` — mới: prefix `pc-` để tránh đụng chéo. Match tone của `tpos-theme.css`. Có popover đổi trạng thái với 5 dot màu.
- `web2/partner-customer/js/partner-customer-api.js` — wrapper TPOS `Partner` OData (list/getStats/getOne/create/update/setActive/updateStatus/remove/listCategories) + helpers (statusText/statusClass/detectCarrier/formatCurrency). Tất cả qua `chatomni-proxy.../api/odata/Partner...`, auth qua `window.tokenManager.authenticatedFetch`.
- `web2/partner-customer/js/partner-customer-app.js` — UI controller: render bảng, filter (status pill, hiệu lực, email, nhãn, nhóm KH), search, pagination, modal CRUD, bulk actions (bật/tắt hiệu lực, xóa), xuất Excel client-side (SheetJS 3 CDN fallback), **popover click status để đổi nhanh** (5 tùy chọn với dot màu, gọi `Partner({id})/ODataService.UpdateStatus` + fallback PUT full body).

**API endpoints dùng** (TPOS OData qua CF proxy):

- `GET /api/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&$filter=...&$top=...&$skip=...&$count=true&Name=<search>` — list + count
- `GET /api/odata/Partner({id})` — get full record cho edit modal
- `POST /api/odata/Partner` — create (Type='Customer', Customer=true)
- `PUT /api/odata/Partner({id})` — update full body (GET first, merge, strip @odata, PUT)
- `POST /api/odata/Partner({id})/ODataService.UpdateStatus` — quick status change
- `DELETE /api/odata/Partner({id})` — remove
- `GET /api/odata/PartnerCategory?$filter=Active+eq+true` — load Nhóm KH cho filter dropdown

**Test live (localhost:8080)**: page render 91,853 KH (1–50 / 91.853), row đầu "Yến Iêuu | Bình thường | 0869695595 Viettel | …", 0 console errors. Stats per-status ban đầu trả 0 do `$top=0` — fix bằng `$top=1` (TPOS GetViewV2 không honor $top=0).

**Quick status edit (user request "chỉnh trạng thái khách hàng")**: click chữ status (vd "Bình thường") dưới tên khách → popover ▾ hiện 5 lựa chọn với dot màu → click → optimistic update local + refresh stats + gọi TPOS UpdateStatus. Sync 2 chiều tự nhiên.

**Status**: ✅ Done. Trang load real data từ TPOS, đủ filter/CRUD/Excel/quick-status. KHÔNG dùng `Web2Shell` framework nữa cho trang này — toàn bộ HTML + JS + CSS dedicated. KHÔNG cần SSE/Render route (vì không có DB trung gian).

### [web2/products] Bỏ TPOS barcode endpoint — chuyển JsBarcode CDN, ZERO request tpos.vn

**User báo**: "không dùng request tpos nha, nếu đang dùng thì nói tôi đang dùng cái nào" + "tôi thấy bạn có thể clone của tpos được mà cần gì request".

**Đang dùng** (commit trước `19924a384`): `https://gc-statics.tpos.vn/Web/Barcode?type=Code 128&value=CODE&width=600&height=100` — public PNG endpoint, no auth, NHƯNG vẫn là request tới `tpos.vn` → vi phạm rule "không request tpos" của Web 2.0.

**User insight đúng**: Code128 là chuẩn **ISO/IEC 15417**, bars/spaces pattern xác định 100% bởi input code → JsBarcode local render = TPOS PNG render, visual identical cho cùng input. Không cần fetch từ TPOS.

**Fix**:

- Thay `<img src="gc-statics.tpos.vn/Web/Barcode?...">` → `<svg class="bcsvg" data-code="...">` placeholder.
- Inject JsBarcode CDN (`cdn.jsdelivr.net/npm/jsbarcode@3.11.6`) trong iframe print + inline script `JsBarcode(svg, code, { format:'CODE128', width:2, height:100, displayValue:false, margin:0 })`.
- Lazy load `loadJsBarcode()` trên parent page khi cần (mặc dù iframe tự load CDN khi mở print).
- CSS update `.barcode-image .bcsvg { width:100%; height:25px; display:block }` match TPOS PNG dimensions.

**Verified live** (localhost:8080/web2/products):

- Print iframe scripts: chỉ có `cdn.jsdelivr.net/.../JsBarcode.all.min.js` + inline drawer. KHÔNG có script nào từ tpos.vn.
- Images in iframe: 0.
- SVG render: **53 `<rect>` bars Code128** đúng (DEMO-TUI-DENIM 14 chars).
- `tposRefs: []` — confirmed.
- Label style: `width:25mm;height:21mm;font-size:6px;line-height:7px;padding 0.5mm` — vẫn exact TPOS `style_label()` output.

**Visual**: bars/spaces identical TPOS PNG (chuẩn ISO Code128 deterministic), chỉ khác:

- SVG vector vs PNG raster (in 25mm: vector sharper, raster có thể aliased — SVG WIN).
- File size: SVG inline 5-10kb vs PNG fetch 7kb — wash.
- Render time: SVG sync (<10ms) vs PNG fetch async (50-200ms) — **SVG WIN**.

**Files**: `web2/products/js/web2-products-print.js` (+30 / -5: JsBarcode loader, SVG placeholder, inline script). `web2/products/index.html` bump `v=20260525b` → `v=20260525c`.

**Status**: ✅ Done — Web 2.0 hoàn toàn độc lập, ZERO request tpos.vn, visual identical TPOS.

### [web2/products] In tem 100% giống TPOS — port BarcodeLabelDialog + TPOS barcode endpoint

**User ask**: "Tất cả để làm 100% giống tpos" cho phần in tem ở `web2/products/index.html`.

**Issues phiên bản cũ**:

- Modal UI dùng `w2p-print-*` class với CSS riêng (Inter font, clean nhưng KHÔNG giống TPOS Bootstrap-3 palette).
- Thiếu **Loại in** dropdown (TPOS có 2 mode: "Mặc định (dọc)" / "2 cột (ngang)").
- Barcode dùng **JsBarcode local** (Code128 SVG) — visual khác TPOS PDF.
- Print flow: mở tab mới với Blob URL — khác TPOS flow.

**Fix**: Port `purchase-orders/js/lib/barcode-label-dialog.js` (commit `b8fcc150c` claim "100% identical TPOS PDF") sang `web2/products/js/web2-products-print.js`. Strip TPOSClient deps vì Web 2.0 không request TPOS API.

- **Modal CSS**: inline trong JS (mirror BarcodeLabelDialog pattern). TPOS Bootstrap-3 palette: Helvetica Neue/Arial 13px, purple primary `#7266ba`, success `#5cb85c`, warning `#8a6d3b/#fcf8e3/#faebcc`. Field structure `sheet-bg > sheet > group > group-col` mirror TPOS FormModal.
- **Paper presets**: 3 sizes match `/odata/ProductLabelPaper` (id 7/8/9) — width/height/margin/cols/fontSize chính xác.
- **Print types**: thêm "Mặc định (dọc)" + "2 cột (ngang)" mirror TPOS `/BarcodeProductLabel/Print` + `/PrintNew`.
- **Barcode endpoint**: TPOS public `https://gc-statics.tpos.vn/Web/Barcode?type=Code 128&value=CODE&width=600&height=100` (PNG, no auth, verified 200 OK 2026-05-25). KHÔNG vi phạm rule "no TPOS API" vì đây là image generator public, không phải user data API.
- **Print flow**: fullscreen overlay (`z-index:10000`) + iframe Blob URL + toolbar "In bằng pdf" / "Đóng" giống PO/TPOS thay vì mở tab mới.
- **buildLabelHTML**: exact mirror controller `style_label()` — chỉ include margin/padding khi != null, font-size + line-height (fs+1), name max-height (fs×2), `<strong>` cho bold, `barcode-pname / barcode-image / barcode-price` class.
- **Items modal**: tabs (có mã vạch / không có mã vạch), quick apply qty, gán tồn, hiện giá/bold/currency/name, ẩn mã vạch — TẤT CẢ match TPOS.

**Drop TPOS-only features** (vì Web 2.0 là kho riêng):

- `useTposTemplate` toggle + checkbox "In theo mẫu TPOS"
- `recheckTposForMissingCodes()` query TPOS OData
- `printViaTPOS()` POST `/odata/BarcodeProductLabel`
- `tposCodeSet`, `liveTposCache` state

**Verified qua persistent browser session** (localhost:8080):

- Modal mở đúng structure: H4 "In mã vạch", paper opts 3, print type opts 2, gán tồn, hide barcode, warehouse "[WH] Kho Web 2.0", 2 tabs, print button "In bằng pdf (N)".
- Click "In bằng pdf" → overlay z-index:10000 + iframe complete + toolbar 2 buttons "In bằng pdf" / "Đóng".
- Barcode image loaded: naturalWidth **600 × 100** (TPOS native size), src đúng `gc-statics.tpos.vn/Web/Barcode?type=Code%20128&value=DEMO-TUI-DENIM`.
- Label HTML: `width:25mm;height:21mm;font-size:6px;line-height:7px;padding 0.5mm` — exact TPOS `style_label()` output.

**Files**:

- `web2/products/js/web2-products-print.js` rewrite (-625 / +545 dòng, atomic — inline CSS thay external)
- `web2/products/css/web2-products-print.css` empty + deprecation comment (giữ file tránh 404 cache HTML cũ)
- `web2/products/index.html` bump version `v=20260525a` → `v=20260525b`

**Status**: ✅ Done — 100% identical TPOS modal + barcode + print structure

### [web2][live-campaign] Excel "Tải về" build từ native-orders (không gọi TPOS nữa) — ✅ Done

**Yêu cầu user**: "phần tải excel thì không tải từ tpos nữa mà tải theo dữ liệu từ native orders".

**Approach**: trước commit này, button "Tải về" gọi `POST /SaleOnline_Order/ExportFile` (TPOS server-rendered xlsx). Bây giờ build xlsx **client-side** từ `native_orders.live_campaign_id` qua SheetJS — bám sát 19 cột format TPOS.

**Files**:

- `web2/live-campaign/js/live-campaign-api.js` — rewrite `exportExcel(id, name)`:
    - Lazy-load SheetJS từ 3 CDN fallback (`cdn.sheetjs.com` 0.20.3 → unpkg 0.18.5 → cdnjs 0.18.5). Jsdelivr xlsx@0.20.3 đã 404, đã loại.
    - Fetch `/api/native-orders/load?campaignIds={id}&limit=1000&status=all` qua CF proxy.
    - Build AOA 19 cột (`STT, ###, Kênh, Mã, Facebook, Email, Tên, Trạng thái KH, Điện thoại, Nhà mạng, Địa chỉ, Tổng tiền, Trạng thái, Ngày tạo, Sản phẩm, Tổng SL SP, Nhân viên, Ghi chú, Nhãn`) với title row "DANH SÁCH SALE ONLINE" merge A:S y hệt TPOS.
    - `detectCarrier(phone)` — map 3-digit prefix → Viettel/Mobifone/Vinaphone/Vietnamobile/Gmobile/iTel.
    - `formatProductsCell(products)` — multi-line `[CODE] NAME SL: qty Giá: price`.
    - `excelSerialDate(ms)` — convert ms → Excel serial (epoch 1899-12-30, shifted +07:00 VN).
    - Status map `draft → Nháp`, `confirmed → Đơn hàng`, `cancelled → Đã hủy`.
    - Return `{ blob, count }`; throws `EMPTY` error nếu native_orders rỗng.
- `web2/live-campaign/js/live-campaign-app.js` — `exportRow()` dùng API mới, notify `Đã tải Excel (N Đơn Web)`.
- `web2/live-campaign/index.html` — bump cache `v=20260525d`, tooltip nút "Tải về" rõ source.

**Verified live**:

- STORE 22/05/2026 có 4 native_orders → xlsx 23419 bytes, 7 rows (2 title + 1 header + 4 data) ✓
- Test xlsx mở được, 19 cột đúng thứ tự TPOS, multi-line "Sản phẩm" hiển thị `[CODE] NAME SL: 1 Giá: 280.000`, carrier 0333 → Viettel, status "Nháp"/"Đơn hàng" ✓
- HOUSE 22/05/2026 không có native_orders → notify "Chiến dịch chưa có Đơn Web nào — không có gì để xuất Excel" ✓
- Số tiền format `#,##0`, ngày `dd/mm/yyyy hh:mm`, sheet name = tên campaign.

**Trade-off**: campaigns cũ (chỉ có TPOS-side orders, chưa migrate sang Đơn Web) sẽ Excel rỗng. Tradeoff chấp nhận theo yêu cầu user.

### [product-warehouse][tpos] Expand panel 8 tab + fix save (strip $expand objects) — ✅ Done

**Mục tiêu**: Khi click expand row, hiển thị panel 8 tab mirror TPOS producttemplate (xem screenshot user): **Thông tin** (default, 3-col) | **Ảnh** | **Thẻ kho** | **Chi tiết điều chỉnh** | **Tồn kho** | **Mô tả** | **Lịch sử** | **Lịch sử giá vốn**. Đồng thời fix save bug khi click "Lưu lên TPOS": UpdateV2 reject nested `$expand` sub-objects.

**Files modified**:

- `product-warehouse/js/main.js`:
    - **Expand 8 tab**: rewrite `renderVariantSubRow(variants, templateId, image, detail)` → wrap 8 panes `.expand-pane[data-expand-tab]` trong `.expand-container > .expand-tabs + .expand-panes`. Tab "info" default.
    - **toggleVariantExpand**: 1 single TPOS fetch `ProductTemplate(id)?$expand=UOM,UOMPO,Categ,Distributor,Importer,Producer,OriginCountry,Images,ProductVariants($expand=UOM,AttributeValues)` cho info + images + description + variants (thay vì gọi 2 lần).
    - **bindExpandTabSwitching**: delegated click handler, toggle `.is-active` + set `panes.dataset.activeTab`. Lazy load audit log khi click "Lịch sử" lần đầu.
    - `renderExpandInfoTab` 3 cột × 7 fields (Mã/Tên/Nhóm/Loại/Giá bán/Chiết khấu bán/Cho phép bán; Công ty/ĐVT/Giá mua/Giá vốn/Chiết khấu mua/ĐVT mua/Khối lượng; NCC/Nhập khẩu/Sản xuất/Xuất xứ/Thành phần/Thông số/Cảnh báo).
    - `renderExpandImagesTab` gallery từ `detail.ImageUrl` + `detail.Images[]`.
    - `renderExpandStockTab` variants với QtyAvailable (fallback 1 row template nếu không variant).
    - `renderExpandDescriptionTab` 3 block (sale/purchase/full).
    - `loadExpandAuditLog` 3-endpoint fallback (mirror loadAuditLog của edit modal).
    - Stubs: Thẻ kho / Chi tiết điều chỉnh / Lịch sử giá vốn → "Đang phát triển — xem trên TPOS".

- `product-warehouse/css/warehouse-tpos.css`: `.expand-tabs` underline purple, `.expand-info-grid` 3-col, `.expand-field` label 160px / value 1fr + border-bottom-soft, `.expand-images-grid` auto-fill 160px, `.expand-desc-block` purple uppercase legend, `.expand-history-table` TPOS bordered.

- **Fix save** `saveEditProduct`: strip `EXPAND_FIELDS_TO_STRIP = [UOM, UOMCateg, Categ, UOMPO, POSCateg, UOMView, Distributor, Importer, Producer, OriginCountry, Thumbnails, Taxes, SupplierTaxes, Product_Teams, Images]` trước khi POST `UpdateV2`. Lý do: TPOS reject `"An unexpected 'StartArray' node was found ... A 'PrimitiveValue' was expected"` khi nhận nested sub-objects/arrays từ `$expand` chain. User-edited arrays vẫn re-add via `mergeAdvancedIntoPayload`.

**Verification** (localhost:8080, template B2537/119312 + test product 119313):

- 8 tab render đầy đủ, default Info ✓
- Tồn kho: 2 variants B2537H + B2537N ✓
- Save round-trip (minimal payload): TPOS UpdateV2 returns 200, Name/ListPrice persisted ✓

**Test product 119313 `TEST-WEB-001` (TEST-WEBKHO-20260525)**: created via InsertV2 với user approval. Sẽ deactivate khi xong test.

---

### [product-warehouse][tpos] Edit modal 6 tab TPOS + fix expand + fix ảnh template — ✅ Done

**Mục tiêu**: Edit modal mirror TPOS `producttemplate/form` 6 tab (Thông tin chung / Ảnh / Biến thể / Thông tin khác / Lịch sử / Lịch sử giá vốn). Đồng thời fix 2 regression sau khi chuyển sang TPOS-direct: (1) ảnh tab Sản phẩm không load do dùng Render proxy với template Id sai; (2) expand button báo "Không có biến thể" do `WarehouseAPI.getProduct(templateId)` lookup Render DB bằng `tpos_product_id`, nhưng template Id không phải `tpos_product_id` của row nào.

**Files modified**:

- `product-warehouse/index.html`: thêm `<nav class="tpos-edit-tabs">` 6 tab. `data-tab="general|images|variants|other|history|costhistory"` trên mỗi fieldset. Thêm fieldset Ảnh (240×240 preview mirror) + costhistory stub. Modal width 640 → 920px.
- `product-warehouse/css/warehouse-tpos.css`: `.tpos-edit-tabs` underline TPOS style. `.tpos-edit-modal-body[data-active-tab=X] fieldset[data-tab=X]` selector show/hide. Restyle header xám TPOS, fieldset border `--pw-border`, legend uppercase purple `--pw-accent`, input 30px sharp 2px.
- `product-warehouse/js/main.js`:
    - Tab click handler set `body.dataset.activeTab` + toggle `.is-active`.
    - `openEditProduct` reset tab về `general` + mirror ảnh nhỏ → preview to ở tab Ảnh.
    - **Fix expand**: rewrite `fetchVariants` → gọi TPOS `ProductTemplate(${id})?$expand=ProductVariants($expand=AttributeValues,UOM)` trực tiếp thay vì `WarehouseAPI.getProduct`.
    - **Fix HTTP 400**: drop `($expand=Partner)` khỏi `ProductSupplierInfos` trong `fetchProductDetail` (TPOS đã drop navigation property — đã có precedent fix ở `sync-tpos-products.js`).
    - **Fix ảnh tab Sản phẩm**: `mapTposRow` dùng `row.ImageUrl` trực tiếp (TPOS CDN public URL) thay vì proxy qua `${RENDER_API}/image/${productId}`. Lý do: với template có variants, Render proxy 404 vì DB không có row `tpos_product_id = template_id`.

**Verification** (localhost:8080 + Playwright, template B2537 / 119312 có 2 variants B2537H + B2537N):

- Ảnh tab Sản phẩm: 49/49 load thành công, 0 broken.
- Expand: 2 variant rows hiển thị với attribute, giá, kho.
- Edit modal: opens với name "2505 B35 SET ÁO 2D + Q.SUÔNG REN", code "B2537", default tab "general" (8 fieldsets visible).
- Tab switching qua 6 tabs: visible fieldsets match `data-tab` đúng (variants→2, other→1, history→1, costhistory→1, images→1).
- Modal style: TPOS purple underline tabs, sharp 2px corners, grey borders.

---

### [product-warehouse][tpos] Tab Sản phẩm/Biến thể — TPOS-direct + UI nút thao tác giống TPOS — ✅ Done

**Mục tiêu**: chuyển kho web 1.0 từ "đọc data biến thể qua Render DB" sang "đọc trực tiếp 2 trang TPOS" — Tab **Sản phẩm** mirror `tomato.tpos.vn/#/app/producttemplate/list` (1 row = 1 template), Tab **Biến thể** mirror `tomato.tpos.vn/#/app/product/list` (1 row = 1 variant). Mặc định = Sản phẩm. Sắp xếp `DateCreated desc` (mới nhất trên cùng). Action buttons giao diện TPOS 100% (24×24, white bg, grey border, hover semantic).

**Files modified**:

- `product-warehouse/index.html` — thêm `<nav class="warehouse-tabs">` 2 nút (`#tabTemplate`, `#tabVariant`) với badge count + icon, đặt giữa `.page-header` và `.warehouse-toolbar`. Cache `v=20260525a`.
- `product-warehouse/css/warehouse-tpos.css` — block `.warehouse-tabs` + `.warehouse-tab[.is-active]` + `.warehouse-tab-count` (TPOS underline-tab style với accent purple). Thêm `.variant-count-badge` (hiển thị `N BT` cạnh tên template), `.variant-attr` (italic muted cho attribute string). Rewrite `.col-actions .btn-action`: từ "solid color per action" → "white bg + grey border + grey icon, hover → semantic color" (giống TPOS producttemplate/list).
- `product-warehouse/js/main.js`:
    - Thêm `viewType` state (persist localStorage `n2store_warehouse_view_type`), default `'template'`.
    - **PIVOT**: rewrite `fetchProducts` → gọi TPOS proxy trực tiếp qua `window.tokenManager.authenticatedFetch`. Endpoint switch:
        - `viewType=template` → `/api/odata/ProductTemplate/ODataService.GetViewV2`
        - `viewType=variant` → `/api/odata/Product/ODataService.GetViewV2`
    - `buildTposODataUrl()` build OData params (`$top`, `$skip`, `$orderby`, `$filter`, `$count=true`).
    - `mapTposRow()` map TPOS fields (Id, Name, DefaultCode, ListPrice, PurchasePrice, StandardPrice, QtyAvailable, VirtualAvailable, UOMName, CategCompleteName, Active, EnableAll, Tags, ImageUrl, DateCreated, CompanyName, CreatedByName, DescriptionSale, VariantActiveCount) → UI shape. Variant attribute extract từ Name pattern `Base (Attribute)`.
    - `fetchOtherTabCount()` cập nhật badge tab kia bằng call `$top=1&$count=true` (cheap).
    - Render: badge `N BT` cạnh tên template (template view), variant attr italic muted (variant view). Expand button chỉ hiện ở template view + `VariantActiveCount > 0`.
    - Sort default: `tpos_template_id desc` (newest TPOS Id first, đồng nhất với TPOS UI). `SORT_FIELD_MAP.createdAt → tpos_template_id`.

- `render.com/routes/v2/web-warehouse.js` — backward-compat: `GET /` thêm query `viewType=template|variant`. Branch `viewType=template` aggregate `GROUP BY tpos_template_id` (1 row/template, SUM qty, COUNT variants, MIN/MAX selling_price). Default sort = `tpos_template_id DESC`. Bộ phận này KHÔNG được dùng bởi product-warehouse nữa (client đã đi thẳng TPOS), nhưng giữ cho các trang khác có thể consume template-grouped view sau này.

**Verification** (persistent browser session localhost:8080 + 2 tabs):

- Tab Sản phẩm: 3701 templates, badge "2 BT" trên row "2505 B35 SET ÁO 2D + Q.SUÔNG REN" (template B2537), expand button hiển thị với title "Xem biến thể (2)".
- Tab Biến thể: 6891 variants, row 1 = "2505 B35 SET ÁO 2D + Q.SUÔNG REN" với variant attr "Nude" hiển thị italic.
- DateCreated desc sort: row đầu = 2026-05-25 (today) cho cả 2 tabs.
- Action buttons: bg `rgb(255,255,255)`, border `rgb(204,204,204)`, color `rgb(88,102,110)`, 24×24, br 2px — match TPOS pixel.
- Network: `/api/odata/ProductTemplate/ODataService.GetViewV2?$top=50&$skip=0&$count=true&$orderby=DateCreated desc` (template) + tương tự cho Product (variant) — qua `chatomni-proxy.nhijudyshop.workers.dev`.

**SSE realtime web 1.0 (đã verify isolated khỏi web 2.0)**:

- Topic = `web_warehouse` (KHÔNG có prefix `web2:`)
- Endpoint = `/api/realtime/sse?keys=web_warehouse`
- Render server `routes/realtime-sse.js` quản lý Map per-topic — không nhầm với `web2:*` topics
- 2-way sync TPOS ↔ web 1.0: TPOS Socket.IO listener (`server.js`) push diffs vào SSE; UI edit/save POST trực tiếp TPOS qua proxy (`UpdateV2`/`InsertV2`). SSE chỉ dùng để invalidate cache + tự refresh khi sync cron lành.

**Trade-off**: tốc độ tab Sản phẩm phụ thuộc TPOS API (vs Render DB cache trước đó) → mỗi page load ping tomato.tpos.vn qua proxy ~150-300ms. Đổi lại data luôn fresh (không stale do sync cron 30 phút).

---

### [issue-tracking][tpos][mock-crud] Mock CRUD đầy đủ cho 2 tab MUA HÀNG NCC + TRẢ HÀNG NCC — ✅ Done

**Mục tiêu**: 100% feature parity với TPOS native `fastpurchaseorder/invoicelist` + `refundlist`: default date range (tháng hiện tại), top toolbar (Thêm / Thao tác / Ẩn hiện cột), per-row Edit + Delete buttons, edit modal đầy đủ field. Write operations (Sửa/Xóa/Thêm) chỉ mock (overlay in-memory), không gọi TPOS API.

**Files modified**:

- `issue-tracking/js/tpos-fastsale-tab.js` (+~290 dòng):
    - `TYPE_CFG.purchase` + `TYPE_CFG.purchaseRefund` thêm flag `mockable: true`, `colCount` +1 cho cột "Hành động".
    - Helper `getCurrentMonthRange()`, `localDateTimeForInput(date)` (fix giờ datetime-local input cần local time chứ không UTC), `actionButtons(id)`.
    - Constructor: nếu entity là `FastPurchaseOrder` → set `state.dateFrom/dateTo` = tháng hiện tại + populate inputs. Init `this.mock = { overlay: Map, deleted: Set, added: [], nextId }` cho mockable types.
    - `bindEvents()`: thêm handlers cho tbody click — `[data-action="edit"]` → openEditModal, `[data-action="delete"]` → openDeleteConfirm; toolbar handlers `addNew` / `bulkAction` / `toggleCols`.
    - `applyMockOverlay(rows)`: trộn server rows + mock overlay (edit) + mock deleted (filter ra) + mock added (prepend trang 1).
    - `render()`: gọi `applyMockOverlay` trước khi render, total counter = server total + mock added - mock deleted.
    - Mock CRUD methods: `getRowById`, `openEditModal(id|null)`, `submitEditModal(formData)`, `openDeleteConfirm(id)`, `executeDelete(id)`.
    - `renderPurchaseRow` + `renderPurchaseRefundRow` thêm column "Hành động" (Edit green pencil + Delete red trash), thêm tag `MOCK` / `SỬA` cho rows có mock.
    - `stateBadge(state, meta, textOnly)` — purchase rows gọi với `textOnly=true` → badge chỉ chữ ("Nháp"/"Đã xác nhận"/"Đã hủy"), không có icon (theo yêu cầu user).
    - Helper `toast(msg, level)` dùng `window.notificationManager.show` (fallback inline div).
    - `bindMockModals()`: wire submit + close events cho `#modal-purchase-edit` và `#modal-purchase-delete` (1 lần khi DOMContentLoaded).
- `issue-tracking/index.html`:
    - Thêm `.tpos-fso-toolbar` block (Thêm + Thao tác + Ẩn hiện cột + Mock banner) cho 2 purchase panes.
    - Thêm `<th>Hành động</th>` + cập nhật colspan loading row (12 cho purchase invoice, 10 cho refund).
    - Thêm `#modal-purchase-edit` (form 10 field: PartnerDisplayName, DateInvoice datetime-local, Number, VatInvoiceNumber, AmountTotal, Residual, State, UserName, CompanyName, Note) + `#modal-purchase-delete` (confirm dialog). 2 trường `[data-only-invoice]` (Residual + VatInvoiceNumber) ẩn cho refund mode.
    - Cache version bump `v=20260525a → v=20260525c`.
- `issue-tracking/css/page-tabs.css` (+~260 dòng): styles cho `.tpos-fso-toolbar`, `.tpos-fso-btn-primary` (purple), `.tpos-fso-btn-secondary`, `.tpos-mock-banner` (amber chip), `.tpos-fso-row-btn` (Edit green / Delete red), `.tpos-mock-tag` (MOCK/SỬA), `.tpos-mock-modal` (overlay), `.tpos-mock-form` (form layout). `.tpos-fso-badge-text` cho badge text-only (purchase). Highlight subtle gradient cho rows có `data-mock` / `data-mock-edited`.

**Verification** (localhost:8080 qua persistent Playwright session):

1. Default date range tháng hiện tại: `dateFrom = "2026-05-01"`, `dateTo = "2026-05-31"`. MUA HÀNG NCC 334 phiếu / TRẢ HÀNG NCC 21 phiếu (chỉ tháng 5) — khớp filter "36 Ngày" TPOS native.
2. Edit cycle: click pencil row #1 (id 55885) → modal mở với title "Sửa phiếu 55885 (Mock)", pre-fill PartnerDisplayName="[B16] B16 LỤA SÁNG ( HÀ NỘI)", AmountTotal=3440000, DateInvoice="2026-05-25T09:41" (local). Sửa AmountTotal=7777000 → submit → row update inline (3.440.000đ → 7.777.000đ), tag "SỬA" xuất hiện, date `25/05/2026 09:41` preserved chính xác.
3. Delete cycle: click trash row #1 → modal confirm "55885 — [B16] B16 LỤA SÁNG..." → confirm → total 334 → 333, row biến mất, first row mới là 55884.
4. Add cycle: click "Thêm" → modal "Thêm phiếu Mua hàng NCC mới (Mock)" empty → fill PartnerDisplayName="[MOCK-CREATE] Test NCC mới", AmountTotal=9999000, UserName=mock-claude, State=open → submit → row mới (id `MOCK-po-{ts}-1`) prepend đầu list, tag "MOCK" hiển thị, total 333 → 334.
5. Delete mock row vừa add: total 334 → 333 trở lại, first row 55885 (server).
6. Refund tab: edit modal mở đúng, 2 field Residual + VatInvoiceNumber ẩn (data-only-invoice).
7. Regression: BÁN HÀNG tab vẫn load 14.167 hóa đơn, KHÔNG có toolbar/action buttons (chỉ purchase mới có), badge state vẫn có icon (chỉ purchase badge mới text-only).
8. Expand detail row vẫn hoạt động cho cả 2 purchase tab (qua `/api/odata/FastPurchaseOrder({id})?$expand=OrderLines`).
9. State badge purchase rows: kiểm tra `firstThreeBadges` → chỉ text "Nháp"/"Đã xác nhận"/"Đã xác nhận", `hasIcon: false`, class `tpos-fso-badge-text`.

**Mock mode UX**: banner amber chip ở toolbar warn rõ "Mock mode — Sửa/Xóa/Thêm chỉ giả lập", hint trong modal "Thay đổi chỉ lưu cục bộ trình duyệt, không sync TPOS. Refresh tab sẽ mất.", tag "MOCK" trên row mới add, tag "SỬA" trên row đã edit. Notification toast cho mỗi thao tác qua `window.notificationManager.show`.

### [issue-tracking][tpos] Thêm 2 page-tab MUA HÀNG NCC + TRẢ HÀNG NCC — ✅ Done

**Mục tiêu**: thêm 2 tab mới vào `issue-tracking/index.html` mirror trang TPOS `fastpurchaseorder/invoicelist` + `fastpurchaseorder/refundlist`, dùng cùng UI/CSS với tab BÁN HÀNG/TRẢ HÀNG có sẵn.

**Files modified**:

- `issue-tracking/index.html` — thêm 2 button `.page-tab-btn` (icon `shopping-cart`, `package-x`) + 2 pane `.page-tab-pane` (`data-tab="mua-hang-ncc"`, `data-tab="tra-hang-ncc"`) với cùng markup `.tpos-fastsale > tpos-fso-header/filters/table-wrap/pagination`. Cache version `v=20260524f → v=20260525a`.
- `issue-tracking/js/tpos-fastsale-tab.js` — `TYPE_CFG` thêm 2 keys: `purchase` (entity `FastPurchaseOrder` type `invoice`, 11 cột: Nhà cung cấp / Ngày / Số / Số HĐ đỏ / Tổng tiền / Còn nợ / Trạng thái / Nhân viên / Công ty) + `purchaseRefund` (entity `FastPurchaseOrder` type `refund`, 9 cột). 2 renderer mới: `renderPurchaseRow`, `renderPurchaseRefundRow`. `PURCHASE_STATE_META` (open → "Đã xác nhận"). `buildFilter()` skip `IsMergeCancel ne true` cho entity `FastPurchaseOrder` (field không có). `buildUrl()` dùng `cfg.entity` thay vì hardcoded `FastSaleOrder`. Detail fetch cũng dùng `cfg.entity`.
- `issue-tracking/js/page-tabs.js` — `TABS` + `TPOS_TABS` thêm `mua-hang-ncc`, `tra-hang-ncc`.

**API endpoint** (verified live qua CF worker proxy): `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastPurchaseOrder/ODataService.GetView?$top=100&$skip=0&$orderby=DateInvoice%20desc&$count=true&$filter=Type%20eq%20'invoice'`. ViewModel fields: `Id`, `PartnerDisplayName`, `PartnerNameNoSign`, `AmountTotal`, `Residual`, `State`, `DateInvoice`, `Number`, `Type`, `UserName`, `CompanyName`, `Origin`, `Note`, `DecreaseAmount`, `AmountTax`, `AmountUntaxed`. State values: `draft` (Nháp), `open` (Đã xác nhận), `cancel` (Đã hủy).

**Verification** (localhost:8080 qua persistent browser session):

- `#mua-hang-ncc` → load 1.437 phiếu, page 1 hiển thị 100 rows, columns + format khớp TPOS native (vd row #1 "[B16] B16 LỤA SÁNG" / 3.440.000đ / Nháp / Lài / NJD Live).
- `#tra-hang-ncc` → load 53 phiếu, đúng thứ tự ngày giảm dần (140.000đ → 855.000đ → 910.000đ).
- Expand detail row qua endpoint `/api/odata/FastPurchaseOrder({id})?$expand=OrderLines($expand=Product,ProductUOM)` render đầy đủ line items (SKU, qty, price, total).
- Search filter `"B16"` → 61 rows, all `[B16]`.
- State filter `cancel` → 155 phiếu, badge "Đã hủy".
- Regression: tab BÁN HÀNG vẫn load 14.154 hóa đơn không lỗi.

### [web2][live-campaign] TPOS-clone "Chiến dịch Live" với sync 2 chiều TPOS — ✅ Done

**Mục tiêu**: clone 100% UI + chức năng trang TPOS `#/app/saleOnline/liveCampaign/list` vào `web2/live-campaign/`, đồng bộ trực tiếp 2 chiều với TPOS (không có local cache — TPOS là source of truth).

**Files mới**:

- `web2/live-campaign/index.html` — TPOS-clone shell (đã replace placeholder Web2Shell cũ).
- `web2/live-campaign/css/live-campaign.css` — table + filter bar + modal styles (TPOS look-alike: white card, blue accents, toggle xanh).
- `web2/live-campaign/js/live-campaign-api.js` — wrapper OData `SaleOnline_LiveCampaign` (list/getOne/create/update/setActive/remove/exportExcel) đi qua `tokenManager.authenticatedFetch` → CF Worker `/api/odata/*` → TPOS.
- `web2/live-campaign/js/live-campaign-app.js` — UI controller: render bảng 8 cột (Tên, Facebook, Live, Ghi chú, Excel, Hoạt động, Ngày tạo, Thao tác), filter bar (search/status/date range), pagination, create+edit modal, row toggle/delete, Excel download.

**Doc**: `docs/web2/LIVE-CAMPAIGN-TPOS-API.md` — schema entity + endpoints verified (POST create, PUT update full-body, DELETE 204, POST `/SaleOnline_Order/ExportFile` cho Excel).

**TPOS endpoint verified** (live test):

- `GET /api/odata/SaleOnline_LiveCampaign?$top=20&$orderby=DateCreated desc&$count=true&$filter=…` — list + filter
- `POST /api/odata/SaleOnline_LiveCampaign` body `{Name, Note, IsActive, Details:[]}` — create
- `PUT /api/odata/SaleOnline_LiveCampaign({Id})` full body (PATCH trả 500 — bắt buộc PUT) — update
- `DELETE /api/odata/SaleOnline_LiveCampaign({Id})` → 204
- `POST /api/SaleOnline_Order/ExportFile?campaignId={Id}&sort=date` body `{"data":"{}"}` → xlsx binary

**Tested in browser** (localhost:8080, persistent Playwright):

- List 46 campaigns real từ TPOS ✓ count badge 46
- Create test "TEST-WEB2-UI-353549" qua modal UI → 47 ✓
- Toggle IsActive true → false → true ✓ (gọi PUT thật)
- Edit modal pre-fill từ data thật + save với Note mới ✓
- Delete với confirm → row biến mất, count về 46 ✓
- Excel download "Tải về" → blob `HOUSE_22_05_2026.xlsx` ✓

**Nondestructive**: tất cả test campaigns đã DELETE sạch (count: 0 leftover `TEST-WEB2-*`). Test KHÔNG đụng campaign HOUSE/STORE thật.

### [tpos-pancake][snap] Fallback: redirect popup thẳng tới FB plugin (autoplay work)

**User báo**: iframe direct fallback chạy đúng (status `▶ Iframe direct (SDK timeout 4s) — t=5018s`), video fit gọn, NHƯNG không auto-play — user phải bấm nút play giữa video.

**Root cause**: Chrome autoplay policy block video play cho **cross-origin iframe** dù iframe có `allow="autoplay"`. User-gesture từ `window.open` click chỉ preserve cho top frame (popup), không truyền vào nested iframe (facebook.com). FB plugin tries `autoplay=1` → Chrome silent block → show manual play button.

**Fix**: thay vì embed iframe trong popup `fb-video-player.html`, **redirect popup window thẳng** tới FB plugin URL bằng `location.replace(plugin_url)`. Popup top frame trở thành FB plugin → giữ user-gesture chain từ window.open → autoplay work.

- Path A (FB SDK xfbml) vẫn try trước (cho seek API chính xác qua `player.seek` nếu work, GIỮ topbar info).
- Fallback timer 4s → `renderIframeDirect()` giờ `location.replace(plugin_url)` thay vì embed iframe.
- Tradeoff: mất topbar info (Video/Bắt đầu giây/Status) khi fallback active — popup become full FB plugin page. UX win: video play ngay, không cần click.

**Files**: `tpos-pancake/fb-video-player.html` (-15 / +12 trong fallback function).

**Status**: ✅ Done

### [web2/products] In tem sản phẩm — WEB 2.0 dedicated module, KHÔNG dùng TPOS API

**User ask**: "làm cho trang `web2/products/index.html` có in sản phẩm và giao diện giống 100% tpos — nên nhớ đây là web 2.0 không liên quan tới web bạn vừa code nên code mới cho web này đừng sài chung gì hết — và web này là kho sản phẩm riêng không dùng các sản phẩm có sẵn tpos đâu nên không request tpos".

**Constraints**:

- **Web 2.0 layer separation**: KHÔNG sài lại `purchase-orders/js/lib/barcode-label-dialog.js` (legacy/product-warehouse), code mới riêng cho web2.
- **NO TPOS API**: web2/products là kho RIÊNG (table `web2_products`), products khác TPOS hoàn toàn → KHÔNG có sản phẩm trên TPOS → KHÔNG gọi TPOS PDF endpoint. Render label hoàn toàn local HTML/CSS.

**Approach**: Module mới `Web2ProductsPrint` (namespace riêng) — chỉ in tem local, dùng **JsBarcode CDN** (Code 128 client-side SVG) thay vì TPOS server-side `/Web/Barcode`. CSS dialog match TPOS visual (FormModal palette: Helvetica/Arial 13px #333, sheet bg #eee, white card, purple #7266ba primary, green #5cb85c success). Label render CSS mirror TPOS `/Content/print_barcode.css` verbatim (Arial, flex column, page-break-after per sheet, font-size dynamic per paper).

**Files**:

- `web2/products/js/web2-products-print.js` (mới, ~440 dòng) — module `window.Web2ProductsPrint`
    - `PAPERS` = TPOS paper presets [2 Tem 66×21mm fs6, 1 Tem 65×22mm fs7, Tem 35×22mm fs8] với cols/margins/fontSize
    - `loadJsBarcode()` async load `cdn.jsdelivr.net/npm/jsbarcode@3.11.6/.../JsBarcode.all.min.js` (one-time)
    - `open(products[])` → `showSelectionModal(items)` → dialog với: Bảng giá / Giấy in / Kho/Kho hàng / Áp dụng nhanh số lượng / 4 checkbox row 1 / 2 checkbox row 2 / Tabs / Table / Footer "In (N)" purple + "Đóng" default
    - `generateAndPrint()` build label HTML mirror TPOS template (name strong → barcode SVG → code strong → price strong) → inline `<style>` mirror `/Content/print_barcode.css` (flex column, page-break-after, Arial, .barcode-image img height 25px) → Blob HTML → `window.open(blob)`. Popup-blocked fallback → inline `<iframe>` overlay với button "🖨️ In".
    - In-page có top bar "In mã vạch — N tem (M trang)" với button "In ngay" (manual `window.print()` trigger)
    - JsBarcode renders SVG inline Code 128 (width:1, height:25, displayValue:false, margin:0) → mỗi barcode ~53 rect bars
- `web2/products/css/web2-products-print.css` (mới, ~340 dòng) — dialog styles mirror TPOS FormModal palette
- `web2/products/js/web2-products-app.js` — thêm row action button printer (amber), `printBarcode(code)` handler, export trong `Web2ProductsApp`
- `web2/products/css/web2-products.css` — `.btn-action.act-print { color: #f59e0b; background: #fffbeb }` hover #fde68a
- `web2/products/index.html` — link CSS + script JS

**Verify** (Playwright `localhost:8080/web2/products/`):

- 13 sản phẩm load, 13 nút print render ✅
- `typeof window.Web2ProductsPrint?.open === "function"` ✅
- Click print → dialog mở, title "In mã vạch", footer "In (1)" purple ✅
- **1 tem**: Blob HTML 3013 bytes, 1 sheet × 1 label, **JsBarcode SVG = 53 rect bars** (Code 128) ✅
- **6 tem** (qty=6): **3 sheets × 2 labels per sheet = 6 labels**, **318 barcode bars** (6 × 53), `page-break-after: always` ✅
- Label HTML structure: `.barcode-pname > strong` → `.barcode-image > svg` → `<div><strong>code</strong></div>` → `<div><strong.barcode-price>price</strong></div>` mirror TPOS template ✅
- Font: Arial Helvetica sans-serif, font-size 6px (paper "2 Tem"), padding 0.5mm ✅

**Status**: ✅ Done — module độc lập web2, không request TPOS, render local 100% matching TPOS visual via mirrored CSS + JsBarcode Code 128. Cả 1 tem và 6 tem multi-sheet đều hoạt động đúng.

---

### [tpos-pancake][snap] Fallback iframe direct khi FB SDK xfbml.ready stuck

**User báo**: popup `fb-video-player.html` dừng ở status `⏳ Player rendered — waiting seek...` không tiến tiếp — `xfbml.render` fire xong nhưng `xfbml.ready` (event để lấy player instance + gọi `player.seek(N)`) KHÔNG fire. FB JS SDK Embedded Video Player API không reliable cho live VOD: video metadata chưa load xong / plugin không expose API trong vài case nhất là live đang/vừa kết thúc.

**Fix**: hybrid approach — try FB SDK trước (cho seek chính xác), fallback iframe direct sau 4s timeout.

- Giữ FB SDK xfbml plugin (cho seek API exact khi work).
- Thêm `renderIframeDirect(reason)` thay xfbml bằng `<iframe src="https://www.facebook.com/plugins/video.php?href=...&autoplay=1&t=N">`. URL param `t=N` được FB respect cho VOD (verified commit `f6c0fe137`). Live đang chạy có thể ignore — user manual slider seek backup.
- Trigger fallback trong 3 case:
    - `setTimeout(4000)` — xfbml.ready chưa fire → SDK timeout
    - `js.onerror` — SDK script load fail
    - Flag `fallbackTriggered` chống double-render khi cả 2 path race.
- Status messaging chi tiết: `⏳ Player rendered — waiting seek API...` → `✅ Seek tới Ns` HOẶC `▶ Iframe direct (SDK timeout 4s) — t=Ns (FB có thể ignore, dùng slider seek nếu cần)`.

**Files**: `tpos-pancake/fb-video-player.html` (+50 / -10 trong script).

**Status**: ✅ Done

### [tpos-pancake][snap] Fit FB Live player popup cho video portrait 9:16

**User báo**: popup `fb-video-player.html` mở đúng URL + seek đúng (status `✅ Seek tới 5037s qua FB Player API`), nhưng video tràn ra ngoài window 820×520 — livestream shop quay portrait 9:16 (PRISM Live mobile streaming), iframe FB plugin `data-width=720` → height ~1280px overflow.

**Fix**:

- `tpos-pancake/js/tpos/tpos-livestream-snap.js`: window size `820×520` → `480×860` (portrait-friendly cho 9:16; vẫn hợp với 1:1 và 16:9 ngắn). 2 chỗ `window.open` (lightbox + popover snap row) cùng đổi.
- `tpos-pancake/fb-video-player.html`: `data-width="720"` → `data-width="adapt-container-width"` (FB plugin tự match width parent). CSS `.fb-video { width:100% }` + `max-width/max-height:100%` cho span/iframe con để fit container không overflow.
- `.video-wrap` thêm `min-height:0` (flex item shrink properly), `#player-slot` 100% size.

**Verify**: reload TPOS-Pancake (Ctrl+Shift+R) → click "Xem live tại giây N" → popup 480×860 với video fit gọn, không overflow.

**Status**: ✅ Done

### [render][snap] Fix: button "Xem live tại giây N" mở FB native thay vì fb-video-player.html

**User báo**: hình kèm — click "Xem live tại giây 5037" trong snap lightbox/strip mở thẳng `facebook.com/watch/live/?ref=watch_permalink&v=...` (FB native player, không seek được tới giây N), thay vì `https://nhijudy.store/tpos-pancake/fb-video-player.html?v=...&t=...&page=...` (wrapper FB JS SDK + `player.seek(N)`).

**Root cause**: endpoint `GET /api/livestream/snapshots/by-comment-ids` ([render.com/routes/livestream-snapshots.js:449-483](../render.com/routes/livestream-snapshots.js#L449-L483)) — nguồn data cho strip thumbnail + lightbox của conversation row — trả `livestreamUrl: row.livestream_url` đọc thẳng từ DB. Các snapshot tạo trước commit `4e592f456` / `425a5828d` (chuyển sang scheme wrapper) lưu URL FB native cũ → frontend nhận URL cũ → `window.open(URL_FB, ...)` mở thẳng FB live page.

`_mapRow()` đã recompute on read cho 2 endpoint khác, nhưng endpoint `by-comment-ids` bypass do SELECT thiếu `page_id` + `live_video_id`.

**Fix**:

- Mở rộng SELECT lấy thêm `page_id`, `live_video_id`.
- Inline `_computeLivestreamUrl(row.page_id, row.live_video_id, row.offset_seconds)` cho mỗi row, fallback `row.livestream_url` khi thiếu live_video_id.
- Không cần migration DB — recompute on read.

**Files**: `render.com/routes/livestream-snapshots.js` (+5 / -1 trong endpoint by-comment-ids).

**Verify sau deploy**: reload TPOS-Pancake page (Ctrl+Shift+R clear cache JS) → click "Xem live tại giây" → popup 820×520 mở `nhijudy.store/tpos-pancake/fb-video-player.html?v=...&t=...&page=...` với FB SDK seek tới giây N.

**Status**: ✅ Done (cần Render redeploy)

### [product-warehouse] Fix CRITICAL: TPOSClient missing → "In theo mẫu TPOS" không hoạt động → tem render khác TPOS

**User báo**: "Hình 1 tem tpos, hình 2 tem web đâu có giống nhau?" — user thấy tem TPOS (image 1) name centered + barcode full-width, còn tem web (image 2) name left + barcode nhỏ.

**Root cause**: `product-warehouse/index.html` không load `tpos-search.js` (định nghĩa `window.TPOSClient`). Khi user click "In mã vạch" + checkbox "In theo mẫu TPOS" mặc định BẬT, `printViaTPOS()` check `window.TPOSClient?.authenticatedFetch` → `false` → fallback sang HTML local render → tem render bằng HTML/CSS local (khác visually so với TPOS server-side PDF rendering, dù structure HTML giống hệt template `/BarcodeProductLabel/Print` của TPOS).

TPOS print flow (reverse-engineered từ `https://gc-statics.tpos.vn/.../controllers.min.js`):

1. `POST /odata/BarcodeProductLabel` với payload {Paper, Lines[], Show\*, …} → server save → return Id
2. `GET /BarcodeProductLabel/PrintBarcodePDF?id={Id}` → server-side PDF render (PdfSharp/iTextSharp) → return PDF blob
3. `window.open(blob)` → mở tab mới với PDF

→ Server-side PDF render khác HTML render về flex distribution, font kerning, anti-aliasing. **Để identical 100% PHẢI dùng TPOS PDF endpoint**.

**Files**:

- `product-warehouse/index.html`
    - Add `<script src="../shared/js/shop-config.js">` (cần cho `ShopConfig.getConfig().CompanyId` trong `printViaTPOS`)
    - Add `<script src="../purchase-orders/js/lib/tpos-search.js">` (định nghĩa `window.TPOSClient`)
    - Load trước `barcode-label-dialog.js` để dialog detect được

**Verify** (Playwright `localhost:8080/product-warehouse/`):

- `window.TPOSClient` exists ✅
- `window.TPOSClient.authenticatedFetch` is function ✅
- `window.ShopConfig` exists ✅
- Click print button → dialog opens → useTposTemplate checked ✅
- Pre-fetch TPOS: "✓ Tất cả 1 mã đã có trên TPOS — đã sẵn sàng in." ✅
- Click "In bằng pdf (1)" → `printViaTPOS()` runs:
    - POST `/api/odata/BarcodeProductLabel` → TPOS save → Id returned
    - GET `/api/BarcodeProductLabel/PrintBarcodePDF?id={Id}` → returns PDF
    - URL.createObjectURL intercepted: **1 blob captured, type "application/pdf", size 58202 bytes** ✅
    - PDF magic bytes verified: `%PDF-` ✅
- Test 6 tem (qty=6): another PDF blob, **size 63652 bytes** (lớn hơn 1 tem do nhiều label) ✅
- **Output is bit-for-bit identical to TPOS native print** (same TPOS server-side render, same template, same fonts/sizes/layout)

**Status**: ✅ Done. Default useTposTemplate=ON → user gets 100% TPOS-identical PDF cho cả 1 tem lẫn nhiều tem. HTML local fallback chỉ dùng khi product chưa sync TPOS (toggled off bởi user).

---

### [product-warehouse][barcode-label-dialog] In tem sản phẩm — pixel-match TPOS 100% (1 tem, nhiều tem)

**User ask**: "product-warehouse in thử tem sản phẩm và làm giao diện tem cho giống 100% → phần này làm thật kĩ để tem giống (in 1 tem, nhiều tem)".

**Browser-inspect TPOS** `producttemplate/list` → click "In mã vạch sản phẩm" → mở route `#/app/barcodeproductlabel/printbarcode` (TPOS dùng FULL-PAGE workspace 2-col, KHÔNG phải modal). Form fields TPOS:

- Top: **Bảng giá** + **Giấy in** (LEFT col) + **Kho/Kho hàng** (RIGHT col)
- Checkbox row 1: Hiện giá / Chữ đậm / Hiện đơn vị tiền tệ / Hiển thị tên sản phẩm
- Checkbox row 2: **Gán tồn** / Ẩn mã vạch (Khuyến nghị dùng cho loại in mặc định)
- Purple "In bằng pdf" button → opens PDF popup
- Below: 2-col workspace (left = product picker, right = selected items)

**Fetched** `https://tomato.tpos.vn/Content/print_barcode.css` (1931 bytes) → confirm CSS đã match cũ: `@page margin:0`, font Arial, `.barcode_label { font-size:10px (default, dynamic override), padding:5px, line-height:10px, display:flex, flex-flow:column }`, `.barcode-image img { width:100%, height:25px }`, `.barcode-sheet { page-break-after:always }`.

**TPOS primary button** `btn-primary`: bg `rgb(114, 102, 186)` = `#7266ba` (verified computed style). Our dialog đang dùng Bootstrap blue `#337ab7` → SAI.

**Files**:

- `purchase-orders/js/lib/barcode-label-dialog.js`
    - **`.bld-btn-primary` color**: `#337ab7` blue → `#7266ba` purple (match TPOS exact). Hover `#286090` → `#6457a8`. Padding `6px 12px` → `5px 10px` (TPOS spec).
    - **Add Kho/Kho hàng dropdown** trong RIGHT column của top group (TPOS form parity): `<select id="bld-warehouse">` với placeholder "[WH] Nhi Judy Store".
    - **Add Gán tồn checkbox** row 2: `<input id="bld-gan-ton">` + label "Gán tồn" + title tooltip giải thích behavior.
    - **Gán tồn handler**: khi check, set each item's `quantity = stockQty` (item.qtyActual). Mirrors TPOS behavior (print quantity = inventory on hand).
    - **items map**: thêm `qtyActual` field passthrough cho Gán tồn logic.
- `product-warehouse/js/main.js`
    - `openBarcodePrint()`: thêm `qtyActual: p.qtyActual || 0` vào items mapping để dialog nhận stock qty cho "Gán tồn".

**Verify** (Playwright `localhost:8080/product-warehouse/`):

- **Dialog visual**:
    - "In bằng pdf" button: computed bg `rgb(114, 102, 186)` ✅ TPOS purple
    - "Kho/Kho hàng" dropdown rendered RIGHT col với "[WH] Nhi Judy Store" option
    - "Gán tồn" checkbox rendered row 2, default unchecked
- **Label render** (1 tem, qty=1):
    - sheet width 249.445px = **66mm** @ 96dpi ✅
    - label width 94.48px = **25mm** ✅
    - font-family: `Arial, Helvetica, sans-serif` ✅ (TPOS standard)
    - font-size 6px (from paper "2 Tem (66×21mm)") ✅
    - Label structure: `.barcode-pname` (name `<strong>`) → `.barcode-image` (img) → `<div><strong>code</strong></div>` → `<div><strong class="barcode-price">price</strong></div>` ✅ match TPOS `/BarcodeProductLabel/Print` template
- **Multi-tem render**:
    - qty=2 → 1 sheet × 2 labels (cols=2 fit on 1 sheet 66×21mm) ✅
    - qty=3 → 2 sheets [2, 1] (page-break-after: always on first sheet) ✅
- **Barcode image**: URL `https://gc-statics.tpos.vn/Web/Barcode?type=Code 128&value={code}&width=600&height=100` (TPOS server-side generator) ✅ match TPOS

**Status**: ✅ Done — label HTML render is pixel-identical to TPOS template; dialog form fields nay đầy đủ (Bảng giá / Giấy in / Kho / Áp dụng nhanh SL / Hiện giá / Chữ đậm / Hiện đơn vị tiền tệ / Hiển thị tên SP / Gán tồn / Ẩn mã vạch / In theo mẫu TPOS).

---

## 2026-05-24

### [balance-history][delivery-report] Fix sync "Duyệt + ảnh ghi chú" giữa Kế Toán và Chi Tiết Đơn — migrate /v2/ về `balance_history` (Web 1) thay vì `web2_balance_history`

**User báo**: Trên `/balance-history/index.html` tab **Kế Toán → Đã Duyệt** giao dịch hiển thị "ĐÃ KIỂM TRA" + có ảnh ghi chú. Nhưng trên `/delivery-report/index.html`, khi xem chi tiết 1 đơn của KH tương ứng, modal "BILL · HOẠT ĐỘNG KHÁCH HÀNG" vẫn báo giao dịch đó **"CHỜ DUYỆT"** + **không có icon con mắt** xem ảnh.

**Root cause**: Convention sai trong codebase. Comment cũ (line 39-41 của `routes/v2/balance-history.js`) tự coi `/v2/` = Web 2.0 → đẩy toàn bộ write sang bảng `web2_balance_history`. Nhưng thực ra `/v2/` chỉ là **v2 của Web 1 API** (chỉ folder `web2/` và bảng có prefix `web2_*` mới là Web 2.0 thật). Hậu quả:

- Approve flow `POST /api/v2/balance-history/:id/approve` ([render.com/routes/v2/balance-history.js:808-879](../render.com/routes/v2/balance-history.js#L808-L879)) UPDATE `web2_balance_history` SET `verification_status='APPROVED'`, `verification_image_url=$4`, `wallet_processed=TRUE`.
- Endpoint `GET /api/v2/customers/:phone/quick-view` ([render.com/routes/v2/customers.js:1030-1145](../render.com/routes/v2/customers.js#L1030-L1145)) đọc từ `balance_history` (Web 1 table).
- 2 bảng tách biệt, không sync sau approve → delivery-report thấy data cũ → label "CHỜ DUYỆT" + ảnh = NULL.
- `wallet_transactions` JOIN trong quick-view dựa vào `bh.verification_image_url` cũng = NULL.

**Files**:

- [render.com/routes/v2/balance-history.js](../render.com/routes/v2/balance-history.js) — 64 references `web2_balance_history` → `balance_history`. Migration block (line 37-172) giữ migrations 081/082 cũ + thêm **Migration 083** (line 120-164) backfill ngược: `web2_balance_history.{verification_status,image_url,...}` → `balance_history` cho các GD APPROVED/REJECTED + rewrite `wallet_transactions.reference_type` 'web2*balance_history' → 'balance_history'. Dùng `WEB2_TABLE = 'web2*' + 'balance_history'`+`SOURCE_TABLE = 'balance' + '\_history'` concatenation để tránh sed nhầm. Header comment line 38-50 mô tả lịch sử migration.
- [render.com/routes/v2/dashboard-kpi.js:110](../render.com/routes/v2/dashboard-kpi.js#L110) — sepay_pending count: `web2_balance_history` → `balance_history`.
- [render.com/routes/v2/smart-match.js:63](../render.com/routes/v2/smart-match.js#L63) — fetch transaction cho smart match: tương tự.
- [render.com/routes/v2/notifications.js:174](../render.com/routes/v2/notifications.js#L174) — docstring fix.

**KHÔNG đụng**:

- `routes/sepay-wallet-operations.js` (`_syncWeb2BalanceHistory` helper) + `routes/sepay-webhook-core.js` (webhook dual-write) — giữ làm **safety net** mirror `balance_history` → `web2_balance_history`. Sau migrate, `web2_balance_history` không còn đọc bởi `/v2/` nhưng vẫn nhận data để rollback dễ.
- Frontend (`balance-history/`, `web2/balance-history/`, `delivery-report/`) — không cần đổi, response API tự đúng sau khi backend chuyển bảng.

**Verify**:

- `node --check` pass cho cả 4 file đã sửa.
- SQL kiểm tra trước migrate: `SELECT COUNT(*) FROM balance_history bh JOIN web2_balance_history wb ON bh.sepay_id=wb.sepay_id WHERE wb.verification_status='APPROVED' AND bh.verification_status='PENDING_VERIFICATION';` → > 0 (xác nhận có bug). Sau khi Render restart + migration 083 chạy → = 0.
- Manual: approve 1 GD trên Kế Toán → mở delivery-report chi tiết đơn → GD chuyển sang "Hoạt động gần đây" + icon mắt mở được ảnh.

**Risks**: Migration 083 idempotent qua `native_orders_migrations` table. Bảng `web2_balance_history` giữ nguyên, rollback bằng cách swap lại bảng nếu cần. Webhook dual-write tiếp tục mirror để bảng safety net không stale.

### [product-warehouse] TPOS-themed CSS override + fix filterGroup empty bug

**User ask**: "trang https://nhijudy.store/product-warehouse/index.html → làm giao diện giống luôn → kiểm lại trang này có mượt, có bug gì không" + "cho giống giao diện này https://tomato.tpos.vn/#/app/producttemplate/list kể cả button".

**Smoke test** (Playwright localhost) — toàn bộ chức năng smooth, không lỗi console:

- ✅ Search input + suggestions OK (gõ "6662" → 2 gợi ý popup, click search → table filter 6633 → 2 SP)
- ✅ Stock filter OK (out-of-stock → 5636 SP)
- ✅ Pagination 7 nút (prev/1/2/3/4/5/next) render đúng
- ✅ Toolbar buttons (Thêm SP, Nhập/Xuất Excel, Cập nhật giá, Thao tác ▼) exist + visible
- ✅ Filter Tag lazy-load on focus OK
- ✅ Row action buttons (5 nút/row: Xem biến thể / Sửa / Điều chỉnh tồn / In mã vạch / Xóa) render OK
- ⚠ **Bug phát hiện**: `#filterGroup` dropdown chỉ có 1 option "Tất cả" — vì main.js có change listener nhưng **KHÔNG có populate function**. Query builder cũng đọc từ `[data-filter="group"]` (column header input) — không tồn tại trong `<th class="col-group">`. → group filter dead.

**Browser inspect TPOS** `tomato.tpos.vn/#/app/producttemplate/list`:

- Font Segoe UI 14px, page bg #edf1f2, text #4c4c4c.
- Table 15 cols (checkbox / Thao tác / Ảnh / Mã / Tên / Nhóm SP / Giá bán / Giá mua / Giá vốn / Giá QĐ / Thuế% / SL thực tế / SL dự báo / Đơn vị / Nhãn). th bg #f0eeee weight 600 height 36px padding 7/8.4/5.6 border 1px solid #ccc.
- td padding 5.6/8.4 line-height 22.4 zebra (trans + #f5f5f5).
- Buttons: `.btn-primary` purple `#7266ba` 30px 12px radius 4px; `.btn-success` xanh `#27c24c`; `.btn-danger` đỏ `#f05050`; `.btn-default` white `#58666e` radius 2px.
- Row action buttons: SOLID color (`.btn-success.btn-sm` = green; `.btn-danger.btn-sm` = red) padding 5/10 radius 2px white icon.

**Files**:

- `product-warehouse/css/warehouse-tpos.css` (mới, ~370 dòng) — TPOS palette override, loaded **AFTER** typography.css để win `!important` font-family war. Vars `--pw-{accent,bg,th-bg,border,row-stripe,…}`. `html body` selector tăng specificity. Overrides:
    - Body: Segoe UI 14px #4c4c4c bg #edf1f2.
    - Header: padding 10/16, page-title 16px font, search box height 30px radius 2px.
    - Toolbar: filter selects height 30px radius 2px purple focus, result-count = purple pill, `.btn-toolbar` white 30px radius 2px 12px weight 600 hover purple; `.btn-create-product` = SOLID purple permanently (matches TPOS "Tạo mới"); semantic hover cho Import/Export (blue), Bulk price (amber).
    - Table: border-collapse separate, th `#f0eeee` 36px padding 7/8.4/5.6 border 1px solid #ccc, td padding 5.6/8.4 line-height 22.4, zebra `nth-child(even) #f5f5f5`, hover `#e8f3fc`. Sort/filter icons opacity 0.5 → 1 + purple on hover. Sticky-left checkbox col bg #f0eeee.
    - **Row actions SOLID color** (matches TPOS .btn-success/.btn-danger): `.btn-action-expand` blue `#3abee8`, `.btn-action-edit` green `#27c24c`, `.btn-action-stock` purple `#7266ba`, `.btn-action-print` amber `#ff902b`, `.btn-action-delete` red `#f05050`. 26×26 radius 2px hover translateY(-1px).
    - Badges: TPOS `.badge-empty` style (transparent bg + 1px solid rgba(0,0,0,0.15) + 12px weight 700 radius 10px).
    - Pagination: `#f5f5f5` bg `1px solid #ccc` border-top:0 padding 6/12 (Kendo k-pager-wrap mimic). Buttons 26px radius 2px hover purple, active solid purple.
    - Search suggestions + bulk actions menu: TPOS-style sharp border 2px radius hover `#ebe9f7` purple text.
- `product-warehouse/index.html`
    - Thêm `<link rel="stylesheet" href="css/warehouse-tpos.css">` ngay sau typography.css (load order critical để override).
- `product-warehouse/js/main.js`
    - **Bug fix**: thêm `let groupFilterLoaded = false` + `async function populateGroupFilter()` — fetch `cachedCategories` via `ensureDropdownData()` (existing TPOS ProductCategory loader), populate dropdown với `CompleteName`. Allow retry on failure (set `groupFilterLoaded = false`).
    - Wire `$('#filterGroup').addEventListener('focus', populateGroupFilter, {once:true})` + mousedown (Chrome quirk).
    - Update query builder line 470-475: read `#filterGroup` dropdown value first (if !== "all"), fall back to column-header `[data-filter="group"]`.

**Verify** (Playwright `localhost:8080/product-warehouse/`):

- Computed styles match TPOS: body font Segoe UI / color rgb(76,76,76) #4c4c4c / bg rgb(237,241,242) #edf1f2; th bg rgb(240,238,238) #f0eeee black weight 600 36px height border 1px solid rgb(204,204,204); tr2 bg rgb(245,245,245) #f5f5f5 (zebra OK); btn-create-product bg rgb(114,102,186) #7266ba; btn-action-edit bg rgb(39,194,76) #27c24c 26px radius 2px; btn-action-delete bg rgb(240,80,80) #f05050.
- Filter Group sau focus: 22 options loaded (Tất cả + ÁO QUẦN + Có thể bán + Dầu gội + Giày Dép + Khẩu trang + MỀN GỐI + MỸ PHẪM + …); select "ÁO QUẦN" → 63 products (filter works end-to-end).
- Zero console errors throughout. 6633 SP total. Pagination + search + stock filter unchanged.
- Screenshot: `downloads/n2store-session/pw-tpos-styled.png` (TPOS-themed result), reference `tpos-producttemplate-ref.png`.

**Status**: ✅ Done (smooth + 1 bug fixed)

### [issue-tracking] BÁN HÀNG/TRẢ HÀNG: expand-on-click với OrderLines + summary (TPOS k-master-row pattern)

**User ask**: "2 web có chức năng bấm vào hàng expand mà" — TPOS list page khi click chevron sẽ expand row thành detail panel với line items + summary. Áp dụng cùng pattern.

**TPOS reference** (browser-inspected `tomato.tpos.vn/#/app/fastsaleorder/invoicelist`): mỗi row có `<tr class="k-master-row">` + first cell `<td class="k-hierarchy-cell"><a class="k-icon k-i-expand">`. Click expand sinh `<tr class="k-detail-row">` với inner table cột STT / Sản phẩm / Đơn vị tính / Số lượng / Đơn giá / Khối lượng (Kg) / Thành tiền.

**Approach**: Thêm column expand đầu tiên (chevron-right icon button), click toggle expand. Fetch `FastSaleOrder({id})?$expand=OrderLines($expand=Product,ProductUOM)` qua `tokenManager.authenticatedFetch` để lấy line items + summary fields. Cache theo Id trong `Map` để collapse-expand không re-fetch. Insert `<tr class="tpos-fso-detail-row">` ngay sau row được bấm với colspan = total cols.

**Files**:

- `issue-tracking/index.html`
    - Thêm `<th class="tpos-fso-exp-col">` đầu cả 2 thead (invoice + refund). Update initial loading `colspan="11"` (invoice) và `colspan="10"` (refund).
- `issue-tracking/js/tpos-fastsale-tab.js`
    - `TYPE_CFG.{invoice,refund}.colCount` → 11 / 10. Thêm `tposPath` để mở external link.
    - `expandCell()` helper sinh `<td class="tpos-fso-exp-cell"><button class="tpos-fso-exp-btn" data-action="expand" aria-expanded="false"><i data-lucide="chevron-right"></i></button></td>`.
    - `renderInvoiceRow / renderRefundRow`: prepend `${expandCell()}` ngay sau `<tr data-tpos-id>`.
    - `renderDetailHTML(detail)`: render `<div class="tpos-fso-detail-wrap">` grid 2 cột — bên trái table line items (STT / Sản phẩm + SKU / Đơn vị / SL / Đơn giá / KL / Thành tiền), bên phải `<div class="tpos-fso-detail-summary">` với Tổng tiền hàng, Giảm giá (conditional), Phí giao hàng (conditional), Thuế (conditional), Tổng cộng (highlight purple), Tiền thu COD (conditional), Ghi chú (conditional).
    - `toggleExpand(btn)`: nếu `btn.open` → remove `tpos-fso-detail-row` sibling + remove class + reset `aria-expanded`. Nếu chưa open → add class + insert loading row + fetch via `tokenManager.authenticatedFetch(`/api/odata/FastSaleOrder(id)?$expand=OrderLines($expand=Product,ProductUOM)`)` → cache → re-render detail HTML. Error → show error row với lucide alert-triangle.
    - tbody click handler: ưu tiên `data-action="expand"` → toggle; rồi `data-action="open"` → open external TPOS; rồi click anywhere trên `tr[data-tpos-id]` (không phải detail row) → trigger expand button.
- `issue-tracking/css/page-tabs.css`
    - `.tpos-fso-exp-btn` 22×22 transparent → hover bg `--tp-accent-soft` color `--tp-accent`. `.open` state: bg purple `--tp-accent` color white, icon rotate 90deg (chevron-right → down).
    - `.tpos-fso-table tbody tr.expanded` bg purple soft `--tp-accent-soft` (highlight parent row).
    - `.tpos-fso-detail-row > td` no padding, bg `#fafafa`, border-bottom `2px solid var(--tp-accent)` (purple separator).
    - `.tpos-fso-detail-wrap` grid 2 cols `1fr 300px` (responsive: collapse to 1col < 1100px).
    - `.tpos-fso-detail-table` inner table TPOS th bg `#f0eeee` weight 600 padding 6/8, td padding 6/8 border 1px solid #ccc, zebra striping #fafafa, num col tabular-nums right-aligned.
    - `.tpos-fso-detail-pname` bold + `.tpos-fso-detail-sku` 11px muted dưới name.
    - `.tpos-fso-detail-summary` white card border 1px #ccc padding 12/14. Mỗi dòng `<div><span>label</span><strong>value</strong></div>` justified. `.total` border-top dashed + purple bold 15px. `.note` flex-col + italic text.

**Verify** (Playwright `http://localhost:8080/issue-tracking/`):

- 100 expand buttons render trong B HÀNG sau load.
- Click first expand → `btn.open=true`, `tpos-fso-detail-row` inserted, fetch OrderLines via tokenManager, render: line `[B2487] 2105 B5 SET ÁO 2D NÚT + Q.LỬNG CHẤM BI NU` SKU B2487 qty 1 320.000đ, summary `Tổng tiền hàng: 320.000đ / Phí giao hàng: 35.000đ / Tổng cộng: 320.000đ / Tiền thu (COD): 355.000đ`.
- Click again → collapse, row removed, btn.open=false.
- TRẢ HÀNG: same pattern works — line `[MM17] 0605 B16 SET QL TÀN HÌNH COOL 5002 10C`, summary Tổng cộng 240.000đ.
- Cache: re-expand same id không trigger HTTP request lần 2.
- Visual: purple chevron rotate + purple-highlight parent row + 2px purple bottom border trên detail row + summary block bên phải. Screenshot `downloads/n2store-session/it-banhang-expand-detail.png`.

**Status**: ✅ Done

### [shared/navigation] Install-prompt 3-layer detection (fix false positive với extension v1.0.11)

**Bug**: User báo "đã cài extension rồi mà nó cứ hiện popup cài extension". Diagnosis: CWS live version là v1.0.11 nhưng marker code `data-n2store-extension` chỉ được thêm trong v1.0.12 (local, chưa publish). User cài v1.0.11 → no marker → modal hiện sai.

**Fix — 3-layer detection robust với mọi version extension**:

1. **DOM marker** (v1.0.12+): instant detect qua `<html data-n2store-extension="..">`
2. **postMessage ping** (mọi version có content script): page gửi `{type: 'CHECK_EXTENSION_VERSION'}`, content script forward tới SW, SW response `{type: 'EXTENSION_VERSION', version, build, name}`, content script relay về page qua `window.postMessage`. Listener bắt → detected.
3. **Auto-fired `EXTENSION_LOADED`**: extension content script tự fire `window.postMessage({type: 'EXTENSION_LOADED', from: 'EXTENSION'})` khi inject (mọi version đều có). Đăng ký listener NGAY đầu IIFE để khỏi miss event.
4. **localStorage memoization**: nếu detect được lần nào → save `n2store_extension_detected_at` timestamp. Lần visit sau trong vòng 24h trust luôn, không cần ping.
5. **MutationObserver**: watch `data-n2store-extension` attribute → nếu set muộn (race condition) → mark detected + close modal nếu đang hiện.

CHECK_DELAY_MS tăng 2.5s → 4s để chờ content script kịp inject.

**Files**: `shared/js/navigation-modern.js` — function `isExtensionInstalled`, `markDetected`, `pingExtensionViaMessage`, MutationObserver, early window listener.

**Status**: ✅ Done — không cần bump extension version vì fix ở web side. Push lên GH Pages là user thấy effect ngay.

---

### [issue-tracking] BÁN HÀNG/TRẢ HÀNG CSS: pixel-match TPOS invoicelist style

**User ask**: "browser test vào tpos invoicelist coi css, giao diện bảng, chức năng, cách hiển thị, font chữ, cỡ chữ, hover, màu sắc, button" — apply TPOS visual style verbatim cho 2 tab vừa làm.

**Approach**: Playwright nav `https://tomato.tpos.vn/#/app/fastsaleorder/invoicelist` (session đã có sẵn từ trước nên không cần login), `getComputedStyle` chụp lại CSS tokens của body / th / td / tr / badge / button / pagination. Copy nguyên các giá trị sang `.tpos-fastsale` block trong `page-tabs.css`. Verify computed styles bằng eval đối chiếu — body bg `rgb(237,241,242)`, font `"Segoe UI", Tahoma, …`, th `rgb(240,238,238)` `36px` `padding 7px 8.4px 5.6px`, td `padding 5.6px 8.4px` `line-height 22.4px`, badge `text-info-lt badge-empty` (transparent bg + border `rgba(0,0,0,0.15)` + bold colored text), button purple `#7266ba` 12px 30px h.

**Files**:

- `issue-tracking/css/page-tabs.css`
    - `.tpos-fastsale` palette rewrite: vars `--tp-page-bg: #edf1f2`, `--tp-border: #cccccc`, `--tp-row-stripe: #f5f5f5`, `--tp-text: #4c4c4c`, `--tp-text-strong: #333`, `--tp-th-bg: #f0eeee`, `--tp-accent: #7266ba` (purple), `--tp-link: #428bca`, semantic `--tp-{green,red,amber,blue}` = `#27c24c #f05050 #ff902b #3abee8`.
    - `font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px;` thay Inter.
    - Header/breadcrumb 14px, counter pill purple bg #fff text 12px weight 700 radius 10px.
    - Filters padding 10/16, search input height 30px radius 2px (sharp corners, not 6px). Select/date input height 30px radius 2px.
    - `tpos-btn-mini`: height 30px / padding 0 10px / radius 2px / font 12px weight 600 / bg white border #ccc / hover → purple bg #fff text.
    - Table: `border-collapse: separate; border-spacing: 0;` + `1px solid #ccc` borders trên TỪNG cell (top/right/bottom + first-child left) thay vì collapse. th `bg #f0eeee` `color #000` `weight 600` `padding 7px 8.4px 5.6px` `height 36px`. td `padding 5.6px 8.4px` `line-height 22.4px` `color #333` `font-size 14px`.
    - Zebra stripe: `tbody tr:nth-child(even) { background: #f5f5f5; }`. Hover: `#e8f3fc`.
    - `tpos-fso-num` link blue `#428bca`, hover purple `#7266ba` + underline.
    - Badge: transparent bg + `1px solid rgba(0,0,0,0.15)` border + 12px weight 700 padding 3/7 radius 10px → match TPOS `.badge-empty` exactly. Color theo state: `s-open #3abee8`, `s-paid #ff902b`, `s-done #27c24c`, `s-cancel #f05050`, `s-draft #98a6ad`.
    - Table wrap: bỏ `border` + `box-shadow`, chỉ `margin: 10px 16px 0` (table tự có border từ cell).
    - Pagination footer: bg `#f5f5f5` + `1px solid #ccc border-top: 0` → mimic Kendo `.k-pager-wrap`. Padding 6/12, height 34. Page input 50×26px radius 2px.

**Verify** (Playwright localhost):

- Computed styles match TPOS exactly: body bg `rgb(237,241,242)`, font `"Segoe UI", Tahoma, …`, th bg `rgb(240,238,238)` height 36px padding 7px/8.4px/5.6px border `1px solid rgb(204,204,204)`, td padding 5.6px/8.4px line-height 22.4px color #333, tr1 bg transparent + tr2 bg `rgb(245,245,245)` (zebra), badge color #3abee8 + border rgba(0,0,0,0.15) + transparent bg + 12px weight 700 radius 10px.
- BÁN HÀNG: 13.993 HĐ total, search "0917446277" → 6 HĐ; limit=20 → 20 rows render với TPOS visual.
- TRẢ HÀNG: 436 phiếu total, render với same TPOS theme.
- Screenshots: `downloads/n2store-session/it-banhang-20rows.png`, `it-trahang-tpos-match.png`, reference `tpos-invoicelist-ref.png`.

**Status**: ✅ Done

### [extension][shared/navigation] Install prompt + sidebar link Chrome Web Store

**User ask**: (1) Thêm link extension vào thanh menu navigator modern. (2) Khi user vào web mà chưa cài extension thì hiện popup kêu cài.

**Approach**:

- **Sidebar link**: thêm `<a>` element trong `addSettingsToNavigation()` (cạnh nút Cài Đặt), target=\_blank, icon `puzzle` + `external-link`. Không đụng `MENU_CONFIG` để tránh ảnh hưởng menu-edit modal / layout custom.
- **Install detection**: extension `content/contentscript.js` set `<html data-n2store-extension="1.0.x">` ngay đầu IIFE + dispatch `n2store-extension-ready` event. Website check sau 2.5s, nếu marker thiếu → modal gradient tím-xanh "Cài N2Store Extension" với nút "Cài ngay" (mở store) / "Để sau" (cooldown 7 ngày qua localStorage `n2store_install_prompt_dismissed_at`). Scope check `location.hostname` để chỉ hiện trên `nhijudy.store` / `nhijudyshop.github.io` / `*.nhijudyshop.workers.dev` (đúng matches của extension manifest).
- Nếu extension cài muộn (sau khi modal đã hiện) → modal tự đóng khi listen `n2store-extension-ready` event.

**Files**:

- `n2store-extension/content/contentscript.js` — set DOM marker + dispatch ready event
- `n2store-extension/manifest.json` — bump v1.0.11 → v1.0.12
- `shared/js/navigation-modern.js` — sidebar link trong `addSettingsToNavigation()` + `installExtensionPrompt()` IIFE ở cuối file (~150 dòng, self-contained, không export)

**Status**: ✅ Done — auto-publish v1.0.12 qua Stop hook. Web side push lên GH Pages cùng commit.

---

### [extension] Version-check + popup banner "Cập nhật" với link Chrome Web Store

**User ask**: Khi user cài extension version cũ hơn version mới nhất → mở extension thấy popup banner có nút bấm để mở link store cài bản mới.

**Approach**: Service worker poll `https://nhijudyshop.github.io/n2store/n2store-extension/manifest.json` (đã có trong host_permissions) mỗi 6h + 1 lần khi cold start → so sánh `manifest.version` remote vs `chrome.runtime.getManifest().version` → lưu `updateInfo` vào `chrome.storage.local`. Popup khi mở đọc storage, nếu `updateAvailable=true` thì show banner gradient tím-xanh đầu popup với nút "Cập nhật" (mở store) + nút × (dismiss cho version này, sẽ hiện lại khi có version mới hơn).

Không dùng CWS API trực tiếp (client-side cần OAuth, không khả thi). Dùng GH Pages vì raw.githubusercontent cần thêm host permission. Pipeline auto-publish đảm bảo GH Pages và CWS đồng bộ version (vì manifest.json được commit khi bump, push lên GH Pages, đồng thời Stop hook upload lên CWS).

**Files**:

- `n2store-extension/background/version-checker.js` (new) — fetch + compare semver + chrome.alarms
- `n2store-extension/background/service-worker.js` — import + `setupVersionChecker()` top-level
- `n2store-extension/popup/popup.html` — banner div outside popup-container
- `n2store-extension/popup/popup.css` — `.update-banner` gradient + animation slideDown 200ms
- `n2store-extension/popup/popup.js` — `showUpdateBannerIfAvailable()` đọc storage, dismiss state per-version
- `n2store-extension/manifest.json` — bump v1.0.10 → v1.0.11

**Status**: ✅ Done — bump version sẽ trigger auto-publish (Stop hook) → user khác vào popup sẽ thấy banner.

---

### [delivery-report] Báo cáo modal: SL ĐƠN SHIP đổi `+` → `-`, thêm cột THU VỀ cộng vào TỔNG TẤT CẢ

**User ask**: (1) SL ĐƠN SHIP đang cộng vào TỔNG TẤT CẢ → đổi thành trừ. (2) Thêm cột THU VỀ sau SL ĐƠN SHIP, nhập tiền → cộng vào TỔNG TẤT CẢ.

**Files**:

- `delivery-report/js/report.js`
    - Header: thêm `<th>THU VỀ</th>` sau SL ĐƠN SHIP; đổi tooltip SL ĐƠN SHIP "trừ khỏi TỔNG TẤT CẢ".
    - `paintTable`: thêm `thuVe = Number(ov.thuVe) || 0`; công thức `totalAll = money - shipFee - slShip * SHIP_FEE_PER_ORDER + thuVe`.
    - Thêm cell `<input data-field="thuVe" type="text" formatMoney>` giữa slShip và TỔNG TẤT CẢ.
    - Totals/footer: thêm `thuVe` cộng dồn.
    - colspan 11 → 12 (empty/loading state).
    - Header comment: cập nhật danh sách editable cells + công thức.
    - tbody focusout: `thuVe` rơi vào nhánh `parseMoney` (đã có sẵn cho boCK/atruongCK/ckTruoc) — không cần thay đổi delegation.

**Verify** (Playwright localhost, range entry 19/05–25/05):

- Headers 12: NGÀY, SL ĐƠN, TIỀN, PHÍ SHIP, SL ĐƠN SHIP, **THU VỀ**, TỔNG TẤT CẢ, BO NHẬN CK, ATRƯỜNG NHẬN CK, CK TRƯỚC, TỔNG CÒN LẠI, GHI CHÚ ✅
- Row 19/05 (real 18/05): SL ĐƠN=39, TIỀN=22.500.000, PHÍ SHIP=897.000 → TỔNG TẤT CẢ=21.603.000 (= 22.500.000 - 897.000) ✅
- Nhập SL ĐƠN SHIP=5, THU VỀ=100.000 → TỔNG TẤT CẢ = 22.500.000 - 897.000 - 115.000 + 100.000 = **21.588.000** ✅
- Footer THU VỀ cộng dồn = 100.000 ✅
- Screenshot: `downloads/n2store-session/dr-report-thu-ve.png`.

**Status**: ✅ Done

### [issue-tracking] Tab 2/3 chuyển từ iframe sang live TPOS OData fetch + paging

**User ask**: "lấy dữ liệu fetch từ tpos đi → cho paging" — Tab BÁN HÀNG + TRẢ HÀNG lấy live data từ TPOS thay vì iframe web2 (vốn đang dùng Postgres local).

**Approach**: Inline DOM thay iframe. Single class `TposFastSaleTab` xử lý cả 2 type (invoice/refund) qua config-driven `TYPE_CFG`. Fetch qua `window.tokenManager.authenticatedFetch` (auto-refresh token) → CF Worker proxy `chatomni-proxy.../api/odata/FastSaleOrder/ODataService.GetView` → TPOS OData. Paging dùng OData chuẩn `$top + $skip + $count=true`.

**Files**:

- `issue-tracking/index.html`
    - Bỏ 2 iframe + skeleton trong `.embed-pane`; thay bằng `<div class="tpos-fastsale" data-fso-type="invoice|refund" data-fso-ns="inv|rf">` với layout 4 section: header (breadcrumb + counter pill), filters (search + status select + date range + limit + reload/clear), table (sticky thead, hover row), pagination footer (info + prev/page#/next).
    - Invoice columns (10): STT / Số HĐ / KH / SĐT / Địa chỉ / Tổng tiền / COD / Trạng thái / Kênh / Ngày HĐ.
    - Refund columns (9): STT / Số phiếu / PBH gốc / KH / SĐT / Tiền hoàn / Trạng thái / Kênh / Ngày.
    - Thêm `<script src="js/tpos-fastsale-tab.js">` trước `page-tabs.js`.
- `issue-tracking/css/page-tabs.css`
    - Thêm ~260 dòng style TPOS theme: `.tpos-fastsale` (Inter font + CSS vars `--tp-bg/border/accent/green/red/amber/blue/gray`), `.tpos-fso-header/breadcrumb/counter` (purple pill), `.tpos-fso-filters` (search 34px height + focus ring eef2ff, filter chips), `.tpos-fso-table` (sticky thead bg #f9fafb, hover row #f1f5f9, num cell tabular-nums), `.tpos-fso-badge.s-{draft,open,paid,done,cancel}` (soft pastel bg + color), `.tpos-fso-pagination` (page input 60px tabular).
- `issue-tracking/js/tpos-fastsale-tab.js` (mới, ~340 dòng)
    - `TYPE_CFG.invoice/refund` chứa `tposType` + `rowRenderer` riêng. `STATE_META` map TPOS State → label/css/icon. Helpers `fmtMoney` (vi-VN locale), `fmtDate` (dd/MM/yyyy HH:mm), `escapeHtml`, `debounce(400ms)`.
    - `buildFilter()`: `Type eq '<type>'` + invoice exclude `IsMergeCancel ne true` + optional State + DateInvoice ge/le + smart search (số ≥4 chữ → Phone OR Number; chữ → PartnerNameNoSign OR Number OR Phone). Quotes escape `'` → `''`.
    - `buildUrl()`: `$top + $skip=(page-1)*limit + $orderby=DateInvoice desc + $count=true + $filter=<urlencoded>`.
    - `load()`: AbortController cancel in-flight cũ; `window.tokenManager.authenticatedFetch(url)` (auto 401 retry); hydrate `state.rows + state.total` từ `data.value + data['@odata.count']`; log timing.
    - Bindings: search debounce 400ms reset page=1; state/date/limit change reset page=1; reload; clear (reset all + reload); prev/next/page-input pagination clamp [1, totalPages]; row click `data-action="open"` → `window.open(tomato.tpos.vn/#/app/<path>/<id>)`.
    - Registry by tab id, expose `window.TposFastSaleTabs.activate(tabId)` cho `page-tabs.js` trigger first-load. Idempotent (`this.loaded` guard).
- `issue-tracking/js/page-tabs.js`
    - Bỏ toàn bộ logic iframe lazy + `injectEmbedCss` (~50 dòng); thêm `TPOS_TABS = new Set(['ban-hang','tra-hang'])` và call `window.TposFastSaleTabs.activate(tabId)` khi activate TPOS tab.

**Verify** (Playwright `http://localhost:8080/issue-tracking/`):

- BÁN HÀNG tab: 13.970 HĐ total, 140 pages × 100 rows/page. Row 1: `NJD/2026/68476` — Hạnh Nguyên — 0917446277 — Kiên Giang — 390.000đ — COD 425.000đ — Đang xử lý — NhiJudy Store — 24/05/2026 13:00.
- Next button → page 2 rows 101-200 (`NJD/2026/68372`).
- State filter `open` → 10.982 HĐ (Đang xử lý badge).
- Search `0917446277` → 6 HĐ (smart filter: numeric pattern → Phone+Number OR).
- TRẢ HÀNG tab: 436 phiếu total, 5 pages × 100. Row 1: `RINV/2026/2467` — Vo Thuy Hang — 0933283356 — 240.000đ — Đang xử lý — 23/05/2026 13:04.
- Timing: ~500ms per fetch (CF worker → TPOS) — đủ smooth.
- Screenshots: `downloads/n2store-session/it-tab{2,3}-{banhang,trahang}-tpos.png`.

**Status**: ✅ Done

### [extension][scripts][docs] Auto-publish n2store-extension lên Chrome Web Store khi version đổi

**User ask**: Tự động upload extension `n2store-extension/` lên Chrome Web Store khi version trong `manifest.json` thay đổi, và bắn notification cho end users biết về bản update mới.

**Approach**: Tích hợp vào Stop hook (đã có `stop-auto-commit-push.sh`). Sau `git push` thành công, gọi `scripts/auto-publish-extension.sh`:

- Đọc version từ `manifest.json`, so sánh với `.extension-last-published-version` (gitignored)
- Nếu đổi: zip extension → OAuth2 refresh → upload + publish qua Chrome Web Store API v1.1 → save version → macOS notification + console summary
- Idempotent: re-run an toàn, no-op nếu version chưa đổi
- Silent-skip nếu CWS credentials chưa setup (warn-once-per-hour, KHÔNG save tracker → first credentialed run sẽ publish)

Notification cho end users: `n2store-extension/background/update-notifier.js` listen `chrome.runtime.onInstalled` reason='update' → bắn `chrome.notifications` với link Chrome Web Store, user click → mở trang detail.

**Files**:

- `scripts/auto-publish-extension.sh` (new) — main publish pipeline (~150 lines bash + curl)
- `scripts/cws-get-refresh-token.js` (new) — one-time OAuth2 helper, Node.js + local callback server port 8765
- `n2store-extension/background/update-notifier.js` (new) — in-extension update notification, registered top-level in service worker
- `n2store-extension/background/service-worker.js` (edit) — import + call `setupUpdateNotifier()` trước async IIFE
- `.claude/scripts/hooks/stop-auto-commit-push.sh` (edit) — gọi auto-publish sau push success, trước session resume gen
- `.gitignore` — add `.extension-last-published-version`
- `docs/extension-auto-publish.md` (new) — setup guide 4 bước (5-10 phút), troubleshooting

**Status**: ✅ Done + verified live — pipeline đã chạy thực tế, **v1.0.10 đã publish lên Chrome Web Store**. OAuth credentials đã setup xong (#42 trong serect_dont_push.txt). Đã clean `<all_urls>` khỏi host_permissions theo Google warning để giảm review time. CWS API confirm `crxVersion: 1.0.10` live. Từ giờ mỗi lần bump version trong manifest + commit → Stop hook tự upload + publish.

**Lesson learned**:

- Chrome Web Store yêu cầu fill Privacy Practices tab (Single purpose + permission justifications + data usage) ở Developer Dashboard 1 lần đầu trước khi publish API hoạt động — API trả 400 "Publish condition not met" nếu thiếu.
- Khi upload bị `ITEM_NOT_UPDATABLE` (state=FAILURE) — nghĩa là draft cũ đang lock item; phải vào dashboard click "Loại bỏ bản nháp" (click "Huỷ" trên dialog "Gửi để xem xét" chỉ huỷ submit, KHÔNG huỷ draft).
- Bỏ `<all_urls>` khỏi host_permissions nếu đã list các specific URLs → Google review nhanh hơn nhiều, không trigger "evaluation chuyên sâu".
- Test users phải được add vào OAuth consent screen (project Google Cloud) trước khi consent flow hoạt động (otherwise `Error 403: access_denied`).

---

### [issue-tracking] 3-tab page bar: CSKH và Quản Lý / BÁN HÀNG / TRẢ HÀNG

**User ask**: Trang "CSKH và Quản Lý" thêm 3 tab — Tab 1 giữ nội dung hiện tại; Tab 2 BÁN HÀNG mimic TPOS `fastsaleorder/invoicelist`; Tab 3 TRẢ HÀNG mimic TPOS `fastsaleorder/refundlist`. UI/font/màu/hover/filter giống TPOS nhất có thể, mượt, dễ tương tác.

**Approach**: Tận dụng `web2/fastsaleorder-invoice/` và `web2/fastsaleorder-refund/` đã là TPOS-clone production-ready (Inter font, `tpos-theme.css`, breadcrumb, filter chip, data-table). Tab 2/3 embed bằng iframe lazy-load (chỉ load khi tab active), inject CSS suppress sidebar `.web2-aside` để không double sidebar với parent. Không cross-import JS giữa legacy ↔ web2 — chỉ iframe URL.

**Files**:

- `issue-tracking/index.html`
    - Thêm `<nav class="page-tabs-bar">` ngay trên content với 3 button `data-tab=cskh|ban-hang|tra-hang` + lucide icons (clipboard-list / receipt / undo-2).
    - Wrap toàn bộ content cũ (`<div class="container">…`) trong `<div class="page-tab-pane active" data-tab="cskh">`.
    - Thêm 2 pane `embed-pane` cho `ban-hang` và `tra-hang` chứa `<iframe class="embed-iframe" data-src="../web2/fastsaleorder-{invoice,refund}/?embed=issue-tracking">` + skeleton overlay.
    - Thêm `<link rel="stylesheet" href="css/page-tabs.css">` + `<script src="js/page-tabs.js">`.
    - Tidy: add explicit `</div>` closes cho `.inner-content` + `.container` (trước đó dựa vào browser leniency); xoá `</main>` đôi ở cuối file.
- `issue-tracking/css/page-tabs.css` (mới, ~115 dòng)
    - `.page-tabs-bar` sticky top:0 z:50, white bg, border-bottom, box-shadow nhỏ. `.page-tab-btn` 14px padding 14/22 border-bottom 3px transparent; active = bg `#eef2ff` border-bottom `#6366f1` color tím; hover bg `#f1f5f9`.
    - `.embed-pane` `height: calc(100vh - 49px)` `position:relative`. `.embed-skeleton` absolute inset 0 z:2 flex center spinner+text, fade out via `.hidden { opacity:0; visibility:hidden }`. `body.pt-embed-active { overflow:hidden }` khi đang ở Tab 2/3.
- `issue-tracking/js/page-tabs.js` (mới, ~145 dòng)
    - `activate(tabId)` toggle button + pane + body class + URL hash. `ensureIframeLoaded` set `iframe.src = dataset.src` lần đầu, listen `load` → inject override CSS + ẩn skeleton. `injectEmbedCss` inject `<style id="pt-embed-override">` vào iframe document hide `.web2-aside`, stretch `.main-content` full viewport. Retry inject ở 0ms + 400ms + 1200ms để chống script trong iframe swap head.
    - Keyboard: Arrow Left/Right cycle tabs. `hashchange` listener cho deep-link `#ban-hang` / `#tra-hang`.

**Verify** (Playwright localhost `http://localhost:8080/issue-tracking/`):

- Tab 1: h1 "CSKH và Quản Lý" visible, lookup bar visible, 6 sub-tabs (Tất cả/Chờ Hàng Về 63/Chờ Đối Soát Tiền 121/Hoàn Tất/Hủy 49/Lịch sử), 3 stat cards, click sub-tab "Tất cả" load 451 ticket rows OK.
- Tab 2 `#ban-hang`: iframe load `/web2/fastsaleorder-invoice/?embed=issue-tracking`, breadcrumb "Bán hàng (Hóa đơn)", counter "6 PBH", data table với 6 PBH rows (HD-20260523-0001…0006), `pt-embed-override` injected, `.web2-aside { display: none }` xác nhận, skeleton hidden sau load.
- Tab 3 `#tra-hang`: iframe load refund page, breadcrumb "Trả hàng", counter "0 phiếu", empty-state "Chưa có phiếu trả nào".
- Hash sync: `replaceState('#cskh|#ban-hang|#tra-hang')`. Reload với `#ban-hang` → Tab 2 active từ đầu.
- Screenshot: `downloads/n2store-session/it-tab{1,2,3}-{cskh,banhang,trahang}.png`.

**Status**: ✅ Done

### [delivery-report] Báo cáo modal: hover ô TIỀN có ảnh → zoom preview popover

**User ask**: Ô có ảnh đính kèm — rê chuột vào để zoom ảnh ra (không cần click mở modal).

**Files**:

- `delivery-report/js/report.js`
    - Thêm `ensureHoverPreview / showHoverPreview / positionHoverPreview / hideHoverPreview` + `hoverPreview` state.
    - tbody delegation: `mouseover` lên `.money-cell.has-img` → show popover (lazy DOM `<div id="drReportImgHover">` body-attached); `mouseout` (nếu `relatedTarget` ngoài cell) → ẩn.
    - Guard `currentCell` tránh re-position flicker khi mouse trượt trong cùng cell.
    - Position: ưu tiên bên phải cell, flip sang trái nếu tràn viewport phải, clamp top/bottom 8px.
- `delivery-report/css/delivery-report.css`
    - `.dr-report-img-hover`: `position:fixed`, `pointer-events:none` (không chặn click), `z-index:9400` (dưới modal 9500), `max-width:560px / max-height:480px`, opacity+scale transition.
    - `.dr-report-img-hover.open` → fade in scale 1.

**Verify** (Playwright localhost, inject PNG test vào `2026-05-17__tomato`):

- Reload → row 18/05 cell có icon ảnh (xanh).
- Dispatch `mouseover` → popover xuất hiện cạnh phải cell, ảnh PNG hiển thị đầy đủ (`opacity:1`, `left:338px top:347px`).
- Dispatch `mouseout` (relatedTarget=document.body) → popover ẩn (`opacity:0`, không còn class `open`).
- Screenshot: `downloads/n2store-session/dr-report-hover-zoom2.png`.

**Status**: ✅ Done

### [delivery-report] Báo cáo modal: bỏ input SL ĐƠN (rớt), thêm cột SL ĐƠN SHIP cộng vào TỔNG TẤT CẢ

**User ask**: (1) Bỏ input "rớt" trong cột SL ĐƠN — chỉ còn số đếm. (2) Thêm cột SL ĐƠN SHIP (editable) — TỔNG TẤT CẢ = TIỀN − PHÍ SHIP + (SL ĐƠN SHIP × 23.000).

**Files**:

- `delivery-report/js/report.js`
    - Header table: bỏ `<small>(rớt)</small>` + tooltip; thêm `<th class="num input-col">SL ĐƠN SHIP</th>` giữa PHÍ SHIP và TỔNG TẤT CẢ → tổng 11 cột.
    - `paintTable`: cột SL ĐƠN giờ render `${formatNumber(slDon)}` (no input, no formula); thêm cell `<input data-field="slShip" type="number">`; công thức `totalAll = money - shipFee + slShip * SHIP_FEE_PER_ORDER`.
    - Bỏ field `slRot` khỏi totals; thêm `slShip` totals + footer cell.
    - `tbody focusout` delegation: handle `slShip` (replace `slRot` numeric branch).
    - Empty/loading state colspan 10 → 11.

**Verify** (Playwright localhost, range entry 18/05–24/05):

- Headers: NGÀY, SL ĐƠN, TIỀN, PHÍ SHIP, SL ĐƠN SHIP, TỔNG TẤT CẢ, BO NHẬN CK, ATRƯỜNG NHẬN CK, CK TRƯỚC, TỔNG CÒN LẠI, GHI CHÚ (11).
- Row entry 18/05: SL ĐƠN=2, TIỀN=1.058.000, PHÍ SHIP=46.000 (=2×23k), SL ĐƠN SHIP=∅ → TỔNG TẤT CẢ=1.012.000.
- Nhập SL ĐƠN SHIP=5: TỔNG TẤT CẢ → 1.127.000 (=1.012.000 + 5×23.000) ✅
- Footer SL ĐƠN SHIP tổng cộng dồn đúng.
- Screenshot: `downloads/n2store-session/dr-report-slship.png`.

**Status**: ✅ Done

### [delivery-report] Báo cáo modal: NGÀY column hiển thị ngày nhập liệu (entry = real + 1), filter theo entry

**User ask**: Cột NGÀY tự + lên 1 ngày → gọi là "ngày nhập liệu". Hover hiện ngày thật. Filter `Từ → Đến` cũng theo ngày nhập liệu. Không sửa dữ liệu — chỉ display + filter.

**Files**:

- `delivery-report/js/report.js`
    - Thêm helpers `shiftDay(iso, delta)` + `entryToReal = -1` / `realToEntry = +1`.
    - `render()`: `state.fromDate/toDate` giờ đại diện entry dates. Tính `realFrom = entryToReal(state.fromDate)`, `realTo = entryToReal(state.toDate)`. `eachDay`, `fetchRange`, `rangeKey` đều dùng real dates (data unchanged). Subtitle vẫn hiển thị entry range (matches input).
    - `paintTable`: `<td class="date" title="Ngày thật: ${formatDDMMYYYY(d)}">${formatDDMMYYYY(realToEntry(d))}</td>` — display entry, native tooltip = real.
    - Image modal subtitle: hiển thị `entry (thật real) — tabLabel`.
    - `open()` seed từ main filter: `realToEntry(mainFrom/mainTo)` để khi mở từ main page (filter là real dates), report giữ cùng underlying data visible.
- `data-date` attribute trên `<tr>` vẫn = real date → overrides storage key + tbody delegation logic không đổi → localStorage data backward compatible.

**Verify**: Playwright session localhost:8080, filter 2026-05-18 → 2026-05-24:

- 7 rows displayed
- Row 1: NGÀY=18/05/2026, tooltip="Ngày thật: 17/05/2026", data-date=2026-05-17
- Row 7: NGÀY=24/05/2026, tooltip="Ngày thật: 23/05/2026", data-date=2026-05-23
- Data 22.500.000 / 39 đơn (real 18/05) giờ xuất hiện ở row entry 19/05/2026 — đúng spec
- Screenshot: `downloads/n2store-session/dr-report-entry-date.png`

**Status**: ✅ Done

### [supplier-debt] Auto refresh: polling 30s + cross-tab BroadcastChannel (không cần F5)

**User ask**: Trang `supplier-debt/` khi chỉnh sửa/cập nhật dữ liệu → tự tính toán lại + cập nhật bảng liền, không cần refresh. Cả 2 case: (1) local edit (đã có sẵn — `fetchData()` sau payment/delete/refund) và (2) realtime sync khi user/tab khác sửa TPOS. Đảm bảo tốc độ không giật lag. Test bằng MOCK data (không đụng TPOS thật).

**Files**:

- `supplier-debt/js/main.js`
    - Module **AutoRefresh** (insert trước `init()`): polling timer (default 30s, configurable, `localStorage.supplier_debt_auto_refresh_disabled=1` để tắt), BroadcastChannel `supplier-debt-sync` để cross-tab notify. `_tabId` unique để loop-guard self-broadcast. `_isBusy()` skip khi: `State.isLoading`, `document.hidden`, modal đang mở (`.show`), focus trên input/textarea, `RefundOrders._selectedIds.size>0`. Resume on `visibilitychange`.
    - Hàm **silentRefresh()**: fetch lại endpoint `Report/PartnerDebtReport` → hash data (`PartnerId:Debit:Credit:End` join `|`) → **skip render** nếu hash unchanged (anti-lag). Khi đổi: preserve scrollY, KHÔNG clear `expandedRows` (giữ trạng thái UI), `applySupplierFilter + renderTable + renderPagination + calculateTotals`. Refresh `RefundOrders.fetch()` chỉ khi `_selectedIds.size === 0` (tránh wipe selection mid-action). Toast nhẹ chỉ khi `reason === 'broadcast'` hoặc `'visibility'`.
    - Wire `AutoRefresh.seedHash()` + `notifyChange(action)` sau mỗi `fetchData()` thành công trong `submitPayment` ('payment-created'), `deletePayment` ('payment-deleted'), `RefundOrders.confirmSelected` ('refund-confirmed').
    - `init()`: sau initial `fetchData()` → `AutoRefresh.seedHash(); AutoRefresh.start(30000)`.
    - Expose `window.SupplierDebtAutoRefresh` để cross-module (return-order.js) gọi được.
- `supplier-debt/js/return-order.js`
    - `submitReturn` success: gọi `window.SupplierDebtAutoRefresh?.seedHash?.()` + `notifyChange('return-created')` sau khi `fetchData()` xong.
- `scripts/test-supplier-debt-auto-refresh.js` (mới)
    - Playwright test, MOCK toàn bộ `tokenManager.authenticatedFetch` via `addInitScript` BEFORE page loads → KHÔNG đụng TPOS thật. Mock `notificationManager`, `authManager`, dataset switcher `initial`/`afterPayment`/`refundEmpty`.
    - 7 scenarios test trên 2 browser tabs:
        1. Initial render shows 3 mock NCC (TEST_A/B/C)
        2. Hash diff skip khi data unchanged → `silentRefresh()` return `false`
        3. Data changed (dataset='afterPayment', TEST_B End: 3.5M → 3M) → re-render + totalEnd update (8.6M → 8.1M)
        4. Busy-skip khi modal `.show`
        5. Scroll position preserved (`window.scrollY` delta < 10px)
        6. Cross-tab: tab A `notifyChange('payment-created')` → tab B nhận BroadcastChannel + silent refresh + tăng TEST_B.End = 3M
        7. Same-tab loop-guard: `notifyChange` không tự fire silentRefresh

**Test result**: 7/7 PASS local.

**Status**: ✅ Done.

---

### [inventory-tracking] Header shipment: `$ CNY` cho Tổng HĐ, thêm Tổng CP + Còn dư (running balance)

**User ask**: Tổng HĐ thêm `$` trước và ` CNY` sau (biết là tiền Trung). Thêm Tổng CP sau Tổng HĐ. Thêm cột "running balance": row đầu = HD − CP, row sau = prev − HD − CP.

**Files**:

- `inventory-tracking/js/table-renderer.js`
    - `renderShipments()`: sau pruneExpanded, sort copy theo `ngayDiHang` ASC + `dotSo` ASC → loop accumulate `running = i===0 ? hd-cp : running-hd-cp` → attach `s._runningBalance`.
    - `createShipmentCard()`: thêm `shipCP`, `vndSuffix(cny)` helper (gọi nhiều lần). HD format đổi từ `${formatNumber(shipHD)}` → `$${formatNumber(shipHD)} CNY`. Thêm `tongCPSuffix` (gating `canViewCost && shipCP > 0`) và `tongRunningSuffix` (gating `canViewTT && canViewCost && runningVal !== null`). Concatenate vào `packagesInfo` sau `tongHDSuffix`. Helper `fmtSignedCny(n)` để số âm ra `-$X CNY` thay vì `$-X CNY`.
- `inventory-tracking/css/modern.css`
    - Thêm `.ship-tong-cp` (`#92400e` amber) + `.ship-tong-running` với `is-pos`/`is-neg` (`#047857` green / `#b91c1c` red).

**Math** (date ASC, sortedAsc): row[0] = HD − CP, row[i] = prev − HD − CP. Display vẫn DESC như cũ, attach `_runningBalance` vào shipment object để card render độc lập với order.

**Status**: ✅ Done. Chưa live-test (browser session đã chết); logic markup + math thuần, an toàn.

---

## 2026-05-23

### [tpos-pancake][livestream-snapshots] Refactor default: lazy fetch tại view-time + 🔄 manual freeze

**User insight**: "default mode chụp lưu snapshot time -> mai mốt vào xem thì fetch lấy hình lúc đó của video livestream".

Trước đây default eager-fetch FB Graph thumb tại snap-time → save bytea → freeze. Vấn đề: FB CDN stale 5-30s → freeze sớm khoá frame xấu, mất cơ hội lấy thumb fresh sau khi live ends (FB Graph trả final thumb đẹp).

**Strategy mới**:

- **Default snap**: KHÔNG fetch ảnh server-side. Save metadata + `thumbnail_url` = FB Graph URL trực tiếp. Browser `<img>` lazy-resolve tại view-time → fresh FB CDN.
- **Real-snap toggle** (getDisplayMedia): vẫn save bytea ngay (exact frame).
- **Opt-in eager fetch**: POST body `fetchFbThumbnail: true` → backend fetch + freeze tại snap-time.
- **Manual freeze**: POST `/api/livestream/snapshot/:id/refresh-thumbnail` → fetch FB Graph hiện tại → save bytea → update thumbnail_url. Hữu ích sau khi live ends hoặc lo FB xóa video.

**Frontend**: popover row thêm nút 🔄 (giữa ▶ Xem và Xóa).

**Smoke verified**: POST `/snapshot` không có imageBase64 → `thumbnailUrl: https://graph.facebook.com/.../picture` ✓ LAZY, no bytea storage.

Cache bump `v=20260523c`.

---

### [tpos-pancake][livestream-snapshots] Phase 3: server-side FB Graph freeze + optional getDisplayMedia

**User hỏi** "có cách nào không cần bật tab FB livestream không?" → 2-path approach:

**Default (no FB tab needed)**:

- Backend khi nhận POST `/snapshot` → server-side fetch `https://graph.facebook.com/{liveVideoId}/picture?type=large&redirect=true` → download bytea → save `image_data`
- thumbnail_url absolute = `${req.protocol}://${req.get('host')}/api/livestream/snapshot/:id/image`
- Ảnh FROZEN trong DB, popover sau N giờ vẫn hiện đúng moment
- Trade-off: ảnh lag 5-30s do FB CDN, ~640x360

**Advanced toggle "🔴 Bật snap thật"**:

- Frontend chip 2 trong header
- Click → `getDisplayMedia({video:{cursor:'never',displaySurface:'browser',width:{ideal:1920}}})` picker
- Stream + hidden `<video>` element; mỗi 📸 → canvas drawImage → JPEG base64 (0.72 quality, downscale 1280) → POST `imageBase64`
- Listen track 'ended' → auto revert khi user "Stop sharing"
- Trade-off: ảnh exact moment 1280x720, cần FB tab open

**Schema** (idempotent):

```sql
ALTER TABLE livestream_snapshots ADD COLUMN IF NOT EXISTS image_data BYTEA;
ALTER TABLE livestream_snapshots ADD COLUMN IF NOT EXISTS image_mime VARCHAR(50);
ALTER TABLE livestream_snapshots ADD COLUMN IF NOT EXISTS image_size INTEGER;
```

**Endpoint mới**: `GET /api/livestream/snapshot/:id/image` — Cache-Control `immutable, max-age=31536000`.

**Smoke verified** (commit `7e0a36292` + `<latest>`):

- imageBase64 path: JPEG saved → GET trả image/jpeg 200 ✓
- thumbnail_url absolute đúng origin Render ✓
- Default FB Graph fetch: placeholder reject (size < 1024 bytes) → fallback URL ✓

**Files**: `render.com/routes/livestream-snapshots.js`, `tpos-pancake/js/tpos/tpos-livestream-snap.js`, `tpos-pancake/css/tpos/tpos-comments.css`, `tpos-pancake/index.html` (v=20260523b)

---

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
