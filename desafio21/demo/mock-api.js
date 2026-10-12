/* Modo demonstração: simula a API do servidor dentro do navegador, com dados de exemplo.
   Usado só pela página de demonstração gerada por scripts/build-demo.js; o app real não carrega este arquivo.
   Depende de DEMO_CHALLENGE (conteúdo do desafio) e, opcionalmente, DEMO_POSTER (imagem), injetados no build. */
'use strict';

(function () {
  const STORE_KEY = 'desafio21-demo-v1';
  const TZ = 'America/Sao_Paulo';
  const { WEEKS, DAYS, POINTS_TABLE, AWARDS } = DEMO_CHALLENGE;
  const ICON_LIST = ['target', 'drop', 'walk', 'bowl', 'dumbbell', 'moon', 'chat-heart', 'shoe', 'apple', 'stretch',
    'dice', 'bike', 'heart', 'trend', 'flame', 'people', 'cutlery', 'star', 'mountain', 'trophy'];

  // ---------- datas ----------
  const localDate = (d = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const shiftDate = (iso, n) => {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

  // ---------- fotos de exemplo (ilustrações geradas, não são fotos reais) ----------
  function samplePhoto(iconName, bg1, bg2, label) {
    const paths = (typeof ICON_PATHS !== 'undefined' && ICON_PATHS[iconName]) || '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
      <rect width="800" height="800" fill="url(#g)"/>
      <g transform="translate(250 190) scale(12.5)" fill="none" stroke="#c4f82a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
      <text x="400" y="640" text-anchor="middle" font-family="Impact, Arial Black, sans-serif" font-size="64" fill="#ffffff" letter-spacing="2">${label}</text>
      <text x="400" y="700" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#ffffff" opacity=".6">imagem de exemplo</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ---------- dados iniciais ----------
  function seed() {
    const today = localDate();
    const start = shiftDate(today, -4); // demonstração começa no dia 5
    const users = [
      { id: 1, name: 'Carol Personal', email: 'carol@demo', password: '123456', role: 'admin', avatar: null, commitment: '', personal_challenge: '' },
      { id: 2, name: 'Ana Souza', email: 'ana@demo', password: '123456', role: 'participant', avatar: null,
        commitment: 'Daqui a 21 dias eu quero ter mais disposição e treinar sem faltar.', personal_challenge: 'Beber 2 litros de água por dia' },
      { id: 3, name: 'Bruno Lima', email: 'bruno@demo', password: '123456', role: 'participant', avatar: null, commitment: '', personal_challenge: 'Dormir antes das 23h' },
      { id: 4, name: 'Juliana Reis', email: 'ju@demo', password: '123456', role: 'participant', avatar: null, commitment: '', personal_challenge: 'Caminhar 30 min por dia' },
      { id: 5, name: 'Marcos Tavares', email: 'marcos@demo', password: '123456', role: 'participant', avatar: null, commitment: '', personal_challenge: '' },
      { id: 6, name: 'Fernanda Costa', email: 'fe@demo', password: '123456', role: 'participant', avatar: null, commitment: '', personal_challenge: 'Zero refrigerante' },
    ];
    const completions = [];
    const done = { 2: [1, 2, 3], 3: [1, 2, 3, 4, 5], 4: [1, 2, 4, 5], 5: [1], 6: [1, 2, 3, 4] };
    for (const [uid, ds] of Object.entries(done)) {
      for (const d of ds) completions.push({ user_id: Number(uid), day: d, note: d === 1 && uid === '2' ? 'Quero ter mais disposição no dia a dia.' : '' });
    }
    const posts = [
      { id: 1, user_id: 3, image: samplePhoto('dumbbell', '#1b2a0a', '#0a0a0a', 'SEM DESCULPA'), caption: 'Treino feito mesmo cansado. Dia 5 ✅', local_date: today, created_at: hoursAgo(2) },
      { id: 2, user_id: 4, image: samplePhoto('bowl', '#2a1a0a', '#0a0a0a', 'PRATO COLORIDO'), caption: 'Almoço com 5 cores hoje! 🥗', local_date: shiftDate(today, -1), created_at: hoursAgo(26) },
      { id: 3, user_id: 6, image: samplePhoto('walk', '#0a1f2a', '#0a0a0a', '20 MIN'), caption: 'Caminhada no fim da tarde pra cumprir o dia 3.', local_date: shiftDate(today, -2), created_at: hoursAgo(50) },
    ];
    if (window.DEMO_POSTER) {
      posts.push({ id: 4, user_id: 1, image: DEMO_POSTER, caption: 'Esse é o nosso checklist! Bora pra cima, turma 💪', local_date: shiftDate(today, -4), created_at: hoursAgo(98) });
    }
    return {
      seq: 100,
      session: null,
      settings: { start_date: start, join_code: 'MOOH21', target_points: '50', ranking_visible: '1' },
      users,
      days: DAYS.map((d) => ({ ...d })),
      completions,
      personal: [{ user_id: 2, day: 1 }, { user_id: 2, day: 2 }, { user_id: 2, day: 4 }, { user_id: 3, day: 1 }, { user_id: 3, day: 2 }],
      goals: [{ id: 1, user_id: 2, text: 'Treinar 3x por semana', done: 1 }, { id: 2, user_id: 2, text: 'Comer fruta todo dia', done: 0 }],
      bonuses: [
        { id: 1, user_id: 3, admin_id: 1, points: 2, reason: 'Treino realizado', created_at: hoursAgo(20) },
        { id: 2, user_id: 4, admin_id: 1, points: 2, reason: 'Ajudar / incentivar outro aluno', created_at: hoursAgo(30) },
      ],
      notices: [
        { id: 1, author_id: 1, title: 'Bem-vindos ao Desafio 21 Dias!', body: 'Não buscamos perfeição, buscamos constância. Marquem os desafios todo dia e postem fotos no feed: cada dia com foto vale +1 ponto.', pinned: 1, created_at: hoursAgo(100) },
        { id: 2, author_id: 1, title: 'Missão da semana', body: 'Até domingo: 3 treinos no studio + 1 atividade ao ar livre. Quem cumprir ganha +3 pontos de missão semanal.', pinned: 0, created_at: hoursAgo(22) },
      ],
      posts,
      likes: [{ post_id: 1, user_id: 4 }, { post_id: 1, user_id: 1 }, { post_id: 2, user_id: 3 }, { post_id: 3, user_id: 2 }, { post_id: 4, user_id: 3 }],
      comments: [
        { id: 1, post_id: 1, user_id: 1, body: 'Isso aí, Bruno! Constância 👏', created_at: hoursAgo(1) },
        { id: 2, post_id: 2, user_id: 6, body: 'Que prato lindo!', created_at: hoursAgo(24) },
      ],
    };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { db = null; }
  if (!db || !db.users) db = seed();
  const save = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* sem armazenamento: fica só na memória */ }
  };

  // ---------- regras (espelham src/app.js) ----------
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const fail = (s, m) => { throw new HttpError(s, m); };
  const nextId = () => ++db.seq;
  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  const me = () => db.users.find((u) => u.id === db.session) || null;
  const userById = (id) => db.users.find((u) => u.id === id);
  const pub = (u) => u && { id: u.id, name: u.name, role: u.role, avatar: u.avatar };
  const currentDay = () => {
    if (!db.settings.start_date) return 0;
    const diff = daysBetween(db.settings.start_date, localDate());
    return diff < 0 ? 0 : diff + 1;
  };
  const scoreFor = (id) => {
    const mine = db.completions.filter((c) => c.user_id === id);
    const days = mine.reduce((s, c) => s + (db.days.find((d) => d.day === c.day)?.points || 0), 0);
    const bonus = db.bonuses.filter((b) => b.user_id === id).reduce((s, b) => s + b.points, 0);
    const photos = new Set(db.posts.filter((p) => p.user_id === id).map((p) => p.local_date)).size;
    return { days, completed: mine.length, bonus, photos, total: days + bonus + photos };
  };
  const auth = () => me() || fail(401, 'Faça login para continuar.');
  const admin = () => {
    const u = auth();
    if (u.role !== 'admin') fail(403, 'Apenas administradores.');
    return u;
  };
  const checkImage = (dataUrl) => {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(dataUrl || ''))) fail(400, 'Imagem inválida. Use JPG, PNG ou WEBP.');
    return dataUrl;
  };
  const postView = (p, uid) => {
    const u = userById(p.user_id);
    const likes = db.likes.filter((l) => l.post_id === p.id);
    return {
      id: p.id, image: p.image, caption: p.caption, created_at: p.created_at,
      user: pub(u),
      likes: likes.length,
      likers: likes.map((l) => userById(l.user_id)?.name).filter(Boolean),
      liked: likes.some((l) => l.user_id === uid),
      comments: db.comments.filter((c) => c.post_id === p.id).map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, user: pub(userById(c.user_id)) })),
    };
  };

  const routes = [
    ['POST', /^\/register$/, (b) => {
      const name = clean(b.name, 60);
      const email = clean(b.email, 120).toLowerCase();
      if (!name || !/^\S+@\S+$/.test(email)) fail(400, 'Informe nome e e-mail válidos.');
      if (String(b.password || '').length < 6) fail(400, 'A senha precisa ter pelo menos 6 caracteres.');
      if (clean(b.code, 40).toUpperCase() !== db.settings.join_code.toUpperCase()) fail(400, 'Código do desafio incorreto. Peça ao seu personal.');
      if (db.users.some((u) => u.email === email)) fail(400, 'Este e-mail já está cadastrado.');
      const u = { id: nextId(), name, email, password: String(b.password), role: 'participant', avatar: null, commitment: '', personal_challenge: '' };
      db.users.push(u);
      db.session = u.id;
      return { ok: true };
    }],
    ['POST', /^\/login$/, (b) => {
      const u = db.users.find((x) => x.email === clean(b.email, 120).toLowerCase());
      if (!u || u.password !== String(b.password || '')) fail(400, 'E-mail ou senha incorretos.');
      db.session = u.id;
      return { ok: true };
    }],
    ['POST', /^\/logout$/, () => { db.session = null; return { ok: true }; }],
    ['GET', /^\/me$/, () => {
      const u = auth();
      return {
        user: { ...pub(u), email: u.email, commitment: u.commitment, personal_challenge: u.personal_challenge },
        goals: db.goals.filter((g) => g.user_id === u.id).map(({ id, text, done }) => ({ id, text, done })),
        personal: db.personal.filter((p) => p.user_id === u.id).map((p) => p.day).sort((a, b) => a - b),
        score: scoreFor(u.id),
        meta: Number(db.settings.target_points),
        currentDay: currentDay(),
        startDate: db.settings.start_date || null,
        today: localDate(),
        postedToday: db.posts.some((p) => p.user_id === u.id && p.local_date === localDate()),
      };
    }],
    ['GET', /^\/challenge$/, () => {
      const u = auth();
      const done = new Map(db.completions.filter((c) => c.user_id === u.id).map((c) => [c.day, c]));
      return {
        weeks: WEEKS, currentDay: currentDay(), startDate: db.settings.start_date || null,
        pointsTable: POINTS_TABLE, awards: AWARDS, meta: Number(db.settings.target_points),
        days: db.days.map((d) => ({ ...d, week: Math.ceil(d.day / 7), done: done.has(d.day), note: done.get(d.day)?.note || '' })),
      };
    }],
    ['PUT', /^\/challenge\/(\d+)$/, (b, [day]) => {
      const u = auth();
      day = Number(day);
      if (!db.days.some((d) => d.day === day)) fail(404, 'Dia não encontrado.');
      const cur = currentDay();
      if (cur === 0) fail(400, 'O desafio ainda não começou.');
      if (day > cur) fail(400, 'Este dia ainda não foi liberado.');
      db.completions = db.completions.filter((c) => !(c.user_id === u.id && c.day === day));
      if (b.done) db.completions.push({ user_id: u.id, day, note: clean(b.note, 2000) });
      return { ok: true, score: scoreFor(u.id) };
    }],
    ['PUT', /^\/profile$/, (b) => {
      const u = auth();
      if (b.name !== undefined) { const n = clean(b.name, 60); if (!n) fail(400, 'Nome não pode ficar vazio.'); u.name = n; }
      if (b.commitment !== undefined) u.commitment = clean(b.commitment, 1000);
      if (b.personal_challenge !== undefined) u.personal_challenge = clean(b.personal_challenge, 300);
      if (b.avatar) u.avatar = checkImage(b.avatar);
      return { ok: true };
    }],
    ['PUT', /^\/password$/, (b) => {
      const u = auth();
      if (u.password !== String(b.current || '')) fail(400, 'Senha atual incorreta.');
      if (String(b.password || '').length < 6) fail(400, 'A nova senha precisa ter pelo menos 6 caracteres.');
      u.password = String(b.password);
      return { ok: true };
    }],
    ['PUT', /^\/personal\/(\d+)$/, (b, [day]) => {
      const u = auth();
      day = Number(day);
      if (day < 1 || day > 21) fail(400, 'Dia inválido.');
      if (day > currentDay()) fail(400, 'Este dia ainda não chegou.');
      db.personal = db.personal.filter((p) => !(p.user_id === u.id && p.day === day));
      if (b.done) db.personal.push({ user_id: u.id, day });
      return { ok: true };
    }],
    ['POST', /^\/goals$/, (b) => {
      const u = auth();
      const text = clean(b.text, 200);
      if (!text) fail(400, 'Escreva a meta.');
      db.goals.push({ id: nextId(), user_id: u.id, text, done: 0 });
      return { ok: true };
    }],
    ['PUT', /^\/goals\/(\d+)$/, (b, [id]) => {
      const u = auth();
      const g = db.goals.find((x) => x.id === Number(id) && x.user_id === u.id);
      if (g) g.done = b.done ? 1 : 0;
      return { ok: true };
    }],
    ['DELETE', /^\/goals\/(\d+)$/, (b, [id]) => {
      const u = auth();
      db.goals = db.goals.filter((x) => !(x.id === Number(id) && x.user_id === u.id));
      return { ok: true };
    }],
    ['GET', /^\/notices$/, () => {
      auth();
      return [...db.notices]
        .sort((a, b) => b.pinned - a.pinned || b.created_at.localeCompare(a.created_at))
        .map((n) => {
          const a = userById(n.author_id);
          return { id: n.id, title: n.title, body: n.body, pinned: !!n.pinned, created_at: n.created_at, author: { name: a ? a.name : 'MOOH', avatar: a ? a.avatar : null } };
        });
    }],
    ['POST', /^\/notices$/, (b) => {
      const u = admin();
      const title = clean(b.title, 120);
      const body = clean(b.body, 4000);
      if (!title || !body) fail(400, 'Preencha título e mensagem.');
      db.notices.push({ id: nextId(), author_id: u.id, title, body, pinned: b.pinned ? 1 : 0, created_at: new Date().toISOString() });
      return { ok: true };
    }],
    ['PUT', /^\/notices\/(\d+)$/, (b, [id]) => {
      admin();
      const n = db.notices.find((x) => x.id === Number(id));
      if (n) n.pinned = b.pinned ? 1 : 0;
      return { ok: true };
    }],
    ['DELETE', /^\/notices\/(\d+)$/, (b, [id]) => {
      admin();
      db.notices = db.notices.filter((x) => x.id !== Number(id));
      return { ok: true };
    }],
    ['GET', /^\/posts$/, (b, m, q) => {
      const u = auth();
      let list = [...db.posts].sort((a, c) => c.id - a.id);
      if (Number(q.get('before')) > 0) list = list.filter((p) => p.id < Number(q.get('before')));
      if (Number(q.get('user')) > 0) list = list.filter((p) => p.user_id === Number(q.get('user')));
      if (Number(q.get('id')) > 0) list = list.filter((p) => p.id === Number(q.get('id')));
      return list.slice(0, 15).map((p) => postView(p, u.id));
    }],
    ['POST', /^\/posts$/, (b) => {
      const u = auth();
      db.posts.push({ id: nextId(), user_id: u.id, image: checkImage(b.image), caption: clean(b.caption, 1000), local_date: localDate(), created_at: new Date().toISOString() });
      return { ok: true, score: scoreFor(u.id) };
    }],
    ['DELETE', /^\/posts\/(\d+)$/, (b, [id]) => {
      const u = auth();
      const p = db.posts.find((x) => x.id === Number(id)) || fail(404, 'Post não encontrado.');
      if (p.user_id !== u.id && u.role !== 'admin') fail(403, 'Sem permissão.');
      db.posts = db.posts.filter((x) => x !== p);
      db.likes = db.likes.filter((l) => l.post_id !== p.id);
      db.comments = db.comments.filter((c) => c.post_id !== p.id);
      return { ok: true };
    }],
    ['POST', /^\/posts\/(\d+)\/like$/, (b, [id]) => {
      const u = auth();
      const pid = Number(id);
      if (!db.posts.some((p) => p.id === pid)) fail(404, 'Post não encontrado.');
      const had = db.likes.some((l) => l.post_id === pid && l.user_id === u.id);
      db.likes = db.likes.filter((l) => !(l.post_id === pid && l.user_id === u.id));
      if (!had) db.likes.push({ post_id: pid, user_id: u.id });
      return { ok: true, liked: !had };
    }],
    ['POST', /^\/posts\/(\d+)\/comments$/, (b, [id]) => {
      const u = auth();
      const body = clean(b.body, 500);
      if (!body) fail(400, 'Escreva um comentário.');
      if (!db.posts.some((p) => p.id === Number(id))) fail(404, 'Post não encontrado.');
      db.comments.push({ id: nextId(), post_id: Number(id), user_id: u.id, body, created_at: new Date().toISOString() });
      return { ok: true };
    }],
    ['DELETE', /^\/comments\/(\d+)$/, (b, [id]) => {
      const u = auth();
      const c = db.comments.find((x) => x.id === Number(id)) || fail(404, 'Comentário não encontrado.');
      if (c.user_id !== u.id && u.role !== 'admin') fail(403, 'Sem permissão.');
      db.comments = db.comments.filter((x) => x !== c);
      return { ok: true };
    }],
    ['GET', /^\/ranking$/, () => {
      const u = auth();
      const show = db.settings.ranking_visible === '1' || u.role === 'admin';
      const list = db.users.filter((x) => x.role === 'participant').map((x) => ({ ...pub(x), ...scoreFor(x.id) }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      return { visible: show, meta: Number(db.settings.target_points), list: show ? list : [] };
    }],
    ['GET', /^\/admin\/overview$/, () => {
      admin();
      return {
        settings: { start_date: db.settings.start_date || '', join_code: db.settings.join_code, target_points: Number(db.settings.target_points), ranking_visible: db.settings.ranking_visible === '1' },
        currentDay: currentDay(),
        users: [...db.users].sort((a, b) => a.name.localeCompare(b.name)).map((u) => {
          const mine = db.completions.filter((c) => c.user_id === u.id).sort((a, b) => a.day - b.day);
          return {
            ...pub(u), email: u.email, commitment: u.commitment, personal_challenge: u.personal_challenge,
            score: scoreFor(u.id),
            doneDays: mine.map((c) => c.day),
            notes: mine.filter((c) => c.note).map((c) => ({ day: c.day, note: c.note })),
            bonuses: db.bonuses.filter((b) => b.user_id === u.id).sort((a, b) => b.id - a.id).map(({ id, points, reason, created_at }) => ({ id, points, reason, created_at })),
          };
        }),
      };
    }],
    ['PUT', /^\/admin\/settings$/, (b) => {
      admin();
      if (b.start_date !== undefined) {
        if (b.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.start_date)) fail(400, 'Data inválida.');
        db.settings.start_date = b.start_date || '';
      }
      if (b.join_code !== undefined) { const c = clean(b.join_code, 40); if (!c) fail(400, 'O código não pode ficar vazio.'); db.settings.join_code = c; }
      if (b.target_points !== undefined) db.settings.target_points = String(Math.max(1, Math.trunc(Number(b.target_points)) || 50));
      if (b.ranking_visible !== undefined) db.settings.ranking_visible = b.ranking_visible ? '1' : '0';
      return { ok: true };
    }],
    ['PUT', /^\/admin\/days\/(\d+)$/, (b, [day]) => {
      admin();
      const d = db.days.find((x) => x.day === Number(day)) || fail(404, 'Dia não encontrado.');
      const title = clean(b.title ?? d.title, 60);
      const description = clean(b.description ?? d.description, 1000);
      if (!title || !description) fail(400, 'Preencha título e descrição.');
      Object.assign(d, { title, description, points: Math.max(0, Math.min(50, Math.trunc(Number(b.points ?? d.points)) || 0)), icon: ICON_LIST.includes(b.icon) ? b.icon : d.icon });
      return { ok: true };
    }],
    ['POST', /^\/admin\/users\/(\d+)\/bonus$/, (b, [id]) => {
      const a = admin();
      const points = Math.trunc(Number(b.points));
      const reason = clean(b.reason, 120);
      if (!points || Math.abs(points) > 50) fail(400, 'Pontos inválidos.');
      if (!reason) fail(400, 'Informe o motivo.');
      if (!userById(Number(id))) fail(404, 'Usuário não encontrado.');
      db.bonuses.push({ id: nextId(), user_id: Number(id), admin_id: a.id, points, reason, created_at: new Date().toISOString() });
      return { ok: true };
    }],
    ['DELETE', /^\/admin\/bonus\/(\d+)$/, (b, [id]) => {
      admin();
      db.bonuses = db.bonuses.filter((x) => x.id !== Number(id));
      return { ok: true };
    }],
    ['PUT', /^\/admin\/users\/(\d+)\/role$/, (b, [id]) => {
      const a = admin();
      const u = userById(Number(id)) || fail(404, 'Usuário não encontrado.');
      if (u.id === a.id) fail(400, 'Você não pode alterar o seu próprio perfil de acesso.');
      u.role = b.role === 'admin' ? 'admin' : 'participant';
      return { ok: true };
    }],
    ['POST', /^\/admin\/users\/(\d+)\/reset-password$/, (b, [id]) => {
      admin();
      const u = userById(Number(id)) || fail(404, 'Usuário não encontrado.');
      u.password = Math.random().toString(16).slice(2, 10);
      if (db.session === u.id) db.session = null;
      return { ok: true, password: u.password };
    }],
    ['DELETE', /^\/admin\/users\/(\d+)$/, (b, [id]) => {
      const a = admin();
      const uid = Number(id);
      if (uid === a.id) fail(400, 'Você não pode remover a sua própria conta.');
      if (!userById(uid)) fail(404, 'Usuário não encontrado.');
      const postIds = db.posts.filter((p) => p.user_id === uid).map((p) => p.id);
      db.users = db.users.filter((u) => u.id !== uid);
      for (const k of ['completions', 'personal', 'goals', 'bonuses']) db[k] = db[k].filter((x) => x.user_id !== uid);
      db.posts = db.posts.filter((p) => p.user_id !== uid);
      db.likes = db.likes.filter((l) => l.user_id !== uid && !postIds.includes(l.post_id));
      db.comments = db.comments.filter((c) => c.user_id !== uid && !postIds.includes(c.post_id));
      return { ok: true };
    }],
  ];

  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    const u = new URL(url, 'http://demo');
    const path = u.pathname.slice(4);
    const method = (init.method || 'GET').toUpperCase();
    let body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch { /* corpo vazio */ }
    await new Promise((r) => setTimeout(r, 120)); // simula a rede
    for (const [m, re, handler] of routes) {
      const match = method === m && re.exec(path);
      if (!match) continue;
      try {
        const data = handler(body, match.slice(1), u.searchParams);
        if (method !== 'GET') save();
        return json(200, data);
      } catch (e) {
        if (e instanceof HttpError) return json(e.status, { error: e.message });
        console.error(e);
        return json(500, { error: 'Erro interno. Tente novamente.' });
      }
    }
    return json(404, { error: 'Rota não encontrada.' });
  };

  // A janela de demonstração não exibe confirm(); aqui as confirmações são aceitas direto.
  window.confirm = () => true;

  // ---------- faixa de demonstração ----------
  window.addEventListener('DOMContentLoaded', () => {
    const bar = document.getElementById('demo-bar');
    if (!bar) return;
    const go = (email) => {
      db.session = db.users.find((x) => x.email === email)?.id ?? null;
      save();
      state.me = null; // eslint-disable-line no-undef
      if (location.hash === '#/inicio') router(); else location.hash = '#/inicio'; // eslint-disable-line no-undef
    };
    bar.querySelector('[data-as=aluno]').addEventListener('click', () => go('ana@demo'));
    bar.querySelector('[data-as=personal]').addEventListener('click', () => go('carol@demo'));
    bar.querySelector('[data-reset]').addEventListener('click', () => {
      const session = db.session;
      db = seed();
      db.session = session && db.users.some((x) => x.id === session) ? session : null;
      save();
      state.me = null; // eslint-disable-line no-undef
      router(); // eslint-disable-line no-undef
    });
  });
})();
