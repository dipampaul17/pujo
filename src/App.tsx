import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { reduce, initial, onLoadAction, needsChip, shouldUpdate, platform, APPROX_M, CACHE_MAX_AGE, type Fix } from './lib/loc'
import raw from './data/dhaak.v1.json'
import { makePlanner, areas as getAreas, statusOf, suggest, tier, type StatusFile, relevantNow, type NowItem, tagsFor, tagContext, zoneOf, ZONES, ZONE_ANCHOR, zoneCounts, nextZone, type Zone, type Dataset, type Plan, type Amenity } from './lib/plan'
import { uberUrl, mapsDirUrl, mapsPlaceUrl, fmtDist, walkMinutes, haversine as hav, type LatLng } from './lib/geo'
import { HERO_LQIP } from './hero-lqip'
import { TextReveal } from './components/text-reveal'

const data = raw as unknown as Dataset
const P = makePlanner(data)
const AREAS = getAreas(data)
const ZCOUNT = zoneCounts(data)
const ZLABEL: Record<Zone, string> = { north: 'North', central: 'Central', south: 'South' }
type Origin = LatLng & { label: string; precise: boolean; approx?: boolean; fix?: Fix }
const geoOk = typeof navigator !== 'undefined' && 'geolocation' in navigator
const saveFix = (f: Fix) => { try { localStorage.setItem('dhaak.fix', JSON.stringify(f)) } catch {} }
const loadFix = (): Fix | null => { try { return JSON.parse(localStorage.getItem('dhaak.fix') || 'null') } catch { return null } }


const Pin = ({ small }: { small?: boolean }) => <svg width={small ? 14 : 20} height={small ? 14 : 20} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="var(--bg)"/></svg>

type Curated = Amenity & { dist: number; curated?: boolean; known?: string }
/** Three best-known places within a short hop: curated, sourced list only; nearest branch per name. */
function eatsNear(all: Array<Amenity & { dist: number }>): Curated[] {
  const seen = new Set<string>()
  return (all as Curated[]).filter(f => f.curated && !seen.has(f.name) && (seen.add(f.name), true)).slice(0, 3)
}

export default function App() {
  const [origin, setOrigin] = useState<Origin | null>(null)
  const permRef = useRef<string>('')
  const originRef = useRef<Origin | null>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const [nowFeed, setNowFeed] = useState<NowItem[]>([])
  const [statusFile, setStatusFile] = useState<StatusFile | null>(null)
  const [xLive, setXLive] = useState<XLive>({ posts: {}, crowd: {} })
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const ingestX = (f: XLive) => {
    setXLive(f)
    let seen: string[] | null = null; try { seen = JSON.parse(localStorage.getItem('pujo.xseen') || 'null') } catch {}
    const all = Object.entries(f.posts).flatMap(([pid, v]) => (Array.isArray(v) ? v : [v]).map(q => [pid, q.id ?? q.url] as const))
    if (seen) { const old = new Set(seen), add = new Set(all.filter(([, id]) => !old.has(id)).map(([pid]) => pid)); if (add.size) setFresh(s => new Set([...s, ...add])) }
    try { localStorage.setItem('pujo.xseen', JSON.stringify(all.map(([, id]) => id))) } catch {}
  }
  const variant = new URLSearchParams(location.search).get('v') ?? 'a'
  const [detail, setDetailRaw] = useState<string | null>(null)
  // Detail sheet is a history entry too: system back closes it.
  // openedAt guards against the second half of a double tap landing on the fresh backdrop; dragged skips the exit animation (the finger already moved it off-screen).
  const sheetRef = useRef({ open: false, openedAt: 0, dragged: false })
  const setDetail = (id: string | null) => {
    const r = sheetRef.current
    if (id) { if (!r.open) { r.open = true; r.openedAt = Date.now(); if (history.state?.v !== 'detail') history.pushState({ v: 'detail' }, '') } setDetailRaw(id) }
    else if (history.state?.v === 'detail') history.back(); else closeNow()
  }
  const [closing, setClosing] = useState(false)
  const closeNow = () => {
    const r = sheetRef.current; r.open = false
    if (r.dragged) { r.dragged = false; setDetailRaw(null); return }
    setClosing(true); setTimeout(() => { setDetailRaw(null); setClosing(false) }, 180)
  }
  useEffect(() => { const f = () => closeNow(); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f) }, [])
  // While the sheet is open: lock page scroll, move focus in, and give it back on close.
  useEffect(() => {
    if (!detail) return
    const back = document.activeElement as HTMLElement | null, de = document.documentElement
    de.style.overflow = 'hidden'
    requestAnimationFrame(() => (document.querySelector('[role=dialog] button') as HTMLElement | null)?.focus({ preventScroll: true }))
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDetail(null); window.addEventListener('keydown', esc)
    return () => { de.style.overflow = ''; window.removeEventListener('keydown', esc); back?.focus?.({ preventScroll: true }) }
  }, [detail])
  useEffect(() => { if (detail && fresh.has(detail)) setFresh(s => { const n = new Set(s); n.delete(detail); return n }) }, [detail, fresh])
  useEffect(() => {
    const get = (f: string) => fetch(import.meta.env.BASE_URL + 'live/' + f, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)
    const load = () => { if (document.visibilityState !== 'visible') return; get('status.json').then(f => f && setStatusFile(f)); get('x.json').then(f => f && ingestX(f)) }
    load(); const t = setInterval(load, 2 * 60e3); document.addEventListener('visibilitychange', load); return () => { clearInterval(t); document.removeEventListener('visibilitychange', load) }
  }, [])
  useEffect(() => {
    const load = () => document.visibilityState === 'visible' && fetch(import.meta.env.BASE_URL + 'live/now.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(f => f && setNowFeed(f.items)).catch(() => {})
    load(); const t = setInterval(load, 5 * 60e3); return () => clearInterval(t)
  }, [])
  const [picking, setPickingRaw] = useState(false)
  const [zone, setZoneRaw] = useState<Zone | null>(null)
  // Every fresh entry (load, reload, bfcache, shared link) lands on the hero; the list opens on a tap.
  const [entered, setEntered] = useState(false)
  const setZone = (z: Zone) => { setEntered(true); setZoneRaw(z); try { localStorage.setItem('dhaak.zone', z) } catch {} }
  const scrollMem = useRef(0)
  // Picker is a real history entry: system back closes it and restores the walk's scroll.
  const setPicking = (v: boolean) => {
    if (v && !picking) { scrollMem.current = window.scrollY; history.pushState({ v: 'pick' }, ''); setPickingRaw(true); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }
    else if (!v && picking) { if (history.state?.v === 'pick') history.back(); else closePick() }
  }
  const closePick = () => { setPickingRaw(false); const y = scrollMem.current; const go = () => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }); requestAnimationFrame(() => { go(); [60, 200, 450].forEach(t => setTimeout(go, t)) }) }
  useEffect(() => {
    history.scrollRestoration = 'manual'
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    const top = () => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    top(); requestAnimationFrame(top)
    const show = (e: PageTransitionEvent) => { if (e.persisted) { setEntered(false); sheetRef.current.open = false; setDetailRaw(null); setPickingRaw(false); if (history.state?.v) history.back() } top() }
    window.addEventListener('pageshow', show); return () => window.removeEventListener('pageshow', show)
  }, [])
  const [tab, setTabRaw] = useState(() => +(sessionStorage.getItem('dhaak.tab') || 0))
  const setTab = (t: number) => { setTabRaw(t); try { sessionStorage.setItem('dhaak.tab', String(t)) } catch {} }
  const [skip, setSkip] = useState<Set<string>>(() => { try { return new Set(JSON.parse(sessionStorage.getItem('dhaak.skip') || '[]')) } catch { return new Set() } })
  useEffect(() => { try { sessionStorage.setItem('dhaak.skip', JSON.stringify([...skip])) } catch {} }, [skip])
  const [toast, setToast] = useState<string | null>(null)

  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  // Location: permission-aware, self-healing. Pure transitions live in lib/loc.ts.
  const [loc, dispatch] = useReducer(reduce, undefined, () => initial(geoOk ? 'prompt' : 'unsupported'))
  const [sheet, setSheet] = useState(false)
  const apply = (f: Fix, source: 'gps' | 'cache') => {
    setOrigin(o => {
      if (o?.precise && source === 'gps' && !shouldUpdate(o.fix ?? null, f, hav(o, f))) return o
      return { lat: f.lat, lng: f.lng, label: 'you', precise: true, approx: source === 'cache' || f.acc > APPROX_M, fix: f }
    })
    setPicking(false)
  }
  const locate = useCallback((gesture = false) => {
    if (gesture) setEntered(true)

    if (!geoOk) { setSheet(true); return }
    dispatch({ type: 'request' })
    navigator.geolocation.getCurrentPosition(
      p => { const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; dispatch({ type: 'fix', fix: f }); saveFix(f); apply(f, 'gps') },
      e => {
        const cached = loadFix(); dispatch({ type: 'error', code: e.code, cached, now: Date.now() })
        if (e.code !== 1 && cached && Date.now() - cached.at < CACHE_MAX_AGE) apply(cached, 'cache')
        else if (gesture) { if (e.code === 1 || !geoOk) setSheet(true); else setToast('Couldn’t find you. Pick a zone.') }
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
    }, () => {}, { enableHighAccuracy: !!origin?.approx, maximumAge: 30000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [origin?.precise])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t) } }, [toast])

  const ownZone = origin && hav(origin, ZONE_ANCHOR.central) < 20000 ? zoneOf(origin) : null
  // Located people auto-select their zone; picking another zone plans from that zone's anchor station.
  useEffect(() => { if (ownZone) { setZoneRaw(ownZone); try { localStorage.setItem('dhaak.zone', ownZone) } catch {} } }, [ownZone])
  const view: Origin | null = !entered ? null : zone && zone !== ownZone ? { ...ZONE_ANCHOR[zone], label: ZONE_ANCHOR[zone].name, precise: false } : origin
  const istDate = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const plan: Plan | null = useMemo(() => (view ? P.plan(view, 8 + skip.size, Object.fromEntries(Object.keys(statusFile?.open ?? {}).map(id => [id, [4, 2, 0, 0][tier(statusOf(id, istDate, statusFile, now))]]))) : null), [view?.lat, view?.lng, skip.size, statusFile])
  // At your own position the list is "Near you" across zone lines (the nearest pandal may sit just over a boundary); a picked zone lists that zone.
  const nearYou = !!view?.precise && !!zone && zone === ownZone
  const zonePandals = useMemo(() => (zone && view ? P.located.filter(p => nearYou ? hav(view, p) < 5000 || zoneOf(p) === zone : zoneOf(p) === zone).map(p => ({ ...p, dist: hav(view, p) })).sort((x, y) => x.dist - y.dist) : []), [zone, view?.lat, view?.lng])
  const suggested = useMemo(() => suggest(zonePandals, id => statusOf(id, istDate, statusFile, now), view?.precise ? view : null), [zonePandals, statusFile, istDate, view?.precise, Math.floor(now / 600e3)])
  const stable = useStableOrder()
  const stops = useMemo(() => (plan ? plan.stops.filter(s => !skip.has(s.id)).slice(0, 8) : []), [plan, skip])

  const pick = (a: (typeof AREAS)[number]) => { setEntered(true); localStorage.setItem('dhaak.station', a.name); setOrigin({ lat: a.lat, lng: a.lng, label: `${a.name} metro`, precise: false }); setZoneRaw(zoneOf(a)); scrollMem.current = 0; setPicking(false); setSkip(new Set()); setTab(0) }

  const routeUrl = view && stops.length ? mapsDirUrl(view.precise ? view : { lat: view.lat, lng: view.lng }, stops) : null
  const hereish: LatLng | null = stops[0] ?? view
  const help = hereish ? {
    food: P.around('food', hereish, 6).sort((a, b) => Number(!!b.notable) - Number(!!a.notable) || a.dist - b.dist),
    toilets: P.around('toilets', hereish, 5, 2000),
    medical: [...P.around('medical', hereish, 3, 2500), ...P.around('police', hereish, 2, 2500)].sort((a, b) => a.dist - b.dist),
    station: P.nearestStation(hereish),
  } : null
  const here = zone ?? ownZone
  const xNow = [
    ...Object.entries(xLive.crowd).map(([id, c]) => ({ c, p: P.located.find(p => p.id === id) })).filter(({ c, p }) => p && zoneOf(p) === here && now - Date.parse(c.at) < 2 * 3600e3)
      .map(({ c, p }) => ({ title: `${p!.name}: ${c.label ?? 'Crowded'}`, link: c.url, published: c.at })),
    ...(xLive.area ?? []).filter(a => a.zone === here && now - Date.parse(a.at) < 2 * 3600e3).map(a => ({ title: `${a.area}: ${a.label}`, link: a.url, published: a.at })),
  ]
  const live = [...relevantNow(nowFeed, zone ?? ownZone, stops.map(s => s.id), now).slice(0, 1), ...xNow].sort((x, y) => Date.parse(y.published) - Date.parse(x.published))[0] as any

  async function share() {
    if (!routeUrl) return
    const text = `Pujo walk: ${stops.map(s => s.name).join(' → ')}`
    try { if (navigator.share) await navigator.share({ title: "Raya and DP's Pujo", text, url: routeUrl }); else { await navigator.clipboard.writeText(`${text}\n${routeUrl}`); setToast('Route link copied') } } catch { /* user cancelled */ }
  }

  originRef.current = origin
  const chip = needsChip(loc) ? <button className="chip" onClick={() => setSheet(true)}><Pin small />Turn on location</button> : null

  return (
    <div className="mx-auto max-w-[560px] min-h-[100dvh] flex flex-col px-5">
      {(view || picking) && <><header className="navbar flex items-center justify-between">
        {picking ? <button onClick={() => setPicking(false)} className="flex items-center gap-1 min-h-[44px] -ml-2 px-2 text-[16px] font-medium" aria-label="Back"><Back /> Back</button> : <button onClick={() => { setEntered(false); setOrigin(null); setZoneRaw(null); try { localStorage.removeItem('dhaak.zone') } catch {} }} className="flex items-center gap-2 min-h-[44px]" aria-label="Home">
          <span className="wordmark text-[17px] whitespace-nowrap">Raya and DP&rsquo;s Pujo</span>
        </button>}
        <span className="flex items-center gap-1">{needsChip(loc) && <button className="min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Turn on location" onClick={() => setSheet(true)} style={{ color: 'var(--sindoor)' }}><Pin small /></button>}<ThemeToggle /></span>
      </header>
      </>}

      {!view && !picking && (
        <main className="landing">
          <div className={`art ${variant === 'b' ? 'art-frame' : 'art-bleed'}`}><HeroImg /></div>
          <div className="pt-7">
            <TextReveal as="h1" text="Raya and DP’s Pujo" split="word" className="title" blur={4} stagger={0.05} />
            <p className="t-body muted mt-2">For Raya, from DP.</p>
          </div>
          <div className="pt-6">
            {chip && <div className="pb-3">{chip}</div>}
            <ZoneSwitch zone={zone ?? 'none' as any} onChange={setZone} />
            <button className="btn btn-primary w-full mt-3" onClick={() => locate(true)} disabled={loc.status === 'locating'}>
              {loc.status === 'locating' ? 'Finding you…' : 'Near me'}
            </button>
          </div>
        </main>
      )}

      {picking && (
        <main className="flex-1 pt-6 pb-10">
          {loc.status === 'error' && loc.perm !== 'denied' && <Notice tone="gold">No location fix. Pick a station.</Notice>}
          <h2 className="title mt-4">Where are you?</h2>
          <div className="mt-4"><ZoneSwitch zone={zone ?? 'north'} onChange={setZone} /></div>
          <ul className="mt-5 border-t hair">
            {AREAS.filter(a => zoneOf(a) === (zone ?? 'north')).map((a, i) => (
              <li key={a.name} className="rise" style={{ ['--i' as any]: Math.min(i, 12) }}>
                <button onClick={() => pick(a)} className="w-full flex items-center justify-between py-4 border-b hair text-left">
                  <span className="text-[17px] font-medium">{a.name}</span>
                  <span className="muted text-[14px] mono-num">{a.count} pandal{a.count > 1 ? 's' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </main>
      )}

      {view && plan && !picking && (
        <main className="flex-1 pb-40" onTouchStart={e => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }} onTouchEnd={e => {
          const s = swipe.current; if (!s || !zone) return; const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y
          if (Math.abs(dx) > 70 && Math.abs(dy) < 40) setZone(nextZone(zone, dx < 0 ? 1 : -1))
        }}>
          <div className="sticky z-10 -mx-5 px-5 pt-1 pb-2 frost" style={{ top: 52 }}>
            <ZoneSwitch zone={zone ?? ownZone ?? 'north'} onChange={setZone} mine={ownZone} />
          </div>
          {plan.outOfRange ? (
            <div className="pt-8">
              <h2 className="title">Too far from Kolkata.</h2>
              <p className="muted mt-2">Nearest pandal: {Math.round(plan.nearestKm)} km.</p>
              <button className="btn btn-primary w-full mt-8" onClick={() => setZone('central')}>Show Central Kolkata</button>
            </div>
          ) : (<>
            <h2 className="t-title2 pt-4">{view.precise ? 'Near you' : ZLABEL[zone ?? 'central']}</h2>

            
            {live && <a href={live.link} target="_blank" rel="noopener" className="now-strip mt-3"><span className="now-dot" /><span className="flex-1 line-clamp-2">{live.title}</span></a>}

            <div className="mt-6">
              <Segmented label="Sections" items={['Route', 'Food', 'Toilets', 'Help']} value={tab} onChange={setTab} />
            </div>

            {tab === 0 && (
              <ol className="group-list mt-4">
                {stops.map((s, i) => {
                  return (
                    <li key={s.id} id={`stop-${i}`} data-stop={i} className={`stop rise scroll-mt-28 ${i === 0 ? 'stop-next' : ''}`} style={{ ['--i' as any]: i }}>
                      <div className="flex gap-3">
                        <span className="stop-n mono-num" style={{ color: i === 0 ? 'var(--sindoor)' : 'var(--muted)' }} aria-label={`Stop ${i + 1}`}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <button onClick={() => setDetail(s.id)} className="t-headline block text-left min-h-[44px] -my-2" aria-haspopup="dialog">{s.name}</button>
                          <div className="flex flex-wrap items-center gap-x-3"><StatusDot s={statusOf(s.id, istDate, statusFile, now)} />{!(i === 0 && postsOf(xLive, s.id).some(q => q.photo)) && <PostsMark posts={postsOf(xLive, s.id)} fresh={fresh.has(s.id)} onClick={() => setDetail(s.id)} />}{xLive.crowd[s.id] && <a href={xLive.crowd[s.id].url} target="_blank" rel="noopener" className="text-[13px] font-semibold" style={{ color: 'var(--sindoor)' }}>{xLive.crowd[s.id].label ?? 'Crowded'} · {ago(now - Date.parse(xLive.crowd[s.id].at))}</a>}</div>
                          <p className="t-foot muted mt-0.5 mono-num">
                            {s.precision === 'station' ? 'Approximate' : i === 0 ? fmtDist(s.dist) : `+${fmtDist(hop(stops, i))}`}{i === 0 && s.precision !== 'station' && view?.precise && s.dist > 1200 ? ` · ~${carMin(s.dist)} min by car` : ''}{s.station ? ` · ${s.station}` : ''}
                          </p>
                          {(() => { const t = tagsFor(s, tagContext(P, s)); const one = s.reason ?? t[0]; return i === 0 && one && <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {one && <span className={`tag ${/nearby/.test(one) ? 'tag-leaf' : 'tag-red'}`}>{one}</span>}
                          </div> })()}
                          {i === 0 && postsOf(xLive, s.id).find(q => q.photo) && <PostCard p={postsOf(xLive, s.id).find(q => q.photo)!} now={now} compact />}
                          {i === 0 && s.note && <p className="text-[14px] mt-2" style={{ color: 'var(--sindoor)' }}>{s.note}.</p>}
                          {i === 0 && <div className="grid grid-cols-2 gap-2 mt-4 -ml-10 -mr-10">
                            <a href={uberUrl({ lat: s.lat, lng: s.lng, name: s.name, address: `${s.name}${s.station ? `, near ${s.station} metro` : ''}, Kolkata` }, view?.precise && !view.approx ? view : null)} className="btn btn-uber">Uber here</a>
                            <a href={mapsDirUrl(view?.precise ? view : null, [s])} target="_blank" rel="noopener" className="btn btn-ghost">Maps</a>
                            <button onClick={() => { setSkip(new Set(skip).add(s.id)); window.scrollTo({ top: 0 }) }} className="btn btn-quiet col-span-2">I'm here</button>
                          </div>}
                          {i > 0 && <a href={uberUrl({ lat: s.lat, lng: s.lng, name: s.name, address: `${s.name}${s.station ? `, near ${s.station} metro` : ''}, Kolkata` }, view?.precise && !view.approx ? view : null)} className="link-action -mb-2">Uber here<Chev /></a>}
                        </div>
                        <button onClick={() => setSkip(new Set(skip).add(s.id))} className="self-start t-foot muted min-h-[44px] min-w-[44px] px-2 -mr-2 -mt-2.5" aria-label={`Skip ${s.name}`}>Skip</button>
                      </div>
                    </li>
                  )
                })}
                {skip.size > 0 && <button className="text-[14px] muted font-semibold mt-2 min-h-[44px]" onClick={() => { setSkip(new Set()) }}>Reset {skip.size} done or skipped</button>}
              </ol>
            )}
            {tab === 0 && zone && (
              <details className="mt-10 group" open>
                <summary className="list-none cursor-pointer flex items-center justify-between min-h-[48px] border-b hair">
                  <span className="t-title2">{nearYou ? 'Near you' : `All ${ZLABEL[zone]}`}</span><span className="muted text-[14px] mono-num">{zonePandals.length}</span>
                </summary>
                <ul className="group-list mt-3">{stable(suggested).map((p, r) => (
                  <li key={p.id}><a href={mapsPlaceUrl(p, p.name + ' Durga Puja')} onClick={e => { e.preventDefault(); setDetail(p.id) }} className="row">
                    <span className="flex min-w-0"><span className="row-n mono-num" style={{ color: r < 3 ? 'var(--ink)' : 'var(--muted)' }}>{r + 1}</span><span className="min-w-0"><span className="block truncate">{p.name}</span><StatusDot s={statusOf(p.id, istDate, statusFile, now)} inline /></span></span><span className="flex items-center gap-2 shrink-0"><PostsMark posts={postsOf(xLive, p.id)} fresh={fresh.has(p.id)} />{p.precision !== 'station' && p.dist >= 50 && <span className="muted text-[14px] mono-num">{fmtDist(p.dist)}</span>}</span></a></li>))}</ul>
              </details>
            )}
            {tab === 1 && help && <AmenityList items={help.food} empty="Nothing mapped nearby." meta={f => [f.notable ? 'Kolkata classic' : null, f.cuisine && f.cuisine[0].toUpperCase() + f.cuisine.slice(1)].filter(Boolean).join(' · ')} />}
                        {tab === 2 && help && <AmenityList items={help.toilets} empty="None mapped nearby." meta={t => [t.fee === 'yes' ? 'Paid' : t.fee === 'no' ? 'Free' : null].filter(Boolean).join('')} />}
            {tab === 3 && help && (
              <div className="mt-4 space-y-3">
                <div className="card p-4"><div className="flex gap-2"><a className="btn btn-primary flex-1" href="tel:112">Call 112</a><a className="btn btn-ghost flex-1" href="tel:100">Police 100</a></div></div>
                {help.station && <AmenityList items={[{ ...help.station, id: 'st', name: `${help.station.name} metro`, dist: help.station.dist }] as any} empty="" meta={() => 'Metro'} />}
                <AmenityList items={help.medical} empty="Nothing mapped nearby." meta={m => (m.kind === 'police' ? 'Police' : 'Medical')} />
              </div>
            )}

          </>)}
          {detail && (() => { const p = P.located.find(x => x.id === detail); if (!p) return null
            const d = view ? hav(view, p) : null, st = statusOf(p.id, istDate, statusFile, now), posts = postsOf(xLive, p.id)
            const eats = eatsNear(P.around('food', p, 400, 3500))
            const loo = P.around('toilets', p, 1, 600)[0]
            const pick = view?.precise && !view.approx ? view : null
            const dest = (q: LatLng & { name: string }) => uberUrl({ lat: q.lat, lng: q.lng, name: q.name, address: `${q.name}, Kolkata` }, pick)
            return <>
              <div className={`sheet-backdrop ${closing ? 'out' : ''}`} onClick={() => { if (Date.now() - sheetRef.current.openedAt > 400) setDetail(null) }} />
              <div className={`sheet max-h-[88dvh] overflow-y-auto overscroll-contain ${closing ? 'out' : ''}`} role="dialog" aria-modal="true" aria-label={p.name} {...dragToClose(() => { sheetRef.current.dragged = true; setDetail(null) })}>
                <div className="grabber" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="t-title">{p.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-3 mt-1"><StatusDot s={st} />{xLive.crowd[p.id] && <a href={xLive.crowd[p.id].url} target="_blank" rel="noopener" className="text-[13px] font-semibold" style={{ color: 'var(--sindoor)' }}>{xLive.crowd[p.id].label ?? 'Crowded'} · {ago(now - Date.parse(xLive.crowd[p.id].at))}</a>}</div>
                  </div>
                  <button onClick={() => setDetail(null)} className="close-x mt-0.5" aria-label="Close"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button>
                </div>
                {p.reason && <p className="t-sub mt-3">{p.reason}</p>}
                <p className="t-foot muted mono-num mt-2">{p.precision === 'station' ? `Approximate, near ${p.station}` : d != null ? `${fmtDist(d)}${d > 1200 && pick ? ` · ~${carMin(d)} min by car` : ` · ${walkMinutes(d)} min walk`}` : ''}{loo ? ` · Toilet ${fmtDist(loo.dist)}` : ''}</p>
                {posts.length > 0 && <div className="mt-5 space-y-3">{posts.map(q => <PostCard key={q.url} p={q} now={now} />)}</div>}
                <div className="grid grid-cols-2 gap-2 mt-5">
                  <a href={dest(p)} className="btn btn-uber">Uber here</a>
                  <a href={mapsDirUrl(pick, [p])} target="_blank" rel="noopener" className="btn btn-ghost">Maps</a>
                </div>
                {eats.length > 0 && <><h3 className="t-section mt-8">Eat nearby</h3>
                  <ul>{eats.map(f => <li key={f.id} className="flex items-center gap-2 py-3 border-b hair last:border-b-0">
                    <div className="min-w-0 flex-1"><p className="t-body font-medium truncate">{f.name}</p><p className="t-foot muted mono-num">{[(f as Curated).known, f.dist > 1200 ? `${carMin(f.dist)} min by car` : `${walkMinutes(f.dist)} min walk`].filter(Boolean).join(' · ')}</p></div>
                    <a href={dest(f)} className="pill">Uber</a>
                    <a href={mapsPlaceUrl(f, f.name)} target="_blank" rel="noopener" className="pill">Maps</a>
                  </li>)}</ul></>}
              </div>
            </> })()}
        </main>
      )}

      {view && plan && !plan.outOfRange && !picking && routeUrl && (
        <div className="dock fixed inset-x-0 bottom-0 z-20 safe-b px-5 pt-3">
          <div className="mx-auto max-w-[560px] flex gap-2">
            <a href={routeUrl} target="_blank" rel="noopener" className="btn btn-walk flex-1">Walk all in Maps</a>
            <button onClick={share} className="btn btn-ghost px-5" aria-label="Share route">Share</button>
          </div>
        </div>
      )}

      <details className={`text-[12px] muted ${view && !picking ? 'pb-32' : 'pb-4'}`}>
        <summary className="cursor-pointer list-none inline-flex items-center gap-1 min-h-[44px]" aria-label="Sources"><Info /> Sources</summary>
        <p className="pb-4">{data.source.guide}. Places © OpenStreetMap contributors, {data.source.fetched}. “Approximate” stops use the metro station. Data v{data.version} · {data.hash}</p>
      </details>

      {sheet && <LocationSheet perm={loc.perm} onClose={() => setSheet(false)} onRetry={() => { setSheet(false); locate(true) }} />}
      {toast && <div role="status" className="fixed left-1/2 -translate-x-1/2 top-4 z-30 card px-4 py-2 text-[14px] rise">{toast}</div>}
    </div>
  )
}

const Info = () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 11v6M12 7.5v.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
/** Tiny stack of the latest visitor photos (or an X glyph) + count. A sindoor dot marks posts that arrived since last look. */
/** Re-sorts land only when the hand is still: while touching/scrolling (or within 1.2 s after), keep the order on screen. */
function useStableOrder() {
  const shown = useRef<string[]>([]), [, kick] = useState(0), busy = useRef(0)
  useEffect(() => {
    const mark = () => { busy.current = Date.now() }
    const evs = ['touchstart', 'touchmove', 'scroll', 'wheel', 'pointerdown'] as const
    evs.forEach(e => window.addEventListener(e, mark, { passive: true }))
    const t = setInterval(() => { if (Date.now() - busy.current > 1200) kick(k => k + 1) }, 1500)
    return () => { evs.forEach(e => window.removeEventListener(e, mark)); clearInterval(t) }
  }, [])
  return <T extends { id: string }>(next: T[]): T[] => {
    const ids = next.map(x => x.id), same = ids.length === shown.current.length && ids.every(id => shown.current.includes(id))
    if (!same || Date.now() - busy.current > 1200) { shown.current = ids; return next }
    const by = new Map(next.map(x => [x.id, x])); return shown.current.map(id => by.get(id)!)
  }
}
function PostsMark({ posts, fresh, onClick }: { posts: XPost[]; fresh?: boolean; onClick?: () => void }) {
  if (!posts.length) return null
  const pics = posts.filter(q => q.photo).slice(0, 3)
  const body = <>
    <span className="relative inline-flex">
      {pics.length ? pics.map((q, k) => <img key={q.url} src={sized(q.photo!, 'small')} alt="" loading="lazy" decoding="async" className="xthumb" style={{ marginLeft: k ? -7 : 0, zIndex: 3 - k }} />)
        : <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style={{ color: 'var(--muted)' }}><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z"/></svg>}
      {fresh && <span className="xfresh" aria-label="New" />}
    </span>
    <span className="muted text-[13px] mono-num font-medium">{posts.length}</span>
  </>
  const cls = 'inline-flex items-center gap-1.5 align-middle'
  const label = `${posts.length} post${posts.length > 1 ? 's' : ''} from visitors on X${fresh ? ', new' : ''}`
  return onClick ? <button onClick={onClick} className={`${cls} min-h-[44px] -my-2`} aria-label={label}>{body}</button> : <span className={cls} aria-label={label}>{body}</span>
}
const PUBS: Record<string, string> = { 'timesofindia.indiatimes.com': 'Times of India', 'telegraphindia.com': 'The Telegraph', 'anandabazar.com': 'Anandabazar', 'thehindu.com': 'The Hindu', 'indianexpress.com': 'Indian Express', 'hindustantimes.com': 'Hindustan Times', 'ndtv.com': 'NDTV', 'aninews.in': 'ANI', 'millenniumpost.in': 'Millennium Post', 'thestatesman.com': 'The Statesman' }
/** Who said so: '@handle' for an X post, the publication for an article. */
function sourceOf(url?: string): { name: string; x: boolean } | null {
  if (!url) return null
  try { const u = new URL(url), h = u.hostname.replace(/^(www|m|mobile)\./, '')
    if (/^(x|twitter)\.com$/.test(h)) { const n = u.pathname.split('/')[1]; return n ? { name: '@' + n, x: true } : null }
    return { name: PUBS[h] ?? h.split('.').slice(-3, -1).filter(p => p.length > 3).pop()?.replace(/^./, c => c.toUpperCase()) ?? h, x: false }
  } catch { return null }
}
const XGlyph = () => <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z"/></svg>
function StatusDot({ s, inline }: { s: ReturnType<typeof statusOf>; inline?: boolean }) {
  if (!s) return null
  const c = s.key === 'open' ? 'var(--sindoor)' : s.key === 'inaugurated' ? 'var(--ink)' : 'var(--muted)'
  const src = sourceOf(s.evidence)
  const via = src && <span className="status-src">{src.x ? <XGlyph /> : <span className="status-src-dot" />}{src.name}</span>
  const body = <><span className="w-2 h-2 rounded-full" style={{ background: c }} /><span style={{ color: c }}>{s.label}</span>{via}</>
  const cls = `status inline-flex items-center gap-1.5 ${inline ? '' : 'min-h-[44px] -my-2'}`
  // Rows are already links to the sheet: show the source quietly there, make it tappable in the stop card and sheet.
  return s.evidence && !inline ? <a href={s.evidence} target="_blank" rel="noopener" className={cls} aria-label={`${s.label}, source ${src?.name ?? ''}`}>{body}</a> : <span className={cls}>{body}</span>
}
function ZoneSwitch({ zone, onChange, mine }: { zone: Zone; onChange: (z: Zone) => void; mine?: Zone | null }) {
  return <Segmented label="Zone" value={ZONES.indexOf(zone)} onChange={i => onChange(ZONES[i])}
    items={ZONES.map(z => <>{ZLABEL[z]}<span className="seg-count mono-num">{ZCOUNT[z]}</span>{mine === z && <span aria-label="you are here" className="seg-here" />}</>)} />
}
/** iOS segmented control: one sliding thumb, used for zones and sections alike. */
function Segmented({ label, items, value, onChange }: { label: string; items: React.ReactNode[]; value: number; onChange: (i: number) => void }) {
  const n = items.length
  return (
    <div role="tablist" aria-label={label} className="seg" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      <span aria-hidden="true" className="seg-thumb" style={{ opacity: value >= 0 ? 1 : 0, width: `calc((100% - 4px) / ${n})`, transform: `translateX(${Math.max(0, value) * 100}%)` }} />
      {items.map((it, i) => <button key={i} role="tab" aria-selected={i === value} onClick={() => onChange(i)} className="seg-item">{it}</button>)}
    </div>
  )
}
const Chev = () => <svg width="7" height="12" viewBox="0 0 7 12" aria-hidden="true" className="ml-1"><path d="M1 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
const Back = () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
      <div className="grabber" />
      <h2 className="t-title">Turn on location</h2>
      <ol className="mt-4 space-y-3">{steps.map((s, i) => <li key={s} className="flex gap-3 text-[16px]"><span className="serif text-[20px] w-6 shrink-0" style={{ color: 'var(--ink)' }}>{i + 1}</span><span>{s}</span></li>)}</ol>
      <button className="btn btn-primary w-full mt-6" onClick={onRetry}>{perm === 'denied' ? 'Try again' : 'Allow location'}</button>
      <button className="btn w-full muted" style={{ minHeight: 48, fontWeight: 500 }} onClick={onClose}>Not now</button>
    </div>
  </>)
}
type XPost = { media?: { src: string; w?: number; h?: number; video?: boolean }[]; id?: string; at: string; handle: string; avatar: string; text: string; photo?: string; score?: number; w?: number; h?: number; url: string }
type XLive = { posts: Record<string, XPost[] | XPost>; crowd: Record<string, { at: string; url: string; label?: string; kind?: string; n?: number }>; area?: { area: string; zone: string; kind: string; label: string; at: string; url: string; n?: number }[] }
const carMin = (m: number) => Math.max(5, Math.round((m * 1.35) / 1000 / 14 * 60 / 5) * 5)
const sized = (u: string, n: string) => { const x = new URL(u); x.searchParams.set('name', n); if (!x.searchParams.has('format')) x.searchParams.set('format', 'jpg'); return x.toString() }
function postsOf(x: XLive, id: string): XPost[] { const v = x.posts[id]; const l = !v ? [] : Array.isArray(v) ? v : [v]; return l.map(q => { const m = q.media?.find(m => !m.video); return q.photo || !m ? q : { ...q, photo: m.src, w: m.w, h: m.h } }) }
function PostCard({ p, now, compact }: { p: XPost; now: number; compact?: boolean }) {
  const [ok, setOk] = useState(false), [bad, setBad] = useState(false), [open, setOpen] = useState(false)
  const big = !compact
  return <div className={`post ${compact ? '-ml-10 -mr-10 mt-3' : ''}`}>
    <button onClick={() => setOpen(o => !o)} aria-expanded={open} className={`w-full text-left ${big ? 'block' : 'flex gap-3'} p-3`}>
      {p.photo && !bad && <span className="post-img shrink-0" style={big ? { width: '100%', aspectRatio: `${Math.max(+(p.w ?? 4) / +(p.h ?? 3), 4 / 5)}` } : { width: 64, height: 64 }}>
        <img src={sized(p.photo!, 'large')} alt="" width={p.w} height={p.h} loading={big ? 'eager' : 'lazy'} decoding="async" ref={el => { if (el?.complete && el.naturalWidth) setOk(true) }} onLoad={() => setOk(true)} onError={() => setBad(true)} style={{ opacity: ok ? 1 : 0 }} />
      </span>}
      <span className={`min-w-0 flex-1 block ${big ? 'mt-3 px-0.5' : ''}`}>
        <span className="flex items-center gap-1.5 text-[13px]">{p.avatar && <img src={p.avatar} alt="" loading="lazy" className="w-4 h-4 rounded-full" />}<span className="font-semibold">@{p.handle}</span><span className="muted">{ago(now - Date.parse(p.at))}</span></span>
        <span className={`block t-sub leading-[1.45] mt-1 ${open ? '' : compact ? 'line-clamp-2' : 'line-clamp-3'}`}>{p.text}</span>
      </span>
    </button>
    {open && <a href={p.url} target="_blank" rel="noopener" className="link-action px-3 pb-1">Open on X<Chev /></a>}
  </div>
}
function HeroImg({ className = '' }: { className?: string }) {
  const [ok, setOk] = useState(false), b = import.meta.env.BASE_URL + 'img/hero-'
  return <picture className={className} style={{ backgroundImage: `url(${HERO_LQIP})`, backgroundSize: 'cover', backgroundPosition: '50% 30%', display: 'block', width: '100%', height: '100%' }} aria-hidden="true">
    <source type="image/avif" srcSet={`${b}600.avif 600w, ${b}900.avif 900w, ${b}1200.avif 1200w`} sizes="100vw" />
    <source type="image/webp" srcSet={`${b}600.webp 600w, ${b}900.webp 900w, ${b}1200.webp 1200w`} sizes="100vw" />
    <img src={`${b}900.webp`} alt="" decoding="async" fetchPriority="high" onLoad={() => setOk(true)} style={{ opacity: ok ? 1 : 0 }} />
  </picture>
}
function dragToClose(close: () => void) {
  let y0 = 0, dy = 0, el: HTMLElement | null = null
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => { el = e.currentTarget; if (el.scrollTop > 0) { el = null; return } y0 = e.clientY; dy = 0; el.style.transition = 'none' },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => { if (!el) return; dy = Math.max(0, e.clientY - y0); if (dy > 4) el.style.transform = `translateY(${dy}px)` },
    onPointerUp: () => { if (!el) return; el.style.transition = 'transform .24s var(--spring)'; if (dy > 110) { el.style.transform = 'translateY(100%)'; setTimeout(close, 200) } else el.style.transform = ''; el = null },
    onPointerCancel: () => { if (el) { el.style.transform = ''; el = null } },
  }
}
function ago(ms: number) { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }
function hop(s: LatLng[], i: number) { return hav(s[i - 1], s[i]) }

function Notice({ children, tone }: { children: React.ReactNode; tone: 'gold' }) {
  return <p className={`mt-4 text-[14.5px] rounded-[12px] px-4 py-3 tag-${tone}`} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{children}</p>
}
function AmenityList({ items, empty, meta }: { items: Array<Amenity & { dist: number }>; empty: string; meta: (a: Amenity) => string }) {
  if (!items.length) return <p className="mt-6 muted text-[15px]">{empty}</p>
  return (
    <ul className="group-list mt-4">
      {items.map((a, i) => (
        <li key={a.id} className="rise" style={{ ['--i' as any]: i }}>
          <a href={mapsPlaceUrl(a)} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 min-h-[60px] py-3 px-4">
            <span className="min-w-0"><span className="block t-body font-medium truncate">{a.name}</span>{meta(a) && <span className="block t-foot muted truncate">{meta(a)}</span>}</span>
            <span className="t-foot muted mono-num shrink-0">{fmtDist(a.dist)} · {walkMinutes(a.dist)} min</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
