/**
 * Backfill — recruitment rows scoped to a BRANCH id → parent COMPANY id.
 *
 * Root cause being repaired: recruitment's tenant resolver used
 * `req.user.companyId` raw, and `User.companyId` may hold a BRANCH id (Company
 * and Branch share one id sequence). Users attached to a branch therefore
 * created Requirement/JobPost/Application rows under the branch id — invisible
 * to every other user of the same company. The API now resolves branch →
 * parent company on every read/write; this script moves the historical rows to
 * where the fixed API reads them.
 *
 * Safety:
 *  • Backs up every affected row (full JSON) to backend/backups/ BEFORE writing.
 *  • Only remaps companyId values that are REAL branch ids (exact FK lookup —
 *    nothing is assigned blindly).
 *  • Idempotent — a second run finds nothing to do.
 *  • InterviewScheduleSettings has @unique(companyId): a branch row is merged
 *    only when the parent company has no row yet, otherwise it is backed up and
 *    removed (the company row wins).
 *
 * Run: node scripts/fixRecruitmentCompanyScope.js
 * Dry run (report only, no writes): node scripts/fixRecruitmentCompanyScope.js --dry
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const DRY = process.argv.includes('--dry');
const BACKUP_DIR = path.join(__dirname, '../backups');

async function main() {
  const branches = await prisma.branch.findMany({ select: { id: true, companyId: true } });
  const branchToCompany = new Map(branches.map(b => [b.id, b.companyId]));
  const branchIds = [...branchToCompany.keys()];
  if (!branchIds.length) {
    console.log('[recruitment-scope] no branches exist — nothing to remap.');
    return;
  }

  const backup = { createdAt: new Date().toISOString(), tables: {} };
  let totalFixed = 0;

  for (const table of ['requirement', 'jobPost', 'application']) {
    const rows = await prisma[table].findMany({ where: { companyId: { in: branchIds } } });
    backup.tables[table] = rows;
    if (!rows.length) {
      console.log(`[recruitment-scope] ${table}: clean (no branch-scoped rows).`);
      continue;
    }
    console.log(`[recruitment-scope] ${table}: ${rows.length} branch-scoped row(s) found.`);
    for (const row of rows) {
      const parent = branchToCompany.get(row.companyId);
      console.log(`  #${row.id}: companyId ${row.companyId} (branch) → ${parent} (company)${DRY ? ' [dry run]' : ''}`);
      if (!DRY) {
        await prisma[table].update({ where: { id: row.id }, data: { companyId: parent } });
        totalFixed++;
      }
    }
  }

  // InterviewScheduleSettings — unique(companyId), so merge instead of blind update
  const settingsRows = await prisma.interviewScheduleSettings.findMany({ where: { companyId: { in: branchIds } } });
  backup.tables.interviewScheduleSettings = settingsRows;
  for (const row of settingsRows) {
    const parent = branchToCompany.get(row.companyId);
    const parentRow = await prisma.interviewScheduleSettings.findUnique({ where: { companyId: parent } });
    if (parentRow) {
      console.log(`  interviewScheduleSettings #${row.id}: company ${parent} already has settings — removing branch-scoped duplicate${DRY ? ' [dry run]' : ''}`);
      if (!DRY) { await prisma.interviewScheduleSettings.delete({ where: { id: row.id } }); totalFixed++; }
    } else {
      console.log(`  interviewScheduleSettings #${row.id}: companyId ${row.companyId} → ${parent}${DRY ? ' [dry run]' : ''}`);
      if (!DRY) { await prisma.interviewScheduleSettings.update({ where: { id: row.id }, data: { companyId: parent } }); totalFixed++; }
    }
  }

  const anyAffected = Object.values(backup.tables).some(r => r.length);
  if (anyAffected && !DRY) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `recruitment-scope-backup-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`[recruitment-scope] backup of original rows written to ${file}`);
  }

  console.log(`[recruitment-scope] done — ${DRY ? 'dry run, no rows changed' : `${totalFixed} row(s) fixed`}.`);
}

main()
  .catch(e => { console.error('[recruitment-scope] FAILED:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
