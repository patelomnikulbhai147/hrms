/**
 * Employee Slot Management — verification suite.
 *
 * Scratch tenant (999905), stubbed payment gateway (no network, nothing
 * billable), self-cleaning. Covers: CH/HR consume slots, archived employees
 * don't, limit enforcement + message, slot purchase raises limit without
 * touching the base plan, settlement idempotency, manual request/approve/
 * reject, Super Admin adjust with clamp, contact-sales rule, tenant isolation.
 *
 *   node scripts/verifyEmployeeSlotSystem.js
 */
process.env.CASHFREE_PG_ENV = 'sandbox';
process.env.CASHFREE_PG_SANDBOX_CLIENT_ID = 'TEST_ID';
process.env.CASHFREE_PG_SANDBOX_CLIENT_SECRET = 'TEST_SECRET';

const prisma = require('../src/config/prisma');
const cashfreePg = require('../src/services/payments/cashfreePgClient');
const paymentOrderService = require('../src/services/payments/paymentOrderService');
const slotService = require('../src/services/employeeSlotService');
const { getCapacity, assertCapacity } = require('../src/services/employeeLimitService');
const { ensureEmployeeProfileForUser } = require('../src/services/userEmployeeProfileService');

const COMPANY = 999905;
const BYSTANDER = 999906;

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── Gateway stub (same technique as testRechargePayments) ────────────────────
const gatewayState = new Map();
const realFns = { createOrder: cashfreePg.createOrder, getOrder: cashfreePg.getOrder, getOrderPayments: cashfreePg.getOrderPayments };
cashfreePg.createOrder = async ({ orderId, amount, currency }) => {
  gatewayState.set(orderId, { order_id: orderId, order_status: 'ACTIVE', order_amount: amount, order_currency: currency });
  return { cf_order_id: `cf_${orderId}`, payment_session_id: `session_${orderId}` };
};
cashfreePg.getOrder = async (orderId) => ({ ...gatewayState.get(orderId) });
cashfreePg.getOrderPayments = async (orderId) =>
  gatewayState.get(orderId)?.order_status === 'PAID'
    ? [{ cf_payment_id: 5511, payment_status: 'SUCCESS', payment_group: 'upi', payment_completion_time: new Date().toISOString() }]
    : [];
const markPaid = (orderId) => {
  const s = gatewayState.get(orderId);
  gatewayState.set(orderId, { ...s, order_status: 'PAID' });
};

const scratchUsers = [];
async function makeUser(role, email, { withProfile = true, branchId = null } = {}) {
  const user = await prisma.user.create({
    data: {
      name: `QA ${role}`, email, username: email.split('@')[0] + '-qa',
      passwordHash: 'x', role, companyId: COMPANY, branchId,
      status: 'Active', accessibleCompanyIds: [COMPANY],
      permissions: { profile: { designation: role, department: 'General' } },
    },
  });
  scratchUsers.push(user.id);
  if (withProfile) await ensureEmployeeProfileForUser(user);
  return prisma.user.findUnique({ where: { id: user.id } });
}

async function main() {
  console.log('Employee Slot System verification (scratch tenant, stubbed gateway)\n');

  // ── Setup: scratch head company on a Custom plan with base limit 5 ─────────
  await prisma.company.createMany({
    data: [
      { id: COMPANY, name: 'QA Slot Co', plan: 'Custom', isHeadOffice: true },
      { id: BYSTANDER, name: 'QA Bystander Co', plan: 'Free', isHeadOffice: true },
    ],
    skipDuplicates: true,
  });
  await prisma.companySubscription.upsert({
    where: { companyId: COMPANY },
    update: { plan: 'Custom', employeeLimit: 5, extraEmployeeSlots: 0 },
    create: { companyId: COMPANY, plan: 'Custom', employeeLimit: 5, extraEmployeeSlots: 0 },
  });
  const bystanderCap0 = await getCapacity(BYSTANDER);

  try {
    // §1 Every user type consumes a slot
    console.log('§1 Slot counting (CH + HR + employees, archived excluded)');
    const chUser = await makeUser('Company Head', 'qa-ch@test.local');
    let cap = await getCapacity(COMPANY);
    check('Company Head counts as 1 slot', cap.current === 1, `current=${cap.current}`);
    const chEmp = await prisma.employee.findUnique({ where: { id: (await prisma.user.findUnique({ where: { id: chUser.id } })).employeeId } });
    check('Company Head has a directory profile with a standard code', !!chEmp && /^[A-Z0-9-]+$/.test(chEmp.employeeId), chEmp?.employeeId);

    await makeUser('HR', 'qa-hr@test.local');
    cap = await getCapacity(COMPANY);
    check('HR counts as 1 more slot (total 2)', cap.current === 2);

    for (let i = 1; i <= 3; i++) {
      await prisma.employee.create({
        data: {
          employeeId: `QASLOT-${i}`, companyId: COMPANY, name: `QA Emp ${i}`, email: `qa-emp${i}@test.local`,
          department: 'Ops', designation: 'Staff', joinDate: new Date(), salary: 0, status: 'Active',
        },
      });
    }
    cap = await getCapacity(COMPANY);
    check('3 employees added → 5/5 used', cap.current === 5 && cap.limit === 5 && cap.remaining === 0);

    // Archived employees free their slot
    await prisma.employee.update({ where: { employeeId: 'QASLOT-3' }, data: { status: 'Archived' } });
    cap = await getCapacity(COMPANY);
    check('archived employee does not consume a slot (4/5)', cap.current === 4 && cap.remaining === 1);
    await prisma.employee.update({ where: { employeeId: 'QASLOT-3' }, data: { status: 'Active' } });

    // Safety net: an active user WITHOUT a profile still consumes a slot
    await makeUser('HR', 'qa-unlinked@test.local', { withProfile: false });
    cap = await getCapacity(COMPANY);
    check('unlinked active user still counted (safety net, 6/5 over)', cap.current === 6 && cap.currentUnlinkedUsers === 1);
    await prisma.user.delete({ where: { id: scratchUsers.pop() } });

    // §2 Enforcement at the limit
    console.log('§2 Limit enforcement');
    const blocked = await assertCapacity(COMPANY, 1);
    check('creation blocked at 5/5 with the required message',
      !blocked.ok && blocked.status === 403 && blocked.body.code === 'EMPLOYEE_LIMIT_REACHED' &&
      blocked.body.error.includes('purchase additional employee slots'),
      blocked.body?.error);
    check('block body carries base/extra/limit breakdown', blocked.body.baseLimit === 5 && blocked.body.extraSlots === 0 && blocked.body.limit === 5);

    // §3 Slot validation + tier pricing engine
    console.log('§3 Multiples-of-5 validation & tier pricing');
    for (const bad of [6, 12, 17, 23, 4, 0, -5, 10.5]) {
      check(`slots=${bad} rejected`, slotService.validateSlots(bad).ok === false);
    }
    for (const good of [5, 10, 15, 20, 25, 30, 35]) {
      check(`slots=${good} accepted`, slotService.validateSlots(good).ok === true);
    }
    check('gstTypeFor: same state → CGST+SGST', slotService.gstTypeFor('Gujarat', 'gujarat ') === 'CGST_SGST');
    check('gstTypeFor: different states → IGST', slotService.gstTypeFor('Maharashtra', 'Gujarat') === 'IGST');
    check('gstTypeFor: unknown origin → CGST+SGST (conservative intra)', slotService.gstTypeFor('Gujarat', '') === 'CGST_SGST');

    // Deterministic GST + the requirement's worked example: limit 100, buy 25
    // → new limit 125 → tier 101–500 → Quarterly ₹20 → subtotal ₹500.
    const { getSettings } = require('../src/services/payments/rechargeSettingsService');
    const originalGst = await getSettings();
    await prisma.verificationRechargeSettings.update({ where: { scope: 'GLOBAL' }, data: { gstEnabled: true, gstPercent: 18 } });
    await prisma.companySubscription.update({ where: { companyId: COMPANY }, data: { employeeLimit: 100, extraEmployeeSlots: 0, billingCycle: 'Quarterly' } });

    let q = await slotService.quoteSlots(COMPANY, 25);
    check('worked example: 100 + 25 → tier 101–500, ₹20/slot, subtotal ₹500',
      q.ok && q.newLimit === 125 && q.tier.rate === 20 && q.subtotal === 500, JSON.stringify(q));
    check('GST 18% on ₹500 = ₹90, grand total ₹590', q.gst.total === 90 && q.grandTotal === 590);
    check('GST split matches the state rule',
      q.gst.type === 'CGST_SGST' ? (q.gst.cgst === 45 && q.gst.sgst === 45 && q.gst.igst === 0) : (q.gst.igst === 90 && q.gst.cgst === 0));

    await prisma.companySubscription.update({ where: { companyId: COMPANY }, data: { employeeLimit: 50 } });
    q = await slotService.quoteSlots(COMPANY, 25);
    check('tier 0–100: 50 + 25 → 75 → ₹25/slot, subtotal ₹625', q.ok && q.tier.rate === 25 && q.subtotal === 625);

    await prisma.companySubscription.update({ where: { companyId: COMPANY }, data: { employeeLimit: 100, billingCycle: 'Yearly' } });
    q = await slotService.quoteSlots(COMPANY, 25);
    check('yearly cycle: 125 → tier 101–500 → ₹16/slot, subtotal ₹400', q.ok && q.tier.rate === 16 && q.subtotal === 400);
    check('quote echoes the INHERITED yearly cycle', q.subscription?.billingCycle === 'Yearly' && q.subscription?.inherited === true);
    await prisma.companySubscription.update({ where: { companyId: COMPANY }, data: { billingCycle: 'Quarterly' } });

    // §3a-bis Billing cycle is inherited from the subscription; expired
    // subscriptions cannot purchase slots at all.
    console.log('§3a-bis Cycle inheritance + expired-subscription gate');
    q = await slotService.quoteSlots(COMPANY, 25);
    check('quote echoes the INHERITED quarterly cycle (never a client input)',
      q.ok && q.subscription?.billingCycle === 'Quarterly' && q.subscription?.inherited === true && q.tier.cycle === 'Quarterly');

    await prisma.companySubscription.update({ where: { companyId: COMPANY }, data: { status: 'Expired' } });
    q = await slotService.quoteSlots(COMPANY, 25);
    check('expired subscription → quote refused with SUBSCRIPTION_EXPIRED',
      q.ok === false && q.code === 'SUBSCRIPTION_EXPIRED' && /subscription has expired/i.test(q.error || ''), JSON.stringify(q));
    let expErr = null;
    try { await slotService.createSlotOrder({ scope: { companyId: COMPANY }, user: { role: 'Company Head' }, slots: 25 }); } catch (e) { expErr = e; }
    check('expired subscription → online order blocked (422 SUBSCRIPTION_EXPIRED)',
      expErr?.status === 422 && expErr?.code === 'SUBSCRIPTION_EXPIRED');
    let expReqErr = null;
    try { await slotService.requestManualPurchase({ scope: { companyId: COMPANY }, user: { role: 'Company Head' }, slots: 25 }); } catch (e) { expReqErr = e; }
    check('expired subscription → manual sales request blocked too',
      expReqErr?.status === 422 && expReqErr?.code === 'SUBSCRIPTION_EXPIRED');
    let expOverview = await slotService.getOverview(COMPANY);
    check('overview flags the inactive subscription and hides purchasable options',
      expOverview.subscription?.active === false && !!expOverview.subscriptionExpiredMessage && expOverview.quickOptions.length === 0);

    // A past renewal date also counts as expired, even with status "Active".
    await prisma.companySubscription.update({
      where: { companyId: COMPANY },
      data: { status: 'Active', renewalDate: new Date('2020-01-01') },
    });
    q = await slotService.quoteSlots(COMPANY, 25);
    check('past renewal date → also treated as expired', q.ok === false && q.code === 'SUBSCRIPTION_EXPIRED');

    await prisma.companySubscription.update({ where: { companyId: COMPANY }, data: { status: 'Active', renewalDate: null } });
    q = await slotService.quoteSlots(COMPANY, 25);
    check('renewed subscription → purchasing available again', q.ok === true && q.subscription?.billingCycle === 'Quarterly');

    // §3b Online purchase (custom 25 slots, stubbed payment)
    console.log('§3b Online slot purchase raises the limit');
    const scope = { companyId: COMPANY, branchId: null, workspaceId: COMPANY, workspaceKind: 'company' };
    const buyer = { name: 'QA Company Head', email: null, role: 'Company Head' };
    const created = await slotService.createSlotOrder({ scope, user: buyer, slots: 25 });
    check('order frozen: 25 slots @ ₹20, total ₹590', created.order.creditsPurchased === 25 && created.order.totalAmount === 590);
    markPaid(created.order.orderId);
    const settle = await paymentOrderService.verifyAndSettle(created.order.orderId, { trigger: 'test' });
    cap = await getCapacity(COMPANY);
    check('payment settled → limit 100 + 25 = 125', settle.outcome === 'CREDITED' && cap.limit === 125 && cap.extraSlots === 25);
    check('base plan limit NOT overwritten', cap.baseLimit === 100);
    check('creation now allowed again', (await assertCapacity(COMPANY, 1)).ok === true);

    const slotTx = await prisma.employeeSlotTransaction.findUnique({ where: { orderId: created.order.orderId } });
    check('slot transaction row with old/new limits', !!slotTx && slotTx.oldLimit === 100 && slotTx.newLimit === 125 && slotTx.type === 'ONLINE_PURCHASE');
    const invoice = await prisma.verificationRechargeInvoice.findUnique({ where: { orderId: created.order.orderId } });
    check('invoice generated with ESP numbering', !!invoice && /^ESP-\d{4}-\d{4}$/.test(invoice.invoiceNo));
    check('invoice GST split consistent with the quote',
      !!invoice && Math.abs((invoice.cgst + invoice.sgst + invoice.igst) - 90) < 0.02 && invoice.totalAmount === 590);

    const again = await paymentOrderService.verifyAndSettle(created.order.orderId, { trigger: 'test' });
    check('duplicate settlement is a no-op', again.outcome === 'ALREADY_SETTLED' && (await getCapacity(COMPANY)).extraSlots === 25);

    // §4 NO minimum payment amount for slot purchases (5-slot floor only; the
    // ₹-minimum rule lives ONLY in the Verification Credit Recharge module).
    console.log('§4 No minimum payment amount (5 slots pays immediately)');
    const smallQ = await slotService.quoteSlots(COMPANY, 5);
    check('5-slot quote is OK with a payable total below ₹500',
      smallQ.ok && smallQ.grandTotal > 0 && smallQ.grandTotal < 500, JSON.stringify({ grandTotal: smallQ?.grandTotal }));
    check('quote exposes NO minimum-amount machinery',
      smallQ.onlineEligible === undefined && smallQ.minOnlineAmount === undefined && smallQ.slotsToMinimum === undefined && smallQ.shortfall === undefined);
    for (const n of [10, 25, 105]) {
      const q = await slotService.quoteSlots(COMPANY, n);
      check(`${n}-slot quote is OK and payable`, q.ok && q.grandTotal > 0);
    }
    const smallOrder = await slotService.createSlotOrder({ scope, user: buyer, slots: 5 });
    check('5-slot ORDER is accepted by the gateway path (no ₹500 backstop)',
      !!smallOrder?.order?.orderId && smallOrder.order.creditsPurchased === 5 && smallOrder.order.totalAmount === smallQ.grandTotal);
    await prisma.employeeSlotTransaction.deleteMany({ where: { orderId: smallOrder.order.orderId } });
    await prisma.paymentOrder.deleteMany({ where: { orderId: smallOrder.order.orderId } });

    // The recharge module's OWN minimum must be untouched by this change.
    const rechargeSettings = require('../src/services/payments/rechargeSettingsService');
    const rs = await rechargeSettings.getSettings();
    const tinyRecharge = rechargeSettings.priceQuote(Math.max(1, rs.minRechargeAmount - 1), rs);
    check(`verification recharge still enforces its own minimum (₹${rs.minRechargeAmount})`,
      rs.minRechargeAmount > 0 && tinyRecharge.ok === false && /minimum recharge/i.test(tinyRecharge.error || ''));

    let stepErr = null;
    try { await slotService.createSlotOrder({ scope, user: buyer, slots: 12 }); } catch (e) { stepErr = e; }
    check('order for 12 slots rejected (not a multiple of 5)', stepErr?.status === 422 && /multiples of 5/i.test(stepErr?.message || ''));
    const overview = await slotService.getOverview(COMPANY);
    check('overview quick options carry live tier quotes', overview.quickOptions.length > 0 && overview.quickOptions.every((o) => o.tier && o.grandTotal > 0));
    // Restore GST settings as found.
    await prisma.verificationRechargeSettings.update({
      where: { scope: 'GLOBAL' },
      data: { gstEnabled: originalGst.gstEnabled, gstPercent: originalGst.gstPercent },
    });

    // §5 Manual request → approve / reject (custom slot counts, step-validated)
    console.log('§5 Manual request lifecycle');
    let reqStepErr = null;
    try { await slotService.requestManualPurchase({ scope, user: buyer, slots: 7 }); } catch (e) { reqStepErr = e; }
    check('manual request for 7 slots rejected (multiples of 5)', reqStepErr?.status === 422);
    const reqRow = await slotService.requestManualPurchase({ scope, user: buyer, slots: 5, note: 'QA manual request' });
    check('request filed as REQUESTED', reqRow.status === 'REQUESTED' && reqRow.slots === 5);
    const approval = await slotService.approveRequest(reqRow.id, 'QA Super Admin');
    cap = await getCapacity(COMPANY);
    check('approval grants slots (extra 25 → 30, limit 130)', approval.newExtra === 30 && cap.limit === 130);
    let dblErr = null;
    try { await slotService.approveRequest(reqRow.id, 'QA Super Admin'); } catch (e) { dblErr = e; }
    check('double approval refused (409)', dblErr?.status === 409);

    const reqRow2 = await slotService.requestManualPurchase({ scope, user: buyer, slots: 5 });
    await slotService.rejectRequest(reqRow2.id, 'QA Super Admin', 'not needed');
    const rejected = await prisma.employeeSlotTransaction.findUnique({ where: { id: reqRow2.id } });
    check('rejection recorded, no slots granted', rejected.status === 'REJECTED' && (await getCapacity(COMPANY)).extraSlots === 30);

    // §6 Super Admin manual adjust + clamp
    console.log('§6 Manual adjustment');
    await slotService.adjustSlots({ companyId: COMPANY, delta: -5, reason: 'QA decrease', actor: 'QA Super Admin' });
    cap = await getCapacity(COMPANY);
    check('decrease -5 → extra 25, limit 125', cap.extraSlots === 25 && cap.limit === 125);
    await slotService.adjustSlots({ companyId: COMPANY, delta: -999, reason: 'QA clamp', actor: 'QA Super Admin' });
    cap = await getCapacity(COMPANY);
    check('oversized decrease clamps extra at 0 (base intact)', cap.extraSlots === 0 && cap.baseLimit === 100 && cap.limit === 100);
    let reasonErr = null;
    try { await slotService.adjustSlots({ companyId: COMPANY, delta: 5, reason: '', actor: 'QA' }); } catch (e) { reasonErr = e; }
    check('adjustment without a reason refused', reasonErr?.status === 422);

    // §7 Tenant isolation
    console.log('§7 Tenant isolation');
    const bystanderCap1 = await getCapacity(BYSTANDER);
    check('bystander company capacity untouched',
      bystanderCap1.current === bystanderCap0.current && bystanderCap1.extraSlots === bystanderCap0.extraSlots);
    const strayTx = await prisma.employeeSlotTransaction.count({ where: { companyId: BYSTANDER } });
    check('bystander has zero slot transactions', strayTx === 0);
  } finally {
    console.log('\nCleaning up scratch tenant…');
    const orderIds = (await prisma.paymentOrder.findMany({ where: { companyId: COMPANY }, select: { orderId: true } })).map((o) => o.orderId);
    await prisma.verificationRechargeInvoice.deleteMany({ where: { companyId: COMPANY } });
    await prisma.paymentOrder.deleteMany({ where: { companyId: COMPANY } });
    await prisma.employeeSlotTransaction.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } });
    await prisma.user.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } });
    await prisma.employee.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } });
    await prisma.companySubscription.deleteMany({ where: { companyId: { in: [COMPANY, BYSTANDER] } } });
    await prisma.notification.deleteMany({ where: { OR: [{ message: { contains: `#${COMPANY}` } }, { message: { contains: `#${BYSTANDER}` } }] } });
    await prisma.company.deleteMany({ where: { id: { in: [COMPANY, BYSTANDER] } } });
    Object.assign(cashfreePg, realFns);
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('SUITE CRASHED:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
