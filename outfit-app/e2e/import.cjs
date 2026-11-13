// Prüft Anmelden und Foto-Import im Handy-Format gegen die laufende App.
//   BASE=http://localhost:4173 PHOTO=/pfad/foto.jpg EMAIL=… PASSWORD=… node e2e/import.cjs
// Die Fotoanalyse wird durch feste Rahmen ersetzt (kein Claude-Schlüssel nötig), das Freistellen läuft echt.
const { chromium } = require('playwright')
const fs = require('fs')

const BASE = process.env.BASE || 'http://localhost:4173'
const OUT = __dirname + '/out'
const MOCK = JSON.parse(process.env.MOCK || 'null')

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {})
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE' })
  const page = await ctx.newPage()
  const problems = []
  page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text().slice(0, 300)))
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)))
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url().slice(0, 120) + ' ' + (r.failure()?.errorText ?? '')))
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })

  await page.goto(BASE)
  await page.getByLabel('E-Mail').fill(process.env.EMAIL)
  await page.getByLabel('Passwort').fill(process.env.PASSWORD)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click()
  await page.getByRole('navigation').waitFor({ timeout: 20000 })
  await shot('01-heute')

  await page.evaluate((mock) => localStorage.setItem('garderobe.mock', mock ? JSON.stringify(mock) : '1'), MOCK)
  await page.getByRole('button', { name: 'Import' }).click()
  await page.locator('input[type=file]').setInputFiles(process.env.PHOTO)
  await page.getByText(/Teile? gefunden/).waitFor({ timeout: 30000 })
  const t0 = Date.now()
  await page.getByRole('button', { name: /in den Schrank|auf die Wunschliste/ }).waitFor({ timeout: 240000 })
  console.log('Freistellen fertig nach', Math.round((Date.now() - t0) / 1000), 's')
  console.log('Hinweise:', await page.locator('.draft .hint').allTextContents())
  await shot('02-import')
  if (process.env.SAVE !== '0') {
    await page.getByRole('button', { name: /in den Schrank|auf die Wunschliste/ }).click()
    await page.locator('.masonry .card, .empty').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)
    await shot('03-schrank')
  }
  console.log(problems.length ? 'Probleme:\n' + problems.join('\n') : 'Keine Fehler in der Konsole')
  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
