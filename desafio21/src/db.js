// Camada de banco: PostgreSQL (Cloud SQL) quando DATABASE_URL está definida,
// senão SQLite embutido do Node (desenvolvimento local / testes).
// As consultas usam "?" como parâmetro; no Postgres elas viram $1, $2...
const fs = require('node:fs');
const path = require('node:path');
const { DAYS } = require('./challenge');

const SCHEMA = (ID) => `
  CREATE TABLE IF NOT EXISTS users (
    id ${ID},
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    google_sub TEXT,
    role TEXT NOT NULL DEFAULT 'participant',
    avatar TEXT,
    commitment TEXT NOT NULL DEFAULT '',
    personal_challenge TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS days (
    day INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    points INTEGER NOT NULL,
    icon TEXT NOT NULL DEFAULT 'star'
  );
  CREATE TABLE IF NOT EXISTS completions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day INTEGER NOT NULL REFERENCES days(day),
    note TEXT NOT NULL DEFAULT '',
    completed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  CREATE TABLE IF NOT EXISTS personal_checks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  CREATE TABLE IF NOT EXISTS goals (
    id ${ID},
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS bonuses (
    id ${ID},
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    points INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notices (
    id ${ID},
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts (
    id ${ID},
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    local_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id, local_date);
  CREATE TABLE IF NOT EXISTS likes (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id ${ID},
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id);
`;

async function openPostgres(url) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, (v) => parseInt(v, 10)); // COUNT/SUM (bigint) como número
  const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_SIZE) || 5 });
  const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  const query = (sql, params) => pool.query(toPg(sql), params);
  const db = {
    dialect: 'postgres',
    get: async (sql, ...p) => (await query(sql, p)).rows[0],
    all: async (sql, ...p) => (await query(sql, p)).rows,
    run: async (sql, ...p) => ({ changes: (await query(sql, p)).rowCount }),
    exec: (sql) => pool.query(sql),
    close: () => pool.end(),
  };
  // Evita duas instâncias criando o esquema ao mesmo tempo
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(2121)');
    await client.query(SCHEMA('SERIAL PRIMARY KEY'));
  } finally {
    await client.query('SELECT pg_advisory_unlock(2121)');
    client.release();
  }
  return db;
}

function openSqlite(dataDir) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new DatabaseSync(path.join(dataDir, 'desafio.db'));
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  sqlite.exec(SCHEMA('INTEGER PRIMARY KEY AUTOINCREMENT'));
  return {
    dialect: 'sqlite',
    get: async (sql, ...p) => sqlite.prepare(sql).get(...p),
    all: async (sql, ...p) => sqlite.prepare(sql).all(...p),
    run: async (sql, ...p) => ({ changes: Number(sqlite.prepare(sql).run(...p).changes) }),
    exec: async (sql) => sqlite.exec(sql),
    close: async () => sqlite.close(),
  };
}

async function openDb({ databaseUrl, dataDir }) {
  const db = databaseUrl ? await openPostgres(databaseUrl) : openSqlite(dataDir);
  // Migração: bancos criados antes do login com Google não têm a coluna google_sub
  try {
    await db.get('SELECT google_sub FROM users LIMIT 1');
  } catch {
    await db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
  }
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub)');
  const { n } = await db.get('SELECT COUNT(*) AS n FROM days');
  if (Number(n) === 0) {
    for (const d of DAYS) {
      await db.run('INSERT INTO days (day, title, description, points, icon) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
        d.day, d.title, d.description, d.points, d.icon);
    }
  }
  return db;
}

module.exports = { openDb };
