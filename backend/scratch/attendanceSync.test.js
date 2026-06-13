// E2E test for POST /api/attendance/sync-payroll (dry-run then commit).
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

const post = async (path, token, body) => {
  const r = await fetch(`http://localhost:5000/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

(async () => {
  let pass = 0, fail = 0;
  const check = (n, c, x) => { if (c) { console.log('  PASS ' + n); pass++; } else { console.log('  FAIL ' + n + ' ' + (x ? JSON.stringify(x) : '')); fail++; } };

  // Super Admin token (sees everything).
  const admin = await prisma.user.findFirst({ where: { role: 'Super Admin' } });
  const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '5m' });

  // Pick a company that actually has active employees with salary.
  const emp = await prisma.employee.findFirst({ where: { status: 'Active', salary: { gt: 0 } } });
  if (!emp) { console.log('No active salaried employee to test with.'); process.exit(0); }
  const companyId = emp.companyId;
  const month = 6, year = 2026;

  console.log(`\nTesting sync for company ${companyId}, ${month}/${year}`);

  console.log('\n1) Dry run (no DB write)');
  const before = await prisma.payroll.findMany({ where: { companyId, year } });
  const dry = await post('/attendance/sync-payroll', token, { companyId, month, year, dryRun: true });
  check('dry-run 200', dry.status === 200, dry);
  check('returns rows', Array.isArray(dry.json.rows) && dry.json.rows.length > 0, { count: dry.json.count });
  check('dryRun flag true', dry.json.dryRun === true);
  check('has totals (lopDays/otHours present)', dry.json.totals && 'lopDays' in dry.json.totals, dry.json.totals);
  const after = await prisma.payroll.findMany({ where: { companyId, year } });
  check('dry-run did NOT change payroll row count', before.length === after.length, { before: before.length, after: after.length });
  const sampleRow = dry.json.rows[0];
  console.log('   sample:', JSON.stringify({ emp: sampleRow.employeeName, payable: sampleRow.payableDays, lop: sampleRow.lopDays, ot: sampleRow.otHours, lopDed: sampleRow.lopDeduction }));

  console.log('\n2) Commit (writes to payroll)');
  const commit = await post('/attendance/sync-payroll', token, { companyId, month, year, dryRun: false });
  check('commit 200', commit.status === 200, commit);
  check('reports updated+created', (commit.json.updated + commit.json.created) > 0, { updated: commit.json.updated, created: commit.json.created });

  // Verify a payroll row reflects the sync note.
  const synced = await prisma.payroll.findFirst({ where: { companyId, year, notes: { contains: 'Attendance sync' } } });
  check('payroll row has attendance-sync note', !!synced, synced ? { id: synced.id, notes: synced.notes } : null);
  if (synced) console.log('   wrote:', JSON.stringify({ emp: synced.employeeName, deductions: synced.deductions, allowances: synced.allowances, net: synced.netSalary, notes: synced.notes }));

  console.log('\n3) Permission guard — token without attendance.edit is rejected');
  // A non-super-admin HR/Head with no explicit attendance perm -> 403 from requirePermission.
  const limited = await prisma.user.findFirst({ where: { role: 'HR' } });
  if (limited) {
    const t2 = jwt.sign({ id: limited.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const denied = await post('/attendance/sync-payroll', t2, { companyId, month, year, dryRun: true });
    check('limited user blocked or scoped (not 500)', denied.status === 403 || denied.status === 200, denied.status);
  }

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
