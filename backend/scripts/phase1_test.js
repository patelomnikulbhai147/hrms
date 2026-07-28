const path = require('path');
const BankVerificationService = require(path.join(__dirname, '../src/services/bankVerificationService'));
const BankVerificationFactory = require(path.join(__dirname, '../src/services/bankVerification/BankVerificationFactory'));
const VerificationCreditService = require(path.join(__dirname, '../src/services/verificationCreditService'));
const prisma = require(path.join(__dirname, '../src/config/prisma'));

async function runPhase1Tests() {
  console.log('Starting Phase 1 E2E Verification Tests (Cashfree Sandbox)...');
  
  let passed = 0;
  let failed = 0;
  const assertTest = (name, condition, details) => {
    if (condition) {
      console.log(`✅ PASSED: ${name}`);
      passed++;
    } else {
      console.log(`❌ FAILED: ${name} -> ${details}`);
      failed++;
    }
  };

  try {
    const cid = 1; // Default company
    
    // 1. Configure Workspace to use Sandbox
    await BankVerificationService.saveSettings(cid, {
      verificationMode: 'API Verification',
      provider: 'Cashfree Sandbox API',
      authenticationType: 'Bearer Token',
      bearerToken: 'test_token',
      environment: 'Sandbox',
      isEnabled: true
    });
    console.log('✓ Configured Workspace for Sandbox Environment.');

    // Reset Wallet to 8 credits
    await prisma.verificationCreditWallet.upsert({
      where: { companyId_serviceType: { companyId: cid, serviceType: 'BANK_VERIFICATION' } },
      update: { totalCredits: 8, remainingCredits: 8, usedCredits: 0 },
      create: { companyId: cid, serviceType: 'BANK_VERIFICATION', totalCredits: 8, remainingCredits: 8 }
    });

    // 2. Load settings and verify Factory returns CashfreeSandboxProvider
    const settings = await BankVerificationService.getSettings(cid);
    const creds = await BankVerificationService.getDecryptedCredentials(cid);
    const provider = BankVerificationFactory.getProvider(settings, creds);

    assertTest('Factory returns CashfreeSandboxProvider in Sandbox environment', provider.providerName === 'Cashfree Sandbox API', 'Should instantiate CashfreeSandboxProvider.');

    const verify = async (ifsc, acc) => {
      try {
        const res = await provider.verifyAccount(ifsc, acc, 'Test Employee');
        if (res.verified) {
            await VerificationCreditService.deductCreditOnSuccess({ companyId: cid });
        }
        return res;
      } catch (err) {
        return { error: err.message, status: err.code || err.status || 'ERROR' };
      }
    };

    // Test 1: Valid IFSC, Valid Account (Should deduct 4)
    const t1 = await verify('HDFC0001234', '112233445566');
    const w1 = await VerificationCreditService.getWallet(cid);
    assertTest('Valid IFSC & Valid Account (Deducted ₹4)', t1.verified === true && w1.remainingCredits === 4, 'Should deduct ₹4 for successful verification.');

    // Test 2: Invalid Account Number (Wrong/Closed Account) (Should deduct 0)
    const t2 = await verify('HDFC0001234', '100000000000');
    const w2 = await VerificationCreditService.getWallet(cid);
    assertTest('Wrong / Closed Account (No Deduction)', t2.verified === false && t2.status === 'FAILED' && w2.remainingCredits === 4, 'Should NOT deduct wallet balance for failed verification.');

    // Test 3: Timeout (Simulated by 9999) (Should deduct 0)
    const t3 = await verify('HDFC0001234', '100000009999');
    const w3 = await VerificationCreditService.getWallet(cid);
    assertTest('Timeout simulation (No Deduction)', t3.verified === undefined && t3.status === 'NETWORK_ERROR' && w3.remainingCredits === 4, 'Should simulate network timeout with no deduction.');

    // Test 4: Another Valid Account (Should deduct remaining ₹4)
    const t4 = await verify('HDFC0001234', '112233445566');
    const w4 = await VerificationCreditService.getWallet(cid);
    assertTest('Second Verification exhausts wallet', t4.verified === true && w4.remainingCredits === 0, 'Wallet should be 0 after second success.');

    // Test 5: Insufficient Funds
    try {
        // Mock deduct attempt when exhausted
        await VerificationCreditService.deductCreditOnSuccess({ companyId: cid });
        assertTest('Insufficient Funds blocked', false, 'Should throw error about no credits.');
    } catch(e) {
        assertTest('Insufficient Funds blocked', e.message.includes('No verification credits'), 'Should block verify when exhausted.');
    }

  } catch (err) {
    console.error('Test suite failed critically:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nTests Completed. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runPhase1Tests();
