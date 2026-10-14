"""Crowd decay, 'clear' evidence, police road closures matched to pandals via OSM road geometry."""
import datetime as dt, sys, os, json, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import signals as S
now = dt.datetime(2026, 10, 14, 14, 0, tzinfo=dt.timezone.utc)
ago = lambda m: (now - dt.timedelta(minutes=m)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
def test_clear_kind():
    for t in ['No queue at Chetla Agrani right now', 'Chetla Agrani almost empty, no crowd', 'চেতলায় এখন ভিড় নেই', 'bheer nei Chetla te']:
        assert S.classify(t)[0] == 'clear', t
    assert S.classify('Huge crowd at Chetla Agrani')[0] == 'crowd'
def test_decay_weight_and_newest_of_crowd_vs_clear_wins():
    a = S.candidate('Chetla Agrani e ki bheer', 'a', ago(100), 'u1', ['chetla-agrani'])
    b = S.candidate('Crowd at Chetla Agrani', 'b', ago(90), 'u2', ['chetla-agrani'])
    r = S.accept([a, b], now)[('pandal', 'chetla-agrani')]
    assert r['kind'] == 'crowd' and 0 < r['w'] < 0.3, r     # 90-100 min old: weak
    c = S.candidate('Crowd at Chetla Agrani', 'c', ago(5), 'u3', ['chetla-agrani'])
    assert S.accept([a, b, c], now)[('pandal', 'chetla-agrani')]['w'] > 1
    d = S.candidate('No queue at Chetla Agrani now', 'd', ago(2), 'u4', ['chetla-agrani'])
    e = S.candidate('Chetla Agrani not crowded now', 'e', ago(3), 'u5', ['chetla-agrani'])
    assert S.accept([a, b, c, d, e], now)[('pandal', 'chetla-agrani')]['kind'] == 'clear'
def test_police_road_post_matched_to_road_and_near_pandals():
    keep = S.GAZ
    S.GAZ = {'Hazra Road': {'aliases': ['হাজরা রোড'], 'pts': [[22.5243, 88.3530], [22.5250, 88.3600]]}}
    p = S.candidate('Hazra Road closed for vehicles near the crossing, diversion in place', 'KPTrafficDept', ago(10), 'u', [])
    assert p and p['place'] == 'road' and p['id'] == 'Hazra Road', p
    pb = S.candidate('হাজরা রোডে যানজট', 'KPTrafficDept', ago(10), 'u', [])
    assert pb and pb['id'] == 'Hazra Road'
    pans = [{'id': 'near', 'lat': 22.5247, 'lng': 88.3560}, {'id': 'far', 'lat': 22.5400, 'lng': 88.3600}]
    assert S.near_road('Hazra Road', pans) == ['near']
    acc = S.accept([p], now)
    assert acc[('road', 'Hazra Road')]['kind'] == 'traffic'
    S.GAZ = keep
def test_ingest_publishes_roads_with_near_pandals_and_crowd_weight():
    import importlib, io, contextlib, xpoll as X
    S.GAZ = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', 'road_gaz.json')))['roads']
    X.ST = tempfile.mkdtemp(); X.CANDS = X.ST + '/c.json'; X.INAUG_CANDS = X.ST + '/ic.json'
    X.live = {'polled': {}, 'posts': {}, 'crowd': {}, 'open': {}}; X.now = now
    f = X.ST + '/r.json'
    json.dump({'data': [{'id': '1', 'author_id': 'k', 'created_at': ago(10), 'text': 'Traffic diverted on Hazra Road due to heavy crowd. Please avoid.'},
                        {'id': '2', 'author_id': 'a', 'created_at': ago(5), 'text': 'Chetla Agrani e ki bheer re baba'},
                        {'id': '3', 'author_id': 'b', 'created_at': ago(8), 'text': 'Huge crowd at Chetla Agrani right now'}],
               'includes': {'users': [{'id': 'k', 'username': 'KPTrafficDept'}, {'id': 'a', 'username': 'alice'}, {'id': 'b', 'username': 'bob'}]}}, open(f, 'w'))
    with contextlib.redirect_stdout(io.StringIO()): X.ingest([f])
    r = X.live['roads']
    assert r and r[0]['road'] == 'Hazra Road' and r[0]['near'] and r[0]['url'].endswith('/1'), r
    assert X.live['crowd']['chetla-agrani']['w'] > 1
