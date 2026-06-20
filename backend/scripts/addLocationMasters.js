/**
 * Additive & idempotent — create the location_masters table (custom states /
 * cities saved for reuse by the creatable dropdowns). NON-destructive; avoids
 * `prisma db push`. Run locally and on prod, then `prisma generate` + restart.
 *   node scripts/addLocationMasters.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`location_masters\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`type\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`location_masters_type_name_key\`(\`type\`, \`name\`),
        INDEX \`location_masters_type_idx\`(\`type\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('= location_masters ready');
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
