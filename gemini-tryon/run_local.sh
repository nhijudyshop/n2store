#!/bin/bash
# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — launcher Linux/Mac (terminal) cho gemini-tryon.
cd "$(dirname "$0")" || exit 1
[ -d ".venv" ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q --upgrade pip >/dev/null 2>&1
pip install -q -r requirements.txt || exit 1
exec python serve.py
