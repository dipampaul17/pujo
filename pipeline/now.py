"""'Now' strip feed. Public Google News RSS only (Kolkata Police / Metro / weather coverage surfaces there).
Keeps practical items (traffic, diversions, metro timings, crowds, rain, closures) from the last 6 h,
tags each with zones it mentions. Never writes an item without a real source link."""
import json, re, sys, os, urllib.request, urllib.parse, xml.etree.ElementTree as ET, datetime as dt
import os as _o, sys as _s; _s.path.insert(0,_o.path.dirname(_o.path.abspath(__file__))); from jsonio import write_json
data=json.load(open(sys.argv[1])); out_path=sys.argv[2]
Q=['Kolkata traffic diversion Durga Puja','Kolkata Police Puja traffic advisory','Kolkata Metro Puja timings extended','Kolkata rain Durga Puja forecast','Kolkata pandal crowd entry closed','Kolkata road closed pandal']
PRACTICAL=r'traffic|diversion|divert|road clos|roads clos|closed for|no.entry|one.way|metro (service|timing|run|hours|till|until|extended)|extended hours|rain|storm|thunder|downpour|weather alert|crowd|queue|rush|advisory|parking'
ZONEWORDS={'north':['north kolkata','shyambazar','bagbazar','baghbazar','kumartuli','hatibagan','sovabazar','shobhabazar','dum dum','sreebhumi','lake town','belgachia','girish park','college street','salt lake','bidhannagar'],
 'central':['central kolkata','esplanade','park street','chandni','bowbazar','sealdah','bhowanipore','bhowanipur','rabindra sadan','santosh mitra'],
 'south':['south kolkata','kalighat','rashbehari','gariahat','ballygunge','tollygunge','behala','jadavpur','garia','naktala','chetla','deshapriya','suruchi','tridhara','ekdalia','singhi park','patuli','santoshpur','kasba']}
CITYWIDE=r'metro|rain|weather|storm|thunder|downpour|traffic advisory|citywide|across the city'
now=dt.datetime.now(dt.UTC).replace(tzinfo=None); items={}
for q in Q:
    url='https://news.google.com/rss/search?'+urllib.parse.urlencode({'q':q+' when:1d','hl':'en-IN','gl':'IN','ceid':'IN:en'})
    try: root=ET.fromstring(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'dhaak-now/1.0'}),timeout=20).read())
    except Exception as e: print('fail',q,e); continue
    for it in root.iter('item'):
        t=it.findtext('title') or ''; link=it.findtext('link'); src=it.find('source')
        try: pub=dt.datetime.strptime(it.findtext('pubDate'),'%a, %d %b %Y %H:%M:%S %Z')
        except Exception: continue
        if (now-pub).total_seconds()>6*3600 or not re.search(PRACTICAL,t,re.I) or not re.search(r'kolkata|calcutta|puja|pujo|pandal',t,re.I): continue
        low=t.lower(); zones=[z for z,ws in ZONEWORDS.items() if any(w in low for w in ws)]
        pids=[p['id'] for p in data['pandals'] if len(p['name'])>8 and p['name'].lower() in low]
        if not zones and re.search(CITYWIDE,t,re.I): zones=['all']
        if not zones and not pids: continue
        items[link]={'title':re.sub(r' - [^-]+$','',t),'source':src.text if src is not None else 'Google News','link':link,'published':pub.isoformat()+'Z','zones':zones,'pandals':pids}
os.makedirs(os.path.dirname(out_path),exist_ok=True)
write_json(out_path,{'updated':now.replace(microsecond=0).isoformat()+'Z','items':sorted(items.values(),key=lambda x:x['published'],reverse=True)[:12]},ensure_ascii=False,indent=1)
print(len(items),'now items')
