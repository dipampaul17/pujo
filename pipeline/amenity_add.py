"""Merge OSM food/toilets for South Kolkata (pipeline/raw/osm_amenities_south.json) into the dataset. Idempotent; named eateries only; no invented places."""
import json, sys, math, hashlib
def ll(e): return (e.get('lat') or e['center']['lat'], e.get('lon') or e['center']['lon'])
def near(a, b): return math.hypot((a[0]-b[0])*111.2, (a[1]-b[1])*103.1) * 1000
def apply(d, els):
    n = 0; ids = {x['id'] for x in d['food'] + d['toilets']}
    for e in els:
        t = e['tags']; kind = t.get('amenity') or t.get('shop'); (lat, lng) = ll(e)
        if kind == 'toilets':
            i = f"t{e['id']}"
            if i in ids or any(near((x['lat'], x['lng']), (lat, lng)) < 30 for x in d['toilets']): continue
            d['toilets'].append({'id': i, 'name': t.get('name') or 'Public toilet', 'lat': round(lat, 6), 'lng': round(lng, 6), 'kind': 'toilet', 'fee': t.get('fee'), 'access': t.get('access'), 'emergency': None, 'osm': f"https://www.openstreetmap.org/{e['type']}/{e['id']}"})
        else:
            if not t.get('name'): continue
            i = f"f{e['id']}"
            if i in ids or any(x['name'].lower() == t['name'].lower() and near((x['lat'], x['lng']), (lat, lng)) < 60 for x in d['food']): continue
            d['food'].append({'id': i, 'name': t['name'], 'lat': round(lat, 6), 'lng': round(lng, 6), 'kind': kind, 'cuisine': t.get('cuisine'), 'notable': False, 'osm': f"https://www.openstreetmap.org/{e['type']}/{e['id']}"})
        ids.add(i); n += 1
    return n
if __name__ == '__main__':
    f = sys.argv[1]; d = json.load(open(f)); d.pop('hash', None)
    n = apply(d, json.load(open(sys.argv[2]))['elements'])
    d['hash'] = hashlib.sha1(json.dumps(d, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()[:8]
    json.dump(d, open(f, 'w'), separators=(',', ':'), ensure_ascii=False); print('added', n)
