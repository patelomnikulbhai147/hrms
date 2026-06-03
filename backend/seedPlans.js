const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  await prisma.subscriptionPlan.upsert({
    where: { id: 'plan-starter' },
    update: {},
    create: { id: 'plan-starter', name: 'Starter', priceMonthly: 1999, priceYearly: 19999, employeeLimit: 100, hrLimit: 3, storageLimit: '5 GB', payrollAccess: true, documentAccess: true, includedBranchLimit: 1 }
  });
  await prisma.subscriptionPlan.upsert({
    where: { id: 'plan-professional' },
    update: {},
    create: { id: 'plan-professional', name: 'Professional', priceMonthly: 4999, priceYearly: 49999, employeeLimit: 1000, hrLimit: 15, storageLimit: '50 GB', payrollAccess: true, documentAccess: true, includedBranchLimit: 5 }
  });
  await prisma.subscriptionPlan.upsert({
    where: { id: 'plan-enterprise' },
    update: {},
    create: { id: 'plan-enterprise', name: 'Enterprise', priceMonthly: 12999, priceYearly: 129999, employeeLimit: -1, hrLimit: -1, storageLimit: 'Unlimited', payrollAccess: true, documentAccess: true, includedBranchLimit: 999 }
  });
  console.log('Plans seeded!');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
