"""Open-status evidence. Merges hand-checked X evidence (raw/x_status.json) with Google News RSS headlines
that say a guide pandal was inaugurated in 2026. Writes public/live/status.json. Evidence only; no guessing."""
import json, re, sys, os, urllib.request, urllib.parse, xml.etree.ElementTree as ET, datetime as dt
from concurrent.futures import ThreadPoolExecutor
H=os.path.dirname(__file__); data=json.load(open(sys.argv[1])); out=sys.argv[2]
ev={k:v for k,v in json.load(open(f'{H}/raw/x_status.json')).items() if not k.startswith('_')}
try: xl=json.load(open(f'{H}/state/xlive.json'))
except Exception: xl={'open':{},'posts':{},'crowd':{}}
for k,v in xl.get('open',{}).items(): ev.setdefault(k,v)
json.dump({'posts':xl.get('posts',{}),'crowd':xl.get('crowd',{})},open(os.path.join(os.path.dirname(out),'x.json'),'w'),ensure_ascii=False,sort_keys=True)
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
with ThreadPoolExecutor(6) as ex:
    for r in ex.map(one,[p for p in data['pandals'] if p['id'] not in ev]):
        if r: ev[r[0]]=r[1]
os.makedirs(os.path.dirname(out),exist_ok=True)
new={'puja':{'start':'2026-10-16','end':'2026-10-21'},'open':ev}
json.dump({'updated':dt.datetime.now(dt.UTC).replace(microsecond=0,tzinfo=None).isoformat()+'Z','puja':{'start':'2026-10-16','end':'2026-10-21'},'open':ev},open(out,'w'),ensure_ascii=False,indent=1)
print(len(ev),'with open evidence:',list(ev))
