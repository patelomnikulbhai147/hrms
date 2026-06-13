/**
 * ============================================================================
 *  RESTORE:  corehrms_backup.sql  (PostgreSQL pg_dump)  ->  MySQL (via Prisma)
 * ============================================================================
 *
 *  Loads the full legacy app state from the on-disk PostgreSQL dump into the
 *  empty MySQL database read by the application. NO live PostgreSQL connection
 *  is required (PostgreSQL is fully retired) — it parses the dump's COPY blocks
 *  directly and writes through Prisma, so every value lands in MySQL with the
 *  correct JS type (Date / number / boolean / JSON / array-as-JSON).
 *
 *  - Parent-before-child insert order; orphan FK rows are skipped & reported.
 *  - PostgreSQL array columns -> MySQL JSON arrays.
 *  - Idempotent-ish: pass --wipe to clear MySQL first for a clean re-import.
 *
 *  USAGE
 *      node scripts/restoreBackupToMysql.js [--wipe] [--dry-run] [--file=PATH]
 * ============================================================================
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const prisma = require('../src/config/prisma');

const WIPE = process.argv.includes('--wipe');
const DRY_RUN = process.argv.includes('--dry-run');
const fileArg = process.argv.find((a) => a.startsWith('--file='));
const DUMP_FILE = fileArg
  ? fileArg.slice('--file='.length)
  : path.resolve(__dirname, '../../corehrms_backup.sql');

// Parent-before-child order (mirrors migratePgToMysql.js).
const TABLES = [
  { model: 'SubscriptionPlan', parents: {} },
  { model: 'Company',          parents: {} },
  { model: 'Branch',           parents: { companyId: 'Company' } },
  { model: 'User',             parents: {} },
  { model: 'Employee',         parents: { companyId: 'Company', branchId: 'Branch' } },
  { model: 'Shift',            parents: { companyId: 'Company' } },
  { model: 'Attendance',       parents: { companyId: 'Company', employeeId: 'Employee' } },
  { model: 'LeaveRequest',     parents: { companyId: 'Company', employeeId: 'Employee' } },
  { model: 'Overtime',         parents: { companyId: 'Company', employeeId: 'Employee' } },
  { model: 'Payroll',          parents: { companyId: 'Company', employeeId: 'Employee' } },
  { model: 'BranchPayroll',    parents: { branchId: 'Branch' } },
  { model: 'CompanyPayroll',   parents: { companyId: 'Company' } },
  { model: 'PaymentRecord',    parents: { companyId: 'Company' } },
  { model: 'Document',         parents: { companyId: 'Company' } },
  { model: 'Notification',     parents: {} },
  { model: 'AuditLog',         parents: { userId: 'User' } },
  { model: 'LoginAudit',       parents: {} },
  { model: 'PasswordResetToken', parents: { userId: 'User' } },
];

const accessor = (m) => m.charAt(0).toLowerCase() + m.slice(1);
const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// Former PostgreSQL array columns -> MySQL JSON; coerce to [].
const ARRAY_JSON_FIELDS = {
  User: new Set(['accessibleCompanyIds']),
  Company: new Set(['customDepartments']),
  Attendance: new Set(['flags']),
};

// Build per-model field type maps from the Prisma schema.
const FIELD_TYPE = {};   // model -> { fieldName: 'Int'|'Float'|'Boolean'|'DateTime'|'Json'|'String'|... }
const SCALAR_FIELDS = {};
for (const m of Prisma.dmmf.datamodel.models) {
  FIELD_TYPE[m.name] = {};
  SCALAR_FIELDS[m.name] = new Set();
  for (const f of m.fields) {
    if (f.kind === 'object') continue;
    SCALAR_FIELDS[m.name].add(f.name);
    FIELD_TYPE[m.name][f.name] = f.type;
  }
}

// ── COPY text-format unescape (\N handled by caller) ───────────────────────
function unescapeCopy(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const n = s[++i];
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r'
           : n === 'b' ? '\b' : n === 'f' ? '\f' : n === 'v' ? '\v' : n;
    } else out += s[i];
  }
  return out;
}

// ── Parse a PostgreSQL array literal  {a,b,"c d"}  ->  JS string[] ─────────
function parsePgArray(lit) {
  if (lit == null) return [];
  const s = lit.trim();
  if (s === '{}' || s === '') return [];
  if (s[0] !== '{' || s[s.length - 1] !== '}') return [];
  const body = s.slice(1, -1);
  const out = [];
  let i = 0;
  while (i < body.length) {
    let val = '';
    if (body[i] === '"') {
      i++;
      while (i < body.length && body[i] !== '"') {
        if (body[i] === '\\') { val += body[++i]; i++; }
        else val += body[i++];
      }
      i++; // closing quote
    } else {
      while (i < body.length && body[i] !== ',') val += body[i++];
      if (val === 'NULL') val = null;
    }
    out.push(val);
    if (body[i] === ',') i++;
  }
  return out;
}

function coerce(model, field, raw) {
  if (raw == null) return null; // was \N
  const type = FIELD_TYPE[model][field];
  if (ARRAY_JSON_FIELDS[model] && ARRAY_JSON_FIELDS[model].has(field)) {
    return parsePgArray(raw);
  }
  switch (type) {
    case 'Int':      return parseInt(raw, 10);
    case 'Float':    return parseFloat(raw);
    case 'Boolean':  return raw === 't' || raw === 'true' || raw === '1';
    case 'DateTime': { const d = new Date(raw.replace(' ', 'T') + (/[zZ+]/.test(raw) ? '' : 'Z')); return isNaN(d) ? new Date(raw) : d; }
    case 'Json':     { try { return JSON.parse(raw); } catch { return raw; } }
    default:         return raw; // String
  }
}

// ── Extract one model's rows from the dump text ────────────────────────────
// Line-based: find the COPY header line for the model, then read data lines
// until the COPY terminator line (a line whose trimmed value is exactly "\.").
function extractRows(dump, model) {
  const lines = dump.split('\n');
  const headerRe = new RegExp(`^COPY public\\."${model}" \\(([^)]*)\\) FROM stdin;\\s*$`);
  let h = -1, colMatch = null;
  for (let i = 0; i < lines.length; i++) {
    const m = headerRe.exec(lines[i].replace(/\r$/, ''));
    if (m) { h = i; colMatch = m[1]; break; }
  }
  if (h === -1) return null; // table not present
  const cols = colMatch.split(',').map((c) => snakeToCamel(c.trim().replace(/(^"|"$)/g, '')));
  const rows = [];
  for (let i = h + 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (line === '\\.') break;          // COPY terminator
    if (line === '') continue;
    const fields = line.split('\t');
    const obj = {};
    for (let j = 0; j < cols.length; j++) {
      const rawF = fields[j];
      obj[cols[j]] = (rawF === undefined || rawF === '\\N') ? null : unescapeCopy(rawF);
    }
    rows.push(obj);
  }
  return { cols, rows };
}

function pad(s, n) { return String(s).padEnd(n); }
function padL(s, n) { return String(s).padStart(n); }

async function main() {
  console.log('============================================================');
  console.log(' RESTORE  corehrms_backup.sql  ->  MySQL  (via Prisma)');
  console.log(' MODE:', DRY_RUN ? 'DRY RUN (no writes)' : (WIPE ? 'LIVE + WIPE' : 'LIVE'));
  console.log(' FILE:', DUMP_FILE);
  console.log('============================================================\n');

  if (!fs.existsSync(DUMP_FILE)) { console.error('ERROR: dump not found:', DUMP_FILE); process.exit(1); }
  const dump = fs.readFileSync(DUMP_FILE, 'utf8');
  await prisma.$queryRawUnsafe('SELECT 1');
  console.log('✓ MySQL reachable.\n');

  // STEP 1 — parse source
  const sourceData = {};
  const report = { source: {}, target: {}, migrated: {}, skipped: {}, missingRefs: [], errors: [] };
  console.log('── Parsed from dump (SOURCE) ──');
  for (const t of TABLES) {
    const ext = extractRows(dump, t.model);
    sourceData[t.model] = ext ? ext.rows : [];
    report.source[t.model] = sourceData[t.model].length;
    console.log(`  ${pad(t.model, 22)} ${padL(report.source[t.model], 8)}${ext ? '' : '  (not in dump)'}`);
  }

  // STEP 2 — orphan FK filtering (in-memory)
  const idSets = {};
  for (const t of TABLES) idSets[t.model] = new Set(sourceData[t.model].map((r) => r.id));
  const validRows = {};
  for (const t of TABLES) {
    const defs = Object.entries(t.parents);
    if (!defs.length) { validRows[t.model] = sourceData[t.model]; report.skipped[t.model] = 0; continue; }
    const good = [], bad = [];
    for (const row of sourceData[t.model]) {
      let ok = true;
      for (const [fk, parent] of defs) {
        const v = row[snakeToCamel(fk)];
        if (v == null) continue;
        if (!idSets[parent].has(v)) { ok = false; bad.push({ id: row.id, fk, parent, v }); break; }
      }
      if (ok) good.push(row);
    }
    validRows[t.model] = good;
    report.skipped[t.model] = bad.length;
    if (bad.length) {
      report.missingRefs.push({ table: t.model, count: bad.length, sample: bad[0] });
      console.log(`  ⚠ ${t.model}: ${bad.length} orphan row(s) skipped (missing parent).`);
    }
  }

  if (DRY_RUN) { console.log('\nDRY RUN complete — nothing written.'); await prisma.$disconnect(); return; }

  // STEP 3 — write in dependency order, chunked, single transaction
  console.log('\n── Writing into MySQL ──');
  const CHUNK = 300;
  try {
    await prisma.$transaction(async (tx) => {
      if (WIPE) {
        for (let i = TABLES.length - 1; i >= 0; i--) await tx[accessor(TABLES[i].model)].deleteMany({});
        console.log('  (wiped existing MySQL rows)');
      }
      for (const t of TABLES) {
        const rows = validRows[t.model];
        if (!rows.length) { report.migrated[t.model] = 0; continue; }
        const data = rows.map((r) => {
          const out = {};
          for (const [k, v] of Object.entries(r)) {
            if (!SCALAR_FIELDS[t.model].has(k)) continue;
            out[k] = coerce(t.model, k, v);
          }
          for (const f of (ARRAY_JSON_FIELDS[t.model] || [])) if (out[f] == null) out[f] = [];
          return out;
        });
        let migrated = 0;
        for (let i = 0; i < data.length; i += CHUNK) {
          const res = await tx[accessor(t.model)].createMany({ data: data.slice(i, i + CHUNK) });
          migrated += res.count;
        }
        report.migrated[t.model] = migrated;
        console.log(`  ${pad(t.model, 22)} ${padL(migrated, 8)} migrated`);
      }
    }, { timeout: 10 * 60 * 1000, maxWait: 2 * 60 * 1000 });
  } catch (err) {
    console.error('\n✗ RESTORE FAILED — rolled back. MySQL unchanged.');
    console.error('  Reason:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // STEP 4 — verify
  console.log('\n── Verification (target vs expected) ──');
  console.log('  TABLE                   SOURCE   SKIP   TARGET   STATUS');
  let mismatches = 0;
  for (const t of TABLES) {
    const tgt = await prisma[accessor(t.model)].count();
    report.target[t.model] = tgt;
    const expect = report.source[t.model] - (report.skipped[t.model] || 0);
    const status = tgt === expect ? 'OK' : 'MISMATCH';
    if (status !== 'OK') mismatches++;
    console.log(`  ${pad(t.model, 22)} ${padL(report.source[t.model], 6)} ${padL(report.skipped[t.model] || 0, 6)} ${padL(tgt, 8)}   ${status}`);
  }
  console.log(`\n  ${mismatches ? '✗ ' + mismatches + ' MISMATCH(es)' : '✓ All tables match (target = source - skipped).'}`);
  if (report.missingRefs.length) {
    console.log('\n  Skipped orphans:');
    for (const m of report.missingRefs) console.log(`   - ${m.table}: ${m.count}  e.g. ${JSON.stringify(m.sample)}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
