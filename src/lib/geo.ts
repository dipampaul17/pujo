export type LatLng = { lat: number; lng: number }
export type Place = LatLng & { id: string; name: string }

const R = 6371000
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Walking in a Pujo crowd: ~3.6 km/h plus 1.3x street detour factor. */
export const walkMinutes = (m: number) => Math.max(1, Math.round((m * 1.3) / 60))

/** Uniform grid index (~1.1 km cells). O(1) neighbourhood lookup, deterministic. */
export class GridIndex<T extends LatLng> {
  private cells = new Map<string, T[]>()
  private cell: number
  constructor(items: T[], cell = 0.01) {
    this.cell = cell
    for (const it of items) {
      const k = this.key(it.lat, it.lng)
      const arr = this.cells.get(k)
      arr ? arr.push(it) : this.cells.set(k, [it])
    }
  }
  private key(lat: number, lng: number) { return `${Math.floor(lat / this.cell)}:${Math.floor(lng / this.cell)}` }
  /** Items within radius (m), sorted by distance then id for determinism. */
  near(p: LatLng, radius: number): Array<T & { dist: number }> {
    const r = Math.ceil(radius / 1100 / (this.cell / 0.01)) + 1
    const ci = Math.floor(p.lat / this.cell), cj = Math.floor(p.lng / this.cell)
    const out: Array<T & { dist: number }> = []
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++)
        for (const it of this.cells.get(`${i}:${j}`) ?? []) {
          const dist = haversine(p, it)
          if (dist <= radius) out.push({ ...it, dist })
        }
    return out.sort((a, b) => a.dist - b.dist || String((a as any).id ?? (a as any).name).localeCompare(String((b as any).id ?? (b as any).name)))
  }
  nearest(p: LatLng, k = 3, maxRadius = 3000) {
    for (let rad = 500; rad <= maxRadius; rad *= 2) { const n = this.near(p, rad); if (n.length >= k) return n.slice(0, k) }
    return this.near(p, maxRadius).slice(0, k)
  }
}

/** Rank pandals: distance penalised, guide prominence rewarded. Lower is better. */
export function rankScore(distM: number, quality: number) { return distM / 1000 - 0.35 * quality }

/** Open path from origin through all stops (no return). Nearest-neighbour then 2-opt. */
export function orderRoute<T extends LatLng>(origin: LatLng, stops: T[]): T[] {
  if (stops.length <= 1) return [...stops]
  const left = [...stops], path: T[] = []
  let cur: LatLng = origin
  while (left.length) {
    let bi = 0, bd = Infinity
    left.forEach((s, i) => { const d = haversine(cur, s); if (d < bd) { bd = d; bi = i } })
    cur = left[bi]; path.push(left.splice(bi, 1)[0])
  }
  const pts: LatLng[] = [origin, ...path]
  const d = (i: number, j: number) => haversine(pts[i], pts[j])
  let improved = true, guard = 0
  while (improved && guard++ < 100) {
    improved = false
    for (let i = 1; i < pts.length - 1; i++)
      for (let k = i + 1; k < pts.length; k++) {
        const before = d(i - 1, i) + (k + 1 < pts.length ? d(k, k + 1) : 0)
        const after = d(i - 1, k) + (k + 1 < pts.length ? d(i, k + 1) : 0)
        if (after + 1e-6 < before) { pts.splice(i, k - i + 1, ...pts.slice(i, k + 1).reverse()); improved = true }
      }
  }
  return pts.slice(1) as T[]
}

export const pathLength = (origin: LatLng, stops: LatLng[]) =>
  stops.reduce((acc, s, i) => acc + haversine(i ? stops[i - 1] : origin, s), 0)

/** Google Maps allows origin + destination + max 9 waypoints in URLs. */
export const MAX_WAYPOINTS = 9
const ll = (p: LatLng & { query?: string }) => p.query ?? `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`

export function mapsDirUrl(origin: LatLng | null, stops: Array<LatLng & { query?: string }>, mode: 'walking' | 'transit' = 'walking') {
  if (!stops.length) throw new Error('route needs at least one stop')
  const capped = stops.slice(0, MAX_WAYPOINTS + 1)
  const dest = capped[capped.length - 1]
  const wps = capped.slice(0, -1)
  const q = new URLSearchParams({ api: '1', destination: ll(dest), travelmode: mode })
  if (origin) q.set('origin', ll(origin))
  if (wps.length) q.set('waypoints', wps.map(ll).join('|'))
  return `https://www.google.com/maps/dir/?${q.toString()}`
}

export const mapsPlaceUrl = (p: LatLng, name?: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name ? `${name}, Kolkata` : ll(p))}`

export function fmtDist(m: number) { return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km` }

/** Uber universal link: opens the app if installed, else m.uber.com. Pickup = my_location unless a fix is given. */
export function uberUrl(dest: LatLng & { name: string; address?: string }, pickup?: LatLng | null) {
  const q = new URLSearchParams({ action: 'setPickup' })
  if (pickup) { q.set('pickup[latitude]', pickup.lat.toFixed(6)); q.set('pickup[longitude]', pickup.lng.toFixed(6)) } else q.set('pickup', 'my_location')
  q.set('dropoff[latitude]', dest.lat.toFixed(6)); q.set('dropoff[longitude]', dest.lng.toFixed(6))
  q.set('dropoff[nickname]', dest.name); q.set('dropoff[formatted_address]', dest.address ?? `${dest.name}, Kolkata`)
  return `https://m.uber.com/ul/?${q.toString()}`
}
