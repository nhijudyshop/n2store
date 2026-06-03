#!/usr/bin/env bash
# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
#
# Auto-publish Chrome Extension lên Chrome Web Store khi version trong manifest.json thay đổi.
#
# Idempotent: chạy nhiều lần an toàn, no-op nếu version chưa đổi.
# Silent-exit nếu chưa setup CWS credentials → KHÔNG fail stop hook.
#
# Usage:
#   bash scripts/auto-publish-extension.sh           # auto (chỉ publish nếu version đổi)
#   bash scripts/auto-publish-extension.sh --force   # force publish kể cả version chưa đổi
#   bash scripts/auto-publish-extension.sh --dry-run # check + zip, không upload
#
# Yêu cầu credentials trong serect_dont_push.txt:
#   CWS_CLIENT_ID: <oauth client id>
#   CWS_CLIENT_SECRET: <oauth client secret>
#   CWS_REFRESH_TOKEN: <oauth refresh token>
#   CWS_EXTENSION_ID: dgcicifdlgamleagjangkbbcdgbhmfea (đã hardcode default)
#
# Hướng dẫn lấy credentials: docs/extension-auto-publish.md

set -u

cd /Users/mac/Desktop/n2store || exit 0

ARG_MODE="${1:-auto}"
EXTENSION_DIR="n2store-extension"
MANIFEST="$EXTENSION_DIR/manifest.json"
VERSION_TRACK_FILE=".extension-last-published-version"
SECRETS_FILE="/Users/mac/Desktop/n2store/serect_dont_push.txt"
DEFAULT_EXT_ID="dgcicifdlgamleagjangkbbcdgbhmfea"
STORE_URL_BASE="https://chromewebstore.google.com/detail"

# ---- Helpers ----
say() { echo "[publish-ext] $*"; }
fail_silent() { say "skip: $1"; exit 0; }
notify_mac() {
  local title="$1"
  local body="$2"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$body\" with title \"$title\"" 2>/dev/null || true
  fi
}

# ---- 0. Sanity checks ----
[[ -f "$MANIFEST" ]] || fail_silent "manifest not found: $MANIFEST"
[[ -f "$SECRETS_FILE" ]] || fail_silent "secrets file not found"

# ---- 1. Read current version from manifest.json ----
CURRENT_VERSION="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$MANIFEST" | head -1 | sed -E 's/.*"([0-9.]+)".*/\1/')"
if [[ -z "$CURRENT_VERSION" ]]; then
  say "ERROR: cannot parse version from $MANIFEST"
  exit 1
fi

# ---- 2. Read last published version ----
LAST_VERSION=""
[[ -f "$VERSION_TRACK_FILE" ]] && LAST_VERSION="$(cat "$VERSION_TRACK_FILE" 2>/dev/null | tr -d '[:space:]')"

# ---- 3. Decide: publish needed? ----
if [[ "$ARG_MODE" != "--force" && "$ARG_MODE" != "--dry-run" ]]; then
  if [[ "$CURRENT_VERSION" == "$LAST_VERSION" ]]; then
    # Version unchanged — silent exit, this is the normal no-op case
    exit 0
  fi
fi

say "version: ${LAST_VERSION:-<none>} → $CURRENT_VERSION"

# ---- 4. Load CWS credentials ----
load_secret() {
  local key="$1"
  # Match patterns: "KEY: value" or "KEY=value" or "<num>/KEY: value"
  grep -oE "(^|/)${key}[[:space:]]*[:=][[:space:]]*[^[:space:]]+" "$SECRETS_FILE" 2>/dev/null \
    | head -1 \
    | sed -E "s/.*${key}[[:space:]]*[:=][[:space:]]*//" \
    | tr -d '"' \
    | tr -d "'"
}

CWS_CLIENT_ID="$(load_secret CWS_CLIENT_ID)"
CWS_CLIENT_SECRET="$(load_secret CWS_CLIENT_SECRET)"
CWS_REFRESH_TOKEN="$(load_secret CWS_REFRESH_TOKEN)"
CWS_EXTENSION_ID="$(load_secret CWS_EXTENSION_ID)"
[[ -z "$CWS_EXTENSION_ID" ]] && CWS_EXTENSION_ID="$DEFAULT_EXT_ID"

if [[ -z "$CWS_CLIENT_ID" || -z "$CWS_CLIENT_SECRET" || -z "$CWS_REFRESH_TOKEN" ]]; then
  # Use a "warned recently" cooldown file to avoid spamming the warning on every commit
  # while still ensuring the first credentialed run actually publishes.
  COOLDOWN_FILE="/tmp/n2store-cws-warn-cooldown"
  NOW=$(date +%s)
  LAST_WARN=0
  [[ -f "$COOLDOWN_FILE" ]] && LAST_WARN=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  # Warn at most once per hour
  if (( NOW - LAST_WARN > 3600 )); then
    say "⚠ CWS credentials chưa setup trong $SECRETS_FILE"
    say "  Cần: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN"
    say "  Hướng dẫn lấy: docs/extension-auto-publish.md"
    echo "$NOW" > "$COOLDOWN_FILE"
    notify_mac "⚠ Extension publish skipped" "v$CURRENT_VERSION ready but CWS credentials missing"
  fi
  # DON'T save version tracker — when user adds credentials, first run should publish.
  exit 0
fi

# ---- 5. Zip extension folder ----
ZIP_FILE="/tmp/n2store-extension-v${CURRENT_VERSION}.zip"
rm -f "$ZIP_FILE"

say "zipping $EXTENSION_DIR → $ZIP_FILE"
(
  cd "$EXTENSION_DIR" || exit 1
  zip -rq "$ZIP_FILE" . \
    -x '*.DS_Store' \
    -x '__MACOSX/*' \
    -x '*.zip' \
    -x '.git/*' \
    -x 'node_modules/*' \
    -x 'STORE-LISTING.md' \
    -x 'store-assets.html' \
    -x '_metadata/*'
)
ZIP_RC=$?
if [[ $ZIP_RC -ne 0 || ! -f "$ZIP_FILE" ]]; then
  say "ERROR: zip failed (rc=$ZIP_RC)"
  exit 1
fi

ZIP_SIZE_KB=$(( $(wc -c < "$ZIP_FILE") / 1024 ))
say "zip ready: ${ZIP_SIZE_KB} KB"

if [[ "$ARG_MODE" == "--dry-run" ]]; then
  say "DRY RUN — would upload+publish v$CURRENT_VERSION"
  say "zip kept at: $ZIP_FILE"
  exit 0
fi

# ---- 6. Get OAuth access token ----
say "exchanging refresh_token → access_token..."
TOKEN_RESPONSE="$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=${CWS_CLIENT_ID}" \
  -d "client_secret=${CWS_CLIENT_SECRET}" \
  -d "refresh_token=${CWS_REFRESH_TOKEN}" \
  -d "grant_type=refresh_token")"

ACCESS_TOKEN="$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)"

if [[ -z "$ACCESS_TOKEN" ]]; then
  say "ERROR: failed to get access_token"
  say "Response: $TOKEN_RESPONSE"
  exit 1
fi

# ---- 7. Upload zip ----
say "uploading to Chrome Web Store..."
UPLOAD_RESPONSE="$(curl -s -X PUT \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP_FILE" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}")"

UPLOAD_STATE="$(echo "$UPLOAD_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('uploadState',''))" 2>/dev/null)"

if [[ "$UPLOAD_STATE" != "SUCCESS" ]]; then
  say "ERROR: upload failed (state=$UPLOAD_STATE)"
  say "Response: $UPLOAD_RESPONSE"
  notify_mac "❌ Extension upload failed" "v$CURRENT_VERSION — see terminal"
  exit 1
fi
say "upload OK"

# ---- 8. Publish ----
say "publishing..."
PUBLISH_RESPONSE="$(curl -s -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}/publish")"

PUBLISH_STATUS="$(echo "$PUBLISH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(d.get('status',[])))" 2>/dev/null)"

if [[ -z "$PUBLISH_STATUS" || "$PUBLISH_STATUS" == *"ERROR"* || "$PUBLISH_STATUS" == *"FAILURE"* ]]; then
  # Check for "ITEM_PENDING_REVIEW" or other non-fatal states
  if [[ "$PUBLISH_STATUS" == *"ITEM_PENDING_REVIEW"* ]]; then
    say "⚠ pending review: $PUBLISH_STATUS"
  else
    say "ERROR: publish failed (status=$PUBLISH_STATUS)"
    say "Response: $PUBLISH_RESPONSE"
    notify_mac "❌ Extension publish failed" "v$CURRENT_VERSION — $PUBLISH_STATUS"
    exit 1
  fi
fi

# ---- 9. Save version + notify ----
echo "$CURRENT_VERSION" > "$VERSION_TRACK_FILE"
STORE_URL="${STORE_URL_BASE}/${CWS_EXTENSION_ID}"

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ N2Store Extension v$CURRENT_VERSION published"
echo "   Status: $PUBLISH_STATUS"
echo "   Store:  $STORE_URL"
echo "   Update: thường mất 5-24h để Chrome push update cho users"
echo "════════════════════════════════════════════════════════"
echo ""

notify_mac "✅ Extension v$CURRENT_VERSION published" "Check: $STORE_URL"

# ---- 10. Cleanup ----
rm -f "$ZIP_FILE"

exit 0
