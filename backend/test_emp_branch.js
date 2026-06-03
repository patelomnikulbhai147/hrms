const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany({ select: { id: true, name: true, branchLocation: true, companyId: true } });
  console.log('Total emps:', emps.length);
  const cAhmedabad = emps.filter(e => e.branchLocation === 'c-ahmedabad');
  console.log('With c-ahmedabad:', cAhmedabad.length);
  const upperAhmedabad = emps.filter(e => e.branchLocation === 'AHMEDABAD');
  console.log('With AHMEDABAD:', upperAhmedabad.length);
  
  // also check other cases
  const cRajkot = emps.filter(e => e.branchLocation === 'c-rajkot');
  console.log('With c-rajkot:', cRajkot.length);
}

run().finally(() => prisma.$disconnect());
