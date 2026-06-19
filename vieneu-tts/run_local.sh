#!/usr/bin/env bash
# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — chạy VieNeu trên MÁY SHOP (terminal). Logic chính ở serve.py.
#
#   bash run_local.sh                 # server + tunnel + tự báo danh (điện thoại dùng được)
#   NO_TUNNEL=1 bash run_local.sh     # chỉ dùng trên CHÍNH máy này
#   VIENEU_NAME="Máy quầy" bash run_local.sh   # đặt tên máy hiện trên trang
set -euo pipefail
cd "$(dirname "$0")"
PY=./.venv/bin/python
PIP=./.venv/bin/pip

if [ ! -x "$PY" ]; then
  echo "▶ Tạo môi trường Python (lần đầu)…"
  python3 -m venv .venv
  $PIP install -q --upgrade pip
fi
if ! $PY -c 'import vieneu, fastapi, uvicorn' >/dev/null 2>&1; then
  echo "▶ Cài thư viện (lần đầu ~1-2 phút)…"
  $PIP install -q -r requirements.txt
fi
exec $PY serve.py
