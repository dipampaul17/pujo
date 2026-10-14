import { describe, it, expect } from 'vitest'
import { walkPicks, planWalk, walkLegs } from './walk'
const P = Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, lat: 22.50 + i * 0.002, lng: 88.35, precision: 'exact', zone: i < 5 ? 'south' : 'central' }))
describe('walk uses only the selection', () => {
  it('3 selected in zone (with 8 stored overall) gives Walk 3 and a 3-stop Maps URL', () => {
    const picked = ['p0', 'p3', 'p1', 'p5', 'p6', 'p7', 'gone', 'p2'].filter((_, i) => i < 8)
    const sel = walkPicks(['p4', 'p0', 'p2', 'p6', 'p7'], P as any[], p => p.zone === 'south')
    expect(`Walk ${sel.length}`).toBe('Walk 3')
    const w = planWalk({ lat: 22.49, lng: 88.35 }, sel as any, { cost: (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng), closed: () => false })
    expect(w.stops.map(s => s.id)).toEqual(['p0', 'p2', 'p4'])
    const [u, ...rest] = walkLegs({ lat: 22.49, lng: 88.35 }, w.stops)
    expect(rest).toHaveLength(0)
    const q = new URL(u).searchParams
    expect(1 + (q.get('waypoints')?.split('|').length ?? 0)).toBe(3)
    expect(picked.length).toBe(8)
  })
})
