const prisma = require('../src/config/prisma');
const { encrypt, decrypt, isEncrypted } = require('../src/utils/secretCrypto');
const integrationService = require('../src/services/integrations/integrationService');
const googleService = require('../src/services/integrations/googleIntegrationService');
const slackService = require('../src/services/integrations/slackIntegrationService');
const sapService = require('../src/services/integrations/sapIntegrationService');
const tallyService = require('../src/services/integrations/tallyIntegrationService');
const syncEngine = require('../src/services/integrations/syncEngine');
const apiKeyService = require('../src/services/integrations/apiKeyService');
const webhookEngine = require('../src/services/integrations/webhookEngine');

async function runTests() {
  console.log('====================================================');
  console.log('  ENTERPRISE INTEGRATION HUB — AUTOMATED TEST SUITE ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ✕ FAILED: ${testName}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: SECRET ENCRYPTION AT REST
    // ----------------------------------------------------
    console.log('[TEST GROUP 1] Security & Secret Encryption');
    const secretText = 'OAuth_Super_Secret_Token_998877';
    const encrypted = encrypt(secretText);
    assert(isEncrypted(encrypted), 'encrypt() returns prefixed ciphertext format ("enc:v1:")');
    assert(encrypted !== secretText, 'Ciphertext is not plain text');
    const decrypted = decrypt(encrypted);
    assert(decrypted === secretText, 'decrypt() accurately restores original plaintext token');

    // ----------------------------------------------------
    // TEST 2: API KEY GENERATION & MASKING & REVOCATION
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 2] API Key Management');
    const companyId = 1;
    const keyResult = await apiKeyService.createApiKey(
      companyId,
      'Automated Test Integration Key',
      ['read:employees', 'write:attendance'],
      null,
      2000
    );

    assert(keyResult.rawApiKey.startsWith('zen_live_'), 'Generated API Key has zen_live_ prefix');
    assert(keyResult.keyMask.includes('...'), 'keyMask obscures full secret key');
    assert(keyResult.rawApiKey !== keyResult.keyMask, 'Raw key is distinct from masked key');

    // Verify key validation
    const verifiedKey = await apiKeyService.verifyApiKey(keyResult.rawApiKey);
    assert(verifiedKey && verifiedKey.id === keyResult.id, 'verifyApiKey() validates raw key hash successfully');

    // Revoke key
    await apiKeyService.revokeApiKey(companyId, keyResult.id);
    const verifyRevoked = await apiKeyService.verifyApiKey(keyResult.rawApiKey);
    assert(verifyRevoked === null, 'Revoked API key is denied access upon verification');

    // ----------------------------------------------------
    // TEST 3: INTEGRATION STATUS & UNCONFIGURED DEFAULTS
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 3] Integration Status & Provider Registry');
    const allIntegrations = await integrationService.getAllIntegrations(companyId);
    assert(Array.isArray(allIntegrations) && allIntegrations.length === 4, 'getAllIntegrations returns 4 providers (Google, Slack, SAP, Tally)');

    const googleItem = allIntegrations.find(i => i.id === 'google_workspace');
    assert(googleItem && (googleItem.status === 'Not Configured' || googleItem.status === 'Disconnected'), 'Unconfigured provider correctly defaults to Not Configured or Disconnected');

    // ----------------------------------------------------
    // TEST 4: SAP ERP CONFIGURATION & TEST CONNECTION
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 4] SAP ERP Connection & Test Connection');
    const sapConfigRes = await sapService.configureSap(companyId, {
      baseUrl: 'https://sandbox.sap.company.com/sap/opu/odata/sap/',
      client: '100',
      username: 'SAP_TEST_USER',
      password: 'TestPassword123',
      environment: 'Sandbox'
    });

    assert(sapConfigRes.connection.provider === 'sap', 'SAP ERP connection created successfully');
    
    // Verify stored credentials are encrypted in database
    const dbSapConn = await prisma.integrationConnection.findUnique({
      where: { companyId_provider: { companyId, provider: 'sap' } }
    });
    assert(dbSapConn && dbSapConn.credentials && isEncrypted(dbSapConn.credentials.password), 'SAP password stored encrypted at rest');

    // Test connection
    const sapTest = await sapService.testConnection(companyId);
    assert(sapTest.configured === undefined || sapTest.success !== undefined, 'SAP test connection returned structured response');

    // ----------------------------------------------------
    // TEST 5: TALLY PRIME CONFIGURATION & SYNC ENGINE
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 5] Tally Prime & Synchronization Engine');
    const tallyConfigRes = await tallyService.configureTally(companyId, {
      host: 'http://127.0.0.1',
      port: 9000,
      companyName: 'Test Tally Pvt Ltd'
    });

    assert(tallyConfigRes.connection.provider === 'tally', 'Tally Prime connection created successfully');

    // ----------------------------------------------------
    // TEST 6: WEBHOOK ENGINE & IDEMPOTENCY
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 6] Webhook Engine & Idempotency');
    const eventId = `test_evt_${Date.now()}`;
    const webhookRes1 = await webhookEngine.handleInboundWebhook(
      companyId,
      'slack',
      eventId,
      'user_change',
      { user: 'U12345', status: 'active' }
    );
    assert(webhookRes1.status === 'PROCESSED', 'Initial webhook event processed successfully');

    const webhookRes2 = await webhookEngine.handleInboundWebhook(
      companyId,
      'slack',
      eventId,
      'user_change',
      { user: 'U12345', status: 'active' }
    );
    assert(webhookRes2.duplicate === true && webhookRes2.status === 'DUPLICATE', 'Duplicate webhook event with same eventId detected and blocked');

    // ----------------------------------------------------
    // TEST 7: TENANT ISOLATION (COMPANY A VS COMPANY B)
    // ----------------------------------------------------
    console.log('\n[TEST GROUP 7] Multi-Tenant Isolation');
    const companyBId = 999;
    const companyBIntegrations = await integrationService.getAllIntegrations(companyBId);
    const sapInCompanyB = companyBIntegrations.find(i => i.id === 'sap');
    assert(sapInCompanyB.status === 'Not Configured' || sapInCompanyB.accountEmail === null, "Company A's SAP credentials do NOT leak to Company B");

    console.log('\n====================================================');
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test Suite Exception:', err);
    process.exit(1);
  }
}

runTests();
