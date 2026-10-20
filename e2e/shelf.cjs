// "Best near you" shelf: iPhone viewport, WebKit + Chromium, mocked GPS in South / North / Salt Lake, plus denied permission.
const pw = require(process.env.PW_CORE || 'playwright-core'); const url = process.argv[2]; const out = process.argv[3] || '/workspace/shots/shelf'
require('fs').mkdirSync(out, { recursive: true })
const D = require('../src/data/dhaak.v1.json').pandals, byName = new Map(D.map(p => [p.name, p]))
const fails = []; const ok = (c, m) => { if (!c) fails.push(m) }
const SPOTS = { kalighat: [22.5195, 88.3437], shyambazar: [22.6020, 88.3720], saltlake: [22.5870, 88.4170] }
;(async () => {
  for (const name of ['webkit', 'chromium']) {
    const b = await pw[name].launch(name === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {}); const T = s => `${name}: ${s}`
    for (const [spot, ll] of [...Object.entries(SPOTS), ['denied', null]]) {
      const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: name === 'chromium', serviceWorkers: 'block', ...(ll ? { geolocation: { latitude: ll[0], longitude: ll[1], accuracy: 15 }, permissions: ['geolocation'] } : { permissions: [] }) })
      const p = await c.newPage(); p.on('pageerror', e => fails.push(T(`${spot} pageerror ${e.message}`)))
      await p.goto(url, { waitUntil: 'networkidle' })
      if (ll) await p.getByRole('button', { name: 'Near me' }).tap(); else { const s = p.getByRole('button', { name: /station|metro|Pick/i }).first(); if (await s.count()) await s.tap() }
      await p.waitForTimeout(2500)
      if (!ll) { await p.screenshot({ path: `${out}/${name}-denied.png` }); await c.close(); continue }
      const items = await p.$$eval('[data-shelf-item]', a => a.map(x => ({ id: x.getAttribute('data-shelf-item'), g: x.closest('[data-shelf]').getAttribute('data-shelf'), name: x.querySelector('.shelf-name').textContent, href: x.querySelector('a').href, line: x.querySelector('.mono-num').textContent })))
      ok(items.length > 0, T(`${spot}: shelf empty`))
      ok(new Set(items.map(i => i.id)).size === items.length, T(`${spot}: shelf duplicate`))
      for (const g of ['walk', 'uber']) ok(items.filter(i => i.g === g).length <= 3, T(`${spot}: >3 in ${g}`))
      const cards = await p.locator('[data-card] .prow-name').allInnerTexts()
      ok(!items.some(i => cards.includes(i.name)), T(`${spot}: shelf pandal also rendered as a card`))
      for (const i of items) { const q = D.find(x => x.id === i.id)
        ok(q && q.precision === 'osm' && (q.worth ?? 0) >= 3, T(`${spot}: ${i.id} not S-tier exact pin`))
        if (i.g === 'uber') { ok(i.href.includes(`pickup%5Blatitude%5D=${ll[0].toFixed(6)}`) && i.href.includes(`dropoff%5Blatitude%5D=${q.lat.toFixed(6)}`), T(`${spot}: Uber ${i.id} lacks origin/exact pin: ${i.href}`)); ok(/min by car/.test(i.line), T(`${spot}: uber line`)) }
        else { ok(i.href.includes('google.com/maps/dir/') && i.href.includes(`origin=${ll[0].toFixed(6)}`) && i.href.includes(`destination=${q.lat.toFixed(6)}`), T(`${spot}: walk ${i.id} bad maps ${i.href}`)); ok(/min walk/.test(i.line) && parseInt(i.line.replace(/\D+/, '')) <= 25, T(`${spot}: walk line ${i.line}`)) }
      }
      ok(await p.locator('.shelf-go').count() === new Set(items.map(i => i.g)).size, T(`${spot}: one Go next per group`))
      const sh = await p.locator('section.shelf'); if (await sh.count()) await sh.screenshot({ path: `${out}/${name}-${spot}-shelf.png` })
      await p.screenshot({ path: `${out}/${name}-${spot}.png` }); console.log(name, spot, items.map(i => `${i.g}:${i.id}:${i.line}`).join(' | ')); await c.close()
    }
    await b.close()
  }
  if (fails.length) { console.log('SHELF FAIL\n' + fails.join('\n')); process.exit(1) } console.log('SHELF OK')
})()
