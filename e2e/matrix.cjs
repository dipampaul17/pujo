// Release matrix: WebKit + Chromium × 390x844 + 430x932. Zones × locations, filters, select-and-walk, sheets, alerts, offline, deep links, a11y modes, tap-through.
// usage: PW_CORE=... node e2e/matrix.cjs http://localhost:4391/pujo/ [shotsDir]
const pw = require(process.env.PW_CORE || 'playwright-core'); const fs = require('fs'), path = require('path')
const url = process.argv[2], out = process.argv[3] || '/workspace/shots/matrix'; fs.mkdirSync(out, { recursive: true })
const DATA = require('../src/data/dhaak.v1.json'), P = DATA.pandals.filter(p => p.lat != null && p.precision !== 'none')
const fails = [], checks = []; const ok = (c, m) => { checks.push([!!c, m]); if (!c) fails.push(m) }
const LOC = { gariahat: [22.518, 88.368, 'South'], santoshpur: [22.4925, 88.3866, 'South'], behala: [22.498, 88.311, 'South'], saltlake: [22.5832, 88.4127, 'Salt Lake'], shyambazar: [22.6013, 88.3725, 'North'] }
const VPS = [[390, 844], [430, 932]]
const LIVE_STATUS = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/live/status.json'), 'utf8'))
;(async () => {
  for (const bn of ['webkit', 'chromium']) { const b = await pw[bn].launch(bn === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {})
    for (const [W, H] of VPS) { const T = s => `${bn} ${W}: ${s}`
      const mk = async (geo, o = {}) => { const c = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: bn === 'chromium', serviceWorkers: 'block', ...(geo ? { geolocation: { latitude: geo[0], longitude: geo[1], accuracy: 15 }, permissions: ['geolocation'] } : {}), ...o }); const p = await c.newPage(); p.on('pageerror', e => fails.push(T('pageerror ' + e.message))); return [c, p] }
      const enter = async p => { await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1800) }
      const zoneTap = async (p, z) => { await p.locator('[role=tab]', { hasText: z }).last().tap(); await p.waitForTimeout(600) }
      const cards = p => p.locator('[data-card]')
      const pageOk = async (p, z, tag) => {
        const zones = await cards(p).evaluateAll(e => e.map(x => x.dataset.zone)); const want = { North: 'north', Central: 'central', South: 'south', 'Salt Lake': 'saltlake' }[z]
        ok(zones.length > 0 && zones.every(x => x === want), T(`${tag} ${z}: card outside zone (${[...new Set(zones)]})`))
        const names = await cards(p).evaluateAll(e => e.map(x => x.querySelector('h2, .line-clamp-2')?.textContent)); ok(new Set(names).size === names.length, T(`${tag} ${z}: duplicate card`))
        ok(await p.locator('[data-card][data-approx] [aria-label*="by car"]').count() === 0, T(`${tag} ${z}: approximate pin shows a time`))
        ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), T(`${tag} ${z}: horizontal overflow`)) }
      // Locations × zones
      for (const [k, [la, ln, own]] of Object.entries(LOC)) { const [c, p] = await mk([la, ln]); await p.goto(url, { waitUntil: 'networkidle' }); ok(await p.evaluate(() => scrollY) === 0 && await p.locator('main.landing').count() === 1, T(`${k}: does not open on hero`)); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1800)
        ok((await p.locator('.dock [aria-selected=true]').innerText()).includes(own), T(`${k}: own zone ${own} not selected`)); ok((await p.locator('.dock [role=tab]').first().innerText()).includes(own), T(`${k}: own zone not first`))
        const uber = await p.locator('article.go a.btn-uber').getAttribute('href'); ok(uber.includes(`pickup%5Blatitude%5D=${la.toFixed(6)}`), T(`${k}: go-next Uber pickup not my position`))
        for (const z of ['North', 'Central', 'South', 'Salt Lake']) { await zoneTap(p, z); await pageOk(p, z, k) }
        if (W === 390) await p.screenshot({ path: `${out}/${bn}-${k}.png` }); await c.close() }
      // Denied, timeout, far
      { const [c, p] = await mk(null); await enter(p); ok(await p.locator('[role=dialog][aria-label="Turn on location"]').count() === 1, T('denied: no location sheet')); await p.getByText('Not now').tap(); await p.waitForTimeout(400)
        await zoneTap(p, 'South'); ok(await cards(p).count() > 5, T('denied: South empty')); ok(await p.locator('[data-card] [aria-label*="by car"]').count() === 0, T('denied: shows times without a fix')); await pageOk(p, 'South', 'denied'); await c.close() }
      { const [c, p] = await mk(null); await p.addInitScript(() => { const fail = (s, e) => setTimeout(() => e && e({ code: 3, message: 'timeout' }), 1500); navigator.geolocation.getCurrentPosition = fail; navigator.geolocation.watchPosition = (s, e) => (fail(s, e), 1) })
        await p.goto(url, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(3500)
        ok(await p.locator('[role=dialog]').count() + await cards(p).count() + await p.locator('[role=status]').count() > 0 && await p.locator('[role=tab]', { hasText: 'South' }).count() > 0, T('timeout: no message or zone picker')); await zoneTap(p, 'South'); ok(await cards(p).count() > 5, T('timeout: cannot pick a zone')); await c.close() }
      { const [c, p] = await mk([28.61, 77.21]); await enter(p); ok(await p.getByText('Too far from Kolkata.').count() === 1, T('far: no Too far state')); ok(await p.locator('.dock [aria-selected=true]').count() === 0, T('far: a zone looks selected'))
        await p.getByRole('button', { name: 'Show Central Kolkata' }).tap(); await p.waitForTimeout(600); await pageOk(p, 'Central', 'far'); await c.close() }
      // Filters: none / open / pass / both / empty
      { const [c, p] = await mk(LOC.gariahat); await enter(p); const all = await cards(p).count()
        const chip = n => p.locator('[aria-label=Filter] button', { hasText: n })
        for (const combo of [['Open'], ['Pass'], ['Open', 'Pass']]) { for (const n of combo) await chip(n).tap(); await p.waitForTimeout(400)
          const t = await cards(p).allInnerTexts(); ok(t.length > 0 && t.length <= all, T(`filter ${combo}: ${t.length} cards`))
          if (combo.includes('Open')) ok(t.every(x => /\b(Open|Inaugurated)\b/.test(x)), T(`filter ${combo}: non-open card`)); if (combo.includes('Pass')) ok(t.every(x => /Pass|Pujor Passport/.test(x)), T(`filter ${combo}: non-pass card`))
          const route = await p.locator('.rail-end a').getAttribute('href').catch(() => null); if (route) { const ids = await cards(p).count(); ok(ids > 0, T(`filter ${combo}: route without cards`)) }
          for (const n of combo) await chip(n).tap(); await p.waitForTimeout(300) }
        ok(await cards(p).count() === all, T('filters off: not back to all')); await c.close() }
      { const [c, p] = await mk(LOC.gariahat); await p.addInitScript(() => localStorage.setItem('pujo.filters', JSON.stringify({ open: true, pass: true })))
        await p.route('**/live/status.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...LIVE_STATUS, open: {} }) }).catch(() => {}), { times: 99 })
        await enter(p)
        const clear = p.getByRole('button', { name: 'Clear filters' }); ok(await clear.count() === 1, T('empty filters: no Clear filters')); if (await clear.count()) { await clear.tap(); await p.waitForTimeout(400); ok(await cards(p).count() > 5, T('Clear filters does not restore')) } await c.close() }
      // Select and walk: 0, 1, 2, 10, 12 picks across zones incl. closed + approximate
      { const pinned = P.filter(p => p.precision !== 'station' && !LIVE_STATUS.open[p.id]?.kind?.includes('closed'))
        const zoneOfP = p => (p.lng >= 88.40 && p.lat >= 22.555 && p.lat < 22.605 ? 'saltlake' : p.lat >= 22.58 ? 'north' : p.lat >= 22.54 ? 'central' : 'south')
        const pick = n => { const byZ = ['south', 'central', 'north', 'saltlake'].map(z => pinned.filter(p => zoneOfP(p) === z)); const o = []; for (let i = 0; o.length < n; i++) { const l = byZ[i % 4]; const x = l[Math.floor(i / 4)]; if (x) o.push(x.id); if (i > 400) break } return o }
        for (const n of [0, 1, 2, 10, 12]) { const ids = pick(n).concat(n >= 10 ? ['mudiali', '25-pally-khidirpur'] : [])
          const [c, p] = await mk(LOC.gariahat); await p.addInitScript(v => localStorage.setItem('pujo.picked', v), JSON.stringify(ids)); await enter(p)
          const pill = p.locator('.walk-pill'); ok((await pill.count() === 1) === (ids.length >= 2), T(`walk ${n}: pill shown=${await pill.count()} for ${ids.length} picks`))
          if (ids.length >= 2) { ok((await pill.innerText()).includes(String(ids.length)), T(`walk ${n}: pill count`)); await pill.tap(); await p.waitForTimeout(500); const d = p.locator('[role=dialog][aria-label=Walk]')
            const rows = await d.locator('ol li').count(), walkable = ids.filter(id => id !== 'mudiali' && id !== '25-pally-khidirpur').length; ok(rows === walkable, T(`walk ${n}: ${rows} stops, want ${walkable}`))
            const hrefs = await d.locator('a[href*="google.com/maps/dir"]').evaluateAll(a => a.map(x => x.href)); const legs = hrefs.map(h => new URL(h).searchParams)
            ok(legs.length === Math.ceil(walkable / 10), T(`walk ${n}: ${legs.length} legs`)); ok(legs[0].get('origin') === `${LOC.gariahat[0].toFixed(6)},${LOC.gariahat[1].toFixed(6)}`, T(`walk ${n}: not from me`))
            for (let i = 0; i < legs.length; i++) { ok(legs[i].get('travelmode') === 'walking' && (legs[i].get('waypoints')?.split('|').length ?? 0) <= 9, T(`walk ${n}: leg ${i} invalid`)); if (i) ok(legs[i].get('origin') === legs[i - 1].get('destination'), T(`walk ${n}: legs not chained`)) }
            const stops = legs.flatMap(q => [...(q.get('waypoints')?.split('|') ?? []), q.get('destination')]); ok(stops.length === walkable && new Set(stops).size === walkable, T(`walk ${n}: URL stops ${stops.length}`))
            if (n >= 10) { const left = await d.innerText(); ok(/Mudiali \(closed\)/.test(left) && /no exact location/.test(left), T(`walk ${n}: closed/approx not called out`)) }
            if (n === 12 && W === 390) await p.screenshot({ path: `${out}/${bn}-walk12.png` })
            const bx = await d.boundingBox(); await p.mouse.move(bx.x + 100, bx.y + 15); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(bx.x + 100, bx.y + 15 + i * 25); await p.mouse.up(); await p.waitForTimeout(500); ok(await d.count() === 0, T(`walk ${n}: swipe does not dismiss`)) }
          await c.close() } }
      // Sheet: open from card, Uber/Maps, swipe; Food / Toilets / Help; alerts; deep link; offline; reduced motion; tap-through
      { const [c, p] = await mk(LOC.gariahat, { reducedMotion: 'reduce' }); await p.route('**/live/x.json*', async r => { const j = await (await r.fetch()).json(); const id = P.find(q => q.id === 'singhi-park') ? 'singhi-park' : P[0].id; j.crowd = { [id]: { label: 'Crowded', url: 'https://x.com/i/status/1', at: new Date().toISOString() } }; r.fulfill({ contentType: 'application/json', body: JSON.stringify(j) }) })
        await enter(p); await p.locator('.rail [data-card] [aria-haspopup=dialog]').first().tap(); await p.waitForTimeout(500); const d = p.locator('[role=dialog]').first()
        const hs = await d.locator('a[href]').evaluateAll(a => a.map(x => x.href)); ok(hs.some(h => h.startsWith('https://m.uber.com/ul/') && h.includes(`pickup%5Blatitude%5D=${LOC.gariahat[0].toFixed(6)}`)), T('sheet: Uber not from me')); ok(hs.some(h => /google\.com\/maps/.test(h)), T('sheet: no Maps link'))
        const bx = await d.boundingBox(); await p.mouse.move(bx.x + 100, bx.y + 15); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(bx.x + 100, bx.y + 15 + i * 25); await p.mouse.up(); await p.waitForTimeout(500); ok(await p.locator('[role=dialog]').count() === 0, T('sheet: swipe does not dismiss'))
        for (const t of ['Food', 'Toilets', 'Help']) { await p.getByRole('button', { name: t, exact: true }).tap(); await p.waitForTimeout(400); const s = p.locator(`[role=dialog][aria-label=${t}]`); ok(await s.count() === 1, T(`${t}: sheet does not open`))
          if (t === 'Help') ok(await s.locator('a[href="tel:112"]').count() === 1, T('Help: no 112')); await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok(await p.locator('[role=dialog]').count() === 0, T(`${t}: does not close`)) }
        ok(await p.locator('.now-strip').count() === 1, T('alerts: crowd alert not shown')); ok(await p.evaluate(() => getComputedStyle(document.querySelector('.rail-item')).transitionDuration).then(v => !/[1-9]/.test(v)), T('reduced motion: rail still animates'))
        // tap-through: every visible non-navigating button on the zone page
        const n = await p.locator('main button:visible, .dock button:visible').count(); for (let i = 0; i < n; i++) { const btn = p.locator('main button:visible, .dock button:visible').nth(i); if (!(await btn.count())) continue; await btn.tap({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(150); await p.keyboard.press('Escape'); await p.waitForTimeout(150) }
        ok(await p.locator('.dock [role=tablist]').count() === 1, T('tap-through: app broke'))
        await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pujo.') && k !== 'pujo.seen').forEach(k => localStorage.removeItem(k))); await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500); if (await p.getByRole('button', { name: 'Near me' }).count()) { await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(1500) }
        await c.setOffline(true); await zoneTap(p, 'Central'); ok(await cards(p).count() > 3, T('offline: zone switch fails')); await c.setOffline(false); await c.close() }
      { const [c, p] = await mk(LOC.gariahat); await p.goto(url + '#stop-3', { waitUntil: 'networkidle' }); await p.waitForTimeout(500); ok(await p.evaluate(() => scrollY) === 0 && await p.locator('main.landing').count() === 1, T('deep link does not land on hero')); await c.close() }
    }
    await b.close() }
  for (const [g, m] of checks) if (!g) console.log('FAIL', m)
  console.log(`MATRIX ${fails.length ? 'FAIL' : 'PASS'} ${checks.length - fails.length}/${checks.length}`); process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('MATRIX ERROR', e.stack); process.exit(1) })
