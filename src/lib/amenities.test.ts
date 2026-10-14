import { describe, it, expect } from 'vitest'
import raw from '../data/dhaak.v1.json'
import { makePlanner } from './plan'
const P = makePlanner(raw as any), d = raw as any
const at = (id: string) => P.located.find(x => x.id === id)!
describe('food and toilets: real, de-duplicated, not thin in South', () => {
  const osm = (JSON.parse(require('node:fs').readFileSync('pipeline/raw/osm_amenities_south.json', 'utf8')).elements as any[])
  const ids = new Set([...d.food, ...d.toilets].map((a: any) => a.id))
  it('every named OSM eatery and every OSM toilet in the South snapshot is in the app', () => {
    const miss = osm.filter(e => (e.tags.amenity === 'toilets' || e.tags.name) && !ids.has(`${e.tags.amenity === 'toilets' ? 't' : 'f'}${e.id}`)
      && !(e.tags.amenity === 'toilets' ? d.toilets : d.food).some((x: any) => Math.hypot((x.lat - (e.lat ?? e.center.lat)) * 111200, (x.lng - (e.lon ?? e.center.lon)) * 103100) < 60))
    expect(miss.map(e => e.tags.name ?? e.id)).toEqual([])
  })
  it('Santoshpur Lake Pally is no longer down to 1-2 eateries', () => expect(P.around('food', at('santoshpur-lake-pally'), 6, 1600).length).toBeGreaterThanOrEqual(3))
  it('every place sits inside Kolkata and is traceable (OSM id or curated source)', () => {
    for (const a of [...d.food, ...d.toilets]) {
      expect(a.lat > 22.3 && a.lat < 22.8 && a.lng > 88.2 && a.lng < 88.6, a.name).toBe(true)
      expect(/^(f|t|cn)\d+$/.test(a.id) || !!a.src || !!a.osm, a.id).toBe(true)
    }
  })
  it('no duplicate ids', () => { const ids = [...d.food, ...d.toilets].map((a: any) => a.id); expect(new Set(ids).size).toBe(ids.length) })
})
