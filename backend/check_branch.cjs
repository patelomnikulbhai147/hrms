const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const emps = await prisma.employee.findMany();
  let withBranch = 0;
  let withoutBranch = 0;
  for(let e of emps) {
    if (e.branchId) withBranch++;
    else withoutBranch++;
  }
  console.log(`Employees with branchId: ${withBranch}, without: ${withoutBranch}`);
  
  const compCount = {};
  for(let e of emps) {
    compCount[e.companyId] = (compCount[e.companyId] || 0) + 1;
  }
  console.log(`Employees companyId:`, compCount);

  // check if branchLocation exists in JSON or column
  let withBranchLoc = 0;
  for(let e of emps) {
    if (e.branchLocation) withBranchLoc++;
  }
  console.log(`Employees with branchLocation: ${withBranchLoc}`);

  await prisma.$disconnect();
}
run();
