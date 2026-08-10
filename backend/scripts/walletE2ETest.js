const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const WalletService = require('../src/services/walletService');
const CashfreePgClient = require('../src/services/payments/cashfreePgClient');
const payrollController = require('../src/controllers/payrollController');
const crypto = require('crypto');

// Fake response and request objects for testing controller directly
function mockReqRes(body = {}, user = { id: 1, name: 'Admin', role: 'Super Admin' }) {
  const req = { body, user, headers: {} };
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  
  const res = {
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    json: (data) => {
      resolve({ statusCode: res.statusCode || 200, data });
    }
  };
  return { req, res, promise };
}

async function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('=========================================================');
  console.log('STARTING ENTERPRISE WALLET E2E VERIFICATION');
  console.log('=========================================================\n');

  let companyA, companyB, branchA1, branchA2, branchB1;

  try {
    // SETUP: Clean up previous test runs if any
    await prisma.employee.deleteMany({ where: { employeeId: { startsWith: 'TEST-EMP-' } } });
    await prisma.branch.deleteMany({ where: { branchName: { startsWith: 'TEST-BRANCH-' } } });
    await prisma.company.deleteMany({ where: { name: { startsWith: 'TEST-COMP-' } } });
    await prisma.pricingMaster.deleteMany({ where: { tierName: 'Free' } });

    // SETUP: Create companies and branches
    companyA = await prisma.company.create({ data: { name: 'TEST-COMP-A', contactEmail: 'a@test.com', contactNumber: '1234567891' } });
    companyB = await prisma.company.create({ data: { name: 'TEST-COMP-B', contactEmail: 'b@test.com', contactNumber: '1234567892' } });
    
    branchA1 = await prisma.branch.create({ data: { companyId: companyA.id, branchName: 'TEST-BRANCH-A1', location: 'Loc1' } });
    branchA2 = await prisma.branch.create({ data: { companyId: companyA.id, branchName: 'TEST-BRANCH-A2', location: 'Loc2' } });
    branchB1 = await prisma.branch.create({ data: { companyId: companyB.id, branchName: 'TEST-BRANCH-B1', location: 'Loc3' } });

    console.log('✓ Test environments created.');

    // 1. VERIFY DATABASE
    console.log('\n--- VERIFYING DATABASE ---');
    const pricing = await prisma.pricingMaster.findMany();
    assert(pricing.length >= 3, 'PricingMaster should have at least 3 tiers.');
    console.log('✓ PricingMaster contains correct tiers.');

    const walletA = await WalletService.getWallet(companyA.id);
    const walletB = await WalletService.getWallet(companyB.id);
    assert(walletA.id !== walletB.id, 'Wallets must be isolated per company.');
    assert(walletA.companyId === companyA.id, 'Wallet A linked to Company A.');
    assert(walletA.balance === 0, 'Wallet A balance starts at 0.');
    console.log('✓ Companies have isolated wallets.');

    // 2. VERIFY CASHFREE
    console.log('\n--- VERIFYING CASHFREE WEBHOOK & RECHARGE ---');
    // Simulate cashfree webhook (Recharge)
    const rechargeResult = await WalletService.addBalance(companyA.id, 5000, 'Recharge', 'CF-TEST-123', 'Cashfree', 'System');
    assert(rechargeResult.wallet.balance === 5000, 'Balance should be 5000 after recharge.');
    
    // Duplicate callback protection
    const duplicateResult = await WalletService.addBalance(companyA.id, 5000, 'Recharge', 'CF-TEST-123', 'Cashfree', 'System');
    assert(duplicateResult.wallet.balance === 5000, 'Duplicate recharge callback must not increase balance.');
    console.log('✓ Webhook executes and updates Wallet.');
    console.log('✓ Duplicate callback protection works.');

    // Verify Company B remains untouched
    const walletBCheck = await WalletService.getWallet(companyB.id);
    assert(walletBCheck.balance === 0, 'Company B wallet must not be affected by Company A recharge.');
    console.log('✓ Strict Company Isolation confirmed during recharge.');

    // 3. VERIFY PAYROLL & BRANCH SHARING
    console.log('\n--- VERIFYING PAYROLL, BRANCH SHARING, & DEDUCTIONS ---');
    
    // Create 1 active employee in Branch A1
    const emp1 = await prisma.employee.create({
      data: {
        companyId: companyA.id, branchId: branchA1.id, name: 'TEST-EMP-1', employeeId: 'TEST-EMP-1', salary: 10000, status: 'Active', email: 'emp1@test.com', department: 'IT', designation: 'Dev', joinDate: new Date()
      }
    });
    
    // Create 1 active employee in Branch B1
    const emp2 = await prisma.employee.create({
      data: {
        companyId: companyB.id, branchId: branchB1.id, name: 'TEST-EMP-2', employeeId: 'TEST-EMP-2', salary: 10000, status: 'Active', email: 'emp2@test.com', department: 'IT', designation: 'Dev', joinDate: new Date()
      }
    });

    // Branch A1 tries to generate payroll. Wallet A has 5000 balance. Cost for 1 employee per tier 0-100 is $20 yearly / 12 = 1.66 => actually let's see.
    const { req: req1, res: res1, promise: prom1 } = mockReqRes({ companyId: companyA.id, branchId: branchA1.id, month: 'August', year: 2026, role: 'HR' });
    await payrollController.generate(req1, res1);
    const result1 = await prom1;
    
    assert(result1.statusCode === 201, `Payroll generation failed for Branch A1: ${JSON.stringify(result1.data)}`);
    
    const walletAAfterPayroll = await WalletService.getWallet(companyA.id);
    console.log('Wallet A balance after payroll:', walletAAfterPayroll.balance);
    const estimate = await WalletService.estimatePayrollCost(companyA.id);
    console.log('Estimate for Company A:', estimate);
    assert(walletAAfterPayroll.balance < 5000, 'Wallet A balance should decrease after payroll generation.');
    console.log('✓ Parent Wallet decreases when Branch A1 generates payroll.');

    // Now Company B tries to generate payroll. Wallet B has 0 balance.
    const { req: req2, res: res2, promise: prom2 } = mockReqRes({ companyId: companyB.id, month: 'August', year: 2026, role: 'HR' });
    await payrollController.generate(req2, res2);
    const result2 = await prom2;
    
    assert(result2.statusCode === 402, `Company B payroll SHOULD be blocked, got ${result2.statusCode}`);
    assert(result2.data.error === 'Insufficient wallet balance to generate payroll.', 'Should return insufficient balance error.');
    console.log('✓ Payroll blocked when wallet balance is insufficient.');
    
    // Now recharge Company B
    await WalletService.addBalance(companyB.id, 1000, 'Recharge', 'CF-TEST-B-1', 'Cashfree', 'System');
    
    const { req: req3, res: res3, promise: prom3 } = mockReqRes({ companyId: companyB.id, month: 'August', year: 2026, role: 'HR' });
    await payrollController.generate(req3, res3);
    const result3 = await prom3;
    assert(result3.statusCode === 201, 'Company B payroll should succeed after recharge.');
    console.log('✓ Company B payroll succeeds after isolated recharge.');

    // 4. VERIFY REPORTS
    console.log('\n--- VERIFYING LEDGER & REPORTS ---');
    const summaryA = await WalletService.getSummary(companyA.id);
    assert(summaryA.totalRecharge === 5000, 'Total recharge for Company A is correct.');
    assert(summaryA.totalDeduction > 0, 'Total deduction is tracked.');
    console.log('✓ Wallet Ledger tracking functions properly.');

    console.log('\nALL VERIFICATIONS PASSED SUCCESSFULLY.');

  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    // TEARDOWN
    console.log('\nCleaning up test data...');
    if (companyA) await prisma.employee.deleteMany({ where: { companyId: companyA.id } });
    if (companyB) await prisma.employee.deleteMany({ where: { companyId: companyB.id } });
    if (companyA) await prisma.branch.deleteMany({ where: { companyId: companyA.id } });
    if (companyB) await prisma.branch.deleteMany({ where: { companyId: companyB.id } });
    if (companyA) await prisma.company.delete({ where: { id: companyA.id } }).catch(()=>{});
    if (companyB) await prisma.company.delete({ where: { id: companyB.id } }).catch(()=>{});
    console.log('Cleanup complete.');
    await prisma.$disconnect();
  }
}

runTests();
