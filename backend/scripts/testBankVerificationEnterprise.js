/**
 * Regression suite for the enterprise Bank Account Verification record layer.
 *
 * Deliberately does NOT call Cashfree: a live verification is billable, so the
 * provider is exercised only through its parsing (a captured response shape),
 * never over the network. Everything else — persistence of all response fields,
 * secret redaction, name matching, history filters, employee linkage — runs
 * against the real database using a scratch tenant id that no company owns.
 *
 * Self-cleaning: removes only the rows it created.
 *
 *   node scripts/testBankVerificationEnterprise.js
 */
const prisma = require('../src/config/prisma');
const BankVerificationService = require('../src/services/bankVerificationService');
const { redactPayload } = require('../src/services/bankVerificationService');
const { compareNames, resolveNameMatch } = require('../src/utils/nameMatch');
const CashfreeProvider = require('../src/services/bankVerification/CashfreeProvider');

const SCRATCH_COMPANY = 999901;

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

function eq(label, actual, expected) {
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function testNameMatch() {
  console.log('\nName matching —');
  eq('identical names are exact', compareNames('RAHUL SHARMA', 'RAHUL SHARMA').result, 'EXACT_MATCH');
  eq('case and punctuation ignored', compareNames('rahul  sharma.', 'RAHUL SHARMA').result, 'EXACT_MATCH');
  eq('honorific stripped', compareNames('Mr Rahul Sharma', 'RAHUL SHARMA').result, 'EXACT_MATCH');
  eq('word order ignored', compareNames('SHARMA RAHUL', 'RAHUL SHARMA').result, 'EXACT_MATCH');
  eq('initials expand', compareNames('R K SHARMA', 'RAJESH KUMAR SHARMA').result, 'EXACT_MATCH');

  const subset = compareNames('RAHUL', 'RAHUL KUMAR SHARMA');
  eq('subset of the bank name is partial, not exact', subset.result, 'PARTIAL_MATCH');
  check('subset scores below 100', subset.score < 100, `score=${subset.score}`);

  eq('different people mismatch', compareNames('RAHUL SHARMA', 'PRIYA MEHTA').result, 'MISMATCH');
  eq('a different surname is a mismatch, not a typo', compareNames('RAHUL SHARMA', 'RAHUL VERMA').result, 'MISMATCH');
  eq('a real typo stays a partial match', compareNames('RAHUL SHRAMA', 'RAHUL SHARMA').result, 'PARTIAL_MATCH');
  eq('containment is symmetric', compareNames('RAHUL KUMAR SHARMA', 'RAHUL').result, 'PARTIAL_MATCH');
  eq('a blank entered name is not a mismatch', compareNames('', 'RAHUL SHARMA').result, 'NOT_COMPARED');
  check('a blank entered name has no score', compareNames('', 'RAHUL SHARMA').score === null);

  // Provider verdict outranks local comparison.
  const provider = resolveNameMatch({
    enteredName: 'RAHUL SHARMA', bankName: 'PRIYA MEHTA',
    providerResult: 'DIRECT_MATCH', providerScore: 1
  });
  eq('provider DIRECT_MATCH wins over local comparison', provider.result, 'EXACT_MATCH');
  eq('provider fraction score scaled to percent', provider.score, 100);
  eq('provider verdict is attributed to the provider', provider.source, 'PROVIDER');

  const provider100 = resolveNameMatch({
    enteredName: 'A', bankName: 'B', providerResult: 'GOOD_PARTIAL_MATCH', providerScore: 82
  });
  eq('provider 0-100 score passes through', provider100.score, 82);
  eq('partial verdict mapped', provider100.result, 'PARTIAL_MATCH');

  const unknown = resolveNameMatch({
    enteredName: 'RAHUL SHARMA', bankName: 'RAHUL SHARMA',
    providerResult: 'SOMETHING_NEW', providerScore: null
  });
  eq('unrecognised provider verdict falls back to local comparison', unknown.source, 'COMPUTED');
}

async function testRedaction() {
  console.log('\nSecret redaction —');
  const payload = {
    'x-client-id': 'CF12345',
    'x-client-secret': 'super-secret-value',
    clientSecret: 'another-secret',
    Authorization: 'Bearer abc.def',
    apiKey: 'key-123',
    bank_account: '03720100021853',
    account_number: '03720100021853',
    ifsc: 'BARB0PATRIX',
    nested: { token: 'tok_live_xyz', name_at_bank: 'RAHUL SHARMA' }
  };
  const out = redactPayload(payload);

  eq('client secret redacted', out['x-client-secret'], '[REDACTED]');
  eq('camelCase client secret redacted', out.clientSecret, '[REDACTED]');
  eq('authorization header redacted', out.Authorization, '[REDACTED]');
  eq('api key redacted', out.apiKey, '[REDACTED]');
  eq('client id redacted', out['x-client-id'], '[REDACTED]');
  eq('nested token redacted', out.nested.token, '[REDACTED]');
  eq('account number masked to last 4', out.bank_account, '***1853');
  eq('alternate account key masked', out.account_number, '***1853');
  eq('non-secret data preserved', out.ifsc, 'BARB0PATRIX');
  eq('nested business data preserved', out.nested.name_at_bank, 'RAHUL SHARMA');

  const serialized = JSON.stringify(out);
  check('no plaintext secret survives serialization', !serialized.includes('super-secret-value') && !serialized.includes('tok_live_xyz'));
  check('no full account number survives serialization', !serialized.includes('03720100021853'));
}

async function testCashfreeParsing() {
  console.log('\nCashfree response parsing (offline, no network) —');
  const provider = new CashfreeProvider({ provider: 'Cashfree', environment: 'Production' }, {});

  // A response shaped like Cashfree's bank-account/sync success body.
  const body = {
    reference_id: 4001234,
    name_at_bank: 'RAHUL SHARMA',
    bank_name: 'Bank of Baroda',
    branch: 'PATRIX BRANCH',
    city: 'VADODARA',
    micr: '390012001',
    account_status: 'VALID',
    account_status_code: 'ACCOUNT_IS_VALID',
    name_match_score: '0.95',
    name_match_result: 'DIRECT_MATCH',
    utr: 'UTR9988776655',
    // A field the adapter has never seen — must survive in the raw payload.
    future_field_from_cashfree: 'KEEP_ME'
  };

  const out = provider.normalizeResponse({
    verified: true,
    status: 'VERIFIED',
    accountHolderName: body.name_at_bank,
    bankName: body.bank_name,
    branch: body.branch,
    city: body.city,
    micr: body.micr,
    utr: body.utr,
    accountStatus: body.account_status,
    accountStatusCode: body.account_status_code,
    nameMatchResult: body.name_match_result,
    nameMatchScore: body.name_match_score,
    verificationSource: 'Cashfree Secure ID',
    referenceId: String(body.reference_id),
    httpStatus: 200,
    rawResponse: body
  });

  eq('verified flag preserved', out.verified, true);
  eq('account holder preserved', out.accountHolderName, 'RAHUL SHARMA');
  eq('account status carried', out.accountStatus, 'VALID');
  eq('status code carried', out.accountStatusCode, 'ACCOUNT_IS_VALID');
  eq('utr carried', out.utr, 'UTR9988776655');
  eq('name match verdict carried', out.nameMatchResult, 'DIRECT_MATCH');
  eq('environment reported', out.environment, 'Production');
  eq('http status carried', out.httpStatus, 200);
  check('raw body retained verbatim', out.raw && out.raw.future_field_from_cashfree === 'KEEP_ME');

  // A declined account still carries its provider detail.
  const declined = provider.normalizeResponse({
    verified: false, status: 'FAILED', accountHolderName: '',
    accountStatus: 'INVALID', accountStatusCode: 'ACCOUNT_DOES_NOT_EXIST',
    error: 'Bank Account Status: INVALID', httpStatus: 200, rawResponse: { account_status: 'INVALID' }
  });
  eq('declined stays unverified', declined.verified, false);
  eq('declined keeps its status code', declined.accountStatusCode, 'ACCOUNT_DOES_NOT_EXIST');
  check('declined keeps a reference id', !!declined.referenceId);
}

async function testPersistence() {
  console.log('\nVerification record persistence —');

  const created = await BankVerificationService.logVerificationAudit({
    companyId: SCRATCH_COMPANY,
    provider: 'Cashfree',
    verificationMode: 'API Verification',
    ifsc: 'BARB0PATRIX',
    accountNumber: '03720100021853',
    employeeName: 'RAHUL SHARMA',
    enteredName: 'RAHUL SHARMA',
    referenceId: 'TEST-REF-0001',
    responseTimeMs: 912,
    status: 'VERIFIED',
    employeeCode: 'EMP-TEST-1',
    branchName: 'Rajkot',
    department: 'Engineering',
    designation: 'Developer',
    employeeEmail: 'test@example.com',
    employeePhone: '9876543210',
    verifiedById: 1,
    verifiedByName: 'HR Tester',
    verifiedByRole: 'HR',
    environment: 'Production',
    verificationId: 'CF-VER-1',
    requestId: 'CF-REQ-1',
    verificationSource: 'Cashfree Secure ID',
    accountHolderName: 'RAHUL SHARMA',
    bankName: 'Bank of Baroda',
    bankBranch: 'PATRIX',
    branchAddress: 'Some Road, Vadodara',
    city: 'VADODARA',
    district: 'VADODARA',
    state: 'GUJARAT',
    micr: '390012001',
    swift: 'BARBINBB',
    utr: 'UTR123',
    accountStatus: 'VALID',
    accountStatusCode: 'ACCOUNT_IS_VALID',
    verificationMessage: 'Account is valid',
    nameMatchResult: 'EXACT_MATCH',
    nameMatchScore: 100,
    nameMatchSource: 'PROVIDER',
    requestTimestamp: new Date(),
    responseTimestamp: new Date(),
    httpStatus: 200,
    retryCount: 1,
    rawRequest: { ifsc: 'BARB0PATRIX', bank_account: '03720100021853', 'x-client-secret': 'leak-me' },
    rawResponse: { account_status: 'VALID', future_field_from_cashfree: 'KEEP_ME' },
    verificationCost: 4,
    walletBalanceBefore: 100,
    walletBalanceAfter: 96
  });

  check('record created', !!created && !!created.id);
  if (!created) return null;

  const row = await prisma.bankVerificationAuditLog.findUnique({ where: { id: created.id } });
  eq('status stored', row.status, 'VERIFIED');
  eq('account number stored masked only', row.accountNumberMasked, '***1853');
  eq('bank branch stored', row.branchName2, 'PATRIX');
  eq('company branch stored separately', row.branchName, 'Rajkot');
  eq('name match score stored', row.nameMatchScore, 100);
  eq('latency stored', row.responseTimeMs, 912);
  eq('cost stored', row.verificationCost, 4);
  eq('wallet before stored', row.walletBalanceBefore, 100);
  eq('wallet after stored', row.walletBalanceAfter, 96);
  eq('retry count stored', row.retryCount, 1);
  eq('utr stored', row.utr, 'UTR123');
  eq('environment stored', row.environment, 'Production');
  check('unknown provider field preserved in rawResponse', row.rawResponse?.future_field_from_cashfree === 'KEEP_ME');
  eq('secret redacted in stored request', row.rawRequest?.['x-client-secret'], '[REDACTED]');
  eq('account masked in stored request', row.rawRequest?.bank_account, '***1853');

  const dump = JSON.stringify(row);
  check('no plaintext secret anywhere in the stored row', !dump.includes('leak-me'));
  check('no full account number anywhere in the stored row', !dump.includes('03720100021853'));

  return created.id;
}

async function testHistoryQueries() {
  console.log('\nHistory queries —');

  await BankVerificationService.logVerificationAudit({
    companyId: SCRATCH_COMPANY, provider: 'Cashfree', ifsc: 'HDFC0001234',
    accountNumber: '111122223333', employeeName: 'PRIYA MEHTA',
    referenceId: 'TEST-REF-0002', status: 'FAILED', errorMessage: 'Bank Account Status: INVALID',
    responseTimeMs: 500, verificationCost: 0
  });

  const all = await BankVerificationService.getVerifications({ companyId: SCRATCH_COMPANY, page: 1, limit: 10 });
  check('history returns both records', all.total >= 2, `total=${all.total}`);
  eq('newest first', all.records[0].referenceId, 'TEST-REF-0002');

  const verifiedOnly = await BankVerificationService.getVerifications({ companyId: SCRATCH_COMPANY, status: 'VERIFIED' });
  check('status filter works', verifiedOnly.records.every((r) => r.status === 'VERIFIED') && verifiedOnly.total >= 1);

  const searched = await BankVerificationService.getVerifications({ companyId: SCRATCH_COMPANY, search: 'PRIYA' });
  check('search by employee name works', searched.total >= 1 && searched.records[0].employeeName === 'PRIYA MEHTA');

  const byRef = await BankVerificationService.getVerifications({ companyId: SCRATCH_COMPANY, search: 'TEST-REF-0001' });
  check('search by reference id works', byRef.total === 1, `total=${byRef.total}`);

  const paged = await BankVerificationService.getVerifications({ companyId: SCRATCH_COMPANY, page: 1, limit: 1 });
  eq('page size honoured', paged.records.length, 1);
  check('page count computed', paged.totalPages >= 2, `totalPages=${paged.totalPages}`);

  // An end date given as a plain day must include everything recorded that day.
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = await BankVerificationService.getVerifications({ companyId: SCRATCH_COMPANY, startDate: today, endDate: today });
  check('same-day date filter includes today\'s records', todayRows.total >= 2, `total=${todayRows.total}`);

  const stats = await BankVerificationService.getVerificationStats(SCRATCH_COMPANY);
  check('stats count all attempts', stats.total >= 2, `total=${stats.total}`);
  check('stats count verified', stats.verified >= 1);
  check('stats count failed', stats.failed >= 1);
  check('success rate computed', stats.successRate !== null && stats.successRate > 0 && stats.successRate < 100, `rate=${stats.successRate}`);
  check('spend sums only successful verifications', stats.totalSpend === 4, `spend=${stats.totalSpend}`);

  const empty = await BankVerificationService.getVerificationStats(999999);
  check('no attempts reports no success rate rather than a fake 100%', empty.successRate === null);
}

async function testTenantIsolation() {
  console.log('\nTenant isolation —');
  const other = await BankVerificationService.getVerifications({ companyId: SCRATCH_COMPANY + 1 });
  eq('another company sees none of these records', other.total, 0);

  const rows = await prisma.bankVerificationAuditLog.findMany({ where: { companyId: SCRATCH_COMPANY }, take: 1 });
  const fetched = await BankVerificationService.getVerificationById(SCRATCH_COMPANY + 1, rows[0].id);
  check('record id from another tenant is not readable', fetched === null);

  const own = await BankVerificationService.getVerificationById(SCRATCH_COMPANY, rows[0].id);
  check('own record is readable', own !== null && own.id === rows[0].id);
}

async function cleanup() {
  const removed = await prisma.bankVerificationAuditLog.deleteMany({ where: { companyId: SCRATCH_COMPANY } });
  console.log(`\nCleaned up ${removed.count} scratch record(s) for company ${SCRATCH_COMPANY}.`);
}

(async () => {
  try {
    await testNameMatch();
    await testRedaction();
    await testCashfreeParsing();
    await testPersistence();
    await testHistoryQueries();
    await testTenantIsolation();
  } catch (e) {
    failed++;
    console.error('\nSuite aborted:', e);
  } finally {
    await cleanup().catch(() => {});
    console.log(`\n${passed} passed, ${failed} failed.`);
    process.exitCode = failed > 0 ? 1 : 0;
    await prisma.$disconnect();
  }
})();
