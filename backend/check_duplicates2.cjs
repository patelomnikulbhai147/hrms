const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany();
  console.log('Total DB Employees:', emps.length);
  const users = await prisma.user.findMany();
  console.log('Total DB Users:', users.length);
  const pay = await prisma.payroll.findMany();
  console.log('Total DB Payrolls:', pay.length);

  const empCounts = {};
  for(let e of emps) {
    empCounts[e.employeeId] = (empCounts[e.employeeId] || 0) + 1;
  }
  const empDupes = Object.entries(empCounts).filter(([id, c]) => c > 1);
  console.log('Duplicate Employee IDs count:', empDupes.length);

  const payCounts = {};
  for(let p of pay) {
    const key = `${p.employeeId}-${p.month}-${p.year}-${p.companyId}`;
    payCounts[key] = (payCounts[key] || 0) + 1;
  }
  const payDupes = Object.entries(payCounts).filter(([k, c]) => c > 1);
  console.log('Duplicate Payrolls count:', payDupes.length);

  await prisma.$disconnect();
}

run();
