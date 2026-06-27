# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — sidecar Gemini cookie (free try-on).
"""
gemini-tryon — sidecar chạy trên MÁY SHOP, dùng tài khoản Gemini FREE của shop để
ghép đồ / tạo ảnh (Nano Banana) qua thư viện gemini_webapi (cookie __Secure-1PSID).

Vì sao: gemini.google.com KHÔNG cho iframe (X-Frame-Options: DENY) và API Nano Banana
chính thức thì TRẢ PHÍ. Đường này gọi ĐÚNG web app gemini.google.com bằng cookie phiên
Google của shop → FREE, nhận NHIỀU ảnh input (ảnh người + ảnh quần áo) → ghép đồ giữ mặt.

⚠ Reverse-engineered (vi phạm ToS Google) → DÙNG TÀI KHOẢN GOOGLE PHỤ, không phải acc chính.

Cookie: ưu tiên ENV GEMINI_1PSID (+ GEMINI_1PSIDTS); nếu trống → tự đọc từ trình duyệt
đang đăng nhập gemini.google.com qua browser-cookie3 (cần cài extra gemini_webapi[browser]).

Endpoints:
  GET  /health                       → {ok, ready, cookie_source}
  POST /tryon   {prompt, images[]}   → {ok, dataUrl}   (ghép đồ: images = [người, áo1, áo2…])
  POST /generate{prompt, image?}     → {ok, dataUrl}   (tạo/sửa ảnh 1 ảnh hoặc text→ảnh)
"""
import asyncio
import base64
import os
import re
import tempfile
import time
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# gemini_webapi import lười (để /health vẫn trả lời khi thiếu lib) — bind ở startup.
_GeminiClient = None  # type: ignore

MAX_IMAGES = 6
MAX_PROMPT = 2000
INIT_TIMEOUT = int(os.environ.get("GEMINI_INIT_TIMEOUT", "30"))
GEN_TIMEOUT = int(os.environ.get("GEMINI_GEN_TIMEOUT", "150"))
MODEL = (os.environ.get("GEMINI_MODEL") or "").strip()  # rỗng = model mặc định của tài khoản
SECRET = (os.environ.get("GEMINI_TRYON_SECRET") or "").strip()  # rỗng = không bắt buộc

# 1 client toàn cục + lock (web Gemini xử lý tuần tự an toàn hơn, tránh rate/đụng hội thoại).
_state = {"client": None, "ready": False, "cookie_source": "none", "error": ""}
_lock = asyncio.Lock()


async def _build_client():
    """Khởi tạo GeminiClient: ENV cookie trước, fallback browser-cookie3 (Chrome đã login)."""
    global _GeminiClient
    if _GeminiClient is None:
        from gemini_webapi import GeminiClient  # type: ignore

        _GeminiClient = GeminiClient

    psid = (os.environ.get("GEMINI_1PSID") or "").strip()
    psidts = (os.environ.get("GEMINI_1PSIDTS") or "").strip()

    if psid:
        client = _GeminiClient(psid, psidts or None, proxy=None)
        source = "env"
    else:
        # Tự đọc cookie từ trình duyệt local đang đăng nhập gemini.google.com.
        client = _GeminiClient(proxy=None)
        source = "browser"

    await client.init(timeout=INIT_TIMEOUT, auto_close=False, auto_refresh=True, verbose=False)
    _state["cookie_source"] = source
    return client


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        _state["client"] = await _build_client()
        _state["ready"] = True
        print(f"✅ Gemini client sẵn sàng (cookie: {_state['cookie_source']})")
    except Exception as e:  # noqa: BLE001 — log rõ để shop biết sửa cookie
        _state["error"] = str(e)
        print(f"⚠️  Khởi tạo Gemini client lỗi: {e}\n    → kiểm tra cookie __Secure-1PSID / đăng nhập gemini.google.com.")
    yield
    c = _state.get("client")
    if c is not None:
        try:
            await c.close()
        except Exception:
            pass


app = FastAPI(title="gemini-tryon", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tunnel URL ngẫu nhiên + tool nội bộ; siết bằng GEMINI_TRYON_SECRET nếu cần
    allow_methods=["*"],
    allow_headers=["*"],
)


class TryonReq(BaseModel):
    prompt: str = ""
    images: List[str] = []  # base64 dataURL: [ảnh người, ảnh quần áo…]
    secret: Optional[str] = None


class GenReq(BaseModel):
    prompt: str = ""
    image: Optional[str] = None  # base64 dataURL (tuỳ chọn) để sửa
    secret: Optional[str] = None


def _check_secret(req_secret: Optional[str], header_secret: Optional[str]) -> bool:
    if not SECRET:
        return True
    return SECRET in (req_secret or "", header_secret or "")


def _decode_dataurl(s: str) -> bytes:
    m = re.match(r"^data:[^;]+;base64,(.*)$", s or "", re.DOTALL)
    raw = m.group(1) if m else re.sub(r"^data:[^,]*,", "", s or "")
    return base64.b64decode(raw)


async def _run_gemini(prompt: str, image_dataurls: List[str]) -> dict:
    """Gọi Gemini web: ghi ảnh ra file tạm → generate_content(files=…) → lấy ảnh ra base64."""
    if not _state["ready"] or _state["client"] is None:
        return {"ok": False, "error": "Gemini chưa sẵn sàng: " + (_state.get("error") or "chưa init cookie")}

    prompt = (prompt or "").strip()[:MAX_PROMPT]
    if not prompt:
        return {"ok": False, "error": "Thiếu mô tả (prompt)"}

    client = _state["client"]
    with tempfile.TemporaryDirectory(prefix="gtryon_") as tmp:
        paths = []
        for i, d in enumerate(image_dataurls[:MAX_IMAGES]):
            if not d:
                continue
            try:
                p = os.path.join(tmp, f"in_{i}.png")
                with open(p, "wb") as f:
                    f.write(_decode_dataurl(d))
                paths.append(p)
            except Exception as e:  # noqa: BLE001
                return {"ok": False, "error": f"Ảnh #{i} hỏng: {e}"}

        # Nudge model tạo ảnh kết quả (gemini_webapi trả ảnh web nếu prompt không bảo "generate").
        gen_prompt = prompt if re.search(r"\bgenerate\b", prompt, re.I) else (prompt + "\n\nGenerate the resulting image.")

        async with _lock:
            try:
                kwargs = {"files": paths} if paths else {}
                if MODEL:
                    kwargs["model"] = MODEL
                resp = await asyncio.wait_for(
                    client.generate_content(gen_prompt, **kwargs), timeout=GEN_TIMEOUT
                )
            except asyncio.TimeoutError:
                return {"ok": False, "error": "Gemini quá lâu (timeout) — thử lại."}
            except Exception as e:  # noqa: BLE001
                return {"ok": False, "error": f"Gemini lỗi: {e}"}

            images = getattr(resp, "images", None) or []
            if not images:
                txt = (getattr(resp, "text", "") or "").strip()[:300]
                return {
                    "ok": False,
                    "error": "Gemini không trả ảnh (có thể bị chặn nội dung / hết lượt free trong ngày)."
                    + (f" Phản hồi: {txt}" if txt else ""),
                }
            try:
                out_path = os.path.join(tmp, "out.png")
                await images[0].save(path=tmp, filename="out.png", verbose=False)
                with open(out_path, "rb") as f:
                    data = f.read()
            except Exception as e:  # noqa: BLE001
                return {"ok": False, "error": f"Lưu ảnh kết quả lỗi: {e}"}

    b64 = base64.b64encode(data).decode()
    return {"ok": True, "provider": "gemini-web", "dataUrl": f"data:image/png;base64,{b64}"}


@app.get("/health")
async def health():
    return {
        "ok": True,
        "ready": _state["ready"],
        "cookie_source": _state["cookie_source"],
        "engine": "gemini-tryon",
        "error": _state.get("error") or None,
    }


@app.post("/tryon")
async def tryon(req: TryonReq):
    if not _check_secret(req.secret, None):
        return {"ok": False, "error": "Sai secret"}
    if not req.images:
        return {"ok": False, "error": "Thiếu ảnh (cần ít nhất ảnh người)"}
    return await _run_gemini(req.prompt, req.images)


@app.post("/generate")
async def generate(req: GenReq):
    if not _check_secret(req.secret, None):
        return {"ok": False, "error": "Sai secret"}
    imgs = [req.image] if req.image else []
    return await _run_gemini(req.prompt, imgs)
