/**
 * Final dedup + gapless renumber.
 *
 * A) ATTENDANCE dedup — one row per (employeeId, date); keep the MIN id, delete
 *    the rest (780 duplicate rows).
 * B) EMPLOYEE renumber — close the 5 gaps left by the earlier person-dedup so
 *    ids run 1..836 with no gaps. employee.id is referenced by attendance,
 *    payroll, leaverequest, overtime (employeeId) — those FKs are dropped, all
 *    child references remapped, then the FKs are restored.
 * C) ATTENDANCE renumber — after the row deletions, compact ids to 1..N.
 *
 * Company (1..2), User (1..6) and every transactional table are already dense
 * 1..N from the prior int conversions, so they need no renumber. Branch keeps
 * its shared company+branch sequence (see report) to avoid a workspace-id
 * collision.
 *
 * Snapshots written before any change.
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const raw = (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p);
const q = (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p);

const CHILD_TABLES = ['attendance', 'payroll', 'leaverequest', 'overtime']; // reference employee.id via employeeId

async function main() {
  const DB = (await q('SELECT DATABASE() db'))[0].db;
  const dir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const rows = await q('SELECT (SELECT COUNT(*) FROM employee) employee, (SELECT COUNT(*) FROM attendance) attendance, (SELECT COUNT(*) FROM payroll) payroll, (SELECT COUNT(*) FROM leaverequest) leaverequest');
  const before = { counts: Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)])) };
  fs.writeFileSync(path.join(dir, 'dedup-renumber-before.json'), JSON.stringify(before, null, 2));
  console.log('BEFORE:', JSON.stringify(before.counts));

  // ── A) Attendance dedup — keep MIN(id) per (employeeId, date) ──────────────
  const delA = await raw(`
    DELETE a FROM attendance a
    JOIN (
      SELECT employeeId, date, MIN(id) keepId
      FROM attendance GROUP BY employeeId, date HAVING COUNT(*) > 1
    ) k ON a.employeeId = k.employeeId AND a.date = k.date AND a.id <> k.keepId
  `);
  console.log(`A) Attendance duplicates deleted: ${delA}`);

  // ── B) Employee renumber 1..N (close gaps) ─────────────────────────────────
  // mapping in a temp column
  await raw('ALTER TABLE `employee` ADD COLUMN `__newid` INT NULL');
  await raw('SET @n := 0');
  await raw('UPDATE `employee` SET `__newid` = (@n := @n + 1) ORDER BY `id` ASC');
  const empCount = Number((await q('SELECT COUNT(*) c FROM employee'))[0].c);

  // discover + drop the employeeId FKs on the child tables
  const fks = await q(
    `SELECT TABLE_NAME t, CONSTRAINT_NAME c FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME='Employee' AND REFERENCED_COLUMN_NAME='id'`, DB);
  for (const f of fks) await raw(`ALTER TABLE \`${f.t}\` DROP FOREIGN KEY \`${f.c}\``);
  console.log('B) Dropped employee FKs:', fks.map(f => `${f.t}.${f.c}`).join(', '));

  // remap children to the new employee ids (join on the still-intact old id)
  for (const t of CHILD_TABLES) {
    const n = await raw(`UPDATE \`${t}\` c JOIN \`employee\` e ON c.employeeId = e.id SET c.employeeId = e.__newid`);
    console.log(`   remapped ${t}.employeeId: ${n} rows`);
  }

  // swap employee.id -> __newid (drop AI + PK so the bulk update is unconstrained)
  await raw('ALTER TABLE `employee` MODIFY `id` INT NOT NULL');
  await raw('ALTER TABLE `employee` DROP PRIMARY KEY');
  await raw('UPDATE `employee` SET `id` = `__newid`');
  await raw('ALTER TABLE `employee` DROP COLUMN `__newid`');
  await raw('ALTER TABLE `employee` ADD PRIMARY KEY (`id`)');
  await raw('ALTER TABLE `employee` MODIFY `id` INT NOT NULL AUTO_INCREMENT');
  await raw('ALTER TABLE `employee` AUTO_INCREMENT = ' + (empCount + 1));

  // restore the child FKs (all onDelete Cascade per schema)
  for (const t of CHILD_TABLES) {
    await raw(`ALTER TABLE \`${t}\` ADD CONSTRAINT \`${t}_employeeId_fkey\` FOREIGN KEY (\`employeeId\`) REFERENCES \`employee\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
  }
  console.log(`B) Employee renumbered 1..${empCount}, FKs restored, next id = ${empCount + 1}`);

  // ── C) Attendance renumber 1..N (compact after the deletions) ──────────────
  const attCount = Number((await q('SELECT COUNT(*) c FROM attendance'))[0].c);
  await raw('SET @n := 0');
  await raw('UPDATE `attendance` SET `id` = (@n := @n + 1) ORDER BY `id` ASC');
  await raw('ALTER TABLE `attendance` AUTO_INCREMENT = ' + (attCount + 1));
  console.log(`C) Attendance renumbered 1..${attCount}, next id = ${attCount + 1}`);

  // ── Verify ─────────────────────────────────────────────────────────────────
  const chk = async (t) => {
    const r = await q(`SELECT MIN(id) lo, MAX(id) hi, COUNT(*) n FROM \`${t}\``);
    const gap = (Number(r[0].hi || 0) === Number(r[0].n)) ? 'gapless' : 'HAS GAPS';
    return `${t}: ${r[0].n} rows, id ${r[0].lo || 0}..${r[0].hi || 0} (${gap})`;
  };
  console.log('\nVERIFY:');
  for (const t of ['company', 'user', 'employee', 'attendance', 'payroll', 'leaverequest']) console.log('  ' + await chk(t));
}

main()
  .catch(e => { console.error('FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
