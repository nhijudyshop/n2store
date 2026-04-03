# Chrome Web Store - Upload Guide

## 1. Đăng ký Developer Account

1. Vào https://chrome.google.com/webstore/devconsole
2. Đăng nhập Google Account
3. Trả phí $5 USD (một lần duy nhất)
4. Chờ xác minh (thường vài phút)

## 2. Upload Extension

1. Vào Developer Dashboard → **New Item**
2. Upload file `n2store-extension.zip` (đã tạo sẵn)
3. Điền thông tin listing bên dưới

## 3. Thông tin Listing

### Tên Extension
```
N2Store Messenger
```

### Mô tả ngắn (dưới 132 ký tự)
```
Quản lý tin nhắn Facebook Pages, gửi tin hàng loạt, tích hợp quản lý đơn hàng N2Store.
```

### Mô tả chi tiết
```
N2Store Messenger - Extension hỗ trợ quản lý bán hàng trên Facebook Pages.

Tính năng chính:
• Gửi tin nhắn qua Facebook Messenger API trực tiếp từ trình duyệt
• Hỗ trợ gửi text, hình ảnh, và sticker
• Gửi tin hàng loạt (bulk send) cho danh sách đơn hàng
• Gửi comment và private reply trên Facebook Posts
• Tự động resolve Global Facebook ID cho khách hàng
• Thông báo real-time qua SSE (Server-Sent Events)
• Tích hợp với hệ thống quản lý đơn hàng N2Store

Yêu cầu:
• Đăng nhập Facebook Business trên trình duyệt
• Tài khoản N2Store (nhijudyshop.workers.dev)

Extension này chỉ hoạt động với hệ thống N2Store và không thu thập dữ liệu cá nhân.
```

### Category
```
Productivity
```

### Language
```
Vietnamese
```

## 4. Screenshots (bắt buộc)

Chrome Web Store yêu cầu ít nhất 1 screenshot:
- Kích thước: **1280x800** hoặc **640x400**
- Tối đa 5 screenshots

### Cách chụp:
1. Mở extension popup → chụp screenshot popup
2. Mở N2Store dashboard → chụp giao diện quản lý
3. Chụp bulk send đang chạy

### Tool chụp nhanh:
- macOS: `Cmd+Shift+4` rồi crop về 1280x800
- Hoặc dùng Chrome DevTools: F12 → Ctrl+Shift+M → set viewport 1280x800

## 5. Privacy Policy (bắt buộc)

Chrome Web Store yêu cầu Privacy Policy URL vì extension dùng `cookies` permission.

### Option A: Host trên GitHub Pages
Tạo file `privacy-policy.html` tại `nhijudyshop.github.io/n2store/privacy-policy.html`

### Option B: Dùng Google Sites / Notion
Tạo page free rồi paste URL vào listing.

### Nội dung mẫu:
```
Privacy Policy - N2Store Messenger Extension

Last updated: [DATE]

N2Store Messenger ("the Extension") is a browser extension for managing
Facebook Page messages integrated with the N2Store order management system.

Data Collection:
- The Extension accesses Facebook cookies solely to authenticate API requests
  to Facebook Messenger on your behalf.
- The Extension does NOT collect, store, or transmit personal data to any
  third-party server.
- Message content and customer data are processed locally in the browser
  and sent directly to Facebook's servers.

Permissions Used:
- cookies: Read Facebook authentication cookies for API requests
- storage: Store extension settings and notification preferences locally
- notifications: Display desktop notifications for new messages
- host_permissions (facebook.com): Send/receive messages via Facebook APIs

Data Storage:
- All settings are stored locally using Chrome's storage API.
- No data is sent to external analytics or tracking services.

Contact:
[Your email]
```

## 6. Visibility Setting

Khi submit, chọn:
- **Visibility**: `Unlisted` — chỉ người có link mới thấy và cài được
- KHÔNG chọn Public (sẽ hiện trong Chrome Web Store search)

## 7. Sau khi Submit

- Review lần đầu: 1-3 ngày làm việc
- Nếu bị reject, đọc email từ Google để biết lý do và sửa
- Sau khi approved → lấy link chia sẻ cho người dùng
- Cập nhật version: tăng `version` trong manifest.json → upload zip mới → auto-update cho users

## 8. Lý do có thể bị Reject

| Vấn đề | Cách xử lý |
|---------|------------|
| Broad host_permissions | Giải thích cần truy cập Facebook để gửi tin nhắn cho khách hàng |
| cookies permission | Cần để xác thực Facebook API requests |
| Missing privacy policy | Tạo privacy policy page (xem mục 5) |
| Vague description | Mô tả rõ extension làm gì, tại sao cần permissions |

## Quick Checklist

- [ ] Developer account đã đăng ký ($5)
- [ ] File `n2store-extension.zip` đã tạo
- [ ] Ít nhất 1 screenshot (1280x800)
- [ ] Privacy policy URL live
- [ ] Chọn Unlisted visibility
- [ ] Submit và chờ review
