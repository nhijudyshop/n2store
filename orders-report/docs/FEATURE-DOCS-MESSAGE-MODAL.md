# MODAL GỬI TIN NHẮN FACEBOOK - Tài liệu chi tiết

> Tab 1 - Orders Report | Tài liệu đầy đủ flow, logic, database, UI

---

## 1. TỔNG QUAN FLOW

```
User chọn đơn hàng (checkbox) → Click "Gửi tin nhắn"
    ↓
Modal hiện ra → Load templates từ Firestore
    ↓
User chọn template → Click "Gửi tin nhắn"
    ↓
Lọc đơn đã gửi (tránh trùng) → Phân phối đơn cho các tài khoản Pancake
    ↓
Gửi song song qua Pancake API (multi-account, round-robin)
    ↓
Nếu lỗi 24h policy → Fallback: Facebook Graph API với MESSAGE_TAG
    ↓
Nếu vẫn lỗi (551) → Fallback: Private Reply qua comment
    ↓
Lưu kết quả → Firestore (message_campaigns) + LocalStorage
    ↓
Hiển thị kết quả (success/error count) → Đóng modal
```

---

## 2. DATABASE / LƯU TRỮ DỮ LIỆU

### 2.1 Firestore Collection: `message_templates`

```javascript
// Document structure
{
  Id: "template_001",           // Document ID (string)
  Name: "Chốt đơn",            // Tên template
  Content: "Dạ chào chị {partner.name},\n\nEm gửi đến mình...", // Nội dung có placeholder
  BodyPlain: "...",             // Legacy field (tương tự Content)
  TypeId: "MESSENGER",         // Loại: "MESSENGER"
  active: true,                // Trạng thái hiển thị
  order: 1,                    // Thứ tự sắp xếp
  createdAt: Timestamp,        // Firestore server timestamp
  DateCreated: "29/1/2026"     // Legacy date string
}

// Query
db.collection('message_templates')
  .where('active', '==', true)
  .orderBy('order', 'asc')
  .get()
```

### 2.2 Firestore Collection: `message_campaigns`

```javascript
// Lưu kết quả mỗi lần gửi hàng loạt
{
  templateName: "Chốt đơn",
  templateId: "template_001",
  templateContent: "Dạ chào chị...",
  totalOrders: 50,
  successCount: 45,
  errorCount: 5,
  successOrders: [
    { Id: "order_123", code: "DH001", customerName: "Kim Thoa", account: "Account1" }
  ],
  errorOrders: [
    {
      orderId: "order_456", code: "DH002", customerName: "Trinh Nguyen",
      error: "24h policy", is24HourError: true,
      Facebook_PostId: "117267091364524_...",
      Facebook_CommentId: "..."
    }
  ],
  accountsUsed: ["Account1", "Account2"],
  delay: 1,                         // Giây delay giữa mỗi tin
  createdAt: ServerTimestamp,        // Server timestamp
  expireAt: Date (7 ngày sau),      // TTL - tự xóa sau 7 ngày
  localCreatedAt: "2026-01-29T10:30:00.000Z"
}
```

### 2.3 LocalStorage Keys

```javascript
// Đơn đã gửi thành công (tránh gửi trùng) - TTL 24h
localStorage['sent_message_orders'] = JSON.stringify({
  "order_123": { timestamp: 1706520000000, viaComment: false },
  "order_456": { timestamp: 1706520000000, viaComment: true }
})

// Đơn gửi thất bại (hiện watermark trên bảng) - TTL 24h
localStorage['failed_message_orders'] = JSON.stringify({
  "order_456": { timestamp: 1706520000000 }
})

// Lịch sử gửi backup (max 100 entries)
localStorage['messageSendHistory'] = JSON.stringify([...campaigns])
```

---

## 3. UI - MODAL HTML STRUCTURE

### 3.1 Modal chính: `messageTemplateModal`

```html
<!-- OVERLAY -->
<div class="message-modal-overlay" id="messageTemplateModal">
  <div class="message-modal">

    <!-- HEADER: gradient tím #667eea → #764ba2 -->
    <div class="message-modal-header">
      <h3><i class="fab fa-facebook-messenger"></i> Gửi tin nhắn Facebook</h3>
      <button class="message-modal-close">✕</button>
    </div>

    <!-- SEARCH SECTION -->
    <div class="message-search-section">
      <div class="message-search-wrapper">
        <div class="message-search-input-wrapper">
          <i class="fas fa-search message-search-icon"></i>
          <input id="messageSearchInput" placeholder="Tìm kiếm template...">
          <button class="message-clear-search" id="messageClearSearch">✕</button>
        </div>
        <button class="message-new-template-btn" id="messageNewTemplate">
          <i class="fas fa-plus"></i> Mẫu mới
        </button>
      </div>
    </div>

    <!-- BODY: Grid 2 cột template cards -->
    <div class="message-modal-body" id="messageModalBody">
      <!-- Template cards rendered here -->
    </div>

    <!-- FOOTER -->
    <div class="message-modal-footer">
      <!-- Row 1: Stats -->
      <div class="message-footer-info">
        <span class="message-result-count">
          <strong id="messageResultCount">4</strong> template
        </span>

        <!-- Account count -->
        <span class="message-setting-item">
          <i class="fas fa-users"></i> ACCOUNTS
          <strong id="messageThreadCount">7</strong>
        </span>

        <!-- Delay setting -->
        <span class="message-setting-item">
          <i class="fas fa-clock"></i> DELAY
          <input type="number" id="messageSendDelay" value="1" min="0" max="30"> giây
        </span>

        <!-- API badge -->
        <span class="message-setting-item">
          <i class="fas fa-plug"></i> API
          <strong>Pancake</strong>
        </span>

        <!-- History button -->
        <button id="messageBtnHistory">
          <i class="fas fa-history"></i> Lịch sử
        </button>
      </div>

      <!-- Row 2: Progress bar (hidden by default) -->
      <div id="messageProgressContainer" style="display:none">
        <span id="messageProgressText">Đang gửi...</span>
        <span id="messageProgressPercent">0%</span>
        <div class="message-progress-bar-bg">
          <div class="message-progress-bar" id="messageProgressBar" style="width:0%"></div>
        </div>
      </div>

      <!-- Row 3: Actions -->
      <div class="message-modal-actions">
        <button class="message-btn-cancel" id="messageBtnCancel">Hủy</button>
        <button class="message-btn-send" id="messageBtnSend" disabled>
          <i class="fas fa-paper-plane"></i> Gửi tin nhắn
        </button>
      </div>
    </div>
  </div>
</div>
```

### 3.2 Template Card Structure

```html
<div class="message-template-item" data-template-id="{id}">
  <!-- Header -->
  <div class="message-template-header">
    <div class="message-template-name">{Name}</div>
    <button onclick="openNewTemplateForm(template)">✏️ Edit</button>
    <span class="message-template-type type-messenger">MESSENGER</span>
  </div>

  <!-- Content preview (max-height 200px, fade gradient) -->
  <div class="message-template-content">
    Dạ chào chị {partner.name},
    Em gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:
    {order.details}
    Đơn hàng của mình sẽ được gửi về địa chỉ "{partner.address}"
  </div>

  <!-- Footer -->
  <div class="message-template-actions">
    <button class="message-expand-btn">▼ Xem thêm</button>
    <div class="message-template-meta">
      <span>📅 29/1/2026</span>
    </div>
  </div>
</div>
```

### 3.3 History Modal

```html
<div class="message-modal-overlay" id="messageHistoryModal">
  <div class="message-modal" style="max-width: 700px;">
    <div class="message-modal-header">
      <h3><i class="fas fa-history"></i> Lịch sử gửi tin nhắn</h3>
      <button class="message-modal-close">✕</button>
    </div>
    <div class="message-modal-body" id="messageHistoryBody">
      <!-- Campaign history cards rendered here -->
      <!-- Mỗi card hiện: tên template, thời gian, success/error count -->
      <!-- Failed orders có nút "Gửi qua Comment" -->
    </div>
  </div>
</div>
```

### 3.4 Quick Comment Modal (cho đơn thất bại)

```html
<div class="message-modal-overlay" id="quickCommentModal">
  <div class="message-modal" style="max-width: 600px;">
    <div class="message-modal-header" style="background: linear-gradient(135deg, #f97316, #ea580c);">
      <h3><i class="fas fa-comment"></i> Gửi lại qua Comment</h3>
      <button class="message-modal-close">✕</button>
    </div>
    <div class="message-modal-body">
      <!-- Facebook post/comment selector -->
      <!-- Template selector with preview -->
      <!-- Send button -->
    </div>
  </div>
</div>
```

---

## 4. CSS STYLING ĐẦY ĐỦ

```css
/* =====================================================
   MESSAGE TEMPLATE MODAL - Facebook Message Templates
   ===================================================== */

/* === MODAL OVERLAY === */
.message-modal-overlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10001;
    backdrop-filter: blur(2px);
    animation: fadeIn 0.2s ease-out;
}

.message-modal-overlay.active {
    display: flex;
    align-items: center;
    justify-content: center;
}

/* === MODAL CONTAINER === */
.message-modal {
    background: white;
    width: 95%;
    max-width: 1000px;
    max-height: 90vh;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease-out;
    overflow: hidden;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from { transform: translateY(50px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

/* === HEADER: Gradient tím === */
.message-modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.message-modal-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
}

.message-modal-header h3 i {
    font-size: 20px;
}

.message-modal-close {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.message-modal-close:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.05);
}

/* === SEARCH SECTION === */
.message-search-section {
    padding: 16px 24px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
}

.message-search-wrapper {
    display: flex;
    gap: 12px;
    align-items: center;
}

.message-search-input-wrapper {
    flex: 1;
    position: relative;
}

.message-search-input {
    width: 100%;
    padding: 10px 40px 10px 40px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: all 0.2s;
}

.message-search-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.message-search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
    font-size: 16px;
}

.message-clear-search {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: #f3f4f6;
    border: none;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: #6b7280;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.message-clear-search.show {
    display: flex;
}

.message-clear-search:hover {
    background: #e5e7eb;
    color: #111827;
}

.message-new-template-btn {
    padding: 10px 16px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: all 0.2s;
}

.message-new-template-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

/* === MODAL BODY === */
.message-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
}

.message-modal-body::-webkit-scrollbar { width: 8px; }
.message-modal-body::-webkit-scrollbar-track { background: #f3f4f6; }
.message-modal-body::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
.message-modal-body::-webkit-scrollbar-thumb:hover { background: #9ca3af; }

/* === TEMPLATE GRID: 2 cột === */
.message-template-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
}

@media (max-width: 800px) {
    .message-template-list {
        grid-template-columns: 1fr;
    }
}

/* === TEMPLATE CARD === */
.message-template-item {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    padding: 18px;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    display: flex;
    flex-direction: column;
}

.message-template-item:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
    transform: translateY(-2px);
}

.message-template-item.selected {
    border-color: #667eea;
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
}

.message-template-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 12px;
}

.message-template-name {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
}

.message-template-type {
    display: inline-block;
    padding: 4px 10px;
    background: #ede9fe;
    color: #7c3aed;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
}

/* === CONTENT PREVIEW === */
.message-template-content {
    font-size: 14px;
    color: #6b7280;
    line-height: 1.6;
    margin-bottom: 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-height: 200px;
    overflow: hidden;
    background: #f9fafb;
    padding: 12px;
    border-radius: 6px;
    border-left: 3px solid #e5e7eb;
    position: relative;
}

/* Fade effect cho nội dung dài */
.message-template-content:not(.expanded)::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: linear-gradient(transparent, #f9fafb);
    pointer-events: none;
}

.message-template-content.expanded {
    max-height: 500px;
    overflow-y: auto;
}

.message-template-content.expanded::-webkit-scrollbar { width: 6px; }
.message-template-content.expanded::-webkit-scrollbar-track { background: #f3f4f6; border-radius: 3px; }
.message-template-content.expanded::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }

/* === TEMPLATE ACTIONS === */
.message-template-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
}

.message-expand-btn {
    background: none;
    border: none;
    color: #667eea;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 0;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s;
}

.message-expand-btn:hover { color: #764ba2; }

.message-template-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #9ca3af;
}

.message-template-meta span {
    display: flex;
    align-items: center;
    gap: 4px;
}

/* === LOADING STATE === */
.message-loading {
    text-align: center;
    padding: 60px 20px;
    color: #6b7280;
}

.message-loading i {
    font-size: 40px;
    color: #667eea;
    margin-bottom: 16px;
    animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* === NO RESULTS === */
.message-no-results {
    text-align: center;
    padding: 60px 20px;
    color: #9ca3af;
}

.message-no-results i {
    font-size: 48px;
    color: #d1d5db;
    margin-bottom: 12px;
}

/* === MODAL FOOTER === */
.message-modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f9fafb;
}

.message-result-count {
    font-size: 13px;
    color: #6b7280;
}

.message-result-count strong {
    color: #111827;
    font-weight: 600;
}

.message-modal-actions {
    display: flex;
    gap: 8px;
}

.message-btn-cancel {
    padding: 10px 20px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
}

.message-btn-cancel:hover {
    border-color: #d1d5db;
    background: #f9fafb;
}

.message-btn-send {
    padding: 10px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}

.message-btn-send:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.message-btn-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* === ACTION BUTTONS (History, Retry) === */
.message-send-btn {
    padding: 8px 12px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}

.message-send-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.message-retry-btn {
    padding: 8px 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
}

.message-retry-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

/* === RESPONSIVE === */
@media (max-width: 768px) {
    .message-modal { width: 95%; max-height: 95vh; }
    .message-search-wrapper { flex-direction: column; }
    .message-new-template-btn { width: 100%; justify-content: center; }
    .message-template-meta { flex-direction: column; gap: 4px; }
    .message-modal-footer { flex-direction: column; gap: 12px; }
    .message-modal-actions { width: 100%; }
    .message-btn-cancel, .message-btn-send { flex: 1; }
}
```

---

## 5. JAVASCRIPT LOGIC ĐẦY ĐỦ

### 5.1 Class MessageTemplateManager - Constructor & State

```javascript
class MessageTemplateManager {
  constructor() {
    this.db = firebase.firestore();
    this.templatesCollection = 'message_templates';
    this.campaignsCollection = 'message_campaigns';
    this.templates = [];
    this.filteredTemplates = [];
    this.selectedTemplateId = null;
    this.orderData = [];           // Đơn hàng cần gửi
    this.mode = 'SEND';           // 'SEND' hoặc 'INSERT'
    this.targetInputId = null;    // Input ID khi mode = INSERT
    this.sentOrderIds = new Set(); // Đơn đã gửi (tránh trùng)

    this.sendingState = {
      isSending: false,
      successOrders: [],
      errorOrders: [],
      totalProcessed: 0,
      totalToProcess: 0
    };

    // Tạo DOM modal
    this.createModalDOM();
    this.bindEvents();
  }
}

// Khởi tạo global instance
window.messageTemplateManager = new MessageTemplateManager();
```

### 5.2 Tạo Modal DOM

```javascript
createModalDOM() {
  const overlay = document.createElement('div');
  overlay.className = 'message-modal-overlay';
  overlay.id = 'messageTemplateModal';
  overlay.innerHTML = `
    <div class="message-modal">
      <!-- Header -->
      <div class="message-modal-header">
        <h3><i class="fab fa-facebook-messenger"></i> Gửi tin nhắn Facebook</h3>
        <button class="message-modal-close" id="messageCloseBtn">&times;</button>
      </div>

      <!-- Search -->
      <div class="message-search-section">
        <div class="message-search-wrapper">
          <div class="message-search-input-wrapper">
            <i class="fas fa-search message-search-icon"></i>
            <input type="text" id="messageSearchInput" placeholder="Tìm kiếm template...">
            <button class="message-clear-search" id="messageClearSearch">&times;</button>
          </div>
          <button class="message-new-template-btn" id="messageNewTemplate">
            <i class="fas fa-plus"></i> Mẫu mới
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="message-modal-body" id="messageModalBody">
        <div class="message-loading">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Đang tải templates...</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="message-modal-footer">
        <div class="message-footer-info">
          <span class="message-result-count"><strong id="messageResultCount">0</strong> template</span>
          <span class="message-setting-item">
            <i class="fas fa-users"></i> <span id="messageThreadCount">0</span>
          </span>
          <span class="message-setting-item">
            <i class="fas fa-clock"></i>
            <input type="number" id="messageSendDelay" value="1" min="0" max="30" style="width:40px">
            giây
          </span>
          <span class="message-setting-item">
            <i class="fas fa-plug"></i> <strong>Pancake</strong>
          </span>
          <button id="messageBtnHistory" class="message-btn-cancel" style="padding:6px 12px;font-size:12px;">
            <i class="fas fa-history"></i> Lịch sử
          </button>
        </div>

        <div id="messageProgressContainer" style="display:none; width:100%; margin:8px 0;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span id="messageProgressText">Đang gửi...</span>
            <span id="messageProgressPercent">0%</span>
          </div>
          <div style="width:100%;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
            <div id="messageProgressBar" style="width:0%;height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:3px;transition:width 0.3s;"></div>
          </div>
        </div>

        <div class="message-modal-actions">
          <button class="message-btn-cancel" id="messageBtnCancel">Hủy</button>
          <button class="message-btn-send" id="messageBtnSend" disabled>
            <i class="fas fa-paper-plane"></i> Gửi tin nhắn
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}
```

### 5.3 Bind Events

```javascript
bindEvents() {
  // Đóng modal
  document.getElementById('messageCloseBtn').onclick = () => this.closeModal();
  document.getElementById('messageBtnCancel').onclick = () => this.closeModal();

  // Click ngoài modal
  document.getElementById('messageTemplateModal').onclick = (e) => {
    if (e.target.classList.contains('message-modal-overlay')) this.closeModal();
  };

  // Search
  document.getElementById('messageSearchInput').oninput = (e) => {
    this.handleSearch(e.target.value);
    const clearBtn = document.getElementById('messageClearSearch');
    clearBtn.classList.toggle('show', e.target.value.length > 0);
  };

  document.getElementById('messageClearSearch').onclick = () => {
    document.getElementById('messageSearchInput').value = '';
    document.getElementById('messageClearSearch').classList.remove('show');
    this.handleSearch('');
  };

  // Tạo template mới
  document.getElementById('messageNewTemplate').onclick = () => this.openNewTemplateForm();

  // Gửi tin nhắn
  document.getElementById('messageBtnSend').onclick = () => this.sendMessage();

  // Lịch sử
  document.getElementById('messageBtnHistory').onclick = () => this.openHistoryModal();
}
```

### 5.4 Mở Modal

```javascript
async openModal(orderData, mode = 'SEND', targetInputId = null) {
  this.mode = mode;
  this.targetInputId = targetInputId;

  // 1. Load danh sách đơn đã gửi từ localStorage (tránh gửi trùng)
  this.loadSentOrderIds();

  // 2. Lọc bỏ đơn đã gửi trong 24h
  const now = Date.now();
  const filtered = orderData.filter(order => {
    const sent = this.sentOrderIds.get(order.Id);
    if (!sent) return true;
    // Cho phép gửi lại nếu đã quá 24h
    return (now - sent.timestamp) > 24 * 60 * 60 * 1000;
  });
  this.orderData = filtered;

  // 3. Load templates từ Firestore
  await this.loadTemplates();

  // 4. Render
  this.renderTemplates();

  // 5. Cập nhật UI theo mode
  this.updateModalUI();

  // 6. Hiện modal
  document.getElementById('messageTemplateModal').classList.add('active');

  // 7. Cập nhật số tài khoản Pancake
  if (window.pancakeTokenManager) {
    const accounts = window.pancakeTokenManager.getValidAccountsForSending();
    document.getElementById('messageThreadCount').textContent = accounts.length;
  }
}

loadSentOrderIds() {
  try {
    const data = JSON.parse(localStorage.getItem('sent_message_orders') || '{}');
    this.sentOrderIds = new Map(Object.entries(data));

    // Xóa entries quá 24h
    const now = Date.now();
    for (const [key, value] of this.sentOrderIds) {
      if (now - value.timestamp > 24 * 60 * 60 * 1000) {
        this.sentOrderIds.delete(key);
      }
    }
  } catch {
    this.sentOrderIds = new Map();
  }
}

updateModalUI() {
  const sendBtn = document.getElementById('messageBtnSend');
  if (this.mode === 'INSERT') {
    sendBtn.innerHTML = '<i class="fas fa-paste"></i> Chèn template';
  } else {
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
  }
}
```

### 5.5 Load & Render Templates

```javascript
async loadTemplates() {
  try {
    const snapshot = await this.db.collection(this.templatesCollection)
      .where('active', '==', true)
      .orderBy('order', 'asc')
      .get();

    this.templates = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    this.filteredTemplates = [...this.templates];

    // Auto-seed nếu chưa có template nào
    if (this.templates.length === 0) {
      await this._seedDefaultTemplates();
      return this.loadTemplates();
    }
  } catch (error) {
    console.error('[MessageTemplate] Load error:', error);
    this.templates = [];
    this.filteredTemplates = [];
  }
}

renderTemplates() {
  const container = document.getElementById('messageModalBody');
  const countEl = document.getElementById('messageResultCount');

  if (this.filteredTemplates.length === 0) {
    container.innerHTML = `
      <div class="message-no-results">
        <i class="fas fa-search"></i>
        <p>Không tìm thấy template nào</p>
      </div>`;
    countEl.textContent = '0';
    return;
  }

  countEl.textContent = this.filteredTemplates.length;

  container.innerHTML = `<div class="message-template-list">
    ${this.filteredTemplates.map(t => this._renderTemplateCard(t)).join('')}
  </div>`;

  // Bind click events cho template cards
  container.querySelectorAll('.message-template-item').forEach(card => {
    card.addEventListener('click', (e) => {
      // Ignore nếu click vào button
      if (e.target.closest('button')) return;
      this.selectTemplate(card.dataset.templateId);
    });
  });

  // Bind expand buttons
  container.querySelectorAll('.message-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const content = btn.closest('.message-template-item').querySelector('.message-template-content');
      content.classList.toggle('expanded');
      btn.innerHTML = content.classList.contains('expanded')
        ? '<i class="fas fa-chevron-up"></i> Thu gọn'
        : '<i class="fas fa-chevron-down"></i> Xem thêm';
    });
  });
}

_renderTemplateCard(template) {
  const contentHtml = (template.Content || template.BodyPlain || '')
    .replace(/\n/g, '<br>')
    .substring(0, 500);

  const dateStr = template.DateCreated ||
    (template.createdAt ? this._formatDate(template.createdAt) : '');

  return `
    <div class="message-template-item ${this.selectedTemplateId === template.id ? 'selected' : ''}"
         data-template-id="${template.id}">
      <div class="message-template-header">
        <div class="message-template-name">${this._escapeHtml(template.Name || 'Không tên')}</div>
        <button onclick="event.stopPropagation(); window.messageTemplateManager.openNewTemplateForm(${JSON.stringify(template).replace(/"/g, '&quot;')})"
                style="background:none;border:none;cursor:pointer;color:#6b7280;padding:4px;">
          <i class="fas fa-edit"></i>
        </button>
        <span class="message-template-type type-messenger">${template.TypeId || 'MESSENGER'}</span>
      </div>
      <div class="message-template-content">${contentHtml}</div>
      <div class="message-template-actions">
        <button class="message-expand-btn">
          <i class="fas fa-chevron-down"></i> Xem thêm
        </button>
        <div class="message-template-meta">
          <span><i class="fas fa-calendar"></i> ${dateStr}</span>
        </div>
      </div>
    </div>`;
}
```

### 5.6 Chọn Template

```javascript
selectTemplate(templateId) {
  this.selectedTemplateId = templateId;

  // Bỏ selected cũ, thêm selected mới
  document.querySelectorAll('.message-template-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.templateId === templateId);
  });

  // Enable nút gửi
  document.getElementById('messageBtnSend').disabled = false;
}
```

### 5.7 Search Templates

```javascript
handleSearch(query) {
  const q = query.toLowerCase().trim();

  if (!q) {
    this.filteredTemplates = [...this.templates];
  } else {
    this.filteredTemplates = this.templates.filter(t => {
      const name = (t.Name || '').toLowerCase();
      const content = (t.Content || t.BodyPlain || '').toLowerCase();
      const type = (t.TypeId || '').toLowerCase();
      return name.includes(q) || content.includes(q) || type.includes(q);
    });
  }

  this.renderTemplates();
}
```

### 5.8 Gửi tin nhắn - Hàm chính

```javascript
async sendMessage() {
  // === MODE INSERT: chỉ chèn vào input ===
  if (this.mode === 'INSERT') {
    const template = this.templates.find(t => t.id === this.selectedTemplateId);
    if (template && this.targetInputId) {
      const input = document.getElementById(this.targetInputId);
      if (input) input.value = template.Content || template.BodyPlain || '';
    }
    this.closeModal();
    return;
  }

  // === MODE SEND ===
  const template = this.templates.find(t => t.id === this.selectedTemplateId);
  if (!template) return;

  const orders = this.orderData;
  if (!orders || orders.length === 0) {
    alert('Không có đơn hàng nào để gửi!');
    return;
  }

  // 1. Lấy tài khoản Pancake hợp lệ
  const accounts = window.pancakeTokenManager.getValidAccountsForSending();
  if (accounts.length === 0) {
    alert('Không có tài khoản Pancake hợp lệ! Vui lòng cài đặt tài khoản.');
    return;
  }

  // 2. Lấy delay
  const delay = parseInt(document.getElementById('messageSendDelay').value) || 1;

  // 3. Reset state
  this.sendingState = {
    isSending: true,
    successOrders: [],
    errorOrders: [],
    totalProcessed: 0,
    totalToProcess: orders.length
  };

  // 4. Disable UI
  document.getElementById('messageBtnSend').disabled = true;
  document.getElementById('messageBtnCancel').disabled = true;
  document.getElementById('messageProgressContainer').style.display = 'block';
  this.updateProgressUI();

  try {
    // 5. Pre-fetch page access tokens
    await this._prefetchPageAccessTokens(accounts);

    // 6. Phân phối đơn cho tài khoản (page-aware round-robin)
    const accountQueues = this._distributeOrdersToAccounts(orders, accounts);

    // 7. Tạo workers song song
    const workers = accounts.map((account, index) =>
      this._processAccountQueue(accountQueues[index], account, template, delay)
    );

    // 8. Chờ hoàn thành
    await Promise.all(workers);

  } catch (error) {
    console.error('[MessageTemplate] Send error:', error);
  }

  // 9. Lưu kết quả
  await this._saveResults(template, accounts, delay);

  // 10. Re-enable UI
  this.sendingState.isSending = false;
  document.getElementById('messageBtnSend').disabled = false;
  document.getElementById('messageBtnCancel').disabled = false;

  // 11. Ẩn progress bar sau 3 giây
  setTimeout(() => {
    document.getElementById('messageProgressContainer').style.display = 'none';
  }, 3000);

  // 12. Đóng modal
  this.closeModal();
}
```

### 5.9 Phân phối đơn cho tài khoản

```javascript
_distributeOrdersToAccounts(orders, accounts) {
  const queues = accounts.map(() => []);
  let currentIndex = 0;

  for (const order of orders) {
    const pageId = order.channelId || order.Facebook_PageId;

    // Tìm account có access token cho page này
    const preferredIndex = accounts.findIndex(acc =>
      acc.pageAccessTokens && acc.pageAccessTokens[pageId]
    );

    if (preferredIndex >= 0) {
      queues[preferredIndex].push(order);
    } else {
      // Fallback: round-robin chuẩn
      queues[currentIndex % accounts.length].push(order);
      currentIndex++;
    }
  }

  return queues;
}

async _processAccountQueue(orders, account, template, delay) {
  for (const order of orders) {
    if (!this.sendingState.isSending) break;

    try {
      await this._processSingleOrder(order, { template, account, delay });
    } catch (error) {
      this.sendingState.errorOrders.push({
        orderId: order.Id,
        code: order.Code,
        customerName: order.CustomerName,
        error: error.message
      });
    }

    this.sendingState.totalProcessed++;
    this.updateProgressUI();

    // Delay giữa mỗi tin
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }
  }
}
```

### 5.10 Xử lý từng đơn hàng

```javascript
async _processSingleOrder(order, context) {
  const { template, account } = context;

  // 1. FETCH DỮ LIỆU ĐẦY ĐỦ (nếu template cần {order.details} hoặc thiếu PartnerId)
  let fullOrderData;
  if (this._needsFullData(template.Content) || !order.PartnerId) {
    fullOrderData = await this._fetchFullOrderData(order.Id);
  } else {
    fullOrderData = order;
  }

  // 2. THAY THẾ PLACEHOLDER
  let messageContent = this._replacePlaceholders(template.Content, fullOrderData);

  // 3. THÊM CHỮ KÝ NHÂN VIÊN
  const displayName = window.authManager?.getCurrentUser()?.displayName;
  if (displayName) {
    messageContent += '\nNv. ' + displayName;
  }

  // 4. LẤY THÔNG TIN CHAT (channelId = Facebook Page ID, psid = Customer PSID)
  const chatInfo = window.pancakeDataManager.getChatInfoForOrder(fullOrderData.raw || fullOrderData);
  const channelId = chatInfo.channelId;
  const psid = chatInfo.psid;

  if (!channelId || !psid) {
    throw new Error('Không tìm thấy thông tin chat cho đơn hàng này');
  }

  // 5. LẤY CONVERSATION ID
  let conversationId;
  const conversation = window.pancakeDataManager.getConversationByUserId(psid);
  if (conversation) {
    conversationId = conversation.id;
  } else {
    // Fetch từ Pancake API
    conversationId = await this._fetchConversationId(channelId, psid, account);
  }

  if (!conversationId) {
    throw new Error('Không tìm thấy conversation');
  }

  // 6. GỬI QUA PANCAKE OFFICIAL API
  const pageAccessToken = window.pancakeTokenManager.getPageAccessToken(channelId);
  const replyUrl = API_CONFIG.buildUrl.pancakeOfficial(
    `pages/${channelId}/conversations/${conversationId}/messages`,
    pageAccessToken
  );

  const payload = {
    action: 'reply_inbox',
    message: messageContent
  };

  const response = await fetch(replyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  // 7. XỬ LÝ KẾT QUẢ
  if (result.success || result.error === false) {
    // Thành công
    this.sendingState.successOrders.push({
      Id: order.Id,
      code: order.Code,
      customerName: order.CustomerName,
      account: account.name
    });
    return;
  }

  // 8. KIỂM TRA LỖI 24H POLICY
  if (this._is24HourPolicyError(result)) {
    // Fallback: Facebook Graph API với MESSAGE_TAG
    try {
      const tagResult = await this._sendViaFacebookTag(order, messageContent, channelId, psid);
      if (tagResult.success) {
        this.sendingState.successOrders.push({
          Id: order.Id, code: order.Code, customerName: order.CustomerName,
          account: 'Facebook Tag', usedTag: tagResult.used_tag
        });
        return;
      }
    } catch (tagError) {
      // Tag cũng thất bại
    }

    // Đánh dấu lỗi 24h
    this.sendingState.errorOrders.push({
      orderId: order.Id, code: order.Code, customerName: order.CustomerName,
      error: 'Quá 24h - Facebook tag thất bại',
      is24HourError: true,
      Facebook_PostId: order.Facebook_PostId,
      Facebook_CommentId: order.Facebook_CommentId
    });
    return;
  }

  // 9. KIỂM TRA LỖI 551 (user unavailable)
  if (this._isUserUnavailableError(result)) {
    this.sendingState.errorOrders.push({
      orderId: order.Id, code: order.Code, customerName: order.CustomerName,
      error: 'Người dùng không có mặt (551)',
      isUserUnavailable: true,
      Facebook_PostId: order.Facebook_PostId,
      Facebook_CommentId: order.Facebook_CommentId
    });
    return;
  }

  // 10. LỖI KHÁC
  this.sendingState.errorOrders.push({
    orderId: order.Id, code: order.Code, customerName: order.CustomerName,
    error: result.error?.message || result.message || 'Lỗi không xác định'
  });
}

_is24HourPolicyError(result) {
  const errorCode = result.error?.code || result.error_code;
  const subCode = result.error?.error_subcode || result.error_subcode;
  return errorCode === 10 || subCode === 2018278 ||
    (result.error?.message || '').includes('24');
}

_isUserUnavailableError(result) {
  const errorCode = result.error?.code || result.error_code;
  return errorCode === 551 ||
    (result.error?.message || '').includes('not available');
}
```

### 5.11 Placeholder Replacement

```javascript
_replacePlaceholders(content, orderData) {
  const replacements = {
    '{partner.name}': orderData.PartnerName || orderData.CustomerName || '',
    '{partner.address}': orderData.Address || '',
    '{order.code}': orderData.Code || '',
    '{order.phone}': orderData.Phone || '',
    '{order.totalAmount}': this._formatCurrency(orderData.AmountTotal || 0),
    '{order.details}': this._formatOrderDetails(orderData.Details || orderData.OrderLines || []),
    '{order.customerName}': orderData.CustomerName || orderData.PartnerName || '',
    '{order.address}': orderData.Address || ''
  };

  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value);
  }
  return result;
}

_formatOrderDetails(details) {
  if (!details || details.length === 0) return '(không có sản phẩm)';
  return details.map(d =>
    `- ${d.ProductName || d.ProductNameVi || d.Name} x${d.Quantity}`
  ).join('\n');
}

_formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

_needsFullData(content) {
  return content.includes('{order.details}') ||
         content.includes('{order.totalAmount}') ||
         content.includes('{partner.address}');
}
```

### 5.12 Facebook Tag Fallback

```javascript
async _sendViaFacebookTag(order, messageContent, channelId, psid) {
  // Lấy Facebook Page Token từ nhiều nguồn
  let pageToken = null;

  // Source 1: currentCRMTeam
  if (window.currentCRMTeam?.Facebook_PageToken &&
      window.currentCRMTeam?.Facebook_PageId === channelId) {
    pageToken = window.currentCRMTeam.Facebook_PageToken;
  }

  // Source 2: currentOrder
  if (!pageToken && window.currentOrder?.CRMTeam?.Facebook_PageToken) {
    pageToken = window.currentOrder.CRMTeam.Facebook_PageToken;
  }

  // Source 3: cachedChannelsData
  if (!pageToken && window.cachedChannelsData) {
    const channel = window.cachedChannelsData.find(c => c.channelId === channelId);
    if (channel) pageToken = channel.pageToken;
  }

  if (!pageToken) {
    throw new Error('Không tìm thấy Facebook Page Token');
  }

  // Gọi Cloudflare Worker endpoint
  const response = await fetch(API_CONFIG.buildUrl.facebookSend(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pageId: channelId,
      psid: psid,
      message: messageContent,
      pageToken: pageToken,
      useTag: true,
      imageUrls: [],
      postId: order.Facebook_PostId,
      customerName: order.CustomerName
    })
  });

  return await response.json();
}
```

### 5.13 Update Progress UI

```javascript
updateProgressUI() {
  const { totalProcessed, totalToProcess, successOrders, errorOrders } = this.sendingState;
  const percent = totalToProcess > 0 ? Math.round((totalProcessed / totalToProcess) * 100) : 0;

  document.getElementById('messageProgressText').textContent =
    `Đang gửi... ${totalProcessed}/${totalToProcess} (✓${successOrders.length} ✗${errorOrders.length})`;
  document.getElementById('messageProgressPercent').textContent = `${percent}%`;
  document.getElementById('messageProgressBar').style.width = `${percent}%`;
}
```

### 5.14 Lưu kết quả

```javascript
async _saveResults(template, accounts, delay) {
  const { successOrders, errorOrders } = this.sendingState;

  // 1. Lưu vào Firestore (message_campaigns) - TTL 7 ngày
  try {
    await this.db.collection(this.campaignsCollection).add({
      templateName: template.Name,
      templateId: template.id,
      templateContent: template.Content,
      totalOrders: successOrders.length + errorOrders.length,
      successCount: successOrders.length,
      errorCount: errorOrders.length,
      successOrders: successOrders,
      errorOrders: errorOrders,
      accountsUsed: accounts.map(a => a.name),
      delay: delay,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      localCreatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[MessageTemplate] Save campaign error:', error);
  }

  // 2. Track đơn thất bại (hiện watermark trong bảng orders)
  if (errorOrders.length > 0) {
    this.addFailedOrders(errorOrders.map(o => o.orderId));
  }

  // 3. Track đơn đã gửi (tránh gửi trùng 24h)
  if (successOrders.length > 0) {
    this.addSentOrders(
      successOrders.map(o => o.Id),
      successOrders.filter(o => o.usedTag).map(o => o.Id)
    );
  }

  // 4. AUTO-SAVE KPI BASE (liên kết KPI module)
  if (window.kpiManager && successOrders.length > 0) {
    const campaignName = window.currentCampaignName || '';
    const userId = window.authManager?.getCurrentUser()?.uid || '';
    await window.kpiManager.saveAutoBaseSnapshot(successOrders, campaignName, userId);
  }

  // 5. Thông báo
  const total = successOrders.length + errorOrders.length;
  if (errorOrders.length === 0) {
    this._showNotification(`Gửi thành công ${successOrders.length}/${total} tin nhắn!`, 'success');
  } else {
    this._showNotification(
      `${successOrders.length} thành công, ${errorOrders.length} thất bại`, 'warning'
    );
  }
}

addFailedOrders(orderIds) {
  const data = JSON.parse(localStorage.getItem('failed_message_orders') || '{}');
  const now = Date.now();
  for (const id of orderIds) {
    data[id] = { timestamp: now };
  }
  localStorage.setItem('failed_message_orders', JSON.stringify(data));
}

addSentOrders(successIds, commentIds = []) {
  const data = JSON.parse(localStorage.getItem('sent_message_orders') || '{}');
  const now = Date.now();
  for (const id of successIds) {
    data[id] = { timestamp: now, viaComment: false };
  }
  for (const id of commentIds) {
    data[id] = { timestamp: now, viaComment: true };
  }
  localStorage.setItem('sent_message_orders', JSON.stringify(data));
}
```

### 5.15 Template CRUD

```javascript
// Mở form tạo/sửa template
openNewTemplateForm(templateToEdit = null) {
  const isEdit = !!templateToEdit;

  // Tạo modal form
  const formHtml = `
    <div style="padding:20px;">
      <h4>${isEdit ? 'Sửa' : 'Tạo'} Template</h4>
      <div style="margin:12px 0;">
        <label style="display:block;font-weight:600;margin-bottom:4px;">Tên template</label>
        <input type="text" id="templateNameInput" value="${isEdit ? this._escapeHtml(templateToEdit.Name) : ''}"
               style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:6px;" placeholder="VD: Chốt đơn">
      </div>
      <div style="margin:12px 0;">
        <label style="display:block;font-weight:600;margin-bottom:4px;">Nội dung</label>
        <textarea id="templateContentInput" rows="8"
                  style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:6px;resize:vertical;"
                  placeholder="VD: Dạ chào chị {partner.name}...">${isEdit ? this._escapeHtml(templateToEdit.Content || templateToEdit.BodyPlain) : ''}</textarea>
        <p style="font-size:11px;color:#9ca3af;margin-top:4px;">
          Placeholders: {partner.name}, {partner.address}, {order.code}, {order.phone}, {order.totalAmount}, {order.details}
        </p>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        ${isEdit ? `<button onclick="window.messageTemplateManager.deleteTemplate('${templateToEdit.id}')"
          class="message-btn-cancel" style="color:#ef4444;">Xóa</button>` : ''}
        <button onclick="window.messageTemplateManager.closeTemplateForm()" class="message-btn-cancel">Hủy</button>
        <button onclick="window.messageTemplateManager.saveTemplate('${isEdit ? templateToEdit.id : ''}')"
          class="message-btn-send">Lưu</button>
      </div>
    </div>`;

  document.getElementById('messageModalBody').innerHTML = formHtml;
}

async saveTemplate(templateId = null) {
  const name = document.getElementById('templateNameInput').value.trim();
  const content = document.getElementById('templateContentInput').value.trim();

  if (!name || !content) {
    alert('Vui lòng nhập tên và nội dung template!');
    return;
  }

  const data = {
    Name: name,
    Content: content,
    TypeId: 'MESSENGER',
    active: true
  };

  try {
    if (templateId) {
      // Cập nhật
      await this.db.collection(this.templatesCollection).doc(templateId).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Tạo mới
      data.order = this.templates.length + 1;
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.DateCreated = new Date().toLocaleDateString('vi-VN');
      await this.db.collection(this.templatesCollection).add(data);
    }

    // Reload
    await this.loadTemplates();
    this.renderTemplates();
  } catch (error) {
    console.error('[MessageTemplate] Save error:', error);
    alert('Lỗi khi lưu template!');
  }
}

async deleteTemplate(templateId) {
  if (!confirm('Bạn có chắc muốn xóa template này?')) return;

  try {
    // Soft delete
    await this.db.collection(this.templatesCollection).doc(templateId).update({
      active: false,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this.loadTemplates();
    this.renderTemplates();
  } catch (error) {
    console.error('[MessageTemplate] Delete error:', error);
  }
}

closeTemplateForm() {
  this.renderTemplates(); // Re-render template list
}
```

### 5.16 Tất cả Template mặc định (Chi tiết đầy đủ)

Hệ thống có **4 template mặc định** được seed tự động khi chưa có template nào trong Firestore.
Được tạo bởi method `_seedDefaultTemplates()` trong class `MessageTemplateManager`.

---

#### 5.16.1 Hệ thống Placeholder (Biến thay thế)

Các placeholder có sẵn để sử dụng trong template:

| Placeholder | Mô tả | Giá trị mặc định nếu trống |
|---|---|---|
| `{partner.name}` | Tên khách hàng | `(Khách hàng)` |
| `{partner.address}` | Địa chỉ + SĐT khách hàng | `(Chưa có địa chỉ)` |
| `{partner.phone}` | Số điện thoại khách hàng | `(Chưa có SĐT)` |
| `{order.details}` | Danh sách sản phẩm + tổng tiền + phí ship | `(Chưa có sản phẩm)` |
| `{order.code}` | Mã đơn hàng | `(Không có mã)` |
| `{order.total}` | Tổng tiền đơn hàng (formatted VNĐ) | `0đ` |

**Logic thay thế `{partner.address}`:**
- Nếu có address + phone → hiển thị: `{địa chỉ} - SĐT: {phone}`
- Nếu có address, không phone → hiển thị: `{địa chỉ}`
- Nếu trong template có dấu ngoặc kép `"{partner.address}"` → thay thành `(Chưa có địa chỉ)` (bỏ luôn ngoặc kép)

**Logic thay thế `{order.details}`:**
- Format từng sản phẩm: `• {tên SP} x{số lượng} — {giá}` (có hỗ trợ hiển thị giảm giá)
- Tính phí ship từ địa chỉ (thành phố/tỉnh)
- **Freeship logic:**
  - THÀNH PHỐ + tổng > 1.500.000đ → Freeship 🎁
  - TỈNH + tổng > 3.000.000đ → Freeship 🎁
- Kết quả gồm: danh sách SP + tổng tiền + phí ship + tổng thanh toán
- Nếu có giảm giá: Tổng → Giảm giá → Tổng tiền → Phí ship → Tổng thanh toán
- Nếu không giảm giá: Tổng tiền → Phí ship → Tổng thanh toán

---

#### 5.16.2 Template 1: "Chốt đơn" (order: 1)

**Mục đích:** Gửi xác nhận đơn hàng cho khách, liệt kê sản phẩm và địa chỉ giao hàng.

**Nội dung đầy đủ:**
```
Dạ chào chị {partner.name},

Em gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:

{order.details}

Đơn hàng của mình sẽ được gửi về địa chỉ "{partner.address}"

Chị xác nhận giúp em để em gửi hàng nha ạ! 🙏
```

**Placeholder sử dụng:** `{partner.name}`, `{order.details}`, `{partner.address}`

**Ví dụ sau khi thay thế:**
```
Dạ chào chị Nguyễn Thị Hoa,

Em gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:

• Kem dưỡng da ABC x1 — 350.000 ₫
• Sữa rửa mặt XYZ x2 — 500.000 ₫

Tổng tiền: 850.000 ₫
Phí ship: 30.000 ₫
Tổng thanh toán: 880.000 ₫

Đơn hàng của mình sẽ được gửi về địa chỉ "123 Nguyễn Huệ, Q1, TP.HCM - SĐT: 0901234567"

Chị xác nhận giúp em để em gửi hàng nha ạ! 🙏
```

---

#### 5.16.3 Template 2: "Xác nhận địa chỉ" (order: 2)

**Mục đích:** Xác nhận lại địa chỉ nhận hàng trước khi giao.

**Nội dung đầy đủ:**
```
Dạ chị {partner.name} ơi,

Em xác nhận lại địa chỉ nhận hàng của chị là:
📍 {partner.address}

Chị kiểm tra giúp em địa chỉ đã chính xác chưa ạ?
```

**Placeholder sử dụng:** `{partner.name}`, `{partner.address}`

**Ví dụ sau khi thay thế:**
```
Dạ chị Nguyễn Thị Hoa ơi,

Em xác nhận lại địa chỉ nhận hàng của chị là:
📍 123 Nguyễn Huệ, Q1, TP.HCM - SĐT: 0901234567

Chị kiểm tra giúp em địa chỉ đã chính xác chưa ạ?
```

---

#### 5.16.4 Template 3: "Thông báo giao hàng" (order: 3)

**Mục đích:** Thông báo đơn hàng đã được giao cho đơn vị vận chuyển.

**Nội dung đầy đủ:**
```
Dạ chị {partner.name} ơi,

Đơn hàng #{order.code} của chị đã được giao cho đơn vị vận chuyển rồi ạ.

Chị chú ý điện thoại để nhận hàng nha! 📦
```

**Placeholder sử dụng:** `{partner.name}`, `{order.code}`

**Ví dụ sau khi thay thế:**
```
Dạ chị Nguyễn Thị Hoa ơi,

Đơn hàng #DH2024001 của chị đã được giao cho đơn vị vận chuyển rồi ạ.

Chị chú ý điện thoại để nhận hàng nha! 📦
```

---

#### 5.16.5 Template 4: "Cảm ơn khách hàng" (order: 4)

**Mục đích:** Gửi lời cảm ơn sau khi khách nhận hàng thành công.

**Nội dung đầy đủ:**
```
Dạ cảm ơn chị {partner.name} đã ủng hộ shop ạ! 🙏❤️

Chị dùng hàng có gì thắc mắc cứ inbox shop em hỗ trợ nha.

Chúc chị một ngày vui vẻ! 😊
```

**Placeholder sử dụng:** `{partner.name}`

**Ví dụ sau khi thay thế:**
```
Dạ cảm ơn chị Nguyễn Thị Hoa đã ủng hộ shop ạ! 🙏❤️

Chị dùng hàng có gì thắc mắc cứ inbox shop em hỗ trợ nha.

Chúc chị một ngày vui vẻ! 😊
```

---

#### 5.16.6 Cấu trúc dữ liệu Firestore cho mỗi Template

```javascript
{
    Name: String,           // Tên template (vd: "Chốt đơn")
    Content: String,        // Nội dung template với placeholder
    order: Number,          // Thứ tự hiển thị (1, 2, 3, 4)
    active: Boolean,        // true = đang hoạt động
    createdAt: Timestamp    // firebase.firestore.FieldValue.serverTimestamp()
}
```

**Collection:** `message_templates`

#### 5.16.7 Code seed đầy đủ

```javascript
async _seedDefaultTemplates() {
    const db = window.firebase.firestore();
    const templatesRef = db.collection(this.TEMPLATES_COLLECTION);
    const batch = db.batch();

    const defaultTemplates = [
        {
            Name: 'Chốt đơn',
            Content: `Dạ chào chị {partner.name},\n\nEm gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:\n\n{order.details}\n\nĐơn hàng của mình sẽ được gửi về địa chỉ "{partner.address}"\n\nChị xác nhận giúp em để em gửi hàng nha ạ! 🙏`,
            order: 1,
            active: true,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            Name: 'Xác nhận địa chỉ',
            Content: `Dạ chị {partner.name} ơi,\n\nEm xác nhận lại địa chỉ nhận hàng của chị là:\n📍 {partner.address}\n\nChị kiểm tra giúp em địa chỉ đã chính xác chưa ạ?`,
            order: 2,
            active: true,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            Name: 'Thông báo giao hàng',
            Content: `Dạ chị {partner.name} ơi,\n\nĐơn hàng #{order.code} của chị đã được giao cho đơn vị vận chuyển rồi ạ.\n\nChị chú ý điện thoại để nhận hàng nha! 📦`,
            order: 3,
            active: true,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            Name: 'Cảm ơn khách hàng',
            Content: `Dạ cảm ơn chị {partner.name} đã ủng hộ shop ạ! 🙏❤️\n\nChị dùng hàng có gì thắc mắc cứ inbox shop em hỗ trợ nha.\n\nChúc chị một ngày vui vẻ! 😊`,
            order: 4,
            active: true,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }
    ];

    defaultTemplates.forEach(template => {
        const docRef = templatesRef.doc();
        batch.set(docRef, template);
    });

    await batch.commit();
}
```

#### 5.16.8 Code replacePlaceholders đầy đủ

```javascript
replacePlaceholders(content, orderData) {
    let result = content;

    // 1. Replace {partner.name}
    if (orderData.customerName && orderData.customerName.trim()) {
        result = result.replace(/{partner\.name}/g, orderData.customerName);
    } else {
        result = result.replace(/{partner\.name}/g, '(Khách hàng)');
    }

    // 2. Replace {partner.address} - kèm SĐT
    if (orderData.address && orderData.address.trim()) {
        const phone = orderData.phone && orderData.phone.trim() ? orderData.phone : '';
        const addressWithPhone = phone ? `${orderData.address} - SĐT: ${phone}` : orderData.address;
        result = result.replace(/{partner\.address}/g, addressWithPhone);
    } else {
        // Xử lý pattern có ngoặc kép: "{partner.address}" → (Chưa có địa chỉ)
        result = result.replace(/"\{partner\.address\}"/g, '(Chưa có địa chỉ)');
        result = result.replace(/\{partner\.address\}/g, '(Chưa có địa chỉ)');
    }

    // 3. Replace {partner.phone}
    if (orderData.phone && orderData.phone.trim()) {
        result = result.replace(/{partner\.phone}/g, orderData.phone);
    } else {
        result = result.replace(/{partner\.phone}/g, '(Chưa có SĐT)');
    }

    // 4. Replace {order.details} - danh sách SP + tổng tiền + phí ship
    if (orderData.products && Array.isArray(orderData.products) && orderData.products.length > 0) {
        // Format từng sản phẩm (có hỗ trợ giảm giá)
        const formattedProducts = orderData.products.map(p => this.formatProductLineWithDiscount(p));
        const productList = formattedProducts.map(fp => fp.line).join('\n');

        // Tính phí ship từ địa chỉ
        const { fee: baseShippingFee, isProvince } = this.getShippingFeeFromAddress(orderData.address, orderData.extraAddress);

        // Tính tổng sau giảm giá
        let totalDiscountAmount = 0;
        let hasAnyDiscount = formattedProducts.some(fp => fp.hasDiscount);
        if (hasAnyDiscount) {
            totalDiscountAmount = formattedProducts.reduce((sum, fp) =>
                sum + (fp.discountData ? fp.discountData.totalDiscount : 0), 0);
        }
        const orderTotal = hasAnyDiscount
            ? (orderData.totalAmount || 0) - totalDiscountAmount
            : (orderData.totalAmount || 0);

        // Freeship logic
        let shippingFee = baseShippingFee;
        let isFreeship = false;
        if (!isProvince && orderTotal > 1500000) { shippingFee = 0; isFreeship = true; }
        else if (isProvince && orderTotal > 3000000) { shippingFee = 0; isFreeship = true; }

        const shipLine = isFreeship
            ? `Phí ship: FREESHIP 🎁`
            : `Phí ship: ${this.formatCurrency(shippingFee)}`;

        // Format tổng tiền
        let totalSection;
        if (hasAnyDiscount) {
            const originalTotal = orderData.totalAmount || 0;
            const afterDiscount = originalTotal - totalDiscountAmount;
            const finalTotal = afterDiscount + shippingFee;
            totalSection = [
                `Tổng : ${this.formatCurrency(originalTotal)}`,
                `Giảm giá: ${this.formatCurrency(totalDiscountAmount)}`,
                `Tổng tiền: ${this.formatCurrency(afterDiscount)}`,
                shipLine,
                `Tổng thanh toán: ${this.formatCurrency(finalTotal)}`
            ].join('\n');
        } else {
            const totalAmount = orderData.totalAmount || 0;
            const finalTotal = totalAmount + shippingFee;
            totalSection = [
                `Tổng tiền: ${this.formatCurrency(totalAmount)}`,
                shipLine,
                `Tổng thanh toán: ${this.formatCurrency(finalTotal)}`
            ].join('\n');
        }

        result = result.replace(/{order\.details}/g, `${productList}\n\n${totalSection}`);
    } else {
        result = result.replace(/{order\.details}/g, '(Chưa có sản phẩm)');
    }

    // 5. Replace {order.code}
    if (orderData.code && orderData.code.trim()) {
        result = result.replace(/{order\.code}/g, orderData.code);
    } else {
        result = result.replace(/{order\.code}/g, '(Không có mã)');
    }

    // 6. Replace {order.total}
    if (orderData.totalAmount) {
        result = result.replace(/{order\.total}/g, this.formatCurrency(orderData.totalAmount));
    } else {
        result = result.replace(/{order\.total}/g, '0đ');
    }

    return result;
}
```

#### 5.16.9 Chia tin nhắn dài (splitMessageIntoParts)

Tin nhắn sau khi thay thế placeholder nếu dài hơn **2000 ký tự** sẽ được chia thành nhiều phần:

```javascript
splitMessageIntoParts(message, maxLength = 2000) {
    // 1. Nếu <= maxLength → trả về nguyên
    // 2. Tìm vị trí xuống dòng '\n' gần nhất trước maxLength để cắt
    // 3. Nếu không có '\n' → tìm dấu cách gần nhất
    // 4. Nếu vẫn không → cắt cứng tại maxLength
    // Mỗi phần được gửi riêng qua Facebook API
}
```

### 5.17 History Modal

```javascript
async openHistoryModal() {
  // Load campaigns từ Firestore (7 ngày gần nhất)
  try {
    const snapshot = await this.db.collection(this.campaignsCollection)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const campaigns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    this._renderHistoryModal(campaigns);
  } catch (error) {
    console.error('[MessageTemplate] Load history error:', error);
    // Fallback: localStorage
    const localHistory = JSON.parse(localStorage.getItem('messageSendHistory') || '[]');
    this._renderHistoryModal(localHistory);
  }
}

_renderHistoryModal(campaigns) {
  // Tạo history modal nếu chưa có
  let historyOverlay = document.getElementById('messageHistoryModal');
  if (!historyOverlay) {
    historyOverlay = document.createElement('div');
    historyOverlay.className = 'message-modal-overlay';
    historyOverlay.id = 'messageHistoryModal';
    historyOverlay.innerHTML = `
      <div class="message-modal" style="max-width:700px;">
        <div class="message-modal-header">
          <h3><i class="fas fa-history"></i> Lịch sử gửi tin nhắn</h3>
          <button class="message-modal-close" onclick="document.getElementById('messageHistoryModal').classList.remove('active')">&times;</button>
        </div>
        <div class="message-modal-body" id="messageHistoryBody"></div>
      </div>`;
    document.body.appendChild(historyOverlay);
  }

  const body = document.getElementById('messageHistoryBody');

  if (campaigns.length === 0) {
    body.innerHTML = '<div class="message-no-results"><i class="fas fa-inbox"></i><p>Chưa có lịch sử gửi tin.</p></div>';
  } else {
    body.innerHTML = campaigns.map((c, index) => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <strong>${this._escapeHtml(c.templateName || 'Template')}</strong>
          <span style="font-size:12px;color:#9ca3af;">${c.localCreatedAt ? new Date(c.localCreatedAt).toLocaleString('vi-VN') : ''}</span>
        </div>
        <div style="display:flex;gap:16px;font-size:13px;">
          <span style="color:#10b981;">✓ ${c.successCount || 0} thành công</span>
          <span style="color:#ef4444;">✗ ${c.errorCount || 0} thất bại</span>
          <span style="color:#6b7280;">Tổng: ${c.totalOrders || 0}</span>
        </div>
        ${c.errorCount > 0 ? `
          <div style="margin-top:8px;">
            <button onclick="window.messageTemplateManager.sendFailedOrdersViaComment(${index})"
              class="message-send-btn" style="font-size:11px;padding:4px 8px;">
              <i class="fas fa-comment"></i> Gửi ${c.errorCount} đơn thất bại qua Comment
            </button>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  historyOverlay.classList.add('active');
}
```

### 5.18 Gửi lại đơn thất bại qua Comment

```javascript
async sendFailedOrdersViaComment(campaignIndex) {
  // Lấy campaign data từ history
  const snapshot = await this.db.collection(this.campaignsCollection)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const campaigns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const campaign = campaigns[campaignIndex];

  if (!campaign || !campaign.errorOrders) return;

  let successCount = 0;
  let failCount = 0;

  for (const errorOrder of campaign.errorOrders) {
    try {
      // 1. Fetch full order data
      const fullOrderData = await this._fetchFullOrderData(errorOrder.orderId);

      // 2. Lấy chat info
      const chatInfo = window.pancakeDataManager.getChatInfoForOrder(fullOrderData.raw || fullOrderData);
      const channelId = chatInfo.channelId;
      const psid = chatInfo.psid;

      // 3. Validate Facebook data
      if (!errorOrder.Facebook_CommentId && !errorOrder.Facebook_PostId) {
        failCount++;
        continue;
      }

      // 4. Lấy page access token
      const pageAccessToken = window.pancakeTokenManager.getPageAccessToken(channelId);

      // 5. Lấy comment mới nhất của khách từ Pancake
      const postId = errorOrder.Facebook_PostId;
      const commentsResult = await this._fetchCustomerComments(channelId, psid, postId);
      const latestComment = commentsResult[commentsResult.length - 1];

      if (!latestComment) {
        failCount++;
        continue;
      }

      // 6. Thay placeholder
      let messageContent = this._replacePlaceholders(campaign.templateContent, fullOrderData);
      const displayName = window.authManager?.getCurrentUser()?.displayName;
      if (displayName) messageContent += '\nNv. ' + displayName;

      // 7. Gửi reply comment qua Pancake API
      const replyUrl = API_CONFIG.buildUrl.pancakeOfficial(
        `pages/${channelId}/conversations/${latestComment.Id}/messages`,
        pageAccessToken
      );

      const response = await fetch(replyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply_comment',
          message_id: latestComment.Id,
          message: messageContent
        })
      });

      const result = await response.json();

      if (result.success || result.error === false) {
        successCount++;
        this.removeFailedOrder(errorOrder.orderId);
      } else {
        failCount++;
      }
    } catch (error) {
      failCount++;
    }

    // Delay 1 giây giữa mỗi comment
    await new Promise(r => setTimeout(r, 1000));
  }

  this._showNotification(`Comment: ${successCount} thành công, ${failCount} thất bại`,
    failCount === 0 ? 'success' : 'warning');
}

removeFailedOrder(orderId) {
  const data = JSON.parse(localStorage.getItem('failed_message_orders') || '{}');
  delete data[orderId];
  localStorage.setItem('failed_message_orders', JSON.stringify(data));
}

isOrderFailed(orderId) {
  const data = JSON.parse(localStorage.getItem('failed_message_orders') || '{}');
  const entry = data[orderId];
  if (!entry) return false;
  // Auto-clean sau 24h
  if (Date.now() - entry.timestamp > 24 * 60 * 60 * 1000) {
    delete data[orderId];
    localStorage.setItem('failed_message_orders', JSON.stringify(data));
    return false;
  }
  return true;
}
```

### 5.19 Helpers

```javascript
closeModal() {
  document.getElementById('messageTemplateModal').classList.remove('active');
  this.selectedTemplateId = null;
  document.getElementById('messageBtnSend').disabled = true;
  document.getElementById('messageSearchInput').value = '';
  document.getElementById('messageClearSearch').classList.remove('show');
}

_escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

_formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('vi-VN');
}

_showNotification(message, type = 'info') {
  // Sử dụng notification system có sẵn hoặc alert
  if (window.showNotification) {
    window.showNotification(message, type);
  } else {
    alert(message);
  }
}

_sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 6. BACKEND - CLOUDFLARE WORKER

### 6.1 Facebook Send Handler

```javascript
// File: cloudflare-worker/modules/handlers/facebook-handler.js
// Endpoint: POST /api/facebook-send

export async function handleFacebookSend(request) {
  const body = await request.json();
  const { pageId, psid, message, pageToken, useTag, imageUrls, postId, customerName, commentId } = body;

  // Validate
  if (!psid || !message || !pageToken) {
    return new Response(JSON.stringify({
      success: false, error: 'Missing required fields: psid, message, pageToken'
    }), { status: 400 });
  }

  // === BƯỚC 1: Thử gửi với HUMAN_AGENT tag ===
  let result = await sendViaGraphAPI(psid, message, pageToken, 'HUMAN_AGENT', imageUrls);

  if (result.success) {
    return jsonResponse({
      success: true,
      message_id: result.message_id,
      recipient_id: result.recipient_id,
      used_tag: 'HUMAN_AGENT'
    });
  }

  // === BƯỚC 2: Thử POST_PURCHASE_UPDATE tag ===
  result = await sendViaGraphAPI(psid, message, pageToken, 'POST_PURCHASE_UPDATE', imageUrls);

  if (result.success) {
    return jsonResponse({
      success: true,
      message_id: result.message_id,
      used_tag: 'POST_PURCHASE_UPDATE'
    });
  }

  // === BƯỚC 3: Thử Private Reply (nếu có postId hoặc commentId) ===
  if (result.error?.code === 551 || result.error?.error_subcode === 2018278) {
    if (postId || commentId) {
      const realCommentId = await findRealCommentId(pageId, pageToken, postId, customerName, commentId);

      if (realCommentId) {
        const privateResult = await sendPrivateReply(realCommentId, message, pageToken);
        if (privateResult.success) {
          return jsonResponse({
            success: true,
            message_id: privateResult.message_id,
            used_tag: 'PRIVATE_REPLY'
          });
        }
      }
    }
  }

  // === THẤT BẠI ===
  return jsonResponse({
    success: false,
    error: result.error,
    error_code: result.error?.code,
    error_subcode: result.error?.error_subcode,
    diagnostics: {
      tried_tags: ['HUMAN_AGENT', 'POST_PURCHASE_UPDATE'],
      tried_private_reply: !!(postId || commentId)
    }
  });
}

// Gửi qua Facebook Graph API
async function sendViaGraphAPI(psid, message, pageToken, tag, imageUrls = []) {
  const url = 'https://graph.facebook.com/v18.0/me/messages';

  // Build message payload
  let messagePayload;
  if (imageUrls && imageUrls.length > 0) {
    // Gửi ảnh trước
    for (const imageUrl of imageUrls) {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: psid },
          message: {
            attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } }
          },
          messaging_type: 'MESSAGE_TAG',
          tag: tag,
          access_token: pageToken
        })
      });
    }
    messagePayload = { text: message };
  } else {
    messagePayload = { text: message };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: messagePayload,
      messaging_type: 'MESSAGE_TAG',
      tag: tag,
      access_token: pageToken
    })
  });

  const data = await response.json();

  if (data.message_id) {
    return { success: true, message_id: data.message_id, recipient_id: data.recipient_id };
  }
  return { success: false, error: data.error || data };
}

// Tìm comment thật của khách trên page
async function findRealCommentId(pageId, pageToken, postId, customerName, commentId) {
  // 1. Thử trực tiếp comment ID đã biết
  if (commentId) {
    const checkUrl = `https://graph.facebook.com/v18.0/${commentId}?fields=from,message&access_token=${pageToken}`;
    const check = await fetch(checkUrl);
    const checkData = await check.json();
    if (checkData.id && !checkData.error) return commentId;
  }

  // 2. Tìm trong comments của post
  if (postId) {
    const commentsUrl = `https://graph.facebook.com/v18.0/${postId}/comments?fields=from,message,id&limit=100&access_token=${pageToken}`;
    const commentsRes = await fetch(commentsUrl);
    const commentsData = await commentsRes.json();

    if (commentsData.data) {
      // Match by comment ID
      if (commentId) {
        const match = commentsData.data.find(c => c.id === commentId);
        if (match) return match.id;
      }

      // Match by customer name
      if (customerName) {
        const nameMatch = commentsData.data.find(c =>
          c.from?.name?.toLowerCase().includes(customerName.toLowerCase())
        );
        if (nameMatch) return nameMatch.id;
      }

      // Return last comment as fallback
      if (commentsData.data.length > 0) {
        return commentsData.data[commentsData.data.length - 1].id;
      }
    }
  }

  // 3. Tìm trong live_videos
  if (pageId) {
    const liveUrl = `https://graph.facebook.com/v18.0/${pageId}/live_videos?fields=id,comments.limit(200){from,message,id}&limit=5&access_token=${pageToken}`;
    const liveRes = await fetch(liveUrl);
    const liveData = await liveRes.json();

    if (liveData.data) {
      for (const video of liveData.data) {
        if (video.comments?.data) {
          // Match by comment ID or customer name
          const match = video.comments.data.find(c =>
            c.id === commentId ||
            c.from?.name?.toLowerCase().includes((customerName || '').toLowerCase())
          );
          if (match) return match.id;
        }
      }
    }
  }

  return null;
}

// Gửi Private Reply
async function sendPrivateReply(commentId, message, pageToken) {
  const url = `https://graph.facebook.com/v18.0/${commentId}/private_replies`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message,
      access_token: pageToken
    })
  });

  const data = await response.json();
  if (data.id || data.message_id) {
    return { success: true, message_id: data.id || data.message_id };
  }
  return { success: false, error: data.error || data };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 6.2 API URL Configuration

```javascript
// File: orders-report/js/modules/core/api-config.js

const WORKER_URL = 'https://your-worker.workers.dev'; // Cloudflare Worker URL

const API_CONFIG = {
  buildUrl: {
    // Pancake API (qua proxy)
    pancake: (endpoint, params) => `${WORKER_URL}/api/pancake/${endpoint}?${params}`,

    // Pancake Official API (direct với page token)
    pancakeOfficial: (endpoint, pageAccessToken) =>
      `${WORKER_URL}/api/pancake-official/${endpoint}?page_access_token=${pageAccessToken}`,

    // Facebook Send (qua Worker)
    facebookSend: () => `${WORKER_URL}/api/facebook-send`,

    // Facebook Graph API (qua proxy)
    facebookGraph: (path, accessToken, params = {}) => {
      const queryStr = new URLSearchParams({ path, access_token: accessToken, ...params }).toString();
      return `${WORKER_URL}/api/facebook-graph?${queryStr}`;
    }
  }
};
```

---

## 7. ERROR HANDLING & FALLBACK CHAIN

```
Gửi tin nhắn
    │
    ├── [1] Pancake API: reply_inbox
    │   ├── Thành công → ✓ Done
    │   ├── Lỗi 24h policy (code=10, subcode=2018278) → [2]
    │   ├── Lỗi 551 (user unavailable) → Track lỗi → Retry qua Comment
    │   └── Lỗi khác → Track lỗi
    │
    ├── [2] Facebook Graph API: HUMAN_AGENT tag
    │   ├── Thành công → ✓ Done
    │   └── Thất bại → [3]
    │
    ├── [3] Facebook Graph API: POST_PURCHASE_UPDATE tag
    │   ├── Thành công → ✓ Done
    │   └── Thất bại → [4]
    │
    └── [4] Private Reply API
        ├── Tìm comment thật (live_videos + feed)
        ├── Thành công → ✓ Done
        └── Thất bại → Track lỗi → Hiện nút "Gửi qua Comment" trong History
```

---

## 8. FILE PATHS THAM KHẢO

| File | Mô tả | Dòng |
|------|--------|------|
| `orders-report/js/chat/message-template-manager.js` | Class chính MessageTemplateManager | 4337 dòng |
| `orders-report/js/tab1/tab1-chat-facebook.js` | Facebook Graph API integration | 302 dòng |
| `orders-report/js/tab1/tab1-chat-messages.js` | Internal send functions | ~500 dòng |
| `orders-report/js/modules/core/api-config.js` | API URL builders | ~80 dòng |
| `orders-report/css/message-template-modal.css` | CSS cho modal | 573 dòng |
| `cloudflare-worker/modules/handlers/facebook-handler.js` | Worker endpoint | ~400 dòng |
| `shared/universal/facebook-constants.js` | Facebook constants & payload builders | ~200 dòng |
