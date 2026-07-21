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
  const s = normalize(head?.onboardingState);
  // Demo data is a ONE-WAY street with exactly three states:
  //   never installed → installed → removed (and never again).
  // `demoDataInstalled` / `demoDataRemoved` are derived from the stored ledger so
  // the client never has to reason about the underlying flags.
  const demoDataRemoved = s.sampleDataRemoved;
  const demoDataInstalled = s.usedSampleWorkspace && !demoDataRemoved;
  return {
    onboarding: s,
    demoDataInstalled,
    demoDataRemoved,
    // Offer "Load Demo Data" only while it has never been installed AND never
    // removed — after either, the affordance is gone for good.
    canLoadDemoData: !!head && !s.usedSampleWorkspace && !demoDataRemoved,
    capacity: { plan: cap.plan, limit: cap.limit, current: cap.current, remaining: cap.remaining === Infinity ? null : cap.remaining },
    canRemoveSampleData: head ? (demoDataInstalled && await hasDemoData(head.id)) : false,
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
    // 'cancelled' = the user dismissed the welcome modal. It settles onboarding
    // exactly like 'blank' (no demo data, never asked again) but is recorded
    // distinctly so the audit trail shows a dismissal rather than a choice.
    const choice = String(req.body?.choice || '').toLowerCase();
    if (!['blank', 'sample', 'cancelled'].includes(choice)) {
      return res.status(400).json({ error: "choice must be 'blank', 'sample' or 'cancelled'." });
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
      // The seed VERIFIES itself and rolls back on failure. If it throws we must
      // leave onboarding un-completed so the user can retry or start blank —
      // never mark the workspace "demo installed" over an empty database.
      try {
        demo = await generateDemoWorkspace(head.id, actorOf(req));
      } catch (seedErr) {
        console.error('[onboarding.choose] demo seed failed:', seedErr);
        return res.status(500).json({ error: 'Unable to generate demo workspace.', code: 'DEMO_SEED_FAILED' });
      }
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

// POST /api/onboarding/load-sample — install the demo dataset AFTER onboarding
// has already been settled (the user picked Blank, or dismissed the modal, and
// later clicked "Load Demo Data" in the dashboard header).
//
// Strictly one-time. It is refused once demo data has ever been installed, and
// refused permanently once it has been removed — so the same records can never
// be created twice, and a removal can never be undone.
exports.loadSample = async (req, res) => {
  try {
    if (!guardCompanyUser(req, res)) return;
    const head = await resolveHead(req.user.companyId);
    if (!head) return res.status(404).json({ error: 'Company not found.' });

    const current = normalize(head.onboardingState);
    if (current.sampleDataRemoved) {
      return res.status(409).json({ error: 'Demo data was removed from this workspace and cannot be loaded again.', code: 'DEMO_REMOVED' });
    }
    if (current.usedSampleWorkspace) {
      // Idempotent — already installed; report the state rather than duplicating.
      return res.json({ alreadyInstalled: true, ...(await buildStatus(head.id)) });
    }

    // Same contract as `choose`: verified-or-rolled-back, and the ledger is only
    // written once the seed has actually produced data.
    let demo;
    try {
      demo = await generateDemoWorkspace(head.id, actorOf(req));
    } catch (seedErr) {
      console.error('[onboarding.loadSample] demo seed failed:', seedErr);
      return res.status(500).json({ error: 'Unable to generate demo workspace.', code: 'DEMO_SEED_FAILED' });
    }
    await prisma.company.update({
      where: { id: head.id },
      data: {
        onboardingState: {
          ...current,
          firstLoginCompleted: true,
          onboardingCompleted: true,      // loading demo also settles onboarding
          usedSampleWorkspace: true,
          sampleDataRemoved: false,
          demoLoadedAt: new Date().toISOString(),
        },
      },
    });

    if (req.user?.id) {
      AuditService.logAudit(req.user.id, 'LOAD_SAMPLE_DATA', 'Onboarding', String(head.id), {
        demoCreated: demo?.created || 0, by: actorOf(req),
      }).catch(() => {});
    }

    return res.json({ ...(await buildStatus(head.id)), demo });
  } catch (e) {
    console.error('[onboarding.loadSample]', e);
    return res.status(500).json({ error: 'Failed to load demo data.' });
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
