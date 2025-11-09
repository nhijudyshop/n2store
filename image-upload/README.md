# 📸 Claude Code - Image Upload Tool

Công cụ upload hình ảnh lên GitHub với tính năng paste (Ctrl+V) nhanh chóng.

## ✨ Tính năng

- ✅ **Paste hình ảnh** từ clipboard bằng Ctrl+V
- ✅ **Kéo thả** (drag & drop) file vào khung
- ✅ **Chọn file** từ máy tính
- ✅ **Upload lên GitHub** tự động
- ✅ **Lịch sử upload** (lưu 10 ảnh gần nhất)
- ✅ **Copy URL** nhanh chóng
- ✅ **Lưu cấu hình** GitHub (token, repo, branch, path)

## 🚀 Cách sử dụng

### Bước 1: Tạo GitHub Personal Access Token

1. Truy cập: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Đặt tên cho token (vd: "Image Upload Tool")
4. Chọn quyền: **repo** (Full control of private repositories)
5. Click **"Generate token"**
6. **Copy token** (chỉ hiển thị 1 lần duy nhất!)

### Bước 2: Cấu hình trong trang

1. Mở trang: `/image-upload/index.html`
2. Nhập thông tin:
   - **GitHub Token**: Token vừa tạo ở bước 1
   - **Repository**: `owner/repo` (vd: `nhijudyshop/n2store`)
   - **Branch**: `main` (hoặc branch khác)
   - **Đường dẫn**: `uploads/` (thư mục lưu ảnh trong repo)
3. Click **"💾 Lưu cấu hình"**
4. Click **"🔍 Test kết nối"** để kiểm tra

### Bước 3: Upload hình ảnh

**Cách 1: Paste (Ctrl+V)**
1. Copy hình ảnh từ bất kỳ đâu (screenshot, file explorer, browser...)
2. Nhấn **Ctrl+V** trên trang
3. Click **"☁️ Upload lên GitHub"**

**Cách 2: Kéo thả**
1. Kéo file ảnh từ máy tính
2. Thả vào khung màu tím
3. Click **"☁️ Upload lên GitHub"**

**Cách 3: Chọn file**
1. Click vào khung màu tím
2. Chọn file từ máy tính
3. Click **"☁️ Upload lên GitHub"**

## 📋 Lịch sử Upload

- Lưu tự động 10 ảnh gần nhất
- Hiển thị: tên file, URL, thời gian upload
- Nút **Copy** để copy URL nhanh
- Nút **Xem** để mở ảnh trong tab mới

## 🔒 Bảo mật

- Token được lưu trong **localStorage** của trình duyệt
- **Không** gửi token đến server nào khác ngoài GitHub
- Nên sử dụng token có quyền hạn chế (chỉ repo cụ thể)
- **Không** chia sẻ token với người khác

## 🛠️ Kỹ thuật

- **HTML5** + **CSS3** + **Vanilla JavaScript**
- **GitHub API v3** để upload file
- **FileReader API** để đọc file
- **Clipboard API** để paste ảnh
- **localStorage** để lưu cấu hình và lịch sử

## 📝 Ghi chú

- Ảnh được upload sẽ có tên format: `image_[timestamp].[extension]`
- URL ảnh có dạng: `https://raw.githubusercontent.com/[owner]/[repo]/[branch]/[path]/[filename]`
- Cấu hình được lưu tự động, không cần nhập lại mỗi lần
- Hỗ trợ tất cả định dạng ảnh: JPG, PNG, GIF, WebP, SVG...

## 🎯 Use Cases

- Upload screenshot nhanh để share
- Upload ảnh sản phẩm cho shop
- Upload hình minh họa cho documentation
- Lưu trữ ảnh với URL public từ GitHub
- Tạo CDN đơn giản từ GitHub

## ⚠️ Lưu ý

- GitHub có giới hạn kích thước file: **100MB** (nên dùng ảnh < 10MB)
- Mỗi repository có giới hạn dung lượng
- Token có thể hết hạn, cần tạo mới nếu không hoạt động
- Nên tạo repository riêng cho việc lưu ảnh

## 🔧 Troubleshooting

**Lỗi 401 - Unauthorized:**
- Token không đúng hoặc đã hết hạn
- Tạo token mới và cập nhật lại

**Lỗi 404 - Not Found:**
- Repository không tồn tại
- Không có quyền truy cập repository
- Kiểm tra lại tên repository (owner/repo)

**Lỗi 422 - Unprocessable Entity:**
- File đã tồn tại với cùng tên
- Thử lại sau vài giây (timestamp sẽ khác)

**Không paste được:**
- Kiểm tra xem đã copy hình ảnh chưa
- Một số ứng dụng không hỗ trợ copy ảnh
- Thử dùng cách kéo thả hoặc chọn file

## 📞 Hỗ trợ

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra Console (F12) để xem lỗi chi tiết
2. Kiểm tra lại cấu hình GitHub
3. Test kết nối trước khi upload
