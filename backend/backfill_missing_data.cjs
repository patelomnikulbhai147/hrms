const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function run() {
  console.log('Starting backfill process...');
  const content = fs.readFileSync('../src/data/excelSeededData.ts', 'utf-8');
  
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
  console.log(`Found ${employees.length} employees in seeded data. Connecting to PostgreSQL...`);
  
  for (const emp of employees) {
    if (!emp.employeeId) continue;
    
    // We only update fields that were previously missing
    const dataToUpdate = {
      firstName: emp.firstName && emp.firstName !== '-' ? emp.firstName : null,
      lastName: emp.lastName && emp.lastName !== '-' ? emp.lastName : null,
      phone: emp.phone && emp.phone !== '-' ? emp.phone : null,
      bankName: emp.bankName && emp.bankName !== '-' ? emp.bankName : null,
      accountNumber: emp.accountNumber && emp.accountNumber !== '-' ? emp.accountNumber : null,
      ifsc: emp.ifsc && emp.ifsc !== '-' ? emp.ifsc : null,
      presentAddress: emp.presentAddress && emp.presentAddress !== '-' ? emp.presentAddress : null,
      permanentAddress: emp.permanentAddress && emp.permanentAddress !== '-' ? emp.permanentAddress : null,
    };
    
    // Optional: remove keys that are null if you want them to remain unchanged, but here we explicitly set them.
    // Wait, let's just use what's in the JSON.
    Object.keys(dataToUpdate).forEach(key => {
      if (dataToUpdate[key] === null) {
         // Keep nulls to clean up the DB
      }
    });

    try {
      await prisma.employee.updateMany({
        where: { employeeId: emp.employeeId },
        data: dataToUpdate
      });
      updatedCount++;
      if (updatedCount % 100 === 0) {
        console.log(`Updated ${updatedCount} employees...`);
      }
    } catch (err) {
      console.error(`Failed to update employee ${emp.employeeId}:`, err.message);
    }
  }
  
  console.log(`Successfully backfilled ${updatedCount} employees with missing fields!`);
  
  // Verify Database
  const count = await prisma.employee.count();
  const bankName = await prisma.employee.count({ where: { bankName: { not: null } } });
  const accountNumber = await prisma.employee.count({ where: { accountNumber: { not: null } } });
  const phone = await prisma.employee.count({ where: { phone: { not: null } } });
  
  console.log('--- POST BACKFILL DB AUDIT ---');
  console.log({ count, bankName, accountNumber, phone });
}

run().finally(() => prisma.$disconnect());
