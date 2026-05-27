const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function runMigration() {
  console.log('--- Starting User Migration ---');
  
  const dataPath = path.join(__dirname, 'data', 'users.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error(`ERROR: Data file not found at ${dataPath}`);
    console.log('Please export your localStorage "hrms_accounts" array and save it to backend/scripts/data/users.json');
    process.exit(1);
  }

  const usersRaw = fs.readFileSync(dataPath, 'utf-8');
  let users;
  try {
    users = JSON.parse(usersRaw);
  } catch (err) {
    console.error('ERROR: Invalid JSON in users.json');
    process.exit(1);
  }

  console.log(`Found ${users.length} users to migrate.`);

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      // Check if user exists
      const exists = await prisma.user.findUnique({
        where: { username: user.username }
      });

      if (exists) {
        console.log(`Skipping ${user.username} - already exists.`);
        continue;
      }

      // Hash password securely (the frontend used plain text 'passwordStr')
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(user.passwordStr || 'defaultPassword123', salt);

      // Insert into PostgreSQL
      await prisma.user.create({
        data: {
          id: user.id, // preserve existing ID
          name: user.name,
          email: user.email || `${user.username}@company.com`,
          username: user.username,
          passwordHash: passwordHash,
          role: user.role,
          companyId: user.companyId || 'UNKNOWN',
          accessibleCompanyIds: user.accessibleCompanyIds || [],
          status: user.status || 'Active',
          avatar: user.avatar || ''
        }
      });

      console.log(`Successfully migrated user: ${user.username}`);
      successCount++;
    } catch (err) {
      console.error(`Failed to migrate user: ${user.username}. Reason:`, err.message);
      failCount++;
    }
  }

  console.log('--- Migration Complete ---');
  console.log(`Successfully imported: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  
  await prisma.$disconnect();
}

runMigration();
