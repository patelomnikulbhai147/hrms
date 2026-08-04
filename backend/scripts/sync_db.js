const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  await prisma.companyBankVerificationSettings.update({
    where: { companyId: 1 },
    data: { environment: 'Sandbox' }
  });
  console.log('Switched to Sandbox');
}
run().finally(()=>prisma.$disconnect());
