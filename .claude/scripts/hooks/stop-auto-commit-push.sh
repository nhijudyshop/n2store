#!/usr/bin/env bash
# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
#
# Stop hook: auto commit + push tại cuối session, sau đó auto-gen session resume token.
#
# Được gọi từ .claude/settings.local.json `hooks.Stop[0]`.
# Output stdout (token + log) sẽ hiển thị cho user/Claude ở cuối turn.
#
# Quy ước token: xem docs/sessions/README.md

set -u  # nhưng KHÔNG set -e — Stop hook không được fail toàn bộ khi 1 bước gặp issue

cd /Users/mac/Desktop/n2store || exit 0

# ---- 1. Commit & push nếu working tree dirty (tracked changes) ----
if [[ -n "$(git diff HEAD --name-only 2>/dev/null)" ]]; then
  git add -u >/dev/null 2>&1
  git commit -m "auto: session update" >/dev/null 2>&1
fi

# ---- 2. Sync với remote ----
git pull --rebase --autostash origin main >/dev/null 2>&1
git push origin main >/dev/null 2>&1
PUSH_RC=$?

if [[ $PUSH_RC -ne 0 ]]; then
  echo "⚠ [stop-hook] git push failed (rc=$PUSH_RC) — skip session resume"
  exit 0
fi

# ---- 3. Quyết định có cần gen session resume không ----
CURRENT_SHA="$(git rev-parse --short=7 HEAD 2>/dev/null || echo "")"
LAST_MSG="$(git log -1 --pretty=%s 2>/dev/null || echo "")"

# Skip nếu commit cuối CHÍNH LÀ session resume (tránh infinite loop)
if [[ "$LAST_MSG" == chore\(session\):* ]]; then
  exit 0
fi

# Skip nếu HEAD đã có session resume file (idempotent)
if compgen -G "docs/sessions/*-${CURRENT_SHA}.md" >/dev/null 2>&1; then
  exit 0
fi

# Skip nếu commit cuối không phải code thật (vd merge commit hoặc empty)
if [[ -z "$LAST_MSG" || "$LAST_MSG" == "Merge "* ]]; then
  exit 0
fi

# ---- 4. Gen resume — dùng subject của commit cuối làm summary ----
SUMMARY="$LAST_MSG"
# Cắt summary nếu quá dài (>120 ký tự)
if [[ ${#SUMMARY} -gt 120 ]]; then
  SUMMARY="${SUMMARY:0:117}..."
fi

RESUME_OUTPUT="$(bash scripts/save-session-resume.sh "$SUMMARY" 2>&1)"
RESUME_RC=$?

if [[ $RESUME_RC -ne 0 ]]; then
  echo "⚠ [stop-hook] save-session-resume.sh failed (rc=$RESUME_RC):"
  echo "$RESUME_OUTPUT" | head -10
  exit 0
fi

# ---- 5. Extract token và in cho user ----
TOKEN="$(echo "$RESUME_OUTPUT" | grep -oE 'RESUME:[0-9]{8}-[0-9]{6}-[a-f0-9]{7}' | head -1)"
SESSION_FILE="$(echo "$RESUME_OUTPUT" | grep -oE 'docs/sessions/[0-9]{8}-[0-9]{6}-[a-f0-9]{7}\.md' | head -1)"

if [[ -n "$TOKEN" ]]; then
  echo ""
  echo "🔗 Resume token (paste vào chat mới để tiếp tục):"
  echo "    $TOKEN"
  [[ -n "$SESSION_FILE" ]] && echo "📄 $SESSION_FILE"
fi

exit 0
