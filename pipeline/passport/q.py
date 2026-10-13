import json,subprocess,urllib.parse,time,sys
Q={'tala-barowari':['Tala Barowari'],'ahiritola-yubakbrinda':['Ahiritola Yubakbrinda','Ahiritola Yuvak Vrinda'],'ultadanga-bidhan-sangha':['Ultadanga Bidhan Sangha','Bidhan Sangha'],
'beleghata-33-pally':['Beleghata 33 Pally','33 Pally'],'dum-dum-park-tarun-sangha':['Dum Dum Park Tarun Sangha','Tarun Sangha Dum Dum'],'keshtopur-prafulla-kanan':['Prafulla Kanan','Prafullakanan'],
'yuba-sangha-telipukur':['Telipukur','Nursery Bagan','Yuba Sangha'],'new-town-sarbojanin':['New Town Sarbojanin','Newtown Durga Puja'],'abasar-sarbojanin':['Abasar Sarbojanin'],
'alipur-sarbojanin':['Alipore Sarbojanin'],'samaj-sebi':['Samaj Sebi Sangha'],'bosepukur-talbagan':['Bosepukur Talbagan'],'purbachal-shakti-sangha':['Purbachal Shakti Sangha'],
'santoshpur-avenue-south':['Santoshpur Avenue South','Santoshpur Avenue'],'25-pally':['25 Pally Khidirpur','25 Palli Kidderpore'],'pally-sarodiya':['Pally Saradiya','Pally Sarodiya'],
'behala-nutan-dal':['Behala Nutan Dal','Nutan Dal'],'behala-friends':['Behala Friends'],'behala-club':['Behala Club'],'sb-park-sarbojanin':['SB Park Thakurpukur','S B Park'],
'bantra-mohila-sangha':['Bantra Mohila Sangha','Bantra'],'olaibibitola-sarbojanin':['Olaibibitola','Olai Bibi Tala'],'salkia-alapani':['Alapani Salkia','Alapani'],'ichapur-shivaji-sangha':['Shivaji Sangha Ichapur','Shivaji Sangha']}
out={}
for k,qs in Q.items():
  r=[]
  for q in qs:
    u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&viewbox=88.2,22.75,88.55,22.35&bounded=1&q='+urllib.parse.quote(q)
    try: j=json.loads(subprocess.run(['curl','-s','-m','15','-A','pujo-pin-audit/1.0 (dipam)',u],capture_output=True,text=True).stdout)
    except Exception: j=[]
    r+=[[q,float(x['lat']),float(x['lon']),x['display_name'][:90]] for x in j]; time.sleep(1.2)
  out[k]=r; print(k,r,flush=True)
json.dump(out,open('nominatim.json','w'),indent=0)
