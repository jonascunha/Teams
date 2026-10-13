const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let server, base, clock;

// Roda contra SQLite; e também contra PostgreSQL se TEST_DATABASE_URL estiver definida.
const BACKENDS = [['sqlite', null]];
if (process.env.TEST_DATABASE_URL) BACKENDS.push(['postgres', process.env.TEST_DATABASE_URL]);

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : null };
  };
}

// Sobe o app num banco limpo. O verificador do Google é falso: o "token" é o próprio JSON do perfil.
async function startApp(t, databaseUrl, extra = {}) {
  if (databaseUrl) {
    const { Client } = require('pg');
    const c = new Client({ connectionString: databaseUrl });
    await c.connect();
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await c.end();
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desafio21-'));
  clock = new Date('2026-11-01T15:00:00Z');
  const app = await createApp({
    dataDir, databaseUrl, bucket: null, now: () => clock,
    googleClientId: 'teste.apps.googleusercontent.com',
    verifyGoogleToken: async (credential) => JSON.parse(credential),
    ...extra,
  });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); await app.locals.db.close(); });
}

const googleToken = (sub, email, extra = {}) => JSON.stringify({ sub, email, email_verified: true, name: 'Nome Google', ...extra });

for (const [backend, databaseUrl] of BACKENDS) {
test(`fluxo completo do desafio (${backend})`, async (t) => {
  await startApp(t, databaseUrl);

  const admin = client();
  const ana = client();
  const bia = client();

  // cadastro exige código
  assert.equal((await admin('POST', '/api/register', { name: 'Personal', email: 'p@mooh.com', password: '123456', code: 'errado' })).status, 400);
  assert.equal((await admin('POST', '/api/register', { name: 'Personal', email: 'p@mooh.com', password: '123456', code: 'mooh21' })).status, 200);
  assert.equal((await ana('POST', '/api/register', { name: 'Ana Souza', email: 'ana@x.com', password: '123456', code: 'MOOH21' })).status, 200);
  assert.equal((await bia('POST', '/api/register', { name: 'Bia', email: 'bia@x.com', password: '123456', code: 'MOOH21' })).status, 200);
  assert.equal((await bia('POST', '/api/register', { name: 'Bia', email: 'BIA@x.com', password: '123456', code: 'MOOH21' })).status, 400);

  // primeiro usuário é admin
  assert.equal((await admin('GET', '/api/me')).body.user.role, 'admin');
  assert.equal((await ana('GET', '/api/me')).body.user.role, 'participant');
  assert.equal((await ana('GET', '/api/admin/overview')).status, 403);
  assert.equal((await client()('GET', '/api/me')).status, 401);

  // antes do início não dá para marcar
  assert.equal((await ana('PUT', '/api/challenge/1', { done: true })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/settings', { start_date: '2026-10-30' })).status, 200);
  // 01/11 (12h em SP) → dia 3
  assert.equal((await ana('GET', '/api/me')).body.currentDay, 3);
  assert.equal((await ana('PUT', '/api/challenge/4', { done: true })).status, 400);
  let r = await ana('PUT', '/api/challenge/1', { done: true, note: 'Quero ter mais disposição' });
  assert.equal(r.body.score.total, 2);
  r = await ana('PUT', '/api/challenge/2', { done: true });
  assert.equal(r.body.score.total, 3);
  r = await ana('PUT', '/api/challenge/2', { done: false });
  assert.equal(r.body.score.total, 2);
  const ch = (await ana('GET', '/api/challenge')).body;
  assert.equal(ch.days.length, 21);
  assert.equal(ch.days[0].note, 'Quero ter mais disposição');

  // desafio individual + metas
  assert.equal((await ana('PUT', '/api/profile', { personal_challenge: 'Beber 2L de água' })).status, 200);
  assert.equal((await ana('PUT', '/api/personal/3', { done: true })).status, 200);
  assert.equal((await ana('PUT', '/api/personal/5', { done: true })).status, 400);
  await ana('POST', '/api/goals', { text: 'Treinar 3x por semana' });
  let me = (await ana('GET', '/api/me')).body;
  assert.deepEqual(me.personal, [3]);
  assert.equal(me.goals.length, 1);
  assert.equal(me.user.personal_challenge, 'Beber 2L de água');

  // feed: foto vale 1 ponto por dia
  r = await ana('POST', '/api/posts', { image: PNG, caption: 'Treino feito!' });
  assert.equal(r.body.score.total, 3);
  r = await ana('POST', '/api/posts', { image: PNG, caption: 'De novo' });
  assert.equal(r.body.score.total, 3);
  assert.equal((await ana('POST', '/api/posts', { image: 'data:text/html;base64,AAAA' })).status, 400);
  const posts = (await bia('GET', '/api/posts')).body;
  assert.equal(posts.length, 2);
  const postId = posts[0].id;
  assert.equal((await bia('GET', posts[0].image)).status, 200);
  assert.equal((await client()('GET', posts[0].image)).status, 401);

  // interações
  await bia('POST', `/api/posts/${postId}/like`);
  await bia('POST', `/api/posts/${postId}/comments`, { body: 'Arrasou! <script>' });
  let p = (await ana('GET', '/api/posts')).body.find((x) => x.id === postId);
  assert.equal(p.likes, 1);
  assert.equal(p.comments[0].body, 'Arrasou! <script>');
  assert.equal((await bia('DELETE', `/api/posts/${postId}`)).status, 403);
  assert.equal((await ana('DELETE', `/api/comments/${p.comments[0].id}`)).status, 403);
  await bia('POST', `/api/posts/${postId}/like`); // descurtir
  p = (await ana('GET', '/api/posts')).body.find((x) => x.id === postId);
  assert.equal(p.likes, 0);

  // mural
  assert.equal((await ana('POST', '/api/notices', { title: 'x', body: 'y' })).status, 403);
  assert.equal((await admin('POST', '/api/notices', { title: 'Missão surpresa!', body: 'Faça 50 agachamentos', pinned: true })).status, 200);
  const notices = (await bia('GET', '/api/notices')).body;
  assert.equal(notices[0].title, 'Missão surpresa!');
  assert.equal(notices[0].author.name, 'Personal');

  // bônus e ranking
  const anaId = me.user.id;
  assert.equal((await admin('POST', `/api/admin/users/${anaId}/bonus`, { points: 2, reason: 'Treino realizado' })).status, 200);
  const rank = (await bia('GET', '/api/ranking')).body;
  assert.equal(rank.list[0].name, 'Ana Souza');
  assert.equal(rank.list[0].total, 5);
  assert.ok(!rank.list.some((u) => u.name === 'Personal'));

  // admin edita dia e reseta senha
  assert.equal((await admin('PUT', '/api/admin/days/12', { description: 'Missão: 100 polichinelos' })).status, 200);
  assert.equal((await ana('GET', '/api/challenge')).body.days[11].description, 'Missão: 100 polichinelos');
  const reset = (await admin('POST', `/api/admin/users/${anaId}/reset-password`)).body;
  assert.equal((await ana('GET', '/api/me')).status, 401);
  assert.equal((await ana('POST', '/api/login', { email: 'ANA@x.com', password: reset.password })).status, 200);
  assert.equal((await ana('GET', '/api/me')).status, 200);

  // avança o relógio: dia 22 = encerrado, ainda pode marcar dias passados
  clock = new Date('2026-11-20T15:00:00Z');
  assert.equal((await ana('GET', '/api/me')).body.currentDay, 22);
  assert.equal((await ana('PUT', '/api/challenge/21', { done: true })).status, 200);

  // logout
  await ana('POST', '/api/logout');
  assert.equal((await ana('GET', '/api/me')).status, 401);
});

test(`login com Google (${backend})`, async (t) => {
  await startApp(t, databaseUrl);
  assert.equal((await client()('GET', '/api/config')).body.googleClientId, 'teste.apps.googleusercontent.com');

  // primeira entrada: pede o código do desafio
  const carol = client();
  let r = await carol('POST', '/api/google', { credential: googleToken('g-carol', 'Carol@Gmail.com') });
  assert.equal(r.status, 409);
  assert.equal(r.body.needsCode, true);
  r = await carol('POST', '/api/google', { credential: googleToken('g-carol', 'Carol@Gmail.com'), code: 'errado' });
  assert.equal(r.status, 400);
  assert.equal(r.body.needsCode, true);
  r = await carol('POST', '/api/google', { credential: googleToken('g-carol', 'Carol@Gmail.com'), code: 'mooh21' });
  assert.equal(r.status, 200);
  let me = (await carol('GET', '/api/me')).body.user;
  assert.equal(me.role, 'admin'); // primeira conta
  assert.equal(me.email, 'carol@gmail.com');
  assert.equal(me.name, 'Nome Google');
  assert.equal(me.google, true);
  assert.equal(me.hasPassword, false);

  // segunda entrada: não pede código
  const carol2 = client();
  assert.equal((await carol2('POST', '/api/google', { credential: googleToken('g-carol', 'carol@gmail.com') })).status, 200);

  // conta só-Google não entra com senha, mas pode criar uma
  r = await client()('POST', '/api/login', { email: 'carol@gmail.com', password: 'qualquer' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Google/);
  assert.equal((await carol('PUT', '/api/password', { password: 'nova123' })).status, 200);
  assert.equal((await client()('POST', '/api/login', { email: 'carol@gmail.com', password: 'nova123' })).status, 200);
  assert.equal((await carol('PUT', '/api/password', { password: 'outra123' })).status, 400); // agora exige a atual

  // conta criada com e-mail e senha é ligada ao Google pelo mesmo e-mail
  const ana = client();
  await ana('POST', '/api/register', { name: 'Ana', email: 'ana@gmail.com', password: '123456', code: 'MOOH21' });
  const anaG = client();
  assert.equal((await anaG('POST', '/api/google', { credential: googleToken('g-ana', 'ana@gmail.com') })).status, 200);
  me = (await anaG('GET', '/api/me')).body.user;
  assert.equal(me.name, 'Ana');
  assert.equal(me.google, true);
  assert.equal(me.hasPassword, true);
  assert.equal((await client()('POST', '/api/login', { email: 'ana@gmail.com', password: '123456' })).status, 200);

  // outra conta Google com o mesmo e-mail é recusada; e-mail não verificado também
  assert.equal((await client()('POST', '/api/google', { credential: googleToken('g-outro', 'ana@gmail.com') })).status, 400);
  assert.equal((await client()('POST', '/api/google', { credential: googleToken('g-x', 'x@gmail.com', { email_verified: false }), code: 'MOOH21' })).status, 400);

  // token inválido
  assert.equal((await client()('POST', '/api/google', { credential: 'lixo' })).status, 400);
});
}
