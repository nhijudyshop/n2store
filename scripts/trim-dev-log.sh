#!/bin/bash
# trim-dev-log.sh
# Tự động xóa các entry trong docs/dev-log.md cũ hơn 7 ngày.
# Idempotent: chỉ trim khi có entry quá hạn. An toàn chạy nhiều lần.
# Usage: bash scripts/trim-dev-log.sh [--dry-run] [--days N]

set -euo pipefail

PROJECT_ROOT="/Users/mac/Desktop/n2store"
LOG_FILE="$PROJECT_ROOT/docs/dev-log.md"
DAYS=7
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --days) DAYS="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[[ -f "$LOG_FILE" ]] || { echo "[trim-dev-log] File not found: $LOG_FILE"; exit 0; }

# macOS date (BSD). Linux: date -d "$DAYS days ago" +%Y-%m-%d
CUTOFF=$(date -v-${DAYS}d +%Y-%m-%d 2>/dev/null || date -d "$DAYS days ago" +%Y-%m-%d)

# Tìm dòng đầu tiên `## YYYY-MM-DD` có date < CUTOFF
FIRST_OLD_LINE=$(awk -v cutoff="$CUTOFF" '
  /^## [0-9]{4}-[0-9]{2}-[0-9]{2}/ {
    d = $2
    if (d < cutoff) { print NR; exit }
  }
' "$LOG_FILE")

if [[ -z "$FIRST_OLD_LINE" ]]; then
  echo "[trim-dev-log] Không có entry nào cũ hơn $DAYS ngày (cutoff: $CUTOFF). Bỏ qua."
  exit 0
fi

# Tìm footer `<!--` để giữ lại phần hướng dẫn
FOOTER_LINE=$(grep -n '^<!--' "$LOG_FILE" | tail -1 | cut -d: -f1 || true)

if [[ -z "$FOOTER_LINE" ]]; then
  # Không có footer → xóa từ FIRST_OLD_LINE tới hết file (giữ dòng trước đó)
  END_DELETE='$'
else
  # Xóa từ FIRST_OLD_LINE tới dòng trước footer
  END_DELETE=$((FOOTER_LINE - 1))
fi

BEFORE_LINES=$(wc -l < "$LOG_FILE")

if $DRY_RUN; then
  echo "[trim-dev-log] DRY RUN"
  echo "  File: $LOG_FILE"
  echo "  Cutoff date: $CUTOFF ($DAYS days ago)"
  echo "  First old entry at line: $FIRST_OLD_LINE"
  echo "  Footer starts at line: ${FOOTER_LINE:-none}"
  echo "  Would delete lines: $FIRST_OLD_LINE to $END_DELETE"
  echo "  Current size: $BEFORE_LINES lines"
  exit 0
fi

# Backup trước khi xóa
BACKUP="/tmp/dev-log.md.bak.$(date +%Y%m%d-%H%M%S)"
cp "$LOG_FILE" "$BACKUP"

# Xóa in-place (BSD sed requires '' after -i)
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "${FIRST_OLD_LINE},${END_DELETE}d" "$LOG_FILE"
else
  sed -i "${FIRST_OLD_LINE},${END_DELETE}d" "$LOG_FILE"
fi

AFTER_LINES=$(wc -l < "$LOG_FILE")
REMOVED=$((BEFORE_LINES - AFTER_LINES))

echo "[trim-dev-log] ✅ Trimmed dev-log.md"
echo "  Cutoff: $CUTOFF ($DAYS days)"
echo "  Before: $BEFORE_LINES lines → After: $AFTER_LINES lines (removed $REMOVED)"
echo "  Backup: $BACKUP"
