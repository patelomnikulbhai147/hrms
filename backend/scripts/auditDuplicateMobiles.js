/**
 * One-time (re-runnable) AUDIT — find duplicate mobile numbers across the whole
 * HRMS. READ-ONLY: it never deletes, merges, or modifies a single record. It just
 * reports, so a Super Admin can decide what to merge/remove manually.
 *
 * Scans:
 *   • TemporaryEmployee.mobile   (Pending Profile / Pending Approval / Converted / …)
 *   • Employee.phone             (Active / Previous / Archived / any status)
 * and reports any mobile that appears more than once — within a table OR across
 * the two (the same number on a temp AND a real employee).
 *
 * Matching is digit-normalised so +91 / spaces / dashes group together.
 *
 *   node scripts/auditDuplicateMobiles.js            # console report
 *   node scripts/auditDuplicateMobiles.js --json     # also print machine-readable JSON
 */
const prisma = require('../src/config/prisma');

const digitsOf = (m) => String(m == null ? '' : m).replace(/\D/g, '');
const fmtDate = (d) => { try { return d ? new Date(d).toISOString().slice(0, 10) : '—'; } catch { return '—'; } };

(async () => {
  try {
    const [temps, emps] = await Promise.all([
      prisma.temporaryEmployee.findMany({
        select: { tempEmployeeId: true, name: true, mobile: true, status: true, createdAt: true, companyId: true },
      }),
      prisma.employee.findMany({
        where: { phone: { not: null } },
        select: { employeeId: true, name: true, phone: true, status: true, createdAt: true, companyId: true },
      }),
    ]);

    // Group every identity by its normalised mobile.
    const groups = new Map(); // digits -> [{ source, code, name, mobile, status, createdAt, companyId }]
    const push = (digits, rec) => { if (!digits) return; if (!groups.has(digits)) groups.set(digits, []); groups.get(digits).push(rec); };
    for (const t of temps) push(digitsOf(t.mobile), { source: 'Temporary', code: t.tempEmployeeId, name: t.name, mobile: t.mobile, status: t.status, createdAt: t.createdAt, companyId: t.companyId });
    for (const e of emps) push(digitsOf(e.phone), { source: 'Employee', code: e.employeeId, name: e.name, mobile: e.phone, status: e.status, createdAt: e.createdAt, companyId: e.companyId });

    const dupGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1)
      .sort((a, b) => b[1].length - a[1].length);

    const totalIdentities = temps.length + emps.length;
    console.log('');
    console.log('============================================================');
    console.log(' DUPLICATE MOBILE NUMBER AUDIT (read-only — nothing changed)');
    console.log('============================================================');
    console.log(` Scanned: ${temps.length} temporary + ${emps.length} employee = ${totalIdentities} identities`);
    console.log(` Duplicate mobile numbers found: ${dupGroups.length}`);
    console.log('------------------------------------------------------------');

    if (!dupGroups.length) {
      console.log(' ✓ No duplicate mobile numbers. Safe to add the UNIQUE index:');
      console.log('     node scripts/addUniqueMobileIndex.js');
    } else {
      for (const [digits, rows] of dupGroups) {
        const shown = rows[0]?.mobile || digits;
        console.log('');
        console.log(` Mobile: ${shown}   (${rows.length} records)`);
        // Sort oldest-first so the original is obvious (keep it; remove the rest).
        rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        for (const r of rows) {
          console.log(`   • ${r.code.padEnd(16)} ${String(r.source).padEnd(10)} ${String(r.status || '').padEnd(26)} created ${fmtDate(r.createdAt)}  — ${r.name || ''}`);
        }
      }
      console.log('');
      console.log('------------------------------------------------------------');
      console.log(' Action: a Super Admin should keep ONE record per mobile (usually');
      console.log(' the oldest) and remove/merge the rest via the Employees module');
      console.log(' (Temporary tab → delete the extra temp; or archive the employee).');
      console.log(' Re-run this audit until it shows 0, then add the DB constraint:');
      console.log('     node scripts/addUniqueMobileIndex.js');
    }
    console.log('============================================================');
    console.log('');

    if (process.argv.includes('--json')) {
      const payload = dupGroups.map(([digits, rows]) => ({ mobileDigits: digits, count: rows.length, records: rows }));
      console.log('JSON_REPORT_BEGIN');
      console.log(JSON.stringify(payload, null, 2));
      console.log('JSON_REPORT_END');
    }
  } catch (e) {
    console.error('Audit failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
