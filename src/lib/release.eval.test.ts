// Release eval: status accuracy vs a hand-verified fixture, link integrity, pin sanity, no filler copy.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import raw from '../data/dhaak.v1.json'
import { statusOf, type StatusFile, type Dataset } from './plan'
import { uberUrl, mapsDirUrl, mapsPlaceUrl } from './geo'
const d = raw as unknown as Dataset
const status = JSON.parse(readFileSync(new URL('../../public/live/status.json', import.meta.url), 'utf8')) as StatusFile
// Hand-verified 13 Oct 2026: visitors inside (X posts + news). Must read "Open".
const KNOWN_OPEN = ['santosh-mitra-square', 'chetla-agrani', 'sree-bhumi-sporting-club', 'barisha-club', 'tala-prattoy']
const now = Date.parse('2026-10-13T16:00:00+05:30'), ist = '2026-10-13'
describe('release eval', () => {
  it('known-open pandals read Open', () => {
    for (const id of KNOWN_OPEN) expect(statusOf(id, ist, status, now)?.key, id).toBe('open')
  })
  it('every declared status has a source link and an id in the dataset', () => {
    const ids = new Set(d.pandals.map(p => p.id))
    for (const [id, e] of Object.entries(status.open)) { expect(ids.has(id), id).toBe(true); expect(e.evidence).toMatch(/^https:\/\//) }
  })
  it('pins sit inside greater Kolkata and pinned pandals do not share one coordinate', () => {
    const seen = new Map<string, string>()
    for (const p of d.pandals.filter(p => p.lat != null)) {
      expect(p.lat!, p.id).toBeGreaterThan(22.35); expect(p.lat!, p.id).toBeLessThan(22.75)
      expect(p.lng!, p.id).toBeGreaterThan(88.2); expect(p.lng!, p.id).toBeLessThan(88.55)
      if (p.precision === 'osm' && p.id !== 'tala-park') { // Tala Park's puja is Tala Prattoy: same place, listed twice in the guide
         const k = `${p.lat},${p.lng}`; expect(seen.get(k), `${p.id} shares a pin with ${seen.get(k)}`).toBeUndefined(); seen.set(k, p.id) }
    }
  })
  it('Uber and Maps links are well formed for every pandal', () => {
    const me = { lat: 22.5168, lng: 88.3458 }
    for (const p of d.pandals.filter(p => p.lat != null) as any[]) {
      for (const u of [uberUrl({ lat: p.lat, lng: p.lng, name: p.name, address: `${p.name}, Kolkata` }, me), uberUrl({ lat: p.lat, lng: p.lng, name: p.name, address: `${p.name}, Kolkata` }, null), mapsDirUrl(me, [p]), mapsDirUrl(null, [p]), mapsPlaceUrl(p, p.name)]) {
        expect(() => new URL(u)).not.toThrow(); expect(u, p.id).not.toMatch(/undefined|NaN|null|\s/)
      }
      const q = new URL(uberUrl({ lat: p.lat, lng: p.lng, name: p.name, address: 'x' }, me)).searchParams
      expect(+q.get('dropoff[latitude]')!).toBeCloseTo(p.lat, 5); expect(+q.get('dropoff[longitude]')!).toBeCloseTo(p.lng, 5)
    }
  })
  it('no filler or AI-slop copy in the UI', () => {
    const src = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    expect(src).not.toMatch(/lorem|ipsum|TODO|FIXME|coming soon|seamless|elevate your|unlock|delve|embark|tapestry|vibrant|curated experience/i)
  })
})
