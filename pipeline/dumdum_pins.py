"""Dum Dum / Lake Town pins checked 20 Oct 2026; each had been sharing one station pin. Every pin has two agreeing sources.
id: (lat, lng, sources)"""
import json, sys, hashlib
PINS = {
 'dum-dum-park-bharat-chakra': (22.61082, 88.4146, 'Pandal Pathik 22.61082,88.4146 = Agamoni/Google 22.610821,88.414600 = Pujo Map 22.61080,88.41456'),
 'dum-dum-park-tarun-sangha': (22.61072, 88.41378, 'Pandal Pathik (DP: about 100 m from Bharat Chakra; 2026 ship theme, Bengal maritime trade). Agamoni/Pujo Map put it 250 m west at 22.6100,88.4115'),
 'dum-dum-park-tarun-dal': (22.61161, 88.4189, 'Pujo Map 22.61161,88.41890 = Agamoni/Google 22.611732,88.418739 = Pandal Pathik 22.6112,88.41875'),
 'arjunpur-amra-sabai-club': (22.62429, 88.42454, 'Pandal Pathik 22.62429,88.42454 = Agamoni/Google 22.624705,88.424566'),
 'dum-dum-park-sarbajanin': (22.60962, 88.41643, 'Pujo Map 22.60962,88.41643 = Agamoni/Google 22.609436,88.416405'),
 'golaghata-sammilani': (22.59734, 88.39915, 'Pandal Pathik 22.59734,88.39915; OSM Golaghata locality 22.59611,88.40030 (180 m)'),
}
def apply(d):
    n = 0
    for p in d['pandals']:
        if p['id'] in PINS: la, ln, _ = PINS[p['id']]; p.update(lat=la, lng=ln, precision='osm'); n += 1
    return n
if __name__ == '__main__':
    f = sys.argv[1]; d = json.load(open(f)); d.pop('hash', None); print('re-pinned', apply(d))
    d['hash'] = hashlib.sha1(json.dumps(d, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()[:8]
    json.dump(d, open(f, 'w'), separators=(',', ':'), ensure_ascii=False)
