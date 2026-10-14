#!/usr/bin/env bash
# Release gate: deploy only if every check is green.
set -euo pipefail; cd "$(dirname "$0")"
step() { printf '\n== %s\n' "$1"; }
step typecheck; npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.test.json --noEmit
step vitest+evals; npx vitest run
step pipeline-tests; (cd pipeline && python3 -c "
import importlib,sys
for m in ['test_status_rules','test_aliases','test_signals','test_xpoll','test_backend','test_south','test_budget','test_crowd']:
    t=importlib.import_module(m)
    for n in [n for n in dir(t) if n.startswith('test_')]: getattr(t,n)()
    print('ok',m)")
step build; G=${GATE_DIR:-/tmp/gate}; rm -rf $G && BASE=/pujo/ npx vite build --outDir $G/pujo >/dev/null
step e2e; PORT=${GATE_PORT:-4391}; (cd $G && python3 -m http.server $PORT >/dev/null 2>&1 & echo $! > /tmp/gate.pid); sleep 1
trap 'kill $(cat /tmp/gate.pid) 2>/dev/null || true' EXIT
PW_CORE=/tmp/pw/node_modules/playwright-core node e2e/gate.cjs http://localhost:$PORT/pujo/
step quality; PW_CORE=/tmp/pw/node_modules/playwright-core node e2e/quality.cjs http://localhost:$PORT/pujo/
step matrix; PW_CORE=/tmp/pw/node_modules/playwright-core node e2e/matrix.cjs http://localhost:$PORT/pujo/ || exit 1
lh() { CHROME_PATH=/usr/bin/google-chrome lighthouse "$1" --only-categories=performance,accessibility --form-factor=mobile --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=/tmp/lh-gate.json --quiet
  python3 -c "import json,sys;c=json.load(open('/tmp/lh-gate.json'))['categories'];s={k:round(v['score']*100) for k,v in c.items()};print('lighthouse',s);sys.exit(0 if all(s[k]>=95 for k in sys.argv[1:]) else 1)" ${@:2}; }
# Local static server has no gzip/HTTP2, so performance is gated on the live CDN after deploy; accessibility gates here.
step lighthouse-a11y; lh http://localhost:$PORT/pujo/ accessibility
[ -n "${NO_DEPLOY:-}" ] && { echo "GATE GREEN (deploy skipped)"; exit 0; }
step deploy; SKIP_LIVE=${SKIP_LIVE:-1} ./deploy.sh
step live-verify; sleep 60; lh https://dipampaul17.github.io/pujo/ performance accessibility
PW_CORE=/tmp/pw/node_modules/playwright-core node e2e/gate.cjs https://dipampaul17.github.io/pujo/ /workspace/shots/gate-live
echo "GATE GREEN, deployed and verified live"
