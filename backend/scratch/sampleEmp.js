require('dotenv').config();
const prisma = require('../src/config/prisma');
(async () => {
  const total = await prisma.employee.count({ where: { companyId: 'c-gcri' } });
  const sample = await prisma.employee.findMany({ where: { companyId: 'c-gcri' }, take: 8, select: { employeeId: true, name: true, phone: true, email: true, branchId: true, department: true, designation: true } });
  console.log('GCRI employees:', total);
  console.log(JSON.stringify(sample, null, 1));
  // code format distribution
  const all = await prisma.employee.findMany({ where: { companyId: 'c-gcri' }, select: { employeeId: true } });
  const ve = all.filter(e => /^VE/i.test(e.employeeId)).length;
  const other = all.filter(e => !/^VE/i.test(e.employeeId));
  console.log('employeeId starting with VE:', ve, '/', all.length);
  console.log('non-VE sample:', JSON.stringify(other.slice(0,10).map(e=>e.employeeId)));
  // email pattern
  const emails = await prisma.employee.findMany({ where: { companyId: 'c-gcri' }, select: { email: true }, take: 5 });
  console.log('emails:', JSON.stringify(emails.map(e=>e.email)));
  await prisma.$disconnect();
})();
