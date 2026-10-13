"""Step 2: geocode pandals (Photon/OSM), biased to their metro station. Cached; accept only hits within 3 km of the station.
Fallback: station coordinates, flagged precision='station'."""
import json, math, os, sys, time, urllib.parse, urllib.request
H=os.path.dirname(__file__); CACHE=f'{H}/raw/geocache.json'
cache=json.load(open(CACHE)) if os.path.exists(CACHE) else {}
UA={'User-Agent':'dhaak-pujo/1.0'}
def get(url):
    if url in cache: return cache[url]
    for _ in range(3):
        try:
            r=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=10)); cache[url]=r; return r
        except Exception as e: time.sleep(1)
    return None
def hav(a,b,c,d):
    R=6371;p=math.radians;x=math.sin(p(c-a)/2)**2+math.cos(p(a))*math.cos(p(c))*math.sin(p(d-b)/2)**2;return 2*R*math.asin(math.sqrt(x))
st={}
for e in json.load(open(f'{H}/raw/stations.json'))['elements']:
    n=e['tags'].get('name','');
    if e['tags'].get('station')=='subway' or n not in st: st[n.split(' (')[0].replace(' Metro Station','')]=(e['lat'],e['lon'])
ALIAS={'MG Road':'Mahatma Gandhi Road','Mg Road':'Mahatma Gandhi Road','Netaji / Kudghat':'Netaji','Kavi Subhash':'Kavi Subhash'}
def station(n):
    n=ALIAS.get(n,n)
    if n in st: return st[n]
    r=get('https://photon.komoot.io/api/?'+urllib.parse.urlencode({'q':f'{n} metro station Kolkata','limit':1,'lat':22.55,'lon':88.37}))
    f=(r or {}).get('features') or []
    if f: lo,la=f[0]['geometry']['coordinates']; st[n]=(la,lo); return st[n]
pan=json.load(open(sys.argv[1]))
def one(p):
    anchor=None
    if p['stations']: anchor=station(p['stations'][0]); p['stationLatLng']=anchor
    best=None
    for q in [f"{p['name']} Durga Puja Kolkata", f"{p['name']} Kolkata"]:
        params={'q':q,'limit':5,'bbox':'88.25,22.40,88.52,22.72'}
        if anchor: params.update(lat=anchor[0],lon=anchor[1])
        r=get('https://photon.komoot.io/api/?'+urllib.parse.urlencode(params))
        for f in (r or {}).get('features',[]):
            lo,la=f['geometry']['coordinates']
            d=hav(la,lo,*anchor) if anchor else 0
            if anchor and d>3: continue
            best=(la,lo,f['properties'].get('name'),round(d,2)); break
        if best: break
    if best: p.update(lat=best[0],lng=best[1],precision='osm',osmMatch=best[2])
    elif anchor: p.update(lat=anchor[0],lng=anchor[1],precision='station')
    else: p.update(lat=None,lng=None,precision='none')
    print(p['name'],'->',p['precision'],p.get('osmMatch'),flush=True); return p
from concurrent.futures import ThreadPoolExecutor
for p in pan:
    if p['stations']: station(p['stations'][0])
with ThreadPoolExecutor(4) as ex: out=list(ex.map(one,pan))
json.dump(cache,open(CACHE,'w')); json.dump({'stations':st},open(f'{H}/raw/stations_resolved.json','w'))
json.dump(out,open(sys.argv[2],'w'),indent=1,ensure_ascii=False)
