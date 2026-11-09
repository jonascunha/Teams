const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + process.argv[2], { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  // confere se algum conteúdo passa do limite da página
  const over = await p.$$eval('.page', (ps) => ps.map((pg, i) => {
    const r = pg.getBoundingClientRect();
    const kids = [...pg.querySelectorAll('*')].filter((e) => !e.closest('.foot'));
    const bottom = Math.max(...kids.map((e) => e.getBoundingClientRect().bottom));
    return { pagina: i + 1, sobra_px: Math.round(r.bottom - 48 - bottom) };
  }));
  console.log(over);
  console.log('fontes:', await p.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight).join(', ')));
  await p.pdf({ path: process.argv[3], format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
