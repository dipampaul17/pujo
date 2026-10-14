"""Rotation: pass pandals every run; wide openings search every other run; every pandal covered; budget kept.
Wide results: known pandal -> open rule; unknown Kolkata pandal -> candidates file only."""
import os, sys, json, tempfile, io, contextlib, datetime as dt
H=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,H)
import xpoll as X
def fresh():
    X.ST=tempfile.mkdtemp(); X.CANDS=X.ST+'/cand.json'; X.INAUG_CANDS=X.ST+'/ic.json'; X.live={'polled':{},'posts':{},'crowd':{},'open':{}}
def simulate(runs=40):
    fresh(); t0=dt.datetime(2026,10,13,12,0,tzinfo=dt.UTC); all_={}; pas={}; per=[]
    for r in range(runs):
        X.now=t0+dt.timedelta(minutes=5*r)
        with contextlib.redirect_stdout(io.StringIO()): qs=X.plan()
        per.append(qs)
        for q in qs:
            assert len(q['args']['query'])<=1100, len(q['args']['query'])
            for i in q['ids']:
                X.live['polled'][i]=X.now.isoformat(); all_.setdefault(i,r)
                if i in X.PASS: pas.setdefault(i,r)
    return per, all_, pas
def test_rotation():
    per, all_, pas = simulate()
    assert all(len(q)<=3 for q in per)          # 3 calls/run * 288 runs/day = 864 < 1000
    assert all(any(set(q['ids'])&X.PASS for q in qs) for qs in per)   # 17:30 IST peak: pass pandals every run
    assert all(any(q.get('kind')=='wide' for q in qs) for qs in per)  # wide openings every run
    assert X.PASS<=set(pas) and {p['id'] for p in X.P}<=set(all_)
    print('ok rotation: pass cycle runs', max(pas.values())+1, 'all cycle runs', max(all_.values())+1)
def _ingest(posts):
    f=X.ST+'/r.json'; json.dump({'data':[{'id':str(1000+i),'author_id':'u','created_at':a,'text':t} for i,(a,t) in enumerate(posts)],'includes':{'users':[{'id':'u','username':'someone'}]}},open(f,'w'))
    X.now=dt.datetime(2026,10,13,13,0,tzinfo=dt.UTC)
    with contextlib.redirect_stdout(io.StringIO()): X.ingest([f])
def test_wide_ingest():
    fresh()
    _ingest([('2026-10-12T14:00:00Z','Behala Club Durga Puja inaugurated tonight in Kolkata'),
             ('2026-10-12T15:00:00Z','Minister inaugurated Garfa Sammilani Sarbojanin Durga Puja in Kolkata today'),
             ('2026-10-12T16:00:00Z','Kolkata: Lake Town Adhibasi Brinda will inaugurate on Friday'),
             ('2026-10-08T16:00:00Z','Inaugurated Golf Green Sarbojanin pandal Kolkata')])
    assert 'behala-club' in X.live['open']
    c=json.load(open(X.CANDS))['items']
    assert len(c)==1 and any('Garfa Sammilani Sarbojanin' in n for n in c[0]['names']), c
    assert not any('garfa' in k for k in X.live['open'])
    print('ok wide ingest')
if __name__=='__main__': test_rotation(); test_wide_ingest()

def test_cm_inauguration_list_opens_named_pandals():
    fresh()
    full=("দেবীপক্ষের সূচনা ও শুভ নবরাত্রি'র দ্বিতীয় দিনে কলকাতার ঐতিহ্যবাহী ক্লাব \n📍 টালা প্রত্যয়, কলকাতা \n📍চোরবাগান সার্বজনীন, কলকাতা \n"
          "📍শ্রীশ্রী সরস্বতী ও কালীমাতা মন্দির পরিষদ, বেলেঘাটা\n📍লেকপল্লী সার্বজনীন, সন্তোষপুর\n📍চেতলা অগ্রণী, ভবানীপুর \n📍অরুণোদয় সমিতি, বেহালা\n"
          "📍২৫ পল্লী সার্বজনীন, খিদিরপুর\n📍ক্লাব মুক্তদল সার্বজনীন, ভবানীপুর\n📍অ্যালেন পার্ক সার্বজনীন, পার্ক স্ট্রীট\nআয়োজিত শ্রীশ্রী দুর্গাপুজোর শুভ উদ্বোধনী অনুষ্ঠানে উপস্থিত ছিলাম।")
    f=X.ST+'/cm.json'
    json.dump({'data':[{'id':'2109717078550978709','author_id':'cm','created_at':'2026-10-12T18:45:22Z','text':full[:140]+' https://t.co/x','note_tweet':{'text':full}}],
               'includes':{'users':[{'id':'cm','username':'SuvenduWB'}]}},open(f,'w'),ensure_ascii=False)
    X.now=dt.datetime(2026,10,13,16,0,tzinfo=dt.UTC)
    with contextlib.redirect_stdout(io.StringIO()): X.ingest([f])
    got=set(X.live['open'])
    assert {'tala-prattoy','chorebagan-sarbojanin','santoshpur-lake-pally','chetla-agrani','25-pally-khidirpur','behala-arunoday-samiti','club-muktadal-bhowanipur','allen-park-sarbojanin'}<=got, got
    assert not got-{'tala-prattoy','chorebagan-sarbojanin','santoshpur-lake-pally','chetla-agrani','25-pally-khidirpur','behala-arunoday-samiti','club-muktadal-bhowanipur','allen-park-sarbojanin'}, got
    print('ok cm list')
def test_inaugurators_polled_in_existing_call():
    per,_,_=simulate(4)
    assert all(len(q)<=3 for q in per)
    assert any('from:suvenduwb' in q['args']['query'] and 'from:cmowbgov' in q['args']['query'] for qs in per for q in qs)
    assert all('note_tweet' in q['args']['post.fields'] for qs in per for q in qs)
def test_trusted_handles_match_real_accounts():
    # @IndiContractor was vetted 13 Oct; the set is compared against lower-cased X usernames.
    assert 'indicontractor' in X.TRUSTED, X.TRUSTED
# budget schedule + quiet hours: see test_budget.py
