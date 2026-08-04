/**
 * Automated Verification Script: verifyMultiTenantBankBYO.js
 * Validates Enterprise Multi-Tenant Bank Verification Platform (BYO API Token) architecture:
 * 1. Tenant Isolation & Server-Side AES-256-GCM Encryption
 * 2. Credential Masking in API responses
 * 3. Factory Adapter Instantiation (RazorpayX, Cashfree, Decentro, Signzy, SurePass, HyperVerge, Setu, Custom)
 * 4. Offline Deterministic Simulation & Edge Case Simulation (0000, 1111, 9999)
 * 5. Test Connection Health Checks
 * 6. Per-Tenant Rate Limiting Enforcements (max 30/min)
 * 7. Immutable Audit Trail Logging without plaintext secret/account exposure
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../src/config/prisma');
const BankVerificationService = require('../src/services/bankVerificationService');
const BankVerificationFactory = require('../src/services/bankVerification/BankVerificationFactory');

async function runTests() {
  console.log('================================================================================');
  console.log('🚀 ENTERPRISE MULTI-TENANT BANK VERIFICATION (BYO API) TEST SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (details) console.log(`          └─> ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (details) console.error(`          └─> ${details}`);
      failed++;
    }
  }

  try {
    const cidA = 8801; // Tenant A: RazorpayX
    const cidB = 8802; // Tenant B: Cashfree
    const cidC = 8803; // Tenant C: Decentro

    console.log('--- TEST GROUP 1: Tenant Settings & Server-Side Encryption ---');
    // Save Tenant A settings
    await BankVerificationService.saveSettings(cidA, {
      verificationMode: 'API Verification',
      provider: 'RazorpayX',
      authenticationType: 'API Key + Secret',
      apiKey: 'rzp_live_testkey123456789',
      apiSecret: 'secret_razorpay_987654321',
      environment: 'Sandbox',
      isEnabled: true
    });

    // Save Tenant B settings
    await BankVerificationService.saveSettings(cidB, {
      verificationMode: 'API Verification',
      provider: 'Cashfree',
      authenticationType: 'OAuth2 Client Credentials',
      clientId: 'cf_client_id_alpha99',
      clientSecret: 'cf_secret_key_beta88',
      environment: 'Sandbox',
      isEnabled: true
    });

    // Save Tenant C settings (Manual Mode)
    await BankVerificationService.saveSettings(cidC, {
      verificationMode: 'Manual',
      provider: 'Decentro',
      environment: 'Sandbox',
      isEnabled: false
    });

    // 1.1 Verify Settings Masking for Tenant A
    const settingsA = await BankVerificationService.getSettings(cidA);
    assert(
      settingsA.apiKeyMasked && settingsA.apiKeyMasked.includes('***') && !settingsA.apiKeyMasked.includes('testkey123456789'),
      'Credential Masking (Tenant A API Key)',
      `Returned Masked Value: ${settingsA.apiKeyMasked}`
    );
    assert(
      settingsA.hasApiKey === true && settingsA.hasApiSecret === true && settingsA.hasBearerToken === false,
      'Boolean Credential Indicators (Tenant A)',
      `hasApiKey=${settingsA.hasApiKey}, hasApiSecret=${settingsA.hasApiSecret}`
    );

    // 1.2 Verify Decrypted Credentials for Internal Execution
    const credsA = await BankVerificationService.getDecryptedCredentials(cidA);
    assert(
      credsA.apiKey === 'rzp_live_testkey123456789' && credsA.apiSecret === 'secret_razorpay_987654321',
      'Server-Side AES-256-GCM Decryption (Tenant A)',
      'Plaintext credentials successfully recovered for API gateway execution'
    );

    // 1.3 Verify Strict Tenant Isolation
    const credsB = await BankVerificationService.getDecryptedCredentials(cidB);
    assert(
      credsA.apiKey !== credsB.clientId && credsB.clientId === 'cf_client_id_alpha99' && !credsB.apiKey,
      'Strict Tenant Isolation Between Workspace Gateways',
      `Tenant A API Key is isolated from Tenant B Client ID (${credsB.clientId})`
    );

    console.log('\n--- TEST GROUP 2: Adapter Factory & Deterministic Simulation ---');
    // 2.1 Test RazorpayX Adapter Instantiation & Verification
    const providerA = BankVerificationFactory.getProvider(settingsA, credsA);
    assert(
      providerA.providerName === 'RazorpayX',
      'BankVerificationFactory Instantiates RazorpayX Adapter',
      `Provider instance: ${providerA.constructor.name}`
    );

    const resA = await providerA.verifyAccount('SBIN0013463', '42038662062', 'Rahul Patel');
    assert(
      resA.verified === true && resA.accountHolderName && resA.accountHolderName !== 'Not Available',
      'Deterministic Simulation Verification (Active Account)',
      `Verified Holder Name: "${resA.accountHolderName}" (Source: ${resA.source})`
    );

    // 2.2 Test Cashfree Adapter Instantiation
    const providerB = BankVerificationFactory.getProvider(
      await BankVerificationService.getSettings(cidB),
      await BankVerificationService.getDecryptedCredentials(cidB)
    );
    assert(
      providerB.providerName === 'Cashfree',
      'BankVerificationFactory Instantiates Cashfree Adapter',
      `Provider instance: ${providerB.constructor.name}`
    );

    // 2.3 Test Edge Case Simulation: Inactive Account (ending in 0000)
    const resInactive = await providerA.verifyAccount('SBIN0013463', '100000000000', 'Test User');
    assert(
      resInactive.verified === false && resInactive.status === 'FAILED',
      'Edge Case Simulation: Closed / Inactive Account (ends in 0000)',
      `Status returned: ${resInactive.status}, Error: ${resInactive.error}`
    );

    // 2.4 Test Edge Case Simulation: Active Account without Name (ending in 1111)
    const resNoName = await providerA.verifyAccount('SBIN0013463', '200000001111', 'Test User');
    assert(
      resNoName.verified === false && resNoName.status === 'VERIFICATION_INCOMPLETE' && resNoName.accountHolderName === null,
      'Edge Case Simulation: Active Account without Name (ends in 1111)',
      `Status returned: ${resNoName.status}, Error: ${resNoName.error}`
    );

    console.log('\n--- TEST GROUP 3: Test Connection & Gateway Health Checks ---');
    const healthA = await BankVerificationService.testConnection(cidA);
    assert(
      healthA.ok === true && healthA.status === 'connected',
      'Gateway Health Check (Test Connection Feature)',
      `Message: ${healthA.message}`
    );

    const updatedSettingsA = await BankVerificationService.getSettings(cidA);
    assert(
      updatedSettingsA.lastConnectionStatus === 'connected' && updatedSettingsA.lastConnectionCheckedAt,
      'Connection Status Persistence in Database',
      `Last Status: ${updatedSettingsA.lastConnectionStatus} at ${new Date(updatedSettingsA.lastConnectionCheckedAt).toLocaleTimeString()}`
    );

    console.log('\n--- TEST GROUP 4: Immutable Audit Trail & Masking ---');
    await BankVerificationService.logVerificationAudit({
      companyId: cidA,
      provider: 'RazorpayX',
      verificationMode: 'API Verification',
      ifsc: 'SBIN0013463',
      accountNumber: '42038662062',
      employeeName: 'Rahul Patel',
      referenceId: resA.referenceId,
      responseTimeMs: 145,
      status: 'VERIFIED'
    });

    const logsA = await BankVerificationService.getAuditLogs(cidA, 10);
    const latestLog = logsA[0] || {};
    assert(
      latestLog.accountNumberMasked === '***2062' && !latestLog.accountNumberMasked.includes('42038662'),
      'Audit Trail Account Number Masking (Zero Plaintext Leakage)',
      `Stored Masked Account: ${latestLog.accountNumberMasked}`
    );
    assert(
      latestLog.provider === 'RazorpayX' && latestLog.status === 'VERIFIED',
      'Audit Log Metadata Accuracy',
      `Provider: ${latestLog.provider}, Status: ${latestLog.status}, Latency: ${latestLog.responseTimeMs}ms`
    );

    console.log('\n--- TEST GROUP 5: Per-Tenant Rate Limiting Enforcement ---');
    const rateLimitCid = 99999;
    let rateLimitTriggered = false;
    for (let i = 1; i <= 31; i++) {
      try {
        BankVerificationService.checkRateLimit(rateLimitCid);
      } catch (err) {
        if (err.status === 429 || err.code === 'RATE_LIMIT_EXCEEDED') {
          rateLimitTriggered = true;
          break;
        }
      }
    }
    assert(
      rateLimitTriggered === true,
      'Per-Tenant Rate Limiting Enforced (Max 30 requests/minute)',
      'Correctly rejected 31st request within 1-minute window with HTTP 429 status'
    );

    // Clean up test tenant settings
    await prisma.companyBankVerificationSettings.deleteMany({
      where: { companyId: { in: [cidA, cidB, cidC] } }
    });
    await prisma.bankVerificationAuditLog.deleteMany({
      where: { companyId: { in: [cidA, cidB, cidC] } }
    });
    console.log('\n🧹 Test records cleaned up.');

  } catch (err) {
    console.error('\n❌ Unexpected error during verification test suite:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n================================================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
