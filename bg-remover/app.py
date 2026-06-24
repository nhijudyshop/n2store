# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — server TÁCH NỀN ảnh chạy máy shop (free, on-device).
"""
FastAPI app tách nền ảnh bằng U-2-Net (rembg — cùng họ model với github nadermx/backgroundremover,
nhưng nhẹ hơn: dùng onnxruntime thay vì torch, chạy CPU ổn).

Endpoints:
  GET  /health          → {ok, engine}
  POST /remove          → multipart field "file" (ảnh) → trả PNG nền trong suốt
  POST /remove?bg=FFFFFF → tách nền rồi đặt nền màu (hex) thay vì trong suốt

Chạy: uvicorn app:app --host 0.0.0.0 --port 8124  (serve.py lo tunnel + heartbeat).
"""
import io
import os

from fastapi import FastAPI, File, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="N2Store BG Remover")

# CORS mở (*) — trình duyệt ở nhijudy.store / *.trycloudflare.com POST trực tiếp tới máy shop.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mặc định BiRefNet (SOTA — cạnh/tóc rối nét hơn HẲN u2net; audit 2026-06-24 verified).
# birefnet-general-lite: CPU vài giây/ảnh. Chọn khác qua env BGR_MODEL:
#   birefnet-general (đẹp nhất, cần GPU ~3.5GB) | u2net | u2netp (nhẹ) | isnet-general-use
MODEL = os.environ.get("BGR_MODEL", "birefnet-general-lite")
_session = None


def _get_session():
    """Lazy-load model rembg (lần đầu tải ~170MB)."""
    global _session
    if _session is None:
        from rembg import new_session

        _session = new_session(MODEL)
    return _session


@app.get("/health")
def health() -> dict:
    return {"ok": True, "engine": "bgremover", "model": MODEL}


@app.post("/remove")
async def remove_bg(
    file: UploadFile = File(...),
    bg: str = Query("", description="Hex màu nền thay thế (vd FFFFFF). Trống = trong suốt."),
) -> Response:
    from rembg import remove

    data = await file.read()
    cut = remove(data, session=_get_session())  # PNG RGBA nền trong suốt
    if bg:
        from PIL import Image

        hex_str = bg.lstrip("#")
        try:
            rgb = tuple(int(hex_str[i : i + 2], 16) for i in (0, 2, 4))
        except Exception:
            rgb = (255, 255, 255)
        fg = Image.open(io.BytesIO(cut)).convert("RGBA")
        canvas = Image.new("RGBA", fg.size, rgb + (255,))
        canvas.alpha_composite(fg)
        buf = io.BytesIO()
        canvas.convert("RGB").save(buf, format="PNG")
        cut = buf.getvalue()
    return Response(content=cut, media_type="image/png")
