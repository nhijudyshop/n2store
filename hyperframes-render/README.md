# hyperframes-render — render video HTML→MP4 trên máy shop

> WEB2.0 · Bổ sung (KHÔNG thay) `web2/video-maker` in-browser. Dùng cho video **chất
> lượng cao, deterministic** render bằng [HeyGen HyperFrames](https://github.com/heygen-com/hyperframes)
> (Apache-2.0). Mô hình tự host **giống `vieneu-tts/`**: server local + cloudflared
> tunnel + heartbeat lên registry chung → trang web tự dò máy online.

## Vì sao chạy trên máy shop (không phải Render)?

HyperFrames cần **Node 22 + FFmpeg + headless Chrome**, render từng frame 1080p → Render
Starter 512MB OOM/cực chậm. Máy shop (đã chạy VieNeu) có CPU/RAM thật → render nhanh,
chi phí $0. (Quyết định của user 2026-06-24.)

## Cài (máy shop)

1. **Node 22+**: macOS `brew install node`, Windows tải nodejs.org.
2. **FFmpeg**: macOS `brew install ffmpeg`, Windows `winget install Gyan.FFmpeg`.
3. **cloudflared**: macOS `brew install cloudflared`, Windows `winget install cloudflare.cloudflared`.
4. Trong thư mục này: `npm install` (cài express + hyperframes + Puppeteer tự tải Chrome).

## Chạy

```bash
node server.js                 # cổng 8124 + tunnel + heartbeat (engine='hyperframes')
NO_TUNNEL=1 node server.js     # chỉ dùng trên chính máy này
HF_NAME="Máy render" node server.js
```

macOS: double-click `run-mac.command`.

Khi tunnel lên, máy **tự báo danh** lên registry — trang Web 2.0 (`Web2VideoRender`) sẽ
tự hiện máy này để chọn, KHÔNG cần dán URL (tắt/mở lại tự cập nhật URL mới).

## API

| Method | Path      | Mô tả                                                                            |
| ------ | --------- | -------------------------------------------------------------------------------- |
| GET    | `/health` | `{ok, engine:'hyperframes', name, node}`                                         |
| POST   | `/render` | body `{html, name?}` → trả **MP4** (binary). Lỗi → JSON `{ok:false, error, log}` |

CORS mở `*` để trang web POST trực tiếp lên tunnel.

## ENV

| Biến                     | Mặc định                                           | Ý nghĩa                                           |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------- |
| `PORT`                   | 8124                                               | cổng local                                        |
| `HF_NAME`                | `<hostname> (HyperFrames)`                         | tên máy hiện trên trang                           |
| `NO_TUNNEL`              | —                                                  | `1` = không mở tunnel                             |
| `VIENEU_REGISTRY_SECRET` | —                                                  | khớp secret registry nếu bật                      |
| `HF_RENDER_CMD`          | `npx --yes hyperframes render {in} --output {out}` | ghi đè lệnh render (2 placeholder `{in}` `{out}`) |

⚠️ **Verify lệnh render lúc setup**: chạy `npx hyperframes render --help` để xác nhận
flag input/output đúng với version HyperFrames hiện tại; nếu khác, đặt `HF_RENDER_CMD`
cho khớp. (Service viết HTML composition ra `index.html` rồi gọi lệnh này.)

## Liên kết

- Registry chung: `render.com/routes/web2-vieneu-registry.js` (cột `engine` phân loại máy).
- Client web: `web2/shared/web2-video-render.js` (`Web2VideoRender`).
- Nguồn HyperFrames: https://github.com/heygen-com/hyperframes (docs hyperframes.heygen.com).
