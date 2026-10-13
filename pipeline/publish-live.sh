#!/usr/bin/env bash
# Publish ONLY public/live/*.json to gh-pages (no app rebuild), so live data ships in ~1 min
# without touching whatever UI is in the working tree. The app polls these files at runtime.
set -euo pipefail; cd "$(dirname "$0")/.."
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
GIT_TERMINAL_PROMPT=0 git clone -q --depth 1 -b gh-pages https://github.com/dipampaul17/dhaak.git "$W"
mkdir -p "$W/live"; cp public/live/*.json "$W/live/"
cd "$W"; git add -A live
git diff --cached --quiet && { echo "live: already current"; exit 0; }
git -c user.name="Dipam Paul" -c user.email="40596409+dipampaul17@users.noreply.github.com" commit -qm "live $(date -u +%FT%TZ)"
git push -q origin gh-pages && echo "live: published"
