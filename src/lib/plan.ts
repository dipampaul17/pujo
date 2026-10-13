import { GridIndex, orderRoute, rankScore, pathLength, walkMinutes, MAX_WAYPOINTS, type LatLng } from './geo'

export type Pandal = LatLng & { id: string; name: string; station: string | null; line: string | null; circuits: string[]; precision: 'osm' | 'station' | 'none'; quality: number; note: string | null }
export type Amenity = LatLng & { id: string; name: string; kind?: string; cuisine?: string | null; notable?: boolean; fee?: string | null }
export type Dataset = { version: number; hash: string; source: { guide: string; places: string; fetched: string }; pandals: Pandal[]; food: Amenity[]; toilets: Amenity[]; medical: Amenity[]; police: Amenity[]; stations: { name: string; lat: number; lng: number }[] }
export type Stop = Pandal & { dist: number; query?: string }
export type Plan = { stops: Stop[]; walkM: number; walkMin: number; nearestKm: number; outOfRange: boolean }

export function makePlanner(d: Dataset) {
  const located = d.pandals.filter(p => p.lat != null && p.lng != null && p.precision !== 'none')
  const pIdx = new GridIndex(located)
  const idx = { food: new GridIndex(d.food), toilets: new GridIndex(d.toilets), medical: new GridIndex(d.medical), police: new GridIndex(d.police), stations: new GridIndex(d.stations.map(s => ({ ...s, id: s.name }))) }
  const around = (kind: keyof typeof idx, p: LatLng, k = 5, r = 1500): Array<Amenity & { dist: number }> => idx[kind].near(p, r).slice(0, k) as any

  function plan(origin: LatLng, max = 8): Plan {
    let radius = 2500, cand = pIdx.near(origin, radius)
    while (cand.length < 4 && radius < 6000) { radius += 1500; cand = pIdx.near(origin, radius) }
    const nearest = pIdx.nearest(origin, 1, 50000)[0]
    if (!cand.length) return { stops: [], walkM: 0, walkMin: 0, nearestKm: nearest ? nearest.dist / 1000 : Infinity, outOfRange: true }
    // Stops without a verified pin share their metro station's coordinate. Allow at most one per station
    // so the walk never lists several "places" at the same point.
    const usedStation = new Set<string>()
    const picked = [...cand].sort((a, b) => rankScore(a.dist, a.quality) - rankScore(b.dist, b.quality) || a.id.localeCompare(b.id))
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


/** Deterministic "right now" nudges. No network, no model. */
export function nudges(hour: number, ctx: { toiletM?: number; foodName?: string; foodM?: number; station?: string; stationM?: number; walkMin: number }) {
  const out: string[] = []
  if (hour >= 6 && hour < 15) out.push('Quiet hours. Good time to go.')
  if (hour >= 18 && hour < 22) out.push('Peak crowds. Allow extra time.')
  if (hour >= 15 && hour < 18) out.push('Queues grow after sunset. Do the first two now.')
  if (hour >= 22 || hour < 2) out.push(ctx.station ? `Last metro? ${ctx.station} is ${Math.round((ctx.stationM ?? 0) / 100) / 10} km away.` : 'Check the last metro.')
  if (ctx.walkMin > 90) out.push(`Long walk. Skip a stop if you're tired.`)
  return out
}
