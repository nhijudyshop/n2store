#!/bin/bash
# #Note: WEB2.0 — khởi động hyperframes-render trên Mac (double-click).
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Cần Node 22+ (brew install node)"; exit 1; }
command -v ffmpeg >/dev/null || echo "⚠️  Thiếu ffmpeg → brew install ffmpeg"
command -v cloudflared >/dev/null || echo "⚠️  Thiếu cloudflared → brew install cloudflared"
[ -d node_modules ] || npm install
node server.js
