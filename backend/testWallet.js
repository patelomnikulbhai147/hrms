const WalletService = require('./src/services/walletService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const companyId = 1; // Assuming company 1 exists

    // 1. Add balance
    console.log('Adding balance...');
    await WalletService.addBalance(companyId, 5000, 'Recharge', 'REF-TEST-001', 'Cashfree', 'System Test');
    
    // 2. Check summary
    console.log('Getting summary...');
    const summary = await WalletService.getSummary(companyId);
    console.log('Summary:', summary);

    // 3. Deduct balance
    console.log('Deducting balance...');
    await WalletService.deductBalance(companyId, 250, 'Payroll', 'PR-08-2026-TEST', 'System Test');

    // 4. Check summary again
    const summary2 = await WalletService.getSummary(companyId);
    console.log('Summary after deduction:', summary2);

    console.log('Test completed successfully!');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
