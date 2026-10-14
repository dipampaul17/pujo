import { describe, it, expect } from 'vitest'
import raw from '../data/dhaak.v1.json'
import { zoneTab } from './rank'
import { zoneOf, ZONES, ZONE_ANCHOR, type Pandal } from './plan'
import { haversine } from './geo'

const ps = (raw as any).pandals.filter((p: any) => p.lat != null && p.precision !== 'none') as Pandal[]
// Geographic belts (latitude through Kolkata): north of Shyambazar/Girish Park belt >= 22.575, south of Park Circus/Hazra belt < 22.53.
const belt = (lat: number) => (lat >= 22.575 ? 'north' : lat >= 22.53 ? 'central' : 'south')
const car = (from: { lat: number; lng: number }) => (p: Pandal) => ({ carMin: Math.round(haversine(from, p) / 400), walkMin: 0, walkM: haversine(from, p) } as any)

describe('zones come from coordinates', () => {
  it('every pandal sits in the belt its coordinates fall in', () => { for (const p of ps) expect([p.id, zoneOf(p)]).toEqual([p.id, belt(p.lat)]) })
  it('Santosh Mitra Square, College Square, Allen Park are Central', () => {
    for (const id of ['santosh-mitra-square', 'college-square', 'allen-park-sarbojanin']) expect(zoneOf(ps.find(p => p.id === id)!)).toBe('central')
  })
})
describe('zone tab', () => {
  const me = { lat: 22.5164, lng: 88.3372 } // Chetla, South
  for (const z of ZONES) it(`${z} lists exactly the ${z} pandals, nothing from other zones`, () => {
    const list = zoneTab(ps, z, { me, anchor: ZONE_ANCHOR[z], travel: car(me), pass: () => false, open: () => false, closed: () => false })
    expect(list.map(p => p.id).sort()).toEqual(ps.filter(p => zoneOf(p) === z).map(p => p.id).sort())
  })
  it('with a fix: ordered by drive time from me, pass then open break ties', () => {
    const t = car(me), list = zoneTab(ps, 'south', { me, anchor: ZONE_ANCHOR.south, travel: t, pass: id => id === 'b', open: id => id === 'c', closed: () => false })
    for (let i = 1; i < list.length; i++) expect(t(list[i]).carMin).toBeGreaterThanOrEqual(t(list[i - 1]).carMin)
    const fake = [{ id: 'a', name: 'A', lat: 22.5, lng: 88.35 }, { id: 'b', name: 'B', lat: 22.5, lng: 88.35 }, { id: 'c', name: 'C', lat: 22.5, lng: 88.35 }] as any
    expect(zoneTab(fake, 'south', { me, anchor: ZONE_ANCHOR.south, travel: car(me), pass: id => id === 'c', open: id => id === 'b', closed: () => false }).map(p => p.id)).toEqual(['c', 'b', 'a'])
  })
  it('without a fix: nearest to the zone anchor first; closed sink to the end', () => {
    const a = ZONE_ANCHOR.south, list = zoneTab(ps, 'south', { me: null, anchor: a, travel: car(a), pass: () => false, open: () => false, closed: () => false })
    for (let i = 1; i < list.length; i++) expect(haversine(a, list[i])).toBeGreaterThanOrEqual(haversine(a, list[i - 1]))
    const fake = [{ id: 'a', name: 'A', lat: 22.5, lng: 88.35 }, { id: 'b', name: 'B', lat: 22.51, lng: 88.35 }] as any
    expect(zoneTab(fake, 'south', { me: null, anchor: { lat: 22.5, lng: 88.35 }, travel: car(a), pass: () => false, open: () => false, closed: id => id === 'a' }).map(p => p.id)).toEqual(['b', 'a'])
  })
})
