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

### ✅ Windows — TỰ ĐỘNG khi bật máy (khuyên dùng nhất)

**Bấm đúp `cai-tu-dong.bat` (1 lần duy nhất).** Từ đó:

- Cứ **bật máy / đăng nhập Windows là tự đồng bộ** (5 phút/lần), **chạy ngầm** — không hiện cửa sổ đen, **không cần mở trang web**.
- **Tự chạy lại** nếu node lỗi/mất mạng (vòng lặp trong `chay-nen.bat`, đợi 15s rồi thử lại).
- Đăng ký qua **Windows Task Scheduler** (trigger _khi đăng nhập_) → chạy `run-hidden.vbs` (ẩn cửa sổ) → `chay-nen.bat` (vòng lặp `node sync.js`).

> Nếu `cai-tu-dong.bat` báo **không tạo được tác vụ** (thiếu quyền) → **chuột phải → Run as administrator** rồi chạy lại.

**Tắt tự động:** bấm đúp `go-tu-dong.bat` (gỡ khỏi startup + dừng tiến trình đang chạy).

| File              | Vai trò                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `cai-tu-dong.bat` | Cài tự chạy khi bật máy + khởi động ngay                           |
| `go-tu-dong.bat`  | Gỡ tự chạy + dừng đồng bộ                                          |
| `chay-nen.bat`    | Vòng lặp `node sync.js`, tự chạy lại nếu lỗi (không bấm trực tiếp) |
| `run-hidden.vbs`  | Chạy `chay-nen.bat` ẩn cửa sổ (Task Scheduler gọi)                 |

### Cách khác

- **Windows (giữ cửa sổ mở):** bấm đúp `install-windows.bat`, hoặc `pm2 start sync.js --name web2-attendance`.
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

**Nguồn dữ liệu DUY NHẤT = file bat này** (`sync.js`). Trang web KHÔNG có nút lấy/nhập thủ công — dữ liệu chỉ vào DB qua bat, rồi client tự cập nhật (smart cache + SSE realtime).

---

## 6. Ba cách dùng (chọn 1, đơn giản)

### ✅ Cách 0 — TỰ ĐỘNG khi bật máy (khuyên dùng nhất, Windows)

**Bấm đúp `cai-tu-dong.bat` 1 lần.** Xong — từ đó bật máy là tự đồng bộ ngầm 5 phút/lần, tự chạy lại nếu lỗi, không cần mở cửa sổ, không cần mở web. Tắt: `go-tu-dong.bat`. (Chi tiết ở mục 3.)

### Cách 1 — Bấm nút LẤY 1 LẦN (khi cùng mạng)

Lúc nào muốn lấy thì **bấm đúp `lay-du-lieu.bat`** (Windows) / `lay-du-lieu.command` (Mac).
→ Kéo dữ liệu 1 lần rồi đóng. Phải đang **cùng mạng LAN** với máy chấm công (tự dò IP).

### Cách 2 — Chạy NỀN giữ cửa sổ mở (tự đồng bộ)

**Bấm đúp `install-windows.bat`** / `run-mac.command` và **giữ cửa sổ mở** → tự đồng bộ mỗi 5 phút.
Dùng 1 PC luôn bật ở shop. (Như cách 0 nhưng phải giữ cửa sổ + tự bấm lại sau reboot.)

> **Lưu ý:** chỉ chạy nền trên **1 PC** (không cần nhiều máy). Dữ liệu idempotent (`id = PIN_giờ`) nên có lỡ chạy trùng cũng không nhân đôi, nhưng máy chấm công thường chỉ cho 1 kết nối cùng lúc → 1 PC là gọn nhất.
