#!/bin/bash
# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — gỡ gemini-tryon auto-start nền (macOS LaunchAgent).
cd "$(dirname "$0")" || exit 1
LABEL="com.n2store.gemini-tryon"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "▶ Dừng + gỡ gemini-tryon (auto-start nền)…"
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
# kill tiến trình còn sót (serve.py + cloudflared của thư mục này)
pkill -f "$(pwd)/serve.py" 2>/dev/null || true
echo "✅ Đã gỡ. Sidecar không còn tự bật khi mở máy."
echo "   (Thư mục + accounts.json vẫn giữ — xoá tay nếu muốn.)"
sleep 2
