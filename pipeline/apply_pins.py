"""Apply the pin audit (raw/pin_audit.json). A pin is set only where two independent sources agree within 250 m
(OSM, agamoni.in, pujoparikramaguide.in, Nominatim, place listings). Unresolved pandals keep their approximate
(metro) position and the app hides their distance. Never guesses. Called by build.py before hashing."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
def apply(data):
    audit = json.load(open(f'{H}/raw/pin_audit.json')); n = 0
    for p in data['pandals']:
        a = audit.get(p['id'])
        if a and a['verdict'] in ('verified', 'corrected'):
            n += (p['lat'], p['lng'], p['precision']) != (a['lat'], a['lng'], 'osm')
            p['lat'], p['lng'], p['precision'] = a['lat'], a['lng'], 'osm'
    return n
if __name__ == '__main__':  # re-apply to an already built dataset
    import sys, hashlib
    f = sys.argv[1]; d = json.load(open(f)); d.pop('hash', None); n = apply(d)
    d['hash'] = hashlib.sha1(json.dumps(d, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()[:8]
    json.dump(d, open(f, 'w'), separators=(',', ':'), ensure_ascii=False); print('pins applied', n)
