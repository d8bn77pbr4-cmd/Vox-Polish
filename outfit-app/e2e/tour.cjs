// Geht im Handy-Format durch alle Bildschirme und macht Bilder davon.
//   BASE=http://localhost:4173 EMAIL=… PASSWORD=… node e2e/tour.cjs
const { chromium } = require('playwright')
const fs = require('fs')

const BASE = process.env.BASE || 'http://localhost:4173'
const OUT = __dirname + '/out'

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {})
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE' })
  const page = await ctx.newPage()
  const problems = []
  page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text().slice(0, 300)))
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)))
  await page.route('**/api.open-meteo.com/**', (route) =>
    route.fulfill({ json: { daily: { temperature_2m_max: [9.4], temperature_2m_min: [3.1], precipitation_probability_max: [20], weather_code: [3] } } }),
  )
  const shot = (name, full = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  const tab = (name) => page.getByRole('navigation').getByRole('button', { name }).click()
  let hips = ''
  const step = async (name, fn) => {
    try {
      await fn()
      const width = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
      if (width[0] > 390 || width[1] > 390) throw new Error('Seite ist breiter als der Bildschirm: ' + width)
      console.log('ok  ', name)
    } catch (e) {
      console.log('FAIL', name, '-', String(e).split('\n').slice(0, 2).join(' ').slice(0, 300))
    }
  }

  await page.goto(BASE)
  await page.getByLabel('E-Mail').fill(process.env.EMAIL)
  await page.getByLabel('Passwort').fill(process.env.PASSWORD)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click()
  await page.getByRole('navigation').waitFor({ timeout: 20000 })

  await step('Heute zeigt ein Outfit mit Wetter', async () => {
    await page.locator('.today-card image').first().waitFor({ timeout: 20000 })
    await page.locator('.weather').waitFor({ timeout: 20000 })
    await page.waitForTimeout(1200)
    await shot('10-heute')
    console.log('     Punkte:', await page.locator('.score b').innerText(), '| Teile:', await page.locator('.strip .card-name').allTextContents())
  })
  await step('Neu würfeln ändert das Outfit', async () => {
    const before = (await page.locator('.strip .card-name').allTextContents()).join()
    await page.getByRole('button', { name: /Neu würfeln/ }).click()
    await page.waitForTimeout(400)
    const after = (await page.locator('.strip .card-name').allTextContents()).join()
    if (before === after) throw new Error('Outfit blieb gleich')
  })
  await step('Bewerten und „Heute getragen“ speichern', async () => {
    await page.getByRole('button', { name: 'Gefällt mir', exact: true }).click()
    await page.locator('.btn.round.on').waitFor({ timeout: 10000 })
    await page.getByRole('button', { name: 'Heute getragen' }).click()
    await page.getByRole('button', { name: '✓ Heute getragen' }).waitFor({ timeout: 10000 })
    await shot('11-heute-getragen')
  })
  await step('Schrank zeigt Kacheln und filtert', async () => {
    await tab('Schrank')
    await page.locator('.masonry .card').first().waitFor()
    await page.waitForTimeout(1500)
    await shot('20-schrank')
    const broken = await page.locator('.masonry img').evaluateAll((imgs) => imgs.filter((i) => i.getBoundingClientRect().top < innerHeight && !(i.complete && i.naturalWidth > 0)).map((i) => i.alt))
    if (broken.length) throw new Error('Bilder fehlen: ' + broken.join(', '))
    const all = await page.locator('.masonry .card').count()
    await page.getByRole('button', { name: 'Schuhe' }).click()
    const shoes = await page.locator('.masonry .card').count()
    console.log('     alle:', all, '| Schuhe:', shoes)
    if (!(shoes > 0 && shoes < all)) throw new Error('Filter wirkt nicht')
  })
  await step('Wunschliste: Kauf-Check im Detail', async () => {
    await page.getByRole('button', { name: /Wunschliste/ }).click()
    await page.locator('.masonry .card').first().click()
    await page.locator('.check').waitFor()
    await page.waitForTimeout(600)
    await shot('21-kauf-check')
    console.log('     Kauf-Check:', (await page.locator('.check-nums').innerText()).replace(/\n/g, ' '), '|', await page.locator('.verdict').innerText())
  })
  await step('Kombi aus dem Kauf-Check landet auf der Puppe', async () => {
    await page.locator('.check .combo').first().click()
    await page.locator('.doll-stage image').first().waitFor()
    await page.waitForTimeout(800)
    await shot('30-puppe-kaufkandidat')
    console.log('     Teile an der Puppe:', await page.locator('.doll-stage image').count(), '|', await page.locator('.check-inline').innerText().then((t) => t.replace(/\n/g, ' ')))
  })
  await step('Puppe: Teil wechseln, vergrößern, speichern', async () => {
    await page.getByRole('button', { name: 'Kleider' }).click()
    await page.locator('.strip .card').first().click()
    await page.getByRole('button', { name: 'Jacken' }).click()
    await page.locator('.strip .card').first().click()
    await page.locator('.adjust input[type=range]').fill('1.1')
    await page.waitForTimeout(500)
    await shot('31-puppe-kleid')
    await page.getByRole('button', { name: 'Speichern', exact: true }).click()
    await page.getByText('Outfit gespeichert').waitFor({ timeout: 10000 })
  })
  await step('Ich: Maße verändern die Puppe', async () => {
    await tab('Ich')
    await page.locator('.measure-doll svg').waitFor()
    const d = () => page.locator('.measure-doll svg path').nth(7).getAttribute('d')
    const before = await d()
    hips = (await page.getByLabel(/Hüftumfang/).inputValue()) === '125' ? '110' : '125'
    await page.getByLabel(/Hüftumfang/).fill(hips)
    await page.getByLabel(/Körpergröße/).fill('160')
    await page.waitForTimeout(900)
    if (before === (await d())) throw new Error('Puppe hat sich nicht verändert')
    await shot('40-ich', true)
  })
  await step('Ich: Tagebuch, lange nicht getragen, Einladungen', async () => {
    console.log('     Tage im Tagebuch:', await page.locator('.cal-day img').count(), '| lange nicht getragen:', await page.locator('.panel:has-text("Lange nicht getragen") .card').count())
    await page.getByLabel('E-Mail der Person').fill('freundin@garderobe.test')
    await page.getByRole('button', { name: 'Einladen' }).click()
    await page.locator('.invite', { hasText: 'freundin@garderobe.test' }).waitFor({ timeout: 10000 })
  })
  await step('Maße bleiben nach neu laden erhalten', async () => {
    await page.reload()
    await page.getByRole('navigation').waitFor({ timeout: 20000 })
    await tab('Ich')
    const saved = await page.getByLabel(/Hüftumfang/).inputValue()
    if (saved !== hips) throw new Error('Hüfte ist ' + saved + ' statt ' + hips)
  })

  console.log(problems.length ? 'Probleme:\n' + [...new Set(problems)].join('\n') : 'Keine Fehler in der Konsole')
  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
