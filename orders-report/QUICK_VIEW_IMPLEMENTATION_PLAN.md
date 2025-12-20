# Quick View Tab - Implementation Plan

> **Mục đích**: Xem nhanh 50 đơn mới nhất để xử lý trong livestream
> **Target**: Load time < 500ms, Auto-refresh 5s

---

## 1. Tổng Quan Kiến Trúc

### 1.1 File Structure
```
orders-report/
├── tab-quick-view.html    # HTML + inline modals
├── tab-quick-view.css     # Styles riêng
├── tab-quick-view.js      # Logic chính
└── main.html              # Thêm tab mới
```

### 1.2 Iframe Architecture (theo ARCHITECTURE.md)
- Tab được load trong iframe riêng biệt
- Giao tiếp với main.html qua `postMessage`
- Load độc lập, không ảnh hưởng tabs khác

---

## 2. Core Managers Cần Reuse

| Manager | File | Chức năng | Cách import |
|---------|------|-----------|-------------|
| `API_CONFIG` | api-config.js | Proxy URLs, smartFetch | `<script src="api-config.js">` |
| `tokenManager` | token-manager.js | Auth headers | `<script src="token-manager.js">` |
| `cacheManager` | cache.js | Cache orders | `<script src="cache.js">` |
| `authManager` | auth.js | User info, định danh | `<script src="auth.js">` |
| `notificationManager` | notification-system.js | Toast notifications | `<script src="notification-system.js">` |
| `pancakeTokenManager` | pancake-token-manager.js | Pancake JWT | `<script src="pancake-token-manager.js">` |
| `pancakeDataManager` | pancake-data-manager.js | Messages API | `<script src="pancake-data-manager.js">` |

---

## 3. Columns Cần Hiển Thị (13 cột)

| # | Column | Data Field | Width | Notes |
|---|--------|------------|-------|-------|
| 1 | STT | SessionIndex | 50px | Index trong session |
| 2 | Tên KH | Name/PartnerName | 150px | Link mở chat |
| 3 | SĐT | Telephone | 120px | Copy button |
| 4 | TAG | Tags (JSON) | 200px | Modal edit + Quick buttons |
| 5 | Ghi chú | Note | 200px | Inline edit |
| 6 | Công nợ | AmountDepot (calc) | 100px | Red if > 0 |
| 7 | Địa chỉ | Address | 200px | Full address |
| 8 | QR | - | 60px | QR button |
| 9 | Chat | - | 60px | Chat + Comment buttons |
| 10 | Sửa đơn | - | 60px | Edit button |
| 11 | Tổng tiền | Revenue | 100px | Formatted |
| 12 | Đã CK | - | 80px | Calculated |
| 13 | Ngày tạo | DateCreated | 120px | Relative time |

### Columns KHÔNG bao gồm:
- Checkbox (không cần chọn hàng loạt)
- Trạng thái (không cần filter)
- Số lượng SP (không cần xem chi tiết)
- Nhân viên xử lý (không cần chia phạm vi)

---

## 4. Features Chi Tiết

### 4.1 TAG System (copy từ tab1-orders.js)

**Functions cần copy:**
```javascript
// #TAG section - Dòng 505-600 trong tab1-orders.js
- updateTagCellOnly(orderId, orderCode, tags)  // Partial cell update
- parseOrderTags(tagsJson, orderId, orderCode)  // Render tag HTML
- openTagModal(orderId, orderCode)  // Mở modal
- saveTagsForOrder(orderId)  // Lưu tags
- quickAssignTag(orderId, orderCode, tagType)  // Quick assign
- loadAvailableTags()  // Load tag list
```

**Modal HTML:** Copy từ tab1-orders.html (tagModal section)

**Firebase Sync:**
```javascript
// Listen for tag updates from other users
database.ref('tag_updates').orderByChild('timestamp')
    .startAt(Date.now())
    .on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data.updatedBy !== currentUserIdentifier) {
            updateTagCellOnly(data.orderId, data.orderCode, data.tags);
        }
    });
```

### 4.2 QR System (copy từ tab1-orders.js)

**Functions cần copy:**
```javascript
// #QR-DEBT section - Dòng 19890-20040
const QR_BANK_CONFIG = {
    bin: '970416',
    name: 'ACB',
    accountNo: '75918',
    accountName: 'LAI THUY YEN NHI'
};

- generateVietQRUrl(uniqueCode, amount)
- showOrderQRModal(phone, amount, options)
- closeOrderQRModal()
- copyQRCodeFromModal(uniqueCode)
- getOrCreateQRForPhone(phone)  // Firebase storage
- normalizePhoneForQR(phone)
```

**Modal HTML:** Copy từ tab1-orders.html (orderQRModal section)

### 4.3 Chat System (simplified)

**Functions cần implement:**
```javascript
// Open chat modal - redirect to main tab1
function openQuickViewChat(orderId, channelId, psid) {
    // Option 1: Redirect to Tab 1 with order focused
    window.parent.postMessage({
        type: 'OPEN_CHAT_IN_TAB1',
        orderId: orderId,
        channelId: channelId,
        psid: psid
    }, '*');

    // Option 2: Simple modal with basic message view (lighter)
    showSimpleChatModal(orderId, channelId, psid);
}

// Button to view all comments
function viewComments(orderId, channelId, psid) {
    window.parent.postMessage({
        type: 'OPEN_COMMENTS_IN_TAB1',
        orderId: orderId,
        channelId: channelId,
        psid: psid
    }, '*');
}
```

**Simple Chat Modal:** Simplified version hiển thị 10 tin nhắn cuối + input gửi

### 4.4 Edit Order

**Approach:** Redirect to Tab 1 (reuse existing modal)
```javascript
function editOrder(orderId) {
    window.parent.postMessage({
        type: 'OPEN_EDIT_IN_TAB1',
        orderId: orderId
    }, '*');
}
```

### 4.5 Debt Display

**Logic:**
```javascript
function calculateDebt(order) {
    const total = order.Revenue || order.AmountTotal || 0;
    const paid = order.AmountDepot || 0;  // Đã thanh toán
    return total - paid;
}
```

**Display:**
```html
<td class="${debt > 0 ? 'debt-warning' : ''}">
    ${debt > 0 ? formatCurrency(debt) : 'Đủ'}
</td>
```

### 4.6 Notes (Inline Edit)

```javascript
function renderNoteCell(order) {
    return `
        <div class="note-cell" data-order-id="${order.Id}">
            <span class="note-text">${order.Note || ''}</span>
            <button class="note-edit-btn" onclick="editNote('${order.Id}')">
                <i class="fas fa-edit"></i>
            </button>
        </div>
    `;
}

async function saveNote(orderId, newNote) {
    // PATCH to TPOS API
    const response = await API_CONFIG.smartFetch(
        `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})`,
        {
            method: 'PATCH',
            headers: await window.tokenManager.getAuthHeader(),
            body: JSON.stringify({ Note: newNote })
        }
    );
    if (response.ok) {
        updateNoteCellOnly(orderId, newNote);
    }
}
```

---

## 5. Auto-Refresh System

### 5.1 Configuration
```javascript
const REFRESH_INTERVALS = [3000, 5000, 10000, 15000, 30000, 60000];
let currentRefreshInterval = 5000; // Default 5s
let refreshTimer = null;
let isModalOpen = false;
```

### 5.2 Smart Refresh Logic
```javascript
async function smartRefresh() {
    if (isModalOpen) {
        console.log('[REFRESH] Modal open, skipping full refresh');
        return;
    }

    const previousScrollTop = tableBody.scrollTop;
    const focusedElement = document.activeElement;

    // Fetch new data
    const newData = await fetchLatest50Orders();

    // Compare and update only changed rows
    newData.forEach((newOrder, index) => {
        const existingRow = document.querySelector(`tr[data-order-id="${newOrder.Id}"]`);
        if (existingRow) {
            // Compare hash of important fields
            if (hasOrderChanged(displayedData[index], newOrder)) {
                updateRowCells(existingRow, newOrder);
            }
        } else {
            // New order - prepend to table
            prependNewRow(newOrder);
        }
    });

    // Restore scroll position
    tableBody.scrollTop = previousScrollTop;

    // Restore focus if still exists
    if (focusedElement && document.contains(focusedElement)) {
        focusedElement.focus();
    }
}

function hasOrderChanged(oldOrder, newOrder) {
    // Compare key fields
    return oldOrder.Tags !== newOrder.Tags ||
           oldOrder.Note !== newOrder.Note ||
           oldOrder.Revenue !== newOrder.Revenue ||
           oldOrder.AmountDepot !== newOrder.AmountDepot;
}
```

### 5.3 Interval Selector UI
```html
<div class="refresh-control">
    <select id="refreshIntervalSelect" onchange="updateRefreshInterval(this.value)">
        <option value="3000">3s</option>
        <option value="5000" selected>5s</option>
        <option value="10000">10s</option>
        <option value="15000">15s</option>
        <option value="30000">30s</option>
        <option value="60000">60s</option>
    </select>
    <button onclick="saveDefaultInterval()" title="Lưu mặc định">
        <i class="fas fa-save"></i>
    </button>
    <span id="lastRefreshTime">Vừa xong</span>
</div>
```

### 5.4 Save Default to localStorage
```javascript
const REFRESH_STORAGE_KEY = 'quickViewRefreshInterval';

function saveDefaultInterval() {
    localStorage.setItem(REFRESH_STORAGE_KEY, currentRefreshInterval);
    showNotification('Đã lưu mặc định', 'success');
}

function loadDefaultInterval() {
    const saved = localStorage.getItem(REFRESH_STORAGE_KEY);
    if (saved) {
        currentRefreshInterval = parseInt(saved, 10);
        document.getElementById('refreshIntervalSelect').value = saved;
    }
}
```

---

## 6. Data Fetching Strategy

### 6.1 Initial Load (Fast)
```javascript
async function loadLatest50Orders() {
    showLoading(true);
    const startTime = performance.now();

    const headers = await window.tokenManager.getAuthHeader();
    const response = await API_CONFIG.smartFetch(
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order?' +
        '$orderby=DateCreated desc&' +
        '$top=50&' +
        '$select=Id,Code,Name,PartnerName,Telephone,Tags,Note,Address,Revenue,AmountDepot,AmountTotal,DateCreated,CRMTeamId,Facebook_UserId&' +
        '$expand=Partner($select=Name,Telephone)',
        { headers }
    );

    if (response.ok) {
        const data = await response.json();
        displayedData = data.value || [];
        renderTable();
    }

    const loadTime = performance.now() - startTime;
    console.log(`[QUICK-VIEW] Loaded in ${loadTime.toFixed(0)}ms`);
    showLoading(false);
}
```

### 6.2 Pagination (None - fixed 50)
- Không có load more
- Không có infinite scroll
- Luôn show 50 orders mới nhất

---

## 7. Partial Cell Update Pattern

### 7.1 Core Pattern (từ ARCHITECTURE.md)
```javascript
function updateCellOnly(orderId, columnName, newContent) {
    const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
    if (!row) return;

    const cell = row.querySelector(`td[data-column="${columnName}"]`);
    if (!cell) return;

    // Only update innerHTML, không re-render whole row
    cell.innerHTML = newContent;
}
```

### 7.2 Update Functions
```javascript
function updateTagCellOnly(orderId, orderCode, tags) { ... }
function updateNoteCellOnly(orderId, note) { ... }
function updateDebtCellOnly(orderId, revenue, paid) { ... }
```

---

## 8. Modal State Management

### 8.1 Track Modal State
```javascript
let activeModal = null; // 'tag' | 'qr' | 'chat' | null

function setModalOpen(modalName) {
    activeModal = modalName;
    isModalOpen = true;
}

function setModalClosed() {
    activeModal = null;
    isModalOpen = false;
}
```

### 8.2 Modal Close Handlers
```javascript
function closeTagModal() {
    document.getElementById('tagModal').classList.remove('show');
    setModalClosed();
}

// Similar for other modals...
```

---

## 9. Communication with main.html

### 9.1 PostMessage Types
```javascript
// Quick View → Main
{
    type: 'OPEN_CHAT_IN_TAB1',
    orderId: '123',
    channelId: 'abc',
    psid: 'xyz'
}

{
    type: 'OPEN_COMMENTS_IN_TAB1',
    ...
}

{
    type: 'OPEN_EDIT_IN_TAB1',
    orderId: '123'
}

// Main → Quick View (optional)
{
    type: 'ORDER_UPDATED',
    orderId: '123',
    changes: { Tags: '...', Note: '...' }
}
```

### 9.2 Listener in main.html
```javascript
window.addEventListener('message', (event) => {
    if (event.data.type === 'OPEN_CHAT_IN_TAB1') {
        // Switch to Tab 1
        switchToTab('tab1');
        // Open chat modal
        setTimeout(() => {
            const iframe = document.getElementById('tab1-iframe');
            iframe.contentWindow.openChatModal(
                event.data.orderId,
                event.data.channelId,
                event.data.psid
            );
        }, 100);
    }
});
```

---

## 10. Firebase Realtime Listeners

### 10.1 Tag Updates
```javascript
function setupTagRealtimeListener() {
    if (!database) return;

    database.ref('tag_updates')
        .orderByChild('timestamp')
        .startAt(Date.now())
        .on('child_added', handleTagUpdate);
}

function handleTagUpdate(snapshot) {
    const data = snapshot.val();
    // Only update if from different user
    if (data.updatedBy !== currentUserIdentifier) {
        const order = displayedData.find(o => o.Id === data.orderId);
        if (order) {
            order.Tags = JSON.stringify(data.tags);
            updateTagCellOnly(data.orderId, data.orderCode, data.tags);
        }
    }
}
```

---

## 11. CSS Structure

### 11.1 Main Layout
```css
.quick-view-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 12px;
}

.quick-view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #e5e7eb;
}

.quick-view-table-container {
    flex: 1;
    overflow-y: auto;
}

.quick-view-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
```

### 11.2 Tag Styles (copy từ tab1-orders.css)
- `.tag-badge`
- `.tag-icon-btn`
- `.quick-tag-btn`

### 11.3 Debt Warning
```css
.debt-warning {
    color: #dc2626;
    font-weight: 600;
}
```

---

## 12. Script Loading Order

```html
<!-- tab-quick-view.html -->

<!-- 1. Core Dependencies -->
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>

<!-- 2. Core Managers -->
<script src="api-config.js"></script>
<script src="token-manager.js"></script>
<script src="cache.js"></script>
<script src="auth.js"></script>
<script src="notification-system.js"></script>
<script src="pancake-token-manager.js"></script>
<script src="pancake-data-manager.js"></script>

<!-- 3. Tab Specific -->
<script src="tab-quick-view.js"></script>
```

---

## 13. Error Handling

```javascript
function handleError(error, context) {
    console.error(`[QUICK-VIEW] ${context}:`, error);

    if (window.notificationManager) {
        notificationManager.error(`Lỗi: ${error.message}`);
    }

    // Continue with cached data if available
    if (context === 'FETCH' && displayedData.length > 0) {
        console.log('[QUICK-VIEW] Using cached data');
        return;
    }
}
```

---

## 14. Implementation Steps

### Phase 1: Base Structure
1. Create `tab-quick-view.html` với script imports và basic layout
2. Create `tab-quick-view.css` với table styles
3. Create `tab-quick-view.js` với data fetching và render

### Phase 2: Core Features
4. Implement TAG system (modal + partial update)
5. Implement QR system (modal)
6. Implement Note inline edit

### Phase 3: Integration
7. Add postMessage handlers cho Chat/Edit
8. Update main.html để add tab
9. Setup Firebase realtime listeners

### Phase 4: Auto-Refresh
10. Implement smart refresh với modal awareness
11. Add interval selector + save default

### Phase 5: Testing
12. Test load performance (target < 500ms)
13. Test auto-refresh với modal open
14. Test cross-tab communication

---

## 15. Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Initial load | < 500ms | `performance.now()` |
| Refresh time | < 200ms | Skip if modal open |
| Memory usage | < 50MB | Chrome DevTools |
| DOM nodes | < 2000 | `document.querySelectorAll('*').length` |

---

**Last Updated:** 2024-12-19
**Author:** Claude Code
**Version:** 1.0
