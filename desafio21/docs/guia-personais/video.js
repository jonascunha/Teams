// Grava o vídeo do guia das personais: o app rodando com a turma de exemplo, com legendas na tela
// e uma marcação de toque em cada ação. Gera um .webm; converta para .mp4 com o ffmpeg (veja LEIAME.md).
// Uso: node video.js PASTA_SAIDA PASTA_DADOS
const fs = require('fs');
const path = require('path');
const { createApp } = require(path.join(__dirname, '..', '..', 'src', 'app'));
const { chromium, devices } = require('playwright');
const { montarTurma } = require('./turma-exemplo');

const OUT = process.argv[2];
const DATA = process.argv[3];
// Área visível do iPhone 13 no Playwright (a tela tem 844 de altura, mas a barra do navegador ocupa o resto)
const W = 390;
const H = 664;

// Legenda, marcação de toque e cartões de abertura/fechamento, desenhados por cima do app
const OVERLAY = () => {
  const css = `
    #cap { position: fixed; left: 12px; right: 12px; bottom: 138px; z-index: 3000; background: rgba(10,10,10,.94);
      border: 1.5px solid #c4f82a; border-radius: 16px; padding: 12px 14px; color: #fff; font: 600 16px/1.35 Inter, sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,.6); transition: opacity .25s; pointer-events: none; }
    #cap b { color: #c4f82a; font-family: "Barlow Condensed", Impact, sans-serif; font-size: 20px; margin-right: 6px; }
    .tapdot { position: fixed; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; z-index: 3001; pointer-events: none;
      background: rgba(196,248,42,.45); border: 3px solid #c4f82a; animation: tap .7s ease-out forwards; }
    @keyframes tap { 0% { transform: scale(.4); opacity: 1 } 100% { transform: scale(1.5); opacity: 0 } }
    #card { position: fixed; inset: 0; z-index: 4000; background: #0a0a0a; color: #fff; display: flex; flex-direction: column;
      justify-content: center; padding: 32px; font-family: Inter, sans-serif; }
    #card .brand { font: 800 30px "Barlow Condensed", Impact, sans-serif; letter-spacing: 1px; }
    #card .brand span { color: #c4f82a; }
    #card .tag { display: inline-block; align-self: flex-start; margin-top: 60px; background: #c4f82a; color: #0a0a0a; font: italic 800 26px "Barlow Condensed", Impact, sans-serif; padding: 2px 10px; transform: skew(-8deg); }
    #card h1 { font: 800 58px/1 "Barlow Condensed", Impact, sans-serif; text-transform: uppercase; margin: 10px 0 0; }
    #card p { color: #cfcfcf; font-size: 18px; line-height: 1.45; margin-top: 18px; }
    #card p b { color: #c4f82a; }
    #card .motto { margin-top: auto; border: 1.5px solid #c4f82a; border-radius: 999px; padding: 10px; text-align: center; font-weight: 700; font-size: 13px; }
    #card .motto b { color: #c4f82a; }`;
  window.__ensureStyle = () => {
    if (document.getElementById('ov-style')) return;
    const st = document.createElement('style'); st.id = 'ov-style'; st.textContent = css; document.head.appendChild(st);
  };
  window.__caption = (num, text) => {
    window.__ensureStyle();
    let c = document.getElementById('cap');
    if (!c) { c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c); }
    c.innerHTML = (num ? `<b>${num}</b>` : '') + text;
  };
  window.__hideCaption = () => document.getElementById('cap')?.remove();
  window.__tap = (x, y) => {
    window.__ensureStyle();
    const d = document.createElement('div'); d.className = 'tapdot'; d.style.left = x + 'px'; d.style.top = y + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 800);
  };
  window.__card = (html) => {
    window.__ensureStyle();
    let c = document.getElementById('card');
    if (!c) { c = document.createElement('div'); c.id = 'card'; document.body.appendChild(c); }
    c.innerHTML = html;
  };
  window.__hideCard = () => document.getElementById('card')?.remove();
  window.__smoothTo = (y, ms) => new Promise((resolve) => {
    const start = window.scrollY; const dist = y - start; const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, start + dist * e);
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
};

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = await createApp({ dataDir: DATA, bucket: null, databaseUrl: null });
  const server = app.listen(3497);
  const B = 'http://localhost:3497';
  const browser = await chromium.launch();
  const { carol } = await montarTurma(B, browser);
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

  const wait = (ms) => page.waitForTimeout(ms);
  const caption = (num, text) => page.evaluate(([n, t]) => window.__caption(n, t), [num, text]);
  const scrollToEl = async (sel, offset = 90, ms = 900) => {
    const y = await page.evaluate(([s, o]) => {
      const el = document.querySelector(s); return el.getBoundingClientRect().top + window.scrollY - o;
    }, [sel, offset]);
    await page.evaluate(([yy, m]) => window.__smoothTo(yy, m), [Math.max(0, y), ms]);
    await wait(250);
  };
  const tap = async (sel, after = 900) => {
    const loc = page.locator(sel).first();
    const box = await loc.boundingBox();
    await page.evaluate(([x, y]) => window.__tap(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
    await wait(450);
    await loc.click();
    await wait(after);
  };
  const type = async (sel, text) => { const l = page.locator(sel).first(); await l.click(); await l.pressSequentially(text, { delay: 28 }); };

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
