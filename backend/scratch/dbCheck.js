require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    console.log('DATABASE_URL =', process.env.DATABASE_URL);
    const [company, branch, employee, attendance, payroll, leave, doc] = await Promise.all([
      prisma.company.count(),
      prisma.branch.count(),
      prisma.employee.count(),
      prisma.attendance.count(),
      prisma.payroll.count(),
      prisma.leaveRequest.count(),
      prisma.document.count(),
    ]);
    console.log('COUNTS:', { company, branch, employee, attendance, payroll, leave, doc });
    const companies = await prisma.company.findMany({ select: { id: true, name: true, parentCompanyId: true, isHeadOffice: true, isArchived: true } });
    console.log('COMPANIES:', JSON.stringify(companies, null, 2));
    const branches = await prisma.branch.findMany({ select: { id: true, companyId: true, branchName: true, branchCode: true, headcount: true } });
    console.log('BRANCHES:', JSON.stringify(branches, null, 2));
    const empByBranch = await prisma.employee.groupBy({ by: ['branchId'], _count: true });
    console.log('EMP BY BRANCH:', JSON.stringify(empByBranch, null, 2));
  } catch (e) {
    console.error('DB ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
