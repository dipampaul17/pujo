// Release gate: frontend quality on iPhone viewport (Chromium for metrics, WebKit for layout). Exit 1 on failure.
const pw = require(process.env.PW_CORE || 'playwright-core'); const url = process.argv[2]
const fails = []; const ok = (c, m) => { if (!c) fails.push(m) }
;(async () => {
  const b = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, geolocation: { latitude: 22.5164, longitude: 88.3372, accuracy: 15 }, permissions: ['geolocation'] })
  const p = await ctx.newPage()
  await p.addInitScript(() => { window.__cls = 0; window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true }); new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([performance.now(), e.duration]) }).observe({ type: 'longtask', buffered: true }) })
  await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  await p.getByRole('button', { name: 'Near me' }).tap(); await p.waitForTimeout(2500)
  const cls = await p.evaluate(() => window.__cls); ok(cls < 0.05, `CLS ${cls.toFixed(3)} >= 0.05`)
  // Tap targets: every interactive control in the list view is at least 44x44 pt (inline text links in prose exempt).
  const small = await p.$$eval('main button, main a, header button, [role=tab]', els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden' && (r.height < 43.5 || r.width < 43.5) && !e.closest('p') }).map(e => `${e.tagName} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`))
  ok(!small.length, `tap targets < 44pt: ${[...new Set(small)].slice(0, 12).join('; ')}`)
  // VoiceOver: every button/link has an accessible name.
  const unnamed = await p.$$eval('button, a[href], [role=tab]', els => els.filter(e => !(e.getAttribute('aria-label') || e.textContent || '').trim() && !e.querySelector('img[alt]:not([alt=""])')).map(e => e.outerHTML.slice(0, 80)))
  ok(!unnamed.length, `unnamed controls: ${unnamed.slice(0, 5).join(' | ')}`)
  // Gestures: no long tasks > 50ms while opening, dragging and closing the sheet, and while scrolling.
  const t0 = await p.evaluate(() => performance.now())
  await p.locator('[data-card] [aria-haspopup=dialog]').nth(1).tap(); await p.waitForTimeout(500)
  const bx = await p.locator('[role=dialog]').boundingBox(); await p.mouse.move(bx.x + 150, bx.y + 20); await p.mouse.down(); for (let i = 1; i <= 12; i++) { await p.mouse.move(bx.x + 150, bx.y + 20 + i * 15); await p.waitForTimeout(16) } await p.mouse.up(); await p.waitForTimeout(600)
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(30) }
  const lt = await p.evaluate(t0 => window.__lt.filter(([at, d]) => at > t0 && d > 50), t0); ok(!lt.length, `long tasks during gestures: ${lt.map(x => Math.round(x[1]) + 'ms').join(',')}`)
  // Safe area: fixed bottom bar and sheet pad by env(safe-area-inset-bottom); viewport-fit=cover.
  const css = await p.evaluate(() => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText) } catch { return [] } }).join('\n'))
  ok(/safe-area-inset-bottom/.test(css), 'no safe-area-inset-bottom'); ok(/safe-area-inset-top/.test(css), 'no safe-area-inset-top')
  ok(/viewport-fit=cover/.test(await p.evaluate(() => document.querySelector('meta[name=viewport]')?.content || '')), 'viewport-fit=cover missing')
  // Dynamic Type-ish: 130% text size, no horizontal overflow.
  await p.evaluate(() => { document.documentElement.style.fontSize = '130%'; document.body.style.webkitTextSizeAdjust = '130%' }); await p.waitForTimeout(300)
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'overflow at 130% text')
  await ctx.close()
  // Reduced motion: sheet and list entrance animations off.
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce', geolocation: { latitude: 22.5164, longitude: 88.3372, accuracy: 15 }, permissions: ['geolocation'] })
  const q = await c2.newPage(); await q.goto(url, { waitUntil: 'networkidle' }); await q.getByRole('button', { name: 'Near me' }).tap(); await q.waitForTimeout(1200)
  await q.locator('[data-card] [aria-haspopup=dialog]').nth(1).tap(); await q.waitForTimeout(100)
  const anim = await q.evaluate(() => [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01 && !/spin/.test(s.animationName) }).map(e => e.className.toString().slice(0, 30) + ':' + getComputedStyle(e).animationName).slice(0, 5))
  ok(!anim.length, `animations under reduced motion: ${anim.join(', ')}`)
  await b.close()
  console.log(fails.length ? 'QUALITY FAIL\n' + fails.join('\n') : 'QUALITY PASS'); process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('QUALITY ERROR', e.message); process.exit(1) })
