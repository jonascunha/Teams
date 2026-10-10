// Gera os ícones PNG (Android/iPhone) a partir de public/icons/icon.svg usando o Chromium do Playwright.
// Uso: node scripts/make-icons.js  (requer `playwright` instalado globalmente ou no projeto)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const dir = path.join(__dirname, '..', 'public', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shots = [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['apple-touch-icon.png', 180, true],
    ['icon-maskable-512.png', 512, true],
  ];
  for (const [file, size, fullBleed] of shots) {
    // Ícones "maskable"/iOS precisam de fundo até a borda (o sistema recorta os cantos).
    const inner = fullBleed ? svg.replace('rx="112"', 'rx="0"') : svg;
    const pad = file.includes('maskable') ? size * 0.1 : 0;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:${fullBleed ? '#0a0a0a' : 'transparent'}">
      <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
      <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div></body></html>`);
    await page.screenshot({ path: path.join(dir, file), omitBackground: !fullBleed });
  }
  await browser.close();
})();
