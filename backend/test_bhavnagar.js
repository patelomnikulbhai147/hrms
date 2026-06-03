const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { isCompanyIdMatch } = require('../src/types/index.js'); // Assuming we can't easily require ts, I'll just copy the function logic.

async function run() {
  const employees = await prisma.employee.findMany();
  const companies = await prisma.company.findMany();
  const branches = await prisma.branch.findMany();
  
  const mappedBranches = branches.map(b => ({
    id: b.id,
    name: b.branchName,
    parentCompanyId: b.companyId,
    isHeadOffice: false,
    branchName: b.branchName
  }));
  const companiesList = [...companies, ...mappedBranches];
  const activeId = mappedBranches.find(b => b.branchName === 'Bhavnagar').id;
  
  const activeComp = companiesList.find(c => c.id === activeId);
  
  const rawScoped = employees.filter(e => {
    if (activeComp && activeComp.parentCompanyId && !activeComp.isHeadOffice) {
       if (e.companyId === activeComp.parentCompanyId && e.branchLocation) {
         const activeBranchName = (activeComp.name || activeComp.branchName || '').toUpperCase();
         if (e.branchLocation.toUpperCase() === activeBranchName) return true;
       }
       return false;
    }
    return false;
  });
  
  console.log('Raw Scoped Employees for Bhavnagar:', rawScoped.length);
  
  const seen = new Set();
  const unique = [];
  for (const emp of rawScoped) {
    const key = (emp.employeeId || emp.id || emp.email || '').toString().toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(emp);
    }
  }
  
  console.log('Unique Employees for Bhavnagar:', unique.length);
}

run().finally(() => prisma.$disconnect());
