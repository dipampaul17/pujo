// Adversarial invariants over every selection / count path. One source of truth for "open".
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import raw from '../data/dhaak.v1.json'
import { statusOf, isOpen, zoneOf, ZONES, ZONE_ANCHOR, helpOrigin, type Pandal, type StatusFile } from './plan'
import { recommend, routePool, zoneTab, istHour } from './rank'
import { roadEstimate, attachPins, type Roads } from './roads'
import { haversine } from './geo'

const ps = (raw as any).pandals.filter((p: any) => p.lat != null && p.precision !== 'none') as Pandal[]
const status: StatusFile = JSON.parse(fs.readFileSync('public/live/status.json', 'utf8'))
const roads = attachPins(JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8')) as Roads)
const NOW = Date.parse('2026-10-14T12:00:00+05:30'), DAY = '2026-10-14'
const st = (id: string) => statusOf(id, DAY, status, NOW)
// deterministic pseudo-random South/Central/North fixes
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const spots = Array.from({ length: 40 }, () => ({ lat: 22.45 + rnd() * 0.2, lng: 88.30 + rnd() * 0.12 }))
const ctx = (here: any, over: any = {}) => ({ here, now: NOW, status: st, travel: (p: any) => roadEstimate(roads, here, p), live: { crowd: {}, closed: new Set<string>(), freshPosts: {} }, seen: new Set<string>(), rain: false, ...over })

describe('one Open count', () => {
  it('the app counts exactly the non-closed entries of status.json (open_count.py)', () => {
    const want = Object.entries(status.open).filter(([, v]: any) => v.kind !== 'closed').map(([k]) => k).sort()
    expect(ps.filter(p => isOpen(st(p.id))).map(p => p.id).sort()).toEqual(want)
  })
  it('zone tabs partition the Open set (zone chips sum to the total)', () => {
    const total = ps.filter(p => isOpen(st(p.id))).length
    expect(ZONES.reduce((n, z) => n + ps.filter(p => zoneOf(p) === z && isOpen(st(p.id))).length, 0)).toBe(total)
  })
  it('zone tab Open group uses the same predicate (inaugurated is Open)', () => {
    const me = { lat: 22.518, lng: 88.368 }
    const l = zoneTab(ps, 'south', { me, anchor: ZONE_ANCHOR.south, travel: p => roadEstimate(roads, me, p), pass: () => false, open: id => isOpen(st(id)), closed: id => st(id)?.key === 'closed' })
    const firstNon = l.findIndex(p => !isOpen(st(p.id)) && p.precision !== 'station')
    expect(l.slice(firstNon).filter(p => isOpen(st(p.id)) && p.precision !== 'station')).toEqual([])
  })
})
describe('recommendations', () => {
  it('closed pandals are never recommended, from anywhere', () => {
    for (const s of spots) expect(recommend(ps, ctx(s)).filter(r => st(r.p.id)?.key === 'closed')).toEqual([])
  })
  it('inaugurated gets the same open boost as visitor-confirmed open', () => {
    const a = { id: 'a', name: 'A', lat: 22.5, lng: 88.35, worth: 2 } as any, b = { ...a, id: 'b', name: 'B' }
    const t = () => ({ carMin: 8, walkMin: 20, walkM: 1500, carM: 3000, crowKm: 1, basis: 'estimate' }) as any
    const r = recommend([a, b], ctx({ lat: 22.51, lng: 88.35 }, { travel: t, status: (id: string) => id === 'a' ? { key: 'inaugurated', label: 'Inaugurated' } : { key: 'open', label: 'Open' } }))
    expect(Math.abs(r[0].score - r[1].score)).toBeLessThan(0.5)
  })
})
describe('route pool', () => {
  it('never leaves the zone, never includes approximate pins, honours filters and skip', () => {
    for (const s of spots) for (const z of ZONES) {
      const f = { open: rnd() > 0.5, pass: false }, skip = new Set([ps[Math.floor(rnd() * ps.length)].id])
      const pool = routePool(ps, s, z, skip, f.open ? (id: string) => isOpen(st(id)) : undefined)
      for (const p of pool) { expect(zoneOf(p)).toBe(z); expect(p.precision).not.toBe('station'); expect(skip.has(p.id)).toBe(false); if (f.open) expect(isOpen(st(p.id))).toBe(true) }
    }
  })
})
describe('food & toilets follow the user', () => {
  it('help origin is my live fix when I have one, else the view', () => {
    const me = { lat: 22.49, lng: 88.38 }, view = { lat: 22.52, lng: 88.36 }
    expect(helpOrigin(me, view)).toEqual(me); expect(helpOrigin(null, view)).toEqual(view)
  })
})
describe('IST clock', () => {
  it('istHour matches Asia/Kolkata for any instant', () => {
    for (let i = 0; i < 500; i++) { const t = Date.UTC(2026, 9, 14) + Math.floor(rnd() * 86400e3 * 7)
      expect(istHour(t)).toBe(+new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(t)) }
  })
})
const KNOWN = new Set<string>()  // pairs allowed to share a pin: none (Tala Park merged into Tala Prattoy)
describe('aliases', () => {
  it('no two pandals share a normalised name, or a pin within 25 m', () => {
    const norm = (s: string) => s.toLowerCase().replace(/sarbojanin/g, 'sarbajanin').replace(/[^a-z0-9]/g, '')
    const all = (raw as any).pandals as Pandal[], seen = new Map<string, string>()
    for (const p of all) { const k = norm(p.name); expect(seen.get(k), `${p.id} vs ${seen.get(k)}`).toBeUndefined(); seen.set(k, p.id) }
    const pinned = ps.filter(p => p.precision !== 'station')
    for (let i = 0; i < pinned.length; i++) for (let j = i + 1; j < pinned.length; j++) expect(haversine(pinned[i], pinned[j]) < 25 && !KNOWN.has(`${pinned[i].id}~${pinned[j].id}`) ? `${pinned[i].id}~${pinned[j].id}` : '').toBe('')
  })
})
import { pagePicks } from './page'
import { applyFilters } from './filters'
import { planWalk } from './walk'
import { inSaltLake } from './plan'
import { hasPass } from './passport'
describe('zone pages (redesign)', () => {
  for (const z of ZONES) it(`${z}: go-next + rail are exactly the zone's pandals, each once, under every filter combo`, () => {
    const me = { lat: 22.518, lng: 88.368 }
    const list = zoneTab(ps, z, { me, anchor: ZONE_ANCHOR[z], travel: p => roadEstimate(roads, me, p), pass: hasPass, open: id => isOpen(st(id)), closed: id => st(id)?.key === 'closed' })
    for (const f of [{ open: false, pass: false }, { open: true, pass: false }, { open: false, pass: true }, { open: true, pass: true }]) {
      const keep = { open: (id: string) => isOpen(st(id)), pass: hasPass }, listed = applyFilters(list, f, keep)
      const route = recommend(routePool(ps, ZONE_ANCHOR[z], z, new Set(), id => (!f.open || keep.open(id)) && (!f.pass || keep.pass(id))) as any, ctx(ZONE_ANCHOR[z])).map(r => r.p)
      const { next, rail } = pagePicks(route, listed), ids = [...(next ? [next.id] : []), ...rail.map(p => p.id)]
      expect(new Set(ids).size).toBe(ids.length); expect(ids.sort()).toEqual(listed.map(p => p.id).sort())
      for (const p of [...(next ? [next] : []), ...rail]) { expect(zoneOf(p)).toBe(z); if (f.open) expect(isOpen(st(p.id))).toBe(true); if (f.pass) expect(hasPass(p.id)).toBe(true) }
      for (const p of route) { expect(zoneOf(p)).toBe(z); expect(st(p.id)?.key).not.toBe('closed') }
    }
  })
})
describe('walk is optimal for ≤ 8 picks (brute force)', () => {
  const perms = <T,>(a: T[]): T[][] => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]))
  it('exactly the best order on real pins, and never routes closed or approximate', () => {
    const pinned = ps.filter(p => p.precision !== 'station' && zoneOf(p) === 'south'), cost = (a: any, b: any) => roadEstimate(roads, a, b).walkM
    for (let k = 0; k < 12; k++) {
      const n = 3 + Math.floor(rnd() * 6), pick = Array.from({ length: n }, () => pinned[Math.floor(rnd() * pinned.length)]).filter((p, i, a) => a.indexOf(p) === i)
      const o = { lat: 22.518, lng: 88.368 }, len = (s: any[]) => s.reduce((t, x, i) => t + cost(i ? s[i - 1] : o, x), 0)
      const w = planWalk(o, pick, { cost, closed: id => st(id)?.key === 'closed' }), open = pick.filter(p => st(p.id)?.key !== 'closed')
      expect(len(w.stops)).toBeLessThanOrEqual(Math.min(...perms(open).map(len)) + 1e-6)
      for (const p of w.stops) { expect(st(p.id)?.key).not.toBe('closed'); expect(p.precision).not.toBe('station') }
    }
  }, 60000)  // 8! permutations × road cost: slow on a loaded box
})
describe('Salt Lake boundary', () => {
  it('inside the box is Salt Lake, outside never is', () => {
    for (let i = 0; i < 2000; i++) { const p = { lat: 22.45 + rnd() * 0.25, lng: 88.28 + rnd() * 0.2 }
      const inside = p.lng >= 88.40 && p.lat >= 22.555 && p.lat < 22.605
      expect(zoneOf(p) === 'saltlake').toBe(inside); expect(inSaltLake(p)).toBe(inside) }
  })
  it('Sectors I-III, V and Lake Town are Salt Lake; Ultadanga, Dum Dum Park, Beleghata and Baguiati are not', () => {
    for (const p of [{ lat: 22.583, lng: 88.413 }, { lat: 22.59, lng: 88.426 }, { lat: 22.575, lng: 88.432 }, { lat: 22.6, lng: 88.402 }]) expect(zoneOf(p)).toBe('saltlake')
    for (const p of [{ lat: 22.591, lng: 88.391 }, { lat: 22.606, lng: 88.395 }, { lat: 22.569, lng: 88.391 }, { lat: 22.615, lng: 88.43 }]) expect(zoneOf(p)).not.toBe('saltlake')
  })
})
