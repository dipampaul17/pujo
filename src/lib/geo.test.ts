import { describe, it, expect } from 'vitest'
import { haversine, GridIndex, orderRoute, pathLength, mapsDirUrl, MAX_WAYPOINTS, rankScore, walkMinutes, fmtDist } from './geo'

const shyambazar = { lat: 22.601335, lng: 88.372497 }
const kalighat = { lat: 22.516875, lng: 88.345845 }

describe('haversine', () => {
  it('Shyambazar to Kalighat is ~9.8 km', () => { const d = haversine(shyambazar, kalighat); expect(d).toBeGreaterThan(9500); expect(d).toBeLessThan(10000) })
  it('zero for same point', () => expect(haversine(kalighat, kalighat)).toBe(0))
})

describe('GridIndex', () => {
  const pts = Array.from({ length: 400 }, (_, i) => ({ id: 'p' + i, name: 'p' + i, lat: 22.45 + (i % 20) * 0.01, lng: 88.30 + Math.floor(i / 20) * 0.01 }))
  const idx = new GridIndex(pts)
  it('matches brute force within radius', () => {
    const p = { lat: 22.53, lng: 88.37 }
    const brute = pts.filter(x => haversine(p, x) <= 2500).map(x => x.id).sort()
    expect(idx.near(p, 2500).map(x => x.id).sort()).toEqual(brute)
  })
  it('is sorted ascending and deterministic', () => {
    const a = idx.near({ lat: 22.5, lng: 88.35 }, 3000)
    for (let i = 1; i < a.length; i++) expect(a[i].dist).toBeGreaterThanOrEqual(a[i - 1].dist)
    expect(idx.near({ lat: 22.5, lng: 88.35 }, 3000).map(x => x.id)).toEqual(a.map(x => x.id))
  })
  it('nearest returns k', () => expect(idx.nearest({ lat: 22.5, lng: 88.35 }, 3)).toHaveLength(3))
})

describe('ranking', () => {
  it('prominence can beat a slightly shorter walk, not a much shorter one', () => {
    expect(rankScore(900, 2)).toBeLessThan(rankScore(500, 0))
    expect(rankScore(3000, 2)).toBeGreaterThan(rankScore(500, 0))
  })
  it('walk minutes and formatting', () => { expect(walkMinutes(1000)).toBe(22); expect(fmtDist(420)).toBe('420 m'); expect(fmtDist(1500)).toBe('1.5 km') })
})

describe('orderRoute', () => {
  it('orders a line of points from the origin outward', () => {
    const o = { lat: 22.5, lng: 88.3 }
    const s = [3, 1, 4, 2].map(i => ({ id: String(i), lat: 22.5, lng: 88.3 + i * 0.01 }))
    expect(orderRoute(o, s).map(x => x.id)).toEqual(['1', '2', '3', '4'])
  })
  it('never longer than input order or plain NN on random sets', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let t = 0; t < 50; t++) {
      const o = { lat: 22.5, lng: 88.35 }
      const s = Array.from({ length: 9 }, (_, i) => ({ id: String(i), lat: 22.48 + rnd() * 0.05, lng: 88.33 + rnd() * 0.05 }))
      const r = orderRoute(o, s)
      expect(r).toHaveLength(9); expect(new Set(r.map(x => x.id)).size).toBe(9)
      expect(pathLength(o, r)).toBeLessThanOrEqual(pathLength(o, s) + 1e-6)
    }
  })
  it('handles 0 and 1 stops', () => { expect(orderRoute(kalighat, [])).toEqual([]); expect(orderRoute(kalighat, [shyambazar])).toEqual([shyambazar]) })
})

describe('mapsDirUrl', () => {
  it('builds walking dir url with waypoints and destination last', () => {
    const u = new URL(mapsDirUrl(shyambazar, [kalighat, shyambazar]))
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/')
    expect(u.searchParams.get('api')).toBe('1')
    expect(u.searchParams.get('travelmode')).toBe('walking')
    expect(u.searchParams.get('waypoints')).toBe('22.516875,88.345845')
    expect(u.searchParams.get('destination')).toBe('22.601335,88.372497')
  })
  it('caps at 9 waypoints + destination', () => {
    const s = Array.from({ length: 15 }, (_, i) => ({ lat: 22.5 + i / 1000, lng: 88.3 }))
    const u = new URL(mapsDirUrl(null, s))
    expect(u.searchParams.get('waypoints')!.split('|')).toHaveLength(MAX_WAYPOINTS)
    expect(u.searchParams.get('origin')).toBeNull()
  })
  it('uses text query for approximate stops', () => {
    const u = new URL(mapsDirUrl(null, [{ lat: 1, lng: 2, query: 'Maddox Square Durga Puja, Kolkata' }]))
    expect(u.searchParams.get('destination')).toBe('Maddox Square Durga Puja, Kolkata')
  })
  it('throws on empty', () => expect(() => mapsDirUrl(null, [])).toThrow())
})
import { uberUrl } from './geo'
describe('uberUrl', () => {
  it('my_location pickup + full dropoff', () => {
    const u = new URL(uberUrl({ lat: 22.5168752, lng: 88.3458448, name: 'Suruchi Sangha', address: 'Suruchi Sangha, near Kalighat metro, Kolkata' }))
    expect(u.origin + u.pathname).toBe('https://m.uber.com/ul/')
    expect(u.searchParams.get('action')).toBe('setPickup'); expect(u.searchParams.get('pickup')).toBe('my_location')
    expect(u.searchParams.get('dropoff[latitude]')).toBe('22.516875'); expect(u.searchParams.get('dropoff[longitude]')).toBe('88.345845')
    expect(u.searchParams.get('dropoff[nickname]')).toBe('Suruchi Sangha')
    expect(u.searchParams.get('dropoff[formatted_address]')).toBe('Suruchi Sangha, near Kalighat metro, Kolkata')
  })
  it('uses a known fix as pickup', () => {
    const u = new URL(uberUrl({ lat: 1, lng: 2, name: 'X' }, { lat: 22.6, lng: 88.37 }))
    expect(u.searchParams.get('pickup')).toBeNull(); expect(u.searchParams.get('pickup[latitude]')).toBe('22.600000')
    expect(u.searchParams.get('dropoff[formatted_address]')).toBe('X, Kolkata')
  })
})

import { uberUrl as U2 } from './geo'
import data from '../data/dhaak.v1.json'
describe('Uber dropoff', () => {
  it('exact pin: lat/lng + pandal name for every pinned pandal; approximate: name search, no station coords', () => {
    for (const p of (data as any).pandals.filter((p: any) => p.lat != null && p.precision !== 'none')) {
      const q = new URL(U2({ lat: p.lat, lng: p.lng, name: p.name, approx: p.precision === 'station', address: `${p.name}, Kolkata` })).searchParams
      expect(q.get('dropoff[nickname]')).toBe(p.name)
      if (p.precision === 'station') expect(q.get('dropoff[latitude]')).toBeNull()
      else expect([q.get('dropoff[latitude]'), q.get('dropoff[longitude]')]).toEqual([p.lat.toFixed(6), p.lng.toFixed(6)])
    }
  })
})
