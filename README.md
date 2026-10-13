# Dhaak

Durga Puja 2026 in Kolkata: the best pandals near you, in walking order, with food, toilets and help on the way. One tap opens the whole walk in Google Maps.

Static site, no server. Data is bundled; a scheduled GitHub Action refreshes the award-news feed.

## Funnel

| Step | What the person sees | Next action | Dead-end guard |
|---|---|---|---|
| 1. Land | One line, three real counts, one red button at thumb height | Find pandals near me | "Or pick a metro station" right under it |
| 2. Locate | Browser permission prompt | none, it resolves itself | Denied, timeout or no GPS goes straight to the station picker with a plain reason |
| 3. Nearby list | Up to 8 stops ranked by distance and guide prominence, then ordered into a walk | Tap a stop to open it in Maps, or Skip it | Outside Kolkata: says how far the nearest pandal is and offers the picker |
| 4. Route | Stop count, minutes, km; first stop glows | Start walk in Google Maps (sticky) | Skip/restore; route rebuilds instantly |
| 5. In-route help | Tabs: Food, Toilets, Help (112/100, nearest metro, hospitals, police) | Tap any row for Maps | Empty states say what to do instead |
| 6. Share | Web Share sheet, or copy to clipboard | Send to your Pujo gang | Clipboard fallback with a toast |
| Live | Award headlines with source and check time; "In award news" tag on a matched stop | Open the story | Feed failure hides the section, app works the same |

## Architecture

```
pipeline/guide.pdf ─pdftotext─▶ extract.py ─▶ geocode.py (Photon/OSM, cached, station-biased) ─▶ build.py ─▶ src/data/dhaak.v1.json
                                                              raw/*.json (Overpass: stations, food, toilets, medical, police)
```

* `pipeline/run.sh` reruns everything. `raw/geocache.json` makes reruns offline and deterministic.
* `build.py` validates the schema (types, Kolkata bounding box, unique ids), dedupes by slug, rejects fuzzy geocoder matches whose name does not match (difflib), and falls back to the metro-station coordinate with `precision: "station"`. Nothing is invented: unmatched pandals are flagged in the UI as "exact spot unverified", and Google Maps gets the pandal *name* for those stops instead of a fake pin.
* Ranking (`src/lib/plan.ts`): grid spatial index (≈1.1 km cells) → candidates within 2.5 km (widening to 6 km) → score `km − 0.35·quality` (quality = guide circuit membership + notes) → top 8 → nearest-neighbour + 2-opt open path from the user → Google Maps `dir/?api=1` URL capped at 9 waypoints + destination.
* "Right now" nudges are deterministic rules on IST hour and route length. No model call. An AI layer can plug into `nudges()` later; this rule set stays as the fallback.
* Live feed (`pipeline/awards.py`, every 30 min in Actions): Google News RSS for 2026 award coverage. Only headlines that name a guide pandal get matched. We link the story and never declare a winner. The app shows an in-app toast for stories newer than your last visit. Web push is not shipped (needs a push server and VAPID keys); in-app updates are the fallback.
* Offline: `public/sw.js` caches the shell and hashed assets cache-first, the feed network-first.
* Fonts: Instrument Serif (display), Geist (UI), English only, no third font. All self-hosted with `font-display: swap`.

## Tests

`npx vitest run`: haversine, grid index vs brute force, ranking, NN+2-opt never worse than input order, URL building and waypoint cap, planner on real data (North, South, out of range, determinism), nudges, metro-placed stop collapse.

## Known gaps

* The guide has no opening times, so there is no "open now" filter. Most pandals run late into the night during Pujo; we say that instead of guessing.
* 43 of 89 pandals have an unverified pin (metro-station fallback), 3 have no location (their station is not in OSM).
* Toilets come from OpenStreetMap and are sparse.
* Behala, Khidirpur, New Town and Lake Town are named in the guide without specific pandals, so they are not on the map.

Sources: Travel With Preet, Kolkata Durga Puja Pandal Hopping Guide 2026. Place data © OpenStreetMap contributors (ODbL).
