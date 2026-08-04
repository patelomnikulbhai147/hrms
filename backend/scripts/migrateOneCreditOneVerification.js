/**
 * Migration: 1 verification credit = 1 successful verification.
 *
 * The verification flow no longer reads `verification_settings.costPerVerification`
 * — it is a constant 1 in code. This script brings the stored rows into line so
 * the database does not keep claiming a cost of 4 that nothing honours, and
 * repairs any wallet whose counters do not satisfy the reporting identity.
 *
 * SAFETY — this script NEVER reduces a company's usable credits:
 *   • `remainingCredits` is never written. A company sitting on 24 credits keeps
 *     24, and they are now worth 24 verifications instead of 6.
 *   • `verification_credit_transaction` (the ledger) is never touched. Historical
 *     rows keep the credit amounts that were actually deducted at the time.
 *   • Only two things change: `costPerVerification` → 1, and `totalCredits` where
 *     it disagrees with used + remaining.
 *
 * Usage:
 *   node scripts/migrateOneCreditOneVerification.js           # dry run (default)
 *   node scripts/migrateOneCreditOneVerification.js --apply   # write changes
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const CREDITS_PER_VERIFICATION = 1;

const log = (...a) => console.log(...a);

async function main() {
  log(APPLY ? '=== APPLYING CHANGES ===' : '=== DRY RUN (no writes) — pass --apply to commit ===');
  log('');

  // ── 1. Normalise the stored cost ────────────────────────────────────────────
  const settings = await prisma.verificationSettings.findMany({
    select: { companyId: true, costPerVerification: true },
    orderBy: { companyId: 'asc' },
  });
  const mispriced = settings.filter((s) => s.costPerVerification !== CREDITS_PER_VERIFICATION);

  log(`[1] verification_settings rows: ${settings.length}`);
  log(`    rows with costPerVerification != 1: ${mispriced.length}`);
  for (const s of mispriced) {
    log(`      companyId=${s.companyId}: costPerVerification ${s.costPerVerification} -> 1`);
  }
  if (APPLY && mispriced.length) {
    const res = await prisma.verificationSettings.updateMany({
      where: { costPerVerification: { not: CREDITS_PER_VERIFICATION } },
      data: { costPerVerification: CREDITS_PER_VERIFICATION },
    });
    log(`    updated ${res.count} row(s).`);
  }
  log('');

  // ── 2. Reconcile wallet counters ────────────────────────────────────────────
  // The reports rely on: totalCredits (allocated) - usedCredits = remainingCredits.
  // Where a row breaks that identity, totalCredits is corrected to used + remaining.
  // remainingCredits is authoritative and is never rewritten, so nobody loses
  // credits — only the "total allocated" label is made truthful.
  const wallets = await prisma.verificationCreditWallet.findMany({
    select: { id: true, companyId: true, serviceType: true, totalCredits: true, usedCredits: true, remainingCredits: true },
    orderBy: { companyId: 'asc' },
  });

  const inconsistent = wallets.filter(
    (w) => (w.totalCredits || 0) !== (w.usedCredits || 0) + (w.remainingCredits || 0)
  );

  log(`[2] verification_credit_wallet rows: ${wallets.length}`);
  log(`    rows where allocated != used + remaining: ${inconsistent.length}`);
  for (const w of inconsistent) {
    const corrected = (w.usedCredits || 0) + (w.remainingCredits || 0);
    log(
      `      companyId=${w.companyId} (${w.serviceType}): ` +
      `allocated ${w.totalCredits} -> ${corrected}  ` +
      `(used ${w.usedCredits} + remaining ${w.remainingCredits}); remaining UNCHANGED`
    );
  }
  if (APPLY) {
    for (const w of inconsistent) {
      await prisma.verificationCreditWallet.update({
        where: { id: w.id },
        data: { totalCredits: (w.usedCredits || 0) + (w.remainingCredits || 0) },
      });
    }
    if (inconsistent.length) log(`    updated ${inconsistent.length} row(s).`);
  }
  log('');

  // ── 3. Report what every company can now do ─────────────────────────────────
  log('[3] Verification capacity after migration (1 credit = 1 verification):');
  for (const w of wallets) {
    log(
      `      companyId=${String(w.companyId).padStart(5)}  ` +
      `credits=${String(w.remainingCredits).padStart(5)}  ` +
      `-> ${w.remainingCredits} verification(s)`
    );
  }
  log('');
  log(APPLY ? 'Done. Changes committed.' : 'Dry run complete. No changes were written.');
}

main()
  .catch((e) => { console.error('MIGRATION FAILED:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
