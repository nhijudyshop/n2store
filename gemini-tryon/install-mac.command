#!/bin/bash
# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — cài gemini-tryon chạy NỀN ẨN + TỰ BẬT khi đăng nhập (macOS LaunchAgent).
# Double-click 1 lần để cài. Sau đó sidecar tự chạy ẩn mỗi lần mở máy (không cửa sổ Terminal).
set -e
cd "$(dirname "$0")" || exit 1
HERE="$(pwd)"
LABEL="com.n2store.gemini-tryon"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT="${PORT:-8131}"

echo "════════════════════════════════════════════════════════════"
echo "  Cài gemini-tryon — chạy NỀN ẨN + TỰ BẬT khi mở máy (macOS)"
echo "════════════════════════════════════════════════════════════"

# 1) venv + thư viện (idempotent)
if [ ! -d ".venv" ]; then
  echo "▶ Tạo môi trường Python (.venv)…"
  python3 -m venv .venv || { echo "❌ Cần Python 3.10+ (brew install python)"; exit 1; }
fi
echo "▶ Cài/cập nhật thư viện…"
./.venv/bin/python -m pip install -q --upgrade pip >/dev/null 2>&1 || true
./.venv/bin/python -m pip install -q -r requirements.txt || { echo "❌ Cài thư viện lỗi"; exit 1; }

# 2) cloudflared (cho tunnel) — nhắc nếu thiếu
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ℹ️  Chưa có cloudflared → Web 2.0 chưa tự dò máy. Cài:  brew install cloudflared"
fi

# 3) Viết LaunchAgent — RunAtLoad + KeepAlive, chạy bằng python venv, log ra file (KHÔNG cửa sổ).
#    PATH thêm brew (/opt/homebrew/bin + /usr/local/bin) để serve.py tìm thấy cloudflared.
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$HERE/.venv/bin/python</string>
    <string>$HERE/serve.py</string>
  </array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HERE/gemini-tryon.log</string>
  <key>StandardErrorPath</key><string>$HERE/gemini-tryon.log</string>
</dict></plist>
PLIST

# 4) (Re)load LaunchAgent → chạy ngay + tự bật mỗi lần đăng nhập.
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ""
echo "✅ Đã cài. Sidecar chạy NỀN ẨN (cổng $PORT) + TỰ BẬT mỗi khi đăng nhập máy."
echo "   • Dán cookie nhiều account Google:  http://localhost:$PORT/"
echo "   • Log:  $HERE/gemini-tryon.log"
echo "   • Gỡ:   double-click uninstall-mac.command"
echo ""
sleep 2
open "http://localhost:$PORT/" 2>/dev/null || true
