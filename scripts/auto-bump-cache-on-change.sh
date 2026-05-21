#!/usr/bin/env bash
# Auto-bump cache version in any page that has dirty JS/CSS changes.
#
# Strategy:
# 1. List changed files (staged + unstaged, vs HEAD).
# 2. Group by top-level folder (the "page").
# 3. For each folder with changed *.js / *.css under js/ or css/, look for
#    that folder's index.html — if the HTML uses the `?v=YYYYMMDD<letter>`
#    cache-bust convention on at least one of its local refs, run
#    bump-cache-version.sh on it.
#
# Designed to be called from stop-auto-commit-push.sh just BEFORE `git add -u`
# so the bumped HTML gets included in the same auto-commit. Idempotent — safe
# to re-run.
#
# Usage:
#   bash scripts/auto-bump-cache-on-change.sh
#
# Output: one line per bumped page (or nothing if no bumps needed).

set -u

cd "$(dirname "$0")/.." || exit 0
ROOT="$PWD"
BUMP_SCRIPT="$ROOT/scripts/bump-cache-version.sh"

if [[ ! -x "$BUMP_SCRIPT" ]]; then
    exit 0
fi

# Collect changed files relative to HEAD (both staged + unstaged).
CHANGED=$(git diff HEAD --name-only 2>/dev/null; git diff --name-only --cached 2>/dev/null)
[[ -z "$CHANGED" ]] && exit 0

# Top-level folders of changed JS/CSS files (de-duplicated)
PAGES=$(echo "$CHANGED" |
    grep -E '^[^/]+/(js|css)/.+\.(js|css)$' |
    awk -F'/' '{print $1}' |
    sort -u)

[[ -z "$PAGES" ]] && exit 0

for page in $PAGES; do
    html="$ROOT/$page/index.html"
    [[ -f "$html" ]] || continue

    # Only bump if this page already uses the ?v=YYYYMMDD convention
    # (avoids touching pages that don't opt into cache-busting).
    if grep -qE '\.(js|css)\?v=[0-9]{8}' "$html"; then
        bash "$BUMP_SCRIPT" "$html" >&2
    fi
done
