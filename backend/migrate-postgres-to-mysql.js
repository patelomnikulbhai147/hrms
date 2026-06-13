/**
 * ============================================================================
 *  migrate-postgres-to-mysql.js
 * ----------------------------------------------------------------------------
 *  Copies ALL data from the legacy PostgreSQL database `corehrms` directly
 *  into the new MySQL database `corehrms` — no CSV, no manual export.
 *
 *    PostgreSQL (source)  --[ pg driver ]-->  in memory  --[ Prisma ]-->  MySQL
 *
 *  Features
 *    - Reads straight from PostgreSQL, writes via Prisma into MySQL.
 *    - Discovers EVERY table automatically from the Prisma schema and migrates
 *      them in dependency order (parents before children) — no hardcoded list.
 *    - Preserves ids / UUIDs / foreign keys / relationships verbatim.
 *    - Converts PostgreSQL array columns into MySQL JSON columns.
 *    - Skips duplicates safely (INSERT IGNORE) so it can be re-run any time.
 *    - Prints row counts BEFORE and AFTER, with table-by-table progress.
 *
 *  Run:
 *      node migrate-postgres-to-mysql.js
 *
 *  PostgreSQL connection: set OLD_DATABASE_URL, or edit PG_URL_DEFAULT below.
 * ============================================================================
 */

require('dotenv').config(); // loads MySQL DATABASE_URL for Prisma
const { Client } = require('pg');
const { Prisma } = require('@prisma/client');
const prisma = require('./src/config/prisma'); // MySQL (target) via Prisma

// ── PostgreSQL (SOURCE) connection ──────────────────────────────────────────
// Override without editing this file:  $env:OLD_DATABASE_URL="postgresql://..."
const PG_URL_DEFAULT = 'postgresql://postgres:postgres@localhost:5432/corehrms';
const PG_URL = process.env.OLD_DATABASE_URL || process.env.PG_DATABASE_URL || PG_URL_DEFAULT;

const CHUNK = 500;
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const maskUrl = (u) => u.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@');
const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const accessor = (model) => model.charAt(0).toLowerCase() + model.slice(1);

// ── Derive table list + metadata automatically from the Prisma schema ───────
const MODELS = Prisma.dmmf.datamodel.models;

// scalar/json field names (drop relation objects) + which Json fields are
// required (former PG arrays must default to [] instead of null).
const FIELDS = {};       // model -> Set of scalar/json field names
const REQUIRED_JSON = {}; // model -> [json field names that are required]
for (const m of MODELS) {
  FIELDS[m.name] = new Set(m.fields.filter((f) => f.kind !== 'object').map((f) => f.name));
  REQUIRED_JSON[m.name] = m.fields
    .filter((f) => f.kind !== 'object' && f.type === 'Json' && f.isRequired)
    .map((f) => f.name);
}

// Explicit dependency order (parents before children) as specified for this
// migration. Any model NOT listed here (e.g. Shift) is appended afterwards via
// the automatic topological sort, so the schema can grow without breaking this.
const EXPLICIT_ORDER = [
  'SubscriptionPlan',
  'Company',
  'Branch',
  'User',
  'Employee',
  'Attendance',
  'LeaveRequest',
  'Overtime',
  'Payroll',
  'BranchPayroll',
  'CompanyPayroll',
  'PaymentRecord',
  'Document',
  'Notification',
  'AuditLog',
  'LoginAudit',
  'PasswordResetToken',
];

// Final order = explicit list (only models that actually exist) + any remaining
// models in automatic dependency order, appended after their parents.
function resolveOrder() {
  const existing = new Set(MODELS.map((m) => m.name));
  const ordered = EXPLICIT_ORDER.filter((m) => existing.has(m));
  const seen = new Set(ordered);
  for (const m of dependencyOrder()) if (!seen.has(m)) { ordered.push(m); seen.add(m); }
  return ordered;
}

// Build dependency graph from relation fields that hold the FK, then topo-sort
// so every parent table is migrated before any table that references it.
function dependencyOrder() {
  const deps = {};
  for (const m of MODELS) {
    deps[m.name] = new Set();
    for (const f of m.fields) {
      if (f.kind === 'object' && Array.isArray(f.relationFromFields) && f.relationFromFields.length) {
        if (f.type !== m.name) deps[m.name].add(f.type); // ignore self-references
      }
    }
  }
  const ordered = [];
  const done = new Set();
  let progressed = true;
  while (ordered.length < MODELS.length && progressed) {
    progressed = false;
    for (const m of MODELS) {
      if (done.has(m.name)) continue;
      if ([...deps[m.name]].every((d) => done.has(d) || d === m.name)) {
        ordered.push(m.name); done.add(m.name); progressed = true;
      }
    }
  }
  // Any leftovers (cyclic) appended as-is.
  for (const m of MODELS) if (!done.has(m.name)) ordered.push(m.name);
  return ordered;
}

// Map a raw PostgreSQL row to a Prisma create payload for `model`.
function toPayload(model, raw) {
  const valid = FIELDS[model];
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = snakeToCamel(k);       // handle @map snake_case columns
    if (valid.has(key)) out[key] = v;  // drop any stray/unknown column
  }
  // PG arrays arrive as JS arrays -> Prisma JSON accepts them directly.
  // Guarantee required JSON (former array) fields are never null.
  for (const f of REQUIRED_JSON[model]) {
    if (out[f] == null) out[f] = [];
  }
  return out;
}

async function main() {
  const ORDER = resolveOrder();

  console.log('============================================================');
  console.log(' migrate-postgres-to-mysql.js');
  console.log('============================================================');
  console.log(' Source (PostgreSQL):', maskUrl(PG_URL));
  console.log(' Target (MySQL)     :', maskUrl(process.env.DATABASE_URL || '(DATABASE_URL not set)'));
  console.log(' Tables (dependency order):');
  console.log('   ' + ORDER.join(' -> '));
  console.log('============================================================\n');

  const pg = new Client({ connectionString: PG_URL });
  try {
    await pg.connect();
  } catch (e) {
    console.error('✗ Could not connect to PostgreSQL:', e.message);
    console.error('  Set OLD_DATABASE_URL or edit PG_URL_DEFAULT, then retry.');
    process.exit(1);
  }
  await prisma.$queryRawUnsafe('SELECT 1'); // verify MySQL reachable
  console.log('✓ Connected to PostgreSQL (source) and MySQL (target).\n');

  const before = {}; // MySQL counts before
  const pgCount = {}; // PostgreSQL counts
  const inserted = {}; // newly inserted
  const after = {};   // MySQL counts after

  // ── BEFORE: counts ─────────────────────────────────────────────────────
  console.log('── Row counts BEFORE ────────────────────────────────────────');
  console.log('  ' + pad('TABLE', 22) + padL('POSTGRES', 10) + padL('MYSQL', 10));
  for (const model of ORDER) {
    try {
      const r = await pg.query(`SELECT COUNT(*)::int AS c FROM "${model}"`);
      pgCount[model] = r.rows[0].c;
    } catch { pgCount[model] = null; } // table not in source
    before[model] = await prisma[accessor(model)].count();
    console.log('  ' + pad(model, 22) + padL(pgCount[model] === null ? 'n/a' : pgCount[model], 10) + padL(before[model], 10));
  }

  // ── MIGRATE: table by table, parents first, skip duplicates ──────────────
  console.log('\n── Migrating (skip duplicates) ──────────────────────────────');
  for (const model of ORDER) {
    if (pgCount[model] === null) { console.log('  ' + pad(model, 22) + 'skipped (not in source)'); inserted[model] = 0; continue; }
    let rows;
    try {
      rows = (await pg.query(`SELECT * FROM "${model}"`)).rows;
    } catch (e) {
      console.log('  ' + pad(model, 22) + 'read error: ' + e.message.split('\n')[0]); inserted[model] = 0; continue;
    }
    let count = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const data = rows.slice(i, i + CHUNK).map((r) => toPayload(model, r));
      try {
        const res = await prisma[accessor(model)].createMany({ data, skipDuplicates: true });
        count += res.count;
      } catch (e) {
        // Fall back to per-row so one bad row can't stop the batch.
        for (const d of data) {
          try { const r = await prisma[accessor(model)].createMany({ data: [d], skipDuplicates: true }); count += r.count; }
          catch (rowErr) { console.log(`    ! ${model} id=${d.id}: ${rowErr.message.split('\n')[0]}`); }
        }
      }
    }
    inserted[model] = count;
    const dupes = rows.length - count;
    console.log('  ' + pad(model, 22) + padL(`+${count}`, 8) + '   (read ' + rows.length + ', skipped ' + dupes + ')');
  }

  // ── AFTER: counts ────────────────────────────────────────────────────────
  console.log('\n── Row counts AFTER ─────────────────────────────────────────');
  console.log('  ' + pad('TABLE', 22) + padL('POSTGRES', 10) + padL('MYSQL', 10) + padL('STATUS', 12));
  let totPg = 0, totMy = 0;
  for (const model of ORDER) {
    after[model] = await prisma[accessor(model)].count();
    const src = pgCount[model];
    if (src !== null) { totPg += src; }
    totMy += after[model];
    const status = src === null ? 'n/a'
      : after[model] >= src ? 'OK'
      : 'CHECK (-' + (src - after[model]) + ')';
    console.log('  ' + pad(model, 22) + padL(src === null ? 'n/a' : src, 10) + padL(after[model], 10) + padL(status, 12));
  }
  console.log('  ' + '-'.repeat(54));
  console.log('  ' + pad('TOTAL', 22) + padL(totPg, 10) + padL(totMy, 10));

  // ── FINAL MIGRATION SUMMARY ──────────────────────────────────────────────
  const totalInserted = Object.values(inserted).reduce((a, b) => a + b, 0);
  const tablesMigrated = ORDER.filter((m) => pgCount[m] !== null);
  const shortfalls = tablesMigrated.filter((m) => after[m] < pgCount[m])
    .map((m) => ({ table: m, source: pgCount[m], target: after[m], missing: pgCount[m] - after[m] }));
  const parity = shortfalls.length === 0;

  console.log('\n============================================================');
  console.log(' FINAL MIGRATION SUMMARY');
  console.log('============================================================');
  console.log('  Tables in source        : ' + tablesMigrated.length + ' / ' + ORDER.length);
  console.log('  Source rows (PostgreSQL): ' + totPg);
  console.log('  Target rows (MySQL)     : ' + totMy);
  console.log('  New rows inserted (run) : ' + totalInserted);
  console.log('  Duplicates skipped      : ' + (tablesMigrated.reduce((a, m) => a + (pgCount[m] || 0), 0) - totalInserted));
  if (parity) {
    console.log('\n  ✓ PARITY ACHIEVED — every table in MySQL has at least as many');
    console.log('    rows as PostgreSQL. MySQL now mirrors the source business data.');
  } else {
    console.log('\n  ⚠ INCOMPLETE — the following tables have fewer rows than source:');
    for (const s of shortfalls) {
      console.log(`     - ${s.table}: source ${s.source}, target ${s.target} (missing ${s.missing})`);
    }
    console.log('    Review the per-row errors printed above (likely missing FK parents');
    console.log('    or invalid rows in the source). Fix and re-run — duplicates are skipped.');
  }
  console.log('\n  Re-running is safe: existing rows are skipped as duplicates.');
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
