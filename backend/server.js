'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');
const {
  SUPER_ADMIN_EMAILS,
  seedAll,
  importPontoRhPayload,
  hashSecret,
  cleanCPF,
  computeWeeklyMinutes
} = require('./seed');

const BACKEND_DIR = __dirname;
const PROJECT_ROOT = path.resolve(BACKEND_DIR, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'dados');
const FILES_DIR = path.join(DATA_DIR, 'documentos');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');

const RH_HTML = path.join(PROJECT_ROOT, 'klara-rh', 'index.html');
const APONTAMENTO_HTML = path.join(PROJECT_ROOT, 'klara-apontamento', 'index.html');
const COLABORADOR_HTML = path.join(PROJECT_ROOT, 'klara-colaborador', 'index.html');

const PWA_MANIFESTS = {
  rh: {
    name: 'Klara Pessoas — Gestão de RH',
    short_name: 'Klara RH',
    description: 'Gestão estratégica de pessoas, espelho de ponto e fechamento mensal.',
    start_url: '/rh',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#7c6ef6',
    background_color: '#f5f7ff',
    lang: 'pt-BR',
    icons: [
      { src: '/assets/icons/klara-rh-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/assets/icons/klara-rh-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/assets/icons/klara-rh-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/icons/klara-rh-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/icons/klara-rh.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  },
  apontamento: {
    name: 'Klara Apontamento — Ponto Digital',
    short_name: 'Klara Ponto',
    description: 'Registro rápido de Entrada e Saída com geolocalização e protocolo.',
    start_url: '/apontamento',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#162044',
    background_color: '#f4f7fb',
    lang: 'pt-BR',
    icons: [
      { src: '/assets/icons/klara-apontamento-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/assets/icons/klara-apontamento-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/assets/icons/klara-apontamento-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/icons/klara-apontamento-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/icons/klara-apontamento.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  },
  colaborador: {
    name: 'Klara Colaborador — Portal Pessoal',
    short_name: 'Klara Portal',
    description: 'Consulte pontos, comprovantes, documentos e chamados em tempo real.',
    start_url: '/colaborador',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#162044',
    background_color: '#f4f7fb',
    lang: 'pt-BR',
    icons: [
      { src: '/assets/icons/klara-colaborador-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/assets/icons/klara-colaborador-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/assets/icons/klara-colaborador-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/icons/klara-colaborador-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/assets/icons/klara-colaborador.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  }
};

fs.mkdirSync(FILES_DIR, { recursive: true });

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function verifySecret(secret, salt, hash) {
  try {
    if (!salt || !hash) return false;
    const got = crypto.scryptSync(String(secret), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

function isSuperAdminUser(user) {
  return Boolean(
    user &&
    Number(user.is_super_admin) === 1 &&
    user.role === 'super_admin' &&
    SUPER_ADMIN_EMAILS.has(String(user.email || '').toLowerCase())
  );
}

function isDelegatedAdmin(user) {
  return Boolean(user && user.role === 'admin_delegado' && Number(user.active) === 1);
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === name) {
      try { return decodeURIComponent(v); } catch { return v; }
    }
  }
  return '';
}

function setCookieHeader(res, name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function getPermissionsForUser(user) {
  if (!user) {
    return { acesso_apontamento: 0, acesso_painel_colaborador: 0, acesso_rh: 0, acesso_permissoes: 0 };
  }
  if (isSuperAdminUser(user)) {
    return { acesso_apontamento: 1, acesso_painel_colaborador: 1, acesso_rh: 1, acesso_permissoes: 1 };
  }
  if (isDelegatedAdmin(user)) {
    return { acesso_apontamento: 1, acesso_painel_colaborador: 1, acesso_rh: 1, acesso_permissoes: 0 };
  }
  const byUser = await db.one('SELECT * FROM permissoes_modulos WHERE usuario_id=?', user.id);
  if (byUser) return byUser;
  if (user.colaborador_id) {
    const byColab = await db.one('SELECT * FROM permissoes_modulos WHERE colaborador_id=?', user.colaborador_id);
    if (byColab) return byColab;
  }
  return { acesso_apontamento: 0, acesso_painel_colaborador: 0, acesso_rh: 0, acesso_permissoes: 0 };
}

async function getPermissionsForColaborador(colaboradorId) {
  const row = await db.one('SELECT * FROM permissoes_modulos WHERE colaborador_id=?', colaboradorId);
  if (row) return row;
  return { acesso_apontamento: 1, acesso_painel_colaborador: 1, acesso_rh: 0, acesso_permissoes: 0 };
}

async function createSession(scope, { usuarioId = null, colaboradorId = null }, ttlMs) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.run('DELETE FROM sessoes WHERE expires_at < ?', Date.now());
  await db.run(
    'INSERT INTO sessoes(token, scope, usuario_id, colaborador_id, expires_at, created_at) VALUES(?,?,?,?,?,?)',
    token, scope, usuarioId, colaboradorId, Date.now() + ttlMs, now()
  );
  return token;
}

async function getRhSessionUser(req) {
  const token = cookieValue(req, 'klara_rh_session');
  if (!token) return null;
  const sess = await db.one("SELECT * FROM sessoes WHERE token=? AND scope='rh'", token);
  if (!sess) return null;
  if (Number(sess.expires_at) < Date.now()) {
    await db.run('DELETE FROM sessoes WHERE token=?', token);
    return null;
  }
  const user = sess.usuario_id ? await db.one('SELECT * FROM usuarios WHERE id=? AND active=1', sess.usuario_id) : null;
  if (!user) return null;
  const superAdmin = isSuperAdminUser(user);
  const delegatedAdmin = isDelegatedAdmin(user);
  const permissoes = await getPermissionsForUser(user);
  if (!superAdmin && !delegatedAdmin && Number(permissoes.acesso_rh) !== 1) return null;
  return { ...user, token, super_admin: superAdmin, delegated_admin: delegatedAdmin, permissoes };
}

async function getColabSession(req) {
  const token = cookieValue(req, 'klara_colab_session');
  if (!token) return null;
  const sess = await db.one("SELECT * FROM sessoes WHERE token=? AND scope='colaborador'", token);
  if (!sess) return null;
  if (Number(sess.expires_at) < Date.now()) {
    await db.run('DELETE FROM sessoes WHERE token=?', token);
    return null;
  }
  let user = null;
  let colab = null;
  if (sess.usuario_id) {
    user = await db.one('SELECT * FROM usuarios WHERE id=? AND active=1', sess.usuario_id);
    if (!user) return null;
  }
  const cid = sess.colaborador_id || user?.colaborador_id || null;
  if (cid) {
    colab = await db.one('SELECT * FROM colaboradores WHERE id=?', cid);
    if (!colab || colab.status === 'Inativo') return null;
  }
  if (!user && !colab) return null;

  const superAdmin = isSuperAdminUser(user);
  const delegatedAdmin = isDelegatedAdmin(user);
  const perms = user ? await getPermissionsForUser(user) : await getPermissionsForColaborador(colab.id);
  if (!superAdmin && !delegatedAdmin && Number(perms.acesso_painel_colaborador) !== 1) return null;

  return { token, user, colab, super_admin: superAdmin, delegated_admin: delegatedAdmin, permissoes: perms };
}

async function deleteSession(req, cookieName) {
  const token = cookieValue(req, cookieName);
  if (token) await db.run('DELETE FROM sessoes WHERE token=?', token);
}

function localNow(tz = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const o = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return {
    date: `${o.year}-${o.month}-${o.day}`,
    time: `${o.hour}:${o.minute}:${o.second}`,
    stamp: `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}`
  };
}

function haversine(a, b, c, d) {
  const r = 6371000, toRad = x => x * Math.PI / 180;
  const dl = toRad(c - a), dn = toRad(d - b);
  const q = Math.sin(dl / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dn / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(q));
}

async function audit(entity, entityId, action, details = {}) {
  await db.run('INSERT INTO audit VALUES(?,?,?,?,?,?)', id(), entity, entityId, action, JSON.stringify(details), now());
}

function json(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => {
      s += c;
      if (s.length > limit) {
        reject(Object.assign(new Error('Requisição excede o limite permitido.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'));
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));

function validCPF(v) {
  const n = cleanCPF(v);
  if (n.length !== 11 || /^(.)\1{10}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(n[i]) * (10 - i);
  let d = (sum * 10) % 11;
  if (d === 10) d = 0;
  if (d !== Number(n[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(n[i]) * (11 - i);
  d = (sum * 10) % 11;
  if (d === 10) d = 0;
  return d === Number(n[10]);
}

function mins(t) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''))) {
    throw Object.assign(new Error('Horário inválido.'), { status: 400 });
  }
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function duration(n) {
  n = Math.max(0, Math.abs(Number(n) || 0));
  return Math.floor(n / 60) + 'h' + String(n % 60).padStart(2, '0');
}

function fmt(n) {
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return sign + duration(n);
}

async function getColaboradorOrThrow(empId) {
  const p = await db.one('SELECT * FROM colaboradores WHERE id=?', empId);
  if (!p) throw Object.assign(new Error('Colaborador não encontrado.'), { status: 404 });
  return p;
}

function sanitizeColaborador(p, perms = null) {
  if (!p) return null;
  const copy = { ...p };
  delete copy.auth_salt;
  delete copy.auth_hash;
  return {
    ...copy,
    cpf: copy.cpf || '',
    initial: copy.name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'KL',
    date: copy.admission_date || '—',
    sector: copy.department || '',
    role: copy.role || '',
    permissoes: perms ? {
      acesso_apontamento: Boolean(perms.acesso_apontamento),
      acesso_painel_colaborador: Boolean(perms.acesso_painel_colaborador)
    } : undefined
  };
}

async function enrichEmployee(p) {
  const perms = await getPermissionsForColaborador(p.id);
  return sanitizeColaborador(p, perms);
}

async function punchesFor(empId, date) {
  return db.all('SELECT * FROM pontos WHERE colaborador_id=? AND work_date=? ORDER BY punched_at, created_at', empId, date);
}

async function activeWorkDate(empId, today) {
  const todayRows = await punchesFor(empId, today);
  if (todayRows.length) return today;
  const d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const prior = d.toISOString().slice(0, 10);
  const rows = await punchesFor(empId, prior);
  if (rows.some(x => x.punch_type === 'entrada') && !rows.some(x => x.punch_type === 'saida')) return prior;
  return today;
}

function punchLabel(type) {
  return type === 'entrada' ? 'Entrada' : type === 'saida' ? 'Saída' : 'Marcação';
}

function generateProtocol() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `KLA-${stamp}-${rand}`;
}

function expectedDailyMinutesFor(colab, date) {
  const weekday = new Date(date + 'T12:00:00').getDay();
  if (weekday === 0 || weekday === 6) return 0; // Folga sáb/dom por padrão (Seg a Sex)
  if (colab.hora_entrada && colab.hora_saida) {
    let diff = mins(colab.hora_saida) - mins(colab.hora_entrada);
    if (diff < 0) diff += 1440;
    return diff;
  }
  return Math.round(Number(colab.weekly_minutes || 2640) / 5);
}

async function calculateDay(colab, date) {
  const p = await punchesFor(colab.id, date);
  const map = {};
  for (const x of p) map[x.punch_type] = x.punched_at.slice(11, 16);
  const complete = Boolean(map.entrada && map.saida);
  let worked = 0;
  if (complete) {
    let start = mins(map.entrada), end = mins(map.saida);
    if (end < start) end += 1440;
    worked = end - start;
  }
  const expected = expectedDailyMinutesFor(colab, date);
  const delta = complete ? (worked - expected) : null;
  const today = localNow().date;
  const weekday = new Date(date + 'T12:00:00').getDay();
  const isWeekend = weekday === 0 || weekday === 6;

  let status = 'Regular';
  if (p.length === 0) {
    if (expected > 0) status = date > today ? 'Previsto' : 'Sem marcação';
    else status = isWeekend ? 'Folga' : 'Sem escala';
  } else if (!complete) {
    status = 'Incompleto';
  } else if (expected === 0) {
    status = 'Hora extra / Folga';
  } else if (delta > 0) {
    status = 'Acima da jornada';
  } else if (delta < 0) {
    status = 'Abaixo da jornada';
  }

  return {
    employee_id: colab.id,
    date,
    punches: { entrada: map.entrada || null, saida: map.saida || null },
    worked_minutes: worked,
    worked: duration(worked),
    expected_minutes: expected,
    expected: duration(expected),
    balance_minutes: delta,
    balance: delta === null ? null : fmt(delta),
    status,
    complete
  };
}

function competenceRange(c) {
  if (!/^\d{4}-\d{2}$/.test(c)) throw Object.assign(new Error('Competência deve estar no formato AAAA-MM.'), { status: 400 });
  const [y, m] = c.split('-').map(Number);
  if (m < 1 || m > 12) throw Object.assign(new Error('Mês inválido.'), { status: 400 });
  return [`${c}-01`, `${c}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`];
}

async function buildMonthEspelho(colab, c) {
  competenceRange(c);
  const [yy, mm] = c.split('-').map(Number);
  const days = [];
  for (let d = 1; d <= new Date(yy, mm, 0).getDate(); d++) {
    const date = `${c}-${String(d).padStart(2, '0')}`;
    days.push(await calculateDay(colab, date));
  }
  return days;
}

async function monthSummary(c) {
  const [from, to] = competenceRange(c);
  const emps = await db.all(
    "SELECT * FROM colaboradores WHERE status!='Inativo' AND (admission_date IS NULL OR admission_date<=?) AND (termination_date IS NULL OR termination_date>=?)",
    to, from
  );
  const today = localNow().date;
  const rows = [];
  for (const e of emps) {
    const allDays = await buildMonthEspelho(e, c);
    const days = allDays.filter(d => d.date <= today && (d.expected_minutes > 0 || d.punches.entrada || d.punches.saida));
    const worked = days.reduce((a, x) => a + x.worked_minutes, 0);
    const expected = days.reduce((a, x) => a + x.expected_minutes, 0);
    const pending = days.filter(x => x.expected_minutes > 0 && !x.complete).length;
    const otRow = await db.one(
      "SELECT COALESCE(SUM(COALESCE(approved_minutes,0)),0) n FROM overtime WHERE employee_id=? AND work_date BETWEEN ? AND ? AND status='Aprovada'",
      e.id, from, to
    );
    const bankRow = await db.one(
      'SELECT COALESCE(SUM(minutes),0) n FROM bank_ledger WHERE employee_id=? AND work_date BETWEEN ? AND ?',
      e.id, from, to
    );
    rows.push({
      employee: { id: e.id, name: e.name, registration: e.registration },
      days_with_punch: days.filter(x => x.punches.entrada || x.punches.saida).length,
      worked_minutes: worked,
      expected_minutes: expected,
      variance_minutes: worked - expected,
      pending_days: pending,
      approved_overtime_minutes: Number(otRow?.n || 0),
      bank_movement_minutes: Number(bankRow?.n || 0)
    });
  }
  const punchRow = await db.one('SELECT COUNT(*) n FROM pontos WHERE work_date BETWEEN ? AND ?', from, to);
  return {
    competence: c,
    from,
    to,
    employees: rows.length,
    worked_minutes: rows.reduce((a, x) => a + x.worked_minutes, 0),
    expected_minutes: rows.reduce((a, x) => a + x.expected_minutes, 0),
    pending_days: rows.reduce((a, x) => a + x.pending_days, 0),
    punch_count: Number(punchRow?.n || 0),
    overtime_minutes: rows.reduce((a, x) => a + x.approved_overtime_minutes, 0),
    bank_movement_minutes: rows.reduce((a, x) => a + x.bank_movement_minutes, 0),
    rows
  };
}

function serveHtmlFile(res, filePath) {
  if (!fs.existsSync(filePath)) return json(res, 404, { error: 'Arquivo do módulo não encontrado.' });
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  return fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && u.pathname === '/api/health') {
      return json(res, 200, { ok: true, database: db.getMode(), version: 4 });
    }

    // ==================== AUTH: KLARA RH ====================
    if (req.method === 'GET' && u.pathname === '/api/auth/status') {
      const rhUser = await getRhSessionUser(req);
      if (!rhUser) return json(res, 200, { setupRequired: false, authenticated: false });
      return json(res, 200, {
        setupRequired: false,
        authenticated: true,
        user: {
          id: rhUser.id,
          email: rhUser.email,
          name: rhUser.name,
          role: rhUser.role,
          is_super_admin: rhUser.super_admin,
          can_manage_permissions: rhUser.super_admin
        }
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/auth/login') {
      const p = await readBody(req);
      const email = String(p.email || '').trim().toLowerCase();
      const password = String(p.password || '');
      if (!email || !password) return json(res, 400, { error: 'Informe e-mail e senha.' });

      const user = await db.one('SELECT * FROM usuarios WHERE lower(email)=? AND active=1', email);
      if (!user || !verifySecret(password, user.password_salt, user.password_hash)) {
        return json(res, 401, { error: 'E-mail ou senha incorretos.' });
      }
      const superAdmin = isSuperAdminUser(user);
      const delegated = isDelegatedAdmin(user);
      const perms = await getPermissionsForUser(user);
      if (!superAdmin && !delegated && Number(perms.acesso_rh) !== 1) {
        return json(res, 403, { error: 'Acesso negado: seu usuário não possui permissão administrativa para o Klara RH.' });
      }
      const token = await createSession('rh', { usuarioId: user.id }, 8 * 60 * 60 * 1000);
      setCookieHeader(res, 'klara_rh_session', token, 28800);
      await audit('auth', user.id, 'rh_login', { email: user.email, role: user.role });
      return json(res, 200, {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          is_super_admin: superAdmin,
          can_manage_permissions: superAdmin
        }
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/auth/logout') {
      await deleteSession(req, 'klara_rh_session');
      setCookieHeader(res, 'klara_rh_session', '', 0);
      return json(res, 200, { ok: true });
    }

    // ==================== AUTH & API: PAINEL DO COLABORADOR ====================
    if (req.method === 'GET' && u.pathname === '/api/colaborador/status') {
      const sess = await getColabSession(req);
      if (!sess) return json(res, 200, { authenticated: false });
      return json(res, 200, {
        authenticated: true,
        user: sess.user ? {
          id: sess.user.id,
          email: sess.user.email,
          name: sess.user.name,
          is_super_admin: sess.super_admin,
          role: sess.user.role
        } : {
          id: sess.colab.id,
          email: sess.colab.email || '',
          name: sess.colab.name,
          is_super_admin: false,
          role: 'colaborador'
        }
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/colaborador/login') {
      const p = await readBody(req);
      const rawId = String(p.identifier || p.email || p.cpf || '').trim();
      const password = String(p.password || '');
      if (!rawId || !password) return json(res, 400, { error: 'Informe seu CPF (ou e-mail) e senha.' });

      let matchedUser = null;
      let matchedColab = null;

      if (rawId.includes('@')) {
        const uRow = await db.one('SELECT * FROM usuarios WHERE lower(email)=? AND active=1', rawId.toLowerCase());
        if (uRow && verifySecret(password, uRow.password_salt, uRow.password_hash)) {
          matchedUser = uRow;
          if (uRow.colaborador_id) {
            matchedColab = await db.one('SELECT * FROM colaboradores WHERE id=?', uRow.colaborador_id);
          }
        } else if (uRow && uRow.colaborador_id) {
          const cRow = await db.one('SELECT * FROM colaboradores WHERE id=?', uRow.colaborador_id);
          if (cRow && verifySecret(password, cRow.auth_salt, cRow.auth_hash)) {
            matchedColab = cRow;
          }
        }
      } else {
        const cpf = cleanCPF(rawId);
        if (cpf.length === 11) {
          const cRow = await db.one('SELECT * FROM colaboradores WHERE cpf=?', cpf);
          if (cRow) {
            if (verifySecret(password, cRow.auth_salt, cRow.auth_hash)) {
              matchedColab = cRow;
            } else {
              const linkedUser = await db.one('SELECT * FROM usuarios WHERE colaborador_id=? AND active=1', cRow.id);
              if (linkedUser && verifySecret(password, linkedUser.password_salt, linkedUser.password_hash)) {
                matchedUser = linkedUser;
                matchedColab = cRow;
              }
            }
          }
        }
      }

      if (!matchedUser && !matchedColab) {
        return json(res, 401, { error: 'CPF/e-mail ou senha inválidos.' });
      }
      if (matchedColab && matchedColab.status === 'Inativo') {
        return json(res, 403, { error: 'Cadastro inativo. Procure o RH.' });
      }

      const superAdmin = isSuperAdminUser(matchedUser);
      const delegated = isDelegatedAdmin(matchedUser);
      const perms = matchedUser
        ? await getPermissionsForUser(matchedUser)
        : await getPermissionsForColaborador(matchedColab.id);

      if (!superAdmin && !delegated && Number(perms.acesso_painel_colaborador) !== 1) {
        return json(res, 403, { error: 'Acesso negado ao Painel do Colaborador.' });
      }

      const token = await createSession('colaborador', {
        usuarioId: matchedUser?.id || null,
        colaboradorId: matchedColab?.id || matchedUser?.colaborador_id || null
      }, 12 * 60 * 60 * 1000);
      setCookieHeader(res, 'klara_colab_session', token, 43200);
      await audit('auth', matchedColab?.id || matchedUser?.id, 'colaborador_login', { identifier: rawId });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && u.pathname === '/api/colaborador/logout') {
      await deleteSession(req, 'klara_colab_session');
      setCookieHeader(res, 'klara_colab_session', '', 0);
      return json(res, 200, { ok: true });
    }

    if (u.pathname.startsWith('/api/colaborador/')) {
      const sess = await getColabSession(req);
      if (!sess) return json(res, 401, { error: 'Sessão encerrada. Faça login para continuar.' });

      const isAdminView = sess.super_admin || sess.delegated_admin;
      const requestedColabId = isAdminView && u.searchParams.get('colaborador_id')
        ? u.searchParams.get('colaborador_id')
        : sess.colab?.id || null;

      const targetColab = requestedColabId ? await db.one('SELECT * FROM colaboradores WHERE id=?', requestedColabId) : null;
      const competence = u.searchParams.get('competence') || localNow().date.slice(0, 7);

      if (req.method === 'GET' && u.pathname === '/api/colaborador/me') {
        const pontos = targetColab
          ? await db.all('SELECT * FROM pontos WHERE colaborador_id=? ORDER BY work_date DESC, hora DESC LIMIT 200', targetColab.id)
          : (isAdminView ? await db.all('SELECT p.*, c.name colaborador_name FROM pontos p JOIN colaboradores c ON c.id=p.colaborador_id ORDER BY p.work_date DESC, p.hora DESC LIMIT 200') : []);

        const espelho = targetColab ? await buildMonthEspelho(targetColab, competence) : [];
        const documents = targetColab
          ? await db.all('SELECT id, employee_id, original_name, mime_type, size_bytes, category, created_at FROM documents WHERE employee_id=? ORDER BY created_at DESC', targetColab.id)
          : (isAdminView ? await db.all('SELECT d.id, d.employee_id, c.name employee_name, d.original_name, d.mime_type, d.size_bytes, d.category, d.created_at FROM documents d JOIN colaboradores c ON c.id=d.employee_id ORDER BY d.created_at DESC') : []);
        const chamados = targetColab
          ? await db.all('SELECT * FROM chamados WHERE colaborador_id=? ORDER BY created_at DESC', targetColab.id)
          : (sess.user ? await db.all('SELECT * FROM chamados WHERE usuario_id=? ORDER BY created_at DESC', sess.user.id) : []);

        const colabSanitized = targetColab ? sanitizeColaborador(targetColab) : null;
        if (colabSanitized && !colabSanitized.jornada_descricao && colabSanitized.hora_entrada && colabSanitized.hora_saida) {
          colabSanitized.jornada_descricao = `${colabSanitized.hora_entrada} às ${colabSanitized.hora_saida}`;
        }

        return json(res, 200, {
          user: sess.user ? {
            id: sess.user.id,
            email: sess.user.email,
            name: sess.user.name,
            is_super_admin: sess.super_admin,
            role: sess.user.role
          } : {
            id: targetColab.id,
            email: targetColab.email || '',
            name: targetColab.name,
            is_super_admin: false,
            role: 'colaborador'
          },
          colaborador: colabSanitized,
          pontos,
          espelho,
          competence,
          documents,
          chamados
        });
      }

      if (req.method === 'GET' && u.pathname === '/api/colaborador/pontos') {
        const pontos = targetColab
          ? await db.all('SELECT * FROM pontos WHERE colaborador_id=? ORDER BY work_date DESC, hora DESC LIMIT 200', targetColab.id)
          : (isAdminView ? await db.all('SELECT p.*, c.name colaborador_name FROM pontos p JOIN colaboradores c ON c.id=p.colaborador_id ORDER BY p.work_date DESC, p.hora DESC LIMIT 200') : []);
        const espelho = targetColab ? await buildMonthEspelho(targetColab, competence) : [];
        return json(res, 200, { pontos, espelho, competence });
      }

      if (req.method === 'GET' && u.pathname === '/api/colaborador/chamados') {
        const items = targetColab
          ? await db.all('SELECT * FROM chamados WHERE colaborador_id=? ORDER BY created_at DESC', targetColab.id)
          : (sess.user ? await db.all('SELECT * FROM chamados WHERE usuario_id=? ORDER BY created_at DESC', sess.user.id) : []);
        return json(res, 200, { chamados: items });
      }

      if (req.method === 'POST' && u.pathname === '/api/colaborador/chamados') {
        const p = await readBody(req);
        const subject = String(p.subject || '').trim();
        const description = String(p.description || '').trim();
        const department = String(p.department || 'RH').trim();
        if (!subject || !description) return json(res, 400, { error: 'Preencha o assunto e a descrição.' });
        const cid = id(), t = now();
        await db.run(
          'INSERT INTO chamados(id, colaborador_id, usuario_id, department, subject, description, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
          cid, targetColab?.id || null, sess.user?.id || null, department, subject, description, 'Aberto', t, t
        );
        await audit('chamado', cid, 'created', { colaborador_id: targetColab?.id, subject });
        return json(res, 201, { ok: true, chamado: await db.one('SELECT * FROM chamados WHERE id=?', cid) });
      }

      const colabDoc = req.method === 'GET' && u.pathname.match(/^\/api\/colaborador\/documents\/([^/]+)\/download$/);
      if (colabDoc) {
        const docId = decodeURIComponent(colabDoc[1]);
        const d = await db.one('SELECT * FROM documents WHERE id=?', docId);
        if (!d) return json(res, 404, { error: 'Documento não encontrado.' });
        if (!isAdminView && d.employee_id !== targetColab?.id) {
          return json(res, 403, { error: 'Você não tem permissão para acessar este documento.' });
        }
        res.writeHead(200, {
          'Content-Type': d.mime_type || 'application/octet-stream',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.original_name)}`,
          'X-Content-Type-Options': 'nosniff'
        });
        if (d.data_base64) {
          return res.end(Buffer.from(d.data_base64, 'base64'));
        }
        const f = path.join(FILES_DIR, d.stored_name);
        if (!fs.existsSync(f)) return json(res, 404, { error: 'Arquivo não localizado no armazenamento.' });
        return fs.createReadStream(f).pipe(res);
      }

      return json(res, 404, { error: 'Rota não encontrada.' });
    }

    // ==================== API: KLARA APONTAMENTO (ENTRADA / SAÍDA APENAS) ====================
    const cpfLookup = req.method === 'GET' && u.pathname.match(/^\/api\/colaboradores\/([^/]+)$/);
    if (cpfLookup) {
      const cpf = cleanCPF(decodeURIComponent(cpfLookup[1]));
      if (!validCPF(cpf)) return json(res, 400, { error: 'Confira o CPF informado.' });
      const colab = await db.one('SELECT * FROM colaboradores WHERE cpf=?', cpf);
      if (!colab) return json(res, 404, { error: 'Cadastro não localizado. Procure o RH.' });
      if (colab.status === 'Inativo') return json(res, 403, { error: 'Cadastro inativo. Procure o RH.' });

      const perms = await getPermissionsForColaborador(colab.id);
      if (Number(perms.acesso_apontamento) !== 1) {
        return json(res, 403, { error: 'Acesso ao Apontamento não liberado pelo administrador.' });
      }

      const cfg = await db.one("SELECT * FROM apontamento_config WHERE id='default'");
      const stamp = localNow();
      const workDate = await activeWorkDate(colab.id, stamp.date);
      const todayRows = await punchesFor(colab.id, workDate);
      const seq = ['entrada', 'saida'];
      const nextType = seq.find(x => !todayRows.some(p => p.punch_type === x)) || null;
      const last = todayRows.length ? todayRows[todayRows.length - 1] : null;

      return json(res, 200, {
        ok: true,
        colaborador: sanitizeColaborador(colab, perms),
        config: cfg ? {
          exigir_gps: Boolean(cfg.exigir_gps),
          permitir_sem_local: Boolean(cfg.permitir_sem_local),
          tolerancia_minutos: Number(cfg.tolerancia_minutos || 10),
          mensagem_boas_vindas: cfg.mensagem_boas_vindas || ''
        } : { exigir_gps: false, permitir_sem_local: true, tolerancia_minutos: 10 },
        work_date: workDate,
        pontos_hoje: todayRows,
        proxima_marcacao: nextType ? { type: nextType, label: punchLabel(nextType) } : null,
        ultima_marcacao: last
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/pontos') {
      const p = await readBody(req);
      const cpf = cleanCPF(p.cpf || '');
      let colab = null;
      if (cpf) {
        if (!validCPF(cpf)) return json(res, 400, { error: 'CPF inválido.' });
        colab = await db.one('SELECT * FROM colaboradores WHERE cpf=?', cpf);
      } else if (p.colaborador_id) {
        colab = await db.one('SELECT * FROM colaboradores WHERE id=?', p.colaborador_id);
      }
      if (!colab) return json(res, 404, { error: 'Colaborador não localizado.' });
      if (colab.status === 'Inativo') return json(res, 403, { error: 'Colaborador inativo. Procure o RH.' });

      const perms = await getPermissionsForColaborador(colab.id);
      if (Number(perms.acesso_apontamento) !== 1) {
        return json(res, 403, { error: 'Sem permissão ativa para bater ponto.' });
      }

      const cfg = await db.one("SELECT * FROM apontamento_config WHERE id='default'");
      const lat = p.latitude !== null && p.latitude !== undefined && Number.isFinite(Number(p.latitude)) ? Number(p.latitude) : null;
      const lon = p.longitude !== null && p.longitude !== undefined && Number.isFinite(Number(p.longitude)) ? Number(p.longitude) : null;
      const acc = p.accuracy !== null && p.accuracy !== undefined && Number.isFinite(Number(p.accuracy)) ? Math.round(Number(p.accuracy)) : null;

      if (cfg && Number(cfg.exigir_gps) === 1 && Number(cfg.permitir_sem_local) === 0 && (lat === null || lon === null)) {
        return json(res, 400, { error: 'A configuração de apontamento exige localização GPS ativa para bater ponto.' });
      }

      const site = colab.work_site_id ? await db.one('SELECT * FROM work_sites WHERE id=? AND active=1', colab.work_site_id) : null;
      const stamp = localNow(site?.timezone || 'America/Sao_Paulo');
      const workDate = await activeWorkDate(colab.id, stamp.date);
      const existing = await punchesFor(colab.id, workDate);
      const seq = ['entrada', 'saida'];
      const nextType = seq.find(x => !existing.some(pn => pn.punch_type === x));

      if (!nextType) {
        return json(res, 409, { error: 'Entrada e Saída de hoje já foram registradas.' });
      }

      let locStatus = lat !== null && lon !== null ? 'Localização capturada' : 'Não confirmada';
      let note = p.note || (acc !== null ? `Precisão GPS: ${acc} m` : null);
      if (site && lat !== null && lon !== null) {
        const dist = Math.round(haversine(lat, lon, site.latitude, site.longitude));
        if (dist > Number(site.radius_m || 150)) {
          return json(res, 403, { error: `Você está fora da área autorizada (${dist} m; limite ${site.radius_m} m).` });
        }
        locStatus = 'Dentro do local';
        note = `Distância do local: ${dist} m` + (acc !== null ? `; precisão: ${acc} m` : '');
      }

      const pid = id();
      const protocolo = generateProtocol();
      const label = punchLabel(nextType);
      const t = now();

      await db.run(
        `INSERT INTO pontos(id, colaborador_id, cpf, protocolo, work_date, hora, punch_type, label, punched_at, source, latitude, longitude, accuracy, location_status, note, created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        pid, colab.id, colab.cpf, protocolo, workDate, stamp.time, nextType, label, stamp.stamp,
        p.source || 'apontamento', lat, lon, acc, locStatus, note, t
      );

      await audit('punch', pid, 'apontamento', { colaborador_id: colab.id, protocolo, punch_type: nextType, work_date: workDate, hora: stamp.time });

      const updatedToday = await punchesFor(colab.id, workDate);
      const upcoming = seq.find(x => !updatedToday.some(pn => pn.punch_type === x)) || null;

      return json(res, 201, {
        ok: true,
        ponto: await db.one('SELECT * FROM pontos WHERE id=?', pid),
        pontos_hoje: updatedToday,
        proxima_marcacao: upcoming ? { type: upcoming, label: punchLabel(upcoming) } : null
      });
    }

    // ==================== RH AUTH GUARD ====================
    const publicRhPaths = new Set(['/api/auth/status', '/api/auth/login', '/api/auth/logout', '/api/health', '/api/pontos']);
    if (u.pathname.startsWith('/api/') && !publicRhPaths.has(u.pathname)) {
      const rhUser = await getRhSessionUser(req);
      if (!rhUser) return json(res, 401, { error: 'Sessão encerrada. Entre novamente.' });
      req.rhUser = rhUser;

      // Exclusividade da aba Permissões para os Super Admins principais
      if (u.pathname.startsWith('/api/admin-users') || u.pathname.startsWith('/api/permissoes')) {
        if (!rhUser.super_admin) {
          return json(res, 403, { error: 'Acesso negado: somente o Super Admin principal tem acesso à gestão de Permissões.' });
        }
      }
    }

    // ==================== NOVA ABA PERMISSÕES (SUPER ADMIN ONLY) ====================
    if (req.method === 'GET' && u.pathname === '/api/admin-users') {
      const users = await db.all(
        "SELECT id, email, name, role, is_super_admin, active, created_at, updated_at FROM usuarios WHERE role IN ('super_admin','admin_delegado') ORDER BY is_super_admin DESC, email ASC"
      );
      return json(res, 200, { users });
    }

    if (req.method === 'POST' && u.pathname === '/api/admin-users') {
      const p = await readBody(req);
      const email = String(p.email || '').trim().toLowerCase();
      const password = String(p.password || '');
      const name = String(p.name || '').trim() || email.split('@')[0];
      if (!email || !email.includes('@')) return json(res, 400, { error: 'Informe um e-mail válido.' });
      if (password.length < 6) return json(res, 400, { error: 'A senha deve ter pelo menos 6 caracteres.' });
      if (SUPER_ADMIN_EMAILS.has(email)) return json(res, 409, { error: 'Este e-mail pertence a um Super Admin principal.' });
      if (await db.one('SELECT id FROM usuarios WHERE lower(email)=?', email)) {
        return json(res, 409, { error: 'Já existe um usuário cadastrado com este e-mail.' });
      }

      const uid = id(), t = now();
      const { salt, hash } = hashSecret(password);
      await db.transaction(async tx => {
        await tx.run(
          `INSERT INTO usuarios(id, email, name, password_salt, password_hash, role, is_super_admin, colaborador_id, active, created_at, updated_at)
           VALUES(?,?,?,?,?,'admin_delegado',0,NULL,1,?,?)`,
          uid, email, name, salt, hash, t, t
        );
        await tx.run(
          `INSERT INTO permissoes_modulos(id, usuario_id, colaborador_id, acesso_apontamento, acesso_painel_colaborador, acesso_rh, acesso_permissoes, updated_by, created_at, updated_at)
           VALUES(?,?,NULL,1,1,1,0,?,?,?)`,
          id(), uid, req.rhUser.email, t, t
        );
      });
      await audit('admin_user', uid, 'created', { email, by: req.rhUser.email });
      return json(res, 201, {
        ok: true,
        user: await db.one('SELECT id, email, name, role, is_super_admin, active, created_at FROM usuarios WHERE id=?', uid)
      });
    }

    const delAdmin = req.method === 'DELETE' && u.pathname.match(/^\/api\/admin-users\/([^/]+)$/);
    if (delAdmin) {
      const uid = decodeURIComponent(delAdmin[1]);
      const target = await db.one('SELECT * FROM usuarios WHERE id=?', uid);
      if (!target) return json(res, 404, { error: 'Usuário não encontrado.' });
      if (isSuperAdminUser(target) || SUPER_ADMIN_EMAILS.has(String(target.email || '').toLowerCase())) {
        return json(res, 403, { error: 'Super Administradores principais não podem ser removidos.' });
      }
      await db.run('DELETE FROM usuarios WHERE id=?', uid);
      await audit('admin_user', uid, 'deleted', { email: target.email, by: req.rhUser.email });
      return json(res, 200, { ok: true });
    }

    // ==================== CONFIGURAR APONTAMENTO (CORRIGIDO) ====================
    if (req.method === 'GET' && u.pathname === '/api/apontamento/config') {
      const config = await db.one("SELECT * FROM apontamento_config WHERE id='default'");
      const sites = await db.all('SELECT * FROM work_sites ORDER BY name');
      return json(res, 200, { config, sites });
    }

    if ((req.method === 'POST' || req.method === 'PUT') && u.pathname === '/api/apontamento/config') {
      const p = await readBody(req);
      const t = now();
      const exigirGps = p.exigir_gps ? 1 : 0;
      const permitirSemLocal = p.permitir_sem_local === false ? 0 : 1;
      const tolerancia = Math.max(0, Math.min(120, Number.isFinite(Number(p.tolerancia_minutos)) ? Math.round(Number(p.tolerancia_minutos)) : 10));
      const msg = String(p.mensagem_boas_vindas || 'Informe seu CPF para registrar Entrada ou Saída.').trim();

      await db.run(
        `INSERT INTO apontamento_config(id, exigir_gps, tolerancia_minutos, permitir_sem_local, mensagem_boas_vindas, updated_by, updated_at)
         VALUES('default', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           exigir_gps=excluded.exigir_gps,
           tolerancia_minutos=excluded.tolerancia_minutos,
           permitir_sem_local=excluded.permitir_sem_local,
           mensagem_boas_vindas=excluded.mensagem_boas_vindas,
           updated_by=excluded.updated_by,
           updated_at=excluded.updated_at`,
        exigirGps, tolerancia, permitirSemLocal, msg, req.rhUser.email, t
      );
      await audit('apontamento_config', 'default', 'updated', { by: req.rhUser.email });
      return json(res, 200, { ok: true, config: await db.one("SELECT * FROM apontamento_config WHERE id='default'") });
    }

    if (req.method === 'GET' && u.pathname === '/api/work-sites') {
      return json(res, 200, { sites: await db.all('SELECT * FROM work_sites ORDER BY name') });
    }

    if (req.method === 'POST' && u.pathname === '/api/work-sites') {
      const p = await readBody(req);
      const lat = Number(p.latitude), lon = Number(p.longitude), rad = Number(p.radius_m || 150);
      if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isInteger(rad) || rad < 30 || rad > 5000) {
        return json(res, 400, { error: 'Informe nome, coordenadas válidas e raio entre 30 e 5.000 metros.' });
      }
      const sid = id();
      await db.run('INSERT INTO work_sites VALUES(?,?,?,?,?,?,?,?)', sid, String(p.name).trim(), lat, lon, rad, p.timezone || 'America/Sao_Paulo', 1, now());
      await audit('work_site', sid, 'created', p);
      return json(res, 201, { ok: true, id: sid });
    }

    const delSite = req.method === 'DELETE' && u.pathname.match(/^\/api\/work-sites\/([^/]+)$/);
    if (delSite) {
      const sid = decodeURIComponent(delSite[1]);
      await db.run('UPDATE colaboradores SET work_site_id=NULL WHERE work_site_id=?', sid);
      await db.run('DELETE FROM work_sites WHERE id=?', sid);
      await audit('work_site', sid, 'deleted', { by: req.rhUser.email });
      return json(res, 200, { ok: true });
    }

    // ==================== BACKUP & IMPORT JSON ====================
    if (req.method === 'GET' && u.pathname === '/api/backup') {
      const backup = path.join(DATA_DIR, `backup-klara-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
      await db.checkpointAndCopy(backup);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="${path.basename(backup)}"`,
        'Cache-Control': 'no-store'
      });
      return fs.createReadStream(backup).pipe(res);
    }

    if (req.method === 'POST' && u.pathname === '/api/import-pontorh') {
      const p = await readBody(req);
      const result = await importPontoRhPayload(db, p, req.rhUser.email);
      await audit('import', 'pontorh', 'imported', { ...result, by: req.rhUser.email });
      return json(res, 200, { ok: true, ...result });
    }

    // ==================== RH: COLABORADORES (SEM UNIDADE E SEM GESTOR) ====================
    if (req.method === 'GET' && u.pathname === '/api/state') {
      const rawPeople = await db.all('SELECT * FROM colaboradores ORDER BY name');
      const people = [];
      for (const item of rawPeople) people.push(await enrichEmployee(item));
      const recentPunches = await db.all('SELECT p.*, c.name colaborador_name FROM pontos p JOIN colaboradores c ON c.id=p.colaborador_id ORDER BY p.created_at DESC LIMIT 20');
      return json(res, 200, {
        people,
        counts: {
          total: people.length,
          active: people.filter(x => x.status === 'Ativo').length,
          away: people.filter(x => x.status === 'Afastado').length
        },
        recent_punches: recentPunches
      });
    }

    if (req.method === 'GET' && (u.pathname === '/api/employees' || u.pathname === '/api/colaboradores')) {
      const raw = await db.all('SELECT * FROM colaboradores ORDER BY name');
      const employees = [];
      for (const item of raw) employees.push(await enrichEmployee(item));
      return json(res, 200, { employees });
    }

    if (req.method === 'POST' && (u.pathname === '/api/employees' || u.pathname === '/api/colaboradores')) {
      const p = await readBody(req);
      if (!String(p.name || '').trim()) return json(res, 400, { error: 'Nome completo é obrigatório.' });
      const cpfDigits = cleanCPF(p.cpf || '');
      if (!validCPF(cpfDigits)) return json(res, 400, { error: 'CPF válido é obrigatório para liberar o acesso automático do colaborador.' });
      if (await db.one('SELECT id FROM colaboradores WHERE cpf=?', cpfDigits)) {
        return json(res, 409, { error: 'CPF já cadastrado.' });
      }
      if (p.admission_date && !validDate(p.admission_date)) return json(res, 400, { error: 'Data de admissão inválida.' });
      if (p.hora_entrada) mins(p.hora_entrada);
      if (p.hora_saida) mins(p.hora_saida);

      const eid = id(), t = now();
      const { salt, hash } = hashSecret(cpfDigits);
      const weekly = p.hora_entrada && p.hora_saida
        ? computeWeeklyMinutes(p.hora_entrada, p.hora_saida)
        : Number(p.weekly_minutes || 2640);

      await db.transaction(async tx => {
        await tx.run(
          `INSERT INTO colaboradores(
            id, name, cpf, cnpj, birth_date, marital_status, nationality, birth_place, rg, issuing_authority, issuing_state,
            mother_name, father_name, email, phone, postal_code, address, address_number, address_complement, neighborhood,
            city, state, emergency_contact, emergency_relationship, emergency_phone, registration, role, department,
            contract_type, admission_date, termination_date, status, monthly_salary_cents, ajuda_custo_cents,
            weekly_minutes, jornada_descricao, hora_entrada, hora_saida, work_site_id, auth_salt, auth_hash, created_at, updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          eid, p.name.trim(), cpfDigits, p.cnpj || null, p.birth_date || null, p.marital_status || null,
          String(p.nationality || 'Brasileira').trim() || 'Brasileira', p.birth_place || null, p.rg || null,
          p.issuing_authority || null, p.issuing_state || null, p.mother_name || null, p.father_name || null,
          p.email || null, p.phone || null, p.postal_code || null, p.address || null, p.address_number || null,
          p.address_complement || null, p.neighborhood || null, p.city || null, p.state || null,
          p.emergency_contact || null, p.emergency_relationship || null, p.emergency_phone || null,
          p.registration || null, p.role || null, p.department || null, p.contract_type || null,
          p.admission_date || null, null, p.status || 'Ativo', Number(p.monthly_salary_cents || 0),
          Number(p.ajuda_custo_cents || 0), weekly, p.jornada_descricao || null,
          p.hora_entrada || null, p.hora_saida || null, p.work_site_id || null, salt, hash, t, t
        );

        // Acesso automático ao Apontamento RH e Painel do Colaborador usando CPF (números) como login/senha inicial
        await tx.run(
          `INSERT INTO permissoes_modulos(id, usuario_id, colaborador_id, acesso_apontamento, acesso_painel_colaborador, acesso_rh, acesso_permissoes, updated_by, created_at, updated_at)
           VALUES(?, NULL, ?, 1, 1, 0, 0, ?, ?, ?)`,
          id(), eid, req.rhUser.email, t, t
        );
      });

      await audit('employee', eid, 'created', { name: p.name, by: req.rhUser.email });
      const created = await getColaboradorOrThrow(eid);
      return json(res, 201, { ok: true, employee: await enrichEmployee(created) });
    }

    const em = req.method === 'PUT' && u.pathname.match(/^\/api\/(?:employees|colaboradores)\/([^/]+)$/);
    if (em) {
      const eid = decodeURIComponent(em[1]);
      const old = await getColaboradorOrThrow(eid);
      const p = await readBody(req);
      const fields = [
        'name', 'cpf', 'cnpj', 'birth_date', 'marital_status', 'nationality', 'birth_place', 'rg',
        'issuing_authority', 'issuing_state', 'mother_name', 'father_name', 'email', 'phone',
        'postal_code', 'address', 'address_number', 'address_complement', 'neighborhood', 'city', 'state',
        'emergency_contact', 'emergency_relationship', 'emergency_phone', 'registration', 'role',
        'department', 'contract_type', 'admission_date', 'termination_date', 'status',
        'monthly_salary_cents', 'ajuda_custo_cents', 'weekly_minutes', 'jornada_descricao',
        'hora_entrada', 'hora_saida', 'work_site_id'
      ];
      const next = { ...old };
      for (const k of fields) if (p[k] !== undefined) next[k] = p[k];
      if (!String(next.name || '').trim()) return json(res, 400, { error: 'Nome obrigatório.' });
      if (next.hora_entrada) mins(next.hora_entrada);
      if (next.hora_saida) mins(next.hora_saida);
      if (next.hora_entrada && next.hora_saida) {
        next.weekly_minutes = computeWeeklyMinutes(next.hora_entrada, next.hora_saida);
      }

      if (next.cpf) {
        next.cpf = cleanCPF(next.cpf);
        if (!validCPF(next.cpf)) return json(res, 400, { error: 'CPF inválido.' });
        const dup = await db.one('SELECT id FROM colaboradores WHERE cpf=? AND id<>?', next.cpf, eid);
        if (dup) return json(res, 409, { error: 'CPF já pertence a outro cadastro.' });
      } else {
        return json(res, 400, { error: 'CPF obrigatório.' });
      }

      const placeholders = fields.map(k => `${k}=?`).join(',');
      await db.run(
        `UPDATE colaboradores SET ${placeholders}, updated_at=? WHERE id=?`,
        ...fields.map(k => next[k] ?? null), now(), eid
      );

      if (p.reset_password_to_cpf || next.cpf !== old.cpf) {
        const { salt, hash } = hashSecret(next.cpf);
        await db.run('UPDATE colaboradores SET auth_salt=?, auth_hash=? WHERE id=?', salt, hash, eid);
      }

      await audit('employee', eid, 'updated', { by: req.rhUser.email });
      return json(res, 200, { ok: true, employee: await enrichEmployee(await getColaboradorOrThrow(eid)) });
    }

    const del = req.method === 'DELETE' && u.pathname.match(/^\/api\/(?:employees|colaboradores)\/([^/]+)$/);
    if (del) {
      const eid = decodeURIComponent(del[1]);
      const existing = await getColaboradorOrThrow(eid);
      await db.transaction(async tx => {
        await tx.run('DELETE FROM sessoes WHERE colaborador_id=?', eid);
        await tx.run('DELETE FROM pontos WHERE colaborador_id=?', eid);
        await tx.run('DELETE FROM chamados WHERE colaborador_id=?', eid);
        await tx.run('DELETE FROM adjustments WHERE employee_id=?', eid);
        await tx.run('DELETE FROM overtime WHERE employee_id=?', eid);
        await tx.run('DELETE FROM bank_ledger WHERE employee_id=?', eid);
        await tx.run('DELETE FROM documents WHERE employee_id=?', eid);
        await tx.run('DELETE FROM permissoes_modulos WHERE colaborador_id=?', eid);
        await tx.run('DELETE FROM usuarios WHERE colaborador_id=? AND is_super_admin=0', eid);
        await tx.run('UPDATE usuarios SET colaborador_id=NULL WHERE colaborador_id=? AND is_super_admin=1', eid);
        await tx.run('DELETE FROM colaboradores WHERE id=?', eid);
      });
      await audit('employee', eid, 'deleted', { name: existing.name, cpf: existing.cpf, by: req.rhUser.email });
      return json(res, 200, { ok: true });
    }

    // ==================== PONTOS & ESPELHO (ENTRADA E SAÍDA APENAS) ====================
    if (req.method === 'GET' && u.pathname === '/api/pontos') {
      const empId = u.searchParams.get('colaborador_id');
      const items = empId
        ? await db.all('SELECT p.*, c.name colaborador_name FROM pontos p JOIN colaboradores c ON c.id=p.colaborador_id WHERE p.colaborador_id=? ORDER BY p.work_date DESC, p.hora DESC LIMIT 200', empId)
        : await db.all('SELECT p.*, c.name colaborador_name FROM pontos p JOIN colaboradores c ON c.id=p.colaborador_id ORDER BY p.created_at DESC LIMIT 200');
      return json(res, 200, { pontos: items });
    }

    if (req.method === 'POST' && u.pathname === '/api/punches') {
      const p = await readBody(req);
      const colab = await getColaboradorOrThrow(p.employee_id);
      if (!validDate(p.work_date) || !['entrada', 'saida'].includes(p.punch_type)) {
        return json(res, 400, { error: 'Data ou tipo de marcação inválido (permitido apenas Entrada ou Saída).' });
      }
      const localStamp = p.punched_at ? String(p.punched_at) : `${p.work_date}T${p.time || ''}:00`;
      if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(localStamp)) {
        return json(res, 400, { error: 'Data/hora inválida.' });
      }
      if (await db.one('SELECT id FROM pontos WHERE colaborador_id=? AND work_date=? AND punch_type=?', p.employee_id, p.work_date, p.punch_type)) {
        return json(res, 409, { error: 'Já existe uma marcação deste tipo nesta data. Use o ajuste de ponto.' });
      }
      const pid = id(), protocolo = generateProtocol();
      const hora = localStamp.slice(11, 19).padEnd(8, ':00').slice(0, 8);
      await db.run(
        `INSERT INTO pontos(id, colaborador_id, cpf, protocolo, work_date, hora, punch_type, label, punched_at, source, latitude, longitude, accuracy, location_status, note, created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        pid, p.employee_id, colab.cpf, protocolo, p.work_date, hora, p.punch_type, punchLabel(p.punch_type),
        localStamp, p.source || 'manual', p.latitude ?? null, p.longitude ?? null, null, 'Lançamento manual RH', p.note || null, now()
      );
      await audit('punch', pid, 'created', p);
      return json(res, 201, { ok: true, punch: await db.one('SELECT * FROM pontos WHERE id=?', pid) });
    }

    if (req.method === 'GET' && u.pathname === '/api/timesheet') {
      const emp = u.searchParams.get('employee_id'), c = u.searchParams.get('competence');
      if (!emp || !c) return json(res, 400, { error: 'Informe employee_id e competence.' });
      const colab = await getColaboradorOrThrow(emp);
      const days = await buildMonthEspelho(colab, c);
      const today = localNow().date;
      return json(res, 200, {
        employee: sanitizeColaborador(colab),
        competence: c,
        days,
        totals: {
          worked_minutes: days.filter(x => x.date <= today).reduce((a, x) => a + x.worked_minutes, 0),
          expected_minutes: days.filter(x => x.date <= today).reduce((a, x) => a + x.expected_minutes, 0),
          pending: days.filter(x => x.date <= today && x.expected_minutes > 0 && !x.complete).length
        }
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/adjustments') {
      const p = await readBody(req);
      const colab = await getColaboradorOrThrow(p.employee_id);
      if (!validDate(p.work_date) || !String(p.reason || '').trim()) return json(res, 400, { error: 'Data e justificativa são obrigatórias.' });
      for (const [type, time] of Object.entries(p.punches || {})) {
        if (!['entrada', 'saida'].includes(type)) return json(res, 400, { error: 'Tipo inválido (apenas entrada e saída).' });
        if (time) mins(time);
      }
      const old = await punchesFor(p.employee_id, p.work_date), aid = id();
      await db.transaction(async tx => {
        await tx.run('INSERT INTO adjustments VALUES(?,?,?,?,?,?,?,?)', aid, p.employee_id, p.work_date, JSON.stringify(old), JSON.stringify(p.punches || {}), p.reason, req.rhUser.email, now());
        await tx.run('DELETE FROM pontos WHERE colaborador_id=? AND work_date=?', p.employee_id, p.work_date);
        for (const type of ['entrada', 'saida']) {
          const time = p.punches?.[type];
          if (time) {
            const d = `${p.work_date}T${time}:00`;
            await tx.run(
              `INSERT INTO pontos(id, colaborador_id, cpf, protocolo, work_date, hora, punch_type, label, punched_at, source, latitude, longitude, accuracy, location_status, note, created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              id(), p.employee_id, colab.cpf, generateProtocol(), p.work_date, `${time}:00`, type, punchLabel(type),
              d, 'ajuste', null, null, null, 'Ajuste RH', p.reason, now()
            );
          }
        }
      });
      await audit('attendance', aid, 'adjusted', { employee_id: p.employee_id, work_date: p.work_date, reason: p.reason, by: req.rhUser.email });
      return json(res, 200, { ok: true, day: await calculateDay(colab, p.work_date) });
    }

    // ==================== HORAS EXTRAS, BANCO, FECHAMENTO, DOCUMENTOS ====================
    if (req.method === 'POST' && u.pathname === '/api/overtime') {
      const p = await readBody(req);
      await getColaboradorOrThrow(p.employee_id);
      if (!validDate(p.work_date) || !p.reason) return json(res, 400, { error: 'Data e justificativa obrigatórias.' });
      let a = mins(p.start_time), b = mins(p.end_time);
      if (b < a) b += 1440;
      const oid = id();
      await db.run('INSERT INTO overtime(id,employee_id,work_date,start_time,end_time,minutes,reason,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)', oid, p.employee_id, p.work_date, p.start_time, p.end_time, b - a, p.reason, 'Pendente', now());
      await audit('overtime', oid, 'created', p);
      return json(res, 201, { ok: true, id: oid, minutes: b - a, formatted: fmt(b - a) });
    }

    if (req.method === 'GET' && u.pathname === '/api/overtime') {
      return json(res, 200, { items: await db.all('SELECT o.*, e.name employee_name FROM overtime o JOIN colaboradores e ON e.id=o.employee_id ORDER BY work_date DESC') });
    }

    const ot = req.method === 'POST' && u.pathname.match(/^\/api\/overtime\/([^/]+)\/decision$/);
    if (ot) {
      const oid = decodeURIComponent(ot[1]), p = await readBody(req), item = await db.one('SELECT * FROM overtime WHERE id=?', oid);
      if (!item) return json(res, 404, { error: 'Solicitação não encontrada.' });
      if (!['Aprovada', 'Rejeitada'].includes(p.status)) return json(res, 400, { error: 'Decisão inválida.' });
      if (item.status !== 'Pendente') return json(res, 409, { error: 'Esta solicitação já recebeu uma decisão.' });
      const approved = p.status === 'Aprovada' ? Math.max(0, Math.min(item.minutes, Number(p.approved_minutes ?? item.minutes))) : 0;
      await db.run('UPDATE overtime SET status=?,approved_minutes=?,approved_by=?,approved_at=? WHERE id=?', p.status, approved, req.rhUser.email, now(), oid);
      if (p.status === 'Aprovada' && p.to_bank !== false) {
        await db.run('INSERT INTO bank_ledger VALUES(?,?,?,?,?,?,?,?)', id(), item.employee_id, item.work_date, approved, 'Hora extra aprovada', 'Crédito de hora extra', oid, now());
      }
      await audit('overtime', oid, 'decision', { status: p.status, approved_minutes: approved, by: req.rhUser.email });
      return json(res, 200, { ok: true, approved_minutes: approved });
    }

    if (req.method === 'POST' && u.pathname === '/api/bank') {
      const p = await readBody(req);
      await getColaboradorOrThrow(p.employee_id);
      if (!validDate(p.work_date) || !Number.isInteger(Number(p.minutes)) || !p.description) return json(res, 400, { error: 'Data, minutos e descrição são obrigatórios.' });
      const bid = id();
      await db.run('INSERT INTO bank_ledger VALUES(?,?,?,?,?,?,?,?)', bid, p.employee_id, p.work_date, Number(p.minutes), p.category || 'Ajuste manual', p.description, null, now());
      await audit('bank', bid, 'movement', p);
      return json(res, 201, { ok: true, id: bid });
    }

    if (req.method === 'GET' && u.pathname === '/api/bank') {
      const c = u.searchParams.get('competence');
      let q = 'SELECT e.id employee_id, e.name, COALESCE(SUM(b.minutes),0) balance_minutes FROM colaboradores e LEFT JOIN bank_ledger b ON b.employee_id=e.id';
      let args = [];
      if (c) {
        const [a, z] = competenceRange(c);
        q += ' AND b.work_date BETWEEN ? AND ?';
        args = [a, z];
      }
      q += " WHERE e.status!='Inativo' GROUP BY e.id, e.name ORDER BY e.name";
      const balances = (await db.all(q, ...args)).map(x => ({ ...x, balance_minutes: Number(x.balance_minutes || 0), balance: fmt(Number(x.balance_minutes || 0)) }));
      return json(res, 200, {
        balances,
        ledger: await db.all('SELECT b.*, e.name employee_name FROM bank_ledger b JOIN colaboradores e ON e.id=b.employee_id ORDER BY b.work_date DESC LIMIT 500')
      });
    }

    if (req.method === 'GET' && u.pathname === '/api/closing/preview') {
      const c = u.searchParams.get('competence');
      const s = await monthSummary(c);
      const pCount = await db.one("SELECT COUNT(*) n FROM overtime WHERE work_date BETWEEN ? AND ? AND status='Pendente'", s.from, s.to);
      const pMins = await db.one("SELECT COALESCE(SUM(minutes),0) n FROM overtime WHERE work_date BETWEEN ? AND ? AND status='Pendente'", s.from, s.to);
      const recentPunches = await db.all('SELECT p.*, c.name colaborador_name FROM pontos p JOIN colaboradores c ON c.id=p.colaborador_id ORDER BY p.created_at DESC LIMIT 15');
      const pending = Number(pCount?.n || 0);
      return json(res, 200, {
        ...s,
        pending_overtime: pending,
        pending_overtime_minutes: Number(pMins?.n || 0),
        recent_punches: recentPunches,
        can_close: s.employees > 0 && s.pending_days === 0 && pending === 0 && s.to <= localNow().date
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/closing') {
      const p = await readBody(req), s = await monthSummary(p.competence);
      if (await db.one('SELECT id FROM closings WHERE competence=?', p.competence)) return json(res, 409, { error: 'Esta competência já foi encerrada.' });
      const pCount = await db.one("SELECT COUNT(*) n FROM overtime WHERE work_date BETWEEN ? AND ? AND status='Pendente'", s.from, s.to);
      if (s.to > localNow().date || s.employees === 0 || s.pending_days || Number(pCount?.n || 0) > 0) {
        return json(res, 409, { error: 'Fechamento bloqueado: confira o calendário, marcações incompletas e horas extras pendentes.', summary: s });
      }
      const cid = id();
      await db.run('INSERT INTO closings VALUES(?,?,?,?,?,?)', cid, p.competence, 'Fechado', JSON.stringify(s), now(), null);
      await audit('closing', cid, 'closed', { competence: p.competence, by: req.rhUser.email });
      return json(res, 201, { ok: true, closing_id: cid, snapshot: s });
    }

    if (req.method === 'GET' && u.pathname.match(/^\/api\/closing\/\d{4}-\d{2}$/)) {
      const c = u.pathname.split('/').pop(), row = await db.one('SELECT * FROM closings WHERE competence=?', c);
      if (!row) return json(res, 404, { error: 'Competência ainda não encerrada.' });
      return json(res, 200, { id: row.id, competence: row.competence, status: row.status, closed_at: row.closed_at, snapshot: JSON.parse(row.snapshot) });
    }

    if (req.method === 'GET' && u.pathname === '/api/closings') {
      return json(res, 200, { closings: await db.all('SELECT id,competence,status,closed_at,reopened_at FROM closings ORDER BY competence DESC') });
    }

    if (req.method === 'GET' && u.pathname === '/api/audit') {
      return json(res, 200, { events: await db.all('SELECT * FROM audit ORDER BY created_at DESC LIMIT 500') });
    }

    if (req.method === 'GET' && u.pathname === '/api/documents') {
      const eid = u.searchParams.get('employee_id');
      return json(res, 200, {
        documents: eid
          ? await db.all('SELECT id,employee_id,original_name,mime_type,size_bytes,category,created_at FROM documents WHERE employee_id=? ORDER BY created_at DESC', eid)
          : await db.all('SELECT d.id,d.employee_id,e.name employee_name,d.original_name,d.mime_type,d.size_bytes,d.category,d.created_at FROM documents d JOIN colaboradores e ON e.id=d.employee_id ORDER BY d.created_at DESC')
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/documents') {
      const p = await readBody(req, 12 * 1024 * 1024);
      await getColaboradorOrThrow(p.employee_id);
      if (!p.original_name || !p.data_base64) return json(res, 400, { error: 'Arquivo e nome são obrigatórios.' });
      const data = Buffer.from(p.data_base64, 'base64');
      if (!data.length || data.length > 8 * 1024 * 1024) return json(res, 400, { error: 'Arquivo vazio ou maior que 8 MB.' });
      const did = id(), stored = did + path.extname(path.basename(p.original_name)).slice(0, 12);
      try { fs.writeFileSync(path.join(FILES_DIR, stored), data, { flag: 'wx', mode: 0o600 }); } catch {}
      await db.run(
        'INSERT INTO documents(id, employee_id, original_name, stored_name, mime_type, size_bytes, category, data_base64, created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        did, p.employee_id, path.basename(p.original_name), stored, p.mime_type || 'application/octet-stream', data.length, p.category || 'Geral', p.data_base64, now()
      );
      await audit('document', did, 'uploaded', { employee_id: p.employee_id, original_name: p.original_name, size_bytes: data.length });
      return json(res, 201, { ok: true, id: did });
    }

    const doc = req.method === 'GET' && u.pathname.match(/^\/api\/documents\/([^/]+)\/download$/);
    if (doc) {
      const d = await db.one('SELECT * FROM documents WHERE id=?', decodeURIComponent(doc[1]));
      if (!d) return json(res, 404, { error: 'Documento não encontrado.' });
      if (d.data_base64) {
        res.writeHead(200, {
          'Content-Type': d.mime_type || 'application/octet-stream',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.original_name)}`,
          'X-Content-Type-Options': 'nosniff'
        });
        return res.end(Buffer.from(d.data_base64, 'base64'));
      }
      const f = path.join(FILES_DIR, d.stored_name);
      if (!fs.existsSync(f)) return json(res, 404, { error: 'Arquivo não localizado no armazenamento.' });
      res.writeHead(200, {
        'Content-Type': d.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.original_name)}`,
        'X-Content-Type-Options': 'nosniff'
      });
      return fs.createReadStream(f).pipe(res);
    }

    if (u.pathname.startsWith('/api/')) return json(res, 404, { error: 'Rota não encontrada.' });

    // ==================== PWA MANIFESTS, SERVICE WORKER & ASSETS ====================
    if (req.method === 'GET' && (u.pathname === '/sw.js' || u.pathname === '/rh/sw.js' || u.pathname === '/apontamento/sw.js' || u.pathname === '/colaborador/sw.js')) {
      const swPath = path.join(ASSETS_DIR, 'sw.js');
      if (!fs.existsSync(swPath)) return json(res, 404, { error: 'Service Worker não encontrado.' });
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      return fs.createReadStream(swPath).pipe(res);
    }

    if (req.method === 'GET' && u.pathname === '/rh/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify(PWA_MANIFESTS.rh, null, 2));
    }
    if (req.method === 'GET' && u.pathname === '/apontamento/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify(PWA_MANIFESTS.apontamento, null, 2));
    }
    if (req.method === 'GET' && (u.pathname === '/colaborador/manifest.json' || u.pathname === '/painel/manifest.json')) {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify(PWA_MANIFESTS.colaborador, null, 2));
    }

    if (req.method === 'GET' && u.pathname.startsWith('/assets/')) {
      const rel = u.pathname.slice('/assets/'.length).replace(/^\/+/, '');
      const resolved = path.resolve(ASSETS_DIR, rel);
      if (!resolved.startsWith(ASSETS_DIR) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        return json(res, 404, { error: 'Asset não encontrado.' });
      }
      const ext = path.extname(resolved).toLowerCase();
      const mimeMap = {
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8'
      };
      res.writeHead(200, {
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff'
      });
      return fs.createReadStream(resolved).pipe(res);
    }

    // ==================== MODULE HTML ROUTING ====================
    if (u.pathname === '/' || u.pathname === '/rh' || u.pathname === '/rh/' || u.pathname === '/pessoas' || u.pathname === '/pessoas/' || u.pathname === '/index.html') {
      return serveHtmlFile(res, RH_HTML);
    }
    if (u.pathname === '/apontamento' || u.pathname === '/apontamento/' || u.pathname === '/apontamento/index.html') {
      return serveHtmlFile(res, APONTAMENTO_HTML);
    }
    if (u.pathname === '/colaborador' || u.pathname === '/colaborador/' || u.pathname === '/colaborador/index.html' || u.pathname === '/painel' || u.pathname === '/painel/') {
      return serveHtmlFile(res, COLABORADOR_HTML);
    }

    return json(res, 404, { error: 'Página não encontrada.' });
  } catch (e) {
    console.error(e);
    json(res, e.status || 500, { error: e.message || 'Erro interno.' });
  }
});

async function start() {
  const info = await db.init();
  await seedAll(db);
  const PORT = Number(process.env.PORT || 8787);
  const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  server.listen(PORT, HOST, () => {
    console.log(`Ecossistema Klara pronto (${info.mode}: ${info.file}) em http://${HOST}:${PORT}`);
    console.log(`- Klara RH:          http://127.0.0.1:${PORT}/rh`);
    console.log(`- Klara Apontamento: http://127.0.0.1:${PORT}/apontamento`);
    console.log(`- Klara Colaborador: http://127.0.0.1:${PORT}/colaborador`);
  });
}

start().catch(err => {
  console.error('Falha ao iniciar servidor Klara:', err);
  process.exit(1);
});

process.on('SIGINT', async () => { await db.close(); process.exit(0); });
process.on('SIGTERM', async () => { await db.close(); process.exit(0); });
