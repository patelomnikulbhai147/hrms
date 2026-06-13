/**
 * Convert every remaining UUID string primary key to a clean sequential Int
 * AUTO_INCREMENT, so phpMyAdmin shows 1,2,3,... ascending for ALL tables.
 *
 * Safe because NONE of these tables' `id` columns are referenced by an incoming
 * foreign key (verified via information_schema — every FK points at the already
 * integer company/branch/employee/user ids). So each table can be renumbered
 * independently with no cross-table impact.
 *
 * Per table: number rows 1..N by creation order, retype `id` to
 * INT AUTO_INCREMENT PRIMARY KEY, and set AUTO_INCREMENT = N+1 so new records
 * continue automatically.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const raw = (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p);
const q = (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p);

// [table, orderColumn]  — orderColumn is the creation order to number by.
const TABLES = [
  ['Attendance', 'createdAt'],
  ['Payroll', 'createdAt'],
  ['Document', 'createdAt'],
  ['LeaveRequest', 'createdAt'],
  ['Overtime', 'createdAt'],
  ['Notification', 'createdAt'],
  ['PaymentRecord', 'createdAt'],
  ['CompanyPayroll', 'created_at'],
  ['BranchPayroll', 'created_at'],
  ['AuditLog', 'createdAt'],
  ['Shift', 'createdAt'],
];

async function hasColumn(DB, table, col) {
  const r = await q('SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?', DB, table, col);
  return Number(r[0].c) > 0;
}

async function main() {
  const DB = (await q('SELECT DATABASE() db'))[0].db;
  console.log('Database:', DB, '\n');

  const snap = {};
  for (const [t] of TABLES) {
    snap[t] = await q('SELECT id FROM `' + t + '`'); // capture old uuid ids for reference
  }
  const dir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'uuid-pk-migration-snapshot.json'), JSON.stringify(snap, null, 2));
  console.log('Snapshot of old ids saved: scratch/uuid-pk-migration-snapshot.json\n');

  for (const [t, preferredOrder] of TABLES) {
    // Already int? skip.
    const colType = await q('SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME="id"', DB, t);
    if (colType[0] && colType[0].DATA_TYPE === 'int') { console.log(`SKIP ${t} (already int)`); continue; }

    const n = Number((await q('SELECT COUNT(*) c FROM `' + t + '`'))[0].c);
    const orderCol = (await hasColumn(DB, t, preferredOrder)) ? preferredOrder : 'id';

    // 1. sequential int into a temp column
    await raw('ALTER TABLE `' + t + '` ADD COLUMN `__newid` INT NOT NULL DEFAULT 0');
    await raw('SET @r := 0');
    await raw('UPDATE `' + t + '` SET `__newid` = (@r := @r + 1) ORDER BY `' + orderCol + '` ASC');
    // 2. drop the uuid PK + column, promote __newid to the new int PK
    await raw('ALTER TABLE `' + t + '` DROP PRIMARY KEY, DROP COLUMN `id`');
    await raw('ALTER TABLE `' + t + '` CHANGE COLUMN `__newid` `id` INT NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (`id`)');
    // 3. continue numbering from N+1
    await raw('ALTER TABLE `' + t + '` AUTO_INCREMENT = ' + (n + 1));

    const check = await q('SELECT MIN(id) lo, MAX(id) hi, COUNT(*) c FROM `' + t + '`');
    console.log(`DONE ${t}: ${n} rows -> id ${check[0].lo || 0}..${check[0].hi || 0}, next id = ${n + 1}`);
  }

  console.log('\nAll UUID primary keys converted to sequential Int.');
}

main()
  .catch(e => { console.error('MIGRATION FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
