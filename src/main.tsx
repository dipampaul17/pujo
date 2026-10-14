import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import './index.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => {
  const had = !!navigator.serviceWorker.controller
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' }).then(reg => {
    // iOS resumes a home-screen app without navigating: on return, compare the live index's bundle with ours and reload if a deploy landed.
    const mine = (document.querySelector('script[type=module][src]') as HTMLScriptElement | null)?.src
    const check = () => fetch(import.meta.env.BASE_URL + '?fresh=' + Date.now(), { cache: 'no-store' }).then(r => r.text()).then(h => {
      const m = h.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/); if (m && mine && new URL(m[1], location.href).href !== mine) location.reload()
    }).catch(() => {})
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { reg.update().catch(() => {}); check() } })
    window.addEventListener('pageshow', e => { if ((e as PageTransitionEvent).persisted) check() })
  }).catch(() => {})
  // A new deploy's worker takes over (skipWaiting + clients.claim): reload once so the new JS runs now, not next launch.
  let done = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload() } })
})
