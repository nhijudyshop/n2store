# Chi tiết 100% Webhooks và Messages API (Send API)

Tài liệu này tổng hợp toàn bộ chi tiết về Cơ chế nhận tin nhắn (Webhooks) và Cơ chế gửi tin nhắn (Send API / Messages API) trên Facebook Messenger Platform, được trích xuất trực tiếp từ tài liệu chính thức của Meta.

---

## 1. Cơ chế nhận tin nhắn: Webhooks của Meta

Với Webhooks, bạn có thể nhận được thông báo HTTP POST tức thì từ Meta về những sự kiện cụ thể đối với Page của bạn (ví dụ: khi có người dùng nhắn tin). Điều này giúp bạn không cần phải liên tục "poll" (truy vấn) API Đồ thị để lấy dữ liệu mới, giúp tránh vượt quá giới hạn tốc độ (rate limit).

### Các yêu cầu hệ thống cho Webhooks:
- **Máy chủ HTTPS:** Máy chủ của bạn phải có khả năng nhận và xử lý các yêu cầu HTTPS, đồng thời phải cài đặt sẵn chứng chỉ TLS/SSL hợp lệ (không hỗ trợ chứng chỉ tự ký).
- **Quyền:** Để nhận Webhooks, ứng dụng của bạn phải được cấp các quyền tương ứng (ví dụ: `pages_messaging`). Ngay cả khi không cần Xét duyệt ứng dụng (App Review) cho môi trường dev, bạn vẫn phải có quyền để nhận dữ liệu từ người dùng thực.
- **Thiết lập:** Cần thiết lập một điểm cuối (Endpoint) trên máy chủ, cấu hình Verify Token và đăng ký các trường sự kiện (fields) bạn muốn lắng nghe. Để nhận tin nhắn, bạn phải Subscribe vào trường `messages`.

---

## 2. Webhook Event: `messages` (Chi tiết Payload nhận tin nhắn)

Sự kiện `messages` xảy ra khi một tin nhắn được gửi đến Trang của bạn. Tin nhắn luôn được gửi theo thứ tự. Bạn có thể nhận được tin nhắn văn bản, tin nhắn chứa tệp đính kèm, phản hồi nhanh (quick replies), hoặc dữ liệu referral (từ Quảng cáo/Shops).

### Cấu trúc chung của Payload `messages`
Bạn sẽ nhận được một JSON qua phương thức HTTP POST chứa mảng `entry`, bên trong là `messaging`.
```json
{
  "object": "page",
  "entry": [
    {
      "id": "<PAGE_ID>",
      "time": 1583173667623,
      "messaging": [
        {
          "sender": { "id": "<PSID>" },
          "recipient": { "id": "<PAGE_ID>" },
          "timestamp": 1583173666767,
          "message": {
            "mid": "mid.1457764197618:41d102a3e1ae206a38",
            "text": "hello, world!"
          }
        }
      ]
    }
  ]
}
```

### Các thuộc tính quan trọng trong `message` Webhook
1. **`sender.id`**: PSID (Page-scoped ID) của người dùng đã gửi tin nhắn. Bạn sẽ dùng ID này để gửi tin nhắn phản hồi.
2. **`recipient.id`**: ID Trang Facebook (Page ID) của bạn.
3. **`message.mid`**: Message ID duy nhất của tin nhắn.
4. **`message.text`**: Nội dung văn bản của tin nhắn.
5. **`message.quick_reply`**: Cung cấp nếu người dùng nhấn vào một nút Quick Reply. Thuộc tính `payload` chứa định danh (Custom data) mà ứng dụng của bạn đã định nghĩa trước đó.
6. **`message.reply_to`**: Chứa `mid` của tin nhắn mà người dùng đang dùng tính năng "Reply" (Trả lời) để phản hồi lại. Nếu là tự reply thì `is_self_reply` sẽ là true.
7. **`message.attachments`**: Mảng chứa các tệp đính kèm. 
   - `type`: Loại đính kèm (`audio`, `file`, `image` (bao gồm gif, sticker), `video`, `fallback`, `reel`, `ig_reel`, `appointment_booking`).
   - `payload.url`: URL gốc của tệp đính kèm (Media).
   - `payload.sticker_id`: ID của Sticker nếu người dùng gửi Sticker.
8. **`message.referral`**: (Chỉ Graph API v8.0+) Áp dụng khi người dùng gửi tin nhắn từ trang chi tiết sản phẩm của Shops hoặc click vào Quảng cáo CTM (Click-to-Messenger). 
   - Nó chứa thông tin như `ad_id`, `ads_context_data` (ảnh, video, tiêu đề quảng cáo mà người dùng đã click để vào nhắn tin).
9. **`message.commands`**: Mảng chứa các lệnh (command) nếu tin nhắn bắt đầu bằng dấu `/` (ví dụ `/flights`).

---

## 3. Cơ chế gửi tin nhắn: Send API (Messages API)

Send API là API chính dùng để gửi tin nhắn lại cho người dùng, bao gồm văn bản, tệp đính kèm, cấu trúc dạng mẫu (templates), hoặc gửi trạng thái (đang gõ phím...).

### Trước khi bắt đầu:
- Cần có **Page Access Token**.
- Ứng dụng cần quyền `pages_messaging`.
- **Cửa sổ tin nhắn 24 giờ (24-hour window):** Bạn chỉ có thể gửi tin nhắn tự do cho người nhận trong vòng 24 giờ kể từ lần cuối cùng họ nhắn tin cho Page. Ngoài khoảng thời gian này, bạn phải dùng **Message Tags**.

### Endpoint Gửi tin nhắn
Gửi yêu cầu POST đến điểm cuối:
`POST https://graph.facebook.com/v25.0/{PAGE_ID}/messages`

### Ví dụ một Request gửi văn bản cơ bản
```bash
curl -X POST "https://graph.facebook.com/v25.0/{PAGE_ID}/messages" \
     -d "recipient={'id':'{PSID}'}" \
     -d "messaging_type=RESPONSE" \
     -d "message={'text':'hello, world'}" \
     -d "access_token={PAGE_ACCESS_TOKEN}"
```

### Các tham số quan trọng của Send API
1. **`recipient` (Bắt buộc):** Đối tượng người nhận. Thông thường dùng `id` (PSID - Page-scoped ID lấy được từ Webhook). Ngoài ra có thể dùng `user_ref` (Checkbox plugin), `comment_id` (Để Private Reply một bình luận), `post_id`.
2. **`messaging_type` (Bắt buộc):** Loại tin nhắn đang gửi:
   - `RESPONSE`: Tin nhắn phản hồi một tin nhắn vừa nhận được (nằm trong cửa sổ 24 giờ).
   - `UPDATE`: Tin nhắn gửi chủ động nhưng vẫn nằm trong cửa sổ 24 giờ.
   - `MESSAGE_TAG`: Tin nhắn gửi nằm NGOÀI cửa sổ 24 giờ. Phải gửi kèm thuộc tính `tag`.
3. **`message` (Nội dung tin nhắn - bắt buộc chọn 1 trong 2 loại):**
   - `text`: Gửi chuỗi văn bản (tối đa 2000 ký tự chuẩn UTF-8).
   - `attachment`: Gửi Media hoặc tin nhắn cấu trúc trúc (Template). Loại (type) có thể là `audio`, `file`, `image`, `template`, `video` (Kích thước tệp tối đa 25MB). Nội dung chi tiết nằm trong `payload`.
   - `quick_replies`: Mảng tạo ra các nút phản hồi nhanh phía trên bàn phím của người dùng.
   - `metadata`: Chuỗi dữ liệu bổ sung bạn muốn truyền vào (tối đa 1000 ký tự), cái này sẽ được Facebook echo lại thông qua webhook `message_echoes` nếu bạn đăng ký.
4. **`sender_action` (Trạng thái gửi):** Dùng để giả lập hành động của người dùng (không gửi chung với tham số `message`):
   - `typing_on`: Hiển thị "Đang gõ...".
   - `typing_off`: Tắt hiển thị "Đang gõ...".
   - `mark_seen`: Đánh dấu là đã đọc tin nhắn của người dùng.
5. **`reply_to`:** Dùng khi bạn muốn trả lời thẳng vào một tin nhắn cụ thể của khách hàng. Truyền vào `mid` của tin nhắn đó.

---

## 4. Message Tags (Gửi tin nhắn ngoài 24 giờ)

Khi bạn muốn gửi hoặc phản hồi cho người dùng, nhưng đã trôi qua 24 giờ kể từ tin nhắn cuối cùng của khách hàng, bạn PHẢI khai báo thuộc tính `messaging_type="MESSAGE_TAG"` và kèm theo `tag`. Nếu sử dụng sai mục đích (ví dụ gửi quảng cáo qua tag không được phép), tính năng gửi tin nhắn của Page sẽ bị khóa.

Các Tag khả dụng:
- **`ACCOUNT_UPDATE`:** Thông báo sự thay đổi về tài khoản (ví dụ: phát hiện đăng nhập lạ, phê duyệt hồ sơ). Nghiêm cấm dùng để gửi khuyến mãi, thông báo định kỳ (ví dụ hóa đơn đã sẵn sàng).
- **`CONFIRMED_EVENT_UPDATE`:** Cập nhật sự kiện đã xác nhận (nhắc nhở lịch hẹn, vé tàu xe, sự kiện đã đăng ký). Không được gửi sự kiện khách chưa đăng ký.
- **`POST_PURCHASE_UPDATE`:** Cập nhật sau mua hàng (hóa đơn, trạng thái giao hàng, cảnh báo thẻ tín dụng bị từ chối). Cấm dùng bán chéo (cross-sell/up-sell).
- **`CUSTOMER_FEEDBACK`:** Khảo sát sau dịch vụ (chỉ dùng với Template Customer Feedback, yêu cầu gửi trong vòng 7 ngày kể từ tin nhắn cuối).
- **`HUMAN_AGENT`:** Dùng cho Nhân viên chăm sóc khách hàng bằng sức người (Human Agent) trả lời khi ngoài 24h. Tag này cho phép gửi lại tin nhắn trong vòng 7 ngày (thay vì 24 giờ). **Lưu ý:** Tag `HUMAN_AGENT` yêu cầu bạn phải Nộp đơn xin phê duyệt (App Review) cho quyền "Human Agent" trong Meta Dashboard.

*(Lưu ý của Meta: Bắt đầu từ ngày 10/02/2026, các tag CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE và POST_PURCHASE_UPDATE dự kiến sẽ ngừng hoạt động).*

---

## 5. Các Endpoint/Webhook khác liên quan đến nhắn tin

### 5.1. `message_deliveries` (Đã giao)
Thông báo khi tin nhắn do Page gửi đến đã được "Delivered" (giao thành công) trên thiết bị của người dùng.
**Payload mẫu:**
```json
{
  "sender": { "id":"<PSID>" },
  "recipient": { "id":"<PAGE_ID>" },
  "delivery": {
    "mids": [ "mid.1458668856218:ed81099e15d3f4f233" ],
    "watermark": 1458668856253
  }
}
```
- `delivery.mids`: Mảng chứa các Message ID đã được giao thành công.
- `delivery.watermark`: Timestamp cho biết mốc thời gian giao tin nhắn, tất cả các tin nhắn gửi trước mốc này đều đã được giao.

### 5.2. `message_reads` (Đã đọc/Seen)
Thông báo khi người dùng đã xem (Read) tin nhắn của Page. 
**Payload mẫu:**
```json
{
  "sender": { "id":"<PSID>" },
  "recipient": { "id":"<PAGE_ID>" },
  "timestamp": 1458668856463,
  "read": {
    "watermark": 1458668856253
  }
}
```
- Dùng `watermark` để biết thời điểm đọc thời gian thực. Bất kỳ tin nhắn nào gửi tới người dùng trước mốc watermark này đều được tính là đã đọc.

### 5.3. `message_echoes` (Vọng lại từ Page)
Thông báo khi có một tin nhắn do Page của bạn GỬI ĐI. Điều này hữu ích khi có nhiều App cùng quản lý chung 1 Page, hoặc bạn muốn lưu lại lịch sử tin nhắn mà App của bạn vừa Send API thành công.
**Payload mẫu:**
```json
{
  "sender": { "id":"<PAGE_ID>" },
  "recipient": { "id":"<PSID>" },
  "timestamp": 1457764197627,
  "message": {
    "is_echo": true,
    "app_id": 1517776481860111,
    "metadata": "<DEVELOPER_DEFINED_METADATA_STRING>",
    "mid": "mid.1457764197618:41d102a3e1ae206a38"
  }
}
```
- `message.is_echo`: Luôn là `true`.
- `message.app_id`: App ID của ứng dụng đã gửi tin nhắn đó. Nếu gửi trực tiếp qua Hộp thư Facebook (Page Inbox), app_id sẽ là `26390203743090`.
- `message.metadata`: (Tùy chọn) Chuỗi custom do lập trình viên gắn thêm trong thuộc tính `metadata` lúc gọi thao tác Send API.

### 5.4. `messaging_postbacks` (Người dùng bấm nút)
Xảy ra khi một người bấm vào các Nút (Postback button), Nút Bắt đầu (Get Started), hoặc Menu cố định (Persistent Menu). Đây là event cực kỳ quan trọng cho Chatbot kịch bản tĩnh.

**Payload mẫu:**
```json
{
  "sender": { "user_ref": "USER-REF-ID" },
  "recipient": { "id": "PAGE-ID" },
  "timestamp": "1527459824",
  "postback": {
    "mid": "m_MESSAGE-ID",
    "title": "Nội dung Text hiển thị trên Nút",
    "payload": "USER-DEFINED-PAYLOAD",
    "referral": {
      "ref": "USER-DEFINED-REFERRAL-PARAM",
      "source": "SHORT-URL",
      "type": "OPEN_THREAD"
    }
  }
}
```
- **`postback.title`**: Text ghi trên nút bấm mà người dùng nhấp vào.
- **`postback.payload`**: Giá trị bị ẩn đằng sau nút (do bạn định nghĩa lúc tạo Template) để máy tính hiểu người dùng đang bấm nút gì (ví dụ: `ORDER_PIZZA`).
- **`postback.referral`**: Chỉ có nếu người dùng mở Luồng Chatbot từ m.me Link, Facebook Ads, Quét QR, Welcome Screen.

### 5.5. `message_reactions` (Người dùng bộc lộ cảm xúc)
Thông báo khi người dùng thả cảm xúc (react) hoặc gỡ biểu tượng cảm xúc (unreact) vào một tin nhắn cũ.
**Payload mẫu:**
```json
{
  "sender": { "id":"<PSID>" },
  "recipient": { "id":"<PAGE_ID>" },
  "timestamp": 1458668856463,
  "reaction": {
    "reaction": "smile|angry|sad|wow|love|like|dislike|other",
    "emoji": "❤️",
    "action": "react|unreact",
    "mid": "<MID_OF_ReactedTo_Message>"
  }
}
```
- `reaction.reaction`: Tên reaction (như `smile`, `like`, `love`, ...).
- `reaction.action`: Hành động làm là `react` (thả cảm xúc) hay `unreact` (hủy bỏ cảm xúc).
- `reaction.mid`: Định danh tin nhắn nào đã bị react.

---

## 6. Hướng dẫn thiết lập và đăng ký Webhook cho Nền tảng Messenger

Để có thể nhận được các sự kiện Webhook (như tin nhắn, đã xem, webhook echo...) bạn cần thực hiện 3 bước cơ bản sau: Chuẩn bị Server, Đăng ký App trên Meta, và Subscribe Fanpage vào App.

### Bước 1: Xây dựng Máy chủ (Server / Endpoint)
Máy chủ của bạn bắt buộc phải có chứng chỉ HTTPS hợp lệ. Bạn cần tạo một Endpoint (ví dụ `https://yourdomain.com/webhook`) để xử lý 2 phương thức:
1. **`GET` - Yêu cầu xác minh từ Meta:** 
   - Khi bạn nhập URL vào Meta Dashboard, Facebook sẽ gửi 1 request `GET` mang theo 3 tham số: `hub.mode`, `hub.verify_token`, và `hub.challenge`.
   - Code của bạn phải xác nhận giá trị `hub.verify_token` có đúng bằng đoạn mã bí mật bạn tự quy định không. Nếu đúng, cần trả về duy nhất giá trị biến `hub.challenge` với mã HTTP `200 OK`.
2. **`POST` - Nhận sự kiện:** 
   - Mỗi khi khách nhắn tin (hay làm hành động khác), bạn sẽ nhận được request `POST` mang chuỗi JSON.
   - **Bắt buộc:** Phải trả về mã `200 OK` **ngay lập tức** (trong vòng dưới 5 giây). Nếu không trả về kịp hoặc báo lỗi, Facebook sẽ gửi lại nhiều lần và nếu lỗi liên tục trong 1 giờ thì webhook sẽ bị Meta vô hiệu hóa.
   - **Bảo mật (Được khuyến nghị):** Đọc chuỗi ký mã khóa `X-Hub-Signature-256` trên Header. Bạn lấy `App Secret` của ứng dụng băm SHA256 với payload để so khớp và chặn các nguồn giả mạo Facebook bắn request ảo.

### Bước 2: Đăng ký Webhook trên Bảng điều khiển Ứng dụng (App Dashboard)
1. Trong App Dashboard (Meta for Developers), thêm Sản phẩm **Messenger** > **Cài đặt**.
2. Tìm đến phần **Webhooks** > Bấm **Thiết lập Webhooks** (hoặc Thêm URL gọi lại).
3. Nhập **URL gọi lại** (Endpoint `GET`/`POST` chuẩn bị ở Bước 1).
4. Nhập **Mã xác minh (Verify Token)** giống hệt với chuỗi bạn dùng trong code (`GET`).
5. Bấm Lưu và Xác minh (Facebook sẽ "ping" thử Endpoint `GET`).
6. Sau khi Verify xong, bạn nhấn **Quản lý** các trường đối tượng và tick hộp chọn các event muốn lắng nghe (vd: `messages`, `messaging_postbacks`, `message_deliveries`...). 

### Bước 3: Đăng ký Fanpage cho Webhook (Page Subscription)
Dù App đã kết nối webhook, nhưng App chưa biết sẽ "lắng nghe" Fanpage nào. Bạn cần liên kết App với Fanpage:
- Nếu làm thủ công: Trong mục Cài đặt Messenger của App, tìm ô **Mã Truy cập** > Chọn Trang > Chọn nút **Subscribe (Đăng ký)** Fanpage đó.
- Nếu làm qua API: Bạn gọi POST request đến Graph API của Fanpage, mang theo Page Access Token có đủ 2 quyền `pages_messaging` và `pages_manage_metadata`:
```bash
curl -i -X POST "https://graph.facebook.com/{PAGE-ID}/subscribed_apps
     ?subscribed_fields=messages
     &access_token={PAGE-ACCESS-TOKEN}"
```

*(Lưu ý: Đối với việc dev/test, ứng dụng chỉ có "Quyền truy cập Tiêu chuẩn" (Standard Access) nên webhooks chỉ chạy với tin nhắn của những người có vai trò trong App như Lập trình viên/Admin. Để webhooks bắt được tin nhắn từ khách hàng thật (người lạ), bạn bắt buộc phải xin xét duyệt "Quyền truy cập Nâng cao" (Advanced Access) cho quyền `pages_messaging`).*
