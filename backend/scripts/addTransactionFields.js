const prisma = require('../src/config/prisma');

async function migrate() {
  try {
    console.log('Adding transactionType to invoices...');
    await prisma.$executeRawUnsafe(`ALTER TABLE invoices ADD COLUMN transactionType VARCHAR(191) NOT NULL DEFAULT 'Collect Payment';`);
    console.log('Success: transactionType added.');
  } catch (e) {
    if (e.message.includes('Duplicate column name')) {
      console.log('Column transactionType already exists.');
    } else {
      console.error('Error adding transactionType:', e.message);
    }
  }

  try {
    console.log('Adding partyType to invoice_customers...');
    await prisma.$executeRawUnsafe(`ALTER TABLE invoice_customers ADD COLUMN partyType VARCHAR(191) NOT NULL DEFAULT 'Customer';`);
    console.log('Success: partyType added.');
  } catch (e) {
    if (e.message.includes('Duplicate column name')) {
      console.log('Column partyType already exists.');
    } else {
      console.error('Error adding partyType:', e.message);
    }
  }

  console.log('Migration complete. Run `npx prisma generate` next.');
}

migrate().finally(() => prisma.$disconnect());
