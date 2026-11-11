// Armazenamento das fotos: Google Cloud Storage quando GCS_BUCKET está definido,
// senão uma pasta local (desenvolvimento). As fotos são sempre servidas pelo app,
// que confere se o usuário está logado — o bucket fica privado.
const fs = require('node:fs');
const path = require('node:path');

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const CACHE = 'private, max-age=2592000, immutable';
const contentType = (name) => TYPES[path.extname(name).slice(1)] || 'application/octet-stream';

function gcsStorage(bucketName) {
  const { Storage } = require('@google-cloud/storage');
  const bucket = new Storage().bucket(bucketName);
  return {
    save: (name, buf) => bucket.file(`uploads/${name}`).save(buf, {
      resumable: false,
      contentType: contentType(name),
      metadata: { cacheControl: CACHE },
    }),
    remove: (name) => bucket.file(`uploads/${name}`).delete({ ignoreNotFound: true }).catch(() => {}),
    send: (name, res) => {
      // O tipo vem da extensão e vai antes do conteúdo: sem ele (e com nosniff), o navegador não mostra a foto.
      res.set('Content-Type', contentType(name));
      res.set('Cache-Control', CACHE);
      // Sem a conferência de integridade no fim do download: se ela falhasse, a conexão seria cortada
      // depois de a foto já ter sido enviada, e o navegador ficaria com uma imagem quebrada.
      const stream = bucket.file(`uploads/${name}`).createReadStream({ validation: false });
      stream.on('error', (err) => {
        console.error(`Falha ao ler a foto ${name} do Cloud Storage:`, err.code || '', err.message);
        if (!res.headersSent) {
          res.removeHeader('Cache-Control');
          res.status(err.code === 404 ? 404 : 500).end();
        } else {
          res.destroy(err);
        }
      });
      stream.pipe(res);
    },
  };
}

function localStorage(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return {
    save: (name, buf) => fs.promises.writeFile(path.join(dir, name), buf),
    remove: (name) => fs.promises.rm(path.join(dir, name), { force: true }).catch(() => {}),
    send: (name, res) => {
      res.sendFile(path.join(dir, name), { headers: { 'Cache-Control': CACHE } }, (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    },
  };
}

function createStorage({ bucket, dataDir }) {
  return bucket ? gcsStorage(bucket) : localStorage(path.join(dataDir, 'uploads'));
}

module.exports = { createStorage };
