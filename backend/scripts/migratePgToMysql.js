/**
 * ============================================================================
 *  ONE-TIME DATA MIGRATION:  PostgreSQL (old source)  ->  MySQL (new target)
 * ============================================================================
 *
 *  Copies ALL business data from the legacy PostgreSQL database into the new
 *  MySQL database (read by the application via Prisma). It does NOT touch the
 *  MySQL schema — schema is already in place via `prisma migrate`. Data only.
 *
 *  WHAT IT PRESERVES
 *    - Primary keys / UUIDs (ids are copied verbatim)
 *    - Every foreign key & relationship (migrated in dependency order)
 *    - User permissions (JSON), offboarding/employment/document JSON blobs
 *    - PostgreSQL array fields are written into MySQL JSON columns:
 *        User.accessibleCompanyIds, Company.customDepartments, Attendance.flags
 *
 *  SAFETY
 *    - All inserts run inside ONE Prisma interactive transaction.
 *      Any failure rolls the WHOLE migration back — MySQL is left untouched,
 *      so the script can be fixed and re-run cleanly.
 *    - Referential integrity of the SOURCE is validated in-memory first; any
 *      orphan child rows (FK pointing at a missing parent) are reported and
 *      skipped (they cannot be inserted under MySQL FK constraints anyway).
 *
 *  USAGE
 *      # PowerShell
 *      $env:OLD_DATABASE_URL="postgresql://USER:PASS@localhost:5432/corehrms"; node scripts/migratePgToMysql.js
 *
 *      # bash
 *      OLD_DATABASE_URL="postgresql://USER:PASS@localhost:5432/corehrms" node scripts/migratePgToMysql.js
 *
 *      Optional flags:
 *        --dry-run   read + validate + report counts, write nothing
 *        --wipe      empty the MySQL tables first (fresh re-import)
 * ============================================================================
 */

require('dotenv').config();
const { Client } = require('pg');
const { Prisma } = require('@prisma/client');
const prisma = require('../src/config/prisma'); // MySQL connection (Prisma)

const PG_URL = process.env.OLD_DATABASE_URL || process.env.PG_DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');
const WIPE = process.argv.includes('--wipe');

// ── Tables in strict dependency (parent-before-child) order ────────────────
// Each entry is the Prisma MODEL name (also the PostgreSQL table name, since
// no model uses @@map). FK parents are listed for in-memory orphan checks.
const TABLES = [
  { model: 'SubscriptionPlan', parents: {} },
  { model: 'Company',          parents: {} },
  { model: 'Branch',           parents: { companyId: 'Company' } },
  { model: 'User',             parents: {} }, // companyId is loose (no FK)
  { model: 'Employee',         parents: { companyId: 'Company', branchId: 'Branch' } },
  { model: 'Shift',            parents: { companyId: 'Company' } }, // not in task list; migrated for full parity
  { model: 'Attendance',       parents: { companyId: 'Company', employeeId: 'Employee' } },
  { model: 'LeaveRequest',     parents: { companyId: 'Company', employeeId: 'Employee' } },
  { model: 'Overtime',         parents: { companyId: 'Company', employeeId: 'Employee' } },
  { model: 'Payroll',          parents: { companyId: 'Company', employeeId: 'Employee' } },
  { model: 'BranchPayroll',    parents: { branchId: 'Branch' } }, // companyId has no FK
  { model: 'CompanyPayroll',   parents: { companyId: 'Company' } },
  { model: 'PaymentRecord',    parents: { companyId: 'Company' } },
  { model: 'Document',         parents: { companyId: 'Company' } },
  { model: 'Notification',     parents: {} }, // companyId nullable, no FK
  { model: 'AuditLog',         parents: { userId: 'User' } },
  { model: 'LoginAudit',       parents: {} }, // userId nullable, no FK
  { model: 'PasswordResetToken', parents: { userId: 'User' } },
];

// Prisma accessor (camelCase) from PascalCase model name.
const accessor = (model) => model.charAt(0).toLowerCase() + model.slice(1);

// snake_case (PostgreSQL @map columns) -> camelCase (Prisma field names).
const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// Build the set of valid SCALAR field names per model from the Prisma schema,
// so any stray PostgreSQL column is dropped and we never send unknown args.
const SCALAR_FIELDS = {};
const ARRAY_JSON_FIELDS = {}; // fields that were PG arrays -> must never be null
for (const m of Prisma.dmmf.datamodel.models) {
  SCALAR_FIELDS[m.name] = new Set(
    m.fields.filter((f) => f.kind !== 'object').map((f) => f.name)
  );
}
// Former PostgreSQL array columns -> MySQL JSON; coerce null -> [] for safety.
ARRAY_JSON_FIELDS.User = ['accessibleCompanyIds'];
ARRAY_JSON_FIELDS.Company = ['customDepartments'];
ARRAY_JSON_FIELDS.Attendance = ['flags'];

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

function transformRow(model, raw) {
  const valid = SCALAR_FIELDS[model];
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = snakeToCamel(k);
    if (valid.has(key)) out[key] = v;
  }
  // Coerce former-array fields: PG arrays come back as JS arrays; guarantee []
  for (const f of ARRAY_JSON_FIELDS[model] || []) {
    if (out[f] == null) out[f] = [];
  }
  return out;
}

async function main() {
  console.log('============================================================');
  console.log(' PostgreSQL  ->  MySQL  |  one-time data migration');
  console.log(DRY_RUN ? ' MODE: DRY RUN (no writes)' : ' MODE: LIVE');
  console.log('============================================================\n');

  if (!PG_URL) {
    console.error('ERROR: PostgreSQL connection string not provided.');
    console.error('Set OLD_DATABASE_URL, e.g.:');
    console.error('  OLD_DATABASE_URL="postgresql://USER:PASS@localhost:5432/corehrms"\n');
    process.exit(1);
  }

  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  // Confirm MySQL side is reachable through Prisma.
  await prisma.$queryRawUnsafe('SELECT 1');
  console.log('✓ Connected to PostgreSQL (source) and MySQL (target).\n');

  const report = {
    source: {}, target: {}, migrated: {}, skipped: {},
    missingRefs: [], integrity: [], errors: [],
  };

  // ── STEP 1: read source + per-table PostgreSQL counts ────────────────────
  console.log('── PostgreSQL row counts (SOURCE) ───────────────────────────');
  const sourceData = {};
  for (const t of TABLES) {
    try {
      const r = await pg.query(`SELECT * FROM "${t.model}"`);
      sourceData[t.model] = r.rows;
      report.source[t.model] = r.rows.length;
      console.log(`  ${pad(t.model, 22)} ${padL(r.rows.length, 8)}`);
    } catch (e) {
      // Table absent in the old DB — treat as zero rows, keep going.
      sourceData[t.model] = [];
      report.source[t.model] = 0;
      console.log(`  ${pad(t.model, 22)} ${padL('n/a', 8)}  (not in source: ${e.message.split('\n')[0]})`);
    }
  }

  // ── STEP 2: in-memory referential-integrity check on the SOURCE ──────────
  // Build id sets for parents, then flag any child row whose FK is missing.
  const idSets = {};
  for (const t of TABLES) {
    idSets[t.model] = new Set(sourceData[t.model].map((r) => r.id));
  }
  const validRows = {};
  for (const t of TABLES) {
    const parentDefs = Object.entries(t.parents);
    if (!parentDefs.length) { validRows[t.model] = sourceData[t.model]; report.skipped[t.model] = 0; continue; }
    const g = [], b = [];
    for (const row of sourceData[t.model]) {
      let ok = true;
      for (const [fkCol, parentModel] of parentDefs) {
        const camel = snakeToCamel(fkCol);
        const fkVal = row[fkCol] !== undefined ? row[fkCol] : row[camel];
        if (fkVal == null) continue;
        if (!idSets[parentModel].has(fkVal)) { ok = false; b.push({ id: row.id, fkCol, parentModel, fkVal }); break; }
      }
      if (ok) g.push(row);
    }
    validRows[t.model] = g;
    report.skipped[t.model] = b.length;
    if (b.length) {
      report.missingRefs.push({ table: t.model, count: b.length, samples: b.slice(0, 5) });
      console.log(`  ⚠ ${t.model}: ${b.length} orphan row(s) will be SKIPPED (missing parent).`);
    }
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — no data written. Source read + integrity check complete.');
    printReport(report);
    await pg.end(); await prisma.$disconnect();
    return;
  }

  // ── STEP 3: write everything inside ONE transaction (atomic, rollback) ───
  console.log('\n── Importing into MySQL (single transaction) ────────────────');
  const CHUNK = 500;
  try {
    await prisma.$transaction(async (tx) => {
      if (WIPE) {
        // Delete children-first (reverse order) so FK constraints are honoured.
        for (let i = TABLES.length - 1; i >= 0; i--) {
          await tx[accessor(TABLES[i].model)].deleteMany({});
        }
        console.log('  (wiped existing MySQL rows)');
      }
      for (const t of TABLES) {
        const rows = validRows[t.model];
        if (!rows.length) { report.migrated[t.model] = 0; continue; }
        const data = rows.map((r) => transformRow(t.model, r));
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
    console.error('\n✗ MIGRATION FAILED — transaction ROLLED BACK. MySQL left unchanged.');
    console.error('  Reason:', err.message);
    report.errors.push(err.message);
    printReport(report);
    await pg.end(); await prisma.$disconnect();
    process.exit(1);
  }

  // ── STEP 4: post-import MySQL counts ─────────────────────────────────────
  console.log('\n── MySQL row counts (TARGET) ────────────────────────────────');
  for (const t of TABLES) {
    const c = await prisma[accessor(t.model)].count();
    report.target[t.model] = c;
    console.log(`  ${pad(t.model, 22)} ${padL(c, 8)}`);
  }

  // ── STEP 5: data-integrity verification (source vs target) ───────────────
  for (const t of TABLES) {
    const src = report.source[t.model];
    const tgt = report.target[t.model];
    const skip = report.skipped[t.model] || 0;
    const expect = src - skip;
    const status = tgt === expect ? 'OK' : 'MISMATCH';
    report.integrity.push({ table: t.model, source: src, skipped: skip, target: tgt, expected: expect, status });
  }

  // ── STEP 6: dashboard parity (Super Admin stats now read from MySQL) ─────
  let stats = null;
  try {
    const { getSuperAdminStatistics } = require('../src/services/superAdminStatisticsService');
    stats = await getSuperAdminStatistics();
  } catch (e) { report.errors.push('Stats check: ' + e.message); }

  printReport(report, stats);
  await pg.end();
  await prisma.$disconnect();
}

function printReport(report, stats) {
  console.log('\n============================================================');
  console.log(' MIGRATION REPORT');
  console.log('============================================================');

  console.log('\n  TABLE                   SOURCE   SKIPPED   TARGET   STATUS');
  console.log('  ----------------------  -------  -------  -------  --------');
  let tot = { s: 0, k: 0, t: 0 };
  for (const row of report.integrity.length ? report.integrity : TABLES.map((t) => ({
    table: t.model, source: report.source[t.model] || 0,
    skipped: report.skipped[t.model] || 0, target: report.target[t.model] || 0,
    expected: (report.source[t.model] || 0) - (report.skipped[t.model] || 0),
    status: '-',
  }))) {
    tot.s += row.source; tot.k += row.skipped; tot.t += row.target;
    console.log(`  ${pad(row.table, 22)} ${padL(row.source, 7)} ${padL(row.skipped, 8)} ${padL(row.target, 8)}  ${row.status}`);
  }
  console.log('  ----------------------  -------  -------  -------  --------');
  console.log(`  ${pad('TOTAL', 22)} ${padL(tot.s, 7)} ${padL(tot.k, 8)} ${padL(tot.t, 8)}`);

  const migratedTotal = Object.values(report.migrated).reduce((a, b) => a + b, 0);
  console.log(`\n  Migrated records : ${migratedTotal}`);
  console.log(`  Skipped (orphans): ${tot.k}`);
  console.log(`  Failed/errors    : ${report.errors.length}`);

  if (report.missingRefs.length) {
    console.log('\n  MISSING REFERENCES (skipped orphan rows):');
    for (const m of report.missingRefs) {
      console.log(`   - ${m.table}: ${m.count}  e.g. ${JSON.stringify(m.samples[0])}`);
    }
  }

  const mismatches = report.integrity.filter((r) => r.status === 'MISMATCH');
  console.log('\n  DATA INTEGRITY: ' + (mismatches.length ? `${mismatches.length} MISMATCH(es)` : 'all tables match (target = source - skipped)'));
  for (const m of mismatches) {
    console.log(`   - ${m.table}: expected ${m.expected}, got ${m.target}`);
  }

  if (stats) {
    console.log('\n  DASHBOARD (Super Admin stats, read live from MySQL):');
    console.log(`   - totalCompanies     : ${stats.totalCompanies}`);
    console.log(`   - totalBranches      : ${stats.totalBranches}`);
    console.log(`   - combinedEmployees  : ${stats.combinedEmployees}`);
    console.log(`   - activeSubscriptions: ${stats.activeSubscriptions}`);
    console.log(`   - monthlyRevenue     : ${stats.monthlyRevenue}`);
  }

  if (report.errors.length) {
    console.log('\n  ERRORS:');
    for (const e of report.errors) console.log('   - ' + e);
  }
  console.log('\n============================================================\n');
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
