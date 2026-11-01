// Copia todos os dados de um PostgreSQL para outro (ex.: Cloud SQL → Neon) e confere as contagens.
// Uso: node scripts/copy-db.js ORIGEM_URL DESTINO_URL [--substituir]
// O destino recebe o esquema do app; se já tiver usuários, o script para, a menos que receba --substituir.
const { Client } = require('pg');
const { openDb, normalizeUrl } = require('../src/db');

// Ordem respeita as chaves estrangeiras
const TABLES = ['users', 'sessions', 'settings', 'days', 'completions', 'personal_checks', 'goals', 'bonuses', 'notices', 'posts', 'likes', 'comments'];
const SERIAL = ['users', 'goals', 'bonuses', 'notices', 'posts', 'comments'];

async function main() {
  const [sourceUrl, targetUrl, flag] = process.argv.slice(2);
  if (!sourceUrl || !targetUrl) {
    console.error('Uso: node scripts/copy-db.js ORIGEM_URL DESTINO_URL [--substituir]');
    process.exit(1);
  }
  const replace = flag === '--substituir';

  // Cria o esquema no destino com o próprio código do app
  const appDb = await openDb({ databaseUrl: targetUrl });
  await appDb.close();

  const source = new Client({ connectionString: normalizeUrl(sourceUrl) });
  const target = new Client({ connectionString: normalizeUrl(targetUrl) });
  await source.connect();
  await target.connect();

  try {
    const existing = Number((await target.query('SELECT COUNT(*) AS n FROM users')).rows[0].n);
    if (existing > 0 && !replace) {
      throw new Error(`O destino já tem ${existing} usuário(s). Nada foi alterado. Use --substituir para apagar e copiar de novo.`);
    }

    await target.query('BEGIN');
    await target.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    for (const table of TABLES) {
      const { rows, fields } = await source.query(`SELECT * FROM ${table}`);
      const cols = fields.map((f) => f.name);
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const values = [];
        const tuples = batch.map((row) => `(${cols.map((c) => { values.push(row[c]); return `$${values.length}`; }).join(', ')})`);
        await target.query(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${tuples.join(', ')}`, values);
      }
    }
    // Faz os próximos ids continuarem depois dos copiados
    for (const table of SERIAL) {
      await target.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table}`);
    }
    await target.query('COMMIT');
  } catch (err) {
    await target.query('ROLLBACK').catch(() => {});
    throw err;
  }

  // Conferência
  let ok = true;
  console.log('\nTabela              Origem  Destino');
  for (const table of TABLES) {
    const a = Number((await source.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
    const b = Number((await target.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
    if (a !== b) ok = false;
    console.log(`${table.padEnd(18)} ${String(a).padStart(7)} ${String(b).padStart(8)}${a === b ? '' : '  ← DIFERENTE'}`);
  }
  await source.end();
  await target.end();
  if (!ok) throw new Error('As contagens não bateram. Não troque o banco do app; me mande esta saída.');
  console.log('\nCópia concluída e conferida.');
}

main().catch((err) => {
  console.error('\nERRO:', err.message);
  process.exit(1);
});
