import os, json, tempfile, subprocess, re
from status_rules import classify, decide, override
O = {'kind': 'closed', 'after': '2026-10-13T13:50:00Z', 'note': 'Not open yet'}
def test_override_not_cleared_by_heuristic_visitor():
    s = classify({'url': 'https://x.com/rando/status/5', 'at': '2026-10-14T10:00:00Z', 'text': 'Visited Ekdalia Evergreen, huge crowd'}, set())
    assert s and s['tier'] == 'visitor'
    assert override(O, decide(None, [s]), [s])['kind'] == 'closed'
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
