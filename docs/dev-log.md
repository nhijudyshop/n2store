# Dev Log — N2Store

> Cập nhật liên tục khi code. Mới nhất ở trên.
>
> **Cách tìm nhanh:** Ctrl+F tìm theo ngày `## 2026-`, theo module `[inbox]` `[chat]` `[extension]` `[orders]` `[worker]` `[render]`, hoặc theo status `IN PROGRESS`.

---

## 2026-04-06

### [inbox] Search conv — chỉ trigger khi Enter hoặc idle 5s (bỏ search-mỗi-phím) ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js`, `inbox/index.html` |
| **Chi tiết** | User gõ SĐT 10 chữ số → gọi Pancake API search 10 lần liên tiếp (mỗi phím 1 request với debounce 100-300ms → vẫn trigger nhiều) → spam server và tốn quota. **Fix**: Tách 2 tầng rõ ràng: (1) **Local filter** vẫn chạy instant mỗi phím cho feedback nhanh (`renderConversationList()` dùng `getConversations({search})` local). (2) **Pancake API search** chỉ trigger khi: (a) user bấm **Enter** → `performSearch()` ngay lập tức, hoặc (b) sau **5 giây idle** không gõ thêm → auto trigger. Khi query thay đổi hoặc bị clear trước 5s → `clearTimeout()` hủy lịch. Thêm `e.preventDefault()` cho Enter. Placeholder đổi: `"Tìm tên, SĐT, nội dung (Enter để tìm)..."` để hướng dẫn user. |
| **Status** | ✅ Done |

### [orders] Sync logic mới TPOS ↔ TAG XL v3 (hardcoded mapping) ✅
| | |
|---|---|
| **Files** | Created: `orders-report/js/tab1/tab1-tag-sync.js` (~564 dòng). Modified: `orders-report/js/tab1/{tab1-processing-tags.js, tab1-tags.js, tab1-tpos-realtime.js}`, `orders-report/tab1-orders.html`, `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | Rebuild sync module TPOS ↔ TAG XL sau khi xóa sạch ở commit `53816496`. Kiến trúc mới **hardcoded mapping**, không có modal user-configurable, không tái hiện button "Đồng bộ Tag". **Mapping tables** (hardcoded trong source): (1) `CAT_TO_TPOS` — 5 category (0→'ĐÃ RA ĐƠN', 1→'CHỜ ĐI ĐƠN (OKE)', 2→'MỤC XỬ LÝ', 3→'KHÔNG CẦN CHỐT', 4→'KHÁCH XÃ SAU CHỐT') — **1 chiều XL→TPOS, không reverse**. (2) `SUBTAG_TO_TPOS` — 10 subtag map theo tên TPOS — **1 chiều** cho 7 subtag thường + **bidirectional REMOVE** cho 3 subtag đặc biệt `GIO_TRONG`/`DA_GOP_KHONG_CHOT`/`NCC_HET_HANG` (TPOS xóa tag → XL xóa subtag nhưng **giữ category**). (3) `FLAG_TO_TPOS` — 10 flag bidirectional ADD+REMOVE: TRU_CONG_NO, CHUYEN_KHOAN, GIAM_GIA, CHO_LIVE, GIU_DON, QUA_LAY, **GOI_BAO_KHACH_HH** (mới so với map cũ), KHACH_BOOM, THE_KHACH_LA, DA_DI_DON_GAP. Flag `KHAC` không map (nội bộ XL only). (4) `TTAG_HARDCODED` — T_MY→'MY THÊM CHỜ VỀ' bidirectional. (5) Dynamic Tx pattern `/^T\d+\s+/` bidirectional — khi TPOS gửi tag Tx chưa có XL def → **auto-create def** (id=name uppercase, reuse `mergeConfigDefs('__ttag_config__')`) + gán luôn. (6) `TPOS_ALIASES` — reverse lookup: 'TRỪ THU VỀ'→TRU_CONG_NO, 'KHÁCH CK'/'CK'→CHUYEN_KHOAN. **Architecture**: IIFE module ~564 dòng. **Forward sync** `syncXLToTPOS(orderCode, reason)` — strategy "preserve unmanaged + replace managed": lấy current TPOS tags, phân loại managed/unmanaged (dùng `MANAGED_NAMES` Set build 1 lần từ tất cả mapping values + alias keys, check thêm dynamic T-tag def names + pattern `/^T\d+\s+/`), build desired managed từ `ProcessingTagState.getOrderData()`, final = unmanaged + desired managed, no-op nếu set equal, call `_callAssignTag` với full tag array. `_findOrCreateTPOSTag` reuse pattern cũ (cache → reload → create với random color). **Reverse sync** `handleTPOSTagsChanged(orderId, newTPOSTags)` — 5 phase: (a) Flags bidirectional loop qua `FLAG_TO_TPOS`, (b) Aliases→flag, (c) Bidirectional REMOVE 3 subtag đặc biệt dùng `assignOrderCategory(code, category, {subTag:null})` để giữ cat, (d) T_MY bidirectional, (e1) Tx ADD với auto-create def, (e2) Tx REMOVE. Mỗi phase re-read latest state để tránh race. **Guard flags kép** `_syncingForward` + `_syncingReverse` — set trước khi sync, reset ở `finally`; mỗi hàm early-return nếu cờ đối diện đang bật → tránh loop vô hạn giữa 2 chiều (forward→AssignTag→extension broadcast→reverse; reverse→toggleOrderFlag→forward hook). **Integration (8 hook)**: Forward (`tab1-processing-tags.js`) — 4 hook sau `saveProcessingTagToAPI` trong `assignOrderCategory`, `toggleOrderFlag`, `assignTTagToOrder`, `removeTTagFromOrder`. Reverse — `quickAssignTag`/`quickRemoveTag`/`saveOrderTags` (tab1-tags.js, sau API success + emit Firebase) + `handleTagAssigned` (tab1-tpos-realtime.js, sau `updateOrderInTable`). **HTML**: thêm `<script src="js/tab1/tab1-tag-sync.js">` sau `tab1-processing-tags.js`. **Docs**: `flow-tag-xl-panel-chotdon.md` thêm section 11 (mapping tables, ma trận hành vi, guard flags, trigger points, forward strategy), section 10 cũ chuyển sang "HISTORICAL" note. Syntax-checked cả 4 JS files OK. |
| **Status** | ✅ Done |

### [orders] Xóa toàn bộ mapping/sync logic TPOS ↔ TAG XL ✅
| | |
|---|---|
| **Files** | Deleted: `orders-report/js/tab1/tab1-tag-sync.js`. Modified: `orders-report/js/tab1/{tab1-processing-tags.js, tab1-tags.js, tab1-tpos-realtime.js}`, `orders-report/tab1-orders.html`, `orders-report/css/tab1-orders.css`, `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | User yêu cầu xóa sạch logic bidirectional sync giữa TPOS tag và TAG XL (processing tag) để làm lại từ đầu. Lý do: dữ liệu lệch giữa cột TAG và TAG XL (đơn "Huyền Nhi" ví dụ), TPOS realtime qua extension gây bug `[object Object]`, mapping hardcoded + alias + pattern + fallback đan xen khó bảo trì. **Đã xóa**: (1) File `tab1-tag-sync.js` (~1201 dòng) — toàn bộ `PTAG_TO_TPOS_MAP`, `TPOS_TO_PTAG_MAP`, `TPOS_ALIAS_MAP`, `_resolvePtagToTPOSName`, `_findOrCreateTPOSTag`, `syncPtagToTPOS`, `syncTPOSToPtag`, `executeTagSync`, guard flags `_isSyncingToTPOS`/`_isSyncingFromTPOS`, modal state + dropdown logic. (2) Trong `tab1-processing-tags.js`: 4 block sync `if (window.syncPtagToTPOS) {...}` trong `assignSubTag`, `toggleOrderFlag`, `assignTTagToOrder`, `removeTTagFromOrder`; function `onPtagOrderTagsChanged`; dòng `window.onPtagOrderTagsChanged = ...`. (3) Trong `tab1-tags.js`: 3 hook call `onPtagOrderTagsChanged` trong `quickAssignTag`, `quickRemoveTag`, và block lưu `_hookOrderId`/`_hookTags` trong save modal. (4) Trong `tab1-tpos-realtime.js`: hook call sau `updateOrderInTable` (giữ `normalizedTags` cho defensive coerce). (5) Trong `tab1-orders.html`: button `#tagSyncModalBtn` "Đồng bộ Tag", script tag `tab1-tag-sync.js`, toàn bộ modal `#tagSyncModal` (52 dòng). (6) Trong `css/tab1-orders.css`: section "TAG SYNC MODAL" (~418 dòng, 56 selectors `.tag-sync-modal*` + `.ts-*`). (7) Trong `docs/flow-tag-xl-panel-chotdon.md`: section 8.11, 10, 11 (11a+11b), xóa `tab1-tag-sync.js` khỏi File Map, xóa `syncPtagToTPOS`/`syncTPOSToPtag`/`onPtagOrderTagsChanged` khỏi Key Global Functions. Section 10 giờ là note ngắn "TAG XL ↔ TPOS — Độc Lập Hoàn Toàn". **Kết quả**: TAG TPOS và TAG XL hoàn toàn độc lập — gán/bỏ bên này không ảnh hưởng bên kia. Redesign sẽ được thảo luận/plan sau. Tổng: ~-2000 dòng code/markdown, 0 feature mới, pure cleanup. |
| **Status** | ✅ Done |

### [inbox][render] Đơn Inbox — Modal nhập lý do hủy + đổi retention 30→60 ngày ✅
| | |
|---|---|
| **Files** | `don-inbox/index.html`, `don-inbox/js/tab-social-table.js`, `don-inbox/js/tab-social-history.js`, `render.com/routes/social-orders.js`, `.github/workflows/cleanup-cancelled-orders.yml` |
| **Chi tiết** | User yêu cầu 2 thứ: (1) Bấm "Hủy đơn" → modal có textarea nhập lý do hủy, mặc định "HẾT HÀNG" → confirm → chuyển sang tab Đã hủy với lý do được lưu vào ghi chú. (2) Retention auto-cleanup đổi từ 30 → 60 ngày. **FE**: (1) `index.html` — thêm block `#confirmCancelReasonBlock` vào modal confirm (textarea rows=2, pre-filled "HẾT HÀNG", chỉ hiện khi action type = cancel/bulk_cancel). Đổi text info "30 ngày" → "60 ngày". (2) `tab-social-table.js` — `_showConfirmModal()` thêm option `reasonInput`, hiện textarea + focus+select khi mở. `confirmCancelOrder()` + `cancelSelectedOrders()` pass `reasonInput: true`. `confirmPendingAction()` đọc value từ `#confirmCancelReason` (fallback "HẾT HÀNG" nếu rỗng), pass vào `_doCancel(ids, reason)`. `_doCancel()` rewrite: prepend marker `[HỦY: <reason>]` vào `order.note`, preserve existing note (strip old HỦY marker nếu có), gọi `updateSocialOrder(id, {status:'cancelled', note: newNote})`. **Bonus fix**: Phát hiện bug cũ — `confirmPendingAction` case `bulk_cancel` gọi `_doBulkCancel` (function không tồn tại) → fallthrough vào `_doCancel` (đã handle array). (3) `tab-social-history.js` — `logCancel(order, reason)` accept reason param, append ` \| Lý do: <reason>` vào details. Đổi label `auto_cleanup` "30 ngày" → "60 ngày". **BE**: `social-orders.js` — `RETENTION_DAYS = 30` → `60`, comment và docstring cập nhật. **Workflow**: `cleanup-cancelled-orders.yml` comment + notice message 30 → 60. **Storage approach**: KHÔNG thêm column `cancel_reason` mới — prepend marker `[HỦY: HẾT HÀNG]` vào field `note` hiện có. Ưu điểm: không cần schema migration, hiển thị tự nhiên trong cột ghi chú của tab Đã hủy. Nhược: reason "contaminate" note — khắc phục bằng regex strip `/^\[HỦY:[^\]]*\]\s*/i` để khi hủy lại sẽ replace marker cũ thay vì nesting. |
| **Status** | ✅ Done |

### [extension][orders][render] Realtime cột "Phiếu bán hàng TPOS" (extension push) ✅
| | |
|---|---|
| **Files** | `n2store-extension/content/tpos-interceptor.js`, `n2store-extension/manifest.json` (bump 1.0.0→1.0.1), `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js` (new), `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-table.js`, `orders-report/js/managers/column-visibility-manager.js`, `orders-report/css/tab1-orders.css` |
| **Chi tiết** | User yêu cầu thêm cột MỚI "Phiếu bán hàng TPOS" realtime từ trang `tomato.tpos.vn/#/app/fastsaleorder/invoicelist` (tách khỏi cột "Phiếu bán hàng" cũ — không đụng code cũ). Flow: **Extension** MAIN-world interceptor (`tpos-interceptor.js`) bắt thêm XHR `FastSaleOrder/ODataService.GetView` và `GetListOrderIds` → parse response, `toSnapshot()` extract minimal fields (`Id, Number, State, ShowState, StateCode, IsMergeCancel, PartnerDisplayName, AmountTotal, AmountPaid, Residual, DateInvoice, DateUpdated, SaleOnlineIds`) → debounce 400ms → POST `{type:'tpos:invoice-list-updated', invoices:[...]}` lên `chatomni-proxy/api/tpos-events/broadcast` (reused — Cloudflare Worker proxy → Render). **Render** không sửa code — endpoint `/api/tpos-events/broadcast` đã generic relay qua `broadcastToClients()` WebSocket. Verified env vars `TPOS_USERNAME/TPOS_PASSWORD/TPOS_CLIENT_ID` đã có sẵn trên Render `srv-d4e5pd3gk3sc73bgv600`. Smoke-test POST thành công (`{success:true, broadcasted:true}`). **Web**: Tạo `tab1-tpos-invoice-snapshot.js` với `TPOSInvoiceSnapshotStore` (`_byId Map<String,snap>`, `_bySaleOnlineId Map<id,Set<fsoId>>`, localStorage `tposInvoiceSnapshot_v1` TTL 24h); method `upsertBatch()`, `getBySaleOnlineId()` (pick latest by `DateInvoice` + `Id`), `refreshCellsFor(saleOnlineIds)` (query `tr[data-order-id]` → update `td[data-column="invoice-status-tpos"]`). Duplicate `SHOW_STATE_CONFIG` + `STATE_CODE_CONFIG` local vì file gốc `tab1-fast-sale-invoice-status.js` khai báo private trong IIFE. `renderInvoiceStatusTposCell(order)` render 2 dòng: pill badge (ShowState, color/bg/border theo config, line-through cho "Huỷ bỏ") + reconcile line (label theo StateCode: None→"Chưa đối soát", CrossCheckComplete→"Hoàn thành đối soát", v.v.), tooltip = `Số phiếu: {Number}`. Fallback `−` khi không có snapshot. `tab1-tpos-realtime.js` thêm case `'tpos:invoice-list-updated'` trong `handleMessage()` → gọi `handleInvoiceListUpdate()` → `store.upsertBatch()` + `store.refreshCellsFor()`. HTML: thêm `<th data-column="invoice-status-tpos">Phiếu bán hàng TPOS</th>` sau cột `invoice-status` (line 486), checkbox modal (line 774-777), `<script src="js/tab1/tab1-tpos-invoice-snapshot.js">` sau `tab1-fast-sale-invoice-status.js` (line 1231). `tab1-table.js`: thêm `<th>` trong employee view (line 1005) + thêm `<td data-column="invoice-status-tpos">` sau invoice-status cell trong `createRowHTML` (line 1172). `column-visibility-manager.js` DEFAULT_COLUMN_VISIBILITY thêm `'invoice-status-tpos': true` (line 34). CSS `.invoice-status-tpos-cell` (flex column, gap 3px, 12px) + `.state-badge` (pill 2px/8px, radius 10px) + `.reconcile-line` (11px/500). Cell matching: one FastSaleOrder có thể có nhiều `SaleOnlineIds[]` → index cả hai chiều để lookup O(1). |
| **Status** | ✅ Done |

### [inbox][render] Đơn Inbox — Soft-cancel + tab Đã hủy + auto-cleanup 30 ngày ✅
| | |
|---|---|
| **Files** | `don-inbox/index.html`, `don-inbox/js/tab-social-table.js`, `don-inbox/js/tab-social-history.js`, `render.com/routes/social-orders.js`, `.github/workflows/cleanup-cancelled-orders.yml` (new) |
| **Chi tiết** | Đổi hành vi nút 🗑️ "Xóa đơn" thành 🚫 "Hủy đơn" (soft-delete, set `status='cancelled'`). Tab "Đã hủy" hiển thị action buttons riêng: **Khôi phục** (undo → `draft`) và **Xóa vĩnh viễn** (DELETE thật). Filter status dropdown rút gọn còn 4 option: `Tất cả / Nháp / Đơn hàng / Đã hủy` (ẩn `processing`, `completed` — nhưng giữ trong `STATUS_CONFIG` để data cũ không vỡ, admin dropdown cell vẫn dùng được). **FE**: (1) `tab-social-table.js` — rewrite section DELETE thành action dispatcher (`pendingAction = {type, ids}`), thêm `confirmCancelOrder`, `confirmPermanentDeleteOrder`, `restoreOrder`, `confirmPendingAction`, `cancelSelectedOrders`, `permanentDeleteSelectedOrders`, `restoreSelectedOrders`, `updateBulkActionBar`. `renderTableRow()` render action column khác theo `order.status`. (2) `index.html` — dropdown filter 4 option, bulk action container `#bulkActionButtons` (render theo tab), modal generic với title/icon/button/warning động (thông báo "sẽ tự động xóa sau 30 ngày" khi hủy). (3) `tab-social-history.js` — thêm `logCancel`, `logRestore`, `logPermanentDelete`; thêm label mapping cho `cancel`/`restore`/`permanent_delete`/`auto_cleanup` trong `HISTORY_ACTION_CONFIG`. **BE**: Render route `social-orders.js` — thêm endpoint `POST /api/social-orders/cleanup-cancelled` bảo vệ bằng header `X-Cleanup-Secret` (env `CLEANUP_SECRET`), query `DELETE FROM social_orders WHERE status='cancelled' AND updated_at < (now - 30 days)`, log kết quả vào `social_orders_history` với action `auto_cleanup`. **Infra**: thêm env var `CLEANUP_SECRET` vào Render service `n2store-fallback` qua `PUT /v1/services/{id}/env-vars/{KEY}` (đã verify không ảnh hưởng 24 vars khác → 25 tổng). Tạo workflow `.github/workflows/cleanup-cancelled-orders.yml` chạy cron daily 19:00 UTC (= 02:00 ICT) + `workflow_dispatch`, curl endpoint với secret từ GitHub Secrets. |
| **Status** | ✅ Done |

### [inbox] Fix real-time conv list — read convs không bị đẩy lên trên unread ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js` |
| **Chi tiết** | Bug: khi shop reply một conversation (→ chuyển từ unread sang read) hoặc khi có tin mới tới một read conv, `_updateSingleConversationInList()` luôn `prepend` element lên đầu DOM, **bỏ qua** sort rule (unread-first). Kết quả: read convs nổi lên trên các unread convs — trái với sort canonical của `getConversations()`. **Fix**: Thêm 3 helper: 1) `_convSortRank(conv)` — return 1 nếu `unread > 0 && isCustomerLast !== false`, else 0 (khớp chính xác với sort trong `getConversations()`). 2) `_convSortTime(conv)` — normalize Date/number → timestamp ms. 3) `_findInsertionAnchor(conv, skipEl)` — walk qua siblings trong DOM, tìm element đầu tiên mà conv hiện tại nên chèn TRƯỚC nó (higher rank hoặc same rank + newer time). Rewrite `_updateSingleConversationInList()`: thay vì `prepend()` mù quáng, dùng `insertBefore(newEl, anchor)` tại vị trí đúng theo sort. Cover 2 case: (existing element → remove rồi insert lại) và (new conversation → insert ở đúng vị trí). Độ phức tạp O(n) per update nhưng chính xác 100% với sort rule. |
| **Status** | ✅ Done |

### [inbox] Message bubbles — chữ to và đậm hơn ✅
| | |
|---|---|
| **Files** | `inbox/css/inbox.css` |
| **Chi tiết** | User yêu cầu tăng kích thước chữ trong bong bóng tin nhắn chat (cho dễ đọc, đồng bộ với conversation list). **Fix**: 1) `.message-text`: 15px/normal → **17px/500**. 2) `.message-time`: 10px/opacity 0.7 → **12px/opacity 0.8/weight 500**, margin-top 2px → 4px. |
| **Status** | ✅ Done |

### [inbox] Conversation list — chữ đậm to hơn + unread pop với background indigo ✅
| | |
|---|---|
| **Files** | `inbox/css/inbox.css` |
| **Chi tiết** | User yêu cầu: (1) text trong danh sách conversation đậm/to hơn; (2) unread items có background nổi bật để phân biệt với read. **Fix**: 1) `.conv-name`: 15px/600 → 16px/700. 2) `.conv-preview`: 13px/normal → 15px/500 (line-height 1.45→1.5). 3) `.conv-time`: 12px/500 → 13px/600. 4) `.conv-page-name`: 11px → 13px/500. 5) `.conversation-item.unread`: đổi bg từ `--surface-container-lowest` (#ffffff — trùng col bg → không nổi) sang `#eef2ff` (soft indigo wash) + border-left primary 4px. Font weight cho unread: name 700→800, preview 500→700, time primary color 700. Hover unread: `#e0e7ff`. 6) `.conversation-item.active`: đổi bg từ `--primary-bg` sang `#dad7ff` (darker, saturated hơn để distinct với unread). Selector `.conversation-item.unread.active` đảm bảo active override unread khi trùng. Sort unread-first đã có sẵn từ commit trước (`277de493`). |
| **Status** | ✅ Done |

### [inbox] Tìm kiếm hội thoại theo số điện thoại — normalize VN phone formats ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-data.js`, `inbox/js/inbox-chat.js`, `inbox/index.html` |
| **Chi tiết** | User không tìm được conversation theo SĐT do formats khác nhau (`0984040726`, `+84 984 040 726`, `0984-040-726` — substring match fail). **Fix**: 1) Thêm helper `normalizePhone(str)` — strip non-digit chars + convert country code `84xxxxxxxxx` → `0xxxxxxxxx` (VN). 2) `isPhoneQuery(str)` — detect query phone-like (≥4 consecutive digits). 3) `getConversations()` filter: nếu query là phone, normalize cả 2 bên (`c.phone` split theo `,` → normalize từng item, `c._raw.recent_phone_numbers` → normalize từng số) rồi substring match. Text fields (name/lastMessage/pageName) vẫn dùng `removeDiacritics` như trước. 4) `performSearch()` (Pancake API): khi query là phone, gửi query đã normalized lên server để Pancake match tốt hơn. 5) Update placeholder search input: `"Tìm khách hàng..."` → `"Tìm theo tên, SĐT, nội dung..."`. |
| **Status** | ✅ Done |

### [inbox] Fix sort — đẩy conversation unread (customer gửi cuối) lên top ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-data.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | Sort cũ chỉ check `unread > 0` → không match với display condition `unread > 0 && isCustomerLast !== false`. Kết quả: convo đã reply nhưng vẫn bubble lên top, hoặc unread thật sự không lên top đúng thứ tự. **Fix**: 1) `getConversations()` sort dùng chung condition `(unread > 0 && isCustomerLast !== false)` khớp UI. 2) Initial fetch sort trong `fetchAllPagesConversations()` compute inline `customerLast = last_sent_by.id !== page_id`. 3) `toggleReadUnread()` bỏ `_updateSingleConversationInList` (chỉ update 1 item DOM) → dùng full `renderConversationList()` để re-apply sort (vị trí phải đổi khi mark/unmark). |
| **Status** | ✅ Done |

### [inbox] High-End Editorial UI redesign — "The Digital Curator" style ✅
| | |
|---|---|
| **Files** | `inbox/index.html`, `inbox/css/inbox.css`, `inbox/css/quick-reply-modal.css` |
| **Chi tiết** | Áp dụng design system từ `inbox/DESIGN.md` + `inbox/changelog.md` + reference templates (`inbox_modernized.css`, `quick_reply_modernized.css`, `code.html`). **1) Typography**: Thêm Google Fonts Manrope (headlines) + Inter (body) vào index.html. Mới var `--font-headline` (Manrope), `--font-body` (Inter). Headings dùng Manrope 700/800, letter-spacing -0.015em. **2) Color palette**: Chuyển sang Indigo (#3525cd) + Slate neutrals. Thêm Material surface hierarchy (--surface #f7f9fb, --surface-container-lowest #ffffff, --surface-container-high #e6e8ea). **3) Layout**: col1 320→380px, col3 360→400px. **4) "No-Line" rule**: Bỏ 1px borders giữa col-header/conversation-search/conversation-filters/chat-header/conv items/info-tabs — dùng tonal background shift thay thế. **5) Conversation list**: Avatar 44→52px, active state dùng border-left 4px primary + primary-bg, padding 14×24px, conv-name 15px semibold, conv-preview 13px. **6) Message bubbles**: radius 16→20px, bỏ border incoming dùng shadow-sm, outgoing dùng gradient primary→primary-container + shadow indigo. **7) Input area**: Wrapper 16px radius, focus state có ghost border, btn-send 36→44px FAB với gradient + shadow indigo. **8) Quick-reply-modal**: Rewrite full — glassmorphism overlay (backdrop-blur 12px), 24px radius modal, Manrope title, monospace shortcuts với indigo tag pill (#eef2ff bg), table header uppercase tracker, footer tonal bg. **9) Image zoom**: Upgrade với backdrop-blur, 16px radius, shadow đậm. Active state dùng primary accent bar 4px thay vì 3px. |
| **Status** | ✅ Done |

### [orders] Fix bug "[object Object]" qua TPOS realtime sync — defensive guards full chain ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tag-sync.js`, `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/js/tab1/tab1-table.js` |
| **Chi tiết** | Bug tiếp diễn khi sync từ TPOS realtime via extension → web. Thêm defensive guards toàn chuỗi: 1) `assignOrderCategory()` validate `category` arg — nếu là object → extract `.category` + warn; coerce parseInt + check range 1-5, abort nếu invalid. 2) `_ptagAddHistory()` coerce `value` to string, replace bằng '' nếu chứa `[object`. 3) `syncTPOSToPtag()` defensive `String(t.Name \|\| '')` ở 3 chỗ (build tposNames, T-pattern, fallback KHAC). 4) `handleTagAssigned()` realtime — normalize tag fields to strings ngay khi nhận event từ extension. 5) `parseOrderTags()` (TPOS column render) coerce `tag.Name` + `tag.Color` to string. Mục tiêu: không bao giờ store hoặc render `[object Object]` dù data nguồn có corrupt. |

### [orders] Fix UI bug "[object Object]:" trong popover lịch sử tag ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Bug: popover lịch sử tag hiển thị `[object Object]:` cho entries SET_CATEGORY cũ. Nguyên nhân: code cũ trong tab1-tag-sync.js gọi `assignOrderCategory(orderCode, {category, subTag})` (object làm 2nd arg) → `${category}:${subTag}` template tạo ra `"[object Object]:"` được lưu vào history `value` + `displayName`. Đã fix code gốc rồi nhưng entries cũ vẫn corrupt trong storage. **Defensive fix**: 1) `_ptagResolveDisplayName()` detect `value` không phải string hoặc start with `[object` → return "Phân loại". 2) Cả 2 renderers (popover + global history) skip `displayName` nếu chứa `[object Object]`, fallback xuống resolver. |

### [orders] TAG XL ↔ TPOS sync — Category subtags ADD 2 chiều, REMOVE skip ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tag-sync.js`, `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | Revert một phần thay đổi trước: GIỎ TRỐNG / ĐÃ GỘP KO CHỐT / NCC HẾT HÀNG vẫn sync **ADD** 2 chiều (TPOS → XL gán cat tương ứng), chỉ skip **REMOVE** từ TPOS → XL (khi TPOS xóa tag, giữ nguyên subtag XL). Re-enable block `type === 'subtag'` với logic ADD only: tìm cat từ `SUBTAG_OPTIONS` local → `assignOrderCategory(orderCode, cat, {subTag: key, source: 'TPOS-SYNC'})`. Lý do giữ skip REMOVE: category là phân loại cốt lõi, không tự revert khi TPOS gỡ tag. |

### [orders] TAG XL ↔ TPOS sync — skip category subtags + fallback KHAC cho tag lạ ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tag-sync.js`, `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | 1) **Skip Category subtags TPOS → XL**: Bỏ block xử lý `type === 'subtag'` trong `syncTPOSToPtag()`. Khi TPOS gắn/xóa GIỎ TRỐNG, ĐÃ GỘP KO CHỐT, NCC HẾT HÀNG → KHÔNG đổi category XL. Hướng XL → TPOS vẫn sync 2 chiều bình thường (mục đích: category là phân loại cốt lõi, không nên auto-change từ TPOS). 2) **Fallback KHAC cho tag lạ**: Thay thế seller pattern check (OK/XỬ LÝ/XÃ ĐƠN) bằng general fallback. Bất kỳ TPOS tag nào không match `TPOS_TO_PTAG_MAP` (kể cả subtags), không match T-number pattern, không trùng custom flag label → auto add flag KHAC (add-only). Cover: OK/XỬ LÝ/XÃ ĐƠN [seller], Gộp xxx, K\d+ xxx, CỌC xxxK, BÁN HÀNG NHA, XÃ KHÁCH LẠ, hoặc bất kỳ tag lạ. |

### [docs] Cập nhật flow-tag-xl-panel-chotdon.md — ghi lại toàn bộ tag mappings ✅
| | |
|---|---|
| **Files** | `docs/flow-tag-xl-panel-chotdon.md` |
| **Chi tiết** | Section 11a: Thay 8-row mapping cũ bằng 4 bảng chi tiết: 1) Bidirectional Mapping (15 entries gồm 3 subtags + 9 flags + 2 ttag patterns + custom). 2) Alias Map (TRỪ THU VỀ, KHÁCH CK). 3) Pattern Map (T-number + 3 seller patterns). 4) "Không sync" table (Gộp, K-tags, CỌC). Cập nhật code constants `PTAG_TO_TPOS_MAP` + `TPOS_ALIAS_MAP`. Section 11b: Reverse mapping table 21 entries với cột Nguồn (PTAG_TO_TPOS_MAP / TPOS_ALIAS_MAP / Pattern detect / Reverse lookup). |

### [orders] Mở rộng TPOS ↔ TAG XL auto sync — thêm mappings + pattern detection ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tag-sync.js` |
| **Chi tiết** | 1) Mở rộng `PTAG_TO_TPOS_MAP` +7 entries: GIẢM GIÁ, CHUYỂN KHOẢN, QUA LẤY, CHỜ LIVE, GIỮ ĐƠN, ĐÃ GỘP KO CHỐT, NCC HẾT HÀNG. 2) Thêm `TPOS_ALIAS_MAP` cho many-to-one: TRỪ THU VỀ → TRU_CONG_NO, KHÁCH CK → CHUYEN_KHOAN. 3) Forward sync T-tags: `_resolvePtagToTPOSName()` lookup T-tag def name cho mọi ttag (không chỉ T_MY). 4) **Pattern T-number**: TPOS tag `T\d+ xxx` → auto find/create T-tag definition + assign. Removal: xóa TPOS tag → remove T-tag tương ứng. 5) **Pattern seller**: OK/XỬ LÝ/XÃ ĐƠN [tên seller] → auto flag KHAC (add-only). |

### [render][orders] Server-side order buffer — chống mất đơn real-time ✅
| | |
|---|---|
| **Files** | `render.com/routes/tpos-order-buffer.js` (MỚI), `render.com/server.js`, `render.com/cron/scheduler.js`, `orders-report/js/tab1/tab1-tpos-realtime.js` |
| **Chi tiết** | Khi client mất kết nối WebSocket (rớt mạng, server restart), event đơn mới từ TPOS bị mất. Fix: 1) Server lưu mọi event `SaleOnline_Order` vào PostgreSQL `tpos_order_buffer` table (fire-and-forget). 2) API endpoint `GET /api/tpos/order-buffer?since=<timestamp>` trả danh sách đơn buffered. 3) Client poll mỗi 45s, so sánh với `allData`, fetch đơn thiếu từ TPOS OData. 4) Cron cleanup tự xóa entries > 3 ngày. Debug: `window.tposRealtime.pollNow()`, `window.tposRealtime.getStatus()`. |

## 2026-04-05

### [orders] Fix tiền ship bị reset khi xóa dòng đơn hàng trong phiếu bán hàng hàng loạt ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale.js` |
| **Chi tiết** | Khi xóa 1 dòng đơn hàng trong modal fast-sale, toàn bộ modal bị re-render qua `innerHTML` khiến tiền ship, carrier, ghi chú bị reset về mặc định. Fix: thêm `saveFastSaleFormState()` lưu form state (shipping fee, carrier, note, weight, wallet) vào `fastSaleOrdersData` trước khi re-render. `renderFastSaleOrderRow` và auto-carrier-select sử dụng giá trị đã lưu (`_user*` properties) thay vì giá trị mặc định. |

### [orders] Bidirectional TAG XL ↔ TPOS auto sync + 3 built-in flags mới ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tag-sync.js`, `orders-report/js/tab1/tab1-tags.js` |
| **Chi tiết** | 1) Thêm 3 built-in flags mới vào PTAG_FLAGS: KHÁCH BOOM 💥, THẺ KHÁCH LẠ 🪪, ĐÃ ĐI ĐƠN GẤP ⚡ + tooltips. 2) Tạo mapping `PTAG_TO_TPOS_MAP` (TAG XL ↔ TPOS): GIỎ TRỐNG, KHÁCH BOOM, MY THÊM CHỜ VỀ, THẺ KHÁCH LẠ, ĐÃ ĐI ĐƠN GẤP, TRỪ CÔNG NỢ + custom flags. 3) **TAG XL → TPOS**: `syncPtagToTPOS()` auto sync khi gán/bỏ TAG XL → add/remove TPOS tag. Fallback chain: cache → reload → create. Hook fire-and-forget vào 4 hàm. 4) **TPOS → TAG XL**: `syncTPOSToPtag()` reverse sync khi gán/bỏ TPOS tag → auto add/remove TAG XL flags/subtags/ttags tương ứng. Hook vào `onPtagOrderTagsChanged` (called from `saveOrderTags`, `quickAssignTag`, `quickRemoveTag`). 5) Guard flags `_isSyncingToTPOS` + `_isSyncingFromTPOS` chống infinite loop. |

### [orders][render] Migration dropped_products & held_products: Firebase RTDB → PostgreSQL ✅
| | |
|---|---|
| **Files** | `render.com/routes/realtime-db.js`, `orders-report/js/managers/dropped-products-manager.js`, `orders-report/js/managers/held-products-manager.js`, `render.com/migrations/040_update_dropped_products_schema.sql` (MỚI), `render.com/scripts/migrate-dropped-held-to-pg.js` (MỚI) |
| **Chi tiết** | 1) ALTER TABLE `dropped_products` thêm 13 columns thiếu (product_id, image_url, price, reason, campaign_id/name, removed_by, etc.). 2) Backend: rewrite dropped_products routes (GET all, PUT upsert, PATCH quantity atomic, PATCH fields, DELETE all/single) + thêm held_products routes (GET by-product, PATCH draft, PATCH quantity). 3) Frontend `dropped-products-manager.js`: rewrite hoàn toàn Firebase → Render API + SSE (EventSource). Firebase `transaction()` → PG atomic `quantity + $change`. Firebase `push()` → client-generated `dp_` ID. 4) Frontend `held-products-manager.js`: rewrite hoàn toàn Firebase → Render API + SSE. 5) Data migration script: 2 dropped products + 1 held product migrated thành công. Strategy: PG only, không dual-write. |

### [chat] Fix sender UI not updating after private reply ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | 2 bugs: 1) `PrivateReplyStore._getDocRef()` dùng per-user doc → marks không sync giữa nhân viên → đổi sang shared doc `'shared'`. 2) Reload sau 2s ghi đè `allChatMessages = messages` → xóa mất tin nhắn optimistic `pr_*` chưa có trên server → preserve optimistic messages khi text chưa match server data. |

### [chat] Private reply marks store + optimistic UI ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Chi tiết** | 1) `PrivateReplyStore`: Firestore collection `private_reply_marks`, real-time listener, 7-day TTL. Đánh dấu tin nhắn nhắn riêng → hiện badge "🔒 Nhắn riêng" + đổi màu, đồng bộ cross-device. 2) Optimistic UI: sau khi gửi nhắn riêng thành công → thêm tin nhắn vào UI ngay lập tức, không cần đợi reload. 3) Auto-mark: khi load messages từ Pancake, tự detect và store private reply messages. |

### [chat] Fix #551 user unavailable — extension fallback toàn dự án ✅
| | |
|---|---|
| **Files** | `tab1-chat-messages.js`, `chat-products-ui.js`, `bill-service.js`, `shared/quick-reply-manager.js` |
| **Chi tiết** | Search toàn bộ dự án: nhiều chỗ chỉ check `is24HourError` (e_code 10) mà thiếu `isUserUnavailable` (#551). Fix: thêm check 551 ở tất cả send paths — `_sendInbox()` fallback extension, `chat-products-ui` gửi ảnh, `bill-service` hóa đơn, `shared/quick-reply-manager`. Các file đã OK: inbox `_sendInbox()` (fallback mọi error), `message-template-manager` (queue ALL errors), `inbox/quick-reply-manager` (check cả 2). |

### [chat] Fix private_replies false error + UI not updating ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js`, `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | Pancake API `private_replies` gửi tin nhắn thành công lên Facebook nhưng trả về `success:false` → code chạy vào fallback chain → tất cả fail (COMMENT conv không có global_id) → hiện lỗi + UI không reload. Fix: gọi API trực tiếp thay vì qua `_sendApi()`, chỉ throw khi lỗi rõ ràng (post deleted, code 100). Các lỗi khác treat as success → UI cập nhật bình thường. |

### [chat] Chat panel — default Nhắn riêng + load bình luận mới nhất + page selector ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css` |
| **Chi tiết** | 1) Dropdown reply type mặc định "Nhắn riêng" thay vì "Bình luận công khai" (cả inbox + orders-report). 2) Orders-report COMMENT tab luôn fetch fresh từ API thay vì dùng cache → load bình luận mới nhất, sort by updated_at. 3) Thêm page selector dropdown trong chat modal header — cho phép chuyển page xem tin nhắn/bình luận của khách trên page khác (ẩn nếu chỉ 1 page). |

### [orders] Delivery report — permission gate tra soát + yêu cầu hủy đơn ✅
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js`, `delivery-report/js/cancel-request.js` (MỚI), `delivery-report/index.html`, `delivery-report/css/delivery-report.css` |
| **Chi tiết** | 1) Chỉ admin + "Phước đẹp trai" mới bật tra soát và xóa quét (canTraSoat helper + guard 4 functions + ẩn nút). 2) Tab "Yêu cầu hủy" luôn hiện — nút toggle danh sách + badge pending, modal chọn đơn (search + checkbox) + lý do, lưu Firestore subcollection `delivery_report/data/cancel_requests/{id}` với displayName người yêu cầu, realtime listener. |

### [orders] Delivery report — confirm dialog on unscan + per-group delete-all buttons ✅
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js`, `delivery-report/css/delivery-report.css` |
| **Chi tiết** | Xóa từng đơn hiện confirm "Chắc chắn đơn X đã được đưa vào kho xử lý?". Thêm nút "Xóa" riêng cho từng bảng nhóm (TOMATO/NAP/CITY/SHOP/RETURN) khi xem đơn đã quét. |

### [orders] Fix RefundDateStore — save MoveName after confirming draft refund orders ✅
| | |
|---|---|
| **Files** | `supplier-debt/js/main.js` |
| **Chi tiết** | `RefundDateStore` lưu custom date cho đơn trả hàng nháp nhưng field `number` (MoveName) luôn trống vì đơn nháp chưa được TPOS gán Number. Fix: sau `ActionInvoiceOpen` (xác nhận đơn), re-fetch đơn đã confirm để lấy Number mới (BILL/xxxx) và cập nhật vào RefundDateStore → `getByMoveName()` có thể map custom date sang tab Công nợ. Dọn 2 entries trống (54772, 54943) trong Firestore. |

### [chat] Fix unread badge system — localStorage persistence + server backup ✅
| | |
|---|---|
| **Files** | `render.com/server.js`, `orders-report/js/chat/new-messages-notifier.js` |
| **Chi tiết** | **5 vấn đề**: (1) Refresh mất badge — in-memory only, (2) Server chỉ save `update_conversation` bỏ qua `new_message`, (3) Server spin down mất events, (4) Badge count không update khi có tin mới, (5) `setPendingCustomers()` replace thay vì merge. **Fixes**: Server: thêm `upsertPendingCustomer()` cho `pages:new_message` (chỉ tin từ khách, không từ page). Browser: localStorage persistence (`n2s_pending_customers` key) — load ngay khi init, save mỗi khi thay đổi. `setPendingCustomers()` giờ merge server data với existing (lấy count cao hơn). `_upsertBadge()` helper mới — update badge text nếu đã tồn tại thay vì skip. Badges survive refresh ngay lập tức từ localStorage, sau đó server data merge vào. |

### [orders] Fix flag counts hiển thị 0 trong thống kê Tổng quan ✅
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-statistics.js` |
| **Chi tiết** | Flags (CHỜ LIVE, QUA LẤY + GIỮ ĐƠN, GIẢM GIÁ) hiển thị 0 đơn dù bấm mắt xem vẫn có đơn. Root cause: flags đã chuyển từ string (`"CHO_LIVE"`) sang object (`{id:"CHO_LIVE", name:"Chờ Live"}`) nhưng `computeTagXLCounts` vẫn dùng `flags.includes('CHO_LIVE')` — không match object. Fix: đổi sang `flags.some(f => _fid(f) === 'KEY')` với helper `_fid` extract id từ cả string lẫn object. |

### [orders] Chuyển hoàn toàn sang Tag XL — bỏ thống kê theo tag TPOS ✅
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-ui.js`, `orders-report/js/overview/overview-modals.js`, `orders-report/js/overview/overview-table.js` |
| **Chi tiết** | Thay tất cả 6 chỗ gọi `renderStatistics()` (TPOS tags) → `renderStatisticsFromAllOrders()` (Tag XL). Trước đây khi bấm "Lấy chi tiết đơn hàng", "Tải lại Excel", "Đồng bộ Tab1", hoặc save tracked tags thì gọi hàm legacy TPOS, ghi đè lên stats Tag XL. Giờ mọi action đều dùng Tag XL thống nhất. |

## 2026-04-04

### [balance-history] Thêm cảnh báo trừ ví thất bại vào tab Kế Toán ✅
| | |
|---|---|
| **Files** | `balance-history/index.html`, `balance-history/css/accountant.css`, `balance-history/js/accountant.js` |
| **Chi tiết** | Thêm alert bar thứ 3 🚨 "X giao dịch trừ ví thất bại (Xđ)" vào dashboard Kế Toán, hiển thị khi có pending-withdrawals status=FAILED. Thêm sub-tab "Trừ Ví Thất Bại" với badge đỏ. Panel chi tiết gồm: (1) Stats summary cards (Thất bại/Đang chờ/Hoàn thành + số tiền), (2) Bảng chi tiết mỗi giao dịch lỗi: mã đơn, SĐT, số tiền, nguồn (PBH Loạt/Lẻ), lỗi cụ thể, số lần retry, người tạo, thời gian. (3) Nút Retry cho phép kế toán thử lại trừ ví ngay. Hover vào cột lỗi sẽ expand full text. Data fetch từ API `/api/v2/pending-withdrawals/stats` + `/api/v2/pending-withdrawals?status=FAILED`. Auto-load khi mở tab Kế Toán. |

### [chat] Bulk send → chat realtime update + Emoji picker ✅
| | |
|---|---|
| **Files** | `orders-report/js/chat/message-template-manager.js`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | **Bulk send fix**: Sau khi gửi tin nhắn hàng loạt, chat modal không cập nhật ngay (chờ 15s polling). Fix: dispatch `bulkSendCompleted` event từ message-template-manager → tab1-chat-core lắng nghe → clear cache + fetch messages + render ngay. **Emoji picker**: Thêm emoji button vào chat toolbar + inline picker với 7 categories (recent, smileys, gestures, hearts, animals, food, objects). Recent emojis lưu localStorage. Pattern copy từ inbox module. |

### [orders] Fix lỗi trừ ví thiếu tiền ship + cải thiện note giao dịch ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale.js`, `orders-report/js/tab1/tab1-sale.js` |
| **Chi tiết** | **Bug 1 (nghiêm trọng)**: PBH hàng loạt — `processWalletWithdrawalsForSuccessOrders()` dùng `CashOnDelivery \|\| AmountTotal`. Khi khách trả hết bằng ví → CashOnDelivery=0 (falsy) → fallback sang AmountTotal (chỉ tiền hàng, KHÔNG có ship). VD: đơn 445k (410k+35k ship) chỉ trừ ví 410k. **Fix**: Dùng `PaymentAmount` (đã tính đúng khi tạo đơn, bao gồm ship). **Bug 2**: PBH lẻ — InvoiceStatusStore lưu `PaymentAmount = walletBalance` (số dư ví) thay vì `min(walletBalance, codAmount)` (số tiền thực trừ). **Fix**: Tính đúng `actualPaymentForStore = min(wallet, COD)`. **Enhancement**: Thêm breakdown chi tiết vào note giao dịch ví cả lẻ và hàng loạt: `(Hàng: 410.000đ + Ship: 35.000đ = 445.000đ)`. PBH lẻ: trừ ví đúng (actualPayment = min(debt, codAmount) đã bao gồm ship) — không có bug trừ sai. |

### [docs] Tổng quan hệ thống n2store — danh sách module và chức năng chính ✅
| | |
|---|---|
| **Files** | `docs/dev-log.md` |
| **Chi tiết** | Ghi nhận tổng quan ~45 module để AI agent nắm được toàn bộ hệ thống: **Core Business**: `orders-report` (dashboard đơn hàng chính, 102 JS files — tab bán hàng, xử lý đơn, chat, thống kê), `inventory-tracking` (quản lý kho + tồn), `purchase-orders` (đặt hàng nhập + nhận hàng), `customer-hub` (CRM trung tâm khách hàng), `balance-history` (lịch sử công nợ). **Communication**: `inbox` (messenger inbox UI), `don-inbox` (inbox yêu cầu đặt hàng), chat module (trong orders-report — modal chat realtime). **Integration**: `cloudflare-worker` (multi-API proxy: TPOS, Pancake, Facebook, token), `render.com` (fallback server + Firebase admin proxy + autofb), `n2store-extension` (Chrome extension: messenger integration + TPOS global-id), `pancake-extension` (Pancake POS extension), `tpos-pancake` (bridge TPOS↔Pancake). **Utility**: `shared` (65 JS — auth, cache, firebase, utils, TPOS client), `user-management` (roles & permissions), `attendance-sync` (chấm công), `firebase-functions` (Cloud Functions). **Reports**: `delivery-report` (báo cáo giao hàng), `soquy` (sổ quỹ kế toán), `doi-soat` (đối soát), `firebase-stats` (DB monitoring), `invoice-compare` (so sánh hóa đơn). **Other**: `soluong-live` (sync số lượng realtime), `bangkiemhang` (kiểm kho), `soorder` (đơn hàng soorder), `nhanhang` (tích hợp vận chuyển), `hanghoan` (hàng hoàn), `project-tracker` (task tracking), `supplier-debt` (công nợ NCC), `service-costs` (chi phí dịch vụ), `stitch_customer` (đồng bộ khách hàng), `order-management` (quản lý lifecycle đơn), `kho-di-cho` (kho đi chợ). |

### [docs] Add #Note AI-instruction header to all HTML+JS source files ✅
| | |
|---|---|
| **Files** | `scripts/add-note-header.sh` (new), 609 `.html` + `.js` files modified, `CLAUDE.md`, `MEMORY.md` |
| **Chi tiết** | Thêm 1 dòng `#Note` song ngữ ở đầu mỗi file HTML/JS (609 files), nhắc AI agent đọc CLAUDE.md, MEMORY.md, dev-log.md trước khi code và cập nhật dev-log sau thay đổi. Script bash idempotent (detect `#Note:` marker → skip), hỗ trợ `--dry-run`, xử lý shebang (chèn dòng 2). Exclude: `node_modules`, `_metadata`, `pancake-extension/scripts` (bundled), `*.min.js`. Cập nhật CLAUDE.md + MEMORY.md với convention cho file mới. |

### [orders] Chuyển hoàn toàn sang Tag XL — bỏ thống kê theo tag TPOS ✅
| | |
|---|---|
| **Files** | `orders-report/js/overview/overview-ui.js`, `orders-report/js/overview/overview-modals.js`, `orders-report/js/overview/overview-table.js` |
| **Chi tiết** | Thay tất cả 6 chỗ gọi `renderStatistics()` (TPOS tags) → `renderStatisticsFromAllOrders()` (Tag XL). Trước đây khi bấm "Lấy chi tiết đơn hàng", "Tải lại Excel", "Đồng bộ Tab1", hoặc save tracked tags thì gọi hàm legacy TPOS, ghi đè lên stats Tag XL. Giờ mọi action đều dùng Tag XL thống nhất. |

### [orders] Lưu tên hiển thị cùng ID trong flags/tTags — fix lỗi hiển thị Tag XL ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-merge.js`, `orders-report/js/tab1/tab1-tag-sync.js`, `orders-report/js/overview/overview-statistics.js` |
| **Chi tiết** | Root cause: `flags` và `tTags` chỉ lưu ID (`"CUSTOM_xxx"`, `"T115"`), tên hiển thị phải tra cứu từ config API riêng. Khi config chưa load hoặc load lỗi → cột Tag XL hiển thị ID thô. **Fix**: Đổi format từ mảng string sang mảng object `{id, name}`. (1) Thêm normalize helpers (`_ptagNormalizeFlag`, `_ptagNormalizeTTag`) — tự động convert data cũ (string) → format mới khi load qua `setOrderData()`. (2) Tất cả hàm write (`toggleOrderFlag`, `assignTTagToOrder`, `assignOrderCategory`, `transferProcessingTags`) push objects `{id, name}`. (3) Render dùng `f.name`/`t.name` trực tiếp, fallback lookup. (4) Tất cả `.includes()` chuyển sang `.some(f => _ptagFlagId(f) === key)`. (5) Merge logic dùng Map dedup by ID. (6) Tag sync + overview-statistics cập nhật tương tự. Backward compatible — data cũ tự convert. |

### [extension] Fix global-id v2: Pancake approach — 5 regex patterns + rsrcMap full load + strategy reorder ✅
| | |
|---|---|
| **Files** | `n2store-extension/background/facebook/session.js`, `n2store-extension/background/facebook/global-id.js` |
| **Chi tiết** | Root cause: (1) `extractDocIds` thiếu 3 regex patterns quan trọng của Pancake → không tìm được `MessengerThreadlistQuery` doc_id. (2) `BusinessCometInboxThreadDetailHeaderQuery` trả về UI data (`ubi_thread_detail`), KHÔNG phải `target_id`. (3) Chỉ fetch script tags (~27), Pancake fetch ALL rsrcMap resources (~5400). (4) `PagesManagerInboxAdminAssignerRootQuery` đã bị Facebook xóa khỏi JS bundles. **Fix**: (1) Thêm 4 Pancake regex patterns: Pattern F (operationKind/name/id), Pattern G (id/metadata/name — **pattern này tìm được MessengerThreadlistQuery: 34388012574175272**), Pattern H (__getDocID), Pattern I (_instagramRelayOperation). (2) Xóa `BusinessCometInboxThreadDetailHeaderQuery` khỏi ADMIN_ASSIGNER_NAMES. (3) Thay `_extractRsrcMapModuleUrls` (targeted) → `_extractAllRsrcMapUrls` (fetch ALL rsrcMap JS resources giống Pancake). (4) Đưa `findThread` strategy lên #3 (trước ConversationPage), xóa `queryViaAdminAssignerFriendlyName` + `queryViaThreadlist` (luôn fail/redundant). (5) Fix compat view URL: `asset_id + nav_ref=diode_page_inbox`. |

### [orders] [render] Fix custom tag display name bị mất — atomic config merge ✅
| | |
|---|---|
| **Files** | `render.com/routes/realtime-db.js`, `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tag-sync.js` |
| **Chi tiết** | Root cause: race condition — nhiều client cùng save config (DELETE+INSERT full replace) → ghi đè definitions của nhau → orphaned IDs hiện raw code thay vì display name. **Dữ liệu bị ảnh hưởng**: 4 T-tags orphan (11 orders) + 12 custom flags orphan (67 orders, `CUSTOM_1774718207671_kg70` chiếm 50 đơn). **Fix**: (1) Server: thêm `PATCH /config-merge` endpoint — atomic add/remove defs, dùng `SELECT FOR UPDATE` lock, merge vào array hiện tại thay vì replace. (2) Client: tất cả create/delete operations dùng `mergeConfigDefs()` thay vì `saveTTagDefinitions()/saveCustomFlagDefinitions()` (full-replace). (3) `_getOrCreateCustomFlag()` persist ngay lập tức qua merge thay vì đợi batch save cuối. (4) Backup `_tTagDefinitions` khi load config (giống `_customFlagDefs` đã có). (5) Fallback display `⚠ tagId` + console.warn cho missing definitions. (6) Cải thiện `debug-config` endpoint report cả orphaned flags + `?repair=true`. **Đã chạy repair**: 4 T-tags + 12 flags recovered thành công. |

### [extension] Fix global-id: load compat view + alternative BizComet query names ✅
| | |
|---|---|
| **Files** | `n2store-extension/background/facebook/session.js`, `n2store-extension/background/facebook/global-id.js`, `n2store-extension/background/facebook/doc-id-interceptor.js` |
| **Chi tiết** | Root cause: Facebook đổi tên `PagesManagerInbox*` → `BusinessComet*`/`BizInbox*`, doc_ids không tìm được. Fix 3 phần: (1) **Compat view** (Pancake approach): load legacy inbox view bằng cách append `?cquick=jsc_c_d&cquick_token=TOKEN` vào inbox URL → trang legacy chứa PagesManager doc_ids + rsrcMap. (2) **Alternative query names**: global-id.js thử `BusinessCometInboxThreadDetailHeaderQuery` khi `PagesManagerInboxAdminAssignerRootQuery` không có. Thêm `findDocId()` helper với arrays alternatives cho mỗi strategy. (3) **New strategies**: ConversationPage scraping (no doc_id needed), enhanced interceptor parse raw body, `waitForDocIds()` đảm bảo JS bundle extraction xong trước khi resolve. (4) Better error logging: log GraphQL errors, response size. |

### [orders] Đổi "NAP" → "TỈNH NAP" trong delivery-report ✅
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js` |
| **Chi tiết** | Đổi tên hiển thị "NAP" thành "TỈNH NAP" ở 2 nơi: (1) Header province view "NAP 115/229" → "TỈNH NAP 115/229", (2) Thông báo scan feedback dùng GROUP_LABELS thay vì hardcode. Không đụng export buttons, Excel sheet names hay logic. |

### [realtime] Fix root cause: page không có subscription → WS join fail ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/realtime-manager.js`, `orders-report/js/tab1/tab1-init.js` |
| **Chi tiết** | Root cause: `pdm.pageIds` trả 4 pages nhưng page `193642490509664` không có Pancake subscription → `multiple_pages:` channel join bị reject "Gói cước hết hạn" → browser + server không nhận events. Fix: (1) Retry logic: khi join fail, thử lại bỏ từng page để tìm page lỗi. (2) Push fresh token (Kỹ Thuật NJD) + 3 pages đúng lên cả 2 server → server đã nhận events thành công. (3) Auto-push token lên server khi browser WS connect. |

### [orders] Fix unread badges bị đè bởi sentOrdersUpdated + auto-push token lên server ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-table.js`, `orders-report/js/tab1/tab1-init.js` |
| **Chi tiết** | 3 fixes: (1) `sentOrdersUpdated` event dùng `td.innerHTML` đè mất badge "X MỚI" unread — fix: save `.new-msg-badge` trước innerHTML rồi prepend lại. (2) Tương tự `failedOrdersUpdated` đè `.new-cmt-badge` trong cột comments. (3) Server có 0 pending_customers vì token Pancake expired — thêm `_pushTokenToServer()` tự động gửi fresh token lên server mỗi khi browser WS connect. |

### [orders] Fix realtime: WS diagnostics + chat polling fallback + convId bug ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/realtime-manager.js`, `orders-report/js/tab1/tab1-chat-realtime.js`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-init.js` |
| **Chi tiết** | 4 fixes: (1) Thêm console logging vào WS lifecycle (connect, join, events, close) để debug. (2) Fix `handleNewMessage` bug: `conversation_id` nằm trong `payload.message.conversation_id`, không phải `payload.conversation_id`. (3) Thêm polling fallback 15s cho chat modal khi WS không hoạt động — poll fetchMessages + append new msgs. (4) Thêm WS status badge `● WS` / `○ WS` trên toolbar + log khi pending customers load. |

### [shared] Thêm ImageBlobCache (IndexedDB) cho hình gửi lại nhiều lần ✅
| | |
|---|---|
| **Files** | `shared/js/quick-reply-manager.js`, `orders-report/js/chat/quick-reply-manager.js`, `orders-report/js/utils/bill-service.js` |
| **Chi tiết** | Hình CAMON, quick-reply trước đây fetch mỗi lần gửi. Thêm `ImageBlobCache` class dùng IndexedDB lưu blob theo URL (max 7 ngày). `getOrFetch(url)` trả cache nếu có, không thì download + lưu. Tích hợp vào 3 files: shared quick-reply-manager (upload + re-upload), orders-report quick-reply-manager (upload + re-upload + extension fallback), bill-service (CAMON extension). |

### [orders] Fix bill send extension bypass: gửi hình bill + CAMON image qua extension ✅
| | |
|---|---|
| **Files** | `orders-report/js/utils/bill-service.js` |
| **Chi tiết** | Extension bypass trước chỉ gửi text `[Hóa đơn đã được tạo]`, không gửi hình. Fix: (1) Hoist `billImageFile` → dùng `sendImagesViaExtension` gửi hình bill thật. (2) CAMON qua extension: download imageUrl → File → `sendImagesViaExtension([camonFile], camonText)` gửi cả hình + text. (3) extConv populate customerName/customers từ msgData + orderResult. (4) `sendAdditionalBillMessages` chuyển fire SAU bill thành công. (5) Thêm chữ ký nhân viên vào CAMON text cả 2 paths. |

### [chat] Fix reply comment: detect post-not-exist, stop fallback chain sớm ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | Reply comment trên post cũ (2022) bị xóa → Pancake API trả `(#100, 33) Object does not exist` → code fallback qua 5 methods rồi hiện lỗi "Global Facebook ID" gây nhầm. Fix: detect error code 100 hoặc "does not exist" → throw ngay "Bài viết/bình luận không còn tồn tại" → không chạy fallback chain vô ích. |

### [chat] Fix lỗi "Không tìm được Global Facebook ID" khi gửi qua Extension ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js`, `orders-report/js/tab1/tab1-extension-bridge.js`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Chi tiết** | 3 fixes: (1) `_sendInbox` chỉ fallback extension khi lỗi 24h, không fallback cho lỗi khác. (2) `sendViaExtension` detect `thread_id === psid` → skip thread_id vì PSID làm extension resolve sai. (3) `_loadMessages` cache global_id ngay khi load tin nhắn. |

### [chat] Thêm chữ ký nhân viên vào chat modal (orders-report) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | `window.sendMessage()` gửi text trực tiếp không có chữ ký. Thêm `\nNv. [displayName]` giống inbox-chat.js. Quick-reply đã có sẵn, chỉ thiếu khi gõ trực tiếp. |

### [chat] Hiển thị reaction emoji trên tin nhắn trong chat modal ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js`, `orders-report/css/tab1-chat-modal.css` |
| **Chi tiết** | Bug: code chỉ render `reactionSummary` (comment counts) mà bỏ qua `msg.reactions` (emoji attachments từ inbox). Fix: thêm render `reactions` array (hiển thị emoji như ❤️) + thêm CSS `.message-reactions`. |

### [inbox] Thêm chữ ký nhân viên vào inbox chat ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-chat.js` |
| **Chi tiết** | Thêm `\nNv. [displayName]` vào cuối mỗi tin nhắn gửi từ inbox chat (cả inbox và comment). Quick-reply đã có sẵn. message-template-manager (bulk send) không thêm theo yêu cầu. |

### [docs] Tạo file dev-log.md + cập nhật CLAUDE.md ✅
| | |
|---|---|
| **Files** | `docs/dev-log.md`, `CLAUDE.md`, `MEMORY.md` |
| **Chi tiết** | File theo dõi tiến trình code. Thêm hướng dẫn bắt buộc vào CLAUDE.md và MEMORY.md để mọi session đều tự cập nhật. |

---

<!--
HƯỚNG DẪN THÊM ENTRY MỚI:

1. Nếu cùng ngày → thêm entry ngay dưới heading ## [NGÀY]
2. Nếu ngày mới → thêm heading ## [NGÀY MỚI] ở trên cùng (trước ngày cũ)

FORMAT:
### [module] Mô tả ngắn {✅ hoặc 🔄}
| | |
|---|---|
| **Files** | `path/to/file.js` |
| **Chi tiết** | Thay đổi gì, tại sao |

MODULE TAGS: [inbox] [chat] [extension] [orders] [worker] [render] [shared] [docs] [config]
STATUS: ✅ = Done, 🔄 = In Progress
-->
