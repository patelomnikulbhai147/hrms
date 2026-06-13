/**
 * Removes non-roster (test/demo) employees that are not present in the Excel
 * master roster, so MySQL matches the authoritative data exactly. Cascades
 * remove their payroll/attendance/leave rows. Then refreshes branch headcounts
 * and company employeeCount to live values.
 */
require('dotenv').config();
const prisma = require('../src/config/prisma');

const TARGET_IDS = [
  'EMP-AUTO-002', 'TEST-EMP-1780377795469', 'EMP-TEST-001', 'EMP-3936',
  'E5555', 'E9999', 'TEST001', 'VE1831', 'VE2021', 'VE4018',
];
const COMPANY_ID = 'c-gcri';
const BRANCH_IDS = ['c-ahmedabad', 'c-bhavnagar', 'c-rajkot', 'c-siddhpur'];

(async () => {
  const before = await prisma.employee.count({ where: { companyId: COMPANY_ID } });
  const found = await prisma.employee.findMany({ where: { employeeId: { in: TARGET_IDS } }, select: { id: true, employeeId: true, name: true } });
  console.log(`Deleting ${found.length} non-roster employees (cascade removes their payroll/attendance/leave):`);
  for (const e of found) console.log(`  - ${e.employeeId}  "${e.name}"`);
  const res = await prisma.employee.deleteMany({ where: { employeeId: { in: TARGET_IDS } } });
  // refresh live counts
  for (const id of BRANCH_IDS) {
    const n = await prisma.employee.count({ where: { branchId: id } });
    await prisma.branch.update({ where: { id }, data: { headcount: n } });
  }
  const after = await prisma.employee.count({ where: { companyId: COMPANY_ID } });
  await prisma.company.update({ where: { id: COMPANY_ID }, data: { employeeCount: after } });
  console.log(`\nDeleted: ${res.count} | GCRI employees: ${before} -> ${after}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
