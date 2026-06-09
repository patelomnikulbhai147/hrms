const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  try {
    const res = await prisma.$queryRaw`SELECT * FROM "AttendanceDashboard" LIMIT 1`;
    console.log(res);
  } catch (e) { console.error(e.message); }
}
run();
