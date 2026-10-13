import json,math
def hav(a,b): p=math.radians;x=math.sin(p(b[0]-a[0])/2)**2+math.cos(p(a[0]))*math.cos(p(b[0]))*math.sin(p(b[1]-a[1])/2)**2;return 2*6371000*math.asin(math.sqrt(x))
G={o['name'].split(' Durga Puja 2026')[0]:o['pin'] for o in json.load(open('ppg.json')) if o['pin']}
# Hand-vetted pujoparikramaguide.in entries (exact same committee).
PPG={'66-pally':'66 Pally','ae-block':'AE Block Salt Lake','ahiritola-sarbojanin':'Ahiritola Sarbojanin','ajeya-sanghati':'Behala Ajeya Sanghati','arjunpur-amra-sabai-club':'Arjunpur Amra Sabai Club',
'badamtala-ashar-sangha':'Badamtala Ashar Sangha','baghbazar-sarbojanin':'Bagbazar Sarbojanin','bakul-bagan':'Bakulbagan Sarbojanin','ballygunge-cultural':'Ballygunge Cultural Association','barisha-club':'Barisha Club',
'bhowanipur-75-pally':'Bhowanipore 75 Pally','bj-block':'BJ Block Salt Lake','bosepukur-sitala-mandir':'Bosepukur Sitala Mandir','chakraberia-sarbojanin':'Chakraberia Sarbojanin','chaltabagan-lohapatty':'Chaltabagan Lohapatty',
'chetla-agrani':'Chetla Agrani Club','chorebagan-sarbojanin':'Chorbagan Sarbojanin','college-square':'College Square Sarbojanin','deshapriya-park':'Deshapriya Park','dum-dum-park-bharat-chakra':'Dum Dum Park Bharat Chakra',
'dum-dum-park-sarbajanin':'Dum Dum Park Sarbojanin','dum-dum-park-tarun-dal':'Dum Dum Park Tarun Dal','ekdalia-evergreen':'Ekdalia Evergreen','fd-block':'FD Block Salt Lake','hatibagan-nabinpally':'Hatibagan Nabin Pally',
'hatibagan-sarbojanin':'Hatibagan Sarbojanin','hindusthan-club':'Hindustan Club','jagat-mukherjee-park':'Jagat Mukherjee Park','kashi-bose-lane':'Kashi Bose Lane','kumartuli-park':'Kumartuli Park Sarbojanin',
'lalabagan-nabankur':'Lalabagan Nabankur','maddox-square':'Maddox Square','mudiali':'Mudiali Club','muhammad-ali-park':'Mohammad Ali Park','naktala-udayan-sangha':'Naktala Udayan Sangha','nalin-sarkar-street':'Nalin Sarkar Street',
'patuli-sarbojanin':'Patyuli Sarbojanin','rajdanga-naba-uday-sangha':'Rajdanga Naba Uday Sangha','santosh-mitra-square':'Santosh Mitra Square (Lebutala)','santoshpur-lake-pally':'Santoshpur Lake Pally',
'santoshpur-trikon-park':'Santoshpur Trikon Park','shib-mandir':'Shib Mandir Sarbojanin','simla-byayam-samity':'Simla Byayam Samity','singhi-park':'Singhi Park','sovabazar-rajbari':'Sovabazar Rajbari',
'sree-bhumi-sporting-club':'Sreebhumi Sporting Club','suruchi-sangha':'Suruchi Sangha','tala-prattoy':'Tala Prattoy','tala-park':'Tala Prattoy','taltala-sarbojanin':'Taltala Sarbojanin','telengabagan':'Telengabagan Sarbojanin','tridhara-sammilani':'Tridhara Sammilani'}
EXTRA={'rajdanga-naba-uday-sangha':[('exa.ai place',[22.516627,88.390229])],'new-sporting-club':[('pujaparikrama.in',[22.480068,88.335788])]}
au={r['id']:r for r in json.load(open('audit.json'))}
d=json.load(open('/workspace/app/src/data/dhaak.v1.json'))
out={};cnt={}
for p in d['pandals']:
    a=au[p['id']]; S=[]
    if p['precision']=='osm': S.append(('osm',[p['lat'],p['lng']]))
    if a.get('A'): S.append(('agamoni',a['A']))
    if p['id'] in PPG and PPG[p['id']] in G: S.append(('pujoparikramaguide',G[PPG[p['id']]]))
    if a.get('by')=='agamoni+nominatim' and a.get('pin'): S.append(('nominatim',a['pin']))
    S+=EXTRA.get(p['id'],[])
    # best agreeing pair within 250 m; pin = the first (priority order: osm, agamoni, ppg, nominatim, extra)
    pair=None
    for i in range(len(S)):
        for j in range(i+1,len(S)):
            if S[i][0]!=S[j][0] and hav(S[i][1],S[j][1])<=250: pair=pair or (S[i],S[j])
    if pair:
        pin=[round(pair[0][1][0],6),round(pair[0][1][1],6)]
        moved=round(hav(pin,[p['lat'],p['lng']])) if p['lat'] else None
        v='verified' if p['precision']=='osm' and moved is not None and moved<=60 else 'corrected'
        out[p['id']]={'lat':pin[0],'lng':pin[1],'sources':[s[0] for s in pair],'moved_m':moved,'verdict':v}
    else:
        v='unresolved-approx' if p['precision']!='osm' else 'osm-single-source'
        out[p['id']]={'verdict':v,'have':[s[0] for s in S]}
    cnt[v]=cnt.get(v,0)+1
    print(v,p['id'],out[p['id']].get('moved_m'),out[p['id']].get('sources') or out[p['id']].get('have'))
json.dump(out,open('pins_final.json','w'),indent=1);print(cnt)
