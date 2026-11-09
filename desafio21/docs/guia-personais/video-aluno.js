// Grava o vídeo da visão do aluno: do cadastro ao primeiro dia completo (compromisso, desafio individual,
// desafio do dia, foto no feed, interação com colegas, mural e ranking), com legendas na tela.
// Uso: node video-aluno.js PASTA_SAIDA PASTA_DADOS   (converta o .webm para .mp4 como no LEIAME.md)
const fs = require('fs');
const path = require('path');
const { createApp } = require(path.join(__dirname, '..', '..', 'src', 'app'));
const { chromium, devices } = require('playwright');
const { OVERLAY, acoes } = require('./video-comum');

const OUT = process.argv[2];
const DATA = process.argv[3];
const W = 390;
const H = 664; // área visível do iPhone 13 no Playwright

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = await createApp({ dataDir: DATA, bucket: null, databaseUrl: null });
  const server = app.listen(3498);
  const B = 'http://localhost:3498';
  const browser = await chromium.launch();

  // fotos de exemplo
  const ph = await browser.newPage({ viewport: { width: 800, height: 800 } });
  const photo = async (emoji, c1, c2, label, file) => {
    await ph.setContent(`<body style="margin:0"><div style="width:800px;height:800px;background:linear-gradient(135deg,${c1},${c2});display:grid;place-items:center;font-family:sans-serif;color:#fff">
      <div style="text-align:center"><div style="font-size:260px">${emoji}</div><div style="font-size:56px;font-weight:800;letter-spacing:2px">${label}</div></div></div></body>`);
    const buf = await ph.screenshot({ type: 'jpeg', quality: 82 });
    if (file) fs.writeFileSync(file, buf);
    return 'data:image/jpeg;base64,' + buf.toString('base64');
  };
  const minhaFoto = path.join(OUT, 'foto-do-aluno.jpg');
  await photo('💧', '#0a2a3a', '#0a0a0a', 'MEU COMPROMISSO', minhaFoto);

  // turma no Dia 1: personal, colegas já cadastrados, recado e fotos
  const mk = () => {
    let cookie = '';
    return async (m, u, b) => {
      const r = await fetch(B + '/api' + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: b && JSON.stringify(b) });
      const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
      return r.json();
    };
  };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const carol = mk();
  await carol('POST', '/register', { name: 'Carol (Personal)', email: 'carol@mooh.com', password: '123456', code: 'MOOH21' });
  await carol('PUT', '/admin/settings', { start_date: today });
  await carol('POST', '/notices', { title: 'Bem-vindos ao Desafio 21 Dias! 💪', body: 'Hoje é o Dia 1! Marquem o desafio de cada dia e postem fotos no feed: cada dia com foto vale +1 ponto.', pinned: true });
  const colegas = {};
  for (const [name, fez] of [['Ana Souza', true], ['Bruno Lima', true], ['Fernanda Costa', true], ['Juliana Reis', false]]) {
    const a = mk(); colegas[name] = a;
    await a('POST', '/register', { name, email: name.split(' ')[0].toLowerCase() + '@exemplo.com', password: '123456', code: 'MOOH21' });
    if (fez) await a('PUT', '/challenge/1', { done: true, note: 'Daqui a 21 dias eu quero ter mais disposição.' });
  }
  await colegas['Fernanda Costa']('POST', '/posts', { image: await photo('🏃‍♀️', '#1b3a0a', '#0a0a0a', 'DIA 1 ✅'), caption: 'Começando com tudo! Bora, turma 🔥' });
  await ph.close();

  // gravação
  const ctx = await browser.newContext({
    ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  await ctx.addInitScript(OVERLAY);
  const t0 = Date.now();
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const { wait, caption, scrollToEl, tap, type } = acoes(page);
  const card = (html) => page.evaluate((h) => window.__card(h), html);

  await page.goto(B + '/');
  await page.waitForSelector('#auth-form');
  await page.evaluate(() => document.fonts.ready);
  await card(`
    <div class="brand">M<span>O</span>OH</div>
    <div class="tag">Como usar o app</div>
    <h1>Desafio 21 dias</h1>
    <p>Do cadastro ao seu primeiro dia, <b>passo a passo</b>.</p>
    <p style="font-size:15px">Dados de exemplo: os nomes são fictícios.</p>
    <div class="motto">NÃO BUSCAMOS PERFEIÇÃO. BUSCAMOS <b>CONSTÂNCIA.</b></div>`);
  const tStart = Date.now();
  await wait(4500);
  await page.evaluate(() => window.__hideCard());

  // 1. cadastro
  await caption('1', 'Abra o link que o studio mandou e toque em "Criar conta".');
  await wait(2600);
  await tap('[data-mode=register]', 900);
  await caption('', 'Preencha nome, e-mail e uma senha (mínimo 6 caracteres).');
  await type('[name=name]', 'Lucas Pereira');
  await type('[name=email]', 'lucas@exemplo.com');
  await type('[name=password]', 'minhasenha');
  await wait(600);
  await caption('', 'Use o código do desafio que você recebeu do seu personal: MOOH21.');
  await type('[name=code]', 'MOOH21');
  await wait(1200);
  await tap('#auth-form button[type=submit]', 1500);

  // 2. instalar
  await page.evaluate(() => window.__hideCaption());
  await card(`
    <div class="brand">M<span>O</span>OH</div>
    <div class="tag">Dica</div>
    <h1>Instale na tela inicial</h1>
    <p><b>iPhone (Safari):</b> toque em Compartilhar e depois em "Adicionar à Tela de Início".</p>
    <p><b>Android (Chrome):</b> toque no menu ⋮ e depois em "Instalar app".</p>
    <p>Assim o desafio abre como um aplicativo, direto da tela do celular.</p>`);
  await wait(6500);
  await page.evaluate(() => window.__hideCard());

  // 3. tela inicial
  await caption('2', 'Na tela Início você vê seus pontos e a meta de 50 pontos.');
  await wait(4200);
  await scrollToEl('.day-hero', 120, 900);
  await caption('', 'Aqui aparece o desafio de hoje. Cada dia abre na sua data.');
  await wait(3800);

  // 4. perfil: compromisso, desafio individual e metas
  await caption('3', 'Primeiro, vá em Perfil e escreva o seu compromisso para os 21 dias.');
  await tap('.tabbar a[href="#/perfil"]', 1200);
  await scrollToEl('#commitment', 160, 800);
  await type('#commitment', 'Daqui a 21 dias eu quero ter mais energia e treinar sem faltar.');
  await tap('#save-commitment', 1500);
  await caption('', 'Escolha também um desafio só seu, para cumprir todos os dias.');
  await scrollToEl('#personal', 160, 800);
  await type('#personal', 'Beber 2 litros de água por dia');
  await tap('#save-personal', 1500);
  await caption('', 'E liste metas menores que te ajudam a chegar lá.');
  await scrollToEl('#goal-form', 220, 900);
  await type('#goal-form input', 'Treinar 3x por semana');
  await tap('#goal-form button', 2000);

  // 5. desafio do dia
  await caption('4', 'Fez o desafio de hoje? Na tela Início, toque em "Marcar como feito".');
  await tap('.tabbar a[href="#/inicio"]', 1200);
  await scrollToEl('.day-hero', 120, 800);
  await tap('.day-hero [data-day]', 1000);
  await caption('', 'Escreva sua resposta (opcional) e toque em "Concluí este desafio!".');
  await type('#day-note', 'Quero ter mais energia e treinar sem faltar!');
  await tap('#day-done', 2600);

  // 6. desafio individual
  await caption('5', 'Cumpriu o seu desafio individual hoje? Toque no dia para marcar.');
  await scrollToEl('[data-pday="1"]', 220, 900);
  await wait(800);
  await tap('[data-pday="1"]', 2400);

  // 7. foto
  await caption('6', 'Poste uma foto do seu dia: cada dia com foto vale +1 ponto.');
  await scrollToEl('#quick-post', 260, 900);
  await wait(800);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tap('#quick-post', 200)]);
  await chooser.setFiles(minhaFoto);
  await page.waitForSelector('#publish');
  await wait(800);
  await type('#caption', 'Dia 1 feito! 💪');
  await tap('#publish', 2600);

  // 8. colegas
  await caption('7', 'No Feed, curta e comente as fotos dos colegas. Juntos somos mais fortes!');
  await scrollToEl('#posts article:nth-of-type(2)', 70, 900);
  await tap('#posts article:nth-of-type(2) [data-like]', 900);
  await scrollToEl('#posts article:nth-of-type(2) .comment-form', 300, 700);
  await type('#posts article:nth-of-type(2) .comment-form input', 'Arrasou, Fê! 🔥');
  await page.keyboard.press('Enter'); // "enviar" do teclado; o botão fica sob a barra de abas no último post
  await wait(2200);

  // 9. desafios
  await caption('8', 'Em Desafios você vê os 21 dias. Os próximos abrem um por dia.');
  await tap('.tabbar a[href="#/desafios"]', 1500);
  await page.evaluate(() => window.__smoothTo(420, 2200));
  await wait(2600);

  // 10. mural
  await caption('9', 'No Mural ficam os recados e as missões dos seus personais.');
  await tap('.tabbar a[href="#/mural"]', 3600);

  // 11. ranking
  await caption('10', 'Em Início, "Ver ranking" mostra a pontuação da turma.');
  await tap('.tabbar a[href="#/inicio"]', 1200);
  await tap('a[href="#/ranking"]', 4000);

  await page.evaluate(() => window.__hideCaption());
  await card(`
    <div class="brand">M<span>O</span>OH</div>
    <div class="tag">Todo dia</div>
    <h1>Bora pra cima!</h1>
    <p>1. Faça o desafio do dia e marque no app.<br>2. Cumpra o seu desafio individual.<br>3. Poste uma foto e incentive os colegas.</p>
    <p><b>Meta: 50 pontos ou mais!</b></p>
    <div class="motto">NÃO BUSCAMOS PERFEIÇÃO. BUSCAMOS <b>CONSTÂNCIA.</b></div>`);
  await wait(5000);

  const video = page.video();
  await ctx.close();
  const webm = path.join(OUT, 'guia-aluno.webm');
  fs.renameSync(await video.path(), webm);
  fs.writeFileSync(path.join(OUT, 'inicio.txt'), String(((tStart - t0) / 1000).toFixed(2)));
  console.log({ webm, cortarInicio: ((tStart - t0) / 1000).toFixed(2), errs });
  await browser.close(); server.close(); await app.locals.db.close();
})().catch((e) => { console.error(e); process.exit(1); });
