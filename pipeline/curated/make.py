import json
from list import CN,LBB,TG,KD,KF
E=json.load(open('osm.json'))['elements']
def osm(name,lat):
  for e in E:
    t=e['tags'];la=e.get('lat') or e['center']['lat']
    if t.get('name')==name and abs(la-lat)<2e-4: return e,la,e.get('lon') or e['center']['lon']
  raise SystemExit('missing '+name)
P=[ # display name, osm name, osm lat, known for, cuisine, source
('Peter Cat','Peter Cat',22.55245,'Chelo kebab','Mughlai',CN),
('Mocambo','Mocambo',22.55325,'Continental classics','Continental',CN),
("Flurys","Flury's",22.55273,'Breakfast, pastries','Cafe',CN),
('Kusum Rolls','Kusum Rolls',22.55354,'Kathi rolls','Street food',CN),
('Kwality','Kwality',22.55387,'North Indian classics','North Indian',CN),
('Bar-B-Q','Bar-B-Q',22.55294,'Chinese, tandoor','Chinese',CN),
('Koshe Kosha','Koshe Kosha',22.55371,'Kosha mangsho','Bengali',CN),
('Balaram Mullick & Radharaman Mullick','Balaram Mullick and Radharaman Mullick',22.55224,'Sandesh','Sweets',CN),
('Balaram Mullick & Radharaman Mullick','Balaram Mullick and Radharaman Mullick - Lake Gardens',22.50223,'Sandesh','Sweets',CN),
("Nizam's","Nizam's",22.56214,'Kathi rolls','Street food',CN),
('Nahoum & Sons','Nahoum and Sons',22.56016,'Bakery','Bakery',CN),
('Eau Chew','Eau Chew Restaurant',22.56859,'Chinese','Chinese',CN),
('Indian Coffee House','Indian Coffee House',22.5761,'Coffee, cutlets','Cafe',CN),
('Arsalan','Arsalan',22.55394,'Biryani','Biryani',KD),
('Arsalan','Arsalan Restaurant',22.54387,'Biryani','Biryani',KD),
('Zeeshan','Zeeshan',22.54133,'Biryani','Biryani',CN),
('Aminia','Aminia',22.56227,'Biryani','Biryani',KD),
('Aminia','Aminia',22.51681,'Biryani','Biryani',KF),
('Aminia','Aminia Restaurant',22.59886,'Biryani','Biryani',KD),
("Kewpie's Kitchen","Kewpie's",22.53659,'Bengali home food','Bengali',CN),
('Oh! Calcutta','Oh! Calcutta',22.53806,'Bengali','Bengali',CN),
('6 Ballygunge Place','6 Ballygunge Place',22.5278,'Bhapa ilish','Bengali',CN),
('Bohemian','Bohemian',22.52949,'Modern Bengali','Bengali',CN),
('Jai Hind Dhaba','Jai Hind Dhaba',22.53318,'Punjabi dhaba','North Indian',CN),
('Apanjan','Apanjan',22.51931,'Fish fry, chops','Bengali',CN),
('Mitra Cafe','Mitra Cafe',22.61948,'Fish kabiraji','Bengali',TG),
('Shiraz','Shiraz',22.57715,'Biryani, chaap','Biryani',KF),
]
out=[]
for d,n,lat,k,c,s in P:
  e,la,lo=osm(n,lat)
  out.append({'id':f"c{e['type'][0]}{e['id']}",'name':d,'lat':round(la,6),'lng':round(lo,6),'kind':'restaurant','cuisine':c,'known':k,'src':s,'osm':f"https://www.openstreetmap.org/{e['type']}/{e['id']}",'notable':True,'curated':True})
json.dump(out,open('../raw/curated_food.json','w'),indent=1,ensure_ascii=False); print(len(out))
