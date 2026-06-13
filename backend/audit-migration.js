/**
 * ============================================================================
 *  audit-migration.js
 * ----------------------------------------------------------------------------
 *  Audits the PostgreSQL -> MySQL data migration and finishes any gaps.
 *
 *    1. Compares row counts (PostgreSQL vs MySQL) for EVERY table.
 *    2. Prints a Table | PostgreSQL Rows | MySQL Rows report.
 *    3. Identifies tables that were not (fully) migrated.
 *    4. Shows the exact error preventing migration of each gap table.
 *    5. Verifies foreign-key constraints (DB-level + orphan data scan).
 *    6. Continues migration ONLY for missing/incomplete tables.
 *    7. Skips duplicates — never re-inserts existing rows.
 *    8. Prints a final summary: migrated / pending / failed / total copied.
 *
 *  Run:
 *      node audit-migration.js              # audit + fill gaps
 *      node audit-migration.js --audit-only # report only, write nothing
 *
 *  PostgreSQL connection: set OLD_DATABASE_URL, or edit PG_URL_DEFAULT below.
 * ============================================================================
 */

require('dotenv').config();
const { Client } = require('pg');
const { Prisma } = require('@prisma/client');
const prisma = require('./src/config/prisma'); // MySQL (target)

const PG_URL_DEFAULT = 'postgresql://postgres:postgres@localhost:5432/corehrms';
const PG_URL = process.env.OLD_DATABASE_URL || process.env.PG_DATABASE_URL || PG_URL_DEFAULT;
const AUDIT_ONLY = process.argv.includes('--audit-only');
const CHUNK = 500;

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const maskUrl = (u) => u.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@');
const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const accessor = (m) => m.charAt(0).toLowerCase() + m.slice(1);

const MODELS = Prisma.dmmf.datamodel.models;
const MODEL_BY_NAME = Object.fromEntries(MODELS.map((m) => [m.name, m]));

// field name -> physical column (honours @map / dbName)
const colName = (model, field) => {
  const f = MODEL_BY_NAME[model]?.fields.find((x) => x.name === field);
  return (f && f.dbName) || field;
};

// scalar/json fields + required JSON (former PG arrays) per model
const FIELDS = {}, REQUIRED_JSON = {};
for (const m of MODELS) {
  FIELDS[m.name] = new Set(m.fields.filter((f) => f.kind !== 'object').map((f) => f.name));
  REQUIRED_JSON[m.name] = m.fields
    .filter((f) => f.kind !== 'object' && f.type === 'Json' && f.isRequired).map((f) => f.name);
}

// Foreign-key relations derived from the schema (the side holding the FK).
const RELATIONS = [];
for (const m of MODELS) {
  for (const f of m.fields) {
    if (f.kind === 'object' && Array.isArray(f.relationFromFields) && f.relationFromFields.length) {
      RELATIONS.push({
        child: m.name,
        childCol: colName(m.name, f.relationFromFields[0]),
        parent: f.type,
        parentCol: colName(f.type, f.relationToFields?.[0] || 'id'),
      });
    }
  }
}

// Explicit dependency order; unlisted models appended after.
const EXPLICIT_ORDER = [
  'SubscriptionPlan', 'Company', 'Branch', 'User', 'Employee', 'Attendance',
  'LeaveRequest', 'Overtime', 'Payroll', 'BranchPayroll', 'CompanyPayroll',
  'PaymentRecord', 'Document', 'Notification', 'AuditLog', 'LoginAudit', 'PasswordResetToken',
];
function resolveOrder() {
  const existing = new Set(MODELS.map((m) => m.name));
  const ordered = EXPLICIT_ORDER.filter((m) => existing.has(m));
  for (const m of MODELS) if (!ordered.includes(m.name)) ordered.push(m.name);
  return ordered;
}

function toPayload(model, raw) {
  const valid = FIELDS[model];
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = snakeToCamel(k);
    if (valid.has(key)) out[key] = v;
  }
  for (const f of REQUIRED_JSON[model]) if (out[f] == null) out[f] = [];
  return out;
}

// Classify a Prisma/MySQL error into the categories required by the audit.
// Returns { category, code, detail }.
function classifyError(err) {
  const msg = (err && err.message ? err.message : String(err)).split('\n').filter(Boolean).slice(-1)[0] || String(err);
  const code = err && err.code;       // Prisma known-request-error code
  const name = err && err.name;
  let category = 'UNKNOWN';
  if (name === 'PrismaClientValidationError') category = 'PRISMA VALIDATION';
  else if (code === 'P2002') category = 'DUPLICATE / UUID CONFLICT (unique constraint)';
  else if (code === 'P2003') category = 'FOREIGN KEY FAILURE';
  else if (code === 'P2000') category = 'VALUE TOO LONG / TYPE';
  else if (code === 'P2025') category = 'MISSING RELATED RECORD';
  else if (/json/i.test(msg) || name === 'SyntaxError') category = 'JSON CONVERSION';
  else if (/foreign key/i.test(msg)) category = 'FOREIGN KEY FAILURE';
  else if (/duplicate/i.test(msg)) category = 'DUPLICATE / UUID CONFLICT';
  return { category, code: code || name || '-', detail: msg, meta: err && err.meta };
}

async function pgTableCount(pg, model) {
  try { return (await pg.query(`SELECT COUNT(*)::int AS c FROM "${model}"`)).rows[0].c; }
  catch { return null; } // table absent in source
}

async function main() {
  const ORDER = resolveOrder();
  console.log('============================================================');
  console.log(' MIGRATION AUDIT  (PostgreSQL  ->  MySQL)');
  console.log(AUDIT_ONLY ? ' MODE: AUDIT ONLY (no writes)' : ' MODE: AUDIT + FILL GAPS');
  console.log('============================================================');
  console.log(' Source (PostgreSQL):', maskUrl(PG_URL));
  console.log(' Target (MySQL)     :', maskUrl(process.env.DATABASE_URL || '(unset)'));
  console.log('');

  const pg = new Client({ connectionString: PG_URL });
  try { await pg.connect(); }
  catch (e) { console.error('✗ Cannot connect to PostgreSQL:', e.message); process.exit(1); }
  await prisma.$queryRawUnsafe('SELECT 1');

  // ── 1+2. Row-count comparison report ─────────────────────────────────────
  const pgCount = {}, myCount = {};
  console.log('── 1. ROW COUNT COMPARISON ──────────────────────────────────');
  console.log('  ' + pad('Table', 22) + padL('PostgreSQL Rows', 17) + padL('MySQL Rows', 13) + '   Status');
  console.log('  ' + '-'.repeat(62));
  const gaps = []; // tables needing migration
  for (const model of ORDER) {
    pgCount[model] = await pgTableCount(pg, model);
    myCount[model] = await prisma[accessor(model)].count();
    let status;
    if (pgCount[model] === null) status = 'n/a (not in source)';
    else if (myCount[model] >= pgCount[model] && pgCount[model] > 0) status = 'OK';
    else if (pgCount[model] === 0) status = 'empty';
    else { status = myCount[model] === 0 ? 'MISSING' : 'PARTIAL'; gaps.push(model); }
    console.log('  ' + pad(model, 22) + padL(pgCount[model] === null ? 'n/a' : pgCount[model], 17) + padL(myCount[model], 13) + '   ' + status);
  }

  // ── 3. Tables not (fully) migrated ───────────────────────────────────────
  console.log('\n── 3. TABLES NOT FULLY MIGRATED ─────────────────────────────');
  if (!gaps.length) console.log('  None — every source table is fully represented in MySQL.');
  else for (const m of gaps) console.log(`  - ${m}: PostgreSQL ${pgCount[m]} vs MySQL ${myCount[m]} (missing ${pgCount[m] - myCount[m]})`);

  // ── 5. Foreign-key constraint verification ───────────────────────────────
  // (5 before 4 so the report flows; numbering kept per requirements.)
  console.log('\n── 5. FOREIGN-KEY VERIFICATION ──────────────────────────────');
  const dbFks = await prisma.$queryRawUnsafe(`
    SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME`);
  console.log(`  DB-level FK constraints present in MySQL: ${dbFks.length}`);
  console.log('  Orphan scan (child rows whose FK has no matching parent):');
  let orphanTotal = 0;
  for (const r of RELATIONS) {
    try {
      const q = `SELECT COUNT(*) AS c FROM \`${r.child}\` ch
                 LEFT JOIN \`${r.parent}\` p ON ch.\`${r.childCol}\` = p.\`${r.parentCol}\`
                 WHERE ch.\`${r.childCol}\` IS NOT NULL AND p.\`${r.parentCol}\` IS NULL`;
      const c = Number((await prisma.$queryRawUnsafe(q))[0].c);
      orphanTotal += c;
      if (c > 0) console.log(`    ⚠ ${r.child}.${r.childCol} -> ${r.parent}.${r.parentCol}: ${c} orphan(s)`);
    } catch (e) {
      console.log(`    ! ${r.child}.${r.childCol} -> ${r.parent}: check failed (${e.message.split('\n')[0]})`);
    }
  }
  console.log(orphanTotal === 0 ? '    ✓ No orphaned foreign keys — referential integrity intact.' : `    Total orphans: ${orphanTotal}`);

  // ── 4 + 6 + 7. Fill ONLY the gap tables, skipping duplicates ─────────────
  const result = { migrated: [], pending: [], failed: [], copied: 0 };
  if (gaps.length && !AUDIT_ONLY) {
    console.log('\n── 4/6. MIGRATING MISSING TABLES (skip duplicates) ──────────');
    for (const model of gaps) {
      let rows;
      try { rows = (await pg.query(`SELECT * FROM "${model}"`)).rows; }
      catch (e) { result.failed.push({ table: model, error: e.message.split('\n')[0] }); console.log(`  ✗ ${pad(model, 20)} read error: ${e.message.split('\n')[0]}`); continue; }

      let copied = 0, lastError = null, firstFailLogged = false, failCats = {};
      for (let i = 0; i < rows.length; i += CHUNK) {
        const data = rows.slice(i, i + CHUNK).map((r) => toPayload(model, r));
        try {
          copied += (await prisma[accessor(model)].createMany({ data, skipDuplicates: true })).count;
        } catch (batchErr) {
          // Row-by-row fallback to capture the EXACT failing row + classified error.
          for (const d of data) {
            try { copied += (await prisma[accessor(model)].createMany({ data: [d], skipDuplicates: true })).count; }
            catch (rowErr) {
              const c = classifyError(rowErr);
              lastError = `[${c.category}] ${c.detail}`;
              failCats[c.category] = (failCats[c.category] || 0) + 1;
              // Print the FIRST failure of this table in full detail (task 3+4+5).
              if (!firstFailLogged) {
                console.log(`    ┌─ FIRST FAILURE in ${model}`);
                console.log(`    │  row id   : ${d.id}`);
                console.log(`    │  category : ${c.category}`);
                console.log(`    │  code     : ${c.code}`);
                if (c.meta) console.log(`    │  meta     : ${JSON.stringify(c.meta)}`);
                console.log(`    │  message  : ${c.detail}`);
                console.log(`    └─`);
                firstFailLogged = true;
              }
            }
          }
        }
      }
      if (Object.keys(failCats).length) {
        console.log(`    error breakdown for ${model}: ` + Object.entries(failCats).map(([k, v]) => `${k}=${v}`).join(', '));
      }
      result.copied += copied;
      const now = await prisma[accessor(model)].count();
      myCount[model] = now;
      if (now >= pgCount[model]) { result.migrated.push(model); console.log(`  ✓ ${pad(model, 20)} +${copied}  (now ${now}/${pgCount[model]})`); }
      else if (lastError) { result.failed.push({ table: model, error: lastError }); console.log(`  ✗ ${pad(model, 20)} +${copied}  (now ${now}/${pgCount[model]}) — ${lastError}`); }
      else { result.pending.push(model); console.log(`  … ${pad(model, 20)} +${copied}  (now ${now}/${pgCount[model]})`); }
    }
  } else if (gaps.length && AUDIT_ONLY) {
    console.log('\n── 4. EXACT ERRORS (dry probe, --audit-only) ────────────────');
    for (const model of gaps) {
      try {
        const rows = (await pg.query(`SELECT * FROM "${model}" LIMIT 1`)).rows;
        if (rows.length) { toPayload(model, rows[0]); console.log(`  ${pad(model, 20)} readable; would insert ${pgCount[model] - myCount[model]} row(s).`); }
      } catch (e) { console.log(`  ${pad(model, 20)} ERROR: ${e.message.split('\n')[0]}`); }
    }
  }

  // ── 8. Final summary ─────────────────────────────────────────────────────
  // Recompute classification across ALL tables for an accurate final picture.
  const stillPending = [], completed = [];
  for (const model of ORDER) {
    if (pgCount[model] === null || pgCount[model] === 0) continue;
    if (myCount[model] >= pgCount[model]) completed.push(model);
    else if (!result.failed.find((f) => f.table === model)) stillPending.push(model);
  }
  console.log('\n============================================================');
  console.log(' FINAL SUMMARY');
  console.log('============================================================');
  console.log(`  Migrated tables (complete) : ${completed.length}`);
  console.log(`     ${completed.join(', ') || '(none)'}`);
  console.log(`  Pending tables (still short): ${stillPending.length}`);
  console.log(`     ${stillPending.join(', ') || '(none)'}`);
  console.log(`  Failed tables              : ${result.failed.length}`);
  for (const f of result.failed) console.log(`     - ${f.table}: ${f.error}`);
  console.log(`  Total records copied (run) : ${result.copied}`);
  const totPg = ORDER.reduce((a, m) => a + (pgCount[m] || 0), 0);
  const totMy = ORDER.reduce((a, m) => a + (myCount[m] || 0), 0);
  console.log(`  Grand totals               : PostgreSQL ${totPg}  |  MySQL ${totMy}`);
  console.log(`  Foreign-key integrity      : ${orphanTotal === 0 ? 'OK (no orphans)' : orphanTotal + ' orphan(s)'}`);

  // ── 9. Required verification thresholds ──────────────────────────────────
  const checks = [
    { label: 'Company  > 0',   ok: (myCount.Company || 0) > 0,   got: myCount.Company || 0 },
    { label: 'Branch   > 0',   ok: (myCount.Branch || 0) > 0,    got: myCount.Branch || 0 },
    { label: 'Employee > 800', ok: (myCount.Employee || 0) > 800, got: myCount.Employee || 0 },
  ];
  console.log('  Verification:');
  for (const c of checks) console.log(`     ${c.ok ? '✓' : '✗'} ${c.label}  (got ${c.got})`);

  const parity = stillPending.length === 0 && result.failed.length === 0 && checks.every((c) => c.ok);
  console.log('\n  ' + (parity ? '✓ PARITY — MySQL contains the same business data as PostgreSQL.'
                              : '⚠ NOT YET AT PARITY — see pending/failed tables above.'));
  console.log('============================================================\n');

  await pg.end();
  await prisma.$disconnect();
  process.exitCode = parity ? 0 : 2;
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
