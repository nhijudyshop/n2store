#!/bin/bash
# #Note: WEB2.0 - Mac: nhap dup file nay -> cai + chay server TACH NEN + tunnel cho dien thoai.
cd "$(dirname "$0")" || exit 1

echo "═══════════════════════════════════════════════"
echo "   Server tách nền (máy shop) — macOS"
echo "═══════════════════════════════════════════════"

# 1) Python 3
if ! command -v python3 >/dev/null 2>&1; then
  echo "⚠️  Chưa có python3. Cài qua: brew install python  (hoặc tải python.org) rồi chạy lại."
  read -r -p "Nhấn Enter để thoát..."
  exit 1
fi

# 2) venv + deps
if [ ! -d ".venv" ]; then
  echo "▶ Tạo môi trường..."
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install -q --upgrade pip
if ! python -c "import rembg,fastapi,uvicorn" >/dev/null 2>&1; then
  echo "▶ Cài thư viện lần đầu ~2-3 phút..."
  python -m pip install -q -r requirements.txt
fi

# 3) cloudflared (tunnel cho điện thoại) — tuỳ chọn
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ℹ️  Chưa có cloudflared (điện thoại chưa dùng được). Cài: brew install cloudflared"
fi

# 4) chạy
python serve.py
