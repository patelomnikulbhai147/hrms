const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const comp = await prisma.company.findFirst();
  
  const req = {
    body: {
      name: 'Payroll Test Employee API',
      email: 'payroll.test.api@example.com',
      employeeId: 'PAY-TEST-002',
      department: 'Testing',
      designation: 'Tester',
      salary: 120000,
      joinDate: new Date(),
      status: 'Active',
      companyId: comp.id
    }
  };

  const res = {
    status: (s) => ({ json: (d) => console.log('Created emp:', d.id) }),
    json: (d) => console.log('Created emp json:', d.id)
  };

  const employeeController = require('./src/controllers/employeeController');
  await employeeController.createEmployee(req, res);

  const emp = await prisma.employee.findUnique({ where: { employeeId: 'PAY-TEST-002' } });

  // Check if payroll was created automatically
  const payroll = await prisma.payroll.findFirst({
    where: { employeeId: emp.id }
  });

  if (payroll) {
    console.log('Success! Payroll automatically created via createEmployee:', payroll.id, payroll.netSalary);
  } else {
    console.log('Failed! No payroll record found for the new employee.');
  }

  // Test the bulk create
  const reqBulk = {
    body: {
      employees: [
        {
          name: 'Payroll Test Bulk',
          email: 'payroll.test.bulk@example.com',
          employeeId: 'PAY-TEST-003',
          department: 'Testing',
          designation: 'Tester',
          salary: 80000,
          joinDate: new Date(),
          status: 'Active',
          companyId: comp.id
        }
      ]
    }
  };
  
  await employeeController.bulkCreate(reqBulk, { status: () => ({ json: () => {} }) });

  // Wait a little bit for the background process (setImmediate)
  await new Promise(r => setTimeout(r, 1000));
  
  const empBulk = await prisma.employee.findUnique({ where: { employeeId: 'PAY-TEST-003' } });
  const payrollBulk = await prisma.payroll.findFirst({ where: { employeeId: empBulk.id } });

  if (payrollBulk) {
    console.log('Success! Payroll automatically created via bulkCreate:', payrollBulk.id);
  } else {
    console.log('Failed! No payroll record found for the bulk employee.');
  }

  // Cleanup
  await prisma.payroll.deleteMany({ where: { employeeId: { in: [emp.id, empBulk.id] } } });
  await prisma.employee.deleteMany({ where: { employeeId: { in: ['PAY-TEST-002', 'PAY-TEST-003'] } } });

}

main().finally(() => prisma.$disconnect());
