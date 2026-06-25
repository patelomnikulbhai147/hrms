/**
 * Additive & idempotent — create the MobileOtpSession table used by the v1 mobile
 * OTP authentication module. NON-destructive; never touches the existing web
 * auth (User / PasswordResetToken / LoginAudit) tables.
 *   node scripts/createMobileAuthTables.js
 */
const prisma = require('../src/config/prisma');

const DDL = `
CREATE TABLE IF NOT EXISTS \`MobileOtpSession\` (
  \`id\`         INT          NOT NULL AUTO_INCREMENT,
  \`sessionId\`  VARCHAR(191) NOT NULL,
  \`identifier\` VARCHAR(191) NOT NULL,
  \`channel\`    VARCHAR(191) NOT NULL DEFAULT 'mobile',
  \`userId\`     INT          NOT NULL,
  \`otpHash\`    VARCHAR(191) NULL,
  \`expiresAt\`  DATETIME(3)  NOT NULL,
  \`consumed\`   TINYINT(1)   NOT NULL DEFAULT 0,
  \`attempts\`   INT          NOT NULL DEFAULT 0,
  \`createdAt\`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`MobileOtpSession_sessionId_key\` (\`sessionId\`),
  KEY \`MobileOtpSession_userId_idx\` (\`userId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

(async () => {
  try {
    await prisma.$executeRawUnsafe(DDL);
    console.log('+ ensured MobileOtpSession table');
    console.log('Done.');
  } catch (e) {
    console.error('Migration failed:', e.message); process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
})();
