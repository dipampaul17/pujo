import json,os,sys,datetime as dt
H=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,H); sys.argv=['t','none']
from aliases import aliases,hits
import xpoll as X
D={p['id']:p for p in json.load(open(f'{H}/../src/data/dhaak.v1.json'))['pandals']}
P=list(D.values())
def ids(t): return {p['id'] for p in hits(P,t)}
def oh(t,d='2026-10-12T10:00:00+00:00'): return {p['id'] for p in X.open_hits(t,dt.datetime.fromisoformat(d))}
def test_variants():
    assert 'chetla-agrani' in ids('Went to Chetla Agrani Club tonight')
    assert 'chetla-agrani' in ids('আজ উদ্বোধন, চেতলা অগ্রণী')
    for s in ['Sribhumi','Sreebhumi','Sree Bhumi','শ্রীভূমি']: assert 'sree-bhumi-sporting-club' in ids(s+' puja'),s
    assert 'kumartuli-sarbojanin' in ids('Kumortuli Sarbojanin 2026')
    assert 'beniatola-sarbojanin' in ids('Beniatola Sarbojonin pandal')
    assert 'tala-prattoy' in ids('টালা প্রত্যয় দুর্গাপুজো')
    assert 'nalin-sarkar-street' in ids('📍 Nalin Sarkar Street Sarbojanin.')
def test_no_false_alias():
    assert not ids('New Sporting landmark in Karachi')
    assert 'janbazar-rajbari' not in ids('Rani Rashmoni Green University')
    assert 'chetla-agrani' not in ids('Chetla market')
def test_open_rules():
    assert 'tala-prattoy' in oh('কলকাতার টালা প্রত্যয় দুর্গাপুজোর উদ্বোধন করলেন মুখ্যমন্ত্রী')
    assert oh('CM inaugurated the Durga Pujas of Santosh Mitra Square and Sree Bhumi Sporting Club')>={'santosh-mitra-square','sree-bhumi-sporting-club'}
    assert 'barisha-club' in oh('#4 Visited Barisha Club One outstanding creation.')
    assert not oh('Ahiritola Sarbojonin. Will be open for Public 15th October (Evening onwards) durga')
    assert not oh('CM to inaugurate Chetla Agrani pandal tomorrow')
    assert not oh('Throwback to Kolkata Durga Puja 2025- Chetla Agrani club puja pandal')
    assert not oh('Tala Prattoy Durga Puja 2026 কীভাবে যাবেন? Walking Route')
    assert not oh('Sribhumi Police gym inaugurated by SSP')
    assert not oh('Ekdalia crowd visited already', '2026-10-08T05:00:00+00:00')
    assert not oh('Maddox Square Durga getting ready now, crowd unites')
def test_plan_covers_all_quickly():
    import tempfile, datetime as dt; t_save=X.now
    # evening (19:00 IST, 3 calls/run): full sweep within 12 runs; quiet hours (1 call/run): within 24
    for t0,cap in ((dt.datetime(2026,10,14,13,30,tzinfo=dt.timezone.utc),12),(dt.datetime(2026,10,14,4,0,tzinfo=dt.timezone.utc),24)):
        X.live['polled']={}; X.ST=tempfile.mkdtemp(); seen=set(); runs=0
        while len(seen)<len(X.P) and runs<60:
            X.now=t0+dt.timedelta(minutes=5*runs); qs=X.plan(); runs+=1
            for q in qs:
                assert len(q['args']['query'])<=1024
                seen|=set(q['ids'])
                for i in q['ids']: X.live['polled'][i]=f'2026-10-14T{runs:02d}'
        assert len(seen)==len(X.P) and runs<=cap, (cap,runs)
    X.now=t_save
if __name__=='__main__':
    for k,v in list(globals().items()):
        if k.startswith('test_'): v(); print('ok',k)
