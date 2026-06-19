<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 service. -->

# VieNeu-TTS service (Web 2.0)

Giọng đọc tiếng Việt + **clone giọng** (zero-shot 3–5s) chạy **server riêng** (Render Web 2.0).
Wrap package [`vieneu`](https://github.com/pnnbao97/VieNeu-TTS) (Apache-2.0), ONNX **CPU torch-free**.
Phục vụ `web2/video-maker` (và mọi trang qua kho Voice dùng chung): text → WAV để mux vào video.

> ⚠️ Web 2.0 ONLY. Tách hoàn toàn khỏi Web 1.0 (AI KOL Studio…). Model 0.5B/595MB → cần RAM ≥ 2GB.

## Endpoints

| Method | Path          | Body                                            | Trả về                        |
| ------ | ------------- | ----------------------------------------------- | ----------------------------- |
| GET    | `/health`     | —                                               | `{ok, model_loaded, model}`   |
| GET    | `/voices`     | header `x-vieneu-secret`                        | `{voices:[{label,voice_id}]}` |
| POST   | `/synthesize` | JSON `{text, voice?}`                           | `audio/wav`                   |
| POST   | `/clone`      | multipart `text` + file `ref_audio` (.wav 3–5s) | `audio/wav`                   |

Bảo vệ: CORS allowlist (nhijudy.store / github.io / localhost) + optional `VIENEU_API_SECRET`.
Inference **serialize** (1 request/lúc) — model CPU nặng, không an toàn concurrent.

## Deploy lên Render (Web 2.0 workspace)

- **Runtime**: Python 3.11 · **rootDir**: `vieneu-tts`
- **Build**: `pip install -r requirements.txt`
- **Start**: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- **Plan**: standard (2GB) — model 0.5B cần RAM
- **buildFilter paths**: `vieneu-tts/**` (chỉ build lại khi folder này đổi, không build theo commit frontend)
- **Env**: `VIENEU_API_SECRET` (chuỗi bí mật, khớp với proxy web2-api) · optional `VIENEU_MODEL`

Lần đầu chạy tải model ~595MB (cache trong container). `GET /health` → `model_loaded:true` sau lần synth đầu.

## Test nhanh

```bash
curl -s "$URL/health"
curl -s -X POST "$URL/synthesize" -H 'content-type: application/json' \
  -H "x-vieneu-secret: $SECRET" -d '{"text":"Xin chào shop nhé!"}' -o out.wav
# clone
curl -s -X POST "$URL/clone" -H "x-vieneu-secret: $SECRET" \
  -F text="Đây là giọng đã nhân bản." -F ref_audio=@mau-3s.wav -o cloned.wav
```

## Lưu ý CPU latency

`vieneu` quảng cáo "real-time trên CPU" nhưng Render CPU dùng chung → có thể chậm hơn.
Nếu chậm: thử model 0.3B (`VIENEU_MODEL`), hoặc cân nhắc GPU. Đo thực tế sau deploy.
