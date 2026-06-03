const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
  const employees = await prisma.employee.findMany();
  const emailMap = new Map();
  const dupes = [];

  for (const emp of employees) {
    if (!emp.email) continue;
    const email = emp.email.toLowerCase().trim();
    if (emailMap.has(email)) {
      emailMap.get(email).push(emp);
    } else {
      emailMap.set(email, [emp]);
    }
  }

  for (const [email, emps] of emailMap.entries()) {
    if (emps.length > 1) {
      dupes.push({
        email,
        count: emps.length,
        ids: emps.map(e => e.id),
        names: emps.map(e => e.name),
        statuses: emps.map(e => e.status),
        createdAts: emps.map(e => e.createdAt)
      });
    }
  }

  console.log(`Found ${dupes.length} distinct emails with duplicates.`);
  if (dupes.length > 0) {
    console.log(JSON.stringify(dupes.slice(0, 3), null, 2));
  }

  await prisma.$disconnect();
}

checkDuplicates().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
