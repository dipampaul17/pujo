const pw = require('playwright-core')
;(async () => {
  const url = process.argv[2]; let fail = 0
  for (const name of ['chromium', 'webkit']) {
    const b = await pw[name].launch(name === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] } : {})
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
    await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
    const visibleOnLanding = await p.locator('[role=tab]', { hasText: 'North' }).first().isVisible()
    const lists = {}
    for (const z of ['North', 'Central', 'South']) {
      await p.locator('[role=tab]', { hasText: z }).first().click(); await p.waitForTimeout(350)
      lists[z] = (await p.locator('ol > li a.block').allInnerTexts()).join('|')
      if (z === 'Central') await p.screenshot({ path: '/workspace/dhaak-zones.png' })
    }
    await p.mouse.wheel(0, 900); await p.waitForTimeout(300)
    const stickyVisible = (await p.locator('[role=tablist]').first().boundingBox()).y < 80
    // swipe: South -> Central
    const box = await p.locator('ol').boundingBox()
    await p.touchscreen.tap(10, 10).catch(() => {})
    await p.dispatchEvent('main', 'touchstart', { touches: [{ identifier: 1, clientX: 100, clientY: box.y + 50 }], changedTouches: [{ identifier: 1, clientX: 100, clientY: box.y + 50 }] }).catch(e => errs.push('ts ' + e.message))
    await p.dispatchEvent('main', 'touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 300, clientY: box.y + 55 }] }).catch(e => errs.push('te ' + e.message))
    await p.waitForTimeout(300)
    const afterSwipe = (await p.locator('[role=tab][aria-selected=true]').first().innerText()).split('\n')[0]
    const distinct = new Set(Object.values(lists)).size === 3 && Object.values(lists).every(Boolean)
    const ok = visibleOnLanding && distinct && stickyVisible && afterSwipe === 'Central'
    if (!ok) fail = 1
    console.log(name, { visibleOnLanding, distinct, stickyVisible, afterSwipe, firstStops: Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.split('|')[0]])), errs })
    await b.close()
  }
  process.exit(fail)
})()
