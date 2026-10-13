"""Open-status evidence. Merges hand-checked X evidence (raw/x_status.json) with Google News RSS headlines
that say a guide pandal was inaugurated in 2026. Writes public/live/status.json. Evidence only; no guessing."""
import json, re, sys, os, urllib.request, urllib.parse, xml.etree.ElementTree as ET, datetime as dt
from concurrent.futures import ThreadPoolExecutor
H=os.path.dirname(__file__); data=json.load(open(sys.argv[1])); out=sys.argv[2]
ev={k:v for k,v in json.load(open(f'{H}/raw/x_status.json')).items() if not k.startswith('_')}
try: xl=json.load(open(f'{H}/state/xlive.json'))
except Exception: xl={'open':{},'posts':{},'crowd':{}}
for k,v in xl.get('open',{}).items(): ev.setdefault(k,v)
try: pin=json.load(open(f'{H}/state/pinned.json'))
except Exception: pin={}
PASS=set(json.load(open(f'{H}/../src/data/passport.json'))['ids'])  # inauguration sweep: pass pandals first
def _merge(a,b,cap=4):
    out,seen=[],set()
    for q in a+b:
        if q['id'] in seen: continue
        seen.add(q['id']); out.append(q)
    return out[:cap]
_posts={k:_merge([q for q in pin.get(k,[]) if q.get('evidence')]+xl.get('posts',{}).get(k,[]),pin.get(k,[])) for k in set(pin)|set(xl.get('posts',{}))}
json.dump({'posts':_posts,'crowd':xl.get('crowd',{}),'area':xl.get('area',[])},open(os.path.join(os.path.dirname(out),'x.json'),'w'),ensure_ascii=False,sort_keys=True)
def norm(s): return re.sub(r'[^a-z0-9 ]',' ',s.lower())
def one(p):
    url='https://news.google.com/rss/search?'+urllib.parse.urlencode({'q':f'"{p["name"]}" inaugurated','hl':'en-IN','gl':'IN','ceid':'IN:en'})
    try: root=ET.fromstring(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'dhaak-status/1.0'}),timeout=15).read())
    except Exception: return None
    for it in root.iter('item'):
        t=it.findtext('title') or ''
        try: d=dt.datetime.strptime(it.findtext('pubDate'),'%a, %d %b %Y %H:%M:%S %Z')
        except Exception: continue
        if d.year==2026 and d.month>=9 and norm(p['name']) in norm(t) and re.search(r'inaugurat',t,re.I) and not re.search(r'\b(to|will|set to|may|likely to) inaugurat',t,re.I):
            return p['id'],{'since':d.date().isoformat(),'evidence':it.findtext('link'),'note':re.sub(r' - [^-]+$','',t)}
    return None
# Global rule (status_rules.py): gather every source per pandal, classify, merge sticky with what was published.
from status_rules import classify, decide
trusted={h.lower() for h in ['abasu4ever']}
try: man={k:v for k,v in json.load(open(f'{H}/raw/status_sources.json')).items() if not k.startswith('_')}
except Exception: man={}
try: prev=json.load(open(out)).get('open',{})
except Exception: prev={}
src={}
add=lambda k,s: src.setdefault(k,[]).append(s)
for k,v in json.load(open(f'{H}/raw/x_status.json')).items():
    if not k.startswith('_'): add(k,{'url':v['evidence'],'at':v['since'],'text':v.get('note',''),'hand':True,**({'kind_hint':v['kind']} if v.get('kind') else {})})
for k,l in man.items():
    for v in l: add(k,{**v,'hand':True})
for k,v in xl.get('open',{}).items(): add(k,{'url':v['evidence'],'at':v['since'],'text':v.get('note','')})
for k,l in list(xl.get('posts',{}).items())+list(pin.items()):
    for q in (l if isinstance(l,list) else [l]): add(k,{'url':q['url'],'at':q.get('at',''),'text':q.get('text',''),**({'hand':True} if q.get('evidence') else {})})
with ThreadPoolExecutor(6) as ex:
    for r in ex.map(one,sorted([p for p in data['pandals'] if p['id'] not in prev and p['id'] not in src],key=lambda p:p['id'] not in PASS)):
        if r: add(r[0],{'url':r[1]['evidence'],'at':r[1]['since'],'text':r[1]['note'],'outlet':True})
ids={p['id'] for p in data['pandals']}
ev={}
for k in ids:
    got=[c for c in (classify(s,trusted) for s in src.get(k,[])) if c]
    for c,s in zip(got,[s for s in src.get(k,[]) if classify(s,trusted)]):
        if s.get('kind_hint')=='visitors' and c['kind']!='closed': c['kind']='visitors'
    d=decide(prev.get(k),got)
    if d and d['kind']!='closed': ev[k]=d
    elif d: ev[k]=d  # closure is published too; the app shows it as closed
os.makedirs(os.path.dirname(out),exist_ok=True)
new={'puja':{'start':'2026-10-16','end':'2026-10-21'},'open':ev}
json.dump({'updated':dt.datetime.now(dt.UTC).replace(microsecond=0,tzinfo=None).isoformat()+'Z','puja':{'start':'2026-10-16','end':'2026-10-21','public_from':'2026-10-15T18:00:00+05:30'},'open':ev},open(out,'w'),ensure_ascii=False,indent=1)
print(len(ev),'with open evidence:',list(ev))
