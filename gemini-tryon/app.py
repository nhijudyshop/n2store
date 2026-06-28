# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — sidecar Gemini cookie (free try-on, ĐA ACCOUNT xoay tua).
"""
gemini-tryon — sidecar chạy trên MÁY SHOP, dùng NHIỀU tài khoản Gemini FREE để ghép đồ /
ghép mặt / tạo ảnh (Nano Banana) qua thư viện gemini_webapi (cookie __Secure-1PSID).

XOAY TUA ĐA ACCOUNT (chống giới hạn lượt/ngày): mỗi account = 1 cặp cookie. Mỗi request xoay
sang account còn lượt; account nào dính giới hạn (quota/limit) → cooldown, nhảy account kế.
(Giống pattern xoay token Pollinations / account Cloudflare / key Gemini API của dự án.)

Vì sao cần: gemini.google.com KHÔNG cho iframe (X-Frame-Options: DENY); API Nano Banana chính
thức thì TRẢ PHÍ. Đường này gọi ĐÚNG web app bằng cookie phiên Google của shop → FREE.

⚠ Reverse-engineered (vi phạm ToS Google) → DÙNG TÀI KHOẢN GOOGLE PHỤ, không phải acc chính.

Nguồn account (gộp, ưu tiên trên xuống):
  1. accounts.json (thư mục này) — [{label, psid, psidts}, ...] (thêm qua trang cấu hình /).
  2. ENV GEMINI_1PSID_1..20 (+ GEMINI_1PSIDTS_1..20).
  3. ENV GEMINI_1PSID đơn (+ GEMINI_1PSIDTS).
  4. Nếu TRỐNG hết → browser-cookie3 (Chrome đang đăng nhập gemini.google.com) = 1 account.

Endpoints:
  GET  /                              → trang cấu hình account (dán cookie nhiều account)
  GET  /health                        → {ok, ready, accounts:[{label, ready, cooling, uses}]}
  GET  /accounts                      → liệt kê account (KHÔNG trả cookie)
  POST /accounts  {label, psid, psidts}  → thêm account (build client + lưu accounts.json)
  DELETE /accounts/{label}            → xoá account
  POST /tryon   {prompt, images[]}    → {ok, dataUrl, account}   (ghép đồ: images=[người, áo…])
  POST /generate{prompt, image?}      → {ok, dataUrl, account}
"""
import asyncio
import base64
import json
import os
import platform
import re
import sys
import tempfile
import time
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# Windows cp1252 → print emoji/tiếng Việt crash UnicodeEncodeError. Ép UTF-8 cho stdout/stderr.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

_GeminiClient = None  # bind lười để /health vẫn trả lời khi thiếu lib

HERE = os.path.dirname(os.path.abspath(__file__))
ACCOUNTS_FILE = os.path.join(HERE, "accounts.json")

MAX_IMAGES = 6
MAX_PROMPT = 2000
INIT_TIMEOUT = int(os.environ.get("GEMINI_INIT_TIMEOUT", "30"))
GEN_TIMEOUT = int(os.environ.get("GEMINI_GEN_TIMEOUT", "200"))  # tạo ảnh có thể lâu (>120s)
# ƯU TIÊN model "Flash" free-tier (giống user chọn "3.5 Flash" trong web app — model_name
# gemini_webapi: BASIC_FLASH = "gemini-3-flash"). Image-gen được model Flash gọi qua Nano Banana.
# Override env GEMINI_MODEL (vd "gemini-3-pro" / "unspecified" để thư viện tự chọn).
MODEL = (os.environ.get("GEMINI_MODEL") or "gemini-3-flash").strip()
if MODEL.lower() in ("", "unspecified", "auto", "none"):
    MODEL = ""
SECRET = (os.environ.get("GEMINI_TRYON_SECRET") or "").strip()
# Account hết lượt ảnh free/ngày → nghỉ tới khi reset. Gemini free reset theo NGÀY → mặc định 8h
# (đủ để qua mốc reset; tránh thử lại 37s/lần khi cả pool hết lượt). Override GEMINI_COOLDOWN_SEC.
COOLDOWN_SEC = int(os.environ.get("GEMINI_COOLDOWN_SEC", str(8 * 3600)))

# Bắt cả thông điệp giới hạn ngày của Gemini web: "create more images as soon as your limit resets",
# "Check your usage in Settings" → để account hết lượt vào cooldown, KHÔNG thử lại tốn thời gian.
_QUOTA_RE = re.compile(
    r"quota|rate.?limit|limit.?reach|limit reset|create more images|check your usage|exceed|"
    r"too many|try again later|usage limit|temporarily|429",
    re.I,
)
_AUTH_RE = re.compile(r"auth|cookie|1psid|login|unauthor|invalid.*credential|sniffer|expired", re.I)


class Account:
    """1 tài khoản Gemini = 1 cặp cookie + 1 GeminiClient riêng."""

    def __init__(
        self,
        label: str,
        psid: Optional[str],
        psidts: Optional[str],
        premium: Optional[bool] = None,
    ):
        self.label = label
        self.psid = (psid or "").strip()
        self.psidts = (psidts or "").strip()
        self.client = None
        self.ready = False
        self.error = ""  # lỗi init/cookie (tắt account)
        self.last_error = ""  # lỗi LẦN TẠO ẢNH gần nhất (để debug acc nào fail vì gì)
        self.cooldown_until = 0.0
        self.uses = 0
        # PREMIUM = tài khoản Gemini Advanced TRẢ PHÍ (thuê bao tháng, quota cao, ổn định, KHÔNG
        # tính phí theo lượt như Nano Banana API) → ƯU TIÊN xoay tua TRƯỚC. Nhận diện tường minh
        # (premium=True) hoặc tự suy từ tên có chữ "premium". User xác nhận 2026-06-28.
        self.premium = (
            bool(premium) if premium is not None else ("premium" in (label or "").lower())
        )

    def public(self) -> dict:
        now = time.time()
        return {
            "label": self.label,
            "ready": self.ready,
            "premium": self.premium,
            "cooling": self.cooldown_until > now,
            "cooldownLeftSec": max(0, int(self.cooldown_until - now)),
            "uses": self.uses,
            "error": self.error or None,
            "lastError": self.last_error or None,
        }


_state = {"accounts": [], "rr": 0, "cookie_source": "none"}
_lock = asyncio.Lock()


# ───────────────────────── nạp cấu hình account ─────────────────────────
def _load_account_configs() -> List[dict]:
    out, seen = [], set()

    def add(label, psid, psidts, premium=None):
        psid = (psid or "").strip()
        if not psid or psid in seen:
            return
        seen.add(psid)
        out.append(
            {
                "label": (label or f"acc{len(out) + 1}").strip(),
                "psid": psid,
                "psidts": (psidts or "").strip(),
                "premium": premium,
            }
        )

    # 1) accounts.json
    try:
        if os.path.exists(ACCOUNTS_FILE):
            data = json.load(open(ACCOUNTS_FILE, encoding="utf-8"))
            rows = data if isinstance(data, list) else (data.get("accounts") or [])
            for a in rows:
                add(
                    a.get("label"),
                    a.get("psid") or a.get("__Secure-1PSID"),
                    a.get("psidts") or a.get("__Secure-1PSIDTS"),
                    a.get("premium"),
                )
    except Exception as e:  # noqa: BLE001
        print(f"⚠️  Đọc accounts.json lỗi: {e}")
    # 2) ENV GEMINI_1PSID_1..20
    for i in range(1, 21):
        add(f"env{i}", os.environ.get(f"GEMINI_1PSID_{i}"), os.environ.get(f"GEMINI_1PSIDTS_{i}"))
    # 3) ENV đơn
    add("env", os.environ.get("GEMINI_1PSID"), os.environ.get("GEMINI_1PSIDTS"))
    return out


def _persist_accounts():
    """Lưu accounts.json (chỉ account có psid thật — không lưu account browser-cookie3)."""
    rows = [
        {"label": a.label, "psid": a.psid, "psidts": a.psidts, "premium": a.premium}
        for a in _state["accounts"]
        if a.psid
    ]
    try:
        json.dump(rows, open(ACCOUNTS_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    except Exception as e:  # noqa: BLE001
        print(f"⚠️  Lưu accounts.json lỗi: {e}")


async def _build_client(acc: Account):
    """Khởi tạo GeminiClient cho 1 account (psid rỗng = browser-cookie3)."""
    global _GeminiClient
    if _GeminiClient is None:
        from gemini_webapi import GeminiClient  # type: ignore

        _GeminiClient = GeminiClient
    client = _GeminiClient(acc.psid or None, acc.psidts or None, proxy=None) if acc.psid else _GeminiClient(proxy=None)
    # watchdog_timeout CAO: tạo ẢNH thường >120s, watchdog mặc định 120 sẽ GIẾT stream giữa chừng →
    # trả text/images=[] (issue #294/#250, PR #301). Truyền phòng thủ (phiên cũ chưa có param → init thường).
    _init_kw = dict(timeout=INIT_TIMEOUT, auto_close=False, auto_refresh=True, verbose=False)
    try:
        await client.init(watchdog_timeout=max(GEN_TIMEOUT, 300), **_init_kw)
    except TypeError:
        await client.init(**_init_kw)
    acc.client = client
    acc.ready = True
    acc.error = ""


async def _init_pool():
    cfgs = _load_account_configs()
    if cfgs:
        _state["cookie_source"] = "config"
        accounts = [Account(c["label"], c["psid"], c["psidts"], c.get("premium")) for c in cfgs]
    else:
        # Không cấu hình account nào → thử browser-cookie3 (Chrome đã login) làm 1 account.
        _state["cookie_source"] = "browser"
        accounts = [Account("browser", None, None)]
    _state["accounts"] = accounts
    # build song song, account lỗi cookie không chặn account khác
    await asyncio.gather(*[_safe_build(a) for a in accounts])
    ok = sum(1 for a in accounts if a.ready)
    print(f"✅ Pool Gemini: {ok}/{len(accounts)} account sẵn sàng (nguồn: {_state['cookie_source']})")


async def _safe_build(acc: Account):
    try:
        # Bound cứng: 1 account cookie hỏng/mạng treo KHÔNG được làm kẹt mãi (init có thể hang).
        await asyncio.wait_for(_build_client(acc), timeout=INIT_TIMEOUT + 10)
        print(f"   ✓ account '{acc.label}' OK")
    except Exception as e:  # noqa: BLE001
        acc.ready = False
        acc.error = ("timeout init" if isinstance(e, asyncio.TimeoutError) else str(e))[:200]
        print(f"   ✗ account '{acc.label}' lỗi: {acc.error}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Init account chạy NỀN → server lên NGAY (cookie hỏng/mạng chậm KHÔNG làm kẹt cổng 8131).
    # /health + trang cấu hình / luôn truy cập được; account "đang khởi tạo" hiện dần.
    async def _bg():
        try:
            await _init_pool()
        except Exception as e:  # noqa: BLE001
            print(f"⚠️  Khởi tạo pool lỗi: {e}")

    task = asyncio.create_task(_bg())
    yield
    task.cancel()
    for a in _state["accounts"]:
        if a.client is not None:
            try:
                await a.client.close()
            except Exception:
                pass


app = FastAPI(title="gemini-tryon", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


class TryonReq(BaseModel):
    prompt: str = ""
    images: List[str] = []
    account: Optional[str] = None  # admin chọn account cụ thể (None = xoay tua)
    secret: Optional[str] = None


class GenReq(BaseModel):
    prompt: str = ""
    image: Optional[str] = None
    account: Optional[str] = None
    secret: Optional[str] = None


class ChatReq(BaseModel):
    message: str = ""
    metadata: Optional[List[str]] = None  # [cid, rid, rcid] để TIẾP TỤC hội thoại (multi-turn)
    account: Optional[str] = None  # giữ nguyên account của hội thoại khi tiếp tục
    images: List[str] = []  # ảnh đính kèm (hỏi về ảnh)
    secret: Optional[str] = None


class AccountReq(BaseModel):
    label: Optional[str] = None
    psid: str = ""
    psidts: Optional[str] = None
    premium: Optional[bool] = None  # tài khoản trả phí → ưu tiên xoay tua trước
    secret: Optional[str] = None


def _check_secret(req_secret: Optional[str]) -> bool:
    return (not SECRET) or (req_secret == SECRET)


def _decode_dataurl(s: str) -> bytes:
    m = re.match(r"^data:[^;]+;base64,(.*)$", s or "", re.DOTALL)
    raw = m.group(1) if m else re.sub(r"^data:[^,]*,", "", s or "")
    return base64.b64decode(raw)


def _ready_pool() -> List[Account]:
    now = time.time()
    ready = [a for a in _state["accounts"] if a.ready and a.cooldown_until <= now]
    return ready or [a for a in _state["accounts"] if a.ready]  # hết account khoẻ → vẫn thử account cooldown


async def _run_gemini(prompt: str, image_dataurls: List[str], account: Optional[str] = None) -> dict:
    prompt = (prompt or "").strip()[:MAX_PROMPT]
    if not prompt:
        return {"ok": False, "error": "Thiếu mô tả (prompt)"}
    # account chỉ định (admin chọn account cụ thể) → CHỈ dùng account đó (kể cả đang cooldown,
    # admin chủ động ép). Không chỉ định → xoay tua bình thường.
    if account:
        chosen = [a for a in _state["accounts"] if a.label == account and a.ready]
        if not chosen:
            return {"ok": False, "error": f"Account '{account}' không tồn tại / cookie lỗi."}
        pool = chosen
    else:
        pool = _ready_pool()
    if not pool:
        errs = "; ".join(f"{a.label}: {a.error}" for a in _state["accounts"] if a.error) or "chưa init cookie"
        return {"ok": False, "error": "Không account Gemini nào sẵn sàng (" + errs + ")"}

    gen_prompt = prompt if re.search(r"\bgenerate\b", prompt, re.I) else (prompt + "\n\nGenerate the resulting image.")

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

        # Xoay tua account: round-robin + cooldown khi dính giới hạn.
        start = _state["rr"] % len(pool)
        _state["rr"] = (_state["rr"] + 1) % max(1, len(pool))
        order = [pool[(start + i) % len(pool)] for i in range(len(pool))]
        order.sort(key=lambda a: 0 if a.premium else 1)  # PREMIUM (trả phí) ưu tiên TRƯỚC
        last_err = ""

        async with _lock:
            for acc in order:
                try:
                    kwargs = {"files": paths} if paths else {}
                    if MODEL:
                        kwargs["model"] = MODEL
                    # temporary=True → KHÔNG lưu hội thoại vào lịch sử Gemini (đỡ rác + đỡ lộ automation).
                    # Tắt bằng env GEMINI_TEMPORARY=0 nếu phiên gemini_webapi không hỗ trợ.
                    if os.environ.get("GEMINI_TEMPORARY", "1") != "0":
                        kwargs["temporary"] = True
                    print(f"[gen] thử account '{acc.label}' (model={MODEL or 'auto'})…", flush=True)
                    try:
                        resp = await asyncio.wait_for(
                            acc.client.generate_content(gen_prompt, **kwargs), timeout=GEN_TIMEOUT
                        )
                    except Exception as me:  # noqa: BLE001
                        # Model ép không hợp phiên thư viện/account → thử lại KHÔNG ép model (auto).
                        if "model" in kwargs and re.search(
                            r"model|unknown|not.?found|not.?available|invalid", str(me), re.I
                        ):
                            print(
                                f"[gen] model '{MODEL}' lỗi ({str(me)[:80]}) → thử lại auto", flush=True
                            )
                            kw2 = {k: v for k, v in kwargs.items() if k != "model"}
                            resp = await asyncio.wait_for(
                                acc.client.generate_content(gen_prompt, **kw2), timeout=GEN_TIMEOUT
                            )
                        else:
                            raise
                    images = getattr(resp, "images", None) or []
                    if not images:
                        txt = (getattr(resp, "text", "") or "").strip()[:300]
                        # không có ảnh → account hết lượt / IP bị giới hạn / bị chặn → thử account kế
                        acc.last_error = "không trả ảnh: " + (txt or "(rỗng)")
                        last_err = f"[{acc.label}] " + acc.last_error
                        print(f"[gen] account '{acc.label}' KHÔNG trả ảnh: {txt[:160]}", flush=True)
                        if _QUOTA_RE.search(txt):
                            acc.cooldown_until = time.time() + COOLDOWN_SEC
                        continue
                    out_path = os.path.join(tmp, "out.png")
                    await images[0].save(path=tmp, filename="out.png", verbose=False)
                    with open(out_path, "rb") as f:
                        data = f.read()
                    acc.uses += 1
                    acc.last_error = ""
                    print(f"[gen] ✅ account '{acc.label}' tạo ảnh OK ({len(data)} bytes)", flush=True)
                    b64 = base64.b64encode(data).decode()
                    return {"ok": True, "provider": "gemini-web", "account": acc.label, "dataUrl": f"data:image/png;base64,{b64}"}
                except asyncio.TimeoutError:
                    acc.last_error = "timeout (quá lâu)"
                    last_err = f"[{acc.label}] timeout"
                    print(f"[gen] account '{acc.label}' timeout", flush=True)
                    continue
                except Exception as e:  # noqa: BLE001
                    msg = str(e)
                    acc.last_error = msg[:300]
                    last_err = f"[{acc.label}] " + msg[:200]
                    print(f"[gen] account '{acc.label}' LỖI: {msg[:200]}", flush=True)
                    if _QUOTA_RE.search(msg):
                        acc.cooldown_until = time.time() + COOLDOWN_SEC  # hết lượt → nghỉ, nhảy account kế
                    elif _AUTH_RE.search(msg):
                        acc.ready = False
                        acc.error = msg[:200]  # cookie hỏng → tắt account
                    continue

    return {"ok": False, "error": "Tất cả account lỗi/hết lượt. " + last_err}


async def _run_chat(message, metadata=None, account=None, image_dataurls=None) -> dict:
    """CHAT multi-turn với Gemini qua cookie (TEXT ổn định, khác image-gen). metadata=[cid,rid,rcid]
    để TIẾP TỤC hội thoại. Trả {text, images?, metadata, account} để FE giữ ngữ cảnh + hiện đoạn chat."""
    message = (message or "").strip()
    if not message:
        return {"ok": False, "error": "Thiếu tin nhắn"}
    # Tiếp tục hội thoại (có metadata) PHẢI cùng account đã tạo. Mới → account chỉ định / xoay tua.
    if account:
        pool = [a for a in _state["accounts"] if a.label == account and a.ready]
    else:
        pool = _ready_pool()
    if not pool:
        return {"ok": False, "error": "Không account Gemini sẵn sàng" + (f" ('{account}')" if account else "")}

    with tempfile.TemporaryDirectory(prefix="gchat_") as tmp:
        paths = []
        for i, d in enumerate((image_dataurls or [])[:MAX_IMAGES]):
            if not d:
                continue
            try:
                p = os.path.join(tmp, f"in_{i}.png")
                with open(p, "wb") as f:
                    f.write(_decode_dataurl(d))
                paths.append(p)
            except Exception:  # noqa: BLE001
                pass
        start = _state["rr"] % len(pool)
        _state["rr"] = (_state["rr"] + 1) % max(1, len(pool))
        order = [pool[(start + i) % len(pool)] for i in range(len(pool))]
        order.sort(key=lambda a: 0 if a.premium else 1)  # PREMIUM (trả phí) ưu tiên TRƯỚC
        last_err = ""
        async with _lock:
            for acc in order:
                try:
                    kw = {"model": MODEL} if MODEL else {}
                    chat = (
                        acc.client.start_chat(metadata=metadata, **kw)
                        if metadata
                        else acc.client.start_chat(**kw)
                    )
                    skw = {"files": paths} if paths else {}
                    resp = await asyncio.wait_for(
                        chat.send_message(message, **skw), timeout=GEN_TIMEOUT
                    )
                    acc.uses += 1
                    acc.last_error = ""
                    text = (getattr(resp, "text", "") or "").strip()
                    imgs = []
                    for im in (getattr(resp, "images", None) or [])[:2]:
                        try:
                            fn = f"out_{len(imgs)}.png"
                            await im.save(path=tmp, filename=fn, verbose=False)
                            with open(os.path.join(tmp, fn), "rb") as f:
                                imgs.append(
                                    "data:image/png;base64," + base64.b64encode(f.read()).decode()
                                )
                        except Exception:  # noqa: BLE001
                            pass
                    return {
                        "ok": True,
                        "text": text,
                        "images": imgs,
                        "metadata": list(getattr(chat, "metadata", []) or []),
                        "account": acc.label,
                    }
                except Exception as e:  # noqa: BLE001
                    msg = str(e)
                    last_err = f"[{acc.label}] " + msg[:200]
                    acc.last_error = msg[:300]
                    print(f"[chat] account '{acc.label}' lỗi: {msg[:160]}", flush=True)
                    if _AUTH_RE.search(msg):
                        acc.ready = False
                        acc.error = msg[:200]
                    if metadata:
                        break  # tiếp tục hội thoại: chỉ đúng account đó, KHÔNG xoay sang acc khác
                    continue
        return {"ok": False, "error": "Chat lỗi. " + last_err}


# ───────────────────────── endpoints ─────────────────────────
@app.get("/health")
async def health():
    accts = [a.public() for a in _state["accounts"]]
    return {
        "ok": True,
        "ready": any(a["ready"] for a in accts),
        "engine": "gemini-tryon",
        "cookie_source": _state["cookie_source"],
        "accounts": accts,
        "readyCount": sum(1 for a in accts if a["ready"]),
    }


@app.get("/debug")
async def debug():
    """Chẩn đoán: phiên bản Python/lib, lib import được không, account + lỗi. Dán cho dev khi treo."""

    def _ver(mod):
        try:
            import importlib.metadata as md

            return md.version(mod)
        except Exception:
            return None

    libs = {}
    for m in ("gemini_webapi", "fastapi", "uvicorn", "browser_cookie3", "certifi"):
        try:
            __import__(m)
            libs[m] = {"ok": True, "version": _ver(m.replace("_", "-")) or _ver(m)}
        except Exception as e:  # noqa: BLE001
            libs[m] = {"ok": False, "error": str(e)[:160]}
    return {
        "ok": True,
        "engine": "gemini-tryon",
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "cwd": os.getcwd(),
        "port_env": os.environ.get("PORT"),
        "cookie_source": _state["cookie_source"],
        "accounts_file_exists": os.path.exists(ACCOUNTS_FILE),
        "libs": libs,
        "accounts": [a.public() for a in _state["accounts"]],
    }


@app.get("/accounts")
async def list_accounts():
    return {"ok": True, "accounts": [a.public() for a in _state["accounts"]]}


@app.post("/accounts")
async def add_account(req: AccountReq):
    if not _check_secret(req.secret):
        return {"ok": False, "error": "Sai secret"}
    psid = (req.psid or "").strip()
    if not psid:
        return {"ok": False, "error": "Thiếu cookie __Secure-1PSID"}
    if any(a.psid == psid for a in _state["accounts"]):
        return {"ok": False, "error": "Account (cookie) này đã có"}
    label = (req.label or f"acc{len(_state['accounts']) + 1}").strip()
    acc = Account(label, psid, req.psidts, req.premium)
    await _safe_build(acc)
    _state["accounts"].append(acc)
    if _state["cookie_source"] == "browser":
        # bỏ account browser placeholder khi đã có cookie thật
        _state["accounts"] = [a for a in _state["accounts"] if a.psid]
        _state["cookie_source"] = "config"
    _persist_accounts()
    return {"ok": acc.ready, "account": acc.public(), "error": acc.error or None}


@app.delete("/accounts/{label}")
async def del_account(label: str):
    before = len(_state["accounts"])
    _state["accounts"] = [a for a in _state["accounts"] if a.label != label]
    _persist_accounts()
    return {"ok": True, "removed": before - len(_state["accounts"])}


@app.post("/tryon")
async def tryon(req: TryonReq):
    if not _check_secret(req.secret):
        return {"ok": False, "error": "Sai secret"}
    if not req.images:
        return {"ok": False, "error": "Thiếu ảnh (cần ít nhất ảnh người/mặt)"}
    return await _run_gemini(req.prompt, req.images, account=req.account)


@app.post("/generate")
async def generate(req: GenReq):
    if not _check_secret(req.secret):
        return {"ok": False, "error": "Sai secret"}
    return await _run_gemini(req.prompt, [req.image] if req.image else [], account=req.account)


@app.post("/chat")
async def chat(req: ChatReq):
    if not _check_secret(req.secret):
        return {"ok": False, "error": "Sai secret"}
    return await _run_chat(
        req.message, metadata=req.metadata, account=req.account, image_dataurls=req.images
    )


@app.get("/", response_class=HTMLResponse)
async def config_page():
    return _CONFIG_HTML


# Trang cấu hình tối giản (tự chứa) — dán cookie nhiều account Google để xoay tua.
_CONFIG_HTML = """<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>gemini-tryon — Cấu hình account</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:20px;background:#f8fafc;color:#0f172a}
h1{font-size:1.3rem}.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:12px 0}
label{display:block;font-size:.82rem;font-weight:600;margin:8px 0 4px}
input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}
button{background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:9px 14px;font-weight:600;cursor:pointer;margin-top:10px}
button.del{background:#fff;color:#dc2626;border:1px solid #fecaca;padding:4px 10px;font-size:.8rem;margin:0}
table{width:100%;border-collapse:collapse;font-size:.85rem}td,th{text-align:left;padding:6px 4px;border-bottom:1px solid #f1f5f9}
.ok{color:#16a34a}.bad{color:#dc2626}.cool{color:#d97706}
small{color:#64748b;line-height:1.5}.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;font-size:.8rem;color:#92400e}
</style></head><body>
<h1>👕 gemini-tryon — Cấu hình account Gemini (xoay tua)</h1>
<div class="warn">⚠️ Dùng <b>tài khoản Google PHỤ</b>. Cài nhiều account để xoay tua, không bị giới hạn lượt/ngày. Cookie chỉ lưu trên máy này (accounts.json).</div>
<div class="card"><h3>🔧 Chẩn đoán máy chủ <a href="/debug" target="_blank" style="font-size:.75rem;font-weight:400">(JSON đầy đủ)</a></h3><div id="diag" style="font-size:.82rem;line-height:1.7">Đang tải…</div></div>
<div class="card"><h3>Account đang có</h3><table id="tbl"><thead><tr><th>Nhãn</th><th>Trạng thái</th><th>Đã dùng</th><th></th></tr></thead><tbody id="rows"><tr><td colspan=4>Đang tải…</td></tr></tbody></table></div>
<div class="card"><h3>➕ Thêm account</h3>
<small>Cách lấy cookie: mở <b>gemini.google.com</b> (đã đăng nhập acc phụ) → F12 → tab <b>Application</b> → Cookies → gemini.google.com → copy giá trị <b>__Secure-1PSID</b> và <b>__Secure-1PSIDTS</b>.</small>
<label>Nhãn (tự đặt, vd "acc-shop-2")</label><input id="label" placeholder="acc2">
<label>__Secure-1PSID *</label><input id="psid" placeholder="dán cookie __Secure-1PSID">
<label>__Secure-1PSIDTS (có thể trống)</label><input id="psidts" placeholder="dán cookie __Secure-1PSIDTS">
<button onclick="add()">Thêm account</button> <span id="msg"></span></div>
<script>
async function load(){let r=await fetch('/accounts');let d=await r.json();let h='';(d.accounts||[]).forEach(a=>{let st=a.ready?'<span class=ok>● sẵn sàng</span>':(a.cooling?'<span class=cool>● nghỉ '+a.cooldownLeftSec+'s</span>':'<span class=bad>● lỗi'+(a.error?': '+a.error:'')+'</span>');if(a.lastError)st+='<br><small style="color:#b45309">⚠ tạo ảnh gần nhất: '+a.lastError.slice(0,110)+'</small>';h+='<tr><td>'+a.label+'</td><td>'+st+'</td><td>'+a.uses+'</td><td><button class=del onclick="del(\\''+a.label+'\\')">Xoá</button></td></tr>';});document.getElementById('rows').innerHTML=h||'<tr><td colspan=4>Chưa có account</td></tr>';}
async function add(){let psid=document.getElementById('psid').value.trim();if(!psid){msg.textContent='Thiếu __Secure-1PSID';return;}msg.textContent='Đang thêm…';let r=await fetch('/accounts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label:document.getElementById('label').value,psid:psid,psidts:document.getElementById('psidts').value})});let d=await r.json();msg.textContent=d.ok?'✓ Đã thêm':'✗ '+(d.error||'lỗi');if(d.ok){psid.value='';document.getElementById('psid').value='';document.getElementById('psidts').value='';document.getElementById('label').value='';}load();}
async function del(l){if(!confirm('Xoá account '+l+'?'))return;await fetch('/accounts/'+encodeURIComponent(l),{method:'DELETE'});load();}
async function loadDiag(){try{let r=await fetch('/debug');let d=await r.json();let libs=Object.entries(d.libs||{}).map(function(e){return e[0]+': '+(e[1].ok?('✅ '+(e[1].version||'')):('❌ '+(e[1].error||'')));}).join('<br>');document.getElementById('diag').innerHTML='Python <b>'+d.python+'</b> · '+d.platform+'<br>Cổng env: '+(d.port_env||'(mặc định)')+' · Nguồn cookie: '+d.cookie_source+' · accounts.json: '+(d.accounts_file_exists?'có':'chưa')+'<br><b>Thư viện:</b><br>'+libs;}catch(e){document.getElementById('diag').textContent='Lỗi tải /debug: '+e;}}
load();loadDiag();setInterval(load,5000);setInterval(loadDiag,8000);
</script></body></html>"""
