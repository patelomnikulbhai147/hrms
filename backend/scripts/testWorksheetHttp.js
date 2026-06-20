// End-to-end test of the Salary Worksheet via the REAL HTTP stack
// (protect -> rbac -> readOnly -> controller -> DB), then verifies the existing
// Payroll aggregate row was kept in sync.
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
const BASE = 'http://localhost:5000/api';

(async () => {
  const u = await prisma.user.findFirst({ where: { role: 'Super Admin' } }) || await prisma.user.findFirst();
  console.log('Acting as user:', u.id, u.role);
  const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-workspace-id': '1' };

  const pr = await prisma.payroll.findFirst();
  if (!pr) { console.log('No payroll rows to test.'); await prisma.$disconnect(); process.exit(0); }
  console.log(`Payroll #${pr.id} — ${pr.employeeName} ${pr.month} ${pr.year} | before: basic=${pr.basicSalary} allow=${pr.allowances} ded=${pr.deductions} net=${pr.netSalary}`);

  // GET
  const g = await fetch(`${BASE}/payroll/${pr.id}/worksheet`, { headers: H });
  console.log('GET status:', g.status);
  const got = await g.json();
  if (g.status !== 200) { console.log('GET body:', got); await prisma.$disconnect(); process.exit(1); }
  console.log('GET worksheet totals:', got.worksheet.totalEarnings, got.worksheet.totalDeductions, 'net', got.worksheet.netSalary, '| derived:', got.worksheet._derived, '| editable:', got.meta.editable);

  // SAVE — set a clean known breakdown
  const payload = {
    earnings: { basic: 30000, hra: 12000, da: 0, conveyance: 1600, medical: 1250, specialAllowance: 5000, educationAllowance: 0, washingAllowance: 0, bonus: 2000, incentive: 1000, overtime: 0, arrears: 0, otherEarnings: 0 },
    deductions: { pf: 3600, eps: 0, vpf: 0, esi: 0, professionalTax: 200, tds: 1500, lwf: 25, advanceRecovery: 0, loanRecovery: 0, insurance: 0, otherDeductions: 0 },
    employer: { employerPf: 3600, employerEsi: 0 },
  };
  const expectedEarnings = Object.values(payload.earnings).reduce((a, b) => a + b, 0);
  const expectedDed = Object.values(payload.deductions).reduce((a, b) => a + b, 0);
  const expectedNet = expectedEarnings - expectedDed;

  const s = await fetch(`${BASE}/payroll/${pr.id}/worksheet`, { method: 'PUT', headers: H, body: JSON.stringify(payload) });
  console.log('SAVE status:', s.status);
  const saved = await s.json();
  if (s.status !== 200) { console.log('SAVE body:', saved); await prisma.$disconnect(); process.exit(1); }
  console.log('SAVE returned net:', saved.worksheet.netSalary, '(expected', expectedNet, ') | payroll agg:', JSON.stringify(saved.payroll));

  // Verify Payroll aggregate row updated in DB (single source of truth)
  const after = await prisma.payroll.findUnique({ where: { id: pr.id } });
  const aggOk = after.basicSalary === 30000 && Math.round(after.netSalary) === expectedNet
    && Math.round(after.allowances) === expectedEarnings - 30000 - 2000 && Math.round(after.deductions) === expectedDed - 1500 && after.tax === 1500;
  console.log(`DB Payroll after: basic=${after.basicSalary} allow=${after.allowances} bonus=${after.bonus} ded=${after.deductions} tax=${after.tax} net=${after.netSalary}`);
  console.log('Aggregate sync correct:', aggOk);

  // Re-GET → persistence + totals match
  const g2 = await fetch(`${BASE}/payroll/${pr.id}/worksheet`, { headers: H });
  const got2 = await g2.json();
  const persistOk = got2.worksheet._derived === false && Math.round(got2.worksheet.netSalary) === expectedNet && got2.worksheet.hra === 12000;
  console.log('Re-GET persists worksheet (net + hra + not-derived):', persistOk);

  // Negative validation
  const bad = await fetch(`${BASE}/payroll/${pr.id}/worksheet`, { method: 'PUT', headers: H, body: JSON.stringify({ earnings: { basic: -100 } }) });
  console.log('Negative basic rejected (expect 400):', bad.status === 400);

  console.log(`\n${g.status === 200 && s.status === 200 && aggOk && persistOk ? '✅ Worksheet end-to-end PASSED' : '❌ FAILED'}`);
  await prisma.$disconnect();
  process.exit(0);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
