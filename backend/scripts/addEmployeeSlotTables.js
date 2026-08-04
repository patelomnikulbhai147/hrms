/**
 * Employee Slot Management — additive & idempotent schema upgrade.
 *
 *   CompanySubscription.extraEmployeeSlots       — purchased add-on slots
 *   employee_slot_packs                          — SA-configurable "+N for ₹X" packs (seeded)
 *   employee_slot_transactions                   — append-only slot change history
 *   verification_recharge_invoices.purpose       — invoice table now serves all
 *                                                  self-service purchases
 *
 * NON-destructive: ADD COLUMN guarded by information_schema checks, CREATE
 * TABLE IF NOT EXISTS. Deliberately NOT `prisma db push` (EC2 landmine).
 *
 *   node scripts/addEmployeeSlotTables.js
 */
const prisma = require('../src/config/prisma');

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table, column
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`  · ${table}.${column} already present`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  + ${table}.${column}`);
}

async function main() {
  console.log('Employee Slot Management — additive schema upgrade');

  await addColumn('CompanySubscription', 'extraEmployeeSlots', 'INT NOT NULL DEFAULT 0');
  await addColumn('verification_recharge_invoices', 'purpose', "VARCHAR(191) NOT NULL DEFAULT 'VERIFICATION_CREDIT_RECHARGE'");

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS \`employee_slot_packs\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`name\` VARCHAR(191) NOT NULL,
    \`slots\` INT NOT NULL,
    \`price\` DOUBLE NOT NULL,
    \`isActive\` BOOLEAN NOT NULL DEFAULT true,
    \`sortOrder\` INT NOT NULL DEFAULT 0,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log('  ✓ employee_slot_packs');

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS \`employee_slot_transactions\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`companyId\` INT NOT NULL,
    \`type\` VARCHAR(191) NOT NULL,
    \`status\` VARCHAR(191) NOT NULL DEFAULT 'COMPLETED',
    \`packId\` INT NULL,
    \`packName\` VARCHAR(191) NULL,
    \`slots\` INT NOT NULL,
    \`amount\` DOUBLE NULL,
    \`orderId\` VARCHAR(191) NULL,
    \`oldLimit\` INT NULL,
    \`newLimit\` INT NULL,
    \`requestedBy\` VARCHAR(191) NULL,
    \`actionedBy\` VARCHAR(191) NULL,
    \`reason\` TEXT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    UNIQUE INDEX \`employee_slot_transactions_orderId_key\` (\`orderId\`),
    INDEX \`employee_slot_transactions_companyId_idx\` (\`companyId\`),
    INDEX \`employee_slot_transactions_status_idx\` (\`status\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log('  ✓ employee_slot_transactions');

  // Seed the four requested packs once (never resurrect Super Admin deletions).
  // Default pricing ₹50/slot: +5 lands under the ₹500 online minimum → routed
  // to contact-sales, exactly the scenario the business rule describes.
  const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`employee_slot_packs\``);
  if (Number(count?.[0]?.c || 0) === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`employee_slot_packs\` (\`name\`, \`slots\`, \`price\`, \`sortOrder\`) VALUES
        ('+5 Employees', 5, 250, 1),
        ('+10 Employees', 10, 500, 2),
        ('+15 Employees', 15, 750, 3),
        ('+20 Employees', 20, 1000, 4)`
    );
    console.log('  + seeded packs (+5 ₹250 · +10 ₹500 · +15 ₹750 · +20 ₹1000)');
  } else {
    console.log('  · packs already present');
  }

  console.log('Done.');
}

main()
  .catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
