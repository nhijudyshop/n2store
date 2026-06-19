#!/usr/bin/env bash
# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — smoke test server live-chat sau khi split server.js (12 module).
# =====================================================================
# smoke-live-chat-server.sh — SMOKE post-deploy cho server live-chat
# (folder live-chat/server/, deploy Render service `n2store-tpos-pancake`).
#
# DÙNG KHI NÀO: sau mỗi lần deploy Render service live-chat — đặc biệt sau
# refactor split server.js → 12 module (2026-06-19). Xác nhận server BOOT +
# routes wired + WS broker attach (chỉ chạy được trên server thật, không
# local vì cần node_modules + env + DB/Firebase/Pancake).
#
# CÁCH CHẠY:
#   bash scripts/smoke-live-chat-server.sh
#   bash scripts/smoke-live-chat-server.sh https://n2store-tpos-pancake.onrender.com
#   RELAY_SECRET=xxx bash scripts/smoke-live-chat-server.sh   # + test route gated
#
# RELAY_SECRET (tùy chọn): lấy từ serect_dont_push.txt (block relay) để test
# các route gated (/api/events, /api/status chi tiết). KHÔNG hardcode vào script.
#
# ⚠ Nếu chạy TRƯỚC khi deploy split → có thể 404 (deploy đang chạy code CŨ hơn
# repo). Chạy SAU khi Render deploy commit split (routes.js carry routes hiện tại).
# Render free-tier spin-down → request đầu cold-start 30-60s, thử lại.
# =====================================================================
set -u

BASE="${1:-https://n2store-tpos-pancake.onrender.com}"
PASS=0
FAIL=0

say() { printf '%s\n' "$*"; }
ok()  { PASS=$((PASS+1)); say "  ✅ $*"; }
bad() { FAIL=$((FAIL+1)); say "  ❌ $*"; }

# GET helper: prints HTTP code; body in $BODY
hit() {
    local path="$1"; shift
    BODY=$(curl -s -m 25 -w $'\n%{http_code}' "$@" "$BASE$path" 2>/dev/null)
    HTTP="${BODY##*$'\n'}"
    BODY="${BODY%$'\n'*}"
}

say "════════════════════════════════════════════════════════════"
say " Live-chat server smoke — $BASE"
say " (post-split server.js → relay/middleware/event-store/db/firebase-loader/"
say "  pancake-api/page-selection-db/pancake-client/client-manager/browser-broker/routes)"
say "════════════════════════════════════════════════════════════"

# 1) Server alive (cold-start Render có thể mất 30-60s lần đầu)
say "[1] GET /ping (server boot + Express up)"
hit /ping
if [ "$HTTP" = "200" ]; then ok "ping 200 — server booted, Express + routes wired"; else bad "ping HTTP=$HTTP (cold-start? thử lại sau 60s)"; fi

# 2) Health detailed (DB/Firebase init + client manager)
say "[2] GET /health/detailed (DB/Firebase/clients init)"
hit /health/detailed
if [ "$HTTP" = "200" ]; then
    ok "health 200"
    echo "$BODY" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log("     →",JSON.stringify({db:j.db??j.database,firebase:j.firebase,clients:j.clients??j.activeClients,uptime:j.uptime}).slice(0,200));}catch(e){console.log("     → (non-JSON body, OK nếu 200)");}})' 2>/dev/null
else bad "health HTTP=$HTTP"; fi

# 3) /api/status (ungated — client manager state)
say "[3] GET /api/status (client manager + event buffer wired)"
hit /api/status
if [ "$HTTP" = "200" ]; then ok "status 200 — routes.js + client-manager + event-store wired"; else bad "status HTTP=$HTTP"; fi

# 4) Relay-secret gated route (chỉ khi có RELAY_SECRET)
if [ -n "${RELAY_SECRET:-}" ]; then
    say "[4] GET /api/events (relay-secret middleware)"
    hit /api/events -H "x-relay-secret: $RELAY_SECRET"
    if [ "$HTTP" = "200" ]; then ok "events 200 — middleware.js requireRelaySecret OK"; else bad "events HTTP=$HTTP (sai secret? middleware lỗi?)"; fi
    say "[4b] GET /api/events KHÔNG secret → phải 401/403"
    hit /api/events
    if [ "$HTTP" = "401" ] || [ "$HTTP" = "403" ]; then ok "gated đúng (HTTP=$HTTP without secret)"; else bad "gate KHÔNG chặn (HTTP=$HTTP) — middleware relay-secret hỏng!"; fi
else
    say "[4] (bỏ qua route gated — set RELAY_SECRET=… để test /api/events + relay-secret guard)"
fi

say "────────────────────────────────────────────────────────────"
say " KẾT QUẢ: $PASS pass, $FAIL fail"
say ""
say " 👉 Kiểm thêm trên Render Dashboard logs (n2store-tpos-pancake) — boot phải có:"
say "    • '[STARTUP]' env validate (Firebase ok/disabled)"
say "    • DB pool + Firebase init (firebase-loader)"
say "    • Pancake WS client connect per account (pancake-client) — 'phx_join pages:<id>'"
say "    • httpServer listen + browser WS broker attach (browser-broker)"
say "    • autoConnect chạy sau listen (client-manager)"
say "    KHÔNG được có: 'is not a function' / 'undefined' / require MODULE_NOT_FOUND"
say " 👉 1 message Pancake WS thật chảy qua → storeEvent → forwardToFallback → SSE/browser."
say "════════════════════════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
