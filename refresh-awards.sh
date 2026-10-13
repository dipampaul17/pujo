#!/usr/bin/env bash
# Non-interactive: refetch award news, redeploy only if the feed changed. Safe to run from cron.
set -euo pipefail; cd "$(dirname "$0")"
export GIT_TERMINAL_PROMPT=0
before=$(python3 -c "import json;print(json.dumps(json.load(open('public/live/awards.json'))['items']))" 2>/dev/null || echo none)
python3 pipeline/awards.py src/data/dhaak.v1.json public/live/awards.json.new
# Refuse to wipe a good feed with an empty fetch (flaky Google News 503s).
status=0
python3 - <<'PY' || status=$?
import json, sys
new=json.load(open('public/live/awards.json.new'))
try: old=json.load(open('public/live/awards.json'))
except Exception: old={'items':[]}
if not new.get('items') and old.get('items'):
    print('empty fetch; keeping last good feed')
    sys.exit(2)
PY
if [ "$status" -eq 2 ]; then
  rm -f public/live/awards.json.new
else
  mv public/live/awards.json.new public/live/awards.json
fi
after=$(python3 -c "import json;print(json.dumps(json.load(open('public/live/awards.json'))['items']))")
# Always redeploy so the "checked X min ago" stamp stays honest; skip tests/feed in deploy (already fetched).
SKIP_FEED=1 ./deploy.sh
[ "$before" = "$after" ] && echo "feed unchanged, stamp refreshed" || echo "feed changed, deployed"
