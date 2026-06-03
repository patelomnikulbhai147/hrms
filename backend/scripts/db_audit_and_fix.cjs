const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runAudit() {
  console.log('Starting Database Audit & Cleanup...');

  try {
    // 1. Delete Unknown Employees and their related records
    const unknownEmployees = await prisma.employee.findMany({
      where: {
        OR: [
          { name: { contains: 'Unknown', mode: 'insensitive' } },
          { name: { equals: '' } },
          { status: { contains: 'Unknown', mode: 'insensitive' } },
        ]
      }
    });

    const unknownEmployeeIds = unknownEmployees.map(e => e.id);
    if (unknownEmployeeIds.length > 0) {
      console.log(`Found ${unknownEmployeeIds.length} Unknown Employees. Deleting related records...`);
      await prisma.payroll.deleteMany({ where: { employeeId: { in: unknownEmployeeIds } } });
      await prisma.attendance.deleteMany({ where: { employeeId: { in: unknownEmployeeIds } } });
      await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: unknownEmployeeIds } } });
      await prisma.document.deleteMany({ where: { employeeId: { in: unknownEmployeeIds } } });
      
      const deletedUnknowns = await prisma.employee.deleteMany({ where: { id: { in: unknownEmployeeIds } } });
      console.log(`Deleted ${deletedUnknowns.count} Unknown Employees.`);
    } else {
      console.log('No Unknown Employees found.');
    }

    // 2. Delete Orphaned Records (where employeeId doesn't exist)
    const validEmployees = await prisma.employee.findMany({ select: { id: true } });
    const validEmployeeIds = validEmployees.map(e => e.id);

    const orphanPayrolls = await prisma.payroll.deleteMany({
      where: { employeeId: { notIn: validEmployeeIds } }
    });
    console.log(`Deleted ${orphanPayrolls.count} Orphaned Payrolls.`);

    const orphanAttendance = await prisma.attendance.deleteMany({
      where: { employeeId: { notIn: validEmployeeIds } }
    });
    console.log(`Deleted ${orphanAttendance.count} Orphaned Attendances.`);

    const orphanLeave = await prisma.leaveRequest.deleteMany({
      where: { employeeId: { notIn: validEmployeeIds } }
    });
    console.log(`Deleted ${orphanLeave.count} Orphaned Leave Requests.`);

    // 3. Fix Duplicate Payrolls (Group by employeeId, month, year)
    const payrolls = await prisma.payroll.findMany();
    const payrollMap = new Map();
    const duplicatePayrollIds = [];

    for (const p of payrolls) {
      const key = `${p.employeeId}-${p.month}-${p.year}-${p.companyId}`;
      if (payrollMap.has(key)) {
        duplicatePayrollIds.push(p.id);
      } else {
        payrollMap.set(key, true);
      }
    }

    if (duplicatePayrollIds.length > 0) {
      const deletedDupPayrolls = await prisma.payroll.deleteMany({
        where: { id: { in: duplicatePayrollIds } }
      });
      console.log(`Deleted ${deletedDupPayrolls.count} Duplicate Payrolls.`);
    } else {
      console.log('No Duplicate Payrolls found.');
    }

    // 4. Validate Branch Headcounts
    const branches = await prisma.branch.findMany({
      include: { employees: true }
    });

    let updatedBranches = 0;
    for (const branch of branches) {
      const actualCount = branch.employees.filter(e => e.status === 'Active').length;
      if (branch.headcount !== actualCount) {
        await prisma.branch.update({
          where: { id: branch.id },
          data: { headcount: actualCount }
        });
        updatedBranches++;
      }
    }
    console.log(`Updated headcount for ${updatedBranches} branches.`);

    console.log('Database Audit & Cleanup Completed Successfully!');

  } catch (error) {
    console.error('Error during database audit:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();
