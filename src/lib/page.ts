/** Zone page = one "go next" pick + a rail of the rest. Each pandal appears exactly once; the pick must be in the (filtered) list. */
export function pagePicks<T extends { id: string }>(route: { id: string }[], listed: T[]): { next: T | null; rail: T[] } {
  const ids = new Set(listed.map(x => x.id)), lead = route.find(r => ids.has(r.id))?.id ?? listed[0]?.id
  const next = listed.find(x => x.id === lead) ?? null
  return { next, rail: listed.filter(x => x.id !== lead) }
}
