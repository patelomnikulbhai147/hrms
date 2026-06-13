/**
 * ============================================================================
 *  RESTORE (with ID remap):  corehrms_backup.sql (PostgreSQL pg_dump, STRING
 *  primary keys)  ->  current MySQL schema (Int auto-increment primary keys).
 * ============================================================================
 *
 *  The legacy dump uses string PKs (e.g. "c-gcri"); the live schema uses Int
 *  auto-increment. This importer inserts parent-before-child, lets the database
 *  assign each new integer id, records old-string-id -> new-int-id per model,
 *  and rewrites every foreign key to the new id. Foreign keys are discovered
 *  automatically from the Prisma schema (DMMF), so no hard-coded FK lists.
 *  Writes via Prisma -> table-name casing is correct on case-sensitive MySQL.
 *
 *  USAGE:  node scripts/restoreBackupRemap.js --wipe [--file=PATH]
 * ============================================================================
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const prisma = require('../src/config/prisma');

const WIPE = process.argv.includes('--wipe');
const fileArg = process.argv.find((a) => a.startsWith('--file='));
const DUMP_FILE = fileArg ? fileArg.slice('--file='.length)
  : path.resolve(__dirname, '../../corehrms_backup.sql');

// Parent-before-child insert order.
const ORDER = ['SubscriptionPlan', 'Company', 'Branch', 'User', 'Employee', 'Shift',
  'Attendance', 'LeaveRequest', 'Overtime', 'Payroll', 'BranchPayroll', 'CompanyPayroll',
  'PaymentRecord', 'Document', 'Notification', 'AuditLog', 'LoginAudit', 'PasswordResetToken'];

const accessor = (m) => m.charAt(0).toLowerCase() + m.slice(1);
const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// Field types, scalar set, FK map (scalarField -> targetModel) and required set,
// all derived from the live schema.
const FIELD_TYPE = {}, SCALAR = {}, FK = {}, REQUIRED = {};
for (const m of Prisma.dmmf.datamodel.models) {
  FIELD_TYPE[m.name] = {}; SCALAR[m.name] = new Set(); FK[m.name] = {}; REQUIRED[m.name] = new Set();
  for (const f of m.fields) {
    if (f.kind === 'object') {
      if (f.relationFromFields && f.relationFromFields.length === 1) FK[m.name][f.relationFromFields[0]] = f.type;
      continue;
    }
    SCALAR[m.name].add(f.name);
    FIELD_TYPE[m.name][f.name] = f.type;
    if (f.isRequired && !f.hasDefaultValue && !f.isId && !f.isUpdatedAt) REQUIRED[m.name].add(f.name);
  }
}

const ARRAY_JSON = { User: new Set(['accessibleCompanyIds']), Company: new Set(['customDepartments']), Attendance: new Set(['flags']) };

function unescapeCopy(s) { let o = ''; for (let i = 0; i < s.length; i++) { if (s[i] === '\\' && i + 1 < s.length) { const n = s[++i]; o += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n; } else o += s[i]; } return o; }
function parsePgArray(lit) { if (lit == null) return []; const s = lit.trim(); if (s === '{}' || s === '' || s[0] !== '{') return []; const b = s.slice(1, -1); const out = []; let i = 0; while (i < b.length) { let v = ''; if (b[i] === '"') { i++; while (i < b.length && b[i] !== '"') { if (b[i] === '\\') { v += b[++i]; i++; } else v += b[i++]; } i++; } else { while (i < b.length && b[i] !== ',') v += b[i++]; if (v === 'NULL') v = null; } out.push(v); if (b[i] === ',') i++; } return out; }

function coerceScalar(model, field, raw) {
  if (raw == null) return null;
  if (ARRAY_JSON[model] && ARRAY_JSON[model].has(field)) return parsePgArray(raw);
  switch (FIELD_TYPE[model][field]) {
    case 'Int': { const n = parseInt(raw, 10); return Number.isNaN(n) ? null : n; }
    case 'Float': { const n = parseFloat(raw); return Number.isNaN(n) ? null : n; }
    case 'Boolean': return raw === 't' || raw === 'true' || raw === '1';
    case 'DateTime': { const d = new Date(raw.replace(' ', 'T') + (/[zZ+]/.test(raw) ? '' : 'Z')); return isNaN(d) ? new Date(raw) : d; }
    case 'Json': { try { return JSON.parse(raw); } catch { return raw; } }
    default: return raw;
  }
}

function extractRows(dump, model) {
  const lines = dump.split('\n');
  const re = new RegExp('^COPY public\\."' + model + '" \\(([^)]*)\\) FROM stdin;\\s*$');
  let h = -1, cm = null;
  for (let i = 0; i < lines.length; i++) { const m = re.exec(lines[i].replace(/\r$/, '')); if (m) { h = i; cm = m[1]; break; } }
  if (h === -1) return null;
  const cols = cm.split(',').map((c) => snakeToCamel(c.trim().replace(/(^"|"$)/g, '')));
  const rows = [];
  for (let i = h + 1; i < lines.length; i++) {
    const ln = lines[i].replace(/\r$/, '');
    if (ln === '\\.') break;
    if (ln === '') continue;
    const fl = ln.split('\t');
    const o = {};
    for (let j = 0; j < cols.length; j++) { const r = fl[j]; o[cols[j]] = (r === undefined || r === '\\N') ? null : unescapeCopy(r); }
    rows.push(o);
  }
  return rows;
}

(async () => {
  if (!fs.existsSync(DUMP_FILE)) { console.error('Dump not found:', DUMP_FILE); process.exit(1); }
  const dump = fs.readFileSync(DUMP_FILE, 'utf8');
  await prisma.$queryRawUnsafe('SELECT 1');
  console.log('✓ MySQL reachable. File:', DUMP_FILE, '\n');

  if (WIPE) {
    for (let i = ORDER.length - 1; i >= 0; i--) await prisma[accessor(ORDER[i])].deleteMany({});
    console.log('(wiped existing rows)\n');
  }

  const idMap = {}; for (const m of ORDER) idMap[m] = {};

  for (const model of ORDER) {
    const rows = extractRows(dump, model);
    if (!rows || !rows.length) { console.log(model.padEnd(20) + '     0'); continue; }
    let ok = 0, skip = 0;
    for (const row of rows) {
      const data = {}; let drop = false;
      for (const [k, v] of Object.entries(row)) {
        if (k === 'id') continue;                 // DB assigns the new integer id
        if (!SCALAR[model].has(k)) continue;       // column not in current schema
        if (FK[model][k]) {                        // foreign key -> remap to new id
          if (v == null) { data[k] = null; continue; }
          const mapped = idMap[FK[model][k]][v];
          if (mapped === undefined) { if (REQUIRED[model].has(k)) { drop = true; break; } data[k] = null; }
          else data[k] = mapped;
          continue;
        }
        data[k] = coerceScalar(model, k, v);
      }
      if (drop) { skip++; continue; }
      for (const f of (ARRAY_JSON[model] || [])) if (data[f] == null) data[f] = [];
      try {
        const created = await prisma[accessor(model)].create({ data });
        if (row.id != null) idMap[model][row.id] = created.id;
        ok++;
      } catch (e) { skip++; if (skip <= 3) console.log('  ! ' + model + ' skipped: ' + e.message.split('\n')[0]); }
    }
    console.log(model.padEnd(20) + String(ok).padStart(6) + ' inserted' + (skip ? '  (' + skip + ' skipped)' : ''));
  }
  console.log('\n✅ Restore complete.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
