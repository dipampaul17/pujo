#!/usr/bin/env bash
# Live refresh, every 5 min. Non-interactive.
#   ./refresh-live.sh plan              -> prints this run's <=3 X queries (JSON) for the agent to run via the X connector
#   ./refresh-live.sh [x_result.json..] -> ingests X results, rebuilds status/x/now JSON, redeploys only if they changed
set -uo pipefail
cd "$(dirname "$0")"
if [ "${1:-}" = plan ]; then python3 pipeline/xpoll.py plan; exit 0; fi
[ $# -gt 0 ] && python3 pipeline/xpoll.py ingest "$@"
before=$(cat public/live/status.json public/live/x.json public/live/now.json 2>/dev/null | python3 -c "import sys,json,hashlib,re;print(hashlib.sha1(re.sub(r'\"updated\": ?\"[^\"]*\"','',sys.stdin.read()).encode()).hexdigest())")
python3 pipeline/pinned.py >/dev/null || echo "pinned: kept last"
python3 pipeline/status.py src/data/dhaak.v1.json public/live/status.json >/dev/null || echo "status: kept last"
python3 pipeline/now.py src/data/dhaak.v1.json public/live/now.json >/dev/null 2>&1 || echo "now: kept last"
after=$(cat public/live/status.json public/live/x.json public/live/now.json 2>/dev/null | python3 -c "import sys,json,hashlib,re;print(hashlib.sha1(re.sub(r'\"updated\": ?\"[^\"]*\"','',sys.stdin.read()).encode()).hexdigest())")
if [ "$before" = "$after" ]; then echo "no change"; exit 0; fi
pipeline/publish-live.sh >/tmp/dhaak-live.log 2>&1 && echo "changed, published" || { echo "publish failed, see /tmp/dhaak-live.log"; exit 1; }
