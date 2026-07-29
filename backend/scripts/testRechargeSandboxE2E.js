/**
 * Sandbox E2E — exercises the REAL running backend + REAL Cashfree sandbox:
 * login as the Company Head, load recharge config, quote, create a live
 * sandbox order (returns a payment_session_id), verify (expects PENDING —
 * nothing has paid it), and read history. Nothing here is billable: sandbox
 * orders cost nothing and expire on their own.
 *
 *   node scripts/tmpSandboxE2E.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const prisma = require('../src/config/prisma');
const cashfreePg = require('../src/services/payments/cashfreePgClient');

const BASE = 'http://localhost:5000/api';
let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// Mint a valid internal-captcha pair the same way authController does.
function mintCaptcha(answer = 'ABC123') {
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const hash = crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(answer.toUpperCase() + '.' + expiresAt).digest('hex');
  return { captchaAnswer: answer, captchaId: `${hash}.${expiresAt}` };
}

async function http(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}`, 'x-workspace-id': '1', 'x-workspace-kind': 'company' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

async function main() {
  console.log('Sandbox end-to-end test (real backend + real Cashfree sandbox)\n');

  // §1 Gateway config resolves sandbox credentials
  console.log('§1 Gateway configuration');
  const cfg = cashfreePg.configStatus();
  check('mode is sandbox', cfg.mode === 'sandbox');
  check('gateway configured, no missing vars', cfg.configured && cfg.missing.length === 0, JSON.stringify(cfg.missing));

  // §2 Enable online recharge (the Super Admin toggle)
  await prisma.verificationRechargeSettings.update({ where: { scope: 'GLOBAL' }, data: { enableOnlineRecharge: true } });
  console.log('  · enableOnlineRecharge switched ON (left on for UI testing)');

  // §3 Company Head login through the real auth flow (minted internal captcha)
  console.log('§3 Company Head login');
  const login = await http('POST', '/auth/login', {
    body: { email: 'om@gmail.com', password: 'Om@12345', ...mintCaptcha() },
  });
  const token = login.data?.token || login.data?.jwt || login.data?.accessToken;
  check('login succeeds', login.status === 200 && !!token, `HTTP ${login.status}: ${JSON.stringify(login.data)?.slice(0, 200)}`);
  if (!token) throw new Error('Cannot continue without a login token.');

  // §4 Tenant recharge config
  console.log('§4 Recharge config (tenant view)');
  const conf = await http('GET', '/verification-credits/recharge/config', { token });
  check('config loads, enabled=true', conf.status === 200 && conf.data?.enabled === true, JSON.stringify(conf.data)?.slice(0, 200));
  check('Company Head can purchase', conf.data?.canPurchase === true);
  check('packages present with amount → credits', Array.isArray(conf.data?.packages) && conf.data.packages.length > 0 && conf.data.packages.every((p) => p.credits > 0));
  const confJson = JSON.stringify(conf.data);
  check('no price/cost leakage in tenant config', !confJson.includes('sellingPrice') && !confJson.includes('providerCost'));
  check('checkout mode is sandbox', conf.data?.checkoutMode === 'sandbox');

  // §5 Quote
  console.log('§5 Server-side quote');
  const quote = await http('POST', '/verification-credits/recharge/quote', { token, body: { amount: 500 } });
  check('₹500 quotes 125 credits', quote.status === 200 && quote.data?.credits === 125, JSON.stringify(quote.data));

  // §6 REAL sandbox order creation
  console.log('§6 Live Cashfree sandbox order');
  const order = await http('POST', '/verification-credits/recharge/orders', { token, body: { amount: 500 } });
  check('order created (HTTP 201)', order.status === 201, `HTTP ${order.status}: ${JSON.stringify(order.data)?.slice(0, 300)}`);
  const orderId = order.data?.order?.orderId;
  check('payment_session_id returned', typeof order.data?.paymentSessionId === 'string' && order.data.paymentSessionId.length > 10);
  // GST is a live Super Admin setting — assert consistently with whatever it is:
  // credits always follow the base amount; GST (if on) is added on top.
  const expectedTotal = conf.data?.gstEnabled ? 500 * (1 + conf.data.gstPercent / 100) : 500;
  check(`order snapshot: 125 credits, base ₹500, payable ₹${expectedTotal}`,
    order.data?.order?.creditsPurchased === 125 &&
    order.data?.order?.baseAmount === 500 &&
    Math.abs(order.data?.order?.totalAmount - expectedTotal) < 0.01,
    JSON.stringify(order.data?.order)?.slice(0, 200));
  check('tenant order view hides internals', order.data?.order && !('sellingPriceSnapshot' in order.data.order) && !('providerCostSnapshot' in order.data.order));

  if (orderId) {
    // §7 Verify — unpaid, must be PENDING with zero credits granted
    console.log('§7 Verify unpaid order');
    const balBefore = (await prisma.verificationCreditWallet.findUnique({
      where: { companyId_serviceType: { companyId: 1, serviceType: 'BANK_VERIFICATION' } },
    }))?.remainingCredits ?? 0;
    const verify = await http('POST', `/verification-credits/recharge/orders/${orderId}/verify`, { token });
    check('verify returns outcome PENDING (unpaid)', verify.status === 200 && verify.data?.outcome === 'PENDING', JSON.stringify(verify.data)?.slice(0, 200));
    const balAfter = (await prisma.verificationCreditWallet.findUnique({
      where: { companyId_serviceType: { companyId: 1, serviceType: 'BANK_VERIFICATION' } },
    }))?.remainingCredits ?? 0;
    check('no credits granted for an unpaid order', balBefore === balAfter);

    // §8 History
    console.log('§8 Recharge history');
    const hist = await http('GET', '/verification-credits/recharge/history', { token });
    const row = hist.data?.orders?.find((o) => o.orderId === orderId);
    check('history shows the new order as pending', hist.status === 200 && !!row && ['CREATED', 'ACTIVE'].includes(row.status), JSON.stringify(row));

    // §9 Cross-tenant protection over real HTTP: same order id, different workspace header
    console.log('§9 Tenant isolation over HTTP');
    const foreign = await fetch(`${BASE}/verification-credits/recharge/orders/${orderId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-workspace-id': '2', 'x-workspace-kind': 'company' },
    });
    check('verify under a foreign workspace is refused (403/404)', foreign.status === 403 || foreign.status === 404, `HTTP ${foreign.status}`);
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('SUITE CRASHED:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
