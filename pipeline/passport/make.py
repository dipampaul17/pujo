"""Pujor Passport pandals missing from the guide. A pin is 'osm' (verified) only when two independent sources agree
within 250 m; otherwise the pandal sits at its nearest metro (precision 'station', no distance shown). Sources in SOURCES."""
import json, math, os
H = os.path.dirname(os.path.abspath(__file__))
def hav(a, b):
    p = math.radians; x = math.sin(p(b[0]-a[0])/2)**2 + math.cos(p(a[0]))*math.cos(p(b[0]))*math.sin(p(b[1]-a[1])/2)**2; return 2*6371000*math.asin(math.sqrt(x))
# id, name, [source pins], station override (when no source pin: chosen from the published address/locality)
AG, PPG, NOM = 'agamoni.in', 'pujoparikramaguide.in', 'Nominatim (OSM)'
SOURCES = {
 'tala-barowari': ('Tala Barowari', [(AG, 22.6071655, 88.3760544), (NOM, 22.6068111, 88.3748754)], None),
 'ahiritola-yubakbrinda': ('Ahiritola Yubakbrinda', [], 'Sovabazar Ahiritola'),
 'ultadanga-bidhan-sangha': ('Ultadanga Bidhan Sangha', [(AG, 22.59325, 88.385668)], None),
 'beleghata-33-pally': ('Beleghata 33 Pally', [(AG, 22.5685686, 88.3911284), (PPG, 22.56857, 88.391247), (NOM, 22.5685699, 88.3912469)], None),
 'dum-dum-park-tarun-sangha': ('Dum Dum Park Tarun Sangha', [(AG, 22.610051, 88.411488), (PPG, 22.6168, 88.4118)], None),
 'keshtopur-prafulla-kanan': ('Keshtopur Prafulla Kanan', [(AG, 22.607536, 88.421436)], None),
 'telipukur-yuba-sangha': ('Telipukur Yuba Sangha & Nursery Bagan', [], 'Dum Dum'),  # yubasangha.com: Ananda Mohan Bose Rd, Telipukur 700074
 'new-town-sarbojanin': ('New Town Sarbojanin', [], 'City Centre'),
 'abasar-sarbojanin': ('Abasar Sarbojanin', [(AG, 22.52756, 88.3489)], None),
 'alipore-sarbojanin': ('Alipore Sarbojanin', [(AG, 22.51963, 88.33366), (PPG, 22.519627, 88.333657), (NOM, 22.519627, 88.3336573)], None),
 'samaj-sebi-sangha': ('Samaj Sebi Sangha', [(AG, 22.5157267, 88.3562977), (PPG, 22.514736, 88.355999), (NOM, 22.5147361, 88.3559994)], None),
 'bosepukur-talbagan': ('Bosepukur Talbagan', [(AG, 22.517492, 88.38533), (PPG, 22.5146, 88.3912)], None),
 'purbachal-shakti-sangha': ('Purbachal Shakti Sangha', [(AG, 22.505142, 88.389214), (PPG, 22.502355, 88.396738)], None),
 'santoshpur-avenue-south': ('Santoshpur Avenue South', [], 'Satyajit Ray'),  # pandalhoppings.com: nearest metro Satyajit Ray
 '25-pally-khidirpur': ('25 Pally Khidirpur', [(AG, 22.5391961, 88.3264565)], None),
 'pally-saradiya-khidirpur': ('Pally Saradiya Khidirpur', [(AG, 22.5432531, 88.3215038)], None),
 'behala-nutan-dal': ('Behala Nutan Dal', [(AG, 22.50021, 88.32029)], None),
 'behala-friends': ('Behala Friends', [(AG, 22.5013531, 88.3198079), (PPG, 22.5035, 88.3185)], None),
 'behala-club': ('Behala Club', [(AG, 22.5052597, 88.3140807), (PPG, 22.505368, 88.314285), (NOM, 22.5053684, 88.3142848)], None),
 'sb-park-sarbojanin': ('SB Park Sarbojanin', [(PPG, 22.462537, 88.315526)], None),
 'bantra-mohila-sangha': ('Bantra Mohila Sangha', [], 'Howrah Maidan'),  # durgapujaguide.in: nearest metro Howrah Maidan
 'olabibitala-sarbojanin': ('Olabibitala Sarbojanin', [], 'Howrah Maidan'),  # thepujo.com: nearest metro Howrah Maidan
 'salkia-alapani': ('Salkia Alapani', [], 'Howrah'),
 'ichapur-shivaji-sangha': ('Ichapur Shivaji Sangha', [], 'Ramrajatala'),  # address: Ramrajatala 711104
}
def resolve(stations):
    out = []
    for k, (name, pins, st) in SOURCES.items():
        agree = [(a, b) for i, a in enumerate(pins) for b in pins[i+1:] if a[0] != b[0] and hav(a[1:], b[1:]) <= 250]
        base = {'worth': 0.5, 'reason': None, 'signals': {'news2026': 0, 'theme2026': 0, 'x7d': 0}, 'id': k, 'name': name, 'line': None, 'circuits': [], 'quality': 0.5, 'note': None}
        if agree:
            a = agree[0][0]; s = min(stations, key=lambda s: hav(a[1:], (s['lat'], s['lng'])))
            out.append({**base, 'station': s['name'], 'lat': round(a[1], 6), 'lng': round(a[2], 6), 'precision': 'osm'})
        else:
            s = next(s for s in stations if s['name'] == st) if st else min(stations, key=lambda s: hav(pins[0][1:], (s['lat'], s['lng'])))
            out.append({**base, 'station': s['name'], 'lat': s['lat'], 'lng': s['lng'], 'precision': 'station'})
    return out
def apply(data):
    have = {p['id'] for p in data['pandals']}
    add = [p for p in resolve(data['stations']) if p['id'] not in have]
    data['pandals'] = sorted(data['pandals'] + add, key=lambda p: p['id']); return len(add)
if __name__ == '__main__':
    import sys, hashlib
    f = sys.argv[1]; d = json.load(open(f)); d.pop('hash', None); n = apply(d)
    d['hash'] = hashlib.sha1(json.dumps(d, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()[:8]
    json.dump(d, open(f, 'w'), separators=(',', ':'), ensure_ascii=False); print('passport pandals added', n)
    for p in resolve(d['stations']): print(p['precision'], p['id'], p['station'])
