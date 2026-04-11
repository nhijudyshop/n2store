# Dev Log — N2Store

> Cập nhật liên tục khi code. Mới nhất ở trên.
>
> **Cách tìm nhanh:** Ctrl+F tìm theo ngày `## 2026-`, theo module `[inbox]` `[chat]` `[extension]` `[orders]` `[worker]` `[render]`, hoặc theo status `IN PROGRESS`.

---

## 2026-04-11

### [chat] Cross-page conversation lookup + picker + bug fixes ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/managers/pancake-data-manager.js`, `orders-report/css/tab1-chat-modal.css`, `orders-report/tab1-orders.html` |
| **Root cause** | PSID là page-specific → cùng customer có PSID khác trên page khác. `searchConversations()` (POST) trả `success:false`. |
| **Fix** | Thêm `pdm.searchConversationsOnPage(pageId, name)` dùng GET v2 public API `?search=` (xác nhận hoạt động qua console debug). Khi switch page (`allowDrift=false`): search bằng customer name → filter exact match → 0 conv=empty state, 1 conv=auto-load, 2+ convs=conversation picker. |
| **Picker UI** | `.chat-conv-picker-*` classes: danh sách cards với icon (📧 inbox / 💬 comment), tên, snippet, thời gian. Click → `_pickConversation()` load messages. |
| **Bugs fixed** | (1) dropdown `position:fixed` thoát overflow:hidden chain; (2) dropdown position left-aligned tránh off-screen; (3) page drift disabled khi explicit switch; (4) `_pageConvCache` guard init; (5) `_pickConversation` sync page selector label. |
| **Status** | ✅ Done |

## 2026-04-10

### [render][fb-ads] Full feature set — billing, audiences, pixels, reports, rules, account
- **Files:** `fb-ads/*`, `render.com/routes/fb-ads.js`
- **Chi tiết:** Thêm 6 tabs mới: (1) Đối tượng — custom & lookalike audiences CRUD; (2) Pixel — list pixels, event stats; (3) Thanh toán — account status, spent, balance, spend cap control, funding source, transactions; (4) Báo cáo — daily/age+gender/placement reports + CSV export; (5) Quy tắc tự động — tạo rules (CPC/CPR triggers → pause/notify), enable/disable; (6) Tài khoản — full details, users, permissions, activity log, disable reason.
- **Status:** ✅ Done

### [render][fb-ads] Full Ads Manager — roles, creation, bulk actions
- **Files:** `fb-ads/*`, `render.com/routes/fb-ads.js`
- **Chi tiết:** (1) Backend: app roles CRUD, pages list, campaign/adset update, ad image upload base64, bulk status/delete, ad preview. (2) Frontend: Settings modal (quản lý users/testers, view Pages, token info), Edit campaign modal, Create Ad Set modal (targeting: country/age/gender/interests search), Create Ad modal (message/headline/image/CTA/page), Bulk actions (select all → activate/pause/delete), drill-down Campaign→AdSet→Ad.
- **Status:** ✅ Done

### [chat] Per-page conv cache + nút chọn lại đoạn hội thoại ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Conv cache** | `window._pageConvCache` Map keyed `${psid}:${pageId}:${type}`. Khi `_doFindAndLoadConversation` tìm thấy conv → save. Lần sau switch page quay lại → hit cache instant (skip API). Clear khi close modal. |
| **Nút sync** | `#chatRepickConvBtn` (icon `sync`) hiện bên cạnh page selector. Click → xoá cache cho page hiện tại → `_findAndLoadConversation` fresh. User dùng khi muốn chọn đoạn hội thoại khác (vd: customer có nhiều threads). |
| **Status** | ✅ Done |

### [chat] Page selector popup — thay select thành danh sách đẹp giống inbox ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/tab1/tab1-chat-core.js` |
| **Why** | `<select>` HTML thô quá basic, user muốn popup giống trang inbox: avatar + tên page + checkmark page đang chọn. |
| **HTML** | Thay `<select id="chatPageSelect">` bằng `<div class="chat-page-selector">` chứa button trigger + dropdown container. |
| **CSS** | Xoá CSS `#chatPageSelect`, thêm `.chat-page-selector-*` classes: popup absolute right, border-radius 10px, shadow, thin scrollbar, active state `--ap-on-primary-container`, avatar 28px, checkmark icon visibility toggle. Arrow rotate 180° khi open. |
| **JS** | Refactor `_populatePageSelector()` → render items HTML với avatar (img + onerror placeholder) + name + check icon. Thêm `_togglePageDropdown`, `_closePageDropdown`, `_updatePageSelectorActive`, `_renderPageSelectorItems`. Click-outside handler. Page drift sync đổi từ `chatPageSelect.value =` sang `_updatePageSelectorActive()`. Single-select (khác inbox multi-select). |
| **Status** | ✅ Done |

### [render][fb-ads] Facebook Ads Manager — MVP
- **Files:** `fb-ads/index.html`, `fb-ads/fb-ads.css`, `fb-ads/fb-ads.js`, `render.com/routes/fb-ads.js`, `render.com/server.js`
- **Chi tiết:** Build trang quản lý quảng cáo Facebook tích hợp Marketing API v21.0. Backend proxy giữ token server-side. Frontend có Facebook Login, auto-detect ad accounts, 3 tabs (Campaigns/Ad Sets/Ads), metrics bar, search, date range filter, create campaign modal, toggle status. Env vars FB_APP_ID + FB_APP_SECRET đã thêm vào Render.
- **Status:** ✅ Done

### [worker][shared] Follow-up: CF Worker proxy auth + xóa sót API key
- **Files:** `cloudflare-worker/modules/handlers/token-handler.js`, `shared/js/pancake-token-manager.js`
- **Chi tiết:** (1) CF Worker `/api/token` giờ hỗ trợ 2 mode: **proxy auth** (JSON `{companyId}` → Worker inject credentials server-side) + **legacy passthrough** (form-urlencoded, backward compat). Credentials chỉ tồn tại trong Worker, không còn trong browser JS. (2) Xóa hardcoded API key cuối cùng trong `shared/js/pancake-token-manager.js`.
- **Status:** ✅ Done

### [orders] Security + Bug fix audit — 17 issues fixed across 14 files
| | |
|---|---|
| **Files** | `token-manager.js`, `pancake-token-manager.js`, `main.html`, `tab1-sale.js`, `tab1-tags.js`, `tab1-table.js`, `tab1-chat-messages.js`, `tab1-chat-core.js`, `tab1-merge.js`, `tab1-search.js`, `tab1-bulk-tags.js`, `tab1-fast-sale-invoice-status.js`, `tab1-qr-debt.js`, `tab1-encoding.js` |
| **What** | **P0 Critical:** (1) Removed hardcoded TPOS credentials from browser JS → proxy-based auth, (2) Removed hardcoded API key fallbacks, (3) Added idempotency key for sale order creation to prevent duplicate invoices on 401 retry, (4) Validated postMessage origins in extension relay bridge (replaced `'*'` wildcards). **P1 High:** (5) Escaped HTML in tag names, error msgs, onclick attrs, image URLs to prevent XSS, (6) Fixed merge crash on null sourceOrder/ProductId with bounds checks, (7) Added negative discount validation, (8) Changed tag filter logic from AND→OR (UX fix). **P2 Medium:** (9) Chat Firebase listener cleanup on modal close (memory leak), (10) Added 30s safety timeout for isSavingSingleSale flag, (11) Bulk tag O(n²)→O(n) with Set, (12) Fixed false success count for already-tagged orders, (13) Token refresh promise-based mutex, (14) Invoice delete API-first atomicity, (15) Debt balance validation (finite, non-negative), (16) Empty OrderLines validation, (17) Improved encoding checksum to 8-char dual-hash. |
| **Status** | ✅ Done |

### [shared] Cài đặt everything-claude-code vào project
- **Files:** `.claude/agents/` (47), `.claude/skills/` (181), `.claude/commands/` (79), `.claude/rules/` (89 files), `.claude/scripts/` (128), `.claude/settings.json`
- **Source:** https://github.com/affaan-m/everything-claude-code
- **Chi tiết:** Copy toàn bộ agents/skills/commands/rules/scripts vào `.claude/` (project-level). Tạo `settings.json` với 32 hooks (PreToolUse x11, PostToolUse x11, Stop x6, SessionStart, SessionEnd, PreCompact, PostToolUseFailure). `CLAUDE_PLUGIN_ROOT` → `/Users/mac/Desktop/n2store/.claude`
- **Status:** ✅ Done

### [render][orders] Pancake token cache — Phase 2 ✅
| | |
|---|---|
| **Files** | `render.com/services/auth-token-store.js`, `render.com/server.js`, `orders-report/js/managers/pancake-token-manager.js` |
| **Why** | Pancake JWT cũng mất khi F5/cold-start. Cần shared cache để mọi tab/máy dùng được ngay mà không cần user login lại. |
| **What** | 1/ `auth-token-store.js`: thêm pancake provider — read-only (không có OAuth2 password grant), `getToken('pancake')` trả về token hiện có hoặc throw `pancake:not_found`. 2/ `server.js /api/realtime/start`: sau khi save vào `realtime_credentials`, cũng upsert vào `auth_token_cache` (decode JWT exp → set `expires_at`). 3/ `GET /api/auth/token/pancake`: trả 404 nếu chưa có token. 4/ `pancake-token-manager.js`: thêm `tryRenderCache()` + Step 0 trong `getToken()` — chỉ gọi Render nếu memory+localStorage rỗng (tránh network overhead mỗi call). Hydrate memory+localStorage sau khi lấy từ Render. |
| **Flow** | Browser login → `/api/realtime/start` → upsert `auth_token_cache[pancake]` → mọi tab mới gọi `GET /api/auth/token/pancake` → nếu còn hạn trả về → hydrate localStorage. Khi token hết hạn → 401/null → user re-login → push lại. |
| **Status** | ✅ Done |

### [render][orders] TPOS token cache — PostgreSQL + Render API + CF fallback ✅
| | |
|---|---|
| **Files** | `render.com/services/auth-token-store.js` (new), `render.com/migrations/042_create_auth_token_cache.sql` (new), `render.com/server.js`, `orders-report/js/core/token-manager.js` |
| **Why** | Mỗi tab browser mở mới phải re-login TPOS (~500-2000ms). Token hết hạn 15 ngày nhưng chỉ cache memory — mất khi F5. Không sync giữa máy. |
| **Changes** | (1) Table `auth_token_cache` (provider PK, token, refresh_token, expires_at, metadata). (2) `auth-token-store.js`: getToken (DB lookup → refresh nếu cần), refreshAndStore (lock per provider), preSeed (tpos_1, tpos_2, tpos_server). (3) Endpoints `GET /api/auth/token/:provider` + `POST /invalidate` bảo vệ bằng `X-API-Key`. (4) Client `token-manager.js`: thêm `tryRenderCache()` trước refresh_token + passwordLogin. 3s timeout, fallback silent. `authenticatedFetch` 401 → invalidate Render cache + retry. (5) `CLIENT_API_KEY` env set on Render. |
| **Flow** | Client → Render cache (30ms) → nếu fail → CF worker → TPOS login (500ms). Token sync qua DB: 1 máy refresh → tất cả máy khác GET cùng token. |
| **Status** | ✅ |

## 2026-04-09

### [render][inbox] Thêm fb_id vào bảng customers + auto-link từ Pancake ✅
| | |
|---|---|
| **Files** | `render.com/migrations/027_add_fb_id_to_customers.sql`, `render.com/routes/v2/customers.js`, `inbox/js/inbox-data.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | **Migration 027:** Thêm cột `fb_id VARCHAR(50)` nullable, UNIQUE WHERE NOT NULL. **API:** `GET /api/v2/customers/by-fb-id/:fbId` lookup, `POST /api/v2/customers/link-fb-ids` batch link by phone match. **Auto-link:** `inbox-data.js` sau `loadConversations` gửi batch `{fb_id, name, phone}` lên Render DB (fire-and-forget). **Search fallback:** `performSearch` nếu local name index miss → query customer DB → nếu có fb_id → gọi `searchByCustomerId`. |
| **Status** | ✅ Done |

### [inbox] Local customer name index — gõ tên tự động tìm theo customer ID ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-data.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | **customerNameIndex:** `Map<normalizedName, Set<fb_id>>` xây từ conversations đã load trong `buildMaps()`. **lookupFbIdByName(query):** exact match rồi substring match trên tên normalized (bỏ dấu). **performSearch():** trước khi gọi API, tra local index → nếu hit → gọi `searchByCustomerId(fb_id)` ngay → render kết quả tức thì → sau đó vẫn chạy normal search để merge thêm. |
| **Status** | ✅ Done |

### [inbox] Search by Customer ID — tìm tất cả conversations của 1 khách hàng ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-pancake-api.js`, `inbox/js/inbox-chat.js` |
| **Chi tiết** | **searchByCustomerId(fbId):** Gọi Pancake API `/conversations/customer/{fbId}` với pages params, trả về TẤT CẢ conversations (inbox + comment) của customer across all pages. **performSearch():** (1) Detect fb_id (15+ digits) → gọi trực tiếp searchByCustomerId, skip normal search. (2) Sau searchConversations thường, nếu có kết quả → lấy fb_id từ conversation đầu tiên → chain searchByCustomerId → merge + deduplicate. User search tên/SĐT → tự động tìm thêm tất cả conversations liên quan. |
| **Status** | ✅ Done |

### [inbox][worker] Tăng tốc load Inbox: parallel fetch + stale-while-revalidate cache + edge cache ✅
| | |
|---|---|
| **Files** | `inbox/js/inbox-pancake-api.js`, `inbox/js/inbox-data.js`, `inbox/js/inbox-main.js`, `cloudflare-worker/modules/handlers/pancake-handler.js` |
| **Chi tiết** | **Lớp 1:** `fetchConversations` + `fetchConversationsPerPage` đổi từ vòng `for...of` tuần tự sang `Promise.all` song song — N pages cùng fetch một lúc, giảm từ N×latency về ~1×. **Lớp 2:** Stale-while-revalidate cache localStorage (`inbox_conversations_cache_v1`, TTL 30 phút). Tách `InboxDataManager.initFromCache()` (sync) khỏi `init()` (network). `inbox-main.js` render UI từ cache ngay (<100ms), background refresh ngầm rồi re-render. **Lớp 3:** Cloudflare Worker `handlePancakeOfficialV2` thêm edge cache (Cache API, không cần KV) cho `pages/{id}/conversations` — TTL 60s, key gồm `page_access_token` để tự invalidate khi token đổi, không cache response chứa `error_code`, gắn header `X-Cache: HIT/MISS`. |
| **Status** | ✅ Done |

### [delivery] Approve = ẩn đơn vĩnh viễn + tạo yêu cầu chỉ chọn đơn đã quét ✅
| | |
|---|---|
| **Files** | `delivery-report/js/delivery-report.js`, `delivery-report/js/cancel-request.js` |
| **Chi tiết** | (1) Thêm `hiddenNumbers` Set + `hidden_numbers` doc Firestore. `fetchData` lọc bỏ hidden ngay sau khi nhận từ API. Expose `DeliveryReport.hideOrder(number)`. (2) `CancelRequest.approve` sau khi xóa request → gọi `hideOrder` để loại đơn khỏi UI/scanned, persist hidden. (3) Modal "Tạo yêu cầu" giờ chỉ list đơn nằm trong `scannedNumbers` — chưa quét thì hiện thông báo yêu cầu quét trước. |
| **Status** | ✅ Done |

### [delivery] Admin/phuoc duyệt yêu cầu hủy → confirm xóa request ✅
| | |
|---|---|
| **Files** | `delivery-report/js/cancel-request.js`, `delivery-report/css/delivery-report.css` |
| **Chi tiết** | Thêm nút "Duyệt" cho mỗi cancel_request `pending`, chỉ hiện với user có `isAdminTemplate()` hoặc username `phuoc`. Click → confirm dialog → `col.doc(id).delete()`. Realtime listener tự cập nhật UI. |
| **Status** | ✅ Done |

### [chat] Nút "Gửi QR" trong header modal — tự gửi ảnh QR vào chat ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-qr-debt.js` |
| **What** | Đổi nút "QR" thành "Gửi QR". `sendQRFromChatHeader()` lấy `currentChatPhone` → `getOrCreateQRForPhone` → `generateVietQRUrl(code, 0)` → gọi `window.sendImageToChat(qrUrl, ...)` để upload và gửi ảnh QR thẳng vào chat (không hiển thị modal). Expose thêm `generateVietQRUrl` + `normalizePhoneForQR` lên window. |
| **Status** | Done |

### [chat] Nút "QR" trong header modal tin nhắn ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/css/tab1-chat-modal.css` |
| **What** | Thêm button QR vào `.chat-header-right` (bên trái cụm "Tin nhắn / Bình luận"). Click → `window.openQRFromChatHeader()` → đọc `currentChatPhone` rồi gọi `showOrderQRModal(phone)` (cùng flow với nút QR ở table). Empty phone → notify "Khách hàng chưa có SĐT". |
| **Status** | Done |

### [facebook-services] Page picker + tab LIVE dùng TPOS livevideo API ✅
| | |
|---|---|
| **Files** | `facebook-services/index.html`, `facebook-services/css/facebook-services.css`, `facebook-services/js/facebook-services.js` |
| **What** | (1) Modal có `<select>` chọn page; danh sách page lấy từ `realtime_credentials.pancake.page_ids` (Render DB), enrich tên qua TPOS `/facebook/crm-teams`. (2) Tab LIVE dùng TPOS `/facebook/livevideo?pageid=X` (vì Pancake API không trả livestream); normalize response → cùng schema render. (3) Đổi page → reset cả 2 cache, reload theo tab hiện tại. (4) `currentPageId` thay cho hằng `PANCAKE_PAGE_ID` ở mọi nơi gọi API. |

### [facebook-services] Modal chọn bài viết — 3 tab Live/Video/Bài viết, mặc định Live ✅
| | |
|---|---|
| **Files** | `facebook-services/index.html`, `facebook-services/css/facebook-services.css`, `facebook-services/js/facebook-services.js` |
| **What** | Thêm tab strip trên modal. Filter posts theo `post.type`: live=`livestream`, video=`video`, post=khác. State `currentPostTab='live'`. `filterPancakePosts()` áp tab + search. Mặc định mở modal hiển thị tab Live. |

### [render][facebook-services] Load Pancake account từ Render DB ✅
| | |
|---|---|
| **Files** | `render.com/server.js`, `facebook-services/js/facebook-services.js` |
| **What** | Thêm endpoint `GET /api/realtime/credentials/pancake` trả về `{token,userId,pageIds,...}` từ bảng `realtime_credentials`. `fetchPancakePosts()` thêm Strategy 0 — gọi endpoint này trước, nếu có token thì thử load posts qua CF Worker `pancake-direct`, fallback các strategy cũ nếu fail. |

### [customer-hub] Compact UI cho "Hoạt động ví" — 1 dòng/giao dịch ✅
| | |
|---|---|
| **Files** | `customer-hub/js/modules/customer-profile.js` |
| **What** | Đổi card lớn → dòng compact: `±{amountK}  {note · date · operator}  → {balanceAfterK}`. Border-trái màu theo credit/debit. Tooltip giữ thông tin đầy đủ. Logic phân loại tx (cfg, sign, label, detailParts, operatorHtml) giữ nguyên. |

### [orders] Ẩn toàn bộ badge trạng thái đơn (Hủy bỏ / Đơn hàng / Nháp) khỏi cột Phiếu bán hàng ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **What** | Bỏ render `<span invoice-order-status-badge>` ở row 3 cho mọi cls. Logic derive vẫn giữ cho các nơi khác dùng. |

### [orders] StateCode `None` → badge "Hủy bỏ" ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Why** | User yêu cầu coi `None` như đơn đã hủy thay vì "Đơn hàng" |
| **What** | `deriveOrderStatusFromStateCode()`: chuyển case `'None'` từ nhóm "Đơn hàng" sang nhóm "Hủy" (cùng `cancel`, `IsMergeCancel`) |

### [orders] Gộp 3 cột → 1 cột "Phiếu bán hàng" + WS-driven invoice fetch ✅
| | |
|---|---|
| **Files** | `tab1-fast-sale-invoice-status.js`, `tab1-tpos-realtime.js`, `tab1-table.js`, `tab1-orders.html`, `tab1-orders.css`, `column-visibility-manager.js` |
| **Why** | Bỏ cột "Phiếu bán hàng TPOS"+"Trạng thái"+"Ra đơn", dồn vào cột "Phiếu bán hàng". WS `tpos:order-update` → fetch FastSaleOrder bằng `contains(Reference, code)` → cập nhật ShowState/StateCode + nút "Đã ra đơn" + badge "Trạng thái đơn hàng". |
| **Changes** | (1) Xoá `<th>` + `<td>` status & fulfillment columns. (2) `fetchAndUpdateInvoiceForCode(code, soId)` + `_rawInvoiceById` Map: gọi worker proxy GetView với filter `Type eq 'invoice' and contains(Reference,'CODE')` → ghi InvoiceStatusStore + lưu raw → re-render cell. (3) `renderInvoiceStatusCell` thêm 2 row: badge "Trạng thái đơn" derive từ StateCode + nút "Đã ra đơn" mở modal raw. (4) `handleOrderUpdate`/`handleNewOrder` gọi fetch sau update row. (5) CSS `.invoice-order-status-badge` + `.invoice-ra-don-badge`. |
| **Mapping StateCode** | draft/NotEnoughInventory→Nháp · cancel/IsMergeCancel→Hủy · CrossCheck*/None→Đơn hàng |
| **Status** | ✅ |

### [render][orders] Slim WS bridge — bỏ broadcast thừa + FastSaleOrder enrichment + cột PBH TPOS ✅
| | |
|---|---|
| **Files** | `render.com/server.js`, `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js` (xoá), `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-table.js`, `orders-report/js/managers/column-visibility-manager.js`, `orders-report/css/tab1-orders.css` |
| **Why** | Server đang bắn 3 broadcast (tpos:event raw + tpos:parsed-event + tpos:order-update) cho mỗi event TPOS — 2 cái đầu client không xử lý, tốn băng thông. FastSaleOrder enrichment dùng SaleOnlineIds field rỗng nên không khả thi. Cột "Phiếu bán hàng TPOS" phụ thuộc cả 2 → bỏ luôn. |
| **Changes** | (1) `handleEvent` chỉ còn forward `SaleOnline_Order` (drop chatomni.on-message, FastSaleOrder, Product, ProductInventory). Bỏ broadcast `tpos:event` và `tpos:parsed-event`. (2) Xoá toàn bộ block `TPOS FASTSALEORDER ENRICHMENT` (~165 dòng) gồm `_toSnapshot`, `scheduleFastSaleOrderEnrichment`, `flushFastSaleOrderEnrichment`, `fetchFastSaleOrdersByFilter`, endpoint `/api/tpos/fastsale-snapshot`. (3) Client: xoá `handleInvoiceListUpdate` + case trong handleMessage, xoá file `tab1-tpos-invoice-snapshot.js`, xoá `<th>` + `<td>` cột "Phiếu bán hàng TPOS" trong tab1-orders.html + tab1-table.js, xoá entry trong column-visibility-manager, xoá CSS `.invoice-status-tpos-cell`. |
| **Giữ nguyên** | `/api/invoice-status` + `InvoiceStatusStore` + cột "Phiếu bán hàng" gốc — không touch. Cột Trạng thái vẫn render từ `order.Status`. |
| **Status** | ✅ |

### [render] FIFO loại HOÀN khỏi queue — chỉ CK thật ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/wallets.js` |
| **Chi tiết** | Skip DEPOSIT có `source='ORDER_CANCEL_REFUND'` khỏi FIFO queue. Refund không tham gia làm nguồn cover withdraw, không xuất hiện trong `availableDeposits` kể cả khi còn dư. Withdraw chỉ consume từ CK BANK_TRANSFER thật. |
| **Status** | ✅ Done |

### [render][orders][customer-hub] FIFO availableDeposits + nhãn HOÀN cho refund ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/wallets.js`, `orders-report/js/utils/sale-modal-common.js`, `customer-hub/js/modules/customer-profile.js` |
| **Bug** | `wallets.js` query `type='WITHDRAWAL'` (sai) → DB lưu `'WITHDRAW'` → `totalWithdrawn` luôn = 0 → `availableDeposits` trả về toàn bộ deposits, không trừ withdraw. Auto-fill note phiếu bán hàng hiển thị các CK đã consumed. |
| **Backend** | Rewrite `availableDeposits`: query DEPOSIT+WITHDRAW chronological, simulate FIFO queue, trả về deposits còn dư (oldest→newest). Bỏ qua VIRTUAL_*. |
| **Frontend orders** | `autoFillSaleNote()` iterate forward (oldest→newest), skip `source === 'ORDER_CANCEL_REFUND'` khỏi note "CK xxxK ACB dd/mm". |
| **Customer-hub** | Override label "HOÀN" (giữ màu xanh, dấu +) cho `tx.type==='DEPOSIT' && tx.source==='ORDER_CANCEL_REFUND'`. Fix `isRefund` detection (trước check `tx.type==='ORDER_CANCEL_REFUND'` không bao giờ match). Operator label đổi "Duyệt bởi" → "Hoàn bởi" cho refund. |

### [orders] Đổi tab "Hàng rớt - xã" → "Bán Hàng" với 2 sub-tab ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Đổi label tab cha thành "Bán Hàng" (giữ data-tab="dropped" + badge cũ). Bọc nội dung trong 2 sub-panel: `#droppedSubPanelXasha` (giữ nguyên hàng rớt xả + FAB) và `#droppedSubPanelKho` (Kho Sản Phẩm — UI giống hệt, container/FAB id `warehouse*`). Thêm `.dropped-subtabs` CSS + `switchDroppedSubTab(bucket)`. JS thêm parallel state/render/wire cho warehouse (`warehouseProducts` in-memory, _detectDroppedCategory dùng chung, hover preview singleton dùng chung). Cart-drop flow KHÔNG đổi → vẫn chỉ vào Hàng rớt xả. Stub `addToWarehouseProducts/removeFromWarehouseProducts` để user tự hoàn thiện logic add sau. |
| **Status** | ✅ Done |

### [customer-hub] Fix nút X đóng modal Customer Profile không bấm được ✅
| | |
|---|---|
| **Files** | `customer-hub/js/modules/customer-profile.js` |
| **Chi tiết** | Nút X ở header modal Customer Profile dùng inline `onclick` với optional chaining + nhiều câu lệnh, không kích hoạt. Thay bằng `id="modal-close-btn"` và bind `addEventListener('click', ...)` trong `initUI()`, fallback ẩn modal trực tiếp nếu `window.closeCustomerModal` chưa sẵn. |
| **Status** | DONE |

### [orders] Chốt Đơn panel: dời nút Ghim Tag T lên header ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Nút ghim Tag T (`_ptagToggleTTagPin`) trước nằm trong section header "TAG T CHỜ HÀNG", nay chuyển lên panel header Chốt Đơn — kế nút "Ghim panel". Icon thumbtack màu xanh dương `#3b82f6`, xoay 45° khi chưa ghim. Bỏ nút cũ trong section. |

### [chat] Hàng rớt xả: gom 4 FAB thành speed-dial ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/css/tab1-chat-modal.css`, `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Thêm nút toggle (`#droppedFabToggle`, icon `fa-bars`) — mặc định container có class `collapsed` chỉ hiện toggle, click để xổ ra 4 FAB (+, GỬI TÊN, GỬI ẢNH, HỦY/XÓA). CSS dùng opacity + transform + height:0 cho hiệu ứng thu gọn. |

### [chat] Hàng rớt xả: đổi nút FAB grid ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Tab "Hàng rớt - xả" (grid view) đổi nút FAB: nút "GỬI ĐƠN" → "+" (icon `fa-plus`, vẫn gọi `_handleDroppedSendSelected` chuyển vào đơn). Thêm nút "GỬI TÊN" (paper-plane) gọi `sendProductToChat` cho mỗi sản phẩm chọn. Thêm nút "GỬI ẢNH" (icon ảnh) gọi `sendImageToChat`. Cập nhật `_updateDroppedFabState` enable/disable cả 4 nút theo selection. |

### [chat] Hàng rớt xả: đổi nút thao tác sản phẩm (table view) ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/dropped-products-manager.js` |
| **Chi tiết** | Trong panel chat tab1 modal hàng rớt xả: nút "gửi đơn" (moveDroppedToOrder) đổi icon `fa-undo` → `fa-plus`. Nút paper-plane đổi thành text "Gửi tên". Thêm nút "Gửi ảnh" (màu tím #8b5cf6) gọi `sendImageToChat`, chỉ hiển thị khi có ImageUrl. |
### [shared] Mở quyền truy cập trang Thống Kê Giao Hàng cho mọi tài khoản ✅
| | |
|---|---|
| **Files** | `shared/js/navigation-modern.js` |
| **Chi tiết** | Thêm `publicAccess: true` cho menu item `delivery-report` (giống pattern Inbox). Mọi user đều vào được trang mà không cần cấp permission riêng. |
| **Status** | ✅ Done |

### [chat] Tối ưu modal: in-flight dedupe, per-conv debounce, LRU cache, reconcile helper ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-chat-realtime.js` |
| **#6** | `_resetTransientChatState()` thêm reset `isLoadingMoreMessages = false` — tránh kẹt cờ khi user switch giữa lúc paginate. |
| **#5** | Tách `window._reconcileOptimisticReplies(existing, incoming)` shared helper. `_loadMessages` và `handleNewMessage` cùng dùng → loại ~25 dòng dup. |
| **#2** | In-flight dedupe `_findAndLoadConversation`: wrap qua `_doFindAndLoadConversation`, cache promise theo key `${pageId}:${psid}:${type}` trong 3s. Double-click hoặc switch nhanh không tạo 2 fetch song song. |
| **#9** | LRU bound cho `_globalIdCache` (max 200, drop oldest 20% khi vượt) qua `_setGlobalIdCache(key, value)`. Tránh memory leak chậm theo số customer. |
| **#3** | `handleConversationUpdate` đổi từ 1 timer global (`_chatUpdateDebounce`) sang Map per convId (`_chatUpdateDebounceMap`). Nhiều conv update đồng loạt không clobber nhau. |
| **Cleanup** | `closeChatModal` clear cả `_chatUpdateDebounceMap` lẫn `_chatFindInFlight`. Comparator `_byUpdatedAtDesc` dùng chung cho 2 sort COMMENT (gọn hơn). |
| **Status** | ✅ Done |

### [orders][render] Giảm spam request `empty-cart-sync` (~95%) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-empty-cart-auto-sync.js`, `n2store-realtime/server.js` |
| **Why** | Network panel thấy 1000+ requests `empty-cart-sync` mỗi lần fetchOrders. Nguyên nhân: `batchEmptyCartSync` gửi MỌI đơn không lọc → server trả >95% noop. CORS preflight không cache → nhân đôi traffic. |
| **Chi tiết** | (1) **Fix A — Client pre-filter**: trong `batchEmptyCartSync` chỉ giữ đơn `(SL=0 && !hasGT)` hoặc `(SL>0 && hasGT)`, các đơn còn lại là noop chắc chắn → skip. Log dạng `Batch sync N/total (filtered)`. (2) **Fix B — CORS preflight cache**: thêm `maxAge: 86400` vào cors() middleware → browser cache OPTIONS 24h, cắt 50% requests. |
| **Status** | ✅ Done |

### [orders] updatePartnerStatus — broadcast theo SĐT, update tất cả partner trùng ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-table.js` |
| **Why** | Code cũ chỉ update đúng partnerId được click. Trong khi 1 KH thường có nhiều record TPOS trùng SĐT → mark Bom 1 record không chặn được các đơn sau đi qua record khác. Align với issue-tracking `markPartnerAsBoom`. |
| **Chi tiết** | (1) Lookup `Telephone` từ `partnerId` trong `allData`. (2) Search `Partner/GetViewV2?Name={phone}` lấy tất cả partner trùng SĐT (top 50 desc). (3) POST `UpdateStatus` cho toàn bộ targetIds. (4) Nếu có note: GET+PUT ghi vào `Email` cho toàn bộ. (5) Local sync + UI badge update broadcast theo `targetIds` thay vì 1 partner. (6) Fallback: nếu không tìm được phone hoặc search fail → giữ behavior cũ (chỉ update partnerId). Notification show số record đã update. |
| **Status** | ✅ Done |

### [issue-tracking] markPartnerAsBoom — note chỉ ghi vào partner mới nhất ✅
| | |
|---|---|
| **Files** | `issue-tracking/js/script.js` |
| **Why** | Sniff TPOS UI native: khi mark Bom thủ công chỉ `PUT Partner({id})` cho 1 record (record user đang xem), không broadcast. Code mình đang ghi Email cho cả 3 partner trùng SĐT → đè Email thật ở các record cũ. |
| **Chi tiết** | (1) Search param đổi `Phone=` → `Name=` cho khớp TPOS UI native (cùng kết quả). (2) Status "Bom hàng" vẫn quét **tất cả** partner trùng SĐT (giữ nghiệp vụ — 1 KH = nhiều record TPOS đều phải mark). (3) Note (`Email` field) chỉ ghi vào **partner mới nhất** (`partners[0]` sau sort `DateCreated desc`) — bỏ vòng for, dùng GET+PUT 1 lần duy nhất. |
| **Status** | ✅ Done |

### [issue-tracking] Refactor markPartnerAsBoom → dùng UpdateStatus API ✅
| | |
|---|---|
| **Files** | `issue-tracking/js/script.js` |
| **Why** | Code cũ GET full Partner payload + mutate `StatusStyle`/`StatusText` + PUT + cần `_rollbackPartners` khi fail giữa chừng. Phức tạp, dễ race. orders-report đã dùng `ODataService.UpdateStatus` atomic — align về cùng pattern. |
| **Chi tiết** | (1) Bỏ `_rollbackPartners` + vòng GET/mutate/PUT. (2) Step 2 mới: `POST Partner({Id})/ODataService.UpdateStatus` body `{"status":"#d1332e_Bom hàng"}` cho từng partner — TPOS tự set StatusStyle+StatusText server-side. (3) Step 3: ghi đè `Email = noteText` (GET+PUT) tách riêng, best-effort, lỗi chỉ `console.warn` không throw. (4) Vẫn quét tất cả partner trùng SĐT (top 50) — giữ nguyên nghiệp vụ cũ của issue-tracking. |
| **Status** | ✅ Done |

---

## 2026-04-08

### [render][soquy] Backup + migration Soquy Firestore → Postgres ✅
| | |
|---|---|
| **Files** | `render.com/scripts/backup-soquy-firestore.js` (new), `render.com/scripts/migrate-soquy-firestore-to-pg.js` (new), `render.com/migrations/041_create_soquy_tables.sql` (new), `render.com/backups/soquy/soquy-backup-*.json` (new) |
| **Why** | Cần backup dữ liệu Soquy trên Firestore và migrate sang Postgres trên Render để có nguồn dữ liệu thứ 2 (an toàn hơn, query SQL được). |
| **Chi tiết** | (1) `backup-soquy-firestore.js` dump 3 collections (`soquy_vouchers`, `soquy_counters`, `soquy_meta`) ra JSON, serialize Firestore Timestamp/GeoPoint/DocRef. Tạo file timestamp + `soquy-backup-latest.json`. (2) Migration 041 tạo 3 bảng mirror với column chính + `raw jsonb` giữ full doc, indexes trên `voucher_date_time/type/fund_type/status/code/source_code`. (3) `migrate-soquy-firestore-to-pg.js` đọc backup-latest, upsert vào Postgres trong 1 transaction, idempotent (`ON CONFLICT id DO UPDATE`). Counters dùng field `lastNumber`. (4) Đã chạy production: backup 573 vouchers + 3 counters + 7 meta, migrate vào Render Postgres `n2store_chat`. Frontend Firestore client **chưa thay đổi** — đây mới chỉ là backup/mirror. |
| **Status** | ✅ Done |

### [orders] Bulk "In hàng loạt PBH" — auto mark CHỜ HÀNG 🖨 ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Why** | Nút "In hàng loạt PBH" in xong nhưng không gán mark "đã in phiếu soạn" cho Tag XL → user phải đánh thủ công. |
| **Chi tiết** | Trong `bulkPrintSelectedBills` sau khi mở print popups, loop qua `tposOrders` + `fallbackOrders` gọi `window.onPtagPackingSlipPrinted(saleOnlineId)` cho từng đơn → set `pickingSlipPrinted=true`, force `subState='CHO_HANG'`, badge thành "CHỜ HÀNG 🖨". |
| **Status** | ✅ Done |

### [orders] Bulk Xóa Tag — admin xóa luôn Tag XL ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `tab1-bulk-tags.js` |
| **Why** | Nút bulk "Xóa Tag" trước đây chỉ xóa cột TAG TPOS. Admin cần xóa sạch cả Tag XL (category/subTag/flags/tTags). |
| **Chi tiết** | Thêm `forceClearProcessingTag(orderCode)` ở processing-tags: xóa toàn bộ XL state (khác `clearProcessingTag` chỉ clear category nếu còn flags/tTags). Trong `executeBulkRemoveAllTagsForSelected` sau khi xóa TPOS thành công, nếu `authManager.isAdminTemplate()` → gọi `forceClearProcessingTag(order.Code)` cho từng đơn. Confirm dialog hiện note "(admin: xóa cả TAG TPOS lẫn Tag XL)". |
| **Status** | ✅ Done |

### [orders] Bypass Render — gọi TPOS FastSaleOrder trực tiếp qua worker proxy ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js` |
| **Why** | Render Singapore outage + bug `DateUpdated` field → endpoint `/api/tpos/fastsale-snapshot` trả 400, store rỗng → cột "PBH TPOS" hiển thị Nháp dù TPOS thật là Đã xác nhận. Deploy fix server không lên được. |
| **Changes** | Cold-start và `fetchFreshByIds` giờ gọi thẳng `chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetView` với `$select=Id,Number,State,ShowState,StateCode,IsMergeCancel,...,SaleOnlineIds`, dùng `window.tokenManager.getAuthHeader()`. Bypass Render hoàn toàn cho 2 path này. |
| **Status** | ✅ |

### [orders] Mark "đã in phiếu soạn" — force CHO_HANG khi bật ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Why** | Click nút 🖨 (cell) hoặc bulk Phiếu Soạn Hàng khi đơn ở Cat 1/OKIE_CHO_DI_DON: `pickingSlipPrinted=true` đúng nhưng subState giữ OKIE → badge hiển thị "OKIE..." không phải "CHỜ HÀNG 🖨". |
| **Chi tiết** | `_ptagQuickAssign('print')` + `onPtagPackingSlipPrinted()`: khi bật mark, force `subState='CHO_HANG'` cho mọi đơn Cat 1 (không chỉ khi cat null/Cat 2). Khi tắt mark (chỉ nút cell), recompute subState từ tTags. Persistence khi xoá tTags rồi add lại đã sẵn (pickingSlipPrinted không reset). |
| **Status** | ✅ Done |

### [orders] Filter subtag — bỏ orphan subTag không khớp category ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Why** | Filter `subtag_BAN_HANG` ra 21 đơn nhưng nhiều đơn cat=1 (CHỜ ĐI ĐƠN) còn sót `subTag='BAN_HANG'` từ lúc ở cat 2 → cell render cat 1 hiển thị "CHỜ HÀNG" (bỏ qua subTag) → user tưởng filter đang bám TAG TPOS. |
| **Chi tiết** | `orderPassesProcessingTagFilter` + `_ptagComputeCounts` giờ require `data.category === PTAG_SUBTAGS[subKey].category` khi check subTag → loại bỏ orphan subTag từ category cũ. |
| **Status** | ✅ Done |

### [orders] Panel Chốt Đơn — filter chỉ theo Tag XL, bỏ TAG TPOS ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Why** | Flag `KHAC` (TAG TPOS NGOÀI MAPPING) trong panel scan `order.Tags` (cột TAG TPOS) → vi phạm yêu cầu panel Chốt Đơn chỉ filter theo cột Tag XL. |
| **Chi tiết** | `_ptagComputeCounts`: bỏ vòng lặp `getUnmanagedTPOSTagsFromOrder`, set `flagCounts['KHAC']=0`. `orderPassesProcessingTagFilter`: bỏ nhánh KHAC TPOS-resolution, flag filter giờ chỉ check `data.flags` (Tag XL state). |
| **Status** | ✅ Done |

### [orders] Tag ĐÃ RA ĐƠN — đổi trigger từ "PBH tạo thành công" sang "Status='Đơn hàng'" ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `tab1-table.js`, `tab1-fast-sale-invoice-status.js`, `tab1-sale.js`, `tab1-fast-sale-workflow.js` |
| **Why** | Trước đây tag XL `ĐÃ RA ĐƠN` (category 0 = HOAN_TAT) được set khi PBH tạo thành công. Nay tag phải bám theo trạng thái đơn (`order.Status === 'Đơn hàng'`) để chính xác hơn — kể cả khi user đổi status thủ công. |
| **Chi tiết** | Thêm `onPtagOrderStatusChanged(orderId, newStatus)` ở `tab1-processing-tags.js`: `'Đơn hàng'` → forward `onPtagBillCreated`; rời `'Đơn hàng'` mà category=HOAN_TAT → forward `onPtagBillCancelled` (rollback `previousPosition`). Thêm `backfillPtagFromOrderStatus()` chạy sau `loadProcessingTags()` để tag các đơn đã có Status='Đơn hàng' lúc load. Bỏ 3 trigger cũ `onPtagBillCreated` ở `tab1-sale.js` (×2) + `tab1-fast-sale-invoice-status.js`. Bỏ 2 trigger `onPtagBillCancelled` ở `tab1-fast-sale-workflow.js` (đã được thay bằng hook trong `updateOrderStatus`). Gắn hook mới ở `tab1-table.js#updateOrderStatus` (manual) và `tab1-fast-sale-invoice-status.js` (auto-update Nháp→Đơn hàng). |
| **Status** | ✅ Done |

### [orders] RT TPOS → cập nhật cả cột "Phiếu bán hàng TPOS" và "Trạng thái" ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js`, `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/css/tab1-orders.css` |
| **Why** | Khi WS `tpos:invoice-list-updated` về, chỉ refresh cột "Phiếu bán hàng TPOS"; cột "Trạng thái" vẫn đứng im theo Pancake → user thấy không nhất quán. |
| **Changes** | (1) `TPOSInvoiceSnapshotStore.fetchFreshByIds(ids)` — gọi `GET /api/tpos/fastsale-snapshot?ids=...` lấy snapshot fresh từ TPOS invoicelist OData. (2) `deriveStatusFromTPOS(snap)` — map ShowState/StateCode/IsMergeCancel → text+class (Đã hủy, Nháp, Đơn hàng, Đã đối soát, Đã thanh toán, Hoàn thành, Gộp/Hủy). (3) `refreshStatusCellsFor(soIds)` — re-render `td[data-column="status"]` UI-only, KHÔNG ghi `order.Status` về Pancake. (4) `handleInvoiceListUpdate` async: fetch fresh trước, fallback payload nếu fail, rồi gọi cả `refreshCellsFor` lẫn `refreshStatusCellsFor`. (5) CSS `.status-paid` + `.status-order.strong`. |
| **Status** | ✅ |

### [orders] Chặn tạo PBH khi đơn ở trạng thái "Đơn hàng" (single + bulk) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js`, `orders-report/js/tab1/tab1-fast-sale.js` |
| **Why** | Trạng thái `StatusText === 'Đơn hàng'` nghĩa là SaleOnline đã được chuyển sang đơn — tạo PBH thêm sẽ gây trùng. |
| **Changes** | Thêm điều kiện `StatusText === 'Đơn hàng' \|\| Status === 'Đơn hàng'` vào duplicate-guard ở `confirmAndPrintSale()` (single) và filter `fastSaleOrdersData` (bulk, line ~419). |
| **Status** | ✅ |

### [chat] Follow-up hardening: bump seq trước reset, stale-guard catch + loadMoreMessages ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js` |
| **A** | `switchConversationType` / `switchChatPage` reset state TRƯỚC khi bump `_chatLoadSeq` → load cũ vẫn pass `_isStale()` trong khoảng giữa. Đảo thứ tự: bump trước, reset sau. |
| **B** | `_loadMessages` catch block ghi error UI mà không check stale → fetch cũ throw sau khi user switch sẽ ghi đè UI conv mới. Thêm `if (_isStale()) return;` đầu catch. |
| **C** | `loadMoreMessages` thiếu stale guard → user switch page giữa lúc đang scroll-paginate, messages cũ bị prepend vào conv mới. Snapshot `_chatLoadSeq + convId + pageId` đầu hàm, bail sau await nếu mismatch. |
| **Status** | ✅ Done |

### [orders] Chống tạo PBH trùng ở nút "Tạo phiếu bán hàng" (single mode) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-sale.js` |
| **Why** | Bulk "Tạo nhanh PBH (F9)" có 4 lớp phòng vệ duplicate (dedupe modal, skip đơn đã `Đã xác nhận`/`Đã thanh toán`, dedupe `models[]` trước submit, flag `isSavingFastSale`). Single "Tạo phiếu bán hàng" CHỈ có check `button.disabled` → đơn đã có PBH vẫn có thể submit lần 2 (mở lại modal sau timeout / race). |
| **Changes** | `confirmAndPrintSale()`: (1) check `window.__isSavingSingleSale` flag in-flight; (2) guard `currentSaleOrderData.ShowState`/`State` đã `Đã xác nhận`/`Đã thanh toán`/`open` → bỏ qua + warning; (3) tra `window.InvoiceStatusStore.get(saleOnlineId)` (cùng logic bulk tab1-fast-sale.js:419); (4) `finally` reset flag. |
| **Status** | ✅ Cần manual test. |

### [shared][all] Đồng bộ typography toàn dự án ✅
| | |
|---|---|
| **Files** | `shared/css/typography.css` (mới), 52 HTML entry pages, ~20 CSS module files |
| **Why** | Typography phân mảnh: 12/30 trang load Inter, 18/30 fallback system. Body size 13–20px, weight 400–500, font-family lẫn lộn. User chốt: toàn dự án Inter 20px weight 600. |
| **typography.css** | Single source of truth, dùng `!important` cho `body { font-family/size/weight }`, headings dùng Manrope 700. Buttons/inputs `inherit`. |
| **Inject** | Script `/tmp/inject_typography.py` chèn `<link>` Google Fonts (Inter+Manrope) + `shared/css/typography.css` vào 52 entry HTML pages, đường dẫn relative tự tính theo depth, marker `<!-- typography:shared -->` chống re-inject. |
| **Cleanup** | Script `/tmp/clean_body_css.py` xóa `font-family/size/weight` trong rule `body{}` của 19 CSS module + 2 inline `<style>` (`tab-kpi-commission.html`, `order-management/index.html` — bỏ luôn `font-family: Segoe UI` cũ). Giữ `color/background/line-height/padding`. |
| **Loại trừ** | `n2store-extension/`, `pancake-extension/`, `render.com/`, `cloudflare-worker/`, `backups/`, `docs/plans/*.html`. |
| **Status** | ✅ Commit `9e588e01` (inject) + cleanup commit. Pushed. Cần verify visual ở các trang dùng Bootstrap/Tailwind (`customer-hub`, `tab3-product-assignment`) và `firebase-stats` dashboard. |

### [orders] Đồng bộ typography orders-report giống inbox ✅
| | |
|---|---|
| **Files** | `orders-report/main.html`, `orders-report/css/modern.css` |
| **Why** | Trang orders-report dùng Inter 14px, không có headline font, khác hẳn inbox (Inter 15px + Manrope headline) → cảm giác lệch khi chuyển tab. |
| **Changes** | main.html: thêm preconnect + link Google Fonts (Inter 400/500/600/700 + Manrope 600/700/800). modern.css: thêm `--font-body` / `--font-headline` trong `:root`, body dùng `var(--font-body)` + `font-size: 0.9375rem` (15px), thêm rule `h1–h6 { font-family: var(--font-headline) }`. |
| **Status** | ✅ Commit `4eb7b20e`, pushed. |

### [render][orders][extension] Cột "Phiếu bán hàng TPOS" → nguồn từ WS server thay extension ✅
| | |
|---|---|
| **Files** | `render.com/server.js`, `orders-report/js/tab1/tab1-tpos-invoice-snapshot.js`, `n2store-extension/content/tpos-interceptor.js` |
| **Why** | Trước đây snapshot FastSaleOrder phải chờ user mở trang TPOS invoicelist để extension intercept XHR. Server `n2store-fallback` thực ra đã treo TPOS chatomni hub và nhận event `FastSaleOrder` realtime — chỉ thiếu enrichment Number/ShowState/StateCode/SaleOnlineIds. |
| **Server** | `handleEvent()` thêm nhánh `eventType === 'FastSaleOrder'` → `scheduleFastSaleOrderEnrichment(Id)` (debounce 200ms, cache 5s). `flushFastSaleOrderEnrichment` gọi TPOS odata `GetView?$filter=Id eq ...` qua `tposTokenManager`, broadcast `tpos:invoice-list-updated` cùng schema cũ. Thêm REST `GET /api/tpos/fastsale-snapshot?since=<ms>|ids=...` (cache 30s) cho cold-start. |
| **Frontend** | `TPOSInvoiceSnapshotStore.init()` gọi `_coldStartFromServer()` (fire-and-forget) load 24h gần nhất, upsert + refresh cell. Handler WS `handleInvoiceListUpdate` không đổi. |
| **Extension** | Disable nhánh intercept `FSO_LIST_URL`/`FSO_BATCH_URL`. Tag-assigned interceptor giữ nguyên. Bump `v1.1.0`. |
| **Status** | ✅ Code xong, syntax OK. Cần deploy Render rồi smoke test (`curl /api/tpos/fastsale-snapshot?since=...`, treo WS verify `source:'server-enrich'`). |

### [chat] Hardening modal tin nhắn/bình luận: race + state-reset + dropdown sync + reconcile ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-core.js`, `orders-report/js/tab1/tab1-chat-realtime.js` |
| **Bug 2.2** | `switchConversationType` không reset reply/images → reply id của INBOX bị mang sang COMMENT, khiến `reply_comment` gửi với message_id sai. Fix: gọi `_resetTransientChatState()` trước khi find conv mới. |
| **Bug 2.1** | `switchChatPage` tương tự — không reset `currentReplyMessage`, `pendingImages`, `currentChatCursor`, `allChatMessages`. Fix: dùng cùng helper. |
| **Bug 3.1** | Multi-page fallback trong `_findAndLoadConversation` silently override `currentChatChannelId` mà KHÔNG sync `#chatPageSelect.value` → dropdown lệch state thật. Fix: set `sel.value = convPageId` khi drift. |
| **Bug 1.1** | Switch page/type nhanh → fetch cũ resolve sau fetch mới và ghi đè state. Fix: thêm monotonic `window._chatLoadSeq`, mỗi entry point (`openChatModal`, `switchChatPage`, `switchConversationType`) bump `++seq` lấy `myToken`, truyền xuống `_findAndLoadConversation` + `_loadMessages`, check `loadToken !== _chatLoadSeq` ở mọi điểm trước-write-state. `closeChatModal` cũng bump seq để huỷ in-flight. |
| **Bug 4.3** | Optimistic private-reply id `pr_<ts>` không bao giờ reconcile với id thật từ Pancake → duplicate hiển thị + PrivateReplyStore stale 7 ngày. Fix: trong `handleNewMessage` (realtime) và `_loadMessages` (sau fetch), match shop message theo (text + 60s window) để drop optimistic và migrate `PrivateReplyStore.mark` sang real id. |
| **Helper mới** | `_resetTransientChatState()` (dùng chung), `window._chatLoadSeq` (monotonic). |
| **Status** | ✅ Done |

### [orders] Filter tab1 persist vào IndexedDB, per-account ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-filter-persistence.js` (NEW), `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-init.js`, `orders-report/js/tab1/tab1-search.js`, `orders-report/js/tab1/tab1-tags.js`, `orders-report/js/tab1/tab1-processing-tags.js` |
| **Mục tiêu** | Hard reload (Cmd+Shift+R) phải restore lại toàn bộ filter tab1, scope theo tài khoản đang đăng nhập. |
| **Filter cover** | (1) Search input — TTL 30 phút idle thì tự reset; (2) `conversationFilter`/`statusFilter`/`fulfillmentFilter` `<select>` (trước đây memory-only → mất khi reload); (3) TAG `orderTableSelectedTags`; (4) Excluded TAG `orderTableExcludedTags`; (5) Chốt Đơn / Tag XL = `ProcessingTagState._activeFilter` + `_activeFlagFilters`; (6) Chốt Đơn panel pinned; (7) "Lọc theo ngày" toggle (`dateModeToggle`). Date range start/end vẫn để campaign system quản lý qua PostgreSQL — không đụng để tránh phá campaign flow. |
| **Kiến trúc** | Module mới `FilterPersistence` (IIFE expose `window.FilterPersistence`) wrap `window.indexedDBStorage`. Key IDB: `tab1_filters_v1__${userIdentifier}` với `userIdentifier` resolve từ `authManager.getAuthState()` (priority `userType` → `username` → `uid` → `'guest'`). Snapshot debounce save 400ms. Init `await` trong DOMContentLoaded của tab1-init.js trước khi wire search input listener. |
| **Migration LS → IDB** | First run: nếu IDB trống cho user này, đọc các LS key cũ làm seed. **Per-account guard:** `tab1_filter_persist_migrated_at` global LS marker — chỉ user đầu tiên trên browser inherit LS, các account sau bắt đầu snapshot rỗng → isolation 100%. Sau 7 ngày tự xóa legacy LS keys + marker (giữ tuần đầu để rollback an toàn). |
| **Search TTL** | Snapshot search có `savedAt`; load lại nếu `Date.now() - savedAt > 30 phút` → drop search query, giữ filter khác — tránh user reload lâu mà bị filter cũ gây nhầm. |
| **Wire save** | `scheduleSave()` được gọi từ: `handleTableSearch()`, 3 select onchange (HTML inline), `saveSelectedTagFilters()`, `saveExcludedTagFilters()`, `_ptagPersistFilters()`, `_ptagTogglePin()`, `dateModeToggle` onchange. Không xóa logic LS hiện hữu — IDB là sync layer phụ. |
| **Status** | ✅ Done |

### [orders] Auto-chọn ship theo địa chỉ: pass extraAddress + dedupe + notify ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-fast-sale.js`, `orders-report/js/utils/sale-modal-common.js` |
| **Chi tiết** | Fast Sale (tạo nhiều phiếu) trước đây gọi `smartSelectCarrierForRow(select, address, null)` — bỏ qua structured `ExtraAddress` từ Pancake/TPOS → kém chính xác khi địa chỉ text mơ hồ. **(2)** Truyền `saleOnlineOrder?.ExtraAddress \|\| order.Ship_Receiver?.ExtraAddress \|\| order.Partner?.ExtraAddress` vào auto-select (cả lúc mở modal lẫn lúc edit địa chỉ inline). **(1)** Refactor: `smartSelectDeliveryPartner(address, extraAddress, {select, silent})` trong sale-modal-common.js giờ nhận `select` + `silent` qua options và trả về `{matched, fallback, name}`; `smartSelectCarrierForRow` rút gọn thành thin wrapper (xoá ~30 dòng duplicate logic). **(3)** Thêm notification thống nhất: bulk dùng `silent:true` per-row + 1 toast tổng kết `"Tự động chọn ship: X/Y khớp · Z fallback"` sau khi xong loop; address-edit inline dùng `silent:false` (1 user action → 1 toast). |
| **Status** | ✅ Done |

### [orders] In hàng loạt phiếu bán hàng (bulk print PBH) ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/tab1/tab1-table.js`, `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` |
| **Chi tiết** | Thêm nút **"In hàng loạt PBH"** (tím, `fa-print`) vào toolbar `actionButtonsSection`, hiện khi có ≥1 đơn được tick **và** đơn đó đã có PBH (check qua `InvoiceStatusStore.get`). Handler `bulkPrintSelectedBills()` gom selection: đơn có `inv.Id` → push vào `tposOrders` rồi gọi `window.openCombinedTPOSPrintPopup(orders, headers)` (template TPOS chính thức 80mm); đơn không có TPOS Id → fallback `window.openCombinedPrintPopup(orders)` (custom HTML). Skip + warning các đơn chưa có PBH. **Reuse 100% logic in có sẵn** trong [bill-service.js](orders-report/js/utils/bill-service.js) — chỉ wire UI + selection filtering, ~80 dòng code. |
| **Status** | ✅ Done |

### [orders] Lịch sử Tag T: thêm ô lọc theo STT ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Modal "Lịch Sử Tag T Chờ Hàng" giờ có input lọc STT. Cache `historyArray` vào `window._ttagMgrHistoryCache`, hàm `_ttagMgrFilterHistory(q)` lọc các entry chứa STT khớp (cả success/failed), giữ nguyên tag name, recompute summary counts. Tách `_ttagMgrRenderHistoryList()` để re-render. |

### [chat] Tooltip hàng rớt-xả: bỏ SĐT, thêm "Chiến dịch:" + fix 2 bug ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/dropped-products-manager.js`, `orders-report/js/chat/chat-products-actions.js` |
| **Tooltip** | Bỏ dòng SĐT (không lưu DB), đổi nhãn "Live:" → "Chiến dịch:" lấy fallback từ `currentChatOrderData.LiveCampaignName` / `campaignInfoFromTab1.activeCampaignName`. Revert propagate `removedFromCustomerPhone`. |
| **Bug B** | `Uncaught ReferenceError: grid is not defined` spam mỗi mousemove. Nguyên nhân: handler `contextmenu` lồng nhầm trong `_positionHoverPreview` (sót pre-existing). Đã chuyển ra cuối `_wireDroppedGrid()` — vừa hết error vừa wire đúng right-click → gửi tên SP vào chat. |
| **Bug A** | Xóa SP "đang giữ" không persist (F5 vẫn còn). `deleteHeldProduct` còn gọi `removeHeldFromFirebase` cũ — đã đổi sang `window.removeHeldProduct(productId)` (gọi `DELETE /api/realtime/held-products/{orderId}/{productId}/{userId}`), giữ fallback Firebase. |
| **Status** | DONE |

### [issue-tracking] Tách tìm kiếm Tạo Phiếu thành 2 tab: SĐT/Tên & Mã đơn ✅
| | |
|---|---|
| **Files** | `issue-tracking/index.html`, `issue-tracking/css/style.css`, `issue-tracking/js/script.js`, `shared/js/api-service.js` |
| **Chi tiết** | Modal "Tạo Phiếu Mới" trước chỉ search theo `Phone`. Thêm 2 tab: **SĐT/Tên** (auto detect: toàn chữ số → `contains(Phone,...)`, ngược lại strip dấu tiếng Việt → `contains(PartnerNameNoSign,...)`) và **Mã đơn** (`contains(Number,...)`). 1 input + 1 nút Tìm, placeholder đổi theo tab. `ApiService.searchOrders` refactor sang signature `{mode, value}` với `mode ∈ {phone\|name\|code}`, giữ backward-compat khi nhận string (legacy call ở `script.js:2649`). Escape `'` trong OData literal. Date range 60 ngày + `$top=20` giữ nguyên. |
| **Status** | ✅ Done |

### [orders] Fix Tag XL filter (Chốt Đơn) bị mất khi tương tác bảng + persist localStorage ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Bug** | User filter "ĐƠN CHƯA PHẢN HỒI" (116 rows) → tương tác bảng (click/edit) → filter biến mất, hiện lại 5364 rows. |
| **Root cause** | `loadProcessingTags()` line 373 unconditionally `_activeFilter = null`, bị polling 15s (`_ptagStartPolling`) gọi → wipe user filter state. Filter chỉ lưu in-memory, không persist như TAG thường. |
| **Fix** | (1) Bỏ `_activeFilter = null` trong `loadProcessingTags`. (2) Persist `_activeFilter` + `_activeFlagFilters` vào localStorage (`ptag_active_filter_v1`, `ptag_active_flag_filters_v1`); init từ localStorage trong State; helper `_ptagPersistFilters()` gọi trong `_ptagSetFilter` / `_ptagToggleFlagFilter` / `_ptagToggleGiuDonQuaLay`. (3) Sau load nếu `hasActiveProcessingTagFilters()` → call `performTableSearch()` để re-apply filter cho data mới. |
| **Status** | ✅ Done |

### [docs] Phân tích chi tiết PDF OnCallCX UCaaS v1.1 ✅
| | |
|---|---|
| **Files** | `orders-report/oncallcx-ucaas-analysis.md` (new) |
| **Chi tiết** | Đọc đầy đủ 75 trang PDF `orders-report/oncallcxucaasuserguidevieforcustomerv112 (2).pdf` (FPT Telecom OnCallCX UCaaS user guide v1.1, tiếng Việt) và xuất ra phân tích markdown có cấu trúc lại theo 10 mục: §1 PBX Portal/Login, §2 Departments + Extensions (kèm bảng Call Forwarding codes đầy đủ CFU/CFF/CFNR/CFB/CFO/Reset), §3 SIP provisioning (3 mode: Auto-MAC / URL .xml / Manual credentials) + Re-Provisioning, §4 Routing (Timetables/Holidays + ACD methods Linear/Cyclic/Parallel + IVR menu/rule + regex patterns), §5 Conference Rooms (`*72` + 2 phương án external access), §6 anConnect/anMeet, §7 CDR statistics, §8 MS Teams plugin + Desktop app, §9 Cheatsheet tổng hợp service codes (`*21` `*26` `*67` `*72` `*76` `*78` `*86` `*99` `*481`...), §10 10 pitfalls quan trọng (đáng chú ý: `Queue Size=0 AND Queue Timeout=0` → fallback never triggered; mất Encryption Password = mất hết tin nhắn anConnect; xoá extension giữ CDR nhưng mất voicemail; "User defined" ACD method PDF ghi rõ KHÔNG dùng). Plan file: `~/.claude/plans/wise-snacking-trinket.md`. |
| **Status** | ✅ Done |

---

## 2026-04-07

### [orders] Conversation filter null-guard ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-search.js` |
| **Chi tiết** | Phát hiện khi chạy verify-chotdon-panel.js harness: `_applyFiltersExceptProcessingTag` crash `TypeError: Cannot read properties of null (reading 'hasUnread')` khi đổi `conversationFilter` sang `unread`. `pancakeDataManager.getMessageUnreadInfoForOrder(order)` / `getCommentUnreadInfoForOrder(order)` có thể trả null cho một số order. Fix null-guard: `const hasUnreadMessage = !!(msgUnread && msgUnread.hasUnread);`. Harness sau fix: 6/6 PASS. |

### [orders] Chốt Đơn panel: realtime re-render khi TPOS/Firebase mutate data + robust open check ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/js/tab1/tab1-tpos-realtime.js`, `orders-report/js/tab1/tab1-firebase.js`, `orders-report/debug/verify-chotdon-panel.js` (new) |
| **Chi tiết** | Mở rộng fix commit trước (`a4efdac9`). Debug session với user phát hiện panel vẫn stale counts trong 3 scenario realtime mà pipeline filter chạy OK nhưng không có ai trigger re-render panel: (1) TPOS `handleOrderUpdate` → `updateOrderInTable` mutate `allData` field-level, (2) TPOS `handleTagAssigned` → same, (3) Firebase `child_changed/child_added` → `updateTagCellOnly` mutate Tags. Cả 3 đều thiếu call `_ptagRenderPanelIfOpen`. Fix: add call vào cuối mỗi handler. Ngoài ra làm `_ptagRenderPanelIfOpen` robust hơn: dùng `ProcessingTagState._panelOpen` state làm primary check, `classList.contains('open')` làm fallback (tránh edge case CSS animation remove class tạm thời). **Verification harness**: tạo `orders-report/debug/verify-chotdon-panel.js` — paste vào Console (top frame), tự động find iframe tab1, snapshot filter state, chạy 6 test case (baseline, search, status, search+status, fulfillment, conversation), so sánh `panel TỔNG == getOrdersBeforeProcessingTagFilter().length`, restore state, báo PASS/FAIL ra `console.table`. Ghi chú: race condition trong `_ptagSetFilter` (render trước performTableSearch 50ms) không phải bug — counts panel độc lập với processing tag filter nên immediate render không làm flicker counts, chỉ update active highlight. Skip sửa chỗ đó. |

### [wallet-adjust] Hiển thị rõ điều chỉnh ví v2 — enrich Node-side, không JOIN cast ✅
| | |
|---|---|
| **Files** | `render.com/routes/v2/customers.js`, `render.com/routes/v2/wallets.js`, `render.com/routes/v2/balance-history.js`, `orders-report/js/tab1/tab1-wallet-modal.js`, `customer-hub/js/modules/customer-profile.js`, `customer-hub/js/modules/wallet-panel.js`, `balance-history/js/accountant.js` |
| **Chi tiết** | Plan v1 (4 commit đã revert) dùng JOIN SQL với cast `wt.reference_id::int` → PG không short-circuit AND → 500 trên `/v2/customers/:id`. **Plan v2**: enrich ở Node, không cast SQL. Backend mỗi endpoint giữ SQL gốc, sau khi fetch lọc các row `type='ADJUSTMENT' AND reference_type='balance_history' AND /^\d+$/`, query phụ `wallet_adjustments WHERE original_transaction_id = ANY($1::int[])` (PG array cast chuẩn, không bao giờ crash), merge thêm `counterparty_phone`/`adjustment_reason`/`adjusted_by`/`adjusted_at`/`wrong_customer_phone`/`correct_customer_phone`. Tất cả enrich block bao bọc try/catch riêng — nếu lỗi vẫn trả row gốc, không 500. `balance-history.js` approved-list thêm query phụ thứ 2 lấy 2 leg `wallet_transactions` (balance_before/after) cho tooltip kế toán. **Frontend** (4 file): dấu/màu/icon theo `Math.sign(tx.amount)` cho ADJUSTMENT (override config cứng), label động "Nhận Điều Chỉnh Từ SĐT X" / "Điều Chỉnh Chuyển Sang SĐT Y", thêm dòng "Điều chỉnh ví sai SĐT: chuyển từ X → Y (+/- N)", "Lý do: ...", "Điều chỉnh bởi ...". Tooltip kế toán multi-line từ `adjustment_legs`. **Tuyệt đối không động vào logic dòng tiền** (`balance-history.js:1716-2030`). |
| **Status** | ✅ Done |

### [chat] Modal chat — fallback Extension cho mọi lỗi + enrich convData (giống bulk send) ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-messages.js` |
| **Chi tiết** | Trước: `_sendInbox` chỉ fallback extension khi `is24HourError` hoặc `isUserUnavailable (#551)`, và build convData chỉ bằng `buildConvData()` 1 lần (cache rỗng → "Không tìm được Global Facebook ID"). Bulk send (message-template-manager) thì fallback mọi lỗi + tự `fetchMessages` lấy `thread_id`/`global_id` + retry với `buildConvData`. **Fix**: (1) Bỏ điều kiện `is24HourError/isUserUnavailable` — fallback extension cho **mọi** lỗi Pancake (chỉ cần extension connected). Toast hiển thị reason theo loại lỗi. (2) Trước khi gọi `sendViaExtension`, enrich convData giống bulk send: `pdm.fetchMessages(pageId, convId)` → lấy `conversation.thread_id` + `page_customer.global_id` + `customers[]`; fallback từ cache (`inboxMapByPSID`/`currentConversationData`); fallback global_id từ `customers[].global_id`. (3) Retry với `window.buildConvData()` nếu extension fail vì Global Facebook ID. Pattern copy từ `message-template-manager.js:1038-1136`. |
| **Status** | ✅ Done |

### [orders][inbox] Global ID Harvester — auto push global_id từ Pancake responses lên Render cache ✅
| | |
|---|---|
| **Files** | `orders-report/js/managers/global-id-harvester.js` (mới), `orders-report/js/managers/pancake-data-manager.js`, `inbox/js/inbox-pancake-api.js`, `orders-report/tab1-orders.html`, `inbox/index.html`, `don-inbox/index.html` |
| **Chi tiết** | Module mới `GlobalIdHarvester` extract `global_id` từ `customers[]` (và `page_customer.global_id`) trong response Pancake `fetchConversations`/`fetchMessages`, dedupe theo `pageId:psid` trong session, fire-and-forget `PUT https://n2store-fallback.onrender.com/api/fb-global-id`. Hook vào `pancake-data-manager.js` (`fetchConversations`, `fetchConversationsForPage`, `fetchMessages`) và `inbox-pancake-api.js` (cùng 3 hàm). Thêm `<script>` load harvester trước data-manager ở tab1-orders.html, inbox/index.html, don-inbox/index.html. Mỗi user mở conversation → mappings tự động được đẩy vào DB cache shared, bypass 6 strategies extension trong tương lai. Sanity check: bỏ qua khi `psid === globalId`. |
| **Status** | ✅ Done |

### [chat] Paste ảnh vào modal chat khi focus ngoài input ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-chat-images.js` |
| **Chi tiết** | Handler `paste` cũ chỉ fire khi `chatInput` đang focus → user click panel sản phẩm/message list rồi Cmd+V không bắt được. Thêm fallback keydown Cmd/Ctrl+V ở document: nếu modal mở và focus KHÔNG ở editable element, gọi `navigator.clipboard.read()` lấy image blob đẩy vào `addImageToPreview()` rồi auto-focus lại `chatInput`. |
| **Status** | ✅ Done |

### [orders] Tab "Hàng rớt - xã" — redesign sang image grid 5 cột + drag-select ✅
| | |
|---|---|
| **Files** | `orders-report/tab1-orders.html`, `orders-report/js/managers/dropped-products-manager.js`, `orders-report/css/tab1-chat-modal.css` |
| **Chi tiết** | Đổi UI tab "Hàng rớt - xã" trong chat modal Tab1 từ table (Ảnh/SP/SL/Giá/Thao tác) sang **image grid 5 cột chỉ ảnh**, hover phóng to scale 1.5. Bỏ dropdown campaign "T6 vèo vèo", thay bằng search bar (lọc theo tên/code) + 6 pills lọc nhanh ALL/Áo/Quần/Set/GIÀY/PK (detect category từ ProductName). **Selection**: click ảnh hoặc nhấn-giữ-rê chuột (drag-paint) qua nhiều ảnh — toggle theo trạng thái ô đầu tiên (add/remove mode). 2 nút floating bottom-right: **GỬI ĐƠN** (loop `moveDroppedToOrder` cho từng id chọn) và **HỦY/XÓA** (confirm 1 lần, loop `removeFromDroppedProducts` với flag skipConfirm mới). State module-level: `_droppedSearchText`, `_droppedCategoryFilter`, `_droppedSelectedIds`, `_droppedDragging`, `_droppedDragMode`. Thêm helpers `_detectDroppedCategory`, `_wireDroppedToolbar`, `_wireDroppedGrid`, `_updateDroppedFabState`, global `mouseup`/`mouseleave` reset drag. Item Quantity=0 → cell `.held` opacity 0.4 không chọn được. Right-click cell → `sendProductToChat`. Code legacy table+searchUI giữ trong block `/* LEGACY_REMOVED_START ... LEGACY_REMOVED_END */`. CSS thêm `.dropped-toolbar/.dropped-search/.dropped-pills/.dropped-grid/.dropped-cell[.selected/.held]/.dropped-floating-actions/.dropped-fab`. **Verification**: `node --check` OK. |
| **Status** | ✅ Done |

### [issue-tracking] Filter loại — đổi dropdown thành tab pills (và filter thật sự) ✅
| | |
|---|---|
| **Files** | `issue-tracking/index.html`, `issue-tracking/css/style.css`, `issue-tracking/js/script.js` |
| **Chi tiết** | Dropdown `#filter-type` ở filters-bar dashboard (Tất cả loại / Không Nhận Hàng / Thu về (Shipper) / Khách gửi / Sửa COD) chuyển thành dãy tab pill `#type-tabs` với `data-type`. Phát hiện thêm: dropdown cũ chưa từng được JS đọc → filter loại trước nay không hoạt động. Thêm CSS `.type-tabs/.type-tab-btn` (pill, active = primary). `initTabs()` gắn click handler: toggle active, giữ search term + active main tab rồi gọi `renderDashboard()`. `renderDashboard()` đọc `data-type` của tab active và filter `t.type` trước bước search. History tab vẫn dùng `#history-filter-type` riêng. |
| **Status** | ✅ Done |

### [inbox] Fix "Partner is null" khi xác nhận sale từ Đơn Inbox ✅
| | |
|---|---|
| **Files** | `don-inbox/js/tab-social-sale.js` |
| **Chi tiết** | TPOS `InsertListOrderModel` reject với `Partner is null.` khi bấm Xác nhận và in (F9) trong modal sale từ Đơn Inbox. Root cause: `buildSaleOrderModelForInsertList()` (tab1-sale.js:1537) đọc `currentSalePartnerData` để build object Partner, nhưng flow social không bao giờ set biến này → Partner.Id=0, TPOS từ chối. Fix: trong `openSaleModalInSocialTab()` sau khi set `currentSaleOrderData`, gọi `window.fetchTPOSCustomer(phone)` (shared/js/tpos-customer-lookup.js, đã load sẵn trong index.html) → map customer trả về thành shape PascalCase (`Id`, `Name`, `DisplayName`, `Street`, `Phone`, `StatusText`, `Customer`, `Type`, `CompanyType`) gán vào `currentSalePartnerData` và đồng bộ `mappedOrder.PartnerId`. Không tìm thấy KH hoặc thiếu phone → notification cảnh báo. |
| **Status** | ✅ Done |

### [extension] Popup — sync version từ manifest (fix hardcode v1.0.0) ✅
| | |
|---|---|
| **Files** | `n2store-extension/popup/popup.js` |
| **Chi tiết** | User báo popup hiển thị `v1.0.0` trong khi manifest đã là `1.0.3`. Root cause: `popup.html` hardcode `<span id="version">v1.0.0</span>`, không có code nào sync từ manifest. Fix: trong `DOMContentLoaded` của `popup.js` thêm `chrome.runtime.getManifest().version` → set `#version` textContent thành `v{version}` (try/catch defensive). Tự động sync mọi lần bump version sau này. |
| **Status** | ✅ Done |

### [inbox] Trạng thái filter — chuyển dropdown thành tab pills ✅
| | |
|---|---|
| **Files** | `don-inbox/index.html`, `don-inbox/css/don-inbox.css` |
| **Chi tiết** | User không thấy "Đơn đã hủy" vì nó nằm trong dropdown Trạng thái. Chuyển `<select id="statusFilter">` thành 4 tab pills (Tất cả / Nháp / Đơn hàng / Đã hủy) trong `#statusFilterTabs`. Giữ hidden `<select id="statusFilter">` để tương thích với code hiện tại đọc `statusFilter.value` (performTableSearch, etc.). Click handler inline ở cuối body sync giá trị + active class + gọi `performTableSearch()`. CSS pill style: bg `#f3f4f6`, active = white + tím `#8b5cf6` + shadow nhẹ. |
| **Status** | ✅ Done |

### [inbox] Fix Hủy đơn — global `confirmCancelOrder` collision với tab1 ✅
| | |
|---|---|
| **Files** | `don-inbox/js/tab-social-table.js` |
| **Chi tiết** | Click ban icon ở row → toast "Vui lòng nhập lý do hủy đơn" nhưng không có modal/input. **Root cause**: `don-inbox/index.html` load `tab1-fast-sale-workflow.js` SAU `tab-social-table.js`, tab1 ghi đè `window.confirmCancelOrder` bằng version index-based đọc `#cancelReasonInput` từ modal không tồn tại trong flow row → reason rỗng → warning. **Fix**: Tạo alias namespaced `window.socialConfirmCancelOrder = confirmCancelOrder`, đổi onclick row button (line 155) sang gọi `socialConfirmCancelOrder('${order.id}')` để tránh collision hoàn toàn. Tab1 modal vẫn dùng global `confirmCancelOrder` của nó như cũ. |
| **Status** | ✅ Done |

---

## 2026-04-06

### [orders] Per-row history popover — show STT + tên + SĐT + mã đơn ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/css/tab1-processing-tags.css` |
| **Chi tiết** | User feedback popover lịch sử per-row hiện chỉ thấy time + STT/code (truncated) + user + sign + label → khó nhận ra đơn nào. Yêu cầu thêm STT, tên KH, SĐT. **Fix**: (1) `_ptagAggregateAllHistory()` — enrich `orderLookup` Map với 4 field thay vì 2: `stt: o.STT \|\| o.Stt \|\| o.SessionIndex`, `code`, `name: o.PartnerName \|\| o.Name`, `phone: o.Telephone`. Mỗi entry kèm thêm `orderName` + `orderPhone`. (2) `_ptagShowRowHistory()` row template chuyển từ 1-row grid 5 cột → block 2-line: row1 (grid cũ: time / STT / user / sign / label), row2 (flex: name · phone · code) — chỉ hiển thị field nào có data, dùng `<span class="ptag-rh-sep">·</span>` separator. Title attr cũng enrich với code+name+phone+action+label cho hover full info. (3) CSS `.ptag-rh-item` đổi `display: grid` → `display: block`, tách `.ptag-rh-row1` (giữ grid 5 cột cũ) + `.ptag-rh-row2` mới (flex, padding-left 81px để align với cột STT, font 10.5px gray). `.ptag-rh-name` weight 500 dark gray max-width 140px ellipsis, `.ptag-rh-phone` tabular-nums gray, `.ptag-rh-code` mono font 10px lighter. (4) Bump popover từ 340×420 → 380×460 (rộng hơn để fit name + phone + code line 2). Update `popW` trong logic position. **Verification**: `node --check` OK. **Limitation**: Đơn không nằm trong list visible hiện tại sẽ không có name/phone (chỉ có code) — vì lookup phụ thuộc `window.getAllOrders()`. |
| **Status** | ✅ Done |

### [orders] Sync v3 `_findOrCreateTPOSTag` — `$filter` query thay vì pagination cap ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-tag-sync.js` |
| **Chi tiết** | Sau khi fix `ensureMergeTagExists` (commit `c551a4b9`), user merge thành công nhưng phát hiện **bug giống hệt** ở forward sync v3: `[TAG-SYNC-V3] Creating new TPOS tag "CHỜ ĐI ĐƠN (OKE)"...` → `POST /api/odata/Tag 400 ()`. Tag `CHỜ ĐI ĐƠN (OKE)` đã tồn tại trên TPOS (Id 99163) nhưng `_findOrCreateTPOSTag` không tìm thấy → POST → server reject. **Root cause**: `_findOrCreateTPOSTag` (cũ) chỉ có 3 step: (1) cache lookup, (2) reload qua `loadAvailableTags()` / `fetchAllTagsWithPagination()`, (3) POST create. Mặc dù step 2 có pagination (đã thấy log `Pagination complete: 1373/1373 tags fetched`), reload là **expensive** (gọi multiple HTTP request) → trong race condition + cache stale, có thể vẫn miss tag. Fallback sau 400 hiện tại phụ thuộc vào việc reload thành công lần 2 trong block recovery — không guarantee. **Fix**: Refactor `_findOrCreateTPOSTag` thành **4-step lookup** mirror pattern của `ensureMergeTagExists`: (1) **Local cache** (`window.availableTags`, dùng `_normalizeName()` case-insensitive). (2) **OData `$filter` query** qua helper mới `_queryTPOSTagByName(name)` — escape single quote `'` → `''`, build expr `Name eq '...'`, `encodeURIComponent`, `$top=5`, dùng `window.API_CONFIG.smartFetch` → cache trên cache, không phụ thuộc pagination. (3) **Full reload** `loadAvailableTags()` / `fetchAllTagsWithPagination()` (last resort trước khi tạo mới — preserve behavior cũ). (4) **POST create** với recovery: nếu trả `400` → re-query qua `_queryTPOSTagByName` 1 lần để recover (handle race condition). Mỗi success path sync vào `window.availableTags` + `cacheManager.set('tags', ...)`. **Behavior preservation**: Return signature giữ nguyên, error path return `null` như cũ (caller `_callAssignTag` handle). **Verification**: `node --check` syntax OK. Sau fix: scenario "tag CHỜ ĐI ĐƠN (OKE) ngoài top 1000 cache" → STEP 2 `$filter` tìm thấy ngay → return → sync flow tiếp tục, không POST nhầm, không 400 trong console. |
| **Status** | ✅ Done |

### [orders] Fix `ensureMergeTagExists` — `$filter` query thay vì `$top=1000` ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge.js` |
| **Chi tiết** | User merge cluster STT 4/6/73 thành công (products + Tag XL OK) nhưng tag assignment cho TPOS column FAIL với error `400 "Đã tồn tại tag"` khi tạo `"Gộp 4 6 73"`. **Root cause**: `ensureMergeTagExists` (cũ) fetch full list `$top=1000` rồi search client-side. TPOS DB đã có >1000 tag (từ các merge group cũ tích lũy) → tag `"Gộp 4 6 73"` (tạo từ lần merge trước, hoặc bởi user khác) nằm ngoài top 1000 → local search trả null → POST tạo mới → server reject với `400 BusinessException "Đã tồn tại tag"` → throw → cả `assignTagsAfterMerge` fail → target order không nhận được TPOS tag merged. **Fix**: Refactor `ensureMergeTagExists` thành **4-step lookup**: (1) **Local cache** (`availableTags`, case-insensitive) — fast path. (2) **OData `$filter` query** qua helper mới `queryTPOSTagByName(tagName)` — escape single quote `'` → `''`, build expr `Name eq '...'`, `encodeURIComponent`, `$top=5` → targeted, không bị giới hạn pagination, scale với DB lớn. (3) **POST tạo mới** nếu vẫn không tìm thấy. (4) **Recovery**: Nếu POST trả `400` với body match `/tồn tại\|exist/i` → re-query qua `queryTPOSTagByName` 1 lần để lấy tag từ server (handle race condition khi tag được tạo bởi user khác giữa STEP 2 và STEP 3). **Helper mới `_registerLocalTag(tag)`**: Sync tag vào `availableTags` + `cacheManager` + Firebase `settings/tags`. Idempotent — skip nếu Id đã có. **Behavior preservation**: Return signature giữ nguyên (`{Id, Name, Color, ...}`), error path vẫn throw để caller `assignTagsAfterMerge` handle. **Verification**: `node --check` syntax OK. Sau fix: scenario "Gộp 4 6 73 đã tồn tại" → STEP 2 `$filter` tìm thấy → return ngay → assignTag flow tiếp tục thành công. |
| **Status** | ✅ Done |

### [orders] Per-row history popover — nút clock trên từng row panel Chốt Đơn ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js`, `orders-report/css/tab1-processing-tags.css` |
| **Chi tiết** | User yêu cầu mỗi row trong panel Chốt Đơn (substate, flag, subtag, T-tag) có nút riêng để xem lịch sử thêm/xóa tag đó ở đơn nào. **Implementation**: (1) Helper inline `_rowHistoryBtnHtml(rowType, rowId)` (line 1869-1875) generate button 20×20px với icon `fa-clock-rotate-left`, escape single quotes trong rowId. (2) Chèn button vào 5 nơi trong `renderPanelContent()`: substate row (line 2073, type='substate'), built-in flag row (line 2101, type='flag'), custom flag row dưới KHÁC (line 2125, type='flag'), subtag row (line 2160, type='subtag'), T-tag row (line 2195, type='ttag'). Tất cả button có `event.stopPropagation()` để không trigger row click filter. (3) Section mới SECTION 10D `PER-ROW HISTORY POPOVER` (line 4793-4905) với 3 function: `_ptagMatchRowHistoryEntry(entry, rowType, rowId)` filter logic — substate match `SET_CATEGORY` value `1:*` + `ADD_TTAG`/`REMOVE_TTAG`/`TRANSFER_*` (vì substate auto-derive từ tTags count, không log riêng); flag match `ADD_FLAG`/`REMOVE_FLAG` value === rowId; subtag match `SET_CATEGORY` value `cat:subTag`; ttag match `ADD_TTAG`/`REMOVE_TTAG` value === rowId. `_ptagGetRowHistoryTitle()` resolve label từ enum (`PTAG_SUBSTATES`, `PTAG_FLAGS`, custom flag, `PTAG_SUBTAGS`, T-tag def name). `_ptagShowRowHistory(rowType, rowId, anchorEl)` aggregate qua `_ptagAggregateAllHistory()` (đã có), filter, take top 20, render popover. Mỗi item: time DD/MM HH:MM + STT/Code + user + sign (+/-/←/→) + label. Nếu > 20 entries → hiển thị footer "+N mục cũ hơn — bấm clock ở header để xem hết". (4) Position popover smart: align right edge với button, flip up nếu vượt viewport, clamp left/right. Close on outside click (skip nếu click vào anchorEl để tránh re-open). (5) CSS mới `.ptag-row-history-btn` (20×20px, gray border, hover xanh) + `.ptag-row-history-popover` (340×420px, header tím gradient, grid 5 cột) trong `tab1-processing-tags.css` (line 2107-2237). Sign colors: add green, remove red, auto blue. (6) Window export `_ptagShowRowHistory`. **Substate edge case**: OKIE_CHO_DI_DON và CHO_HANG đều show cùng dataset (vì substate transitions không log riêng, chỉ derived từ tTags count). User vẫn thấy được toàn bộ activity trong category 1 — đủ context để hiểu order nào vừa vào CHỜ ĐI ĐƠN, order nào vừa được gán T-tag (→ chuyển sang CHỜ HÀNG). |
| **Status** | ✅ Done |

### [orders] Modal gộp đơn — preview "Sau Khi Gộp" hiển thị merged tags pills ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge.js` |
| **Chi tiết** | User báo bug — modal "Gộp Sản Phẩm Đơn Trùng SĐT" cột **"Sau Khi Gộp (STT XX)"** trống không có tag pills nào, trong khi các cột STT nguồn/đích bên cạnh vẫn render đầy đủ tag pills. → Không xem trước được kết quả merge tags trước khi click "Xác nhận Gộp Đơn". **Root cause**: `renderClusterCard` (line 687-689) chỉ render text `Sau Khi Gộp` cho header `merged-col` mà không có logic compute merged tags. Logic merge tag thật ở `assignTagsAfterMerge` (line 1571) chỉ chạy SAU khi user xác nhận → preview hoàn toàn không tồn tại ở client-side. **Fix**: (1) Thêm pure helper `calculateMergedTagsPreview(cluster)` (sau `getOrderTagsArray` ~line 1527, ~50 dòng) — mirror exact filter + dedup logic của `assignTagsAfterMerge`: (a) `shouldExcludeTag()` filter `MERGED_ORDER_TAG_NAME` ('ĐÃ GỘP KO CHỐT') + tag bắt đầu bằng `'Gộp '` (merge group cũ), (b) target tags trước (priority hiển thị) → source tags sort theo `SessionIndex` ascending (deterministic), dedup by `tag.Id` qua `Map`, (c) thêm placeholder `{Id:'__preview_merge_group__', Name:'Gộp X Y Z', Color: MERGE_TAG_COLOR}` (tag thật sẽ tạo lúc confirm). (2) Sửa `renderClusterCard` (line 686-693) — compute `mergedTagsPreview` rồi render qua `renderMergeTagPills()` có sẵn vào header `merged-col`. Empty case (cluster không có tag) → render fallback `"Không có tag"` pill xám `#9ca3af`. **CSS**: Reuse `merge-header-tags` + `merge-tag-pill` class có sẵn ở `tab1-orders.css:3876` → không thêm CSS mới. **Backwards compatible**: `assignTagsAfterMerge` không bị chạm → behavior thực tế khi confirm merge giữ nguyên 100%, fix chỉ ở display layer. **Verification scenario** (screenshot user): STT 4 (CHỜ ĐI ĐƠN OKE, CHUYỂN KHOẢN, GIẢM GIÁ, T8 LÓT TULIP) + STT 6 (CHỜ ĐI ĐƠN OKE, T7 BÌNH SIÊU TỐC) + STT 73 đích (GIẢM GIÁ) → preview giờ hiển thị: GIẢM GIÁ (target) → CHỜ ĐI ĐƠN OKE → CHUYỂN KHOẢN → T8 LÓT TULIP (từ STT 4) → T7 BÌNH SIÊU TỐC (từ STT 6) → Gộp 4 6 73 (placeholder vàng). `node --check` syntax OK. |
| **Status** | ✅ Done |

### [orders] Lịch sử Tag — default filter "Tag XL + Chuyển đơn" ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | User yêu cầu xem lại lịch sử thêm/xóa Tag XL (T-tag) trong panel Chốt Đơn. Phát hiện feature **đã có sẵn**: icon clock ở header panel (`fa-clock-rotate-left`, line 1834-1836) → mở modal `_ptagOpenGlobalHistory()` (line 4684) với filter STT/mã đơn + loại action + user, pagination 50/trang, đã track `ADD_TTAG`/`REMOVE_TTAG`/`TRANSFER_IN`/`TRANSFER_OUT`. **Thiếu duy nhất**: dropdown filter loại không có option "Chuyển đơn" (group `transfer` đã định nghĩa trong `PTAG_ACTION_META` nhưng không xuất hiện ở UI), và mở modal mặc định show tất cả thay vì chỉ Tag XL + Chuyển đơn. **Fix**: (1) Thêm 3 option vào `<select id="ptag-gh-filter-action">` (line 4710): `"ttag_transfer"` ("Tag XL + Chuyển đơn", `selected`), `"transfer"` ("Chuyển đơn"), và đổi label `"ttag"` từ "Tag T" → "Tag XL" cho consistent với UI bảng. (2) Sửa `_ptagGHApplyFilters()` (line 4623-4630) handle group đặc biệt `ttag_transfer`: match `meta.group === 'ttag' \|\| meta.group === 'transfer'`. (3) Sửa `_ptagOpenGlobalHistory()` — thêm `_ptagGHApplyFilters()` call sau `appendChild` để áp dụng filter mặc định (trước đó set thẳng `_globalHistoryFiltered = [..._cache]` nên dropdown selected nhưng không filter). **KHÔNG đổi**: cleanup 60 ngày giữ nguyên (user yêu cầu), cột "Bảng/campaign" không thêm (user yêu cầu không cần). **Cleanup hiện hành**: `_ptagCleanupOldHistory()` (line 4531) xóa cả tag data + history nếu order > 60 ngày không update — không phải sliding window per-entry. |
| **Status** | ✅ Done |

### [orders] Fix gộp đơn — Tag XL persistence + subState preservation + phone normalize ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-merge.js` |
| **Chi tiết** | Fix các bug + smell trong logic gộp đơn trùng SĐT (`assignTagXLAfterMerge`, `executeBulkMergeOrderProducts`, `showMergeDuplicateOrdersModal`). **Bug #1 — Tag XL tTags không persist (CRITICAL)**: Code cũ ở lines 1715-1723 set `data.tTags = mergedTTags` trực tiếp qua `setOrderData()` → chỉ update local state, KHÔNG gọi `saveProcessingTagToAPI()` → sau page reload, merged tTags biến mất. Cũng không trigger sync v3 → TPOS tag column không có Tx merged. **Bug #2 — subState bị reset khi target có sẵn category đúng**: Code cũ luôn gọi `assignOrderCategory(targetCode, finalCategory, ...)` ngay cả khi target đã ở đúng category + subTag → bên trong `assignOrderCategory` (line 734) `data.subState = null` → các state quan trọng như `DA_IN_PHIEU`, `CHO_HANG` bị mất. **Bug #3 — fallback `existingData.category`**: Khi `bestCategory === null` (tất cả đơn đều là old merge tag), code cũ fallback về `existingData.category` → có thể giữ "Đã gộp không chốt" cũ thay vì để nguyên. **Smell #4 — guard check thiếu**: line 1653 chỉ check `assignOrderCategory` mà không check `assignTTagToOrder` / `toggleOrderFlag` (functions mới sẽ dùng). **Smell #5 — phone normalization**: `executeBulkMergeOrderProducts` (line 296) và `showMergeDuplicateOrdersModal` (line 453) chỉ dùng `Telephone?.trim()` → `+84xxx` và `0xxx` của cùng 1 KH không group được. **Fix**: (A) Refactor `assignTagXLAfterMerge` (~+50/-25 dòng): thêm helper `_mergeXLId(item)` để extract id từ object hoặc string. Logic mới: (1) Collect bestCategory/bestSubTag/mergedFlags/mergedTTags từ all orders như cũ. (2) Compute `targetSameCategory` = bestCategory nullable + match cả category + subTag với target hiện tại. (3) Nếu cần đổi category (`!targetSameCategory && bestCategory !== null`) → gọi `assignOrderCategory(targetCode, bestCategory, {subTag, flags: mergedFlags, source: 'Hệ thống (gộp đơn)'})`. (4) Else (same category hoặc no new category) → loop merge flags qua `await window.toggleOrderFlag(targetCode, flagId, source)` để tránh reset subState (idempotent: skip nếu flag đã có). (5) Loop merge tTags qua `await window.assignTTagToOrder(targetCode, tId, source)` (idempotent: skip nếu tTag đã có) — mỗi call persists + syncs. Bỏ block buggy `setOrderData(updatedData)` ở cuối. (B) `normalizeMergePhone(phone)` helper mới ở đầu file: trim, remove `[\s\-\.()]`, convert `+84xxx` → `0xxx` (và `84xxx` 11-digit → `0xxx`). Dùng làm group key trong cả 2 nơi grouping; field `Telephone`/`phone` khi trả về vẫn là original từ `targetOrder.Telephone` để hiển thị đúng format gốc. (C) Guard check mở rộng: kiểm tra cả 4 functions cần thiết (`ProcessingTagState`, `assignOrderCategory`, `assignTTagToOrder`, `toggleOrderFlag`). **Behavior preservation**: Source order logic giữ nguyên (`assignOrderCategory(sourceCode, 3, {subTag: 'DA_GOP_KHONG_CHOT'})` — preserve flags + tTags) theo yêu cầu user "logic tag như cũ". TPOS tag merging logic ở `assignTagsAfterMerge` (lines 1551-1644) không đổi. **Verification**: `node --check` syntax OK. **Critical fix path**: Trước fix này, sau page reload, target order STT cao nhất chỉ giữ category + flags từ `assignOrderCategory`, mất hết tTags được merge từ source orders → user thấy cột Tag XL không có Tx tags như mong đợi. |
| **Status** | ✅ Done |

### [orders] Auto detect GIẢM GIÁ + clear Tx tags khi tạo phiếu bán hàng ✅
| | |
|---|---|
| **Files** | `orders-report/js/utils/sale-modal-common.js`, `orders-report/js/tab1/tab1-sale.js`, `orders-report/js/tab1/tab1-fast-sale.js`, `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | 2 thay đổi trong cùng commit: **(A) GIẢM GIÁ auto-detect**: Bỏ điều kiện gating "phải có TPOS tag GIẢM GIÁ" ở mọi nơi parse/apply discount từ ghi chú sản phẩm. Trước đây phải có tag "GIẢM GIÁ" thì discount mới được tính → user phàn nàn vì phải gán tag thủ công. Sau: discount luôn được auto-parse từ note (regex `^(\d+(?:[.,]\d+)?)\s*k$` hoặc plain number), khi `totalDiscount > 0` → tự động gán flag `GIAM_GIA` vào XL state qua helper mới `_ensureGiamGiaFlag(orderCode)` (idempotent — check flag tồn tại trước khi gọi `toggleOrderFlag`). Helper dùng `window.toggleOrderFlag` để tận dụng sync v3 hook → tự push tag "GIẢM GIÁ" sang TPOS. **5 vị trí gỡ gate**: (1) `sale-modal-common.js:populateSaleOrderLinesFromAPI()` — bỏ `const hasDiscountTag = currentSaleOrderHasDiscountTag()` (line 774), `notePrice = parseDiscountFromNoteForDisplay(productNote)` luôn (line 788), block render discount input bỏ điều kiện tag + thêm call `_ensureGiamGiaFlag(currentSaleOrderData?.Code)`. (2) `tab1-sale.js:1762` payload builder — bỏ `if (saleOrderHasDiscountTag(order))`, thêm call `window._ensureGiamGiaFlag(order.Code)`. (3) `tab1-fast-sale.js:960` `hasAnyDiscount` (cho auto-generate order note) — bỏ `hasDiscountTag &&`. (4) `tab1-fast-sale.js:1607` freeship calc — bỏ `if (orderHasDiscountTag(order))`. (5) `tab1-fast-sale.js:1805` payload builder — bỏ gate, thêm call `window._ensureGiamGiaFlag(saleOnlineOrder?.Code || order.Reference)`. Helper functions `currentSaleOrderHasDiscountTag` / `saleOrderHasDiscountTag` / `orderHasDiscountTag` giữ lại (dead code, không xóa để tránh side-effect). **(B) Clear Tx tags khi auto-transition ĐÃ RA ĐƠN**: User báo bug — tạo phiếu bán hàng thành công thì tag "ĐÃ RA ĐƠN" được gán nhưng các Tx sản phẩm (vd "T7 BÌNH SIÊU TỐC") vẫn còn ở cột TAG XL. Yêu cầu: clear Tx tags khi chuyển sang ĐÃ RA ĐƠN, nhưng lưu lại trong snapshot để khi hủy phiếu sẽ restore. Fix: `tab1-processing-tags.js:onPtagBillCreated()` thêm `data.tTags = []` ngay sau `data.subState = null`. Snapshot trong `previousPosition` đã lưu `tTags` từ commit trước → `onPtagBillCancelled` đã restore `tTags = [...prev.tTags]` sẵn → restore tự động hoạt động. Sync v3 hook đã có sẵn ở cuối cả 2 function → tự push xóa/restore Tx tag sang TPOS. |
| **Status** | ✅ Done |

### [orders] Robust snapshot/restore cho onPtagBillCreated + onPtagBillCancelled + hook sync v3 ✅
| | |
|---|---|
| **Files** | `orders-report/js/tab1/tab1-processing-tags.js` |
| **Chi tiết** | Làm kỹ lại logic auto-transition ĐÃ RA ĐƠN ↔ rollback khi hủy phiếu, và bổ sung hook sync v3 (XL→TPOS) vào cả 2 function. **Trước**: `onPtagBillCreated` snapshot `previousPosition` thiếu `pickingSlipPrinted` + timestamp, flags chỉ shallow spread; `onPtagBillCancelled` clear `previousPosition: null` (vẫn giữ key trong JSONB), không idempotency guard, không async. Cả 2 đều bypass `assignOrderCategory` → `syncXLToTPOS` không chạy → TPOS tag column không update khi bill tạo/hủy tự động. **Sau**: (1) `onPtagBillCreated` → `async`. Snapshot giờ gồm `{category, subTag, subState, flags, tTags, note, pickingSlipPrinted, snapshotAt}`, deep clone flag objects (`f => ({...f})`). `await saveProcessingTagToAPI()` rồi gọi `window.syncXLToTPOS(orderCode, 'bill-created')` fire-and-forget. (2) `onPtagBillCancelled` → `async`. Thêm 2 idempotency guard: skip nếu `!data.previousPosition` (đã restore), skip nếu `data.category !== HOAN_TAT` (user đã gán thủ công lại → tránh restore nhầm). Restore giờ có `pickingSlipPrinted` + deep clone flags + clone `history`. Dùng `delete restored.previousPosition` thay vì `: null` → field bị xóa hẳn khỏi JSONB (backend PUT full-replace). `await save` rồi gọi `syncXLToTPOS(orderCode, 'bill-cancelled')`. **Callers KHÔNG đổi**: 5 caller ở `tab1-fast-sale-workflow.js:461/1332`, `tab1-fast-sale-invoice-status.js:819`, `tab1-sale.js:1003/1172` đều fire-and-forget, zero-risk. **Guard interaction sync v3**: `_syncingForward` flip true trong sync → TPOS broadcast `tpos:tag-assigned` về sẽ thấy guard và early-return → không loop. |
| **Status** | ✅ Done |

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
