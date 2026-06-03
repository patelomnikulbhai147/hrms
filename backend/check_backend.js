const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const allowedIds = ['c-gcri', 'c-ahmedabad', 'c-rajkot', 'c-bhavnagar', 'c-siddhpur'];
  const payrolls = await prisma.payroll.findMany({
    where: {
      OR: [
        { companyId: { in: allowedIds } },
        { employee: { branchId: { in: allowedIds } } },
        { employee: { companyId: { in: allowedIds } } }
      ]
    },
    include: { employee: true }
  });
  console.log(payrolls.length);
  // Check how many belong to Siddhpur branch
  const siddhpur = payrolls.filter(p => p.employee && p.employee.branchId === 'c-siddhpur');
  console.log('Siddhpur payrolls in fetch:', siddhpur.length);
  await prisma.$disconnect();
}
run();
