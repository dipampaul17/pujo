import os, json, tempfile, subprocess, re
from status_rules import classify, decide, override
O = {'kind': 'closed', 'after': '2026-10-13T18:30:00Z', 'note': 'Not open yet'}
def test_override_cleared_by_newer_x_post_only():
    s = classify({'url': 'https://x.com/rando/status/5', 'at': '2026-10-14T10:00:00Z', 'text': 'Visited Ekdalia Evergreen, huge crowd'}, set())
    assert s and s['tier'] == 'visitor'
    assert override(O, decide(None, [s]), [s])['kind'] != 'closed'  # DP 14 Oct: any first-hand X visit after the override flips it
    i = classify({'url': 'https://x.com/SuvenduWB/status/7', 'at': '2026-10-14T12:00:00Z', 'text': 'Inaugurated Mudiali Club Durga Puja today'}, set())
    assert override(O, decide(None, [i]), [i])['kind'] != 'closed'
    toi = classify({'url': 'https://timesofindia.indiatimes.com/x', 'at': '2026-10-14', 'text': 'Crowds at Mudiali'}, set())
    assert override(O, decide(None, [toi]), [toi])['kind'] == 'closed'  # news never flips it
def test_override_not_cleared_by_same_day_date_only():
    s = classify({'url': 'https://x.com/a/status/6', 'at': '2026-10-13', 'text': 'x', 'hand': True}, set())
    assert override(O, decide(None, [s]), [s])['kind'] == 'closed'
def test_atomic_write():
    from jsonio import write_json
    d = tempfile.mkdtemp(); p = os.path.join(d, 'a.json')
    write_json(p, {'a': 1}); assert json.load(open(p)) == {'a': 1}
    assert os.listdir(d) == ['a.json']
def test_status_uses_xpoll_trusted():
    src = open(os.path.join(os.path.dirname(__file__), 'status.py')).read()
    assert "['abasu4ever']" not in src
def test_no_raw_json_dump_to_open():
    h = os.path.dirname(__file__)
    for f in ['status.py', 'xpoll.py', 'now.py', 'pinned.py']:
        assert not re.search(r"json\.dump\([^\n]*open\([^\n]*'w'\)", open(os.path.join(h, f)).read()), f
def test_refresh_has_lock_and_ingest_failure_exit():
    s = open(os.path.join(os.path.dirname(__file__), '..', 'refresh-live.sh')).read()
    assert 'flock' in s and 'ingest failed' in s
def test_publish_retries_push():
    s = open(os.path.join(os.path.dirname(__file__), 'publish-live.sh')).read()
    assert 'for try in' in s
def test_overrides_queried_every_run():
    import xpoll as X, datetime as dt, io, contextlib
    X.ST = tempfile.mkdtemp(); X.now = dt.datetime(2026, 10, 14, 7, tzinfo=dt.UTC)
    with contextlib.redirect_stdout(io.StringIO()): qs = X.plan()
    w = [q for q in qs if q.get('kind') == 'wide'][0]['args']['query']
    assert 'Ekdalia' in w and 'একডালিয়া' in w and 'Mudiali' in w, w
def test_status_trusts_verified_inaugurators():
    src = open(os.path.join(os.path.dirname(__file__), 'status.py')).read()
    assert 'x_inaugurators.json' in src
