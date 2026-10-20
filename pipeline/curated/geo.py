import json,time,urllib.request,urllib.parse,os
from list import L
c=json.load(open('geo.json')) if os.path.exists('geo.json') else {}
for n,_,_,q in L:
  if q in c: continue
  u='https://nominatim.openstreetmap.org/search?'+urllib.parse.urlencode({'q':q,'format':'json','limit':3,'viewbox':'88.25,22.65,88.48,22.42','bounded':1})
  r=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'raya-dp-pujo/1 dipampaul17'})))
  c[q]=[(x['display_name'][:110],float(x['lat']),float(x['lon'])) for x in r]; time.sleep(1.1)
json.dump(c,open('geo.json','w'),indent=0)
for n,_,_,q in L: print(n,'=>',c[q][:2])
