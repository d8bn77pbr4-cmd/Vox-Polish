// Erzeugt die App-Icons aus einer kleinen SVG-Vorlage: node e2e/icons.cjs
const { chromium } = require('playwright')

const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#d9482f"/>
  <g transform="translate(50 50) scale(${1 - pad}) translate(-50 -50)" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M50 30c0-5 4-8 8-8s8 4 8 8c0 4-3 6-8 9l-8 5"/>
    <path d="M50 44L18 66c-4 3-2 9 3 9h58c5 0 7-6 3-9L50 44z"/>
  </g>
</svg>`

async function main() {
  const browser = await chromium.launch()
for (const [name, size, pad] of [['icon-192.png', 192, 0.18], ['icon-512.png', 512, 0.18], ['apple-touch-icon.png', 180, 0.14]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<body style="margin:0">${svg(size, pad)}</body>`)
  await page.screenshot({ path: `public/${name}` })
  await page.close()
}
  await browser.close()
  console.log('Icons geschrieben')
}
main()
