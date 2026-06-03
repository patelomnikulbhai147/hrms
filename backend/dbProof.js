const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.count({ where: { branchId: 'c-siddhpur' } });
  const empsWithPayroll = await prisma.employee.findMany({ where: { branchId: 'c-siddhpur' }, include: { payroll: true } });
  const totalPayrolls = empsWithPayroll.reduce((acc, emp) => acc + emp.payroll.length, 0);
  const totalSalary = empsWithPayroll.reduce((acc, emp) => acc + emp.salary, 0);
  
  console.log(`DATABASE QUERY PROOF:`);
  console.log(`- Siddhpur Employee Count: ${emps}`);
  console.log(`- Siddhpur Payroll Records Count: ${totalPayrolls}`);
  console.log(`- Siddhpur Total Monthly Salary Cost: Rs. ${(totalSalary / 12).toFixed(2)}`);
}

main().finally(() => prisma.$disconnect());
