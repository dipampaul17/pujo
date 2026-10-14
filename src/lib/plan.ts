import { GridIndex, haversine, orderRoute, rankScore, pathLength, walkMinutes, MAX_WAYPOINTS, type LatLng } from './geo'

export type Pandal = LatLng & { id: string; name: string; station: string | null; line: string | null; circuits: string[]; precision: 'osm' | 'station' | 'none'; quality: number; note: string | null; worth?: number; reason?: string | null }
export type Amenity = LatLng & { id: string; name: string; kind?: string; cuisine?: string | null; notable?: boolean; fee?: string | null }
export type Dataset = { version: number; hash: string; source: { guide: string; places: string; fetched: string }; pandals: Pandal[]; food: Amenity[]; toilets: Amenity[]; medical: Amenity[]; police: Amenity[]; stations: { name: string; lat: number; lng: number }[] }
export type Stop = Pandal & { dist: number; query?: string }
export type Plan = { stops: Stop[]; walkM: number; walkMin: number; nearestKm: number; outOfRange: boolean }

/** Worth on the same 0-3 scale as guide quality, so it can pull at most ~1 km. */
const w = (p: Pandal) => Math.min(3, (p.worth ?? p.quality) / 2.5)
/** Same place mapped twice (e.g. two OSM nodes): same normalised name within ~80 m. Keeps the first. */
export function dedupePlaces<T extends Amenity>(xs: T[]): T[] {
  const seen = new Map<string, T[]>(), out: T[] = []
  for (const x of xs) {
    const k = x.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
    const prev = seen.get(k) ?? []
    if (k && prev.some(q => Math.abs(q.lat - x.lat) < 7e-4 && Math.abs(q.lng - x.lng) < 8e-4)) continue
    seen.set(k, [...prev, x]); out.push(x)
  }
  return out
}
export function makePlanner(d: Dataset) {
  const located = d.pandals.filter(p => p.lat != null && p.lng != null && p.precision !== 'none')
  // Walks use verified pins only; station-placed pandals stay in the zone list, marked Approximate.
  const pinned = located.filter(p => p.precision === 'osm')
  const pIdx = new GridIndex(pinned.length ? pinned : located)
  const idx = { food: new GridIndex(dedupePlaces(d.food)), toilets: new GridIndex(dedupePlaces(d.toilets)), medical: new GridIndex(d.medical), police: new GridIndex(d.police), stations: new GridIndex(d.stations.map(s => ({ ...s, id: s.name }))) }
  const around = (kind: keyof typeof idx, p: LatLng, k = 5, r = 1500): Array<Amenity & { dist: number }> => idx[kind].near(p, r).slice(0, k) as any

  function plan(origin: LatLng, max = 8, boost: Set<string> | Record<string, number> = new Set()): Plan {
    const bo = (id: string) => boost instanceof Set ? (boost.has(id) ? 4 : 0) : (boost[id] ?? 0)
    let radius = 2500, cand = pIdx.near(origin, radius)
    while (cand.length < 4 && radius < 6000) { radius += 1500; cand = pIdx.near(origin, radius) }
    if (!cand.length) return { stops: [], walkM: 0, walkMin: 0, nearestKm: Math.min(...located.map(p => haversine(origin, p))) / 1000, outOfRange: true }
    // Stops without a verified pin share their metro station's coordinate. Allow at most one per station
    // so the walk never lists several "places" at the same point.
    const usedStation = new Set<string>()
    const picked = [...cand].sort((a, b) => rankScore(a.dist, w(a) + bo(a.id)) - rankScore(b.dist, w(b) + bo(b.id)) || a.id.localeCompare(b.id))
        .filter(p => { const k = `${p.lat},${p.lng}`; if (usedStation.has(k)) return false; usedStation.add(k); return true })
      .slice(0, Math.min(max, MAX_WAYPOINTS + 1))
    const withQuery: Stop[] = picked.map(p => (p.precision === 'station' ? { ...p, query: `${p.name} Durga Puja, Kolkata` } : p))
    const stops = orderRoute(origin, withQuery)
    const walkM = pathLength(origin, stops)
    return { stops, walkM, walkMin: walkMinutes(walkM), nearestKm: stops[0].dist / 1000, outOfRange: false }
  }
  return { plan, around, located, nearestStation: (p: LatLng) => idx.stations.nearest(p, 1, 8000)[0] }
}

/** Area picker: one anchor per metro station named in the guide, ordered north to south. */
export function areas(d: Dataset) {
  const m = new Map<string, Pandal[]>()
  for (const p of d.pandals) if (p.station && p.lat) (m.get(p.station) ?? m.set(p.station, []).get(p.station)!).push(p)
  return [...m.entries()].map(([name, ps]) => {
    const st = ps.find(p => p.precision === 'station') ?? ps[0]
    const s = d.stations.find(x => x.name.toLowerCase() === name.toLowerCase())
    return { name, count: ps.length, lat: s?.lat ?? st.lat, lng: s?.lng ?? st.lng }
  }).sort((a, b) => b.lat - a.lat)
}


/** Deterministic "right now" nudges. No network, no model. No time-of-day crowd claims: crowds come only from live X reports. */
export function nudges(hour: number, ctx: { toiletM?: number; foodName?: string; foodM?: number; station?: string; stationM?: number; walkMin: number }) {
  const out: string[] = []
  if (hour >= 22 || hour < 2) out.push(ctx.station ? `Last metro? ${ctx.station} is ${Math.round((ctx.stationM ?? 0) / 100) / 10} km away.` : 'Check the last metro.')
  if (ctx.walkMin > 90) out.push(`Long walk. Skip a stop if you're tired.`)
  return out
}

export type Zone = 'north' | 'central' | 'south' | 'saltlake'
export const ZONES: Zone[] = ['north', 'central', 'south', 'saltlake']
/** Salt Lake = Bidhannagar Sectors I-V plus Lake Town/Sreebhumi (hopped as one circuit): east of the Ultadanga/Kestopur canal
 *  line (lng >= 88.40), from Beleghata's edge (22.555) up to below Baguiati (22.605). Dum Dum Park and Ultadanga stay North. */
export const inSaltLake = (p: { lat: number; lng: number }) => p.lng >= 88.40 && p.lat >= 22.555 && p.lat < 22.605
/** Deterministic: the Salt Lake box first, then latitude bands. */
export const zoneOf = (p: { lat: number; lng: number }): Zone => (inSaltLake(p) ? 'saltlake' : p.lat >= 22.58 ? 'north' : p.lat >= 22.54 ? 'central' : 'south')
/** Tab order: my zone first, then the rest in the usual North → South → Salt Lake order. */
export const zoneOrder = (mine: Zone | null): Zone[] => (mine ? [mine, ...ZONES.filter(z => z !== mine)] : [...ZONES])
/** Zone start points: the guide's busiest metro in each belt. */
export const ZONE_ANCHOR: Record<Zone, { name: string; lat: number; lng: number }> = {
  north: { name: 'Shyambazar metro', lat: 22.601335, lng: 88.372497 },
  central: { name: 'Central metro', lat: 22.572486, lng: 88.358743 },
  south: { name: 'Kalighat metro', lat: 22.516875, lng: 88.345845 },
  saltlake: { name: 'City Centre metro', lat: 22.587099, lng: 88.407891 },
}
export const zoneCounts = (d: Dataset) => {
  const c: Record<Zone, number> = { north: 0, central: 0, south: 0, saltlake: 0 }
  for (const p of d.pandals) if (p.lat != null) c[zoneOf(p)]++
  return c
}
export const nextZone = (z: Zone, dir: 1 | -1): Zone => ZONES[Math.max(0, Math.min(ZONES.length - 1, ZONES.indexOf(z) + dir))]

/** Up to 2 tags per pandal, from real data only: one identity tag from the guide's circuits, one utility tag from mapped places. */
export function tagsFor(p: Pandal, near: { toiletM?: number; notableFoodM?: number }): string[] {
  const c = p.circuits.join(' ')
  const identity = /Big Pandal/.test(c) ? 'Iconic' : /Old Kolkata/.test(c) ? 'Heritage' : /Sreebhumi/.test(c) ? 'Big theme' : /Salt Lake/.test(c) ? 'Block pujo' : null
  const utility = near.toiletM != null && near.toiletM <= 400 ? 'Toilet nearby' : near.notableFoodM != null && near.notableFoodM <= 500 ? 'Food nearby' : null
  return [identity, utility].filter((x): x is string => !!x).slice(0, 2)
}
export function tagContext(planner: ReturnType<typeof makePlanner>, p: LatLng) {
  const t = planner.around('toilets', p, 1, 400)[0]
  const f = planner.around('food', p, 20, 500).find(x => x.notable)
  return { toiletM: t?.dist, notableFoodM: f?.dist }
}

/** Pujo 2026 days (Puja Parikrama panjika): Shashthi 16-17, Saptami 18, Ashtami 19, Navami 20, Dashami 21 Oct. */
export function pujoDay(istDate: string): string | null {
  const m: Record<string, string> = { '2026-10-16': 'Shashthi', '2026-10-17': 'Shashthi', '2026-10-18': 'Saptami', '2026-10-19': 'Ashtami', '2026-10-20': 'Navami', '2026-10-21': 'Dashami' }
  return m[istDate] ?? null
}
export function dayTip(day: string | null, hour: number): string | null {
  if (day === 'Ashtami' && hour >= 7 && hour < 12) return 'Ashtami anjali this morning.'
  if (day === 'Dashami') return 'Dashami. Sindoor khela, then immersions; some pandals close early.'
  return null
}
export type NowItem = { title: string; source: string; link: string; published: string; zones: string[]; pandals: string[] }
/** Only <6 h old and about this zone, these stops, or the whole city. */
export function relevantNow(items: NowItem[], zone: string | null, stopIds: string[], now: number) {
  return items.filter(i => now - Date.parse(i.published) < 6 * 3600e3 && (i.zones.includes('all') || (zone && i.zones.includes(zone)) || i.pandals.some(p => stopIds.includes(p))))
}

export type StatusFile = { updated: string; puja: { start: string; end: string; public_from?: string }; open: Record<string, { since: string; evidence: string; note: string; kind?: string }> }
export type Status = { key: 'open' | 'inaugurated' | 'likely' | 'closed'; label: string; evidence?: string } | null
/** Evidence beats calendar; calendar only says "Likely". Before public entry, evidence means "Inaugurated". Unknown shows nothing. */
export function statusOf(id: string, istDate: string, s: StatusFile | null, nowMs: number = Date.now()): Status {
  if (!s) return null
  if (istDate > s.puja.end) return { key: 'closed', label: 'Closed' }
  const e = s.open[id], publicFrom = s.puja.public_from ? Date.parse(s.puja.public_from) : Date.parse(s.puja.start + 'T00:00:00+05:30')
  if (e?.kind === 'closed') return { key: 'closed', label: 'Closed', evidence: e.evidence }
  if (e && e.since <= istDate) return nowMs < publicFrom && e.kind !== 'visitors' ? { key: 'inaugurated', label: 'Inaugurated', evidence: e.evidence } : { key: 'open', label: 'Open', evidence: e.evidence }
  if (istDate >= s.puja.start) return { key: 'likely', label: 'Likely open' }
  return null
}
/** The one Open predicate: visitor-confirmed or inaugurated (= status.json entries that are not closed). */
export const isOpen = (s: Status) => s?.key === 'open' || s?.key === 'inaugurated'
/** Food/toilets/help are searched around me when I have a fix, else around the view. */
export const helpOrigin = <T,>(me: T | null, view: T): T => me ?? view
export const statusRank = (s: Status) => (s?.key === 'open' || s?.key === 'inaugurated' ? 0 : s?.key === 'likely' ? 1 : s ? 3 : 2)

/** Suggestion tier: Open, then Inaugurated, then Likely, then unknown. */
export const tier = (s: Status) => (s?.key === 'open' ? 0 : s?.key === 'inaugurated' ? 1 : s?.key === 'likely' ? 2 : 3)
/** Suggested order: status tier first; inside a tier, distance blended with grandeur when we know where you are
 *  (a grander pandal up to ~1 km farther can still lead), else grandeur alone. */
export function suggest<T extends Pandal>(ps: T[], status: (id: string) => Status, here: LatLng | null): T[] {
  const k = (p: T) => here ? rankScore(haversine(here, p), w(p)) : -w(p) * 10
  return ps.map(p => ({ p, t: tier(status(p.id)), k: k(p) })).sort((a, b) => a.t - b.t || a.k - b.k || a.p.id.localeCompare(b.p.id)).map(x => x.p)
}
