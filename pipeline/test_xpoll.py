"""Rotation: pass pandals searched in every run; every pandal covered in a bounded number of runs; budget kept."""
import os, sys, tempfile, datetime as dt
H=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,H)
def simulate(runs=40):
    import xpoll as X
    X.ST=tempfile.mkdtemp(); X.live={'polled':{},'posts':{},'crowd':{},'open':{}}
    t0=dt.datetime(2026,10,13,12,0,tzinfo=dt.UTC); seen_all={}; seen_pass={}; per=[]
    import io, contextlib
    for r in range(runs):
        X.now=t0+dt.timedelta(minutes=5*r)
        with contextlib.redirect_stdout(io.StringIO()): qs=X.plan()
        per.append(qs)
        for q in qs:
            assert len(q['args']['query'])<=1100, len(q['args']['query'])
            for i in q['ids']:
                X.live['polled'][i]=X.now.isoformat(); seen_all.setdefault(i,r)
                if i in X.PASS: seen_pass.setdefault(i,r)
    return X, per, seen_all, seen_pass
def test_rotation():
    X, per, all_, pas = simulate()
    assert all(len(q)<=3 for q in per)                       # 3 calls/run * 288 runs = 864/day < 1000
    assert all(any(set(q['ids'])&X.PASS for q in qs[1:]) for qs in per)  # a pass slot every run
    assert X.PASS<=set(all_), X.PASS-set(all_)
    assert {p['id'] for p in X.P}<=set(all_), {p['id'] for p in X.P}-set(all_)
    print('ok rotation: pass cycle runs', max(pas.values())+1, 'all cycle runs', max(all_.values())+1)
if __name__=='__main__': test_rotation()
