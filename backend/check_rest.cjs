const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRest() {
  const leaves = await prisma.leaveRequest.count();
  const docs = await prisma.document.count();
  const notifs = await prisma.notification.count();
  const payments = await prisma.paymentRecord.count();
  const subs = await prisma.subscriptionPlan.count();
  
  console.log(`Leaves: ${leaves}`);
  console.log(`Docs: ${docs}`);
  console.log(`Notifs: ${notifs}`);
  console.log(`Payments: ${payments}`);
  console.log(`Subs: ${subs}`);

  const users = await prisma.user.findMany();
  console.log('Users:');
  users.forEach(u => console.log(u.email, u.role, u.companyId));
  
  await prisma.$disconnect();
}

checkRest().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
