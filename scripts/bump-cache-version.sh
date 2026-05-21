#!/usr/bin/env bash
# Bump cache-busting `?v=...` query string on local <script src="js/..."> and
# <link rel="stylesheet" href="css/..."> in an HTML file (or a folder). Run
# after deploying JS/CSS changes so user browsers re-fetch instead of running
# stale cached code.
#
# Usage:
#   bash scripts/bump-cache-version.sh <html-file-or-folder> [version]
#
# Example:
#   bash scripts/bump-cache-version.sh inventory-tracking/index.html
#   bash scripts/bump-cache-version.sh native-orders/index.html 20260521b
#
# - If version arg omitted, auto-picks `YYYYMMDD` + letter (a,b,c,...)
#   higher than any existing same-day version found in the target file(s).
# - Only local refs (relative paths to .js or .css) are bumped — external
#   URLs (http://, https://, //cdn...) left untouched.

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <html-file-or-folder> [version]" >&2
    exit 64
fi

TARGET="$1"
VERSION="${2:-}"

if [[ ! -e "$TARGET" ]]; then
    echo "ERROR: $TARGET does not exist" >&2
    exit 1
fi

# Auto-pick version if not provided
if [[ -z "$VERSION" ]]; then
    TODAY=$(date +%Y%m%d)

    if [[ -d "$TARGET" ]]; then
        SCAN_FILES=$(find "$TARGET" -maxdepth 3 -name "*.html" -type f)
    else
        SCAN_FILES="$TARGET"
    fi

    HIGHEST=$(grep -hoE "\?v=${TODAY}[a-z]" $SCAN_FILES 2>/dev/null |
        sed -E "s/.*${TODAY}//" | sort -u | tail -1 || true)

    if [[ -z "$HIGHEST" ]]; then
        VERSION="${TODAY}a"
    else
        ASCII=$(printf '%d' "'$HIGHEST")
        NEXT=$((ASCII + 1))
        if (( NEXT > 122 )); then
            # Past 'z' — wrap and add date suffix
            VERSION="${TODAY}-aa"
        else
            NEXT_LETTER=$(printf "\\$(printf '%03o' "$NEXT")")
            VERSION="${TODAY}${NEXT_LETTER}"
        fi
    fi
fi

if [[ ! "$VERSION" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "ERROR: invalid version '$VERSION' (allowed chars: a-z 0-9 _ -)" >&2
    exit 2
fi

bump_one_file() {
    local file="$1" version="$2"
    [[ -f "$file" ]] || return 0

    # Match src="..." or href="..." pointing to a local .js or .css file.
    # External URLs (https?://, //) are skipped. Strips any existing ?v=...
    # then appends the new version.
    perl -i -pe '
        my $v = $ENV{BUMP_VERSION};
        s{(\s(?:src|href)=")((?!https?://|//)[^"?]+\.(?:js|css))(?:\?v=[^"]*)?(")}
         {$1$2?v=$v$3}g
    ' "$file"
}

export BUMP_VERSION="$VERSION"

if [[ -d "$TARGET" ]]; then
    COUNT=0
    while IFS= read -r f; do
        bump_one_file "$f" "$VERSION"
        COUNT=$((COUNT + 1))
    done < <(find "$TARGET" -maxdepth 3 -name "*.html" -type f)
    echo "Bumped cache version to '$VERSION' across $COUNT HTML files in $TARGET"
else
    bump_one_file "$TARGET" "$VERSION"
    echo "Bumped cache version to '$VERSION' in $TARGET"
fi
