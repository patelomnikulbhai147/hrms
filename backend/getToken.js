const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { role: 'Company Head' } });
  if (!user) { console.log('No Company Head found'); return; }
  const secret = process.env.JWT_SECRET || 'enterprise_hrms_super_secret_key_2026';
  const token = jwt.sign({ id: user.id }, secret, { expiresIn: '12h' });
  console.log('TOKEN=' + token);
  console.log('USER_ID=' + user.id);
  console.log('EMAIL=' + user.email);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
