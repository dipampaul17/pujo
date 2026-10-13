#!/usr/bin/env bash
# Build + publish to GitHub Pages (gh-pages branch). Refreshes the award feed first.
set -euo pipefail; cd "$(dirname "$0")"
npx vitest run
[ -z "${SKIP_LIVE:-}" ] && { python3 pipeline/status.py src/data/dhaak.v1.json public/live/status.json || echo "status failed, keeping last"
python3 pipeline/now.py src/data/dhaak.v1.json public/live/now.json || echo "now feed failed, keeping last" ; }
rm -rf dist && BASE=/dhaak/ npx vite build
touch dist/.nojekyll
cd dist && GIT_TERMINAL_PROMPT=0 git init -q -b gh-pages && git add -A && git -c user.name="Dipam Paul" -c user.email="40596409+dipampaul17@users.noreply.github.com" commit -qm "deploy $(date -u +%FT%TZ)" && git push -qf https://github.com/dipampaul17/dhaak.git gh-pages
