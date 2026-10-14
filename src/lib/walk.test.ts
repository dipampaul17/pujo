import { describe, it, expect } from 'vitest'
import { planWalk, walkLegs } from './walk'
import { haversine } from './geo'
const cost = (a: any, b: any) => haversine(a, b) / 80 // ~minutes at 80 m/min
const O = { lat: 22.5, lng: 88.35 }
const pt = (id: string, lat: number, lng: number, extra: any = {}) => ({ id, name: id, lat, lng, ...extra })
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const perms = <T,>(a: T[]): T[][] => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]))
const len = (o: any, s: any[]) => s.reduce((t, x, i) => t + cost(i ? s[i - 1] : o, x), 0)

describe('walk plan', () => {
  it('starts from me and visits every selected stop once', () => {
    const s = [pt('a', 22.51, 88.35), pt('b', 22.502, 88.351), pt('c', 22.52, 88.36)]
    const w = planWalk(O, s, { cost, closed: () => false })
    expect(w.stops.map(x => x.id).sort()).toEqual(['a', 'b', 'c']); expect(w.stops[0].id).toBe('b')
  })
  it('within 5% of the optimum for random sets of ≤7', () => {
    for (let k = 0; k < 30; k++) { const n = 3 + Math.floor(rnd() * 5), s = Array.from({ length: n }, (_, i) => pt('p' + i, 22.49 + rnd() * 0.04, 88.34 + rnd() * 0.04))
      const best = Math.min(...perms(s).map(p => len(O, p))), got = len(O, planWalk(O, s, { cost, closed: () => false }).stops)
      expect(got).toBeLessThanOrEqual(best * 1.05 + 1e-9) }
  })
  it('skips closed pandals and leaves out approximate pins (counted, not walked)', () => {
    const s = [pt('a', 22.51, 88.35), pt('x', 22.505, 88.35), pt('m', 22.506, 88.351, { precision: 'station' })]
    const w = planWalk(O, s, { cost, closed: id => id === 'x' })
    expect(w.stops.map(x => x.id)).toEqual(['a']); expect(w.closed).toEqual(['x']); expect(w.approx).toEqual(['m'])
  })
  it('total = sum of hops', () => {
    const s = [pt('a', 22.51, 88.35), pt('b', 22.52, 88.35)], w = planWalk(O, s, { cost, closed: () => false })
    expect(w.totalMin).toBe(Math.round(len(O, w.stops)))
  })
})
describe('Google Maps legs', () => {
  const stops = Array.from({ length: 23 }, (_, i) => pt('s' + i, 22.5 + i / 1000, 88.35))
  it('one URL when ≤ 10 stops (9 waypoints + destination), walking, from my position', () => {
    const [u] = walkLegs(O, stops.slice(0, 10)); const q = new URL(u).searchParams
    expect(q.get('travelmode')).toBe('walking'); expect(q.get('origin')).toBe('22.500000,88.350000')
    expect(q.get('waypoints')!.split('|')).toHaveLength(9); expect(q.get('destination')).toBe('22.509000,88.350000')
  })
  it('splits beyond 9 waypoints; each leg starts where the last ended; every stop exactly once', () => {
    const legs = walkLegs(O, stops).map(u => new URL(u).searchParams)
    expect(legs).toHaveLength(3)
    for (let i = 1; i < legs.length; i++) expect(legs[i].get('origin')).toBe(legs[i - 1].get('destination'))
    const visited = legs.flatMap(q => [...(q.get('waypoints')?.split('|') ?? []), q.get('destination')!])
    expect(visited).toEqual(stops.map(s => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`))
    for (const q of legs) expect((q.get('waypoints')?.split('|') ?? []).length).toBeLessThanOrEqual(9)
  })
  it('one stop: no waypoints param', () => { expect(new URL(walkLegs(O, stops.slice(0, 1))[0]).searchParams.has('waypoints')).toBe(false) })
})
