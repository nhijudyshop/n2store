# Hướng dẫn cài đặt Sync Service chấm công

## Yêu cầu
- PC tại công ty **cùng mạng LAN** với máy chấm công (192.168.1.201)
- Node.js phiên bản 16 trở lên
- Firebase Service Account Key

---

## Bước 1: Cài Node.js (nếu chưa có)

Tải tại: https://nodejs.org/en/download
Chọn bản **LTS** (Long Term Support), cài như bình thường.

Kiểm tra đã cài thành công:
```
node --version
npm --version
```

---

## Bước 2: Tải Firebase Service Account Key

1. Vào **Firebase Console**: https://console.firebase.google.com
2. Chọn project **n2shop-69e37**
3. Vào **Project Settings** (biểu tượng bánh răng) → tab **Service accounts**
4. Bấm **Generate new private key** → tải file JSON về
5. **Đổi tên** file thành `serviceAccountKey.json`
6. **Copy** file vào thư mục `attendance-sync/`

```
attendance-sync/
├── serviceAccountKey.json   ← ĐẶT FILE Ở ĐÂY
├── config.js
├── sync-service.js
└── ...
```

> **QUAN TRỌNG**: File này chứa quyền truy cập Firebase. Không chia sẻ hay commit lên Git!

---

## Bước 3: Cài đặt dependencies

Mở Terminal/Command Prompt, chuyển vào thư mục attendance-sync:

```bash
cd đường-dẫn-tới/n2store/attendance-sync
npm install
```

---

## Bước 4: Test kết nối máy chấm công

Đảm bảo máy chấm công Ronald Jack DG-600 đã bật và IP đúng (192.168.1.201).

Thử ping trước:
```bash
ping 192.168.1.201
```

Nếu ping OK, chạy test:
```bash
npm test
```

Kết quả mong đợi:
```
TEST KẾT NỐI MÁY CHẤM CÔNG
IP: 192.168.1.201:4370
✔ Kết nối thành công!
Danh sách nhân viên: X người
Log chấm công: Y bản ghi
```

Nếu bị lỗi, kiểm tra:
- Máy chấm công có bật không?
- IP có đúng 192.168.1.201 không? (xem trên máy CC: Menu → Comm → Ethernet)
- PC có cùng mạng 192.168.1.x không?
- Firewall có chặn port 4370 không?

---

## Bước 5: Chạy Sync Service

### Cách 1: Chạy trực tiếp (để test)

```bash
npm start
```

Nhấn `Ctrl+C` để dừng.

### Cách 2: Chạy nền với PM2 (khuyên dùng cho production)

PM2 tự khởi động lại khi PC restart hoặc khi script crash.

```bash
# Cài PM2 (1 lần)
npm install -g pm2

# Chạy service
npm run pm2:start

# Xem logs
npm run pm2:logs

# Tự khởi động cùng Windows/Mac
pm2 startup
pm2 save
```

Các lệnh PM2 hữu ích:
```bash
pm2 status              # Xem trạng thái
pm2 restart attendance-sync  # Khởi động lại
pm2 stop attendance-sync     # Dừng
pm2 logs attendance-sync     # Xem log
```

---

## Bước 6: Kiểm tra trên Web

1. Mở trang Sổ Quỹ → tab **Nhân viên** → **Bảng chấm công**
2. Nếu sync thành công:
   - Chấm tròn xanh ở góc bảng (đã kết nối)
   - Danh sách nhân viên từ máy chấm công hiển thị
   - Dữ liệu chấm công theo tuần

---

## Đăng ký vân tay cho nhân viên mới

### Bước 1: Thêm user qua Web (tuỳ chọn)
Mở console trình duyệt (F12), gõ:
```js
_attendance.addDeviceUser('Tên Nhân Viên', '10')
// '10' là ID trên máy chấm công (chọn số chưa dùng)
```

### Bước 2: Đăng ký vân tay trên máy
1. Trên máy DG-600: **Menu** → **User Mng** → chọn user vừa thêm
2. Chọn **Enroll FP** (đăng ký vân tay)
3. Đặt ngón tay 3 lần theo hướng dẫn trên máy
4. Xong! Nhân viên có thể quẹt vân tay để chấm công

---

## Cấu hình

File `config.js`:

| Tham số | Mặc định | Mô tả |
|---------|----------|-------|
| `device.ip` | 192.168.1.201 | IP máy chấm công |
| `device.port` | 4370 | Port ZK Protocol |
| `sync.intervalMs` | 120000 (2 phút) | Tần suất poll |

---

## Xử lý sự cố

### Script không kết nối được máy CC
- Kiểm tra IP: `ping 192.168.1.201`
- Kiểm tra port: trên máy CC → Menu → Comm → Ethernet
- Tắt firewall Windows thử

### Không thấy dữ liệu trên Web
- Kiểm tra file `serviceAccountKey.json` đúng project
- Xem log: `pm2 logs attendance-sync` hoặc thư mục `logs/`
- Thử sync thủ công: trên web, bấm nút "..." ở bảng chấm công

### Máy CC bị đầy bộ nhớ
- Script KHÔNG tự xoá log trên máy CC (an toàn)
- Nếu cần xoá: vào Menu máy CC → Data Mng → Del Att Logs

---

## Cấu trúc file

```
attendance-sync/
├── package.json            # Dependencies
├── config.js               # Cấu hình
├── device-manager.js       # Kết nối máy chấm công
├── firebase-sync.js        # Đồng bộ Firestore
├── sync-service.js         # Service chính (chạy file này)
├── test-connection.js      # Test kết nối
├── serviceAccountKey.json  # Firebase key (TỰ TẠO)
└── logs/                   # Log theo ngày
    └── sync-2026-02-28.log
```
