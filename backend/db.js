'use strict';
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SQLITE_PATH = path.join(PROJECT_ROOT, 'klara_ecossistema.db');
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();

let mode = 'sqlite';
let sqliteDb = null;
let pgPool = null;

function toPgSql(sql) {
  let idx = 0;
  let inSingleQuote = false;
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (inSingleQuote && sql[i + 1] === "'") {
        out += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      out += ch;
      continue;
    }
    if (!inSingleQuote && ch === '?') {
      idx++;
      out += '$' + idx;
      continue;
    }
    out += ch;
  }
  return out;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS colaboradores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cpf TEXT UNIQUE,
    cnpj TEXT,
    birth_date TEXT,
    marital_status TEXT,
    nationality TEXT DEFAULT 'Brasileira',
    birth_place TEXT,
    rg TEXT,
    issuing_authority TEXT,
    issuing_state TEXT,
    mother_name TEXT,
    father_name TEXT,
    email TEXT,
    phone TEXT,
    postal_code TEXT,
    address TEXT,
    address_number TEXT,
    address_complement TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,
    emergency_contact TEXT,
    emergency_relationship TEXT,
    emergency_phone TEXT,
    registration TEXT,
    role TEXT,
    department TEXT,
    contract_type TEXT,
    admission_date TEXT,
    termination_date TEXT,
    status TEXT NOT NULL DEFAULT 'Ativo',
    monthly_salary_cents INTEGER DEFAULT 0,
    ajuda_custo_cents INTEGER DEFAULT 0,
    weekly_minutes INTEGER DEFAULT 2640,
    jornada_descricao TEXT,
    hora_entrada TEXT,
    hora_saida TEXT,
    work_site_id TEXT,
    auth_salt TEXT,
    auth_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin_delegado',
    is_super_admin INTEGER NOT NULL DEFAULT 0,
    colaborador_id TEXT REFERENCES colaboradores(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS permissoes_modulos (
    id TEXT PRIMARY KEY,
    usuario_id TEXT UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
    colaborador_id TEXT UNIQUE REFERENCES colaboradores(id) ON DELETE CASCADE,
    acesso_apontamento INTEGER NOT NULL DEFAULT 1,
    acesso_painel_colaborador INTEGER NOT NULL DEFAULT 1,
    acesso_rh INTEGER NOT NULL DEFAULT 0,
    acesso_permissoes INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pontos (
    id TEXT PRIMARY KEY,
    colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    cpf TEXT,
    protocolo TEXT NOT NULL UNIQUE,
    work_date TEXT NOT NULL,
    hora TEXT NOT NULL,
    punch_type TEXT NOT NULL CHECK(punch_type IN ('entrada','saida')),
    label TEXT,
    punched_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'apontamento',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    location_status TEXT,
    note TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pontos_colab_date ON pontos(colaborador_id, work_date)`,
  `CREATE INDEX IF NOT EXISTS idx_pontos_colab_punched ON pontos(colaborador_id, work_date, punched_at)`,
  `CREATE TABLE IF NOT EXISTS work_sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_m INTEGER NOT NULL DEFAULT 150,
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS apontamento_config (
    id TEXT PRIMARY KEY,
    exigir_gps INTEGER NOT NULL DEFAULT 0,
    tolerancia_minutos INTEGER NOT NULL DEFAULT 10,
    permitir_sem_local INTEGER NOT NULL DEFAULT 1,
    mensagem_boas_vindas TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS adjustments (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    work_date TEXT NOT NULL,
    old_values TEXT NOT NULL,
    new_values TEXT NOT NULL,
    reason TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'Administrador',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS overtime (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    work_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendente',
    approved_minutes INTEGER,
    approved_by TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bank_ledger (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    work_date TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    reference_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL,
    category TEXT,
    data_base64 TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS closings (
    id TEXT PRIMARY KEY,
    competence TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    closed_at TEXT NOT NULL,
    reopened_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audit (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chamados (
    id TEXT PRIMARY KEY,
    colaborador_id TEXT REFERENCES colaboradores(id) ON DELETE CASCADE,
    usuario_id TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
    department TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Aberto',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    usuario_id TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
    colaborador_id TEXT REFERENCES colaboradores(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL,
    created_at TEXT NOT NULL
  )`
];

async function init() {
  if (DATABASE_URL) {
    const { Pool } = require('pg');
    mode = 'postgres';
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
    });
    for (const stmt of SCHEMA_STATEMENTS) {
      await pgPool.query(stmt);
    }
    await pgPool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS data_base64 TEXT');
    return { mode, file: 'PostgreSQL (DATABASE_URL)' };
  }

  mode = 'sqlite';
  sqliteDb = new DatabaseSync(SQLITE_PATH);
  sqliteDb.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  for (const stmt of SCHEMA_STATEMENTS) {
    sqliteDb.exec(stmt);
  }
  try { sqliteDb.exec('ALTER TABLE documents ADD COLUMN data_base64 TEXT'); } catch {}
  return { mode, file: 'klara_ecossistema.db', sqlitePath: SQLITE_PATH };
}

async function all(sql, ...params) {
  if (mode === 'postgres') {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows;
  }
  return sqliteDb.prepare(sql).all(...params);
}

async function one(sql, ...params) {
  if (mode === 'postgres') {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows[0] || undefined;
  }
  return sqliteDb.prepare(sql).get(...params);
}

async function run(sql, ...params) {
  if (mode === 'postgres') {
    const res = await pgPool.query(toPgSql(sql), params);
    return { changes: res.rowCount || 0 };
  }
  return sqliteDb.prepare(sql).run(...params);
}

async function transaction(fn) {
  if (mode === 'postgres') {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        all: async (sql, ...p) => (await client.query(toPgSql(sql), p)).rows,
        one: async (sql, ...p) => (await client.query(toPgSql(sql), p)).rows[0] || undefined,
        run: async (sql, ...p) => ({ changes: (await client.query(toPgSql(sql), p)).rowCount || 0 })
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  sqliteDb.exec('BEGIN');
  try {
    const tx = { all, one, run };
    const result = await fn(tx);
    sqliteDb.exec('COMMIT');
    return result;
  } catch (e) {
    sqliteDb.exec('ROLLBACK');
    throw e;
  }
}

async function checkpointAndCopy(destPath) {
  if (mode !== 'sqlite') {
    throw Object.assign(new Error('Backup SQLite direto disponível apenas no modo local.'), { status: 400 });
  }
  const fs = require('node:fs');
  sqliteDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(SQLITE_PATH, destPath);
}

async function close() {
  if (sqliteDb) sqliteDb.close();
  if (pgPool) await pgPool.end();
}

module.exports = {
  init,
  all,
  one,
  run,
  transaction,
  checkpointAndCopy,
  close,
  getMode: () => mode,
  SQLITE_PATH
};
