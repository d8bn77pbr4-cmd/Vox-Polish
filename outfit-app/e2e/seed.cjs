// Füllt ein Testkonto mit gezeichneten Beispiel-Teilen und etwas Trage-Verlauf.
//   BASE=http://localhost:4173 EMAIL=… PASSWORD=… node e2e/seed.cjs
const { chromium } = require('playwright')

const BASE = process.env.BASE || 'http://localhost:4173'
const U = 'https://hsrlutussqelcskbqarj.supabase.co'
const KEY = 'sb_publishable_JN_rTUswpDu9y3h5b5lYWw_hDgIAh8E'

const shape = {
  tee: [200, 180, 'M60 10L80 20Q100 34 120 20L140 10L195 45L175 80L150 65L150 175L50 175L50 65L25 80L5 45Z'],
  sweater: [240, 200, 'M80 10L100 20Q120 34 140 20L160 10L215 40L235 170L205 175L185 75L182 195L58 195L55 75L35 175L5 170L25 40Z'],
  pants: [140, 300, 'M10 5L130 5L136 295L84 295L70 80L56 295L4 295Z'],
  shorts: [150, 110, 'M10 5L140 5L146 105L86 105L75 45L64 105L4 105Z'],
  skirt: [160, 180, 'M40 5L120 5L155 175L5 175Z'],
  dress: [180, 330, 'M60 5L75 5Q90 30 105 5L120 5L128 60L112 120L170 325L10 325L68 120L52 60Z'],
  coat: [240, 330, 'M80 10L100 20Q120 34 140 20L160 10L215 40L235 200L205 205L188 80L192 325L48 325L52 80L35 205L5 200L25 40Z'],
  jacket: [240, 190, 'M80 10L100 20Q120 34 140 20L160 10L215 40L235 170L205 175L186 75L184 185L56 185L54 75L35 175L5 170L25 40Z'],
  shoes: [200, 80, 'M8 40Q10 20 34 22L60 44Q84 50 90 62L90 74L8 74ZM110 40Q112 20 136 22L162 44Q186 50 192 62L192 74L110 74Z'],
  boots: [200, 130, 'M20 6L62 6L62 80Q86 92 90 110L90 124L16 124ZM122 6L164 6L164 80Q188 92 192 110L192 124L118 124Z'],
  bag: [120, 140, 'M38 42Q38 8 60 8Q82 8 82 42L74 42Q74 18 60 18Q46 18 46 42ZM12 42L108 42L116 134L4 134Z'],
  hat: [160, 90, 'M30 70Q30 10 80 10Q130 10 130 70L156 76Q158 86 148 86L12 86Q2 86 4 76Z'],
}
const svg = ([w, h, d], fill, stripes) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 3}" height="${h * 3}" viewBox="0 0 ${w} ${h}">
  <defs><pattern id="s" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${fill}"/><rect width="12" height="5" fill="${stripes || fill}"/></pattern>
  <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient></defs>
  <path d="${d}" fill="url(#s)" stroke="rgba(0,0,0,.25)" stroke-width="1.5" stroke-linejoin="round"/><path d="${d}" fill="url(#g)"/></svg>`

const all = ['spring', 'summer', 'autumn', 'winter']
const ITEMS = [
  { s: 'tee', hex: '#f4f1ea', name: 'Weißes T-Shirt', category: 'top', subcategory: 'T-Shirt', length: 'mid', warmth: 2, formality: 2, seasons: ['spring', 'summer', 'autumn'], price: 19.99 },
  { s: 'sweater', hex: '#f4f1ea', stripes: '#1f2a44', name: 'Ringelshirt', category: 'top', subcategory: 'Langarmshirt', length: 'mid', pattern: 'gestreift', warmth: 3, formality: 2, seasons: all, price: 34.9 },
  { s: 'sweater', hex: '#8f8d8a', name: 'Grauer Wollpullover', category: 'top', subcategory: 'Pullover', length: 'mid', warmth: 5, formality: 3, seasons: ['autumn', 'winter'], price: 89, old: true },
  { s: 'tee', hex: '#3d6b4f', name: 'Grünes Polo', category: 'top', subcategory: 'Poloshirt', length: 'mid', warmth: 2, formality: 3, seasons: ['spring', 'summer'] },
  { s: 'pants', hex: '#2f4a7a', name: 'Blaue Jeans', category: 'bottom', subcategory: 'Jeans', length: 'long', warmth: 3, formality: 2, seasons: all, price: 79.95 },
  { s: 'pants', hex: '#1c1b1a', name: 'Schwarze Stoffhose', category: 'bottom', subcategory: 'Stoffhose', length: 'long', warmth: 3, formality: 4, seasons: all },
  { s: 'skirt', hex: '#d9c7a8', name: 'Beiger Midirock', category: 'bottom', subcategory: 'Rock', length: 'mid', warmth: 2, formality: 3, seasons: ['spring', 'summer', 'autumn'] },
  { s: 'shorts', hex: '#c9b28a', name: 'Sand-Shorts', category: 'bottom', subcategory: 'Shorts', length: 'short', warmth: 1, formality: 1, seasons: ['summer'] },
  { s: 'dress', hex: '#2e6b57', name: 'Grünes Kleid', category: 'dress', subcategory: 'Kleid', length: 'mid', warmth: 2, formality: 4, seasons: ['spring', 'summer'] },
  { s: 'coat', hex: '#26221f', name: 'Schwarzer Mantel', category: 'outerwear', subcategory: 'Mantel', length: 'long', warmth: 5, formality: 4, seasons: ['autumn', 'winter'], price: 189 },
  { s: 'jacket', hex: '#5d7fa8', name: 'Jeansjacke', category: 'outerwear', subcategory: 'Jacke', length: 'short', warmth: 3, formality: 2, seasons: ['spring', 'autumn'] },
  { s: 'shoes', hex: '#f0ede6', name: 'Weiße Sneaker', category: 'shoes', subcategory: 'Sneaker', length: null, warmth: 3, formality: 2, seasons: all, price: 99 },
  { s: 'boots', hex: '#5a3d2b', name: 'Braune Stiefel', category: 'shoes', subcategory: 'Stiefel', length: null, warmth: 4, formality: 3, seasons: ['autumn', 'winter'] },
  { s: 'bag', hex: '#7a4b2e', name: 'Ledertasche', category: 'accessory', subcategory: 'Tasche', length: null, accessory_type: 'bag', warmth: 3, formality: 3, seasons: all },
  { s: 'hat', hex: '#b3261e', name: 'Rote Mütze', category: 'accessory', subcategory: 'Mütze', length: null, accessory_type: 'hat', warmth: 4, formality: 1, seasons: ['autumn', 'winter'] },
  { s: 'sweater', hex: '#c8452f', name: 'Roter Strickpulli', category: 'top', subcategory: 'Pullover', length: 'mid', warmth: 4, formality: 2, seasons: ['autumn', 'winter'], price: 59, wish: true },
]

async function main() {
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {})
  const page = await browser.newPage({ viewport: { width: 800, height: 1000 } })
  await page.goto(BASE)

  const images = []
  const draw = await browser.newPage({ viewport: { width: 800, height: 1100 } })
  for (const it of ITEMS) {
    await draw.setContent(`<body style="margin:0;background:transparent">${svg(shape[it.s], it.hex, it.stripes)}</body>`)
    const png = await draw.locator('svg').screenshot({ omitBackground: true })
    images.push({ b64: png.toString('base64'), aspect: shape[it.s][0] / shape[it.s][1] })
  }
  await draw.close()

  const result = await page.evaluate(
    async ({ U, KEY, EMAIL, PASSWORD, ITEMS, images }) => {
      const j = (r) => r.json()
      const auth = await fetch(`${U}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      }).then(j)
      const H = { apikey: KEY, Authorization: `Bearer ${auth.access_token}` }
      const uid = auth.user.id
      const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString()
      const rows = []
      for (let n = 0; n < ITEMS.length; n++) {
        const it = ITEMS[n]
        const id = crypto.randomUUID()
        const bytes = Uint8Array.from(atob(images[n].b64), (c) => c.charCodeAt(0))
        const path = `${uid}/${id}.png`
        const up = await fetch(`${U}/storage/v1/object/items/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/png' }, body: bytes })
        if (!up.ok) return { error: 'upload ' + (await up.text()) }
        rows.push({
          id, image_path: path, thumb_path: path, aspect: images[n].aspect, name: it.name, category: it.category, subcategory: it.subcategory,
          length: it.length, accessory_type: it.accessory_type ?? null, colors: [{ hex: it.hex, name: '' }], pattern: it.pattern ?? 'uni', material: '',
          warmth: it.warmth, formality: it.formality, seasons: it.seasons, tags: [], price: it.price ?? null, is_wishlist: !!it.wish,
          created_at: iso(it.old ? 140 : 20),
        })
      }
      const ins = await fetch(`${U}/rest/v1/items`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows) })
      if (!ins.ok) return { error: 'items ' + (await ins.text()) }
      const id = (name) => rows.find((r) => r.name === name).id
      const day = (daysAgo) => iso(daysAgo).slice(0, 10)
      const outfits = [
        { date: day(2), item_ids: [id('Weißes T-Shirt'), id('Blaue Jeans'), id('Weiße Sneaker')], source: 'daily', rating: 1, worn: true },
        { date: day(5), item_ids: [id('Ringelshirt'), id('Schwarze Stoffhose'), id('Braune Stiefel'), id('Schwarzer Mantel')], source: 'daily', rating: 1, worn: true },
        { date: day(9), item_ids: [id('Grünes Kleid'), id('Weiße Sneaker'), id('Jeansjacke')], source: 'doll', rating: 0, worn: true },
        { date: day(12), item_ids: [id('Grünes Polo'), id('Beiger Midirock'), id('Weiße Sneaker')], source: 'daily', rating: -1, worn: false },
      ]
      const out = await fetch(`${U}/rest/v1/outfits`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(outfits) })
      if (!out.ok) return { error: 'outfits ' + (await out.text()) }
      const prof = await fetch(`${U}/rest/v1/profiles?user_id=eq.${uid}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ place_name: 'Berlin, DE', lat: 52.52, lon: 13.405 }) })
      return { items: rows.length, outfits: outfits.length, profile: prof.status }
    },
    { U, KEY, EMAIL: process.env.EMAIL, PASSWORD: process.env.PASSWORD, ITEMS, images },
  )
  console.log(result)
  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
