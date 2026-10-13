#!/usr/bin/env bash
# Award news was removed from the app. Kept so existing schedules keep working: it just rebuilds and redeploys.
set -euo pipefail; cd "$(dirname "$0")"
export GIT_TERMINAL_PROMPT=0
./deploy.sh
echo "deployed"
