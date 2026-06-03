const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkNameDuplicates() {
  const employees = await prisma.employee.findMany();
  const nameMap = new Map();
  const dupes = [];

  for (const emp of employees) {
    if (!emp.name) continue;
    const name = emp.name.toLowerCase().trim();
    if (nameMap.has(name)) {
      nameMap.get(name).push(emp);
    } else {
      nameMap.set(name, [emp]);
    }
  }

  for (const [name, emps] of nameMap.entries()) {
    if (emps.length > 1) {
      dupes.push({
        name,
        count: emps.length,
        ids: emps.map(e => e.id),
        emails: emps.map(e => e.email)
      });
    }
  }

  console.log(`Found ${dupes.length} distinct names with duplicates.`);
  if (dupes.length > 0) {
    console.log(JSON.stringify(dupes.slice(0, 5), null, 2));
  }

  await prisma.$disconnect();
}

checkNameDuplicates().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
