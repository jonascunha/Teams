// Gera uma página única (HTML) de demonstração do app, sem servidor: a API é simulada no navegador
// (demo/mock-api.js) com dados de exemplo. Serve para mostrar o app antes de publicar.
// Uso: node scripts/build-demo.js saida.html [imagem-do-cartaz.jpg]
const fs = require('node:fs');
const path = require('node:path');
const challenge = require('../src/challenge');

const [out, posterPath] = process.argv.slice(2);
if (!out) {
  console.error('Uso: node scripts/build-demo.js saida.html [imagem-do-cartaz.jpg]');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
// Evita que um "</script>" dentro do código feche a tag antes da hora
const inline = (code) => code.replace(/<\/script/gi, '<\\/script');

const appJs = read('public/app.js').replace(/\nif \('serviceWorker' in navigator\) \{[\s\S]*?\n\}\n/, '\n');
const poster = posterPath ? `data:image/jpeg;base64,${fs.readFileSync(posterPath).toString('base64')}` : null;

const html = `<title>Desafio 21 Dias MOOH</title>
<meta name="theme-color" content="#0a0a0a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,800;1,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${read('public/styles.css')}
/* faixa do modo demonstração */
.demo-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px;
  padding: 8px 16px; background: var(--lime); color: var(--on-lime); font-size: 13px;
}
.demo-bar b { font-weight: 800; }
.demo-bar .grow { flex: 1 1 220px; min-width: 0; }
.demo-bar button {
  border: 1.5px solid var(--on-lime); background: transparent; color: var(--on-lime);
  border-radius: 999px; padding: 5px 12px; font-weight: 700; font-size: 13px; cursor: pointer;
}
.demo-bar button:focus-visible { outline: 2px solid var(--on-lime); outline-offset: 2px; }
</style>
<div class="demo-bar" id="demo-bar" role="region" aria-label="Modo demonstração">
  <span class="grow"><b>Demonstração</b> · dados de exemplo · senha 123456</span>
  <button type="button" data-as="aluno">Ver como aluna</button>
  <button type="button" data-as="personal">Ver como personal</button>
  <button type="button" data-reset>Recomeçar</button>
</div>
<div id="app"><div class="splash"><div class="logo">MOOH</div></div></div>
<nav id="tabbar" class="tabbar" hidden></nav>
<div id="modal-root"></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<script>
${inline(read('public/icons.js'))}
</script>
<script>
const DEMO_CHALLENGE = ${JSON.stringify(challenge)};
${poster ? `window.DEMO_POSTER = ${JSON.stringify(poster)};` : ''}
${inline(read('demo/mock-api.js'))}
</script>
<script>
${inline(appJs)}
</script>
`;

fs.writeFileSync(out, html);
console.log(`Demonstração gerada em ${out} (${Math.round(html.length / 1024)} KB)`);
