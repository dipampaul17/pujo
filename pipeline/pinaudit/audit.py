import json,math,re,subprocess,urllib.parse,time,html
A={html.unescape(o['name']):o for o in json.load(open('agamoni.json')) if o['pin']}
d=json.load(open('/workspace/app/src/data/dhaak.v1.json'))
def hav(a,b): p=math.radians;x=math.sin(p(b[0]-a[0])/2)**2+math.cos(p(a[0]))*math.cos(p(b[0]))*math.sin(p(b[1]-a[1])/2)**2;return 2*6371000*math.asin(math.sqrt(x))
# Exact agamoni entry per pandal, vetted by hand (None = no unambiguous entry).
PICK={'baghbazar-sarbojanin':'Bagbazar Sarbojanin Durgotsav','barisha-club':'Barisha Club','beniatola-sarbojanin':None,'chorebagan-sarbojanin':'Chorebagan Sarbojanin',
 'dum-dum-park-sarbajanin':'Dum Dum Park Sarbojanin Durga Puja Samity','dum-dum-park-tarun-dal':None,'garia-mitali':None,'harish-park':'Harish Park Puja',
 'hatibagan-nabinpally':'Hatibagan Nabinpally','hatibagan-sarbojanin':'Hatibagan Sarbojanin','hindusthan-club':'Gariahat Hindusthan Club','hindusthan-park':'Hindusthan Park Sarbojanin',
 'kumartuli-park':'Kumartuli Park Sarbojanin','kumartuli-sarbojanin':'Kumartuli Sarbojanin','matri-mandir':None,'naba-durga':'Garia Nabadurga','naktala-pally-unnayan-samity':None,
 'new-sporting-club':None,'nwapara-udayan-sangha':None,'regent-park':None,'tarun-sathi':None,'kamdahari-purbapara':None,'golaghata-sammilani':None,'dakshindari-youth':None,
 'dakshinpara':None,'kapalitola-sarbajanin':None,'sealdah-athletic-club':None,'paddapukur-youth':None,'pally-mangal':None,'patuli-sarbojanin':None,'baishnabghata-balak-samity':None,
 'shyama-pally':None,'simla-byayam-samity':'Simla Byayam Samity','sinthee-sarbojanin':None,'tala-park':'Tala Prattoy','taltala-sarbojanin':None,'vivekananda-park':'Vivekananda Park Athletic Club',
 'telengabagan':'Telengabagan','ahiritola-sarbojanin':'Ahiritola Sarbojonin Durgotsab','ae-block':'Salt Lake Ae Block','bj-block':'Salt Lake Bj Block','fd-block':'Salt Lake Fd Block'}
m={r['id']:r for r in json.load(open('match.json'))}
def nom(q):
    u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&viewbox=88.2,22.75,88.55,22.35&bounded=1&q='+urllib.parse.quote(q)
    try: r=json.loads(subprocess.run(['curl','-s','-m','15','-A','pujo-pin-audit/1.0 (dipam)',u],capture_output=True,text=True).stdout)
    except Exception: r=[]
    time.sleep(1.1); return [(float(x['lat']),float(x['lon']),x['display_name'][:60]) for x in r]
out=[]
for p in d['pandals']:
    r=m[p['id']]; name=PICK.get(p['id'],r['ag'] if r['sc']>=1.0 else None)
    a=A[name]['pin'] if name in A else None
    o=[p['lat'],p['lng']] if p['precision']=='osm' else None
    row={'id':p['id'],'name':p['name'],'prec':p['precision'],'ours':[p['lat'],p['lng']],'agamoni':name,'A':a}
    if a and o and hav(a,o)<=300: row.update(verdict='verified',by='osm+agamoni',d=round(hav(a,o)))
    elif a:
        n=[x for q in {p['name'],name} for x in nom(q)]; near=[x for x in n if hav(a,x[:2])<=300]
        if near: row.update(verdict='corrected' if (not o or hav(a,o)>300) else 'verified',by='agamoni+nominatim',pin=[round((a[0]+near[0][0])/2,6),round((a[1]+near[0][1])/2,6)],osm=near[0][2],d=round(hav(a,o)) if o else None)
        else: row.update(verdict='conflict' if o else 'unresolved',d=round(hav(a,o)) if o else None,nom=n[:2])
    else: row.update(verdict='osm-only' if o else 'unresolved')
    out.append(row); print(row['verdict'],row['id'],row.get('d'),row.get('by',''),row.get('osm',''),flush=True)
json.dump(out,open('audit.json','w'),indent=1)
