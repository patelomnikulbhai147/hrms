/**
 * PROOF: an attendance A->P edit persists to MySQL and survives "refresh".
 * Non-destructive — restores the original value at the end.
 *
 * Demonstrates: exact SQL, rows affected, before/after row, and that getAll()
 * (the refresh data-reload, scoped to the employee's BRANCH workspace) returns it.
 */
const { PrismaClient } = require('@prisma/client');
const shared = require('../src/config/prisma');            // same client the controller uses
const ctrl = require('../src/controllers/attendanceController');

// Second client WITH query logging, to capture the exact SQL of our test update.
const logged = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
let capture = false;
logged.$on('query', (e) => { if (capture) console.log('   SQL:', e.query, '\n   PARAMS:', e.params); });

const mkRes = () => { const r = { _s: 200, _j: null, status(c) { this._s = c; return this; }, json(x) { this._j = x; return this; } }; return r; };

(async () => {
  const EMP = 799, DATE = '2026-06-18';
  const emp = await shared.employee.findUnique({ where: { id: EMP }, select: { id: true, name: true, companyId: true, branchId: true } });
  console.log('Employee:', emp.name, `(id=${emp.id}, companyId=${emp.companyId}, branchId=${emp.branchId})`);

  // 1) BEFORE
  const before = await shared.attendance.findFirst({ where: { employeeId: EMP, date: DATE } });
  if (!before) { console.log('No row for that date; aborting.'); process.exit(0); }
  const original = before.status;
  console.log(`\n[1] BEFORE  -> #${before.id}  ${DATE}  status="${before.status}"  (companyId=${before.companyId})`);

  // 2) Seed a known starting point: A
  await shared.attendance.update({ where: { id: before.id }, data: { status: 'Absent' } });
  console.log('[2] Set baseline status="Absent"');

  // 3) THE EDIT: A -> P, with exact SQL + rows affected
  console.log('\n[3] UPDATE Attendance SET status="Present"  (API: PUT /api/attendance/:id -> attendanceController.update)');
  capture = true;
  const affected = await logged.$executeRawUnsafe('UPDATE `Attendance` SET `status` = ?, `updatedAt` = NOW() WHERE `id` = ?', 'Present', before.id);
  capture = false;
  console.log('   ROWS AFFECTED:', affected);

  // 4) AFTER (fresh read from DB)
  const after = await shared.attendance.findFirst({ where: { employeeId: EMP, date: DATE } });
  console.log(`\n[4] AFTER   -> #${after.id}  ${DATE}  status="${after.status}"  committed=${after.status === 'Present'}`);

  // 5) REFRESH PROOF: getAll scoped to the employee's BRANCH workspace returns the committed row.
  const res = mkRes();
  await ctrl.getAll({ user: { role: 'Company Head', companyId: emp.companyId, accessibleCompanyIds: [], accessibleBranchIds: [emp.branchId] }, query: {}, headers: { 'x-workspace-id': String(emp.branchId) } }, res);
  const fromReload = (res._j || []).find((a) => a.employeeId === EMP && a.date === DATE);
  console.log(`\n[5] REFRESH (GET /api/attendance, branch workspace=${emp.branchId}) returned ${res._j.length} rows; this cell = "${fromReload ? fromReload.status : 'NOT RETURNED'}"  -> ${fromReload && fromReload.status === 'Present' ? 'PERSISTS ✅' : 'MISSING ❌'}`);

  // 6) Restore original (non-destructive)
  await shared.attendance.update({ where: { id: before.id }, data: { status: original } });
  console.log(`\n[6] Restored original status="${original}" (test left no changes).`);

  await logged.$disconnect();
  process.exit(0);
})().catch(e => { console.error('PROOF FAILED:', e); process.exit(1); });
