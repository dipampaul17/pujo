"""Precompute road travel matrices (OSRM car + foot) from a 0.01° grid and between pandals.
Free OSRM demo servers, batched under 100 coordinates. Output: public/data/roads.json (quantized ints)."""
import json, sys, time, urllib.request
SRC, OUT = sys.argv[1], sys.argv[2]
d = json.load(open(SRC))
P = [p for p in d['pandals'] if p.get('lat') and p['precision'] != 'none']
LAT0, LNG0, STEP, ROWS, COLS = 22.44, 88.29, 0.01, 23, 15   # 22.44–22.66, 88.29–88.43
cells = [(LAT0 + r*STEP, LNG0 + c*STEP) for r in range(ROWS) for c in range(COLS)]
EP = {'car': 'https://router.project-osrm.org/table/v1/driving/', 'foot': 'https://routing.openstreetmap.de/routed-foot/table/v1/foot/'}
def table(prof, srcs, dsts, ann):
    co = ';'.join(f'{lng:.5f},{lat:.5f}' for lat, lng in srcs + dsts)
    u = EP[prof] + co + f'?sources={";".join(map(str,range(len(srcs))))}&destinations={";".join(str(len(srcs)+i) for i in range(len(dsts)))}&annotations={ann}'
    for t in range(5):
        try:
            j = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'pujo-app/1.0'}), timeout=60))
            if j.get('code') == 'Ok': return j
        except Exception as e: print('retry', prof, e, file=sys.stderr)
        time.sleep(2 + 3*t)
    raise SystemExit('osrm failed')
pd = [(p['lat'], p['lng']) for p in P]
def matrix(prof, srcs):
    car_d, dist = [], []
    for i in range(0, len(srcs), 10):
        j = table(prof, srcs[i:i+10], pd, 'duration,distance')
        car_d += j['durations']; dist += j['distances']; time.sleep(1.1)
    q = lambda v: -1 if v is None else int(round(v / 10))
    return [[q(x) for x in row] for row in car_d], [[q(x) for x in row] for row in dist]
out = {'v': 1, 'fetched': time.strftime('%Y-%m-%d'), 'source': 'OSRM (OpenStreetMap) car: router.project-osrm.org, foot: routing.openstreetmap.de',
       'unit': 'durations in 10 s, distances in 10 m', 'grid': {'lat0': LAT0, 'lng0': LNG0, 'step': STEP, 'rows': ROWS, 'cols': COLS}, 'ids': [p['id'] for p in P], 'pts': [[round(p['lat'], 6), round(p['lng'], 6)] for p in P]}
for prof in ('car', 'foot'):
    out[prof] = dict(zip(('cellT', 'cellD'), matrix(prof, cells)))
    out[prof].update(dict(zip(('pairT', 'pairD'), matrix(prof, pd))))
    print(prof, 'done', file=sys.stderr)
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
