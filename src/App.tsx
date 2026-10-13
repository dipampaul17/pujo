import { useEffect, useMemo, useState } from 'react'
import raw from './data/dhaak.v1.json'
import { makePlanner, areas as getAreas, nudges, type Dataset, type Plan, type Amenity } from './lib/plan'
import { mapsDirUrl, mapsPlaceUrl, fmtDist, walkMinutes, haversine as hav, type LatLng } from './lib/geo'
import { TextReveal } from './components/text-reveal'
import { AnimatedCounter } from './components/ui/animated-counter'
import { GooeyNav } from './components/ui/gooey-nav'

const data = raw as unknown as Dataset
const P = makePlanner(data)
const AREAS = getAreas(data)
type Feed = { updated: string; via: string; items: { title: string; link: string; source: string; published: string; pandals: string[] }[] }
type Origin = LatLng & { label: string; precise: boolean }

const ist = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ' IST'
const istHour = (t = Date.now()) => +new Date(t).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }) % 24

const Arrow = () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const Pin = () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="var(--bg)"/></svg>

export default function App() {
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [status, setStatus] = useState<'idle' | 'locating' | 'denied' | 'error'>('idle')
  const [picking, setPicking] = useState(false)
  const [tab, setTab] = useState(0)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [feed, setFeed] = useState<Feed | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [beat, setBeat] = useState(0)

  const [now, setNow] = useState(Date.now())
  const [fixAt, setFixAt] = useState<number | null>(null)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => {
    let alive = true
    const load = () => fetch(import.meta.env.BASE_URL + 'live/awards.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then((f: Feed | null) => {
      if (!f || !alive) return
      setFeed(prev => {
        if (prev && f.items[0] && f.items[0].published > (prev.items[0]?.published ?? '')) setToast('New award story just came in')
        return f
      })
      const seen = localStorage.getItem('dhaak.feed') ?? ''
      const fresh = f.items.filter(i => i.published > seen)
      if (seen && fresh.length) setToast(`${fresh.length} new award ${fresh.length > 1 ? 'stories' : 'story'} since your last visit`)
      if (f.items[0]) localStorage.setItem('dhaak.feed', f.items[0].published)
    }).catch(() => {})
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 4 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  // Re-rank as the person walks: only after a real move (>150 m), at most every 20 s.
  useEffect(() => {
    if (!origin?.precise || !('geolocation' in navigator)) return
    let last = 0
    const id = navigator.geolocation.watchPosition(p => {
      const next = { lat: p.coords.latitude, lng: p.coords.longitude }
      if (Date.now() - last < 20000) return
      setOrigin(o => {
        if (!o || !o.precise || hav(o, next) < 150) return o
        last = Date.now(); setFixAt(Date.now()); return { ...next, label: 'You', precise: true }
      })
    }, () => {}, { enableHighAccuracy: true, maximumAge: 30000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [origin?.precise])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t) } }, [toast])

  const plan: Plan | null = useMemo(() => (origin ? P.plan(origin, 8 + skip.size) : null), [origin, skip.size])
  const stops = useMemo(() => (plan ? plan.stops.filter(s => !skip.has(s.id)).slice(0, 8) : []), [plan, skip])
  const awardFor = useMemo(() => {
    const m = new Map<string, Feed['items'][number]>(); feed?.items.forEach(i => i.pandals.forEach(id => m.has(id) || m.set(id, i))); return m
  }, [feed])

  function locate() {
    setBeat(b => b + 1)
    if (!('geolocation' in navigator)) { setStatus('error'); setPicking(true); return }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      p => { setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'You', precise: true }); setFixAt(Date.now()); setStatus('idle'); setSkip(new Set()); setTab(0) },
      e => { setStatus(e.code === 1 ? 'denied' : 'error'); setPicking(true) },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 })
  }
  const pick = (a: (typeof AREAS)[number]) => { setOrigin({ lat: a.lat, lng: a.lng, label: `${a.name} metro`, precise: false }); setPicking(false); setSkip(new Set()); setTab(0); window.scrollTo({ top: 0 }) }

  const routeUrl = origin && stops.length ? mapsDirUrl(origin, stops) : null
  const hereish: LatLng | null = stops[0] ?? origin
  const help = hereish ? {
    food: P.around('food', hereish, 6).sort((a, b) => Number(!!b.notable) - Number(!!a.notable) || a.dist - b.dist),
    toilets: P.around('toilets', hereish, 5, 2000),
    medical: [...P.around('medical', hereish, 3, 2500), ...P.around('police', hereish, 2, 2500)].sort((a, b) => a.dist - b.dist),
    station: P.nearestStation(hereish),
  } : null
  const tips = plan && help ? nudges(istHour(now), { walkMin: plan.walkMin, station: help.station?.name, stationM: help.station?.dist }) : []

  async function share() {
    if (!routeUrl) return
    const text = `Pujo walk: ${stops.map(s => s.name).join(' → ')}`
    try { if (navigator.share) await navigator.share({ title: 'Dhaak route', text, url: routeUrl }); else { await navigator.clipboard.writeText(`${text}\n${routeUrl}`); setToast('Route link copied') } } catch { /* user cancelled */ }
  }

  return (
    <div className="mx-auto max-w-[560px] min-h-[100dvh] flex flex-col px-5">
      {(origin || picking) && <><header className="flex items-center justify-between pt-5 pb-3">
        <button onClick={() => { setOrigin(null); setPicking(false) }} className="flex items-baseline gap-2" aria-label="Dhaak home">
          <span className="serif text-[28px]" style={{ color: 'var(--sindoor)' }}>Dhaak</span>
        </button>
        <span className="text-[13px] muted">Kolkata Pujo 2026</span>
      </header>
      <div className="alpana" aria-hidden="true" /></>}

      {!origin && !picking && (
        <main className="flex-1 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Alpana />
            <TextReveal as="h1" text="Dhaak" split="char" className="serif text-[88px] -mt-4" blur={6} stagger={0.06} />
            <p className="serif italic text-[24px] muted rise" style={{ ['--i' as any]: 5 }}>Pujo, nearby.</p>
          </div>
          <div className="safe-b pb-2">
            <button className={`btn btn-primary w-full ${beat ? 'beat' : ''}`} key={beat} onClick={locate} disabled={status === 'locating'}>
              <Pin />{status === 'locating' ? 'Finding you…' : 'Near me'}
            </button>
            <button className="btn w-full mt-1 muted" style={{ minHeight: 48, fontWeight: 500 }} onClick={() => setPicking(true)}>Pick a station</button>
          </div>
        </main>
      )}

      {picking && (
        <main className="flex-1 pt-6 pb-10">
          {status === 'denied' && <Notice tone="gold">Location is off. Pick a station.</Notice>}
          {status === 'error' && <Notice tone="gold">No location fix. Pick a station.</Notice>}
          <h2 className="serif text-[34px] mt-4">Where are you?</h2>
          <ul className="mt-5 border-t hair">
            {AREAS.map((a, i) => (
              <li key={a.name} className="rise" style={{ ['--i' as any]: Math.min(i, 12) }}>
                <button onClick={() => pick(a)} className="w-full flex items-center justify-between py-4 border-b hair text-left">
                  <span className="text-[17px] font-medium">{a.name}</span>
                  <span className="muted text-[14px] mono-num">{a.count} pandal{a.count > 1 ? 's' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost w-full mt-6" onClick={() => { setPicking(false); setStatus('idle') }}>Back</button>
        </main>
      )}

      {origin && plan && !picking && (
        <main className="flex-1 pt-5 pb-40">
          {plan.outOfRange ? (
            <div className="pt-8">
              <h2 className="serif text-[34px]">Too far from Kolkata.</h2>
              <p className="muted mt-2">Nearest pandal: {Math.round(plan.nearestKm)} km.</p>
              <button className="btn btn-primary w-full mt-8" onClick={() => setPicking(true)}>Pick a station <Arrow /></button>
            </div>
          ) : (<>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[13px] muted uppercase tracking-[.06em] font-semibold">From {origin.label}{origin.precise && fixAt ? <span className="normal-case tracking-normal font-normal"> · located {ago(now - fixAt)}</span> : null}</p>
                <h2 className="serif text-[40px] mt-1 flex items-baseline gap-2">
                  <AnimatedCounter value={stops.length} /> <span>stops</span>
                </h2>
                <p className="muted text-[15px] mono-num">{walkMinutes(pathOf(origin, stops))} min on foot · {fmtDist(pathOf(origin, stops))} </p>
              </div>
              <button onClick={() => setPicking(true)} className="text-[15px] underline underline-offset-4 muted min-h-[44px] px-2 -mr-2">Change</button>
            </div>

            {tips.map(t => <Notice key={t} tone="gold">{t}</Notice>)}

            <div className="mt-5">
              <GooeyNav items={['Route', 'Food', 'Toilets', 'Help']} value={tab} onChange={setTab} size="md" activeColor="var(--ink)" activeLabelColor="var(--bg)" aria-label="Sections" className="block w-full" />
            </div>

            {tab === 0 && (
              <ol className="mt-4 space-y-2">
                {stops.map((s, i) => {
                  const award = awardFor.get(s.id)
                  return (
                    <li key={s.id} className={`card p-4 rise ${i === 0 ? 'diya' : ''}`} style={{ ['--i' as any]: i }}>
                      <div className="flex gap-3">
                        <span className="serif text-[24px] w-7 shrink-0 leading-[1.1] mono-num" style={{ color: i === 0 ? 'var(--gold)' : 'var(--muted)' }} aria-label={`Stop ${i + 1}`}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <a href={mapsPlaceUrl(s, s.name + ' Durga Puja')} target="_blank" rel="noopener" className="block text-[18px] font-semibold leading-snug">{s.name}</a>
                          <p className="text-[14px] muted mt-0.5 mono-num">
                            {s.precision === 'station' ? 'Approximate' : i === 0 ? `${fmtDist(s.dist)} from you` : `${fmtDist(hop(stops, i))} from last`}{s.station && <span className="block">{s.station} metro</span>}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {i === 0 && <span className="tag tag-gold">Next</span>}
                            {s.circuits[0] && <span className="tag tag-leaf">{s.circuits[0].replace(/ Circuit$/, '')}</span>}
                            
                            {award && <a href={award.link} target="_blank" rel="noopener" className="tag tag-red">In award news</a>}
                          </div>
                          {s.note && <p className="text-[14px] mt-2" style={{ color: 'var(--sindoor)' }}>{s.note}.</p>}
                        </div>
                        <button onClick={() => setSkip(new Set(skip).add(s.id))} className="self-start text-[14px] muted min-h-[44px] min-w-[44px] px-2 -mr-3 -mt-2" aria-label={`Skip ${s.name}`}>Skip</button>
                      </div>
                    </li>
                  )
                })}
                {skip.size > 0 && <button className="text-[14px] muted underline underline-offset-4 mt-2" onClick={() => setSkip(new Set())}>Restore {skip.size} skipped</button>}
              </ol>
            )}
            {tab === 1 && help && <AmenityList items={help.food} empty="Nothing mapped nearby." meta={f => [f.notable ? 'Kolkata classic' : null, f.cuisine && f.cuisine[0].toUpperCase() + f.cuisine.slice(1)].filter(Boolean).join(' · ')} />}
            {tab === 2 && help && help.toilets.length > 0 && help.toilets.length < 3 && <p className="mt-4 text-[14px] muted">Few mapped here. Ask a pandal volunteer.</p>}
            {tab === 2 && help && <AmenityList items={help.toilets} empty="None mapped nearby. Ask a pandal volunteer." meta={t => [t.fee === 'yes' ? 'Paid' : t.fee === 'no' ? 'Free' : null].filter(Boolean).join('')} />}
            {tab === 3 && help && (
              <div className="mt-4 space-y-3">
                <div className="card p-4"><div className="flex gap-2"><a className="btn btn-primary flex-1" href="tel:112">Call 112</a><a className="btn btn-ghost flex-1" href="tel:100">Police 100</a></div></div>
                {help.station && <AmenityList items={[{ ...help.station, id: 'st', name: `${help.station.name} metro`, dist: help.station.dist }] as any} empty="" meta={() => 'Metro'} />}
                <AmenityList items={help.medical} empty="Nothing mapped nearby." meta={m => (m.kind === 'police' ? 'Police' : 'Medical')} />
              </div>
            )}

            {feed && feed.items.length > 0 && tab === 0 && (
              <section className="mt-10">
                <h3 className="serif text-[26px]">Award news</h3>
                <p className="text-[12.5px] muted">Updated {ago(now - Date.parse(feed.updated))}</p>
                <ul className="mt-3 border-t hair">
                  {feed.items.slice(0, 4).map(i => (
                    <li key={i.link} className="border-b hair py-3"><a href={i.link} target="_blank" rel="noopener" className="block text-[15px] leading-snug">{i.title.replace(/ - [^-]+$/, '')}</a><span className="text-[12.5px] muted">{i.source} · {ist(i.published)}</span></li>
                  ))}
                </ul>
              </section>
            )}
          </>)}
        </main>
      )}

      {origin && plan && !plan.outOfRange && !picking && routeUrl && (
        <div className="fixed inset-x-0 bottom-0 z-20 safe-b px-5 pt-3" style={{ background: 'linear-gradient(transparent, var(--bg) 28%)' }}>
          <div className="mx-auto max-w-[560px] flex gap-2">
            <a href={routeUrl} target="_blank" rel="noopener" className="btn btn-primary flex-1">Start walk in Maps <Arrow /></a>
            <button onClick={share} className="btn btn-ghost px-4" aria-label="Share route">Share</button>
          </div>
        </div>
      )}

      <details className={`text-[12px] muted ${origin && !picking ? 'pb-32' : 'pb-4'}`}>
        <summary className="cursor-pointer list-none inline-flex items-center gap-1 min-h-[44px]" aria-label="Sources"><Info /> Sources</summary>
        <p className="pb-4">{data.source.guide}. Places © OpenStreetMap contributors, {data.source.fetched}. “Approximate” stops use the metro station. Data v{data.version} · {data.hash}</p>
      </details>

      {toast && <div role="status" className="fixed left-1/2 -translate-x-1/2 top-4 z-30 card px-4 py-2 text-[14px] rise">{toast}</div>}
    </div>
  )
}

function Alpana() {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30)
  return (
    <svg width="200" height="200" viewBox="-100 -100 200 200" aria-hidden="true" className="rise alpana-spin" style={{ color: 'var(--sindoor)' }}>
      <circle r="92" fill="none" stroke="currentColor" strokeWidth="1" opacity=".35" strokeDasharray="1 6" strokeLinecap="round" />
      <circle r="70" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      {petals.map(d => <path key={d} transform={`rotate(${d})`} d="M0 -68 C 12 -52, 12 -36, 0 -26 C -12 -36, -12 -52, 0 -68 Z" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".7" />)}
      {petals.map(d => <circle key={'d' + d} transform={`rotate(${d + 15})`} cy="-80" r="2.2" fill="var(--gold)" />)}
      <circle r="18" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
      <circle r="6" fill="currentColor" />
    </svg>
  )
}
const Info = () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 11v6M12 7.5v.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
function ago(ms: number) { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }
function pathOf(o: LatLng, s: LatLng[]) { let m = 0, c = o; for (const x of s) { m += hav(c, x); c = x } return m }
function hop(s: LatLng[], i: number) { return hav(s[i - 1], s[i]) }

function Notice({ children, tone }: { children: React.ReactNode; tone: 'gold' }) {
  return <p className={`mt-4 text-[14.5px] rounded-[12px] px-4 py-3 tag-${tone}`} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{children}</p>
}
function AmenityList({ items, empty, meta }: { items: Array<Amenity & { dist: number }>; empty: string; meta: (a: Amenity) => string }) {
  if (!items.length) return <p className="mt-6 muted text-[15px]">{empty}</p>
  return (
    <ul className="mt-4 border-t hair">
      {items.map((a, i) => (
        <li key={a.id} className="rise" style={{ ['--i' as any]: i }}>
          <a href={mapsPlaceUrl(a)} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 py-4 border-b hair">
            <span className="min-w-0"><span className="block text-[17px] font-medium truncate">{a.name}</span>{meta(a) && <span className="block text-[13.5px] muted truncate">{meta(a)}</span>}</span>
            <span className="text-[14px] muted mono-num shrink-0">{fmtDist(a.dist)} · {walkMinutes(a.dist)} min</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
