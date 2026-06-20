# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 service.
"""
Server giọng đọc tiếng Việt + CLONE giọng — chạy trên MÁY SHOP. Web 2.0 ONLY.

HỖ TRỢ NHIỀU ENGINE (chọn qua env TTS_ENGINE):
  - "vieneu"    (mặc định) — package `vieneu`, ONNX CPU torch-free, nhẹ (~595MB).
  - "omnivoice"            — package `omnivoice` (k2-fsa, Apache-2.0), PyTorch, 600+ ngôn ngữ,
                              clone SOTA + Voice Design. Nặng hơn (vài GB), nên cài venv riêng.

Frontend (Web2Vieneu) KHÔNG đổi: cùng 1 contract bất kể engine. Mỗi máy shop chạy 1 engine,
tự báo danh vào registry (note = tên engine) → trang Tạo video hiện máy để bấm chọn.

Endpoints:
  GET  /health        -> {ok, engine, model_loaded, model}
  GET  /voices        -> {ok, voices:[{label, voice_id}]}  (preset giọng / voice-design)
  POST /synthesize    -> WAV   body JSON {text, voice?}
  POST /clone         -> WAV   multipart: field `text` + file `ref_audio` (.wav 3-10s)
  POST /design        -> WAV   body JSON {text, instruct}  (chỉ engine hỗ trợ — vd omnivoice)

Bảo vệ: CORS allowlist (origin shop) + optional header x-vieneu-secret (env VIENEU_API_SECRET).
Inference SERIALIZE (1 lúc 1 request) vì model nặng + không an toàn concurrent.
"""
import os
import tempfile
import threading

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from engine_base import NotSupported

ENGINE_NAME = (os.environ.get("TTS_ENGINE") or "vieneu").strip().lower()
MAX_TEXT = int(os.environ.get("VIENEU_MAX_TEXT", "600"))
API_SECRET = os.environ.get("VIENEU_API_SECRET", "")  # rỗng = không bắt buộc
MODEL_MODE = os.environ.get("VIENEU_MODEL", "")  # vieneu: "" -> mặc định v3 Turbo

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

app = FastAPI(title="Web2 Voice TTS (Web 2.0)", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,
)

_lock = threading.Lock()  # serialize cả load lẫn inference (mọi engine)


def _build_engine():
    """Khởi tạo engine theo env (chưa tải model — lazy lúc gọi đầu tiên)."""
    if ENGINE_NAME == "omnivoice":
        from engine_omnivoice import OmniVoiceEngine

        return OmniVoiceEngine(
            model_id=os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"),
            device=os.environ.get("OMNIVOICE_DEVICE", ""),
            num_step=int(os.environ.get("OMNIVOICE_NUM_STEP", "32")),
            speed=float(os.environ.get("OMNIVOICE_SPEED", "1.0")),
        )
    from engine_vieneu import VieneuEngine

    return VieneuEngine(mode=MODEL_MODE)


_engine = _build_engine()


def _model_label() -> str:
    if _engine.name == "omnivoice":
        return os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice")
    return MODEL_MODE or "v3-turbo"


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


class SynthBody(BaseModel):
    text: str
    voice: str | None = None


class DesignBody(BaseModel):
    text: str
    instruct: str | None = None


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": _engine.name,
        "model_loaded": _engine.loaded,
        "model": _model_label(),
    }


@app.get("/voices")
def voices(x_vieneu_secret: str = Header(default="")):
    _check_secret(x_vieneu_secret)
    try:
        with _lock:
            items = [{"label": str(lbl), "voice_id": str(vid)} for lbl, vid in _engine.list_voices()]
        return {"ok": True, "voices": items}
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)[:300]})


@app.post("/synthesize")
def synthesize(body: SynthBody, x_vieneu_secret: str = Header(default="")):
    _check_secret(x_vieneu_secret)
    text = _clean_text(body.text)
    try:
        with _lock:
            wav = _engine.synth_wav(text, voice=body.voice or None)
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
        with _lock:
            wav = _engine.clone_wav(text, ref_path)
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


@app.post("/design")
def design(body: DesignBody, x_vieneu_secret: str = Header(default="")):
    _check_secret(x_vieneu_secret)
    text = _clean_text(body.text)
    try:
        with _lock:
            wav = _engine.design_wav(text, body.instruct or "")
        return Response(content=wav, media_type="audio/wav")
    except NotSupported as e:
        return JSONResponse(status_code=501, content={"ok": False, "error": str(e)})
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)[:400]})
