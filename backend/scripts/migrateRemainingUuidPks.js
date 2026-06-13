/**
 * Final pass: convert the LAST UUID/string primary keys to sequential Int so
 * NOTHING in phpMyAdmin shows a UUID or custom id.
 *
 *   - LoginAudit        (uuid)            — no incoming FK
 *   - PasswordResetToken(uuid)            — no incoming FK
 *   - SubscriptionPlan  ("plan-starter")  — no incoming FK (companies link by
 *                                            plan NAME, not id)
 *
 * Also drops `_prisma_migrations` — Prisma's internal migration-history table
 * (its id is a Prisma-mandated UUID). This project uses `prisma db push`, which
 * does NOT use that table, so removing it is safe and leaves zero UUIDs in the DB.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const raw = (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p);
const q = (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p);

// [table, preferredOrderColumn]
const TABLES = [
  ['LoginAudit', 'createdAt'],
  ['PasswordResetToken', 'createdAt'],
  ['SubscriptionPlan', 'priceMonthly'],
];

async function hasColumn(DB, table, col) {
  const r = await q('SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?', DB, table, col);
  return Number(r[0].c) > 0;
}

async function main() {
  const DB = (await q('SELECT DATABASE() db'))[0].db;
  console.log('Database:', DB, '\n');

  // snapshot old ids
  const snap = {};
  for (const [t] of TABLES) snap[t] = await q('SELECT id FROM `' + t + '`');
  const dir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'remaining-uuid-pk-snapshot.json'), JSON.stringify(snap, null, 2));

  for (const [t, preferredOrder] of TABLES) {
    const colType = await q('SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME="id"', DB, t);
    if (colType[0] && colType[0].DATA_TYPE === 'int') { console.log(`SKIP ${t} (already int)`); continue; }

    const n = Number((await q('SELECT COUNT(*) c FROM `' + t + '`'))[0].c);
    const orderCol = (await hasColumn(DB, t, preferredOrder)) ? preferredOrder : 'id';

    await raw('ALTER TABLE `' + t + '` ADD COLUMN `__newid` INT NOT NULL DEFAULT 0');
    await raw('SET @r := 0');
    await raw('UPDATE `' + t + '` SET `__newid` = (@r := @r + 1) ORDER BY `' + orderCol + '` ASC');
    await raw('ALTER TABLE `' + t + '` DROP PRIMARY KEY, DROP COLUMN `id`');
    await raw('ALTER TABLE `' + t + '` CHANGE COLUMN `__newid` `id` INT NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (`id`)');
    await raw('ALTER TABLE `' + t + '` AUTO_INCREMENT = ' + (n + 1));

    const check = await q('SELECT MIN(id) lo, MAX(id) hi FROM `' + t + '`');
    console.log(`DONE ${t}: ${n} rows -> id ${check[0].lo || 0}..${check[0].hi || 0}, next id = ${n + 1}`);
  }

  // Drop Prisma's internal migration-history table (UUID ids; not used by db push).
  await raw('DROP TABLE IF EXISTS `_prisma_migrations`');
  console.log('\nDropped _prisma_migrations (Prisma system table, not needed for db push).');
  console.log('All remaining UUID/string primary keys eliminated.');
}

main()
  .catch(e => { console.error('MIGRATION FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
