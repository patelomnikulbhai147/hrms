/**
 * Additive migration — Recruitment ATS v2 + candidate slot scheduling columns.
 *
 * Adds:
 *  - `Application.parsedResume` / `Application.analysisHash` — cached structured
 *    resume parse + input fingerprint so an unchanged resume is never re-extracted.
 *  - `RecruitmentInterview` per-invitation availability window, interview mode /
 *    meeting link, booked slot end time, scheduling source and booking audit.
 *
 * ADDITIVE AND IDEMPOTENT: each column is added only when absent, so re-running
 * is safe.
 *
 * Run on every environment BEFORE deploying this feature:
 *   node scripts/addRecruitmentAtsSchedulingFields.js
 *
 * DO NOT use `prisma db push` to apply these. Pushing the repo schema at an
 * existing database drops columns it doesn't know about — a known landmine on
 * this project's live RDS. Always ALTER.
 */
const prisma = require('../src/config/prisma');

// table → { column name → DDL type }. Every column is NULLable (or defaulted)
// so existing rows are valid without a backfill.
const TABLES = {
  Application: {
    parsedResume: 'JSON NULL',
    analysisHash: 'VARCHAR(64) NULL',
  },
  RecruitmentInterview: {
    interviewMode: 'VARCHAR(32) NULL',            // Online | Offline | Phone
    meetingLink: 'TEXT NULL',
    availableFrom: 'VARCHAR(20) NULL',            // per-invite window start date (YYYY-MM-DD)
    availableTo: 'VARCHAR(20) NULL',              // per-invite window end date
    workingDays: 'JSON NULL',                     // ["Monday", ...] for this invite
    dayStartTime: 'VARCHAR(10) NULL',             // e.g. "10:00"
    dayEndTime: 'VARCHAR(10) NULL',               // e.g. "17:00"
    bufferMinutes: 'INT NOT NULL DEFAULT 0',
    scheduledEndTime: 'VARCHAR(10) NULL',         // booked slot end, e.g. "11:30"
    schedulingSource: 'VARCHAR(16) NULL',         // HR | CANDIDATE
    bookedAt: 'DATETIME(3) NULL',
    tokenIssuedAt: 'DATETIME(3) NULL',            // invite (re)issue time; expiry anchor
  },
};

async function main() {
  for (const [table, columns] of Object.entries(TABLES)) {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`
    );
    const have = new Set(existing.map(r => r.c));

    const missing = Object.entries(columns).filter(([name]) => !have.has(name));
    if (missing.length === 0) {
      console.log(`[recruitment-ats] ${table}: all columns already present — nothing to do.`);
      continue;
    }

    for (const [name, type] of missing) {
      console.log(`[recruitment-ats] ${table}: adding column ${name} ${type} ...`);
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${type}`);
    }
    console.log(`[recruitment-ats] ${table}: added ${missing.length} column(s).`);
  }
  console.log('[recruitment-ats] migration complete.');
}

main()
  .catch(e => { console.error('[recruitment-ats] migration failed:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
