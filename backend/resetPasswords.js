const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = [
    { username: 'superadmin', pwd: 'default123' },
    { username: 'om', pwd: 'default123' },
    { username: 'parth', pwd: 'parth123' },
    { username: 'jay', pwd: 'jay1234' },
    { username: 'nirav', pwd: 'welcome123' },
    { username: 'siddhpur-admin', pwd: 'siddhpur123' },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.pwd, 10);
    try {
      await prisma.user.update({
        where: { username: u.username },
        data: {
          password: u.pwd,
          passwordHash: hash
        }
      });
      console.log(`Updated ${u.username} to ${u.pwd}`);
    } catch (e) {
      console.log(`Could not update ${u.username}: ${e.message}`);
    }
  }
}
main().finally(() => prisma.$disconnect());
