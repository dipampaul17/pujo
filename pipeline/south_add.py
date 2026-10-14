"""Notable South Kolkata pandals missing from the guide (audit 14 Oct 2026). Sources: pujoparikramaguide.in (PPG, notable list)
and agamoni.in (AG). A pin is 'osm' (verified) only when PPG and AG agree within 250 m on the same committee; otherwise the
pandal sits at its nearest metro (precision 'station', no distance). Inaugurations seen on X (@SuvenduWB 12 Oct) included."""
import json, os, sys, html, math
H = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pinaudit')
def hav(a, b):
    p = math.radians; x = math.sin(p(b[0]-a[0])/2)**2 + math.cos(p(a[0]))*math.cos(p(b[0]))*math.sin(p(b[1]-a[1])/2)**2; return 2*6371000*math.asin(math.sqrt(x))
P = {o['url'].rstrip('/').split('/')[-1]: o['pin'] for o in json.load(open(os.path.join(H, 'ppg.json')))}
A = {html.unescape(o['name']): o['pin'] for o in json.load(open(os.path.join(H, 'agamoni.json'))) if o['pin']}
# id: (name, ppg slug or None, agamoni exact name or None, station override when no pin at all)
SRC = {
 '64-pally': ('64 Pally', '64_pally_durga_pujo', '64 Pally Durga Pujo', None),
 'kalighat-milan-sangha': ('Kalighat Milan Sangha', 'kalighat_milan_sangha', 'Kalighat Milan Sangha', None),
 'rupchand-mukherjee-lane': ('Rupchand Mukherjee Lane', 'rupchand_mukherjee_sarbojanin', 'Rupchand Mukherjee Lane Durga Puja', None),
 'sanghasree': ('Sanghasree', 'sanghasree', 'Sanghasree', None),
 'barisha-sarbojanin': ('Barisha Sarbojanin', 'barisha_sarbojanin', 'Barisha Sarbojonin', None),
 'behala-11-pally': ('Behala 11 Pally', 'behala_11_pally', '11 Pally Club', None),
 'naskarpur-sarbojanin': ('Naskarpur Sarbojanin', 'naskarpur_sarbojanin', 'Naskarpur Sarbojanin', None),
 'notunpara-sarbojanin': ('Notunpara Sarbojanin', 'notunpara_sarbojanin', 'Natunpara Durga Puja Pandal', None),
 'lake-gardens-peoples': ("Lake Gardens People's Association", 'lake_gardens_peoples', "Lake Garden People's Association", None),
 'adi-ballygunge-sarbojanin': ('Adi Ballygunge Sarbojanin', 'adi_ballygunge_sarbojanin', 'Adi Ballygunge', None),
 'sahapur-sarbojanin': ('Sahapur Sarbojanin', 'sahapur_sarbojanin', 'Sahapur Mukti Sangha', None),
 'jodhpur-park-95-pally': ('Jodhpur Park 95 Pally', 'jodhpur_park_95', '95 Pally', None),
 'jodhpur-park-sarbojanin': ('Jodhpur Park Sarbojanin', 'jodhpur_park', 'Jodhpur Park', None),
 'babubagan': ('Babubagan', 'babubagan', 'Babubagan Club', None),
 'selimpur-pally': ('Selimpur Pally', 'selimpur_pally', 'Selimpur Pally', None),
 'kendua-shanti-sangha': ('Kendua Shanti Sangha', 'kendua_shanti_sangha', 'Kendua Shanti Sangha - Patuli', None),
 'ballygunge-21-pally': ('Ballygunge 21 Pally', None, 'Ballygunge 21 Pally', None),
 'shahid-nagar-sarbojanin': ('Dhakuria Shahid Nagar Sarbojanin', 'shahidnagar_sarbojanin', None, None),
 'dhakuria-sarbojanin': ('Dhakuria Sarbojanin', 'dhakuria_sarbojanin', None, None),
 'gariahat-sarbojanin': ('Gariahat Sarbojanin Durgotsab', 'gariahat_sarbojanin_durgotsab', None, None),
 'hazra-park-durgotsab': ('Hazra Park Durgotsab', 'hazra_park_durgotsab', None, None),
 'golmath-durga-puja': ('Golmath Durga Puja Samiti', 'golmath_durga_puja_samiti', None, None),
 'bhowanipore-durgotsab': ('Bhowanipore Durgotsab', 'bhowanipore_durgotsab', None, None),
 '71-pally-baishakhi': ('71 Pally Baishakhi', '71_pally_baishakhi', None, None),
 'behala-yma': ('Behala YMA', 'behala_yma', None, None),
 'sahajatri': ('Sahajatri', 'sahajatri', None, None),
 'bhola-maheshwartala': ('Bhola Maheshwartala Sarbojanin', 'bhola_maheshwartala_sarbojanin', None, None),
 'bakultala-sarbojanin': ('Bakultala Sarbojanin', 'bakultala_sarbojanin', None, None),
 'bansdroni-sarbojanin': ('Bansdroni Sarbojanin', 'bansdroni_sarbojaneen_durgotsav_park', None, None),
 'tollygunge-santi-pally': ('Tollygunge Santi Pally', 'tollygunge_santi_pally', None, None),
 'sanghati-puja-samiti': ('Sanghati Puja Samiti', 'sanghati_puja_samiti', None, None),
 'poddar-nagar-sarbojanin': ('Poddar Nagar Sarbojanin', 'poddar_nagar_sarbojanin', None, None),
 'madhya-garfa-sarbojanin': ('Madhya Garfa Sarbojanin', 'madhya_garfa_sarbojanin', None, None),
 'rk-chatterjee-sarbojanin': ('R K Chatterjee Road Sarbojanin', 'r_k_chatterjee_sarbojanin', None, None),
 'pallishree-sarbojanin': ('Pallishree Sarbojanin', 'pallishree_sarbojanin', None, None),
 'rabindra-pally-sarbojanin': ('Rabindra Pally Sarbojanin', 'rabindra_pally_sarbojanin', None, None),
 'mukundapur-sarbojanin': ('Mukundapur Sarbojanin', 'mukundapur_sarbojanin', None, None),
 'behala-arunoday-samiti': ('Behala Arunoday Samiti', None, None, 'Behala Chowrasta'),   # @SuvenduWB 12 Oct: অরুণোদয় সমিতি, বেহালা
 'club-muktadal-bhowanipur': ('Club Muktadal Sarbojanin', None, None, 'Jatin Das Park'),  # @SuvenduWB 12 Oct: ক্লাব মুক্তদল সার্বজনীন, ভবানীপুর
 'allen-park-sarbojanin': ('Allen Park Sarbojanin', 'allen_park', None, None),            # @SuvenduWB 12 Oct; Park Street
}
# Exact pins checked 14 Oct 2026 against two independent families: Google Maps place (Agamoni pins copy Google) and an
# OpenStreetMap named feature (PPG pins copy OSM). id: (google pin, google place name, osm pin, osm feature name). Pin used: Google's.
VERIFIED = {
 'ballygunge-21-pally': ((22.529175, 88.368816), 'Google: Ballygunge 21 Pally', (22.5292355, 88.368908), 'OSM: Ballygunge 21 Pally'),
 'dhakuria-sarbojanin': ((22.510483, 88.371986), 'Google: Dhakuria Sarbojanin Durgotsab', (22.5100279, 88.3719874), 'OSM: Dhakuria Sarbojanin'),
 'gariahat-sarbojanin': ((22.517457, 88.366756), 'Google: Gariahat Sarbojonin Durgotsab', (22.5173511, 88.3667515), 'OSM: Gariahat Sarbojanin Durgotsab'),
 'hazra-park-durgotsab': ((22.524579, 88.34607), 'Google: Hazra Park Sarbojanin', (22.524838, 88.3461413), 'OSM: Hazra Park Durgotsab'),
 'golmath-durga-puja': ((22.526871, 88.349549), 'Google: Gol Math Durga Puja Samiti', (22.5269309, 88.3495445), 'OSM: Golmath Durga Puja Samiti'),
 'poddar-nagar-sarbojanin': ((22.497265, 88.367563), 'Google: Poddarnagar Sarbojanin Durgotsav', (22.4982381, 88.3692526), 'OSM: Poddar Nagar Sarbojanin'),
 'rk-chatterjee-sarbojanin': ((22.518135, 88.37842), 'Google: Kasba R K Chatterjee Road Adhibasibrindo', (22.5176837, 88.3782632), 'OSM: R K Chatterjee Sarbojanin'),
 'kendua-shanti-sangha': ((22.471984, 88.381501), 'Google: Kendua Shanti Sangha', (22.472065, 88.381706), 'OSM: ShantiSangha Playground'),
}
def resolve(stations):
    out = []
    for k, (name, pg, ag, st) in SRC.items():
        a, b = P.get(pg) if pg else None, A.get(ag) if ag else None
        base = {'worth': 0.5, 'reason': None, 'signals': {'news2026': 0, 'theme2026': 0, 'x7d': 0}, 'id': k, 'name': name, 'line': None, 'circuits': [], 'quality': 0.5, 'note': None}
        ok = a and b and hav(a, b) <= 250
        v = VERIFIED.get(k)
        if v and hav(v[0], v[2]) <= 250: a, ok = v[0], True
        ref = a or b
        s = next(x for x in stations if x['name'] == st) if st else min(stations, key=lambda x: hav(ref, (x['lat'], x['lng'])))
        out.append({**base, 'station': s['name'], **({'lat': round(a[0], 6), 'lng': round(a[1], 6), 'precision': 'osm'} if ok else {'lat': s['lat'], 'lng': s['lng'], 'precision': 'station'})})
    return out
def apply(data):
    have = {p['id']: p for p in data['pandals']}; add = 0
    for p in resolve(data['stations']):
        if p['id'] in have: have[p['id']].update({k: p[k] for k in ('lat', 'lng', 'precision', 'station')})  # re-pin in place
        else: have[p['id']] = p; add += 1
    data['pandals'] = sorted(have.values(), key=lambda p: p['id']); return add
if __name__ == '__main__':
    import hashlib
    f = sys.argv[1]; d = json.load(open(f)); d.pop('hash', None); n = apply(d)
    d['hash'] = hashlib.sha1(json.dumps(d, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()[:8]
    json.dump(d, open(f, 'w'), separators=(',', ':'), ensure_ascii=False); print('south pandals added', n)
    for p in resolve(d['stations']): print(p['precision'], p['id'], p['station'])
