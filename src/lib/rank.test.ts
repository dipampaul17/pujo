import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import raw from '../data/dhaak.v1.json'
import { recommend, listAll, routeStops, REC, type RecContext } from './rank'
import { roadEstimate, attachPins, type Roads } from './roads'
import { statusOf, type Pandal, type StatusFile } from './plan'
import { haversine } from './geo'

const ps = (raw as any).pandals.filter((p: any) => p.lat != null && p.precision !== 'none') as Pandal[]
const roads = attachPins(JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8')) as Roads, Object.fromEntries(ps.map(p => [p.id, p])))
const status: StatusFile = JSON.parse(fs.readFileSync('src/lib/fixtures/status-2026-10-13.json', 'utf8'))
const NOW = Date.parse('2026-10-13T19:00:00+05:30')
const ctx = (at: [number, number], over: Partial<RecContext> = {}): RecContext => ({
  here: { lat: at[0], lng: at[1] }, now: NOW, status: id => statusOf(id, '2026-10-13', status, NOW),
  travel: p => roadEstimate(roads, { lat: at[0], lng: at[1] }, p), live: { crowd: {}, closed: new Set(), freshPosts: {} }, seen: new Set(), rain: false, ...over })
const fx: { name: string; at: [number, number]; expect: string[]; why: string }[] = JSON.parse(fs.readFileSync('src/lib/fixtures/recs-south.json', 'utf8'))

describe('recommender eval: 5 South locations (top-5 must contain ≥4 of the local pick)', () => {
  for (const f of fx) it(f.name, () => {
    const top = recommend(ps, ctx(f.at)).slice(0, 5).map(r => r.p.id)
    const hit = f.expect.filter(id => top.includes(id))
    expect(hit.length, `${f.name}: got ${top.join(', ')}`).toBeGreaterThanOrEqual(4)
  })
})
describe('recommender rules', () => {
  const at: [number, number] = [22.5164, 88.3372]
  it('closed pandals are excluded', () => expect(recommend(ps, ctx(at, { live: { crowd: {}, closed: new Set(['chetla-agrani']), freshPosts: {} } })).some(r => r.p.id === 'chetla-agrani')).toBe(false))
  it('open status is sticky: confirmed-open on the doorstep leads', () => expect(recommend(ps, ctx(at))[0].p.id).toBe('chetla-agrani'))
  it('a crowd surge demotes', () => {
    const base = recommend(ps, ctx(at)).findIndex(r => r.p.id === 'suruchi-sangha')
    const surged = recommend(ps, ctx(at, { live: { crowd: { 'suruchi-sangha': { at: new Date(NOW - 20 * 60e3).toISOString() } }, closed: new Set(), freshPosts: {} } })).findIndex(r => r.p.id === 'suruchi-sangha')
    expect(surged).toBeGreaterThan(base)
  })
  it('seen pandals sink below unseen ones', () => {
    const r = recommend(ps, ctx(at, { seen: new Set(['chetla-agrani']) }))
    expect(r.findIndex(x => x.p.id === 'chetla-agrani')).toBeGreaterThanOrEqual(5)
  })
  it('a fresh visitor post boosts', () => {
    const id = 'badamtala-ashar-sangha', b = recommend(ps, ctx(at)).findIndex(r => r.p.id === id)
    const f = recommend(ps, ctx(at, { live: { crowd: {}, closed: new Set(), freshPosts: { [id]: NOW - 10 * 60e3 } } })).findIndex(r => r.p.id === id)
    expect(f).toBeLessThanOrEqual(b)
  })
  it('diversity: no pick in the top 5 has more than 2 others in its lane', () => {
    for (const f of fx) { const top = recommend(ps, ctx(f.at)).slice(0, 5).map(r => r.p)
      for (const a of top) expect(top.filter(b => b !== a && haversine(a, b) <= REC.laneM).length, f.name).toBeLessThanOrEqual(2) }
  })
  it('rain makes far picks costlier', () => {
    const far = (r: ReturnType<typeof recommend>) => r.slice(0, 5).reduce((s, x) => s + x.t.carMin, 0)
    expect(far(recommend(ps, ctx([22.4874, 88.3134], { rain: true })))).toBeLessThanOrEqual(far(recommend(ps, ctx([22.4874, 88.3134]))))
  })
  it('every pick explains itself', () => expect(recommend(ps, ctx(at))[0].why.length).toBeGreaterThan(0))
  it('deterministic for the same input', () => expect(recommend(ps, ctx(at)).map(r => r.p.id)).toEqual(recommend(ps, ctx(at)).map(r => r.p.id)))
})
describe('full list (Near you / zone browse)', () => {
  const at: [number, number] = [22.518, 88.368]
  const near = ps.filter(p => haversine({ lat: at[0], lng: at[1] }, p) < 8000)
  it('lists every pandal exactly once, so the count matches the rows', () => {
    const ids = listAll(near, ctx(at, { live: { crowd: {}, closed: new Set(['ekdalia-evergreen']), freshPosts: {} } })).map(r => r.p.id)
    expect(ids.length).toBe(near.length); expect(new Set(ids).size).toBe(near.length)
  })
  it('closed pandals stay visible, last', () => {
    const l = listAll(near, ctx(at, { live: { crowd: {}, closed: new Set(['ekdalia-evergreen']), freshPosts: {} } }))
    expect(l[l.length - 1].p.id).toBe('ekdalia-evergreen')
  })
})
describe('route lead', () => {
  const at: [number, number] = [22.4925, 88.3866]
  const c = ctx(at, { status: id => id === 'santoshpur-lake-pally' ? { key: 'open', label: 'Open' } : null })
  const near = ps.filter(p => haversine({ lat: at[0], lng: at[1] }, p) < 6000)
  it('an Open pandal a few hundred metres away leads over a no-status one on the doorstep', () => {
    expect(routeStops(recommend(near, c).slice(0, 8).map(r => r.p))[0].id).toBe('santoshpur-lake-pally')
  })
})
