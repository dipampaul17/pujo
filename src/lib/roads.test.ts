import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { roadEstimate, attachPins, type Roads, TRAVEL } from './roads'
import raw from '../data/dhaak.v1.json'
const pins = Object.fromEntries((raw as any).pandals.filter((p: any) => p.lat).map((p: any) => [p.id, { lat: p.lat, lng: p.lng }]))
const roads: Roads | null = fs.existsSync('public/data/roads.json') ? attachPins(JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8')), pins) : null
const gm: { name: string; a: [number, number]; b: [number, number]; car: { min: number; km: number }; foot: { min: number; km: number } }[] =
  JSON.parse(fs.readFileSync('src/lib/fixtures/gmaps-pairs.json', 'utf8'))
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const err = (est: number, real: number) => Math.abs(est - real) / real

describe('road travel estimate vs Google Maps fixtures (recorded 13 Oct 2026, ~16:40 IST)', () => {
  const rows = gm.map(g => ({ g, e: roadEstimate(roads, { lat: g.a[0], lng: g.a[1] }, { lat: g.b[0], lng: g.b[1] }) }))
  it('has a fixture of at least 10 real South pairs', () => expect(gm.length).toBeGreaterThanOrEqual(10))
  it('road car distance median error < 20%', () => expect(median(rows.map(({ g, e }) => err(e.carM / 1000, g.car.km)))).toBeLessThan(0.2))
  it('car minutes median error < 20%', () => expect(median(rows.map(({ g, e }) => err(e.carMin, g.car.min)))).toBeLessThan(0.2))
  it('walk minutes median error < 20%', () => expect(median(rows.map(({ g, e }) => err(e.walkMin, g.foot.min)))).toBeLessThan(0.2))
  it('beats straight-line on walking distance', () => {
    const hav = median(rows.map(({ g, e }) => err(e.crowKm, g.foot.km))), road = median(rows.map(({ g, e }) => err(e.walkM / 1000, g.foot.km)))
    expect(road).toBeLessThan(hav)
  })
  it('report', () => { console.table(rows.map(({ g, e }) => ({ pair: g.name, gCar: g.car.min, car: e.carMin, gWalk: g.foot.min, walk: e.walkMin, gKm: g.car.km, km: +(e.carM / 1000).toFixed(1), basis: e.basis }))) })
})
describe('fallback', () => {
  it('without the matrix still gives finite, conservative numbers', () => {
    const e = roadEstimate(null, { lat: 22.5164, lng: 88.3372 }, { lat: 22.5091, lng: 88.3342 })
    expect(e.basis).toBe('estimate'); expect(e.carMin).toBeGreaterThanOrEqual(TRAVEL.carOverheadMin); expect(e.walkM).toBeGreaterThan(e.crowKm * 1000)
  })
  it('same point: zero walk, minimal car', () => { const e = roadEstimate(roads, { lat: 22.5, lng: 88.35 }, { lat: 22.5, lng: 88.35 }); expect(e.walkMin).toBeLessThanOrEqual(1) })
  it('outside the grid falls back to estimate', () => expect(roadEstimate(roads, { lat: 23.2, lng: 88.9 }, { lat: 22.5, lng: 88.35 }).basis).toBe('estimate'))
})
import { liveTravel } from './roads'
describe('liveTravel', () => {
  const pins = [{ id: 'a', lat: 22.5091, lng: 88.3342 }]
  it('maps OSRM tables to travel', async () => {
    const f = (async () => ({ json: async () => ({ code: 'Ok', durations: [[0, 300]], distances: [[0, 1500]] }) })) as any
    const r = await liveTravel({ lat: 22.5164, lng: 88.3372 }, pins, 1000, f)
    expect(r!.a.carMin).toBe(Math.round(1 + 300 * 2.2 / 60)); expect(r!.a.basis).toBe('live')
  })
  it('times out to null (caller keeps the matrix)', async () => {
    const f = ((_: string, o: any) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('abort'))))) as any
    expect(await liveTravel({ lat: 22.6, lng: 88.4 }, pins, 50, f)).toBeNull()
  })
})
describe('stale matrix guard', () => {
  it('a pin that moved since the matrix was built falls back instead of using the old column', () => {
    const [lat, lng] = roads!.pts[0]
    expect(roadEstimate(roads, { lat: 22.5164, lng: 88.3372 }, { lat: lat + 0.01, lng }).basis).toBe('estimate')
    expect(roadEstimate(roads, { lat: 22.5164, lng: 88.3372 }, { lat, lng }).basis).not.toBe('estimate')
  })
})
