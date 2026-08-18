// Repair mathematically irreconcilable payroll rows through the ONE payroll
// engine (payrollController.recalcOne). A row is irreconcilable when its stored
// net salary cannot be derived from its own components:
//   expectedNet = max(0, basic + allowances + bonus − deductions − loanDeduction)
//
// Known corruption class (verified 2026-08-18): 772 "June 2026" company-1 rows
// written by a pre-engine path with identical synthetic money fields (basic 750
// / allowances 9000 / deductions 15545 / net 11455) and zeroed attendance
// mirrors, then locked + marked paid; plus 25 legacy seeded rows in the demo/QA
// companies (11, 13).
//
// Behaviour:
//   node scripts/repairIrreconcilablePayroll.js               → DRY report only
//   node scripts/repairIrreconcilablePayroll.js --apply       → repair UNLOCKED bad rows
//   node scripts/repairIrreconcilablePayroll.js --apply --include-locked
//        → also repair locked bad rows (their attendance-summary lock is lifted)
//
// Every repaired row is recomputed from its REAL AttendanceSummary by the same
// engine that computes live payroll — nothing is hardcoded. Because the amounts
// change, a previously approved/paid/locked repaired row is reset to
// draft/pending (rule: a regenerated payroll must be re-approved and re-paid;
// a stale "Paid" badge on figures that were never real is misleading). All
// originals are backed up to backend/backups/ first.
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const APPLY = process.argv.includes('--apply');
const INCLUDE_LOCKED = process.argv.includes('--include-locked');
// --exclude-company=22[,23…] leaves whole companies untouched. Needed on live:
// a tenant that never records attendance can hold UNPRORATED-fingerprint rows
// whose money is the documented full-month fallback (only workingDays = 0 is
// wrong) — repairing them would fabricate an all-absent summary and slash the
// drafts, so the operator excludes them and they self-heal on regeneration.
const EXCLUDE_COMPANIES = process.argv
  .filter((a) => a.startsWith('--exclude-company='))
  .flatMap((a) => a.split('=')[1].split(','))
  .map(Number)
  .filter((n) => Number.isFinite(n));

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const expectedNet = (r) =>
  Math.max(0, (r.basicSalary || 0) + (r.allowances || 0) + (r.bonus || 0) - (r.deductions || 0) - (r.loanDeduction || 0));
// Second corruption class: UN-PRORATED rows. The engine always writes
// workingDays > 0 (a real summary, or the days-in-month fallback), so a row
// holding money with workingDays = 0 was never computed by the engine — it is
// the old full-month formula (basic = full salary, HRA 40%, special 10%,
// ESI wrongly at the 3.25% employer rate) with a gross no component of the
// attendance record can explain (e.g. ₹27,000 against payableDays 0).
const isUnprorated = (r) =>
  (r.workingDays || 0) <= 0 && ((r.basicSalary || 0) + (r.allowances || 0)) > 0;

(async () => {
  const rows = await prisma.payroll.findMany();
  const bad = rows.filter((r) => Math.abs(expectedNet(r) - (r.netSalary || 0)) > 1 || isUnprorated(r));

  const groups = {};
  for (const r of bad) {
    const cls = isUnprorated(r) ? 'UNPRORATED' : 'IRRECONCILABLE';
    const k = `${cls} ${r.month} ${r.year} C${r.companyId} [${r.payrollStatus}/${r.paymentStatus}${r.isOutdated ? ' OUTDATED' : ''}]`;
    groups[k] = (groups[k] || 0) + 1;
  }
  console.log(`Scanned ${rows.length} payroll rows — needing repair (irreconcilable or un-prorated): ${bad.length}`);
  for (const [k, n] of Object.entries(groups)) console.log(`  ${n.toString().padStart(4)} × ${k}`);
  if (!bad.length) { console.log('Nothing to repair.'); await prisma.$disconnect(); return; }

  const inScope = EXCLUDE_COMPANIES.length
    ? bad.filter((r) => !EXCLUDE_COMPANIES.includes(r.companyId))
    : bad;
  const excludedCount = bad.length - inScope.length;
  const locked = inScope.filter((r) => r.payrollStatus === 'locked');
  const targets = INCLUDE_LOCKED ? inScope : inScope.filter((r) => r.payrollStatus !== 'locked');
  if (!APPLY) {
    console.log(`\nDRY RUN — no changes. ${targets.length} row(s) would be repaired` +
      (excludedCount ? ` (${excludedCount} row(s) in excluded companies [${EXCLUDE_COMPANIES.join(',')}] skipped)` : '') +
      (INCLUDE_LOCKED ? ' (including locked)' : ` (${locked.length} locked row(s) EXCLUDED — add --include-locked)`) +
      '. Run with --apply to repair.');
    await prisma.$disconnect();
    return;
  }

  // ── Backup originals before any change ─────────────────────────────────────
  const backupDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `payroll-reconcile-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(targets, null, 1));
  console.log(`\nBacked up ${targets.length} original row(s) → ${backupFile}`);

  const { recalcOne } = require('../src/controllers/payrollController');
  const attendanceSummaryService = require('../src/services/attendanceSummaryService');

  let repaired = 0, statusReset = 0, failures = 0, stillBad = 0;
  for (const r of targets) {
    try {
      const wasFinal = r.payrollStatus === 'locked' || r.payrollStatus === 'approved' ||
        r.payrollStatus === 'paid' || String(r.paymentStatus).toLowerCase() === 'paid';

      // A locked row blocks nothing here by itself, but its attendance summary
      // lock must be lifted so the snapshot can be refreshed.
      if (r.payrollStatus === 'locked') {
        await prisma.attendanceSummary.updateMany({
          where: { employeeId: r.employeeId, month: r.month, year: r.year },
          data: { locked: false },
        });
      }

      // Refresh the canonical attendance snapshot (best-effort — the engine
      // falls back to the stored summary when the recompute cannot run).
      try { await attendanceSummaryService.recompute(r.employeeId, r.month, r.year); } catch (_) { /* use stored */ }
      const summary = await prisma.attendanceSummary.findUnique({
        where: { employeeId_month_year: { employeeId: r.employeeId, month: r.month, year: r.year } },
      });
      const emp = await prisma.employee.findUnique({ where: { id: r.employeeId } });
      const company = await prisma.company.findUnique({ where: { id: emp?.companyId || r.companyId } });

      // THE engine — same computation as live payroll. Sets isOutdated:false.
      await recalcOne(r, summary, emp, company);

      // Regenerated figures differ from what was "approved/paid", so the row
      // returns to the start of the lifecycle for an explicit re-approval.
      if (wasFinal) {
        await prisma.payroll.update({
          where: { id: r.id },
          data: { payrollStatus: 'draft', paymentStatus: 'pending', payslipGenerated: false, lockedAt: null },
        });
        statusReset++;
      }

      const after = await prisma.payroll.findUnique({ where: { id: r.id } });
      if (Math.abs(expectedNet(after) - (after.netSalary || 0)) > 1 || isUnprorated(after)) stillBad++;
      repaired++;
    } catch (e) {
      failures++;
      console.error(`  FAILED id=${r.id} emp=${r.employeeId} ${r.month} ${r.year}: ${e.message}`);
    }
  }

  await prisma.auditLog.create({
    data: {
      action: 'REPAIR_PAYROLL_RECONCILIATION',
      module: 'Payroll',
      targetId: `batch-${Date.now()}`,
      details: JSON.stringify({ scanned: rows.length, irreconcilable: bad.length, repaired, statusReset, failures, backupFile: path.basename(backupFile) }).slice(0, 1000),
      userId: 1,
    },
  }).catch(() => {});

  console.log(`\nRepaired ${repaired}/${targets.length} row(s) via the payroll engine ` +
    `(${statusReset} reset to draft/pending for re-approval, ${failures} failure(s), ${stillBad} still irreconcilable).`);
  await prisma.$disconnect();
  process.exit(failures || stillBad ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
