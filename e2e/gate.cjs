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
    const mk = async geo => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: name === 'chromium', serviceWorkers: 'block', ...(geo ? { geolocation: { latitude: geo[0], longitude: geo[1], accuracy: 15 }, permissions: ['geolocation'] } : {}) }); const p = await c.newPage(); p.on('pageerror', e => fails.push(T('pageerror ' + e.message))); return [c, p] }
    const ovf = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    // South spots: hero first, Near me -> Near you list, nearest first, valid links
    for (const [spot, ll] of Object.entries(SPOTS)) {
      const [c, p] = await mk(ll); await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(700)
      ok(await p.locator('main.landing').count() === 1, T(`${spot}: hero not first`)); ok(await p.evaluate(() => scrollY) === 0, T(`${spot}: not at top`))
      await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1200)
      ok(await p.locator('[data-card]').count() > 0, T(`${spot}: no list`)); ok(!(await ovf(p)), T(`${spot}: horizontal overflow`))
      const hrefs = await p.$$eval('a[href]', a => a.map(x => x.href)); ok(!hrefs.some(h => /undefined|NaN|null/.test(h)), T(`${spot}: bad href`))
      const uber = hrefs.find(h => h.startsWith('https://m.uber.com/ul/')); ok(uber && uber.includes(`pickup%5Blatitude%5D=${ll[0].toFixed(6)}`), T(`${spot}: Uber pickup is not my position`))
      const maps = hrefs.find(h => h.includes('google.com/maps/dir/')); ok(maps && maps.includes(`origin=${ll[0].toFixed(6)}`), T(`${spot}: Maps route does not start at me`))
      { const D = require('../src/data/dhaak.v1.json').pandals, other = new Set(D.filter(q => q.lat != null && q.lat >= 22.54).map(q => q.name))
        const txt = (await p.locator('main').innerText()).split('\n').map(x => x.trim()); const bad = txt.filter(x => other.has(x))
        ok(bad.length === 0, T(`${spot}: South tab shows non-South pandals: ${bad.join(', ')}`)) }
      await p.screenshot({ path: `${out}/${name}-${spot}.png` }); await c.close()
    }
    // QA: list count matches rows, closed pandals visible as Closed, one 'Near you' heading; far away selects no zone.
    { const [c, p] = await mk(SPOTS.gariahat); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2500)
      { const names = await p.locator('[data-card] .prow-name').allInnerTexts(); ok(names.length > 5 && new Set(names).size === names.length, T(`a pandal appears twice on the page (${names.length - new Set(names).size} dupes)`))
        const dock = await p.locator('.dock [role=tablist][aria-label=Zone]').boundingBox(); ok(dock && dock.y > 600, T('zone switch not in thumb reach (bottom dock)')) }
      ok(await p.locator('.seg-count').count() === 0 && await p.locator('details.group summary .mono-num').count() === 0, T('redundant counts on zone tabs / list header'))
      ok(await p.getByRole('heading', { name: 'Near you' }).count() + await p.locator('summary', { hasText: /^Near you/ }).count() <= 1, T('"Near you" heading twice'))
      { const r = p.locator('.rail [data-card]').filter({ has: p.locator('[aria-label*="by car"]') }).first(); const rl = await r.locator('[aria-label*="by car"]').getAttribute('aria-label'); await r.locator('[aria-haspopup=dialog]').tap(); await p.waitForTimeout(700)
        ok(await p.locator('[role=dialog] [aria-label*="by car"]').first().getAttribute('aria-label').catch(() => null) === rl, T('sheet travel time differs from the list'))
        ok((await p.locator('[role=dialog] a.btn-uber').getAttribute('href')).includes(`pickup%5Blatitude%5D=${SPOTS.gariahat[0].toFixed(6)}`), T('sheet Uber pickup is not my position')); await p.keyboard.press('Escape'); await p.waitForTimeout(500) }
      const ek = p.locator('[data-card]', { hasText: 'Ekdalia' }); const ekC = await p.evaluate(() => fetch('live/status.json').then(r => r.json()).then(j => j.open['ekdalia-evergreen']?.kind === 'closed')); if (await ek.count()) ok(/Closed/.test(await ek.innerText()) === ekC, T('Ekdalia row Closed mark disagrees with status.json'))
      const chip = p.getByRole('button', { name: /^Open/ }).filter({ has: p.locator('.chip-n') })
      if (await chip.count()) { const want = parseInt(await chip.locator('.chip-n').innerText()); await chip.tap(); await p.waitForTimeout(400); const t = await p.locator('[data-card]').allInnerTexts(); ok(t.length > 0 && t.every(x => /Open|Inaugurated/.test(x)), T('Open filter lets non-open rows through'))
        ok(want === t.length, T('filtered count wrong')); await p.screenshot({ path: `${out}/${name}-filters.png` })
        await p.reload({ waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap().catch(() => {}); await p.waitForTimeout(2000); ok(await p.locator('[aria-pressed=true]').count() === 1, T('filter not persisted'))
        await p.locator('[aria-pressed=true]').tap(); await p.waitForTimeout(300) } else ok(false, T('no Open filter chip at Gariahat'))
      await c.close() }
    { const [c, p] = await mk(SPOTS.gariahat); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2000)
      const want = await p.evaluate(async () => { const s = await (await fetch('live/status.json', { cache: 'no-store' })).json(); return Object.values(s.open).filter(v => v.kind !== 'closed').length })
      let got = 0; for (const z of ['North', 'Central', 'South', 'Salt Lake']) { await p.locator('[role=tab]', { hasText: z }).first().tap(); await p.waitForTimeout(700); got += (await p.locator('[data-card]').allInnerTexts()).filter(t => /\b(Open|Inaugurated)\b/.test(t)).length }
      ok(got === want, T(`Open across zone lists ${got} ≠ status.json ${want}`)); await c.close() }
    { const [c, p] = await mk([22.5832, 88.4127]); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2000)
      const tabs = await p.locator('[role=tablist][aria-label=Zone] [role=tab]').allInnerTexts(); ok(/Salt Lake/.test(tabs[0]) && (await p.locator('[role=tablist][aria-label=Zone] [aria-selected=true]').innerText()).includes('Salt Lake'), T(`FD Block: Salt Lake not first/selected: ${tabs}`))
      await p.screenshot({ path: `${out}/${name}-saltlake.png` }); ok(!(await ovf(p)), T('Salt Lake: horizontal overflow')); await c.close() }
    // Select → Walk: pick across zones, pill at ≥2, ordered route, Google Maps walking from me, persists.
    { const [c, p] = await mk(SPOTS.gariahat); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2000)
      await p.evaluate(() => localStorage.setItem('pujo.picked', JSON.stringify(['__gone'])))
      const add = p.locator('.rail [aria-label^="Add "]'); await add.nth(0).tap(); await p.waitForTimeout(200); ok(/Walk 1/.test(await p.locator('.walk-pill').innerText().catch(() => '')), T('no Walk 1 pill'))
      await add.nth(0).tap(); await add.nth(0).tap(); await p.waitForTimeout(200); ok(/Walk 3/.test(await p.locator('.walk-pill').innerText().catch(() => '')), T('3 picks do not give Walk 3'))
      ok(await p.locator('.rail-end').count() === 0, T('suggested route shown while picks exist'))
      await p.locator('[role=tab]', { hasText: 'Central' }).first().tap(); await p.waitForTimeout(600); await p.locator('.rail [aria-label^="Add "]').first().tap(); await p.waitForTimeout(200)
      ok(/Walk 1/.test(await p.locator('.walk-pill').innerText().catch(() => '')), T('other-zone picks leak into this walk'))
      await p.locator('[role=tab]', { hasText: 'South' }).first().tap(); await p.waitForTimeout(600)
      await p.reload({ waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap().catch(() => {}); await p.waitForTimeout(1500); ok(/Walk 3/.test(await p.locator('.walk-pill').innerText().catch(() => '')), T('selection not persisted'))
      await p.locator('.walk-pill').tap(); await p.waitForTimeout(500); const d = p.locator('[role=dialog][aria-label=Walk]')
      ok(await d.locator('ol li').count() === 3, T('walk sheet is not exactly the 3 picks')); { const h = await d.locator('a[href*="google.com/maps/dir"]').first().getAttribute('href'); const q = new URL(h).searchParams; ok(1 + (q.get('waypoints') ? q.get('waypoints').split('|').length : 0) === 3, T(`maps url not 3 stops: ${h}`)) }; const href = await d.locator('a[href*="google.com/maps/dir"]').first().getAttribute('href').catch(() => '')
      ok(href.includes('travelmode=walking') && href.includes(`origin=${SPOTS.gariahat[0].toFixed(6)}`), T(`walk link not walking from me: ${href}`)); await p.screenshot({ path: `${out}/${name}-walk.png` })
      await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok(await d.count() === 0, T('Esc does not close walk sheet')); await p.evaluate(() => localStorage.removeItem('pujo.picked')); await c.close() }
    if (name === 'webkit') { const c = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, serviceWorkers: 'block', geolocation: { latitude: SPOTS.gariahat[0], longitude: SPOTS.gariahat[1], accuracy: 15 }, permissions: ['geolocation'] }); const p = await c.newPage()
      await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2000); ok(!(await ovf(p)), T('430x932: horizontal overflow'))
      const dock = await p.locator('.dock [role=tablist]').boundingBox(); ok(dock && dock.y + dock.height <= 932 && dock.y > 760, T('430x932: zone dock not at the bottom'))
      await p.screenshot({ path: `${out}/${name}-430.png` }); await c.close() }
    // Clean zone view: above the fold only the dock switcher, go-next card and the rail. Food/Toilets/Help one tap deeper.
    { const [c, p] = await mk(SPOTS.gariahat); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2000)
      for (const z of ['North', 'Central', 'South', 'Salt Lake']) { await p.locator('.dock [role=tab]', { hasText: z }).first().tap(); await p.waitForTimeout(800); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200)
        const fb = await p.evaluate(() => { const f = document.querySelector('[aria-label=Filter]'), g = document.querySelector('article.go'); return f && g ? f.getBoundingClientRect().top < g.getBoundingClientRect().top && f.getBoundingClientRect().top < 120 : true }); ok(fb, T(`${z}: filters not at the top`))
        const extra = await p.evaluate(() => [...document.querySelectorAll('.now-strip, [role=tablist][aria-label=Sections]')].filter(e => e.getBoundingClientRect().top < innerHeight - 90).length)
        ok(extra === 0, T(`${z}: extra chrome above the fold`)); ok(await p.locator('article.go').count() === 1, T(`${z}: no go-next card`)); await p.screenshot({ path: `${out}/${name}-zone-${z.replace(' ', '')}.png` }) }
      await p.getByRole('button', { name: 'Food' }).scrollIntoViewIfNeeded(); await p.getByRole('button', { name: 'Food' }).tap(); await p.waitForTimeout(400); ok(await p.locator('[role=dialog][aria-label=Food]').count() === 1, T('Food sheet does not open'))
      await p.keyboard.press('Escape'); await p.waitForTimeout(400); ok(await p.locator('[role=dialog]').count() === 0, T('Food sheet does not close')); await c.close() }
    { const [c, p] = await mk([28.61, 77.21]); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1500)
      ok(await p.locator('[role=tablist][aria-label=Zone] [aria-selected=true]').count() === 0, T('far away: a zone looks selected over "Too far"'))
      await c.close() }
    // Sheet: open, close, backdrop, Esc, back, double tap, drag
    { const [c, p] = await mk(SPOTS.chetla); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1200)
      const row = i => p.locator('[data-card] [aria-haspopup=dialog]').nth(i)
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
    // Travel times come from the live fix and follow the user as they move; browsing another zone keeps them from me.
    { const [c, p] = await mk(SPOTS.chetla); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2500)
      const car = async name => { const l = await p.locator('[data-card]').filter({ hasText: name }).first().locator('[aria-label*="by car"]').first().getAttribute('aria-label').catch(() => null); return l ? parseInt(l.replace('~', '')) : null }
      const here = await car('Chetla Agrani'); ok(here != null && here <= 4, T(`Chetla Agrani from Chetla: ${here} min by car`))
      await c.setGeolocation({ latitude: SPOTS.gariahat[0], longitude: SPOTS.gariahat[1], accuracy: 15 }); await p.waitForTimeout(3000)
      await p.locator('[role=tab]', { hasText: 'South' }).first().tap(); await p.waitForTimeout(800)
      const moved = await car('Chetla Agrani'); ok(moved != null && moved > (here ?? 0) + 3, T(`after moving to Gariahat Chetla Agrani still ${moved} min`))
      await p.locator('[role=tab]', { hasText: 'Central' }).first().tap(); await p.waitForTimeout(800)
      const l = await p.locator('[data-card]').first().locator('[aria-label*="by car"]').first().getAttribute('aria-label').catch(() => null)
      ok(l && parseInt(l.replace('~', '')) >= 8, T(`Central list not timed from my position: ${l}`))
      await p.screenshot({ path: `${out}/${name}-moved-central.png` }); await c.close() }
    // Fresh open at 5 South spots: the Near you top 5 matches the hand-made local picks (frozen status, matrix travel, 19:00 IST).
    { const fx = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../src/lib/fixtures/recs-south.json'), 'utf8'))
      const status = require('fs').readFileSync(require('path').join(__dirname, '../src/lib/fixtures/status-2026-10-13.json'), 'utf8')
      for (const f of fx) { const [c, p] = await mk(f.at)
        await p.clock.setFixedTime(new Date('2026-10-13T19:00:00+05:30'))
        await p.route('**/live/status.json*', r => r.fulfill({ body: status, contentType: 'application/json' }))
        await p.route(/project-osrm|openstreetmap\.de/, r => r.abort())
        await p.route('**/live/now.json*', r => r.fulfill({ body: '{"items":[]}', contentType: 'application/json' }))
        await p.route('**/live/x.json*', r => r.fulfill({ body: '{"posts":{},"crowd":{}}', contentType: 'application/json' }))
        await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2500)
        const rows = await p.locator('.rail [data-card]').evaluateAll(ls => ls.map(l => { const c = l.querySelector('[aria-label*="by car"]'); return { g: /\b(Open|Inaugurated)\b/.test(l.innerText) ? 0 : l.querySelector('.pass-mark, .rail-pass') ? 1 : 2, m: c ? parseInt(c.getAttribute('aria-label').replace('~', '')) : NaN } })).then(r => r.filter(x => !isNaN(x.m)))
        ok(rows.length > 5 && rows.every((r, i) => i === 0 || r.g > rows[i - 1].g || (r.g === rows[i - 1].g && r.m >= rows[i - 1].m)), T(`${f.name}: zone list not open → pass → drive time: ${(i => rows.slice(Math.max(0, i - 3), i + 3).map(r => r.g + ':' + r.m).join(',') + ' @' + i)(rows.findIndex((r, i) => i > 0 && !(r.g > rows[i - 1].g || (r.g === rows[i - 1].g && r.m >= rows[i - 1].m))))}`))
        await p.screenshot({ path: `${out}/${name}-open-${f.name.toLowerCase()}.png` }); await c.close() } }
    // Denied: help sheet, zones still work. Far away: finite distance.
    { const [c, p] = await mk(null); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1200)
      ok(await p.locator('[role=dialog]').count() === 1, T('denied: no help sheet')); await p.getByRole('button', { name: 'Not now' }).tap().catch(() => {}); await p.waitForTimeout(300)
      await p.locator('[role=tab]', { hasText: 'South' }).first().tap(); await p.waitForTimeout(800); ok(await p.locator('ul li').count() > 5, T('denied: South zone empty'))
      const SOUTH = require('../src/data/dhaak.v1.json').pandals.filter(q => q.lat != null && q.precision !== 'none' && q.lat < 22.54).length
      const rows = await p.locator('[data-card]').count(); ok(rows === SOUTH, T(`South tab lists ${rows} of ${SOUTH} South pandals`))
      await p.screenshot({ path: `${out}/${name}-south-all.png`, fullPage: true }); await c.close() }
    { const [c, p] = await mk([28.6, 77.2]); await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1200)
      const t = await p.locator('main').innerText(); ok(!/Infinity|NaN/.test(t), T('far: Infinity/NaN shown')); await c.close() }
    await b.close()
  }
  console.log(fails.length ? 'E2E FAIL\n' + fails.join('\n') : 'E2E PASS'); process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('E2E ERROR', e.stack); process.exit(1) })
