const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function repairMappings() {
  console.log("Starting Employee Data Integrity Repair...");
  let fixedCount = 0;
  let complianceFixedCount = 0;

  try {
    const employees = await prisma.employee.findMany();
    
    // Create branch mapping from Branch table
    const branches = await prisma.branch.findMany();
    const branchMap = {};
    branches.forEach(b => {
      branchMap[b.branchName.toUpperCase()] = b.id;
    });

    console.log(`Found ${employees.length} employees to verify.`);

    for (const emp of employees) {
      let needsUpdate = false;
      const updateData = {};

      // 1. Repair branchId
      if (!emp.branchId && emp.branchLocation) {
        const matchingBranchId = branchMap[emp.branchLocation.toUpperCase()];
        if (matchingBranchId) {
          updateData.branchId = matchingBranchId;
          updateData.companyId = 'c-gcri';
          needsUpdate = true;
          console.log(`[Branch Fix] Employee ${emp.employeeId} mapped to branch ${matchingBranchId}`);
        }
      } else if (emp.companyId !== 'c-gcri' && emp.companyId !== 'UNKNOWN') {
         // Some employees might have their companyId mistakenly set to a branch ID without setting branchId
         if (branches.some(b => b.id === emp.companyId)) {
            updateData.branchId = emp.companyId;
            updateData.companyId = 'c-gcri';
            needsUpdate = true;
            console.log(`[Branch Fix] Employee ${emp.employeeId} companyId shifted to branchId`);
         }
      }

      // 2. Repair explicit "null" strings to actual SQL nulls
      const stringFields = [
        'pan', 'aadhaar', 'uan', 'pfNumber', 'esiNumber', 
        'bankName', 'accountNumber', 'ifsc', 
        'middleName', 'aadhaarName', 'gender', 'dob', 'maritalStatus', 
        'nationality', 'fatherSpouseName', 'relationType', 'emergencyContact', 
        'category', 'employmentType', 'branchLocation',
        'presentAddress', 'permanentAddress', 'exitReason'
      ];

      for (const field of stringFields) {
        if (emp[field] === 'null' || emp[field] === 'undefined' || emp[field] === 'Unknown') {
          updateData[field] = null;
          needsUpdate = true;
          complianceFixedCount++;
        }
      }

      if (needsUpdate) {
        await prisma.employee.update({
          where: { id: emp.id },
          data: updateData
        });
        fixedCount++;
      }
    }

    console.log(`Repair Complete. Fixed branches/companies for ${fixedCount} employees. Cleared ${complianceFixedCount} invalid string literals.`);
  } catch (err) {
    console.error("Error during repair:", err);
  } finally {
    await prisma.$disconnect();
  }
}

repairMappings();
