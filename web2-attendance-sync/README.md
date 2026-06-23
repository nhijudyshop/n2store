# WEB2 Attendance Sync — Agent máy chấm công DG-600

Agent chạy ở **máy tính trong shop** (cùng mạng LAN với máy chấm công DG-600), đẩy dữ liệu chấm công lên trang **Chấm công** (Web 2.0, group Quản trị viên).

> Render là cloud, KHÔNG vào được mạng LAN của shop. Vì vậy agent chạy ở máy shop và **đẩy ra ngoài** (outbound) → vượt NAT, không cần mở port.

Có **2 chế độ** — chọn 1:

| Chế độ                       | File            | Khi nào dùng                                                              | Cần cài thư viện  |
| ---------------------------- | --------------- | ------------------------------------------------------------------------- | ----------------- |
| **ADMS proxy** (khuyên dùng) | `adms-proxy.js` | Máy hỗ trợ "Cloud/ADMS server" (đa số DG-600). Máy tự push, gần realtime. | Không             |
| **ZK pull**                  | `sync.js`       | Máy KHÔNG có ADMS, hoặc muốn kéo định kỳ qua cổng 4370.                   | Có (`node-zklib`) |

---

## 1. Cài đặt

```bash
cd web2-attendance-sync
cp config.example.json config.json   # rồi sửa config.json
# (chỉ chế độ ZK pull mới cần) npm install
```

Sửa `config.json`:

- `renderBase`: giữ mặc định (worker) — `https://chatomni-proxy.nhijudyshop.workers.dev`
- `attendanceSecret`: **đặt GIỐNG** biến môi trường `WEB2_ATTENDANCE_SECRET` trên Render (xem mục 4)
- `device.ip` / `device.port`: IP + cổng máy chấm công trong LAN (mặc định `192.168.1.201:4370`)
- `proxyPort`: cổng proxy ADMS (mặc định `8081`)

> `config.json` đã được `.gitignore` — KHÔNG commit (chứa secret).

---

## 2A. Chạy ADMS proxy (khuyên dùng)

```bash
node adms-proxy.js
# hoặc: npm run proxy
```

Trên **máy chấm công DG-600** (menu _Comm → Cloud Server / ADMS_):

- **Server address** = IP của máy tính đang chạy proxy (vd `192.168.1.27`)
- **Server port** = `8081` (đúng `proxyPort`)
- **Mode** = _Auto upload / Tự động tải dữ liệu_
- Tắt "Khởi động tên miền" nếu có.

Xem log realtime: mở trình duyệt `http://localhost:8081/debug`.

## 2B. Chạy ZK pull (tuỳ chọn)

```bash
npm install      # cài node-zklib (1 lần)
node sync.js     # hoặc: npm run pull
```

Agent kết nối máy qua LAN, kéo NV + punch mỗi `pollMinutes` phút và đẩy lên Render.

---

## 3. Giữ agent chạy nền 24/7

- **Windows**: bấm đúp `install-windows.bat` (tạo tác vụ chạy nền), hoặc dùng `pm2`.
- **Mac/Linux**: `./run-mac.command`, hoặc `pm2 start adms-proxy.js --name web2-attendance`.

---

## 4. Đặt secret trên Render

Backend chỉ nhận đẩy dữ liệu khi khớp secret. Đặt biến môi trường trên service **web2-api**:

```
WEB2_ATTENDANCE_SECRET = <chuỗi ngẫu nhiên mạnh>
```

Rồi điền đúng chuỗi đó vào `config.json` (`attendanceSecret`). Deploy lại Render để nạp env.

> Nếu CHƯA đặt `WEB2_ATTENDANCE_SECRET` trên Render, endpoint ingest tạm MỞ (chỉ nên dùng lúc thử). Đặt secret trước khi dùng thật.

---

## 5. Kiểm tra

1. Chấm 1 dấu vân tay trên máy.
2. Mở trang **Chấm công** (Web 2.0 → Quản trị viên → Chấm công).
3. Dải "Máy chấm công" hiện **Đang kết nối** + punch xuất hiện trong bảng công (realtime qua SSE).
4. Sang tab **Nhân viên** gán mỗi PIN máy vào 1 nhân viên + đặt lương/ngày + giờ ca.

Không có agent? Vẫn dùng được: nút **Nhập Excel/TXT** trên trang để nạp file xuất từ phần mềm máy.
