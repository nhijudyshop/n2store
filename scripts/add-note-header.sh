#!/bin/bash
# add-note-header.sh
# Thêm #Note header vào tất cả HTML và JS source files trong n2store.
# Idempotent: skip files đã có marker. Hỗ trợ --dry-run.
# Usage: bash scripts/add-note-header.sh [--dry-run]

set -euo pipefail

PROJECT_ROOT="/Users/mac/Desktop/n2store"
MARKER="#Note:"
DRY_RUN=false
MODIFIED_COUNT=0
SKIPPED_COUNT=0

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "[DRY RUN] No files will be modified."
    echo ""
fi

NOTE_CORE="Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes."

HTML_NOTE="<!-- #Note: ${NOTE_CORE} -->"
JS_NOTE="// #Note: ${NOTE_CORE}"

# ── HTML Files ──────────────────────────────────────────────

while IFS= read -r -d '' file; do
    if grep -q "$MARKER" "$file" 2>/dev/null; then
        ((SKIPPED_COUNT++))
        continue
    fi

    if [[ "$DRY_RUN" == true ]]; then
        echo "[HTML] Would modify: ${file#$PROJECT_ROOT/}"
        ((MODIFIED_COUNT++))
        continue
    fi

    {
        echo "$HTML_NOTE"
        cat "$file"
    } > "${file}.tmp" && mv "${file}.tmp" "$file"

    echo "[HTML] Modified: ${file#$PROJECT_ROOT/}"
    ((MODIFIED_COUNT++))

done < <(find "$PROJECT_ROOT" -name "*.html" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -path "*/_metadata/*" \
    -print0)

# ── JS Files ───────────────────────────────────────────────

while IFS= read -r -d '' file; do
    if grep -q "$MARKER" "$file" 2>/dev/null; then
        ((SKIPPED_COUNT++))
        continue
    fi

    if [[ "$DRY_RUN" == true ]]; then
        echo "[JS]   Would modify: ${file#$PROJECT_ROOT/}"
        ((MODIFIED_COUNT++))
        continue
    fi

    first_line=$(head -1 "$file")
    if [[ "$first_line" == "#!"* ]]; then
        {
            echo "$first_line"
            echo "$JS_NOTE"
            tail -n +2 "$file"
        } > "${file}.tmp" && mv "${file}.tmp" "$file"
    else
        {
            echo "$JS_NOTE"
            cat "$file"
        } > "${file}.tmp" && mv "${file}.tmp" "$file"
    fi

    echo "[JS]   Modified: ${file#$PROJECT_ROOT/}"
    ((MODIFIED_COUNT++))

done < <(find "$PROJECT_ROOT" -name "*.js" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -path "*/build/*" \
    -not -path "*/_metadata/*" \
    -not -path "*/pancake-extension/scripts/*" \
    -not -name "*.min.js" \
    -print0)

echo ""
echo "=== Summary ==="
echo "Modified: $MODIFIED_COUNT"
echo "Skipped (already had note): $SKIPPED_COUNT"
echo "Total processed: $((MODIFIED_COUNT + SKIPPED_COUNT))"
