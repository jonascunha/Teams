// Sobe o app com uma turma de exemplo e captura as telas do guia das personais.
const fs = require('fs');
const { createApp } = require(require('path').join(__dirname, '..', '..', 'src', 'app'));
const { chromium, devices } = require('playwright');
const OUT = process.argv[2];
const DATA = process.argv[3];

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  const app = await createApp({ dataDir: DATA, bucket: null, databaseUrl: null });
  const server = app.listen(3495);
  const B = 'http://localhost:3495';
  const browser = await chromium.launch();

  // fotos de exemplo geradas no navegador
  const ph = await browser.newPage({ viewport: { width: 800, height: 800 } });
  async function photo(emoji, c1, c2, label) {
    await ph.setContent(`<body style="margin:0"><div style="width:800px;height:800px;background:linear-gradient(135deg,${c1},${c2});display:grid;place-items:center;font-family:sans-serif;color:#fff">
      <div style="text-align:center"><div style="font-size:260px">${emoji}</div><div style="font-size:56px;font-weight:800;letter-spacing:2px">${label}</div></div></div></body>`);
    return 'data:image/jpeg;base64,' + (await ph.screenshot({ type: 'jpeg', quality: 80 })).toString('base64');
  }

  const mk = () => {
    let cookie = '';
    const f = async (m, u, b) => {
      const r = await fetch(B + '/api' + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: b && JSON.stringify(b) });
      const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
      return r.json();
    };
    f.sid = () => cookie.split('=')[1];
    return f;
  };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const start = new Date(Date.parse(today + 'T12:00:00Z') - 4 * 86400000).toISOString().slice(0, 10); // hoje = dia 5

  const carol = mk(); await carol('POST', '/register', { name: 'Carol (Personal)', email: 'carol@mooh.com', password: '123456', code: 'MOOH21' });
  await carol('PUT', '/admin/settings', { start_date: start });
  const pat = mk(); await pat('POST', '/register', { name: 'Patrícia (Personal)', email: 'pat@mooh.com', password: '123456', code: 'MOOH21' });
  let ov = await carol('GET', '/admin/overview');
  await carol('PUT', `/admin/users/${ov.users.find((u) => u.email === 'pat@mooh.com').id}/role`, { role: 'admin' });

  const alunos = [
    ['Ana Souza', [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], 'Beber 2 litros de água por dia', 'Quero ter mais disposição e não faltar nos treinos.'],
    ['Bruno Lima', [1, 2, 4], [1, 2], 'Dormir antes das 23h', 'Quero dormir melhor e acordar com energia.'],
    ['Fernanda Costa', [1, 2, 3, 4, 5], [1, 2, 3, 5], 'Zero refrigerante', ''],
    ['Juliana Reis', [1, 2, 3, 5], [2, 3, 4, 5], 'Caminhar 30 minutos por dia', 'Quero voltar a gostar de me exercitar.'],
    ['Marcos Tavares', [1, 2], [], '', ''],
    ['Rafael Nunes', [1, 2, 3, 4], [1, 3, 4], 'Comer fruta no café da manhã', ''],
  ];
  const clients = {};
  for (const [name, days, pers, chal, commit] of alunos) {
    const a = mk(); clients[name] = a;
    await a('POST', '/register', { name, email: name.split(' ')[0].toLowerCase() + '@exemplo.com', password: '123456', code: 'MOOH21' });
    await a('PUT', '/profile', { personal_challenge: chal, commitment: commit });
    for (const d of days) await a('PUT', `/challenge/${d}`, { done: true, note: d === 1 && commit ? commit : '' });
    for (const d of pers) await a('PUT', `/personal/${d}`, { done: true });
  }
  await clients['Ana Souza']('POST', '/goals', { text: 'Treinar 3x por semana' });
  ov = await carol('GET', '/admin/overview');
  const id = (n) => ov.users.find((u) => u.name === n).id;
  await carol('POST', `/admin/users/${id('Ana Souza')}/bonus`, { points: 2, reason: 'Treino realizado' });
  await carol('POST', `/admin/users/${id('Fernanda Costa')}/bonus`, { points: 2, reason: 'Ajudar / incentivar outro aluno' });
  await carol('POST', '/notices', { title: 'Bem-vindos ao Desafio 21 Dias! 💪', body: 'Não buscamos perfeição, buscamos constância. Marquem o desafio de cada dia e postem fotos no feed: cada dia com foto vale +1 ponto!', pinned: true });
  await clients['Fernanda Costa']('POST', '/posts', { image: await photo('🥗', '#1b3a0a', '#0a0a0a', 'PRATO COLORIDO'), caption: 'Almoço com 5 cores hoje! 🥗' });
  await clients['Ana Souza']('POST', '/posts', { image: await photo('🏋️', '#0a2a3a', '#0a0a0a', 'SEM DESCULPA'), caption: 'Treino feito mesmo cansada. Dia 5 ✅' });
  let posts = await clients['Ana Souza']('GET', '/posts');
  await clients['Bruno Lima']('POST', `/posts/${posts[0].id}/like`);
  await carol('POST', `/posts/${posts[0].id}/like`);
  await carol('POST', `/posts/${posts[0].id}/comments`, { body: 'Isso aí, Ana! Constância é tudo 👏' });

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
