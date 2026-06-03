const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const b = await prisma.branch.findUnique({ where: { id: 'c-ahmedabad' } });
  console.log(b);
}
main().finally(() => prisma.$disconnect());
