const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const allEmployees = await prisma.employee.findMany();
  
  const bankAndAcctAndPf = allEmployees.filter(e => e.pfNumber && e.bankName && e.accountNumber && e.pfNumber !== '-' && e.bankName !== '-' && e.accountNumber !== '-');
  const bank = allEmployees.filter(e => e.bankName && e.bankName !== '-');
  const acct = allEmployees.filter(e => e.accountNumber && e.accountNumber !== '-');
  const ifsc = allEmployees.filter(e => e.ifsc && e.ifsc !== '-');
  const present = allEmployees.filter(e => e.presentAddress && e.presentAddress !== '-');
  const permanent = allEmployees.filter(e => e.permanentAddress && e.permanentAddress !== '-');
  const phone = allEmployees.filter(e => e.phone && e.phone !== '-');
  
  console.log('Total:', allEmployees.length);
  console.log('bankAndAcctAndPf:', bankAndAcctAndPf.length);
  console.log('bankName:', bank.length);
  console.log('accountNumber:', acct.length);
  console.log('ifsc:', ifsc.length);
  console.log('presentAddress:', present.length);
  console.log('permanentAddress:', permanent.length);
  console.log('phone:', phone.length);
}

main().finally(() => prisma.$disconnect());
