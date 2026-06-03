const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function run() {
  // Read excelSeededData.ts
  const content = fs.readFileSync('../src/data/excelSeededData.ts', 'utf-8');
  
  // Extract JSON array
  const match = content.match(/export const excelSeededEmployees: Employee\[\] = (\[[\s\S]*\]);/);
  if (!match) {
    console.error('Could not find excelSeededEmployees array');
    return;
  }
  
  let employees;
  try {
    employees = JSON.parse(match[1]);
  } catch (e) {
    console.error('Failed to parse JSON', e);
    return;
  }
  
  let updatedCount = 0;
  
  for (const emp of employees) {
    let targetBranchLocation = null;
    
    if (emp.companyId === 'c-ahmedabad' || emp.branchLocation === 'AHMEDABAD') {
      targetBranchLocation = 'AHMEDABAD';
    } else if (emp.companyId === 'c-bhavnagar' || emp.branchLocation === 'BHAVNAGAR') {
      targetBranchLocation = 'BHAVNAGAR';
    } else if (emp.companyId === 'c-rajkot' || emp.branchLocation === 'RAJKOT') {
      targetBranchLocation = 'RAJKOT';
    } else if (emp.companyId === 'c-siddhpur' || emp.branchLocation === 'SIDDHPUR') {
      targetBranchLocation = 'SIDDHPUR';
    }
    
    if (targetBranchLocation) {
      await prisma.employee.updateMany({
        where: { employeeId: emp.employeeId },
        data: { branchLocation: targetBranchLocation }
      });
      updatedCount++;
    }
  }
  
  console.log(`Successfully updated ${updatedCount} employees with correct branchLocation!`);
}

run().finally(() => prisma.$disconnect());
