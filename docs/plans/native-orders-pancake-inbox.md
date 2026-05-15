# Plan — Pancake-style Inbox UI for Web 2.0 native-orders

> **Crawl source**: live inspect của `pancake.vn/NhiJudyStore` qua `scripts/pancake-browser-session.js` (JWT cookies). Screenshot reference: [`downloads/n2store-session/pancake-inspect/05-tao-don.png`](../../downloads/n2store-session/pancake-inspect/05-tao-don.png).

## 0. Mục tiêu

Khi user click cột "Tin nhắn" hoặc "Bình luận" của 1 đơn trong native-orders, modal mở rộng thành layout 3 cột giống Pancake admin inbox:

```
┌─ TOP BAR ───────────────────────────────────────────────────┐
│  [Tin nhắn 27] [Đơn hàng 5] [Bài viết] [Thống kê] [Cài đặt] │  ← header tabs (chỉ Tin nhắn ban đầu)
├─[sidebar]──┬─[chat panel]─────────────┬─[right panel]───────┤
│ Tìm kiếm   │  Customer header + 4 btn │  [Thông tin][Tạo đơn]│
│ Lọc theo   │                          │                      │
│ ─────────  │  Day separator           │  Khách hàng           │
│ Conv row 1 │  Bubble in / out         │  - Tên / SĐT          │
│ Conv row 2 │  Reactions, reply        │  - Địa chỉ cascader   │
│ ...        │  System msg              │                      │
│ (virtual)  │  ...                     │  Sản phẩm             │
│            │                          │  - Search / Combo     │
│            │  ──────────              │  - Bảng line items    │
│            │  Quick reply tags        │                      │
│            │  Toolbar + input         │  Thanh toán           │
│            │  [📎][📷][😀] Gửi        │  - Free ship / CK     │
│            │                          │  - Tổng, Phí, Giảm    │
│            │                          │  [Phụ thu] [Tạo đơn]  │
└────────────┴──────────────────────────┴──────────────────────┘
```

**Constraint** (theo CLAUDE.md): Web 2.0 độc lập với Web 1.0 — KHÔNG import từ `orders-report/`, `inbox/`, `chat/`. Build độc lập trong `web2-shared/` + `native-orders/`.

## 1. Pancake DOM/CSS map (đã crawl live)

### 1.1 Conversation list (sidebar)

| Element             | Class                                                      |
| ------------------- | ---------------------------------------------------------- |
| Container           | `.conversation-menu`                                       |
| Search input        | `.conversation-menu-search-input` (placeholder "Tìm kiếm") |
| Filter button       | `.ant-btn-primary` ("Lọc theo")                            |
| Virtual list holder | `.rc-virtual-list-holder`                                  |
| Conv row            | `.media.conversation-list-item.unread`                     |
| Avatar slot         | `.media-left.render-avatar-cus`                            |
| Badge wrapper       | `.ant-badge`                                               |
| Row id format       | `${pageId}_${customerId}__${index}`                        |

### 1.2 Chat panel center

| Element                                                                                                                                                  | Class                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Header (customer name + viewed-by)                                                                                                                       | `.chat-menu` (h=68px)                                             |
| Day separator (sticky)                                                                                                                                   | `.system-msg-sticky`                                              |
| System message                                                                                                                                           | `.media-body.system-msg`                                          |
| Incoming bubble row                                                                                                                                      | `.media.m-b-md.inbox-message-ele.media-current-customer`          |
| Outgoing bubble row                                                                                                                                      | `.media.m-b-md.inbox-message-ele.media-current-user`              |
| Same-sender grouping flags                                                                                                                               | `.not-same-from-bottom-mes`, `.not-same-from-top-mes`             |
| Avatar slot                                                                                                                                              | `.media-left`                                                     |
| Bubble body                                                                                                                                              | `.media-body`                                                     |
| Bubble side (out only)                                                                                                                                   | `.media-right`                                                    |
| Scroll container                                                                                                                                         | `.message-list.media-list.media-list-conversation.virtual-scroll` |
| **Computed styles**: `overflow-y:auto`, `scroll-behavior:auto`, `contain:none`, `will-change:auto` — pure native scroll (vì DOM nhỏ nhờ rc-virtual-list) |

### 1.3 Quick reply tag bar (dưới chat)

| Element                                   | Class                                                   |
| ----------------------------------------- | ------------------------------------------------------- |
| Trigger                                   | `.toggle-tag-shortcut-popup`                            |
| Tag chip (colored)                        | (chưa fetch — cần phase 1)                              |
| Tag colors quan sát thấy trong screenshot | Cam, hồng đậm, xanh lá, xanh navy, tím, vàng, xanh ngọc |

### 1.4 Right panel — Thông tin tab

| Section                 | Class                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| Container               | `.customer-info-wrapper`                                                   |
| Notes section           | `.note-customer-ls` > `.note-ls`                                           |
| Empty notes placeholder | `.no-data-placeholder.info-text.no-note`                                   |
| Edit note               | `.text-edit-note` > `.textarea-wrapper` > `.ant-mentions.textarea-note-co` |
| Order list (past)       | `.order-list`                                                              |
| Empty order state       | `.tab-select-table-empty`                                                  |
| Bottom info bar         | `.info-bottom`                                                             |

### 1.5 Right panel — Tạo đơn tab

| Section                                                                       | Class                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Main container                                                                | `.box-order-content`                                         |
| Customer card                                                                 | `.card-customer-basic-info.card-content`                     |
| Info row                                                                      | `.row-customer-info`                                         |
| Address cascader (province/district/ward)                                     | `.item-customer-info.customer-address`                       |
| Province select                                                               | `.item-customer-info.customer-province` (uses `.ant-select`) |
| (Cần phase 1 crawl tiếp): SP table, Combo, Thanh toán, totals, action buttons |

### 1.6 Tech stack Pancake dùng

- **Ant Design**: `.ant-btn`, `.ant-input`, `.ant-select`, `.ant-tabs`, `.ant-mentions`, `.ant-badge`, `.ant-cascader`
- **rc-virtual-list**: virtualization cho conv list + message list — DOM giữ nhỏ kể cả với 1000+ items
- **Native scroll**: KHÔNG smooth-scroll lib, KHÔNG content-visibility, KHÔNG contain
- **IndexedDB offline cache**: `PancakeOffline`, `ComCakeDatabase`, `fb_meta_data`, `geo`, `keyval-store`

## 2. Phasing đề xuất

> Đây là plan **siêu lớn** (~2-3 tuần). Đề xuất chia phase nhỏ, mỗi phase ship được + test được riêng. User quyết định scope.

### **Phase 1 — Layout 3 cột + Conversation list sidebar** (~2 ngày)

**Mục tiêu**: Modal grow thành 3-cột; sidebar liệt kê conversations của page; click vào conv để load chat (giữ tab Bình luận như cũ tạm thời).

- Modal width: full viewport (95vw × 92vh, breakpoint xuống dưới ẩn sidebar/right panel).
- Sidebar trái 320px: search + filter + conv list (vanilla JS, không virtualization ở phase 1 — chỉ render visible page với pagination).
    - Tận dụng `Web2Chat.fetchConversations(pageId, fbId)` hiện có; thêm `fetchConversationsByPage(pageId, opts)` trong web2-chat-client.js.
    - Row: avatar (qua `_workerProxy`), customerName, lastMsg preview, time (relative), unread badge, status icons.
    - Click row → load thread bằng `_loadAndRenderThread` (đã có).
- Real-time: gắn vào `Web2Realtime` đã có (`pages:new_message`); khi nhận event, update last-message + bump conv lên đầu sidebar.
- Persist: scroll position + selected conv ID trong sessionStorage để re-open modal nhớ trạng thái.

**Files mới/sửa**:

- `web2-shared/web2-chat-client.js` — thêm `fetchConversationsByPage`.
- `native-orders/js/native-orders-app.js` — `_renderInteractionsModal` mở rộng layout.
- `native-orders/css/native-orders.css` — class `.w2c-sidebar`, `.w2c-conv-row`, etc.

### **Phase 2 — Right panel Thông tin tab** (~1 ngày)

- Customer info card (đã có 1 phần): tên, SĐT, ghi chú khách (textarea local, lưu trong `customers` table nếu có).
- Past orders list: query `/api/native-orders?fbUserId=X` → render list compact.
- "Đã ghi chú" badge khi note có nội dung.

### **Phase 3 — Right panel Tạo đơn tab** (~3 ngày, scope lớn nhất)

- Address cascader VN: province / district / ward — dùng dataset hiện có trong `web2-shared/delivery-method-picker.js`.
- Product search picker: gọi TPOS OData (đã wire trong `tpos-pancake/`) hoặc Pancake products API.
- Combo modal: nhập tay 1 row free-text (workaround nếu chưa wire combo).
- Line items table: SL, đơn giá inline edit, thành tiền auto-calc.
- Thanh toán: free-ship checkbox, CK checkbox, payment method dropdown.
- Totals: tổng đơn, phí ship (auto-fetch theo địa chỉ?), giảm giá, tổng tiền.
- "Tạo đơn" → POST `/api/pancake/orders` (qua CF Worker), hoặc tạo native order mới.

### **Phase 4 — Quick reply tag bar** (~1 ngày)

- Render hàng tag chip nhiều màu giống screenshot (lưu trong localStorage + sync Render DB).
- Click tag → chèn template text vào input + auto-fill chữ ký nhân viên.
- Manage tags qua settings page (Web 2.0 đã có pancake-settings).

### **Phase 5 — Chat composer enhancements** (~2 ngày)

- Toolbar icons: attach file (📎), image (🖼), sticker (😀), voice note (🎙), insert quick reply (/), insert signature (✒).
- Image attach: upload qua Pancake API hoặc Bunny CDN proxy.
- Sticker picker: emoji + recently-used.
- Voice note: MediaRecorder API → upload as audio attachment.

### **Phase 6 — Polish & perf** (~1 ngày)

- Virtual scroll cho conv list (port `rc-virtual-list` pattern hoặc tự viết IntersectionObserver-based).
- Skeleton states cho mọi async section.
- Keyboard shortcuts: J/K điều hướng conv, Cmd+Enter gửi tin, Esc đóng.
- Responsive: mobile/tablet ẩn sidebar bằng drawer.

## 3. Câu hỏi cần user xác nhận trước khi code

1. **Scope ưu tiên**: chỉ làm Phase 1 (sidebar + 3-cột layout), hay đi luôn xuống Phase 2/3?
2. **Tạo đơn**: tạo đơn Native (POST native-orders API) hay tạo đơn Pancake (POST Pancake API rồi import)?
3. **Modal trigger**: vẫn click cột "Tin nhắn"/"Bình luận" trong table → mở modal full-screen? Hay làm 1 trang riêng `native-orders/inbox.html`?
4. **Multi-page support**: 1 user có thể có nhiều fb page; sidebar hiển thị conv của TẤT CẢ page hay chỉ page của đơn đang xem?
5. **Real-time WS**: Pancake's `pages:new_message` đã có; có cần thêm event `comments:new_comment` cho tab Bình luận không?

## 4. Tooling phase này đã tạo

- `scripts/pancake-browser-session.js` — persistent Playwright session với JWT cookies, dùng để re-crawl khi cần thêm thông tin chi tiết.
- `scripts/pancake-chat-inspect.js` — one-shot inspector (đã chạy, output lưu `downloads/n2store-session/pancake-inspect/`).
- Screenshots: `01-landing.png`, `02-chat-opened.png`, `03-conv-clicked.png`, `04-full-current.png`, `05-tao-don.png`.

## 5. Next step — Đợi user

Mọi việc tiếp theo cần user trả lời câu hỏi ở §3 và confirm scope. **Chưa code** cho đến khi rõ.
