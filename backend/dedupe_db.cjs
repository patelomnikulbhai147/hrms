const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function dedupe() {
  console.log('Starting Database Audit & Deduplication...');
  
  // 1. Dedupe Payroll Records
  console.log('Fetching payroll records...');
  const payrolls = await prisma.payroll.findMany({
    orderBy: { createdAt: 'desc' }
  });
  
  const payrollMap = {};
  let deletedPayrollCount = 0;
  
  for (const record of payrolls) {
    const key = `${record.employeeId}-${record.month}-${record.year}`;
    if (payrollMap[key]) {
      // Duplicate found, older one (since we ordered by desc, the first we see is newest)
      await prisma.payroll.delete({ where: { id: record.id } });
      deletedPayrollCount++;
    } else {
      payrollMap[key] = true;
    }
  }
  console.log(`Removed ${deletedPayrollCount} duplicate payroll records.`);

  // 2. Orphaned Branch/Company cleanup (if any)
  // A branch is orphaned if its parentCompanyId points to a company that no longer exists
  console.log('Checking for orphaned branches...');
  const branches = await prisma.branch.findMany();
  const companies = await prisma.company.findMany();
  const companyIds = new Set(companies.map(c => c.id));
  
  let deletedOrphanedBranches = 0;
  for (const branch of branches) {
    if (!companyIds.has(branch.companyId)) {
      await prisma.branch.delete({ where: { id: branch.id } });
      deletedOrphanedBranches++;
    }
  }
  console.log(`Removed ${deletedOrphanedBranches} orphaned branches.`);
  
  // 3. Employee deduplication by employeeId
  // The schema has @unique on employeeId, so Prisma natively prevents DB-level duplicate employeeIds.
  // We just need to check if they have valid companyIds.
  console.log('Checking for orphaned employees...');
  const employees = await prisma.employee.findMany();
  let deletedOrphanedEmployees = 0;
  for (const emp of employees) {
    if (!companyIds.has(emp.companyId)) {
      // If the employee's company was hard-deleted (unlikely due to foreign keys, but just in case)
      // Actually Prisma foreign keys prevent this if referential integrity is enforced, but let's check.
      try {
        await prisma.employee.delete({ where: { id: emp.id } });
        deletedOrphanedEmployees++;
      } catch (e) {
        console.error('Failed to delete orphaned employee', emp.id);
      }
    }
  }
  console.log(`Removed ${deletedOrphanedEmployees} orphaned employees.`);

  console.log('Deduplication Complete.');
}

dedupe()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
