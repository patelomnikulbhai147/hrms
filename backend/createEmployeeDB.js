const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const existing = await prisma.employee.findUnique({ where: { employeeId: 'EMP-AUTO-002' }});
    if (!existing) {
       await prisma.employee.create({
         data: {
            employeeId: 'EMP-AUTO-002',
            firstName: 'Test',
            lastName: 'Automation',
            name: 'Test Automation',
            email: 'test.auto2@example.com',
            phone: '9876543210',
            designation: 'Automation Engineer',
            department: 'Quality Assurance',
            status: 'Active',
            employmentType: 'Full-time',
            joinDate: new Date(),
            salary: 1200000,
            companyId: 'c-gcri',
            branchId: 'c-rajkot'
         }
       });
       console.log('Employee created successfully in database.');
    } else {
       console.log('Employee already exists.');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}
run();
