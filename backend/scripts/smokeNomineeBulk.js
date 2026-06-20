// Smoke-test the transactional bulk endpoint (all-or-none).
const c = require('../src/controllers/nomineeController');
const p = require('../src/config/prisma');
const mk = () => { const r = { _s: 200, _j: null, status(x) { this._s = x; return this; }, json(x) { this._j = x; return this; } }; return r; };
const SA = { role: 'Super Admin', id: 1, name: 'Bulk Smoke' };
const EMP = 799;
(async () => {
  try {
    await p.$executeRawUnsafe("DELETE FROM employee_nominees WHERE employeeId = ? AND fullName LIKE 'BULK %'", EMP);

    let r = mk();
    await c.bulkCreate({ user: SA, body: { employeeId: EMP, nominees: [
      { fullName: 'BULK Father', relationship: 'Father', percentage: 60, isEmergencyContact: true, documents: [{ docType: 'PAN Card', fileName: 'pan.png', mimeType: 'image/png', fileData: 'data:image/png;base64,AAAA' }] },
      { fullName: 'BULK Mother', relationship: 'Mother', percentage: 40, isDependent: true },
    ] } }, r);
    console.log('bulk create (60+40=100):', r._s, JSON.stringify(r._j));

    let r2 = mk();
    await c.bulkCreate({ user: SA, body: { employeeId: EMP, nominees: [
      { fullName: 'BULK X', relationship: 'Son', percentage: 70 },
      { fullName: 'BULK Y', relationship: 'Daughter', percentage: 70 },
    ] } }, r2);
    console.log('over-100 batch rejected:', r2._s === 400, '->', r2._j.error);

    const cnt = await p.$queryRawUnsafe("SELECT COUNT(*) AS n FROM employee_nominees WHERE employeeId = ? AND fullName LIKE 'BULK %'", EMP);
    console.log('rows after both calls (should be 2 — rejected batch wrote NOTHING):', Number(cnt[0].n));

    const docs = await p.$queryRawUnsafe("SELECT COUNT(*) AS n FROM nominee_documents d JOIN employee_nominees e ON e.id=d.nomineeId WHERE e.employeeId = ? AND e.fullName LIKE 'BULK %'", EMP);
    console.log('nominee documents saved in tx:', Number(docs[0].n));

    await p.$executeRawUnsafe("DELETE FROM employee_nominees WHERE employeeId = ? AND fullName LIKE 'BULK %'", EMP);
    console.log('\n✅ transactional bulk save verified (all-or-none).');
  } catch (e) { console.error('FAILED:', e); process.exitCode = 1; } finally { await p.$disconnect(); }
})();
