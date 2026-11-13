// Prüft den Weg ohne Claude-Schlüssel: klare Meldung, Teil von Hand einrahmen, Hintergrund entfernen, speichern.
//   BASE=http://localhost:4173 PHOTO=/pfad/foto.jpg EMAIL=… PASSWORD=… node e2e/manual.cjs
const { chromium } = require('playwright')

const BASE = process.env.BASE || 'http://localhost:4173'

async function main() {
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {})
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE' })
  const page = await ctx.newPage()
  const problems = []
  page.on('console', (m) => ['warning', 'error'].includes(m.type()) && console.log('  [browser]', m.text().slice(0, 600)))
  page.on('requestfailed', (r) => console.log('  [failed]', r.url().slice(0, 160), r.failure()?.errorText))
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)))
  await page.goto(BASE)
  await page.getByLabel('E-Mail').fill(process.env.EMAIL)
  await page.getByLabel('Passwort').fill(process.env.PASSWORD)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click()
  await page.getByRole('navigation').waitFor({ timeout: 20000 })
  await page.evaluate(() => localStorage.removeItem('garderobe.mock'))

  await page.getByRole('navigation').getByRole('button', { name: 'Import' }).click()
  await page.getByRole('tab', { name: 'Kauf-Kandidat' }).click()
  await page.locator('input[type=file]').setInputFiles(process.env.PHOTO)
  await page.locator('.photo .error').waitFor({ timeout: 40000 })
  console.log('Meldung:', await page.locator('.photo .error').innerText())

  await page.getByRole('button', { name: /Teil von Hand einrahmen/ }).click()
  await page.getByRole('dialog').waitFor()
  // Rahmen größer ziehen: obere linke Ecke nach oben links.
  const handle = page.locator('.boxed-handle.nw')
  const hb = await handle.boundingBox()
  await page.mouse.move(hb.x + 10, hb.y + 10)
  await page.mouse.down()
  await page.mouse.move(hb.x - 50, hb.y - 90, { steps: 5 })
  await page.mouse.up()
  await page.screenshot({ path: __dirname + '/out/50-rahmen.png' })
  await page.getByRole('button', { name: 'Übernehmen' }).click()
  const t0 = Date.now()
  await page.getByRole('button', { name: /1 Teil auf die Wunschliste/ }).waitFor({ timeout: 240000 })
  console.log('Freigestellt nach', Math.round((Date.now() - t0) / 1000), 's | Hinweise:', await page.locator('.draft .hint').allTextContents())
  await page.getByLabel('Name').fill('Test-Kandidat')
  await page.screenshot({ path: __dirname + '/out/51-von-hand.png' })
  await page.getByRole('button', { name: /1 Teil auf die Wunschliste/ }).click()
  await page.getByText('1 Teil gespeichert').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: /Wunschliste/ }).click()
  await page.locator('.masonry .card', { hasText: 'Test-Kandidat' }).first().waitFor({ timeout: 10000 })
  console.log('In der Wunschliste gespeichert:', await page.locator('.masonry .card-name').allTextContents())
  console.log(problems.length ? 'Probleme:\n' + problems.join('\n') : 'Keine Seitenfehler')
  await browser.close()
}
main().catch((e) => {
  console.error(String(e).slice(0, 1200))
  process.exit(1)
})
