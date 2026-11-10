// Sobe o app com uma turma de exemplo e captura as telas do guia das personais.
const fs = require('fs');
const { createApp } = require(require('path').join(__dirname, '..', '..', 'src', 'app'));
const { chromium, devices } = require('playwright');
const { montarTurma, criarRelogio } = require('./turma-exemplo');
const OUT = process.argv[2];
const DATA = process.argv[3];

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  const relogio = criarRelogio();
  const app = await createApp({ dataDir: DATA, bucket: null, databaseUrl: null, now: () => relogio.agora() });
  const server = app.listen(3495);
  const B = 'http://localhost:3495';
  const browser = await chromium.launch();

  const { carol, clients } = await montarTurma(B, browser, relogio);

  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const go = async (hash, sel) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(sel); await page.waitForTimeout(500); await page.evaluate(() => window.scrollTo(0, 0)); };

  // visão do aluno
  await ctx.addCookies([{ name: 'sid', value: clients['Juliana Reis'].sid(), url: B }]);
  await page.goto(B + '/#/inicio'); await page.waitForSelector('.score-card'); await page.waitForTimeout(800);
  await shot('aluno-inicio');
  await go('#/desafios', '.day-card'); await shot('aluno-desafios');

  // visão da personal
  await ctx.clearCookies();
  await ctx.addCookies([{ name: 'sid', value: carol.sid(), url: B }]);
  await page.goto(B + '/#/perfil'); await page.waitForSelector('#logout'); await page.waitForTimeout(800);
  await shot('perfil-admin');
  await go('#/admin', '#student-list'); await shot('painel-resumo');
  await page.click('[data-filter=pending]'); await page.waitForTimeout(300); await shot('painel-pendentes');
  await page.click('[data-filter=all]');
  await page.evaluate(() => { const d = document.querySelector('#student-list .admin-user'); d.open = true; d.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); });
  await page.waitForTimeout(300); await shot('aluno-ficha');
  await page.evaluate(() => { document.querySelector('#student-list .admin-user .bonus-form').scrollIntoView({ block: 'center' }); });
  await page.click('#student-list .admin-user [data-reason="Treino realizado"]'); await page.waitForTimeout(200); await shot('aluno-pontos');
  await page.evaluate(() => { document.querySelectorAll('#student-list .admin-user')[1].querySelector('summary').scrollIntoView(); });
  await page.evaluate(() => { document.querySelector('#save-settings').scrollIntoView({ block: 'end' }); window.scrollBy(0, 40); });
  await page.waitForTimeout(200); await shot('configuracoes');
  await page.click('[data-edit-day="12"]'); await page.waitForSelector('#day-form');
  await page.fill('#day-form [name=description]', 'Missão surpresa: 50 agachamentos ao longo do dia + 1 foto do momento no feed!');
  await page.waitForTimeout(400); await shot('editar-dia');
  await page.click('.modal-head [data-close]');
  await page.evaluate(() => { const d = document.querySelectorAll('#student-list .admin-user')[1]; d.open = true; });
  await page.click('#student-list .admin-user:nth-of-type(2) [data-reset]');
  await page.waitForSelector('.modal'); await page.waitForTimeout(400); await shot('senha-temporaria');
  await page.click('.modal-head [data-close]');

  await go('#/mural', '.notice'); await shot('mural');
  await page.click('#new-notice'); await page.fill('[name=title]', 'Missão da semana'); await page.fill('[name=body]', 'Até domingo: 3 treinos no studio + 1 atividade ao ar livre. Quem cumprir ganha +3 pontos!');
  await page.waitForTimeout(400); await shot('mural-novo'); await page.click('.modal-head [data-close]');
  await go('#/feed', '.post'); await shot('feed');
  await go('#/ranking', '.rank-row'); await shot('ranking');

  console.log('erros:', errs);
  await browser.close(); server.close(); await app.locals.db.close();
})().catch((e) => { console.error(e); process.exit(1); });
