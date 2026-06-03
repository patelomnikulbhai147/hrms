const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const employees = await prisma.employee.findMany();
  const bhavnagar = employees.filter(e => e.branchLocation === 'BHAVNAGAR');
  console.log('Bhavnagar from DB:', bhavnagar.length);
  if (bhavnagar.length > 0) {
    console.log('Sample:', bhavnagar[0].employeeId, bhavnagar[0].branchLocation);
  }
}
run().finally(() => prisma.$disconnect());
