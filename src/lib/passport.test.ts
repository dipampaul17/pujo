import { describe, it, expect } from 'vitest'
import pass from '../data/passport.json'
import raw from '../data/dhaak.v1.json'
import { hasPass } from './passport'
const ids = new Set((raw as any).pandals.map((p: any) => p.id))
describe('Pujor Passport', () => {
  it('every pass id is a real pandal, no duplicates', () => {
    for (const id of pass.ids) expect(ids.has(id), id).toBe(true)
    expect(new Set(pass.ids).size).toBe(pass.ids.length)
  })
  it('covers exactly the matched committees', () => {
    expect(pass.ids.length).toBe(28)
    expect(hasPass('66-pally')).toBe(true)
    expect(hasPass('haridevpur-41-pally')).toBe(true)
  })
  it('does not mark near-namesakes', () => {
    for (const id of ['tala-park', 'tala-prattoy', 'naktala-pally-unnayan-samity', 'suruchi-sangha', 'sree-bhumi-sporting-club']) expect(hasPass(id), id).toBe(false)
  })
})
