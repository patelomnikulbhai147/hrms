/**
 * NEW Employee-Based Subscription System (Beta) — fully ADDITIVE & ISOLATED.
 *
 * Runs ALONGSIDE the existing SubscriptionPlan / Billing system; it never reads or
 * writes those tables, so the production subscription module is completely
 * unaffected. Billing model:
 *
 *   monthlyCharge = peakEmployeeCount × employeePrice
 *                 + purchasedBranchSlots × branchPrice
 *                 − discount
 *
 * Only ACTIVE employees raise the peak. The peak is a high-water mark and never
 * decreases automatically. Super Admin configures global + per-company pricing,
 * branch-slot allocation, discounts, validity and status — every change is audited.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const respondError = require('../utils/respondError');

const actorOf = (req) => req.user?.name || req.user?.email || 'System';
const isSuper = (req) => req.user?.role === 'Super Admin';

// ── Global defaults (singleton) ──────────────────────────────────────────────
async function getOrCreateConfig() {
  let cfg = await prisma.employeeSubscriptionConfig.findFirst({ orderBy: { id: 'asc' } });
  if (!cfg) cfg = await prisma.employeeSubscriptionConfig.create({ data: { employeePrice: 100, branchPrice: 500 } });
  return cfg;
}

// Count CURRENTLY active employees for a company (status === 'Active' only).
async function countActiveEmployees(companyId) {
  return prisma.employee.count({ where: { companyId, status: 'Active' } });
}
// Count live (non-archived) branches a company actually uses.
async function countUsedBranches(companyId) {
  return prisma.branch.count({ where: { companyId, isArchived: false } });
}

// Ensure a subscription row exists; seed peak from the current active headcount.
async function getOrCreateSubscription(companyId) {
  let sub = await prisma.employeeSubscription.findUnique({ where: { companyId } });
  if (!sub) {
    const active = await countActiveEmployees(companyId);
    sub = await prisma.employeeSubscription.create({
      data: { companyId, peakEmployeeCount: active, purchasedBranchSlots: 1 },
    });
  }
  return sub;
}

// Write an immutable audit row for any billing change. No billing change without one.
async function audit(req, companyId, companyName, field, oldValue, newValue, reason) {
  try {
    await prisma.subscriptionBillingAudit.create({
      data: {
        companyId: companyId ?? null, companyName: companyName ?? null, field,
        oldValue: oldValue == null ? null : String(oldValue),
        newValue: newValue == null ? null : String(newValue),
        changedBy: actorOf(req), reason: reason || null,
      },
    });
  } catch (_) { /* audit must never block the primary action */ }
}

// Resolve a company's effective prices + computed dashboard figures.
async function computeDashboard(companyId) {
  const cfg = await getOrCreateConfig();
  const sub = await getOrCreateSubscription(companyId);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }).catch(() => null);

  const currentActive = await countActiveEmployees(companyId);
  // Peak never decreases automatically — keep the stored high-water mark, but if the
  // current active count is somehow higher (e.g. data created outside approval),
  // raise it so billing is never understated.
  const peak = Math.max(sub.peakEmployeeCount || 0, currentActive);
  if (peak !== sub.peakEmployeeCount) {
    await prisma.employeeSubscription.update({ where: { companyId }, data: { peakEmployeeCount: peak } }).catch(() => {});
  }

  const employeePrice = sub.employeePrice != null ? sub.employeePrice : cfg.employeePrice;
  const branchPrice = sub.branchPrice != null ? sub.branchPrice : cfg.branchPrice;
  const usedBranchSlots = await countUsedBranches(companyId);
  const purchasedBranchSlots = sub.purchasedBranchSlots || 1;

  const employeeCharges = peak * employeePrice;
  const branchCharges = purchasedBranchSlots * branchPrice;
  const subtotal = employeeCharges + branchCharges;
  const discountAmount = Math.round((subtotal * (sub.discountPercent || 0)) / 100);
  const totalMonthly = Math.max(0, subtotal - discountAmount);

  return {
    companyId, companyName: company?.name || `Company #${companyId}`,
    currentActiveEmployees: currentActive,
    peakEmployeeCount: peak,
    employeePrice, employeeCharges,
    purchasedBranchSlots, usedBranchSlots,
    remainingBranchSlots: Math.max(0, purchasedBranchSlots - usedBranchSlots),
    branchPrice, branchCharges,
    discountPercent: sub.discountPercent || 0, discountAmount,
    totalMonthly,
    validUntil: sub.validUntil, status: sub.status, paymentStatus: sub.paymentStatus,
    usesGlobalEmployeePrice: sub.employeePrice == null,
    usesGlobalBranchPrice: sub.branchPrice == null,
    defaults: { employeePrice: cfg.employeePrice, branchPrice: cfg.branchPrice },
  };
}

// ── Peak auto-update hook (called from the temp-employee approval flow) ───────
// Raises the company's peak when a newly-activated employee creates a new maximum.
// Exported so other controllers can call it; never throws.
async function bumpPeakForCompany(companyId) {
  try {
    const cid = idParam(companyId);
    if (!cid) return;
    const sub = await getOrCreateSubscription(cid);
    const active = await countActiveEmployees(cid);
    if (active > (sub.peakEmployeeCount || 0)) {
      await prisma.employeeSubscription.update({ where: { companyId: cid }, data: { peakEmployeeCount: active } });
    }
  } catch (_) { /* billing must never break the approval */ }
}
exports.bumpPeakForCompany = bumpPeakForCompany;

// ── Endpoints ────────────────────────────────────────────────────────────────

// GET /api/employee-subscription/config — global defaults.
exports.getConfig = async (req, res) => {
  try { res.json(await getOrCreateConfig()); } catch (e) { return respondError(res, e); }
};

// PUT /api/employee-subscription/config — Super Admin updates global default prices.
exports.updateConfig = async (req, res) => {
  try {
    const cfg = await getOrCreateConfig();
    const b = req.body || {};
    const reason = String(b.reason || '').trim() || 'Global default pricing update';
    const data = {};
    if (b.employeePrice != null && Number(b.employeePrice) !== cfg.employeePrice) {
      data.employeePrice = Number(b.employeePrice);
      await audit(req, null, 'GLOBAL DEFAULT', 'employeePrice', cfg.employeePrice, data.employeePrice, reason);
    }
    if (b.branchPrice != null && Number(b.branchPrice) !== cfg.branchPrice) {
      data.branchPrice = Number(b.branchPrice);
      await audit(req, null, 'GLOBAL DEFAULT', 'branchPrice', cfg.branchPrice, data.branchPrice, reason);
    }
    if (!Object.keys(data).length) return res.json(cfg);
    const updated = await prisma.employeeSubscriptionConfig.update({ where: { id: cfg.id }, data });
    res.json(updated);
  } catch (e) { return respondError(res, e); }
};

// GET /api/employee-subscription/dashboard/:companyId — full computed dashboard.
exports.getDashboard = async (req, res) => {
  try {
    const companyId = idParam(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
    // Non-super users may only view their own company's beta dashboard.
    if (!isSuper(req)) {
      const allowed = [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
      if (!allowed.includes(companyId)) return res.status(403).json({ error: 'Unauthorized.' });
    }
    res.json(await computeDashboard(companyId));
  } catch (e) { return respondError(res, e); }
};

// GET /api/employee-subscription — Super Admin list of every company's dashboard.
exports.list = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { parentCompanyId: null }, select: { id: true }, orderBy: { id: 'asc' },
    });
    const out = [];
    for (const c of companies) out.push(await computeDashboard(c.id));
    res.json(out);
  } catch (e) { return respondError(res, e); }
};

// PUT /api/employee-subscription/:companyId — Super Admin updates a company's
// subscription. Every changed field is audited (with a reason).
exports.updateSubscription = async (req, res) => {
  try {
    const companyId = idParam(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
    const sub = await getOrCreateSubscription(companyId);
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }).catch(() => null);
    const cname = company?.name || `Company #${companyId}`;
    const b = req.body || {};
    const reason = String(b.reason || '').trim() || 'Subscription update';
    const data = {};

    // Helper: stage a numeric/string field with an audit entry if it changed.
    const stage = async (key, raw, transform = (v) => v) => {
      if (raw === undefined) return;
      const next = raw === '' || raw === null ? null : transform(raw);
      const prev = sub[key];
      if (String(next) === String(prev)) return;
      data[key] = next;
      await audit(req, companyId, cname, key, prev, next, reason);
    };

    await stage('employeePrice', b.employeePrice, Number);   // per-company override (null = use default)
    await stage('branchPrice', b.branchPrice, Number);       // per-company override (null = use default)
    await stage('peakEmployeeCount', b.peakEmployeeCount, (v) => Math.max(0, Math.round(Number(v)))); // manual correction
    await stage('purchasedBranchSlots', b.purchasedBranchSlots, (v) => Math.max(1, Math.round(Number(v))));
    await stage('discountPercent', b.discountPercent, (v) => Math.max(0, Math.min(100, Number(v))));
    await stage('status', b.status, String);
    await stage('paymentStatus', b.paymentStatus, String);
    if (b.validUntil !== undefined) await stage('validUntil', b.validUntil, (v) => new Date(v));

    if (Object.keys(data).length) await prisma.employeeSubscription.update({ where: { companyId }, data });
    res.json(await computeDashboard(companyId));
  } catch (e) { return respondError(res, e); }
};

// GET /api/employee-subscription/audit?companyId= — billing audit trail.
exports.getAudit = async (req, res) => {
  try {
    const companyId = req.query.companyId ? idParam(req.query.companyId) : null;
    const rows = await prisma.subscriptionBillingAudit.findMany({
      where: companyId ? { companyId } : {},
      orderBy: { createdAt: 'desc' }, take: 200,
    });
    res.json(rows);
  } catch (e) { return respondError(res, e); }
};

// GET /api/employee-subscription/branch-slot/:companyId — slot usage (informational).
exports.branchSlot = async (req, res) => {
  try {
    const companyId = idParam(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
    const sub = await getOrCreateSubscription(companyId);
    const used = await countUsedBranches(companyId);
    const purchased = sub.purchasedBranchSlots || 1;
    res.json({
      companyId, purchased, used, remaining: Math.max(0, purchased - used),
      canCreate: used < purchased,
      message: used < purchased ? null : 'Branch Slot Limit Reached. Please contact Super Admin for additional Branch Slot allocation.',
    });
  } catch (e) { return respondError(res, e); }
};
