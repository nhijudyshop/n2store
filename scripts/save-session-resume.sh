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

# ---- ensure modified/staged files are committed (untracked files OK) ----
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "⚠  Có file modified/staged chưa commit. Commit hết trước khi tạo session resume." >&2
  echo "    (Untracked files không sao, chỉ cần commit hết tracked changes.)" >&2
  git status --short --untracked-files=no >&2
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

# ---- find previous resume to compute commit range + chain link ----
# Exclude file đang tạo (theo timestamp+sha) — chỉ tính các session đã commit từ trước
PREV_RESUME="$(ls -1 docs/sessions/2*-*.md 2>/dev/null | tail -1 || true)"
PREV_SHA7=""
PREV_TOKEN_FULL="INITIAL"
PREV_LINK="_(session đầu tiên — không có chain)_"
COMMIT_COUNT="?"
if [[ -n "$PREV_RESUME" ]]; then
  PREV_BASE="$(basename "$PREV_RESUME" .md)"      # e.g. 20260513-102128-4ab7812
  PREV_SHA7="${PREV_BASE##*-}"                    # 4ab7812
  PREV_TOKEN_FULL="RESUME:${PREV_BASE}"
  PREV_LINK="[\`${PREV_TOKEN_FULL}\`](./$(basename "$PREV_RESUME"))"
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
    "{{PREV_TOKEN_FULL}}": """$PREV_TOKEN_FULL""",
    "{{PREV_LINK}}":       """$PREV_LINK""",
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

# ---- generate per-folder LATEST snapshots ----
# Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc
# file `docs/sessions/latest/<folder>.md` của module đang làm là có đủ context.
# Hook tự ghi đè sau mỗi commit chạm folder đó — không edit thủ công.
FULL_TOKEN="RESUME:${TIMESTAMP_TOKEN}-${SHA7}"
mkdir -p docs/sessions/latest

python3 - <<PYEOF
import subprocess, pathlib
from datetime import datetime

OUT_FILE = """$OUT_FILE"""
SHA7 = """$SHA7"""
PREV_SHA7 = """${PREV_SHA7:-}"""
TIMESTAMP_HUMAN = """$TIMESTAMP_HUMAN"""
FULL_TOKEN = """$FULL_TOKEN"""
SUMMARY = """$SUMMARY"""

if PREV_SHA7:
    files_cmd = ["git", "diff", "--name-only", f"{PREV_SHA7}..HEAD"]
else:
    files_cmd = ["git", "diff", "--name-only", "HEAD~1..HEAD"]

files = [f for f in subprocess.run(files_cmd, capture_output=True, text=True).stdout.strip().split("\n") if f.strip()]

# Bỏ qua chính session file (sẽ commit cùng) khỏi LATEST snapshot
files = [f for f in files if not f.startswith("docs/sessions/")]

# Group theo top-level folder. File ở root → "_root".
folders = {}
for f in files:
    folder = f.split("/")[0] if "/" in f else "_root"
    folders.setdefault(folder, []).append(f)

subj = subprocess.run(["git", "log", "-1", "--pretty=%s", "HEAD"], capture_output=True, text=True).stdout.strip()
session_filename = pathlib.Path(OUT_FILE).name
latest_dir = pathlib.Path("docs/sessions/latest")
latest_dir.mkdir(parents=True, exist_ok=True)

for folder, fl in folders.items():
    if folder == "_root":
        root_files = [f for f in fl if "/" not in f]
        log_cmd = ["git", "log", "-5", "--pretty=%h|%s|%ad", "--date=short", "HEAD", "--"] + root_files
    else:
        log_cmd = ["git", "log", "-5", "--pretty=%h|%s|%ad", "--date=short", "HEAD", "--", f"{folder}/"]
    log_out = subprocess.run(log_cmd, capture_output=True, text=True).stdout.strip()
    commits_md = ""
    for line in log_out.split("\n"):
        if not line.strip():
            continue
        parts = line.split("|", 2)
        if len(parts) == 3:
            h, s, d = parts
            commits_md += f"- \`{h}\` {s} _({d})_\n"
    if not commits_md:
        commits_md = "_(no history)_\n"

    files_md = "\n".join(f"- \`{f}\`" for f in fl) or "_(none)_"
    safe_folder = folder.replace("/", "_")

    body = f"""# Latest Snapshot — \`{folder}/\`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: \`{FULL_TOKEN}\`
**Session file**: [\`./{session_filename}\`](../{session_filename})
**Commit**: \`{SHA7}\` — {subj}
**Last updated**: {TIMESTAMP_HUMAN}
**Summary**: {SUMMARY}

## Files changed in this commit (\`{folder}/\`)
{files_md}

## Last 5 commits touching \`{folder}/\`
{commits_md}
---
**Để tiếp tục context trong session mới:**
1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → \`git show <sha>\` theo list commit trên.
3. Hoặc paste token \`{FULL_TOKEN}\` cho Claude walk chain theo CLAUDE.md protocol.
"""
    (latest_dir / f"{safe_folder}.md").write_text(body, encoding="utf-8")
    print(f"  📌 latest/{safe_folder}.md")

# Index _all.md — list tất cả folder snapshots hiện có
all_md = f"""# Latest Snapshot — All Folders

> Index các folder snapshot. Mỗi snapshot tự động ghi đè sau commit chạm folder đó.
> Khi session cũ chết, mở file này → tìm folder đang làm → đọc snapshot.

**Latest commit**: \`{SHA7}\` — {subj}
**Last updated**: {TIMESTAMP_HUMAN}
**Latest session**: [\`{FULL_TOKEN}\`](../{session_filename})
**Summary**: {SUMMARY}

## Folders affected in this commit
"""
if folders:
    for folder in sorted(folders.keys()):
        safe_folder = folder.replace("/", "_")
        all_md += f"- [\`{folder}/\`](./{safe_folder}.md) — {len(folders[folder])} file(s)\n"
else:
    all_md += "_(no folders affected — chỉ commit session file)_\n"

all_md += "\n## All folder snapshots\n"
for p in sorted(latest_dir.glob("*.md")):
    if p.name == "_all.md":
        continue
    folder_name = p.stem
    mtime = datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    all_md += f"- [\`{folder_name}/\`](./{p.name}) — updated {mtime}\n"

(latest_dir / "_all.md").write_text(all_md, encoding="utf-8")
print(f"  📌 latest/_all.md")
PYEOF

# ---- commit + push the resume file ----
# Full RESUME token trong commit message (subject + body) — git log hiển thị
# nguyên token để user copy paste khi cần.
git add "$OUT_FILE" docs/sessions/latest/
git commit -m "chore(session): ${FULL_TOKEN}" -m "Paste token \`${FULL_TOKEN}\` vào chat mới để Claude tiếp tục từ session này.
Source: parent commit ${SHA7} • Branch: ${BRANCH}
File: ${OUT_FILE}" >/dev/null

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
