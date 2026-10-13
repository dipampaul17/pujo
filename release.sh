#!/usr/bin/env bash
# Release gate: deploy only if every check is green.
set -euo pipefail; cd "$(dirname "$0")"
step() { printf '\n== %s\n' "$1"; }
step typecheck; npx tsc -p tsconfig.app.json --noEmit
step vitest+evals; npx vitest run
step pipeline-tests; (cd pipeline && python3 -c "
import importlib,sys
for m in ['test_status_rules','test_aliases','test_signals']:
    t=importlib.import_module(m)
    for n in [n for n in dir(t) if n.startswith('test_')]: getattr(t,n)()
    print('ok',m)")
step build; rm -rf /tmp/gate && BASE=/pujo/ npx vite build --outDir /tmp/gate/pujo >/dev/null
step e2e; PORT=${GATE_PORT:-4391}; (cd /tmp/gate && python3 -m http.server $PORT >/dev/null 2>&1 & echo $! > /tmp/gate.pid); sleep 1
trap 'kill $(cat /tmp/gate.pid) 2>/dev/null || true' EXIT
PW_CORE=/tmp/pw/node_modules/playwright-core node e2e/gate.cjs http://localhost:$PORT/pujo/
[ -n "${NO_DEPLOY:-}" ] && { echo "GATE GREEN (deploy skipped)"; exit 0; }
step deploy; SKIP_LIVE=${SKIP_LIVE:-1} ./deploy.sh && echo "GATE GREEN, deployed"
