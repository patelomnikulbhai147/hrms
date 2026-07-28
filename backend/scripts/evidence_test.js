const path = require('path');
const BankVerificationService = require(path.join(__dirname, '../src/services/bankVerificationService'));
const BankVerificationFactory = require(path.join(__dirname, '../src/services/bankVerification/BankVerificationFactory'));
const VerificationCreditService = require(path.join(__dirname, '../src/services/verificationCreditService'));
const prisma = require(path.join(__dirname, '../src/config/prisma'));

async function generateEvidence() {
  console.log('--- DB EVIDENCE GENERATOR ---');
  
  const cidA = 9901;
  const cidB = 9902;
  
  // Clean up
  await prisma.verificationCreditWallet.deleteMany({ where: { companyId: { in: [cidA, cidB] } } });
  await prisma.verificationCreditTransaction.deleteMany({ where: { companyId: { in: [cidA, cidB] } } });
  
  // Initialize Wallets
  const walletABefore = await VerificationCreditService.getWallet(cidA);
  const walletBBefore = await VerificationCreditService.getWallet(cidB);
  
  console.log('\n--- BEFORE VERIFICATION ---');
  console.log('Company A Wallet:', JSON.stringify(walletABefore));
  console.log('Company B Wallet:', JSON.stringify(walletBBefore));

  // Perform successful verification on A
  await VerificationCreditService.deductCreditOnSuccess({ companyId: cidA, referenceId: 'TEST-REF-999' });

  // Fetch after
  const walletAAfter = await VerificationCreditService.getWallet(cidA);
  const walletBAfter = await VerificationCreditService.getWallet(cidB);
  const txA = await prisma.verificationCreditTransaction.findMany({ where: { companyId: cidA } });
  
  console.log('\n--- AFTER VERIFICATION ON A ---');
  console.log('Company A Wallet:', JSON.stringify(walletAAfter));
  console.log('Company B Wallet:', JSON.stringify(walletBAfter));
  
  console.log('\n--- TRANSACTIONS FOR A ---');
  console.log(JSON.stringify(txA, null, 2));
  
  process.exit(0);
}

generateEvidence();
