# WEB2 Attendance Sync — Agent máy chấm công DG-600

Agent chạy ở **máy tính trong shop** (cùng mạng LAN với máy chấm công DG-600), đẩy dữ liệu chấm công lên trang **Chấm công** (Web 2.0, group Quản trị viên).

> Render là cloud, KHÔNG vào được mạng LAN của shop. Vì vậy agent chạy ở máy shop và **đẩy ra ngoài** (outbound) → vượt NAT, không cần mở port.

> ⭐ **ĐỌC TRƯỚC — đa số shop KHÔNG cần chạy folder này.** Shop đã có **collector Web 1.0** (`attendance-sync/`) chạy thường trực trên 1 máy. Cách gọn nhất để Web 2.0 có dữ liệu là bật **DUAL-PUSH** ở collector đó (1 máy, 1 kết nối DG-600, đẩy sang CẢ 2 backend). Xem `attendance-sync/README.md` → mục "Dual-push Web 2.0". Folder `web2-attendance-sync/` chỉ là **bản dự phòng độc lập** khi shop KHÔNG chạy collector Web 1.0.

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

## 2A. Chạy ZK pull (đã test)

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

> ⭐ **KHUYẾN NGHỊ: KHÔNG chạy nền bằng folder này.** Máy DG-600 chỉ cho ~1 kết nối cùng lúc → chạy thêm agent ở đây sẽ **tranh kết nối** với collector Web 1.0 đang chạy sẵn. Thay vào đó bật **DUAL-PUSH** ở `attendance-sync/` (collector Web 1.0 đẩy luôn sang Web 2.0). Khi đó **không cần** chạy gì trong folder này.

Folder này chỉ là **bản dự phòng độc lập** cho shop **KHÔNG** chạy collector Web 1.0:

- **Windows (giữ cửa sổ mở):** bấm đúp `install-windows.bat`, hoặc `pm2 start sync.js --name web2-attendance`.
- **Mac/Linux**: `./run-mac.command`, hoặc `pm2 start sync.js --name web2-attendance`.
- **Lấy 1 lần thủ công:** `lay-du-lieu.bat` / `lay-du-lieu.command`.

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

**Nguồn dữ liệu = collector** (dual-push từ `attendance-sync/`, hoặc `sync.js` của folder này nếu chạy dự phòng). Trang web KHÔNG có nút lấy/nhập thủ công — dữ liệu chỉ vào DB qua collector, rồi client tự cập nhật (smart cache + SSE realtime).

---

## 6. Tóm tắt cách dùng

| Tình huống                                 | Làm gì                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Shop CÓ chạy collector Web 1.0** (đa số) | Bật **dual-push** ở `attendance-sync/` (copy `web2-config.example.json` → `web2-config.json`, dán secret). KHÔNG chạy folder này. |
| Shop KHÔNG chạy Web 1.0                    | Chạy `install-windows.bat` (giữ cửa sổ) — bản dự phòng.                                                                           |
| Chỉ muốn lấy 1 lần                         | `lay-du-lieu.bat` / `lay-du-lieu.command` (cùng LAN).                                                                             |

> **Chỉ 1 collector kết nối máy DG-600 cùng lúc.** Dữ liệu idempotent (`id = PIN_giờ`) nên không nhân đôi, nhưng máy thường chỉ cho 1 kết nối → tránh chạy 2 collector song song.
