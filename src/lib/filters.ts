export type Filters = { open: boolean; pass: boolean }
export type FilterKey = keyof Filters
type Keep = Record<FilterKey, (id: string) => boolean>
export const NO_FILTERS: Filters = { open: false, pass: false }
export const applyFilters = <T extends { id: string }>(l: T[], f: Filters, k: Keep) =>
  l.filter(x => (!f.open || k.open(x.id)) && (!f.pass || k.pass(x.id)))
/** Chips worth showing: active ones, plus any that would narrow the list without emptying it. n = rows with that chip on. */
export function chips<T extends { id: string }>(l: T[], f: Filters, k: Keep) {
  const cur = applyFilters(l, f, k).length
  return (['open', 'pass'] as FilterKey[]).map(key => ({ key, n: applyFilters(l, { ...f, [key]: true }, k).length, on: f[key] }))
    .filter(c => c.on || (c.n > 0 && c.n < cur))
}
