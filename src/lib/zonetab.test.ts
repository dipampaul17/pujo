import { describe, it, expect } from 'vitest'
import raw from '../data/dhaak.v1.json'
import { zoneTab } from './rank'
import { zoneOf, ZONES, ZONE_ANCHOR, type Pandal } from './plan'
import { haversine } from './geo'

const ps = (raw as any).pandals.filter((p: any) => p.lat != null && p.precision !== 'none') as Pandal[]
// Geographic belts (latitude through Kolkata): North from Girish Park/Chorebagan (>= 22.58); South below Park Street/AJC Bose Road (< 22.54).
const belt = (lat: number) => (lat >= 22.58 ? 'north' : lat >= 22.54 ? 'central' : 'south')
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
  it('with a fix: open first, then pass, then shortest drive; approximate pins (no real time) after pinned ones', () => {
    const fake = [{ id: 'near', name: 'N', lat: 22.516, lng: 88.338 }, { id: 'pass', name: 'P', lat: 22.505, lng: 88.35 }, { id: 'open', name: 'O', lat: 22.49, lng: 88.36 },
      { id: 'approx', name: 'A', lat: 22.5165, lng: 88.3373, precision: 'station' }, { id: 'far', name: 'F', lat: 22.48, lng: 88.37 }] as any
    expect(zoneTab(fake, 'south', { me, anchor: ZONE_ANCHOR.south, travel: car(me), pass: id => id === 'pass', open: id => id === 'open', closed: () => false }).map(p => p.id))
      .toEqual(['open', 'pass', 'near', 'far', 'approx'])
    const both = [{ id: 'farOpenPass', name: 'A', lat: 22.48, lng: 88.37 }, { id: 'nearOpen', name: 'B', lat: 22.516, lng: 88.338 }] as any
    expect(zoneTab(both, 'south', { me, anchor: ZONE_ANCHOR.south, travel: car(me), pass: id => id === 'farOpenPass', open: () => true, closed: () => false }).map(p => p.id)).toEqual(['nearOpen', 'farOpenPass'])
  })
  it('without a fix: nearest to the zone anchor first; closed sink to the end', () => {
    const a = ZONE_ANCHOR.south, list = zoneTab(ps, 'south', { me: null, anchor: a, travel: car(a), pass: () => false, open: () => false, closed: () => false })
    for (let i = 1; i < list.length; i++) expect(haversine(a, list[i])).toBeGreaterThanOrEqual(haversine(a, list[i - 1]))
    const fake = [{ id: 'a', name: 'A', lat: 22.5, lng: 88.35 }, { id: 'b', name: 'B', lat: 22.51, lng: 88.35 }] as any
    expect(zoneTab(fake, 'south', { me: null, anchor: { lat: 22.5, lng: 88.35 }, travel: car(a), pass: () => false, open: () => false, closed: id => id === 'a' }).map(p => p.id)).toEqual(['b', 'a'])
  })
})

import { routePool } from './rank'
describe('route under a zone tab', () => {
  it('never takes a pandal from another zone (Santosh Mitra Square stays out of South)', () => {
    const at = { lat: 22.529, lng: 88.36 } // Ballygunge, 4 km from Santosh Mitra Square
    const pool = routePool(ps, at, 'south', new Set())
    expect(pool.length).toBeGreaterThan(5)
    expect(pool.every(p => zoneOf(p) === 'south')).toBe(true)
    expect(pool.some(p => p.id === 'santosh-mitra-square')).toBe(false)
  })
})

describe('zones match known neighbourhoods', () => {
  // How Kolkata pujo guides group these neighbourhoods: Bhowanipore/Ballygunge/Khidirpur are South; Park Street, Sealdah, College Street, Bowbazar are Central.
  const KNOWN: Record<string, 'north' | 'central' | 'south'> = {
    'santosh-mitra-square': 'central', 'college-square': 'central', 'muhammad-ali-park': 'central', 'allen-park-sarbojanin': 'central', 'sealdah-athletic-club': 'central',
    'harish-park': 'south', 'bhowanipur-75-pally': 'south', 'chakraberia-sarbojanin': 'south', '76-pally': 'south', 'adi-ballygunge-sarbojanin': 'south', '25-pally-khidirpur': 'south',
    'chorebagan-sarbojanin': 'north', 'simla-byayam-samity': 'north', 'kumartuli-park': 'north',
  }
  for (const [id, z] of Object.entries(KNOWN)) it(`${id} is ${z}`, () => { const p = ps.find(q => q.id === id); if (p) expect(zoneOf(p)).toBe(z) })
})
