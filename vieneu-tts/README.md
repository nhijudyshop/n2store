<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 service. -->

# VieNeu-TTS service (Web 2.0)

Giọng đọc tiếng Việt + **clone giọng** (zero-shot 3–5s) chạy **server riêng** (Render Web 2.0).
Wrap package [`vieneu`](https://github.com/pnnbao97/VieNeu-TTS) (Apache-2.0), ONNX **CPU torch-free**.
Phục vụ `web2/video-maker` (và mọi trang qua kho Voice dùng chung): text → WAV để mux vào video.

> ⚠️ Web 2.0 ONLY. Tách hoàn toàn khỏi Web 1.0 (AI KOL Studio…). Model 0.5B/595MB → cần RAM ≥ 2GB.

## Endpoints

| Method | Path          | Body                                             | Trả về                              |
| ------ | ------------- | ------------------------------------------------ | ----------------------------------- |
| GET    | `/health`     | —                                                | `{ok, engine, model_loaded, model}` |
| GET    | `/voices`     | header `x-vieneu-secret`                         | `{voices:[{label,voice_id}]}`       |
| POST   | `/synthesize` | JSON `{text, voice?}`                            | `audio/wav`                         |
| POST   | `/clone`      | multipart `text` + file `ref_audio` (.wav 3–10s) | `audio/wav`                         |
| POST   | `/design`     | JSON `{text, instruct}` (chỉ engine hỗ trợ)      | `audio/wav` · 501 nếu không hỗ trợ  |

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

## Engine: VieNeu (mặc định) hoặc OmniVoice — chọn qua `TTS_ENGINE`

Server hỗ trợ **2 engine** cùng 1 HTTP contract (frontend `Web2Vieneu` KHÔNG đổi). Mỗi máy chạy **1 engine**, tự báo danh registry với `note = tên engine`.

| Engine             | Package                                    | Đặc điểm                                                                             | Nặng          |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------ | ------------- |
| `vieneu` (default) | `vieneu` (Apache-2.0)                      | Tiếng Việt, clone 3–5s, ONNX CPU torch-free                                          | nhẹ (~595MB)  |
| `omnivoice`        | `omnivoice` (k2-fsa/OmniVoice, Apache-2.0) | 600+ ngôn ngữ (có tiếng Việt), clone SOTA + **Voice Design**, PyTorch (CUDA/MPS/CPU) | nặng (vài GB) |

**Map contract cho OmniVoice** (giữ nguyên frontend):

- `/voices` → preset **Voice Design** (`voice_id` = chuỗi instruct, vd `female, young`). `voice_id=""` = auto voice.
- `/synthesize {text, voice}` → `voice` rỗng = auto voice; `voice` = instruct → voice design.
- `/clone` (text + ref_audio) → clone; `ref_text` bỏ trống → OmniVoice tự transcribe bằng Whisper.
- `/design {text, instruct}` → thiết kế giọng theo thuộc tính (gender/age/pitch/accent…). VieNeu trả **501**.

> ⚠️ Voice Design của OmniVoice train chủ yếu trên Trung+Anh → với tiếng Việt **clone vẫn là chế độ ổn định nhất**; design presets là best-effort.

### Chạy engine OmniVoice trên máy shop

- **Mac (1-click)**: nhấp đúp [`run-omnivoice-mac.command`](run-omnivoice-mac.command) — tự tạo venv riêng `.venv-omnivoice` + cài torch (MPS) + omnivoice, rồi chạy.
- **Thủ công / Windows / Linux**:
    ```bash
    python3 -m venv .venv-omnivoice && . .venv-omnivoice/bin/activate
    pip install torch torchaudio            # NVIDIA: thêm --extra-index-url ... (xem requirements-omnivoice.txt)
    pip install -r requirements-omnivoice.txt
    TTS_ENGINE=omnivoice python serve.py
    ```
- **Env tuỳ chọn**: `OMNIVOICE_MODEL` (mặc định `k2-fsa/OmniVoice`) · `OMNIVOICE_DEVICE` (cuda:0/mps/xpu/cpu — mặc định tự dò) · `OMNIVOICE_DTYPE` (fp16/fp32/bf16) · `OMNIVOICE_NUM_STEP` (32, hoặc 16 cho nhanh) · `OMNIVOICE_SPEED` (1.0).
- Trang Tạo video sẽ tự hiện máy này (chip có `note: omnivoice`) để bấm chọn — KHÔNG cần dán URL.

> venv của 2 engine **TÁCH RIÊNG** (`.venv` cho vieneu, `.venv-omnivoice` cho omnivoice) vì deps khác nhau (ONNX torch-free vs PyTorch). Đừng cài chung.

## Lưu ý CPU latency

`vieneu` quảng cáo "real-time trên CPU" nhưng Render CPU dùng chung → có thể chậm hơn.
Nếu chậm: thử model 0.3B (`VIENEU_MODEL`), hoặc cân nhắc GPU. Đo thực tế sau deploy.
`omnivoice` RTF 0.025 trên GPU (rất nhanh) nhưng **CPU sẽ chậm** — máy shop nên có GPU/Apple Silicon, hoặc giảm `OMNIVOICE_NUM_STEP=16`.
