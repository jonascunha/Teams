const crypto = require('node:crypto');
const path = require('node:path');
const { promisify } = require('node:util');
const express = require('express');
const { openDb } = require('./db');
const { createStorage } = require('./storage');
const { WEEKS, POINTS_TABLE, AWARDS } = require('./challenge');

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 90;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ICONS = ['target', 'drop', 'walk', 'bowl', 'dumbbell', 'moon', 'chat-heart', 'shoe', 'apple', 'stretch',
  'dice', 'bike', 'heart', 'trend', 'flame', 'people', 'cutlery', 'star', 'mountain', 'trophy'];

async function createApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const databaseUrl = opts.databaseUrl !== undefined ? opts.databaseUrl : process.env.DATABASE_URL;
  const bucket = opts.bucket !== undefined ? opts.bucket : process.env.GCS_BUCKET;
  const timeZone = opts.timeZone || process.env.TZ_CHALLENGE || 'America/Sao_Paulo';
  const now = opts.now || (() => new Date());
  const db = await openDb({ databaseUrl, dataDir });
  const storage = createStorage({ bucket, dataDir });

  // ---------- helpers ----------
  const getSetting = async (key, fallback = null) => {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : fallback;
  };
  const setSetting = (key, value) =>
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);

  if ((await getSetting('join_code')) === null) await setSetting('join_code', process.env.JOIN_CODE || 'MOOH21');

  const nowIso = () => now().toISOString();

  // Data local (YYYY-MM-DD) no fuso do studio
  const localDate = (d = now()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

  // Dia atual do desafio: 0 = ainda não começou, 1..21 = em andamento, >21 = encerrado
  const currentDay = async () => {
    const start = await getSetting('start_date');
    if (!start) return 0;
    const diff = daysBetween(start, localDate());
    return diff < 0 ? 0 : diff + 1;
  };
  const targetPoints = async () => Number(await getSetting('target_points', '50'));

  const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    return `${salt}:${hash}`;
  };
  const checkPassword = async (password, stored) => {
    const [salt, hash] = stored.split(':');
    const test = await scrypt(password, salt, 64);
    return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
  };

  // Pontuação de vários usuários com 3 consultas (em vez de 3 por usuário)
  const scores = async (userId = null) => {
    const where = userId ? ' WHERE c.user_id = ?' : '';
    const args = userId ? [userId] : [];
    const days = await db.all(`SELECT c.user_id, COALESCE(SUM(d.points), 0) AS p, COUNT(*) AS n FROM completions c
      JOIN days d ON d.day = c.day${where} GROUP BY c.user_id`, ...args);
    const bonus = await db.all(`SELECT user_id, COALESCE(SUM(points), 0) AS p FROM bonuses${userId ? ' WHERE user_id = ?' : ''} GROUP BY user_id`, ...args);
    const photos = await db.all(`SELECT user_id, COUNT(DISTINCT local_date) AS n FROM posts${userId ? ' WHERE user_id = ?' : ''} GROUP BY user_id`, ...args);
    const map = new Map();
    const get = (id) => {
      if (!map.has(id)) map.set(id, { days: 0, completed: 0, bonus: 0, photos: 0, total: 0 });
      return map.get(id);
    };
    for (const r of days) Object.assign(get(r.user_id), { days: Number(r.p), completed: Number(r.n) });
    for (const r of bonus) get(r.user_id).bonus = Number(r.p);
    for (const r of photos) get(r.user_id).photos = Number(r.n);
    for (const s of map.values()) s.total = s.days + s.bonus + s.photos;
    return { of: (id) => get(id) };
  };
  const scoreFor = async (userId) => (await scores(userId)).of(userId);

  const publicUser = (u) => u && ({ id: u.id, name: u.name, role: u.role, avatar: u.avatar ? `/uploads/${u.avatar}` : null });

  const cleanText = (v, max) => String(v ?? '').trim().slice(0, max);
  const placeholders = (n) => Array(n).fill('?').join(', ');

  const saveImage = async (dataUrl) => {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) throw httpError(400, 'Imagem inválida. Use JPG, PNG ou WEBP.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMAGE_BYTES) throw httpError(400, 'Imagem muito grande.');
    const name = `${crypto.randomBytes(12).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    await storage.save(name, buf);
    return name;
  };
  const removeImage = (name) => {
    if (name) storage.remove(path.basename(name));
  };

  function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
  }

  // ---------- app ----------
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  // Express 4 não captura erros de funções async: este wrapper repassa para o handler de erro.
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // Sessão via cookie httpOnly
  app.use(wrap(async (req, res, next) => {
    const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (m) {
      const row = await db.get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?', m[1], Date.now());
      if (row) {
        req.user = row;
        req.sessionToken = m[1];
      }
    }
    next();
  }));

  const setSessionCookie = (req, res, token, maxAgeSec) => {
    const parts = [`sid=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
    if (req.secure) parts.push('Secure');
    res.set('Set-Cookie', parts.join('; '));
  };

  const startSession = async (req, res, userId) => {
    const token = crypto.randomBytes(32).toString('hex');
    await db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    await db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, Date.now() + SESSION_DAYS * 86400000);
    setSessionCookie(req, res, token, SESSION_DAYS * 86400);
  };

  const auth = (req, res, next) => (req.user ? next() : next(httpError(401, 'Faça login para continuar.')));
  const admin = (req, res, next) => (req.user && req.user.role === 'admin' ? next() : next(httpError(403, 'Apenas administradores.')));

  // Limite simples contra força bruta no login/cadastro
  const attempts = new Map();
  const rateLimit = (req, res, next) => {
    const key = req.ip;
    const t = Date.now();
    const list = (attempts.get(key) || []).filter((x) => t - x < 15 * 60000);
    if (list.length >= 30) return next(httpError(429, 'Muitas tentativas. Aguarde alguns minutos.'));
    list.push(t);
    attempts.set(key, list);
    next();
  };

  const router = express.Router();
  const api = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    api[method] = (p, ...handlers) => router[method](p, ...handlers.map(wrap));
  }

  // ----- auth -----
  api.post('/register', rateLimit, async (req, res) => {
    const name = cleanText(req.body.name, 60);
    const email = cleanText(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '');
    const code = cleanText(req.body.code, 40);
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, 'Informe nome e e-mail válidos.');
    if (password.length < 6) throw httpError(400, 'A senha precisa ter pelo menos 6 caracteres.');
    if (code.toUpperCase() !== String(await getSetting('join_code')).toUpperCase()) throw httpError(400, 'Código do desafio incorreto. Peça ao seu personal.');
    if (await db.get('SELECT 1 AS x FROM users WHERE email = ?', email)) throw httpError(400, 'Este e-mail já está cadastrado.');
    // O primeiro cadastro vira administrador
    const isFirst = Number((await db.get('SELECT COUNT(*) AS n FROM users')).n) === 0;
    const row = await db.get('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
      name, email, await hashPassword(password), isFirst ? 'admin' : 'participant', nowIso());
    await startSession(req, res, row.id);
    res.json({ ok: true });
  });

  api.post('/login', rateLimit, async (req, res) => {
    const email = cleanText(req.body.email, 120).toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE email = ?', email);
    if (!user || !(await checkPassword(String(req.body.password || ''), user.password_hash))) throw httpError(400, 'E-mail ou senha incorretos.');
    await startSession(req, res, user.id);
    res.json({ ok: true });
  });

  api.post('/logout', async (req, res) => {
    if (req.sessionToken) await db.run('DELETE FROM sessions WHERE token = ?', req.sessionToken);
    setSessionCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  // ----- dados gerais -----
  api.get('/me', auth, async (req, res) => {
    const u = req.user;
    const today = localDate();
    const [goals, personal, score, meta, cur, startDate, posted] = await Promise.all([
      db.all('SELECT id, text, done FROM goals WHERE user_id = ? ORDER BY id', u.id),
      db.all('SELECT day FROM personal_checks WHERE user_id = ? ORDER BY day', u.id),
      scoreFor(u.id),
      targetPoints(),
      currentDay(),
      getSetting('start_date'),
      db.get('SELECT 1 AS x FROM posts WHERE user_id = ? AND local_date = ?', u.id, today),
    ]);
    res.json({
      user: { ...publicUser(u), email: u.email, commitment: u.commitment, personal_challenge: u.personal_challenge },
      goals,
      personal: personal.map((r) => r.day),
      score,
      meta,
      currentDay: cur,
      startDate,
      today,
      postedToday: !!posted,
    });
  });

  api.get('/challenge', auth, async (req, res) => {
    const [days, completions, cur, startDate, meta] = await Promise.all([
      db.all('SELECT * FROM days ORDER BY day'),
      db.all('SELECT day, note FROM completions WHERE user_id = ?', req.user.id),
      currentDay(),
      getSetting('start_date'),
      targetPoints(),
    ]);
    const done = new Map(completions.map((c) => [c.day, c]));
    res.json({
      weeks: WEEKS,
      currentDay: cur,
      startDate,
      pointsTable: POINTS_TABLE,
      awards: AWARDS,
      meta,
      days: days.map((d) => ({ ...d, week: Math.ceil(d.day / 7), done: done.has(d.day), note: done.get(d.day)?.note || '' })),
    });
  });

  api.put('/challenge/:day', auth, async (req, res) => {
    const day = Number(req.params.day);
    if (!Number.isInteger(day) || !(await db.get('SELECT 1 AS x FROM days WHERE day = ?', day))) throw httpError(404, 'Dia não encontrado.');
    const cur = await currentDay();
    if (cur === 0) throw httpError(400, 'O desafio ainda não começou.');
    if (day > cur) throw httpError(400, 'Este dia ainda não foi liberado.');
    if (req.body.done) {
      const note = cleanText(req.body.note, 2000);
      await db.run('INSERT INTO completions (user_id, day, note, completed_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, day) DO UPDATE SET note = excluded.note',
        req.user.id, day, note, nowIso());
    } else {
      await db.run('DELETE FROM completions WHERE user_id = ? AND day = ?', req.user.id, day);
    }
    res.json({ ok: true, score: await scoreFor(req.user.id) });
  });

  // ----- desafio individual / metas -----
  api.put('/profile', auth, async (req, res) => {
    const u = req.user;
    const name = req.body.name !== undefined ? cleanText(req.body.name, 60) : u.name;
    if (!name) throw httpError(400, 'Nome não pode ficar vazio.');
    const commitment = req.body.commitment !== undefined ? cleanText(req.body.commitment, 1000) : u.commitment;
    const personal = req.body.personal_challenge !== undefined ? cleanText(req.body.personal_challenge, 300) : u.personal_challenge;
    let avatar = u.avatar;
    if (req.body.avatar) {
      avatar = await saveImage(req.body.avatar);
      removeImage(u.avatar);
    }
    await db.run('UPDATE users SET name = ?, commitment = ?, personal_challenge = ?, avatar = ? WHERE id = ?', name, commitment, personal, avatar, u.id);
    res.json({ ok: true });
  });

  api.put('/password', auth, async (req, res) => {
    if (!(await checkPassword(String(req.body.current || ''), req.user.password_hash))) throw httpError(400, 'Senha atual incorreta.');
    const pw = String(req.body.password || '');
    if (pw.length < 6) throw httpError(400, 'A nova senha precisa ter pelo menos 6 caracteres.');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(pw), req.user.id);
    res.json({ ok: true });
  });

  api.put('/personal/:day', auth, async (req, res) => {
    const day = Number(req.params.day);
    if (!Number.isInteger(day) || day < 1 || day > 21) throw httpError(400, 'Dia inválido.');
    if (day > (await currentDay())) throw httpError(400, 'Este dia ainda não chegou.');
    if (req.body.done) await db.run('INSERT INTO personal_checks (user_id, day) VALUES (?, ?) ON CONFLICT DO NOTHING', req.user.id, day);
    else await db.run('DELETE FROM personal_checks WHERE user_id = ? AND day = ?', req.user.id, day);
    res.json({ ok: true });
  });

  api.post('/goals', auth, async (req, res) => {
    const text = cleanText(req.body.text, 200);
    if (!text) throw httpError(400, 'Escreva a meta.');
    if (Number((await db.get('SELECT COUNT(*) AS n FROM goals WHERE user_id = ?', req.user.id)).n) >= 20) throw httpError(400, 'Limite de metas atingido.');
    await db.run('INSERT INTO goals (user_id, text) VALUES (?, ?)', req.user.id, text);
    res.json({ ok: true });
  });
  api.put('/goals/:id', auth, async (req, res) => {
    await db.run('UPDATE goals SET done = ? WHERE id = ? AND user_id = ?', req.body.done ? 1 : 0, Number(req.params.id) || 0, req.user.id);
    res.json({ ok: true });
  });
  api.delete('/goals/:id', auth, async (req, res) => {
    await db.run('DELETE FROM goals WHERE id = ? AND user_id = ?', Number(req.params.id) || 0, req.user.id);
    res.json({ ok: true });
  });

  // ----- mural de recados -----
  api.get('/notices', auth, async (req, res) => {
    const rows = await db.all(`SELECT n.*, u.name AS author_name, u.avatar AS author_avatar FROM notices n
      LEFT JOIN users u ON u.id = n.author_id ORDER BY n.pinned DESC, n.created_at DESC, n.id DESC LIMIT 100`);
    res.json(rows.map((n) => ({
      id: n.id, title: n.title, body: n.body, pinned: !!n.pinned, created_at: n.created_at,
      author: { name: n.author_name || 'MOOH', avatar: n.author_avatar ? `/uploads/${n.author_avatar}` : null },
    })));
  });
  api.post('/notices', admin, async (req, res) => {
    const title = cleanText(req.body.title, 120);
    const body = cleanText(req.body.body, 4000);
    if (!title || !body) throw httpError(400, 'Preencha título e mensagem.');
    await db.run('INSERT INTO notices (author_id, title, body, pinned, created_at) VALUES (?, ?, ?, ?, ?)', req.user.id, title, body, req.body.pinned ? 1 : 0, nowIso());
    res.json({ ok: true });
  });
  api.put('/notices/:id', admin, async (req, res) => {
    await db.run('UPDATE notices SET pinned = ? WHERE id = ?', req.body.pinned ? 1 : 0, Number(req.params.id) || 0);
    res.json({ ok: true });
  });
  api.delete('/notices/:id', admin, async (req, res) => {
    await db.run('DELETE FROM notices WHERE id = ?', Number(req.params.id) || 0);
    res.json({ ok: true });
  });

  // ----- feed de fotos -----
  // Monta os posts com curtidas e comentários em 2 consultas no total
  const postsView = async (rows, userId) => {
    if (!rows.length) return [];
    const ids = rows.map((p) => p.id);
    const [likes, comments] = await Promise.all([
      db.all(`SELECT l.post_id, l.user_id, u.name FROM likes l JOIN users u ON u.id = l.user_id WHERE l.post_id IN (${placeholders(ids.length)})`, ...ids),
      db.all(`SELECT c.id, c.post_id, c.body, c.created_at, c.user_id, u.name, u.avatar, u.role FROM comments c
        JOIN users u ON u.id = c.user_id WHERE c.post_id IN (${placeholders(ids.length)}) ORDER BY c.id`, ...ids),
    ]);
    return rows.map((p) => {
      const pl = likes.filter((l) => l.post_id === p.id);
      return {
        id: p.id,
        image: `/uploads/${p.image}`,
        caption: p.caption,
        created_at: p.created_at,
        user: publicUser({ id: p.user_id, name: p.name, role: p.role, avatar: p.avatar }),
        likes: pl.length,
        likers: pl.map((l) => l.name),
        liked: pl.some((l) => l.user_id === userId),
        comments: comments.filter((c) => c.post_id === p.id).map((c) => ({
          id: c.id, body: c.body, created_at: c.created_at,
          user: publicUser({ id: c.user_id, name: c.name, role: c.role, avatar: c.avatar }),
        })),
      };
    });
  };

  api.get('/posts', auth, async (req, res) => {
    const conds = [];
    const args = [];
    if (Number(req.query.before) > 0) { conds.push('p.id < ?'); args.push(Math.trunc(Number(req.query.before))); }
    if (Number(req.query.user) > 0) { conds.push('p.user_id = ?'); args.push(Math.trunc(Number(req.query.user))); }
    if (Number(req.query.id) > 0) { conds.push('p.id = ?'); args.push(Math.trunc(Number(req.query.id))); }
    const rows = await db.all(`SELECT p.*, u.name, u.avatar, u.role FROM posts p JOIN users u ON u.id = p.user_id
      ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY p.id DESC LIMIT 15`, ...args);
    res.json(await postsView(rows, req.user.id));
  });

  api.post('/posts', auth, async (req, res) => {
    const caption = cleanText(req.body.caption, 1000);
    const image = await saveImage(req.body.image);
    await db.run('INSERT INTO posts (user_id, image, caption, local_date, created_at) VALUES (?, ?, ?, ?, ?)', req.user.id, image, caption, localDate(), nowIso());
    res.json({ ok: true, score: await scoreFor(req.user.id) });
  });

  const findPost = async (id) => {
    const p = await db.get('SELECT * FROM posts WHERE id = ?', Number(id) || 0);
    if (!p) throw httpError(404, 'Post não encontrado.');
    return p;
  };

  api.delete('/posts/:id', auth, async (req, res) => {
    const p = await findPost(req.params.id);
    if (p.user_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Sem permissão.');
    await db.run('DELETE FROM posts WHERE id = ?', p.id);
    removeImage(p.image);
    res.json({ ok: true });
  });

  api.post('/posts/:id/like', auth, async (req, res) => {
    const p = await findPost(req.params.id);
    const removed = await db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', p.id, req.user.id);
    if (!removed.changes) await db.run('INSERT INTO likes (post_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', p.id, req.user.id);
    res.json({ ok: true, liked: !removed.changes });
  });

  api.post('/posts/:id/comments', auth, async (req, res) => {
    const body = cleanText(req.body.body, 500);
    if (!body) throw httpError(400, 'Escreva um comentário.');
    const p = await findPost(req.params.id);
    await db.run('INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', p.id, req.user.id, body, nowIso());
    res.json({ ok: true });
  });

  api.delete('/comments/:id', auth, async (req, res) => {
    const c = await db.get('SELECT * FROM comments WHERE id = ?', Number(req.params.id) || 0);
    if (!c) throw httpError(404, 'Comentário não encontrado.');
    if (c.user_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Sem permissão.');
    await db.run('DELETE FROM comments WHERE id = ?', c.id);
    res.json({ ok: true });
  });

  // ----- ranking -----
  api.get('/ranking', auth, async (req, res) => {
    const [users, sc, visible, meta] = await Promise.all([
      db.all("SELECT id, name, avatar, role FROM users WHERE role = 'participant'"),
      scores(),
      getSetting('ranking_visible', '1'),
      targetPoints(),
    ]);
    const list = users.map((u) => ({ ...publicUser(u), ...sc.of(u.id) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const show = visible === '1' || req.user.role === 'admin';
    res.json({ visible: show, meta, list: show ? list : [] });
  });

  // ----- administração -----
  api.get('/admin/overview', admin, async (req, res) => {
    const [users, sc, completions, bonuses, startDate, joinCode, meta, rankingVisible, cur] = await Promise.all([
      db.all('SELECT id, name, email, role, avatar, commitment, personal_challenge, created_at FROM users ORDER BY name'),
      scores(),
      db.all('SELECT user_id, day, note FROM completions ORDER BY day'),
      db.all('SELECT id, user_id, points, reason, created_at FROM bonuses ORDER BY id DESC'),
      getSetting('start_date'),
      getSetting('join_code'),
      targetPoints(),
      getSetting('ranking_visible', '1'),
      currentDay(),
    ]);
    res.json({
      settings: { start_date: startDate || '', join_code: joinCode, target_points: meta, ranking_visible: rankingVisible === '1' },
      currentDay: cur,
      users: users.map((u) => {
        const mine = completions.filter((c) => c.user_id === u.id);
        return {
          ...publicUser(u), email: u.email, commitment: u.commitment, personal_challenge: u.personal_challenge, created_at: u.created_at,
          score: sc.of(u.id),
          doneDays: mine.map((c) => c.day),
          notes: mine.filter((c) => c.note).map((c) => ({ day: c.day, note: c.note })),
          bonuses: bonuses.filter((b) => b.user_id === u.id).map(({ user_id, ...b }) => b),
        };
      }),
    });
  });

  api.put('/admin/settings', admin, async (req, res) => {
    const b = req.body;
    if (b.start_date !== undefined) {
      if (b.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.start_date)) throw httpError(400, 'Data inválida.');
      if (b.start_date) await setSetting('start_date', b.start_date);
      else await db.run("DELETE FROM settings WHERE key = 'start_date'");
    }
    if (b.join_code !== undefined) {
      const code = cleanText(b.join_code, 40);
      if (!code) throw httpError(400, 'O código não pode ficar vazio.');
      await setSetting('join_code', code);
    }
    if (b.target_points !== undefined) await setSetting('target_points', String(Math.max(1, Math.trunc(Number(b.target_points)) || 50)));
    if (b.ranking_visible !== undefined) await setSetting('ranking_visible', b.ranking_visible ? '1' : '0');
    res.json({ ok: true });
  });

  api.put('/admin/days/:day', admin, async (req, res) => {
    const day = Number(req.params.day);
    const d = Number.isInteger(day) && (await db.get('SELECT * FROM days WHERE day = ?', day));
    if (!d) throw httpError(404, 'Dia não encontrado.');
    const title = cleanText(req.body.title ?? d.title, 60);
    const description = cleanText(req.body.description ?? d.description, 1000);
    const points = Math.max(0, Math.min(50, Math.trunc(Number(req.body.points ?? d.points)) || 0));
    const icon = ICONS.includes(req.body.icon) ? req.body.icon : d.icon;
    if (!title || !description) throw httpError(400, 'Preencha título e descrição.');
    await db.run('UPDATE days SET title = ?, description = ?, points = ?, icon = ? WHERE day = ?', title, description, points, icon, day);
    res.json({ ok: true });
  });

  const findUser = async (id) => {
    const u = await db.get('SELECT id, avatar FROM users WHERE id = ?', Number(id) || 0);
    if (!u) throw httpError(404, 'Usuário não encontrado.');
    return u;
  };

  api.post('/admin/users/:id/bonus', admin, async (req, res) => {
    const points = Math.trunc(Number(req.body.points));
    const reason = cleanText(req.body.reason, 120);
    if (!points || Math.abs(points) > 50) throw httpError(400, 'Pontos inválidos.');
    if (!reason) throw httpError(400, 'Informe o motivo.');
    const u = await findUser(req.params.id);
    await db.run('INSERT INTO bonuses (user_id, admin_id, points, reason, created_at) VALUES (?, ?, ?, ?, ?)', u.id, req.user.id, points, reason, nowIso());
    res.json({ ok: true });
  });

  api.delete('/admin/bonus/:id', admin, async (req, res) => {
    await db.run('DELETE FROM bonuses WHERE id = ?', Number(req.params.id) || 0);
    res.json({ ok: true });
  });

  api.put('/admin/users/:id/role', admin, async (req, res) => {
    const u = await findUser(req.params.id);
    if (u.id === req.user.id) throw httpError(400, 'Você não pode alterar o seu próprio perfil de acesso.');
    await db.run('UPDATE users SET role = ? WHERE id = ?', req.body.role === 'admin' ? 'admin' : 'participant', u.id);
    res.json({ ok: true });
  });

  api.post('/admin/users/:id/reset-password', admin, async (req, res) => {
    const u = await findUser(req.params.id);
    const temp = crypto.randomBytes(4).toString('hex');
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(temp), u.id);
    await db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
    res.json({ ok: true, password: temp });
  });

  api.delete('/admin/users/:id', admin, async (req, res) => {
    const u = await findUser(req.params.id);
    if (u.id === req.user.id) throw httpError(400, 'Você não pode remover a sua própria conta.');
    const images = (await db.all('SELECT image FROM posts WHERE user_id = ?', u.id)).map((p) => p.image);
    await db.run('DELETE FROM users WHERE id = ?', u.id);
    [u.avatar, ...images].forEach(removeImage);
    res.json({ ok: true });
  });

  app.get('/healthz', (req, res) => res.send('ok'));
  app.use('/api', router);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // Fotos: só para quem está logado
  app.get('/uploads/:file', (req, res) => {
    if (!req.user) return res.status(401).end();
    const file = path.basename(req.params.file);
    if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(file)) return res.status(404).end();
    storage.send(file, res);
  });

  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir, {
    setHeaders: (res, file) => {
      if (/\b(sw\.js|index\.html)$/.test(file)) res.set('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 413 ? 'Arquivo muito grande.' : status === 500 ? 'Erro interno. Tente novamente.' : err.message });
  });

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
