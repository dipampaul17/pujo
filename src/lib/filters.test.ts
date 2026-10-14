import { describe, it, expect } from 'vitest'
import { applyFilters, chips, type Filters } from './filters'
const L = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
const k = { open: (id: string) => id === 'a' || id === 'b', pass: (id: string) => id === 'b' || id === 'c' }
const ids = (f: Filters) => applyFilters(L, f, k).map(x => x.id)
describe('list filters', () => {
  it('none: everything', () => expect(ids({ open: false, pass: false })).toEqual(['a', 'b', 'c', 'd']))
  it('open', () => expect(ids({ open: true, pass: false })).toEqual(['a', 'b']))
  it('combined is AND', () => expect(ids({ open: true, pass: true })).toEqual(['b']))
  it('chip shows count it would give with the other filter applied', () =>
    expect(chips(L, { open: false, pass: true }, k)).toEqual([{ key: 'open', n: 1, on: false }, { key: 'pass', n: 2, on: true }]))
  it('a chip that would not change results is hidden', () => {
    const all = { open: () => true, pass: (id: string) => id === 'a' }
    expect(chips(L, { open: false, pass: false }, all).map(c => c.key)).toEqual(['pass'])
  })
  it('an active chip always stays (so it can be turned off)', () =>
    expect(chips(L, { open: true, pass: false }, { open: () => false, pass: () => false }).map(c => c.key)).toEqual(['open']))
})
