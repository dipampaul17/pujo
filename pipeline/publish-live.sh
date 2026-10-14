#!/usr/bin/env bash
# Publish ONLY public/live/*.json to gh-pages (no app rebuild), so live data ships in ~1 min
# without touching whatever UI is in the working tree. The app polls these files at runtime.
set -euo pipefail; cd "$(dirname "$(readlink -f "$0")")/.."
# Retries: another worker/deploy may push gh-pages between our clone and push (non-fast-forward). Re-clone and retry.
W=; trap 'rm -rf "$W"' EXIT
for try in 1 2 3 4; do
  rm -rf "$W"; W=$(mktemp -d)
  GIT_TERMINAL_PROMPT=0 git clone -q --depth 1 -b gh-pages https://github.com/dipampaul17/pujo.git "$W"
  for f in public/live/*.json; do python3 -c "import json,sys;json.load(open(sys.argv[1]))" "$f" || { echo "live: invalid JSON $f, not publishing"; exit 1; }; done
  mkdir -p "$W/live"; cp public/live/*.json "$W/live/"
  (cd "$W"; git add -A live
   git diff --cached --quiet && exit 3
   git -c user.name="Dipam Paul" -c user.email="40596409+dipampaul17@users.noreply.github.com" commit -qm "live $(date -u +%FT%TZ)"
   git push -q origin gh-pages); rc=$?
  [ $rc = 0 ] && { echo "live: published"; exit 0; }
  [ $rc = 3 ] && { echo "live: already current"; exit 0; }
  echo "live: push attempt $try failed, retrying"; sleep $((try*5))
done
echo "live: push failed after retries"; exit 1
