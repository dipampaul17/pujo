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
import { readFileSync } from 'node:fs'
describe('Pujor Passport placement', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  it('appears on every listing surface (route cards + list rows), never in the sheet', () => {
    expect(app.match(/<PassMark \/>/g)?.length).toBe(2)
    expect(app).toMatch(/hasPass\(s\.id\) && <PassMark \/>/)
    expect(app).not.toMatch(/skip the queue|pass-line/)
    expect(app).toMatch(/inline \/>\{hasPass\(p\.id\) && <PassMark \/>\}/)
  })
})
describe('service worker freshness', () => {
  const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8')
  it('activates immediately and bypasses HTTP cache for the shell', () => {
    expect(sw).toMatch(/skipWaiting/); expect(sw).toMatch(/clients\.claim/)
    expect(sw).toMatch(/fetch\(e\.request, \{ cache: 'no-cache' \}\)/)
    expect(main).toMatch(/updateViaCache: 'none'/); expect(main).toMatch(/controllerchange/)
  })
})
