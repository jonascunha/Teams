const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const { WEEKS, POINTS_TABLE, AWARDS } = require('./challenge');

const SESSION_DAYS = 90;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ICONS = ['target', 'drop', 'walk', 'bowl', 'dumbbell', 'moon', 'chat-heart', 'shoe', 'apple', 'stretch',
  'dice', 'bike', 'heart', 'trend', 'flame', 'people', 'cutlery', 'star', 'mountain', 'trophy'];

function createApp(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const timeZone = opts.timeZone || process.env.TZ_CHALLENGE || 'America/Sao_Paulo';
  const now = opts.now || (() => new Date());
  const db = openDb(dataDir);
  const uploadsDir = path.join(dataDir, 'uploads');

  // ---------- helpers ----------
  const getSetting = (key, fallback = null) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : fallback;
  };
  const setSetting = (key, value) =>
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

  if (getSetting('join_code') === null) setSetting('join_code', process.env.JOIN_CODE || 'MOOH21');

  // Data local (YYYY-MM-DD) no fuso do studio
  const localDate = (d = now()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

  // Dia atual do desafio: 0 = ainda não começou, 1..21 = em andamento, >21 = encerrado
  const currentDay = () => {
    const start = getSetting('start_date');
    if (!start) return 0;
    const diff = daysBetween(start, localDate());
    return diff < 0 ? 0 : diff + 1;
  };

  const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  };
  const checkPassword = (password, stored) => {
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
  };

  const scoreFor = (userId) => {
    const days = db.prepare('SELECT COALESCE(SUM(d.points), 0) AS p, COUNT(*) AS n FROM completions c JOIN days d ON d.day = c.day WHERE c.user_id = ?').get(userId);
    const bonus = db.prepare('SELECT COALESCE(SUM(points), 0) AS p FROM bonuses WHERE user_id = ?').get(userId).p;
    const photos = db.prepare('SELECT COUNT(DISTINCT local_date) AS n FROM posts WHERE user_id = ?').get(userId).n;
    return { days: days.p, completed: days.n, bonus, photos, total: days.p + bonus + photos };
  };

  const publicUser = (u) => u && ({ id: u.id, name: u.name, role: u.role, avatar: u.avatar ? `/uploads/${u.avatar}` : null });

  const cleanText = (v, max) => String(v ?? '').trim().slice(0, max);

  const saveImage = (dataUrl) => {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) throw httpError(400, 'Imagem inválida. Use JPG, PNG ou WEBP.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMAGE_BYTES) throw httpError(400, 'Imagem muito grande.');
    const name = `${crypto.randomBytes(12).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(uploadsDir, name), buf);
    return name;
  };
  const removeImage = (name) => {
    if (name) fs.rm(path.join(uploadsDir, path.basename(name)), { force: true }, () => {});
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

  // Sessão via cookie httpOnly
  app.use((req, res, next) => {
    const cookie = req.headers.cookie || '';
    const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(cookie);
    if (m) {
      const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?').get(m[1], Date.now());
      if (row) {
        req.user = row;
        req.sessionToken = m[1];
      }
    }
    next();
  });

  const setSessionCookie = (req, res, token, maxAgeSec) => {
    const parts = [`sid=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
    if (req.secure) parts.push('Secure');
    res.set('Set-Cookie', parts.join('; '));
  };

  const startSession = (req, res, userId) => {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_DAYS * 86400000);
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

  const api = express.Router();

  // ----- auth -----
  api.post('/register', rateLimit, (req, res) => {
    const name = cleanText(req.body.name, 60);
    const email = cleanText(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '');
    const code = cleanText(req.body.code, 40);
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, 'Informe nome e e-mail válidos.');
    if (password.length < 6) throw httpError(400, 'A senha precisa ter pelo menos 6 caracteres.');
    if (code.toUpperCase() !== String(getSetting('join_code')).toUpperCase()) throw httpError(400, 'Código do desafio incorreto. Peça ao seu personal.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw httpError(400, 'Este e-mail já está cadastrado.');
    // O primeiro cadastro vira administrador
    const isFirst = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
    const r = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hashPassword(password), isFirst ? 'admin' : 'participant');
    startSession(req, res, Number(r.lastInsertRowid));
    res.json({ ok: true });
  });

  api.post('/login', rateLimit, (req, res) => {
    const email = cleanText(req.body.email, 120).toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !checkPassword(String(req.body.password || ''), user.password_hash)) throw httpError(400, 'E-mail ou senha incorretos.');
    startSession(req, res, user.id);
    res.json({ ok: true });
  });

  api.post('/logout', (req, res) => {
    if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
    setSessionCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  // ----- dados gerais -----
  api.get('/me', auth, (req, res) => {
    const u = req.user;
    const goals = db.prepare('SELECT id, text, done FROM goals WHERE user_id = ? ORDER BY id').all(u.id);
    const personal = db.prepare('SELECT day FROM personal_checks WHERE user_id = ? ORDER BY day').all(u.id).map((r) => r.day);
    res.json({
      user: { ...publicUser(u), email: u.email, commitment: u.commitment, personal_challenge: u.personal_challenge },
      goals,
      personal,
      score: scoreFor(u.id),
      meta: Number(getSetting('target_points', '50')),
      currentDay: currentDay(),
      startDate: getSetting('start_date'),
      today: localDate(),
      postedToday: !!db.prepare('SELECT 1 FROM posts WHERE user_id = ? AND local_date = ?').get(u.id, localDate()),
    });
  });

  api.get('/challenge', auth, (req, res) => {
    const days = db.prepare('SELECT * FROM days ORDER BY day').all();
    const done = new Map(db.prepare('SELECT day, note, completed_at FROM completions WHERE user_id = ?').all(req.user.id).map((c) => [c.day, c]));
    res.json({
      weeks: WEEKS,
      currentDay: currentDay(),
      startDate: getSetting('start_date'),
      pointsTable: POINTS_TABLE,
      awards: AWARDS,
      meta: Number(getSetting('target_points', '50')),
      days: days.map((d) => ({ ...d, week: Math.ceil(d.day / 7), done: done.has(d.day), note: done.get(d.day)?.note || '' })),
    });
  });

  api.put('/challenge/:day', auth, (req, res) => {
    const day = Number(req.params.day);
    if (!db.prepare('SELECT 1 FROM days WHERE day = ?').get(day)) throw httpError(404, 'Dia não encontrado.');
    const cur = currentDay();
    if (cur === 0) throw httpError(400, 'O desafio ainda não começou.');
    if (day > cur) throw httpError(400, 'Este dia ainda não foi liberado.');
    if (req.body.done) {
      const note = cleanText(req.body.note, 2000);
      db.prepare('INSERT INTO completions (user_id, day, note) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET note = excluded.note').run(req.user.id, day, note);
    } else {
      db.prepare('DELETE FROM completions WHERE user_id = ? AND day = ?').run(req.user.id, day);
    }
    res.json({ ok: true, score: scoreFor(req.user.id) });
  });

  // ----- desafio individual / metas -----
  api.put('/profile', auth, (req, res) => {
    const u = req.user;
    const name = req.body.name !== undefined ? cleanText(req.body.name, 60) : u.name;
    if (!name) throw httpError(400, 'Nome não pode ficar vazio.');
    const commitment = req.body.commitment !== undefined ? cleanText(req.body.commitment, 1000) : u.commitment;
    const personal = req.body.personal_challenge !== undefined ? cleanText(req.body.personal_challenge, 300) : u.personal_challenge;
    let avatar = u.avatar;
    if (req.body.avatar) {
      avatar = saveImage(req.body.avatar);
      removeImage(u.avatar);
    }
    db.prepare('UPDATE users SET name = ?, commitment = ?, personal_challenge = ?, avatar = ? WHERE id = ?').run(name, commitment, personal, avatar, u.id);
    res.json({ ok: true });
  });

  api.put('/password', auth, (req, res) => {
    if (!checkPassword(String(req.body.current || ''), req.user.password_hash)) throw httpError(400, 'Senha atual incorreta.');
    const pw = String(req.body.password || '');
    if (pw.length < 6) throw httpError(400, 'A nova senha precisa ter pelo menos 6 caracteres.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(pw), req.user.id);
    res.json({ ok: true });
  });

  api.put('/personal/:day', auth, (req, res) => {
    const day = Number(req.params.day);
    if (!Number.isInteger(day) || day < 1 || day > 21) throw httpError(400, 'Dia inválido.');
    if (day > currentDay()) throw httpError(400, 'Este dia ainda não chegou.');
    if (req.body.done) db.prepare('INSERT OR IGNORE INTO personal_checks (user_id, day) VALUES (?, ?)').run(req.user.id, day);
    else db.prepare('DELETE FROM personal_checks WHERE user_id = ? AND day = ?').run(req.user.id, day);
    res.json({ ok: true });
  });

  api.post('/goals', auth, (req, res) => {
    const text = cleanText(req.body.text, 200);
    if (!text) throw httpError(400, 'Escreva a meta.');
    if (db.prepare('SELECT COUNT(*) AS n FROM goals WHERE user_id = ?').get(req.user.id).n >= 20) throw httpError(400, 'Limite de metas atingido.');
    db.prepare('INSERT INTO goals (user_id, text) VALUES (?, ?)').run(req.user.id, text);
    res.json({ ok: true });
  });
  api.put('/goals/:id', auth, (req, res) => {
    db.prepare('UPDATE goals SET done = ? WHERE id = ? AND user_id = ?').run(req.body.done ? 1 : 0, Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });
  api.delete('/goals/:id', auth, (req, res) => {
    db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });

  // ----- mural de recados -----
  api.get('/notices', auth, (req, res) => {
    const rows = db.prepare(`SELECT n.*, u.name AS author_name, u.avatar AS author_avatar FROM notices n
      LEFT JOIN users u ON u.id = n.author_id ORDER BY n.pinned DESC, n.created_at DESC, n.id DESC LIMIT 100`).all();
    res.json(rows.map((n) => ({
      id: n.id, title: n.title, body: n.body, pinned: !!n.pinned, created_at: n.created_at,
      author: { name: n.author_name || 'MOOH', avatar: n.author_avatar ? `/uploads/${n.author_avatar}` : null },
    })));
  });
  api.post('/notices', admin, (req, res) => {
    const title = cleanText(req.body.title, 120);
    const body = cleanText(req.body.body, 4000);
    if (!title || !body) throw httpError(400, 'Preencha título e mensagem.');
    db.prepare('INSERT INTO notices (author_id, title, body, pinned) VALUES (?, ?, ?, ?)').run(req.user.id, title, body, req.body.pinned ? 1 : 0);
    res.json({ ok: true });
  });
  api.put('/notices/:id', admin, (req, res) => {
    db.prepare('UPDATE notices SET pinned = ? WHERE id = ?').run(req.body.pinned ? 1 : 0, Number(req.params.id));
    res.json({ ok: true });
  });
  api.delete('/notices/:id', admin, (req, res) => {
    db.prepare('DELETE FROM notices WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ----- feed de fotos -----
  const postView = (p, userId) => {
    const likes = db.prepare('SELECT l.user_id, l.emoji, u.name FROM likes l JOIN users u ON u.id = l.user_id WHERE l.post_id = ?').all(p.id);
    const comments = db.prepare(`SELECT c.id, c.body, c.created_at, c.user_id, u.name, u.avatar, u.role FROM comments c
      JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id`).all(p.id);
    return {
      id: p.id,
      image: `/uploads/${p.image}`,
      caption: p.caption,
      created_at: p.created_at,
      user: publicUser({ id: p.user_id, name: p.name, role: p.role, avatar: p.avatar }),
      likes: likes.length,
      likers: likes.map((l) => l.name),
      liked: likes.some((l) => l.user_id === userId),
      comments: comments.map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, user: publicUser({ id: c.user_id, name: c.name, role: c.role, avatar: c.avatar }) })),
    };
  };

  api.get('/posts', auth, (req, res) => {
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const userFilter = Number(req.query.user) || null;
    const rows = db.prepare(`SELECT p.*, u.name, u.avatar, u.role FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.id < ? AND (? IS NULL OR p.user_id = ?) ORDER BY p.id DESC LIMIT 15`).all(before, userFilter, userFilter);
    res.json(rows.map((p) => postView(p, req.user.id)));
  });

  api.post('/posts', auth, (req, res) => {
    const caption = cleanText(req.body.caption, 1000);
    const image = saveImage(req.body.image);
    db.prepare('INSERT INTO posts (user_id, image, caption, local_date) VALUES (?, ?, ?, ?)').run(req.user.id, image, caption, localDate());
    res.json({ ok: true, score: scoreFor(req.user.id) });
  });

  api.delete('/posts/:id', auth, (req, res) => {
    const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
    if (!p) throw httpError(404, 'Post não encontrado.');
    if (p.user_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Sem permissão.');
    db.prepare('DELETE FROM posts WHERE id = ?').run(p.id);
    removeImage(p.image);
    res.json({ ok: true });
  });

  api.post('/posts/:id/like', auth, (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) throw httpError(404, 'Post não encontrado.');
    const exists = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(id, req.user.id);
    if (exists) db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(id, req.user.id);
    else db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(id, req.user.id);
    res.json({ ok: true, liked: !exists });
  });

  api.post('/posts/:id/comments', auth, (req, res) => {
    const id = Number(req.params.id);
    const body = cleanText(req.body.body, 500);
    if (!body) throw httpError(400, 'Escreva um comentário.');
    if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) throw httpError(404, 'Post não encontrado.');
    db.prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)').run(id, req.user.id, body);
    res.json({ ok: true });
  });

  api.delete('/comments/:id', auth, (req, res) => {
    const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(req.params.id));
    if (!c) throw httpError(404, 'Comentário não encontrado.');
    if (c.user_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Sem permissão.');
    db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
    res.json({ ok: true });
  });

  // ----- ranking -----
  api.get('/ranking', auth, (req, res) => {
    const users = db.prepare("SELECT id, name, avatar, role FROM users WHERE role = 'participant'").all();
    const list = users.map((u) => ({ ...publicUser(u), ...scoreFor(u.id) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    res.json({ visible: getSetting('ranking_visible', '1') === '1' || req.user.role === 'admin', meta: Number(getSetting('target_points', '50')), list });
  });

  // ----- administração -----
  api.get('/admin/overview', admin, (req, res) => {
    const users = db.prepare('SELECT id, name, email, role, avatar, commitment, personal_challenge, created_at FROM users ORDER BY name').all();
    res.json({
      settings: {
        start_date: getSetting('start_date') || '',
        join_code: getSetting('join_code'),
        target_points: Number(getSetting('target_points', '50')),
        ranking_visible: getSetting('ranking_visible', '1') === '1',
      },
      currentDay: currentDay(),
      users: users.map((u) => ({
        ...publicUser(u), email: u.email, commitment: u.commitment, personal_challenge: u.personal_challenge, created_at: u.created_at,
        score: scoreFor(u.id),
        doneDays: db.prepare('SELECT day FROM completions WHERE user_id = ? ORDER BY day').all(u.id).map((r) => r.day),
        notes: db.prepare("SELECT day, note FROM completions WHERE user_id = ? AND note <> '' ORDER BY day").all(u.id),
        bonuses: db.prepare('SELECT id, points, reason, created_at FROM bonuses WHERE user_id = ? ORDER BY id DESC').all(u.id),
      })),
    });
  });

  api.put('/admin/settings', admin, (req, res) => {
    const b = req.body;
    if (b.start_date !== undefined) {
      if (b.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.start_date)) throw httpError(400, 'Data inválida.');
      if (b.start_date) setSetting('start_date', b.start_date);
      else db.prepare("DELETE FROM settings WHERE key = 'start_date'").run();
    }
    if (b.join_code !== undefined) {
      const code = cleanText(b.join_code, 40);
      if (!code) throw httpError(400, 'O código não pode ficar vazio.');
      setSetting('join_code', code);
    }
    if (b.target_points !== undefined) setSetting('target_points', String(Math.max(1, Number(b.target_points) || 50)));
    if (b.ranking_visible !== undefined) setSetting('ranking_visible', b.ranking_visible ? '1' : '0');
    res.json({ ok: true });
  });

  api.put('/admin/days/:day', admin, (req, res) => {
    const day = Number(req.params.day);
    const d = db.prepare('SELECT * FROM days WHERE day = ?').get(day);
    if (!d) throw httpError(404, 'Dia não encontrado.');
    const title = cleanText(req.body.title ?? d.title, 60);
    const description = cleanText(req.body.description ?? d.description, 1000);
    const points = Math.max(0, Math.min(50, Number(req.body.points ?? d.points) || 0));
    const icon = ICONS.includes(req.body.icon) ? req.body.icon : d.icon;
    if (!title || !description) throw httpError(400, 'Preencha título e descrição.');
    db.prepare('UPDATE days SET title = ?, description = ?, points = ?, icon = ? WHERE day = ?').run(title, description, points, icon, day);
    res.json({ ok: true });
  });

  api.post('/admin/users/:id/bonus', admin, (req, res) => {
    const id = Number(req.params.id);
    const points = Math.trunc(Number(req.body.points));
    const reason = cleanText(req.body.reason, 120);
    if (!points || Math.abs(points) > 50) throw httpError(400, 'Pontos inválidos.');
    if (!reason) throw httpError(400, 'Informe o motivo.');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw httpError(404, 'Usuário não encontrado.');
    db.prepare('INSERT INTO bonuses (user_id, admin_id, points, reason) VALUES (?, ?, ?, ?)').run(id, req.user.id, points, reason);
    res.json({ ok: true });
  });

  api.delete('/admin/bonus/:id', admin, (req, res) => {
    db.prepare('DELETE FROM bonuses WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  api.put('/admin/users/:id/role', admin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw httpError(400, 'Você não pode alterar o seu próprio perfil de acesso.');
    const role = req.body.role === 'admin' ? 'admin' : 'participant';
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    res.json({ ok: true });
  });

  api.post('/admin/users/:id/reset-password', admin, (req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw httpError(404, 'Usuário não encontrado.');
    const temp = crypto.randomBytes(4).toString('hex');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(temp), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    res.json({ ok: true, password: temp });
  });

  api.delete('/admin/users/:id', admin, (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw httpError(400, 'Você não pode remover a sua própria conta.');
    const u = db.prepare('SELECT avatar FROM users WHERE id = ?').get(id);
    if (!u) throw httpError(404, 'Usuário não encontrado.');
    const images = db.prepare('SELECT image FROM posts WHERE user_id = ?').all(id).map((p) => p.image);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    [u.avatar, ...images].forEach(removeImage);
    res.json({ ok: true });
  });

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // Fotos: só para quem está logado
  app.get('/uploads/:file', (req, res, next) => {
    if (!req.user) return res.status(401).end();
    const file = path.basename(req.params.file);
    res.sendFile(path.join(uploadsDir, file), { maxAge: '30d', immutable: true }, (err) => err && next());
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
