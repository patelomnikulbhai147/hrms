/**
 * Convert User.id from String(uuid / "u1" / "u2") to a clean sequential Int
 * (1..N), so phpMyAdmin shows 1,2,3,4 instead of UUIDs and custom strings.
 *
 * User.id is referenced by:
 *   - PasswordResetToken.userId (FK, NOT NULL, ON DELETE CASCADE)
 *   - AuditLog.userId           (FK, NOT NULL)
 *   - LoginAudit.userId         (plain indexed column, NO FK, nullable)
 *
 * Strategy (MySQL, DDL auto-commits so we go step-by-step with a snapshot):
 *   1. Snapshot User + referencing rows to scratch/user-id-migration-snapshot.json
 *   2. Build mapping oldId -> newInt (ordered by createdAt, then username)
 *   3. Drop the FK constraints that reference User (discovered dynamically)
 *   4. Re-point child userId values to the new ints
 *   5. Re-point User.id to the new ints, then MODIFY all columns to INT
 *   6. Make User.id AUTO_INCREMENT and re-create the FK constraints
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const raw = (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p);
const q = (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p);

async function main() {
  const dbRow = await q('SELECT DATABASE() AS db');
  const DB = dbRow[0].db;
  console.log('Database:', DB);

  // 1. Snapshot ----------------------------------------------------------------
  const [users, prt, audit, login] = await Promise.all([
    q('SELECT id, username, email, createdAt FROM `User` ORDER BY createdAt ASC, username ASC'),
    q('SELECT id, userId FROM `PasswordResetToken`'),
    q('SELECT id, userId FROM `AuditLog`'),
    q('SELECT id, userId FROM `LoginAudit`'),
  ]);
  const dir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'user-id-migration-snapshot.json'),
    JSON.stringify({ users, passwordResetToken: prt, auditLog: audit, loginAudit: login }, null, 2));
  console.log(`Snapshot saved (${users.length} users, ${prt.length} reset tokens, ${audit.length} audit, ${login.length} login).`);

  // 2. Mapping -----------------------------------------------------------------
  const map = new Map();
  users.forEach((u, i) => map.set(String(u.id), i + 1));
  console.log('\nID MAPPING:');
  users.forEach((u, i) => console.log(`  ${JSON.stringify(u.id)}  ->  ${i + 1}  (${u.username})`));
  const N = users.length;

  // 3. Discover & drop FK constraints referencing User -------------------------
  const fks = await q(
    `SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = 'User'`, DB);
  console.log('\nFK constraints referencing User:', fks.map(f => `${f.TABLE_NAME}.${f.CONSTRAINT_NAME}`).join(', ') || '(none)');
  for (const f of fks) {
    await raw(`ALTER TABLE \`${f.TABLE_NAME}\` DROP FOREIGN KEY \`${f.CONSTRAINT_NAME}\``);
  }

  // 4. Re-point child userId values (columns are still VARCHAR here) -----------
  for (const [oldId, newId] of map) {
    await raw('UPDATE `PasswordResetToken` SET `userId` = ? WHERE `userId` = ?', String(newId), oldId);
    await raw('UPDATE `AuditLog` SET `userId` = ? WHERE `userId` = ?', String(newId), oldId);
    await raw('UPDATE `LoginAudit` SET `userId` = ? WHERE `userId` = ?', String(newId), oldId);
  }

  // 5. Re-point User.id, then retype every affected column to INT --------------
  for (const [oldId, newId] of map) {
    await raw('UPDATE `User` SET `id` = ? WHERE `id` = ?', String(newId), oldId);
  }
  await raw('ALTER TABLE `User` MODIFY `id` INT NOT NULL');
  await raw('ALTER TABLE `PasswordResetToken` MODIFY `userId` INT NOT NULL');
  await raw('ALTER TABLE `AuditLog` MODIFY `userId` INT NOT NULL');
  await raw('ALTER TABLE `LoginAudit` MODIFY `userId` INT NULL');

  // 6. AUTO_INCREMENT + restore FKs -------------------------------------------
  await raw('ALTER TABLE `User` MODIFY `id` INT NOT NULL AUTO_INCREMENT');
  await raw(`ALTER TABLE \`User\` AUTO_INCREMENT = ${N + 1}`);
  await raw('ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE');
  await raw('ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE CASCADE');

  // Verify ---------------------------------------------------------------------
  const after = await q('SELECT id, username, companyId FROM `User` ORDER BY id ASC');
  console.log('\nAFTER — User table:');
  after.forEach(u => console.log(`  id=${u.id}  ${u.username}  companyId=${u.companyId}`));
  console.log(`\nNext User.id will be ${N + 1}. Migration complete.`);
}

main()
  .catch(e => { console.error('MIGRATION FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
