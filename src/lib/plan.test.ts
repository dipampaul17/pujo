import { describe, it, expect } from 'vitest'
import { makePlanner, areas, nudges, type Dataset } from './plan'
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
describe('collapse guard', () => {
  it('no two stops in any plan share identical coordinates', () => {
    for (const a of areas(d)) {
      const s = P.plan({ lat: a.lat, lng: a.lng }).stops
      expect(new Set(s.map(x => `${x.lat},${x.lng}`)).size).toBe(s.length)
    }
  })
})
describe('helpers', () => {
  it('nudges by hour', () => { expect(nudges(23, { walkMin: 20 }).length).toBe(1); expect(nudges(12, { walkMin: 20 })).toHaveLength(1); expect(nudges(3, { walkMin: 20 })).toEqual([]) })
})
import { zoneOf, ZONE_ANCHOR, zoneCounts, nextZone, ZONES } from './plan'
describe('zones', () => {
  it('anchors sit in their own zone', () => { for (const z of ZONES) expect(zoneOf(ZONE_ANCHOR[z])).toBe(z) })
  it('every located pandal has exactly one zone and counts add up', () => {
    const c = zoneCounts(d); expect(c.north + c.central + c.south).toBe(d.pandals.filter(p => p.lat != null).length)
    expect(Math.min(c.north, c.central, c.south)).toBeGreaterThan(5)
  })
  it('each zone anchor yields a walk inside or near that zone', () => {
    for (const z of ZONES) { const r = P.plan(ZONE_ANCHOR[z]); expect(r.stops.length).toBeGreaterThanOrEqual(4); expect(r.stops.filter(s => zoneOf(s) === z).length).toBeGreaterThan(r.stops.length / 2) }
  })
  it('swipe clamps at the ends', () => { expect(nextZone('north', -1)).toBe('north'); expect(nextZone('north', 1)).toBe('central'); expect(nextZone('south', 1)).toBe('south') })
})
import { tagsFor, tagContext } from './plan'
import { mapsDirUrl as dirUrl, uberUrl } from './geo'
describe('tags and links for every pandal', () => {
  it('max 2 tags, only from the allowed set', () => {
    const ok = new Set(['Iconic', 'Heritage', 'Big theme', 'Block pujo', 'Toilet nearby', 'Food nearby'])
    for (const p of P.located) { const t = tagsFor(p, tagContext(P, p)); expect(t.length).toBeLessThanOrEqual(2); t.forEach(x => expect(ok.has(x)).toBe(true)) }
  })
  it('every located pandal yields a valid Maps and Uber URL', () => {
    for (const p of P.located) {
      const q = p.precision === 'station' ? { ...p, query: `${p.name} Durga Puja, Kolkata` } : p
      const m = new URL(dirUrl(null, [q])); expect(m.hostname).toBe('www.google.com'); expect(m.searchParams.get('destination')).toBeTruthy()
      if (p.precision === 'osm') expect(m.searchParams.get('destination')).toMatch(/^22\.\d{6},88\.\d{6}$/)
      else expect(m.searchParams.get('destination')).toContain(p.name)
      const u = new URL(uberUrl({ lat: p.lat, lng: p.lng, name: p.name, address: `${p.name}, near ${p.station} metro, Kolkata` }))
      expect(u.hostname).toBe('m.uber.com'); expect(Number(u.searchParams.get('dropoff[latitude]'))).toBeGreaterThan(22.3)
      expect(u.searchParams.get('dropoff[nickname]')).toBe(p.name)
    }
  })
})
import { pujoDay, dayTip, relevantNow } from './plan'
describe('context', () => {
  it('pujo days', () => { expect(pujoDay('2026-10-19')).toBe('Ashtami'); expect(pujoDay('2026-10-13')).toBeNull() })
  it('ashtami morning tip', () => { expect(dayTip('Ashtami', 9)).toMatch(/anjali/); expect(dayTip(null, 9)).toBeNull() })
  it('now items filtered by age and zone', () => {
    const now = Date.parse('2026-10-19T14:00:00Z')
    const it = (h: number, zones: string[], pandals: string[] = []) => ({ title: 't', source: 's', link: 'l' + h + zones, published: new Date(now - h * 3600e3).toISOString(), zones, pandals })
    const r = relevantNow([it(1, ['south']), it(1, ['north']), it(7, ['all']), it(2, ['all']), it(1, [], ['x'])], 'south', ['x'], now)
    expect(r).toHaveLength(3)
  })
})
import { statusOf } from './plan'
describe('open status', () => {
  const f = { updated: '', puja: { start: '2026-10-16', end: '2026-10-21' }, open: { a: { since: '2026-10-11', evidence: 'https://x.com/x', note: '' } } }
  it('evidence -> Open, calendar -> Likely, before -> nothing, after -> Closed', () => {
    expect(statusOf('a', '2026-10-13', f)?.label).toBe('Open')
    expect(statusOf('b', '2026-10-13', f)).toBeNull()
    expect(statusOf('b', '2026-10-18', f)?.label).toBe('Likely open')
    expect(statusOf('a', '2026-10-10', f)).toBeNull()
    expect(statusOf('a', '2026-10-22', f)?.label).toBe('Closed')
    expect(statusOf('a', '2026-10-13', null)).toBeNull()
  })
})
