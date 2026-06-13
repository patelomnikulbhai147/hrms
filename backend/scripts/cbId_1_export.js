/**
 * STEP 1: Company/Branch text-id -> INT conversion.
 * Exports all affected tables, builds the id maps, then wipes those tables so
 * the schema migration can re-type the id/FK columns on empty tables.
 *
 * Scheme (collision-free shared sequence): companies 1..C, branches C+1..C+B.
 *   c-gcri=1, c2-seed=2, c-ahmedabad=3, c-bhavnagar=4, c-rajkot=5, c-siddhpur=6,
 *   b1-c2=7, b2-c2=8.
 * User table is NOT wiped (AuditLog FKs it) — its companyId is nulled here and
 * remapped in step 3.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

// tables wiped + reloaded, in child-before-parent delete order
const WIPE_ORDER = ['notification', 'branchPayroll', 'companyPayroll', 'paymentRecord', 'document', 'shift', 'overtime', 'leaveRequest', 'payroll', 'attendance', 'employee', 'branch', 'company'];

(async () => {
  console.log('── STEP 1: export + build maps + wipe (company/branch -> int) ──');

  const companies = await prisma.company.findMany({ orderBy: { createdAt: 'asc' } });
  const branches = await prisma.branch.findMany();
  const companyOrder = new Map(companies.map((c, i) => [c.id, i]));
  branches.sort((a, b) => {
    const oa = companyOrder.has(a.companyId) ? companyOrder.get(a.companyId) : 999;
    const ob = companyOrder.has(b.companyId) ? companyOrder.get(b.companyId) : 999;
    if (oa !== ob) return oa - ob;
    return String(a.branchName || '').localeCompare(String(b.branchName || ''));
  });

  const companyMap = {}; companies.forEach((c, i) => { companyMap[c.id] = i + 1; });
  const branchMap = {}; branches.forEach((b, j) => { branchMap[b.id] = companies.length + j + 1; });
  const combined = { ...companyMap, ...branchMap };
  console.log('companyMap:', JSON.stringify(companyMap));
  console.log('branchMap :', JSON.stringify(branchMap));

  // capture User workspace refs for remap in step 3 (User is NOT wiped)
  const users = await prisma.user.findMany({ select: { id: true, companyId: true, accessibleCompanyIds: true } });
  const userRemap = users.map(u => ({
    id: u.id,
    companyId: u.companyId != null && combined[u.companyId] != null ? combined[u.companyId] : null,
    accessibleCompanyIds: (Array.isArray(u.accessibleCompanyIds) ? u.accessibleCompanyIds : [])
      .map(v => combined[v]).filter(v => v != null),
  }));

  // read all wipe-set tables
  const data = {};
  for (const t of WIPE_ORDER) data[t] = await prisma[t].findMany();

  const out = {
    generatedAt: new Date().toISOString(),
    companyMap, branchMap, combined, userRemap,
    counts: Object.fromEntries(WIPE_ORDER.map(t => [t, data[t].length])),
    data,
  };
  const file = path.resolve(__dirname, '../scratch/cbid-export.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('counts:', JSON.stringify(out.counts));
  console.log('Exported to', file, `(${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);

  // null User.companyId so its column can be re-typed to Int? in step 2
  await prisma.user.updateMany({ data: { companyId: null } });

  // wipe (children-first)
  for (const t of WIPE_ORDER) await prisma[t].deleteMany({});
  console.log('Wiped:', WIPE_ORDER.join(', '));
  console.log('Post-wipe company count:', await prisma.company.count(), '| branch:', await prisma.branch.count(), '| employee:', await prisma.employee.count());

  await prisma.$disconnect();
})().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
