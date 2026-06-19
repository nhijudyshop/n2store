# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — orchestrator chạy VieNeu trên máy shop + tunnel + heartbeat.
"""
Chạy server giọng VieNeu + mở tunnel cho điện thoại + tự BÁO DANH lên registry.
Cross-platform (Mac/Windows/Linux). Launcher mỏng: run-mac.command / install-windows.bat / run_local.sh.

  python serve.py            # cổng 8123 + tunnel (nếu có cloudflared) + heartbeat
  NO_TUNNEL=1 python serve.py  # chỉ dùng trên CHÍNH máy này
  VIENEU_NAME="Máy quầy" python serve.py   # đặt tên máy hiện trên trang
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

PORT = int(os.environ.get("PORT", "8123"))
NAME = os.environ.get("VIENEU_NAME") or socket.gethostname().split(".")[0] or "May-shop"
REGISTRY = os.environ.get(
    "VIENEU_REGISTRY",
    "https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-vieneu-registry/register",
)
NO_TUNNEL = os.environ.get("NO_TUNNEL") == "1"
HERE = os.path.dirname(os.path.abspath(__file__))

# Windows: spawn subprocess KHÔNG hiện cửa sổ console (chạy nền ẩn).
_NOWIN = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def _wait_health():
    for _ in range(90):
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
            body = json.dumps({"name": NAME, "url": url}).encode()
            req = urllib.request.Request(
                REGISTRY, data=body, headers={"content-type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=8).read()
        except Exception:
            pass
        time.sleep(30)


def main():
    print(f"▶ Khởi động server giọng VieNeu (cổng {PORT})… lần đầu tải model ~595MB, chờ chút.")
    srv = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", str(PORT)],
        cwd=HERE,
    )
    if _wait_health():
        print(f"✅ Server local: http://localhost:{PORT}  (dùng trên CHÍNH máy này)")

    if NO_TUNNEL:
        print("ℹ️  NO_TUNNEL=1 → bỏ tunnel. Điện thoại sẽ không dùng được URL này.")
    else:
        cf = _find_cloudflared()
        if not cf:
            print(
                "⚠️  Chưa có cloudflared → điện thoại chưa dùng được.\n"
                "    Mac:  brew install cloudflared   |   Windows: file .bat tự tải."
            )
        else:
            print("▶ Mở tunnel HTTPS cho điện thoại…")
            tun, url = _start_tunnel(cf)
            if url:
                print("═" * 64)
                print(f"📱  Máy '{NAME}' đã ONLINE.")
                print("    Mở trang Tạo video trên điện thoại → mục 'Giọng VieNeu' sẽ TỰ")
                print("    HIỆN máy này để bấm chọn (KHÔNG cần dán URL).")
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
