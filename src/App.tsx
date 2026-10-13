import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { reduce, initial, onLoadAction, needsChip, shouldUpdate, platform, APPROX_M, CACHE_MAX_AGE, type Fix } from './lib/loc'
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
type Origin = LatLng & { label: string; precise: boolean; approx?: boolean; fix?: Fix }
const geoOk = typeof navigator !== 'undefined' && 'geolocation' in navigator
const saveFix = (f: Fix) => { try { localStorage.setItem('dhaak.fix', JSON.stringify(f)) } catch {} }
const loadFix = (): Fix | null => { try { return JSON.parse(localStorage.getItem('dhaak.fix') || 'null') } catch { return null } }

const ist = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ' IST'
const istHour = (t = Date.now()) => +new Date(t).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }) % 24

const Arrow = () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
const Pin = ({ small }: { small?: boolean }) => <svg width={small ? 14 : 20} height={small ? 14 : 20} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="var(--bg)"/></svg>

export default function App() {
  const [origin, setOrigin] = useState<Origin | null>(null)
  const permRef = useRef<string>('')
  const originRef = useRef<Origin | null>(null)
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
  // Location: permission-aware, self-healing. Pure transitions live in lib/loc.ts.
  const [loc, dispatch] = useReducer(reduce, undefined, () => initial(geoOk ? 'prompt' : 'unsupported'))
  const [sheet, setSheet] = useState(false)
  const apply = (f: Fix, source: 'gps' | 'cache') => {
    setOrigin(o => {
      if (o?.precise && source === 'gps' && !shouldUpdate(o.fix ?? null, f, hav(o, f))) return o
      return { lat: f.lat, lng: f.lng, label: 'You', precise: true, approx: source === 'cache' || f.acc > APPROX_M, fix: f }
    })
    setFixAt(f.at); setPicking(false)
  }
  const locate = useCallback((gesture = false) => {
    if (gesture) setBeat(b => b + 1)
    if (!geoOk) { setSheet(true); return }
    dispatch({ type: 'request' })
    navigator.geolocation.getCurrentPosition(
      p => { const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; dispatch({ type: 'fix', fix: f }); saveFix(f); apply(f, 'gps'); setSkip(new Set()); setTab(0) },
      e => {
        const cached = loadFix(); dispatch({ type: 'error', code: e.code, cached, now: Date.now() })
        if (e.code !== 1 && cached && Date.now() - cached.at < CACHE_MAX_AGE) apply(cached, 'cache')
        else if (gesture) setPicking(true)
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 })
  }, [])
  // Ask on load. If the browser silently ignores a non-gesture request (some iOS builds), the first tap anywhere asks again, once.
  useEffect(() => {
    if (!geoOk) return
    if (!navigator.permissions?.query) locate()
    let armed = true
    const t = setTimeout(() => {
      const onTap = () => { if (armed) { armed = false; if (!originRef.current && permRef.current !== 'denied') locate() } }
      window.addEventListener('pointerdown', onTap, { once: true, capture: true })
    }, 2500)
    return () => { armed = false; clearTimeout(t) }
  }, [locate])
  useEffect(() => {
    if (!geoOk || !navigator.permissions?.query) return
    let ps: PermissionStatus | null = null, alive = true
    const sync = (state: PermissionState) => {
      dispatch({ type: 'perm', perm: state })
      if (onLoadAction(state) === 'locate') locate()
    }
    const recheck = () => navigator.permissions.query({ name: 'geolocation' }).then(s => { if (alive && s.state !== permRef.current) { permRef.current = s.state; sync(s.state) } }).catch(() => {})
    navigator.permissions.query({ name: 'geolocation' }).then(s => {
      if (!alive) return
      ps = s; permRef.current = s.state; sync(s.state)
      s.onchange = () => { permRef.current = s.state; sync(s.state) }
    }).catch(() => {})
    const onVis = () => document.visibilityState === 'visible' && recheck()
    document.addEventListener('visibilitychange', onVis); window.addEventListener('focus', recheck)
    return () => { alive = false; if (ps) ps.onchange = null; document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', recheck) }
  }, [locate])
  // Denied + a remembered station: open that walk instead of an empty screen.
  useEffect(() => {
    if (loc.perm !== 'denied' || origin) return
    const last = localStorage.getItem('dhaak.station'); const a = AREAS.find(x => x.name === last)
    if (a) pick(a)
  }, [loc.perm])
  // Keep refining while walking: replace origin on a >150 m move or a much better accuracy.
  useEffect(() => {
    if (!origin?.precise || !geoOk) return
    const id = navigator.geolocation.watchPosition(p => {
      const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }
      dispatch({ type: 'fix', fix: f }); saveFix(f); apply(f, 'gps')
    }, () => {}, { enableHighAccuracy: true, maximumAge: 20000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [origin?.precise])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t) } }, [toast])

  const plan: Plan | null = useMemo(() => (origin ? P.plan(origin, 8 + skip.size) : null), [origin, skip.size])
  const stops = useMemo(() => (plan ? plan.stops.filter(s => !skip.has(s.id)).slice(0, 8) : []), [plan, skip])
  const awardFor = useMemo(() => {
    const m = new Map<string, Feed['items'][number]>(); feed?.items.forEach(i => i.pandals.forEach(id => m.has(id) || m.set(id, i))); return m
  }, [feed])

  const pick = (a: (typeof AREAS)[number]) => { localStorage.setItem('dhaak.station', a.name); setOrigin({ lat: a.lat, lng: a.lng, label: `${a.name} metro`, precise: false }); setPicking(false); setSkip(new Set()); setTab(0); window.scrollTo({ top: 0 }) }

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

  originRef.current = origin
  const chip = needsChip(loc) ? <button className="chip" onClick={() => setSheet(true)}><Pin small />Turn on location</button> : null

  return (
    <div className="mx-auto max-w-[560px] min-h-[100dvh] flex flex-col px-5">
      {(origin || picking) && <><header className="flex items-center justify-between pt-5 pb-3">
        <button onClick={() => { setOrigin(null); setPicking(false) }} className="flex items-baseline gap-2" aria-label="Dhaak home">
          <span className="serif text-[28px]" style={{ color: 'var(--sindoor)' }}>Dhaak</span>
        </button>
        <span className="flex items-center gap-1">{chip}<ThemeToggle /></span>
      </header>
      <div className="alpana" aria-hidden="true" /></>}

      {!origin && !picking && (
        <main className="flex-1 flex flex-col">
          <div className="flex justify-end gap-1 pt-4">{chip}<ThemeToggle /></div>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Alpana />
            <TextReveal as="h1" text="Dhaak" split="char" className="serif text-[88px] -mt-4" blur={6} stagger={0.06} />
            <p className="serif italic text-[24px] muted rise" style={{ ['--i' as any]: 5 }}>Pujo, nearby.</p>
          </div>
          <div className="safe-b pb-2">
            <button className={`btn btn-primary w-full ${beat ? 'beat' : ''}`} key={beat} onClick={() => locate(true)} disabled={loc.status === 'locating'}>
              <Pin />{loc.status === 'locating' ? 'Finding you…' : 'Near me'}
            </button>
            <button className="btn w-full mt-1 muted" style={{ minHeight: 48, fontWeight: 500 }} onClick={() => setPicking(true)}>Pick a station</button>
          </div>
        </main>
      )}

      {picking && (
        <main className="flex-1 pt-6 pb-10">
          {loc.status === 'error' && loc.perm !== 'denied' && <Notice tone="gold">No location fix. Pick a station.</Notice>}
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
          <button className="btn btn-ghost w-full mt-6" onClick={() => setPicking(false)}>Back</button>
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
                <p className="text-[13px] muted uppercase tracking-[.06em] font-semibold">From {origin.label}{origin.approx ? ' · approximate' : ''}{origin.precise && fixAt ? <span className="normal-case tracking-normal font-normal"> · located {ago(now - fixAt)}</span> : null}</p>
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

      {sheet && <LocationSheet perm={loc.perm} onClose={() => setSheet(false)} onRetry={() => { setSheet(false); locate(true) }} />}
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
function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const flip = () => { const d = !dark; setDark(d); if (d) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme; try { localStorage.setItem('dhaak.theme', d ? 'dark' : 'light') } catch {} }
  return <button onClick={flip} aria-label={dark ? 'Light mode' : 'Dark mode'} className="w-11 h-11 grid place-items-center muted">
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" strokeWidth="2" strokeLinecap="round">{[0,45,90,135,180,225,270,315].map(r => <path key={r} transform={`rotate(${r} 12 12)`} d="M12 2.5v2"/>)}</g></> : <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/>}</svg>
  </button>
}
function LocationSheet({ perm, onClose, onRetry }: { perm: string; onClose: () => void; onRetry: () => void }) {
  const p = platform(navigator.userAgent)
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k) }, [onClose])
  const steps = p === 'ios'
    ? ['Settings › Privacy & Security › Location Services: on', 'Settings › Safari › Location: Ask or Allow', 'Back here, tap Try again']
    : p === 'android'
    ? ['Tap the icon left of the address bar', 'Permissions › Location › Allow', 'Phone location (quick settings): on']
    : ['Click the icon left of the address bar', 'Site settings › Location › Allow']
  return (<>
    <div className="sheet-backdrop" onClick={onClose} />
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Turn on location">
      <div className="mx-auto w-10 h-1 rounded-full mb-5" style={{ background: 'var(--line)' }} />
      <h2 className="serif text-[30px]">Turn on location</h2>
      <ol className="mt-4 space-y-3">{steps.map((s, i) => <li key={s} className="flex gap-3 text-[16px]"><span className="serif text-[20px] w-6 shrink-0" style={{ color: 'var(--gold)' }}>{i + 1}</span><span>{s}</span></li>)}</ol>
      <button className="btn btn-primary w-full mt-6" onClick={onRetry}>{perm === 'denied' ? 'Try again' : 'Allow location'}</button>
      <button className="btn w-full muted" style={{ minHeight: 48, fontWeight: 500 }} onClick={onClose}>Not now</button>
    </div>
  </>)
}
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
