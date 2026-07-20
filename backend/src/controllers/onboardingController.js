// ─────────────────────────────────────────────────────────────────────────────
// FIRST-LOGIN ONBOARDING (per company, one-time)
//
// A brand-new company's first login shows a welcome gate: "Explore with Sample
// Data" or "Start Blank". The choice is recorded on the HEAD company's
// onboardingState so the gate never shows again, sample data can be generated
// only once, and (Phase 2) removed only once.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const AuditService = require('../services/auditService');
const { resolveHead, getCapacity } = require('../services/employeeLimitService');
const { generateDemoWorkspace, hasDemoData, removeSampleData } = require('../services/demoDataService');
const planStore = require('../services/planStore');

const actorOf = (req) => req.user?.name || req.user?.email || 'Company Head';

const normalize = (state) => {
  const s = (state && typeof state === 'object') ? state : {};
  return {
    firstLoginCompleted: !!s.firstLoginCompleted,
    onboardingCompleted: !!s.onboardingCompleted,
    usedSampleWorkspace: !!s.usedSampleWorkspace,
    sampleDataRemoved: !!s.sampleDataRemoved,
    choice: s.choice || null,
  };
};

// Only a company user (never Super Admin) owns an onboarding flow.
function guardCompanyUser(req, res) {
  if (!req.user || req.user.role === 'Super Admin' || !req.user.companyId) {
    res.status(403).json({ error: 'Onboarding is only available to a company account.' });
    return false;
  }
  return true;
}

async function buildStatus(companyId) {
  const head = await resolveHead(companyId);
  const cap = await getCapacity(companyId);
  return {
    onboarding: normalize(head?.onboardingState),
    capacity: { plan: cap.plan, limit: cap.limit, current: cap.current, remaining: cap.remaining === Infinity ? null : cap.remaining },
    canRemoveSampleData: head ? (normalize(head.onboardingState).usedSampleWorkspace && !normalize(head.onboardingState).sampleDataRemoved && await hasDemoData(head.id)) : false,
  };
}

// GET /api/onboarding/status
exports.status = async (req, res) => {
  try {
    if (!guardCompanyUser(req, res)) return;
    return res.json(await buildStatus(req.user.companyId));
  } catch (e) {
    console.error('[onboarding.status]', e);
    return res.status(500).json({ error: 'Failed to load onboarding status.' });
  }
};

// GET /api/onboarding/plans — company-readable plan catalog for the View Plans
// screen (the Super-Admin /subscriptions/catalog is admin-only). Includes each
// plan's capacity, per-employee prices, feature flags, unlocked modules and
// report scope, plus friendly module labels and the caller's current plan.
exports.plans = async (req, res) => {
  try {
    if (!guardCompanyUser(req, res)) return;
    const moduleLabel = new Map(planStore.MODULE_CATALOG.map((m) => [m.key, m.label]));
    const featureLabel = new Map((planStore.FEATURE_CATALOG || []).map((f) => [f.key, f.label]));
    const plans = planStore.getPlans()
      .filter((p) => p.status !== 'Archived')
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map((p) => {
        const enabledModules = Array.isArray(p.enabledModules) ? p.enabledModules : [];
        const enabledFeatures = Object.entries(p.features || {}).filter(([, v]) => v).map(([k]) => k);
        const reportsAll = p.enabledReports === 'all' || p.enabledReports == null;
        return {
          key: p.key, name: p.name, description: p.description, custom: !!p.custom, color: p.color,
          employeeMin: p.employeeMin, employeeMax: p.employeeMax,
          priceQuarterly: p.priceQuarterly, priceYearly: p.priceYearly,
          limits: p.limits || {},
          features: enabledFeatures.map((k) => featureLabel.get(k) || k),
          modules: enabledModules.map((k) => moduleLabel.get(k) || k),
          reportsAll,
          reportCount: reportsAll ? null : (Array.isArray(p.enabledReports) ? p.enabledReports.length : 0),
        };
      });
    const cap = await getCapacity(req.user.companyId);
    return res.json({ plans, currentPlan: cap.plan, capacity: { plan: cap.plan, limit: cap.limit, current: cap.current } });
  } catch (e) {
    console.error('[onboarding.plans]', e);
    return res.status(500).json({ error: 'Failed to load plans.' });
  }
};

// POST /api/onboarding/choose  { choice: 'blank' | 'sample' }
exports.choose = async (req, res) => {
  try {
    if (!guardCompanyUser(req, res)) return;
    const choice = String(req.body?.choice || '').toLowerCase();
    if (!['blank', 'sample'].includes(choice)) {
      return res.status(400).json({ error: "choice must be 'blank' or 'sample'." });
    }
    const head = await resolveHead(req.user.companyId);
    if (!head) return res.status(404).json({ error: 'Company not found.' });

    const current = normalize(head.onboardingState);
    // Idempotent: once completed, never re-run (no re-generation, no re-gate).
    if (current.onboardingCompleted) {
      return res.json({ alreadyCompleted: true, ...(await buildStatus(head.id)) });
    }

    let demo = null;
    if (choice === 'sample') {
      demo = await generateDemoWorkspace(head.id, actorOf(req));
    }

    const next = {
      firstLoginCompleted: true,
      onboardingCompleted: true,
      usedSampleWorkspace: choice === 'sample',
      sampleDataRemoved: false,
      choice,
      completedAt: new Date().toISOString(),
    };
    await prisma.company.update({ where: { id: head.id }, data: { onboardingState: next } });

    if (req.user?.id) {
      AuditService.logAudit(req.user.id, 'COMPLETE_ONBOARDING', 'Onboarding', String(head.id), {
        choice, demoCreated: demo?.created || 0, by: actorOf(req),
      }).catch(() => {});
    }

    return res.json({ ...(await buildStatus(head.id)), demo });
  } catch (e) {
    console.error('[onboarding.choose]', e);
    return res.status(500).json({ error: 'Failed to complete onboarding.' });
  }
};

// POST /api/onboarding/remove-sample — permanently delete this company's sample
// data (demo records only). One-time: after removal it can never be regenerated.
exports.removeSample = async (req, res) => {
  try {
    if (!guardCompanyUser(req, res)) return;
    const head = await resolveHead(req.user.companyId);
    if (!head) return res.status(404).json({ error: 'Company not found.' });

    const current = normalize(head.onboardingState);
    if (!current.usedSampleWorkspace) {
      return res.status(400).json({ error: 'This workspace has no sample data to remove.' });
    }
    if (current.sampleDataRemoved) {
      // Idempotent — already removed; report current state.
      return res.json({ alreadyRemoved: true, ...(await buildStatus(head.id)) });
    }

    const result = await removeSampleData(head.id);
    await prisma.company.update({
      where: { id: head.id },
      data: { onboardingState: { ...current, sampleDataRemoved: true, sampleRemovedAt: new Date().toISOString() } },
    });

    if (req.user?.id) {
      AuditService.logAudit(req.user.id, 'REMOVE_SAMPLE_DATA', 'Onboarding', String(head.id), {
        removed: result, by: actorOf(req),
      }).catch(() => {});
    }

    return res.json({ removed: result, ...(await buildStatus(head.id)) });
  } catch (e) {
    console.error('[onboarding.removeSample]', e);
    return res.status(500).json({ error: 'Failed to remove sample data.' });
  }
};
