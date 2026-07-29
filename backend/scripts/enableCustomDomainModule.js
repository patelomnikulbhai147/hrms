/**
 * Enable the 'custom-domain' premium module on every PAID plan definition.
 *
 * Rule: ONLY free-tier plans keep Custom Domain locked. A plan is "paid" when
 * its stored definition says so — a custom-priced plan, or a non-zero price on
 * either billing cycle. NO plan names are hardcoded; the decision comes from
 * the plan record itself, so SA-created plans are handled the same way. The
 * Super Admin can still explicitly disable the module afterwards by unticking
 * it in the plan editor (removing it from enabledModules).
 *
 * Also grants the module inside CompanySubscription.customModules for
 * Custom-plan companies (their entitlements resolve from that per-company
 * list, not the plan definition).
 *
 * Idempotent — run any number of times:  node scripts/enableCustomDomainModule.js
 * MUST run on every deploy until it has run once against the live store.
 */
const store = require('../src/services/planStore');

const KEY = 'custom-domain';
const isPaid = (p) => !!p.custom || Number(p.priceQuarterly) > 0 || Number(p.priceYearly) > 0;

(async () => {
  for (const plan of store.getPlans()) {
    if (!isPaid(plan)) { console.log(`  · ${plan.key} is a free tier — stays locked`); continue; }
    if (plan.enabledModules.includes(KEY)) {
      console.log(`  · ${plan.key} already has ${KEY} enabled`);
      continue;
    }
    store.upsertPlan({ ...plan, enabledModules: [...plan.enabledModules, KEY] });
    console.log(`  + ${KEY} enabled on ${plan.key} (paid plan)`);
  }

  // Custom-plan companies resolve entitlements from their per-company
  // customModules list — grant there too (skip explicit SA configs that
  // already have it; null lists are untouched, SA configures those manually).
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const customSubs = await prisma.companySubscription.findMany({ where: { plan: 'Custom' } });
  for (const sub of customSubs) {
    if (!Array.isArray(sub.customModules)) { console.log(`  · company ${sub.companyId} (Custom) has no module list — skipped`); continue; }
    if (sub.customModules.includes(KEY)) { console.log(`  · company ${sub.companyId} (Custom) already granted`); continue; }
    await prisma.companySubscription.update({
      where: { id: sub.id },
      data: { customModules: [...sub.customModules, KEY] },
    });
    console.log(`  + ${KEY} granted to Custom-plan company ${sub.companyId}`);
  }
  await prisma.$disconnect();
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
