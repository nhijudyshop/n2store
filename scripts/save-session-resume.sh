#!/usr/bin/env bash
# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
#
# save-session-resume.sh — Tạo file session resume sau khi commit+push.
#
# Usage:
#   bash scripts/save-session-resume.sh "<one-line summary>"
#   bash scripts/save-session-resume.sh "<summary>" --skip-push
#
# Workflow:
#   1. Verify working tree clean (đã commit hết)
#   2. Lấy SHA7 của HEAD, timestamp local
#   3. Sinh file docs/sessions/<TIMESTAMP>-<SHA7>.md từ template + auto-fill
#   4. Commit + push file đó (trừ khi --skip-push)
#   5. In token RESUME:<TIMESTAMP>-<SHA7> ra stdout
#
# File template để mở chỉnh tay: docs/sessions/_TEMPLATE.md
# Quy ước đầy đủ: docs/sessions/README.md

set -euo pipefail

# ---- args ----
SUMMARY="${1:-}"
SKIP_PUSH="false"
[[ "${2:-}" == "--skip-push" ]] && SKIP_PUSH="true"

if [[ -z "$SUMMARY" ]]; then
  echo "❌ Missing summary." >&2
  echo "Usage: bash scripts/save-session-resume.sh \"<one-line summary>\" [--skip-push]" >&2
  exit 1
fi

# ---- repo root ----
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "❌ Not inside a git repo." >&2
  exit 1
fi
cd "$ROOT"

# ---- ensure clean tree (commits done) ----
if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠  Working tree not clean. Commit hết trước khi tạo session resume." >&2
  git status --short >&2
  exit 1
fi

# ---- compute identifiers ----
SHA7="$(git rev-parse --short=7 HEAD)"
SHA_FULL="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
AUTHOR="$(git log -1 --pretty='%an <%ae>')"
TIMESTAMP_TOKEN="$(date +%Y%m%d-%H%M%S)"
TIMESTAMP_HUMAN="$(date '+%Y-%m-%d %H:%M:%S %Z')"
TIMESTAMP_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---- find previous resume to compute commit range ----
PREV_RESUME="$(ls -1 docs/sessions/2*-*.md 2>/dev/null | tail -1 || true)"
PREV_SHA7=""
COMMIT_COUNT="?"
if [[ -n "$PREV_RESUME" ]]; then
  PREV_SHA7="$(basename "$PREV_RESUME" .md | awk -F- '{print $NF}')"
  if git cat-file -e "$PREV_SHA7" 2>/dev/null; then
    COMMIT_COUNT="$(git rev-list --count "${PREV_SHA7}..HEAD" 2>/dev/null || echo "?")"
  else
    PREV_SHA7=""
  fi
fi

# ---- files modified in range ----
if [[ -n "$PREV_SHA7" ]]; then
  FILES_LIST="$(git diff --name-only "${PREV_SHA7}..HEAD" | sed 's|^|- `|; s|$|` — _(điền lý do)_|' || echo "- _(no files)_")"
else
  FILES_LIST="$(git diff --name-only HEAD~1..HEAD 2>/dev/null | sed 's|^|- `|; s|$|` — _(điền lý do)_|' || echo "- _(first session)_")"
fi
[[ -z "$FILES_LIST" ]] && FILES_LIST="- _(no files in range)_"

# ---- output path ----
OUT_FILE="docs/sessions/${TIMESTAMP_TOKEN}-${SHA7}.md"
mkdir -p docs/sessions

# ---- render template ----
TEMPLATE="docs/sessions/_TEMPLATE.md"
if [[ ! -f "$TEMPLATE" ]]; then
  echo "❌ Missing template: $TEMPLATE" >&2
  exit 1
fi

# Use python for safe multi-line substitution (avoid sed gotchas)
python3 - "$TEMPLATE" "$OUT_FILE" <<PYEOF
import sys, pathlib
src, dst = sys.argv[1], sys.argv[2]
content = pathlib.Path(src).read_text(encoding="utf-8")
replacements = {
    "{{TIMESTAMP_HUMAN}}": """$TIMESTAMP_HUMAN""",
    "{{TIMESTAMP_TOKEN}}": """$TIMESTAMP_TOKEN""",
    "{{TIMESTAMP_ISO}}":   """$TIMESTAMP_ISO""",
    "{{SHA7}}":            """$SHA7""",
    "{{SHA_FULL}}":        """$SHA_FULL""",
    "{{PREV_SHA7}}":       """${PREV_SHA7:-INITIAL}""",
    "{{COMMIT_COUNT}}":    """$COMMIT_COUNT""",
    "{{BRANCH}}":          """$BRANCH""",
    "{{AUTHOR}}":          """$AUTHOR""",
    "{{ONE_LINE_SUMMARY}}":"""$SUMMARY""",
    "{{FILES_LIST}}":      """$FILES_LIST""",
}
for k, v in replacements.items():
    content = content.replace(k, v)
pathlib.Path(dst).write_text(content, encoding="utf-8")
print(f"✅ Wrote {dst}")
PYEOF

# ---- commit + push the resume file ----
git add "$OUT_FILE"
git commit -m "chore(session): resume token ${SHA7}" >/dev/null

if [[ "$SKIP_PUSH" == "false" ]]; then
  git push >/dev/null 2>&1 && echo "📤 Pushed to $(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo origin)"
fi

# ---- print token ----
echo ""
echo "🔗 Token (paste vào chat mới để Claude tiếp tục):"
echo "    RESUME:${TIMESTAMP_TOKEN}-${SHA7}"
echo ""
echo "📄 File: $OUT_FILE"
echo "✏  Mở file lên điền chi tiết các mục Key Decisions / Next Steps / Context Pointers."
