#!/usr/bin/env bash
# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code.
# Helper để load test data vào persistent browser session cho so-order.
# Usage:
#   bash scripts/so-order-test-data-load.sh create
#   bash scripts/so-order-test-data-load.sh cleanup
set -euo pipefail
ACTION="${1:-create}"
HOST="${HOST:-http://127.0.0.1:9999}"
case "$ACTION" in
    create) SCRIPT="$(dirname "$0")/so-order-test-data-create.js" ;;
    cleanup) SCRIPT="$(dirname "$0")/so-order-test-data-cleanup.js" ;;
    *) echo "Usage: $0 create|cleanup"; exit 1 ;;
esac
[ -f "$SCRIPT" ] || { echo "Script not found: $SCRIPT"; exit 1; }
# Ensure browser is on so-order page (auto-nav)
curl -s -X POST "$HOST/cmd" -H "Content-Type: application/json" \
  -d "{\"cmd\":\"nav http://localhost:8080/so-order/index.html?t=$(date +%s)\"}" > /dev/null
sleep 5
python3 -c "
import json, urllib.request, re, sys
with open('$SCRIPT') as f: body = f.read()
payload = json.dumps({'cmd': 'eval ' + body}).encode()
req = urllib.request.Request('$HOST/cmd', data=payload, headers={'Content-Type':'application/json'})
r = urllib.request.urlopen(req, timeout=30).read().decode()
m = re.search(r'eval → (.+?)\"\}\$', r)
if m:
    out = m.group(1).strip()
    if out.startswith('\\\"'):
        unesc = json.loads('\"' + out + '\"')
        try: print(json.dumps(json.loads(unesc), ensure_ascii=False, indent=2))
        except: print(unesc)
    else: print(out)
else: print('ERR:', r[:500]); sys.exit(1)
"
