/**
 * repairVerificationWalletData.js
 *
 * Idempotent data repair for tenants damaged by the wallet defects:
 *
 *  1. CREDIT COST — every tenant must record costPerVerification = 1, because
 *     one verification credit buys exactly one successful verification. The
 *     column is retained for schema compatibility; the verification flow no
 *     longer reads it. See scripts/migrateOneCreditOneVerification.js.
 *
 *  2. MODE — running out of credits used to force verificationMode to 'Manual'
 *     and status to 'Disconnected'. Recharging restored the balance but never
 *     the mode, leaving funded tenants permanently unable to verify. Tenants
 *     that still have working API credentials (companyBankVerificationSettings
 *     .isEnabled) and a funded wallet are restored to their configured API mode.
 *
 *  3. PHANTOM WALLETS — the old tenant resolver keyed wallets off the raw
 *     workspace id, so entering a BRANCH workspace silently created a second
 *     wallet under the branch id. These are reported (never deleted
 *     automatically — deletion is a decision, not a repair).
 *
 * Dry run by default. Pass --apply to write.
 *
 * Usage:
 *   node scripts/repairVerificationWalletData.js          # report only
 *   node scripts/repairVerificationWalletData.js --apply  # perform repairs
 */
require('dotenv').config();
const prisma = require('../src/config/prisma');

const APPLY = process.argv.includes('--apply');
// 1 verification credit = 1 successful verification. This must stay 1: setting it
// higher would reintroduce the credits ÷ cost conversion that was removed.
const STANDARD_COST = 1;

(async () => {
  console.log(APPLY ? '=== REPAIR (writing) ===\n' : '=== DRY RUN (no writes; pass --apply to repair) ===\n');

  const [companies, branches, settings, byo, wallets] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.branch.findMany({ select: { id: true, companyId: true } }),
    prisma.verificationSettings.findMany(),
    prisma.companyBankVerificationSettings.findMany().catch(() => []),
    prisma.verificationCreditWallet.findMany()
  ]);

  const companyIds = new Set(companies.map((c) => c.id));
  const branchParent = new Map(branches.map((b) => [b.id, b.companyId]));
  const byoMap = new Map(byo.map((b) => [b.companyId, b]));

  // 1. Price alignment
  const mispriced = settings.filter((s) => (s.costPerVerification || 0) !== STANDARD_COST);
  console.log(`1. costPerVerification ≠ ${STANDARD_COST}: ${mispriced.length} tenant(s)`);
  for (const s of mispriced) {
    console.log(`   companyId=${s.companyId} costPerVerification=${s.costPerVerification} → ${STANDARD_COST}`);
    if (APPLY) {
      await prisma.verificationSettings.update({ where: { companyId: s.companyId }, data: { costPerVerification: STANDARD_COST } });
    }
  }

  // 2. Mode restoration for tenants with live API credentials and a funded wallet
  const walletMap = new Map(wallets.map((w) => [w.companyId, w]));
  const stuck = settings.filter((s) => {
    const b = byoMap.get(s.companyId);
    const w = walletMap.get(s.companyId);
    const apiConfigured = !!b && b.isEnabled && ['API', 'API Verification', 'Fetch by API'].includes(b.verificationMode);
    const funded = !!w && w.remainingCredits >= STANDARD_COST;
    return apiConfigured && funded && s.verificationMode === 'Manual';
  });
  console.log(`\n2. API-configured, funded, but stuck in Manual: ${stuck.length} tenant(s)`);
  for (const s of stuck) {
    const b = byoMap.get(s.companyId);
    console.log(`   companyId=${s.companyId} mode Manual → ${b.verificationMode}, status ${s.status} → Connected`);
    if (APPLY) {
      await prisma.verificationSettings.update({
        where: { companyId: s.companyId },
        data: { verificationMode: b.verificationMode, status: s.status === 'Suspended' ? 'Suspended' : 'Connected' }
      });
    }
  }

  // 3. Phantom wallets keyed on a branch id (or on no known workspace at all)
  const phantom = wallets.filter((w) => !companyIds.has(w.companyId));
  console.log(`\n3. Wallets not keyed to a company: ${phantom.length}`);
  for (const w of phantom) {
    const parent = branchParent.get(w.companyId);
    console.log(`   walletId=${w.id} companyId=${w.companyId} ${parent ? `(BRANCH of company ${parent})` : '(unknown workspace)'} total=${w.totalCredits} used=${w.usedCredits} remaining=${w.remainingCredits}`);
  }
  if (phantom.length) {
    console.log('   → Not deleted. Review these; any unused ones can be removed by hand.');
  }

  console.log(APPLY ? '\n=== Repair complete ===' : '\n=== Dry run complete — nothing was written ===');
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
