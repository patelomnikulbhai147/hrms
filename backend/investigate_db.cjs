const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function investigate() {
  console.log("--- EMPLOYEE AUDIT ---");
  const totalEmployees = await prisma.employee.count();
  console.log("Total Employees:", totalEmployees);

  const employees = await prisma.employee.findMany();
  const companies = await prisma.company.findMany();
  const branches = await prisma.branch.findMany();

  const companyIds = new Set(companies.map(c => c.id));
  const branchIds = new Set(branches.map(b => b.id));

  let validCompanyCount = 0;
  let nullCompanyCount = 0;
  let invalidCompanyCount = 0;

  let validBranchCount = 0;
  let nullBranchCount = 0;
  let invalidBranchCount = 0;

  for (const emp of employees) {
    if (!emp.companyId) {
      nullCompanyCount++;
    } else if (companyIds.has(emp.companyId)) {
      validCompanyCount++;
    } else {
      invalidCompanyCount++;
      if (invalidCompanyCount === 1) console.log("Example invalid companyId on emp:", emp.id, "=>", emp.companyId);
    }

    if (!emp.branchId) {
      nullBranchCount++;
    } else if (branchIds.has(emp.branchId)) {
      validBranchCount++;
    } else {
      invalidBranchCount++;
      if (invalidBranchCount === 1) console.log("Example invalid branchId on emp:", emp.id, "=>", emp.branchId);
    }
  }

  console.log(`Employees with valid companyId: ${validCompanyCount}`);
  console.log(`Employees with NULL companyId: ${nullCompanyCount}`);
  console.log(`Employees with invalid companyId: ${invalidCompanyCount}`);
  console.log(`Employees with valid branchId: ${validBranchCount}`);
  console.log(`Employees with NULL branchId: ${nullBranchCount}`);
  console.log(`Employees with invalid branchId: ${invalidBranchCount}`);

  console.log("\n--- COMPANY AUDIT ---");
  console.log("Total Companies:", companies.length);
  console.log("Company IDs:", Array.from(companyIds).join(", "));
  
  for (const c of companies) {
    const empCount = employees.filter(e => e.companyId === c.id).length;
    console.log(`Company ${c.id} (${c.name}) has ${empCount} employees linked via companyId.`);
  }

  console.log("\n--- BRANCH AUDIT ---");
  console.log("Total Branches:", branches.length);
  console.log("Branch IDs:", Array.from(branchIds).join(", "));
  
  for (const b of branches) {
    const empCount = employees.filter(e => e.branchId === b.id).length;
    const fallbackCount = employees.filter(e => e.companyId === b.id).length;
    console.log(`Branch ${b.id} (${b.branchName}) has ${empCount} employees linked via branchId, and ${fallbackCount} via companyId.`);
  }

  console.log("\n--- USER AUDIT ---");
  const users = await prisma.user.findMany();
  for (const u of users) {
    console.log(`User ${u.id} (${u.username}) -> companyId: ${u.companyId}`);
  }

  await prisma.$disconnect();
}

investigate().catch(console.error);
