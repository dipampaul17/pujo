// Release gate e2e: core flows on iPhone viewport, WebKit + Chromium. Exit 1 on any failure.
// usage: NODE_PATH=/tmp/pw/node_modules node e2e/gate.cjs http://localhost:4391/pujo/ [shotsDir]
const pw = require(process.env.PW_CORE || 'playwright-core'); const url = process.argv[2]; const out = process.argv[3] || '/workspace/shots/gate'
require('fs').mkdirSync(out, { recursive: true })
const fails = []; const ok = (c, m) => { if (!c) fails.push(m) }
const SPOTS = { chetla: [22.5164, 88.3372], ballygunge: [22.5270, 88.3650], behala: [22.4980, 88.3110], jadavpur: [22.4990, 88.3710], gariahat: [22.5180, 88.3680] }
;(async () => {
  for (const name of ['webkit', 'chromium']) {
    const b = await pw[name].launch(name === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {})
    const T = s => `${name}: ${s}`
    const mk = async geo => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: name === 'chromium', ...(geo ? { geolocation: { latitude: geo[0], longitude: geo[1], accuracy: 15 }, permissions: ['geolocation'] } : {}) }); const p = await c.newPage(); p.on('pageerror', e => fails.push(T('pageerror ' + e.message))); return [c, p] }
    const ovf = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    // South spots: hero first, Near me -> Near you list, nearest first, valid links
    for (const [spot, ll] of Object.entries(SPOTS)) {
      const [c, p] = await mk(ll); await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
      ok(await p.locator('main.landing').count() === 1, T(`${spot}: hero not first`)); ok(await p.evaluate(() => scrollY) === 0, T(`${spot}: not at top`))
      await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1200)
      ok(await p.getByText('Near you').count() > 0, T(`${spot}: no Near you list`)); ok(!(await ovf(p)), T(`${spot}: horizontal overflow`))
      const hrefs = await p.$$eval('a[href]', a => a.map(x => x.href)); ok(!hrefs.some(h => /undefined|NaN|null/.test(h)), T(`${spot}: bad href`))
      const uber = hrefs.find(h => h.startsWith('https://m.uber.com/ul/')); ok(uber && uber.includes(`pickup%5Blatitude%5D=${ll[0].toFixed(6)}`), T(`${spot}: Uber pickup is not my position`))
      const maps = hrefs.find(h => h.includes('google.com/maps/dir/')); ok(maps && maps.includes(`origin=${ll[0].toFixed(6)}`), T(`${spot}: Maps route does not start at me`))
      await p.screenshot({ path: `${out}/${name}-${spot}.png` }); await c.close()
    }
    // Sheet: open, close, backdrop, Esc, back, double tap, drag
    { const [c, p] = await mk(SPOTS.chetla); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1200)
      const row = i => p.locator('details ul li a, ul li button[aria-haspopup=dialog]').nth(i)
      const open = () => p.locator('[role=dialog]').count()
      await row(1).tap(); await p.waitForTimeout(450); ok(await open() === 1, T('row tap does not open sheet')); await p.screenshot({ path: `${out}/${name}-sheet.png` })
      await p.locator('[role=dialog] [aria-label=Close]').tap(); await p.waitForTimeout(450); ok(await open() === 0, T('Close does not close'))
      await row(1).tap(); await p.waitForTimeout(450); await p.keyboard.press('Escape'); await p.waitForTimeout(450); ok(await open() === 0, T('Esc does not close'))
      await row(1).tap(); await p.waitForTimeout(450); await p.goBack(); await p.waitForTimeout(450); ok(await open() === 0 && p.url().startsWith(url), T('back does not close sheet in place'))
      await row(2).dblclick(); await p.waitForTimeout(500); ok(await open() === 1, T('double tap closes the sheet it opened')); await p.keyboard.press('Escape'); await p.waitForTimeout(450)
      await row(1).tap(); await p.waitForTimeout(450); const bx = await p.locator('[role=dialog]').boundingBox(); await p.mouse.move(bx.x + 150, bx.y + 20); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(bx.x + 150, bx.y + 20 + i * 20); 
      const moved = await p.evaluate(() => document.querySelector('[role=dialog]').getBoundingClientRect().top); ok(moved > bx.y + 100, T('sheet does not follow the finger')); await p.mouse.up(); await p.waitForTimeout(500); ok(await open() === 0, T('drag does not close'))
      ok(await p.evaluate(() => history.state?.v) !== 'detail', T('stale history entry after close'))
      await c.close() }
    // Distance is from the live fix and follows the user as they move (Chetla -> Gariahat), never from a zone centre.
    { const [c, p] = await mk(SPOTS.chetla); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1500)
      const hv = (a, b) => { const r = x => x * Math.PI / 180, h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)) }
      const fmt = m => m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
      const SMS = [22.516435, 88.337189] // Chetla Agrani verified pin
      const rowDist = async () => { const t = await p.locator('details ul li a, ul li button[aria-haspopup=dialog]').filter({ hasText: 'Chetla Agrani' }).first().innerText().catch(() => ''); return (t.match(/[\d.]+ (?:m|km)/) || [''])[0] }
      ok(await rowDist() === fmt(hv(SPOTS.chetla, SMS)), T(`distance at Chetla: got "${await rowDist()}" want "${fmt(hv(SPOTS.chetla, SMS))}"`))
      await c.setGeolocation({ latitude: SPOTS.gariahat[0], longitude: SPOTS.gariahat[1], accuracy: 15 }); await p.waitForTimeout(2500)
      ok(await rowDist() === fmt(hv(SPOTS.gariahat, SMS)), T(`distance after moving to Gariahat: got "${await rowDist()}" want "${fmt(hv(SPOTS.gariahat, SMS))}"`))
      // Browsing another zone keeps distances from me, not that zone's metro
      await p.locator('[role=tab]', { hasText: 'Central' }).first().tap(); await p.waitForTimeout(800)
      const t = await p.locator('details ul li a, ul li button[aria-haspopup=dialog]').first().innerText(); const km = parseFloat((t.match(/([\d.]+) km/) || [0, 0])[1])
      ok(km > 1.5, T(`Central list distance not from my position: "${t.replace(/\n/g, ' ')}"`))
      await c.close() }
    // Denied: help sheet, zones still work. Far away: finite distance.
    { const [c, p] = await mk(null); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1200)
      ok(await p.locator('[role=dialog]').count() === 1, T('denied: no help sheet')); await p.getByRole('button', { name: 'Not now' }).tap().catch(() => {}); await p.waitForTimeout(300)
      await p.locator('[role=tab]', { hasText: 'South' }).first().tap(); await p.waitForTimeout(800); ok(await p.locator('ul li').count() > 5, T('denied: South zone empty')); await c.close() }
    { const [c, p] = await mk([28.6, 77.2]); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1200)
      const t = await p.locator('main').innerText(); ok(!/Infinity|NaN/.test(t), T('far: Infinity/NaN shown')); await c.close() }
    await b.close()
  }
  console.log(fails.length ? 'E2E FAIL\n' + fails.join('\n') : 'E2E PASS'); process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('E2E ERROR', e.message); process.exit(1) })
