const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log('Wallets:', await prisma.verificationCreditWallet.findMany());
  console.log('Companies:', await prisma.company.findMany({ select: { id: true, companyName: true } }));
  await prisma.$disconnect();
}
main();
