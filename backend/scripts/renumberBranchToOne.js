/**
 * Renumber branch.id to a clean 1..N (currently 3..8 because it shared a
 * sequence with company). branch.id is referenced by employee.branchId and
 * branchpayroll.branch_id — those FKs are dropped, child rows remapped, and the
 * FKs restored.
 *
 * NOTE: After this, branch ids (1..6) overlap company ids (1..2). The frontend
 * workspace-scoping is updated in the same change set to be type-aware so the
 * overlap is unambiguous.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const raw = (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p);
const q = (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p);

async function main() {
  const DB = (await q('SELECT DATABASE() db'))[0].db;

  const branches = await q('SELECT id, companyId, branchNo, branchName FROM `branch` ORDER BY id ASC');
  const map = new Map();
  branches.forEach((b, i) => map.set(Number(b.id), i + 1));
  const dir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'branch-renumber-snapshot.json'),
    JSON.stringify(branches.map(b => ({ ...b, id: Number(b.id), newId: map.get(Number(b.id)) })), null, 2));
  console.log('Mapping:', [...map].map(([o, n]) => `${o}->${n}`).join(', '));

  const n = branches.length;

  // mapping into a temp column
  await raw('ALTER TABLE `branch` ADD COLUMN `__newid` INT NULL');
  await raw('SET @n := 0');
  await raw('UPDATE `branch` SET `__newid` = (@n := @n + 1) ORDER BY `id` ASC');

  // drop FKs that reference branch.id
  const fks = await q(
    `SELECT TABLE_NAME t, CONSTRAINT_NAME c FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME='Branch' AND REFERENCED_COLUMN_NAME='id'`, DB);
  for (const f of fks) await raw(`ALTER TABLE \`${f.t}\` DROP FOREIGN KEY \`${f.c}\``);
  console.log('Dropped branch FKs:', fks.map(f => `${f.t}.${f.c}`).join(', ') || '(none)');

  // remap children (employee.branchId, branchpayroll.branch_id) using old branch.id
  const remapEmp = await raw('UPDATE `employee` c JOIN `branch` b ON c.branchId = b.id SET c.branchId = b.__newid');
  console.log('Remapped employee.branchId rows:', remapEmp);
  // branchpayroll uses column branch_id
  try {
    const remapBP = await raw('UPDATE `branchpayroll` c JOIN `branch` b ON c.branch_id = b.id SET c.branch_id = b.__newid');
    console.log('Remapped branchpayroll.branch_id rows:', remapBP);
  } catch (e) { console.log('branchpayroll remap skipped:', e.message.slice(0, 60)); }

  // swap branch.id -> __newid
  await raw('ALTER TABLE `branch` MODIFY `id` INT NOT NULL');
  await raw('ALTER TABLE `branch` DROP PRIMARY KEY');
  await raw('UPDATE `branch` SET `id` = `__newid`');
  await raw('ALTER TABLE `branch` DROP COLUMN `__newid`');
  await raw('ALTER TABLE `branch` ADD PRIMARY KEY (`id`)');
  await raw('ALTER TABLE `branch` MODIFY `id` INT NOT NULL AUTO_INCREMENT');
  await raw('ALTER TABLE `branch` AUTO_INCREMENT = ' + (n + 1));

  // restore FKs
  // employee.branchId -> branch.id (onDelete Cascade per schema)
  await raw('ALTER TABLE `employee` ADD CONSTRAINT `employee_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE');
  // branchpayroll.branch_id -> branch.id (onDelete Cascade per schema)
  await raw('ALTER TABLE `branchpayroll` ADD CONSTRAINT `BranchPayroll_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE');

  const after = await q('SELECT id, companyId, branchNo, branchName FROM `branch` ORDER BY id ASC');
  console.log('\nAFTER — branch table (id | companyId | branchNo | branchName):');
  after.forEach(b => console.log(`  ${b.id} | ${b.companyId} | ${b.branchNo} | ${b.branchName}`));
  console.log(`Next branch id = ${n + 1}`);
}

main()
  .catch(e => { console.error('FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
