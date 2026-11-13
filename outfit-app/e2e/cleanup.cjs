// Löscht alle Teile, Bilder und Outfits eines Testkontos wieder.
//   BASE=http://localhost:4173 EMAIL=… PASSWORD=… node e2e/cleanup.cjs
const { chromium } = require('playwright')

const BASE = process.env.BASE || 'http://localhost:4173'
const U = 'https://hsrlutussqelcskbqarj.supabase.co'
const KEY = 'sb_publishable_JN_rTUswpDu9y3h5b5lYWw_hDgIAh8E'

async function main() {
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {})
  const page = await browser.newPage()
  await page.goto(BASE)
  const result = await page.evaluate(
    async ({ U, KEY, EMAIL, PASSWORD }) => {
      const auth = await fetch(`${U}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      }).then((r) => r.json())
      const H = { apikey: KEY, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' }
      const items = await fetch(`${U}/rest/v1/items?select=image_path,thumb_path`, { headers: H }).then((r) => r.json())
      const paths = [...new Set(items.flatMap((i) => [i.image_path, i.thumb_path]))]
      let removed = 0
      for (let i = 0; i < paths.length; i += 100) {
        const res = await fetch(`${U}/storage/v1/object/items`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }) })
        if (res.ok) removed += (await res.json()).length
      }
      const uid = auth.user.id
      const left = await fetch(`${U}/storage/v1/object/list/items`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: uid, limit: 100 }) }).then((r) => r.json())
      const del = async (table) => (await fetch(`${U}/rest/v1/${table}?user_id=eq.${uid}`, { method: 'DELETE', headers: H })).status
      return { files: paths.length, removed, filesLeft: left.length, outfits: await del('outfits'), items: await del('items') }
    },
    { U, KEY, EMAIL: process.env.EMAIL, PASSWORD: process.env.PASSWORD },
  )
  console.log(result)
  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
