import json,sys,re
sys.path.insert(0,'/workspace/app/pipeline')
from difflib import SequenceMatcher as SM
STOP={'sarbojanin','sarbajanin','durga','puja','pujo','club','sangha','samity','samiti','kolkata','the','durgotsav','durgotsab','committee','sporting','park','pally','palli','sarbojonin','utsav'}
def toks(s): return [t for t in re.findall(r'[a-z0-9]+',s.lower()) if t not in STOP]
def score(w,g):
    w,g=toks(w),toks(g)
    if not w or not g: return 0
    if {t for t in w if t.isdigit()}-set(g): return 0
    hit=sum(1 for a in w if any(SM(None,a,b).ratio()>=0.8 for b in g))/len(w)
    return max(hit, SM(None,''.join(w),''.join(g)).ratio())
import math
def hav(a,b): p=math.radians;x=math.sin(p(b[0]-a[0])/2)**2+math.cos(p(a[0]))*math.cos(p(b[0]))*math.sin(p(b[1]-a[1])/2)**2;return 2*6371000*math.asin(math.sqrt(x))
ag=[o for o in json.load(open('agamoni.json')) if o['pin']]
d=json.load(open('/workspace/app/src/data/dhaak.v1.json'))
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
res=[]
for p in d['pandals']:
    names=[p['name']]+ALIASES.get(p['name'],[])
    c=sorted(((max(score(n,o['name']) for n in names),o) for o in ag),key=lambda x:-x[0])[:3]
    best=c[0]
    dist=hav((p['lat'],p['lng']),best[1]['pin']) if p['lat'] and best[0]>=.85 else None
    res.append(dict(id=p['id'],name=p['name'],prec=p['precision'],ours=[p['lat'],p['lng']],sc=round(best[0],2),ag=best[1]['name'],agpin=best[1]['pin'],addr=best[1]['addr'][:70],d=round(dist) if dist is not None else None,alt=[(round(s,2),o['name']) for s,o in c[1:] if s>=.85]))
json.dump(res,open('match.json','w'),indent=1)
for r in res: print(r['prec'][:3],r['d'],r['sc'],r['name'],'=>',r['ag'],r['alt'] or '')
