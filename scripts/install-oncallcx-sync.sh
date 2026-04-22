#!/usr/bin/env bash
# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
#
# Install OnCallCX sync daemon as a macOS launchd agent (runs every 5 min).
#
# Usage:
#   bash scripts/install-oncallcx-sync.sh         # install + start
#   bash scripts/install-oncallcx-sync.sh uninstall
#   bash scripts/install-oncallcx-sync.sh status

set -euo pipefail

LABEL="com.n2store.oncallcx-sync"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
SCRIPT_PATH="$REPO_ROOT/scripts/oncallcx-sync-daemon.js"
NODE_BIN="$(command -v node || echo /usr/local/bin/node)"
LOG_DIR="$HOME/.n2store-oncallcx-sync"

action="${1:-install}"

if [[ "$action" == "uninstall" ]]; then
    echo "[uninstall] Stopping $LABEL"
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm -f "$PLIST_PATH"
    echo "[uninstall] Done. Logs kept at $LOG_DIR"
    exit 0
fi

if [[ "$action" == "status" ]]; then
    echo "=== launchctl list ==="
    launchctl list | grep "$LABEL" || echo "(not loaded)"
    echo ""
    echo "=== Recent logs ==="
    tail -30 "$LOG_DIR/sync.log" 2>/dev/null || echo "(no log yet)"
    echo ""
    echo "=== State ==="
    cat "$LOG_DIR/state.json" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"synced: {len(d['syncedRowKeys'])}, lastSyncAt: {d.get('lastSyncAt', 0)}\")" 2>/dev/null || echo "(no state)"
    exit 0
fi

# Install
if [[ ! -f "$SCRIPT_PATH" ]]; then
    echo "[error] Script not found: $SCRIPT_PATH"
    exit 1
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
    echo "[error] node binary not found; install Node.js first"
    exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$SCRIPT_PATH</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$REPO_ROOT</string>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/launchd.out</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/launchd.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>MAX</key>
        <string>25</string>
    </dict>
</dict>
</plist>
EOF

# Unload if already loaded (refresh config)
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "[ok] Installed $LABEL"
echo "     Plist: $PLIST_PATH"
echo "     Runs every 5 min, logs to $LOG_DIR/"
echo ""
echo "Commands:"
echo "  bash $0 status      # check status + logs"
echo "  bash $0 uninstall   # remove daemon"
echo ""
echo "Force run now (one-shot):"
echo "  node $SCRIPT_PATH"
