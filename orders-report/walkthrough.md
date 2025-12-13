# Facebook Message Tag - Hướng Dẫn Kỹ Thuật

## Tổng quan

Khi gửi tin nhắn Facebook Messenger, nếu khách hàng không tương tác trong 24 giờ, Facebook sẽ chặn tin nhắn (`e_code: 10, e_subcode: 2018278`). 

**Giải pháp:** Sử dụng Facebook Graph API trực tiếp với `MESSAGE_TAG: POST_PURCHASE_UPDATE` để bypass.

---

## Architecture

```mermaid
flowchart TD
    A[User gửi tin nhắn] --> B{Pancake API}
    B -->|Success| C[✅ Gửi thành công]
    B -->|24h Error| D[tryPancakeUnlock]
    D -->|Vẫn fail| E[show24hFallbackPrompt]
    E --> F{User chọn}
    F -->|Message Tag| G[sendMessageViaFacebookTag]
    F -->|Comment| H[Chuyển sang Comment mode]
    G --> I[/api/facebook-send]
    I --> J[graph.facebook.com]
    J --> K[✅ Gửi với POST_PURCHASE_UPDATE tag]
```

---

## Các file đã sửa

### 1. Cloudflare Worker

**File:** [worker.js](file:///Users/mac/Downloads/n2store/cloudflare-worker/worker.js)

Thêm endpoint `/api/facebook-send` (line 625-739):

```javascript
// POST /api/facebook-send
// Body: { pageId, psid, message, pageToken, useTag: true }
if (pathname === '/api/facebook-send' && request.method === 'POST') {
    const { pageId, psid, message, pageToken, useTag } = await request.json();
    
    const fbBody = {
        recipient: { id: psid },
        message: { text: message },
        messaging_type: useTag ? 'MESSAGE_TAG' : 'RESPONSE',
        tag: useTag ? 'POST_PURCHASE_UPDATE' : undefined
    };
    
    const response = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/messages?access_token=${pageToken}`,
        { method: 'POST', body: JSON.stringify(fbBody) }
    );
    // ... handle response
}
```

---

### 2. API Config

**File:** [api-config.js](file:///Users/mac/Downloads/n2store/orders-report/api-config.js)

Thêm function `facebookSend()` (line 85-92):

```javascript
buildUrl: {
    // ... existing functions
    facebookSend: () => `${WORKER_URL}/api/facebook-send`
}
```

---

### 3. Tab1 Orders

**File:** [tab1-orders.js](file:///Users/mac/Downloads/n2store/orders-report/tab1-orders.js)

#### A. Lưu CRMTeam khi mở chat modal (line 7836)

```javascript
// Trong hàm openChatModal
window.currentCRMTeam = fullOrderData.CRMTeam || null;
if (window.currentCRMTeam?.Facebook_PageToken) {
    console.log('[CHAT] CRMTeam loaded with Facebook_PageToken');
}
```

#### B. Function gửi qua Facebook API (line 9528-9632)

```javascript
async function sendMessageViaFacebookTag({ pageId, psid, message }) {
    // Lấy token theo thứ tự ưu tiên:
    // 1. window.currentCRMTeam.Facebook_PageToken (từ chat modal)
    // 2. window.currentOrder.CRMTeam.Facebook_PageToken
    // 3. window.cachedChannelsData
    // 4. Fetch từ SaleOnline_Order(orderId)?$expand=CRMTeam
    
    const response = await fetch(API_CONFIG.buildUrl.facebookSend(), {
        method: 'POST',
        body: JSON.stringify({ pageId, psid, message, pageToken, useTag: true })
    });
    return response.json();
}
```

#### C. Modal fallback UI (line 9655-9700)

```javascript
window.show24hFallbackPrompt = function(messageText, pageId, psid) {
    // Hiển thị modal với 2 lựa chọn:
    // - Gửi với Message Tag (POST_PURCHASE_UPDATE)
    // - Chuyển sang Comment
};
```

#### D. Sửa error handler (line 10090)

```javascript
// Trong catch block của sendMessageInternal
if (error.is24HourError && originalMessage && pageId && psid) {
    window.show24hFallbackPrompt(originalMessage, pageId, psid);
}
```

---

## Flow xử lý 24h Error

1. **User gửi tin nhắn** → `sendMessage()` → `processChatMessageQueue()`

2. **sendMessageInternal()** gọi Pancake API
   - Nếu thành công → Kết thúc
   - Nếu lỗi 24h → Bắt exception với `is24HourError = true`

3. **tryPancakeUnlock()** - Thử unlock conversation
   - Gọi 3 API: `fill_admin_name`, `check_inbox`, `contents/touch`
   - Retry gửi tin nhắn
   - Nếu vẫn fail → Chuyển sang bước 4

4. **show24hFallbackPrompt()** - Hiển thị UI cho user chọn

5. **sendMessageViaFacebookTag()** nếu user chọn "Message Tag"
   - Lấy `Facebook_PageToken` từ `window.currentCRMTeam`
   - Gọi `/api/facebook-send` → Cloudflare Worker
   - Worker gọi `graph.facebook.com` với `MESSAGE_TAG`

---

## Token Flow

```
TPOS API
  └─ SaleOnline_Order(id)?$expand=CRMTeam
      └─ CRMTeam.Facebook_PageToken  ← Token cho FB Graph API
          │
          └─ Khác với Pancake page_access_token!
```

| Token | Nguồn | Mục đích |
|-------|-------|----------|
| `page_access_token` | Pancake Settings → Tools | Pancake API |
| `Facebook_PageToken` | TPOS → CRMTeam | Facebook Graph API (Message Tag) |

---

## Lưu ý quan trọng

> [!CAUTION]
> **POST_PURCHASE_UPDATE chỉ được dùng cho:**
> - Xác nhận đơn hàng / hóa đơn
> - Cập nhật trạng thái vận chuyển
> - Yêu cầu hành động từ khách (thẻ bị từ chối...)
>
> **KHÔNG DÙNG cho:** quảng cáo, khuyến mãi → Facebook sẽ ban Page!

---

## Deploy

```bash
cd /Users/mac/Downloads/n2store/cloudflare-worker
npx wrangler deploy
```

---

## Test

1. Mở chat modal cho order
2. Kiểm tra console: `[CHAT] CRMTeam loaded with Facebook_PageToken`
3. Gửi tin nhắn cho conversation đã quá 24h
4. Modal fallback sẽ hiện lên
5. Click "Gửi với Message Tag"
6. Kiểm tra console: `[FB-TAG-SEND] ✅ Got Facebook Page Token from window.currentCRMTeam`
