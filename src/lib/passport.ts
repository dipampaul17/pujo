import pass from '../data/passport.json'
const IDS = new Set<string>(pass.ids)
export const hasPass = (id: string) => IDS.has(id)
