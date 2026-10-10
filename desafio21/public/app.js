/* Desafio 21 Dias — front-end (SPA sem build) */
'use strict';

const $app = document.getElementById('app');
const $tabbar = document.getElementById('tabbar');
const $modalRoot = document.getElementById('modal-root');
const $toast = document.getElementById('toast');

const state = { me: null, challenge: null };

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* vazio */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Falha na conexão. Tente novamente.');
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  $toast.textContent = msg;
  $toast.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.className = 'toast' + (isError ? ' err' : ''); }, 2600);
}

function avatar(user, cls = '') {
  if (user && user.avatar) return `<img class="avatar ${cls}" src="${esc(user.avatar)}" alt="" loading="lazy">`;
  const initial = (user && user.name ? user.name.trim()[0] : '?').toUpperCase();
  return `<div class="avatar ${cls}">${esc(initial)}</div>`;
}

function timeAgo(sqlDate) {
  const d = new Date(sqlDate.replace(' ', 'T') + 'Z');
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 604800) return `${Math.floor(s / 86400)} d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

const ptsLabel = (n) => `${n} ${Math.abs(n) === 1 ? 'ponto' : 'pontos'}`;

// Redimensiona a foto no celular antes do envio (economiza dados e espaço)
async function resizeImage(file, maxSide = 1440, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Não foi possível ler esta imagem.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

// ---------- modal ----------
function openModal(title, html, onMount) {
  $modalRoot.innerHTML = `
    <div class="modal-bg" data-close>
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h2 class="display">${esc(title)}</h2>
          <button class="icon-btn" data-close aria-label="Fechar">${icon('x', 20)}</button></div>
        <div class="modal-content">${html}</div>
      </div>
    </div>`;
  const bg = $modalRoot.firstElementChild;
  bg.addEventListener('click', (e) => {
    if (e.target === bg || e.target.closest('[data-close]') && e.target.closest('.modal-head')) closeModal();
  });
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(bg.querySelector('.modal-content'));
}
function closeModal() {
  $modalRoot.innerHTML = '';
  document.body.style.overflow = '';
}

// ---------- navegação ----------
const TABS = [
  ['inicio', 'home', 'Início'],
  ['desafios', 'list', 'Desafios'],
  ['feed', 'image', 'Feed'],
  ['mural', 'megaphone', 'Mural'],
  ['perfil', 'user', 'Perfil'],
];

function renderTabbar(active) {
  if (!state.me) { $tabbar.hidden = true; return; }
  $tabbar.hidden = false;
  $tabbar.innerHTML = TABS.map(([id, ic, label]) =>
    `<a href="#/${id}" class="${active === id ? 'active' : ''}">${icon(ic, 22)}<span>${label}</span></a>`).join('');
}

const routes = {
  inicio: viewHome,
  desafios: viewChallenge,
  feed: viewFeed,
  mural: viewNotices,
  perfil: viewProfile,
  ranking: viewRanking,
  admin: viewAdmin,
};

async function router() {
  const route = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/')[0];
  closeModal();
  if (!state.me) {
    try {
      await loadMe();
    } catch (e) {
      if (e.status === 401) { renderTabbar(); return viewAuth(); }
      $app.innerHTML = `<div class="page"><div class="empty">${icon('x', 32)}<p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div></div>`;
      return;
    }
  }
  const view = routes[route] || viewHome;
  const tab = TABS.some(([id]) => id === route) ? route : (route === 'ranking' ? 'inicio' : 'perfil');
  renderTabbar(tab);
  window.scrollTo(0, 0);
  try {
    await view();
  } catch (e) {
    if (e.status === 401) { state.me = null; renderTabbar(); return viewAuth(); }
    toast(e.message, true);
  }
}

async function loadMe() {
  state.me = await api('GET', '/me');
  return state.me;
}
async function loadChallenge() {
  state.challenge = await api('GET', '/challenge');
  return state.challenge;
}

window.addEventListener('hashchange', router);

// ---------- login / cadastro ----------
function viewAuth(mode = 'login') {
  $app.innerHTML = `
    <div class="auth">
      <div class="logo">M<span>O</span>OH <span class="muted small" style="font-family:Inter;font-weight:600;letter-spacing:2px">PERSONAL STUDIO</span></div>
      <h1 class="display hero-title"><span class="tag">Desafio</span><br>21 dias</h1>
      <p class="hero-sub">21 dias para criar hábitos, superar limites e provar para você mesmo <b>que consegue!</b></p>
      <div class="tabs">
        <button data-mode="login" class="${mode === 'login' ? 'on' : ''}">Entrar</button>
        <button data-mode="register" class="${mode === 'register' ? 'on' : ''}">Criar conta</button>
      </div>
      <form id="auth-form" class="stack" novalidate>
        ${mode === 'register' ? `
          <label class="field"><span>Seu nome</span><input class="input" name="name" autocomplete="name" required maxlength="60"></label>` : ''}
        <label class="field"><span>E-mail</span><input class="input" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" required></label>
        <label class="field"><span>Senha</span><input class="input" name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" required minlength="6"></label>
        ${mode === 'register' ? `
          <label class="field"><span>Código do desafio (fornecido pelo seu personal)</span><input class="input" name="code" autocapitalize="characters" autocomplete="off" required></label>` : ''}
        <div class="error" id="auth-error"></div>
        <button class="btn block" type="submit">${mode === 'register' ? 'Começar meu desafio' : 'Entrar'}</button>
        ${mode === 'login' ? '<p class="muted small center">Esqueceu a senha? Peça ao seu personal para gerar uma senha temporária.</p>' : ''}
      </form>
    </div>`;
  $app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => viewAuth(b.dataset.mode)));
  const form = document.getElementById('auth-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api('POST', mode === 'register' ? '/register' : '/login', data);
      state.me = null;
      if (location.hash === '#/inicio') router(); else location.hash = '#/inicio';
    } catch (err) {
      document.getElementById('auth-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- início ----------
async function viewHome() {
  const [me, ch] = await Promise.all([loadMe(), loadChallenge()]);
  const { score, meta, currentDay } = me;
  const pct = Math.min(100, Math.round((score.total / meta) * 100));
  const today = currentDay >= 1 && currentDay <= 21 ? ch.days[currentDay - 1] : null;
  const firstName = me.user.name.split(' ')[0];

  let dayBlock;
  if (currentDay === 0) {
    dayBlock = `<div class="card day-hero">
      <div class="big-ic">${icon('target', 120)}</div>
      <div class="display daynum">${me.startDate ? 'Começa em ' + esc(formatDate(me.startDate)) : 'Em breve'}</div>
      <h3 class="display">Prepare-se!</h3>
      <p class="muted">O desafio ainda não começou. Enquanto isso, defina seu desafio individual e suas metas no perfil.</p>
      <a class="btn sm" href="#/perfil">Definir meu desafio</a></div>`;
  } else if (!today) {
    dayBlock = `<div class="card day-hero">
      <div class="big-ic">${icon('trophy', 120)}</div>
      <div class="display daynum">Desafio encerrado</div>
      <h3 class="display">Você chegou até aqui!</h3>
      <p class="muted">Você completou ${score.completed} de 21 desafios. Obrigado por fazer parte!</p></div>`;
  } else {
    dayBlock = `<div class="card day-hero">
      <div class="big-ic">${icon(today.icon, 120)}</div>
      <div class="display daynum">Dia ${today.day} de 21 · Semana ${today.week}</div>
      <h3 class="display">${esc(today.title)}</h3>
      <p>${esc(today.description)}</p>
      <div class="row between" style="margin-top:12px">
        <span class="badge dark">${ptsLabel(today.points)}</span>
        ${today.done
          ? `<button class="btn sm outline" data-day="${today.day}">${icon('check', 18)} Feito!</button>`
          : `<button class="btn sm" data-day="${today.day}">Marcar como feito</button>`}
      </div></div>`;
  }

  const pendingPast = currentDay > 1 ? ch.days.filter((d) => d.day < Math.min(currentDay, 22) && !d.done) : [];

  $app.innerHTML = `
    <div class="page">
      <div class="topbar">
        <div><div class="muted small">Olá, ${esc(firstName)} 👊</div><h1 class="display">Disciplina hoje, <span class="lime">resultado amanhã!</span></h1></div>
        <a href="#/perfil">${avatar(me.user)}</a>
      </div>

      <div class="card score-card">
        <div class="ring" style="--p:${pct}"><div><b>${score.total}</b><small>pontos</small></div></div>
        <div class="grow">
          <div class="display" style="font-size:22px">Meta: ${meta} pontos</div>
          <div class="progress" style="margin:8px 0"><i style="width:${pct}%"></i></div>
          <div class="small muted">${score.completed}/21 desafios · ${score.photos} check-ins com foto${score.bonus ? ` · ${score.bonus} bônus` : ''}</div>
          <a href="#/ranking" class="small" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px">${icon('trophy', 16)} Ver ranking</a>
        </div>
      </div>
      <div class="motto">NÃO BUSCAMOS PERFEIÇÃO. BUSCAMOS <b>CONSTÂNCIA.</b></div>

      <div class="section-title"><h2 class="display">Desafio de hoje</h2></div>
      ${dayBlock}

      ${pendingPast.length ? `
        <div class="section-title"><h2 class="display">Ficou pra trás?</h2><span class="small muted">${pendingPast.length} pendente(s)</span></div>
        <div class="card"><div class="chip-list">${pendingPast.map((d) => `<button class="chip" data-day="${d.day}">Dia ${d.day} · ${esc(d.title)}</button>`).join('')}</div></div>` : ''}

      <div class="section-title"><h2 class="display">Meu desafio individual</h2><a class="small" href="#/perfil">Editar</a></div>
      ${personalBlock(me)}

      <div class="section-title"><h2 class="display">Check-in com foto</h2></div>
      <div class="card row">
        <div class="grow">${me.postedToday
          ? '<b class="lime">Check-in de hoje feito!</b><div class="small muted">Você já ganhou +1 ponto hoje. Pode postar mais fotos à vontade.</div>'
          : '<b>Poste uma foto do seu dia</b><div class="small muted">Ganhe +1 ponto por dia com foto no feed.</div>'}</div>
        <button class="btn sm" id="quick-post">${icon('camera', 18)} Postar</button>
      </div>
      ${installTip()}
    </div>`;

  $app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => openDay(Number(b.dataset.day), viewHome)));
  bindPersonalDots(viewHome);
  document.getElementById('quick-post').addEventListener('click', () => newPost(() => { location.hash = '#/feed'; }));
}

function personalBlock(me) {
  if (!me.user.personal_challenge) {
    return `<div class="card"><p class="muted" style="margin-top:0">Além dos desafios do studio, escolha <b>um desafio só seu</b> para os 21 dias (ex.: "beber 2L de água por dia", "não pular o café da manhã").</p>
      <a class="btn sm" href="#/perfil">Criar meu desafio</a></div>`;
  }
  const cur = me.currentDay;
  const done = new Set(me.personal);
  return `<div class="card">
    <div class="row" style="margin-bottom:12px">${icon('target', 22, 'lime')}<b class="grow">${esc(me.user.personal_challenge)}</b><span class="badge dark" id="personal-count">${done.size}/21</span></div>
    <div class="dots">${Array.from({ length: 21 }, (_, i) => {
      const d = i + 1;
      return `<button class="dot ${done.has(d) ? 'on' : ''} ${d === cur ? 'today' : ''}" data-pday="${d}" ${d > cur ? 'disabled' : ''} aria-label="Dia ${d}">${d}</button>`;
    }).join('')}</div>
    <p class="small muted" style="margin-bottom:0">Toque no dia para marcar que você cumpriu seu desafio individual.</p>
  </div>`;
}

function bindPersonalDots(refresh) {
  $app.querySelectorAll('[data-pday]').forEach((b) => b.addEventListener('click', async () => {
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    const counter = document.getElementById('personal-count');
    if (counter) counter.textContent = `${$app.querySelectorAll('[data-pday].on').length}/21`;
    try {
      await api('PUT', `/personal/${b.dataset.pday}`, { done: on });
    } catch (e) {
      toast(e.message, true);
      refresh();
    }
  }));
}

function installTip() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div class="card install-tip" style="margin-top:22px">${icon('share', 18, 'lime')}
    <b>Instale o app na tela inicial:</b> ${ios
      ? 'no Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.'
      : 'no Chrome, toque no menu <b>⋮</b> e depois em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).'}</div>`;
}

// ---------- detalhe do dia ----------
function openDay(dayNum, refresh) {
  const ch = state.challenge;
  const d = ch.days.find((x) => x.day === dayNum);
  const locked = ch.currentDay === 0 || d.day > ch.currentDay;
  const reflective = [1, 7, 15, 21].includes(d.day);
  openModal(`Dia ${d.day}`, `
    <div class="row" style="margin-bottom:10px"><span class="lime">${icon(d.icon, 40)}</span>
      <div><div class="display" style="font-size:26px">${esc(d.title)}</div><span class="badge dark">${ptsLabel(d.points)}</span></div></div>
    <p>${esc(d.description)}</p>
    ${locked ? `<div class="card row">${icon('lock', 20, 'lime')}<span>Este desafio será liberado ${ch.startDate ? 'em ' + esc(formatDate(addDays(ch.startDate, d.day - 1))) : 'quando o desafio começar'}.</span></div>` : `
      <label class="field" style="margin:14px 0"><span>${reflective ? 'Sua resposta (fica só para você e seus personais)' : 'Anotação (opcional)'}</span>
        <textarea class="input" id="day-note" maxlength="2000" placeholder="${d.day === 1 ? 'Daqui a 21 dias eu quero...' : 'Como foi?'}">${esc(d.note)}</textarea></label>
      <div class="stack">
        <button class="btn block" id="day-done">${icon('check', 20)} ${d.done ? 'Salvar anotação' : 'Concluí este desafio!'}</button>
        ${d.done ? '<button class="btn block ghost" id="day-undo">Desmarcar</button>' : ''}
      </div>`}
  `, (root) => {
    const save = async (done) => {
      try {
        const r = await api('PUT', `/challenge/${d.day}`, { done, note: root.querySelector('#day-note').value });
        closeModal();
        toast(done ? (d.done ? 'Anotação salva!' : `+${d.points} pontos! Total: ${r.score.total} 💪`) : 'Desafio desmarcado.');
        refresh();
      } catch (e) { toast(e.message, true); }
    };
    root.querySelector('#day-done')?.addEventListener('click', () => save(true));
    root.querySelector('#day-undo')?.addEventListener('click', () => save(false));
  });
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- desafios (21 dias) ----------
async function viewChallenge() {
  const ch = await loadChallenge();
  const done = ch.days.filter((d) => d.done).length;
  $app.innerHTML = `
    <div class="page">
      <div class="topbar"><h1 class="display"><span class="lime">Desafio</span> 21 dias</h1><span class="badge">${done}/21</span></div>
      <p class="muted" style="margin-top:0">Mais movimento <b class="lime">+</b> mais saúde <b class="lime">+</b> mais você.
        ${ch.currentDay === 0 ? (ch.startDate ? `Começa em <b>${esc(formatDate(ch.startDate))}</b>.` : 'A data de início será definida pelos personais.') : ''}</p>
      ${ch.weeks.map((w) => `
        <div class="week-head"><span class="display pill">Semana ${w.week}</span><h2 class="display">${esc(w.title)}</h2></div>
        <p class="week-sub">${esc(w.subtitle)}</p>
        <div class="days-grid">${ch.days.filter((d) => d.week === w.week).map(dayCard).join('')}</div>`).join('')}

      <div class="section-title"><h2 class="display">Sistema de pontos</h2></div>
      <div class="card">
        <ul class="points-list">${ch.pointsTable.map(([k, v]) => `<li><span>${esc(k)}</span><b>${v}</b></li>`).join('')}</ul>
        <p class="small muted" style="margin-bottom:0">Os desafios diários somam os pontos de cada dia. A foto/check-in conta automaticamente (1 por dia). Treinos, ajuda a colegas e missões extras são lançados pelos personais. <b class="lime">Meta: ${ch.meta} pontos ou mais!</b></p>
      </div>

      <div class="section-title"><h2 class="display">Premiação MOOH</h2></div>
      <div class="card">${ch.awards.map((a) => `<div class="award">${icon(a.icon, 26)}<div><b>${esc(a.title)}</b><div class="small muted">${esc(a.description)}</div></div></div>`).join('')}</div>
    </div>`;
  $app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => openDay(Number(b.dataset.day), viewChallenge)));

  function dayCard(d) {
    const locked = ch.currentDay === 0 || d.day > ch.currentDay;
    const cls = [d.done ? 'done' : '', locked ? 'locked' : '', d.day === ch.currentDay ? 'today' : ''].join(' ');
    return `<button class="day-card ${cls}" data-day="${d.day}">
      <div class="dhead">DIA ${d.day}</div>
      <div class="dic">${icon(locked && !d.done ? 'lock' : d.icon, 34)}</div>
      <div class="dtitle">${esc(d.title)}</div>
      <div class="dpts"><span class="box">${d.done ? icon('check', 14) : ''}</span>${ptsLabel(d.points).toUpperCase()}</div>
    </button>`;
  }
}

// ---------- mural de recados ----------
async function viewNotices() {
  const notices = await api('GET', '/notices');
  const isAdmin = state.me.user.role === 'admin';
  $app.innerHTML = `
    <div class="page">
      <div class="topbar"><h1 class="display">Mural <span class="lime">MOOH</span></h1>
        ${isAdmin ? `<button class="btn sm" id="new-notice">${icon('plus', 18)} Recado</button>` : ''}</div>
      <p class="muted" style="margin-top:0">Recados e missões dos seus personais.</p>
      ${notices.length ? notices.map((n) => `
        <div class="card notice ${n.pinned ? 'pinned' : ''}">
          <div class="row">${avatar(n.author)}<div class="grow"><b>${esc(n.author.name)}</b><div class="small muted">${timeAgo(n.created_at)}</div></div>
            ${n.pinned ? `<span class="badge">${icon('pin', 12)} fixado</span>` : ''}</div>
          <h3>${esc(n.title)}</h3>
          <p>${linkify(esc(n.body))}</p>
          ${isAdmin ? `<div class="row" style="margin-top:12px">
            <button class="btn sm ghost" data-pin="${n.id}" data-pinned="${n.pinned ? 1 : 0}">${icon('pin', 16)} ${n.pinned ? 'Desafixar' : 'Fixar'}</button>
            <button class="btn sm danger" data-del="${n.id}">${icon('trash', 16)} Apagar</button></div>` : ''}
        </div>`).join('') : `<div class="empty">${icon('megaphone', 40)}<p>Nenhum recado ainda.</p></div>`}
    </div>`;

  if (!isAdmin) return;
  document.getElementById('new-notice').addEventListener('click', () => {
    openModal('Novo recado', `
      <form class="stack" id="notice-form">
        <label class="field"><span>Título</span><input class="input" name="title" maxlength="120" required></label>
        <label class="field"><span>Mensagem</span><textarea class="input" name="body" maxlength="4000" required style="min-height:150px"></textarea></label>
        <label class="switch"><span>Fixar no topo</span><input type="checkbox" name="pinned"></label>
        <button class="btn block" type="submit">Publicar</button>
      </form>`, (root) => {
      const form = root.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        try {
          await api('POST', '/notices', { title: f.get('title'), body: f.get('body'), pinned: !!f.get('pinned') });
          closeModal();
          toast('Recado publicado!');
          viewNotices();
        } catch (err) { toast(err.message, true); }
      });
    });
  });
  $app.querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', async () => {
    await api('PUT', `/notices/${b.dataset.pin}`, { pinned: b.dataset.pinned !== '1' }).catch((e) => toast(e.message, true));
    viewNotices();
  }));
  $app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Apagar este recado?')) return;
    await api('DELETE', `/notices/${b.dataset.del}`).catch((e) => toast(e.message, true));
    viewNotices();
  }));
}

function linkify(escaped) {
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

// ---------- feed ----------
let feedPosts = [];

async function viewFeed() {
  feedPosts = await api('GET', '/posts');
  $app.innerHTML = `
    <div class="page">
      <div class="topbar"><h1 class="display">Feed <span class="lime">#juntos</span></h1></div>
      <p class="muted" style="margin-top:0">Juntos somos mais fortes! Compartilhe seu treino, seu prato, sua conquista.</p>
      <div id="posts"></div>
      <div id="more" class="center" style="margin:16px 0"></div>
    </div>
    <button class="fab" id="fab" aria-label="Nova foto">${icon('camera', 26)}</button>`;
  document.getElementById('fab').addEventListener('click', () => newPost(viewFeed));
  renderPosts();
}

function renderPosts() {
  const box = document.getElementById('posts');
  if (!box) return;
  if (!feedPosts.length) {
    box.innerHTML = `<div class="empty">${icon('camera', 40)}<p>Nenhuma foto ainda. Seja o primeiro a postar!</p></div>`;
    return;
  }
  box.innerHTML = feedPosts.map(postHtml).join('');
  const more = document.getElementById('more');
  more.innerHTML = feedPosts.length % 15 === 0 ? '<button class="btn ghost sm" id="load-more">Carregar mais</button>' : '';
  document.getElementById('load-more')?.addEventListener('click', async () => {
    const older = await api('GET', `/posts?before=${feedPosts[feedPosts.length - 1].id}`);
    feedPosts = feedPosts.concat(older);
    renderPosts();
    if (!older.length) more.innerHTML = '';
  });
  bindPostEvents(box);
}

function postHtml(p) {
  const me = state.me.user;
  const canDelete = p.user.id === me.id || me.role === 'admin';
  return `<article class="card post" data-post="${p.id}">
    <div class="post-head">${avatar(p.user)}
      <div class="grow"><b>${esc(p.user.name)}</b> ${p.user.role === 'admin' ? '<span class="badge">personal</span>' : ''}<div class="small muted">${timeAgo(p.created_at)}</div></div>
      ${canDelete ? `<button class="icon-btn" data-del-post aria-label="Apagar foto">${icon('trash', 18)}</button>` : ''}</div>
    <img class="post-img" src="${esc(p.image)}" alt="Foto de ${esc(p.user.name)}" loading="lazy" data-dbl>
    <div class="post-body">
      <div class="post-actions">
        <button class="react ${p.liked ? 'on' : ''}" data-like>${icon('heart', 24)} <span>${p.likes || ''}</span></button>
        <button class="react" data-focus-comment>${icon('comment', 24)} <span>${p.comments.length || ''}</span></button>
      </div>
      ${p.likes ? `<div class="small muted">💪 ${esc(p.likers.slice(0, 3).join(', '))}${p.likes > 3 ? ` e mais ${p.likes - 3}` : ''}</div>` : ''}
      ${p.caption ? `<p class="caption"><b>${esc(p.user.name.split(' ')[0])}</b> ${esc(p.caption)}</p>` : ''}
      <div class="comments">${p.comments.map((c) => `
        <div class="comment">${avatar(c.user)}<div class="grow"><p><b>${esc(c.user.name)}</b> ${esc(c.body)}</p>
          <span class="small muted">${timeAgo(c.created_at)}${c.user.id === me.id || me.role === 'admin' ? ` · <a href="#" data-del-comment="${c.id}" class="muted">apagar</a>` : ''}</span></div></div>`).join('')}</div>
      <form class="comment-form"><input class="input" name="body" placeholder="Incentive com um comentário..." maxlength="500" autocomplete="off"><button class="icon-btn" aria-label="Enviar">${icon('chevron', 20)}</button></form>
    </div>
  </article>`;
}

function bindPostEvents(box) {
  box.querySelectorAll('[data-post]').forEach((el) => {
    const id = Number(el.dataset.post);
    const post = feedPosts.find((p) => p.id === id);
    const refreshOne = async () => {
      const fresh = (await api('GET', `/posts?before=${id + 1}`)).find((p) => p.id === id);
      if (!fresh) return;
      Object.assign(post, fresh);
      const tmp = document.createElement('div');
      tmp.innerHTML = postHtml(post);
      const neu = tmp.firstElementChild;
      const current = document.querySelector(`[data-post="${id}"]`);
      if (!current) return;
      current.replaceWith(neu);
      bindPostEvents({ querySelectorAll: (s) => (s === '[data-post]' ? [neu] : []) });
    };
    const like = async () => {
      try { await api('POST', `/posts/${id}/like`); await refreshOne(); } catch (e) { toast(e.message, true); }
    };
    el.querySelector('[data-like]').addEventListener('click', like);
    let lastTap = 0;
    el.querySelector('[data-dbl]').addEventListener('click', () => {
      const t = Date.now();
      if (t - lastTap < 350 && !post.liked) like();
      lastTap = t;
    });
    el.querySelector('[data-focus-comment]').addEventListener('click', () => el.querySelector('.comment-form input').focus());
    el.querySelector('.comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = e.target.querySelector('input');
      if (!input.value.trim()) return;
      try { await api('POST', `/posts/${id}/comments`, { body: input.value }); await refreshOne(); } catch (err) { toast(err.message, true); }
    });
    el.querySelectorAll('[data-del-comment]').forEach((a) => a.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Apagar este comentário?')) return;
      try { await api('DELETE', `/comments/${a.dataset.delComment}`); await refreshOne(); } catch (err) { toast(err.message, true); }
    }));
    el.querySelector('[data-del-post]')?.addEventListener('click', async () => {
      if (!confirm('Apagar esta foto?')) return;
      try {
        await api('DELETE', `/posts/${id}`);
        feedPosts = feedPosts.filter((p) => p.id !== id);
        renderPosts();
      } catch (err) { toast(err.message, true); }
    });
  });
}

async function newPost(after) {
  const file = await pickImage();
  if (!file) return;
  let dataUrl;
  try { dataUrl = await resizeImage(file); } catch (e) { return toast(e.message, true); }
  openModal('Nova foto', `
    <img class="preview" src="${dataUrl}" alt="Pré-visualização">
    <label class="field" style="margin:12px 0"><span>Legenda</span><textarea class="input" id="caption" maxlength="1000" placeholder="Conta pra gente como foi o dia! 💪"></textarea></label>
    <button class="btn block" id="publish">${icon('share', 18)} Publicar</button>
  `, (root) => {
    const btn = root.querySelector('#publish');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      try {
        const hadToday = state.me.postedToday;
        await api('POST', '/posts', { image: dataUrl, caption: root.querySelector('#caption').value });
        state.me.postedToday = true;
        closeModal();
        toast(hadToday ? 'Foto publicada!' : 'Foto publicada! +1 ponto de check-in 📸');
        after && after();
      } catch (e) {
        toast(e.message, true);
        btn.disabled = false;
        btn.textContent = 'Publicar';
      }
    });
  });
}

// ---------- perfil ----------
async function viewProfile() {
  const me = await loadMe();
  const u = me.user;
  const myPosts = await api('GET', `/posts?user=${u.id}`);
  $app.innerHTML = `
    <div class="page">
      <div class="topbar"><h1 class="display">Meu <span class="lime">perfil</span></h1>
        <button class="icon-btn" id="logout" aria-label="Sair">${icon('logout', 20)}</button></div>

      <div class="card center">
        <button id="change-avatar" style="border:0;background:none;padding:0;cursor:pointer;position:relative;display:inline-block">
          ${avatar(u, 'lg')}<span class="icon-btn" style="position:absolute;right:-6px;bottom:-6px;width:32px;height:32px;background:var(--lime);color:#000">${icon('camera', 16)}</span></button>
        <div class="display" style="font-size:28px;margin-top:10px">${esc(u.name)}</div>
        <div class="muted small">${esc(u.email)} ${u.role === 'admin' ? '· <span class="badge">personal / admin</span>' : ''}</div>
        <div class="row" style="justify-content:center;gap:24px;margin-top:14px">
          <div><div class="display lime" style="font-size:30px">${me.score.total}</div><div class="small muted">pontos</div></div>
          <div><div class="display" style="font-size:30px">${me.score.completed}/21</div><div class="small muted">desafios</div></div>
          <div><div class="display" style="font-size:30px">${me.personal.length}/21</div><div class="small muted">individual</div></div>
        </div>
        ${u.role === 'admin' ? `<a class="btn block outline" style="margin-top:16px" href="#/admin">${icon('settings', 18)} Painel dos personais</a>` : ''}
      </div>

      <div class="section-title"><h2 class="display">Meu compromisso</h2></div>
      <div class="card">
        <label class="field"><span>Daqui a 21 dias eu quero...</span>
          <textarea class="input" id="commitment" maxlength="1000" placeholder="Ex.: sentir mais disposição, criar o hábito de treinar 3x por semana...">${esc(u.commitment)}</textarea></label>
        <button class="btn sm" id="save-commitment" style="margin-top:10px">Salvar</button>
      </div>

      <div class="section-title"><h2 class="display">Meu desafio individual</h2></div>
      <div class="card">
        <label class="field"><span>O desafio que eu me proponho a cumprir todos os dias</span>
          <input class="input" id="personal" maxlength="300" value="${esc(u.personal_challenge)}" placeholder="Ex.: beber 2 litros de água por dia"></label>
        <button class="btn sm" id="save-personal" style="margin-top:10px">Salvar</button>
      </div>
      ${u.personal_challenge ? personalBlock(me) : ''}

      <div class="section-title"><h2 class="display">Minhas metas</h2></div>
      <div class="card">
        ${me.goals.length ? me.goals.map((g) => `
          <div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">
            <label class="row grow" style="cursor:pointer"><input type="checkbox" data-goal="${g.id}" ${g.done ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--lime)">
              <span style="${g.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(g.text)}</span></label>
            <button class="icon-btn" style="width:32px;height:32px" data-del-goal="${g.id}" aria-label="Remover meta">${icon('x', 16)}</button></div>`).join('') : '<p class="muted small" style="margin-top:0">Liste metas menores que te ajudam a chegar lá.</p>'}
        <form id="goal-form" class="comment-form"><input class="input" name="text" placeholder="Nova meta..." maxlength="200"><button class="icon-btn" aria-label="Adicionar">${icon('plus', 20)}</button></form>
      </div>

      <div class="section-title"><h2 class="display">Minhas fotos</h2><span class="small muted">${myPosts.length}</span></div>
      ${myPosts.length ? `<div class="photo-grid">${myPosts.map((p) => `<img src="${esc(p.image)}" alt="" loading="lazy">`).join('')}</div>` : '<div class="card muted small">Você ainda não postou fotos.</div>'}

      <div class="section-title"><h2 class="display">Conta</h2></div>
      <div class="card stack">
        <label class="field"><span>Nome</span><input class="input" id="name" maxlength="60" value="${esc(u.name)}"></label>
        <button class="btn sm ghost" id="save-name">Salvar nome</button>
        <details><summary class="small" style="cursor:pointer;color:var(--lime)">Alterar senha</summary>
          <form id="pw-form" class="stack" style="margin-top:10px">
            <input class="input" name="current" type="password" placeholder="Senha atual" autocomplete="current-password">
            <input class="input" name="password" type="password" placeholder="Nova senha (mín. 6)" autocomplete="new-password">
            <button class="btn sm ghost">Alterar senha</button></form></details>
      </div>
      <p class="center small muted" style="margin:24px 0">MOOH Personal Studio · Treine. Supere. Evolua.</p>
    </div>`;

  const saveProfile = async (body, msg) => {
    try { await api('PUT', '/profile', body); toast(msg); viewProfile(); } catch (e) { toast(e.message, true); }
  };
  document.getElementById('logout').addEventListener('click', async () => {
    await api('POST', '/logout').catch(() => {});
    state.me = null;
    location.hash = '#/inicio';
    router();
  });
  document.getElementById('change-avatar').addEventListener('click', async () => {
    const file = await pickImage();
    if (!file) return;
    try { await saveProfile({ avatar: await resizeImage(file, 400, 0.85) }, 'Foto atualizada!'); } catch (e) { toast(e.message, true); }
  });
  document.getElementById('save-commitment').addEventListener('click', () => saveProfile({ commitment: document.getElementById('commitment').value }, 'Compromisso salvo!'));
  document.getElementById('save-personal').addEventListener('click', () => saveProfile({ personal_challenge: document.getElementById('personal').value }, 'Desafio individual salvo!'));
  document.getElementById('save-name').addEventListener('click', () => saveProfile({ name: document.getElementById('name').value }, 'Nome atualizado!'));
  bindPersonalDots(viewProfile);
  $app.querySelectorAll('[data-goal]').forEach((c) => c.addEventListener('change', async () => {
    await api('PUT', `/goals/${c.dataset.goal}`, { done: c.checked }).catch((e) => toast(e.message, true));
    viewProfile();
  }));
  $app.querySelectorAll('[data-del-goal]').forEach((b) => b.addEventListener('click', async () => {
    await api('DELETE', `/goals/${b.dataset.delGoal}`).catch((e) => toast(e.message, true));
    viewProfile();
  }));
  document.getElementById('goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.target.elements.text.value;
    if (!text.trim()) return;
    try { await api('POST', '/goals', { text }); viewProfile(); } catch (err) { toast(err.message, true); }
  });
  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('PUT', '/password', f); toast('Senha alterada!'); e.target.reset(); } catch (err) { toast(err.message, true); }
  });
}

// ---------- ranking ----------
async function viewRanking() {
  const r = await api('GET', '/ranking');
  const meId = state.me.user.id;
  $app.innerHTML = `
    <div class="page">
      <div class="topbar"><a class="icon-btn" href="#/inicio" aria-label="Voltar">${icon('back', 20)}</a><h1 class="display grow">Ranking</h1></div>
      ${r.visible ? `<div class="card">${r.list.length ? r.list.map((u, i) => `
        <div class="rank-row ${i < 3 ? 'top' : ''} ${u.id === meId ? 'me' : ''}">
          <div class="rank-pos">${i + 1}</div>${avatar(u)}
          <div class="grow"><b>${esc(u.name)}</b><div class="small muted">${u.completed}/21 desafios${u.total >= r.meta ? ' · <span class="lime">meta batida!</span>' : ''}</div></div>
          <div class="display lime" style="font-size:24px">${u.total}</div></div>`).join('') : '<div class="empty">Nenhum participante ainda.</div>'}</div>`
        : `<div class="empty">${icon('lock', 40)}<p>O ranking está oculto pelos personais. Foque na sua constância! 💪</p></div>`}
    </div>`;
}

// ---------- painel administrativo ----------
async function viewAdmin() {
  if (state.me.user.role !== 'admin') { location.hash = '#/inicio'; return; }
  const [data, ch] = await Promise.all([api('GET', '/admin/overview'), loadChallenge()]);
  const s = data.settings;
  const participants = data.users.filter((u) => u.role === 'participant');
  $app.innerHTML = `
    <div class="page">
      <div class="topbar"><a class="icon-btn" href="#/perfil" aria-label="Voltar">${icon('back', 20)}</a><h1 class="display grow">Painel <span class="lime">personal</span></h1></div>

      <div class="card stack">
        <div class="display" style="font-size:20px">Configurações do desafio</div>
        <label class="field"><span>Data de início (Dia 1)</span><input class="input" type="date" id="start" value="${esc(s.start_date)}"></label>
        <div class="small muted">${data.currentDay === 0 ? 'Desafio ainda não começou.' : data.currentDay > 21 ? 'Desafio encerrado.' : `Hoje é o dia <b class="lime">${data.currentDay}</b>.`}</div>
        <label class="field"><span>Código de inscrição (passe para os alunos)</span><input class="input" id="code" value="${esc(s.join_code)}"></label>
        <label class="field"><span>Meta de pontos</span><input class="input" type="number" id="meta" min="1" value="${s.target_points}"></label>
        <label class="switch"><span>Ranking visível para os alunos</span><input type="checkbox" id="rank" ${s.ranking_visible ? 'checked' : ''}></label>
        <button class="btn" id="save-settings">Salvar configurações</button>
      </div>

      <div class="section-title"><h2 class="display">Participantes</h2><span class="small muted">${participants.length}</span></div>
      <div class="card">
        ${data.users.map((u) => `
          <details class="admin-user" style="padding:10px 0;border-bottom:1px solid var(--line)">
            <summary class="row">${avatar(u)}<div class="grow"><b>${esc(u.name)}</b> ${u.role === 'admin' ? '<span class="badge">admin</span>' : ''}
              <div class="small muted">${u.score.completed}/21 · ${u.score.total} pts</div></div>${icon('chevron', 18)}</summary>
            <div class="stack" style="margin-top:10px">
              <div class="small muted">${esc(u.email)}</div>
              <div class="mini-days">${Array.from({ length: 21 }, (_, i) => `<i class="${u.doneDays.includes(i + 1) ? 'on' : ''}" title="Dia ${i + 1}"></i>`).join('')}</div>
              ${u.commitment ? `<div class="small"><b>Compromisso:</b> ${esc(u.commitment)}</div>` : ''}
              ${u.personal_challenge ? `<div class="small"><b>Desafio individual:</b> ${esc(u.personal_challenge)}</div>` : ''}
              ${u.notes.length ? `<details><summary class="small lime" style="cursor:pointer">Respostas e anotações (${u.notes.length})</summary>${u.notes.map((n) => `<div class="small" style="margin-top:6px"><b>Dia ${n.day}:</b> ${esc(n.note)}</div>`).join('')}</details>` : ''}
              <div class="small muted">Desafios: ${u.score.days} · Fotos: ${u.score.photos} · Bônus: ${u.score.bonus}</div>
              ${u.bonuses.length ? `<div class="small">${u.bonuses.map((b) => `<div class="row between"><span>${b.points > 0 ? '+' : ''}${b.points} · ${esc(b.reason)}</span><a href="#" class="muted" data-del-bonus="${b.id}">remover</a></div>`).join('')}</div>` : ''}
              <form class="bonus-form stack" data-user="${u.id}">
                <div class="chip-list">${ch.pointsTable.filter(([k]) => k !== 'Foto / check-in').map(([k, v]) => `<button type="button" class="chip" data-reason="${esc(k)}" data-points="${v}">${esc(k)} +${v}</button>`).join('')}</div>
                <div class="row"><input class="input" name="reason" placeholder="Motivo" style="flex:2"><input class="input" name="points" type="number" placeholder="Pts" style="flex:1"></div>
                <button class="btn sm">Lançar pontos</button>
              </form>
              <div class="row" style="flex-wrap:wrap">
                ${u.id !== state.me.user.id ? `<button class="btn sm ghost" data-role="${u.id}" data-to="${u.role === 'admin' ? 'participant' : 'admin'}">${u.role === 'admin' ? 'Tornar participante' : 'Tornar admin'}</button>` : ''}
                <button class="btn sm ghost" data-reset="${u.id}">Gerar senha temporária</button>
                ${u.id !== state.me.user.id ? `<button class="btn sm danger" data-remove="${u.id}" data-name="${esc(u.name)}">Remover</button>` : ''}
              </div>
            </div>
          </details>`).join('')}
      </div>

      <div class="section-title"><h2 class="display">Editar desafios</h2></div>
      <p class="small muted" style="margin-top:0">Use para liberar a missão surpresa, o treino extra e outros ajustes.</p>
      <div class="card"><div class="chip-list">${ch.days.map((d) => `<button class="chip" data-edit-day="${d.day}">Dia ${d.day} · ${esc(d.title)}</button>`).join('')}</div></div>
      <div style="height:24px"></div>
    </div>`;

  const reload = () => viewAdmin();
  document.getElementById('save-settings').addEventListener('click', async () => {
    try {
      await api('PUT', '/admin/settings', {
        start_date: document.getElementById('start').value,
        join_code: document.getElementById('code').value,
        target_points: Number(document.getElementById('meta').value),
        ranking_visible: document.getElementById('rank').checked,
      });
      toast('Configurações salvas!');
      reload();
    } catch (e) { toast(e.message, true); }
  });
  $app.querySelectorAll('.bonus-form').forEach((form) => {
    form.querySelectorAll('[data-reason]').forEach((chip) => chip.addEventListener('click', () => {
      form.elements.reason.value = chip.dataset.reason;
      form.elements.points.value = chip.dataset.points;
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', `/admin/users/${form.dataset.user}/bonus`, { reason: form.elements.reason.value, points: Number(form.elements.points.value) });
        toast('Pontos lançados!');
        reload();
      } catch (err) { toast(err.message, true); }
    });
  });
  $app.querySelectorAll('[data-del-bonus]').forEach((a) => a.addEventListener('click', async (e) => {
    e.preventDefault();
    await api('DELETE', `/admin/bonus/${a.dataset.delBonus}`).catch((err) => toast(err.message, true));
    reload();
  }));
  $app.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', async () => {
    try { await api('PUT', `/admin/users/${b.dataset.role}/role`, { role: b.dataset.to }); reload(); } catch (e) { toast(e.message, true); }
  }));
  $app.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Gerar uma nova senha temporária para este usuário?')) return;
    try {
      const r = await api('POST', `/admin/users/${b.dataset.reset}/reset-password`);
      openModal('Senha temporária', `<p>Passe esta senha para o aluno. Ele pode trocá-la depois no perfil.</p>
        <div class="card center display lime" style="font-size:34px;letter-spacing:2px;user-select:all">${esc(r.password)}</div>`);
    } catch (e) { toast(e.message, true); }
  }));
  $app.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Remover ${b.dataset.name} e todas as suas fotos? Esta ação não pode ser desfeita.`)) return;
    try { await api('DELETE', `/admin/users/${b.dataset.remove}`); toast('Usuário removido.'); reload(); } catch (e) { toast(e.message, true); }
  }));
  $app.querySelectorAll('[data-edit-day]').forEach((b) => b.addEventListener('click', () => editDay(ch.days.find((d) => d.day === Number(b.dataset.editDay)), reload)));
}

function editDay(d, after) {
  const ICON_CHOICES = ['target', 'drop', 'walk', 'bowl', 'dumbbell', 'moon', 'chat-heart', 'shoe', 'apple', 'stretch',
    'dice', 'bike', 'heart', 'trend', 'flame', 'people', 'cutlery', 'star', 'mountain', 'trophy'];
  openModal(`Editar dia ${d.day}`, `
    <form class="stack" id="day-form">
      <label class="field"><span>Título</span><input class="input" name="title" maxlength="60" value="${esc(d.title)}"></label>
      <label class="field"><span>Descrição</span><textarea class="input" name="description" maxlength="1000">${esc(d.description)}</textarea></label>
      <label class="field"><span>Pontos</span><input class="input" name="points" type="number" min="0" max="50" value="${d.points}"></label>
      <div class="field"><span class="small muted" style="display:block;margin-bottom:6px;font-weight:600">Ícone</span>
        <div class="icon-pick">${ICON_CHOICES.map((i) => `<button type="button" data-icon="${i}" class="${i === d.icon ? 'on' : ''}">${icon(i, 22)}</button>`).join('')}</div></div>
      <button class="btn block">Salvar</button>
    </form>`, (root) => {
    let chosen = d.icon;
    root.querySelectorAll('[data-icon]').forEach((b) => b.addEventListener('click', () => {
      chosen = b.dataset.icon;
      root.querySelectorAll('[data-icon]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    const form = root.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('PUT', `/admin/days/${d.day}`, { title: form.elements.title.value, description: form.elements.description.value, points: Number(form.elements.points.value), icon: chosen });
        closeModal();
        toast('Desafio atualizado!');
        after();
      } catch (err) { toast(err.message, true); }
    });
  });
}

// ---------- start ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
router();
