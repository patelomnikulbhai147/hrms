/**
 * PRODUCTION DIAGNOSTIC — read-only. Run on the backend EC2:
 *     node scripts/diagnoseProd.js
 *
 * Confirms which database is in use, row counts, and (critically) whether the
 * live employee/company/document queries actually succeed — pinpointing the
 * "0 employees on live but data exists" incident. Makes ZERO writes.
 */
const prisma = require('../src/config/prisma');

(async () => {
  const line = (s) => console.log(s);
  line('\n================ WHICH DATABASE ================');
  try {
    const url = process.env.DATABASE_URL || '(unset)';
    line('DATABASE_URL host/db: ' + url.replace(/:\/\/[^@]*@/, '://***@'));
    const [{ db }] = await prisma.$queryRawUnsafe('SELECT DATABASE() AS db');
    line('Connected database  : ' + db);
  } catch (e) { line('DB connect error: ' + e.message); }

  line('\n================ ROW COUNTS ================');
  for (const m of ['company', 'branch', 'employee', 'attendance', 'payroll', 'leaveRequest', 'document', 'user', 'auditLog']) {
    try { line(m.padEnd(14) + ' ' + await prisma[m].count()); }
    catch (e) { line(m.padEnd(14) + ' COUNT FAILED: ' + e.message.split('\n')[0]); }
  }

  line('\n================ DOES THE LIVE QUERY SUCCEED? ================');
  // These mirror what the API does. A failure here is the exact reason the UI
  // shows empty — the error message names the missing column.
  const probe = async (label, fn) => {
    try { const r = await fn(); line('✓ ' + label + ' OK (' + (Array.isArray(r) ? r.length : 1) + ' row[s] read)'); }
    catch (e) { line('✗ ' + label + ' FAILED → ' + e.message.split('\n').slice(0, 3).join(' | ')); }
  };
  await probe('employee.findMany', () => prisma.employee.findMany({ take: 1 }));
  await probe('company.findMany', () => prisma.company.findMany({ take: 1 }));
  await probe('document.findMany', () => prisma.document.findMany({ take: 1 }));
  await probe('payroll.findMany', () => prisma.payroll.findMany({ take: 1 }));

  line('\n================ EMPLOYEE COLUMNS PRESENT ON THIS DB ================');
  try {
    const cols = await prisma.$queryRawUnsafe(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME)='employee'"
    );
    const have = new Set(cols.map((c) => String(c.COLUMN_NAME).toLowerCase()));
    const need = ['biometricid', 'legacyemployeeid', 'bonusapplicable', 'bonustype', 'bonuscalcmethod', 'bonusvalue', 'bonuseffectivedate', 'bonusenddate', 'bonusnotes', 'state', 'city', 'signatureupload', 'photoupload'];
    const missing = need.filter((c) => !have.has(c));
    line('Expected-but-MISSING columns: ' + (missing.length ? missing.join(', ') : '(none — schema is in sync)'));
    if (missing.length) line('\n>>> ROOT CAUSE: run  node scripts/migrateAll.js  then  npx prisma generate  &&  pm2 reload hrms-backend');
  } catch (e) { line('column check error: ' + e.message); }

  await prisma.$disconnect();
  process.exit(0);
})();
