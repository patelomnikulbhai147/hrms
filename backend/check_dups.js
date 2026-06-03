const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
  const employees = await prisma.employee.findMany();
  const byEmpId = {};
  for (const e of employees) {
    if (!byEmpId[e.employeeId]) byEmpId[e.employeeId] = [];
    byEmpId[e.employeeId].push(e);
  }
  
  let duplicates = 0;
  for (const empId in byEmpId) {
    if (byEmpId[empId].length > 1) {
      console.log(`Duplicate found for ${empId}: ${byEmpId[empId].length} records`);
      duplicates++;
    }
  }
  if (duplicates === 0) console.log('No duplicates found.');
}
checkDuplicates().finally(() => prisma.$disconnect());
