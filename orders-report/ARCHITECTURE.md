# ORDERS-REPORT ARCHITECTURE

> **LUU Y QUAN TRONG:** Khi them code moi, vui long:
> 1. Doc file nay truoc de hieu cau truc
> 2. Them ham vao dung SECTION trong file JS tuong ung
> 3. Cap nhat TABLE OF CONTENTS o dau file JS neu la ham quan trong
> 4. Cap nhat file nay neu them section moi

---

## Tong Quan

Thu muc `orders-report` chua ung dung quan ly don hang da tab voi tich hop Firebase realtime.

```
orders-report/
├── HTML Layer (Giao dien)
│   ├── main.html .............. Tab router (chi auth, khong business logic)
│   ├── tab1-orders.html ....... Giao dien quan ly don hang
│   ├── tab2-statistics.html ... Thong ke
│   ├── tab3-product-assignment.html .. Gan san pham
│   ├── tab-upload-tpos.html ... Upload len TPOS
│   └── tab-overview.html ...... Dashboard KPI
│
├── JavaScript Layer (Logic)
│   ├── [LON] tab1-orders.js ........... 14,000+ dong - Quan ly don hang
│   ├── [LON] tab-upload-tpos.js ....... 7,000+ dong - Upload TPOS
│   ├── [LON] tab3-product-assignment.js 4,500+ dong - Gan san pham
│   └── [NHO] Cac file manager khac
│
├── CSS Layer (Styling)
│   ├── tab1-orders.css
│   ├── tab-upload-tpos.css
│   └── modern.css, report-modern.css
│
└── Documentation
    ├── ARCHITECTURE.md (file nay)
    └── Cac file MD khac
```

---

## Cac File JS Lon (Can Doc TOC Truoc)

### 1. tab1-orders.js (~14,000 dong)

**Muc dich:** Quan ly don hang chinh - hien thi, sua, tag, chat, merge don

**SECTIONS:**
| Section | Tim kiem | Chuc nang |
|---------|----------|-----------|
| 1. GLOBAL VARIABLES | `#GLOBAL` | State: allData, filteredData, displayedData |
| 2. FIREBASE & REALTIME | `#FIREBASE` | Tag sync, realtime listeners |
| 3. INITIALIZATION | `#INIT` | DOMContentLoaded, auto-load |
| 4. EMPLOYEE RANGE | `#EMPLOYEE` | Phan chia don theo nhan vien |
| 5. TAG MANAGEMENT | `#TAG` | CRUD tag, gan tag don hang |
| 6. BULK TAG | `#BULK-TAG` | Gan tag hang loat |
| 7. SEARCH & FILTER | `#SEARCH` | Tim kiem, loc bang |
| 8. TABLE RENDERING | `#RENDER` | Render bang don hang |
| 9. MERGED ORDER | `#MERGED` | Cot gop don cung SDT |
| 10. EDIT MODAL | `#EDIT` | Modal sua don hang |
| 11. INLINE PRODUCT | `#PRODUCT` | Tim san pham inline |
| 12. CHAT MODAL | `#CHAT` | Chat, message, comment |
| 13. INFINITE SCROLL | `#SCROLL` | Load more messages/comments |
| 14. NOTE ENCODING | `#ENCODE` | Ma hoa/giai ma note |
| 15. ORDER MERGE | `#MERGE` | Gop san pham don cung SDT |
| 16. ADDRESS LOOKUP | `#ADDRESS` | Tim dia chi |
| 17. QR & DEBT | `#QR-DEBT` | QR code, cong no |

**Cach tim section:**
- Trong IDE: Ctrl+F tim `#SECTION_NAME` (vd: `#TAG`)
- Region folding: Tim `// #region` de collapse/expand

---

### 2. tab-upload-tpos.js (~7,000 dong)

**Muc dich:** Upload san pham da gan len TPOS

**SECTIONS:**
| Section | Tim kiem | Chuc nang |
|---------|----------|-----------|
| 1. STATE & FIREBASE | `#STATE` | assignments[], sessionIndexData |
| 2. ENCODING | `#ENCODE` | Ma hoa san pham (XOR, Base64URL) |
| 3. NOTE ENCODING | `#NOTE` | Ma hoa note don hang |
| 4. AUTH & API | `#AUTH` | Token management |
| 5. TABLE RENDERING | `#RENDER` | Render bang order/product view |
| 6. VIEW MODE | `#VIEW` | Chuyen doi che do hien thi |
| 7. EDIT MODAL | `#EDIT` | Modal sua don |
| 8. UPLOAD | `#UPLOAD` | Upload len TPOS API |
| 9. HISTORY | `#HISTORY` | Lich su upload |
| 10. COMMENT ANALYSIS | `#COMMENT` | Phan tich comment |
| 11. DISCREPANCY | `#DISCREP` | Phan tich chenh lech |
| 12. FINALIZE | `#FINALIZE` | Toggle history details |

---

### 3. tab3-product-assignment.js (~4,500 dong)

**Muc dich:** Gan san pham vao don hang truoc khi upload

**SECTIONS:**
| Section | Tim kiem | Chuc nang |
|---------|----------|-----------|
| 1. STATE & FIREBASE | `#STATE` | assignments[], productsData[] |
| 2. AUTH & API | `#AUTH` | Token, authenticatedFetch |
| 3. PRODUCT DATA | `#PRODUCT` | Load, search san pham |
| 4. ORDER DATA | `#ORDER` | Load don hang tu tab1 |
| 5. ASSIGNMENT | `#ASSIGN` | Them/xoa gan san pham |
| 6. UPLOAD PREVIEW | `#PREVIEW` | Xem truoc upload |
| 7. UPLOAD | `#UPLOAD` | Upload len TPOS |
| 8. HISTORY | `#HISTORY` | Lich su upload |
| 9. HISTORY DETAIL | `#DETAIL` | Chi tiet lich su |
| 10. COMPARISON | `#COMPARE` | So sanh gio hang |
| 11. NOTE ENCODING | `#NOTE` | Ma hoa note |

---

## Chi Tiết Tất Cả Files

### 📁 Core Managers

#### `api-config.js` (115 dòng)

**Mục đích:** Cấu hình tập trung cho tất cả API endpoints, build URL helpers.

| Export | Mô tả |
|--------|-------|
| `API_CONFIG.WORKER_URL` | Cloudflare Worker URL |
| `API_CONFIG.TPOS_ODATA` | Base URL cho TPOS OData |
| `API_CONFIG.PANCAKE` | Base URL cho Pancake API |
| `buildUrl.tposOData(endpoint, params)` | Build TPOS OData URL |
| `buildUrl.pancake(endpoint, params)` | Build Pancake API URL |
| `buildUrl.pancakeDirect(endpoint, pageId, jwt, token)` | Pancake với custom headers (24h bypass) |
| `buildUrl.pancakeOfficial(endpoint, pageAccessToken)` | Pancake Official API (pages.fm) |
| `buildUrl.facebookSend()` | Facebook Graph API endpoint |
| `smartFetch(url, options)` | Wrapper cho fetch |

---

#### `auth.js` (225 dòng)

**Mục đích:** Quản lý authentication với session management.

| Class/Function | Mô tả |
|----------------|-------|
| `AuthManager` | Class chính quản lý auth state |
| `authManager.init()` | Khởi tạo từ sessionStorage/localStorage |
| `authManager.isAuthenticated()` | Kiểm tra đăng nhập |
| `authManager.hasPermission(level)` | Kiểm tra quyền |
| `authManager.getUserId()` | Lấy userId cho chat |
| `authManager.logout()` | Đăng xuất |

**Storage:**
- `sessionStorage['loginindex_auth']` - Session login (8h TTL)
- `localStorage['loginindex_auth']` - Remember login (30d TTL)

---

#### `cache.js` (197 dòng)

**Mục đích:** Cache layer với localStorage persistence.

| Method | Mô tả |
|--------|-------|
| `cacheManager.set(key, value, type)` | Lưu cache |
| `cacheManager.get(key, type)` | Lấy cache (tự động xóa expired) |
| `cacheManager.clear(type)` | Xóa cache theo type |
| `cacheManager.cleanExpired()` | Dọn entries hết hạn |
| `cacheManager.invalidatePattern(pattern)` | Xóa theo pattern |
| `cacheManager.getStats()` | Hit/miss statistics |

**Auto:** Tự động clean expired entries mỗi 5 phút.

---

#### `token-manager.js` (514 dòng)

**Mục đích:** Quản lý TPOS Bearer Token với auto-refresh và Firebase sync.

| Method | Mô tả |
|--------|-------|
| `tokenManager.getToken()` | Lấy token (tự động refresh nếu expired) |
| `tokenManager.getAuthHeader()` | Trả về `{ Authorization: 'Bearer xxx' }` |
| `tokenManager.authenticatedFetch(url, options)` | Fetch với auto token |
| `tokenManager.refresh()` | Force refresh token |
| `tokenManager.getTokenInfo()` | Thông tin token hiện tại |

**Token Flow:**
```
1. localStorage['bearer_token_data'] → Check expired?
2. Nếu expired → Firebase → Check expired?
3. Nếu expired → Fetch từ TPOS /token API
4. Save → localStorage + Firebase
```

---

#### `notification-system.js` (650 dòng)

**Mục đích:** Toast notifications với Lucide icons + custom confirm dialogs.

| Method | Mô tả |
|--------|-------|
| `notificationManager.success(msg, duration)` | Success toast |
| `notificationManager.error(msg, duration)` | Error toast |
| `notificationManager.warning(msg, duration)` | Warning toast |
| `notificationManager.loading(msg)` | Loading spinner toast |
| `notificationManager.confirm(msg, title)` | Custom confirm dialog (thay thế native) |
| `notificationManager.uploading(current, total)` | Upload progress |
| `notificationManager.saving(msg)` | Saving indicator |

---

### 📁 Pancake Integration

#### `pancake-data-manager.js` (1,949 dòng)

**Mục đích:** Tích hợp Pancake.vn API - messages, conversations, customers.

| Method | Mô tả |
|--------|-------|
| `pancakeDataManager.getToken()` | Lấy JWT từ PancakeTokenManager |
| `pancakeDataManager.fetchPages(forceRefresh)` | Lấy danh sách pages |
| `pancakeDataManager.fetchConversations(forceRefresh)` | Lấy conversations |
| `pancakeDataManager.searchConversations(query, pageIds)` | Tìm kiếm conversations |
| `pancakeDataManager.fetchConversationsByCustomerFbId(pageId, fbId)` | Lấy theo fbId |
| `pancakeDataManager.getUnreadInfoForOrder(order)` | Số tin chưa đọc |
| `pancakeDataManager.getMessageUnreadInfoForOrder(order)` | Inbox unread |
| `pancakeDataManager.getCommentUnreadInfoForOrder(order)` | Comment unread |
| `pancakeDataManager.buildConversationMap()` | Build lookup maps (PSID, FBID) |

**Maps:**
- `inboxMapByPSID` - INBOX conversations by PSID
- `inboxMapByFBID` - INBOX conversations by Facebook ID
- `commentMapByPSID` - COMMENT conversations by PSID
- `commentMapByFBID` - COMMENT conversations by Facebook ID

---

#### `pancake-token-manager.js` (1,055 dòng)

**Mục đích:** Quản lý JWT tokens cho Pancake với multi-account support.

| Method | Mô tả |
|--------|-------|
| `pancakeTokenManager.getToken()` | Lấy token (priority: memory → localStorage → Firebase → cookie) |
| `pancakeTokenManager.setTokenManual(token)` | Set token thủ công |
| `pancakeTokenManager.getAllAccounts()` | Lấy tất cả accounts |
| `pancakeTokenManager.setActiveAccount(accountId)` | Chuyển account active |
| `pancakeTokenManager.deleteAccount(accountId)` | Xóa account |
| `pancakeTokenManager.getPageAccessToken(pageId)` | Lấy page access token |
| `pancakeTokenManager.decodeToken(token)` | Decode JWT payload |

**Storage:**
- `localStorage['pancake_jwt_token']` - JWT token
- `localStorage['pancake_page_access_tokens']` - Page tokens
- `Firebase: pancake_jwt_tokens/` - Multi-account storage

---

### 📁 Firebase & Realtime

#### `realtime-manager.js` (496 dòng)

**Mục đích:** WebSocket connection cho Pancake realtime updates.

| Method | Mô tả |
|--------|-------|
| `realtimeManager.initialize()` | Khởi tạo WebSocket |
| `realtimeManager.connect()` | Kết nối WebSocket |
| `realtimeManager.disconnect()` | Ngắt kết nối |
| `realtimeManager.joinChannels()` | Join channels (pages, conversations) |
| `realtimeManager.handleMessage(data)` | Xử lý message từ WS |
| `realtimeManager.handleUpdateConversation(payload)` | Handle conversation update |
| `realtimeManager.handleOrderTagsUpdate(payload)` | Handle tags update |

**Features:** Heartbeat ping, auto-reconnect, channel subscriptions.

---

#### `user-storage-manager.js` (354 dòng)

**Mục đích:** Storage per-user với Firebase priority.

| Method | Mô tả |
|--------|-------|
| `userStorageManager.getUserIdentifier()` | Lấy user ID |
| `userStorageManager.getUserFirebasePath(basePath)` | Build Firebase path `{base}/{userId}` |
| `userStorageManager.getUserLocalStorageKey(baseKey)` | Build localStorage key `{key}_{userId}` |
| `userStorageManager.saveToAll(db, path, key, data)` | Save Firebase + localStorage |
| `userStorageManager.loadFromAll(db, path, key)` | Load Firebase → fallback localStorage |
| `userStorageManager.listenToFirebase(db, path, callback)` | Realtime listener |

---

#### `firebase-image-cache.js` (190 dòng)

**Mục đích:** Cache ảnh sản phẩm đã upload lên Pancake.

| Method | Mô tả |
|--------|-------|
| `firebaseImageCache.get(productId)` | Lấy cached image URL |
| `firebaseImageCache.set(productId, name, url)` | Lưu image URL |
| `firebaseImageCache.clear(productId)` | Xóa cache |
| `firebaseImageCache.getAll()` | Debug: lấy tất cả |

**Firebase Path:** `pancake_images/{productId}`

---

### 📁 Product & Search

#### `product-search-manager.js` (681 dòng)

**Mục đích:** Tìm kiếm sản phẩm từ Excel + TPOS API.

| Method | Mô tả |
|--------|-------|
| `productSearchManager.fetchExcelProducts(force)` | Load suggestions từ Excel |
| `productSearchManager.search(query, limit)` | Tìm kiếm (supports Vietnamese) |
| `productSearchManager.getFullProductDetails(productId)` | Fetch đầy đủ từ TPOS |
| `productSearchManager.hasProductInExcel(productId)` | Check exists |
| `productSearchManager.getStats()` | Thống kê cache |

**Data Sources:**
1. Excel file trên Supabase (suggestions)
2. TPOS API `/api/odata/Product({id})` (full details)

---

#### `decoding-utility.js` (290 dòng)

**Mục đích:** Decode sản phẩm mã hóa trong note đơn hàng.

| Export | Mô tả |
|--------|-------|
| `DecodingUtility.decodeProductLine(encoded)` | Decode 1 dòng SP (legacy format) |
| `DecodingUtility.decodeFullNote(encoded)` | Decode toàn bộ note (new format) |
| `DecodingUtility.formatNoteWithDecodedData(note)` | Format HTML với decoded info |

**Encoding:** XOR encryption + Base64URL

---

### 📁 Messaging & Modals

#### `comment-modal.js` (885 dòng)

**Mục đích:** Modal bình luận Facebook riêng biệt.

| Function | Mô tả |
|----------|-------|
| `openCommentModal(orderId, channelId, psid)` | Mở modal |
| `closeCommentModal()` | Đóng modal |
| `renderCommentModalComments(comments)` | Render danh sách |
| `handleCommentModalReply(commentId, postId)` | Set reply target |
| `setCommentReplyType(type)` | Toggle reply_comment / private_replies |
| `sendCommentReply()` | Gửi reply |

**Reply Types:**
- `reply_comment` - Reply công khai
- `private_replies` - Gửi tin nhắn riêng

---

#### `message-template-manager.js` (1,586 dòng)

**Mục đích:** Quản lý templates tin nhắn + bulk sending.

| Function | Mô tả |
|----------|-------|
| `MessageTemplateManager.loadTemplates()` | Load từ Firebase |
| `MessageTemplateManager.saveTemplate(template)` | Lưu template |
| `MessageTemplateManager.deleteTemplate(id)` | Xóa template |
| `MessageTemplateManager.renderTemplatePreview(template, order)` | Preview với variables |
| `MessageTemplateManager.bulkSendMessages(orders, template)` | Gửi hàng loạt |

**Template Variables:** `{customer_name}`, `{order_code}`, `{total_amount}`, `{products}`, etc.

---

#### `quick-reply-manager.js` (1,609 dòng)

**Mục đích:** Quick reply autocomplete trong chat.

| Function | Mô tả |
|----------|-------|
| `QuickReplyManager.init()` | Khởi tạo |
| `QuickReplyManager.loadReplies()` | Load từ Firebase |
| `QuickReplyManager.saveReply(reply)` | Lưu quick reply |
| `QuickReplyManager.search(query)` | Tìm kiếm |
| `QuickReplyManager.showSuggestions(input)` | Hiển thị gợi ý |

**Trigger:** Gõ `/` để hiển thị menu quick replies.

---

#### `dropped-products-manager.js` (1,339 dòng)

**Mục đích:** Theo dõi sản phẩm rớt/xả trong chat modal.

| Function | Mô tả |
|----------|-------|
| `addToDroppedProducts(product, qty, reason)` | Thêm vào dropped |
| `moveDroppedToOrder(index)` | Chuyển về đơn |
| `removeFromDroppedProducts(index)` | Xóa |
| `loadDroppedProductsFromFirebase()` | Realtime listener |
| `renderDroppedProductsTable()` | Render UI |

**Firebase Path:** `dropped_products`

---

### 📁 Other Utilities

| File | Dòng | Mô tả |
|------|------|-------|
| `config.js` | 100 | Firebase config (API keys) |
| `api-handler.js` | 210 | Legacy API handlers |
| `column-visibility-manager.js` | 215 | Toggle columns trong bảng |
| `search-functions.js` | 530 | Search utilities |
| `order-image-generator.js` | 450 | Generate bill images |
| `quick-fix-console.js` | 250 | Console debug commands |
| `debug-realtime.js` | 150 | Debug realtime connections |
| `test-tag-listener.js` | 75 | Test Firebase tag listeners |
| `user-employee-loader.js` | 80 | Load employee list |

---

### 📁 HTML Files

| File | Mô tả |
|------|-------|
| `main.html` | Tab router, auth check, sidebar navigation |
| `tab1-orders.html` | Giao diện quản lý đơn hàng chính |
| `tab2-statistics.html` | Thống kê theo ngày/nhân viên |
| `tab3-product-assignment.html` | Gán sản phẩm vào STT + Upload TPOS |
| `tab-upload-tpos.html` | Upload đơn hàng lên TPOS (deprecated) |
| `tab-overview.html` | Dashboard KPI tổng quan |

---

### 📁 CSS Files

| File | Mô tả |
|------|-------|
| `modern.css` | Design system chung (colors, spacing, typography) |
| `report-modern.css` | Styling cho reports, modals |
| `tab1-orders.css` | Styling riêng cho tab1 (chat modal, tables) |
| `tab3-product-assignment.css` | Styling cho tab3 |
| `tab-overview.css` | Styling cho overview dashboard |
| `message-template-modal.css` | Modal templates |
| `quick-reply-modal.css` | Quick reply UI |
| `product-highlight.css` | Product search highlights |
| `product-search-styles.css` | Search dropdown styling |

---

### 📁 Documentation Files

| File | Mô tả |
|------|-------|
| `ARCHITECTURE.md` | File này - tổng quan cấu trúc |
| `INBOX_PREVIEW_VARIABLES.md` | Biến template cho preview |
| `KPI_CALCULATION_GUIDE.md` | Công thức tính KPI |
| `PANCAKE_API_CONSULTING.md` | Tư vấn Pancake API |
| `PANCAKE_API_DOCUMENTATION.md` | API reference |
| `REMOVE_TAB_UPLOAD_TPOS.md` | Hướng dẫn xóa tab upload |

---

## Nguyen Tac Quan Trong

### 1. Tach Biet Tab (Iframe Architecture)

```
main.html
├── [iframe] tab1-orders.html
├── [iframe] tab2-statistics.html
├── [iframe] tab3-product-assignment.html
└── [iframe] tab-upload-tpos.html
```

- **main.html** chi lam auth check, KHONG co business logic
- Moi tab load doc lap trong iframe rieng
- Giao tiep qua `window.postMessage()`

### 2. Quy Tac Them Code Moi

```javascript
// 1. Tim section phu hop trong TOC o dau file
// 2. Tim region bang cach search: #SECTION_NAME
// 3. Them code vao trong region do
// 4. Neu la ham quan trong, them vao TOC

// Vi du: Them ham moi vao TAG MANAGEMENT
// Tim: #TAG
// Them ham ngay sau cac ham tag khac
```

### 3. Naming Convention

- **Function:** camelCase - `loadAvailableTags()`, `handleTableSearch()`
- **Constant:** UPPER_SNAKE - `DEBT_CACHE_TTL`, `MAX_REQUEST_ATTEMPTS`
- **State variable:** camelCase - `allData`, `selectedOrderIds`
- **DOM ID:** kebab-case - `edit-modal`, `chat-modal-body`

### 4. Tag Functions (QUAN TRONG)

Trong `tab1-orders.js` co 2 ham xu ly tag KHAC NHAU:

| Ham | Dong | Input | Output | Muc dich |
|-----|------|-------|--------|----------|
| `parseOrderTags(tagsJson, orderId, orderCode)` | ~4969 | JSON string + IDs | **HTML string** | Render tag trong bang |
| `getOrderTagsArray(order)` | ~14854 | Order object | **Array** | Parse tags cho merge |

**LUU Y:** KHONG duoc dat trung ten 2 ham nay! Neu trung ten, ham sau se ghi de ham truoc va gay loi hien thi tag.

---

## Tim Code Nhanh

### Tim ham trong file lon:

```bash
# Tim trong IDE
Ctrl+F: #SECTION_NAME

# Vi du tim tat ca ham lien quan TAG:
Ctrl+F: #TAG
```

### Tim file chua feature:

| Feature | File |
|---------|------|
| Quan ly don hang | tab1-orders.js |
| Tag system | tab1-orders.js (#TAG) |
| Chat/Message | tab1-orders.js (#CHAT) |
| Upload TPOS | tab-upload-tpos.js |
| Gan san pham | tab3-product-assignment.js |
| Message templates | message-template-manager.js |
| Quick reply | quick-reply-manager.js |
| Notifications | notification-system.js |

---

## Luu Y Bao Tri

1. **Khi them section moi:**
   - Them region marker: `// #region ... // #endregion`
   - Cap nhat TOC o dau file
   - Cap nhat file ARCHITECTURE.md nay

2. **Khi them ham quan trong:**
   - Them vao TOC o dau file voi mo ta ngan

3. **Khi refactor:**
   - Giu nguyen structure section
   - Chi thay doi noi dung ben trong

---

## API Proxy Architecture

### Cloudflare Worker Proxy

**QUAN TRONG:** Tat ca TPOS API calls PHAI di qua Cloudflare Worker proxy de bypass CORS.

**Proxy URL:** `https://chatomni-proxy.nhijudyshop.workers.dev`

**Worker source:** `cloudflare-worker/worker.js`

### Route Mapping

| Client Request | Proxy Route | Target |
|----------------|-------------|--------|
| `/api/odata/*` | → | `tomato.tpos.vn/odata/*` |
| `/api/token` | → | `tomato.tpos.vn/token` (có cache) |
| `/api/pancake/*` | → | `pancake.vn/api/v1/*` |
| `/api/sepay/*` | → | `n2store-fallback.onrender.com/api/sepay/*` |
| `/api/customers/*` | → | `n2store-fallback.onrender.com/api/customers/*` |

### Ví dụ sử dụng

```javascript
// ❌ SAI - Gọi trực tiếp sẽ bị CORS block
fetch('https://tomato.tpos.vn/odata/DeliveryCarrier...')

// ✅ ĐÚNG - Gọi qua proxy
fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/DeliveryCarrier...')
```

### Auth Token

Token được lấy từ localStorage theo thứ tự ưu tiên:

1. `bearer_token_data` (key chính của TPOS)
2. `auth` (fallback)
3. `tpos_token` (fallback)

```javascript
// Cách lấy token
const bearerData = localStorage.getItem('bearer_token_data');
const { access_token } = JSON.parse(bearerData);
```

---

## Sale Modal - Data Sources

### Tab "Thông tin"

| Field | ID | Data Source |
|-------|-----|-------------|
| Tên khách hàng | `saleCustomerName` | TPOS Partner |
| Nợ cũ | `saleOldDebt` | **Realtime API** `/api/sepay/debt-summary` |
| Reference | `saleReference` | TPOS Order |

### Tab "Thông tin giao hàng"

| Field | ID | Data Source |
|-------|-----|-------------|
| Đối tác giao hàng | `saleDeliveryPartner` | **TPOS API** `/api/odata/DeliveryCarrier` (cached 24h) |
| Phí giao hàng | `saleShippingFee` | Auto từ carrier `Config_DefaultFee` |
| Trả trước (Công nợ) | `salePrepaidAmount` | **Realtime API** `/api/sepay/debt-summary` |

### Cache Keys (localStorage)

| Key | TTL | Mô tả |
|-----|-----|-------|
| `tpos_delivery_carriers` | 24h | Danh sách đối tác giao hàng |
| `orders_phone_debt_cache` | 5 phút | Công nợ theo SĐT |
| `orders_phone_qr_cache` | Không hết hạn | QR code theo SĐT |

---

---

## 🥞 Pancake API Reference

> **Nguồn**: [https://developer.pancake.biz/#/](https://developer.pancake.biz/#/)

### Base URLs

| Server | URL | Sử dụng |
|--------|-----|---------|
| **User's API** | `https://pages.fm/api/v1` | List pages, generate token |
| **Page's API v1** | `https://pages.fm/api/public_api/v1` | Hầu hết operations |
| **Page's API v2** | `https://pages.fm/api/public_api/v2` | Conversations |

### Authentication

| Type | Parameter | Thời hạn | Lấy từ |
|------|-----------|----------|--------|
| **User Access Token** | `?access_token=` | 90 ngày | Account → Personal Settings |
| **Page Access Token** | `?page_access_token=` | Không hết hạn | Settings → Tools |

### API Endpoints Chính

#### Messages

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/pages/{page_id}/conversations/{conv_id}/messages` | Lấy tin nhắn |
| `POST` | `/pages/{page_id}/conversations/{conv_id}/messages` | Gửi tin nhắn |

**Các loại gửi tin nhắn:**

```javascript
// 1️⃣ Inbox Message
{ "action": "reply_inbox", "message": "Nội dung", "content_ids": ["id"], "attachment_type": "PHOTO" }

// 2️⃣ Reply Comment
{ "action": "reply_comment", "message_id": "comment_id", "message": "Nội dung" }

// 3️⃣ Private Reply (Facebook/Instagram only)
{ "action": "private_replies", "post_id": "...", "message_id": "...", "from_id": "...", "message": "..." }
```

#### Conversations

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/pages/{page_id}/conversations` | Lấy 60 conversations (v2) |
| `POST` | `.../{conv_id}/tags` | Thêm/xóa tag |
| `POST` | `.../{conv_id}/assign` | Assign nhân viên |
| `POST` | `.../{conv_id}/read` | Đánh dấu đã đọc |

**Query params:**
- `last_conversation_id` - Phân trang
- `tags` - Lọc theo tag (comma-separated)
- `type` - `INBOX` hoặc `COMMENT`
- `since/until` - Timestamp range

#### Upload Content

```
POST /pages/{page_id}/upload_contents
Content-Type: multipart/form-data
Body: file=@image.jpg
```

**Giới hạn video:** Shopee 30MB, Whatsapp 16MB, Lazada 100MB, Khác 25MB

#### Customers

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/pages/{page_id}/page_customers` | Lấy danh sách (page_number, page_size max 100) |
| `PUT` | `.../{customer_id}` | Cập nhật thông tin |
| `POST/PUT/DELETE` | `.../{customer_id}/notes` | Quản lý ghi chú |

#### Statistics

| Endpoint | Mô tả |
|----------|-------|
| `/statistics/pages_campaign` | Thống kê campaign |
| `/statistics/ads` | Thống kê ads (by_id/by_time) |
| `/statistics/customer_engagements` | Engagement (date_range, by_hour) |
| `/statistics/users` | Staff performance |
| `/statistics/tags` | Tag usage |

#### Other

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/pages` | Lấy danh sách pages |
| `GET` | `/pages/{page_id}/tags` | Lấy tags |
| `GET` | `/pages/{page_id}/posts` | Lấy posts |
| `GET` | `/pages/{page_id}/users` | Lấy users |

### Code Example

```javascript
// Gửi tin nhắn inbox với ảnh
async function sendMessageWithImage(pageId, convId, token, file, message) {
  // 1. Upload file
  const formData = new FormData();
  formData.append('file', file);
  const { id: contentId } = await fetch(
    `https://pages.fm/api/public_api/v1/pages/${pageId}/upload_contents?page_access_token=${token}`,
    { method: 'POST', body: formData }
  ).then(r => r.json());

  // 2. Send message
  return fetch(
    `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${convId}/messages?page_access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reply_inbox', message, content_ids: [contentId], attachment_type: 'PHOTO' })
    }
  ).then(r => r.json());
}
```

### Pagination

| API | Method |
|-----|--------|
| Conversations | `last_conversation_id` |
| Messages | `current_count` |
| Customers/Posts | `page_number` + `page_size` |

---

## Chat Modal - Right Panel

### Kiến Trúc

```
┌───────────────────────────────┬────────────────────────────────────┐
│     CHAT LEFT PANEL           │        CHAT RIGHT PANEL            │
│   (Tin nhắn / Bình luận)      │        (Quản lý đơn hàng)          │
│                               ├────────────────────────────────────┤
│                               │  [Đơn hàng] [Hàng rớt] [LS] [HĐ]  │
│                               ├────────────────────────────────────┤
│                               │  🔍 Tìm kiếm sản phẩm...           │
│                               │  📦 Product Cards (giữ/chính)      │
│                               │  Tổng: xxx,xxxđ  |  X sản phẩm     │
└───────────────────────────────┴────────────────────────────────────┘
```

### Data Sources

| Source | Mô tả |
|--------|-------|
| `window.currentChatOrderData.Details` | Mảng sản phẩm đơn hàng |
| `currentChatOrderDetails` | Backup array (sync với Details) |
| Firebase `held_products/{orderId}` | SP đang giữ (multi-user) |
| Firebase `dropped_products` | Hàng rớt-xả (shared) |

### Các Hàm Chính (tab1-orders.js)

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `addChatProductFromSearch(productId)` | ~15003 | Thêm SP từ search vào đơn |
| `removeChatProduct(index)` | ~15526 | Xóa SP → chuyển sang Dropped |
| `updateChatProductQuantity(index, delta)` | ~15640 | +/- số lượng SP |
| `renderChatProductsTable()` | ~14478 | Render danh sách SP |
| `initChatProductSearch()` | ~14900 | Khởi tạo thanh tìm kiếm |
| `toggleChatRightPanel()` | ~20756 | Mở/đóng right panel |
| `switchChatPanelTab(tabName)` | ~20778 | Chuyển tab |

### Flow Thêm Sản Phẩm

```
1. User gõ search → performChatProductSearch()
2. Click "+" → addChatProductFromSearch(productId)
3. Fetch TPOS API → productSearchManager.getFullProductDetails()
4. Nếu đã có → Tăng Quantity | Chưa có → Tạo mới
5. Push vào currentChatOrderData.Details
6. renderChatProductsTable() + saveChatProductsToFirebase()
```

### Flow Xóa Sản Phẩm

```
1. Click xóa → CustomPopup.confirm()
2. productsArray.splice(index, 1)
3. addToDroppedProducts() → Firebase dropped_products
4. Nếu held → removeHeldProduct() từ Firebase
5. Nếu thường → updateOrderWithFullPayload() (TPOS API)
6. Nếu LỖI → ROLLBACK (khôi phục SP)
```

### Hàng Rớt - Xả (dropped-products-manager.js)

| Hàm | Chức năng |
|-----|-----------|
| `addToDroppedProducts(product, qty, reason)` | Thêm vào dropped (transaction) |
| `moveDroppedToOrder(index)` | Chuyển về đơn → held_products |
| `removeFromDroppedProducts(index)` | Xóa khỏi dropped |
| `loadDroppedProductsFromFirebase()` | Realtime listener |
| `renderDroppedProductsTable()` | Render UI |

### Multi-User Realtime Sync

| Firebase Collection | Scope | Mục đích |
|---------------------|-------|----------|
| `held_products/{orderId}/{productId}/{userId}` | Per order | SP đang giữ |
| `dropped_products` | Global | Hàng rớt-xả |
| `dropped_products_history` | Global | Lịch sử thao tác |

**Cơ chế:** Dùng `child_added`, `child_changed`, `child_removed` listeners → tự động update UI khi có thay đổi từ user khác.
---

## Edit Order Modal

### Kiến Trúc

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         Edit Order Modal                                    │
│  ╭──────────────────────────────────────────────────────────────────────╮  │
│  │  🖊️ Sửa đơn hàng - [Code]                                    [X]   │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [Thông tin] [Sản phẩm] [Giao hàng] [Live] [Hóa đơn] [Lịch sử]      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Tab Content                                  │   │
│  │  - Tab Info: Tên KH, SĐT, Địa chỉ, Tra cứu địa chỉ                  │   │
│  │  - Tab Products: Inline search + Bảng SP + Edit/Delete              │   │
│  │  - Tab Delivery: Thông tin giao hàng (placeholder)                  │   │
│  │  - Tab Live: Lịch sử đơn live                                       │   │
│  │  - Tab Invoice History: Lịch sử hóa đơn                             │   │
│  │  - Tab History: Lịch sử chỉnh sửa                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                              [Đóng]                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

### HTML Structure (`tab1-orders.html` dòng 3588-3617)

| Element | ID/Class | Mô tả |
|---------|----------|-------|
| Modal Container | `#editOrderModal` | Bootstrap modal fade |
| Header | `.modal-header` | Tiêu đề + nút close |
| Tab Buttons | `.edit-tab-btn` | 6 tabs điều hướng |
| Body | `#editModalBody` | Nội dung tab động |
| Footer | `.modal-footer` | Nút Đóng |

### Data Sources

| Variable | Mô tả |
|----------|-------|
| `currentEditOrderId` | ID đơn hàng đang edit |
| `currentEditOrderData` | Full order data từ API |
| `hasUnsavedOrderChanges` | Dirty flag cho unsaved changes |

### Các Hàm Chính (tab1-orders.js)

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `openEditModal(orderId)` | ~6500 | Mở modal + fetch data |
| `closeEditModal()` | ~6530 | Đóng modal (check unsaved) |
| `forceCloseEditModal()` | ~6545 | Đóng modal không confirm |
| `fetchOrderData(orderId)` | ~6550 | Fetch từ TPOS API |
| `updateModalWithData(data)` | ~6565 | Cập nhật UI với data |
| `switchEditTab(tabName)` | ~6576 | Chuyển tab |
| `renderTabContent(tabName)` | ~6590 | Render nội dung tab |
| `saveAllOrderChanges()` | ~6900 | Lưu tất cả thay đổi (PUT API) |

### Tab Render Functions

| Hàm | Tab | Chức năng |
|-----|-----|-----------|
| `renderInfoTab(data)` | Thông tin | Tên, SĐT, Địa chỉ, Tra cứu |
| `renderProductsTab(data)` | Sản phẩm | Bảng SP + inline search |
| `renderDeliveryTab(data)` | Giao hàng | Placeholder |
| `renderLiveTab(data)` | Live | Lịch sử đơn live |
| `renderInvoicesTab(data)` | Hóa đơn | Thông tin thanh toán |
| `renderInvoiceHistoryTab(data)` | Lịch sử HĐ | FastSaleOrder history |
| `renderHistoryTab(data)` | Lịch sử | Log chỉnh sửa |

### Product Management Functions

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `updateProductQuantity(index, delta, value)` | ~7190 | +/- số lượng |
| `editProductDetail(index)` | ~7240 | Inline edit giá |
| `saveProductDetail(index)` | ~7260 | Lưu giá mới |
| `removeProduct(index)` | ~7213 | Xóa SP (confirm) |
| `addProductToOrderFromInline(productId)` | ~2214 | Thêm SP từ search |
| `recalculateTotals()` | ~7273 | Tính lại tổng tiền/SL |
| `initInlineSearchAfterRender()` | ~7300 | Khởi tạo inline search |
| `refreshInlineSearchUI()` | ~7350 | Refresh UI sau thay đổi |

### Flow Mở Modal

```
1. User click "Sửa" trên bảng → openEditModal(orderId)
2. Reset state: currentEditOrderId, hasUnsavedOrderChanges
3. Show loading spinner
4. fetchOrderData(orderId) → TPOS API (SaleOnline_Order)
5. updateModalWithData(data) → Set header, badges
6. switchEditTab('info') → Render tab mặc định
```

### Flow Lưu Thay Đổi

```
1. User click "Lưu" → saveAllOrderChanges()
2. notificationManager.confirm() → Xác nhận
3. Show loading notification
4. prepareOrderPayload() → Chuẩn bị payload
5. PUT API → TPOS SaleOnline_Order
6. fetchOrderData() → Reload fresh data
7. updateOrderInTable() → Sync bảng chính
8. Show success notification
```

### API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/odata/SaleOnline_Order({id})` | GET | Fetch order details |
| `/api/odata/SaleOnline_Order({id})` | PUT | Update order |

### Inline Product Search (Tab Sản phẩm)

```javascript
// Cấu trúc HTML render bởi renderProductsTab()
<div class="product-search-inline">
    <input id="inlineProductSearch" placeholder="Tìm sản phẩm...">
    <div id="inlineSearchResults">...</div>
</div>
```

**Flow thêm SP:**
```
1. Gõ search → debounce 300ms → searchProducts()
2. Hiển thị kết quả → Click item
3. addProductToOrderFromInline(productId)
4. Fetch full product details từ TPOS
5. Push vào currentEditOrderData.Details
6. recalculateTotals() + switchEditTab('products')
```

---

*Cập nhật lần cuối: 2025-12-15 (Đã thêm documentation đầy đủ cho tất cả 48 files)*

---

## So Sánh Payload Đơn Hàng (Order Payload Comparison)

### Các điểm khác biệt giữa 2 payload đơn hàng

| Field | Payload 1 | Payload 2 | Ghi chú |
|-------|-----------|-----------|---------|
| `UserId` | `ae5c70a1-898c-4e9f-b248-acc10b7036bc` | `fc0f4439-9cf6-4d88-a8c7-759ca8295142` | User tạo đơn khác nhau |
| `UserName` | `nvkt` | `Tú` | |
| `DateInvoice` | `2025-12-15T12:14:24.423Z` | `2025-12-15T12:13:10.021Z` | Payload 2 sớm hơn ~1 phút |
| `DateDeposit` | `null` | `2025-12-15T12:13:01.769Z` | Payload 2 có đặt cọc |
| `CashOnDelivery` | **2,225,000** | **0** | ⚠️ QUAN TRỌNG |
| `PreviousBalance` | 2,225,000 | 1,315,000 | Số dư trước khác nhau |
| `Ship_Receiver.Street` | `null` | `"08 Ấp Gia Hội..."` | Payload 2 có địa chỉ đầy đủ |
| `Carrier.Sequence` | `10` | `null` | |
| `Carrier.GHN_NoteCode` | `"CHOXEMHANGKHONGTHU"` | `null` | |
| `Carrier.Extras` | Object đầy đủ | `null` | |

### DeliveryNote

**Payload 1:**
```
KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CỦA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ
```

**Payload 2:**
```
KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CŨA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ

Sản phẩm nhận đổi trã trong vòng 2-4 ngày kể từ ngày nhận hàng , quá thời gian shop không nhận xử lý đổi trả bất kì trường hợp nào .
```

> Payload 2 có thêm chính sách đổi trả và lỗi chính tả "CŨA" thay vì "CỦA"

---

## API Lấy Danh Sách User (ApplicationUser API)

### Endpoint

```
GET https://tomato.tpos.vn/odata/ApplicationUser?$format=json&$top=20&$orderby=Name&$filter=Active+eq+true&$count=true
```

### Headers Required

```javascript
{
  "authorization": "Bearer {access_token}",
  "accept": "application/json",
  "tposappversion": "5.11.16.1"
}
```

### Response Structure

```javascript
{
  "@odata.context": "http://tomato.tpos.vn/odata/$metadata#ApplicationUser",
  "@odata.count": 21,
  "value": [
    {
      "Id": "ae5c70a1-898c-4e9f-b248-acc10b7036bc",  // UserId
      "Name": "nvkt",                                // Tên hiển thị
      "UserName": "nvkt",                            // Tên đăng nhập
      "CompanyId": 1,
      "CompanyName": "NJD Live",
      "Active": true,
      "Roles": [...]
    }
  ]
}
```

### Danh Sách User Mẫu

| UserId | Name | UserName | Company |
|--------|------|----------|---------|
| `ae5c70a1-898c-4e9f-b248-acc10b7036bc` | nvkt | nvkt | NJD Live |
| `fc0f4439-9cf6-4d88-a8c7-759ca8295142` | Tú | nv20 | NJD Live |
| `dd8b5615-5f7f-475a-80c4-546ef563e2d5` | Bo | nv01 | NJD Live |
| `3d97f509-b907-492a-b3c3-a391f7c72ba5` | Duyên | nv09 | NJD Live |
| `0bc5647f-b14c-4d03-b0b7-c4549b57f263` | Lài | nv05 | NJD Live |
| `d85738d2-41bc-47b7-9396-1c73a774a8ca` | live | live | NJD Live |
| `49788f7b-5f01-44c6-885b-44b3704b31c9` | bán hàng shop | nv99 | NJD Shop |
| `073e0ce4-b5e5-4752-b9f7-920e11607cb4` | TRƯỞNG GIANG | admin | NJD Shop |

### Kết Luận

- **Payload 1:** Tạo bởi `nvkt`, COD = 2,225,000 VND
- **Payload 2:** Tạo bởi `Tú`, COD = 0 VND (không thu tiền khi giao)
- Payload 2 có địa chỉ `Ship_Receiver` đầy đủ hơn
- Payload 2 có `DateDeposit` (đã đặt cọc)
- Payload 2 có `DeliveryNote` dài hơn với chính sách đổi trả

---

## 💬 Chat Modal - Chi Tiết Chức Năng

### Tổng Quan Cấu Trúc Files

| File | Vai trò |
|------|---------|
| `tab1-orders.html` (dòng 860-1355) | Cấu trúc HTML modal |
| `tab1-orders.js` | Logic chính - `openChatModal()`, render, send |
| `comment-modal.js` (885 dòng) | Module quản lý COMMENT riêng |
| `tab1-orders.css` | Styling cho modal |
| `pancake-data-manager.js` | Fetch tin nhắn/bình luận từ Pancake API |

### HTML Elements Chính

```
#chatModal                    - Container modal
  .chat-left-panel           - Panel chat bên trái
    #chatModalTitle          - Tiêu đề "Tin nhắn với [Tên]"
    #chatModalSubtitle       - Subtitle "SĐT: xxx • Mã ĐH: xxx"
    #conversationTypeToggle  - Toggle INBOX/COMMENT
    #chatPageSelect          - Dropdown chọn Page (xem)
    #chatConversationSelect  - Dropdown chọn conversation
    #chatModalBody           - Nội dung tin nhắn
    #chatReplyContainer      - Container nhập reply
      #chatReplyInput        - Textarea nhập tin
      #chatSendBtn           - Nút gửi
      #chatSendPageSelect    - Dropdown chọn page gửi
  .chat-right-panel          - Panel sản phẩm bên phải
    #chatTabOrders           - Tab sản phẩm đơn hàng
    #chatTabDropped          - Tab hàng rớt/xả
    #chatTabHistory          - Tab lịch sử
    #chatTabInvoiceHistory   - Tab hóa đơn
```

---

### 📤 Flow Gửi Tin Nhắn Qua Pancake API

#### Luồng Tổng Quan

```
User nhập tin nhắn → sendReplyComment() → Route dựa trên currentChatType
                                              ↓
                     ┌────────────────────────┼────────────────────────┐
                     ↓                        ↓                        ↓
              sendMessage()            sendComment()           (Error handling)
                     ↓                        ↓
         sendMessageInternal()     sendCommentInternal()
                     ↓                        ↓
          ┌──────────┴──────────┐            │
          ↓                     ↓            ↓
    reply_inbox          private_replies   reply_comment
   (Messenger)        (Private via comment)  (Public comment)
                     ↓
             Pancake Official API
    POST /pages/{pageId}/conversations/{conversationId}/messages
```

#### Hàm Chính: `sendReplyComment()` (dòng 10909)

```javascript
window.sendReplyComment = async function () {
    if (currentChatType === 'message') {
        return window.sendMessage();
    } else if (currentChatType === 'comment') {
        return window.sendComment();
    }
};
```

#### Payload Các Loại Gửi Tin

**1. INBOX Message (Messenger):**
```javascript
{
    action: 'reply_inbox',
    message: "nội dung tin nhắn",
    replied_message_id: "abc123",  // Nếu reply tin cụ thể
    content_ids: ["img_id_1"],     // Nếu có ảnh (từ upload API)
    attachment_type: 'PHOTO'       // Bắt buộc khi có ảnh
}
```

**2. PRIVATE REPLIES (gửi private từ comment):**
```javascript
{
    action: 'private_replies',
    post_id: "pageId_postId",
    message_id: "commentId",
    from_id: "psid",
    message: "nội dung tin nhắn"
}
```

**3. REPLY COMMENT (reply công khai trên post):**
```javascript
{
    action: 'reply_comment',
    message_id: "commentId",
    message: "nội dung reply"
}
```

#### API Endpoint

```
POST https://pages.fm/api/v1/pages/{pageId}/conversations/{conversationId}/messages
    ?access_token={pageAccessToken}
    &customer_id={customerUuid}
```

#### Fallback 24h Policy (dòng 10950-11189)

Khi gặp lỗi 24h hoặc user unavailable:

1. **`tryPancakeUnlock()`** - Gọi 3 API unlock:
   - `/pages/{pageId}/conversations/{conversationId}/messages/fill_admin_name`
   - `/pages/{pageId}/check_inbox`
   - `/pages/{pageId}/contents/touch`

2. **`sendMessageViaFacebookTag()`** - Gửi qua Facebook Graph API với tag `POST_PURCHASE_UPDATE`

#### Các Hàm Liên Quan

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `sendReplyComment()` | 10909 | Router chính |
| `sendMessageInternal()` | 11318 | Gửi INBOX/private_replies |
| `sendCommentInternal()` | 11701 | Gửi reply_comment |
| `tryPancakeUnlock()` | 10961 | Unlock 24h policy |
| `sendMessageViaFacebookTag()` | 11069 | Fallback qua FB Graph API |

---

### 🎨 Logic Render Tin Nhắn/Sticker/Reactions

#### Hàm `renderChatMessages()` (dòng 12063)

```javascript
function renderChatMessages(messages, scrollToBottom = false) {
    // 1. Sort theo thời gian (cũ nhất ở trên, mới nhất ở dưới)
    const sortedMessages = messages.slice().sort((a, b) => {
        const timeA = new Date(a.inserted_at || a.CreatedTime).getTime();
        const timeB = new Date(b.inserted_at || b.CreatedTime).getTime();
        return timeA - timeB;
    });

    // 2. Map từng message thành HTML
    const messagesHTML = sortedMessages.map(msg => {
        // Xác định owner/customer
        const isOwner = msg.IsOwner || (fromId === pageId);
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';
        // ... render content, attachments, reactions
    });

    // 3. Render vào DOM + scroll handling
    modalBody.innerHTML = `<div class="chat-messages-container">...</div>`;
}
```

#### Xử Lý Attachments (dòng 12158-12284)

| Loại | Điều kiện | Kết quả |
|------|-----------|---------|
| **Image (cũ)** | `att.Type === 'image'` | `<img src="url" />` |
| **Audio** | `att.mime_type === 'audio/mp4'` | `<audio controls>` |
| **Photo** | `att.type === 'photo'` | `<img onclick="window.open()" />` |
| **Sticker** | `att.type === 'sticker'` | `<img style="max-width:150px" />` |
| **Animated GIF** | `att.type === 'animated_image_share'` | `<img style="max-width:200px" />` |
| **Video** | `att.type === 'video'` | `<img onclick>` (thumbnail) |
| **Replied Message** | `att.type === 'replied_message'` | Quoted message box |
| **Link với comment** | `att.type === 'link' && att.comment` | Private reply preview |

#### Xử Lý Sticker (dòng 12249-12283)

```javascript
// Sticker type 1: att.type === 'sticker'
if (att.type === 'sticker' && (att.url || att.file_url)) {
    content += `<img src="${stickerUrl}" style="max-width: 150px; max-height: 150px;" />`;
}

// Sticker type 2: att.sticker_id
if (att.sticker_id && (att.url || att.file_url)) {
    // Same rendering
}

// Sticker type 3: Animated GIF
if (att.type === 'animated_image_share') {
    content += `<img src="${gifUrl}" style="max-width: 200px;" />`;
}
```

#### Xử Lý Reactions (dòng 12287-12337)

```javascript
// 1. Thu thập từ attachments (type === 'reaction')
msg.attachments.forEach(att => {
    if (att.type === 'reaction' && att.emoji) {
        reactionAttachments.push(att.emoji);
    }
});

// 2. Thu thập từ msg.reactions hoặc msg.reaction_summary
const reactions = msg.reactions || msg.reaction_summary;
// Format: { LIKE: 2, LOVE: 1, HAHA: 0, ... }

// 3. Mapping emoji
const reactionIcons = {
    'LIKE': '👍', 'LOVE': '❤️', 'HAHA': '😆',
    'WOW': '😮', 'SAD': '😢', 'ANGRY': '😠', 'CARE': '🤗'
};

// 4. Build HTML badges
Object.entries(reactions).forEach(([type, count]) => {
    if (count > 0) {
        reactionsArray.push(`<span style="background:#fef3c7">${emoji} ${count}</span>`);
    }
});
```

---

### 🔄 Toggle Giữa INBOX và COMMENT

#### Hàm `switchConversationType()` (dòng 8483)

**Trigger:** Nhấn nút trong header modal

```html
<!-- HTML buttons (tab1-orders.html dòng 875-882) -->
<button id="btnViewInbox" onclick="switchConversationType('INBOX')">
    <i class="fab fa-facebook-messenger"></i> Tin nhắn
</button>
<button id="btnViewComment" onclick="switchConversationType('COMMENT')">
    <i class="fas fa-comment-dots"></i> Bình luận
</button>
```

#### Flow Chuyển Đổi

```
switchConversationType('COMMENT')
     ↓
1. Kiểm tra nếu đang ở type này rồi → return
     ↓
2. updateConversationTypeToggle(type) → Cập nhật UI button
     ↓
3. Reset state: allChatMessages=[], allChatComments=[], cursor=null
     ↓
4. Cập nhật input state:
   - COMMENT: disabled, placeholder="Chọn Trả lời..."
   - INBOX: enabled, placeholder="Nhập tin nhắn..."
     ↓
5. Cập nhật currentChatType = 'comment' hoặc 'message'
     ↓
6. Dùng cached conversationId:
   - COMMENT: window.currentCommentConversationId
   - INBOX: window.currentInboxConversationId
     ↓
7. Gọi pancakeDataManager.fetchMessagesForConversation()
     ↓
8. Render: renderComments() hoặc renderChatMessages()
     ↓
9. Setup: setupChatInfiniteScroll(), setupNewMessageIndicatorListener()
```

#### Input State Logic (dòng 8527-8559)

```javascript
if (type === 'COMMENT') {
    // Vô hiệu hóa input - phải chọn comment cụ thể để reply
    chatInput.disabled = true;
    chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
    chatInput.style.cursor = 'not-allowed';
    chatSendBtn.disabled = true;
    chatSendBtn.style.opacity = '0.5';
} else {
    // Cho phép nhập tự do với INBOX
    chatInput.disabled = false;
    chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
    chatSendBtn.disabled = false;
}
```

#### Cached Conversation IDs

Khi `openChatModal()` thực thi, nó fetch tất cả conversations và lưu:

| Variable | Mô tả |
|----------|-------|
| `window.currentInboxConversationId` | ID conversation INBOX |
| `window.currentCommentConversationId` | ID conversation COMMENT |
| `window.currentCustomerUUID` | UUID khách hàng từ Pancake |

→ Cho phép chuyển đổi nhanh mà không cần fetch lại conversations.

---

## 💬 Comment Modal Module (comment-modal.js)

### Tổng Quan

File `comment-modal.js` (885 dòng) chứa logic xử lý bình luận Facebook riêng biệt. **Hiện tại đã được tích hợp vào unified chat modal** thông qua redirect.

### State Variables (dòng 5-16)

| Variable | Mô tả |
|----------|-------|
| `commentModalOrder` | Order object hiện tại |
| `commentModalChannelId` | Page ID (Facebook) |
| `commentModalPSID` | Customer's Facebook PSID |
| `commentModalComments` | Mảng bình luận đã load |
| `commentModalCursor` | Cursor cho pagination |
| `commentModalParentId` | ID comment đang reply |
| `isLoadingMoreComments` | Flag loading state |
| `commentModalThreadId` | Thread ID cho private reply |
| `commentModalThreadKey` | Thread key cho private reply |
| `commentModalInboxConvId` | Inbox conversation ID |
| `commentReplyType` | `'private_replies'` hoặc `'reply_comment'` |

### Các Hàm Chính

| Hàm | Dòng | Chức năng |
|-----|------|-----------|
| `openCommentModal(orderId, channelId, psid)` | 22 | Mở modal → **Redirect đến `openChatModal()`** |
| `closeCommentModal()` | 116 | Đóng modal + reset state |
| `setupCommentReplyInput()` | 148 | Setup input (disabled mặc định) |
| `handleCommentModalScroll()` | 176 | Xử lý scroll để load more |
| `loadMoreComments()` | 188 | Pagination - load thêm comments |
| `getFacebookCommentIdForModal(comment)` | 227 | Helper lấy Facebook comment ID |
| `isPurchaseCommentCheck(comment)` | 238 | Kiểm tra comment đặt hàng |
| `renderCommentModalComments(comments, scrollToPurchase)` | 258 | Render danh sách bình luận |
| `handleCommentModalReply(commentId, postId)` | 582 | Xử lý khi nhấn "Trả lời" |
| `cancelCommentReply()` | 648 | Hủy reply mode |
| `setCommentReplyType(type)` | 679 | Toggle reply type |
| `sendCommentReply()` | 731 | Gửi reply comment |

---

### 📤 Flow Gửi Reply Comment

#### Luồng Tổng Quan

```
User nhấn "Trả lời" → handleCommentModalReply()
      ↓
1. Lưu commentModalParentId
2. Fetch inbox_preview để lấy threadId, threadKey, inboxConvId
3. Hiển thị reply preview
4. Kích hoạt input
      ↓
User nhập tin → sendCommentReply()
      ↓
Kiểm tra commentReplyType
      ↓
┌─────────────┴─────────────┐
↓                           ↓
reply_comment          private_replies
(Công khai trên post)   (Messenger riêng)
      ↓
POST API Pancake → Refresh comments
```

#### Payload Gửi Reply

**1. REPLY COMMENT (công khai):**
```javascript
{
    action: 'reply_comment',
    message_id: "commentId",
    message: "nội dung reply"
    // Optional: content_url (image URL), mentions
}
```

**2. PRIVATE REPLIES (Messenger riêng):**
```javascript
{
    action: 'private_replies',
    post_id: "pageId_postId",
    message_id: "commentId",
    from_id: "psid",
    message: "nội dung tin nhắn"
}
```

#### API Endpoint

```
POST https://pages.fm/api/v1/pages/{pageId}/conversations/{commentId}/messages
    ?page_access_token={pageAccessToken}
```

> **Lưu ý:** `conversationId = commentId` cho cả `reply_comment` và `private_replies`

---

### 🎨 Logic Render Bình Luận

#### Hàm `renderCommentModalComments()` (dòng 258-577)

**Flow xử lý:**
```javascript
1. Sort comments theo thời gian (cũ → mới)
2. Map từng comment:
   - Xác định isOwner (owner vs customer)
   - Kiểm tra isPurchaseComment → highlight
   - Lấy avatar URL
   - Escape HTML + convert URLs to links
   - Xử lý attachments (image, audio, sticker, GIF)
   - Xử lý reactions
   - Render nested replies (comment.Messages)
   - Thêm nút "Trả lời" cho customer comments
3. Render loading indicator nếu còn cursor
4. Render post context nếu có Object data
5. Scroll đến purchase comment hoặc bottom
```

#### Xử Lý Attachments (dòng 339-404)

| Loại | Điều kiện | Render |
|------|-----------|--------|
| Image (cũ) | `att.Type === 'image'` | `<img>` |
| Audio | `att.mime_type === 'audio/mp4'` | `<audio controls>` |
| Photo | `att.type === 'photo'` | `<img onclick>` |
| Image (mime) | `att.mime_type.startsWith('image/')` | `<img onclick>` |
| Sticker | `att.type === 'sticker'` | `<img max-width:150px>` |
| Sticker (alt) | `att.sticker_id` | `<img max-width:150px>` |
| Animated GIF | `att.type === 'animated_image_share'` | `<img max-width:200px>` |

#### Xử Lý Reactions (dòng 406-432)

```javascript
const reactions = comment.reactions || comment.reaction_summary;
// Format: { LIKE: 2, LOVE: 1, HAHA: 0, ... }

const reactionIcons = {
    'LIKE': '👍', 'LOVE': '❤️', 'HAHA': '😆',
    'WOW': '😮', 'SAD': '😢', 'ANGRY': '😠', 'CARE': '🤗'
};

Object.entries(reactions).forEach(([type, count]) => {
    if (count > 0) {
        // Render badge với emoji + count
    }
});
```

#### Purchase Comment Highlight (dòng 238-253)

```javascript
function isPurchaseCommentCheck(comment) {
    // So sánh với window.purchaseCommentId
    // Format: "postId_commentId"
    // Trả về true nếu match → thêm class 'purchase-comment-highlight'
}
```

---

### 🔄 Toggle Reply Type

#### Hàm `setCommentReplyType(type)` (dòng 679-715)

**Trigger:** Nhấn nút toggle trong reply container

```javascript
// type = 'reply_comment' hoặc 'private_replies'
commentReplyType = type;

// Cập nhật UI buttons
if (type === 'reply_comment') {
    btnPublic.style.border = '2px solid #22c55e';  // Green
    replyInput.placeholder = 'Nhập nội dung reply công khai...';
} else {
    btnPrivate.style.border = '2px solid #3b82f6'; // Blue
    replyInput.placeholder = 'Nhập tin nhắn riêng qua Messenger...';
}
```

---

### 🔗 Tích Hợp Với Unified Chat Modal

Hiện tại `openCommentModal()` đã được refactor để redirect:

```javascript
window.openCommentModal = async function (orderId, channelId, psid) {
    // Redirect đến unified chat modal với type='comment'
    return window.openChatModal(orderId, channelId, psid, 'comment');
};
```

→ Cho phép users toggle giữa INBOX và COMMENT trong cùng 1 modal.

---

### Dependencies

| Module | Sử dụng |
|--------|---------|
| `window.pancakeTokenManager` | Lấy `page_access_token` |
| `window.pancakeDataManager` | Fetch comments, inbox_preview |
| `window.chatDataManager` | Fetch comments |
| `window.tokenManager` | Auth headers cho TPOS API |
| `window.notificationManager` | Hiển thị notifications |
| `window.formatTimeVN` | Format thời gian |
| `API_CONFIG.smartFetch` | Fetch với retry logic |

---

*Cập nhật lần cuối: 2025-12-16 (Thêm documentation Comment Modal chi tiết)*
