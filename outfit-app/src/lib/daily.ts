import { rankOutfits, type Ctx, type Ranked } from './generator'
import { hashSeed } from './rng'
import type { Item } from './types'

/** Outfit des Tages: bleibt für Person und Datum gleich, `reroll` blättert weiter. */
export function dailyOutfit(
  wardrobe: Item[],
  ctx: Ctx,
  userId: string,
  date: string,
  reroll = 0,
): Ranked | null {
  const ranked = rankOutfits(wardrobe, ctx, hashSeed(`${userId}|${date}`))
  if (ranked.length === 0) return null
  return ranked[reroll % ranked.length]
}
