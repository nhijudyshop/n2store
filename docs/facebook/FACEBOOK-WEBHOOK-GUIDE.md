# Facebook Messenger Webhooks & Send API - Hướng dẫn đầy đủ

> Tài liệu tổng hợp từ https://developers.facebook.com/docs/graph-api/
> Mục đích: Nhận và gửi tin nhắn Facebook Page realtime qua Webhook + Send API

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

#### C. Bảo mật - Xác thực Payload

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

> **Lưu ý:** Ứng dụng chỉ có "Standard Access" nên webhooks chỉ chạy với tin nhắn của người có vai trò trong App (Admin/Developer). Để nhận tin từ khách hàng thật, bắt buộc xin "Advanced Access" cho quyền `pages_messaging`.

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

## 6. CẤU TRÚC PAYLOAD WEBHOOK (NHẬN TIN NHẮN)

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

### 6.2 Các thuộc tính quan trọng trong `message` Webhook

1. **`sender.id`**: PSID (Page-scoped ID) của người gửi. Dùng ID này để gửi tin nhắn phản hồi.
2. **`recipient.id`**: ID Trang Facebook (Page ID).
3. **`message.mid`**: Message ID duy nhất.
4. **`message.text`**: Nội dung văn bản.
5. **`message.quick_reply`**: Nếu người dùng nhấn Quick Reply. `payload` chứa Custom data đã định nghĩa trước.
6. **`message.reply_to`**: Chứa `mid` tin nhắn đang được reply. `is_self_reply` = true nếu tự reply.
7. **`message.attachments`**: Mảng tệp đính kèm.
   - `type`: `audio`, `file`, `image` (bao gồm gif, sticker), `video`, `fallback`, `reel`, `ig_reel`, `appointment_booking`
   - `payload.url`: URL gốc của media
   - `payload.sticker_id`: ID sticker nếu gửi sticker
8. **`message.referral`**: (Graph API v8.0+) Từ Shops hoặc Quảng cáo CTM. Chứa `ad_id`, `ads_context_data`.
9. **`message.commands`**: Mảng lệnh nếu tin nhắn bắt đầu bằng `/`.

### 6.3 Tin nhắn text

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

### 6.4 Tin nhắn có attachment (hình ảnh, video, file)

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

### 6.5 Tin nhắn Quick Reply

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

### 6.6 Reply to (trả lời tin nhắn cụ thể)

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

### 6.7 Postback (khi khách nhấn nút)

```json
{
  "sender": { "id": "123456789" },
  "recipient": { "id": "987654321" },
  "timestamp": 1458692752478,
  "postback": {
    "title": "Xem sản phẩm",
    "payload": "VIEW_PRODUCTS",
    "referral": {
      "ref": "USER-DEFINED-REFERRAL-PARAM",
      "source": "SHORT-URL",
      "type": "OPEN_THREAD"
    }
  }
}
```

- **`postback.title`**: Text trên nút bấm.
- **`postback.payload`**: Giá trị ẩn do bạn định nghĩa (ví dụ `ORDER_PIZZA`).
- **`postback.referral`**: Chỉ có nếu mở từ m.me Link, Ads, QR, Welcome Screen.

---

## 7. CÁC WEBHOOK EVENT KHÁC

### 7.1 `message_deliveries` (Đã giao)

Thông báo tin nhắn Page gửi đã "Delivered" trên thiết bị người dùng.

```json
{
  "sender": { "id": "<PSID>" },
  "recipient": { "id": "<PAGE_ID>" },
  "delivery": {
    "mids": [ "mid.1458668856218:ed81099e15d3f4f233" ],
    "watermark": 1458668856253
  }
}
```

- `delivery.mids`: Mảng Message ID đã giao thành công.
- `delivery.watermark`: Timestamp - tất cả tin nhắn trước mốc này đều đã giao.

### 7.2 `message_reads` (Đã đọc/Seen)

```json
{
  "sender": { "id": "<PSID>" },
  "recipient": { "id": "<PAGE_ID>" },
  "timestamp": 1458668856463,
  "read": {
    "watermark": 1458668856253
  }
}
```

- Tin nhắn gửi trước mốc `watermark` đều được tính là đã đọc.

### 7.3 `message_echoes` (Vọng lại từ Page)

Thông báo khi Page GỬI ĐI tin nhắn. Hữu ích khi nhiều App quản lý chung 1 Page hoặc lưu lịch sử.

```json
{
  "sender": { "id": "<PAGE_ID>" },
  "recipient": { "id": "<PSID>" },
  "timestamp": 1457764197627,
  "message": {
    "is_echo": true,
    "app_id": 1517776481860111,
    "metadata": "<DEVELOPER_DEFINED_METADATA_STRING>",
    "mid": "mid.1457764197618:41d102a3e1ae206a38"
  }
}
```

- `message.is_echo`: Luôn `true`.
- `message.app_id`: App ID đã gửi. Nếu gửi trực tiếp qua Page Inbox: `26390203743090`.
- `message.metadata`: Chuỗi custom gắn lúc gọi Send API.

### 7.4 `message_reactions` (Cảm xúc)

```json
{
  "sender": { "id": "<PSID>" },
  "recipient": { "id": "<PAGE_ID>" },
  "timestamp": 1458668856463,
  "reaction": {
    "reaction": "smile|angry|sad|wow|love|like|dislike|other",
    "emoji": "❤️",
    "action": "react|unreact",
    "mid": "<MID_OF_ReactedTo_Message>"
  }
}
```

- `reaction.reaction`: Tên reaction (`smile`, `like`, `love`...).
- `reaction.action`: `react` (thả) hay `unreact` (hủy).
- `reaction.mid`: Tin nhắn nào bị react.

---

## 8. SEND API - GỬI TIN NHẮN

Send API dùng để gửi tin nhắn lại cho người dùng, bao gồm văn bản, tệp đính kèm, templates, hoặc trạng thái (đang gõ...).

### 8.1 Endpoint

```
POST https://graph.facebook.com/v25.0/{PAGE_ID}/messages
```

### 8.2 Ví dụ gửi văn bản

```bash
curl -X POST "https://graph.facebook.com/v25.0/{PAGE_ID}/messages" \
     -d "recipient={'id':'{PSID}'}" \
     -d "messaging_type=RESPONSE" \
     -d "message={'text':'hello, world'}" \
     -d "access_token={PAGE_ACCESS_TOKEN}"
```

### 8.3 Các tham số quan trọng

1. **`recipient` (Bắt buộc):** Đối tượng người nhận.
   - `id`: PSID (lấy từ Webhook)
   - `user_ref`: Checkbox plugin
   - `comment_id`: Private Reply bình luận
   - `post_id`: Reply post

2. **`messaging_type` (Bắt buộc):**
   - `RESPONSE`: Phản hồi tin nhắn trong cửa sổ 24 giờ
   - `UPDATE`: Gửi chủ động trong cửa sổ 24 giờ
   - `MESSAGE_TAG`: Gửi NGOÀI cửa sổ 24 giờ (phải kèm `tag`)

3. **`message` (Bắt buộc chọn 1):**
   - `text`: Văn bản (tối đa 2000 ký tự UTF-8)
   - `attachment`: Media hoặc Template. Type: `audio`, `file`, `image`, `template`, `video` (max 25MB)
   - `quick_replies`: Mảng nút phản hồi nhanh
   - `metadata`: Dữ liệu bổ sung (max 1000 ký tự), sẽ echo lại qua `message_echoes`

4. **`sender_action` (Trạng thái - không gửi chung với `message`):**
   - `typing_on`: Hiển thị "Đang gõ..."
   - `typing_off`: Tắt "Đang gõ..."
   - `mark_seen`: Đánh dấu đã đọc

5. **`reply_to`:** Trả lời tin nhắn cụ thể, truyền `mid` của tin nhắn đó.

---

## 9. MESSAGE TAGS (Gửi tin nhắn ngoài 24 giờ)

**Cửa sổ 24 giờ:** Chỉ được gửi tin nhắn tự do trong 24h kể từ tin nhắn cuối của khách. Ngoài thời gian này PHẢI dùng `messaging_type="MESSAGE_TAG"` kèm `tag`.

> **Cảnh báo:** Sử dụng sai mục đích (gửi quảng cáo qua tag không được phép) → Page bị khóa tính năng gửi tin nhắn.

### Các Tag khả dụng:

| Tag | Mô tả | Cấm |
|-----|--------|-----|
| `ACCOUNT_UPDATE` | Thông báo thay đổi tài khoản (đăng nhập lạ, phê duyệt hồ sơ) | Gửi khuyến mãi, thông báo định kỳ |
| `CONFIRMED_EVENT_UPDATE` | Cập nhật sự kiện đã xác nhận (nhắc lịch hẹn, vé, sự kiện đã đăng ký) | Sự kiện khách chưa đăng ký |
| `POST_PURCHASE_UPDATE` | Cập nhật sau mua hàng (hóa đơn, trạng thái giao hàng) | Bán chéo (cross-sell/up-sell) |
| `CUSTOMER_FEEDBACK` | Khảo sát sau dịch vụ (dùng Template Customer Feedback, trong 7 ngày) | - |
| `HUMAN_AGENT` | Nhân viên trả lời ngoài 24h, cho phép gửi trong **7 ngày**. Cần App Review cho quyền "Human Agent" | - |

> **Lưu ý:** Bắt đầu từ **10/02/2026**, các tag `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE` và `POST_PURCHASE_UPDATE` dự kiến ngừng hoạt động.

---

## 10. PAGE WEBHOOK FIELDS (NGOÀI MESSENGER)

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

## 11. XỬ LÝ LỖI & RETRY

- Facebook retry liên tục trong **36 giờ** nếu không nhận được 200 OK
- Sau **15 phút** thất bại → cảnh báo
- Sau **1 giờ** thất bại → webhook tự động **disable**, app bị unsubscribe khỏi page
- **QUAN TRỌNG:** Implement deduplication (kiểm tra `mid` trùng lặp) vì có thể nhận cùng event nhiều lần
- Tối đa **1000 updates/batch**

---

## 12. mTLS - THAY ĐỔI SẮP TỚI

> **Deadline: 31/03/2026** - Meta chuyển webhook certificate sang CA mới.
> Nếu server validate mTLS certificates, cần cập nhật trust store với root certificate mới: `meta-outbound-api-ca-2025-12.pem`

---

## 13. SO SÁNH: FACEBOOK WEBHOOK vs PANCAKE WEBHOOK

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

## TÓM TẮT NHANH

### Nhận tin nhắn (Webhook):
1. Tạo Facebook App → lấy App ID, App Secret
2. Lấy Page Access Token (long-lived)
3. Tạo HTTPS server với endpoint `/webhook`
4. Cấu hình webhook trên App Dashboard (callback URL + verify token)
5. Subscribe page: `POST /{PAGE_ID}/subscribed_apps?subscribed_fields=messages`
6. Nhận tin nhắn qua POST request → field `entry[].messaging[].message.text`

### Gửi tin nhắn (Send API):
1. Lấy `sender.id` (PSID) từ webhook event
2. `POST /{PAGE_ID}/messages` với `recipient.id` = PSID
3. Trong 24h: `messaging_type=RESPONSE`
4. Ngoài 24h: `messaging_type=MESSAGE_TAG` + `tag=HUMAN_AGENT`
