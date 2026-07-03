/**
 * READ-ONLY pre-deployment audit — establishes DB ground truth for employee
 * counts (all status buckets, per company + branch) and negative-salary / payroll
 * integrity. No writes.  node scripts/audit-ground-truth.js
 */
const prisma = require('../src/config/prisma');
const j = (o) => JSON.stringify(o, null, 2);

(async () => {
  try {
    console.log('\n================ COMPANIES ================');
    const companies = await prisma.company.findMany({ select: { id: true, name: true, parentCompanyId: true, status: true } }).catch(() => []);
    console.log(j(companies));

    console.log('\n================ EMPLOYEE status values (global) ================');
    const statuses = await prisma.employee.groupBy({ by: ['status'], _count: { _all: true } }).catch((e) => { console.log('groupBy status failed:', e.message); return []; });
    console.log(j(statuses.map((s) => ({ status: s.status, count: s._count._all }))));

    console.log('\n================ EMPLOYEE count per company × status ================');
    const emps = await prisma.employee.findMany({ select: { id: true, companyId: true, branchId: true, status: true, salary: true, name: true, employeeId: true, email: true, biometricId: true } });
    const perCompany = {};
    for (const e of emps) {
      const k = String(e.companyId);
      perCompany[k] = perCompany[k] || { total: 0, byStatus: {}, byBranch: {} };
      perCompany[k].total++;
      perCompany[k].byStatus[e.status] = (perCompany[k].byStatus[e.status] || 0) + 1;
      const b = e.branchId == null ? 'none' : String(e.branchId);
      perCompany[k].byBranch[b] = (perCompany[k].byBranch[b] || 0) + 1;
    }
    console.log(j(perCompany));

    console.log('\n================ TEMPORARY EMPLOYEES per company × status ================');
    const temps = await prisma.temporaryEmployee.findMany({ select: { id: true, companyId: true, branchId: true, status: true } }).catch(() => []);
    const tPer = {};
    for (const t of temps) { const k = String(t.companyId); tPer[k] = tPer[k] || {}; tPer[k][t.status] = (tPer[k][t.status] || 0) + 1; }
    console.log('temp total:', temps.length, j(tPer));

    console.log('\n================ BRANCHES (id → parent company) ================');
    const branches = await prisma.branch.findMany({ select: { id: true, branchName: true, companyId: true, headcount: true } }).catch((e) => { console.log('branch query failed:', e.message); return []; });
    console.log(j(branches.map((b) => ({ id: b.id, name: b.branchName, companyId: b.companyId, headcount: b.headcount }))));

    // Focus on any company with a SMALL number of employees (the "4 employees" case).
    console.log('\n================ SMALL COMPANIES (≤ 10 employees) — full employee dump ================');
    for (const [cid, data] of Object.entries(perCompany)) {
      if (data.total > 10) { console.log(`companyId=${cid}: ${data.total} employees (too many to dump)`); continue; }
      const list = emps.filter((e) => String(e.companyId) === cid);
      console.log(`\ncompanyId=${cid} (${data.total} employees):`);
      list.forEach((e) => console.log(`  id=${e.id} ${e.employeeId} "${e.name}" status=${e.status} branchId=${e.branchId} salary=${e.salary} bio=${e.biometricId || '-'}`));
    }

    console.log('\n================ NEGATIVE / SUSPECT EMPLOYEE.salary ================');
    const negSal = emps.filter((e) => Number(e.salary) < 0);
    console.log(`employees with salary < 0: ${negSal.length}`);
    negSal.slice(0, 20).forEach((e) => console.log(`  id=${e.id} ${e.employeeId} "${e.name}" salary=${e.salary} company=${e.companyId}`));

    console.log('\n================ PAYROLL integrity ================');
    const pr = await prisma.payroll.findMany({ select: { id: true, companyId: true, employeeId: true, employeeName: true, month: true, year: true, basicSalary: true, allowances: true, deductions: true, netSalary: true, bonus: true, overtime: true, tax: true } });
    console.log(`payroll rows total: ${pr.length}`);
    const negNet = pr.filter((p) => Number(p.netSalary) < 0);
    const negGross = pr.filter((p) => (Number(p.basicSalary) + Number(p.allowances || 0)) < 0);
    const negDed = pr.filter((p) => Number(p.deductions) < 0);
    const nanRows = pr.filter((p) => [p.basicSalary, p.allowances, p.deductions, p.netSalary].some((v) => v == null || Number.isNaN(Number(v))));
    console.log(`  netSalary < 0     : ${negNet.length}`);
    console.log(`  gross < 0         : ${negGross.length}`);
    console.log(`  deductions < 0    : ${negDed.length}`);
    console.log(`  null/NaN money    : ${nanRows.length}`);
    console.log('\n  sample negative-net payroll rows:');
    negNet.slice(0, 15).forEach((p) => console.log(`   id=${p.id} co=${p.companyId} emp=${p.employeeId} "${p.employeeName}" ${p.month}/${p.year} basic=${p.basicSalary} allow=${p.allowances} ded=${p.deductions} bonus=${p.bonus} ot=${p.overtime} tax=${p.tax} => NET=${p.netSalary}`));
    // Recompute check: does netSalary equal basic+allow+ot+bonus-deductions?
    console.log('\n  net-salary recompute mismatches (|stored − computed| > 1):');
    let mm = 0;
    for (const p of pr) {
      const computed = Number(p.basicSalary || 0) + Number(p.allowances || 0) + Number(p.overtime || 0) + Number(p.bonus || 0) - Number(p.deductions || 0);
      if (Math.abs(computed - Number(p.netSalary || 0)) > 1) { mm++; if (mm <= 15) console.log(`   id=${p.id} emp=${p.employeeId} stored=${p.netSalary} computed=${Math.round(computed)} (basic=${p.basicSalary} allow=${p.allowances} ot=${p.overtime} bonus=${p.bonus} ded=${p.deductions})`); }
    }
    console.log(`  total recompute mismatches: ${mm} of ${pr.length}`);
  } catch (e) {
    console.error('audit failed:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
