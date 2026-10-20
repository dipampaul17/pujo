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

# --- X only (DP, 13 Oct) ---
TOI_GRID='https://timesofindia.indiatimes.com/city/kolkata/office-goersschoolkidspuja-shoppers-revellers-post-afternoon-traffic-gridlock/articleshow/134900607.cms'
TOI_ALLEN='https://timesofindia.indiatimes.com/city/kolkata/tukde-tukde-gang-on-cm-lips-at-allen-park/articleshow/134900605.cms'
def _d(srcs, prev=None):
    from status_rules import classify, decide
    return decide(prev,[c for c in (classify(s,set()) for s in srcs) if c])
def test_toi_gridlock_roundup_never_opens():
    for t in ['Crowd of pandal-hoppers at Mudiali from 6 pm; organisers stepped up security (TOI)',
              'Such was the rush that organisers switched on lighting; visitors at Ekdalia Evergreen',
              'Considerable rush of revellers (crowds) at Tridhara Sammilani in the evening (TOI)',
              'Office-goers, schoolkids, puja shoppers, revellers post afternoon traffic gridlock']:
        assert _d([{'url':TOI_GRID,'at':'2026-10-12','text':t,'outlet':True,'hand':True}]) is None, t
def test_toi_allen_park_itinerary_never_opens():
    for t in ['CM inaugurated a series of pujas prior to Allen Park; itinerary included Kidderpore 25 Pally (TOI)',
              'CM Suvendu Adhikari inaugurated Santoshpur Lake Pally on 12 Oct (TOI; Biswa Bangla Sangbad)']:
        assert _d([{'url':TOI_ALLEN,'at':'2026-10-12','text':t,'outlet':True,'hand':True}]) is None, t
def test_roundup_on_x_rejected_and_scheduled_rejected():
    from status_rules import classify
    assert classify({'url':'https://x.com/ToIKolkata/status/1','at':'2026-10-12','text':'Traffic gridlock as crowds throng Ekdalia, Singhi Park'},set()) is None
    assert classify({'url':'https://x.com/ANI/status/2','at':'2026-10-12','text':'CM scheduled to inaugurate Mudiali today'},set()) is None
def test_x_inauguration_opens_and_news_rides_along():
    d=_d([{'url':TOI_ALLEN,'at':'2026-10-12','text':'Behala Club inaugurated','outlet':True},{'url':'https://x.com/ANI/status/3','at':'2026-10-12','text':'CM inaugurated the Durga Puja of Behala Club'}])
    assert d and d['evidence'].startswith('https://x.com/')
def test_sticky_news_only_prev_drops():
    prev={'since':'2026-10-12','evidence':TOI_GRID,'note':'crowds','kind':'visitors','sources':[{'url':TOI_GRID,'at':'2026-10-12','text':'crowds','tier':'outlet','kind':'visitors','by':'timesofindia.indiatimes.com'}]}
    assert _d([],prev) is None
def test_override_closed_beats_sticky_until_fresh_visit():
    from status_rules import classify, override, decide
    o={'kind':'closed','after':'2026-10-13T13:50:00Z','note':'Not open yet'}
    old=[classify({'url':'https://x.com/someone/status/4','at':'2026-10-12','text':'Visited Mudiali today, pandal looks great'},set())]
    assert override(o,decide(None,old),old)['kind']=='closed'
    new=[classify({'url':'https://x.com/someone/status/5','at':'2026-10-14T10:00:00Z','text':'Visited Mudiali today, pandal looks great'},set())]
    assert override(o,decide(None,new),new)['kind']!='closed'  # DP 14 Oct: newer first-hand X visit flips it
    new=[classify({'url':'https://x.com/someone/status/5','at':'2026-10-14T10:00:00Z','text':'Visited Mudiali today, pandal looks great'},{'someone'})]
    assert override(o,decide(None,new),new)['kind']!='closed'  # a hand-vetted visitor does

def test_override_outlet_crowd_does_not_clear_but_inauguration_does():
    from status_rules import classify, override, decide
    o={'kind':'closed','after':'2026-10-13T18:30:00Z','note':'Not open yet'}
    crowd=classify({'url':'https://x.com/ndtv/status/9','at':'2026-10-14','text':'Crowds of pandal hoppers thronged South Kolkata\'s iconic Mudiali Club on Tritiya'},set())
    assert crowd and crowd['tier']=='outlet' and crowd['kind']=='visitors'
    assert override(o,decide(None,[crowd]),[crowd])['kind']=='closed'  # DP: outlet crowd ≠ first-hand visit
    inaug=classify({'url':'https://x.com/ANI/status/10','at':'2026-10-14','text':'CM inaugurated Mudiali Club Durga Puja today'},set())
    assert inaug and inaug['kind']=='inaugurated'
    assert override(o,decide(None,[inaug]),[inaug])['kind']!='closed'
