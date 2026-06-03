const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
prisma.attendance.findMany()
  .then(r => console.log('Attendance:', r.length))
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => prisma.$disconnect());
