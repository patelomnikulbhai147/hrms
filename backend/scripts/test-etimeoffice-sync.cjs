/**
 * Mocked-response tests for the E-TimeOffice integration — no live API, no DB
 * writes. Verifies: auth header, URL/date building, response parsing, transient
 * error handling, the punch→attendance field mappings, and the safety matcher
 * (RULES 1–5). Run:  node scripts/test-etimeoffice-sync.cjs
 */
process.env.ETIME_MAX_RETRIES = '1';   // keep transient-retry tests fast
process.env.ETIME_RETRY_BASE_MS = '1';

const assert = require('assert');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
};
const testAsync = async (name, fn) => {
  try { await fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.error('  ✗', name, '\n     ', e.message); fail++; }
};

const client = require('../src/services/etimeoffice/etimeClient');
const sync = require('../src/services/etimeoffice/etimeSyncService');
const { resolvePunch, STATUS } = require('../src/services/attendanceMatcher');

// The documented sample IN/OUT response.
const SAMPLE_INOUT = {
  InOutPunchData: [
    { Empcode: '0001', INTime: '12:06', OUTTime: '--:--', WorkTime: '00:00', OverTime: '00:00', Status: 'P/2', DateString: '01/01/2026', Remark: 'MIS-LT', Erl_Out: '00:00', Late_In: '02:36', Name: 'JIGNESH PADHIYAR' },
  ],
  Error: false, Msg: 'Success', IsAdmin: true,
};

const CREDS = { apiBaseUrl: 'https://api.etimeoffice.com/api/', corporateId: 'support', username: 'support', password: 'support@1', empCode: 'ALL' };

// Swap global.fetch for a scripted mock.
const withFetch = async (impl, fn) => {
  const orig = global.fetch;
  global.fetch = impl;
  try { return await fn(); } finally { global.fetch = orig; }
};
const mkHeaders = (h = {}) => ({ get: (k) => h[String(k).toLowerCase()] ?? null });
const jsonResponse = (obj, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: mkHeaders({ server: 'nginx', 'x-powered-by': 'ASP.NET' }), text: async () => JSON.stringify(obj) });
// E-TimeOffice's real "rejected" response: a bare, empty-bodied HTTP 500.
const emptyResponse = (status = 500) => ({ ok: false, status, headers: mkHeaders({ server: 'nginx/1.24.0 (Ubuntu)', 'x-powered-by': 'ASP.NET' }), text: async () => '' });

(async () => {
  console.log('\nE-TimeOffice integration — mocked tests\n');

  // ── Auth + URL building ─────────────────────────────────────────────────
  test('buildAuthHeader = Basic base64("corp:user:pass:True")', () => {
    const h = client.buildAuthHeader(CREDS);
    assert.strictEqual(h, 'Basic ' + Buffer.from('support:support:support@1:True').toString('base64'));
  });
  test('fmtDate formats dd/MM/yyyy', () => {
    assert.strictEqual(client.fmtDate(new Date(2026, 0, 9)), '09/01/2026');
  });

  // ── Response parsing (happy path) ───────────────────────────────────────
  await testAsync('downloadInOutPunchData parses records + hits the right URL', async () => {
    let calledUrl = null, calledAuth = null;
    await withFetch(async (url, opts) => { calledUrl = url; calledAuth = opts.headers.Authorization; return jsonResponse(SAMPLE_INOUT); }, async () => {
      const res = await client.downloadInOutPunchData(CREDS, { empCode: 'ALL', fromDate: new Date(2026, 0, 1), toDate: new Date(2026, 0, 1) });
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.records.length, 1);
      assert.strictEqual(res.records[0].Empcode, '0001');
      assert.ok(calledUrl.includes('DownloadInOutPunchData'));
      assert.ok(calledUrl.includes('Empcode=ALL'));
      assert.ok(calledUrl.includes('FromDate=01%2F01%2F2026'));
      assert.ok(calledAuth.startsWith('Basic '));
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────
  await testAsync('401 → AUTH_FAILED (not retried, no throw)', async () => {
    await withFetch(async () => jsonResponse({ Error: true, Msg: 'Unauthorized' }, 401), async () => {
      const res = await client.downloadInOutPunchData(CREDS, { fromDate: new Date(), toDate: new Date() });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 'AUTH_FAILED');
    });
  });
  await testAsync('body {Error:true} → API_ERROR', async () => {
    await withFetch(async () => jsonResponse({ Error: true, Msg: 'Invalid date range' }, 200), async () => {
      const res = await client.downloadInOutPunchData(CREDS, { fromDate: new Date(), toDate: new Date() });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 'API_ERROR');
      assert.strictEqual(res.message, 'Invalid date range');
    });
  });
  await testAsync('empty HTTP 500 → AUTH_OR_CONFIG_ERROR, NOT retried, actionable message', async () => {
    let calls = 0;
    await withFetch(async () => { calls++; return emptyResponse(500); }, async () => {
      const res = await client.downloadInOutPunchData(CREDS, { fromDate: new Date(), toDate: new Date() });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 'AUTH_OR_CONFIG_ERROR');
      assert.strictEqual(calls, 1, 'a deterministic empty 500 must not be retried');
      assert.ok(/API access|credentials|Corporate ID/i.test(res.message), 'message must be actionable');
      assert.strictEqual(res.raw.httpStatus, 500);
      assert.strictEqual(res.raw.bodyEmpty, true);
    });
  });
  await testAsync('5xx WITH a body is still retried (genuine transient)', async () => {
    let calls = 0;
    await withFetch(async () => { calls++; return { ok: false, status: 503, headers: mkHeaders({ server: 'nginx' }), text: async () => 'temporarily unavailable' }; }, async () => {
      const res = await client.downloadInOutPunchData(CREDS, { fromDate: new Date(), toDate: new Date() });
      assert.strictEqual(res.ok, false);
      assert.ok(calls > 1, 'a bodied 5xx should be retried as transient');
    });
  });
  await testAsync('network throw → NETWORK_ERROR (never throws to caller)', async () => {
    await withFetch(async () => { throw new Error('ECONNREFUSED'); }, async () => {
      const res = await client.downloadInOutPunchData(CREDS, { fromDate: new Date(), toDate: new Date() });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 'NETWORK_ERROR');
    });
  });

  // ── Field mappings ──────────────────────────────────────────────────────
  test('toIsoDate dd/MM/yyyy → yyyy-MM-dd', () => {
    assert.strictEqual(sync.toIsoDate('01/01/2026'), '2026-01-01');
    assert.strictEqual(sync.toIsoDate('bad'), null);
  });
  test('cleanTime keeps HH:mm, drops --:--', () => {
    assert.strictEqual(sync.cleanTime('12:06'), '12:06');
    assert.strictEqual(sync.cleanTime('--:--'), '');
  });
  test('workTimeToHours HH:mm → decimal', () => {
    assert.strictEqual(sync.workTimeToHours('08:30'), 8.5);
    assert.strictEqual(sync.workTimeToHours('00:00'), 0);
  });
  test('mapStatus maps E-TimeOffice codes', () => {
    assert.strictEqual(sync.mapStatus('P/2', true), 'Present');
    assert.strictEqual(sync.mapStatus('A', false), 'Absent');
    assert.strictEqual(sync.mapStatus('WO', false), 'Weekly Off');
    assert.strictEqual(sync.mapStatus('', true), 'Present');
    assert.strictEqual(sync.mapStatus('', false), 'Absent');
  });

  // ── Safety matcher (RULES 1–5), with an in-memory prisma stub ────────────
  const mkPrisma = (employees) => ({ employee: { findMany: async ({ where }) => employees.filter(e => e.companyId === where.companyId && e.biometricId === where.biometricId) } });

  await testAsync('RULE 1 — blank biometric code → NO_BIOMETRIC_CODE', async () => {
    const v = await resolvePunch(mkPrisma([]), { companyId: 1, biometricCode: '' });
    assert.strictEqual(v.status, STATUS.NO_BIOMETRIC_CODE);
  });
  await testAsync('RULE 2 — no match → UNMATCHED', async () => {
    const v = await resolvePunch(mkPrisma([]), { companyId: 1, biometricCode: '0001' });
    assert.strictEqual(v.status, STATUS.UNMATCHED);
  });
  await testAsync('RULE 3 — duplicate code → DUPLICATE_CODE', async () => {
    const emps = [{ id: 1, employeeId: 'E1', name: 'A', companyId: 1, biometricId: '0001' }, { id: 2, employeeId: 'E2', name: 'B', companyId: 1, biometricId: '0001' }];
    const v = await resolvePunch(mkPrisma(emps), { companyId: 1, biometricCode: '0001' });
    assert.strictEqual(v.status, STATUS.DUPLICATE_CODE);
  });
  await testAsync('MATCHED — single unique code', async () => {
    const emps = [{ id: 7, employeeId: 'E7', name: 'Jig', companyId: 1, biometricId: '0001' }];
    const v = await resolvePunch(mkPrisma(emps), { companyId: 1, biometricCode: '0001' });
    assert.strictEqual(v.status, STATUS.MATCHED);
    assert.strictEqual(v.employee.id, 7);
  });
  await testAsync('RULE 5 — company isolation (same code, other company → UNMATCHED)', async () => {
    const emps = [{ id: 9, employeeId: 'E9', name: 'X', companyId: 2, biometricId: '0001' }];
    const v = await resolvePunch(mkPrisma(emps), { companyId: 1, biometricCode: '0001' });
    assert.strictEqual(v.status, STATUS.UNMATCHED); // company 1 has no such code
  });

  // ── buildAttendanceData — the canonical punch → attendance-row mapping ────────
  const emp = { id: 7, name: 'Jig', employeeId: 'E7' };

  test('buildAttendanceData — In/Out/Late/Early/Source from a real record', () => {
    const rec = { INTime: '10:52', OUTTime: '19:10', WorkTime: '07:30', Status: 'P', DateString: '03/07/2026', Late_In: '00:22', Erl_Out: '00:50', OverTime: '00:00', Remark: 'LT-EO', Name: 'Jig' };
    const d = sync.buildAttendanceData(1, emp, rec, { department: 'Eng', branch: 'HQ' });
    assert.strictEqual(d.clockIn, '10:52');
    assert.strictEqual(d.clockOut, '19:10');
    assert.strictEqual(d.hoursWorked, 7.5);           // from WorkTime
    assert.strictEqual(d.status, 'Present');
    assert.strictEqual(d.branch, 'HQ');
    assert.strictEqual(d.flags.lateMinutes, 22);
    assert.strictEqual(d.flags.earlyExitMinutes, 50);
    assert.strictEqual(d.flags.isLate, true);
    assert.strictEqual(d.flags.isEarlyExit, true);
    assert.strictEqual(d.flags.source, 'E-TimeOffice');
  });

  test('buildAttendanceData — hours fall back to out−in when WorkTime is blank', () => {
    const rec = { INTime: '09:00', OUTTime: '17:30', WorkTime: '00:00', Status: 'P', DateString: '03/07/2026', Late_In: '00:00', Erl_Out: '00:00' };
    const d = sync.buildAttendanceData(1, emp, rec, {});
    assert.strictEqual(d.hoursWorked, 8.5);           // computed span, WorkTime was 0
    assert.strictEqual(d.flags.isLate, false);
  });

  test('buildAttendanceData — coerces an Employee.branch RELATION object to its name', () => {
    const rec = { INTime: '09:00', OUTTime: '18:00', WorkTime: '08:00', Status: 'P', DateString: '03/07/2026' };
    const d = sync.buildAttendanceData(1, emp, rec, { department: 'Eng', branch: { id: 3, branchName: 'Ahmedabad' } });
    assert.strictEqual(d.branch, 'Ahmedabad'); // relation object → string, never crashes the upsert
  });

  test('hhmmToMinutes / spanHours helpers', () => {
    assert.strictEqual(sync.hhmmToMinutes('01:15'), 75);
    assert.strictEqual(sync.hhmmToMinutes('--:--'), 0);
    assert.strictEqual(sync.spanHours('09:00', '12:30'), 3.5);
    assert.strictEqual(sync.spanHours('18:00', '09:00'), 0); // negative → 0, never nonsense
  });

  console.log(`\n${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
