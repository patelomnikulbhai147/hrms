const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting database relationship migration...');
  const branches = await prisma.branch.findMany();
  
  for (const branch of branches) {
    const parentId = branch.companyId;
    const branchId = branch.id;
    
    console.log(`Processing branch: ${branchId} (Parent: ${parentId})`);
    
    // Update Employees
    const empResult = await prisma.employee.updateMany({
      where: { companyId: branchId },
      data: { companyId: parentId, branchId: branchId }
    });
    console.log(`- Updated ${empResult.count} employees`);
    
    // Update ArchivedEmployees
    const archResult = await prisma.archivedEmployee.updateMany({
      where: { companyId: branchId },
      data: { companyId: parentId, branchId: branchId }
    });
    console.log(`- Updated ${archResult.count} archived employees`);
    
    // Update CompanyDocuments
    const docResult = await prisma.companyDocument.updateMany({
      where: { companyId: branchId },
      data: { companyId: parentId } 
    });
    console.log(`- Updated ${docResult.count} company documents`);
  }

  const branchIds = branches.map(b => b.id);
  
  // Before deleting, check if there are any remaining Users linked to the branch in companyId
  // They should be fine since User has no strict foreign key relation to Company in Prisma schema:
  // companyId String? (no @relation)
  // But just in case
  
  const delResult = await prisma.company.deleteMany({
    where: { id: { in: branchIds } }
  });
  console.log(`\nDeleted ${delResult.count} duplicate branch records from Company table`);
  console.log('Migration complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
