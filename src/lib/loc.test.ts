import { describe, it, expect } from 'vitest'
import { reduce, initial, onLoadAction, needsChip, shouldUpdate, platform, CACHE_MAX_AGE } from './loc'
const fix = (acc: number, at = 1000) => ({ lat: 22.5, lng: 88.35, acc, at })
describe('permission state machine', () => {
  it('granted locates without a tap, prompt waits, denied shows chip', () => {
    expect(onLoadAction('granted')).toBe('locate'); expect(onLoadAction('prompt')).toBe('wait')
    expect(onLoadAction('denied')).toBe('chip'); expect(onLoadAction('unsupported')).toBe('chip')
  })
  it('request -> locating, but not when denied (no spam)', () => {
    expect(reduce(initial('prompt'), { type: 'request' }).status).toBe('locating')
    expect(reduce(initial('denied'), { type: 'request' }).status).toBe('idle')
  })
  it('fix marks approximate above 500 m and flips perm to granted', () => {
    const s = reduce(initial('prompt'), { type: 'fix', fix: fix(800) })
    expect(s.approx).toBe(true); expect(s.perm).toBe('granted'); expect(s.status).toBe('ok')
    expect(reduce(s, { type: 'fix', fix: fix(30, 5000) }).approx).toBe(false)
  })
  it('ignores a much worse fix arriving right after a good one', () => {
    const s = reduce(initial(), { type: 'fix', fix: fix(20, 1000) })
    expect(reduce(s, { type: 'fix', fix: fix(900, 3000) }).fix!.acc).toBe(20)
  })
  it('user denial shows chip', () => {
    const s = reduce(initial('prompt'), { type: 'error', code: 1, cached: fix(10), now: 2000 })
    expect(s.perm).toBe('denied'); expect(needsChip(s)).toBe(true); expect(s.source).toBeNull()
  })
  it('timeout falls back to a fresh cached fix, marked approximate', () => {
    const s = reduce(initial('granted'), { type: 'error', code: 3, cached: fix(15, 0), now: 60000 })
    expect(s.source).toBe('cache'); expect(s.approx).toBe(true); expect(s.status).toBe('ok')
  })
  it('timeout with stale cache is an error, not a stale walk', () => {
    expect(reduce(initial('granted'), { type: 'error', code: 3, cached: fix(15, 0), now: CACHE_MAX_AGE + 1 }).status).toBe('error')
  })
  it('permission flip from denied to granted clears the chip', () => {
    expect(needsChip(reduce(initial('denied'), { type: 'perm', perm: 'granted' }))).toBe(false)
  })
})
describe('watch updates', () => {
  it('updates on >150 m move or big accuracy gain', () => {
    expect(shouldUpdate(fix(30), fix(30), 100)).toBe(false)
    expect(shouldUpdate(fix(30), fix(30), 200)).toBe(true)
    expect(shouldUpdate(fix(900), fix(40), 20)).toBe(true)
  })
  it('platform detection', () => {
    expect(platform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios')
    expect(platform('Mozilla/5.0 (Linux; Android 14)')).toBe('android')
  })
})
