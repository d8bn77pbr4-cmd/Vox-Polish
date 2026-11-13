import { pairHarmony } from './color'
import { complete, coresOf, mainColor, scoreOutfit, VALID_SCORE, type Ctx } from './generator'
import { mulberry32 } from './rng'
import type { Item } from './types'

export interface PurchaseResult {
  /** So viele tragbare Outfits ergibt das Teil mit dem Schrank. */
  count: number
  top: { items: Item[]; score: number }[]
  /** Wie gut die Farbe zum restlichen Schrank passt, 0–100. */
  colorFit: number
}

/** Lohnt sich der Kauf? Zählt, wie oft sich das Teil mit dem Schrank kombinieren lässt. */
export function purchaseCheck(candidate: Item, wardrobe: Item[], ctx: Ctx): PurchaseResult {
  const own = wardrobe.filter((i) => !i.is_wishlist && i.id !== candidate.id)
  // Wetter und „kürzlich getragen“ sagen nichts über einen Kauf aus.
  const neutral: Ctx = {
    ...ctx,
    weather: null,
    recentIds: new Set(),
    season: candidate.seasons.includes(ctx.season) ? ctx.season : (candidate.seasons[0] ?? ctx.season),
  }
  const others = (c: Item['category']) => own.filter((i) => i.category === c)

  let bases: Item[][]
  switch (candidate.category) {
    case 'top':
      bases = others('bottom').map((b) => [candidate, b])
      break
    case 'bottom':
      bases = others('top').map((t) => [t, candidate])
      break
    case 'dress':
      bases = [[candidate]]
      break
    default: {
      const { cores, partial } = coresOf(own, mulberry32(1))
      bases = partial ? [] : cores.map((core) => [...core, candidate])
    }
  }

  const combos = bases
    .map((base) => {
      const items = complete(base, own, neutral)
      return { items, score: scoreOutfit(items, neutral) }
    })
    .filter((c) => c.score >= VALID_SCORE)
    .sort((a, b) => b.score - a.score)

  const rest = own.filter((i) => i.category !== candidate.category && i.category !== 'accessory')
  const fit = rest.length
    ? rest.reduce((sum, i) => sum + pairHarmony(mainColor(candidate), mainColor(i)), 0) / rest.length
    : 0

  return { count: combos.length, top: combos.slice(0, 3), colorFit: Math.round(fit * 100) }
}
