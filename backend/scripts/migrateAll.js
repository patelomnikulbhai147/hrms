/**
 * Run every ADDITIVE, idempotent schema migration in sequence — the safe way to
 * bring a database (esp. production RDS) up to date WITHOUT `prisma db push`
 * (which would drop drifted-but-used columns/tables like nominee_audit_logs).
 *
 * Each script runs in its own child process (clean Prisma connect/disconnect)
 * and is fully guarded ("ADD COLUMN if missing" / "CREATE TABLE IF NOT EXISTS"),
 * so re-running is safe and one failure never blocks the rest.
 *
 *   node scripts/migrateAll.js
 * Then:  npx prisma generate  &&  pm2 reload hrms-backend
 */
const { spawnSync } = require('child_process');
const path = require('path');

// Order matters only loosely (tables before the columns that extend them).
// Backfills and the UNIQUE-index migration are intentionally EXCLUDED — they are
// not needed to make reads work and can fail on existing data; run them by hand.
const SCRIPTS = [
  'addCompanyProfileFields.js',   // ← Company profile columns (fixes the empty Companies table)
  'syncEmployeeColumns.js',       // ← ALL Employee columns (fixes biometricId drift → 0 employees)
  'addEmployeeStateCity.js',      // Employee.state / city (also covered by sync; kept for safety)
  'addLocationMasters.js',        // location_masters
  'addComplianceReportLogs.js',   // compliance_report_logs
  'createNomineeTables.js',       // employee_nominees / nominee_documents / nominee_audit_logs
  'createPayrollWorksheetTables.js', // payroll_worksheet (+ audit)
  'addAttendanceImportSafety.js', // attendance_import_logs / unmatched_attendance_queue
  'createAttendanceDevices.js',   // ← base attendance_devices table (fixes "table doesn't exist")
  'addVendorArchitecture.js',     // attendance_devices cols + attendance_vendors (+ seed)
  'addDeviceConfigColumns.js',    // attendance_devices config columns
  'addEmployeeBonusModel.js',     // Employee bonus cols + Payroll.overtime + employee_bonuses
];

const results = [];
for (const script of SCRIPTS) {
  console.log(`\n================  ${script}  ================`);
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
  results.push({ script, ok: r.status === 0 });
}

console.log('\n================  SUMMARY  ================');
for (const { script, ok } of results) console.log(`${ok ? '✓' : '✗'}  ${script}`);
const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.log(`\n${failed.length} script(s) reported an error (often a missing parent table — safe to investigate individually).`);
} else {
  console.log('\n✅ All migrations applied/verified. Now run: npx prisma generate  then  pm2 reload hrms-backend');
}
process.exit(0);
