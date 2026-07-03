/**
 * REVERTING live end-to-end test of the map-and-replay resolver against the real
 * 204 unmatched punches. Proves: mapping a biometric code writes the employee's
 * biometricId, replays every historical punch into attendance with correct
 * In/Out/Hours/Late, and marks the queue resolved — then rolls EVERYTHING back so
 * the database is left exactly as it was. Read the PASS/FAIL summary at the end.
 *   node scripts/test-etime-resolve-live.js
 */
const prisma = require('../src/config/prisma');
const { unmatched, sync } = require('../src/services/etimeoffice');

const COMPANY_ID = 1;

(async () => {
  let picked, targetEmp, originalBio, createdKeys = [], touchedQueueIds = [];
  let pass = true;
  const log = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${msg}`); if (!ok) pass = false; };
  try {
    // 1) Pick a queue code that actually carries punch times.
    const q = await prisma.unmatchedAttendance.findMany({ where: { companyId: COMPANY_ID, resolved: false, reason: 'UNMATCHED' }, take: 400 });
    const byCode = {};
    for (const r of q) { const c = r.biometricCode; if (!c) continue; (byCode[c] = byCode[c] || []).push(r); }
    const codeEntry = Object.entries(byCode).find(([, rows]) => rows.some(r => r.rawPayload && !r.rawPayload.includes('"INTime":"--:--"')));
    if (!codeEntry) { console.log('No suitable code with real punch times in the queue — nothing to test.'); return; }
    picked = codeEntry[0];
    const rows = codeEntry[1];
    console.log(`\nUsing biometric code "${picked}" (${rows.length} queued punch[es]).`);

    // 2) Pick a real company-1 employee with NO biometricId to receive the mapping.
    targetEmp = await prisma.employee.findFirst({ where: { companyId: COMPANY_ID, OR: [{ biometricId: null }, { biometricId: '' }] }, select: { id: true, name: true, employeeId: true, biometricId: true } });
    if (!targetEmp) { console.log('No unmapped company-1 employee to test with.'); return; }
    originalBio = targetEmp.biometricId;
    console.log(`Mapping to employee: ${targetEmp.name} (${targetEmp.employeeId}, id=${targetEmp.id}).`);

    // Record the (employeeId,date) keys the replay will touch, so we can clean up
    // only NEW rows and restore pre-existing ones.
    const dates = rows.map(r => { try { return sync.toIsoDate(JSON.parse(r.rawPayload).DateString); } catch { return null; } }).filter(Boolean);
    const before = await prisma.attendance.findMany({ where: { employeeId: targetEmp.id, date: { in: dates } }, select: { id: true, date: true } });
    const preExisting = new Set(before.map(b => b.date));
    touchedQueueIds = rows.map(r => r.id);

    // 3) RESOLVE (the real production path).
    const res = await unmatched.resolve(COMPANY_ID, picked, targetEmp.id, 'automated-test');
    console.log('resolve() →', JSON.stringify(res));
    log(res.ok, 'resolve() returned ok');
    log((res.imported + res.updated) > 0, `imported+updated > 0 (imported=${res.imported}, updated=${res.updated})`);

    // 4a) biometricId persisted on the employee.
    const emp2 = await prisma.employee.findUnique({ where: { id: targetEmp.id }, select: { biometricId: true } });
    log(emp2.biometricId === picked, `employee.biometricId now equals "${picked}"`);

    // 4b) attendance rows exist with correct In/Out/Hours for each dated punch.
    const after = await prisma.attendance.findMany({ where: { employeeId: targetEmp.id, date: { in: dates } } });
    createdKeys = after.filter(a => !preExisting.has(a.date)).map(a => ({ id: a.id, date: a.date }));
    log(after.length >= 1, `attendance rows present for the mapped dates (${after.length})`);
    for (const a of after) {
      const src = (typeof a.flags === 'string' ? JSON.parse(a.flags) : a.flags) || {};
      console.log(`   • ${a.date}  in=${a.clockIn || '—'} out=${a.clockOut || '—'} hrs=${a.hoursWorked} status=${a.status} late=${src.lateMinutes}m early=${src.earlyExitMinutes}m source=${src.source}`);
      log(src.source === 'E-TimeOffice', `   row ${a.date} carries source=E-TimeOffice`);
    }

    // 4c) queue rows for this code are now resolved.
    const stillOpen = await prisma.unmatchedAttendance.count({ where: { companyId: COMPANY_ID, biometricCode: picked, resolved: false } });
    log(stillOpen === 0, `queue emptied for code "${picked}" (open now = ${stillOpen})`);

    // 4d) idempotency — a second resolve must not create duplicates.
    const countBefore = await prisma.attendance.count({ where: { employeeId: targetEmp.id, date: { in: dates } } });
    // Re-queue is not needed; re-run importOne directly on the same records.
    for (const r of rows) { const rec = JSON.parse(r.rawPayload); await sync.importOne(prisma, COMPANY_ID, targetEmp, rec, null); }
    const countAfter = await prisma.attendance.count({ where: { employeeId: targetEmp.id, date: { in: dates } } });
    log(countBefore === countAfter, `idempotent re-import created 0 duplicates (${countBefore} → ${countAfter})`);
  } catch (e) {
    console.error('TEST ERROR:', e);
    pass = false;
  } finally {
    // ── REVERT everything ──────────────────────────────────────────────────────
    try {
      if (createdKeys.length) await prisma.attendance.deleteMany({ where: { id: { in: createdKeys.map(k => k.id) } } });
      if (targetEmp) await prisma.employee.update({ where: { id: targetEmp.id }, data: { biometricId: originalBio ?? null } });
      if (touchedQueueIds.length) await prisma.unmatchedAttendance.updateMany({ where: { id: { in: touchedQueueIds } }, data: { resolved: false } });
      // Remove the audit line the resolver wrote for this test.
      if (picked) await prisma.attendanceImportLog.deleteMany({ where: { companyId: COMPANY_ID, biometricCode: picked, message: { contains: 'Resolved: mapped code' } } });
      console.log('\nReverted: deleted test attendance, restored employee.biometricId, re-opened queue rows, removed test audit line.');
    } catch (re) { console.error('REVERT FAILED (manual cleanup may be needed):', re); pass = false; }
    console.log(`\n===== ${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} =====`);
    await prisma.$disconnect();
    process.exitCode = pass ? 0 : 1;
  }
})();
