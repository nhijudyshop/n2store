# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — orchestrator chạy gemini-tryon trên máy shop + tunnel + heartbeat.
"""
Chạy sidecar gemini-tryon + mở tunnel HTTPS + tự BÁO DANH lên registry (engine='gemini-tryon').
Web 2.0 (tab Ghép đồ) sẽ TỰ DÒ máy này online → gọi thẳng → ghép đồ FREE bằng tài khoản
Gemini của shop. Cross-platform (Mac/Windows/Linux).

  python serve.py                         # cổng 8131 + tunnel + heartbeat
  NO_TUNNEL=1 python serve.py             # chỉ dùng trên CHÍNH máy này
  GEMINI_NAME="Máy quầy" python serve.py  # đặt tên máy hiện trên trang

Account Gemini (ĐA ACCOUNT xoay tua — chống giới hạn lượt/ngày):
  • Mở http://localhost:8131/ → trang cấu hình → dán cookie __Secure-1PSID của NHIỀU acc phụ.
  • Hoặc set ENV GEMINI_1PSID_1/GEMINI_1PSIDTS_1 … _2 … (mỗi cặp = 1 account).
  • Hoặc chỉ đăng nhập gemini.google.com trên Chrome máy này (browser-cookie3 tự đọc = 1 account).
"""
import json
import os
import re
import shutil
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.request

# macOS + Python.org thiếu cert store → urllib HTTPS fail (CERTIFICATE_VERIFY_FAILED) → heartbeat
# chết âm thầm → KHÔNG đăng ký được registry. Dùng certifi nếu có; thiếu thì fallback unverified
# (đăng ký name/url lên worker — rủi ro thấp, máy shop tin cậy).
try:
    import certifi  # đi kèm httpx của gemini_webapi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:  # noqa: BLE001
    _SSL_CTX = ssl.create_default_context()
    _SSL_CTX.check_hostname = False
    _SSL_CTX.verify_mode = ssl.CERT_NONE

# Windows ghi log encoding cp1252 → print ký tự Unicode (▶ 👕 tiếng Việt) crash UnicodeEncodeError.
# Ép UTF-8 cho stdout/stderr (errors='replace' để không bao giờ chết vì 1 ký tự lạ).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PORT = int(os.environ.get("PORT", "8131"))
ENGINE = "gemini-tryon"
_HOST = socket.gethostname().split(".")[0] or "May-shop"
NAME = os.environ.get("GEMINI_NAME") or f"{_HOST} (Gemini)"
REGISTRY = os.environ.get(
    "VIENEU_REGISTRY",
    "https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-vieneu-registry/register",
)
REGISTRY_SECRET = os.environ.get("VIENEU_REGISTRY_SECRET", "")
NO_TUNNEL = os.environ.get("NO_TUNNEL") == "1"
HERE = os.path.dirname(os.path.abspath(__file__))
_NOWIN = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def _wait_health():
    for _ in range(120):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=2).read()
            return True
        except Exception:
            time.sleep(1)
    return False


def _find_cloudflared():
    exe = shutil.which("cloudflared") or shutil.which("cloudflared.exe")
    if exe:
        return exe
    for name in ("cloudflared.exe", "cloudflared"):
        local = os.path.join(HERE, name)
        if os.path.exists(local):
            return local
    return None


# URL tunnel HIỆN TẠI (None = tunnel đang chết). Tunnel tự hồi sinh cập nhật biến này; heartbeat đọc.
_tun = {"url": None}


def _tunnel_loop(cf):
    """Chạy cloudflared + tự KHỞI ĐỘNG LẠI khi nó rớt → URL tunnel luôn sống (chống 'lâu lâu lỗi').
    Đọc liên tục stdout (vừa lấy URL vừa drain để pipe không nghẽn); cloudflared thoát → url=None → restart."""
    while True:
        try:
            p = subprocess.Popen(
                [cf, "tunnel", "--url", f"http://localhost:{PORT}"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=_NOWIN,
                bufsize=1,
            )
            for line in p.stdout:  # đọc tới khi cloudflared thoát
                if _tun["url"] is None:
                    m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
                    if m:
                        _tun["url"] = m.group(0)
                        print(f"👕 Tunnel ONLINE: {_tun['url']}", flush=True)
            _tun["url"] = None
            print("⚠️ Tunnel cloudflared RỚT → tự khởi động lại sau 3s…", flush=True)
        except Exception as e:  # noqa: BLE001
            _tun["url"] = None
            print(f"⚠️ Tunnel lỗi: {e} → thử lại sau 3s", flush=True)
        time.sleep(3)


def _heartbeat():
    """Báo danh URL HIỆN TẠI mỗi 15s. Tunnel chết (url=None) → NGỪNG báo → registry tự xoá (TTL 90s)
    → máy không còn hiện 'online' với URL chết; khi tunnel lên lại (URL mới) thì báo URL mới."""
    while True:
        url = _tun.get("url")
        if url:
            try:
                body = json.dumps(
                    {"name": NAME, "url": url, "note": ENGINE, "engine": ENGINE}
                ).encode()
                # User-Agent BẮT BUỘC: worker Cloudflare chặn UA mặc định 'Python-urllib' (403).
                headers = {"content-type": "application/json", "User-Agent": "gemini-tryon/1.0"}
                if REGISTRY_SECRET:
                    headers["x-vieneu-secret"] = REGISTRY_SECRET
                req = urllib.request.Request(REGISTRY, data=body, headers=headers)
                urllib.request.urlopen(req, timeout=8, context=_SSL_CTX).read()
            except Exception:
                pass
        time.sleep(15)


def main():
    print(f"▶ Khởi động sidecar Gemini try-on (cổng {PORT})… đọc cookie + dò model, chờ chút.")
    print(f"   ⚙️  Cấu hình account (dán cookie nhiều acc để xoay tua): http://localhost:{PORT}/")
    # Bắt output uvicorn qua PIPE (utf-8) rồi bơm vào stdout (→ log) → THẤY lỗi nếu uvicorn crash
    # (trước đây pythonw + handle inherit trên Windows làm mất log uvicorn).
    srv = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", str(PORT)],
        cwd=HERE,
        creationflags=_NOWIN,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    def _pump():
        try:
            for line in srv.stdout:
                print("[uvicorn]", line.rstrip(), flush=True)
        except Exception:
            pass

    threading.Thread(target=_pump, args=(), daemon=True).start()
    if _wait_health():
        print(f"✅ Server local: http://localhost:{PORT}  (dùng trên CHÍNH máy này)")
    else:
        print("⚠️  Server chưa lên /health — xem log lỗi phía trên (thường do thiếu cookie).")

    if NO_TUNNEL:
        print("ℹ️  NO_TUNNEL=1 → bỏ tunnel. Web 2.0 trên máy khác sẽ không thấy máy này.")
    else:
        cf = _find_cloudflared()
        if not cf:
            print(
                "⚠️  Chưa có cloudflared → Web 2.0 chưa tự dò được máy này.\n"
                "    Mac:  brew install cloudflared   |   Windows: tải cloudflared.exe vào thư mục này."
            )
        else:
            print("▶ Mở tunnel HTTPS (tự hồi sinh nếu rớt)…")
            print(f"👕  Máy '{NAME}' sẽ ONLINE — Web 2.0 tab 'Ghép đồ' tự hiện để chọn.")
            # Tunnel tự khởi động lại khi rớt + heartbeat đọc URL hiện tại → registry luôn đúng.
            threading.Thread(target=_tunnel_loop, args=(cf,), daemon=True).start()
            threading.Thread(target=_heartbeat, args=(), daemon=True).start()

    print("\nĐang chạy. Đóng cửa sổ này để dừng.")
    try:
        srv.wait()
    except KeyboardInterrupt:
        pass
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
