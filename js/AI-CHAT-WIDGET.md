# 🤖 AI Chat Widget - Hướng Dẫn Sử Dụng

## Tổng Quan
Widget AI được tích hợp trên tất cả các trang của N2Store, cung cấp trợ lý thông minh với các tính năng nâng cao.

## 📍 Vị Trí File
```
/home/user/n2store/js/ai-chat-widget.js
```

## ✨ Tính Năng Chính
- **Floating Button**: Nút chat nổi góc phải dưới màn hình
- **Multi-model AI**: Hỗ trợ Gemini 3/2.5/2.0 và DeepSeek
- **🆕 Page Context**: Tự động nhận diện và đọc nội dung trang
- **File Attachments**: Đính kèm hình ảnh, video, audio, PDF
- **Markdown Support**: Hiển thị response với định dạng đẹp
- **Animations**: Hiệu ứng mượt mà với Animate.css
- **Responsive**: Fullscreen trên mobile
- **Lịch sử tự động**: Lưu và khôi phục hội thoại

## 🔧 Cấu Hình API
```javascript
const CONFIG = {
  GEMINI_PROXY_URL: 'https://n2store-fallback.onrender.com/api/gemini/chat',
  DEEPSEEK_PROXY_URL: 'https://n2store-fallback.onrender.com/api/deepseek/chat',
  DEFAULT_MODEL: 'gemini-3-flash-preview',
  STORAGE_KEY: 'ai_widget_selected_model',
  HISTORY_KEY: 'ai_widget_conversation_history',
  HISTORY_MAX_MESSAGES: 100
};
```

## 📊 Các Model Hỗ Trợ

| Model | Provider | RPM | RPD | Ghi chú |
|-------|----------|-----|-----|---------|
| gemini-3-flash-preview | Gemini | 1K | 10K | ⭐ Mặc định |
| gemini-3-pro-preview | Gemini | 25 | 250 | Mạnh hơn |
| gemini-2.5-flash | Gemini | 1K | 10K | Stable |
| gemini-2.5-pro | Gemini | 150 | 10K | 2M token context |
| gemini-2.0-flash | Gemini | 1K | Unlimited | Nhanh |
| deepseek-chat | DeepSeek | 60 | Unlimited | Giá rẻ |
| deepseek-reasoner | DeepSeek | 60 | Unlimited | Suy luận tốt |

⚠️ **Lưu ý**: DeepSeek không hỗ trợ file attachments

---

## 🧭 Page Context Detection (MỚI)

### Tổng Quan
Widget tự động nhận diện loại trang và trích xuất dữ liệu từ DOM để AI hiểu rõ context khi trả lời.

### Các Loại Trang Được Hỗ Trợ

| URL Pattern | Loại Trang | Dữ Liệu Trích Xuất |
|-------------|-----------|-------------------|
| `order-management`, `hangdat` | `order` | Đơn hàng, thống kê, số lượng |
| `sanphamlive`, `product` | `product` | Sản phẩm, tên, số lượng, item đang chọn |
| `customer-management` | `customer` | Thông tin khách hàng, danh sách |
| `inventory`, `bangkiemhang` | `inventory` | Kho hàng, tồn kho |
| `livestream`, `live` | `livestream` | Dữ liệu livestream |
| `orders-report` | `report` | Báo cáo, thống kê |
| `/`, `index.html` | `dashboard` | Tổng quan |
| Khác | `general` | Thông tin chung |

### API Functions

#### 1. `detectPageType()`
Tự động nhận diện loại trang dựa trên URL.

```javascript
function detectPageType() {
    const path = window.location.pathname;
    const url = window.location.href;

    if (path.includes('order-management') || url.includes('hangdat')) {
        return 'order';
    }
    // ... các điều kiện khác
    return 'general';
}
```

**Returns:** `'product'` | `'order'` | `'customer'` | `'inventory'` | `'livestream'` | `'report'` | `'dashboard'` | `'general'`

---

#### 2. `extractProductData()`
Trích xuất dữ liệu sản phẩm từ bảng hoặc danh sách.

```javascript
function extractProductData() {
    return {
        products: [
            { name: 'Tên SP', info: 'Thông tin chi tiết' }
        ],
        totalCount: 25,
        selectedProduct: 'Sản phẩm đang được chọn'
    };
}
```

**Dữ liệu thu thập:**
- ✅ Tổng số sản phẩm trên trang
- ✅ Top 5 sản phẩm (tên + info)
- ✅ Sản phẩm đang được chọn (nếu có)

**DOM Selectors:**
```javascript
// Tìm rows
'table tbody tr, .product-item, .product-row'

// Tìm selected item
'tr.selected, .product-item.active'
```

---

#### 3. `extractOrderData()`
Trích xuất dữ liệu đơn hàng và thống kê.

```javascript
function extractOrderData() {
    return {
        orders: [{ info: 'Đơn #123 | Nguyễn A | 500k' }],
        totalCount: 50,
        stats: {
            'Tổng doanh thu': '10M',
            'Đơn hoàn thành': '45'
        }
    };
}
```

**Dữ liệu thu thập:**
- ✅ Tổng số đơn hàng
- ✅ Top 3 đơn mẫu
- ✅ Thống kê từ stat cards

**DOM Selectors:**
```javascript
// Orders
'table tbody tr, .order-item, .order-row'

// Stats
'.stat-card, .summary-card, .metric'
```

---

#### 4. `extractCustomerData()`
Trích xuất dữ liệu khách hàng.

```javascript
function extractCustomerData() {
    return {
        customers: [{ info: 'Nguyễn A | 0901234567 | ...' }],
        totalCount: 100
    };
}
```

**Dữ liệu thu thập:**
- ✅ Tổng số khách hàng
- ✅ Top 3 khách hàng mẫu

---

#### 5. `extractGeneralPageData()`
Trích xuất dữ liệu chung (filters, search, user info).

```javascript
function extractGeneralPageData() {
    return {
        filters: {
            'Trạng thái': 'Hoàn thành',
            'Loại': 'Online'
        },
        search: 'iPhone 15',
        user: {
            name: 'Admin',
            role: 'admin'
        },
        pageHeading: 'Quản lý sản phẩm'
    };
}
```

**Dữ liệu thu thập:**
- ✅ Search query hiện tại
- ✅ Filters đang active
- ✅ Thông tin user từ `localStorage` hoặc `window.currentUser`
- ✅ Heading của trang

**DOM Selectors:**
```javascript
// Search input
'input[type="search"], input[placeholder*="Tìm"], input[name*="search"]'

// Filters
'select, .filter-select'

// Page heading
'h1, h2, .page-title, .header-title'
```

---

#### 6. `getPageContext()`
Tổng hợp toàn bộ context của trang.

```javascript
function getPageContext() {
    const pageType = detectPageType();
    const generalData = extractGeneralPageData();

    const context = {
        pageType,
        url: window.location.href,
        pathname: window.location.pathname,
        title: document.title,
        ...generalData
    };

    // Add page-specific data
    switch (pageType) {
        case 'product':
            context.productData = extractProductData();
            break;
        case 'order':
            context.orderData = extractOrderData();
            break;
        case 'customer':
            context.customerData = extractCustomerData();
            break;
    }

    return context;
}
```

**Returns:** Object chứa toàn bộ context

---

#### 7. `formatContextForAI(context)`
Format context thành text để gửi cho AI.

```javascript
function formatContextForAI(context) {
    let text = `[CONTEXT - Trang hiện tại]\n`;
    text += `- Loại trang: ${context.pageType}\n`;
    text += `- Tiêu đề: ${context.title}\n`;
    // ... thêm các thông tin khác
    return text;
}
```

**Output Example:**
```
[CONTEXT - Trang hiện tại]
- Loại trang: product
- Tiêu đề: Quản lý sản phẩm - N2Store
- Heading: Danh sách sản phẩm
- User: Admin (admin)
- Đang tìm kiếm: "iPhone 15"
- Filters đang áp dụng: {"Danh mục":"Điện thoại"}

[Sản phẩm]
- Tổng số: 25
- Đang chọn: iPhone 15 Pro Max 256GB
- Một số sản phẩm trên trang:
  1. iPhone 15 Pro Max 256GB
  2. iPhone 15 Pro 128GB
  3. iPhone 15 Plus 128GB
  4. Galaxy S24 Ultra
  5. Xiaomi 14 Pro

[CÂU HỎI CỦA USER]
Sản phẩm nào bán chạy nhất?
```

---

### Integration vào `sendMessage()`

Context được tự động thêm vào mỗi message gửi đến AI:

```javascript
async function sendMessage() {
    const text = input.value.trim();

    // 🆕 GET PAGE CONTEXT
    const pageContext = getPageContext();
    const contextText = formatContextForAI(pageContext);

    // Combine user message with page context
    const userMessageWithContext = `${contextText}\n\n[CÂU HỎI CỦA USER]\n${text}`;

    console.log('[AI Chat] Sending with context:', pageContext);

    // Send to AI...
    const response = await fetch(CONFIG.GEMINI_PROXY_URL, {
        method: 'POST',
        body: JSON.stringify({
            model: currentModel,
            contents: [{
                role: 'user',
                parts: [{ text: userMessageWithContext }]
            }]
        })
    });
}
```

---

### Use Cases & Examples

#### Example 1: Trang Sản Phẩm
**User hỏi:** "Có bao nhiêu sản phẩm?"

**AI nhận được:**
```
[CONTEXT - Trang hiện tại]
- Loại trang: product
- Tổng số: 142

[CÂU HỎI CỦA USER]
Có bao nhiêu sản phẩm?
```

**AI trả lời:** "Hiện tại có **142 sản phẩm** trên trang này."

---

#### Example 2: Trang Đơn Hàng với Filter
**User hỏi:** "Tổng doanh thu là bao nhiêu?"

**AI nhận được:**
```
[CONTEXT - Trang hiện tại]
- Loại trang: order
- Filters đang áp dụng: {"Trạng thái":"Hoàn thành"}
- Thống kê: {"Tổng doanh thu":"15,500,000 VND"}

[CÂU HỎI CỦA USER]
Tổng doanh thu là bao nhiêu?
```

**AI trả lời:** "Tổng doanh thu của các đơn **Hoàn thành** là **15,500,000 VND**."

---

#### Example 3: Đang Search
**User đang search "iPhone 15" và hỏi:** "Sản phẩm nào rẻ nhất?"

**AI nhận được:**
```
[CONTEXT - Trang hiện tại]
- Loại trang: product
- Đang tìm kiếm: "iPhone 15"

[Sản phẩm]
- Một số sản phẩm trên trang:
  1. iPhone 15 128GB | 18,990,000đ
  2. iPhone 15 Plus 128GB | 21,990,000đ
  3. iPhone 15 Pro 128GB | 26,990,000đ

[CÂU HỎI CỦA USER]
Sản phẩm nào rẻ nhất?
```

**AI trả lời:** "Trong kết quả tìm kiếm 'iPhone 15', sản phẩm rẻ nhất là **iPhone 15 128GB** với giá **18,990,000đ**."

---

### Performance Optimization

**Giới hạn dữ liệu để tránh context quá dài:**
- Products: Top 5 items
- Orders: Top 3 items
- Customers: Top 3 items
- Filters: Chỉ những filters đang active
- Stats: Chỉ những stat cards hiển thị

**Error Handling:**
```javascript
try {
    // Extract data
} catch (e) {
    console.warn('[Context] Failed to extract data:', e);
    // Tiếp tục hoạt động bình thường
}
```

Widget sẽ không crash nếu DOM structure khác so với expected.

---

### Debug & Development

**Console Logging:**
```javascript
console.log('[AI Chat] Sending with context:', pageContext);
```

Mở DevTools Console để xem context object được gửi đi.

**Test Manual:**
```javascript
// Trong Console
const ctx = getPageContext();
console.log(ctx);

const formatted = formatContextForAI(ctx);
console.log(formatted);
```

---

## 🚀 Cách Sử Dụng

### 1. Mở Chat Widget
- Click nút tròn màu tím góc phải dưới
- Hoặc gọi: `window.AIChatWidget.toggle()`

### 2. Chọn Model
- Click dropdown thanh model
- Model được lưu vào localStorage cho lần sau

### 3. Gửi Tin Nhắn
- Nhập và nhấn **Enter** hoặc click nút **Gửi**
- Shift + Enter để xuống dòng
- **🆕 AI sẽ tự động hiểu context trang bạn đang xem**

### 4. Đính Kèm File
- Click nút **📎** để chọn file
- Hoặc **Ctrl+V** dán hình từ clipboard
- Hỗ trợ: Image, Video, Audio, PDF

### 5. Xóa Lịch Sử
- Click **🗑️ Xóa** trên thanh model
- Xác nhận để xóa toàn bộ
- Hoặc gọi: `window.AIChatWidget.clearHistory()`

---

## 📁 Cấu Trúc Code
```
ai-chat-widget.js
├── CONFIG
├── MODELS
├── STATE (isOpen, currentModel, conversationHistory, attachments)
├── 🆕 PAGE CONTEXT DETECTION
│   ├── detectPageType()
│   ├── extractProductData()
│   ├── extractOrderData()
│   ├── extractCustomerData()
│   ├── extractGeneralPageData()
│   ├── getPageContext()
│   └── formatContextForAI()
├── CSS STYLES
├── HTML TEMPLATE
├── CORE FUNCTIONS (inject, create, setup, toggle)
├── CONVERSATION HISTORY (load, save, clear)
├── MESSAGING (add, load, send)
├── ATTACHMENTS (select, paste, process, preview)
└── INITIALIZATION
```

---

## 🌐 API Flow
```
Widget Frontend → Get Page Context → Format Context →
Render Proxy → Gemini API / DeepSeek API → Response
```

### Request Format (Gemini with Context)
```json
POST /api/gemini/chat
{
  "model": "gemini-3-flash-preview",
  "contents": [{
    "role": "user",
    "parts": [
      {
        "text": "[CONTEXT - Trang hiện tại]\n- Loại trang: product\n...\n\n[CÂU HỎI CỦA USER]\nSản phẩm nào bán chạy?"
      },
      {
        "inline_data": {
          "mime_type": "image/png",
          "data": "base64..."
        }
      }
    ]
  }]
}
```

### Request Format (DeepSeek)
```json
POST /api/deepseek/chat
{
  "model": "deepseek-chat",
  "messages": [{
    "role": "user",
    "content": "[CONTEXT...]\n\n[CÂU HỎI]..."
  }],
  "max_tokens": 4096,
  "temperature": 0.7
}
```

---

## 🔌 Global API
```javascript
// Khởi tạo (tự động khi DOM ready)
window.AIChatWidget.init();

// Mở/đóng chat
window.AIChatWidget.toggle();

// Xóa attachment theo ID
window.AIChatWidget.removeAttachment(id);

// Xóa lịch sử hội thoại
window.AIChatWidget.clearHistory();

// 🆕 Get context của trang hiện tại (for debugging)
// Note: Các functions này là internal, không export ra global
```

---

## 📱 Responsive
| Màn hình | Hành vi |
|----------|--------|
| Desktop (> 480px) | Widget 380x520px, góc phải |
| Mobile (≤ 480px) | Fullscreen, FAB nhỏ hơn |

---

## 🎨 Tùy Chỉnh Giao Diện

### Thay đổi màu gradient
Tìm trong `WIDGET_STYLES`:
```css
/* Gradient chính */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Gradient khi mở */
background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
```

### Thay đổi vị trí FAB
```css
.ai-chat-fab {
  bottom: 24px; /* Khoảng cách dưới */
  right: 24px;  /* Khoảng cách phải */
}
```

---

## ⚠️ Lưu Ý Quan Trọng

### 1. DeepSeek và File Attachments
- DeepSeek không hỗ trợ file
- Chọn Gemini nếu cần gửi hình/video

### 2. Rate Limits
Mỗi model có giới hạn khác nhau (xem bảng models)

### 3. Context Size
- Trang có nhiều dữ liệu chỉ gửi sample (3-5 items)
- Tránh vượt quá token limit của AI

### 4. API Key Security
- Lưu an toàn trên Render server
- Không expose client-side

### 5. Lịch Sử & Storage
- Lưu trong localStorage (max 100 tin)
- Hình chỉ lưu preview (base64)
- Context được extract realtime, không lưu

### 6. DOM Dependency
- Context extraction phụ thuộc vào DOM structure
- Nếu HTML thay đổi, có thể cần update selectors
- Error handling đảm bảo widget vẫn hoạt động

---

## 🔗 Liên Kết
- **Gemini API Docs**: https://ai.google.dev/docs
- **DeepSeek API Docs**: https://platform.deepseek.com/docs
- **Repository**: https://github.com/nhijudyshop/n2store

---

## 📝 Changelog

### v2.0.0 - 2025-12-30
**🆕 Page Context Detection**
- ✅ Thêm `detectPageType()` - auto-detect 8 loại trang
- ✅ Thêm `extractProductData()` - extract sản phẩm từ DOM
- ✅ Thêm `extractOrderData()` - extract đơn hàng và stats
- ✅ Thêm `extractCustomerData()` - extract khách hàng
- ✅ Thêm `extractGeneralPageData()` - extract search, filters, user
- ✅ Thêm `getPageContext()` - tổng hợp context
- ✅ Thêm `formatContextForAI()` - format context cho AI
- ✅ Tích hợp context vào `sendMessage()`
- ✅ Console logging để debug

**Impact:**
- AI giờ hiểu rõ trang user đang xem
- Câu trả lời chính xác và contextual hơn
- Không cần user mô tả lại những gì trên trang

---

*Cập nhật: 2025-12-30*
