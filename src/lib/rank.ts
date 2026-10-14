import { zoneOf, isOpen, type Pandal, type Status, type Zone } from './plan'
import type { Travel } from './roads'
import { haversine, orderRoute, type LatLng } from './geo'

/** Recommender weights: the only tuning surface. See README "Recommender". */
export const REC = {
  retrieveMaxCarMin: 30,  // stage 1: road-time radius…
  retrieveMinK: 15,       // …but never fewer than this many candidates
  pOpen: { open: 1, inaugurated: 0.9, likely: 0.8, closed: 0, unknown: 0.7 } as Record<string, number>,
  openBonus: 1.5,         // sticky: confirmed open by visitors beats a slightly grander maybe
  passBonus: 0.6,         // Pujor Passport: skip the queue, second to open
  appeal: 1,              // × worth (2026 grandeur + buzz, 0–7, from the guide + X/news signals)
  minuteCost: 0.45,       // value lost per minute of travel
  walkDiscount: 0.7,      // a short walk (< walkMaxM) costs less than a cab minute
  walkMaxM: 1000,
  rainCost: 1.5,          // rain: travel minutes cost more
  surge: 2.5, surgeMin: 90,    // live crowd surge on X in the last 90 min, × decayed weight (≤1.5)
  clear: 0.8,                  // fresh first-hand "no queue / not crowded" posts
  roadClosed: 0.8,             // police/X road closure or jam within 400 m
  fresh: 0.8, freshMin: 120,   // a new visitor post in the last 2 h
  seen: 10,               // opened / "I'm here": demote, they've been
  approxPin: 3,          // pin is only the metro station: lean away a little…
  approxFloorMin: 10,    // …and never treat it as closer than this, its real spot is unknown
  laneM: 150,  lanePenalty: 1.2,            // stage 3: two picks closer than this are the same lane
}
export type RecContext = {
  here: LatLng; now: number; status: (id: string) => Status; travel: (p: Pandal) => Travel
  live: { crowd: Record<string, Crowd>; closed: Set<string>; freshPosts: Record<string, number> }
  seen: Set<string>; rain: boolean; pass?: (id: string) => boolean
  roadIssue?: Set<string>
}
export type Crowd = { at: string; kind?: string; w?: number; url?: string; label?: string }
/** 'Later' on a fresh, corroborated surge; 'Go now' only on fresh first-hand "little crowd" posts. Otherwise nothing. */
export function goHint(c: Crowd | undefined, now: number): { word: 'Later' | 'Go now'; at: string; url?: string } | null {
  if (!c) return null
  const age = (now - Date.parse(c.at)) / 60e3, w = c.w ?? 1
  if ((c.kind === 'crowd' || c.kind === 'queue' || c.kind === 'closed') && age < 60 && w >= 0.5) return { word: 'Later', at: c.at, url: c.url }
  if (c.kind === 'clear' && age < 45 && w >= 0.5) return { word: 'Go now', at: c.at, url: c.url }
  return null
}
export type RoadSig = { road: string; label: string; kind: string; at: string; url: string; near: string[] }
/** One road note for the sheet: newest corroborated X road report (police alone suffices) near this pandal, ≤ 2 h old. */
export function roadNote(id: string, roads: RoadSig[] | undefined, now: number): { text: string; at: string; url: string } | null {
  const x = (roads ?? []).filter(r => r.near.includes(id) && now - Date.parse(r.at) < 2 * 3600e3).sort((a, b) => b.at.localeCompare(a.at))[0]
  return x ? { text: `${x.label} on ${x.road}`, at: x.at, url: x.url } : null
}
export type Rec = { p: Pandal; t: Travel; score: number; why: string[] }

export const istHour = (t: number) => new Date(t + 5.5 * 3600e3).getUTCHours()

export function recommend(ps: Pandal[], c: RecContext): Rec[] {
  // Stage 1: retrieval. Drop closed, keep everything within the road-time radius (or the nearest K).
  const all = ps.filter(p => !c.live.closed.has(p.id) && c.status(p.id)?.key !== 'closed').map(p => ({ p, t: c.travel(p) }))
  all.sort((a, b) => a.t.carMin - b.t.carMin || a.p.id.localeCompare(b.p.id))
  const cand = all.filter((x, i) => i < REC.retrieveMinK || x.t.carMin <= REC.retrieveMaxCarMin)
  // Stage 2: multi-objective value.
  const mult = c.rain ? REC.rainCost : 1
  const scored = cand.map(({ p, t }) => {
    const s = c.status(p.id), key = s?.key ?? 'unknown', why: string[] = []
    const approx = p.precision === 'station', walk = !approx && t.walkM < REC.walkMaxM
    const minutes = approx ? Math.max(REC.approxFloorMin, t.carMin) : walk ? t.walkMin * REC.walkDiscount : t.carMin
    let score = (REC.pOpen[key] ?? REC.pOpen.unknown) * REC.appeal * (p.worth ?? 0) - REC.minuteCost * mult * minutes
    if (isOpen(s)) { score += REC.openBonus; why.push('open') }
    if (c.pass?.(p.id)) { score += REC.passBonus; why.push('pass') }
    if (p.precision === 'station') score -= REC.approxPin
    if ((p.worth ?? 0) >= 3) why.push('2026 favourite')
    why.push(walk ? `${t.walkMin} min walk` : `${t.carMin} min by car`)
    const cr = c.live.crowd[p.id]
    if (cr && c.now - Date.parse(cr.at) < REC.surgeMin * 60e3) {
      if (cr.kind === 'clear') { score += REC.clear * Math.min(1, cr.w ?? 1); why.push('little crowd') }
      else { score -= REC.surge * Math.min(1.5, cr.w ?? 1); why.push('crowded now') }
    }
    if (c.roadIssue?.has(p.id)) { score -= REC.roadClosed; why.push('road closure nearby') }
    const fr = c.live.freshPosts[p.id]; if (fr && c.now - fr < REC.freshMin * 60e3) { score += REC.fresh; why.push('new posts') }
    if (c.seen.has(p.id)) { score -= REC.seen; why.push('seen') }
    return { p, t, score, why }
  }).sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
  // Stage 3: re-rank for diversity. Greedy: a pick in the same lane as an earlier pick waits until the rest are placed.
  // Soft MMR: each earlier pick in the same lane costs lanePenalty, so a cluster can't fill the list but a real neighbour still can.
  const out: Rec[] = [], pool = [...scored]
  while (pool.length) {
    let bi = 0, bv = -Infinity
    pool.forEach((r, i) => { const v = r.score - REC.lanePenalty * out.filter(o => haversine(o.p, r.p) <= REC.laneM).length; if (v > bv) { bv = v; bi = i } })
    out.push(pool.splice(bi, 1)[0])
  }
  return out
}

/** Browse list: the ranked picks, then everything retrieval left out (by car time), closed last. Every pandal appears once. */
export function listAll(ps: Pandal[], c: RecContext): Rec[] {
  const top = recommend(ps, c), got = new Set(top.map(r => r.p.id))
  const isClosed = (p: Pandal) => c.live.closed.has(p.id) || c.status(p.id)?.key === 'closed'
  const rest = ps.filter(p => !got.has(p.id)).map(p => ({ p, t: c.travel(p), score: -Infinity, why: [] as string[] }))
    .sort((a, b) => Number(isClosed(a.p)) - Number(isClosed(b.p)) || a.t.carMin - b.t.carMin || a.p.id.localeCompare(b.p.id))
  return [...top, ...rest]
}

/** Route: start at the best-ranked pick (so an Open pandal leads over a closer unknown), then walk the rest nearest-first from there. */
export function routeStops<T extends LatLng>(ranked: T[]): T[] {
  if (ranked.length <= 1) return [...ranked]
  const [lead, ...rest] = ranked
  return [lead, ...orderRoute(lead, rest)]
}

/** A zone tab: exactly the pandals whose coordinates fall in that zone. With a live fix, ordered by drive time from me
 *  open first, then pass, then shortest drive (approximate pins after pinned); without one, nearest to the zone's anchor station first. Closed pandals go last. */
export function zoneTab<T extends Pandal>(ps: T[], zone: Zone, c: { me: LatLng | null; anchor: LatLng; travel: (p: T) => Travel; pass: (id: string) => boolean; open: (id: string) => boolean; closed: (id: string) => boolean }): T[] {
  const key = (p: T) => c.me
    ? [c.closed(p.id) ? 1 : 0, p.precision === 'station' ? 1 : 0, c.open(p.id) ? 0 : c.pass(p.id) ? 1 : 2, 0, c.travel(p).carMin]
    : [c.closed(p.id) ? 1 : 0, 0, 0, 0, haversine(c.anchor, p)]
  return ps.filter(p => zoneOf(p) === zone).map(p => ({ p, k: key(p) }))
    .sort((a, b) => { for (let i = 0; i < 5; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return a.p.name.localeCompare(b.p.name) }).map(x => x.p)
}

/** Route candidates: within 6 km of the start, inside the tab's zone only, minus skipped. */
export function routePool<T extends Pandal>(ps: T[], at: LatLng, zone: Zone | null, skip: Set<string>, keep?: (id: string) => boolean): T[] {
  // A walking route needs real pins: approximate (metro-station) pins are listed, never walked to.
  return ps.filter(p => haversine(at, p) < 6000 && !skip.has(p.id) && p.precision !== 'station' && (!zone || zoneOf(p) === zone) && (!keep || keep(p.id)))
}
