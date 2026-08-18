// One-off tenant correction for 12 payroll rows (security audit 2026-08-18).
//
// Forensics (AuditLog-proven): employees 850/851/852 (EMP0001-0003) were
// created in C18 "OMNIEX" on 2026-07-20 and their April-July 2026 draft payroll
// was generated same-company in C18/C14 at creation time. On 2026-08-05 the
// C22 "ZENIA HR" Company Head re-parented all three employee rows to C22 via
// the import flow (which upserts by the GLOBALLY-unique employeeId code, so
// generic codes like EMP0001 hijack rows across tenants). The payroll rows did
// not move with them — leaving a C22 employee's salary drafts visible inside
// the C14/C18 workspaces (cross-tenant leak) and breaking the
// Payroll.companyId ↔ Employee.companyId invariant.
//
// Fix: re-scope exactly these 12 draft rows to the employees' actual parent
// company (22 — a real Company row; branchId is NULL so no branch resolution
// applies). Collision-checked (no C22 row exists for any emp+month+year moved),
// nothing deleted, money/status untouched, full audit log written.
//
//   node scripts/repairPayrollTenant20260818.js          → dry run
//   node scripts/repairPayrollTenant20260818.js --apply  → apply
const prisma = require('../src/config/prisma');

const APPLY = process.argv.includes('--apply');
const TARGET_COMPANY = 22;
const ROWS = [1666, 1667, 1668, 1669, 1670, 1671, 2537, 2539, 2541, 3493, 3494, 3497];
const EMPLOYEES = [850, 851, 852];

(async () => {
  const rows = await prisma.payroll.findMany({
    where: { id: { in: ROWS } },
    select: { id: true, companyId: true, employeeId: true, month: true, year: true, payrollStatus: true, paymentStatus: true },
    orderBy: { id: 'asc' },
  });

  // Guard: every row must still look exactly like the audited state — a draft,
  // filed under C14/C18, for one of the three re-parented employees.
  const unexpected = rows.filter(
    (r) => ![14, 18].includes(r.companyId) || !EMPLOYEES.includes(r.employeeId) || r.payrollStatus !== 'draft'
  );
  const alreadyDone = rows.filter((r) => r.companyId === TARGET_COMPANY);
  if (alreadyDone.length === rows.length && rows.length > 0) {
    console.log('All rows already corrected — nothing to do.');
    await prisma.$disconnect();
    return;
  }
  if (unexpected.length) {
    console.error('ABORT — rows no longer match the audited state:', unexpected);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Guard: the employees must still belong to the target company.
  const emps = await prisma.employee.findMany({
    where: { id: { in: EMPLOYEES } },
    select: { id: true, companyId: true, branchId: true },
  });
  const wrongTenant = emps.filter((e) => e.companyId !== TARGET_COMPANY);
  if (wrongTenant.length) {
    console.error('ABORT — employee tenancy changed since the audit:', wrongTenant);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Guard: no duplicate would be created in the target company.
  for (const r of rows) {
    const clash = await prisma.payroll.findFirst({
      where: { companyId: TARGET_COMPANY, employeeId: r.employeeId, month: r.month, year: r.year, id: { not: r.id } },
      select: { id: true },
    });
    if (clash) {
      console.error(`ABORT — collision: payroll ${clash.id} already exists for emp ${r.employeeId} ${r.month} ${r.year} in C${TARGET_COMPANY}.`);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  for (const r of rows) console.log(`  ${r.id}: C${r.companyId} → C${TARGET_COMPANY}  emp=${r.employeeId} ${r.month} ${r.year} [${r.payrollStatus}/${r.paymentStatus}]`);
  if (!APPLY) {
    console.log(`\nDRY RUN — ${rows.length} row(s) would be re-scoped to C${TARGET_COMPANY}. Run with --apply.`);
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.payroll.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, companyId: { in: [14, 18] } },
      data: { companyId: TARGET_COMPANY },
    });
    await tx.auditLog.create({
      data: {
        userId: 1,
        action: 'REPAIR_PAYROLL_TENANT',
        module: 'Payroll',
        targetId: rows.map((r) => r.id).join(','),
        details: JSON.stringify({
          reason: 'Employees 850-852 re-parented C18/C14→C22 on 2026-08-05 via import-by-employeeId-code; their Apr–Jul 2026 draft payroll stayed under the old tenants (cross-tenant salary visibility). companyId corrected to the employees\' parent company.',
          oldCompanyIds: Object.fromEntries(rows.map((r) => [r.id, r.companyId])),
          newCompanyId: TARGET_COMPANY,
          backups: 'pre-tenantfix-20260818-130114.sql.gz + tenantfix-12rows-20260818-130114.tsv',
        }).slice(0, 1500),
      },
    });
    return updated;
  });

  const remaining = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM Payroll p JOIN Employee e ON p.employeeId = e.id
    WHERE p.companyId <> e.companyId AND p.companyId NOT IN (SELECT id FROM Branch)`;
  console.log(`\nRe-scoped ${result.count}/${rows.length} row(s) to C${TARGET_COMPANY}. Cross-company payroll remaining: ${Number(remaining[0].n)}.`);
  await prisma.$disconnect();
  process.exit(result.count === rows.length ? 0 : 1);
})().catch(async (e) => { console.error('FATAL:', e); await prisma.$disconnect(); process.exit(1); });
