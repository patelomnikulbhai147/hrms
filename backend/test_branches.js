const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const branches = await prisma.branch.findMany({ include: { company: true } });
  console.log(JSON.stringify(branches, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
