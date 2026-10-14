"""Step 3: validate, dedupe, score, attach amenities, emit versioned JSON (src/data/dhaak.v1.json).
Fails loudly on schema violations. Deterministic: sorted output, no timestamps except source fetch date."""
import json, math, os, re, sys, hashlib
H=os.path.dirname(__file__); R=f'{H}/raw'
def hav(a,b,c,d):
    p=math.radians;x=math.sin(p(c-a)/2)**2+math.cos(p(a))*math.cos(p(c))*math.sin(p(d-b)/2)**2;return 2*6371000*math.asin(math.sqrt(x))
STOP={'sarbojanin','sarbajanin','durga','puja','pujo','club','sangha','samity','kolkata','the','durgotsav','committee','sporting','park'}
def toks(s): return {t for t in re.findall(r'[a-z0-9]+',s.lower()) if t not in STOP}
from difflib import SequenceMatcher as SM
def name_ok(want,got,a,b):
    if not want: return False
    if {t for t in want if t.isdigit()} - got: return False
    hit=sum(1 for w in want if any(SM(None,w,g).ratio()>=0.75 for g in got))
    if hit/len(want)>=0.75: return True
    j=lambda s:''.join(t for t in re.findall(r'[a-z0-9]+',s.lower()) if t not in STOP)
    return SM(None,j(a),j(b)).ratio()>=0.85
def slug(s): return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
def load(n):
    f=f'{R}/{n}.json'
    try: return json.load(open(f))['elements']
    except Exception: return []
def pt(e): return (e.get('lat') or e.get('center',{}).get('lat'), e.get('lon') or e.get('center',{}).get('lon'))
# --- pandals
def _j(f):
    try: return json.load(open(f))
    except Exception: return {}
BUZZ=_j(f'{R}/buzz.json'); XC={k:v for k,v in _j(f'{R}/x_counts.json').items() if not k.startswith('_')}
raw=json.load(open(sys.argv[1])); seen={}; pandals=[]; rejected=[]
FAMOUS={'Sree Bhumi Sporting Club':'Expect very long queues','Maddox Square':'Known for Pujo adda','Kumartuli Park':None}
for p in raw:
    if p['name'].lower().startswith(('nearby','surrounding')): continue
    k=slug(p['name'])
    if k in seen: continue
    seen[k]=1
    prec=p['precision']
    if prec=='osm':  # name check: every distinctive token of ours must appear in the OSM name
        want, got = toks(p['name']), toks(p.get('osmMatch') or '')
        if not name_ok(want,got,p['name'],p.get('osmMatch') or ''):
            rejected.append((p['name'],p.get('osmMatch'))); prec='station'
            if p.get('stationLatLng'): p['lat'],p['lng']=p['stationLatLng']
            else: p['lat']=p['lng']=None; prec='none'
    OSM_ST={e['tags'].get('name','').split(' (')[0] for e in load('stations')}
    if prec=='station' and p['stations'] and {'MG Road':'Mahatma Gandhi Road','Netaji / Kudghat':'Netaji'}.get(p['stations'][0],p['stations'][0]) not in OSM_ST:
        prec='none'; p['lat']=p['lng']=None  # station itself only geocoded fuzzily: hide rather than guess
    q=min(3,len(p['circuits'])*1.5 + (1 if p['name'] in FAMOUS else 0) + (0.5 if p['stations'] else 0))
    buzz=BUZZ.get(k) or {}; x=XC.get(k,0); n=buzz.get('news2026',0); th=buzz.get('theme2026',0)
    worth=round(q + math.log1p(n)*1.0 + math.log1p(x)*0.5 + min(th,2)*0.5, 2)
    reason='Buzzing this week' if x>=50 else 'Big 2026 theme' if th>=1 else 'In the news' if n>=3 else None
    pandals.append({'worth':worth,'reason':reason,'signals':{'news2026':n,'theme2026':th,'x7d':x},'id':k,'name':p['name'],'station':(p['stations'] or [None])[0],'line':p.get('line'),
        'circuits':p['circuits'],'lat':round(p['lat'],6) if p['lat'] else None,'lng':round(p['lng'],6) if p['lng'] else None,
        'precision':prec,'quality':q,'note':FAMOUS.get(p['name'])})
def near_any(la,lo,r):
    return any(x['lat'] and hav(la,lo,x['lat'],x['lng'])<=r for x in pandals)
NOTABLE=['mitra cafe','indian coffee house','bhojohori manna','balwant singh','arsalan','aminia','kasturi','nizam','peter cat','kookie jar','sharma snacks','haji saheb','shiraz','oh! calcutta','6 ballygunge place','kusum rolls','paramount']
food=[]
for e in load('food'):
    la,lo=pt(e); n=e['tags'].get('name')
    if not(la and n) or not near_any(la,lo,1200): continue
    if re.fullmatch(r'(tea|chai|coffee|food|snacks?)\s*(shop|stall|corner|point)?|restaurant|hotel|cafe|dhaba|canteen',n.strip(),re.I): continue  # unnamed in practice
    food.append({'id':f"f{e['id']}",'name':n,'lat':round(la,6),'lng':round(lo,6),'kind':e['tags'].get('amenity'),
      'cuisine':(e['tags'].get('cuisine') or '').replace('_',' ').replace(';',', ') or None,'notable':any(k in n.lower() for k in NOTABLE)})
# Curated S-tier places (pipeline/curated/make.py): each sourced to a published list, coordinates from OSM.
cur=json.load(open(f'{R}/curated_food.json'))
food=[f for f in food if not any(hav(f['lat'],f['lng'],c['lat'],c['lng'])<60 for c in cur)]+cur
def amen(n,kind,r=1500):
    out=[]
    for e in load(n):
        la,lo=pt(e)
        if la and near_any(la,lo,r): t=e['tags']; out.append({'id':f"{kind[0]}{e['id']}",'name':t.get('name') or {'toilet':'Public toilet','medical':'Clinic','police':'Police'}[kind],
           'lat':round(la,6),'lng':round(lo,6),'kind':kind,'fee':t.get('fee'),'access':t.get('access'),'emergency':t.get('emergency')})
    return out
toilets=amen('toilets','toilet'); medical=amen('medical','medical'); police=amen('police','police')
st=json.load(open(f'{R}/stations_resolved.json'))['stations']
stations=[{'name':n,'lat':round(v[0],6),'lng':round(v[1],6)} for n,v in sorted(st.items()) if v]
# --- schema validation
def check(rows,req):
    for r in rows:
        for f,t in req.items():
            v=r.get(f)
            assert v is None and f in('lat','lng') and r.get('precision')=='none' or isinstance(v,t), (r,f)
        if r.get('lat') is not None: assert 22.3<r['lat']<22.8 and 88.2<r['lng']<88.6, r
check(pandals,{'id':str,'name':str,'lat':float,'lng':float,'precision':str,'quality':(int,float)})
check(food,{'id':str,'name':str,'lat':float,'lng':float}); check(toilets,{'id':str,'lat':float,'lng':float})
assert len({p['id'] for p in pandals})==len(pandals)
key=lambda x:x['id']
data={'version':1,'source':{'guide':'Travel With Preet, Kolkata Durga Puja Pandal Hopping Guide 2026','places':'OpenStreetMap contributors (ODbL), via Overpass + Photon','fetched':sys.argv[3]},
 'pandals':sorted(pandals,key=key),'food':sorted(food,key=key),'toilets':sorted(toilets,key=key),'medical':sorted(medical,key=key),'police':sorted(police,key=key),'stations':stations}
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); import apply_pins; print('pin audit applied',apply_pins.apply(data))
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'passport')); import make as passport; print('passport pandals added',passport.apply(data))
import south_add; print('south pandals added',south_add.apply(data))
s=json.dumps(data,separators=(',',':'),ensure_ascii=False); data['hash']=hashlib.sha1(s.encode()).hexdigest()[:8]
os.makedirs('src/data',exist_ok=True); json.dump(data,open(sys.argv[2],'w'),separators=(',',':'),ensure_ascii=False)
from collections import Counter
print('pandals',len(pandals),Counter(p['precision'] for p in pandals),'food',len(food),'notable',sum(f['notable'] for f in food),'toilets',len(toilets),'medical',len(medical),'police',len(police))
print('rejected fuzzy matches:',rejected)
