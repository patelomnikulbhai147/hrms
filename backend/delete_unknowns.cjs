const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteUnknowns() {
  try {
    const targetIds = ['emp-gcri-VE1742', 'emp-gcri-VE1660'];

    const delPay = await prisma.payroll.deleteMany({
      where: { employeeId: { in: targetIds } }
    });
    console.log(`Deleted ${delPay.count} related payroll records.`);

    const delAtt = await prisma.attendance.deleteMany({
      where: { employeeId: { in: targetIds } }
    });
    console.log(`Deleted ${delAtt.count} related attendance records.`);

    const delLeave = await prisma.leaveRequest.deleteMany({
      where: { employeeId: { in: targetIds } }
    });
    console.log(`Deleted ${delLeave.count} related leave records.`);

    const deleted = await prisma.employee.deleteMany({
      where: { id: { in: targetIds } }
    });
    console.log(`Deleted ${deleted.count} unknown employee records.`);
  } catch (error) {
    console.error('Error deleting records:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteUnknowns();
