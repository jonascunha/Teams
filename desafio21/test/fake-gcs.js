// Servidor falso do Google Cloud Storage para os testes: upload multipart, download alt=media e delete,
// com os checksums (md5 e crc32c) que a biblioteca oficial confere.
const http = require('http');
const crypto = require('crypto');
const objects = new Map();
const T = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0x82F63B78 ^ (c >>> 1) : c >>> 1; return c; });
const crc32c = (buf) => { let c = -1; for (const b of buf) c = T[(c ^ b) & 0xff] ^ (c >>> 8); const out = Buffer.alloc(4); out.writeUInt32BE((c ^ -1) >>> 0); return out.toString('base64'); };
function startFakeGcs(port = 0) {
  return new Promise((resolve) => {
  const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    let m;
    if (req.method === 'POST' && (m = u.pathname.match(/^\/upload\/storage\/v1\/b\/([^/]+)\/o$/))) {
      const boundary = /boundary=([^;]+)/.exec(req.headers['content-type'])[1].replace(/"/g, '');
      const parts = body.toString('latin1').split('--' + boundary).filter((p) => p.trim() && p.trim() !== '--');
      const meta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
      const raw = parts[1].slice(parts[1].indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
      const name = meta.name || u.searchParams.get('name');
      objects.set(name, { data: Buffer.from(raw, 'latin1'), contentType: meta.contentType });
      res.setHeader('Content-Type', 'application/json');
      const md5Hash = crypto.createHash('md5').update(objects.get(name).data).digest('base64');
      objects.get(name).md5 = md5Hash;
      const crc = crc32c(objects.get(name).data); objects.get(name).crc = crc;
      return res.end(JSON.stringify({ bucket: m[1], name, contentType: meta.contentType, size: String(objects.get(name).data.length), md5Hash, crc32c: crc }));
    }
    if (req.method === 'GET' && (m = u.pathname.match(/^\/(?:download\/)?(?:storage\/v1\/)?b\/([^/]+)\/o\/(.+)$/))) {
      const o = objects.get(decodeURIComponent(m[2]));
      if (!o) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: { code: 404, message: 'No such object' } })); }
      if (u.searchParams.get('alt') === 'media') { res.setHeader('Content-Type', o.contentType); res.setHeader('x-goog-hash', 'crc32c=' + o.crc + ',md5=' + o.md5); return res.end(o.data); }
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ name: decodeURIComponent(m[2]), contentType: o.contentType, size: String(o.data.length) }));
    }
    if (req.method === 'DELETE') { res.statusCode = 204; return res.end(); }
    res.statusCode = 404; res.end('{}');
  });
  });
  server.listen(port, () => resolve({ server, port: server.address().port, objects }));
  });
}

module.exports = { startFakeGcs };
