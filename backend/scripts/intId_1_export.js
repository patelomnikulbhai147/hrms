/**
 * STEP 1 of Employee UUID -> INT AUTO_INCREMENT conversion.
 *
 * - Reads every employee + every child row that references an employee.
 * - Builds the old(uuid)->new(int) map, ids assigned 1..N sorted by employeeId.
 * - Saves everything to scratch/intid-export.json.
 * - Nulls the loose Document/User employee refs (so their columns can be
 *   re-typed to Int), then DELETES the child rows + employees so the schema
 *   migration runs against empty tables.
 *
 * Other tables (Company, Branch, User, etc.) are left untouched.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

(async () => {
  console.log('── STEP 1: export + build map + wipe employee data ──');

  const employees = await prisma.employee.findMany();
  // Deterministic order: employeeId (code) ascending, numeric-aware.
  employees.sort((a, b) => String(a.employeeId || '').localeCompare(String(b.employeeId || ''), undefined, { numeric: true }));

  const map = {}; // oldUuid -> newInt
  employees.forEach((e, i) => { map[e.id] = i + 1; });
  console.log(`Employees: ${employees.length} -> ids 1..${employees.length}`);

  const [attendance, payroll, leaveRequest, overtime, documents] = await Promise.all([
    prisma.attendance.findMany(),
    prisma.payroll.findMany(),
    prisma.leaveRequest.findMany(),
    prisma.overtime.findMany(),
    prisma.document.findMany(),
  ]);

  // Orphan check (should be none, FK-enforced): any child employeeId not in map?
  const orphans = {};
  for (const [name, rows] of [['attendance', attendance], ['payroll', payroll], ['leaveRequest', leaveRequest], ['overtime', overtime]]) {
    const bad = rows.filter(r => !(r.employeeId in map));
    if (bad.length) orphans[name] = bad.length;
  }
  console.log('Orphan child rows (employeeId not matching any employee):', JSON.stringify(orphans));

  // Document employeeId mapping (loose ref): docId -> newInt | null
  const docMap = {};
  for (const d of documents) docMap[d.id] = (d.employeeId && d.employeeId in map) ? map[d.employeeId] : null;

  const out = {
    generatedAt: new Date().toISOString(),
    map,
    counts: { employees: employees.length, attendance: attendance.length, payroll: payroll.length, leaveRequest: leaveRequest.length, overtime: overtime.length },
    employees,
    attendance, payroll, leaveRequest, overtime,
    docMap,
  };
  const file = path.resolve(__dirname, '../scratch/intid-export.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('Exported to', file, `(${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);

  // ── wipe so the type migration runs on empty tables ──
  await prisma.document.updateMany({ data: { employeeId: null } });          // null loose ref (column will become Int?)
  await prisma.attendance.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.overtime.deleteMany({});
  await prisma.employee.deleteMany({});
  console.log('Wiped: attendance, payroll, leaveRequest, overtime, employee (Document.employeeId nulled).');
  console.log('Post-wipe employee count:', await prisma.employee.count());

  await prisma.$disconnect();
})().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
