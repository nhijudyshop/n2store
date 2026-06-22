#!/bin/bash
# Bulk seed 108 biến thể vào Kho Biến Thể Web 2.0 từ file bienthe.txt.
# Group rule:
#   - Bắt đầu "Màu" → group "Màu"
#   - Bắt đầu "Size" → group "Size"
#   - Khác → null
# Sort order = line number trong file (giữ thứ tự gốc).
#
# Usage: bash scripts/seed-web2-variants.sh [<input-file>]

set -euo pipefail

INPUT="${1:-/Users/mac/Desktop/n2store/bienthe.txt}"
API="https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-variants"

[[ -f "$INPUT" ]] || { echo "Input file not found: $INPUT" >&2; exit 1; }

# WEB2_AUTH_ENFORCE=1 (từ 2026-06-13) → POST cần admin token. Truyền qua env
# WEB2_TOKEN (KHÔNG hardcode). Lấy: POST /api/web2-users/login → token.
AUTH_HEADER=()
if [[ -n "${WEB2_TOKEN:-}" ]]; then
    AUTH_HEADER=(-H "x-web2-token: $WEB2_TOKEN")
fi

total=0
ok=0
dup=0
fail=0
order=0

while IFS= read -r raw; do
    line="${raw#"${raw%%[![:space:]]*}"}"  # ltrim
    line="${line%"${line##*[![:space:]]}"}" # rtrim
    [[ -z "$line" ]] && continue
    order=$((order + 1))
    total=$((total + 1))

    group=""
    if [[ "$line" == "Size "* ]] || [[ "$line" == "Size" ]]; then
        group="Size"
    elif [[ "$line" == "Màu "* ]] || [[ "$line" == "Màu" ]]; then
        group="Màu"
    fi

    body=$(jq -n --arg v "$line" --arg g "$group" --argjson o "$order" \
        '{value: $v, groupName: ($g | select(length>0) // null), sortOrder: $o, createdBy: "seed-script"}')

    resp=$(curl -s -o /tmp/seed-variants-resp.json -w "%{http_code}" \
        -X POST -H "Content-Type: application/json" "${AUTH_HEADER[@]}" \
        -d "$body" "$API")

    case "$resp" in
        200|201)
            ok=$((ok + 1))
            ;;
        409)
            dup=$((dup + 1))
            echo "  ⚠ Đã tồn tại: $line" >&2
            ;;
        *)
            fail=$((fail + 1))
            echo "  ✗ Fail ($resp): $line — $(cat /tmp/seed-variants-resp.json)" >&2
            ;;
    esac
done < "$INPUT"

echo ""
echo "Total processed: $total"
echo "  ✓ Created:    $ok"
echo "  ⚠ Duplicate:  $dup"
echo "  ✗ Failed:     $fail"
