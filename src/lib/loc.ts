export type Perm = 'granted' | 'prompt' | 'denied' | 'unsupported'
export type Fix = { lat: number; lng: number; acc: number; at: number }
export type LocState = { perm: Perm; status: 'idle' | 'locating' | 'ok' | 'error'; fix: Fix | null; approx: boolean; source: 'gps' | 'cache' | null }
export type LocEvent =
  | { type: 'perm'; perm: Perm }
  | { type: 'request' }
  | { type: 'fix'; fix: Fix }
  | { type: 'error'; code: number; cached: Fix | null; now: number }

export const APPROX_M = 500
export const CACHE_MAX_AGE = 30 * 60 * 1000

export const initial = (perm: Perm = 'prompt'): LocState => ({ perm, status: 'idle', fix: null, approx: false, source: null })

/** What to do on load. 'granted' and 'prompt' both request right away so the native prompt shows immediately.
 * Browsers that ignore non-gesture requests get a one-time first-tap fallback (see App). */
export function onLoadAction(perm: Perm | 'unknown'): 'locate' | 'chip' {
  return perm === 'denied' || perm === 'unsupported' ? 'chip' : 'locate'
}
/** Show the "Turn on location" chip on every screen? */
export const needsChip = (s: LocState) => s.perm === 'denied' || s.perm === 'unsupported'

export function reduce(s: LocState, e: LocEvent): LocState {
  switch (e.type) {
    case 'perm': return { ...s, perm: e.perm }
    case 'request': return s.perm === 'denied' || s.perm === 'unsupported' ? s : { ...s, status: 'locating' }
    case 'fix': {
      // Keep a better earlier fix if a worse one arrives within 15 s.
      if (s.fix && s.source === 'gps' && e.fix.acc > s.fix.acc * 2 && e.fix.at - s.fix.at < 15000) return s
      return { ...s, status: 'ok', fix: e.fix, approx: e.fix.acc > APPROX_M, source: 'gps', perm: 'granted' }
    }
    case 'error': {
      const perm: Perm = e.code === 1 ? 'denied' : s.perm
      if (e.code !== 1 && e.cached && e.now - e.cached.at < CACHE_MAX_AGE) return { ...s, perm, status: 'ok', fix: e.cached, approx: true, source: 'cache' }
      return { ...s, perm, status: 'error' }
    }
  }
}

/** Should a watch update replace the origin? Moved >150 m, or accuracy got much better. */
export function shouldUpdate(prev: Fix | null, next: Fix, dist: number) {
  if (!prev) return true
  return dist > 150 || (prev.acc > APPROX_M && next.acc < prev.acc / 2)
}

export function platform(ua: string): 'ios' | 'android' | 'other' {
  return /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other'
}
