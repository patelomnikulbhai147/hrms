const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const emp = await prisma.employee.create({
    data: {
      id: 'emp-gcri-test001',
      employeeId: 'TEST001',
      companyId: 'c-gcri',
      name: 'John Doe Test',
      email: 'john.test@gcri.in',
      phone: '9999988888',
      department: 'Clinical',
      designation: 'Tester',
      role: 'Staff',
      status: 'Active',
      joinDate: new Date(),
      aadhaarName: 'John Doe Test',
      bankName: 'TEST BANK',
      accountNumber: '1234567890',
      ifsc: 'TEST0123456',
      presentAddress: '123 Test Street, Test City',
      permanentAddress: '123 Test Street, Test City',
      aadhaar: '123456789012',
      pan: 'ABCDE1234F',
      esiNumber: '9876543210'
    }
  });
  console.log('Successfully created employee with bank details:', emp.bankName, emp.accountNumber);
}

test().finally(() => prisma.$disconnect());
