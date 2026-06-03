const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const p = await prisma.payroll.findMany();
  const a = await prisma.attendance.findMany();
  
  const pCounts = {}; p.forEach(x => pCounts[x.companyId] = (pCounts[x.companyId]||0)+1);
  const aCounts = {}; a.forEach(x => aCounts[x.companyId] = (aCounts[x.companyId]||0)+1);
  
  console.log('Payroll companyIds:', pCounts);
  console.log('Attendance companyIds:', aCounts);
}
main().finally(() => prisma.$disconnect());
