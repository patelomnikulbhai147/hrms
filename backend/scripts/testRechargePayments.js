/**
 * Self-Service Verification Credit Recharge — regression suite.
 *
 * Runs entirely against scratch tenants (999902 / 999903) with the Cashfree
 * PG client STUBBED — no network call, nothing billable. Self-cleaning:
 * every row it creates is deleted and the settings row is restored verbatim.
 *
 *   node scripts/testRechargePayments.js
 */
process.env.CASHFREE_PG_ENV = 'sandbox';
process.env.CASHFREE_PG_SANDBOX_CLIENT_ID = 'TEST_ID';
process.env.CASHFREE_PG_SANDBOX_CLIENT_SECRET = 'TEST_SECRET';

const crypto = require('crypto');
const prisma = require('../src/config/prisma');
const cashfreePg = require('../src/services/payments/cashfreePgClient');
const rechargeSettings = require('../src/services/payments/rechargeSettingsService');
const paymentOrderService = require('../src/services/payments/paymentOrderService');

const COMPANY_A = 999902; // the paying company
const COMPANY_B = 999903; // the bystander — must NEVER gain a credit

let passed = 0;
let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── Cashfree PG stub ─────────────────────────────────────────────────────────
// The service calls through the module namespace, so patching properties on
// the required object intercepts every call. gatewayState maps orderId → the
// order Cashfree would report.
const gatewayState = new Map();
const realFns = { createOrder: cashfreePg.createOrder, getOrder: cashfreePg.getOrder, getOrderPayments: cashfreePg.getOrderPayments };
cashfreePg.createOrder = async ({ orderId, amount, currency }) => {
  gatewayState.set(orderId, { order_id: orderId, order_status: 'ACTIVE', order_amount: amount, order_currency: currency });
  return { cf_order_id: `cf_${orderId}`, payment_session_id: `session_${orderId}`, order_status: 'ACTIVE' };
};
cashfreePg.getOrder = async (orderId) => {
  const s = gatewayState.get(orderId);
  if (!s) throw new Error('stub: unknown order');
  return { ...s };
};
cashfreePg.getOrderPayments = async (orderId) => {
  const s = gatewayState.get(orderId);
  return s?.order_status === 'PAID'
    ? [{ cf_payment_id: 991144, payment_status: 'SUCCESS', payment_group: 'upi', bank_reference: 'BANKREF1', payment_completion_time: new Date().toISOString() }]
    : [];
};
const markPaid = (orderId, overrides = {}) => {
  const s = gatewayState.get(orderId);
  gatewayState.set(orderId, { ...s, order_status: 'PAID', ...overrides });
};

const wallet = (companyId) =>
  prisma.verificationCreditWallet.findUnique({
    where: { companyId_serviceType: { companyId, serviceType: 'BANK_VERIFICATION' } },
  });

const scope = { companyId: COMPANY_A, branchId: null, workspaceId: COMPANY_A, workspaceKind: 'company' };
const buyer = { name: 'QA Company Head', email: null, role: 'Company Head' }; // no id/email → no user email attempts

async function main() {
  console.log('Recharge payment regression suite (stubbed gateway, scratch tenants)\n');

  const originalSettings = await rechargeSettings.getSettings();
  await prisma.verificationRechargeSettings.update({
    where: { scope: 'GLOBAL' },
    data: {
      enableOnlineRecharge: true, sellingPricePerCredit: 4, providerCostPerCredit: 2.5,
      minRechargeAmount: 500, maxRechargeAmount: 100000, gstEnabled: false, gstPercent: 18,
      autoCreditAllocation: true, roundOffPolicy: 'FLOOR',
    },
  });

  // Bystander wallet with a known balance.
  await prisma.verificationCreditWallet.upsert({
    where: { companyId_serviceType: { companyId: COMPANY_B, serviceType: 'BANK_VERIFICATION' } },
    update: { totalCredits: 7, usedCredits: 0, remainingCredits: 7, status: 'Active' },
    create: { companyId: COMPANY_B, serviceType: 'BANK_VERIFICATION', totalCredits: 7, remainingCredits: 7, status: 'Active' },
  });

  try {
    // §1 Quoting — customer math only, no price fields in the tenant config
    console.log('§1 Quoting & tenant-safe config');
    const settings = await rechargeSettings.getSettings();
    const q = rechargeSettings.priceQuote(500, settings);
    check('₹500 at ₹4/credit → 125 credits', q.ok && q.credits === 125 && q.totalPayable === 500);
    check('below minimum is rejected', !rechargeSettings.priceQuote(499, settings).ok);
    const gstQ = rechargeSettings.priceQuote(1000, { ...settings, gstEnabled: true });
    check('GST added on top, credits math unchanged', gstQ.credits === 250 && gstQ.totalPayable === 1180);
    const tenantCfg = await rechargeSettings.tenantConfig();
    const cfgJson = JSON.stringify(tenantCfg);
    check('tenant config never contains price/cost fields',
      !cfgJson.includes('sellingPrice') && !cfgJson.includes('providerCost') && !cfgJson.includes('margin'));
    check('tenant config packages expose amount → credits', tenantCfg.packages.every((p) => p.amount > 0 && p.credits > 0));

    // §2 Order creation — snapshot frozen
    console.log('§2 Order creation & pricing snapshot');
    const { order: o1 } = await paymentOrderService.createRechargeOrder({ scope, user: buyer, amount: 500 });
    const row1 = await prisma.paymentOrder.findUnique({ where: { orderId: o1.orderId } });
    check('order stores session-derived company', row1.companyId === COMPANY_A);
    check('snapshot: price 4, providerCost 2.5, 125 credits', row1.sellingPriceSnapshot === 4 && row1.providerCostSnapshot === 2.5 && row1.creditsPurchased === 125);
    check('tenant view hides snapshots & raw payloads',
      !('sellingPriceSnapshot' in o1) && !('providerCostSnapshot' in o1) && !('rawOrderResponse' in o1));

    // §3 Unpaid order → no credits
    console.log('§3 Settlement gates');
    const before = (await wallet(COMPANY_A))?.remainingCredits || 0;
    const pend = await paymentOrderService.verifyAndSettle(o1.orderId, { trigger: 'test' });
    check('gateway ACTIVE → outcome PENDING, no credits', pend.outcome === 'PENDING' && ((await wallet(COMPANY_A))?.remainingCredits || 0) === before);

    // §4 Paid order settles exactly once
    markPaid(o1.orderId);
    const settle1 = await paymentOrderService.verifyAndSettle(o1.orderId, { trigger: 'test' });
    const w1 = await wallet(COMPANY_A);
    check('paid order → CREDITED', settle1.outcome === 'CREDITED');
    check('wallet gained exactly 125', w1.remainingCredits === before + 125 && w1.totalCredits >= 125);
    const ledger1 = await prisma.verificationCreditTransaction.findMany({ where: { companyId: COMPANY_A, referenceId: o1.orderId } });
    check('exactly one Credit ledger row, opening/closing consistent',
      ledger1.length === 1 && ledger1[0].transactionType === 'Credit' && ledger1[0].closingBalance - ledger1[0].openingBalance === 125);
    const again = await paymentOrderService.verifyAndSettle(o1.orderId, { trigger: 'test' });
    check('re-verify → ALREADY_SETTLED, wallet unchanged',
      again.outcome === 'ALREADY_SETTLED' && (await wallet(COMPANY_A)).remainingCredits === w1.remainingCredits);
    const inv1 = await prisma.verificationRechargeInvoice.findUnique({ where: { orderId: o1.orderId } });
    check('invoice generated post-commit with VCR number', !!inv1 && /^VCR-\d{4}-\d{4}$/.test(inv1.invoiceNo));

    // §5 Concurrency — webhook storm cannot double-credit
    console.log('§5 Concurrent settlement (6 simultaneous verifies)');
    const { order: o2 } = await paymentOrderService.createRechargeOrder({ scope, user: buyer, amount: 1000 });
    markPaid(o2.orderId);
    const baseline = (await wallet(COMPANY_A)).remainingCredits;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => paymentOrderService.verifyAndSettle(o2.orderId, { trigger: 'storm' }).catch((e) => ({ outcome: `ERR:${e.message}` })))
    );
    const credited = results.filter((r) => r.outcome === 'CREDITED').length;
    const w2 = await wallet(COMPANY_A);
    check('exactly one of six settles', credited === 1, `credited=${credited} outcomes=${results.map((r) => r.outcome).join(',')}`);
    check('wallet gained exactly 250 once', w2.remainingCredits === baseline + 250, `got ${w2.remainingCredits - baseline}`);
    const ledger2 = await prisma.verificationCreditTransaction.count({ where: { companyId: COMPANY_A, referenceId: o2.orderId } });
    check('single ledger row despite the storm', ledger2 === 1);

    // §6 Amount tampering → FLAGGED, zero credits
    console.log('§6 Amount-mismatch protection');
    const { order: o3 } = await paymentOrderService.createRechargeOrder({ scope, user: buyer, amount: 2000 });
    markPaid(o3.orderId, { order_amount: 500 }); // gateway reports less than we quoted
    const flagRes = await paymentOrderService.verifyAndSettle(o3.orderId, { trigger: 'test' });
    const row3 = await prisma.paymentOrder.findUnique({ where: { orderId: o3.orderId } });
    check('mismatch → FLAGGED, settlement still PENDING', flagRes.outcome === 'FLAGGED' && row3.status === 'FLAGGED' && row3.settlementStatus === 'PENDING');
    check('no credits from a flagged order', (await wallet(COMPANY_A)).remainingCredits === w2.remainingCredits);

    // §7 Price change cannot rewrite an in-flight order
    console.log('§7 Snapshot survives a price change');
    const { order: o4 } = await paymentOrderService.createRechargeOrder({ scope, user: buyer, amount: 500 }); // 125 @ ₹4
    await prisma.verificationRechargeSettings.update({ where: { scope: 'GLOBAL' }, data: { sellingPricePerCredit: 5 } });
    markPaid(o4.orderId);
    const preP = (await wallet(COMPANY_A)).remainingCredits;
    await paymentOrderService.verifyAndSettle(o4.orderId, { trigger: 'test' });
    check('settles 125 credits from the ₹4 snapshot (not 100 at ₹5)', (await wallet(COMPANY_A)).remainingCredits === preP + 125);
    await prisma.verificationRechargeSettings.update({ where: { scope: 'GLOBAL' }, data: { sellingPricePerCredit: 4 } });

    // §8 Manual-approval mode
    console.log('§8 Manual approval mode');
    await prisma.verificationRechargeSettings.update({ where: { scope: 'GLOBAL' }, data: { autoCreditAllocation: false } });
    const { order: o5 } = await paymentOrderService.createRechargeOrder({ scope, user: buyer, amount: 500 });
    markPaid(o5.orderId);
    const hold = await paymentOrderService.verifyAndSettle(o5.orderId, { trigger: 'test' });
    const preA = (await wallet(COMPANY_A)).remainingCredits;
    check('paid order held as AWAITING_APPROVAL, no credits', hold.outcome === 'AWAITING_APPROVAL' && hold.order.settlementStatus === 'AWAITING_APPROVAL');
    const approve = await paymentOrderService.approveSettlement(o5.orderId, 'QA Super Admin');
    check('approval settles once', approve.outcome === 'CREDITED' && (await wallet(COMPANY_A)).remainingCredits === preA + 125);
    const approve2 = await paymentOrderService.approveSettlement(o5.orderId, 'QA Super Admin');
    check('second approval is a no-op', approve2.outcome === 'ALREADY_SETTLED');
    await prisma.verificationRechargeSettings.update({ where: { scope: 'GLOBAL' }, data: { autoCreditAllocation: true } });

    // §9 Refunds never auto-remove credits
    console.log('§9 Refund handling');
    const preR = (await wallet(COMPANY_A)).remainingCredits;
    await paymentOrderService.recordRefund({ orderId: o1.orderId, cfRefundId: 'refund_qa_1', amount: 500, status: 'SUCCESS' });
    const refRow = await prisma.paymentRefund.findUnique({ where: { cfRefundId: 'refund_qa_1' } });
    const o1After = await prisma.paymentOrder.findUnique({ where: { orderId: o1.orderId } });
    check('refund recorded, order marked REFUNDED', !!refRow && o1After.status === 'REFUNDED');
    check('credits untouched by the refund', (await wallet(COMPANY_A)).remainingCredits === preR);
    await paymentOrderService.recordRefund({ orderId: o1.orderId, cfRefundId: 'refund_qa_1', amount: 500, status: 'SUCCESS' });
    check('duplicate refund webhook upserts, not duplicates', (await prisma.paymentRefund.count({ where: { orderId: o1.orderId } })) === 1);

    // §10 Webhook signature
    console.log('§10 Webhook signature verification');
    const rawBody = Buffer.from(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: o1.orderId } } }));
    const ts = String(Date.now());
    const goodSig = crypto.createHmac('sha256', 'TEST_SECRET').update(ts + rawBody.toString('utf8')).digest('base64');
    check('valid signature accepted', cashfreePg.verifyWebhookSignature({ signature: goodSig, timestamp: ts, rawBody }) === true);
    check('tampered body rejected', cashfreePg.verifyWebhookSignature({ signature: goodSig, timestamp: ts, rawBody: Buffer.from(rawBody + 'x') }) === false);
    check('wrong secret rejected', cashfreePg.verifyWebhookSignature({ signature: crypto.createHmac('sha256', 'WRONG').update(ts + rawBody.toString('utf8')).digest('base64'), timestamp: ts, rawBody }) === false);

    // §11 Tenant isolation — the bystander company never moved
    console.log('§11 Multi-tenant isolation');
    const wB = await wallet(COMPANY_B);
    check('Company B wallet untouched through every scenario', wB.remainingCredits === 7 && wB.totalCredits === 7 && wB.usedCredits === 0);
    const bLedger = await prisma.verificationCreditTransaction.count({ where: { companyId: COMPANY_B } });
    check('Company B has zero ledger rows', bLedger === 0);

    // §12 Existing manual allocation still works on top
    console.log('§12 Manual Super Admin allocation unaffected');
    const VerificationCreditService = require('../src/services/verificationCreditService');
    const preM = (await wallet(COMPANY_A)).remainingCredits;
    await VerificationCreditService.allocateCredits({ companyId: COMPANY_A, action: 'ADD', credits: 10, createdBy: 'QA' });
    check('manual ADD still adds 10', (await wallet(COMPANY_A)).remainingCredits === preM + 10);
  } finally {
    // ── Cleanup: remove every scratch row, restore settings verbatim ─────────
    console.log('\nCleaning up scratch data…');
    const orderIds = (await prisma.paymentOrder.findMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } }, select: { orderId: true } })).map((o) => o.orderId);
    await prisma.paymentRefund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.verificationRechargeInvoice.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.paymentOrder.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.verificationCreditTransaction.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.verificationCreditWallet.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.verificationSettings.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.notification.deleteMany({ where: { OR: [{ message: { contains: `#${COMPANY_A}` } }, { message: { contains: `#${COMPANY_B}` } }] } });
    await prisma.verificationRechargeSettings.update({
      where: { scope: 'GLOBAL' },
      data: {
        enableOnlineRecharge: originalSettings.enableOnlineRecharge,
        sellingPricePerCredit: originalSettings.sellingPricePerCredit,
        providerCostPerCredit: originalSettings.providerCostPerCredit,
        minRechargeAmount: originalSettings.minRechargeAmount,
        maxRechargeAmount: originalSettings.maxRechargeAmount,
        gstEnabled: originalSettings.gstEnabled,
        gstPercent: originalSettings.gstPercent,
        autoCreditAllocation: originalSettings.autoCreditAllocation,
        roundOffPolicy: originalSettings.roundOffPolicy,
        currency: originalSettings.currency,
      },
    });
    Object.assign(cashfreePg, realFns);
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('SUITE CRASHED:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
