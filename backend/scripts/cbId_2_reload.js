/**
 * STEP 3: reload all tables with company/branch refs remapped to INT.
 * Run AFTER the schema migration (Company.id/Branch.id + FK cols now Int).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const prisma = require('../src/config/prisma');

const FIELD_TYPE = {}; const SCALARS = {};
for (const m of Prisma.dmmf.datamodel.models) {
  FIELD_TYPE[m.name] = {}; SCALARS[m.name] = new Set();
  for (const f of m.fields) { if (f.kind === 'object') continue; SCALARS[m.name].add(f.name); FIELD_TYPE[m.name][f.name] = f.type; }
}
function coerce(model, row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (!SCALARS[model].has(k)) continue;
    if (v === null || v === undefined) { out[k] = v; continue; }
    const t = FIELD_TYPE[model][k];
    if (t === 'DateTime') out[k] = new Date(v);
    else if (t === 'Int') out[k] = typeof v === 'number' ? v : parseInt(v, 10);
    else if (t === 'Float') out[k] = typeof v === 'number' ? v : parseFloat(v);
    else if (t === 'Boolean') out[k] = Boolean(v);
    else out[k] = v;
  }
  return out;
}

// per-table: accessor, Prisma model name, and which fields map via company/branch
const TABLES = [
  { acc: 'company',        model: 'Company',        company: ['parentCompanyId'], selfCompany: 'id' },
  { acc: 'branch',         model: 'Branch',         company: ['companyId'],       selfBranch: 'id' },
  { acc: 'employee',       model: 'Employee',       company: ['companyId'], branch: ['branchId'] },
  { acc: 'shift',          model: 'Shift',          company: ['companyId'] },
  { acc: 'attendance',     model: 'Attendance',     company: ['companyId'] },
  { acc: 'leaveRequest',   model: 'LeaveRequest',   company: ['companyId'] },
  { acc: 'overtime',       model: 'Overtime',       company: ['companyId'] },
  { acc: 'payroll',        model: 'Payroll',        company: ['companyId'] },
  { acc: 'branchPayroll',  model: 'BranchPayroll',  company: ['companyId'], branch: ['branchId'] },
  { acc: 'companyPayroll', model: 'CompanyPayroll', company: ['companyId'] },
  { acc: 'paymentRecord',  model: 'PaymentRecord',  company: ['companyId'] },
  { acc: 'document',       model: 'Document',       company: ['companyId'] },
  { acc: 'notification',   model: 'Notification',   company: ['companyId'] },
];

(async () => {
  console.log('── STEP 3: reload with INT company/branch ids ──');
  const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../scratch/cbid-export.json'), 'utf8'));
  const { companyMap, branchMap, userRemap } = data;
  const CHUNK = 200;

  for (const t of TABLES) {
    const rows = data.data[t.acc] || [];
    const mapped = rows.map(r => {
      const o = coerce(t.model, r);
      if (t.selfCompany) o[t.selfCompany] = companyMap[r[t.selfCompany]];
      if (t.selfBranch) o[t.selfBranch] = branchMap[r[t.selfBranch]];
      for (const f of (t.company || [])) o[f] = r[f] != null ? (companyMap[r[f]] ?? null) : null;
      for (const f of (t.branch || [])) o[f] = r[f] != null ? (branchMap[r[f]] ?? null) : null;
      return o;
    }).filter(o => {
      // drop rows whose required parent ref didn't map (shouldn't happen)
      if (t.selfCompany && o[t.selfCompany] == null) return false;
      if (t.selfBranch && o[t.selfBranch] == null) return false;
      return true;
    });
    let n = 0;
    for (let i = 0; i < mapped.length; i += CHUNK) { const res = await prisma[t.acc].createMany({ data: mapped.slice(i, i + CHUNK) }); n += res.count; }
    console.log(`  ${t.model.padEnd(16)} ${n}/${rows.length}`);
  }

  // remap User workspace refs (User was not wiped)
  let uFixed = 0;
  for (const u of userRemap) {
    await prisma.user.update({ where: { id: u.id }, data: { companyId: u.companyId, accessibleCompanyIds: u.accessibleCompanyIds } });
    uFixed++;
  }
  console.log(`  Users remapped: ${uFixed}`);

  // verify
  console.log('\nVERIFY:');
  const comps = await prisma.company.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true } });
  console.log('  companies:', JSON.stringify(comps));
  const brs = await prisma.branch.findMany({ orderBy: { id: 'asc' }, select: { id: true, companyId: true, branchName: true } });
  console.log('  branches:', JSON.stringify(brs));
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
