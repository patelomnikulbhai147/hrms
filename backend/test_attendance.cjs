const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const data = await prisma.attendance.findMany();
    console.log('Attendance:', data.length);
  } catch (err) {
    console.error('Error fetching attendance:', err);
  }
  await prisma.$disconnect();
}
run();
