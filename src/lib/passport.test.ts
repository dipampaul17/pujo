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
  it('covers all 52 Pujor Passport pandals', () => {
    expect(pass.ids.length).toBe(52)
    for (const id of ['tala-barowari', 'behala-club', 'bantra-mohila-sangha', 'ichapur-shivaji-sangha', '25-pally-khidirpur']) expect(hasPass(id), id).toBe(true)
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
describe('added pass pandals', () => {
  const P = (raw as any).pandals as any[]
  it('verified pins only where two sources agreed; the rest are approximate (station), never invented', () => {
    const pinned = ['tala-barowari', 'beleghata-33-pally', 'alipore-sarbojanin', 'samaj-sebi-sangha', 'behala-club']
    for (const p of P.filter(p => ['tala-barowari','ahiritola-yubakbrinda','ultadanga-bidhan-sangha','beleghata-33-pally','dum-dum-park-tarun-sangha','keshtopur-prafulla-kanan','telipukur-yuba-sangha','new-town-sarbojanin','abasar-sarbojanin','alipore-sarbojanin','samaj-sebi-sangha','bosepukur-talbagan','purbachal-shakti-sangha','santoshpur-avenue-south','25-pally-khidirpur','pally-saradiya-khidirpur','behala-nutan-dal','behala-friends','behala-club','sb-park-sarbojanin','bantra-mohila-sangha','olabibitala-sarbojanin','salkia-alapani','ichapur-shivaji-sangha'].includes(p.id)))
      expect(p.precision, p.id).toBe(pinned.includes(p.id) ? 'osm' : 'station')
  })
})
