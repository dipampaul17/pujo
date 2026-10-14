import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { reduce, initial, onLoadAction, needsChip, shouldUpdate, platform, APPROX_M, CACHE_MAX_AGE, type Fix } from './lib/loc'
import raw from './data/dhaak.v1.json'
import { makePlanner, isOpen, helpOrigin, areas as getAreas, statusOf, tier, type StatusFile, type NowItem, zoneOf, zoneOrder, ZONE_ANCHOR, nextZone, type Zone, type Dataset, type Plan, type Amenity } from './lib/plan'
import { uberUrl, mapsDirUrl, mapsPlaceUrl, fmtDist, walkMinutes, haversine as hav, type LatLng } from './lib/geo'
import { recommend, routeStops, routePool, zoneTab, goHint, trafficCar, roadNote, type RoadSig, type TrafficFile } from './lib/rank'
import { pagePicks } from './lib/page'
import { planWalk, walkLegs } from './lib/walk'
import { applyFilters, chips, NO_FILTERS, type Filters } from './lib/filters'
import { hasPass } from './lib/passport'
import { TRAVEL, roadEstimate, liveTravel, attachPins, type Roads, type Travel } from './lib/roads'
import { HERO_LQIP } from './hero-lqip'
import { TextReveal } from './components/text-reveal'

const data = raw as unknown as Dataset
const P = makePlanner(data)
const AREAS = getAreas(data)
const ZLABEL: Record<Zone, string> = { north: 'North', central: 'Central', south: 'South', saltlake: 'Salt Lake' }
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
  const [trafficFile, setTrafficFile] = useState<TrafficLive | null>(null)
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
  // Picked pandals for a walk: persists, spans zones.
  const [picked, setPickedRaw] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('pujo.picked') || '[]') } catch { return [] } })
  const togglePick = (id: string) => setPickedRaw(l => { const n = l.includes(id) ? l.filter(x => x !== id) : [...l, id]; try { localStorage.setItem('pujo.picked', JSON.stringify(n)) } catch {}; return n })
  const clearPicked = () => { setPickedRaw([]); try { localStorage.removeItem('pujo.picked') } catch {} }
  const [walkOpen, setWalkOpen] = useState(false)
  useEffect(() => { if (!walkOpen) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setWalkOpen(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [walkOpen])
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
    const get = (f: string) => fetch(import.meta.env.BASE_URL + 'live/' + f + '?t=' + Math.floor(Date.now() / 30e3), { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)
    const load = () => { if (document.visibilityState !== 'visible') return; get('status.json').then(f => f && setStatusFile(f)); get('x.json').then(f => f && ingestX(f)); get('traffic.json').then(f => f && setTrafficFile(f)) }
    load(); const t = setInterval(load, 45e3); document.addEventListener('visibilitychange', load); return () => { clearInterval(t); document.removeEventListener('visibilitychange', load) }
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
  const [tab, setTab] = useState(0) // 0 = zone page; 1-3 = Food / Toilets / Help sheet
  useEffect(() => { if (!tab) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setTab(0); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [tab])
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
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 })
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
    }, () => {}, { enableHighAccuracy: true, maximumAge: 15000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [origin?.precise])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t) } }, [toast])

  const ownZone = origin && hav(origin, ZONE_ANCHOR.central) < 20000 ? zoneOf(origin) : null
  // Located people auto-select their zone; picking another zone plans from that zone's anchor station.
  useEffect(() => { if (ownZone) { setZoneRaw(ownZone); try { localStorage.setItem('dhaak.zone', ownZone) } catch {} } }, [ownZone])
  const view: Origin | null = !entered ? null : zone && zone !== ownZone ? { ...ZONE_ANCHOR[zone], label: ZONE_ANCHOR[zone].name, precise: false } : origin
  const istDate = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const plan: Plan | null = useMemo(() => (view ? P.plan(view, 8 + skip.size, Object.fromEntries(Object.keys(statusFile?.open ?? {}).map(id => [id, [4, 2, 0, 0][tier(statusOf(id, istDate, statusFile, now))]]))) : null), [view?.lat, view?.lng, skip.size, statusFile])
  // Distances shown are always from the live fix (never a zone centre or metro); without a fix none are shown.
  const me: LatLng | null = origin?.precise && !origin.approx ? origin : null
  // A zone tab lists exactly the pandals whose coordinates fall in that zone (never a cross-zone radius).
  const zonePandals = useMemo(() => (zone && view ? P.located.filter(p => zoneOf(p) === zone).map(p => ({ ...p, dist: hav(view, p), my: me ? hav(me, p) : null })) : []), [zone, view?.lat, view?.lng, me?.lat, me?.lng])
  // Travel: precomputed road matrix (lazy), upgraded to a live OSRM table from the fix. Same numbers in list, route and sheet.
  const [roads, setRoads] = useState<Roads | null>(null)
  useEffect(() => { if (!entered || roads) return; fetch(import.meta.env.BASE_URL + 'data/roads.json').then(r => r.ok ? r.json() : null).then(j => j && setRoads(attachPins(j))).catch(() => {}) }, [entered])
  const [liveRaw, setLiveT] = useState<{ key: string; t: Record<string, Travel> }>({ key: '', t: {} })
  const meKey = me ? `${me.lat.toFixed(3)},${me.lng.toFixed(3)}` : ''
  useEffect(() => { if (!me) return; let alive = true; const k = meKey; liveTravel(me, P.located).then(t => { if (alive && t) setLiveT({ key: k, t }) }); return () => { alive = false } }, [meKey])
  // Live times only count for the fix they were measured from; after a move the matrix estimate stands in until the new table lands.
  const liveT = liveRaw.key === meKey ? liveRaw.t : NO_LIVE
  const from: LatLng | null = me ?? view
  const travel = useCallback((p: LatLng & { id: string }): Travel => {
    const t = (me && liveT[p.id]) || roadEstimate(roads, from!, p), tc = trafficCar(t.carMin, trafficFile?.pandals?.[p.id], Date.now())
    return tc.live && tc.min !== t.carMin ? { ...t, carMin: tc.min, traffic: true } : t  // TomTom live flow, fresh only; else OSRM
  }, [me?.lat, me?.lng, liveT, roads, from?.lat, from?.lng, trafficFile])
  // Seen: opened in the sheet or marked "I'm here" this session.
  const [seen, setSeen] = useState<Set<string>>(() => { try { return new Set(JSON.parse(sessionStorage.getItem('pujo.seen') || '[]')) } catch { return new Set() } })
  const markSeen = (id: string) => setSeen(s => { if (s.has(id)) return s; const n = new Set(s).add(id); try { sessionStorage.setItem('pujo.seen', JSON.stringify([...n])) } catch {}; return n })
  useEffect(() => { if (detail) markSeen(detail) }, [detail])
  const freshPosts = useMemo(() => Object.fromEntries(Object.entries(xLive.posts).map(([id, v]) => [id, Math.max(...(Array.isArray(v) ? v : [v]).map(q => Date.parse(q.at) || 0))])), [xLive])
  const raining = nowFeed.some(n => /\brain/i.test(n.title) && now - Date.parse(n.published) < 3 * 3600e3)
  const roadIssue = useMemo(() => new Set(P.located.filter(p => roadNote(p.id, xLive.roads, trafficFile ?? undefined, now)).map(p => p.id)), [xLive, trafficFile, Math.floor(now / 60e3)])
  const recCtx = (here: LatLng) => ({ here, now, status: (id: string) => statusOf(id, istDate, statusFile, now), travel, live: { crowd: xLive.crowd, closed: new Set<string>(), freshPosts }, seen, rain: raining, pass: hasPass, roadIssue })
  const tick = Math.floor(now / 600e3)
  // Order: live drive time from me (pass, then open, break ties); without a fix, nearest to the zone's anchor station.
  const suggested = useMemo(() => (zone && zonePandals.length ? zoneTab(zonePandals, zone, { me, anchor: ZONE_ANCHOR[zone], travel, pass: hasPass, open: id => isOpen(statusOf(id, istDate, statusFile, now)), closed: id => statusOf(id, istDate, statusFile, now)?.key === 'closed' }).map(p => ({ ...p, t: travel(p) })) : []), [zone, zonePandals, statusFile, istDate, travel, tick])
  const stable = useStableOrder()
  const [filters, setFiltersRaw] = useState<Filters>(() => { try { return { ...NO_FILTERS, ...JSON.parse(localStorage.getItem('pujo.filters') || '{}') } } catch { return NO_FILTERS } })
  const setFilters = (f: Filters) => { setFiltersRaw(f); try { localStorage.setItem('pujo.filters', JSON.stringify(f)) } catch {} }
  const keep = { open: (id: string) => isOpen(statusOf(id, istDate, statusFile, now)), pass: hasPass }
  const ordered = stable(suggested), listed = applyFilters(ordered, filters, keep)
  const stops = useMemo(() => { if (!plan || plan.outOfRange || !view) return []
    const near = routePool(P.located, view, zone, skip, id => (!filters.open || keep.open(id)) && (!filters.pass || keep.pass(id)))
    const top = recommend(near as any, recCtx(from ?? view)).slice(0, 8).map(x => ({ ...(x.p as any), dist: hav(view, x.p) })) as typeof plan.stops
    return routeStops(top) }, [plan, skip, zone, filters, view?.lat, view?.lng, statusFile, travel, seen, xLive, raining, tick])

  const pick = (a: (typeof AREAS)[number]) => { setEntered(true); localStorage.setItem('dhaak.station', a.name); setOrigin({ lat: a.lat, lng: a.lng, label: `${a.name} metro`, precise: false }); setZoneRaw(zoneOf(a)); scrollMem.current = 0; setPicking(false); setSkip(new Set()); setTab(0) }

  const routeUrl = view && stops.length ? mapsDirUrl(view.precise ? view : { lat: view.lat, lng: view.lng }, stops) : null
  const hereish: LatLng | null = view ? helpOrigin(me, view) : null
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
  const live = [...xNow].sort((x, y) => Date.parse(y.published) - Date.parse(x.published))[0] as any

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
            <ZoneSwitch zone={zone ?? null} onChange={setZone} />
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

          {plan.outOfRange ? (
            <div className="pt-8">
              <h2 className="title">Too far from Kolkata.</h2>
              <p className="muted mt-2">Nearest pandal: {Math.round(plan.nearestKm)} km.</p>
              <button className="btn btn-primary w-full mt-8" onClick={() => setZone('central')}>Show Central Kolkata</button>
            </div>
          ) : (<>


            


            {zone && (() => { const { next, rail } = pagePicks(stops, listed); const cs = chips(ordered, filters, keep)
              const uber = (s: typeof listed[number]) => uberUrl({ lat: s.lat, lng: s.lng, name: s.name, approx: s.precision === 'station', address: s.precision === 'station' ? `${s.name} Durga Puja, Kolkata` : `${s.name}, Kolkata` } as any, view?.precise && !view.approx ? view : null)
              return <>
{!next && <button className="btn btn-quiet w-full mt-4" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>}
                {next && <article data-card data-zone={zoneOf(next)} data-approx={next.precision === 'station' || undefined} className="go mt-4 rise relative" key={zone + next.id}>
                  <button onClick={() => setDetail(next.id)} aria-haspopup="dialog" className="block w-full text-left">
                    <Photo p={next} x={xLive} big />
                    <h2 className="t-title px-4 pt-4 pr-14">{next.name}</h2>
                  </button>
                  <PickBtn on={picked.includes(next.id)} name={next.name} onClick={() => togglePick(next.id)} />
                  <div className="px-4 flex flex-wrap items-center gap-x-3"><StatusDot s={statusOf(next.id, istDate, statusFile, now)} />{hasPass(next.id) && <PassMark />}<Surge c={xLive.crowd[next.id]} now={now} /><GoHint c={xLive.crowd[next.id]} now={now} /></div>
                  <p className="px-4 t-foot muted mono-num mt-1">{next.precision === 'station' ? `Approximate${next.station ? ` · near ${next.station}` : ''}` : me ? <TravelLine t={travel(next)} /> : null}</p>
                  <div className="p-4 pt-3 flex gap-2 items-center">
                    <a href={uber(next)} className="btn btn-uber flex-1">Uber here</a>
                    <button onClick={() => setSkip(new Set(skip).add(next.id))} className="t-foot muted min-h-[44px] min-w-[44px] px-3" aria-label={`Skip ${next.name}`}>Skip</button>
                  </div>
                </article>}
                {rail.length > 0 && <ul className="rail mt-5 -mx-5 px-5" aria-label={`More in ${ZLABEL[zone]}`} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                  {rail.map(p => { const s = statusOf(p.id, istDate, statusFile, now)
                    return <li key={p.id} data-card data-zone={zoneOf(p)} data-approx={p.precision === 'station' || undefined} className="rail-item relative">
                      <PickBtn on={picked.includes(p.id)} name={p.name} onClick={() => togglePick(p.id)} />
                      <button onClick={() => setDetail(p.id)} aria-haspopup="dialog" className="block w-full text-left">
                        <span className="relative block"><Photo p={p} x={xLive} />
                          <span className="rail-marks">{isOpen(s) && <span className="rail-dot" title={s!.label} />}{hasPass(p.id) && <span className="rail-pass"><PassGlyph /></span>}</span></span>
                        <span className="block t-body font-medium mt-2 line-clamp-2 leading-snug min-h-[2.75em]">{p.name}</span>
                        <span className="sr-only">{[s?.label, hasPass(p.id) ? 'Pujor Passport' : null].filter(Boolean).join(', ')}</span>
                        {p.precision !== 'station' && me && <span className="block mt-0.5"><TravelLine t={p.t} compact /></span>}
                      </button>
                    </li> })}
                  {routeUrl && <li className="rail-item rail-end"><a href={routeUrl} target="_blank" rel="noopener" className="btn btn-walk w-full">Walk all in Maps</a><button onClick={share} className="btn btn-quiet w-full mt-2" aria-label="Share route">Share</button></li>}
                </ul>}
                <div className="mt-8 border-t hair pt-4">
                {cs.length > 0 && <div className="flex gap-2 " role="group" aria-label="Filter">{cs.map(c =>
                  <button key={c.key} aria-pressed={c.on} onClick={() => setFilters({ ...filters, [c.key]: !c.on })} className={`chip ${c.on ? 'chip-on' : ''}`}>
                    {c.key === 'open' ? <span className="w-2 h-2 rounded-full" style={{ background: c.on ? 'currentColor' : 'var(--sindoor)' }} /> : <PassGlyph />}{c.key === 'open' ? 'Open' : 'Pass'}<span className="mono-num chip-n">{c.n}</span></button>)}</div>}
                                  <div className="flex gap-2 mt-3">{['Food', 'Toilets', 'Help'].map((t, i) => <button key={t} className="btn btn-quiet flex-1" aria-haspopup="dialog" onClick={() => setTab(i + 1)}>{t}</button>)}</div>
                  {live && <a href={live.link} target="_blank" rel="noopener" className="now-strip mt-3"><span className="now-dot" /><span className="flex-1 line-clamp-2">{live.title}</span></a>}
                  {skip.size > 0 && <button className="text-[14px] muted font-semibold mt-3 min-h-[44px]" onClick={() => setSkip(new Set())}>Reset {skip.size} skipped</button>}
                </div>
              </>
            })()}
            {tab > 0 && help && <>
              <div className="sheet-backdrop" onClick={() => setTab(0)} />
              <div className="sheet max-h-[88dvh] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label={['', 'Food', 'Toilets', 'Help'][tab]} {...dragToClose(() => setTab(0))}>
                <div className="grabber" />
                <div className="flex items-start justify-between gap-3"><h2 className="t-title">{['', 'Food', 'Toilets', 'Help'][tab]}</h2>
                  <button onClick={() => setTab(0)} className="close-x mt-0.5" aria-label="Close"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button></div>
            {tab === 1 && help && <AmenityList items={help.food} empty="Nothing mapped nearby." meta={f => [f.notable ? 'Kolkata classic' : null, f.cuisine && f.cuisine[0].toUpperCase() + f.cuisine.slice(1)].filter(Boolean).join(' · ')} />}
                        {tab === 2 && help && <AmenityList items={help.toilets} empty="None mapped nearby." meta={t => [t.fee === 'yes' ? 'Paid' : t.fee === 'no' ? 'Free' : null].filter(Boolean).join('')} />}
            {tab === 3 && help && (
              <div className="mt-4 space-y-3">
                <div className="card p-4"><div className="flex gap-2"><a className="btn btn-primary flex-1" href="tel:112">Call 112</a><a className="btn btn-ghost flex-1" href="tel:100">Police 100</a></div></div>
                {help.station && <AmenityList items={[{ ...help.station, id: 'st', name: `${help.station.name} metro`, dist: help.station.dist }] as any} empty="" meta={() => 'Metro'} />}
                <AmenityList items={help.medical} empty="Nothing mapped nearby." meta={m => (m.kind === 'police' ? 'Police' : 'Medical')} />
              </div>
            )}
              </div>
            </>}

          </>)}
          {detail && (() => { const p = P.located.find(x => x.id === detail); if (!p) return null
            const st = statusOf(p.id, istDate, statusFile, now), posts = postsOf(xLive, p.id)
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
                    <div className="flex flex-wrap items-center gap-x-3 mt-1"><StatusDot s={st} /><Surge c={xLive.crowd[p.id]} now={now} /></div>
                  </div>
                  <button onClick={() => setDetail(null)} className="close-x mt-0.5" aria-label="Close"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button>
                </div>
                {p.reason && <p className="t-sub mt-3">{p.reason}</p>}
                <p className="t-foot muted mono-num mt-2">{p.precision === 'station' ? `Approximate, near ${p.station}` : me ? <TravelLine t={travel(p)} /> : null}{loo ? ` · Toilet ${fmtDist(loo.dist)}` : ''}</p>
                {(() => { const r = roadNote(p.id, xLive.roads, trafficFile ?? undefined, now); return r && <p className="road-note t-foot mt-2">{r.url ? <a href={r.url} target="_blank" rel="noopener">{r.text}</a> : r.text}<span className="muted"> · {ago(now - Date.parse(r.at))}{r.url ? '' : ' · TomTom'}</span></p> })()}
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

      {view && plan && !picking && picked.length >= 2 && <button className="walk-pill" onClick={() => setWalkOpen(true)}>Walk {picked.length}</button>}
      {walkOpen && (() => { const ps = picked.map(id => P.located.find(p => p.id === id)).filter(Boolean) as typeof P.located
        const start: LatLng = me ?? view ?? ZONE_ANCHOR.central
        const w = planWalk(start, ps, { cost: (a, b) => roadEstimate(roads, a, b).walkM / (TRAVEL.walkMps * 60), closed: id => statusOf(id, istDate, statusFile, now)?.key === 'closed', later: id => goHint(xLive.crowd[id], now)?.word === 'Later' })
        const legs = w.stops.length ? walkLegs(start, w.stops) : [], hopMin = (i: number) => Math.max(1, Math.round(roadEstimate(roads, i ? w.stops[i - 1] : start, w.stops[i]).walkM / (TRAVEL.walkMps * 60)))
        const name = (id: string) => P.located.find(p => p.id === id)?.name ?? id
        return <>
          <div className="sheet-backdrop" onClick={() => setWalkOpen(false)} />
          <div className="sheet max-h-[88dvh] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Walk" {...dragToClose(() => setWalkOpen(false))}>
            <div className="grabber" />
            <div className="flex items-start justify-between gap-3">
              <h2 className="t-title">Walk · <span className="mono-num">{w.totalMin} min</span></h2>
              <button onClick={() => setWalkOpen(false)} className="close-x mt-0.5" aria-label="Close"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></button>
            </div>
            <ol className="mt-4">{w.stops.map((p, i) => <li key={p.id} className="flex items-center gap-3 py-3 border-b hair last:border-b-0">
              <span className="stop-n mono-num" style={{ color: i === 0 ? 'var(--sindoor)' : 'var(--muted)' }}>{i + 1}</span>
              <span className="flex-1 min-w-0 t-body font-medium truncate">{p.name}</span>
              <span className="t-foot muted mono-num">{hopMin(i)} min</span></li>)}</ol>
            {(w.closed.length > 0 || w.approx.length > 0) && <p className="t-foot muted mt-3">Left out: {[...w.closed.map(id => `${name(id)} (closed)`), ...w.approx.map(id => `${name(id)} (no exact location)`)].join(', ')}</p>}
            <div className="mt-5 space-y-2">{legs.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener" className="btn btn-walk w-full">{legs.length > 1 ? `Google Maps · part ${i + 1} of ${legs.length}` : 'Open in Google Maps'}</a>)}
              <button className="btn btn-quiet w-full" onClick={() => { clearPicked(); setWalkOpen(false) }}>Clear</button></div>
          </div>
        </> })()}
      {view && plan && !picking && (
        <div className="dock dock-solid fixed inset-x-0 bottom-0 z-20 safe-b px-5 pt-3">
          <div className="mx-auto max-w-[560px]"><ZoneSwitch zone={plan?.outOfRange ? null : zone ?? ownZone ?? 'north'} onChange={setZone} mine={ownZone} /></div>
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
// Busy = a touch/scroll in the last 1.2 s, tracked with a timer (not a clock read, so a changed or frozen clock can't stall reordering).
function useStableOrder() {
  const shown = useRef<string[]>([]), [, kick] = useState(0), busy = useRef(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const mark = () => { busy.current = true; clearTimeout(t); t = setTimeout(() => { busy.current = false; kick(k => k + 1) }, 1200) }
    const evs = ['touchstart', 'touchmove', 'scroll', 'wheel', 'pointerdown'] as const
    evs.forEach(e => window.addEventListener(e, mark, { passive: true }))
    return () => { evs.forEach(e => window.removeEventListener(e, mark)); clearTimeout(t) }
  }, [])
  return <T extends { id: string }>(next: T[]): T[] => {
    const ids = next.map(x => x.id), same = ids.length === shown.current.length && ids.every(id => shown.current.includes(id))
    if (!same || !busy.current) { shown.current = ids; return next }
    const by = new Map(next.map(x => [x.id, x])); return shown.current.map(id => by.get(id)!)
  }
}
/** Card photo: newest visitor photo from X, else a quiet tinted tile with the initial. */
function Photo({ p, x, big }: { p: { id: string; name: string }; x: XLive; big?: boolean }) {
  const src = postsOf(x, p.id).find(q => q.photo)?.photo, [bad, setBad] = useState(false)
  return <span className={`photo block ${big ? 'photo-big' : ''}`}>{src && !bad
    ? <img src={sized(src, big ? 'medium' : 'small')} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} />
    : <span className="photo-ph" aria-hidden="true" />}</span>
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
function PassGlyph() {
  return <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0"><path d="M1.75 4.25a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v1.1a1.65 1.65 0 0 0 0 3.3v1.1a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-1.1a1.65 1.65 0 0 0 0-3.3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8.75 3.5v1.1M8.75 6.45v1.1M8.75 9.4v1.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
}
function PassMark() {
  return <span className="pass-mark"><PassGlyph /><span aria-hidden="true">Pass</span><span className="sr-only">Pujor Passport</span></span>
}
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
function ZoneSwitch({ zone, onChange, mine }: { zone: Zone | null; onChange: (z: Zone) => void; mine?: Zone | null }) {
  const order = zoneOrder(mine ?? null)
  return <Segmented label="Zone" value={zone ? order.indexOf(zone) : -1} onChange={i => onChange(order[i])}
    items={order.map(z => <>{ZLABEL[z]}{mine === z && <span aria-label="you are here" className="seg-here" />}</>)} />
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
type TrafficLive = TrafficFile & { pandals?: Record<string, { ratio: number; at: string }>; updated?: string }
type XLive = { posts: Record<string, XPost[] | XPost>; crowd: Record<string, { at: string; url: string; label?: string; kind?: string; n?: number; w?: number }>; roads?: RoadSig[]; area?: { area: string; zone: string; kind: string; label: string; at: string; url: string; n?: number }[] }
/** A live crowd word, only for a real surge (corroborated on X, < 90 min, still weighty). Links to the post, says how old. */
function Surge({ c, now }: { c?: XLive['crowd'][string]; now: number }) {
  if (!c || c.kind === 'clear' || now - Date.parse(c.at) > 90 * 60e3 || (c.w ?? 1) < 0.3) return null
  return <a href={c.url} target="_blank" rel="noopener" className="surge t-foot"><i aria-hidden="true" />{c.label ?? 'Crowded'} · {ago(now - Date.parse(c.at))}</a>
}
/** 'Later' / 'Go now' only when live X evidence supports it. */
function GoHint({ c, now }: { c?: XLive['crowd'][string]; now: number }) {
  const h = goHint(c, now); if (!h) return null
  return <a href={h.url} target="_blank" rel="noopener" className={`go-hint t-foot ${h.word === 'Later' ? 'later' : 'now'}`}>{h.word}</a>
}
/** Car and walk minutes, one quiet line. Walk only when it is sane on foot. "~" when it is the straight-line fallback. */
function TravelLine({ t, compact }: { t: Travel & { traffic?: boolean }; compact?: boolean }) {
  const a = t.basis === 'estimate' ? '~' : '', walk = t.walkMin <= 45
  const Car = <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1.1-3a.7.7 0 0 0-.7-.5H9a.7.7 0 0 0-.7.5L7.2 11z"/></svg>
  const Walk = <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9.8 8.9 7 22h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 12v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6a2 2 0 0 0-2.5-.8L6 7.3V12h2V8.6l1.8-.7z"/></svg>
  return <span className={`inline-flex items-center gap-2.5 mono-num ${compact ? 'text-[14px]' : 'text-[15px]'} muted`} aria-label={`${a}${t.carMin} minutes by car${walk ? `, ${t.walkMin} minutes on foot` : ''}`}>
    <span className={`inline-flex items-center gap-1 ${t.traffic ? 'traffic' : ''}`} title={t.traffic ? 'Live traffic (TomTom)' : undefined}>{Car}{a}{t.carMin} min</span>
    {walk && <span className="inline-flex items-center gap-1">{Walk}{a}{t.walkMin} min</span>}
  </span>
}
const NO_LIVE: Record<string, Travel> = {}
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
function Notice({ children, tone }: { children: React.ReactNode; tone: 'gold' }) {
  return <p className={`mt-4 text-[14.5px] rounded-[12px] px-4 py-3 tag-${tone}`} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{children}</p>
}
function PickBtn({ on, name, onClick }: { on: boolean; name: string; onClick: () => void }) {
  return <button onClick={onClick} aria-pressed={on} aria-label={on ? `Remove ${name} from walk` : `Add ${name} to walk`} className={`pick ${on ? 'pick-on' : ''}`}>
    <span className="pick-dot">{on && <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>
  </button>
}
