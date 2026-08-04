/**
 * Additive migration — separate SUBSCRIPTION seats from PURCHASED slot add-ons.
 *
 * Adds CompanySubscription.subscriptionSeats (nullable). Idempotent and additive:
 * it only ever ADDs a column, never drops or rewrites one, so it is safe to run
 * against a live database. Deliberately NOT `prisma db push` — this schema has
 * tables Prisma does not know about, and db push would drop them.
 *
 * Backfill policy: subscriptionSeats is left NULL, which means "use the plan's
 * base limit". Effective capacity therefore stays EXACTLY what it is today
 * (plan base + extraEmployeeSlots) for every existing row — no tenant gains or
 * loses a seat from this migration. Going forward, subscription settlement
 * writes subscriptionSeats and never touches extraEmployeeSlots.
 *
 *   node scripts/addSubscriptionSeatsColumn.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  const [{ c: exists }] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'CompanySubscription'
       AND COLUMN_NAME = 'subscriptionSeats'
  `);

  if (Number(exists) > 0) {
    console.log('subscriptionSeats already present — nothing to do.');
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE CompanySubscription ADD COLUMN subscriptionSeats INT NULL`
    );
    console.log('added CompanySubscription.subscriptionSeats (INT NULL)');
  }

  // Report the state so the operator can see nothing shifted.
  const rows = await prisma.$queryRawUnsafe(`
    SELECT companyId, plan, subscriptionSeats, extraEmployeeSlots
      FROM CompanySubscription ORDER BY companyId
  `);
  console.log('\ncompanyId | plan         | subscriptionSeats | extraEmployeeSlots (preserved)');
  console.log('----------|--------------|-------------------|-------------------------------');
  for (const r of rows) {
    console.log(
      `${String(r.companyId).padEnd(9)} | ${String(r.plan).padEnd(12)} | ` +
      `${String(r.subscriptionSeats ?? 'NULL').padEnd(17)} | ${r.extraEmployeeSlots}`
    );
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('MIGRATION ERROR:', e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
