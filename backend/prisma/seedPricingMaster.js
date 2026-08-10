const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tiers = [
    { tierName: 'Free', minEmployees: 0, maxEmployees: 100, quarterlyPrice: 0, yearlyPrice: 0 },
    { tierName: '0-100', minEmployees: 0, maxEmployees: 100, quarterlyPrice: 25, yearlyPrice: 20 },
    { tierName: '100-500', minEmployees: 101, maxEmployees: 500, quarterlyPrice: 20, yearlyPrice: 16 },
    { tierName: '500+', minEmployees: 501, maxEmployees: null, quarterlyPrice: 15, yearlyPrice: 12 },
  ];

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
