# gemini-tryon — Ghép đồ / Ghép mặt FREE bằng NHIỀU account Gemini (xoay tua)

**Sidecar** = chương trình phụ chạy trên **máy shop**, dùng tài khoản **Gemini free** (gemini.google.com)
để ghép đồ / ghép mặt / tạo ảnh (Nano Banana) — phục vụ tab **"Ghép đồ"** trên Web 2.0 mà **KHÔNG tốn API trả phí**.

> **Cài NHIỀU account Google để XOAY TUA** → một account hết lượt/ngày thì tự nhảy account kế → gần như không bị giới hạn.

## Vì sao có cái này

- `gemini.google.com` **KHÔNG cho nhúng iframe** (`X-Frame-Options: DENY`).
- API Nano Banana **chính thức thì TRẢ PHÍ**.
- Đường này gọi đúng **web app Gemini** bằng **cookie phiên Google** (qua lib
  [`gemini_webapi`](https://github.com/HanaokaYuzu/Gemini-API) ⭐3k+) → **free**, nhận **nhiều ảnh input**.

> ⚠️ **Reverse-engineered → vi phạm ToS Google.** Tài khoản có thể bị hạn chế/khoá nếu lạm dụng.
> **DÙNG TÀI KHOẢN GOOGLE PHỤ.** Cài nhiều acc phụ để xoay tua, đừng dồn 1 acc.

## Kiến trúc (giống VieNeu-TTS đã có sẵn)

```
Máy shop: serve.py → uvicorn app:app (cổng 8131) → cloudflared tunnel (URL https ngẫu nhiên)
                   → heartbeat mỗi 30s lên /api/web2-vieneu-registry (engine='gemini-tryon')
Web 2.0 (tab Ghép đồ): dò /list?engine=gemini-tryon → thấy máy online → POST thẳng <url>/tryon
Pool account: mỗi request xoay round-robin; account dính giới hạn → cooldown, nhảy account kế.
```

## Tự bật khi mở máy + chạy NỀN ẨN

- **Windows (khuyên dùng):** cài qua bộ cài `cai-may-pos.bat` trên Web 2.0 (tab Ghép đồ → "Tải bộ cài" → chọn **[4] Gemini**). Tự chạy `pythonw` (không cửa sổ) + bỏ vào **Startup** → **tự bật mỗi khi mở máy, chạy ẩn hoàn toàn**.
- **Mac:** double-click **`install-mac.command`** (1 lần) → tạo **LaunchAgent** → chạy **nền ẩn (không cửa sổ Terminal) + tự bật mỗi khi đăng nhập**. Gỡ: `uninstall-mac.command`. Log ở `gemini-tryon.log`.

> Khi chạy nền ẩn, **dùng cookie qua trang cấu hình** `http://localhost:8131/` (accounts.json) — browser-cookie3 có thể không đọc được Chrome ở chế độ nền.

## Chạy thủ công (test, có cửa sổ)

1. `brew install cloudflared` (1 lần, để Web 2.0 tự dò máy).
2. Double-click **`run-mac.command`** (lần đầu tự tạo venv + cài thư viện) — có cửa sổ Terminal để xem log.
3. Mở **http://localhost:8131/** → trang cấu hình → **dán cookie nhiều account** (xem dưới).
4. Khi thấy `👕 Máy '... (Gemini)' đã ONLINE` → mở Web 2.0 → tab **Ghép đồ** → máy tự hiện để chọn.

Linux: `python serve.py` (cài `pip install -r requirements.txt` trước).

## Thêm account (3 cách)

**A. Trang cấu hình (dễ nhất):** mở `http://localhost:8131/` → mục "Thêm account" → dán cookie. Lặp lại cho từng acc phụ. Lưu vào `accounts.json`.

**B. ENV nhiều account:**

```bash
export GEMINI_1PSID_1="..."; export GEMINI_1PSIDTS_1="..."
export GEMINI_1PSID_2="..."; export GEMINI_1PSIDTS_2="..."
python serve.py
```

**C. Tự đọc Chrome (1 account):** chỉ cần đăng nhập gemini.google.com trên Chrome máy này (browser-cookie3) — nhưng chỉ được 1 acc đang active.

> **Lấy cookie:** mở gemini.google.com (đã login acc phụ) → F12 → tab **Application** → Cookies → gemini.google.com → copy **\_\_Secure-1PSID** và **\_\_Secure-1PSIDTS**.

## Biến môi trường

| ENV                                           | Mặc định           | Ý nghĩa                                         |
| --------------------------------------------- | ------------------ | ----------------------------------------------- |
| `PORT`                                        | `8131`             | cổng local (né VieNeu 8123 / OmniVoice 8124)    |
| `GEMINI_1PSID_1..20` / `GEMINI_1PSIDTS_1..20` | —                  | nhiều account để xoay tua                       |
| `GEMINI_1PSID` / `GEMINI_1PSIDTS`             | —                  | 1 account (cách cũ)                             |
| `GEMINI_COOLDOWN_SEC`                         | `10800` (3h)       | account hết lượt nghỉ bao lâu trước khi thử lại |
| `GEMINI_NAME`                                 | tên máy            | tên hiện trên Web 2.0                           |
| `GEMINI_MODEL`                                | mặc định tài khoản | ép model cụ thể nếu cần                         |
| `GEMINI_TRYON_SECRET`                         | —                  | nếu set → mọi request phải kèm `secret` khớp    |
| `NO_TUNNEL`                                   | —                  | `=1` chỉ dùng trên chính máy này                |

## Endpoints

| Method | Path                | Body                         | Trả về                                                           |
| ------ | ------------------- | ---------------------------- | ---------------------------------------------------------------- |
| GET    | `/`                 | —                            | trang cấu hình account (dán cookie)                              |
| GET    | `/health`           | —                            | `{ok, ready, readyCount, accounts:[{label,ready,cooling,uses}]}` |
| GET    | `/accounts`         | —                            | liệt kê account (KHÔNG trả cookie)                               |
| POST   | `/accounts`         | `{label, psid, psidts}`      | thêm account                                                     |
| DELETE | `/accounts/{label}` | —                            | xoá account                                                      |
| POST   | `/tryon`            | `{prompt, images:[base64…]}` | `{ok, dataUrl, account}` — ảnh đầu = người/mặt, sau = đồ/model   |
| POST   | `/generate`         | `{prompt, image?}`           | `{ok, dataUrl, account}`                                         |

## Lưu ý

- Tunnel URL **đổi mỗi lần chạy lại** — không sao, registry tự cập nhật, Web 2.0 tự dò lại.
- `accounts.json` chứa cookie → **gitignored**, chỉ ở máy này.
- `/health` xem account nào sẵn sàng / đang nghỉ (cooldown) / lỗi cookie.
