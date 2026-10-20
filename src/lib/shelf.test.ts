import { describe, it, expect } from 'vitest'
import { bestNear } from './rank'
const P = (id: string, worth: number, walkM: number, carM: number, precision = 'osm') => ({ id, worth, precision, walkM, carM })
const ps = [P('a', 7, 600, 900), P('b', 5, 1400, 2000), P('c', 4, 3000, 3500), P('d', 6, 6000, 7000), P('e', 7, 9000, 12000), P('f', 2, 300, 400), P('g', 7, 500, 700, 'station'), P('h', 6, 400, 500), P('i', 5, 700, 800)]
const o = { travel: (p: any) => ({ walkM: p.walkM, walkMin: Math.round(p.walkM / 80), carM: p.carM, carMin: Math.round(p.carM / 300) }), open: () => true, seen: (id: string) => id === 'i' }
describe('Best near you', () => {
  const r = bestNear(ps as any, o)
  it('walk: S-tier, exact pin, unseen, within walking range, max 3', () => { expect(r.walk.map(p => p.id).sort()).toEqual(['a', 'b', 'h']) })
  it('uber: beyond walk, within 8 km', () => { expect(r.uber.map(p => p.id).sort()).toEqual(['c', 'd']) })
  it('no overlap and closed pandals are left out', () => {
    expect(r.walk.filter(p => r.uber.includes(p))).toEqual([])
    expect(bestNear(ps as any, { ...o, open: id => id !== 'a' }).walk.map(p => p.id)).not.toContain('a')
  })
})
