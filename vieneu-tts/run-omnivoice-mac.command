#!/bin/bash
# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — launcher engine OmniVoice trên máy Mac (1-click).
# Bấm đúp file này. Lần đầu tự tạo venv riêng (.venv-omnivoice) + cài torch (Apple Silicon) + omnivoice.
# Sau đó chạy server giọng OmniVoice (cổng 8123) + tunnel + tự báo danh registry.
set -e
cd "$(dirname "$0")"

export TTS_ENGINE=omnivoice
VENV=".venv-omnivoice"

if [ ! -d "$VENV" ]; then
  echo "▶ Lần đầu: tạo môi trường riêng cho OmniVoice (nặng vài GB, chờ một lát)…"
  python3 -m venv "$VENV"
  "./$VENV/bin/pip" install --upgrade pip
  # PyTorch cho Apple Silicon (MPS). Máy NVIDIA: sửa dòng dưới theo README OmniVoice.
  "./$VENV/bin/pip" install torch torchaudio
  "./$VENV/bin/pip" install -r requirements-omnivoice.txt
fi

# serve.py spawn uvicorn bằng chính python của venv này -> engine OmniVoice + TTS_ENGINE kế thừa.
exec "./$VENV/bin/python" serve.py
