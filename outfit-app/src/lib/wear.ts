import { daysBetween, type Item, type Outfit } from './types'

export interface WearStat {
  count: number
  last: string | null
  costPerWear: number | null
}

export function wearStats(items: Item[], outfits: Outfit[]): Map<string, WearStat> {
  const stats = new Map<string, WearStat>()
  for (const i of items) stats.set(i.id, { count: 0, last: null, costPerWear: null })
  for (const o of outfits) {
    if (!o.worn) continue
    for (const id of o.item_ids) {
      const s = stats.get(id)
      if (!s) continue
      s.count++
      if (!s.last || o.date > s.last) s.last = o.date
    }
  }
  for (const i of items) {
    const s = stats.get(i.id)!
    if (i.price != null && s.count > 0) s.costPerWear = Math.round((i.price / s.count) * 100) / 100
  }
  return stats
}

/** Teile, die seit ≥ 90 Tagen nicht getragen wurden – oder noch nie, obwohl sie ≥ 30 Tage da sind. */
export function neglected(items: Item[], outfits: Outfit[], today: string): Item[] {
  const stats = wearStats(items, outfits)
  const idle = (i: Item) => {
    const last = stats.get(i.id)!.last
    return last ? daysBetween(last, today) : daysBetween(i.created_at.slice(0, 10), today)
  }
  return items
    .filter((i) => !i.is_wishlist)
    .filter((i) => (stats.get(i.id)!.last ? idle(i) >= 90 : idle(i) >= 30))
    .sort((a, b) => idle(b) - idle(a))
}

/** Teile, die in den letzten `days` Tagen (ohne heute) getragen wurden. */
export function recentIds(outfits: Outfit[], today: string, days = 7): Set<string> {
  const ids = new Set<string>()
  for (const o of outfits) {
    if (!o.worn) continue
    const age = daysBetween(o.date, today)
    if (age >= 1 && age <= days) o.item_ids.forEach((id) => ids.add(id))
  }
  return ids
}
