/**
 * Backfill companyNo + branchNo sequential business numbers.
 *  - companyNo: companies ordered by createdAt asc (Vishv Enterprise = 1).
 *  - branchNo : branches ordered by (their company's createdAt, branchName) so
 *    the head company's branches come first alphabetically (Ahmedabad=1 …).
 * Internal text IDs are left untouched.
 */
require('dotenv').config();
const prisma = require('../src/config/prisma');

(async () => {
  // ── companyNo ──
  const companies = await prisma.company.findMany({ orderBy: { createdAt: 'asc' } });
  let cNo = 0;
  for (const c of companies) {
    cNo++;
    await prisma.company.update({ where: { id: c.id }, data: { companyNo: cNo } });
  }
  console.log('companyNo assigned:');
  for (const c of companies) console.log(`  ${(await prisma.company.findUnique({ where: { id: c.id } })).companyNo} = ${c.name} (${c.id})`);

  // ── branchNo ──
  const companyOrder = new Map(companies.map((c, i) => [c.id, i]));
  const branches = await prisma.branch.findMany();
  branches.sort((a, b) => {
    const oa = companyOrder.has(a.companyId) ? companyOrder.get(a.companyId) : 999;
    const ob = companyOrder.has(b.companyId) ? companyOrder.get(b.companyId) : 999;
    if (oa !== ob) return oa - ob;
    return String(a.branchName || '').localeCompare(String(b.branchName || ''));
  });
  let bNo = 0;
  for (const b of branches) {
    bNo++;
    await prisma.branch.update({ where: { id: b.id }, data: { branchNo: bNo } });
  }
  console.log('\nbranchNo assigned:');
  const finalBranches = await prisma.branch.findMany({ orderBy: { branchNo: 'asc' }, select: { branchNo: true, branchName: true, id: true, companyId: true } });
  for (const b of finalBranches) console.log(`  ${b.branchNo} = ${b.branchName} (${b.id})`);

  console.log('\nNext companyNo:', (companies.length) + 1, '| Next branchNo:', branches.length + 1);
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
