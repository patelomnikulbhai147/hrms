const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find all payrolls where the employee has a branchId that doesn't match the payroll's companyId
  const payrolls = await prisma.payroll.findMany({
    include: { employee: true }
  });
  
  let updatedCount = 0;
  for (const p of payrolls) {
    if (p.employee.branchId && p.companyId !== p.employee.branchId) {
      await prisma.payroll.update({
        where: { id: p.id },
        data: { companyId: p.employee.branchId }
      });
      updatedCount++;
    }
  }
  console.log(`Updated ${updatedCount} payroll records to use branchId.`);
}
main().finally(() => prisma.$disconnect());
