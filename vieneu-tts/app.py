# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 service.
"""
VieNeu-TTS service — giọng đọc tiếng Việt + CLONE giọng (zero-shot 3-5s), chạy server.

Web 2.0 ONLY. Wrap package `vieneu` (https://github.com/pnnbao97/VieNeu-TTS, Apache-2.0)
chạy ONNX CPU (torch-free). Phục vụ video-maker: text -> WAV để mux vào video.

Endpoints:
  GET  /health        -> {ok, model_loaded, model}
  GET  /voices        -> [{label, voice_id}]  (giọng preset)
  POST /synthesize    -> WAV   body JSON {text, voice?}
  POST /clone         -> WAV   multipart: field `text` + file `ref_audio` (.wav 3-5s)

Bảo vệ: CORS allowlist (origin shop) + optional header x-vieneu-secret (env VIENEU_API_SECRET).
Inference SERIALIZE (1 lúc 1 request) vì model CPU nặng + không an toàn concurrent.
"""
import io
import os
import tempfile
import threading

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

MAX_TEXT = int(os.environ.get("VIENEU_MAX_TEXT", "600"))
API_SECRET = os.environ.get("VIENEU_API_SECRET", "")  # rỗng = không bắt buộc
MODEL_MODE = os.environ.get("VIENEU_MODEL", "")  # "" -> mặc định v3 Turbo

ALLOWED_ORIGINS = [
    "https://nhijudy.store",
    "https://nhijudyshop.github.io",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
# Thêm origin tùy biến qua env (phẩy ngăn cách)
for o in (os.environ.get("VIENEU_EXTRA_ORIGINS", "") or "").split(","):
    o = o.strip()
    if o:
        ALLOWED_ORIGINS.append(o)

app = FastAPI(title="VieNeu-TTS (Web 2.0)", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,
)

_tts = None
_lock = threading.Lock()  # serialize cả load lẫn inference


def _get_tts():
    """Lazy-load model 1 lần (595MB tải lần đầu). Giữ trong RAM."""
    global _tts
    if _tts is not None:
        return _tts
    from vieneu import Vieneu

    _tts = Vieneu(mode=MODEL_MODE) if MODEL_MODE else Vieneu()
    return _tts


def _check_secret(secret: str):
    if API_SECRET and secret != API_SECRET:
        raise HTTPException(status_code=401, detail="invalid secret")


def _clean_text(text: str) -> str:
    t = (text or "").strip()
    if not t:
        raise HTTPException(status_code=400, detail="text rỗng")
    if len(t) > MAX_TEXT:
        t = t[:MAX_TEXT]
    return t


def _infer_to_wav(text: str, voice: str = None, ref_audio_path: str = None) -> bytes:
    """Chạy infer (serialize) -> trả bytes WAV."""
    with _lock:
        tts = _get_tts()
        kwargs = {}
        if ref_audio_path:
            kwargs["ref_audio"] = ref_audio_path
        elif voice:
            kwargs["voice"] = voice
        audio = tts.infer(text, **kwargs)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            out_path = f.name
        try:
            tts.save(audio, out_path)
            with open(out_path, "rb") as fh:
                return fh.read()
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass


class SynthBody(BaseModel):
    text: str
    voice: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "model_loaded": _tts is not None, "model": MODEL_MODE or "v3-turbo"}


@app.get("/voices")
def voices(x_vieneu_secret: str = Header(default="")):
    _check_secret(x_vieneu_secret)
    try:
        tts = _get_tts()
        items = [{"label": str(lbl), "voice_id": str(vid)} for lbl, vid in tts.list_preset_voices()]
        return {"ok": True, "voices": items}
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)[:300]})


@app.post("/synthesize")
def synthesize(body: SynthBody, x_vieneu_secret: str = Header(default="")):
    _check_secret(x_vieneu_secret)
    text = _clean_text(body.text)
    try:
        wav = _infer_to_wav(text, voice=body.voice or None)
        return Response(content=wav, media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)[:400]})


@app.post("/clone")
async def clone(
    text: str = Form(...),
    ref_audio: UploadFile = File(...),
    x_vieneu_secret: str = Header(default=""),
):
    _check_secret(x_vieneu_secret)
    text = _clean_text(text)
    data = await ref_audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="ref_audio rỗng")
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="ref_audio quá lớn (>8MB)")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        ref_path = f.name
        f.write(data)
    try:
        wav = _infer_to_wav(text, ref_audio_path=ref_path)
        return Response(content=wav, media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)[:400]})
    finally:
        try:
            os.unlink(ref_path)
        except OSError:
            pass
