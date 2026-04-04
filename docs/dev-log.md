# Dev Log — N2Store

> Cập nhật liên tục khi code. Mới nhất ở trên.
>
> **Cách tìm nhanh:** Ctrl+F tìm theo ngày `## 2026-`, theo module `[inbox]` `[chat]` `[extension]` `[orders]` `[worker]` `[render]`, hoặc theo status `IN PROGRESS`.

---

## 2026-04-04

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

### [extension] Fix global-id v2: Pancake approach — 5 regex patterns + rsrcMap full load + strategy reorder 🔄
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
