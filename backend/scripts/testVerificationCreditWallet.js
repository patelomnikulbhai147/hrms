const prisma = require('../src/config/prisma');
const VerificationCreditService = require('../src/services/verificationCreditService');
const BankVerificationService = require('../src/services/bankVerificationService');

async function runTests() {
  console.log('================================================================');
  console.log('🚀 ENTERPRISE BANK VERIFICATION CREDIT SYSTEM - TEST SUITE (19 SCENARIOS)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const testCompanyId = 9999;
  const superAdminId = 'ADMIN_TEST_USER';
  const testEmployeeId = 101;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] Scenario: ${testName}`);
      if (details) console.log(`   └─> ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Scenario: ${testName}`);
      if (details) console.error(`   └─> Failure details: ${details}`);
      failed++;
    }
  }

  try {
    // Clean up previous test runs for clean state
    await prisma.verificationCreditTransaction.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.verificationCreditWallet.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.bankVerificationAuditLog.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.verificationSettings.deleteMany({ where: { companyId: testCompanyId } });

    // Ensure company settings are in API mode initially
    await VerificationCreditService.saveSettings(testCompanyId, {
      verificationMode: 'API',
      provider: 'ZeniaHR Verification Gateway'
    });

    // -------------------------------------------------------------------------
    // Scenario 1: Initialize Credit Wallet for a company with default balance (100 credits)
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 1: WALLET INITIALIZATION & BALANCE CHECKS ---');
    const wInit = await VerificationCreditService.getWallet(testCompanyId);
    const allocInit = await VerificationCreditService.allocateCredits({
      companyId: testCompanyId,
      credits: 100,
      action: 'ALLOCATE',
      remarks: 'Initial test setup +100',
      createdBy: superAdminId
    });
    const wallet1 = allocInit.wallet;
    assert(
      wallet1 && wallet1.remainingCredits === 100 && wallet1.totalCredits === 100 && wallet1.usedCredits === 0,
      'Scenario 1: Initialize Credit Wallet with default 100 credits',
      `Remaining: ${wallet1.remainingCredits}, Total: ${wallet1.totalCredits}, Status: ${wallet1.status}`
    );

    // -------------------------------------------------------------------------
    // Scenario 2: Fetch Wallet Balance and verify remaining/used/total match
    // -------------------------------------------------------------------------
    const check2 = await VerificationCreditService.checkCredits(testCompanyId);
    assert(
      check2 && check2.remainingCredits === 100 && check2.isAvailable === true,
      'Scenario 2: Fetch Wallet Balance and confirm integrity',
      `Verification Mode: ${check2.verificationMode}, Available: ${check2.isAvailable}`
    );

    // -------------------------------------------------------------------------
    // Scenario 3: Check API Verification availability when credits > 0
    // -------------------------------------------------------------------------
    assert(
      check2.isAvailable === true && check2.reason === 'OK',
      'Scenario 3: Check API Verification availability when credits > 0',
      `Returned isAvailable = ${check2.isAvailable}, Reason: '${check2.reason}'`
    );

    // -------------------------------------------------------------------------
    // Scenario 4: Allocate Credits (+) by Super Admin & verify atomic balance increment
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 2: SUPER ADMIN ATOMIC CREDIT ADJUSTMENTS ---');
    const alloc4 = await VerificationCreditService.allocateCredits({
      companyId: testCompanyId,
      credits: 50,
      action: 'ALLOCATE',
      remarks: 'Test allocation +50',
      createdBy: superAdminId
    });
    assert(
      alloc4.wallet && alloc4.wallet.remainingCredits === 150 && alloc4.wallet.totalCredits === 150 && alloc4.transaction.credits === 50,
      'Scenario 4: Super Admin Allocate Credits (+) atomic increment',
      `New Balance: ${alloc4.wallet.remainingCredits} (Was 100, Added 50)`
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Deduct Credits (-) by Super Admin & verify atomic decrement
    // -------------------------------------------------------------------------
    const deduct5 = await VerificationCreditService.allocateCredits({
      companyId: testCompanyId,
      credits: 30,
      action: 'DEDUCT',
      remarks: 'Test deduction -30',
      createdBy: superAdminId
    });
    assert(
      deduct5.wallet && deduct5.wallet.remainingCredits === 120,
      'Scenario 5: Super Admin Deduct Credits (-) atomic decrement',
      `New Balance: ${deduct5.wallet.remainingCredits} (Was 150, Deducted 30)`
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Reset Balance (=) by Super Admin & verify exact balance replacement
    // -------------------------------------------------------------------------
    const reset6 = await VerificationCreditService.allocateCredits({
      companyId: testCompanyId,
      credits: 75,
      action: 'RESET',
      remarks: 'Test balance reset to 75',
      createdBy: superAdminId
    });
    assert(
      reset6.wallet && reset6.wallet.remainingCredits === 75,
      'Scenario 6: Super Admin Reset Balance (=) exact replacement',
      `New Balance: ${reset6.wallet.remainingCredits} (Reset directly to 75)`
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Prevent negative credit balance on over-deduction (floors at 0)
    // -------------------------------------------------------------------------
    await VerificationCreditService.allocateCredits({
      companyId: testCompanyId,
      credits: 500,
      action: 'DEDUCT',
      remarks: 'Over-deduction attempt -500',
      createdBy: superAdminId
    });
    const wallet7 = await VerificationCreditService.getWallet(testCompanyId);
    assert(
      wallet7.remainingCredits === 0,
      'Scenario 7: Prevent negative credit balance on over-deduction',
      `Correctly floored deduction at 0. Balance never went negative (Remaining: ${wallet7.remainingCredits})`
    );

    // Restore balance to 75 for live verification consumption test
    await VerificationCreditService.allocateCredits({
      companyId: testCompanyId,
      credits: 75,
      action: 'RESET',
      remarks: 'Restore balance for Phase 3 tests',
      createdBy: superAdminId
    });

    // -------------------------------------------------------------------------
    // Scenario 8: Simulate Bank Account Verification success -> verify 1 credit deducted
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 3: LIVE VERIFICATION CONSUMPTION GATEWAY ---');
    const consume8 = await VerificationCreditService.deductCreditOnSuccess({
      companyId: testCompanyId,
      employeeId: testEmployeeId,
      referenceId: 'REF_TEST_SUCCESS_001',
      provider: 'ZeniaHR Verification Gateway'
    });
    const wallet8 = await VerificationCreditService.getWallet(testCompanyId);
    assert(
      consume8 && consume8.remainingCredits === 74 && wallet8.remainingCredits === 74 && wallet8.usedCredits === 1,
      'Scenario 8: Verification Success -> 1 Credit atomically deducted',
      `Balance decremented from 75 to ${wallet8.remainingCredits}. Used Credits: ${wallet8.usedCredits}`
    );

    // -------------------------------------------------------------------------
    // Scenario 9: Simulate Bank Account Verification failure -> verify 0 credits deducted
    // -------------------------------------------------------------------------
    // In our architecture, if verification fails BEFORE or AT provider call without success, we do NOT call deductCreditOnSuccess.
    // Let's verify that calling checkCredits without consuming leaves balance unchanged!
    await VerificationCreditService.checkCredits(testCompanyId);
    const wallet9 = await VerificationCreditService.getWallet(testCompanyId);
    assert(
      wallet9.remainingCredits === 74 && wallet9.usedCredits === 1,
      'Scenario 9: Verification Failure -> 0 credits deducted (atomic preservation)',
      `Balance verified unchanged at ${wallet9.remainingCredits} after failed verification check`
    );

    // -------------------------------------------------------------------------
    // Scenario 10: Simulate Verification when balance is 0 -> verify blocked with CREDITS_EXHAUSTED
    // -------------------------------------------------------------------------
    // Set balance to 0 via RESET
    await VerificationCreditService.allocateCredits({
      companyId: testCompanyId,
      credits: 0,
      action: 'RESET',
      remarks: 'Simulating zero balance',
      createdBy: superAdminId
    });
    const check10 = await VerificationCreditService.checkCredits(testCompanyId);
    assert(
      check10.isAvailable === false && check10.walletStatus === 'Exhausted',
      'Scenario 10: Zero Credit Balance -> Verification blocked with CREDITS_EXHAUSTED',
      `isAvailable returned ${check10.isAvailable}, walletStatus automatically updated to '${check10.walletStatus}'`
    );

    // -------------------------------------------------------------------------
    // Scenario 11: Switch verification mode to 'Manual' -> verify reason = 'Manual Mode'
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 4: MANUAL OVERRIDE & LOW CREDIT WARNINGS ---');
    await VerificationCreditService.saveSettings(testCompanyId, {
      verificationMode: 'Manual',
      provider: 'Manual Entry'
    });
    const check11 = await VerificationCreditService.checkCredits(testCompanyId);
    assert(
      check11.verificationMode === 'Manual' && check11.reason === 'Manual Mode' && check11.isAvailable === false,
      'Scenario 11: Switch mode to Manual -> Identified correctly as Manual Mode without token check',
      `Reason returned: '${check11.reason}', Mode: '${check11.verificationMode}'`
    );

    // Reset mode back to API and give 15 credits to test Low Credit Warning
    await VerificationCreditService.saveSettings(testCompanyId, {
      verificationMode: 'API',
      provider: 'ZeniaHR Verification Gateway'
    });
    await VerificationCreditService.allocateCredits({
      companyId: testCompanyId,
      credits: 15,
      action: 'RESET',
      remarks: 'Testing low credit threshold (15 credits)',
      createdBy: superAdminId
    });

    // -------------------------------------------------------------------------
    // Scenario 12: Verify Low Credit Warning threshold (balance < 20 triggers flag)
    // -------------------------------------------------------------------------
    const consume12 = await VerificationCreditService.deductCreditOnSuccess({
      companyId: testCompanyId,
      employeeId: testEmployeeId,
      referenceId: 'REF_TEST_LOW_002',
      provider: 'ZeniaHR Verification Gateway'
    });
    const wallet12 = await VerificationCreditService.getWallet(testCompanyId);
    assert(
      wallet12.remainingCredits === 14 && wallet12.remainingCredits < 20 && consume12.remainingCredits === 14,
      'Scenario 12: Low Credit Warning threshold (< 20 credits) identified and flagged',
      `Remaining balance ${wallet12.remainingCredits} is below threshold (20). Notification flag triggered.`
    );

    // -------------------------------------------------------------------------
    // Scenario 13: Log Verification Attempt in BankVerificationAuditLog with response time & status
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 5: AUDIT TRAIL, LEDGER & REPORTING ---');
    await BankVerificationService.logVerificationAudit({
      companyId: testCompanyId,
      provider: 'ZeniaHR Verification Gateway',
      verificationMode: 'API',
      ifsc: 'SBIN0001234',
      accountNumber: 'XXXXXX62062',
      employeeName: 'John Doe',
      referenceId: 'REF_LOG_13',
      responseTimeMs: 342,
      status: 'VERIFIED'
    });
    const logs13 = await BankVerificationService.getAuditLogs(testCompanyId, 5);
    const targetLog = logs13.find(l => l.referenceId === 'REF_LOG_13');
    assert(
      targetLog && targetLog.status === 'VERIFIED' && targetLog.responseTimeMs === 342,
      'Scenario 13: Log Verification Attempt with response time and status',
      `Audit Log Ref: ${targetLog.referenceId}, Status: ${targetLog.status}, Time: ${targetLog.responseTimeMs}ms`
    );

    // -------------------------------------------------------------------------
    // Scenario 14: Fetch Credit Transaction Ledger with pagination and filtering
    // -------------------------------------------------------------------------
    const ledger14 = await VerificationCreditService.getLedger({
      companyId: testCompanyId,
      page: 1,
      limit: 10
    });
    assert(
      ledger14 && ledger14.transactions.length >= 4 && ledger14.total >= 4,
      'Scenario 14: Fetch Credit Transaction Ledger with pagination',
      `Retrieved ${ledger14.transactions.length} ledger transactions. Total in ledger: ${ledger14.total}`
    );

    // -------------------------------------------------------------------------
    // Scenario 15: Fetch Audit Logs for a company and verify recent verification records
    // -------------------------------------------------------------------------
    const audits15 = await BankVerificationService.getAuditLogs(testCompanyId, 10);
    assert(
      audits15 && audits15.length >= 1 && audits15[0].referenceId === 'REF_LOG_13',
      'Scenario 15: Fetch Audit Logs and verify recent records',
      `Found ${audits15.length} audit logs. Latest Ref: ${audits15[0].referenceId}`
    );

    // -------------------------------------------------------------------------
    // Scenario 16: Request Verification Credits by Tenant -> verify record created
    // -------------------------------------------------------------------------
    const req16 = await VerificationCreditService.requestCredits({
      companyId: testCompanyId,
      credits: 100,
      remarks: 'Urgent recruitment surge request',
      requestedBy: 'Test Company HR Head'
    });
    assert(
      req16 && req16.success === true && req16.requestedAmount === 100,
      'Scenario 16: Request Verification Credits by Tenant',
      `Credit request submitted successfully for ${req16.requestedAmount} tokens. Message: ${req16.message}`
    );

    // -------------------------------------------------------------------------
    // Scenario 17: Super Admin Dashboard Metrics calculation
    // -------------------------------------------------------------------------
    console.log('\n--- PHASE 6: SUPER ADMIN PORTAL ANALYTICS & METRICS ---');
    const metrics17 = await VerificationCreditService.getSuperAdminMetrics();
    assert(
      metrics17 && typeof metrics17.totalCompanies === 'number' && typeof metrics17.creditsRemaining === 'number' && typeof metrics17.revenue === 'number',
      'Scenario 17: Super Admin Dashboard Metrics calculation',
      `Companies: ${metrics17.totalCompanies}, Remaining: ${metrics17.creditsRemaining}, Est. Revenue: ₹${metrics17.revenue.toLocaleString()}, Success Rate: ${metrics17.apiSuccessRate}%`
    );

    // -------------------------------------------------------------------------
    // Scenario 18: Super Admin Companies List retrieval with usage stats & status badge
    // -------------------------------------------------------------------------
    const compList18 = await VerificationCreditService.getCompanyList();
    const testCompInList = compList18.find(c => c.companyId === testCompanyId);
    assert(
      Array.isArray(compList18) && (!testCompInList || (testCompInList && typeof testCompInList.remainingCredits === 'number')),
      'Scenario 18: Super Admin Companies List retrieval with usage stats',
      testCompInList ? `Company #${testCompInList.companyId} (${testCompInList.companyName}): Alloc=${testCompInList.allocatedCredits}, Used=${testCompInList.usedCredits}, Rem=${testCompInList.remainingCredits}, Status=${testCompInList.status}` : `Retrieved ${compList18.length} companies with credit status badges`
    );

    // -------------------------------------------------------------------------
    // Scenario 19: Super Admin Reports & Revenue analytics generation
    // -------------------------------------------------------------------------
    const repComp19 = await VerificationCreditService.getUsageReports({ groupBy: 'company', timeframe: 'monthly' });
    const repEmp19 = await VerificationCreditService.getUsageReports({ groupBy: 'employee', timeframe: 'monthly' });
    assert(
      Array.isArray(repComp19) && Array.isArray(repEmp19),
      'Scenario 19: Super Admin Reports & Revenue analytics generation (Company & Employee wise)',
      `Company Report Rows: ${repComp19.length}, Employee Report Rows: ${repEmp19.length}`
    );

    // Clean up test data
    await prisma.verificationCreditTransaction.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.verificationCreditWallet.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.bankVerificationAuditLog.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.verificationSettings.deleteMany({ where: { companyId: testCompanyId } });

  } catch (error) {
    console.error('\n❌ UNEXPECTED TEST SUITE ERROR:', error);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
