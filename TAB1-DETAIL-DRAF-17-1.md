# Tab1-Order: Flow và Tính Năng Chi Tiết

## Tổng Quan

Tab1-Order là module quản lý đơn hàng (Sale Online Orders) trong hệ thống orders-report. Module này cho phép xem, tìm kiếm, lọc, chỉnh sửa đơn hàng và tương tác với khách hàng qua tin nhắn/bình luận.

---

## Cấu Trúc Files

```
orders-report/js/tab1/
├── tab1-core.js          # Global variables, state management, cache
├── tab1-init.js          # Khởi tạo app, event listeners, Firebase connection
├── tab1-table.js         # Render bảng, sorting, infinite scroll, status modals
├── tab1-search.js        # Tìm kiếm, lọc theo employee/status/tag/conversation
├── tab1-edit-modal.js    # Modal chỉnh sửa đơn hàng chi tiết
├── tab1-tags.js          # Quản lý tags (gán, xóa, quick assign)
├── tab1-bulk-tags.js     # Gán tag hàng loạt
├── tab1-chat.js          # Modal chat tin nhắn
├── tab1-firebase.js      # Firebase realtime sync (tags, employee ranges)
├── tab1-employee.js      # Quản lý phân chia nhân viên theo STT range
├── tab1-merge.js         # Gộp đơn hàng cùng SĐT
├── tab1-qr-debt.js       # QR code và công nợ khách hàng
├── tab1-sale.js          # Tạo phiếu bán hàng (PBH)
├── tab1-fast-sale.js     # Tạo nhanh PBH nhiều đơn
├── tab1-encoding.js      # Decode/encode ghi chú sản phẩm
├── tab1-checkbox.js      # Quản lý checkbox selection
├── tab1-address-stats.js # Thống kê địa chỉ
├── tab1-campaign-*.js    # Quản lý campaigns
└── tab1-pancake-settings.js # Cài đặt Pancake integration
```

---

## Flow Khởi Tạo (Initialization Flow)

```
DOMContentLoaded
    │
    ├── 1. Apply font size từ localStorage
    ├── 2. Cleanup localStorage nếu gần quota (>4MB)
    ├── 3. Clear cache orders/campaigns
    ├── 4. Set default dates (30 ngày trước → hiện tại)
    ├── 5. Setup event listeners cho các buttons
    ├── 6. Initialize Token Managers (TPOS, Pancake)
    ├── 7. Initialize Realtime Manager
    ├── 8. Setup Firebase TAG listeners (deferred 1s)
    │
    └── initializeApp()
            │
            ├── Wait Firebase ready (max 10s)
            ├── Load data parallel:
            │   ├── loadAllCampaigns()
            │   ├── loadActiveCampaignId()
            │   └── loadEmployeeRangesForCampaign()
            │
            ├── Check active campaign
            │   ├── Có dates → continueAfterCampaignSelect()
            │   └── Không dates → showCampaignNoDatesModal()
            │
            └── Fallback: Auto-select campaign mới nhất
```

---

## State Management (Global Variables)

**File: `tab1-core.js`**

| Variable | Type | Mô tả |
|----------|------|-------|
| `allData` | Array | Tất cả đơn hàng đã fetch |
| `filteredData` | Array | Đơn hàng sau khi filter |
| `displayedData` | Array | Đơn hàng đang hiển thị (sau employee filter) |
| `employeeRanges` | Array | Cấu hình phân chia STT theo nhân viên |
| `selectedOrderIds` | Set | IDs các đơn đang được chọn |
| `currentSortColumn` | String | Cột đang sort (phone/address/debt/total/quantity) |
| `currentSortDirection` | String | Hướng sort (asc/desc/null) |
| `currentEditOrderData` | Object | Data đơn hàng đang edit trong modal |
| `orderDetailsCache` | Map | Cache order details (TTL: 5 phút, max 50 entries) |
| `searchQuery` | String | Query tìm kiếm hiện tại |
| `availableTags` | Array | Danh sách tags có sẵn |
| `ordersWithKPIBase` | Set | Order IDs đã lưu KPI BASE |

---

## API Endpoints

Tất cả API đi qua Cloudflare Worker proxy: `https://chatomni-proxy.nhijudyshop.workers.dev`

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/odata/SaleOnline_Order/ODataService.GetView` | GET | Lấy danh sách đơn hàng |
| `/api/odata/SaleOnline_Order({id})?$expand=Details,Partner,User,CRMTeam` | GET | Lấy chi tiết 1 đơn hàng |
| `/api/odata/SaleOnline_Order({id})` | PUT | Cập nhật đơn hàng |
| `/api/odata/SaleOnline_Order/OdataService.UpdateStatusSaleOnline` | POST | Cập nhật trạng thái đơn |
| `/api/odata/Partner({id})/ODataService.UpdateStatus` | POST | Cập nhật trạng thái partner |
| `/api/odata/TagSaleOnlineOrder/ODataService.AssignTag` | POST | Gán tag cho đơn |
| `/api/odata/SaleOnline_LiveCampaign` | GET | Lấy danh sách campaigns |
| `/api/odata/AuditLog/ODataService.GetAuditLogEntity` | GET | Lịch sử chỉnh sửa |
| `/api/odata/FastSaleOrder/ODataService.GetOrdersByPartnerId` | GET | Lịch sử hóa đơn partner |

---

## Tính Năng Chi Tiết

### 1. Hiển Thị Bảng Đơn Hàng

**File: `tab1-table.js` - Functions: `renderTable()`, `createRowHTML()`**

**Các cột trong bảng:**
- Checkbox (chọn đơn)
- Thao tác (Edit, Quick Tag)
- STT (SessionIndex) + icon đơn gộp + KPI BASE indicator
- Nhân viên (badge màu)
- TAG (buttons + tag badges)
- Mã ĐH (Code)
- Khách hàng (Name + Partner Status badge)
- SĐT (Telephone + Copy button)
- Tin nhắn (last message preview + unread indicator)
- Bình luận (last comment preview + unread indicator)
- QR (QR code button)
- Công Nợ (debt amount)
- Địa chỉ (Address)
- Ghi chú (Note - decoded nếu có)
- Tổng tiền (TotalAmount)
- SL (TotalQuantity)
- Ngày tạo (DateCreated)
- Trạng thái (Status badge - clickable)

**Chế độ hiển thị:**
- **Admin**: Hiển thị tất cả đơn trong 1 bảng
- **Nhân viên**: Hiển thị theo sections (group by employee), mỗi section có thống kê riêng

**Infinite Scroll:**
- Initial: 50 đơn đầu tiên
- Load more: 50 đơn mỗi lần scroll gần bottom
- Batch fetch debts cho tất cả phones

---

### 2. Đơn Hàng Gộp (Merged Orders)

**Khi nhiều đơn có cùng SĐT:**
- Hiển thị icon link (`fa-link`)
- Dropdown chọn đơn để edit (theo STT)
- Cột Messages/Comments: hiển thị theo từng STT riêng
- Cột Total/Quantity: hiển thị chi tiết theo từng STT

---

### 3. Tìm Kiếm & Lọc

**File: `tab1-search.js`**

**Search query tìm trong:**
- STT (SessionIndex)
- Mã đơn (Code)
- Tên KH (Name)
- SĐT (Telephone)
- Địa chỉ (Address)
- Ghi chú (Note)
- Trạng thái (StatusText)

**Các bộ lọc:**
- **Employee Range Filter**: Lọc theo STT range của nhân viên (nếu không phải admin)
- **Status Filter**: Draft, Confirmed, Cancelled...
- **Tag Filter**: Lọc theo tag cụ thể
- **Conversation Filter**: Lọc theo tin nhắn/comment (unread/read)

**Flow lọc:**
```
allData
  → matchesSearchQuery()
  → Employee STT Range filter
  → Status filter
  → Tag filter
  → Conversation filter
  → filteredData
  → Sort
  → displayedData
```

---

### 4. Sorting (Sắp xếp)

**File: `tab1-table.js` - Functions: `handleSortClick()`, `applySorting()`**

**Các cột sortable:**
- SĐT (phone) - string
- Địa chỉ (address) - string
- Công nợ (debt) - number (lấy từ cache)
- Tổng tiền (total) - number
- Số lượng (quantity) - number

**Logic sort:**
- Click 1 lần: ASC ▲
- Click 2 lần: DESC ▼
- Click 3 lần: Reset (no sort)
- Empty strings xếp đầu khi ASC

---

### 5. Quản Lý Tags

**Files: `tab1-tags.js`, `tab1-bulk-tags.js`**

**Tính năng:**
- `openTagModal()`: Mở modal quản lý tag cho 1 đơn
- `quickAssignTag()`: Gán nhanh tag "xử lý" hoặc "ok" + định danh user
- `quickRemoveTag()`: Xóa tag nhanh (click X)
- `saveOrderTags()`: Lưu tags via API
- Bulk tag: Gán tag cho nhiều đơn cùng lúc

**Firebase Realtime Sync:**
- Tags sync realtime qua Firebase
- Khi 1 user update tag, tất cả tabs khác sẽ thấy ngay

---

### 6. Edit Order Modal

**File: `tab1-edit-modal.js`**

**Các tabs trong modal:**
1. **Thông tin liên hệ (info)**: Name, Phone, Address, Note
2. **Sản phẩm (products)**: Table sản phẩm với inline edit (quantity, note, price, remove)
3. **Thông tin giao hàng (delivery)**: Shipping details
4. **Lịch sử đơn live (live)**: Thông tin livestream campaign
5. **Thông tin hóa đơn (invoices)**: Invoice details
6. **Lịch sử hóa đơn (invoice_history)**: Partner invoice history
7. **Lịch sử chỉnh sửa (history)**: Audit log timeline

**Inline Product Search:**
- Tìm kiếm sản phẩm trong modal
- Thêm sản phẩm trực tiếp vào đơn

**Save Flow:**
```
saveAllOrderChanges()
  → prepareOrderPayload()
  → Validate
  → PUT API
  → updateOrderInTable()
  → Notification
```

---

### 7. Chat & Comments

**Files: `tab1-chat.js`, `tab1-table.js`**

**Hiển thị trong bảng:**
- Last message preview (truncated 30 chars)
- Unread badge (red dot)
- Unread count
- Icons cho attachments (photo, video, file, sticker, GIF)

**Chat Modal:**
- Xem toàn bộ tin nhắn
- Gửi tin nhắn/hình ảnh
- Paste image support
- Realtime updates via Pancake API

**Comments Modal:**
- Xem bình luận Facebook
- Reply comments

---

### 8. QR Code & Công Nợ

**File: `tab1-qr-debt.js`**

**QR Column:**
- Hiển thị QR button cho mỗi SĐT
- Click để xem/tạo QR

**Debt Column:**
- Batch fetch debts cho tất cả phones (1 API call thay vì N calls)
- Cache debt data
- SSE realtime updates
- Hiển thị số tiền công nợ

---

### 9. Trạng Thái Đơn Hàng & Partner

**File: `tab1-table.js`**

**Order Status Modal:**
- Đơn hàng (green)
- Huỷ bỏ (red)
- Nháp (yellow)

**Partner Status Modal:**
- Bình thường, Khách sỉ (green)
- Bom hàng, Nguy hiểm (red)
- Cảnh báo (yellow)
- Thân thiết (cyan)
- VIP (blue)

---

### 10. Bulk Actions (Chọn nhiều đơn)

**Khi chọn đơn:**
- Hiện thanh action buttons
- 1 đơn: Nút "Tạo nút bán hàng"
- >1 đơn: Nút "Tạo nhanh PBH"

**Selection logic:**
- `handleSelectAll()`: Chọn/bỏ chọn tất cả
- Không cho chọn đơn có TotalQuantity = 0
- Không cho chọn đơn có tag "GIỎ TRỐNG"

---

### 11. Employee Range (Phân chia nhân viên)

**File: `tab1-employee.js`**

**Cấu hình:**
- Mỗi nhân viên được assign một range STT (ví dụ: 1-50, 51-100)
- Load từ Firebase per-campaign
- Nếu user match với range → chỉ thấy đơn trong range đó

**Hiển thị:**
- Nhân viên thấy bảng grouped by employee
- Mỗi section có header với tên NV + thống kê (đơn, SP, tổng tiền)

---

### 12. Date Range Selection

**Inputs:**
- `customStartDate`: Ngày bắt đầu
- `customEndDate`: Ngày kết thúc (auto = startDate + 3 days)

**Khi thay đổi date:**
- Trigger `handleSearch()` → fetch orders mới
- Lưu preference vào Firebase

---

### 13. Cross-Tab Communication

**postMessage events:**
- `REQUEST_TOKEN`: Tab khác request TPOS token
- `TOKEN_RESPONSE`: Trả về token
- `REQUEST_ORDERS_DATA`: Request orders data
- `FILTER_CHANGED`: Thông báo filter thay đổi
- `REQUEST_EMPLOYEE_RANGES`: Request employee config
- `REQUEST_CAMPAIGN_INFO`: Request campaign info

---

## Event Listeners Summary

| Element | Event | Handler |
|---------|-------|---------|
| `loadCampaignsBtn` | click | `handleLoadCampaigns()` |
| `clearCacheBtn` | click | `handleClearCache()` |
| `selectAll` | change | `handleSelectAll()` |
| `campaignFilter` | change | `handleCampaignChange()` |
| `customStartDate` | change | `handleCustomDateChange()` |
| `customEndDate` | change | `handleCustomEndDateChange()` |
| `tableSearchInput` | input | `handleTableSearch()` |
| `searchClearBtn` | click | Clear search |
| `tableWrapper` | scroll | `handleTableScroll()` (infinite scroll) |
| `th[data-column]` | click | `handleSortClick()` (sorting) |
| `tbody checkbox` | change | Update `selectedOrderIds` |
| `Ctrl+Enter` | keydown | Save tags (in tag modal) |
| `Escape` | keydown | Close modals |

---

## Dependencies

**Shared Libraries:**
- `window.authManager` - Authentication
- `window.tokenManager` - TPOS token management
- `window.cacheManager` - Caching
- `window.notificationManager` - Notifications
- `window.chatDataManager` / `window.pancakeDataManager` - Pancake chat data

**Firebase:**
- `firebase.database()` - Realtime DB cho tags, employee ranges, preferences
- `firebase.auth()` - User authentication

**External APIs:**
- TPOS OData API (via Cloudflare Worker proxy)
- Pancake API (chat/comments)

---

## Debug Tips

**Console prefixes:**
```
[TAG-REALTIME]  - Tag sync logs
[PANCAKE]       - Pancake API logs
[CHAT]          - Chat modal logs
[CACHE]         - Cache operations
[APP]           - App initialization
[EMPLOYEE]      - Employee range logs
[UPDATE]        - Order update logs
```

**Check state in browser console:**
```javascript
console.log('allData:', allData.length);
console.log('filteredData:', filteredData.length);
console.log('displayedData:', displayedData.length);
console.log('selectedOrderIds:', selectedOrderIds.size);
console.log('employeeRanges:', employeeRanges);
```

---

## CHI TIẾT CẤU TRÚC API, REALTIME & DATABASE

### 1. Kiến Trúc Tổng Thể

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Tab1)                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   allData   │  │filteredData │  │displayedData│  │ orderDetailsCache   │ │
│  │  (Array)    │  │  (Array)    │  │  (Array)    │  │ (Map, TTL: 5min)    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                │                     │            │
│         └────────────────┴────────────────┴─────────────────────┘            │
│                                    ▲                                         │
│                                    │                                         │
│  ┌─────────────────────────────────┴─────────────────────────────────────┐  │
│  │                         DATA FLOW MANAGER                              │  │
│  │  fetchOrders() → allData → performTableSearch() → displayedData       │  │
│  │                                                                         │  │
│  └─────────────────────────────────┬─────────────────────────────────────┘  │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
┌───────────────────────┐ ┌──────────────────┐ ┌─────────────────────┐
│  Cloudflare Worker    │ │  Firebase RTDB   │ │    Pancake API      │
│  (TPOS API Proxy)     │ │                  │ │                     │
│                       │ │  /tag_updates    │ │  /conversations     │
│  /api/odata/*         │ │  /user_prefs     │ │  /messages          │
│                       │ │  /employee_ranges│ │  /comments          │
│                       │ │  /campaigns      │ │                     │
└───────────┬───────────┘ └────────┬─────────┘ └──────────┬──────────┘
            │                      │                      │
            ▼                      ▼                      ▼
┌───────────────────────┐ ┌──────────────────┐ ┌─────────────────────┐
│      TPOS Server      │ │  Firebase Server │ │   Pancake Server    │
│      (OData API)      │ │                  │ │                     │
└───────────────────────┘ └──────────────────┘ └─────────────────────┘
```

---

### 2. Chi Tiết Tương Tác API

#### 2.1 TPOS OData API (via Cloudflare Worker)

**Base URL:** `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata`

**Progressive Loading Pattern (File: `tab1-search.js` - `fetchOrders()`):**

```
PHASE 1: Initial Load (Blocking)
  ├── Request: GET /SaleOnline_Order/ODataService.GetView
  │             ?$top=50 (INITIAL_PAGE_SIZE)
  │             &$skip=0
  │             &$orderby=DateCreated desc
  │             &$filter=(DateCreated ge {start} and DateCreated le {end})
  │             &$count=true
  │
  ├── Response: { value: [...50 orders], @odata.count: 2500 }
  │
  └── Actions:
      ├── allData = orders (50 items)
      ├── performTableSearch() → Render table immediately
      ├── showInfoBanner("Đã tải 50/2500...")
      └── Start PHASE 2 in background

PHASE 2: Background Loading (Non-blocking)
  ├── Loop: While hasMore && !loadingAborted
  │     ├── Request: GET /SaleOnline_Order/ODataService.GetView
  │     │             ?$top=1000 (PAGE_SIZE)
  │     │             &$skip=50, 1050, 2050...
  │     │
  │     ├── Actions:
  │     │     ├── allData = allData.concat(orders)
  │     │     ├── performTableSearch() every 200 orders (UPDATE_EVERY)
  │     │     └── await 100ms delay (allow UI interaction)
  │     │
  │     └── Check: orders.length < PAGE_SIZE → hasMore = false
  │
  └── Final:
      ├── isLoadingInBackground = false
      ├── performTableSearch() → Final render
      └── sendOrdersDataToOverview() / sendOrdersDataToTab3()
```

**Bottleneck phân tích:**
- **Problem 1:** Fetch 1000 orders/batch → Large payload, high memory
- **Problem 2:** UPDATE_EVERY = 200 → Re-render table 12+ times for 2500 orders
- **Problem 3:** API response không cached → Refresh = full re-fetch

**API Request Flow cho Edit Modal:**
```
openEditModal(orderId)
  │
  ├── Check Cache: orderDetailsCache.get(orderId)
  │     ├── HIT (< 5min old) → Use cached data
  │     └── MISS/EXPIRED → Continue to API
  │
  ├── Request: GET /SaleOnline_Order({orderId})
  │             ?$expand=Details,Partner,User,CRMTeam
  │
  ├── Response: Full order object with related entities
  │
  └── Actions:
      ├── saveOrderDetailsToCache(orderId, data)
      ├── currentEditOrderData = data
      └── renderTabContent('info')
```

**API Request Optimization đã có:**
- `smartFetch()`: Wrapper với retry logic, throttling
- Batch debt fetch: 1 API call cho tất cả phones thay vì N calls
- Order details cache: TTL 5 phút, max 50 entries

---

#### 2.2 Firebase Realtime Database

**File: `tab1-firebase.js`**

**Database Structure:**
```
Firebase RTDB
├── tag_updates/
│   └── {orderId}/
│       ├── orderId: string
│       ├── orderCode: string
│       ├── STT: number
│       ├── tags: Array<{Id, Name, Color}>
│       ├── updatedBy: string
│       └── timestamp: ServerValue.TIMESTAMP
│
├── user_preferences/
│   └── {userId}/
│       ├── activeCampaignId: string
│       └── filter_preferences: {...} (DEPRECATED)
│
├── campaigns/
│   └── {campaignId}/
│       ├── name: string
│       ├── customStartDate: string
│       ├── customEndDate: string
│       └── createdAt: timestamp
│
├── employee_ranges/
│   ├── general/
│   │   └── {rangeId}/
│   │       ├── id: string
│   │       ├── name: string
│   │       ├── start: number
│   │       └── end: number
│   │
│   └── campaigns/
│       └── {campaignName}/
│           └── {rangeId}/ ...
│
└── kpi_base/
    └── {orderId}/
        └── {...KPI data}
```

**Realtime Listeners (File: `tab1-firebase.js`):**

```javascript
// TAG REALTIME SYNC
setupTagRealtimeListeners() {
    database.ref('tag_updates').on('child_changed', handleUpdate);
    database.ref('tag_updates').on('child_added', handleAdd);
}

handleRealtimeTagUpdate(updateData) {
    │
    ├── Validate: Check if order in displayedData (skip if not my range)
    ├── Conflict Check: If currentEditingOrderId === orderId → Close modal
    │
    └── Update:
        ├── allData[index].Tags = JSON.stringify(tags)
        ├── filteredData[index].Tags = ...
        ├── displayedData[index].Tags = ...
        └── updateTagCellOnly() → DOM update without full re-render
}
```

**Performance Issues:**
- **Problem 1:** `child_added` fires for ALL existing data on connect → Check timestamp < 5000ms
- **Problem 2:** Full table re-render on every tag update → Fixed with `updateTagCellOnly()`
- **Problem 3:** No debouncing for rapid tag updates

---

#### 2.3 Pancake API (Chat/Comments)

**File: PancakeDataManager (external)**

**Conversation Loading Flow:**
```
PHASE 2 OPTIMIZATION (Non-blocking):
│
├── Collect unique channelIds from orders
│     channelIds = orders.map(o => parseChannelId(o.Facebook_PostId))
│
├── Set loading state: isLoadingConversations = true
├── Re-render table (shows loading spinners in chat columns)
│
├── Background async:
│     ├── chatDataManager.fetchConversations(true, channelIds)
│     │     └── Uses Type="all" → Fetch messages + comments in 1 request
│     │
│     ├── pancakeDataManager.fetchConversations(true)
│     │     └── Fetch unread counts
│     │
│     └── On complete:
│           ├── isLoadingConversations = false
│           └── performTableSearch() → Re-render with actual data
│
└── User can interact with table while loading
```

**Data Access Pattern:**
```javascript
// Render column
renderMessagesColumn(order) {
    const chatInfo = chatDataManager.getChatInfoForOrder(order);
    const messageInfo = chatDataManager.getLastMessageForOrder(order);
    // Returns: { message, hasUnread, unreadCount, attachments }
}

renderCommentsColumn(order) {
    const commentInfo = chatDataManager.getLastCommentForOrder(channelId, psid, order);
    // Similar structure
}
```

---

### 3. Hiệu Suất (Performance Analysis)

#### 3.1 Các Vấn Đề Hiện Tại

| Vấn Đề | Nguyên Nhân | Impact |
|--------|-------------|--------|
| **Slow Initial Load** | 50 orders → render → fetch remaining 2450 in background | User sees incomplete data |
| **Re-render overhead** | `performTableSearch()` called 12+ times during background load | Janky UI, high CPU |
| **Memory growth** | `allData` array grows to 2500+ items, kept in memory | Tab memory > 500MB |
| **Filter lag** | Every filter change runs `performTableSearch()` on full array | Noticeable delay with 2000+ orders |
| **Firebase listener bloat** | `child_added` fires for all existing entries on reconnect | Unnecessary notifications |
| **No virtualization** | Infinite scroll still creates 2500+ DOM rows | DOM size > 1MB |

#### 3.2 Metrics Hiện Tại (Ước tính)

```
Initial Load (50 orders):
  - API request: ~500ms
  - Parse + render: ~200ms
  - Total: ~700ms ✓

Full Load (2500 orders):
  - API requests: 3 batches × ~800ms = ~2400ms
  - Background render: 12 × ~100ms = ~1200ms
  - Total: ~3600ms (3.6s)

Filter Operation:
  - matchesSearchQuery: O(n) × 7 fields = O(7n)
  - Employee filter: O(n)
  - Status/Tag/Conversation filters: O(n) each
  - Sort: O(n log n)
  - Render: O(n) DOM creation
  - Total: O(n log n) + O(n) render ≈ 200-500ms for 2500 orders

Memory:
  - allData (2500 orders × ~2KB each): ~5MB
  - filteredData (copy): ~5MB
  - displayedData (copy): ~5MB
  - DOM nodes (2500 rows × 18 cells × ~100B): ~4.5MB
  - Total: ~20MB+ just for order table
```

#### 3.3 Các Tối Ưu Đã Có

| Tối Ưu | Mô Tả | File |
|--------|-------|------|
| **Progressive Loading** | Show 50 orders immediately, load rest in background | `tab1-search.js:1167` |
| **Infinite Scroll** | Render only 50 rows initially, load more on scroll | `tab1-table.js:338` |
| **Batch Debt Fetch** | 1 API call for all phones instead of N calls | `tab1-table.js:326` |
| **Order Details Cache** | TTL 5min, max 50 entries for edit modal | `tab1-core.js:236` |
| **Deferred Firebase Setup** | TAG listeners setup after 1s delay | `tab1-init.js:182` |
| **Cell-only TAG Update** | `updateTagCellOnly()` instead of full re-render | `tab1-firebase.js:252` |
| **Non-blocking Conversations** | Chat data loads in background, shows spinner | `tab1-search.js:1196` |
| **Search Debounce** | 300ms debounce on search input | `tab1-search.js:10` |
| **Parallel Init** | Load campaigns, activeCampaign, employeeRanges in parallel | `tab1-init.js:395` |

---

### 4. Đề Xuất Tối Ưu (Recommendations)

#### 4.1 API Layer

| Đề Xuất | Mô Tả | Ưu Tiên |
|---------|-------|---------|
| **API Response Caching** | Cache full order list với key = dateRange, TTL 5min | HIGH |
| **Reduce Batch Size** | 500 orders/batch thay vì 1000 để giảm memory spike | MEDIUM |
| **Delta Updates** | Chỉ fetch orders changed since lastFetch (if API supports) | HIGH |
| **Compression** | Enable gzip compression on Cloudflare Worker | LOW |
| **Field Selection** | $select chỉ fields cần thiết cho table view | HIGH |

**Ví dụ Field Selection:**
```
Hiện tại: Fetch ALL fields (~50 fields per order)
Đề xuất: $select=Id,Code,Name,Telephone,Address,Note,
         TotalAmount,TotalQuantity,Status,StatusText,
         DateCreated,Tags,SessionIndex,PartnerId,
         Facebook_ASUserId,Facebook_PostId,PartnerStatusText
         (~15 fields - Giảm 70% payload)
```

#### 4.2 State Management

| Đề Xuất | Mô Tả | Ưu Tiên |
|---------|-------|---------|
| **Single Source of Truth** | Remove filteredData/displayedData copies, derive on render | HIGH |
| **Immutable Updates** | Use spread operator properly to enable shallow compare | MEDIUM |
| **Memoization** | Memoize filter/sort results với useMemo pattern | HIGH |
| **Lazy Filtering** | Filter only visible items + buffer | MEDIUM |

**Ví dụ Lazy Filtering:**
```javascript
// Hiện tại:
allData.filter(...) // Filter 2500 items
       .sort(...)   // Sort 2500 items
       .map(...)    // Create 2500 row objects

// Đề xuất:
const VISIBLE_COUNT = 50;
const BUFFER = 100; // Extra for smooth scroll

getVisibleOrders(scrollPosition) {
    const startIndex = Math.floor(scrollPosition / ROW_HEIGHT);
    const endIndex = startIndex + VISIBLE_COUNT + BUFFER;

    return allData
        .slice(startIndex, endIndex)
        .filter(matchesFilters)
        .sort(sortFn);
}
```

#### 4.3 Rendering

| Đề Xuất | Mô Tả | Ưu Tiên |
|---------|-------|---------|
| **Virtual Scrolling** | Only render visible rows + small buffer | HIGH |
| **Batch DOM Updates** | Use DocumentFragment for bulk inserts | MEDIUM |
| **Reduce Re-renders** | Debounce performTableSearch during background load | HIGH |
| **CSS Containment** | Use `contain: content` on table rows | LOW |

**Ví dụ Debounce During Background Load:**
```javascript
// Hiện tại (tab1-search.js:1290):
if (allData.length - lastUpdateCount >= UPDATE_EVERY) {
    performTableSearch(); // Called every 200 orders = 12+ times
}

// Đề xuất:
let pendingRerender = false;
if (allData.length - lastUpdateCount >= UPDATE_EVERY) {
    if (!pendingRerender) {
        pendingRerender = true;
        requestAnimationFrame(() => {
            performTableSearch();
            pendingRerender = false;
        });
    }
    lastUpdateCount = allData.length;
}
```

#### 4.4 Firebase

| Đề Xuất | Mô Tả | Ưu Tiên |
|---------|-------|---------|
| **Query Optimization** | Use orderByChild + limitToLast instead of full listener | HIGH |
| **Listener Cleanup** | Proper off() on campaign change | MEDIUM |
| **Batch Writes** | Group multiple tag updates into single transaction | MEDIUM |
| **Index Rules** | Add Firebase indexes for frequently queried paths | HIGH |

**Ví dụ Firebase Index:**
```json
{
  "rules": {
    "tag_updates": {
      ".indexOn": ["timestamp", "orderId"]
    },
    "employee_ranges": {
      "campaigns": {
        "$campaignName": {
          ".indexOn": ["start", "end"]
        }
      }
    }
  }
}
```

---

### 5. Flow Diagrams Chi Tiết

#### 5.1 Order Data Flow

```
User Action: Select Campaign
        │
        ▼
handleCampaignChange()
        │
        ├── cleanupTagRealtimeListeners()
        ├── loadEmployeeRangesForCampaign(campaignName)
        │         │
        │         └── Firebase: employee_ranges/campaigns/{name}
        │
        ▼
handleSearch()
        │
        ├── Validate dates
        ├── Clear cache
        ├── Reset state: allData = [], searchQuery = ""
        │
        ▼
fetchOrders()
        │
        ├── isFetchingOrders = true (guard)
        │
        ├── PHASE 1: First 50 orders (blocking)
        │     │
        │     ├── API: GET /SaleOnline_Order/ODataService.GetView?$top=50
        │     ├── allData = response.value
        │     ├── performTableSearch()
        │     ├── showLoading(false)
        │     │
        │     └── Start background tasks:
        │           ├── chatDataManager.fetchConversations() (non-blocking)
        │           ├── loadAvailableTags() (non-blocking)
        │           └── detectEditedNotes() (non-blocking)
        │
        └── PHASE 2: Remaining orders (background)
              │
              ├── Loop: while hasMore && !loadingAborted
              │     ├── API: GET /SaleOnline_Order/ODataService.GetView?$top=1000&$skip={n}
              │     ├── allData = allData.concat(response.value)
              │     ├── if (count >= UPDATE_EVERY) performTableSearch()
              │     └── await sleep(100ms)
              │
              └── Final:
                    ├── isLoadingInBackground = false
                    ├── performTableSearch()
                    └── sendOrdersDataToOverview()
```

#### 5.2 Filter & Render Flow

```
performTableSearch()
        │
        ├── Search Filter
        │     allData.filter(matchesSearchQuery)
        │     Fields: STT, Code, Name, Telephone, Address, Note, StatusText
        │
        ├── Employee Range Filter (if not admin)
        │     tempData.filter(order => STT >= start && STT <= end)
        │
        ├── Conversation Filter
        │     tempData.filter(hasUnread || !hasUnread)
        │
        ├── Status Filter
        │     tempData.filter(order.Status === filter)
        │
        ├── Tag Filter
        │     tempData.filter(order.Tags includes tagId)
        │
        ├── Assign to filteredData
        │
        ├── Search Priority Sort (if searchQuery)
        │     Sort by: STT match > Phone match > Name match
        │
        ├── resetSorting() → Clear column sort
        │
        ├── displayedData = filteredData
        │
        └── renderTable()
              │
              ├── Check: isAdmin?
              │     ├── YES → renderAllOrders()
              │     └── NO && employeeRanges.length > 0 → renderByEmployee()
              │
              └── renderAllOrders()
                    │
                    ├── isRendering = true
                    ├── renderedCount = INITIAL_RENDER_COUNT (50)
                    ├── initialData = displayedData.slice(0, 50)
                    ├── tbody.innerHTML = initialData.map(createRowHTML).join("")
                    ├── batchFetchDebts(phones)
                    └── isRendering = false
```

#### 5.3 Tag Realtime Sync Flow

```
User A: Save Tag
        │
        ▼
saveOrderTags()
        │
        ├── API: POST /TagSaleOnlineOrder/ODataService.AssignTag
        ├── updateOrderInTable(orderId, { Tags: newTags })
        │
        └── emitTagUpdateToFirebase(orderId, tags)
              │
              └── Firebase: SET tag_updates/{orderId}
                    {
                      orderId, orderCode, STT,
                      tags: [...],
                      updatedBy: "User A",
                      timestamp: ServerValue.TIMESTAMP
                    }

                            │
                            ▼ (Realtime Event)

User B: Receives Update
        │
        ▼
Firebase Listener: child_changed/child_added
        │
        ├── Check: timestamp < 5000ms? (skip old data on connect)
        ├── Check: updatedBy !== currentUser? (skip own updates)
        │
        └── handleRealtimeTagUpdate(updateData)
              │
              ├── Check: order in displayedData? (skip if not my range)
              │
              ├── Conflict Check:
              │     if (currentEditingOrderId === orderId) closeTagModal()
              │
              └── updateTagCellOnly(orderId, orderCode, tags)
                    │
                    ├── Update arrays: allData, filteredData, displayedData
                    ├── Find row in DOM: querySelector(checkbox[value=orderId])
                    ├── Update only td[data-column="tag"] innerHTML
                    └── No scroll jump, no full re-render
```
