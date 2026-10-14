import { describe, it, expect } from 'vitest'
import { goHint, trafficCar, roadNote, REC, recommend } from './rank'
import { planWalk } from './walk'
import { nudges, dayTip } from './plan'
const NOW = Date.parse('2026-10-14T13:00:00Z')
const ago = (m: number) => new Date(NOW - m * 60e3).toISOString()
describe('crowd + traffic: real signals only, labelled by age', () => {
  it('Later only on a fresh, weighty surge; Go now only on fresh "little crowd" evidence; nothing otherwise', () => {
    expect(goHint({ kind: 'crowd', at: ago(10), url: 'u', w: 1.6 }, NOW)?.word).toBe('Later')
    expect(goHint({ kind: 'queue', at: ago(10), url: 'u', w: 1.2 }, NOW)?.word).toBe('Later')
    expect(goHint({ kind: 'crowd', at: ago(100), url: 'u', w: 0.2 }, NOW)).toBeNull()
    expect(goHint({ kind: 'clear', at: ago(15), url: 'u', w: 1.5 }, NOW)?.word).toBe('Go now')
    expect(goHint({ kind: 'clear', at: ago(70), url: 'u', w: 0.3 }, NOW)).toBeNull()
    expect(goHint(undefined, NOW)).toBeNull()
  })
  it('traffic-aware car minutes only when the TomTom reading is fresh', () => {
    expect(trafficCar(10, { ratio: 0.5, at: ago(20) }, NOW)).toEqual({ min: 20, live: true })
    expect(trafficCar(10, { ratio: 0.1, at: ago(20) }, NOW)).toEqual({ min: 30, live: true })   // capped at 3x
    expect(trafficCar(10, { ratio: 0.5, at: ago(90) }, NOW)).toEqual({ min: 10, live: false })  // stale -> OSRM
    expect(trafficCar(10, undefined, NOW)).toEqual({ min: 10, live: false })
  })
  it('road note: police X post or TomTom closure near the pandal, newest first, only while fresh', () => {
    const roads = [{ road: 'Hazra Road', label: 'Traffic', kind: 'traffic', at: ago(30), url: 'x', near: ['a'] }, { road: 'Old', label: 'Traffic', kind: 'traffic', at: ago(200), url: 'y', near: ['a'] }]
    expect(roadNote('a', roads, undefined, NOW)?.text).toMatch(/Hazra Road/)
    expect(roadNote('b', roads, undefined, NOW)).toBeNull()
    const tt = { incidents: [{ closed: true, from: 'Hazra Rd', to: 'SP Mukherjee Rd', at: ago(3), near: ['b'], what: 'Closed' }] }
    expect(roadNote('b', [], tt, NOW)?.text).toMatch(/Closed: Hazra Rd/)
  })
  it('surge penalty decays with weight; clear evidence lifts', () => {
    const P = [{ id: 'a', name: 'A', lat: 22.5, lng: 88.35, worth: 3 }, { id: 'b', name: 'B', lat: 22.5005, lng: 88.3505, worth: 3 }] as any
    const base = { here: { lat: 22.5, lng: 88.35 }, now: NOW, status: () => ({ key: 'open' }) as any, travel: () => ({ carMin: 5, walkMin: 5, carM: 1000, walkM: 400, crowKm: 0.4, basis: 'road' }) as any, seen: new Set<string>(), rain: false }
    const r = (crowd: any) => recommend(P, { ...base, live: { crowd, closed: new Set(), freshPosts: {} } } as any)[0].p.id
    expect(r({ a: { kind: 'crowd', at: ago(5), w: 2 } })).toBe('b')
    expect(r({ b: { kind: 'clear', at: ago(5), w: 1 } })).toBe('b')
    expect(REC.surge).toBeGreaterThan(0)
  })
  it('walk visits surged stops last', () => {
    const o = { lat: 22.5, lng: 88.35 }
    const s = [{ id: 'near', lat: 22.501, lng: 88.35 }, { id: 'mid', lat: 22.503, lng: 88.35 }, { id: 'far', lat: 22.506, lng: 88.35 }]
    const cost = (a: any, b: any) => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 1e4
    const w = planWalk(o, s, { cost, closed: () => false, later: id => id === 'near' })
    expect(w.stops.map(x => x.id)).toEqual(['mid', 'far', 'near'])
  })
  it('no unsupported time-of-day crowd claims', () => {
    for (const h of [7, 12, 16, 19, 21]) expect(nudges(h, { walkMin: 20 }).join(' ')).not.toMatch(/crowd|queue|quiet hours|good time/i)
    for (const d of ['Saptami', 'Ashtami', 'Navami']) expect(String(dayTip(d, 20))).not.toMatch(/crowd/i)
    expect(dayTip('Ashtami', 9)).toMatch(/anjali/)
  })
})
