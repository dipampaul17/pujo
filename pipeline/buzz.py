"""2026 buzz signals per pandal from public Google News RSS (counts of 2026-dated headlines naming the pandal,
plus theme/crowd keywords). Writes raw/buzz.json. Real counts only; no sentiment guessing."""
import json, re, sys, os, urllib.request, urllib.parse, xml.etree.ElementTree as ET, datetime as dt
from concurrent.futures import ThreadPoolExecutor
H=os.path.dirname(__file__); data=json.load(open(sys.argv[1]))
ALT={'Sree Bhumi Sporting Club':'Sreebhumi','Chaltabagan Lohapatty':'Chaltabagan','Baghbazar Sarbojanin':'Bagbazar Sarbojanin','Sovabazar Rajbari':'Shobhabazar Rajbari','Bhowanipur 75 Pally':'75 Pally'}
def norm(s): return re.sub(r'[^a-z0-9 ]',' ',s.lower())
def one(p):
    name=ALT.get(p['name'],p['name']); key=norm(name).split()
    url='https://news.google.com/rss/search?'+urllib.parse.urlencode({'q':f'"{name}" puja','hl':'en-IN','gl':'IN','ceid':'IN:en'})
    try: root=ET.fromstring(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'dhaak-buzz/1.0'}),timeout=20).read())
    except Exception as e: return p['id'],None
    n26=0; theme=0; heads=[]
    for it in root.iter('item'):
        t=it.findtext('title') or ''
        try: y=dt.datetime.strptime(it.findtext('pubDate'),'%a, %d %b %Y %H:%M:%S %Z').year
        except Exception: continue
        if y!=2026 or not all(k in norm(t) for k in key): continue
        n26+=1; heads.append(t)
        if re.search(r'theme|install|replica|grand|biggest|tallest|art|concept',t,re.I): theme+=1
    return p['id'],{'news2026':n26,'theme2026':theme,'sample':heads[:2]}
with ThreadPoolExecutor(6) as ex: res=dict(ex.map(one,data['pandals']))
json.dump(res,open(f'{H}/raw/buzz.json','w'),indent=1,ensure_ascii=False)
print(sorted(((v or {}).get('news2026',0),k) for k,v in res.items())[-15:])
