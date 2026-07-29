/**
 * Verification Credit Recharge — pricing settings, packages and quoting.
 *
 * The selling price is DATA, configured by Super Admin, never a constant in
 * business logic. Two audiences, two shapes:
 *
 *   adminView()  — full settings incl. providerCostPerCredit (margin input)
 *   tenantConfig() — what a Company Head may see: enabled flag, limits, GST,
 *                    and packages as "amount → credits". No per-credit price,
 *                    no provider cost, no margin. Custom amounts are quoted
 *                    server-side for the same reason.
 */
const prisma = require('../../config/prisma');
const cashfreePg = require('./cashfreePgClient');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function getSettings() {
  let row = await prisma.verificationRechargeSettings.findUnique({ where: { scope: 'GLOBAL' } });
  if (!row) {
    row = await prisma.verificationRechargeSettings.create({ data: { scope: 'GLOBAL' } });
  }
  return row;
}

const EDITABLE_FIELDS = [
  'enableOnlineRecharge',
  'sellingPricePerCredit',
  'providerCostPerCredit',
  'minRechargeAmount',
  'maxRechargeAmount',
  'gstEnabled',
  'gstPercent',
  'currency',
  'autoCreditAllocation',
  'roundOffPolicy',
];

async function updateSettings(patch = {}, updatedBy = 'Super Admin') {
  const data = {};
  for (const key of EDITABLE_FIELDS) {
    if (patch[key] === undefined) continue;
    data[key] = patch[key];
  }
  if (data.sellingPricePerCredit !== undefined) {
    const v = Number(data.sellingPricePerCredit);
    if (!Number.isFinite(v) || v <= 0) throw new Error('Selling price per verification must be a positive number.');
    data.sellingPricePerCredit = v;
  }
  if (data.providerCostPerCredit !== undefined) {
    const v = Number(data.providerCostPerCredit);
    if (!Number.isFinite(v) || v < 0) throw new Error('Provider cost must be zero or a positive number.');
    data.providerCostPerCredit = v;
  }
  if (data.minRechargeAmount !== undefined) {
    const v = Number(data.minRechargeAmount);
    if (!Number.isFinite(v) || v < 0) throw new Error('Minimum recharge amount must be zero or a positive number.');
    data.minRechargeAmount = v;
  }
  if (data.maxRechargeAmount !== undefined) {
    const v = Number(data.maxRechargeAmount);
    if (!Number.isFinite(v) || v <= 0) throw new Error('Maximum recharge amount must be a positive number.');
    data.maxRechargeAmount = v;
  }
  if (data.gstPercent !== undefined) {
    const v = Number(data.gstPercent);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error('GST percentage must be between 0 and 100.');
    data.gstPercent = v;
  }
  if (data.roundOffPolicy !== undefined && !['FLOOR', 'ROUND'].includes(String(data.roundOffPolicy))) {
    throw new Error('Round-off policy must be FLOOR or ROUND.');
  }
  const current = await getSettings();
  if ((data.minRechargeAmount ?? current.minRechargeAmount) > (data.maxRechargeAmount ?? current.maxRechargeAmount)) {
    throw new Error('Minimum recharge amount cannot exceed the maximum recharge amount.');
  }
  data.updatedBy = String(updatedBy || 'Super Admin');
  return prisma.verificationRechargeSettings.update({ where: { scope: 'GLOBAL' }, data });
}

/**
 * Price a recharge amount using the CURRENT settings. Used for live quotes and
 * at order creation (where the result is frozen onto the order as a snapshot).
 * GST is added ON TOP so the advertised "amount → credits" math stays exact.
 */
function priceQuote(amount, settings) {
  const base = Number(amount);
  if (!Number.isFinite(base) || base <= 0) {
    return { ok: false, error: 'Enter a valid recharge amount.' };
  }
  if (base < settings.minRechargeAmount) {
    return { ok: false, error: `Minimum recharge amount is ${settings.currency === 'INR' ? '₹' : ''}${settings.minRechargeAmount}.` };
  }
  if (settings.maxRechargeAmount && base > settings.maxRechargeAmount) {
    return { ok: false, error: `Maximum recharge amount is ${settings.currency === 'INR' ? '₹' : ''}${settings.maxRechargeAmount}.` };
  }
  const rawCredits = base / settings.sellingPricePerCredit;
  const credits = settings.roundOffPolicy === 'ROUND' ? Math.round(rawCredits) : Math.floor(rawCredits);
  if (credits < 1) {
    return { ok: false, error: 'This amount is too small to purchase any verification credits.' };
  }
  const gstAmount = settings.gstEnabled ? r2(base * (settings.gstPercent / 100)) : 0;
  return {
    ok: true,
    baseAmount: r2(base),
    credits,
    gstEnabled: Boolean(settings.gstEnabled),
    gstPercent: settings.gstEnabled ? settings.gstPercent : 0,
    gstAmount,
    totalPayable: r2(base + gstAmount),
    currency: settings.currency,
  };
}

async function listPackages({ activeOnly = true } = {}) {
  return prisma.verificationRechargePackage.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

async function savePackage({ id = null, name, amount, description = null, isActive = true, sortOrder = 0 }) {
  const amt = Number(amount);
  if (!String(name || '').trim()) throw new Error('Package name is required.');
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Package amount must be a positive number.');
  const data = { name: String(name).trim(), amount: amt, description, isActive: Boolean(isActive), sortOrder: parseInt(sortOrder, 10) || 0 };
  if (id) return prisma.verificationRechargePackage.update({ where: { id: parseInt(id, 10) }, data });
  return prisma.verificationRechargePackage.create({ data });
}

async function deletePackage(id) {
  return prisma.verificationRechargePackage.delete({ where: { id: parseInt(id, 10) } });
}

/**
 * The complete company-facing config. Everything a Company Head sees comes
 * from here — by construction it cannot leak the per-credit price or the
 * provider cost, because those fields are simply never included.
 */
async function tenantConfig() {
  const settings = await getSettings();
  const packages = await listPackages({ activeOnly: true });
  const enabled = Boolean(settings.enableOnlineRecharge) && cashfreePg.isConfigured();
  return {
    enabled,
    // Distinguish "switched off" from "gateway not configured" for Super Admin
    // troubleshooting; both render as unavailable to the tenant.
    reason: enabled ? null : (!settings.enableOnlineRecharge ? 'DISABLED' : 'PG_NOT_CONFIGURED'),
    currency: settings.currency,
    minRechargeAmount: settings.minRechargeAmount,
    maxRechargeAmount: settings.maxRechargeAmount,
    gstEnabled: Boolean(settings.gstEnabled),
    gstPercent: settings.gstEnabled ? settings.gstPercent : 0,
    checkoutMode: cashfreePg.envMode(), // 'sandbox' | 'production' for the JS SDK
    packages: packages
      .map((p) => {
        const q = priceQuote(p.amount, settings);
        if (!q.ok) return null; // a package below the minimum simply isn't offered
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          amount: q.baseAmount,
          credits: q.credits,
          gstAmount: q.gstAmount,
          totalPayable: q.totalPayable,
        };
      })
      .filter(Boolean),
  };
}

module.exports = { getSettings, updateSettings, priceQuote, listPackages, savePackage, deletePackage, tenantConfig, r2 };
