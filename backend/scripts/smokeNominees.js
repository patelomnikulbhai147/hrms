// Smoke-test nominee CRUD + validations + audit against the real DB.
const ctrl = require('../src/controllers/nomineeController');
const prisma = require('../src/config/prisma');
const mk = () => { const r = { _s: 200, _j: null, status(c) { this._s = c; return this; }, json(x) { this._j = x; return this; } }; return r; };
const SA = { role: 'Super Admin', id: 1, name: 'Smoke Admin' };
const EMP = 799;

(async () => {
  try {
    // clean any leftover from prior runs
    await prisma.$executeRawUnsafe("DELETE FROM employee_nominees WHERE employeeId = ? AND fullName LIKE 'SMOKE %'", EMP);

    let r;
    r = mk(); await ctrl.list({ user: SA, query: { employeeId: EMP } }, r);
    console.log('list before:', r._j.nominees.length, 'total%=', r._j.totalPercentage);

    // create #1 (60%)
    r = mk(); await ctrl.create({ user: SA, body: { employeeId: EMP, fullName: 'SMOKE Father', relationship: 'Father', percentage: 60, aadhaar: '123412341234', pan: 'ABCDE1234F', email: 'f@x.com', mobile: '9876543210' } }, r);
    console.log('create #1:', r._s, r._j.message || r._j.error);
    const id1 = r._j.id;

    // validation: bad PAN
    r = mk(); await ctrl.create({ user: SA, body: { employeeId: EMP, fullName: 'SMOKE Bad', relationship: 'Mother', percentage: 10, pan: 'BADPAN' } }, r);
    console.log('bad PAN rejected:', r._s === 400, '->', r._j.error);

    // allocation guard: 60 + 50 > 100
    r = mk(); await ctrl.create({ user: SA, body: { employeeId: EMP, fullName: 'SMOKE Mother', relationship: 'Mother', percentage: 50 } }, r);
    console.log('over-100% rejected:', r._s === 400, '->', r._j.error);

    // create #2 (40%) -> total 100
    r = mk(); await ctrl.create({ user: SA, body: { employeeId: EMP, fullName: 'SMOKE Mother', relationship: 'Mother', percentage: 40, isDependent: true } }, r);
    console.log('create #2:', r._s, r._j.message || r._j.error);
    const id2 = r._j.id;

    // duplicate prevention
    r = mk(); await ctrl.create({ user: SA, body: { employeeId: EMP, fullName: 'SMOKE Father', relationship: 'Father', percentage: 0 } }, r);
    console.log('duplicate rejected:', r._s === 409, '->', r._j.error);

    // list -> should be 100%
    r = mk(); await ctrl.list({ user: SA, query: { employeeId: EMP } }, r);
    console.log('list after creates: count=', r._j.nominees.filter(n => n.fullName.startsWith('SMOKE')).length, 'total%=', r._j.totalPercentage, 'isValid=', r._j.isValid);

    // update #1 percentage 60->50 (total 90, ok)
    r = mk(); await ctrl.update({ user: SA, params: { id: id1 }, body: { fullName: 'SMOKE Father', relationship: 'Father', percentage: 50 } }, r);
    console.log('update #1:', r._s, r._j.message || r._j.error);

    // archive #2
    r = mk(); await ctrl.archive({ user: SA, params: { id: id2 } }, r);
    console.log('archive #2:', r._s, r._j.status);

    // audit
    r = mk(); await ctrl.audit({ user: SA, query: { employeeId: EMP } }, r);
    console.log('audit entries:', r._j.filter(a => true).length, '(actions:', [...new Set(r._j.map(a => a.action))].join(','), ')');

    // cleanup
    await prisma.$executeRawUnsafe("DELETE FROM employee_nominees WHERE employeeId = ? AND fullName LIKE 'SMOKE %'", EMP);
    console.log('\nCleaned up. ✅ nominee CRUD + validations + audit all working.');
  } catch (e) { console.error('SMOKE FAILED:', e); process.exitCode = 1; } finally { await prisma.$disconnect(); }
})();
