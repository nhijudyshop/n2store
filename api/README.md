# 🚀 TPOS Upload API + Facebook Live Video

API tích hợp upload sản phẩm lên TPOS và lấy danh sách Facebook Live Video.

## 📁 Cấu trúc Project

```
your-project/
├── server.js                 # Main server
├── package.json             # Dependencies
├── config/
│   └── tpos.config.js       # TPOS configuration
├── routes/
│   ├── health.routes.js     # Health check
│   ├── upload.routes.js     # Upload products
│   ├── attribute.routes.js  # Attributes management
│   ├── products.routes.js   # Products listing
│   └── facebook.routes.js   # ⭐ Facebook Live Video (NEW)
├── helpers/
│   ├── utils.js
│   ├── autoDetect.js
│   └── attributeBuilder.js
├── services/
│   ├── excel.service.js
│   ├── image.service.js
│   └── tpos.service.js
├── data/
│   └── attributes.js
└── public/
    ├── huongdan.html        # Documentation
    ├── test.html            # Test upload interface
    └── facebook.html        # ⭐ Facebook Live Video viewer (NEW)
```

## 🆕 Tính năng mới - Facebook Live Video

### API Endpoint

```
GET /facebook/livevideo
```

**Query Parameters:**

- `pageid`: Facebook Page ID (mặc định: 117267091364524)
- `limit`: Số lượng video (mặc định: 10)
- `facebook_Type`: Loại (mặc định: page)

**Example:**

```bash
curl https://your-app.onrender.com/facebook/livevideo?pageid=117267091364524&limit=10
```

**Response:**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "data": [
      {
        "id": "...",
        "title": "Video title",
        "description": "...",
        "status": "LIVE",
        "live_views": 1234,
        "created_time": "2025-01-01T00:00:00Z",
        "picture": "https://...",
        "video": {
          "source": "https://..."
        }
      }
    ]
  }
}
```

### Web Interface

Truy cập: `https://your-app.onrender.com/facebook.html`

**Tính năng:**

- ✅ Hiển thị danh sách live video
- ✅ Thống kê tổng số video, video đang live, tổng views
- ✅ Thumbnail và thông tin chi tiết
- ✅ Link xem video trực tiếp
- ✅ Auto-refresh và responsive design

## 📝 Cài đặt

### 1. Clone project

```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

### 2. Cài đặt dependencies

```bash
npm install
```

### 3. Chạy local

```bash
npm start
# hoặc
npm run dev
```

Server sẽ chạy tại: `http://localhost:3000`

## 🚀 Deploy lên Render

### Bước 1: Push code lên GitHub

```bash
git add .
git commit -m "Add Facebook Live Video feature"
git push origin main
```

### Bước 2: Deploy trên Render

1. Truy cập https://render.com
2. Click **"New +"** → **"Web Service"**
3. Kết nối GitHub repository
4. Cấu hình:
   - **Name**: `your-app-name`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Click **"Create Web Service"**

### Bước 3: Đợi deploy (2-5 phút)

URL của bạn: `https://your-app-name.onrender.com`

## 🔗 Endpoints sau khi deploy

### TPOS Upload API

- 📚 Documentation: `/huongdan.html`
- 🧪 Test Interface: `/test.html`
- 📤 Upload Single: `/upload`
- 📦 Upload Batch: `/upload-batch`
- 🎯 Auto-Detect: `/detect-attributes`
- 📋 Products List: `/products`
- 🎨 Attributes: `/attributes`

### Facebook Live Video (NEW)

- 🌐 Web Interface: `/facebook.html`
- 🎥 API Endpoint: `/facebook/livevideo`
- ❤️ Health Check: `/facebook/health`

## ⚙️ Configuration

### Cập nhật Facebook Token

Sửa file `routes/facebook.routes.js`:

```javascript
const FACEBOOK_TOKEN = "Bearer YOUR_NEW_TOKEN";
```

### Cập nhật TPOS Config

Sửa file `config/tpos.config.js`:

```javascript
module.exports = {
  API_BASE: "https://tomato.tpos.vn/odata/ProductTemplate",
  AUTH_TOKEN: "Bearer YOUR_TOKEN",
  // ...
};
```

## 🧪 Test API

### Test Facebook API

```bash
# Lấy danh sách video
curl https://your-app.onrender.com/facebook/livevideo?pageid=117267091364524&limit=10

# Health check
curl https://your-app.onrender.com/facebook/health
```

### Test Upload API

```bash
# Upload 1 sản phẩm
curl "https://your-app.onrender.com/upload?tenSanPham=Áo%20Thun&giaBan=150&giaMua=100"

# Lấy danh sách sản phẩm
curl https://your-app.onrender.com/products?limit=5
```

## 📊 Monitoring

- **Logs**: Xem trên Render Dashboard
- **Status**: GET `/health` hoặc `/facebook/health`
- **Metrics**: Render cung cấp CPU, Memory, Bandwidth

## ⚠️ Lưu ý

### Free Tier của Render

- ✅ Miễn phí hoàn toàn
- ⚠️ Server tự động ngủ sau 15 phút không hoạt động
- ⏱️ Lần đầu wake up: ~30-60 giây
- 💡 **Giải pháp**: Dùng UptimeRobot ping `/health` mỗi 10 phút

### Token Expiration

- Bearer token có thể hết hạn
- Cập nhật token mới trong config khi cần
- Monitor logs để phát hiện lỗi 401 Unauthorized

### CORS

- Đã cấu hình cho phép mọi origin (`*`)
- Trong production, nên giới hạn origin cụ thể

## 🛠️ Troubleshooting

### Lỗi "Cannot find module"

```bash
npm install
```

### Server không start

- Check Node.js version (cần >= 18.0.0)
- Check port conflict (default 3000)

### Facebook API không hoạt động

- Kiểm tra token còn hạn không
- Kiểm tra Page ID có đúng không
- Xem logs trên Render Dashboard

### Upload TPOS lỗi

- Kiểm tra TPOS token
- Kiểm tra format dữ liệu đầu vào
- Xem console logs

## 📞 Support

Nếu gặp vấn đề, check:

1. Logs trên Render Dashboard
2. Browser Console (F12)
3. Network tab để xem requests

## 📄 License

MIT
