const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const siddhpurEmps = await prisma.employee.count({ where: { branchId: 'c-siddhpur' } });
  const siddhpurPayrolls = await prisma.payroll.count({ where: { companyId: 'c-siddhpur' } });
  const allPayrolls = await prisma.payroll.count();
  console.log('Siddhpur employees:', siddhpurEmps);
  console.log('Siddhpur payrolls:', siddhpurPayrolls);
  console.log('Total payrolls in DB:', allPayrolls);
  
  if (siddhpurEmps === 0) {
    const anyBranchEmps = await prisma.employee.groupBy({ by: ['branchId'], _count: true });
    console.log('Employees by branch:', anyBranchEmps);
  }
}
main().finally(() => prisma.$disconnect());
