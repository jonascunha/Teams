// Grava o vídeo do guia das personais: o app rodando com a turma de exemplo, com legendas na tela
// e uma marcação de toque em cada ação. Gera um .webm; converta para .mp4 com o ffmpeg (veja LEIAME.md).
// Uso: node video.js PASTA_SAIDA PASTA_DADOS
const fs = require('fs');
const path = require('path');
const { createApp } = require(path.join(__dirname, '..', '..', 'src', 'app'));
const { chromium, devices } = require('playwright');
const { montarTurma, criarRelogio } = require('./turma-exemplo');
const { OVERLAY, acoes } = require('./video-comum');

const OUT = process.argv[2];
const DATA = process.argv[3];
// Área visível do iPhone 13 no Playwright (a tela tem 844 de altura, mas a barra do navegador ocupa o resto)
const W = 390;
const H = 664;


(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const relogio = criarRelogio();
  const app = await createApp({ dataDir: DATA, bucket: null, databaseUrl: null, now: () => relogio.agora() });
  const server = app.listen(3497);
  const B = 'http://localhost:3497';
  const browser = await chromium.launch();
  const { carol } = await montarTurma(B, browser, relogio);
  // No vídeo a curtida é feita na tela: tira as curtidas que a Carol já tinha na turma de exemplo
  for (const p of await carol('GET', '/posts')) if (p.liked) await carol('POST', `/posts/${p.id}/like`);

  const ctx = await browser.newContext({
    ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  await ctx.addInitScript(OVERLAY);
  await ctx.addCookies([{ name: 'sid', value: carol.sid(), url: B }]);
  const t0 = Date.now();
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));

  const { wait, caption, scrollToEl, tap, type } = acoes(page);

  // abertura
  await page.goto(B + '/#/perfil');
  await page.waitForSelector('#logout');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__card(`
    <div class="brand">M<span>O</span>OH</div>
    <div class="tag">Guia das personais</div>
    <h1>Desafio 21 dias</h1>
    <p>Como acompanhar a turma pelo app, <b>passo a passo</b>.</p>
    <p style="font-size:15px">Dados de exemplo: os nomes são fictícios.</p>
    <div class="motto">NÃO BUSCAMOS PERFEIÇÃO. BUSCAMOS <b>CONSTÂNCIA.</b></div>`));
  const tStart = Date.now();
  await wait(4500);
  await page.evaluate(() => window.__hideCard());

  // 1. abrir o painel
  await caption('1', 'No <b style="font-size:16px;font-family:Inter">Perfil</b>, toque em "Painel dos personais".');
  await wait(2200);
  await tap('a[href="#/admin"]', 1200);

  // 2. resumo
  await caption('2', 'O resumo mostra quantos alunos já fizeram o desafio de hoje e a média da turma.');
  await wait(4800);

  // 3. filtro
  await caption('3', 'Toque em "Não fizeram hoje" para ver só quem precisa de um incentivo.');
  await wait(1800);
  await tap('[data-filter=pending]', 3600);
  await tap('[data-filter=all]', 800);

  // 4. ficha do aluno
  await caption('4', 'Cada linha mostra: fez hoje ou pendente, desafios concluídos, desafio individual e pontos.');
  await wait(4200);
  await caption('', 'Toque no nome do aluno para abrir a ficha completa.');
  await wait(1500);
  await tap('#student-list .admin-user summary', 1000);
  await scrollToEl('#student-list .admin-user', 80, 900);
  await caption('', 'Quadradinhos verdes = dias cumpridos: desafios do studio e desafio individual.');
  await wait(4200);
  await caption('', 'Também aparecem o compromisso e as respostas dos dias de reflexão.');
  await tap('#student-list .admin-user details summary', 3200);

  // 5. pontos
  await scrollToEl('#student-list .admin-user .bonus-form', 150, 900);
  await caption('5', 'Pontos extras: toque no motivo e depois em "Lançar pontos".');
  await wait(2200);
  await tap('#student-list .admin-user [data-reason="Treino realizado"]', 900);
  await tap('#student-list .admin-user .bonus-form button.btn', 2600);

  // 6. configurações
  await caption('6', 'No fim do painel ficam as Configurações: data de início, código e ranking.');
  await scrollToEl('#start', 140, 1600);
  await wait(4200);

  // 7. editar desafio
  await caption('7', 'Em "Editar desafios", escreva a missão surpresa do dia 12 (e as dos dias 16 e 19).');
  await scrollToEl('[data-edit-day="12"]', 250, 1000);
  await wait(1200);
  await tap('[data-edit-day="12"]', 900);
  await page.locator('#day-form [name=description]').fill('');
  await type('#day-form [name=description]', 'Missão surpresa: 50 agachamentos ao longo do dia + foto no feed!');
  await wait(800);
  await tap('#day-form button.btn', 2400);

  // 8. mural
  await caption('8', 'No Mural, publiquem recados para a turma. Avisos importantes: "Fixar no topo".');
  await wait(1200);
  await tap('.tabbar a[href="#/mural"]', 1200);
  await tap('#new-notice', 900);
  await type('#notice-form [name=title]', 'Missão da semana');
  await type('#notice-form [name=body]', '3 treinos no studio + 1 atividade ao ar livre até domingo!');
  await tap('#notice-form [name=pinned]', 500);
  await tap('#notice-form button[type=submit]', 2600);

  // 9. feed
  await caption('9', 'No Feed, curtam e comentem as fotos: é o que mais engaja a turma.');
  await wait(1000);
  await tap('.tabbar a[href="#/feed"]', 1400);
  await tap('.post [data-like]', 900);
  await scrollToEl('.post .comment-form', 300, 800);
  await type('.post .comment-form input', 'Mandou bem! 💪');
  await tap('.post .comment-form button', 2200);
  await caption('', 'A lixeira apaga uma foto ou comentário inadequado.');
  await page.evaluate(() => window.__smoothTo(0, 700));
  await wait(3000);

  // 10. ranking
  await caption('10', 'Na tela Início, "Ver ranking" mostra quem está mais perto da meta de 50 pontos.');
  await tap('.tabbar a[href="#/inicio"]', 1200);
  await tap('a[href="#/ranking"]', 4200);

  // fechamento
  await page.evaluate(() => window.__hideCaption());
  await page.evaluate(() => window.__card(`
    <div class="brand">M<span>O</span>OH</div>
    <div class="tag">Pronto!</div>
    <h1>Bom desafio, turma!</h1>
    <p>O passo a passo completo está no <b>Guia das Personais (PDF)</b>.</p>
    <p>Dúvidas ou problemas no app: <b>falem com o Jonas</b>.</p>
    <div class="motto">NÃO BUSCAMOS PERFEIÇÃO. BUSCAMOS <b>CONSTÂNCIA.</b></div>`));
  await wait(4500);

  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  const webm = path.join(OUT, 'guia-personais.webm');
  fs.renameSync(raw, webm);
  // segundos iniciais (página em branco carregando) a cortar na conversão
  fs.writeFileSync(path.join(OUT, 'inicio.txt'), String(((tStart - t0) / 1000).toFixed(2)));
  console.log({ webm, cortarInicio: ((tStart - t0) / 1000).toFixed(2), errs });
  await browser.close(); server.close(); await app.locals.db.close();
})().catch((e) => { console.error(e); process.exit(1); });
