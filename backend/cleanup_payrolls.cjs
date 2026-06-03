const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Fetching all payrolls...');
  const pay = await prisma.payroll.findMany();
  console.log('Total Payrolls:', pay.length);

  const keptIds = new Set();
  const deleteIds = [];

  for(let p of pay) {
    const key = `${p.employeeId}-${p.month}-${p.year}-${p.companyId}`;
    if(keptIds.has(key)) {
      deleteIds.push(p.id);
    } else {
      keptIds.add(key);
    }
  }

  console.log(`Found ${deleteIds.length} duplicate payrolls to delete.`);

  if(deleteIds.length > 0) {
    const result = await prisma.payroll.deleteMany({
      where: {
        id: { in: deleteIds }
      }
    });
    console.log(`Deleted ${result.count} duplicate payroll records.`);
  }

  await prisma.$disconnect();
}

run();
