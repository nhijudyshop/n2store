# Chấm công DG-600 — Agent máy shop (1 nút cài đặt)

Agent nhỏ chạy ở **máy tính trong shop** (cùng mạng LAN với máy chấm công **DG-600**). Nó nhận dữ liệu máy đẩy lên (giao thức **ADMS / iclock**) rồi chuyển tiếp lên server → hiện ở trang **Chấm công** (Web 2.0 → nhóm **Quản trị viên**).

> Vì sao cần agent này? Server là cloud, **không vào được** mạng LAN của shop. Máy DG-600 chỉ nói chuyện HTTP trong LAN. Agent đứng giữa: nhận từ máy (LAN) → đẩy ra server (HTTPS, outbound) → vượt NAT, **không cần mở port**.

---

## ⭐ Cài đặt — chỉ 1 NÚT

### Windows (máy shop)

1. Cài **Node.js** 1 lần nếu chưa có: https://nodejs.org (bản LTS, bấm Next hết).
2. Mở `config.json` → dán **secret** vào `attendanceSecret` (xem [mục Secret](#secret) bên dưới). _Nếu chỉ chạy ADMS thì có thể bỏ qua bước này._
3. **Bấm đúp `CAI-DAT.bat`** → xong.

Nút đó **tự làm hết**:

| Bước | Việc làm                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 1    | Kiểm tra Node.js                                                                                     |
| 2    | Kiểm tra cú pháp (syntax) + `#Note` của mọi file `.js` — **báo lỗi nếu có**                          |
| 3    | Kiểm tra / tạo `config.json`                                                                         |
| 4    | **Tự gỡ bản cũ**: dừng tiến trình cũ + xoá auto-start cũ (cả bản lỗi trước đây)                      |
| 5    | Cài thư viện (ADMS không cần — chỉ để chắc)                                                          |
| 6    | **Tự kiểm tra đường truyền** `proxy → server` (gọi thử `/iclock/cdata`, phải nhận `GET OPTION FROM`) |
| 7    | Cài chạy nền khi bật máy + chạy ngay                                                                 |
| 8    | In tóm tắt + **IP LAN của máy này** (để khai vào máy DG-600)                                         |

Cuối cùng in `KET QUA: XONG` (xanh) hoặc liệt kê các dòng `[LOI]` để biết hỏng ở đâu.

### Mac / Linux (để thử nghiệm)

Bấm đúp `cai-dat.command` (hoặc `node setup.js` trong Terminal). Trên Mac sẽ **bỏ qua auto-start** (chỉ máy shop Windows cần), nhưng vẫn tự kiểm tra đường truyền.

---

## Cấu hình máy chấm công DG-600

Vào menu **Comm → Cloud Server / ADMS** trên máy DG-600 và đặt:

- **Server address** = **IP của MÁY TÍNH đang chạy agent** trên LAN (ví dụ `192.168.1.27`).
  → `CAI-DAT.bat` in sẵn IP này ở bước [8/8].
- **Server port** = `8081` (đúng `proxyPort` trong `config.json`).
- **Mode** = **Auto upload / Tự động tải dữ liệu**.

> ⚠ **Server address là IP của MÁY TÍNH chạy agent**, KHÔNG phải IP của máy chấm công.

---

## Secret

Server chỉ nhận dữ liệu khi khớp secret. Trên Render (service **web2-api**) đã đặt biến môi trường:

```
WEB2_ATTENDANCE_SECRET = <chuỗi bí mật>
```

Dán **đúng chuỗi đó** vào `config.json` → `attendanceSecret`. Giá trị secret nằm trong `serect_dont_push.txt` (KHÔNG commit).

> Endpoint ADMS `/iclock/*` hiện **không bắt buộc** secret (máy không gửi header được), nên nếu chỉ chạy ADMS có thể để trống. Vẫn nên đặt cho chuẩn.

`config.json` đã được `.gitignore` — **không commit** (chứa secret).

---

## Kiểm tra hoạt động

1. Chấm 1 dấu vân tay trên máy DG-600.
2. Mở trang **Chấm công** (Web 2.0 → **Quản trị viên** → **Chấm công**).
3. Dải "Máy chấm công" hiện **Đang kết nối** + lượt chấm xuất hiện trong bảng công (realtime qua SSE).
4. Sang tab **Nhân viên** → gán mỗi **PIN máy** vào 1 nhân viên + đặt lương/ngày + giờ ca.

Xem log realtime của agent: mở trình duyệt **http://localhost:8081/debug** (trên máy chạy agent).

---

## Gỡ bỏ

Bấm đúp **`GO-BO.bat`** (Windows) / `go-bo.command` (Mac). Nó dừng tiến trình + xoá auto-start → lần bật máy sau **không tự chạy** nữa. Muốn cài lại: chạy `CAI-DAT.bat`.

---

## Xử lý lỗi thường gặp

| Triệu chứng                                        | Nguyên nhân & cách xử lý                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `[LOI] Chua cai Node.js`                           | Cài Node.js: https://nodejs.org rồi chạy lại.                                                                                     |
| Self-test (bước 6) **THẤT BẠI: hết thời gian chờ** | Máy này **không có Internet**, hoặc tường lửa chặn. Kiểm tra mạng.                                                                |
| Self-test **404 / Invalid API route**              | Sai `renderBase` trong `config.json`, hoặc server đang lỗi. `renderBase` đúng = `https://chatomni-proxy.nhijudyshop.workers.dev`. |
| Máy báo về proxy nhưng web **không thấy punch**    | Mở `http://localhost:8081/debug` xem có dòng `→ POST /iclock/cdata` + `← 200 OK: N` không. Nếu `N=0` là chưa có lượt chấm mới.    |
| Máy **không gửi gì** lên agent                     | Sai **Server address** (phải là IP máy tính chạy agent) hoặc sai **port 8081**, hoặc máy + máy tính **khác mạng LAN**.            |
| `EADDRINUSE` / cổng 8081 bận                       | Đã có agent khác chạy. Chạy `GO-BO.bat` rồi `CAI-DAT.bat` lại (nút này tự giải phóng cổng).                                       |
| Sau reboot không tự chạy                           | Chạy lại `CAI-DAT.bat` (cài auto-start vào Startup của user đang đăng nhập).                                                      |

---

## Cách hoạt động (tóm tắt kỹ thuật)

```
Máy DG-600  --(LAN, HTTP /iclock/*)-->  agent (adms-proxy.js, cổng 8081)
                                              |  forward y nguyên
                                              v
   https://<worker>/api/web2-attendance-adms/iclock/*   (HTTPS, outbound)
                                              |
                                              v
                       web2-api ghi web2_attendance_records (source='adms')
                                              |
                                              v
                  trang Chấm công cập nhật realtime qua SSE (web2:attendance)
```

Agent **trả nguyên văn** phản hồi của server về cho máy (ví dụ handshake `GET OPTION FROM: ...`), nên máy hiểu đúng và tiếp tục đẩy lượt chấm.

> 🛠 **Lỗi cũ đã sửa:** bản trước chuyển tiếp `/iclock/*` thẳng tới gốc worker (`/iclock/cdata`) → server trả **404 "Invalid API route"** → máy không hiểu → **không đẩy dữ liệu**. Bản này forward đúng sang `/api/web2-attendance-adms/iclock/*` và trả phản hồi hợp lệ về máy.

---

## File trong thư mục

| File                              | Vai trò                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `CAI-DAT.bat` / `cai-dat.command` | **1 nút cài đặt** (Windows / Mac)                       |
| `GO-BO.bat` / `go-bo.command`     | **1 nút gỡ bỏ**                                         |
| `setup.js`                        | Bộ não cài/gỡ + tự kiểm tra (chạy bởi các nút trên)     |
| `adms-proxy.js`                   | Proxy ADMS chạy nền (nhận `/iclock/*` → forward server) |
| `lib-config.js`                   | Đọc `config.json` / biến môi trường                     |
| `config.json`                     | Cấu hình (secret, port…) — **không commit**             |
| `config.example.json`             | Mẫu để tạo `config.json`                                |
