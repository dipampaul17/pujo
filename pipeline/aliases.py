"""Per-pandal search aliases (English spellings, transliteration variants, Bengali script) and matching.
Aliases must be distinctive enough that a post mentioning one is about that pandal."""
import re
# Hand-curated extras. Everything else is generated from the guide name by variants().
EXTRA={
 'sree-bhumi-sporting-club':['Sreebhumi','Sree Bhumi','Sribhumi','Shreebhumi','Sree Bhoomi','শ্রীভূমি'],
 'santosh-mitra-square':['Santosh Mitra Square','Santosh Mitra','Lebutala Park','সন্তোষ মিত্র স্কোয়ার'],
 'chetla-agrani':['Chetla Agrani','Chetla Agrani Club','চেতলা অগ্রণী'],
 'suruchi-sangha':['Suruchi Sangha','Suruchi Sangh','সুরুচি সংঘ'],
 'tala-prattoy':['Tala Prattoy','Tala Pratyay','Tala Prattay','টালা প্রত্যয়'],
 'tala-park':['Tala Park'],
 'chaltabagan-lohapatty':['Chaltabagan','Chalta Bagan','চালতাবাগান'],
 'mudiali':['Mudiali Club','Mudiali','মুদিয়ালি'],
 'deshapriya-park':['Deshapriya Park','Deshapriya','দেশপ্রিয় পার্ক'],
 'ekdalia-evergreen':['Ekdalia Evergreen','Ekdalia','একডালিয়া'],
 'singhi-park':['Singhi Park','সিংহী পার্ক'],
 'maddox-square':['Maddox Square','ম্যাডক্স স্কোয়ার'],
 'baghbazar-sarbojanin':['Baghbazar Sarbojanin','Bagbazar Sarbojanin','Baghbazar Durga','Bagbazar Durga','বাগবাজার সার্বজনীন'],
 'kumartuli-park':['Kumartuli Park','কুমোরটুলি পার্ক'],
 'kumartuli-sarbojanin':['Kumartuli Sarbojanin','Kumortuli Sarbojanin','কুমোরটুলি সার্বজনীন'],
 'college-square':['College Square','কলেজ স্কোয়ার'],
 'mohammad-ali-park':[],
 'muhammad-ali-park':['Muhammad Ali Park','Mohammad Ali Park','Md Ali Park','মহম্মদ আলি পার্ক'],
 'chorebagan-sarbojanin':['Chorebagan','Chore Bagan','চোরবাগান'],
 'ahiritola-sarbojanin':['Ahiritola','আহিরীটোলা'],
 'kashi-bose-lane':['Kashi Bose Lane','Kashi Bose','কাশী বোস লেন'],
 'hatibagan-nabinpally':['Hatibagan Nabinpally','Nabinpally','নবীনপল্লী'],
 'hatibagan-sarbojanin':['Hatibagan Sarbojanin','হাতিবাগান সার্বজনীন'],
 'jagat-mukherjee-park':['Jagat Mukherjee Park','জগৎ মুখার্জি পার্ক'],
 'ajeya-sanghati':['Ajeya Sanghati','Ajeya Sanhati','অজেয় সংহতি'],
 'tridhara-sammilani':['Tridhara','Tridhara Sammilani','ত্রিধারা'],
 'badamtala-ashar-sangha':['Badamtala Ashar Sangha','Badamtala','বাদামতলা আষাঢ় সংঘ'],
 '66-pally':['66 Pally','66 Palli','৬৬ পল্লী'],
 'hindusthan-park':['Hindusthan Park','Hindustan Park'],
 'hindusthan-club':['Hindusthan Club','Hindustan Club'],
 'fd-block':['FD Block','FD Block Salt Lake'],
 'bj-block':['BJ Block','BJ Block Salt Lake'],
 'ae-block':['AE Block','AE Block Salt Lake'],
 'barisha-club':['Barisha Club','বড়িশা ক্লাব'],
 'naktala-udayan-sangha':['Naktala Udayan Sangha','Naktala Udayan','নাকতলা উদয়ন সংঘ'],
 'sovabazar-rajbari':['Sovabazar Rajbari','Shobhabazar Rajbari','Sobhabazar Rajbari','শোভাবাজার রাজবাড়ি'],
 'janbazar-rajbari':['Janbazar Rajbari','জানবাজার রাজবাড়ি'],
 'dum-dum-park-tarun-dal':['Dum Dum Park Tarun Dal','Tarun Dal'],
 'dum-dum-park-bharat-chakra':['Dum Dum Park Bharat Chakra','Bharat Chakra'],
 'dum-dum-park-sarbajanin':['Dum Dum Park Sarbajanin','Dum Dum Park Sarbojanin'],
 'naba-durga':['Naba Durga','Nabadurga'],
 'telengabagan':['Telengabagan','Telenga Bagan','তেলেঙ্গাবাগান'],
 'shib-mandir':['Lake Town Shib Mandir','Shib Mandir Sarbojanin'],
 'matri-mandir':['Matri Mandir Sarbojanin','Matri Mandir Durga'],
 'pally-mangal':['Pally Mangal Samity','Pally Mangal'],
 'regent-park':['Regent Park Sarbojanin','Regent Park Durga'],
 'dakshinpara':['Dakshinpara Durga','Dakshinpara Sarbojanin'],
 'mohammed':[],
 'new-town-sarbojanin':['New Town Sarbojanin','Newtown Sarbojanin'],
 'dum-dum-park-tarun-sangha':['Dum Dum Park Tarun Sangha','DD Park Tarun Sangha'],
 'behala-club':['Behala Club','বেহালা ক্লাব'],
 'behala-friends':['Behala Friends','Behala Friends Club','বেহালা ফ্রেন্ডস'],
 'samaj-sebi-sangha':['Samaj Sebi Sangha','Samaj Sebi','সমাজসেবী'],
 'beleghata-33-pally':['Beleghata 33 Pally','Beliaghata 33 Pally','Beleghata 33 Palli','বেলেঘাটা ৩৩ পল্লী'],
 'santoshpur-avenue-south':['Santoshpur Avenue South','Avenue South Pally Mangal','সন্তোষপুর অ্যাভিনিউ সাউথ'],
 'bosepukur-talbagan':['Bosepukur Talbagan','বোসপুকুর তালবাগান'],
 'tala-barowari':['Tala Barowari','Tala Baroari','Tala Barowari Durgotsab','টালা বারোয়ারি'],
 'alipore-sarbojanin':['Alipore Sarbojanin','Alipur Sarbojanin','আলিপুর সার্বজনীন'],
 'abasar-sarbojanin':['Abasar Sarbojanin','Abasar Sarbojonin','Abosar Sarbojanin'],
 '25-pally-khidirpur':['Khidirpur 25 Pally','Khidirpur 25 Palli','Kidderpore 25 Pally','25 Pally Khidirpur','25 Pally Kidderpore'],
 'pally-saradiya-khidirpur':['Pally Saradiya','Pally Sarodiya','Palli Saradiya'],
 'telipukur-yuba-sangha':['Telipukur Yuba Sangha','Telipukur','Nursery Bagan Adivasi'],
 'olabibitala-sarbojanin':['Olabibitala','Olaibibitola','Olabibitola'],
 'ichapur-shivaji-sangha':['Ichapur Shivaji Sangha','Shivaji Sangha Ichapur'],
 'salkia-alapani':['Salkia Alapani','Alapani Club'],
 'keshtopur-prafulla-kanan':['Prafulla Kanan','Prafullakanan','Keshtopur Prafulla Kanan'],
 'ahiritola-yubakbrinda':['Ahiritola Yubakbrinda','Ahiritola Yuvak Brinda','Ahiritola Yubak Brinda'],
}
WEAK={'new sporting','rani rashmoni','tarun dal','bharat chakra','badamtala'}
GENERIC=re.compile(r'\b(Sarbojanin|Sarbajanin|Sarbojonin|Sarvajanin|Durgotsab|Samity|Samiti|Club|Committee|Sangha|Sangh)\b',re.I)
SPELL=[('Sarbojanin','Sarbajanin'),('Sarbojanin','Sarbojonin'),('Pally','Palli'),('Samity','Samiti'),('Sree','Sri'),('Sree','Shree')]
def variants(name):
    base=name.split('/')[0].strip(); out=[base]
    for a,b in SPELL:
        for v in list(out):
            if re.search(a,v,re.I): out.append(re.sub(a,b,v,flags=re.I))
    core=re.sub(r'\s+',' ',GENERIC.sub('',base)).strip()
    if len(core.split())>=2 and core not in out: out.append(core)
    return out
def aliases(p):
    ex=EXTRA.get(p['id'])
    out=list(ex) if ex else variants(p['name'])
    out=[a for a in out if a.lower() not in WEAK]
    if '/' in p['name'] and not ex: out+= [s.strip() for s in p['name'].split('/')[1:] if len(s.strip().split())>=2]
    seen=[];[seen.append(a) for a in out if a and a.lower() not in [s.lower() for s in seen]]
    return seen
def _rx(a):
    if re.search(r'[\u0980-\u09FF]',a): return re.compile(re.escape(a))
    a=re.escape(a).replace(r'\ ',r'[\s\-]*')
    return re.compile(r'(?<![A-Za-z0-9])'+a+r'(?![A-Za-z0-9])',re.I)
_C={}
def matches(p,text):
    k=p['id']
    if k not in _C: _C[k]=[_rx(a) for a in aliases(p)]
    return any(r.search(text) for r in _C[k])
def hits(pandals,text):
    h=[p for p in pandals if matches(p,text)]
    # drop a pandal whose only hit is contained in a longer matching alias of another (Tala Park vs Tala Prattoy fine; Dum Dum Park vs Dum Dum Park Tarun Dal)
    return h
