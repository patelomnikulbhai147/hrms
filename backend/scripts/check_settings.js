const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  console.log('BankSettings:', await prisma.companyBankVerificationSettings.findUnique({where:{companyId:1}}));
  console.log('CreditSettings:', await prisma.verificationSettings.findUnique({where:{companyId:1}}));
}
run().finally(()=>prisma.$disconnect());
