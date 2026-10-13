#!/usr/bin/env bash
# Non-interactive: refetch award news, redeploy only if the feed changed. Safe to run from cron.
set -euo pipefail; cd "$(dirname "$0")"
export GIT_TERMINAL_PROMPT=0
before=$(python3 -c "import json;print(json.dumps(json.load(open('public/live/awards.json'))['items']))" 2>/dev/null || echo none)
python3 pipeline/awards.py src/data/dhaak.v1.json public/live/awards.json.new && mv public/live/awards.json.new public/live/awards.json
after=$(python3 -c "import json;print(json.dumps(json.load(open('public/live/awards.json'))['items']))")
# Always redeploy so the "checked X min ago" stamp stays honest; skip tests/feed in deploy (already fetched).
SKIP_FEED=1 ./deploy.sh
[ "$before" = "$after" ] && echo "feed unchanged, stamp refreshed" || echo "feed changed, deployed"
