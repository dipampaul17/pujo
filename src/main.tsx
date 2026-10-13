import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import './index.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => {
  const had = !!navigator.serviceWorker.controller
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' }).then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}) })
  }).catch(() => {})
  // A new deploy's worker takes over (skipWaiting + clients.claim): reload once so the new JS runs now, not next launch.
  let done = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !done) { done = true; location.reload() } })
})
