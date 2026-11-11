// Fotos guardadas no Cloud Storage (com um servidor falso): o app precisa devolver a imagem inteira,
// com o tipo certo, só para quem está logado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFakeGcs } = require('./fake-gcs');

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('fotos no Cloud Storage', async (t) => {
  const gcs = await startFakeGcs();
  process.env.STORAGE_EMULATOR_HOST = `http://localhost:${gcs.port}`;
  process.env.GOOGLE_CLOUD_PROJECT = 'teste';
  const { createApp } = require('../src/app');
  const app = await createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'desafio21-gcs-')), databaseUrl: null, bucket: 'fotos-teste' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.close(); gcs.server.close(); await app.locals.db.close(); delete process.env.STORAGE_EMULATOR_HOST; });

  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body) });
    const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
    return r;
  };
  await call('POST', '/api/register', { name: 'Jonas', email: 'j@x.com', password: '123456', code: 'MOOH21' });
  assert.equal((await call('POST', '/api/posts', { image: 'data:image/png;base64,' + PNG_B64, caption: 'teste' })).status, 200);
  const [post] = await (await call('GET', '/api/posts')).json();

  const img = await call('GET', post.image);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), Buffer.from(PNG_B64, 'base64'));

  assert.equal((await fetch(base + post.image)).status, 401); // sem login
  const missing = await call('GET', '/uploads/0123456789abcdef01234567.jpg');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), null); // erro não fica guardado no cache do celular
});
