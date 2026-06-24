<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 module. -->

# Server Tách Nền (máy shop) — free, on-device

Tách nền ảnh sản phẩm **miễn phí** chạy ngay trên máy shop (không tốn tiền API như PhotoRoom).
Engine: [rembg](https://github.com/danielgatis/rembg) (U-2-Net) — cùng họ model với
[nadermx/backgroundremover](https://github.com/nadermx/backgroundremover) nhưng nhẹ hơn
(onnxruntime thay vì torch, chạy CPU ổn).

Theo ĐÚNG pattern **VieNeu-TTS**: máy shop chạy server + cloudflared tunnel → tự BÁO DANH lên
registry (`web2_machine_servers`, engine=`bgremover`) → trang web TỰ HIỆN máy online để bấm chọn.

## Chạy

- **Windows**: nhấp đúp `install-windows.bat` (tự cài Python + thư viện + cloudflared).
- **Mac**: nhấp đúp `run-mac.command` (cần `brew install cloudflared` cho điện thoại).
- **Thủ công**: `pip install -r requirements.txt && python serve.py`

Lần đầu tải model ~170MB. Mặc định cổng **8124** (VieNeu là 8123 → chạy song song được).

## Dùng trên web

Trợ lý AI → tab **Tạo ảnh** → ảnh kết quả có nút **✂️ Tách nền** → tự gọi máy shop online.
Không thấy máy nào → bật server trên máy shop trước.

## API

| Method | Path                | Mô tả                                   |
| ------ | ------------------- | --------------------------------------- |
| GET    | `/health`           | `{ok, engine:"bgremover", model}`       |
| POST   | `/remove`           | field `file` (ảnh) → PNG nền trong suốt |
| POST   | `/remove?bg=FFFFFF` | tách nền rồi đặt nền màu hex            |

## Biến môi trường

- `PORT` (mặc định 8124)
- `BGR_NAME` — tên máy hiện trên trang (mặc định `<hostname> (Tách nền)`)
- `BGR_MODEL` — `u2net` (mặc định) / `u2netp` (nhẹ, nhanh) / `isnet-general-use` (nét hơn)
- `BGR_REGISTRY` — URL registry (mặc định worker chatomni-proxy)
- `NO_TUNNEL=1` — chỉ dùng trên chính máy này (không mở tunnel)
