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
        v=S.VERIFIED.get(k)
        want='osm' if (a and b and S.hav(a,b)<=250) or (v and S.hav(v[0],v[2])<=250) else 'station'
        assert D[k]['precision']==want,(k,D[k]['precision'],want)
        if v: assert (D[k]['lat'],D[k]['lng'])==(round(v[0][0],6),round(v[0][1],6)),k
def test_verified_sources_are_independent_and_named():
    # Google (Agamoni copies Google) vs OpenStreetMap (PPG copies OSM): one pin from each family, both naming the committee.
    for k,(g,gl,o,ol) in S.VERIFIED.items():
        assert gl.startswith('Google: ') and ol.startswith('OSM: '),k
        assert S.hav(g,o)<=250,(k,S.hav(g,o))
def test_tala_park_merged_into_tala_prattoy():
    assert 'tala-park' not in D and 'tala-prattoy' in D
    import aliases; assert 'Tala Park' in aliases.EXTRA['tala-prattoy'] and 'tala-park' not in aliases.EXTRA
def test_no_duplicate_names():
    import re
    norm=lambda s:re.sub(r'[^a-z0-9]','',s.lower())
    seen={}
    for p in D.values():
        k=norm(p['name']); assert k not in seen,(p['id'],seen.get(k)); seen[k]=p['id']
if __name__=='__main__':
    for k,v in list(globals().items()):
        if k.startswith('test_'): v(); print('ok',k)
