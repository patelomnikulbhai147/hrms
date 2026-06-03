const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emps = await prisma.employee.findMany();
  console.log('Employees:', emps.length);
  const nullEmps = emps.filter(e => !e.name || !e.employeeCode || e.name === 'Unknown');
  console.log('Bad Employees:', nullEmps.length);
  
  const payrolls = await prisma.payroll.findMany();
  console.log('Payrolls:', payrolls.length);
  const badPayrolls = payrolls.filter(p => p.employeeName === 'Unknown' || p.netSalary === 0 || p.netSalary === null);
  console.log('Bad Payrolls:', badPayrolls.length);
  
  const users = await prisma.user.findMany();
  console.log('Users:', users.length);
  const badUsers = users.filter(u => !u.email || !u.username || !u.name || u.name === 'Unknown');
  console.log('Bad Users:', badUsers.length);
  
  await prisma.$disconnect();
}
main();
