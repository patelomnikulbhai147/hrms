/**
 * READ-ONLY diagnostic for the E-TimeOffice unmatched-punch problem.
 * Dumps the connection, employee biometricId coverage, the unmatched queue and
 * a sample of raw payloads so we can see exactly WHY punches aren't matching.
 *   node scripts/diagnose-etime-unmatched.js
 */
const prisma = require('../src/config/prisma');

const j = (o) => JSON.stringify(o, null, 2);

(async () => {
  try {
    console.log('\n===== ETIME CONNECTIONS =====');
    const conns = await prisma.etimeConnection.findMany();
    for (const c of conns) {
      console.log(`companyId=${c.companyId} enabled=${c.enabled} empCode=${c.empCode} windowDays=${c.syncWindowDays} status=${c.connectionStatus} lastSync=${c.lastSyncStatus}@${c.lastSyncAt} branchId=${c.branchId}`);
    }

    console.log('\n===== EMPLOYEE biometricId COVERAGE =====');
    const totalEmp = await prisma.employee.count();
    const withBio = await prisma.employee.count({ where: { NOT: [{ biometricId: null }, { biometricId: '' }] } });
    console.log(`employees total=${totalEmp}  with biometricId=${withBio}  missing=${totalEmp - withBio}`);

    // Per-company breakdown of biometricId coverage.
    const emps = await prisma.employee.findMany({ select: { id: true, companyId: true, name: true, employeeId: true, biometricId: true } });
    const byCompany = {};
    for (const e of emps) {
      const k = String(e.companyId);
      byCompany[k] = byCompany[k] || { total: 0, withBio: 0, sample: [] };
      byCompany[k].total++;
      if (e.biometricId && String(e.biometricId).trim() !== '') { byCompany[k].withBio++; if (byCompany[k].sample.length < 8) byCompany[k].sample.push(e.biometricId); }
    }
    console.log('\nper-company:');
    for (const [cid, s] of Object.entries(byCompany)) {
      console.log(`  companyId=${cid}  total=${s.total}  withBio=${s.withBio}  sampleBiometricIds=${j(s.sample)}`);
    }

    console.log('\n===== UNMATCHED QUEUE =====');
    const unmatchedCount = await prisma.unmatchedAttendance.count();
    console.log(`unmatched rows total=${unmatchedCount}`);
    const byReason = await prisma.unmatchedAttendance.groupBy({ by: ['reason'], _count: { _all: true } }).catch(() => null);
    if (byReason) console.log('by reason:', j(byReason.map(r => ({ reason: r.reason, count: r._count._all }))));
    const byCode = {};
    const uq = await prisma.unmatchedAttendance.findMany({ take: 500, orderBy: { id: 'desc' } });
    for (const u of uq) { const k = u.biometricCode == null ? '(null)' : u.biometricCode; byCode[k] = (byCode[k] || 0) + 1; }
    console.log('distinct biometricCodes in queue (code → count):');
    console.log(j(byCode));

    console.log('\n----- 3 sample unmatched rawPayloads -----');
    for (const u of uq.slice(0, 3)) {
      console.log(`id=${u.id} companyId=${u.companyId} code=${u.biometricCode} reason=${u.reason}`);
      console.log('  msg:', u.message);
      console.log('  raw:', u.rawPayload);
    }

    console.log('\n===== ATTENDANCE ROWS (E-TimeOffice source) =====');
    const attTotal = await prisma.attendance.count();
    console.log(`attendance rows total (all sources)=${attTotal}`);
    const recent = await prisma.attendance.findMany({ orderBy: { id: 'desc' }, take: 5, select: { id: true, employeeId: true, companyId: true, date: true, clockIn: true, clockOut: true, status: true, hoursWorked: true, flags: true } });
    console.log('5 most recent attendance rows:');
    console.log(j(recent));

    console.log('\n===== CROSS-CHECK: do queued codes exist as ANY employee biometricId (ignoring company)? =====');
    const codes = Object.keys(byCode).filter(c => c !== '(null)').slice(0, 20);
    for (const code of codes) {
      const anyMatch = await prisma.employee.findMany({ where: { biometricId: code }, select: { id: true, companyId: true, employeeId: true, name: true } });
      console.log(`  code=${code} → ${anyMatch.length} employee(s) anywhere: ${j(anyMatch)}`);
    }
  } catch (e) {
    console.error('diagnostic failed:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
