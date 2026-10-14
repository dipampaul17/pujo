"""TomTom live traffic job: no key -> no-op; key -> verify first, then poll within the hard daily cap."""
import os, sys, json, tempfile, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tomtom as T
NOW = dt.datetime(2026, 10, 14, 13, 0, tzinfo=dt.timezone.utc)  # 18:30 IST
PANS = [{'id': f'p{i}', 'lat': 22.5 + i / 1000, 'lng': 88.35} for i in range(30)]
def setup(fake):
    d = tempfile.mkdtemp(); T.STATE = d + '/tt.json'; T.OUT = d + '/traffic.json'; T.http = fake; return d
FLOW = {'flowSegmentData': {'frc': 'FRC3', 'currentSpeed': 12, 'freeFlowSpeed': 30, 'currentTravelTime': 150, 'freeFlowTravelTime': 60, 'confidence': 0.9, 'roadClosure': False}}
INC = {'incidents': [{'type': 'Feature', 'geometry': {'type': 'LineString', 'coordinates': [[88.35, 22.505], [88.351, 22.506]]},
                      'properties': {'iconCategory': 8, 'magnitudeOfDelay': 4, 'from': 'Hazra Rd', 'to': 'SP Mukherjee Rd', 'delay': 0, 'events': [{'description': 'Closed'}], 'startTime': '2026-10-14T12:00:00Z'}}]}
def fake(url):
    fake.n += 1
    return INC if 'incidentDetails' in url else FLOW
def test_no_key_noops():
    setup(fake); fake.n = 0
    assert T.run(None, PANS, NOW) == 'skip' and fake.n == 0 and not os.path.exists(T.OUT)
def test_verifies_then_polls_and_writes():
    setup(fake); fake.n = 0
    assert T.run('k', PANS, NOW) == 'ok'
    st = json.load(open(T.STATE)); assert st['verified'] and st['used'] == fake.n
    out = json.load(open(T.OUT))
    p = out['pandals']['p0']; assert p['ratio'] == 0.4 and p['at'] and out['source'] == 'TomTom'
    assert out['incidents'][0]['closed'] and 'p5' in out['incidents'][0]['near']
def test_failed_verification_stops():
    setup(lambda u: {'flowSegmentData': {}} if 'flow' in u else {'incidents': []})
    assert T.run('k', PANS, NOW) == 'unverified' and not os.path.exists(T.OUT)
def test_hard_cap():
    setup(fake); fake.n = 0
    json.dump({'day': '2026-10-14', 'used': T.CAP - 1, 'verified': True}, open(T.STATE, 'w'))
    T.run('k', PANS, NOW); assert json.load(open(T.STATE))['used'] <= T.CAP
def test_quiet_hours_only_incidents():
    setup(fake); fake.n = 0
    json.dump({'day': '2026-10-14', 'used': 0, 'verified': True}, open(T.STATE, 'w'))
    T.run('k', PANS, dt.datetime(2026, 10, 14, 4, 0, tzinfo=dt.timezone.utc))  # 09:30 IST
    assert fake.n == 1
