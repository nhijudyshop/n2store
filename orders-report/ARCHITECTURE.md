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

## Cac File JS Nho (Utility/Manager)

| File | Dong | Chuc nang |
|------|------|-----------|
| `message-template-manager.js` | 1,586 | Quan ly message templates |
| `quick-reply-manager.js` | 1,609 | Quick reply autocomplete |
| `pancake-data-manager.js` | 1,856 | Tich hop Pancake.vn API |
| `dropped-products-manager.js` | 1,339 | Theo doi san pham roi |
| `notification-system.js` | 649 | Toast notifications |
| `realtime-manager.js` | 495 | Realtime updates |
| `token-manager.js` | 513 | Auth token management |
| `cache.js` | 196 | Caching layer |
| `api-config.js` | 205 | API endpoints |

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

*Cập nhật lần cuối: 2025-12-15*
