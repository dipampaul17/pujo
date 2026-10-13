from status_rules import classify, decide
T = {'abasu4ever'}
def S(url, at, text, **k): return {'url': url, 'at': at, 'text': text, **k}
def test_first_hand_visitor_is_enough():
    s = classify(S('https://x.com/someone/status/1', '2026-10-12', 'Visited Barisha Club. One outstanding creation.'), T)
    assert s and s['tier'] == 'visitor' and s['kind'] == 'visitors'
    assert decide(None, [s])['kind'] == 'visitors'
def test_rejects_throwback_future_guide_and_old():
    for t in ['Throwback to Barisha Club 2024', 'Will visit Barisha Club tomorrow', 'Top 10 pandals route guide: Barisha Club', 'Barisha Club to be inaugurated on Friday']:
        assert classify(S('https://x.com/a/status/2', '2026-10-12', t), T) is None, t
    assert classify(S('https://x.com/a/status/3', '2026-10-05', 'Visited Barisha Club'), T) is None
def test_outlet_preferred_and_corroborated():
    v = classify(S('https://x.com/abasu4ever/status/9', '2026-10-12', '📍 Santosh Mitra Square'), T)
    n = classify(S('https://x.com/Ei_Samay/status/8', '2026-10-12', 'Crowds of visitors at Santosh Mitra Square'), T)
    d = decide(None, [v, n])
    assert d['evidence'].endswith('/8') and d['corroborated'] and d['kind'] == 'visitors'
def test_sticky_without_new_sources():
    prev = decide(None, [classify(S('https://x.com/x/status/1', '2026-10-11', 'Visited the pandal, huge crowd'), T)])
    assert decide(prev, []) ['evidence'] == prev['evidence']
def test_legacy_entry_is_sticky():
    prev = {'since': '2026-10-11', 'evidence': 'https://x.com/ANI/status/1', 'note': 'Inaugurated', 'kind': 'visitors'}
    assert decide(prev, [])['kind'] == 'visitors'
def test_only_explicit_closure_downgrades():
    prev = decide(None, [classify(S('https://x.com/x/status/1', '2026-10-11', 'Visited, crowd'), T)])
    c = classify(S('https://x.com/ANI/status/5', '2026-10-13', 'Pandal closed to the public after fire'), T)
    assert decide(prev, [c])['kind'] == 'closed'
def test_uncertain_is_not_declared():
    assert classify(S('https://x.com/a/status/4', '2026-10-12', 'Barisha Club theme looks interesting'), T) is None
    assert decide(None, []) is None
