#!/usr/bin/env bash
# #Note: WEB2.0 — Mac: NHẤP ĐÚP file này để chạy server giọng VieNeu + tunnel cho điện thoại.
cd "$(dirname "$0")"
echo "==============================================="
echo "   VieNeu — Server giọng (máy shop, macOS)"
echo "==============================================="
# cloudflared (cho điện thoại) — cài qua brew nếu thiếu
if ! command -v cloudflared >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "▶ Cài cloudflared (cho điện thoại)…"; brew install cloudflared || true
  else
    echo "⚠️  Chưa có Homebrew → điện thoại chưa dùng được. Cài: https://brew.sh rồi: brew install cloudflared"
  fi
fi
bash run_local.sh
echo; read -r -p "Đã dừng. Nhấn Enter để đóng."
