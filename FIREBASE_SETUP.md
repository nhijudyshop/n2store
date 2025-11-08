# Hướng dẫn Setup Firebase để Đồng bộ dữ liệu

## 🔥 Firebase đã được tích hợp sẵn trong code!

Dữ liệu sản phẩm, cài đặt hiển thị và trang hiện tại đều được đồng bộ qua Firebase Realtime Database.

## 📋 Điều kiện để đồng bộ hoạt động:

1. **Tất cả máy tính phải có kết nối Internet**
2. **Tất cả máy tính truy cập cùng một URL** (ví dụ: https://nhijudyshop.github.io/n2store/)
3. **Firebase Database Rules phải được cấu hình đúng**

## ⚙️ Cách cấu hình Firebase Database Rules:

### Bước 1: Truy cập Firebase Console
1. Vào https://console.firebase.google.com/
2. Chọn project: **product-s-98d2c**
3. Vào menu **Realtime Database** (bên trái)

### Bước 2: Cập nhật Rules
1. Click tab **Rules**
2. Paste nội dung từ file `database.rules.json` vào:

```json
{
  "rules": {
    "savedProducts": {
      ".read": true,
      ".write": true,
      ".indexOn": ["Id"]
    },
    "displaySettings": {
      ".read": true,
      ".write": true
    },
    "syncCurrentPage": {
      ".read": true,
      ".write": true
    }
  }
}
```

3. Click **Publish** để lưu

### Bước 3: Kiểm tra dữ liệu
1. Vào tab **Data** trong Realtime Database
2. Bạn sẽ thấy 3 node:
   - `savedProducts`: Danh sách sản phẩm đã thêm
   - `displaySettings`: Cài đặt hiển thị (số cột, hàng, khoảng cách...)
   - `syncCurrentPage`: Trang hiện tại (chế độ đồng bộ)

## ✅ Các tính năng đồng bộ tự động:

### 1. Đồng bộ Sản phẩm
- ✓ Khi thêm sản phẩm mới → Tự động sync lên Firebase
- ✓ Khi thay đổi số lượng bán → Tự động sync
- ✓ Khi xóa sản phẩm → Tự động sync
- ✓ Khi refresh từ TPOS → Tự động sync

### 2. Đồng bộ Cài đặt
- ✓ Khi thay đổi số cột/hàng/khoảng cách → Tự động sync
- ✓ Tất cả thiết bị sẽ nhận cài đặt mới ngay lập tức

### 3. Đồng bộ Trang (Chế độ Sync)
- ✓ Bật chế độ đồng bộ trên product-list.html
- ✓ Khi chuyển trang → Tất cả màn hình đồng bộ theo

## 🔍 Cách kiểm tra đồng bộ hoạt động:

1. **Mở 2 tab trình duyệt:**
   - Tab 1: https://nhijudyshop.github.io/n2store/product-search/
   - Tab 2: https://nhijudyshop.github.io/n2store/product-search/product-list.html

2. **Thử nghiệm:**
   - Thêm sản phẩm ở Tab 1
   - Tab 2 sẽ tự động cập nhật danh sách
   - Thay đổi số lượng bán ở Tab 1
   - Tab 2 sẽ tự động cập nhật số lượng

3. **Kiểm tra trên nhiều máy:**
   - Mở cùng URL trên máy tính khác
   - Thay đổi ở máy này sẽ hiển thị ngay ở máy kia

## 🔐 Bảo mật (Nếu cần):

Nếu bạn muốn bảo mật hơn (chỉ cho phép người có tài khoản), thay rules bằng:

```json
{
  "rules": {
    "savedProducts": {
      ".read": "auth != null",
      ".write": "auth != null",
      ".indexOn": ["Id"]
    },
    "displaySettings": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "syncCurrentPage": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Sau đó cần thêm Firebase Authentication vào code.

## 📊 Monitor dữ liệu:

Bạn có thể xem realtime data trong Firebase Console:
- URL: https://console.firebase.google.com/project/product-s-98d2c/database/product-s-98d2c-default-rtdb/data

## ⚠️ Lưu ý quan trọng:

1. **Không xóa dữ liệu trong Firebase Console** nếu không muốn mất hết sản phẩm đã lưu
2. **Backup định kỳ**: Export data từ Firebase Console
3. **Internet bắt buộc**: Không có internet = không đồng bộ (dữ liệu vẫn lưu local)
4. **LocalStorage là fallback**: Nếu Firebase lỗi, dữ liệu vẫn lưu ở localStorage

## 🆘 Troubleshooting:

### Dữ liệu không đồng bộ?
1. Kiểm tra console browser (F12) xem có lỗi Firebase không
2. Kiểm tra Firebase Database Rules đã publish chưa
3. Kiểm tra kết nối Internet
4. Thử xóa localStorage và refresh lại

### Lỗi "Permission denied"?
- Firebase Database Rules chưa được cập nhật
- Làm theo Bước 2 ở trên để cập nhật rules

### Dữ liệu bị duplicate?
- Không nên mở quá nhiều tab cùng lúc khi thêm sản phẩm
- Firebase sẽ tự merge dữ liệu theo timestamp
