const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const badPayrolls = await prisma.payroll.findMany({
    where: {
      OR: [
        { employeeName: 'Unknown' },
        { netSalary: 0 }
      ]
    }
  });
  
  console.log(`Found ${badPayrolls.length} bad payrolls. Deleting...`);
  
  const result = await prisma.payroll.deleteMany({
    where: {
      OR: [
        { employeeName: 'Unknown' },
        { netSalary: 0 }
      ]
    }
  });
  
  console.log(`Deleted ${result.count} payrolls.`);
  await prisma.$disconnect();
}
main();
