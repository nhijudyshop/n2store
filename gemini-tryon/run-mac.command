#!/bin/bash
# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — launcher Mac cho sidecar gemini-tryon.
# Double-click file này (Finder) để chạy. Lần đầu tự tạo venv + cài thư viện.
cd "$(dirname "$0")" || exit 1

echo "════════════════════════════════════════════════════════════"
echo "  gemini-tryon — Ghép đồ / Ghép mặt FREE bằng tài khoản Gemini"
echo "════════════════════════════════════════════════════════════"

# 1) venv
if [ ! -d ".venv" ]; then
  echo "▶ Tạo môi trường Python (.venv)…"
  python3 -m venv .venv || { echo "❌ Cần Python 3.10+ (brew install python)"; exit 1; }
fi
source .venv/bin/activate

# 2) thư viện (idempotent — chạy lại nhanh)
echo "▶ Cài/cập nhật thư viện…"
pip install -q --upgrade pip >/dev/null 2>&1
pip install -q -r requirements.txt || { echo "❌ Cài thư viện lỗi"; exit 1; }

# 3) cloudflared cho tunnel (tự dò máy trên Web 2.0). Bỏ qua nếu thiếu.
if ! command -v cloudflared >/dev/null 2>&1 && [ ! -f ./cloudflared ]; then
  echo "ℹ️  Chưa có cloudflared → Web 2.0 chưa tự dò được máy này."
  echo "    Cài:  brew install cloudflared   (rồi chạy lại file này)"
fi

# 4) Cookie: nếu CHƯA set ENV → dùng browser-cookie3 (cần đăng nhập gemini.google.com trên Chrome).
if [ -z "$GEMINI_1PSID" ]; then
  echo "ℹ️  Dùng cookie từ trình duyệt → HÃY đăng nhập gemini.google.com trên Chrome trước."
  echo "    (Hoặc set ENV GEMINI_1PSID=... để dùng cookie cố định.)"
fi

echo "▶ Khởi động…"
python serve.py
