/**
 * End-to-end smoke test for the enterprise Bank Verification endpoints.
 *
 * Logs in as a real user and exercises every NEW read endpoint against the
 * running server. It deliberately never calls POST /api/bank/verify-account:
 * that is a billable production call to Cashfree, and a test suite must not
 * spend a tenant's money to prove a list endpoint works.
 *
 *   node scripts/smokeBankVerificationApi.js
 */
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:5000/api';
const EMAIL = process.env.SMOKE_EMAIL || 'om@gmail.com';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Om@12345';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { token, method = 'GET', body, workspace } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(workspace ? { 'x-workspace-id': String(workspace) } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

(async () => {
  try {
    console.log(`Logging in as ${EMAIL} …`);
    const login = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
    if (login.status !== 200 || !login.json?.token) {
      console.error(`Login failed (${login.status}):`, JSON.stringify(login.json)?.slice(0, 400));
      console.error('Set SMOKE_EMAIL / SMOKE_PASSWORD if these credentials have changed.');
      process.exitCode = 1;
      return;
    }
    const token = login.json.token;
    const role = login.json.user?.role;
    const companyId = login.json.user?.companyId;
    console.log(`Logged in as ${role} (company ${companyId}).\n`);

    console.log('GET /bank/verifications —');
    const list = await call('/bank/verifications?limit=5', { token });
    check('responds 200', list.status === 200, `status=${list.status} body=${JSON.stringify(list.json)?.slice(0, 200)}`);
    const data = list.json?.data;
    check('returns a records array', Array.isArray(data?.records), `got ${typeof data?.records}`);
    check('returns pagination', typeof data?.total === 'number' && typeof data?.totalPages === 'number');
    check('returns stats', !!data?.stats && typeof data.stats.total === 'number');
    check('page size honoured', !data?.records || data.records.length <= 5);

    const sample = data?.records?.[0];
    if (sample) {
      check('record carries a permissions block', !!sample.permissions);
      check('account number is masked in the list', !sample.accountNumberMasked || /^\*{3}\d{0,4}$/.test(sample.accountNumberMasked), sample.accountNumberMasked);
      const serialized = JSON.stringify(sample).toLowerCase();
      check('no client secret leaks into the list', !serialized.includes('client_secret') || serialized.includes('[redacted]'));

      // Technical fields must be present only for entitled roles.
      const entitled = ['Super Admin', 'Company Head', 'HR', 'HR Admin', 'HR Manager', 'Admin'].includes(role);
      check(
        entitled ? 'entitled role receives the technical block' : 'unentitled role does not receive the technical block',
        entitled ? sample.permissions.canSeeTechnical === true : sample.permissions.canSeeTechnical === false
      );
      check(
        role === 'Super Admin' ? 'Super Admin may see raw payloads' : 'non-Super-Admin is denied raw payloads',
        role === 'Super Admin' ? sample.permissions.canSeeRaw === true : sample.permissions.canSeeRaw === false
      );
      if (sample.permissions.canSeeRaw !== true) {
        check('raw payloads are absent, not merely hidden', sample.rawRequest === undefined && sample.rawResponse === undefined);
      }

      console.log('\nGET /bank/verifications/:id —');
      const detail = await call(`/bank/verifications/${sample.id}`, { token });
      check('detail responds 200', detail.status === 200, `status=${detail.status}`);
      check('detail returns the same record', detail.json?.data?.id === sample.id);
      check('detail exposes bankBranch alias', 'bankBranch' in (detail.json?.data || {}));
    } else {
      console.log('  (no verification records in this workspace yet — record-shape checks skipped)');
    }

    console.log('\nGET /bank/verifications/:id — not found / cross-tenant');
    const missing = await call('/bank/verifications/99999999', { token });
    check('unknown id responds 404', missing.status === 404, `status=${missing.status}`);

    console.log('\nGET /bank/verifications/latest/:employeeId —');
    const latest = await call('/bank/verifications/latest/999999999', { token });
    check('unknown employee responds 200 with null (not an error)', latest.status === 200 && latest.json?.data === null, `status=${latest.status}`);

    console.log('\nGET /bank/payroll-policy —');
    const policy = await call('/bank/payroll-policy', { token });
    check('responds 200', policy.status === 200, `status=${policy.status}`);
    check('reports the requirement flag', typeof policy.json?.data?.requireVerifiedBankForPayroll === 'boolean');
    check('reports the unverified headcount', typeof policy.json?.data?.unverifiedActiveEmployees === 'number');

    console.log('\nPOST /bank/verifications/link — validation');
    const badLink = await call('/bank/verifications/link', { token, method: 'POST', body: {} });
    check('missing fields rejected with 400', badLink.status === 400, `status=${badLink.status}`);

    console.log('\nRegression — existing endpoints still work');
    const ifsc = await call('/bank/ifsc/HDFC0001234', { token });
    check('IFSC lookup still responds 200', ifsc.status === 200, `status=${ifsc.status}`);
    check('IFSC lookup still resolves a bank', ifsc.json?.bankName === 'HDFC Bank', ifsc.json?.bankName);

    const legacyAudit = await call('/bank/audit-logs?limit=3', { token });
    check('legacy audit-logs endpoint still responds 200', legacyAudit.status === 200, `status=${legacyAudit.status}`);
    check('legacy audit-logs still returns an array', Array.isArray(legacyAudit.json?.data));

    const settings = await call('/bank/settings', { token });
    check('bank settings still respond 200', settings.status === 200, `status=${settings.status}`);
    const settingsDump = JSON.stringify(settings.json || {});
    check('settings never expose a plaintext secret', !/"(clientSecret|apiSecret|bearerToken)"\s*:\s*"(?!\*|null)/.test(settingsDump));

    console.log('\nAuthorisation — no token');
    const anon = await call('/bank/verifications', {});
    check('unauthenticated request is rejected', anon.status === 401 || anon.status === 403, `status=${anon.status}`);
  } catch (e) {
    failed++;
    console.error('\nSuite aborted:', e.message);
  } finally {
    console.log(`\n${passed} passed, ${failed} failed.`);
    process.exitCode = failed > 0 ? 1 : 0;
  }
})();
