# Raya and DP's Pujo

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

## User journey
1. **Open.** Landing shows the drum mark, "Near me", "Pick a station", and the North / Central / South switch. Location is requested on load; if the browser blocks it, the first tap asks again, and a denied state shows a chip with per-platform steps.
2. **Located / zone.** A fix (or remembered station, or cached fix under 30 min) opens the route view for that zone. Swipe or tap the switch to change zone; the choice is remembered.
3. **List.** The first card is the next stop: name, open status, one reason, walk time. Pips show progress. "All {zone}" lists every pinned pandal: open first, then by 2026 buzz.
4. **Go.** "Uber here" opens the Uber app with pickup and drop prefilled; "Walk here" opens Google Maps walking; "Start walk in Maps" opens the whole ordered route (max 9 stops).
5. **Arrive.** "I'm here · next stop" advances; the plan re-ranks as you move (>150 m). State survives backgrounding.
6. **Needs.** Food, Toilets, Help tabs show the nearest OSM places; Help has Call 112 / Police 100.
7. **Next / back.** Skip drops a stop; browser back closes the picker with scroll restored; no screen is a dead end.

## Open status (accuracy rules)
- **Open**: only with dated X evidence (first-hand visitor post/photo, or an X post of that pandal's inauguration). News alone never opens a pandal. Tap the word to see the source. Rules: `pipeline/SWEEP.md`.
- **Likely open**: puja dates (16–21 Oct 2026) with no fresh evidence.
- **Closed**: after Dashami (21 Oct).
- Otherwise nothing is shown. Evidence: hand-checked X (`pipeline/raw/x_status.json`, `raw/status_sources.json`) + the X poller; Google News headlines are only leads for X search (`raw/news_leads.json`). DP overrides: `raw/overrides.json`. Pandals whose position could not be verified are hidden.

## Live refresh (every 5 min)
`/workspace/app/refresh-live.sh plan` prints this run's queries (at most 3: the top 6 pandals every run, then 16 more by staleness, batched as OR queries with 25 results each). A scheduled agent runs them through the X connector and saves the raw results, then runs `/workspace/app/refresh-live.sh <result files>`. That run ingests the results, rebuilds `live/status.json`, `live/x.json` and `live/now.json`, and redeploys only if something changed. The client re-reads them every 2 minutes and on focus, with no reload.
Budget: 3 calls × 288 runs = 864 of the 1,000 daily reads. Skip a run when the connector reports fewer than 3 reads left this minute or today.
Strict matching: the post names exactly one pandal; it's from 2026; it isn't a reply, retweet or quote, a promo or an old repost, and it isn't from a bot. Photos also need first-person visit wording. Crowd, queue, closure and traffic alerts expire after 3 hours; photos expire after 48 hours.

## Travel times and recommender (src/lib/roads.ts, src/lib/rank.ts)

**Travel.** `pipeline/roads.py` precomputes OSRM road tables (car: router.project-osrm.org, foot: routing.openstreetmap.de)
from a 0.01° grid over Kolkata (23×15 cells) to every pandal, plus pandal→pandal, into `public/data/roads.json` (~170 KB gz, lazy).
`roadEstimate` bilinearly blends per-metre road ratios from the 4 surrounding cells (exact pair table pandal→pandal) and falls
back to 1.35× straight line when outside the grid. `liveTravel` upgrades with one live OSRM call (2.5 s timeout, cached per ~100 m);
on failure the matrix stays. Car = OSRM free-flow × 2.2 traffic + 1 min; walk = OSRM foot distance at 1.2 m/s.
Calibrated against Google Maps on 10 South pairs (13 Oct 2026, 16:40 IST, `src/lib/fixtures/gmaps-pairs.json`):
median error car minutes ~17%, walk minutes ~6%, road km ~7%. One parameter (traffic) is fitted in-sample; Pujo evenings will be slower.

**Recommender** (no ML: 90 items, 2 users, no training data; borrows structure, not models):
1. *Retrieval* (Meta-style multi-stage): drop closed; keep pandals within 30 car-min, at least the nearest 15.
2. *Ranking*, one multi-objective value: `P(open) × worth − minuteCost × travel × context + bonuses`.
   P(open): open 1, inaugurated 0.9, likely 0.8, unknown 0.7; open visitor evidence adds a sticky bonus.
   `worth` = 2026 grandeur + buzz (guide + X/news signals). Travel = walk minutes (discounted) under 1 km, else car minutes;
   metro-station pins are floored at 10 min and lightly penalised. Context: evening (18–23 IST) and rain raise travel cost.
   Live (Monolith-style freshness): X crowd surge in the last 90 min penalises; a visitor post in the last 2 h boosts.
   Implicit feedback: opened / "I'm here" pandals are demoted.
3. *Re-ranking* (Netflix-style diversity): soft MMR, each earlier pick within 150 m costs 1.2.
Every pick carries `why` reasons. All weights live in `REC`. Evals: `src/lib/rank.test.ts` checks 5 South locations
(`fixtures/recs-south.json`, each with a written justification): the top 5 must contain ≥4 of the local pick. All 5 pass.
