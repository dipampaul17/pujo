import { haversine, type LatLng } from './geo'

/** Travel model, one place. Car: OSRM free-flow road time × Kolkata traffic factor + fixed pickup overhead.
 *  Walk: OSRM foot distance at crowd pace. Calibrated against Google Maps (src/lib/fixtures/gmaps-pairs.json). */
export const TRAVEL = {
  trafficFactor: 2.2,     // Google live traffic ÷ OSRM free-flow; one parameter fitted on the 10 fixture pairs (13 Oct, 16:40 IST, pre-Pujo weekday). Pujo evenings will be slower.
  carOverheadMin: 1,      // pickup / drop-off
  walkMps: 1.2,           // ~4.3 km/h: Google's pace slowed for Pujo crowds
  circuity: 1.35,         // road ÷ straight-line when no matrix is available (median of the fixture)
  fallbackCarKmh: 18,     // city speed for the no-matrix fallback
}
/** Grid of OSRM tables: cells → pandals, both profiles. Units: durations in 10 s, distances in 10 m; -1 = no route. */
export type Roads = { v: number; pts: [number, number][]; fetched: string; grid: { lat0: number; lng0: number; step: number; rows: number; cols: number }; ids: string[]
  car: { cellT: number[][]; cellD: number[][]; pairT: number[][]; pairD: number[][] }; foot: { cellT: number[][]; cellD: number[][]; pairT: number[][]; pairD: number[][] } }
export type Travel = { carMin: number; walkMin: number; carM: number; walkM: number; crowKm: number; basis: 'road' | 'estimate' | 'live'; traffic?: boolean }

const near = (roads: Roads, p: LatLng): number => { // index of the pandal pin this point sits on (≤ 60 m), else -1
  const pins = (roads as any)._pins ??= roads.ids.map((_, i) => i)
  let best = -1, bd = 60
  for (const i of pins) { const q = (roads as any)._pt?.[i]; if (!q) continue; const d = haversine(p, q); if (d < bd) { bd = d; best = i } }
  return best
}
/** Per-metre road ratios at a grid cell for a destination, from the cell's own table row. */
function ratiosAt(roads: Roads, r: number, c: number, to: LatLng, j: number) {
  const g = roads.grid; if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null
  const k = r * g.cols + c, cell = { lat: g.lat0 + r * g.step, lng: g.lng0 + c * g.step }
  const h = haversine(cell, to); if (h < 250) return null
  const ct = roads.car.cellT[k]?.[j], cd = roads.car.cellD[k]?.[j], fd = roads.foot.cellD[k]?.[j]
  if (ct == null || ct < 0 || cd < 0 || fd < 0) return null
  return { t: (ct * 10) / h, d: (cd * 10) / h, f: (fd * 10) / h, h }
}
/** Matrix columns are only valid while a pin sits where it was when the matrix was built (≤ 60 m). Moved pins fall back. */
export function attachPins(roads: Roads, _pins?: Record<string, LatLng>) { (roads as any)._pt = (roads.pts ?? []).map(([lat, lng]) => ({ lat, lng })); return roads }

/** Road estimate from → to. Uses the destination's column (to must be a pandal pin) with bilinear-weighted per-metre ratios
 *  from the 4 surrounding grid cells; pandal→pandal uses the exact pair table. Falls back to circuity × straight line. */
export function roadEstimate(roads: Roads | null, from: LatLng, to: LatLng): Travel {
  const crow = haversine(from, to)
  const fin = (carS: number, carM: number, walkM: number, basis: Travel['basis']): Travel => ({
    carMin: Math.max(TRAVEL.carOverheadMin + 1, Math.round(TRAVEL.carOverheadMin + (carS * TRAVEL.trafficFactor) / 60)),
    walkMin: Math.max(1, Math.round(walkM / TRAVEL.walkMps / 60)), carM, walkM, crowKm: crow / 1000, basis })
  const fallback = () => { const m = crow * TRAVEL.circuity; return fin((m / 1000 / TRAVEL.fallbackCarKmh) * 3600 / TRAVEL.trafficFactor, m, m, 'estimate') }
  if (!roads) return fallback()
  if (crow < 120) return fin(crow * 1.4 / 5, crow * 1.4, crow * 1.3, 'road')
  let j = roads.ids.findIndex((_, i) => { const q = (roads as any)._pt?.[i]; return q && haversine(q, to) < 40 })
  if (j < 0 && (roads as any).dest) j = (roads as any).dest(to)
  if (j < 0) return fallback()
  const i = near(roads, from)
  if (i >= 0 && i !== j) { const t = roads.car.pairT[i][j], d = roads.car.pairD[i][j], f = roads.foot.pairD[i][j]; if (t >= 0 && d >= 0 && f >= 0) return fin(t * 10, d * 10, f * 10, 'road') }
  const g = roads.grid, fr = (from.lat - g.lat0) / g.step, fc = (from.lng - g.lng0) / g.step
  const r0 = Math.floor(fr), c0 = Math.floor(fc), wr = fr - r0, wc = fc - c0
  let W = 0, T = 0, D = 0, F = 0
  for (const [dr, dc, w] of [[0, 0, (1 - wr) * (1 - wc)], [0, 1, (1 - wr) * wc], [1, 0, wr * (1 - wc)], [1, 1, wr * wc]] as const) {
    const q = ratiosAt(roads, r0 + dr, c0 + dc, to, j); if (!q || w <= 0) continue
    W += w; T += w * q.t; D += w * q.d; F += w * q.f
  }
  if (W < 0.15) return fallback()
  // Ratios blow up near the destination; cap to sane circuity (1.0–2.6) so short hops stay honest.
  const cl = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
  const dR = cl(D / W, 1.0, 2.6), fR = cl(F / W, 1.0, 2.6), tPerM = cl(T / W, 0.06, 0.5)
  return fin(crow * tPerM, crow * dR, crow * fR, 'road')
}

/** Live upgrade: one OSRM table call from the user's fix to all pins, car + foot in parallel.
 *  Hard timeout; any failure resolves null and the caller keeps the matrix estimate. Cached per ~100 m cell. */
const liveCache = new Map<string, Record<string, Travel>>()
export async function liveTravel(from: LatLng, pins: Array<LatLng & { id: string }>, timeoutMs = 2500, f: typeof fetch = fetch): Promise<Record<string, Travel> | null> {
  const key = `${from.lat.toFixed(3)},${from.lng.toFixed(3)}`; if (liveCache.has(key)) return liveCache.get(key)!
  const co = [from, ...pins].map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
  const q = `?sources=0&annotations=duration,distance`
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const [car, foot] = await Promise.all([
      f(`https://router.project-osrm.org/table/v1/driving/${co}${q}`, { signal: ctl.signal }).then(r => r.json()),
      f(`https://routing.openstreetmap.de/routed-foot/table/v1/foot/${co}${q}`, { signal: ctl.signal }).then(r => r.json())])
    if (car.code !== 'Ok' || foot.code !== 'Ok') return null
    const out: Record<string, Travel> = {}
    pins.forEach((p, i) => {
      const cs = car.durations[0][i + 1], cm = car.distances[0][i + 1], fm = foot.distances[0][i + 1]
      if (cs == null || cm == null || fm == null) return
      out[p.id] = { carMin: Math.max(TRAVEL.carOverheadMin + 1, Math.round(TRAVEL.carOverheadMin + (cs * TRAVEL.trafficFactor) / 60)), walkMin: Math.max(1, Math.round(fm / TRAVEL.walkMps / 60)), carM: cm, walkM: fm, crowKm: haversine(from, p) / 1000, basis: 'live' }
    })
    liveCache.set(key, out); return out
  } catch { return null } finally { clearTimeout(t) }
}
/** Display: both modes, one quiet line. Walk only when it is sane on foot (< 45 min). */
export const travelParts = (t: Travel) => ({ car: `${t.carMin} min`, walk: t.walkMin <= 45 ? `${t.walkMin} min` : null, approx: t.basis === 'estimate' })
