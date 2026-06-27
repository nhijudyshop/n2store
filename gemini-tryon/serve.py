# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — orchestrator chạy gemini-tryon trên máy shop + tunnel + heartbeat.
"""
Chạy sidecar gemini-tryon + mở tunnel HTTPS + tự BÁO DANH lên registry (engine='gemini-tryon').
Web 2.0 (tab Ghép đồ) sẽ TỰ DÒ máy này online → gọi thẳng → ghép đồ FREE bằng tài khoản
Gemini của shop. Cross-platform (Mac/Windows/Linux).

  python serve.py                         # cổng 8124 + tunnel + heartbeat
  NO_TUNNEL=1 python serve.py             # chỉ dùng trên CHÍNH máy này
  GEMINI_NAME="Máy quầy" python serve.py  # đặt tên máy hiện trên trang

Cookie (chọn 1):
  • Đăng nhập gemini.google.com trên Chrome máy này → KHÔNG cần gì thêm (browser-cookie3 tự đọc).
  • Hoặc set ENV GEMINI_1PSID (+ GEMINI_1PSIDTS) = cookie __Secure-1PSID lấy từ DevTools.
"""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request

PORT = int(os.environ.get("PORT", "8124"))
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


def _start_tunnel(cf):
    p = subprocess.Popen(
        [cf, "tunnel", "--url", f"http://localhost:{PORT}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        creationflags=_NOWIN,
    )
    url = None
    for _ in range(90):
        line = p.stdout.readline()
        if not line:
            if p.poll() is not None:
                break
            continue
        m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
        if m:
            url = m.group(0)
            break
    return p, url


def _heartbeat(url):
    while True:
        try:
            body = json.dumps({"name": NAME, "url": url, "note": ENGINE, "engine": ENGINE}).encode()
            headers = {"content-type": "application/json"}
            if REGISTRY_SECRET:
                headers["x-vieneu-secret"] = REGISTRY_SECRET
            req = urllib.request.Request(REGISTRY, data=body, headers=headers)
            urllib.request.urlopen(req, timeout=8).read()
        except Exception:
            pass
        time.sleep(30)


def main():
    print(f"▶ Khởi động sidecar Gemini try-on (cổng {PORT})… đọc cookie + dò model, chờ chút.")
    srv = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", str(PORT)],
        cwd=HERE,
        creationflags=_NOWIN,
    )
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
            print("▶ Mở tunnel HTTPS…")
            tun, url = _start_tunnel(cf)
            if url:
                print("═" * 64)
                print(f"👕  Máy '{NAME}' đã ONLINE (Gemini try-on FREE).")
                print("    Mở Web 2.0 → tab 'Ghép đồ' → máy này TỰ HIỆN để chọn (KHÔNG cần dán URL).")
                print(f"    URL dự phòng (dán tay nếu cần): {url}")
                print("═" * 64)
                threading.Thread(target=_heartbeat, args=(url,), daemon=True).start()
            else:
                print("⚠️  Chưa lấy được URL tunnel — kiểm tra mạng/cloudflared.")

    print("\nĐang chạy. Đóng cửa sổ này để dừng.")
    try:
        srv.wait()
    except KeyboardInterrupt:
        pass
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
