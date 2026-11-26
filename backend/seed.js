'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SUPER_ADMIN_SEEDS = [
  { email: 'dandarafalcao773@gmail.com', name: 'Dandara Falcão' },
  { email: 'sacalao660@gmail.com', name: 'Administrador Master' }
];

const SUPER_ADMIN_EMAILS = new Set(SUPER_ADMIN_SEEDS.map(x => x.email.toLowerCase()));

const INITIAL_EMPLOYEES = [
  {
    name: 'Alessandro da Silva Brito',
    cpf: '10051971720',
    rg: '24.819.102-4',
    email: null,
    phone: '21964966274',
    birth_date: '1995-05-10',
    marital_status: 'Casado(a)',
    nationality: 'Brasileira',
    birth_place: 'Rio de Janeiro',
    mother_name: null,
    father_name: null,
    postal_code: '21351-246',
    address: 'Estrada Portela, 460 - Fundos',
    address_number: '460',
    address_complement: 'Fundos',
    neighborhood: 'Turiaçu',
    city: 'Rio de Janeiro',
    state: 'RJ',
    emergency_contact: 'Cíntia',
    emergency_relationship: 'Esposa',
    emergency_phone: '21964807723',
    role: 'Comprador',
    department: 'Administrativo',
    contract_type: 'MEI',
    cnpj: null,
    admission_date: '2026-06-18',
    monthly_salary_cents: 300000,
    ajuda_custo_cents: 0,
    jornada_descricao: '44h semanais (Seg a Sex)',
    hora_entrada: '06:30',
    hora_saida: '16:18'
  },
  {
    name: 'Dandara Claudiane de Araujo Falcão',
    cpf: '15794100737',
    rg: '28.582.300-1',
    email: 'dandarafalcao773@gmail.com',
    phone: '21980618738',
    birth_date: '1989-11-27',
    marital_status: 'Solteiro(a)',
    nationality: 'Brasileira',
    birth_place: 'Rio de Janeiro',
    mother_name: null,
    father_name: null,
    postal_code: '21070-140',
    address: 'Rua José Maria, 232 - Casa',
    address_number: '232',
    address_complement: 'Casa',
    neighborhood: 'Penha',
    city: 'Rio de Janeiro',
    state: 'RJ',
    emergency_contact: 'Felipe',
    emergency_relationship: 'Esposo',
    emergency_phone: '21977046445',
    role: 'Auxiliar Financeiro',
    department: 'Financeiro / RH',
    contract_type: 'MEI',
    cnpj: '70.058.766/0001-02',
    admission_date: '2026-11-16',
    monthly_salary_cents: 180000,
    ajuda_custo_cents: 21000,
    jornada_descricao: '44h semanais (Seg a Sex)',
    hora_entrada: '07:30',
    hora_saida: '17:18'
  },
  {
    name: 'Davi Moraes Vieira da Silva',
    cpf: '06673657707',
    rg: '0663657707',
    email: 'davim4600@gmail.com',
    phone: '21966773407',
    birth_date: '2007-01-06',
    marital_status: 'Solteiro(a)',
    nationality: 'Brasileira',
    birth_place: 'Rio de Janeiro',
    mother_name: 'Lucia',
    father_name: null,
    postal_code: '25045-320',
    address: 'Rua Maria Andrade, 30',
    address_number: '30',
    address_complement: null,
    neighborhood: 'Jardim Vila Nova',
    city: 'Duque de Caxias',
    state: 'RJ',
    emergency_contact: 'Lucia',
    emergency_relationship: 'Mãe',
    emergency_phone: '21978843686',
    role: 'Ajudante',
    department: 'Operações / Logística',
    contract_type: 'MEI',
    cnpj: null,
    admission_date: '2026-01-17',
    monthly_salary_cents: 162100,
    ajuda_custo_cents: 0,
    jornada_descricao: '44h semanais (Seg a Sex)',
    hora_entrada: '06:30',
    hora_saida: '16:18'
  },
  {
    name: 'João Carlos Carvalho Motta',
    cpf: '71932895787',
    rg: '061164190',
    email: null,
    phone: '21993335997',
    birth_date: '1962-03-08',
    marital_status: 'Solteiro(a)',
    nationality: 'Brasileira',
    birth_place: 'Rio de Janeiro',
    mother_name: null,
    father_name: null,
    postal_code: '21210-024',
    address: 'Av. Vicente de Carvalho, 1086 - Rua F Bloco D apt 402',
    address_number: '1086',
    address_complement: 'Rua F Bloco D apt 402',
    neighborhood: 'Vila Kosmos',
    city: 'Rio de Janeiro',
    state: 'RJ',
    emergency_contact: 'Andreia e Gloria',
    emergency_relationship: 'Irmãs',
    emergency_phone: '21991282714',
    role: 'Torneiro Mecânico',
    department: 'Operações / Logística',
    contract_type: 'MEI',
    cnpj: null,
    admission_date: '2026-06-01',
    monthly_salary_cents: 320000,
    ajuda_custo_cents: 0,
    jornada_descricao: '44h semanais (Seg a Sex)',
    hora_entrada: '06:30',
    hora_saida: '16:18'
  },
  {
    name: 'Jose Carlos Moraes Vieira da Silva',
    cpf: '13013863757',
    rg: '239817505',
    email: null,
    phone: '21987440371',
    birth_date: '1990-01-21',
    marital_status: 'Divorciado(a)',
    nationality: 'Brasileira',
    birth_place: 'Rio de Janeiro',
    mother_name: null,
    father_name: null,
    postal_code: '25045-320',
    address: 'Rua Maria Andrade, 30 - Casa',
    address_number: '30',
    address_complement: 'Casa',
    neighborhood: 'Jardim Vila Nova',
    city: 'Rio de Janeiro',
    state: 'RJ',
    emergency_contact: 'Renata',
    emergency_relationship: 'Esposa',
    emergency_phone: '2198565565',
    role: 'Técnico de Mecânica',
    department: 'Operações / Logística',
    contract_type: 'MEI',
    cnpj: null,
    admission_date: '2025-10-10',
    monthly_salary_cents: 340000,
    ajuda_custo_cents: 0,
    jornada_descricao: '44h semanais (Seg a Sex)',
    hora_entrada: '06:30',
    hora_saida: '16:18'
  },
  {
    name: 'Lorran Gonçalves de Andrade',
    cpf: '16949583702',
    rg: '297996829',
    email: null,
    phone: '21987583877',
    birth_date: '1999-02-12',
    marital_status: 'Solteiro(a)',
    nationality: 'Brasileira',
    birth_place: 'Rio de Janeiro',
    mother_name: 'Conceição',
    father_name: null,
    postal_code: '25235-475',
    address: 'Estrada do Amapá, 458',
    address_number: '458',
    address_complement: null,
    neighborhood: 'Amapá',
    city: 'Rio de Janeiro',
    state: 'RJ',
    emergency_contact: 'Conceição',
    emergency_relationship: 'Mãe',
    emergency_phone: '21971763080',
    role: 'Ajudante',
    department: 'Comercial',
    contract_type: 'MEI',
    cnpj: null,
    admission_date: '2026-09-02',
    monthly_salary_cents: 300000,
    ajuda_custo_cents: 25000,
    jornada_descricao: '44h semanais (Seg a Sex)',
    hora_entrada: '06:30',
    hora_saida: '16:18'
  },
  {
    name: 'Miguel Cardoso Rigolan',
    cpf: '10159357705',
    rg: '127014744',
    email: null,
    phone: '21965475473',
    birth_date: '1983-06-13',
    marital_status: 'Solteiro(a)',
    nationality: 'Brasileira',
    birth_place: 'São João de Meriti',
    mother_name: null,
    father_name: null,
    postal_code: '26183-640',
    address: 'Rua Pres. Bernardes, 10',
    address_number: '10',
    address_complement: null,
    neighborhood: 'Belford Roxo',
    city: 'Belford Roxo',
    state: 'RJ',
    emergency_contact: 'Gabrielle',
    emergency_relationship: 'Esposa',
    emergency_phone: '21985840226',
    role: 'Fresador',
    department: 'Logística / Operação',
    contract_type: 'MEI',
    cnpj: null,
    admission_date: '2026-06-24',
    monthly_salary_cents: 340000,
    ajuda_custo_cents: 0,
    jornada_descricao: '44h semanais (Seg a Sex)',
    hora_entrada: '06:30',
    hora_saida: '16:18'
  },
  {
    name: 'Sergio Trajado da silva',
    cpf: '74040464753',
    rg: null,
    email: null,
    phone: '21980273662',
    birth_date: '1960-03-06',
    marital_status: 'Casado(a)',
    nationality: 'Brasileira',
    birth_place: 'Fortaleza/CE',
    mother_name: null,
    father_name: null,
    postal_code: '22763-007',
    address: 'Rua Quintanilha, 246',
    address_number: '246',
    address_complement: null,
    neighborhood: 'Freguesia',
    city: 'Rio de Janeiro',
    state: 'RJ',
    emergency_contact: 'Cassio',
    emergency_relationship: 'Filho',
    emergency_phone: '21980408300',
    role: 'Torneiro Mecânico',
    department: 'Operação/Logística',
    contract_type: 'MEI',
    cnpj: null,
    admission_date: '2026-04-01',
    monthly_salary_cents: 340000,
    ajuda_custo_cents: 0,
    jornada_descricao: '44h semanais (Seg a Sex)',
    hora_entrada: '06:30',
    hora_saida: '16:18'
  }
];

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 64).toString('hex');
  return { salt, hash };
}

function cleanCPF(v) {
  return String(v || '').replace(/\D/g, '');
}

function computeWeeklyMinutes(entrada, saida) {
  if (!entrada || !saida) return 2640;
  const [eh, em] = entrada.split(':').map(Number);
  const [sh, sm] = saida.split(':').map(Number);
  let diff = (sh * 60 + sm) - (eh * 60 + em);
  if (diff < 0) diff += 1440;
  return diff * 5;
}

async function seedAll(db) {
  const t = new Date().toISOString();

  // 1. Seed Super Admins
  for (const seed of SUPER_ADMIN_SEEDS) {
    const email = seed.email.toLowerCase();
    let user = await db.one('SELECT * FROM usuarios WHERE lower(email)=?', email);
    if (!user) {
      const uid = crypto.randomUUID();
      const { salt, hash } = hashSecret('AdminAdmin');
      await db.run(
        `INSERT INTO usuarios(id, email, name, password_salt, password_hash, role, is_super_admin, colaborador_id, active, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, 'super_admin', 1, NULL, 1, ?, ?)`,
        uid, email, seed.name, salt, hash, t, t
      );
      user = await db.one('SELECT * FROM usuarios WHERE id=?', uid);
    } else if (Number(user.is_super_admin) !== 1 || user.role !== 'super_admin' || Number(user.active) !== 1) {
      await db.run("UPDATE usuarios SET role='super_admin', is_super_admin=1, active=1, updated_at=? WHERE id=?", t, user.id);
    }

    const perm = await db.one('SELECT * FROM permissoes_modulos WHERE usuario_id=?', user.id);
    if (!perm) {
      await db.run(
        `INSERT INTO permissoes_modulos(id, usuario_id, colaborador_id, acesso_apontamento, acesso_painel_colaborador, acesso_rh, acesso_permissoes, updated_by, created_at, updated_at)
         VALUES(?, ?, NULL, 1, 1, 1, 1, 'system-seed', ?, ?)`,
        crypto.randomUUID(), user.id, t, t
      );
    }
  }

  // 2. Seed default Apontamento Config
  const cfg = await db.one("SELECT * FROM apontamento_config WHERE id='default'");
  if (!cfg) {
    await db.run(
      `INSERT INTO apontamento_config(id, exigir_gps, tolerancia_minutos, permitir_sem_local, mensagem_boas_vindas, updated_by, updated_at)
       VALUES('default', 0, 10, 1, 'Informe seu CPF para registrar Entrada ou Saída.', 'system-seed', ?)`,
      t
    );
  }

  // 3. Seed 8 Initial Employees with full data
  for (const emp of INITIAL_EMPLOYEES) {
    const cpf = cleanCPF(emp.cpf);
    let colab = await db.one('SELECT * FROM colaboradores WHERE cpf=?', cpf);
    if (!colab) {
      const cid = crypto.randomUUID();
      const { salt, hash } = hashSecret(cpf);
      const weekly = computeWeeklyMinutes(emp.hora_entrada, emp.hora_saida);
      await db.run(
        `INSERT INTO colaboradores(
          id, name, cpf, cnpj, birth_date, marital_status, nationality, birth_place,
          rg, mother_name, father_name,
          email, phone,
          postal_code, address, address_number, address_complement, neighborhood, city, state,
          emergency_contact, emergency_relationship, emergency_phone,
          role, department, contract_type,
          admission_date, status, monthly_salary_cents, ajuda_custo_cents, weekly_minutes,
          jornada_descricao, hora_entrada, hora_saida, auth_salt, auth_hash, created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        cid, emp.name, cpf, emp.cnpj || null,
        emp.birth_date || null, emp.marital_status || null, 'Brasileira', emp.birth_place || null,
        emp.rg || null, emp.mother_name || null, emp.father_name || null,
        emp.email || null, emp.phone || null,
        emp.postal_code || null, emp.address || null, emp.address_number || null,
        emp.address_complement || null, emp.neighborhood || null, emp.city || null, emp.state || null,
        emp.emergency_contact || null, emp.emergency_relationship || null, emp.emergency_phone || null,
        emp.role, emp.department, emp.contract_type, emp.admission_date, 'Ativo',
        emp.monthly_salary_cents, emp.ajuda_custo_cents || 0, weekly,
        emp.jornada_descricao, emp.hora_entrada, emp.hora_saida, salt, hash, t, t
      );
      colab = await db.one('SELECT * FROM colaboradores WHERE id=?', cid);
    } else {
      // Update existing record with full data if fields are missing
      await db.run(
        `UPDATE colaboradores SET
          birth_date=COALESCE(birth_date,?), marital_status=COALESCE(marital_status,?),
          nationality=COALESCE(nationality,'Brasileira'), birth_place=COALESCE(birth_place,?),
          rg=COALESCE(rg,?), email=COALESCE(email,?), phone=COALESCE(phone,?),
          postal_code=COALESCE(postal_code,?), address=COALESCE(address,?),
          address_number=COALESCE(address_number,?), neighborhood=COALESCE(neighborhood,?),
          city=COALESCE(city,?), state=COALESCE(state,?),
          emergency_contact=COALESCE(emergency_contact,?), emergency_relationship=COALESCE(emergency_relationship,?),
          emergency_phone=COALESCE(emergency_phone,?),
          cnpj=COALESCE(cnpj,?), updated_at=?
        WHERE id=?`,
        emp.birth_date||null, emp.marital_status||null, emp.birth_place||null,
        emp.rg||null, emp.email||null, emp.phone||null,
        emp.postal_code||null, emp.address||null, emp.address_number||null,
        emp.neighborhood||null, emp.city||null, emp.state||null,
        emp.emergency_contact||null, emp.emergency_relationship||null, emp.emergency_phone||null,
        emp.cnpj||null, t, colab.id
      );
    }

    const perm = await db.one('SELECT * FROM permissoes_modulos WHERE colaborador_id=?', colab.id);
    if (!perm) {
      await db.run(
        `INSERT INTO permissoes_modulos(id, usuario_id, colaborador_id, acesso_apontamento, acesso_painel_colaborador, acesso_rh, acesso_permissoes, updated_by, created_at, updated_at)
         VALUES(?, NULL, ?, 1, 1, 0, 0, 'system-seed', ?, ?)`,
        crypto.randomUUID(), colab.id, t, t
      );
    } else {
      // Garantir acesso ao apontamento e painel
      await db.run(
        'UPDATE permissoes_modulos SET acesso_apontamento=1, acesso_painel_colaborador=1, updated_at=? WHERE colaborador_id=?',
        t, colab.id
      );
    }

    // Link super admin user to colaborador
    if (emp.email && SUPER_ADMIN_EMAILS.has(emp.email.toLowerCase())) {
      await db.run('UPDATE usuarios SET colaborador_id=COALESCE(colaborador_id, ?) WHERE lower(email)=?', colab.id, emp.email.toLowerCase());
    }
  }

  // 4. Auto-import PontoRH-RH-C70AKS-2026-11.json if present in project root
  const jsonPath = path.resolve(__dirname, '..', 'PontoRH-RH-C70AKS-2026-11.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      await importPontoRhPayload(db, payload, 'system-auto-import');
    } catch (e) {
      console.warn('Aviso ao importar PontoRH-RH-C70AKS-2026-11.json:', e.message);
    }
  }
}

/**
 * Imports punches from a PontoRH JSON export, converting the first punch of each day
 * to `entrada` and the last valid punch of the day to `saida` (ignoring lunch breaks).
 */
async function importPontoRhPayload(db, payload, actor = 'import') {
  const t = new Date().toISOString();
  const records = Array.isArray(payload)
    ? payload
    : (payload.punches || payload.pontos || payload.records || payload.registros || payload.marcacoes || []);

  const empList = Array.isArray(payload?.employees || payload?.colaboradores) ? (payload.employees || payload.colaboradores) : [];
  const flatPunches = [...records];
  for (const e of empList) {
    const eCpf = cleanCPF(e.cpf || e.documento || '');
    const eName = e.name || e.nome || '';
    const list = e.punches || e.pontos || e.records || e.registros || [];
    for (const r of list) {
      flatPunches.push({ ...r, cpf: r.cpf || eCpf, name: r.name || r.nome || eName });
    }
  }

  const grouped = new Map();
  for (const item of flatPunches) {
    const cpf = cleanCPF(item.cpf || item.employeeCpf || item.colaboradorCpf || '');
    const name = String(item.name || item.nome || item.employeeName || item.colaboradorNome || '').trim();
    const rawDate = String(item.work_date || item.date || item.data || item.day || (item.punched_at || item.timestamp || '').slice(0, 10)).slice(0, 10);
    const rawTime = String(item.hora || item.time || item.horario || (item.punched_at || item.timestamp || '').slice(11, 19)).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || !/^\d{2}:\d{2}(:\d{2})?$/.test(rawTime)) continue;
    const normTime = rawTime.length === 5 ? `${rawTime}:00` : rawTime;

    let colab = null;
    if (cpf) colab = await db.one('SELECT * FROM colaboradores WHERE cpf=?', cpf);
    if (!colab && name) colab = await db.one('SELECT * FROM colaboradores WHERE lower(name)=?', name.toLowerCase());
    if (!colab) continue;

    const key = `${colab.id}|${rawDate}`;
    if (!grouped.has(key)) grouped.set(key, { colab, date: rawDate, times: [] });
    grouped.get(key).times.push(normTime);
  }

  let imported = 0;
  for (const { colab, date, times } of grouped.values()) {
    const sorted = [...new Set(times)].sort();
    if (!sorted.length) continue;

    const firstTime = sorted[0];
    const lastTime = sorted.length > 1 ? sorted[sorted.length - 1] : null;

    const existingEntrada = await db.one("SELECT id FROM pontos WHERE colaborador_id=? AND work_date=? AND punch_type='entrada'", colab.id, date);
    if (!existingEntrada) {
      await db.run(
        `INSERT INTO pontos(id, colaborador_id, cpf, protocolo, work_date, hora, punch_type, label, punched_at, source, location_status, note, created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        crypto.randomUUID(), colab.id, colab.cpf,
        `KLA-IMP-${date.replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        date, firstTime, 'entrada', 'Entrada', `${date}T${firstTime}`, 'import-json', 'Importado PontoRH', `Importado por ${actor}`, t
      );
      imported++;
    }

    if (lastTime && lastTime !== firstTime) {
      const existingSaida = await db.one("SELECT id FROM pontos WHERE colaborador_id=? AND work_date=? AND punch_type='saida'", colab.id, date);
      if (!existingSaida) {
        await db.run(
          `INSERT INTO pontos(id, colaborador_id, cpf, protocolo, work_date, hora, punch_type, label, punched_at, source, location_status, note, created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          crypto.randomUUID(), colab.id, colab.cpf,
          `KLA-IMP-${date.replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
          date, lastTime, 'saida', 'Saída', `${date}T${lastTime}`, 'import-json', 'Importado PontoRH', `Importado por ${actor}`, t
        );
        imported++;
      }
    }
  }
  return { imported };
}

module.exports = {
  SUPER_ADMIN_SEEDS,
  SUPER_ADMIN_EMAILS,
  INITIAL_EMPLOYEES,
  seedAll,
  importPontoRhPayload,
  hashSecret,
  cleanCPF,
  computeWeeklyMinutes
};
