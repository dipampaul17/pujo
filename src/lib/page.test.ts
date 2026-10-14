import { describe, it, expect } from 'vitest'
import { pagePicks } from './page'
const L = ['a', 'b', 'c', 'd'].map(id => ({ id }))
describe('zone page: every pandal exactly once', () => {
  it('the go-next pick leads and is not repeated in the rail', () => {
    const { next, rail } = pagePicks([{ id: 'c' }], L)
    expect(next?.id).toBe('c'); expect(rail.map(x => x.id)).toEqual(['a', 'b', 'd'])
  })
  it('no route pick (filters/approx): first listed leads', () => {
    const { next, rail } = pagePicks([], L); expect(next?.id).toBe('a'); expect(rail.map(x => x.id)).toEqual(['b', 'c', 'd'])
  })
  it('a route pick filtered out of the list is not shown', () => {
    const { next } = pagePicks([{ id: 'z' }], L); expect(next?.id).toBe('a')
  })
  it('empty', () => expect(pagePicks([], [])).toEqual({ next: null, rail: [] }))
  it('union is exactly the list, no duplicates', () => {
    for (const s of [[], [{ id: 'b' }], [{ id: 'd' }, { id: 'a' }]]) { const { next, rail } = pagePicks(s, L); const ids = [next!.id, ...rail.map(x => x.id)]; expect(ids.sort()).toEqual(['a', 'b', 'c', 'd']) }
  })
})
