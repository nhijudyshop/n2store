# WEB2 Attendance Sync — Agent máy chấm công DG-600

Agent chạy ở **máy tính trong shop** (cùng mạng LAN với máy chấm công DG-600), đẩy dữ liệu chấm công lên trang **Chấm công** (Web 2.0, group Quản trị viên).

> Render là cloud, KHÔNG vào được mạng LAN của shop. Vì vậy agent chạy ở máy shop và **đẩy ra ngoài** (outbound) → vượt NAT, không cần mở port.

Có **2 chế độ** — chọn 1:

| Chế độ                       | File            | Khi nào dùng                                                                      | Cần cài thư viện              |
| ---------------------------- | --------------- | --------------------------------------------------------------------------------- | ----------------------------- |
| **ZK pull** ✅ (khuyên dùng) | `sync.js`       | **Đã test chạy được với DG-600 thật.** Kéo dữ liệu qua LAN cổng 4370, mỗi 5 phút. | Có (`node-zklib`, bat tự cài) |
| **ADMS proxy** (dự phòng)    | `adms-proxy.js` | Chỉ khi máy có menu "Cloud/ADMS server" + muốn realtime (DG-600 thường KHÔNG có). | Không                         |

> **Cách nhanh nhất:** copy thư mục `web2-attendance-sync/` sang máy PC shop → sửa `config.json` → **bấm đúp `install-windows.bat`** (tự cài thư viện + chạy ZK pull). Giữ cửa sổ mở.

---

## 1. Cài đặt

```bash
cd web2-attendance-sync
cp config.example.json config.json   # rồi sửa config.json
# npm install chạy TỰ ĐỘNG khi bấm install-windows.bat / run-mac.command lần đầu
```

Sửa `config.json`:

- `attendanceSecret`: **đặt GIỐNG** `WEB2_ATTENDANCE_SECRET` trên Render (xem mục 4) — **chỉ cần sửa cái này**.
- `device.ip`: **TỰ DÒ** trên LAN (cổng 4370) — để mặc định cũng được. Chỉ sửa nếu có **nhiều máy** và muốn ép đúng 1 máy.
- `renderBase` / `proxyPort` / `pollMinutes`: giữ mặc định.

> `config.json` đã được `.gitignore` — KHÔNG commit (chứa secret).

---

## 2A. Chạy ZK pull (khuyên dùng — đã test)

**Windows:** bấm đúp `install-windows.bat` (tự cài thư viện + chạy). **Mac:** bấm đúp `run-mac.command`.

Hoặc thủ công:

```bash
npm install      # cài node-zklib (1 lần đầu)
node sync.js     # hoặc: npm start
```

Agent kết nối máy qua LAN cổng 4370, kéo NV + lượt chấm mỗi `pollMinutes` phút (mặc định 5) và đẩy lên server. Log in ra cửa sổ: `[sync] users=15 records=2276 inserted=2276`.

## 2B. Chạy ADMS proxy (dự phòng — chỉ khi máy có ADMS)

```bash
node adms-proxy.js
# hoặc: npm run proxy
```

Trên **máy chấm công DG-600** (menu _Comm → Cloud Server / ADMS_ — DG-600 thường KHÔNG có menu này):

- **Server address** = IP máy tính đang chạy proxy (vd `192.168.1.27`)
- **Server port** = `8081` (đúng `proxyPort`) · **Mode** = _Auto upload_
- Xem log realtime: `http://localhost:8081/debug`

---

## 3. Giữ agent chạy nền 24/7

- **Windows**: bấm đúp `install-windows.bat` (giữ cửa sổ mở), hoặc dùng `pm2 start sync.js --name web2-attendance`.
- **Mac/Linux**: `./run-mac.command`, hoặc `pm2 start sync.js --name web2-attendance`.

---

## 4. Đặt secret trên Render

Backend chỉ nhận đẩy dữ liệu khi khớp secret. Đặt biến môi trường trên service **web2-api**:

```
WEB2_ATTENDANCE_SECRET = <chuỗi ngẫu nhiên mạnh>
```

Rồi điền đúng chuỗi đó vào `config.json` (`attendanceSecret`). Deploy lại Render để nạp env.

> ✅ ĐÃ set + enforced trên web2-api (2026-06-23). Giá trị secret lưu ở `serect_dont_push.txt` — copy vào `config.json` của máy shop.

---

## 5. Kiểm tra

1. Chấm 1 dấu vân tay trên máy.
2. Mở trang **Chấm công** (Web 2.0 → Quản trị viên → Chấm công).
3. Dải "Máy chấm công" hiện **Đang kết nối** + punch xuất hiện trong bảng công (realtime qua SSE).
4. Sang tab **Nhân viên** gán mỗi PIN máy vào 1 nhân viên + đặt lương/ngày + giờ ca.

Không có agent? Vẫn dùng được: nút **Nhập Excel/TXT** trên trang để nạp file xuất từ phần mềm máy.

---

## 6. Nhiều máy chạy file bat thì sao?

### A. Nhiều PC chạy cùng 1 máy chấm công

**An toàn — KHÔNG nhân đôi dữ liệu.** Mỗi lượt chấm có khoá `id = PIN_thời-gian`; backend `ON CONFLICT DO UPDATE` nên 2 PC đẩy cùng 1 lượt → vẫn 1 dòng (idempotent). Lệnh remote dùng `FOR UPDATE SKIP LOCKED` nên không xử lý trùng.

**Nhưng** lãng phí (mỗi PC kéo lại toàn bộ mỗi 5 phút) và máy ZK thường **chỉ cho 1 kết nối cùng lúc** ở cổng 4370 → 2 PC nối song song có thể lỗi/timeout (không hỏng data, chỉ rớt nhịp). Dòng `sync-status` cũng bị các PC ghi đè lẫn nhau.

➡️ **Khuyến nghị: chạy trên ĐÚNG 1 PC.** Muốn dự phòng thì để PC thứ 2 tắt sẵn, PC chính hỏng mới bật.

### B. Nhiều máy chấm công (nhiều chi nhánh)

Mỗi chi nhánh 1 PC + 1 agent — agent **tự dò máy gần nó** trong LAN. Dữ liệu các máy gộp chung lên 1 trang.
⚠️ Hiện tại lượt chấm phân biệt theo **PIN**, KHÔNG theo máy. Nếu 2 máy **trùng số PIN** cho 2 người khác nhau → sẽ lẫn. Cần tách theo từng máy → báo để thêm "mã máy" vào dữ liệu.
