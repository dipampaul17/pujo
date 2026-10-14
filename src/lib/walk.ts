import type { LatLng } from './geo'
type Stop = LatLng & { id: string; precision?: string }
export type Walk<T> = { stops: T[]; totalMin: number; closed: string[]; approx: string[] }

/** Visiting order from my position: nearest-neighbour, then 2-opt (open path). Closed skipped; approximate pins aren't walkable. */
export function planWalk<T extends Stop>(origin: LatLng, picked: T[], o: { cost: (a: LatLng, b: T) => number; closed: (id: string) => boolean }): Walk<T> {
  const closed = picked.filter(p => o.closed(p.id)).map(p => p.id)
  const approx = picked.filter(p => !o.closed(p.id) && p.precision === 'station').map(p => p.id)
  const left = picked.filter(p => !o.closed(p.id) && p.precision !== 'station'), path: T[] = []
  let cur: LatLng = origin
  while (left.length) { let bi = 0; left.forEach((s, i) => { if (o.cost(cur, s) < o.cost(cur, left[bi])) bi = i }); cur = left[bi]; path.push(left.splice(bi, 1)[0]) }
  const len = (s: T[]) => s.reduce((t, x, i) => t + o.cost(i ? s[i - 1] : origin, x), 0)
  let best = path, improved = true
  while (improved) { improved = false
    for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++) {
      const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)]
      if (len(cand) + 1e-9 < len(best)) { best = cand; improved = true } } }
  return { stops: best, totalMin: Math.round(len(best)), closed, approx }
}
const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
/** Google Maps walking directions; ≤ 9 waypoints per URL, so longer walks become legs that chain end → start. */
export function walkLegs(origin: LatLng, stops: LatLng[]): string[] {
  const out: string[] = []; let from = origin
  for (let i = 0; i < stops.length; i += 10) {
    const leg = stops.slice(i, i + 10), dest = leg[leg.length - 1]
    const q = new URLSearchParams({ api: '1', origin: ll(from), destination: ll(dest), travelmode: 'walking' })
    if (leg.length > 1) q.set('waypoints', leg.slice(0, -1).map(ll).join('|'))
    out.push(`https://www.google.com/maps/dir/?${q.toString()}`); from = dest
  }
  return out
}
