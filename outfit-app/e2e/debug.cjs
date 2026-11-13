const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {})
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'de-DE' })
  const page = await ctx.newPage()
  page.on('requestfailed', (r) => console.log('failed', r.url().slice(0, 100)))
  page.on('response', (r) => r.status() >= 400 && console.log('http', r.status(), r.url().slice(0, 110)))
  await page.goto('http://localhost:4173')
  await page.getByLabel('E-Mail').fill('t1@garderobe.test')
  await page.getByLabel('Passwort').fill('testpass-1234')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click()
  await page.getByRole('navigation').waitFor()
  await page.getByRole('navigation').getByRole('button', { name: 'Puppe' }).click()
  await page.waitForTimeout(500)
  console.log('scrollWidth', await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight, innerHeight]))
  for (const t of ['Heute', 'Schrank', 'Import', 'Puppe', 'Ich']) {
    await page.getByRole('navigation').getByRole('button', { name: t }).click()
    await page.waitForTimeout(400)
    const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > 391 && !e.closest('.chips,.strip')).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).slice(0, 6))
    console.log(t, 'innerWidth', await page.evaluate(() => innerWidth), wide)
  }
  try {
    await page.getByRole('button', { name: 'Kleider' }).click({ timeout: 4000 })
    console.log('click ok')
  } catch (e) {
    console.log(String(e).slice(0, 1500))
  }
  await browser.close()
})()
