/**
 * Pre-Phase 5 safety tables — additive & idempotent. NON-destructive.
 * Creates attendance_import_logs and unmatched_attendance_queue (if missing).
 * Avoids `prisma db push` (which would also apply unrelated destructive drops).
 *   node scripts/addAttendanceImportSafety.js
 */
const prisma = require('../src/config/prisma');

(async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`attendance_import_logs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`companyId\` INT NOT NULL,
        \`deviceId\` INT NULL,
        \`biometricCode\` VARCHAR(191) NULL,
        \`employeeId\` INT NULL,
        \`employeeCode\` VARCHAR(191) NULL,
        \`employeeName\` VARCHAR(191) NULL,
        \`punchTime\` VARCHAR(191) NULL,
        \`status\` VARCHAR(191) NOT NULL,
        \`message\` TEXT NULL,
        \`importDate\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`attendance_import_logs_companyId_idx\`(\`companyId\`),
        INDEX \`attendance_import_logs_status_idx\`(\`status\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('= attendance_import_logs ready');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`unmatched_attendance_queue\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`companyId\` INT NOT NULL,
        \`deviceId\` INT NULL,
        \`biometricCode\` VARCHAR(191) NULL,
        \`punchTime\` VARCHAR(191) NULL,
        \`reason\` VARCHAR(191) NOT NULL,
        \`message\` TEXT NULL,
        \`rawPayload\` TEXT NULL,
        \`resolved\` TINYINT(1) NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`unmatched_attendance_queue_companyId_idx\`(\`companyId\`),
        INDEX \`unmatched_attendance_queue_resolved_idx\`(\`resolved\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('= unmatched_attendance_queue ready');
    console.log('Done.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
