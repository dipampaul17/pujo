"""Build raw/road_gaz.json: OSM geometry (via Nominatim, polygon_geojson) for Kolkata roads/places that police and
visitors name in traffic posts. Points are thinned to ~100 m. Re-run is idempotent; failures keep the last file.
Data © OpenStreetMap contributors, ODbL."""
import json, os, sys, time, urllib.request, urllib.parse, math
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, H)
from jsonio import write_json
OUT = f'{H}/raw/road_gaz.json'
# canonical name -> (OSM search names, aliases used on X in English/Banglish/Bengali)
ROADS = {
 'Rashbehari Avenue': (['Rashbehari Avenue', 'Rash Behari Avenue', 'Rashbehari Connector'], ['Rashbehari Ave', 'Rash Behari Avenue', 'রাসবিহারী অ্যাভিনিউ', 'রাসবিহারী']),
 'Gariahat Road': (['Gariahat Road'], ['Gariahat Rd', 'গড়িয়াহাট রোড']),
 'Southern Avenue': (['Southern Avenue', 'Southern Avenue Road', 'Sarat Chatterjee Avenue'], ['সাদার্ন অ্যাভিনিউ']),
 'Shyama Prasad Mukherjee Road': (['Shyama Prasad Mukherjee Road'], ['S P Mukherjee Road', 'SP Mukherjee Road', 'S.P. Mukherjee Road', 'শ্যামাপ্রসাদ মুখার্জি রোড']),
 'Ashutosh Mukherjee Road': (['Ashutosh Mukherjee Road'], ['Asutosh Mukherjee Road', 'আশুতোষ মুখার্জি রোড']),
 'Hazra Road': (['Hazra Road'], ['হাজরা রোড']),
 'Sarat Bose Road': (['Sarat Bose Road'], ['শরৎ বসু রোড']),
 'Diamond Harbour Road': (['Diamond Harbour Road'], ['DH Road', 'D H Road', 'ডায়মন্ড হারবার রোড']),
 'Prince Anwar Shah Road': (['Prince Anwar Shah Road'], ['Anwar Shah Road', 'আনোয়ার শাহ রোড']),
 'Raja Subodh Chandra Mallick Road': (['Raja Subodh Chandra Mallick Road', 'Raja S C Mallick Road', 'Raja SC Mallick Road'], ['Raja S C Mallick Road', 'RSC Mallick Road', 'রাজা এস সি মল্লিক রোড']),
 'Eastern Metropolitan Bypass': (['Eastern Metropolitan Bypass'], ['EM Bypass', 'E M Bypass', 'Bypass', 'বাইপাস', 'ইএম বাইপাস']),
 'Park Street': (['Park Street', 'Mother Teresa Sarani'], ['পার্ক স্ট্রিট']),
 'Jawaharlal Nehru Road': (['Jawaharlal Nehru Road'], ['JL Nehru Road', 'J L Nehru Road', 'Chowringhee', 'চৌরঙ্গি']),
 'Acharya Jagadish Chandra Bose Road': (['Acharya Jagadish Chandra Bose Road'], ['AJC Bose Road', 'A J C Bose Road', 'এজেসি বোস রোড']),
 'Acharya Prafulla Chandra Road': (['Acharya Prafulla Chandra Road'], ['APC Road', 'A P C Road', 'এপিসি রোড']),
 'Bidhan Sarani': (['Bidhan Sarani'], ['বিধান সরণি']),
 'Chittaranjan Avenue': (['Chittaranjan Avenue'], ['CR Avenue', 'C R Avenue', 'Central Avenue', 'চিত্তরঞ্জন অ্যাভিনিউ', 'সেন্ট্রাল অ্যাভিনিউ']),
 'Rabindra Sarani': (['Rabindra Sarani'], ['রবীন্দ্র সরণি']),
 'Barrackpore Trunk Road': (['Barrackpore Trunk Road'], ['BT Road', 'B T Road', 'বিটি রোড']),
 'VIP Road': (['VIP Road', 'Biswa Bangla Sarani'], ['ভিআইপি রোড']),
 'Jessore Road': (['Jessore Road'], ['যশোর রোড']),
 'Beleghata Main Road': (['Beleghata Main Road'], ['Beliaghata Main Road', 'বেলেঘাটা মেন রোড']),
 'Mahatma Gandhi Road': (['Mahatma Gandhi Road'], ['MG Road', 'M G Road', 'মহাত্মা গান্ধী রোড']),
 'Ballygunge Circular Road': (['Ballygunge Circular Road'], ['বালিগঞ্জ সার্কুলার রোড']),
 'Strand Road': (['Strand Road'], ['স্ট্র্যান্ড রোড']),
 'Lake Town Road': (['Lake Town Road'], []),
 'Bondel Road': (['Bondel Road'], []),
 'Netaji Subhash Chandra Bose Road': (['Netaji Subhash Chandra Bose Road'], ['NSC Bose Road', 'N S C Bose Road', 'এনএসসি বোস রোড']),
 'Sealdah Flyover': (['Bidyapati Setu', 'Sealdah Flyover'], ['Sealdah flyover']),
 'Shyambazar Five Point Crossing': (['Shyambazar Five Point Crossing'], ['Shyambazar five-point', 'Shyambazar 5 point', 'শ্যামবাজার পাঁচ মাথার মোড়']),
}
BBOX = '88.20,22.70,88.50,22.40'  # viewbox lon1,lat1,lon2,lat2 (Kolkata)
def fetch(q):
    u = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q + ', Kolkata', 'format': 'json', 'polygon_geojson': 1, 'limit': 40, 'viewbox': BBOX, 'bounded': 1})
    for i in range(4):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'pujo-app/1.0 (github.com/dipampaul17/pujo)'}), timeout=30).read())
        except Exception as e: print('retry', q, e); time.sleep(3 * (i + 1))
    return None
def thin(pts, m=100):
    out = []
    for lat, lng in pts:
        if not out or math.hypot((lat - out[-1][0]) * 111e3, (lng - out[-1][1]) * 103e3) >= m: out.append((round(lat, 5), round(lng, 5)))
    return out
def main():
    old = json.load(open(OUT)) if os.path.exists(OUT) else {'roads': {}}
    roads = dict(old.get('roads', {}))
    for name, (osm, aliases) in ROADS.items():
        pts = []
        for q in osm:
            r = fetch(q); time.sleep(1.1)
            if r is None: continue
            for e in r:
                if e.get('class') != 'highway': continue
                g = e.get('geojson', {}); cs = g.get('coordinates', [])
                if g.get('type') == 'LineString': pts += [(c[1], c[0]) for c in cs]
                elif g.get('type') == 'MultiLineString': pts += [(c[1], c[0]) for l in cs for c in l]
                elif g.get('type') == 'Point': pts.append((cs[1], cs[0]))
        if pts: roads[name] = {'aliases': aliases, 'pts': thin(pts)}
        print(name, len(roads.get(name, {}).get('pts', [])))
    write_json(OUT, {'_': 'Road geometry from OpenStreetMap via Nominatim (ODbL). Built by roadgaz.py.', 'roads': roads}, ensure_ascii=False)
if __name__ == '__main__': main()
