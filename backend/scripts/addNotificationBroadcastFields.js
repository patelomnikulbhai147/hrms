/**
 * Add the broadcast provenance/audit columns to the Notification table.
 *
 * ADDITIVE AND IDEMPOTENT — every statement is ADD COLUMN, and "duplicate
 * column" is swallowed, so re-running is safe.
 *
 * Run this INSTEAD of `prisma db push`. On this repo db push is destructive
 * against the live RDS (it drops legacy columns and tries to add unique indexes
 * that existing duplicate rows reject). See the deploy notes.
 *
 * Deploy order (backend) — this order is not optional:
 *   node scripts/addNotificationBroadcastFields.js
 *   npx prisma generate          # client must know the new columns
 *   pm2 reload hrms-backend
 *
 * Running `prisma generate` FIRST is the failure mode to avoid: the client would
 * expect columns the database lacks and every notification read would fail with
 * P2022 — which takes the notification bell down for every user.
 *
 *   node scripts/addNotificationBroadcastFields.js          # apply
 *   node scripts/addNotificationBroadcastFields.js --check  # report only, no writes
 */
const prisma = require('../src/config/prisma');

const COLUMNS = [
  ['senderId',         'INT NULL'],
  ['senderName',       'VARCHAR(160) NULL'],
  ['senderRole',       'VARCHAR(60) NULL'],
  ['senderBranchId',   'INT NULL'],
  ['targetType',       'VARCHAR(30) NULL'],
  ['targetBranchId',   'INT NULL'],
  ['targetBranchName', 'VARCHAR(160) NULL'],
  ['targetDepartment', 'VARCHAR(160) NULL'],
  ['targetRole',       'VARCHAR(60) NULL'],
];

// PHYSICAL table name. The Prisma model `Notification` carries no @@map, so the
// model name IS the table name here (unlike `Invoice` → `invoices`).
const TABLE = 'Notification';

async function existingColumns() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, TABLE
  );
  return new Set(rows.map((r) => r.name));
}

(async () => {
  const checkOnly = process.argv.includes('--check');
  try {
    const present = await existingColumns();
    if (!present.size) {
      console.error(`✗ Table \`${TABLE}\` not found in this database. Aborting without changes.`);
      process.exitCode = 1;
      return;
    }

    const missing = COLUMNS.filter(([name]) => !present.has(name));
    console.log(`${TABLE}: ${COLUMNS.length} expected, ${COLUMNS.length - missing.length} already present, ${missing.length} to add.`);

    if (checkOnly) {
      missing.forEach(([name, type]) => console.log(`  would add: ${name} ${type}`));
      if (!missing.length) console.log('  nothing to do — schema is already up to date.');
      return;
    }

    let added = 0;
    for (const [name, type] of missing) {
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD COLUMN \`${name}\` ${type}`);
        console.log(`  + ${name}`);
        added++;
      } catch (e) {
        // 1060 = duplicate column: a concurrent/repeat run already added it.
        if (/duplicate column/i.test(e.message)) console.log(`  = ${name} (already present)`);
        else throw e;
      }
    }

    const after = await existingColumns();
    const stillMissing = COLUMNS.filter(([n]) => !after.has(n)).map(([n]) => n);
    console.log(`\nAdded ${added} column(s).`);
    if (stillMissing.length) {
      console.error(`✗ Still missing: ${stillMissing.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log('✓ All broadcast provenance columns are present.');
      console.log('  Next: npx prisma generate && pm2 reload hrms-backend');
    }
  } catch (e) {
    console.error('✗ Failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
