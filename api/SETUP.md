# ⚡ Hướng dẫn Setup Nhanh

## 📝 Danh sách file cần thêm/cập nhật

### ✅ File CẦN THÊM MỚI

1. **`routes/facebook.routes.js`** ⭐
   - Route xử lý Facebook Live Video API
   - Copy toàn bộ code từ artifact

2. **`public/facebook.html`** ⭐
   - Giao diện hiển thị Facebook Live Video
   - Copy toàn bộ code từ artifact

3. **`README.md`** (optional)
   - Tài liệu đầy đủ
   - Copy từ artifact nếu muốn

4. **`SETUP.md`** (optional)
   - Hướng dẫn setup nhanh (file này)

### 🔄 File CẦN CẬP NHẬT

1. **`server.js`** - Chỉ thêm 3 dòng:

```javascript
// Thêm vào phần import routes (dòng ~16)
const facebookRoutes = require("./routes/facebook.routes"); // ⭐ NEW

// Thêm vào phần mount routes (dòng ~25)
app.use(facebookRoutes); // ⭐ NEW

// Cập nhật trong documentation object (dòng ~33)
documentation: {
    guide: "/huongdan.html",
    test: "/test.html",
    facebook: "/facebook.html", // ⭐ NEW
},

// Cập nhật trong endpoints object (dòng ~45)
facebookLiveVideo: "GET /facebook/livevideo?pageid=117267091364524&limit=10", // ⭐ NEW
facebookHealth: "GET /facebook/health", // ⭐ NEW

// Cập nhật trong console.log (dòng ~60)
console.log(`Facebook: http://localhost:${PORT}/facebook.html`); // ⭐ NEW
console.log(`Facebook Live: http://localhost:${PORT}/facebook/livevideo`); // ⭐ NEW
```

### ✅ File KHÔNG CẦN THAY ĐỔI

- `package.json` - Đã có đủ dependencies (node-fetch, express, cors)
- `config/tpos.config.js` - Giữ nguyên
- Tất cả file trong `routes/` (trừ facebook.routes.js)
- Tất cả file trong `helpers/`, `services/`, `data/`
- `public/huongdan.html`, `public/test.html` - Giữ nguyên

## 🚀 Các bước thực hiện

### Bước 1: Tạo file mới

```bash
# Tạo route mới
touch routes/facebook.routes.js

# Tạo HTML mới
touch public/facebook.html
```

Copy nội dung từ các artifact tương ứng.

### Bước 2: Cập nhật server.js

Mở file `server.js` và thêm 3 đoạn code như đã nêu ở trên.

### Bước 3: Test local

```bash
npm start
```

Truy cập:

- http://localhost:3000/facebook.html
- http://localhost:3000/facebook/livevideo

### Bước 4: Commit và Push

```bash
git add .
git commit -m "Add Facebook Live Video feature"
git push origin main
```

### Bước 5: Render auto-deploy

Render sẽ tự động deploy khi phát hiện code mới trên GitHub.

## 📋 Checklist

Kiểm tra trước khi deploy:

- [ ] File `routes/facebook.routes.js` đã tạo
- [ ] File `public/facebook.html` đã tạo
- [ ] File `server.js` đã cập nhật 3 chỗ
- [ ] Token Facebook còn hạn
- [ ] Test local thành công
- [ ] Git commit và push

## 🧪 Test sau khi deploy

```bash
# Thay YOUR_APP_NAME bằng tên app của bạn

# Test health
curl https://YOUR_APP_NAME.onrender.com/facebook/health

# Test API
curl https://YOUR_APP_NAME.onrender.com/facebook/livevideo?limit=5

# Test web interface
# Mở trình duyệt: https://YOUR_APP_NAME.onrender.com/facebook.html
```

## ⚙️ Tùy chỉnh

### Thay đổi Page ID mặc định

Sửa trong `routes/facebook.routes.js`:

```javascript
const {
   pageid = "YOUR_PAGE_ID", // Thay đổi ở đây
   limit = 10,
   facebook_Type = "page",
} = req.query;
```

### Thay đổi token

Sửa trong `routes/facebook.routes.js`:

```javascript
const FACEBOOK_TOKEN = "Bearer YOUR_NEW_TOKEN";
```

### Thay đổi số video hiển thị mặc định

Sửa trong `public/facebook.html`:

```html
<input
    type="number"
    id="limit"
    value="20"  <!-- Thay từ 10 thành 20 -->
/>
```

## 🎯 Kết quả mong đợi

Sau khi hoàn thành:

1. ✅ API endpoint `/facebook/livevideo` hoạt động
2. ✅ Web interface `/facebook.html` hiển thị video
3. ✅ Tích hợp hoàn chỉnh với hệ thống TPOS hiện có
4. ✅ Deploy thành công trên Render

## 🆘 Lỗi thường gặp

### Lỗi: "Cannot find module 'facebook.routes'"

**Nguyên nhân**: File `routes/facebook.routes.js` chưa tạo hoặc sai đường dẫn

**Giải pháp**:

```bash
# Kiểm tra file tồn tại
ls routes/facebook.routes.js

# Nếu không có, tạo lại
touch routes/facebook.routes.js
# Và copy nội dung vào
```

### Lỗi: "Facebook API error: 401"

**Nguyên nhân**: Token hết hạn

**Giải pháp**: Cập nhật token mới trong `routes/facebook.routes.js`

### Lỗi: "Cannot read property 'data' of undefined"

**Nguyên nhân**: API response không có dữ liệu

**Giải pháp**: Kiểm tra Page ID có đúng không, xem logs

## 📞 Cần hỗ trợ?

1. Check logs trên Render Dashboard
2. Test API trực tiếp bằng curl/Postman
3. Kiểm tra Browser Console (F12)

---

**Hoàn thành! 🎉**

Nếu mọi thứ ok, bạn đã có một API server hoàn chỉnh với:

- ✅ Upload sản phẩm lên TPOS
- ✅ Auto-detect attributes
- ✅ Facebook Live Video viewer
