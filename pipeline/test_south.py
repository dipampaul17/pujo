"""South audit: added pandals present; verified pins only where PPG and AG agree within 250 m."""
import json, os, sys
H=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,H)
import south_add as S
D={p['id']:p for p in json.load(open(f'{H}/../src/data/dhaak.v1.json'))['pandals']}
def test_all_added_present():
    missing=[k for k in S.SRC if k not in D]; assert not missing, missing
def test_pins_two_sources_or_station():
    for k,(n,pg,ag,st) in S.SRC.items():
        a,b=S.P.get(pg) if pg else None, S.A.get(ag) if ag else None
        want='osm' if a and b and S.hav(a,b)<=250 else 'station'
        assert D[k]['precision']==want,(k,D[k]['precision'],want)
def test_no_duplicate_names():
    import re
    norm=lambda s:re.sub(r'[^a-z0-9]','',s.lower())
    seen={}
    for p in D.values():
        k=norm(p['name']); assert k not in seen,(p['id'],seen.get(k)); seen[k]=p['id']
if __name__=='__main__':
    for k,v in list(globals().items()):
        if k.startswith('test_'): v(); print('ok',k)
