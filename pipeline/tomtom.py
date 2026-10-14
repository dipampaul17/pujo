"""Live road traffic from TomTom (free tier) -> public/live/traffic.json. Server-side only; the app never sees the key.
  TOMTOM_API_KEY unset  -> no-op ('skip').
  First run with a key  -> 3 verification calls (flow at Rashbehari Ave + Gariahat Rd, incidents over Kolkata); the job
                           only polls once both flow readings return real current/free-flow speeds.
  Every 5-min run       -> 1 incidents call (closures/jams over Kolkata); 16:00-02:00 IST also flow for the next
                           slice of pandals (pass pandals first), each pandal refreshed about every 45 min.
  Hard cap CAP calls/day (TomTom free: 2,500 non-tile/day, blocked not billed past it). Day = UTC date.
Attribution: traffic data © TomTom."""
import json, os, sys, math, urllib.request, datetime as dt
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, H)
from jsonio import write_json
STATE = f'{H}/state/tomtom.json'; OUT = f'{H}/../public/live/traffic.json'
CAP = 2300; ROT = 9; BBOX = '88.25,22.42,88.48,22.68'
VERIFY = [(22.5175, 88.3570), (22.5190, 88.3660)]  # Rashbehari Avenue, Gariahat Road (OSM)
API = 'https://api.tomtom.com/traffic/services'
def http(url):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'pujo-app/1.0'}), timeout=20).read())
def _load(f, d):
    try: return json.load(open(f))
    except Exception: return d
def flow_url(k, lat, lng): return f'{API}/4/flowSegmentData/absolute/10/json?point={lat},{lng}&unit=KMPH&key={k}'
def inc_url(k):
    f = '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},startTime,from,to,delay}}}'
    return f'{API}/5/incidentDetails?bbox={BBOX}&fields={f}&language=en-GB&timeValidityFilter=present&key={k}'
def _flow(d):
    f = (d or {}).get('flowSegmentData') or {}
    if not isinstance(f.get('currentSpeed'), (int, float)) or not f.get('freeFlowSpeed'): return None
    return {'cur': f['currentSpeed'], 'free': f['freeFlowSpeed'], 'ratio': round(min(1, f['currentSpeed'] / f['freeFlowSpeed']), 2),
            'conf': f.get('confidence'), 'closed': bool(f.get('roadClosure'))}
def _near(coords, pandals, m=400):
    d = lambda p, c: math.hypot((p['lat'] - c[1]) * 111e3, (p['lng'] - c[0]) * 103e3)
    return [p['id'] for p in pandals if p.get('lat') and coords and min(d(p, c) for c in coords) <= m]
def run(key, pandals, now):
    if not key: print('TOMTOM_API_KEY unset: skip'); return 'skip'
    day = now.strftime('%Y-%m-%d'); st = _load(STATE, {})
    if st.get('day') != day: st = {'day': day, 'used': 0, 'verified': st.get('verified', False), 'cursor': st.get('cursor', 0)}
    def call(url):
        if st['used'] >= CAP: raise RuntimeError('cap')
        st['used'] += 1
        try: return http(url)
        except Exception as e: print('tomtom error', str(e).replace(key, '***')); return None
    stamp = now.replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    out = _load(OUT, {'pandals': {}, 'incidents': []})
    try:
        if not st.get('verified'):
            v = [_flow(call(flow_url(key, *pt))) for pt in VERIFY]; inc = call(inc_url(key))
            st['verify'] = {'at': stamp, 'flow': v, 'incidents': None if inc is None else len(inc.get('incidents', []))}
            st['verified'] = all(v) and inc is not None
            if not st['verified']: write_json(STATE, st, indent=1); print('tomtom: verification failed', st['verify']); return 'unverified'
            print('tomtom verified:', st['verify'])
        inc = call(inc_url(key))
        if inc is not None:
            out['incidents'] = [{'closed': i['properties'].get('iconCategory') == 8, 'delay': i['properties'].get('delay') or 0,
                                 'mag': i['properties'].get('magnitudeOfDelay'), 'from': i['properties'].get('from'), 'to': i['properties'].get('to'),
                                 'what': '; '.join(e.get('description', '') for e in i['properties'].get('events') or [])[:80],
                                 'at': stamp, 'near': _near(i['geometry']['coordinates'] if i['geometry']['type'] == 'LineString' else [i['geometry']['coordinates']], pandals)}
                                for i in inc.get('incidents', []) if i['properties'].get('iconCategory') in (6, 7, 8, 9)]  # jam, lane closed, road closed, roadworks
            out['incidents'] = [i for i in out['incidents'] if i['near']]
        h = (now + dt.timedelta(hours=5, minutes=30)).hour
        if h >= 16 or h < 2:
            n = math.ceil(len(pandals) / ROT); c = st.get('cursor', 0) % max(1, len(pandals))
            for p in (pandals[c:] + pandals[:c])[:n]:
                f = _flow(call(flow_url(key, p['lat'], p['lng'])))
                if f: out['pandals'][p['id']] = {**f, 'at': stamp}
            st['cursor'] = c + n
    except RuntimeError: print('tomtom: daily cap reached')
    out.update(source='TomTom', updated=stamp)
    write_json(OUT, out, indent=1); write_json(STATE, st, indent=1)
    return 'ok'
if __name__ == '__main__':
    D = json.load(open(f'{H}/../src/data/dhaak.v1.json'))['pandals']
    PASS = set(json.load(open(f'{H}/../src/data/passport.json'))['ids'])
    pans = sorted([p for p in D if p.get('lat') and p.get('precision') != 'station'], key=lambda p: (p['id'] not in PASS, p['id']))
    print(run(os.environ.get('TOMTOM_API_KEY'), pans, dt.datetime.now(dt.timezone.utc)))
