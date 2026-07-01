# Camera Bridge — ảnh bằng chứng đối soát tay (KBVision / Dahua)

Agent nhỏ chạy trên **máy đóng gói** để lấy 1 ảnh JPEG từ camera IP KBVision (OEM Dahua) mỗi khi nhân viên **tích tay** (không quét barcode) trên trang **Đối soát đóng gói**. Trình duyệt không lấy được ảnh thẳng từ camera LAN (mixed-content + CORS + Digest-auth + RTSP đều chặn) → agent này gọi camera server-side rồi trả về `http://127.0.0.1:8141/snapshot`.

> Không cài agent này thì trang vẫn chạy — tự **fallback webcam/USB** cắm PC (getUserMedia). Agent chỉ cần khi muốn dùng đúng camera KBVision trên cao (ảnh toàn cảnh).

## 1 lần cài đặt

### a) Bật CGI Service trên camera KBVision

Trên giao diện camera: **Setting → Safety (hoặc System) → System Service → tick `CGI Service`** rồi Save. Không bật → agent báo 401/timeout.

Kiểm tra nhanh URL ảnh đúng chưa (thay IP/user/pass thật), chạy trên máy cùng LAN:

```bash
curl --digest -u admin:MATKHAU "http://192.168.1.108/cgi-bin/snapshot.cgi?channel=1" -o test.jpg
```

Mở `test.jpg` thấy ảnh = OK. Nếu 404 → thử thêm `&subtype=0` hoặc `&subtype=1`. Nếu vẫn fail và camera là OEM Hikvision → dùng `snapshotUrl` = `http://<ip>/ISAPI/Streaming/channels/101/picture`.

### b) Cấu hình

```bash
cd camera-bridge
copy camera.config.example.json camera.config.json   # Windows (macOS/Linux: cp)
```

Mở `camera.config.json` điền `ip`, `user`, `pass` (và `snapshotUrl` nếu cần URL đặc biệt). File này **đã gitignore**, không lên git.

### c) Chạy

- **Windows**: nháy đúp `run-camera-bridge.bat` (giữ cửa sổ mở). Muốn tự chạy lúc bật máy → thêm vào Task Scheduler / Startup.
- **Thủ công** (mọi OS, Node ≥14):
    ```bash
    node camera-bridge.js
    # hoặc không cần config file:
    CAM_IP=192.168.1.108 CAM_USER=admin CAM_PASS=xxxxx node camera-bridge.js
    ```

Trang đối soát trên **chính máy này** tự tìm agent qua `http://127.0.0.1:8141` (không cần tunnel).

### d) (Tuỳ chọn) Cho máy KHÁC dùng chung camera

Tải `cloudflared.exe` để cạnh `camera-bridge.js`. `.bat` sẽ tự mở tunnel + báo URL lên registry (`engine=camera`); máy khác mở trang đối soát tự dò ra. Cùng cơ chế Print Bridge.

## Kiểm tra

```bash
curl http://127.0.0.1:8141/health      # {"ok":true,"engine":"camera",...}
curl http://127.0.0.1:8141/snapshot -o snap.jpg   # ảnh hiện tại
```

## Bảo mật

- Agent chỉ nghe `127.0.0.1` (không lộ ra LAN). Ra Internet chỉ qua tunnel cloudflared khi bạn tự bật.
- Mật khẩu camera nằm ở `camera.config.json` (local, gitignored) — không commit, không in ra.
