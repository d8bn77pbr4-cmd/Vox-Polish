import { describe, expect, it } from 'vitest'
import { colorFamily, hexToHsl, isNeutral, pairHarmony } from './color'
import { alphaBounds, clampBox, fitSize, maskCoverage, padBox, toPixels } from './crop'
import { labelsFor, maskFromLabelMap, soften } from './cutout/labels'
import { dailyOutfit } from './daily'
import { bodyGeometry, clampMeasurements, DEFAULT_MEASUREMENTS, placement, VIEW } from './doll'
import { buildAffinity, pairKey, rankOutfits, scoreOutfit, type Ctx } from './generator'
import { purchaseCheck } from './purchase'
import { hashSeed, mulberry32 } from './rng'
import type { Item, Outfit } from './types'
import { needsOuterwear, targetWarmth } from './weather'
import { neglected, recentIds, wearStats } from './wear'

let n = 0
function item(over: Partial<Item>): Item {
  n++
  return {
    id: over.id ?? `i${n}`,
    user_id: 'u',
    image_path: '',
    thumb_path: '',
    aspect: 1,
    name: `Teil ${n}`,
    category: 'top',
    subcategory: '',
    length: null,
    accessory_type: null,
    colors: [{ hex: '#ffffff', name: 'Weiß' }],
    pattern: 'uni',
    material: '',
    warmth: 3,
    formality: 2,
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    tags: [],
    price: null,
    is_wishlist: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}
function outfit(over: Partial<Outfit>): Outfit {
  return {
    id: 'o',
    user_id: 'u',
    date: '2026-11-10',
    item_ids: [],
    source: 'manual',
    rating: 0,
    worn: false,
    adjust: {},
    created_at: '',
    ...over,
  }
}
const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  weather: null,
  season: 'autumn',
  recentIds: new Set(),
  affinity: new Map(),
  ...over,
})
const col = (hex: string) => [{ hex, name: '' }]

describe('Farben', () => {
  it('rechnet Hex in Farbton um', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 1, l: 0.5 })
    expect(Math.round(hexToHsl('#00f').h)).toBe(240)
    expect(hexToHsl('kaputt').s).toBe(0)
  })
  it('erkennt neutrale Farben', () => {
    for (const hex of ['#000000', '#ffffff', '#8a8a8a', '#e3d5bd', '#1f2a44']) expect(isNeutral(hex)).toBe(true)
    for (const hex of ['#d32f2f', '#2e8b57', '#f2c200']) expect(isNeutral(hex)).toBe(false)
  })
  it('bewertet Farbpaare', () => {
    expect(pairHarmony('#000000', '#d32f2f')).toBe(1)
    expect(pairHarmony('#d32f2f', '#e0453a')).toBe(0.9) // Ton in Ton
    expect(pairHarmony('#d32f2f', '#2fd3d3')).toBe(0.8) // Komplementär
    expect(pairHarmony('#d32f2f', '#b8d32f')).toBe(0.35) // beißt sich
  })
  it('ordnet Farbfamilien zu', () => {
    expect(colorFamily('#111111')).toBe('Schwarz')
    expect(colorFamily('#3b62b8')).toBe('Blau')
    expect(colorFamily('#e3d5bd')).toBe('Beige')
  })
})

describe('Rahmen und Zuschnitt', () => {
  it('holt Rahmen ins Bild zurück', () => {
    const b = clampBox({ x: -0.2, y: 0.5, w: 0.6, h: 0.9 })!
    expect([b.x, b.y, b.h]).toEqual([0, 0.5, 0.5])
    expect(b.w).toBeCloseTo(0.4)
  })
  it('verwirft unbrauchbare Rahmen', () => {
    expect(clampBox({ x: 0.5, y: 0.5, w: 0, h: 0.4 })).toBeNull()
    expect(clampBox({ x: 1.4, y: 0.2, w: 0.3, h: 0.3 })).toBeNull()
    expect(clampBox({ x: NaN, y: 0, w: 1, h: 1 })).toBeNull()
    expect(clampBox(null)).toBeNull()
    expect(clampBox({ x: 0.1, y: 0.1 } as any)).toBeNull()
  })
  it('gibt Rand, ohne das Bild zu verlassen', () => {
    const b = padBox({ x: 0, y: 0.5, w: 0.5, h: 0.5 }, 0.1)
    expect(b.x).toBe(0)
    expect(b.w).toBeCloseTo(0.55)
    expect(b.y).toBeCloseTo(0.45)
    expect(b.y + b.h).toBeCloseTo(1)
  })
  it('rechnet in Pixel um', () => {
    expect(toPixels({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, 1000, 800)).toEqual({ x: 500, y: 200, w: 500, h: 400 })
    expect(toPixels({ x: 0.999, y: 0.999, w: 0.001, h: 0.001 }, 100, 100).w).toBeGreaterThanOrEqual(1)
  })
  it('verkleinert riesige Fotos, vergrößert nie', () => {
    expect(fitSize(4032, 3024, 1568)).toEqual({ w: 1568, h: 1176 })
    expect(fitSize(3024, 4032, 2048)).toEqual({ w: 1536, h: 2048 })
    expect(fitSize(800, 600, 1568)).toEqual({ w: 800, h: 600 })
  })
  it('findet die sichtbare Fläche', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4)
    data[(1 * 4 + 2) * 4 + 3] = 255
    data[(2 * 4 + 3) * 4 + 3] = 255
    expect(alphaBounds(data, 4, 4)).toEqual({ x: 2, y: 1, w: 2, h: 2 })
    expect(alphaBounds(new Uint8ClampedArray(64), 4, 4)).toBeNull()
    expect(maskCoverage(new Uint8Array([255, 0, 255, 0]))).toBe(0.5)
    expect(maskCoverage(new Uint8Array(0))).toBe(0)
  })
})

describe('Wetter', () => {
  it('leitet die nötige Wärme ab', () => {
    expect([30, 26, 22, 15, 8, 5, -3].map(targetWarmth)).toEqual([1, 1, 2, 3, 4, 4, 5])
  })
  it('weiß, wann eine Jacke nötig ist', () => {
    expect(needsOuterwear({ tMax: 12, tMin: 4, rainProb: 0, code: 0 })).toBe(true)
    expect(needsOuterwear({ tMax: 22, tMin: 14, rainProb: 70, code: 61 })).toBe(true)
    expect(needsOuterwear({ tMax: 22, tMin: 14, rainProb: 10, code: 1 })).toBe(false)
  })
})

describe('Zufall', () => {
  it('ist wiederholbar', () => {
    const a = mulberry32(hashSeed('u|2026-11-13'))
    const b = mulberry32(hashSeed('u|2026-11-13'))
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(hashSeed('u|2026-11-13')).not.toBe(hashSeed('u|2026-11-14'))
  })
})

describe('Outfit-Generator', () => {
  const white = item({ id: 'white', category: 'top', warmth: 2 })
  const red = item({ id: 'red', category: 'top', colors: col('#d32f2f'), warmth: 2 })
  const wool = item({ id: 'wool', category: 'top', colors: col('#444444'), warmth: 5 })
  const jeans = item({ id: 'jeans', category: 'bottom', colors: col('#1f2a44'), warmth: 3 })
  const lime = item({ id: 'lime', category: 'bottom', colors: col('#b8d32f'), warmth: 3 })
  const sneaker = item({ id: 'sneaker', category: 'shoes', formality: 1 })
  const coat = item({ id: 'coat', category: 'outerwear', colors: col('#222222'), warmth: 5 })
  const dress = item({ id: 'dress', category: 'dress', colors: col('#2e8b57'), formality: 4, warmth: 2 })

  it('zieht harmonische Farben vor', () => {
    expect(scoreOutfit([red, jeans], ctx())).toBeGreaterThan(scoreOutfit([red, lime], ctx()))
  })
  it('zieht bei Kälte warme Teile vor', () => {
    const cold = ctx({ weather: { tMax: 2, tMin: -3, rainProb: 0, code: 0 } })
    const hot = ctx({ weather: { tMax: 30, tMin: 20, rainProb: 0, code: 0 } })
    expect(scoreOutfit([wool, jeans], cold)).toBeGreaterThan(scoreOutfit([white, jeans], cold))
    expect(scoreOutfit([white, jeans], hot)).toBeGreaterThan(scoreOutfit([wool, jeans], hot))
  })
  it('bestraft Stilbruch, kürzlich Getragenes und zwei Muster', () => {
    const gown = item({ category: 'dress', formality: 5 })
    const heels = item({ category: 'shoes', formality: 5 })
    expect(scoreOutfit([gown, heels], ctx())).toBeGreaterThan(scoreOutfit([gown, sneaker], ctx()))
    expect(scoreOutfit([white, jeans], ctx())).toBeGreaterThan(
      scoreOutfit([white, jeans], ctx({ recentIds: new Set(['white']) })),
    )
    const stripes = item({ category: 'top', pattern: 'gestreift' })
    const checks = item({ category: 'bottom', pattern: 'kariert' })
    const plain = item({ category: 'bottom' })
    expect(scoreOutfit([stripes, plain], ctx())).toBeGreaterThan(scoreOutfit([stripes, checks], ctx()))
  })
  it('lernt aus Bewertungen', () => {
    const affinity = buildAffinity([
      outfit({ item_ids: ['white', 'jeans'], rating: 1 }),
      outfit({ item_ids: ['red', 'jeans'], rating: -1 }),
      outfit({ item_ids: ['red', 'jeans'], rating: -1 }),
      outfit({ item_ids: ['red', 'jeans'], rating: -1 }),
    ])
    expect(affinity.get(pairKey('jeans', 'white'))).toBe(1)
    expect(affinity.get(pairKey('red', 'jeans'))).toBe(-2) // begrenzt
    expect(scoreOutfit([white, jeans], ctx({ affinity }))).toBeGreaterThan(scoreOutfit([white, jeans], ctx()))
  })
  it('baut ganze Outfits und nimmt bei Kälte eine Jacke dazu', () => {
    const wardrobe = [white, red, jeans, sneaker, coat, dress]
    const cold = ctx({ weather: { tMax: 8, tMin: 2, rainProb: 0, code: 3 } })
    const ranked = rankOutfits(wardrobe, cold, 1)
    expect(ranked.length).toBe(3) // 2 Oberteile × 1 Hose + 1 Kleid
    for (const r of ranked) {
      const cats = r.items.map((i) => i.category)
      expect(cats).toContain('shoes')
      expect(cats).toContain('outerwear')
      expect(r.partial).toBe(false)
    }
    const warm = ctx({ weather: { tMax: 24, tMin: 16, rainProb: 0, code: 0 } })
    expect(rankOutfits(wardrobe, warm, 1).every((r) => !r.items.some((i) => i.category === 'outerwear'))).toBe(true)
  })
  it('lässt Wunschlisten-Teile weg', () => {
    const wish = item({ id: 'wish', category: 'top', is_wishlist: true })
    const ids = rankOutfits([wish, white, jeans], ctx(), 1).flatMap((r) => r.items.map((i) => i.id))
    expect(ids).not.toContain('wish')
  })
  it('bleibt am selben Tag gleich und würfelt auf Wunsch neu', () => {
    const wardrobe = [white, red, wool, jeans, lime, sneaker]
    const a = dailyOutfit(wardrobe, ctx(), 'u', '2026-11-13')!
    const b = dailyOutfit(wardrobe, ctx(), 'u', '2026-11-13')!
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id))
    const next = dailyOutfit(wardrobe, ctx(), 'u', '2026-11-13', 1)!
    const core = (r: typeof a) => r.items.filter((i) => i.category !== 'shoes').map((i) => i.id)
    expect(core(next).some((id) => core(a).includes(id))).toBe(false)
  })
  it('kommt mit einem fast leeren Schrank zurecht', () => {
    expect(dailyOutfit([], ctx(), 'u', '2026-11-13')).toBeNull()
    expect(dailyOutfit([sneaker], ctx(), 'u', '2026-11-13')).toBeNull()
    const onlyTops = dailyOutfit([white, red], ctx(), 'u', '2026-11-13')!
    expect(onlyTops.partial).toBe(true)
    expect(onlyTops.items).toHaveLength(1)
    const noShoes = dailyOutfit([white, jeans], ctx(), 'u', '2026-11-13')!
    expect(noShoes.partial).toBe(false)
    expect(noShoes.items.map((i) => i.id).sort()).toEqual(['jeans', 'white'])
  })
})

describe('Kauf-Check', () => {
  const tops = ['#ffffff', '#222222', '#d32f2f'].map((hex, i) => item({ id: `t${i}`, category: 'top', colors: col(hex) }))
  const shoes = item({ id: 's', category: 'shoes' })
  it('zählt Kombinationen mit dem Schrank', () => {
    const jeans = item({ id: 'cand', category: 'bottom', colors: col('#1f2a44'), is_wishlist: true })
    const res = purchaseCheck(jeans, [...tops, shoes, jeans], ctx())
    expect(res.count).toBe(3)
    expect(res.top).toHaveLength(3)
    expect(res.top[0].items.map((i) => i.id)).toContain('cand')
    expect(res.top[0].items.map((i) => i.id)).toContain('s')
    expect(res.colorFit).toBe(93) // neutral zu neutral 0,9 – zu Farbe 1,0
  })
  it('zeigt, wenn ein Teil schlecht passt', () => {
    const good = item({ id: 'g', category: 'bottom', colors: col('#1f2a44') })
    const loud = item({ id: 'l', category: 'bottom', colors: col('#b8d32f'), formality: 5, warmth: 5 })
    const redTops = [item({ id: 'r1', category: 'top', colors: col('#d32f2f'), warmth: 1, formality: 1 })]
    expect(purchaseCheck(loud, redTops, ctx()).count).toBe(0)
    expect(purchaseCheck(good, redTops, ctx()).count).toBe(1)
    expect(purchaseCheck(loud, redTops, ctx()).colorFit).toBeLessThan(purchaseCheck(good, redTops, ctx()).colorFit)
  })
  it('liefert nichts Falsches bei leerem Schrank', () => {
    const shoe = item({ category: 'shoes' })
    expect(purchaseCheck(shoe, [], ctx())).toEqual({ count: 0, top: [], colorFit: 0 })
    expect(purchaseCheck(shoe, [tops[0]], ctx()).count).toBe(0) // kein ganzes Outfit möglich
  })
})

describe('Trage-Tagebuch', () => {
  const shirt = item({ id: 'shirt', price: 30, created_at: '2026-01-01T00:00:00Z' })
  const fresh = item({ id: 'fresh', created_at: '2026-11-01T00:00:00Z' })
  const old = item({ id: 'old', created_at: '2026-01-01T00:00:00Z' })
  const wish = item({ id: 'wish', is_wishlist: true, created_at: '2026-01-01T00:00:00Z' })
  const log = [
    outfit({ item_ids: ['shirt'], worn: true, date: '2026-11-10' }),
    outfit({ item_ids: ['shirt'], worn: true, date: '2026-11-01' }),
    outfit({ item_ids: ['shirt', 'old'], worn: false, date: '2026-11-12' }),
  ]
  it('zählt Tragen und Kosten pro Tragen', () => {
    const stats = wearStats([shirt, old], log)
    expect(stats.get('shirt')).toEqual({ count: 2, last: '2026-11-10', costPerWear: 15 })
    expect(stats.get('old')).toEqual({ count: 0, last: null, costPerWear: null })
  })
  it('findet lange nicht Getragenes', () => {
    const stale = [outfit({ item_ids: ['shirt'], worn: true, date: '2026-07-01' })]
    expect(neglected([shirt, fresh, old, wish], log, '2026-11-13').map((i) => i.id)).toEqual(['old'])
    expect(neglected([shirt], stale, '2026-11-13').map((i) => i.id)).toEqual(['shirt'])
  })
  it('merkt sich die letzten Tage, aber nicht heute', () => {
    expect([...recentIds(log, '2026-11-13')]).toEqual(['shirt'])
    expect([...recentIds(log, '2026-11-10')]).toEqual([])
    expect([...recentIds(log, '2026-11-30')]).toEqual([])
  })
})

describe('Puppe', () => {
  it('füllt fehlende Maße auf und begrenzt absurde', () => {
    expect(clampMeasurements(null)).toEqual(DEFAULT_MEASUREMENTS)
    expect(clampMeasurements({ height: 999, waist: -5, bust: 'abc', hips: '110', inseam: NaN } as any)).toEqual({
      ...DEFAULT_MEASUREMENTS,
      height: 210,
      waist: 55,
      hips: 110,
    })
  })
  it('zeichnet für alle Maße gültige Umrisse', () => {
    const extremes = [
      {},
      { height: 140, shoulders: 60, bust: 150, waist: 150, hips: 160, inseam: 100 },
      { height: 210, shoulders: 30, bust: 70, waist: 55, hips: 70, inseam: 60 },
      { height: 'x', waist: null } as any,
    ]
    for (const m of extremes) {
      const g = bodyGeometry(m)
      for (const d of Object.values(g.shapes)) {
        expect(d).not.toMatch(/NaN|Infinity|undefined/)
        expect(d.endsWith('Z')).toBe(true)
      }
      const order = [g.y.headTop, g.y.chin, g.y.shoulder, g.y.bust, g.y.waist, g.y.hip, g.y.crotch, g.y.knee, g.y.ankle, g.y.floor]
      expect(order).toEqual([...order].sort((a, b) => a - b))
      expect(new Set(order).size).toBe(order.length)
    }
  })
  it('reagiert auf die Maße', () => {
    const base = bodyGeometry(DEFAULT_MEASUREMENTS)
    expect(bodyGeometry({ ...DEFAULT_MEASUREMENTS, hips: 120 }).half.hip).toBeGreaterThan(base.half.hip)
    expect(bodyGeometry({ ...DEFAULT_MEASUREMENTS, waist: 60 }).half.waist).toBeLessThan(base.half.waist)
    expect(bodyGeometry({ ...DEFAULT_MEASUREMENTS, inseam: 90 }).y.crotch).toBeLessThan(base.y.crotch)
    // Größer bei gleichen Umfängen wirkt schmaler.
    expect(bodyGeometry({ ...DEFAULT_MEASUREMENTS, height: 190 }).half.hip).toBeLessThan(base.half.hip)
  })
  it('setzt Teile an die richtige Stelle und in die richtige Ebene', () => {
    const g = bodyGeometry(DEFAULT_MEASUREMENTS)
    const p = (over: Partial<Item>) => placement(item(over), g)
    const top = p({ category: 'top', aspect: 1.1 })
    const pants = p({ category: 'bottom', length: 'long', aspect: 0.5 })
    const shorts = p({ category: 'bottom', length: 'short', aspect: 1 })
    const dress = p({ category: 'dress', length: 'mid', aspect: 0.5 })
    const shoes = p({ category: 'shoes', aspect: 1.6 })
    const coat = p({ category: 'outerwear', length: 'long', aspect: 0.7 })
    const hat = p({ category: 'accessory', accessory_type: 'hat', aspect: 1.4 })
    expect(top.y).toBeLessThan(g.y.shoulder)
    expect(top.y + top.h).toBeGreaterThan(g.y.waist)
    expect(top.x + top.w / 2).toBeCloseTo(g.cx)
    expect(pants.y).toBeLessThanOrEqual(g.y.waist)
    expect(pants.y + pants.h).toBeGreaterThanOrEqual(g.y.ankle)
    expect(pants.w).toBeGreaterThanOrEqual(g.half.hip * 2)
    expect(shorts.y + shorts.h).toBeLessThan(g.y.knee)
    expect(dress.y + dress.h).toBeGreaterThan(g.y.knee)
    expect(shoes.y + shoes.h).toBeGreaterThanOrEqual(g.y.floor)
    expect(hat.y + hat.h).toBeLessThan(g.y.chin)
    expect([shoes.z, pants.z, top.z, coat.z, hat.z]).toEqual([1, 2, 3, 5, 7])
    for (const a of [NaN, 0, -1]) expect(placement(item({ aspect: a }), g).h).toBeGreaterThan(0)
    for (const q of [top, pants, dress, shoes, coat, hat]) {
      expect(q.x).toBeGreaterThanOrEqual(0)
      expect(q.x + q.w).toBeLessThanOrEqual(VIEW.w)
    }
  })
})

describe('Freistellen über das Kleidungs-Modell', () => {
  // 4 × 4 großes Foto: links oben Oberteil (1), rechts unten Hose (2), Rest Hintergrund (0).
  const lm = {
    labels: ['', 'Upper-clothes', 'Pants'],
    map: new Uint8Array([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 2, 2, 0, 0, 2, 2]),
    width: 4,
    height: 4,
  }
  const whole = { x: 0, y: 0, w: 1, h: 1 }
  it('ordnet Kategorien den Bereichen des Modells zu', () => {
    expect(labelsFor('top', null)).toContain('Upper-clothes')
    expect(labelsFor('bottom', null)).toEqual(['Pants', 'Skirt'])
    expect(labelsFor('accessory', 'bag')).toEqual(['Bag'])
    expect(labelsFor('accessory', 'jewelry')).toEqual([])
    expect(labelsFor('accessory', null)).toEqual([])
  })
  it('schneidet nur das gewünschte Teil aus dem Rahmen', () => {
    const top = maskFromLabelMap(lm, whole, ['Upper-clothes'], 4, 4)!
    expect(top[0]).toBeGreaterThan(127) // im Oberteil
    expect(top[15]).toBe(0) // in der Hose
    const pants = maskFromLabelMap(lm, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, ['Pants'], 8, 8)!
    expect(pants.every((v) => v === 255)).toBe(true) // Rahmen liegt ganz in der Hose
  })
  it('gibt auf, wenn im Rahmen nichts Passendes liegt', () => {
    expect(maskFromLabelMap(lm, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, ['Upper-clothes'], 8, 8)).toBeNull()
    expect(maskFromLabelMap(lm, whole, ['Hat'], 4, 4)).toBeNull()
    expect(maskFromLabelMap(lm, whole, [], 4, 4)).toBeNull()
    expect(maskFromLabelMap(lm, whole, ['Pants'], 0, 4)).toBeNull()
  })
  it('glättet Kanten, ohne die Fläche zu verlieren', () => {
    const soft = soften(new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255]), 4, 4)
    expect(soft[1]).toBeGreaterThan(0)
    expect(soft[1]).toBeLessThan(255)
    expect(soft[3]).toBe(255)
    expect(soft[0]).toBe(0)
  })
})
