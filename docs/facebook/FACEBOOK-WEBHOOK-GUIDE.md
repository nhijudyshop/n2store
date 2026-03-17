# Facebook Graph API & Webhooks - Hướng dẫn nhận tin nhắn realtime

> Tài liệu tổng hợp từ https://developers.facebook.com/docs/graph-api/
> Mục đích: Nhận tin nhắn Facebook Page realtime qua Webhook (không cần qua Pancake)

---

## 1. TỔNG QUAN GRAPH API

- **Graph API v25.0** là API chính để đọc/ghi dữ liệu Facebook.
- Mọi SDK và sản phẩm Meta đều dùng Graph API.
- Base URL: `https://graph.facebook.com/v25.0/`

---

## 2. WEBHOOK LÀ GÌ?

Webhook cho phép nhận **HTTP POST notification realtime** khi có thay đổi trên Facebook (tin nhắn mới, comment, reaction, v.v.) thay vì phải polling API liên tục.

**Ưu điểm so với polling:**
- Realtime (gần như tức thì)
- Không bị rate limit
- Tiết kiệm tài nguyên server

---

## 3. YÊU CẦU KỸ THUẬT

### 3.1 Server endpoint
- **HTTPS bắt buộc** với TLS/SSL certificate hợp lệ (self-signed KHÔNG được)
- Phải xử lý được cả GET (verification) và POST (notification)
- Phải response **200 OK trong 5 giây**

### 3.2 Facebook App
- Tạo app tại https://developers.facebook.com/apps/
- Cần permissions:
  - `pages_messaging` - nhận/gửi tin nhắn
  - `pages_manage_metadata` - quản lý webhook subscription

### 3.3 Access Level
- **Standard Access**: Chỉ nhận notification từ users có role trong app (admin, developer, tester)
- **Advanced Access**: Nhận notification từ TẤT CẢ khách hàng (cần App Review)

---

## 4. CÀI ĐẶT WEBHOOK - TỪNG BƯỚC

### Bước 1: Tạo endpoint trên server

Server cần xử lý 2 loại request:

#### A. GET - Verification Request (Facebook xác minh endpoint)

Facebook gửi GET request với 3 params:
- `hub.mode` = `"subscribe"`
- `hub.verify_token` = token bạn tự đặt khi cấu hình
- `hub.challenge` = số nguyên, phải trả về để xác nhận

```javascript
// Node.js Express example
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = 'your_custom_token_here';

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
```

#### B. POST - Event Notification (nhận tin nhắn/sự kiện)

```javascript
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(entry => {
      const messagingEvents = entry.messaging;
      if (messagingEvents) {
        messagingEvents.forEach(event => {
          if (event.message) {
            const senderId = event.sender.id;      // PSID của khách
            const pageId = event.recipient.id;      // Page ID
            const text = event.message.text;         // Nội dung tin nhắn
            const mid = event.message.mid;           // Message ID
            const timestamp = event.timestamp;       // Thời gian

            console.log(`[${pageId}] ${senderId}: ${text}`);
          }
        });
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});
```

### Bước 2: Cấu hình trên Facebook App Dashboard

1. Vào https://developers.facebook.com/apps/ → Chọn app
2. Vào **Products > Messenger > Settings**
3. Trong phần **Webhooks**:
   - Nhập **Callback URL**: `https://your-server.com/webhook`
   - Nhập **Verify Token**: token bạn tự đặt (trùng với code server)
   - Chọn **Subscription Fields** (xem mục 5)
   - Click **Verify and Save**

### Bước 3: Subscribe Page vào Webhook

Dùng Graph API để đăng ký page nhận webhook:

```bash
# Subscribe page
curl -X POST "https://graph.facebook.com/v25.0/{PAGE_ID}/subscribed_apps" \
  -d "subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads" \
  -d "access_token={PAGE_ACCESS_TOKEN}"

# Kiểm tra subscription
curl "https://graph.facebook.com/v25.0/{PAGE_ID}/subscribed_apps?access_token={PAGE_ACCESS_TOKEN}"
```

---

## 5. MESSENGER WEBHOOK EVENTS (SUBSCRIPTION FIELDS)

### Các event quan trọng nhất:

| Field | Mô tả |
|-------|--------|
| `messages` | **Tin nhắn mới** từ khách hàng |
| `message_deliveries` | Xác nhận tin nhắn đã gửi đến |
| `message_reads` | Khách đã đọc tin nhắn |
| `messaging_postbacks` | Khách nhấn nút/quick reply |
| `message_echoes` | Echo tin nhắn gửi đi (từ page) |
| `messaging_optins` | Khách opt-in nhận thông báo |
| `messaging_referrals` | Thông tin referral (từ ads, link) |
| `messaging_handovers` | Chuyển giao hội thoại giữa apps |
| `messaging_account_linking` | Liên kết tài khoản |

### Các event khác:

| Field | Mô tả |
|-------|--------|
| `message_reactions` | Reaction emoji trên tin nhắn |
| `message_edits` | Tin nhắn bị chỉnh sửa |
| `messaging_integrity` | Vi phạm policy |
| `messaging_policy_enforcement` | Hành động xử lý policy |
| `messaging_in_thread_lead_form_submit` | Form lead trong thread |

---

## 6. CẤU TRÚC PAYLOAD TIN NHẮN

### 6.1 Payload tổng quát

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<PAGE_ID>",
      "time": 1458692752478,
      "messaging": [
        {
          "sender": { "id": "<PSID>" },
          "recipient": { "id": "<PAGE_ID>" },
          "timestamp": 1458692752478,
          "message": {
            "mid": "mid.1457764197618:41d102a3e1ae206a38",
            "text": "Xin chào shop"
          }
        }
      ]
    }
  ]
}
```

### 6.2 Tin nhắn text

```json
{
  "sender": { "id": "123456789" },
  "recipient": { "id": "987654321" },
  "timestamp": 1458692752478,
  "message": {
    "mid": "mid.1457764197618:41d102a3e1ae206a38",
    "text": "Sản phẩm này giá bao nhiêu?"
  }
}
```

### 6.3 Tin nhắn có attachment (hình ảnh, video, file)

```json
{
  "sender": { "id": "123456789" },
  "recipient": { "id": "987654321" },
  "timestamp": 1458692752478,
  "message": {
    "mid": "mid.1458696618141:b4ef9d19ec21086067",
    "attachments": [
      {
        "type": "image",
        "payload": {
          "url": "https://scontent.xx.fbcdn.net/..."
        }
      }
    ]
  }
}
```

**Attachment types:** `image`, `audio`, `video`, `file`, `reel`, `ig_reel`, `template`, `fallback`

### 6.4 Tin nhắn Quick Reply

```json
{
  "sender": { "id": "123456789" },
  "recipient": { "id": "987654321" },
  "timestamp": 1458692752478,
  "message": {
    "mid": "mid.1457764197618:41d102a3e1ae206a38",
    "text": "Có, tôi muốn mua",
    "quick_reply": {
      "payload": "BUY_CONFIRMED"
    }
  }
}
```

### 6.5 Reply to (trả lời tin nhắn cụ thể)

```json
{
  "message": {
    "mid": "mid.new_message_id",
    "text": "Dạ đúng rồi ạ",
    "reply_to": {
      "mid": "mid.original_message_id",
      "is_self_reply": false
    }
  }
}
```

### 6.6 Postback (khi khách nhấn nút)

```json
{
  "sender": { "id": "123456789" },
  "recipient": { "id": "987654321" },
  "timestamp": 1458692752478,
  "postback": {
    "title": "Xem sản phẩm",
    "payload": "VIEW_PRODUCTS"
  }
}
```

---

## 7. BẢO MẬT - XÁC THỰC PAYLOAD

Mỗi POST request có header `X-Hub-Signature-256` chứa SHA256 signature.

```javascript
const crypto = require('crypto');

function verifySignature(req, appSecret) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return signature === `sha256=${expectedHash}`;
}

// Sử dụng trong middleware
app.post('/webhook', (req, res) => {
  if (!verifySignature(req, APP_SECRET)) {
    return res.sendStatus(403);
  }
  // Xử lý webhook...
});
```

---

## 8. PAGE WEBHOOK FIELDS (NGOÀI MESSENGER)

Ngoài Messenger, Page webhook còn hỗ trợ:

| Field | Mô tả |
|-------|--------|
| `feed` | Mọi thay đổi trên feed: posts, shares, likes, comments |
| `mention` | Page được mention |
| `ratings` | Đánh giá và reviews |
| `live_videos` | Trạng thái live video |
| `leadgen` | Form lead generation |
| `product_review` | Review sản phẩm |
| `calls` | Cập nhật cuộc gọi |
| `inbox_labels` | Quản lý nhãn inbox |

---

## 9. XỬ LÝ LỖI & RETRY

- Facebook retry liên tục trong **36 giờ** nếu không nhận được 200 OK
- Sau **15 phút** thất bại → cảnh báo
- Sau **1 giờ** thất bại → webhook tự động **disable**, app bị unsubscribe khỏi page
- **QUAN TRỌNG:** Implement deduplication (kiểm tra `mid` trùng lặp) vì có thể nhận cùng event nhiều lần
- Tối đa **1000 updates/batch**

---

## 10. QUICK START - SETUP TỐI THIỂU

```bash
# 1. Tạo server (Node.js)
npm init -y && npm install express

# 2. Deploy lên server có HTTPS (Render, Railway, Vercel, etc.)

# 3. Cấu hình webhook trên Facebook App Dashboard
#    Callback URL: https://your-server.com/webhook
#    Verify Token: your_secret_token
#    Subscription Fields: messages

# 4. Subscribe page
curl -X POST "https://graph.facebook.com/v25.0/{PAGE_ID}/subscribed_apps" \
  -d "subscribed_fields=messages" \
  -d "access_token={PAGE_ACCESS_TOKEN}"

# 5. Done! Tin nhắn mới sẽ được POST đến server
```

---

## 11. SO SÁNH: FACEBOOK WEBHOOK vs PANCAKE WEBHOOK

| | Facebook Webhook (trực tiếp) | Pancake Webhook |
|---|---|---|
| **Đăng ký** | Tự cấu hình trên App Dashboard | Phải liên hệ đội Pancake |
| **Subscription** | Miễn phí | Tính 2 slots/page |
| **Dữ liệu** | Raw data từ Facebook | Data đã xử lý bởi Pancake |
| **Đa kênh** | Chỉ Facebook/Instagram | Facebook, TikTok, WhatsApp, Shopee, Lazada, Line, YouTube... |
| **Cần Facebook App** | Có | Không |
| **Cần App Review** | Có (cho Advanced Access) | Không |
| **Tính phí** | Miễn phí | Phí subscription Pancake |
| **Độ phức tạp** | Trung bình (tự setup) | Thấp (Pancake lo) |

---

## 12. mTLS - THAY ĐỔI SẮP TỚI

> **Deadline: 31/03/2026** - Meta chuyển webhook certificate sang CA mới.
> Nếu server validate mTLS certificates, cần cập nhật trust store với root certificate mới: `meta-outbound-api-ca-2025-12.pem`

---

## TÓM TẮT: CÁCH NHANH NHẤT ĐỂ NHẬN TIN NHẮN FB REALTIME

1. Tạo Facebook App → lấy App ID, App Secret
2. Lấy Page Access Token (long-lived)
3. Tạo HTTPS server với endpoint `/webhook`
4. Cấu hình webhook trên App Dashboard (callback URL + verify token)
5. Subscribe page: `POST /{PAGE_ID}/subscribed_apps?subscribed_fields=messages`
6. Nhận tin nhắn qua POST request → field `entry[].messaging[].message.text`
