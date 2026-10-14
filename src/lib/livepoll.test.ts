import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
describe('live data reaches the phone within ~1 min', () => {
  it('polls status/x every <=45 s while foregrounded, busting the CDN cache', () => {
    expect(app).toMatch(/setInterval\(load, 45e3\)/)
    expect(app).toMatch(/'live\/' \+ f \+ '\?t=' \+ Math\.floor\(Date\.now\(\) \/ 30e3\)/)
  })
  it('service worker caches live files under one key (query stripped)', () => {
    expect(sw).toMatch(/liveKey/)
  })
})
