/**
 * Backfill Branch.branchNo with a company-scoped 1..N sequence.
 *
 * Each company gets its own branch numbering restarting at 1, ordered by the
 * existing Branch.id ascending (creation order). Global Branch.id values are
 * left untouched — they remain the relationship keys.
 */
const prisma = require('../src/config/prisma');

async function main() {
  const companies = await prisma.branch.groupBy({ by: ['companyId'] });
  let total = 0;

  for (const { companyId } of companies) {
    const branches = await prisma.branch.findMany({
      where: { companyId },
      orderBy: { id: 'asc' },
      select: { id: true, branchName: true },
    });

    let no = 1;
    for (const b of branches) {
      await prisma.branch.update({ where: { id: b.id }, data: { branchNo: no } });
      console.log(`  Company ${companyId}  Branch #${b.id} "${b.branchName}" -> branchNo ${no}`);
      no++;
      total++;
    }
  }

  console.log(`\nBackfilled branchNo for ${total} branch(es) across ${companies.length} company(ies).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
