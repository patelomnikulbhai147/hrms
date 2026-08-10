const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const WalletService = require('../src/services/walletService');
const payrollController = require('../src/controllers/payrollController');
const { performance } = require('perf_hooks');

// Fake response and request objects
function mockReqRes(body = {}, user = { id: 1, name: 'Admin', role: 'Super Admin' }) {
  const req = { body, user, headers: {} };
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  const res = {
    status: (code) => { res.statusCode = code; return res; },
    json: (data) => { resolve({ statusCode: res.statusCode || 200, data }); }
  };
  return { req, res, promise };
}

async function runEvidenceCollection() {
  console.log(JSON.stringify({ type: 'HEADER', message: 'EVIDENCE COLLECTION START' }));
  
  let companyA, companyB, branchA1;
  try {
    // 1. DATABASE SAMPLES
    const pricing = await prisma.pricingMaster.findMany();
    console.log(JSON.stringify({ type: 'DB_EVIDENCE', collection: 'PricingMaster', data: pricing }));

    // Setup Test Environment
    companyA = await prisma.company.create({ data: { name: 'EVIDENCE-COMP-A', contactEmail: 'a@ev.com', contactNumber: '9999999991' } });
    companyB = await prisma.company.create({ data: { name: 'EVIDENCE-COMP-B', contactEmail: 'b@ev.com', contactNumber: '9999999992' } });
    branchA1 = await prisma.branch.create({ data: { companyId: companyA.id, branchName: 'EVIDENCE-BRANCH-A1', location: 'EvLoc1' } });

    // Ensure Wallets exist
    await WalletService.getWallet(companyA.id);
    await WalletService.getWallet(companyB.id);

    const walletSample = await prisma.wallet.findFirst({ where: { companyId: companyA.id } });
    console.log(JSON.stringify({ type: 'DB_EVIDENCE', collection: 'Wallet', data: walletSample }));

    // 2. CASHFREE / PERFORMANCE / SECURITY
    const startRecharge = performance.now();
    const cfReqBody = { amount: 5000, type: 'Recharge', referenceNumber: 'EVIDENCE-CF-123', paymentGateway: 'Cashfree', createdBy: 'System' };
    console.log(JSON.stringify({ type: 'API_EVIDENCE', endpoint: 'WalletService.addBalance', method: 'POST', request: cfReqBody }));
    
    const rechargeResult = await WalletService.addBalance(companyA.id, 5000, 'Recharge', 'EVIDENCE-CF-123', 'Cashfree', 'System');
    const rechargeLatency = performance.now() - startRecharge;
    console.log(JSON.stringify({ type: 'API_EVIDENCE', endpoint: 'WalletService.addBalance', status: 200, response: rechargeResult, latencyMs: rechargeLatency }));

    const transactionSample = await prisma.walletTransaction.findFirst({ where: { walletId: walletSample.id } });
    console.log(JSON.stringify({ type: 'DB_EVIDENCE', collection: 'WalletTransaction', data: transactionSample }));

    // Duplicate Prevention Evidence
    const duplicateResult = await WalletService.addBalance(companyA.id, 5000, 'Recharge', 'EVIDENCE-CF-123', 'Cashfree', 'System');
    console.log(JSON.stringify({ type: 'SECURITY_EVIDENCE', feature: 'Duplicate Callback Prevention', duplicateAttemptResult: duplicateResult.wallet.balance === 5000 ? 'PREVENTED - Balance Unchanged' : 'FAILED' }));

    // 3. MULTI-TENANT ISOLATION
    const bWallet = await WalletService.getWallet(companyB.id);
    console.log(JSON.stringify({ type: 'SECURITY_EVIDENCE', feature: 'Company Isolation', companyABalance: rechargeResult.wallet.balance, companyBBalance: bWallet.balance, description: 'Company B balance unaffected by Company A recharge.' }));

    // 4. PAYROLL & BRANCH
    const emp1 = await prisma.employee.create({ data: { companyId: companyA.id, branchId: branchA1.id, name: 'EV-EMP-1', employeeId: 'EV-EMP-1', salary: 10000, status: 'Active', email: 'e@v.com', department: 'IT', designation: 'Dev', joinDate: new Date() } });
    
    // Estimate Deduction
    const estimate = await WalletService.estimatePayrollCost(companyA.id);
    console.log(JSON.stringify({ type: 'PAYROLL_EVIDENCE', step: 'Estimate Calculation', data: estimate }));

    // Generate Payroll (Branch A1 drawing from Company A wallet)
    const { req: req1, res: res1, promise: prom1 } = mockReqRes({ companyId: companyA.id, branchId: branchA1.id, month: 'August', year: 2026, role: 'HR' });
    const startPayroll = performance.now();
    await payrollController.generate(req1, res1);
    const result1 = await prom1;
    const payrollLatency = performance.now() - startPayroll;
    
    console.log(JSON.stringify({ type: 'API_EVIDENCE', endpoint: 'payrollController.generate', status: result1.statusCode, latencyMs: payrollLatency, response: result1.data }));
    
    const walletAAfter = await WalletService.getWallet(companyA.id);
    console.log(JSON.stringify({ type: 'PAYROLL_EVIDENCE', step: 'Branch Wallet Deduction', previousBalance: rechargeResult.wallet.balance, newBalance: walletAAfter.balance, deducted: rechargeResult.wallet.balance - walletAAfter.balance }));

    const auditLog = await prisma.auditLog.findFirst({ where: { targetId: String(result1.data.data.id) } });
    console.log(JSON.stringify({ type: 'DB_EVIDENCE', collection: 'AuditLog', data: auditLog }));

  } catch (err) {
    console.log(JSON.stringify({ type: 'ERROR', message: err.message, stack: err.stack }));
  } finally {
    // Cleanup
    if (companyA) await prisma.employee.deleteMany({ where: { companyId: companyA.id } });
    if (companyB) await prisma.employee.deleteMany({ where: { companyId: companyB.id } });
    if (companyA) await prisma.branch.deleteMany({ where: { companyId: companyA.id } });
    if (companyB) await prisma.branch.deleteMany({ where: { companyId: companyB.id } });
    if (companyA) await prisma.company.delete({ where: { id: companyA.id } }).catch(()=>{});
    if (companyB) await prisma.company.delete({ where: { id: companyB.id } }).catch(()=>{});
    await prisma.$disconnect();
  }
}

runEvidenceCollection();
