# N2Store Facebook Webhook Server

Server nhận tin nhắn Facebook Page realtime qua Webhook.

---

## HƯỚNG DẪN SETUP TỪ ĐẦU

### Bước 1: Tạo Facebook App

1. Vào https://developers.facebook.com/apps/
2. Nhấn **Create App** → chọn **Business** → **Next**
3. Đặt tên app (ví dụ: `N2Store Webhook`) → **Create App**
4. Trong trang App Dashboard, ghi lại:
   - **App ID** (góc trên bên trái)
   - **App Secret**: vào **Settings > Basic** → nhấn **Show** bên cạnh App Secret

### Bước 2: Thêm Messenger vào App

1. Trong App Dashboard → **Add Product** (menu trái)
2. Tìm **Messenger** → nhấn **Set Up**
3. Messenger sẽ xuất hiện trong menu trái

### Bước 3: Lấy Page Access Token

1. Vào **Messenger > Settings** (hoặc **Messenger > Facebook Settings**)
2. Phần **Access Tokens** → nhấn **Add or Remove Pages**
3. Chọn Facebook Page cần kết nối → **Done**
4. Nhấn **Generate Token** bên cạnh Page
5. Copy token → đây là **PAGE_ACCESS_TOKEN**

**Tạo Long-Lived Token (không hết hạn):**
```bash
# Token ngắn hạn → dài hạn (60 ngày)
curl "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}"

# Lấy permanent page token
curl "https://graph.facebook.com/v25.0/me/accounts?access_token={LONG_LIVED_USER_TOKEN}"
```

### Bước 4: Deploy lên Render

1. Push code lên GitHub (nhánh main)
2. Vào https://dashboard.render.com/ → **New** → **Web Service**
3. Connect GitHub repo → chọn repo `n2store`
4. Cấu hình:
   - **Name**: `n2store-fb-webhook`
   - **Root Directory**: `n2store-fb-webhook`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. Thêm **Environment Variables**:
   - `VERIFY_TOKEN` = `n2store_webhook_token` (hoặc token bạn muốn)
   - `APP_SECRET` = App Secret từ Bước 1
   - `PAGE_ACCESS_TOKEN` = Token từ Bước 3
   - `PAGE_ID` = ID của Facebook Page
6. Nhấn **Create Web Service**
7. Đợi deploy xong → lấy URL (ví dụ: `https://n2store-fb-webhook.onrender.com`)

**Test:**
```bash
curl https://n2store-fb-webhook.onrender.com/ping
```

### Bước 5: Cấu hình Webhook trên Facebook

1. Vào App Dashboard → **Messenger > Settings** (hoặc **Webhooks**)
2. Phần **Webhooks** → nhấn **Add Callback URL**
3. Nhập:
   - **Callback URL**: `https://n2store-fb-webhook.onrender.com/webhook`
   - **Verify Token**: `n2store_webhook_token` (phải trùng với env `VERIFY_TOKEN`)
4. Nhấn **Verify and Save**
5. Sau khi verify thành công → nhấn **Add Subscriptions**
6. Tick chọn:
   - `messages` (tin nhắn mới)
   - `messaging_postbacks` (nhấn nút)
   - `message_deliveries` (đã giao)
   - `message_reads` (đã đọc)
   - `message_echoes` (tin nhắn gửi đi)
   - `message_reactions` (cảm xúc)
7. Nhấn **Save**

### Bước 6: Subscribe Page

```bash
curl -X POST "https://graph.facebook.com/v25.0/{PAGE_ID}/subscribed_apps" \
  -d "subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads,message_echoes,message_reactions" \
  -d "access_token={PAGE_ACCESS_TOKEN}"
```

Phải trả về: `{"success": true}`

**Kiểm tra subscription:**
```bash
curl "https://graph.facebook.com/v25.0/{PAGE_ID}/subscribed_apps?access_token={PAGE_ACCESS_TOKEN}"
```

### Bước 7: Test

1. Gửi tin nhắn đến Facebook Page từ tài khoản có role trong App (admin/developer)
2. Xem Render logs: Dashboard → service → **Logs**
3. Sẽ thấy log dạng:
```
[FB-WEBHOOK] 💬 TEXT
  Page: 123456789
  From: 987654321
  Text: Xin chào shop
  MID:  mid.xxx
  Time: 2026-03-17T10:00:00.000Z
```

---

## LƯU Ý QUAN TRỌNG

### Standard vs Advanced Access
- **Standard Access** (mặc định): Chỉ nhận tin nhắn từ người có role trong App (admin, developer, tester)
- **Advanced Access**: Nhận từ TẤT CẢ khách hàng → cần xin **App Review** cho quyền `pages_messaging`

### Cách xin Advanced Access
1. Vào App Dashboard → **App Review > Permissions and Features**
2. Tìm `pages_messaging` → nhấn **Request Advanced Access**
3. Điền form giải thích app dùng để làm gì
4. Chờ Meta review (thường 1-5 ngày làm việc)

### Free Plan trên Render
- Server sẽ **sleep sau 15 phút** không có request
- Khi có webhook đến, server mất ~30 giây để "wake up"
- Facebook retry nếu không nhận 200 OK → server sẽ nhận lại event khi wake up
- Nếu muốn server luôn bật: nâng lên **Starter plan** ($7/tháng) hoặc dùng cron ping

---

## CHẠY LOCAL

```bash
cd n2store-fb-webhook
cp .env.example .env
# Sửa .env với thông tin thật
npm install
npm start
```

Dùng [ngrok](https://ngrok.com/) để expose localhost ra HTTPS:
```bash
ngrok http 3000
# Lấy URL https://xxx.ngrok.io/webhook → dán vào Facebook App Dashboard
```

---

## API ENDPOINTS

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/` | Thông tin server |
| GET | `/ping` | Health check |
| GET | `/webhook` | Facebook verification |
| POST | `/webhook` | Nhận events từ Facebook |
