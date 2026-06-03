const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.employee.updateMany({
    where: { OR: [{ branchId: null }, { branchId: '' }] },
    data: { branchId: 'c-ahmedabad', companyId: 'c-gcri' }
  });
  
  console.log(`Updated ${result.count} orphan employees.`);
  await prisma.$disconnect();
}
main();
