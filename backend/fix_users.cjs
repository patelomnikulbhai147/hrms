const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function run() {
  console.log('Fetching users to check password hashes...');
  const users = await prisma.user.findMany();
  let fixCount = 0;

  for(let u of users) {
    if (!u.passwordHash || u.passwordHash.length < 50) {
      console.log(`Fixing invalid password hash for user: ${u.username}`);
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('welcome123', salt);
      await prisma.user.update({
        where: { id: u.id },
        data: { passwordHash, password: 'REDACTED' }
      });
      fixCount++;
    }
  }

  console.log(`Successfully fixed ${fixCount} user passwords.`);
  await prisma.$disconnect();
}

run();
