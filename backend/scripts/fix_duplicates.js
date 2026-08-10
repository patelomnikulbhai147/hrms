const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Fixing duplicate phones...");
  const duplicates = await prisma.$queryRaw`
    SELECT companyId, phone, COUNT(*) as cnt
    FROM Employee
    WHERE phone IS NOT NULL AND phone != ''
    GROUP BY companyId, phone
    HAVING cnt > 1
  `;
  
  for (const dup of duplicates) {
    console.log(`Fixing duplicates for companyId: ${dup.companyId}, phone: ${dup.phone}`);
    const employees = await prisma.employee.findMany({
      where: { companyId: dup.companyId, phone: dup.phone },
      orderBy: { id: 'asc' }
    });
    
    // Keep the first one, nullify or append random string to the rest
    for (let i = 1; i < employees.length; i++) {
      await prisma.employee.update({
        where: { id: employees[i].id },
        data: { phone: employees[i].phone + "-dup-" + employees[i].id }
      });
      console.log(`Updated employee ${employees[i].id} phone to ${employees[i].phone}-dup-${employees[i].id}`);
    }
  }
  
  console.log("Done.");
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
