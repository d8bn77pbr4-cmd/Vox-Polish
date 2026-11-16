import { pairHarmony } from './color'
import { mulberry32, shuffled } from './rng'
import type { Item, Outfit, Season, Weather } from './types'
import { needsOuterwear, targetWarmth } from './weather'

export interface Ctx {
  weather: Weather | null
  season: Season
  /** Teile, die in den letzten Tagen getragen wurden. */
  recentIds: Set<string>
  /** Gelernte Vorlieben aus 👍/👎, siehe buildAffinity. */
  affinity: Map<string, number>
}

export interface Ranked {
  items: Item[]
  score: number
  /** true, wenn dem Schrank ein Oberteil oder Unterteil für ein ganzes Outfit fehlt. */
  partial: boolean
}

/** Ab dieser Punktzahl zählt eine Kombination im Kauf-Check als tragbar. */
export const VALID_SCORE = 55
const MAX_CORES = 600

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
export const mainColor = (item: Item) => item.colors[0]?.hex ?? '#888888'
const isPatterned = (item: Item) => !!item.pattern && item.pattern.toLowerCase() !== 'uni'
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Summiert Bewertungen je Teil und je Teile-Paar, begrenzt auf ±2. */
export function buildAffinity(outfits: Outfit[]): Map<string, number> {
  const map = new Map<string, number>()
  const add = (k: string, v: number) => map.set(k, Math.max(-2, Math.min(2, (map.get(k) ?? 0) + v)))
  for (const o of outfits) {
    if (!o.rating) continue
    const ids = o.item_ids
    for (let i = 0; i < ids.length; i++) {
      add(ids[i], o.rating)
      for (let j = i + 1; j < ids.length; j++) add(pairKey(ids[i], ids[j]), o.rating)
    }
  }
  return map
}

/** Bewertet eine Kombination mit 0–100 Punkten. */
export function scoreOutfit(items: Item[], ctx: Ctx): number {
  if (items.length === 0) return 0
  const core = items.filter((i) => i.category === 'top' || i.category === 'bottom' || i.category === 'dress')
  const garments = items.filter((i) => i.category !== 'accessory')
  const coreWarmth = (core.length ? core : garments.length ? garments : items).map((i) => i.warmth)

  // Wärme (30): passt zum Wetter, oder – ohne Wetter – passt in sich zusammen.
  let warmth: number
  if (ctx.weather) {
    const t = ctx.weather.tMax * 0.7 + ctx.weather.tMin * 0.3
    const worn = avg(coreWarmth) + (items.some((i) => i.category === 'outerwear') ? 0.75 : 0)
    warmth = Math.max(0, 30 - 12 * Math.abs(worn - targetWarmth(t)))
  } else {
    const spread = Math.max(...coreWarmth) - Math.min(...coreWarmth)
    warmth = Math.max(0, 30 - 10 * Math.max(0, spread - 1))
  }

  // Farbe (30): Durchschnitt aller Paare, ein zweites Muster kostet Punkte.
  const harmonies: number[] = []
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      harmonies.push(pairHarmony(mainColor(items[i]), mainColor(items[j])))
  let color = 30 * (harmonies.length ? avg(harmonies) : 0.9)
  if (items.filter(isPatterned).length > 1) color -= 8

  // Formalität (15): Sneaker zum Abendkleid kostet Punkte.
  const forms = (garments.length ? garments : items).map((i) => i.formality)
  const formality = Math.max(0, 15 - 6 * Math.max(0, Math.max(...forms) - Math.min(...forms) - 1))

  // Saison (5)
  const offSeason = items.filter((i) => i.seasons.length > 0 && !i.seasons.includes(ctx.season)).length
  const season = Math.max(0, 5 - 2.5 * offSeason)

  // Frische (10): nicht schon wieder dasselbe.
  const fresh = Math.max(0, 10 - 5 * items.filter((i) => ctx.recentIds.has(i.id)).length)

  // Vorlieben (10): Paare zählen voll, einzelne Teile halb – ein 👎 gilt vor allem der Kombination.
  let liked = 0
  let weight = 0
  for (let i = 0; i < items.length; i++) {
    const own = ctx.affinity.get(items[i].id)
    if (own !== undefined) {
      liked += own * 0.5
      weight += 0.5
    }
    for (let j = i + 1; j < items.length; j++) {
      const pair = ctx.affinity.get(pairKey(items[i].id, items[j].id))
      if (pair !== undefined) {
        liked += pair
        weight += 1
      }
    }
  }
  const taste = 5 + 2.5 * (weight ? liked / weight : 0)

  const total = warmth + color + formality + season + fresh + taste
  return Math.round(Math.max(0, Math.min(100, total)) * 10) / 10
}

/** Alle Grund-Kombinationen: Oberteil + Unterteil oder ein Kleid. */
export function coresOf(own: Item[], rnd: () => number): { cores: Item[][]; partial: boolean } {
  const tops = own.filter((i) => i.category === 'top')
  const bottoms = own.filter((i) => i.category === 'bottom')
  const dresses = own.filter((i) => i.category === 'dress')
  let cores: Item[][] = dresses.map((d) => [d])
  for (const t of tops) for (const b of bottoms) cores.push([t, b])
  let partial = false
  if (cores.length === 0) {
    partial = true
    cores = [...tops, ...bottoms].map((i) => [i])
  }
  if (cores.length > MAX_CORES) cores = shuffled(cores, rnd).slice(0, MAX_CORES)
  return { cores, partial }
}

function bestAddition(base: Item[], options: Item[], ctx: Ctx): Item | null {
  let best: Item | null = null
  let bestScore = -1
  for (const o of options) {
    const s = scoreOutfit([...base, o], ctx)
    if (s > bestScore) {
      bestScore = s
      best = o
    }
  }
  return best
}

/** Ergänzt eine Grund-Kombination um Schuhe und – bei Kälte oder Regen – eine Jacke. */
export function complete(core: Item[], own: Item[], ctx: Ctx): Item[] {
  const items = core.slice()
  const has = (c: Item['category']) => items.some((i) => i.category === c)
  if (!has('shoes')) {
    const shoe = bestAddition(items, own.filter((i) => i.category === 'shoes'), ctx)
    if (shoe) items.push(shoe)
  }
  if (!has('outerwear') && ctx.weather && needsOuterwear(ctx.weather)) {
    const jacket = bestAddition(items, own.filter((i) => i.category === 'outerwear'), ctx)
    if (jacket) items.push(jacket)
  }
  return items
}

/**
 * Beste Outfits zuerst. Derselbe Startwert liefert dieselbe Reihenfolge; ein anderer Tag
 * mischt unter ähnlich guten Outfits neu. Aufeinanderfolgende Einträge teilen sich möglichst
 * kein Oberteil, Unterteil oder Kleid, damit „neu würfeln“ wirklich etwas anderes zeigt.
 */
export function rankOutfits(wardrobe: Item[], ctx: Ctx, seed: number, limit = 30): Ranked[] {
  const rnd = mulberry32(seed)
  const own = wardrobe.filter((i) => !i.is_wishlist)
  const { cores, partial } = coresOf(own, rnd)
  const accessories = own.filter((i) => i.category === 'accessory')

  const pool = cores.map((core) => {
    const items = complete(core, own, ctx)
    if (accessories.length && rnd() < 0.5) {
      const extra = bestAddition(items, accessories, ctx)
      if (extra && scoreOutfit([...items, extra], ctx) >= scoreOutfit(items, ctx) - 2) items.push(extra)
    }
    const score = scoreOutfit(items, ctx)
    return { items, score, partial, order: score + rnd() * 6, coreIds: core.map((i) => i.id) }
  })
  pool.sort((a, b) => b.order - a.order)

  const out: Ranked[] = []
  let prev: string[] = []
  while (pool.length && out.length < limit) {
    let idx = pool.findIndex((p) => !p.coreIds.some((id) => prev.includes(id)))
    if (idx < 0) idx = 0
    const [pick] = pool.splice(idx, 1)
    out.push({ items: pick.items, score: pick.score, partial: pick.partial })
    prev = pick.coreIds
  }
  return out
}
