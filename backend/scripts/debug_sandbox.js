const path = require('path');
const BankVerificationFactory = require(path.join(__dirname, '../src/services/bankVerification/BankVerificationFactory'));

async function debugSandbox() {
  console.log('--- DEBUGGING SANDBOX PROVIDER ---');
  
  const settings = {
    environment: 'Sandbox',
    provider: 'Cashfree Sandbox API',
    authenticationType: 'Bearer Token'
  };
  const credentials = {};
  
  try {
    const provider = BankVerificationFactory.getProvider(settings, credentials);
    console.log('Provider Instantiated:', provider.providerName);
    
    // Simulating a standard verifyAccount call
    console.log('\n--- EXECUTING verifyAccount ---');
    console.log('Inputs: IFSC=HDFC0001234, Account=112233445566, Name=Test Employee');
    
    const result = await provider.verifyAccount('HDFC0001234', '112233445566', 'Test Employee');
    
    console.log('\n--- SUCCESS RESPONSE ---');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (err) {
    console.log('\n--- EXCEPTION CAUGHT ---');
    console.log('Error Name:', err.name);
    console.log('Error Message:', err.message);
    console.log('Error Code:', err.code);
    console.log('Error Status:', err.status);
    console.log('Stack Trace:', err.stack);
  }
}

debugSandbox();
