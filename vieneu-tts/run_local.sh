#!/usr/bin/env bash
# #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — chạy VieNeu-TTS trên MÁY SHOP + tunnel cho điện thoại.
#
# Chạy server giọng VieNeu ngay trên máy này, mở 1 URL HTTPS công khai (cloudflared)
# để ĐIỆN THOẠI / máy khác dùng được. Cài ở NHIỀU MÁY: mỗi máy chạy script này,
# dán URL nó in ra vào ô "Server giọng VieNeu" trong trang Tạo video.
#
#   bash run_local.sh           # cổng 8123, tự mở tunnel nếu có cloudflared
#   PORT=9000 bash run_local.sh # đổi cổng
#   NO_TUNNEL=1 bash run_local.sh   # chỉ chạy local (dùng trên CHÍNH máy này)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8123}"
PY=./.venv/bin/python
PIP=./.venv/bin/pip

# 1) venv + deps (idempotent)
if [ ! -x "$PY" ]; then
  echo "▶ Tạo môi trường Python (lần đầu)…"
  python3 -m venv .venv
  $PIP install -q --upgrade pip
fi
if ! $PY -c 'import vieneu, fastapi, uvicorn' >/dev/null 2>&1; then
  echo "▶ Cài thư viện (lần đầu ~1-2 phút)…"
  $PIP install -q -r requirements.txt
fi

# 2) chạy service nền
echo "▶ Khởi động server giọng trên cổng $PORT… (lần đầu tải model ~595MB)"
$PY -m uvicorn app:app --host 0.0.0.0 --port "$PORT" > /tmp/vieneu-local.log 2>&1 &
SVC_PID=$!
trap 'echo; echo "⏹  Dừng server…"; kill $SVC_PID 2>/dev/null || true; [ -n "${TUN_PID:-}" ] && kill $TUN_PID 2>/dev/null || true; exit 0' INT TERM

# chờ health
for i in $(seq 1 40); do
  curl -s --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
echo "✅ Server local: http://localhost:$PORT  (dùng trên CHÍNH máy này)"

# 3) tunnel HTTPS cho điện thoại / máy khác
if [ "${NO_TUNNEL:-0}" = "1" ]; then
  echo "ℹ️  NO_TUNNEL=1 → bỏ qua tunnel. Điện thoại sẽ KHÔNG dùng được URL này."
else
  if command -v cloudflared >/dev/null 2>&1; then
    echo "▶ Mở tunnel HTTPS (cloudflared)…"
    cloudflared tunnel --url "http://localhost:$PORT" > /tmp/vieneu-tunnel.log 2>&1 &
    TUN_PID=$!
    URL=""
    for i in $(seq 1 30); do
      URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/vieneu-tunnel.log 2>/dev/null | head -1 || true)
      [ -n "$URL" ] && break
      sleep 1
    done
    if [ -n "$URL" ]; then
      echo
      echo "════════════════════════════════════════════════════════════════"
      echo "📱  URL DÙNG TRÊN ĐIỆN THOẠI (dán vào ô 'Server giọng VieNeu'):"
      echo "        $URL"
      echo "════════════════════════════════════════════════════════════════"
    else
      echo "⚠️  Chưa lấy được URL tunnel — xem /tmp/vieneu-tunnel.log"
    fi
  else
    echo "⚠️  Chưa có cloudflared → điện thoại chưa dùng được."
    echo "    Cài 1 lần:  brew install cloudflared    rồi chạy lại script."
    echo "    (Tạm thời dùng được trên CHÍNH máy này qua http://localhost:$PORT)"
  fi
fi

echo
echo "Đang chạy. Bấm Ctrl+C để dừng."
wait $SVC_PID
