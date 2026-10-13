"""Live feed job (runs in GitHub Actions cron). Pulls public Google News RSS for 2026 Pujo award coverage,
matches headlines to guide pandals by name, writes public/live/awards.json. Never infers a winner: we only
store headlines that name a pandal, with source + link + time."""
import json, re, sys, urllib.request, urllib.parse, xml.etree.ElementTree as ET, datetime, os
QUERIES=['Durga Puja award 2026 Kolkata','Biswa Bangla Sharad Samman 2026','Asian Paints Sharad Shamman 2026','CESC Telegraph True Spirit Puja 2026']
data=json.load(open(sys.argv[1])); pandals=data['pandals']
def norm(s): return re.sub(r'[^a-z0-9 ]',' ',s.lower())
items={}
from collections import Counter
C=Counter(w for p in pandals for w in set(norm(p['name']).split()))
UNIQ={p['id']:[w for w in norm(p['name']).split() if len(w)>=8 and C[w]==1 and w not in('sarbojanin','sarbajanin','sammilani')] for p in pandals}
for q in QUERIES:
    url='https://news.google.com/rss/search?'+urllib.parse.urlencode({'q':q,'hl':'en-IN','gl':'IN','ceid':'IN:en'})
    try: root=ET.fromstring(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'dhaak-feed/1.0'}),timeout=20).read())
    except Exception as e: print('fail',q,e); continue
    for it in root.iter('item'):
        t=it.findtext('title') or ''; link=it.findtext('link'); pub=it.findtext('pubDate'); src=it.find('source')
        try: dt=datetime.datetime.strptime(pub,'%a, %d %b %Y %H:%M:%S %Z')
        except Exception: continue
        if dt.year<2026 or not re.search(r'award|samman|shamman|winner',t,re.I) or not re.search(r'puja|pujo|pandal|durga|sharad',t,re.I): continue
        words=set(norm(t).split())
        hits=[p['id'] for p in pandals if (len(p['name'])>6 and norm(p['name']) in norm(t)) or any(w in words for w in UNIQ.get(p['id'],[]))]
        items[link]={'title':t,'link':link,'source':src.text if src is not None else 'Google News','published':dt.isoformat()+'Z','pandals':hits}
out={'updated':datetime.datetime.now(datetime.UTC).replace(tzinfo=None).replace(microsecond=0).isoformat()+'Z','via':'Google News RSS','items':sorted(items.values(),key=lambda x:x['published'],reverse=True)[:30]}
os.makedirs(os.path.dirname(sys.argv[2]),exist_ok=True); json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
print(len(out['items']),'items',sum(bool(i['pandals']) for i in out['items']),'matched')
