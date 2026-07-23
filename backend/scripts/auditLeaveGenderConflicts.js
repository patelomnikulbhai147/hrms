/**
 * Report existing leave records that the gender-eligibility policy would refuse
 * today — records created before the rule existed.
 *
 * READ ONLY. Nothing is changed: pre-policy records stay visible for audit, and
 * deciding what to do with them (reject, or amend the employee's gender) is HR's
 * call, not a script's.
 *
 *   node scripts/auditLeaveGenderConflicts.js [--company 11]
 */
const prisma = require('../src/config/prisma');
const svc = require('../src/services/leaveEligibilityService');

const ci = process.argv.indexOf('--company');
const ONLY = ci > -1 ? Number(process.argv[ci + 1]) : null;

(async () => {
  const where = ONLY ? { companyId: ONLY } : {};
  const leaves = await prisma.leaveRequest.findMany({
    where,
    select: {
      id: true, companyId: true, employeeId: true, employeeName: true,
      leaveType: true, fromDate: true, days: true, status: true,
      employee: { select: { gender: true } },
    },
  });
  console.log(`Leave records examined: ${leaves.length}${ONLY ? ` (company ${ONLY})` : ''}`);

  const typesByCompany = new Map();
  const typesFor = async (cid) => {
    if (!typesByCompany.has(cid)) typesByCompany.set(cid, await svc.listTypes(cid));
    return typesByCompany.get(cid);
  };

  const conflicts = [], noGender = [], unmatched = new Map();
  for (const l of leaves) {
    const types = await typesFor(l.companyId);
    const type = svc.matchType(types, l.leaveType);
    if (!type) {
      unmatched.set(l.leaveType, (unmatched.get(l.leaveType) || 0) + 1);
      continue;
    }
    if (type.eligibleGender === 'All') continue;
    const gender = svc.normalizeGender(l.employee?.gender);
    if (!gender) { noGender.push({ ...l, type }); continue; }
    if (gender !== type.eligibleGender) conflicts.push({ ...l, type, gender });
  }

  const byStatus = (rows) => rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});

  console.log(`\nRecords a ${'gender-restricted'} type where the employee's gender does NOT match: ${conflicts.length}`);
  if (conflicts.length) {
    console.log(`  by status: ${JSON.stringify(byStatus(conflicts))}`);
    const approved = conflicts.filter((c) => c.status === 'Approved');
    console.log(`  APPROVED (already paid): ${approved.length}, totalling ${approved.reduce((s, c) => s + (c.days || 0), 0)} days`);
    conflicts.slice(0, 15).forEach((c) => console.log(
      `   #${c.id} ${c.employeeName} (${c.gender}) — ${c.leaveType} → ${c.type.label} [${c.type.eligibleGender} only], ${c.fromDate}, ${c.days}d, ${c.status}`));
    if (conflicts.length > 15) console.log(`   … and ${conflicts.length - 15} more`);
  }

  console.log(`\nGender-restricted leave on an employee with NO gender recorded: ${noGender.length}`);
  if (noGender.length) {
    console.log(`  by status: ${JSON.stringify(byStatus(noGender))}`);
    noGender.slice(0, 10).forEach((c) => console.log(`   #${c.id} ${c.employeeName} — ${c.leaveType}, ${c.fromDate}, ${c.status}`));
  }

  if (unmatched.size) {
    console.log('\nLeave types not in the master (allowed through, unaffected by the rule):');
    [...unmatched.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([t, n]) => console.log(`   ${String(t).padEnd(22)} ${n}`));
  }

  console.log('\nNothing was changed. New applications are refused; these stay visible for audit');
  console.log('and cannot be approved forward until HR rejects them or corrects the employee record.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
