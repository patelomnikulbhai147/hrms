const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // NO 'Free' tier: a ₹0 row covering 0-100 shadowed the paid 0-100 tier and
  // priced every small company at ₹0, bypassing the payroll wallet gate
  // (live incident 2026-08-14). The approved matrix is 25/20/15 per employee.
  const tiers = [
    { tierName: '0-100', minEmployees: 0, maxEmployees: 100, quarterlyPrice: 25, yearlyPrice: 20 },
    { tierName: '100-500', minEmployees: 101, maxEmployees: 500, quarterlyPrice: 20, yearlyPrice: 16 },
    { tierName: '500+', minEmployees: 501, maxEmployees: null, quarterlyPrice: 15, yearlyPrice: 12 },
  ];

  // Remove the legacy shadow row if a previous seed created it.
  await prisma.pricingMaster.deleteMany({ where: { tierName: 'Free' } });

  for (const tier of tiers) {
    await prisma.pricingMaster.upsert({
      where: { tierName: tier.tierName },
      update: tier,
      create: tier,
    });
  }
  console.log('PricingMaster seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
