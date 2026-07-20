// Additive, idempotent migration: add Company.onboardingState (JSON, nullable).
// Safe to run repeatedly and safe on live data — it only ADDS a nullable column
// (never db push, per this repo's drift landmines). Run after pulling the schema
// change and before restarting the backend:
//   node scripts/addOnboardingState.js
const prisma = require('../src/config/prisma');

(async () => {
  try {
    const [{ n }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'Company' AND column_name = 'onboardingState'`
    );
    if (Number(n) > 0) {
      console.log('Company.onboardingState already exists — skipping column add.');
    } else {
      await prisma.$executeRawUnsafe('ALTER TABLE `Company` ADD COLUMN `onboardingState` JSON NULL');
      console.log('Added Company.onboardingState (JSON NULL).');
    }

    // Backfill: mark every EXISTING company as already-onboarded so the first-login
    // gate never surprises current tenants. Only NEW registrations (null state
    // created after this migration) will see the onboarding screen.
    // Raw SQL because Prisma's Json `{ equals: null }` matches JSON-null, not the
    // SQL NULL that a freshly-added column holds.
    const json = JSON.stringify({ firstLoginCompleted: true, onboardingCompleted: true, usedSampleWorkspace: false, sampleDataRemoved: false, choice: 'existing' });
    const count = await prisma.$executeRawUnsafe(
      'UPDATE `Company` SET `onboardingState` = CAST(? AS JSON) WHERE `onboardingState` IS NULL',
      json
    );
    console.log(`Backfilled ${count} existing companies as onboarded.`);
  } catch (e) {
    console.error('Failed to add onboardingState:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
