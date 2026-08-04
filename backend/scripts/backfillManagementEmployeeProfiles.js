/**
 * Backfill: give every existing company login user (Company Head, HR, …) an
 * Employee profile so they appear in the Employee Directory, receive a
 * standard employee code, and consume an employee slot.
 *
 * For each active User with a companyId, no Super Admin role, and no linked
 * Employee row: link to an existing employee (matching code/email) when one
 * exists, otherwise create a profile through the standard code generator.
 *
 * DRY-RUN by default — prints what would happen. Apply with:
 *   node scripts/backfillManagementEmployeeProfiles.js --apply
 */
const prisma = require('../src/config/prisma');
const { ensureEmployeeProfileForUser, findLinkableEmployee } = require('../src/services/userEmployeeProfileService');

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`Backfill management employee profiles — ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}\n`);

  const users = await prisma.user.findMany({
    where: { companyId: { not: null }, role: { not: 'Super Admin' } },
    orderBy: { id: 'asc' },
  });

  let linked = 0, created = 0, existing = 0, dangling = 0, failed = 0;
  for (const user of users) {
    // Already linked to a live row?
    if (user.employeeId) {
      const emp = await prisma.employee.findUnique({ where: { id: Number(user.employeeId) } });
      if (emp) { existing++; continue; }
      dangling++; // linked id points nowhere — treat as unlinked below
    }
    try {
      if (!APPLY) {
        const target = await findLinkableEmployee(user);
        console.log(`  would ${target ? `LINK → ${target.employeeId}` : 'CREATE profile'}  user#${user.id} ${user.role} <${user.email}> (company ${user.companyId})`);
        target ? linked++ : created++;
        continue;
      }
      const result = await ensureEmployeeProfileForUser(user);
      if (result.action === 'linked') { linked++; console.log(`  linked  user#${user.id} ${user.role} <${user.email}> → ${result.employee.employeeId}`); }
      else if (result.action === 'created') { created++; console.log(`  created user#${user.id} ${user.role} <${user.email}> → ${result.employee.employeeId}`); }
      else existing++;
    } catch (e) {
      failed++;
      console.error(`  FAILED user#${user.id} <${user.email}>: ${e.message}`);
    }
  }

  console.log(`\n${APPLY ? 'RESULT' : 'DRY-RUN RESULT'}: ${existing} already linked, ${linked} linked, ${created} created, ${dangling} dangling links repaired, ${failed} failed (of ${users.length} company users)`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('FAILED:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
