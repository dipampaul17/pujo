// Offline-ish: cache-first for the app shell and hashed assets, network-first for the live feed.
const C = 'pujo-v5'
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll([new Request('./', { cache: 'no-cache' })]))) })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return
  if (u.pathname.includes('/live/') || u.pathname.includes('/data/') || e.request.mode === 'navigate') {  // data/roads.json is not content-hashed
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)) } return r }).catch(() => caches.match(e.request).then(r => r || caches.match('./'))))
    return
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)) } return res })))
})
