"""Budget ledger + calls/run schedule (DP 14 Oct): 2/run, 3 in 17-23 IST peak, 1 from 02:00 to the 05:30 reset;
60-read floor; step down to 1 below 150; wide openings (with trusted/CM accounts) every run; pass-first rotation."""
import os, sys, io, contextlib, datetime as dt, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xpoll as X
U = lambda h, m=0: dt.datetime(2026, 10, 14, h, m, tzinfo=dt.UTC)  # UTC; IST = +5:30
def fresh(left=None, at=U(6, 44)):
    X.ST = tempfile.mkdtemp(); X.CANDS = X.ST + '/c.json'; X.INAUG_CANDS = X.ST + '/ic.json'; X.live = {'polled': {}, 'posts': {}, 'crowd': {}, 'open': {}}; X.now = at
    if left is not None: X.set_left(left)
def plan():
    with contextlib.redirect_stdout(io.StringIO()): return X.plan()
def test_schedule_by_ist_hour():
    assert X.base_calls(U(6, 45)) == 2    # 12:15 IST
    assert X.base_calls(U(11, 30)) == 3   # 17:00 IST
    assert X.base_calls(U(17, 25)) == 3   # 22:55 IST
    assert X.base_calls(U(17, 30)) == 2   # 23:00 IST
    assert X.base_calls(U(20, 25)) == 2   # 01:55 IST
    assert X.base_calls(U(20, 30)) == 1   # 02:00 IST
    assert X.base_calls(U(23, 55)) == 1   # 05:25 IST
def test_ledger_day_resets_0530_ist():
    fresh(645, U(6, 44)); assert X.left() == 645
    X.now = U(23, 59); assert X.left() == 645
    X.now = dt.datetime(2026, 10, 15, 0, 1, tzinfo=dt.UTC); assert X.left() == 1000
def test_plan_spends_from_ledger_and_always_has_wide_with_cm():
    fresh(645)
    qs = plan(); assert len(qs) == 2 and X.left() == 643
    w = [q for q in qs if q.get('kind') == 'wide']
    assert w and 'উদ্বোধন' in w[0]['args']['query'] and 'from:suvenduwb' in w[0]['args']['query'] and 'from:cmowbgov' in w[0]['args']['query']
    assert any(set(q['ids']) & X.PASS for q in qs)
def test_floor_and_stepdown():
    fresh(149); assert len(plan()) == 1 and plan()[0].get('kind') == 'wide'
    fresh(61); assert len(plan()) == 1
    fresh(60); assert plan() == [] and X.left() == 60
def test_full_curve_never_breaks_floor():
    fresh(645, U(6, 45)); spent = 0
    t = U(6, 45)
    while t < dt.datetime(2026, 10, 15, 0, 0, tzinfo=dt.UTC):
        X.now = t; spent += len(plan()); t += dt.timedelta(minutes=5)
    assert X.left() >= 60 and spent >= 400, (spent, X.left())
def test_every_run_has_wide_and_window_covers_gap():
    fresh(900)
    for i in range(6):
        X.now = U(12) + dt.timedelta(minutes=5 * i); qs = plan()
        assert any(q.get('kind') == 'wide' for q in qs)
        for q in qs:
            for k in q['ids']: X.live['polled'][k] = X.now.isoformat()
    X.now = U(13); qs = plan()  # 35-min gap after a missed run: window reaches back to the last wide run
    st = [q for q in qs if q.get('kind') == 'wide'][0]['args']['start_time']
    assert st <= '2026-10-14T12:20:00Z', st
def test_spend_cli_for_sweeps():
    fresh(500); X.spend(3); assert X.left() == 497
def test_inaugurators_in_wide_with_keywords_and_rotated_under_cap():
    fresh(900); seen = set()
    for i in range(6):
        X.now = U(12) + dt.timedelta(minutes=5 * i); w = [q for q in plan() if q.get('kind') == 'wide'][0]['args']['query']
        assert len(w) <= 1000, len(w)
        seen |= {h for h in X.INAUGURATORS if f'from:{h} ' in w + ' ' or f'from:{h})' in w}
    assert {'swapan55', 'drsukantabjp', 'samikbjp', 'suvenduwb', 'cmowbgov'} <= seen and seen >= set(X.INAUGURATORS), set(X.INAUGURATORS) - seen
def test_inaugurator_candidates_logged_and_verified():
    import json
    fresh(900); X.INAUG_CANDS = X.ST + '/ic.json'; X.INAUG_FILE = X.ST + '/inaug.json'
    json.dump({'accounts': {}, 'rejected': {}}, open(X.INAUG_FILE, 'w'))
    f = X.ST + '/r.json'
    json.dump({'data': [{'id': '9', 'author_id': 'a', 'created_at': '2026-10-14T10:00:00Z',
                         'text': 'Inaugurated Badamtala Ashar Sangha Durga Puja in Kolkata with @NewMinister99 and @someclub'}],
               'includes': {'users': [{'id': 'a', 'username': 'NewMLA_X'}]}}, open(f, 'w'))
    with contextlib.redirect_stdout(io.StringIO()): X.ingest([f])
    c = json.load(open(X.INAUG_CANDS))['pending']
    assert {'newmla_x', 'newminister99', 'someclub'} <= set(c), c
    u = X.ST + '/u.json'
    json.dump({'data': [{'username': 'NewMinister99', 'description': 'Minister, Govt of West Bengal. MLA', 'location': 'Kolkata', 'public_metrics': {'tweet_count': 900, 'followers_count': 5000}},
                        {'username': 'someclub', 'description': 'Puja club', 'location': 'Delhi', 'public_metrics': {'tweet_count': 3, 'followers_count': 2}}]}, open(u, 'w'))
    with contextlib.redirect_stdout(io.StringIO()): X.inaug_verify(u)
    d = json.load(open(X.INAUG_FILE))
    assert 'newminister99' in d['accounts'] and 'someclub' in d['rejected'] and 'newminister99' in X.INAUGURATORS
