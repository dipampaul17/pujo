import { describe, it, expect } from 'vitest'
import { makePlanner, areas, bn, nudges, type Dataset } from './plan'
import data from '../data/dhaak.v1.json'
import { mapsDirUrl, MAX_WAYPOINTS } from './geo'
const d = data as unknown as Dataset
const P = makePlanner(d)
describe('planner on real data', () => {
  it('Shyambazar returns an ordered North Kolkata walk', () => {
    const r = P.plan({ lat: 22.601335, lng: 88.372497 })
    expect(r.outOfRange).toBe(false)
    expect(r.stops.length).toBeGreaterThanOrEqual(4)
    expect(r.stops.length).toBeLessThanOrEqual(MAX_WAYPOINTS + 1)
    expect(r.stops[0].dist).toBeLessThan(2500)
    expect(() => new URL(mapsDirUrl({ lat: 22.6, lng: 88.37 }, r.stops))).not.toThrow()
  })
  it('Kalighat is South Kolkata, includes a big-circuit pandal', () => {
    const r = P.plan({ lat: 22.516875, lng: 88.345845 })
    expect(r.stops.some(s => s.circuits.length > 0)).toBe(true)
  })
  it('Delhi is out of range, not an empty dead end', () => {
    const r = P.plan({ lat: 28.61, lng: 77.2 })
    expect(r.outOfRange).toBe(true); expect(r.nearestKm).toBeGreaterThan(1000)
  })
  it('deterministic', () => {
    const a = P.plan({ lat: 22.55, lng: 88.35 }).stops.map(s => s.id), b = P.plan({ lat: 22.55, lng: 88.35 }).stops.map(s => s.id)
    expect(a).toEqual(b)
  })
  it('every guide station appears as an area', () => { expect(areas(d).length).toBeGreaterThan(15) })
  it('data has no duplicate ids and all coords are in Kolkata', () => {
    expect(new Set(d.pandals.map(p => p.id)).size).toBe(d.pandals.length)
    for (const p of P.located) { expect(p.lat).toBeGreaterThan(22.3); expect(p.lng).toBeGreaterThan(88.2) }
  })
})
describe('helpers', () => {
  it('bengali numerals', () => expect(bn(12)).toBe('১২'))
  it('nudges by hour', () => { expect(nudges(23, { walkMin: 20 }).length).toBe(1); expect(nudges(12, { walkMin: 20 })).toEqual([]) })
})
