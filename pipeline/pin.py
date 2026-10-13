"""Step 2b: second pass for pandals still unpinned. Matches against a local dump of named OSM features
(raw/candidates.json) and Photon, using known spelling variants. Accept only if the name matches
(same rule as build.py) AND the hit is within 2.5 km of the pandal's guide metro station."""
import json, math, re, sys, os, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from difflib import SequenceMatcher as SM
H=os.path.dirname(__file__)
ALIASES={  # spelling variants seen in Kolkata usage, not new places
 'Sree Bhumi Sporting Club':['Sreebhumi Sporting Club','Sreebhumi'],'Chaltabagan Lohapatty':['Chaltabagan Lohapatti','Lohapatty Durga Puja'],
 'Hatibagan Nabinpally':['Hatibagan Nabin Pally','Nabinpally'],'Kumartuli Park':['Kumartuli Park Sarbojanin'],'Kumartuli Sarbojanin':['Kumartuli Sarbojanin Durgotsav'],
 'Sovabazar Rajbari':['Shobhabazar Rajbari','Sobhabazar Rajbari'],'Janbazar Rajbari':['Rani Rashmoni Bari','Rani Rashmoni Rajbari'],
 'Naba Durga':['Nabadurga'],'Telengabagan':['Telenga Bagan','Telengabagan Sarbojanin'],'Nwapara Udayan Sangha':['Noapara Udayan Sangha'],
 'Haridevpur 41 Pally':['41 Pally Club','Haridevpur 41 Palli'],'Dum Dum Park Sarbajanin':['Dum Dum Park Sarbojanin'],
 'Bosepukur Sitala Mandir':['Bosepukur Shitala Mandir','Sitala Mandir'],'Kamdahari Purbapara':['Kamdahari Purba Para'],
 'Roynagar Unyan Samity':['Roynagar Unnayan Samity'],'Agradut Udaya Sangha':['Agradoot Udaya Sangha'],'Shyama Pally':['Shyamapally','Shyama Palli'],
 'Naktala Pally Unnayan Samity':['Pally Unnayan Samity Naktala'],'Jorasanko Sadharan':['Jorasanko Sadharan Durgotsab'],'Lalabagan Nabankur':['Nabankur'],
 'College Square':['College Square Sarbojanin'],'Mudiali':['Mudiali Club'],'Kapalitola Sarbajanin':['Kapalitola Sarbojanin'],
}
# Rejected after manual review: matched a park, street, locality or different club, not the pandal.
REJECT={'Dum Dum Park Sarbajanin','Hindusthan Club','Naktala Pally Unnayan Samity','New Sporting Club','Sinthee Sarbojanin','Haridevpur 41 Pally','Telengabagan','Regent Park'}
STOP={'sarbojanin','sarbajanin','durga','puja','pujo','club','sangha','samity','samiti','kolkata','the','durgotsav','durgotsab','committee','sporting','park','pally','palli'}
def toks(s): return [t for t in re.findall(r'[a-z0-9]+',s.lower()) if t not in STOP]
def ok(want,got):
    w,g=toks(want),toks(got)
    if not w: w,g=re.findall(r'[a-z0-9]+',want.lower()),re.findall(r'[a-z0-9]+',got.lower())
    if not w or {t for t in w if t.isdigit()}-set(g): return False
    hit=sum(1 for a in w if any(SM(None,a,b).ratio()>=0.8 for b in g))
    return hit==len(w) or SM(None,''.join(w),''.join(g)).ratio()>=0.88
def hav(a,b,c,d):
    p=math.radians;x=math.sin(p(c-a)/2)**2+math.cos(p(a))*math.cos(p(c))*math.sin(p(d-b)/2)**2;return 2*6371000*math.asin(math.sqrt(x))
cands=[]
for e in json.load(open(f'{H}/raw/candidates.json'))['elements']:
    la=e.get('lat') or e.get('center',{}).get('lat'); lo=e.get('lon') or e.get('center',{}).get('lon')
    for k in ('name','name:en','alt_name','old_name'):
        if e['tags'].get(k): cands.append((e['tags'][k],la,lo,f"osm:{e['type']}/{e['id']}"))
import geocode as G  # reuses Photon cache + station table
pan=json.load(open(sys.argv[1])); n=0
for p in pan:
    if p['precision']=='osm' and ok(p['name'],p.get('osmMatch') or ''): continue
    anchor=p.get('stationLatLng'); best=None
    names=[p['name']]+ALIASES.get(p['name'],[])
    for nm in names:
        hits=[(hav(la,lo,*anchor) if anchor else 0,c,la,lo,src) for c,la,lo,src in cands if ok(nm,c)]
        hits=[h for h in hits if not anchor or h[0]<=2500]
        if hits: best=min(hits); break
        r=G.get('https://photon.komoot.io/api/?'+urllib.parse.urlencode({'q':nm+' Kolkata','limit':5,'bbox':'88.25,22.40,88.52,22.72',**({'lat':anchor[0],'lon':anchor[1]} if anchor else {})}))
        for f in (r or {}).get('features',[]):
            lo,la=f['geometry']['coordinates']; c=f['properties'].get('name') or ''
            d=hav(la,lo,*anchor) if anchor else 0
            if ok(nm,c) and (not anchor or d<=2500): best=(d,c,la,lo,'photon'); break
        if best: break
    if best and p['name'] in REJECT: print('REJECT',p['name'],'=>',best[1]); best=None
    if best:
        p.update(lat=best[2],lng=best[3],precision='osm',osmMatch=best[1],pinSource=best[4],pinAlias=None if best[1]==p['name'] else best[1]); n+=1
        print('PIN',p['name'],'=>',best[1],round(best[0]),'m',best[4])
    else: print('---',p['name'])
json.dump(G.cache,open(G.CACHE,'w'))
json.dump(pan,open(sys.argv[2],'w'),indent=1,ensure_ascii=False); print('newly pinned',n)
