# gemini-tryon — Ghép đồ / Ghép mặt FREE bằng tài khoản Gemini của shop

Sidecar chạy trên **máy shop**, dùng tài khoản **Gemini free** (gemini.google.com) để ghép đồ /
ghép mặt / tạo ảnh (Nano Banana) — phục vụ tab **"Ghép đồ"** trên Web 2.0 mà **KHÔNG tốn API trả phí**.

## Vì sao có cái này

- `gemini.google.com` **KHÔNG cho nhúng iframe** (`X-Frame-Options: DENY`).
- API Nano Banana **chính thức thì TRẢ PHÍ**.
- Đường này gọi đúng **web app Gemini** bằng **cookie phiên Google** của shop (qua thư viện
  [`gemini_webapi`](https://github.com/HanaokaYuzu/Gemini-API) ⭐3000+) → **free**, nhận **nhiều ảnh input**
  (ảnh người + ảnh quần áo / ảnh mặt + ảnh model) → ghép giữ danh tính.

> ⚠️ **Reverse-engineered → vi phạm ToS Google.** Tài khoản có thể bị hạn chế/khoá nếu lạm dụng.
> **DÙNG TÀI KHOẢN GOOGLE PHỤ**, không phải tài khoản chính. Lượng tạo ảnh free có giới hạn/ngày.

## Kiến trúc (giống VieNeu-TTS đã có sẵn)

```
Máy shop: serve.py → uvicorn app:app (cổng 8124) → cloudflared tunnel (URL https ngẫu nhiên)
                   → heartbeat mỗi 30s lên /api/web2-vieneu-registry (engine='gemini-tryon')
Web 2.0 (tab Ghép đồ): dò /list?engine=gemini-tryon → thấy máy online → POST thẳng <url>/tryon
```

## Chạy (Mac)

1. Đăng nhập **gemini.google.com bằng tài khoản Google PHỤ** trên **Chrome** của máy này.
2. `brew install cloudflared` (1 lần, để Web 2.0 tự dò máy).
3. Double-click **`run-mac.command`** (lần đầu tự tạo venv + cài thư viện).
4. Khi thấy `👕 Máy '... (Gemini)' đã ONLINE` → mở Web 2.0 → tab **Ghép đồ** → máy tự hiện để chọn.

Windows/Linux: `python serve.py` (cài `pip install -r requirements.txt` trước, tải `cloudflared.exe` vào thư mục này nếu Windows).

## Cookie (chọn 1 cách)

- **Tự động (khuyên dùng):** chỉ cần đăng nhập gemini.google.com trên Chrome máy này → `browser-cookie3` tự đọc.
- **Thủ công (ổn định hơn cho server):** lấy cookie `__Secure-1PSID` (và `__Secure-1PSIDTS`) trong DevTools
  (tab Application → Cookies → gemini.google.com) rồi set ENV:
    ```bash
    export GEMINI_1PSID="..."
    export GEMINI_1PSIDTS="..."   # để trống nếu tài khoản không có
    python serve.py
    ```

## Biến môi trường

| ENV                               | Mặc định           | Ý nghĩa                                                                |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `PORT`                            | `8124`             | cổng local (khác VieNeu 8123 để chạy song song)                        |
| `GEMINI_1PSID` / `GEMINI_1PSIDTS` | —                  | cookie cố định (bỏ trống = tự đọc Chrome)                              |
| `GEMINI_NAME`                     | tên máy            | tên hiện trên trang Web 2.0                                            |
| `GEMINI_MODEL`                    | mặc định tài khoản | ép model cụ thể nếu cần                                                |
| `GEMINI_TRYON_SECRET`             | —                  | nếu set → mọi request phải kèm `secret` khớp (siết bảo mật URL tunnel) |
| `NO_TUNNEL`                       | —                  | `=1` chỉ dùng trên chính máy này (không mở tunnel)                     |
| `VIENEU_REGISTRY_SECRET`          | —                  | secret ghi registry (nếu server bật)                                   |

## Endpoints

| Method | Path        | Body                         | Trả về                                           |
| ------ | ----------- | ---------------------------- | ------------------------------------------------ |
| GET    | `/health`   | —                            | `{ok, ready, cookie_source, engine}`             |
| POST   | `/tryon`    | `{prompt, images:[base64…]}` | `{ok, dataUrl}` — ảnh đầu = người, sau = quần áo |
| POST   | `/generate` | `{prompt, image?}`           | `{ok, dataUrl}` — tạo/sửa 1 ảnh hoặc text→ảnh    |

## Lưu ý

- Tunnel URL **đổi mỗi lần chạy lại** — không sao, registry tự cập nhật, Web 2.0 tự dò lại.
- Nếu `/health` trả `ready:false` → kiểm tra cookie (đăng nhập lại gemini.google.com / set ENV).
