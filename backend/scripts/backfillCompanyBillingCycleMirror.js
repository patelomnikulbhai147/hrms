/**
 * Backfill Company.billingCycle from CompanySubscription.billingCycle.
 *
 * The SUBSCRIPTION is the source of truth for a company's billing cycle. The
 * Company column is only a mirror, kept because exports read it and because a
 * lost subscription row is reseeded from it. Companies onboarded before the
 * cycle was captured have a null (or legacy 'Monthly') mirror, which would make
 * that reseed guess Quarterly.
 *
 * This script only ever copies subscription → company. It NEVER writes a
 * subscription, so it cannot change what any tenant is charged. Companies with
 * no subscription row are reported, not invented.
 *
 * Idempotent. Dry-run by default:
 *   node backend/scripts/backfillCompanyBillingCycleMirror.js
 *   node backend/scripts/backfillCompanyBillingCycleMirror.js --apply
 */
const prisma = require('../src/config/prisma');
const { normalizeBillingCycle, isBillingCycle } = require('../src/utils/billingCycle');

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`Company.billingCycle mirror backfill  [${APPLY ? 'APPLY' : 'DRY RUN'}]\n`);

  const companies = await prisma.company.findMany({ select: { id: true, name: true, billingCycle: true } });
  const subs = await prisma.companySubscription.findMany({ select: { companyId: true, billingCycle: true } });
  const subBy = new Map(subs.map((s) => [s.companyId, s.billingCycle]));

  const changes = [];
  const noSub = [];
  const oddSub = [];

  for (const c of companies) {
    const subCycle = subBy.get(c.id);
    if (!subCycle) { noSub.push(c); continue; }
    if (!isBillingCycle(subCycle)) oddSub.push({ ...c, subCycle });
    const target = normalizeBillingCycle(subCycle);
    if (c.billingCycle !== target) changes.push({ id: c.id, name: c.name, from: c.billingCycle, to: target });
  }

  if (changes.length) {
    console.log('Mirror rows to align (subscription → company):');
    console.table(changes.map((r) => ({ id: r.id, company: r.name, from: r.from ?? '(null)', to: r.to })));
  } else {
    console.log('Every company mirror already agrees with its subscription.');
  }

  if (noSub.length) {
    console.log('\nCompanies with NO subscription row (left untouched — created lazily on first read):');
    console.table(noSub.map((c) => ({ id: c.id, company: c.name, mirror: c.billingCycle ?? '(null)' })));
  }
  if (oddSub.length) {
    console.log('\n⚠ Subscriptions holding a non-canonical cycle (NOT rewritten here — investigate):');
    console.table(oddSub.map((c) => ({ id: c.id, company: c.name, subscription: c.subCycle })));
  }

  if (APPLY && changes.length) {
    for (const r of changes) {
      await prisma.company.update({ where: { id: r.id }, data: { billingCycle: r.to } });
    }
    console.log(`\nUpdated ${changes.length} company mirror(s).`);
  } else if (changes.length) {
    console.log('\nDry run — nothing written. Re-run with --apply to write these.');
  }
}

main()
  .catch((e) => { console.error('FAILED:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
