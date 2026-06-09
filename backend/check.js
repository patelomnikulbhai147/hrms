const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const atts = await prisma.attendance.findMany();
  console.log(atts.map(a => `${a.employeeName} - ${a.branch}`));
}
check();
