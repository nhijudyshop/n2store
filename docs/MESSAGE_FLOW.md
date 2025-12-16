# Flow Gửi Tin Nhắn - Orders Report Tab 1

## Tổng quan

Tính năng "Gửi tin nhắn" cho phép gửi tin nhắn Facebook Messenger đến nhiều khách hàng dựa trên template được cấu hình sẵn.

## 1. Flow Chi Tiết

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Actions                                 │
├─────────────────────────────────────────────────────────────────┤
│  1. Chọn đơn hàng (checkbox) ở table                            │
│  2. Click nút "Gửi tin nhắn"                                    │
│  3. Modal mở → Load template từ API                             │
│  4. Chọn template → Click "Gửi tin nhắn"                        │
│  5. Gửi song song với workers                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 2. API Template - Chi Tiết

### 2.1 Endpoint Load Template

**URL:**
```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/MailTemplate?$filter=(Active+eq+true)
```

**Headers:**
```javascript
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {token}'  // Từ TokenManager
}
```

**Response Format (OData):**
```json
{
  "@odata.context": "...",
  "value": [
    {
      "Id": 12345,
      "Name": "Tên template",
      "TypeId": "Messenger",           // Lọc: chỉ lấy TypeId chứa "messenger"
      "BodyPlain": "Nội dung text...", // Nội dung template chính
      "BodyHtml": "...",               // KHÔNG sử dụng
      "Active": true,
      "DateCreated": "2024-01-01T00:00:00"
    }
  ]
}
```

### 2.2 Cách Sử Dụng Template API

```javascript
// Khởi tạo và gọi API
const API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/MailTemplate?$filter=(Active+eq+true)';

// Sử dụng TokenManager để authenticate
const response = await window.tokenManager.authenticatedFetch(API_URL, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
});

const data = await response.json();

// Lọc chỉ template Messenger
const messengerTemplates = data.value.filter(t => {
    const typeId = (t.TypeId || '').toLowerCase();
    return typeId.includes('messenger');
});
```

### 2.3 Cấu Trúc Template Object

```javascript
{
  Id: number,           // ID unique
  Name: string,         // Tên hiển thị
  TypeId: string,       // Loại: "Messenger", "Zalo", etc.
  BodyPlain: string,    // Nội dung text với placeholders
  BodyHtml: string,     // HTML version (không dùng cho message)
  Active: boolean,      // Trạng thái hoạt động
  DateCreated: string   // ISO date string
}
```

## 3. Placeholder System

### 3.1 Danh Sách Placeholders

| Placeholder | Mô tả | Fallback |
|-------------|-------|----------|
| `{partner.name}` | Tên khách hàng | "(Khách hàng)" |
| `{partner.address}` | Địa chỉ + SĐT | "(Chưa có địa chỉ)" |
| `{partner.phone}` | Số điện thoại | "(Chưa có SĐT)" |
| `{order.code}` | Mã đơn hàng | "(Không có mã)" |
| `{order.total}` | Tổng tiền đơn hàng | "0đ" |
| `{order.details}` | Chi tiết sản phẩm + tổng tiền | "(Chưa có sản phẩm)" |

### 3.2 Cách Thay Thế Placeholder

```javascript
replacePlaceholders(content, orderData) {
    let result = content;

    // Thay thế tên khách hàng
    result = result.replace(/{partner\.name}/g, orderData.customerName || '(Khách hàng)');

    // Thay thế địa chỉ + SĐT
    const addressWithPhone = orderData.phone
        ? `${orderData.address} - SĐT: ${orderData.phone}`
        : orderData.address;
    result = result.replace(/{partner\.address}/g, addressWithPhone || '(Chưa có địa chỉ)');

    // Thay thế SĐT
    result = result.replace(/{partner\.phone}/g, orderData.phone || '(Chưa có SĐT)');

    // Thay thế chi tiết đơn hàng
    if (orderData.products && orderData.products.length > 0) {
        const productList = orderData.products
            .map(p => `- ${p.name} x${p.quantity} = ${formatCurrency(p.total)}`)
            .join('\n');
        const productListWithTotal = `${productList}\n\nTổng tiền: ${formatCurrency(orderData.totalAmount)}`;
        result = result.replace(/{order\.details}/g, productListWithTotal);
    }

    // Thay thế mã đơn
    result = result.replace(/{order\.code}/g, orderData.code || '(Không có mã)');

    // Thay thế tổng tiền
    result = result.replace(/{order\.total}/g, formatCurrency(orderData.totalAmount) || '0đ');

    return result;
}
```

### 3.3 Order Data Structure cho Placeholder

```javascript
// orderData cần có cấu trúc:
{
    Id: number,
    code: string,           // Mã đơn hàng
    customerName: string,   // Tên khách
    phone: string,          // SĐT
    address: string,        // Địa chỉ
    totalAmount: number,    // Tổng tiền
    products: [             // Danh sách sản phẩm
        {
            name: string,
            quantity: number,
            price: number,
            total: number
        }
    ]
}
```

## 4. Để Sử Dụng Tính Năng Template Ở Nơi Khác

### 4.1 Tối Thiểu Cần Có

```javascript
// 1. TokenManager phải sẵn sàng
if (!window.tokenManager || !window.tokenManager.authenticatedFetch) {
    throw new Error('TokenManager chưa khởi tạo');
}

// 2. Load templates
async function loadMessengerTemplates() {
    const API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/MailTemplate?$filter=(Active+eq+true)';

    const response = await window.tokenManager.authenticatedFetch(API_URL, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    // Lọc Messenger templates
    return data.value.filter(t =>
        (t.TypeId || '').toLowerCase().includes('messenger')
    );
}

// 3. Thay thế placeholders
function replacePlaceholders(templateContent, orderData) {
    let result = templateContent;

    result = result.replace(/{partner\.name}/g, orderData.customerName || '(Khách hàng)');
    result = result.replace(/{partner\.phone}/g, orderData.phone || '(Chưa có SĐT)');
    result = result.replace(/{order\.code}/g, orderData.code || '');
    result = result.replace(/{order\.total}/g, formatCurrency(orderData.totalAmount));
    // ... thêm các placeholder khác

    return result;
}
```

### 4.2 Sử Dụng Complete (Copy MessageTemplateManager)

Nếu cần sử dụng toàn bộ tính năng, có thể import/copy class `MessageTemplateManager` từ:

**File:** `orders-report/message-template-manager.js`

**Dependencies:**
- `window.tokenManager` - Authentication
- `window.pancakeTokenManager` - Pancake API token
- `window.pancakeDataManager` - Chat info extraction
- `window.notificationManager` - Notifications (optional)
- `window.API_CONFIG` - API endpoints

## 5. API Gửi Tin Nhắn (Pancake Official)

### 5.1 Endpoint

```
POST https://chatomni-proxy.nhijudyshop.workers.dev/api/pancake-official/pages/{channelId}/conversations/{conversationId}/messages?page_access_token={token}&customer_id={customerId}
```

### 5.2 Payload

```javascript
// Text mode
{
    action: 'reply_inbox',
    message: 'Nội dung tin nhắn'
}

// Image mode
{
    action: 'reply_inbox',
    message: 'Nội dung tin nhắn',
    content_ids: ['image_id'],
    attachment_type: 'PHOTO'
}
```

### 5.3 Error Codes

| Code | SubCode | Ý nghĩa |
|------|---------|---------|
| 10 | 2018278 | Đã quá 24h - Vui lòng dùng COMMENT |
| 551 | - | Người dùng không có mặt |

## 6. Flow Diagram

```
┌────────────────┐
│ Click Button   │
│ "Gửi tin nhắn" │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ openModal()    │
│ getSelectedOrders()
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ loadTemplates()│──► API: GET /MailTemplate
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ User chọn      │
│ template       │
└───────┬────────┘
        │
        ▼
┌────────────────┐
│ sendMessage()  │
└───────┬────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│ For each order (parallel workers):                      │
│                                                         │
│  1. fetchFullOrderData() ──► API: GET /SaleOnline_Order │
│  2. replacePlaceholders(template, orderData)            │
│  3. getChatInfoForOrder() → channelId, psid             │
│  4. getPageAccessToken(channelId)                       │
│  5. POST /messages ──► Gửi tin nhắn                     │
│                                                         │
└────────────────────────────────────────────────────────┘
```

## 7. Files Liên Quan

| File | Chức năng |
|------|-----------|
| `orders-report/tab1-orders.html:444` | Button definition |
| `orders-report/message-template-manager.js` | Core logic |
| `orders-report/pancake-token-manager.js` | Token management |
| `orders-report/pancake-data-manager.js` | Chat info, image upload |
| `orders-report/api-config.js` | API endpoints |

## 8. Ví Dụ Template Content

```
Xin chào {partner.name},

Đơn hàng #{order.code} của bạn:
{order.details}

Địa chỉ giao hàng:
{partner.address}

Cảm ơn bạn đã mua hàng!
```

**Sau khi thay thế:**
```
Xin chào Nguyễn Văn A,

Đơn hàng #DH001 của bạn:
- Sản phẩm 1 x2 = 200.000đ
- Sản phẩm 2 x1 = 100.000đ

Tổng tiền: 300.000đ

Địa chỉ giao hàng:
123 Đường ABC, Quận 1 - SĐT: 0901234567

Cảm ơn bạn đã mua hàng!
```

## 9. Quick Reply với Placeholders (/cd)

### 9.1 Mô tả

Shortcut `/cd` (Chốt Đơn Chi Tiết) trong chat modal sử dụng cùng hệ thống placeholder như API template, cho phép gửi tin nhắn với thông tin đơn hàng tự động.

### 9.2 Cách sử dụng

1. Mở chat modal với đơn hàng
2. Gõ `/cd` trong ô nhập tin nhắn
3. Chọn "CHỐT ĐƠN CHI TIẾT" từ dropdown
4. Message sẽ được thay thế placeholders với dữ liệu từ `window.currentChatOrderData`
5. Nhân viên có thể chỉnh sửa trước khi gửi

### 9.3 Template mặc định

```
Dạ chào chị {partner.name},

Em gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:

{order.details}

Đơn hàng của mình sẽ được gửi về địa chỉ "{partner.address}"
Nv. {displayName}
```

### 9.4 Cấu trúc code

**File:** `orders-report/quick-reply-manager.js`

```javascript
// Định nghĩa shortcut với flag hasPlaceholders
{
    id: 13,
    shortcut: 'cd',
    topic: 'CHỐT ĐƠN CHI TIẾT',
    topicColor: '#15803d',
    message: `Dạ chào chị {partner.name},...`,
    hasPlaceholders: true  // Flag để trigger placeholder replacement
}

// Function thay thế placeholders
replacePlaceholdersWithOrderData(content) {
    const order = window.currentChatOrderData;
    // ... replace logic
}
```

### 9.5 Mở rộng

Để thêm shortcut mới với placeholders:

1. Thêm vào `getDefaultReplies()` với `hasPlaceholders: true`
2. Placeholder hỗ trợ: `{partner.name}`, `{partner.address}`, `{partner.phone}`, `{order.code}`, `{order.total}`, `{order.details}`
3. Chữ ký nhân viên tự động thêm cuối message
