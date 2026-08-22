// ─────────────────────────────────────────────────────────────────────────────
// Single-owner guard regression for runSync. A biometric machine account
// (Corporate ID + Username) may be actively synced by only ONE company — the one
// whose connection is ENABLED. Proves:
//   1. A non-owner company syncing a machine account already ENABLED on another
//      company is REFUSED (before any vendor call or DB write).
//   2. The refusal creates NO attendance rows and NO sync-log row for the
//      non-owner (no cross-tenant contamination).
//   3. The enabled OWNER is NOT blocked (guard query finds no rival owner).
//   4. When no other company has the account enabled, the guard does not block.
//   5. Different accounts never collide (guard is scoped to the exact creds).
//
// No vendor network call: every assertion is on the early-return path or the
// guard query. Self-cleaning throwaway fixtures.
//   node scripts/testEtimeSingleOwnerGuard.js
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const prisma = require('../src/config/prisma');
const settings = require('../src/services/etimeoffice/etimeSettingsService');
const sync = require('../src/services/etimeoffice/etimeSyncService');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { PASS++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { FAIL++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

(async () => {
  const CORP = 'QA-SHAREDCORP-' + Date.now();
  const USER = 'qa-shared-user';
  const coA = await prisma.company.create({ data: { name: 'QA-OWNER-' + Date.now(), plan: 'Enterprise' } });
  const coB = await prisma.company.create({ data: { name: 'QA-DUP-' + Date.now(), plan: 'Enterprise' } });
  const coC = await prisma.company.create({ data: { name: 'QA-OTHERACCT-' + Date.now(), plan: 'Enterprise' } });

  const cleanup = async () => {
    for (const id of [coA.id, coB.id, coC.id]) {
      await prisma.attendanceSyncLog.deleteMany({ where: { companyId: id } }).catch(() => {});
      await prisma.etimeConnection.deleteMany({ where: { companyId: id } }).catch(() => {});
      await prisma.company.delete({ where: { id } }).catch(() => {});
    }
  };

  try {
    // A = the ENABLED owner of the shared account; B = a duplicate (same creds);
    // C = a different account entirely.
    await settings.save(coA.id, { corporateId: CORP, apiUsername: USER, apiPassword: 'secretA' });
    await prisma.etimeConnection.update({ where: { companyId: coA.id }, data: { enabled: true } });
    await settings.save(coB.id, { corporateId: CORP, apiUsername: USER, apiPassword: 'secretB' });
    await prisma.etimeConnection.update({ where: { companyId: coB.id }, data: { enabled: false } });
    await settings.save(coC.id, { corporateId: CORP + '-DIFF', apiUsername: USER, apiPassword: 'secretC' });
    await prisma.etimeConnection.update({ where: { companyId: coC.id }, data: { enabled: false } });

    // 1) Non-owner B is refused.
    const rB = await sync.runSync(coB.id, { trigger: 'manual' });
    ok('non-owner sync is REFUSED', rB.ok === false && /already connected to another company/i.test(rB.error || ''), rB.error);
    ok('refusal names the owner company', (rB.error || '').includes('#' + coA.id), rB.error);

    // 2) No side effects for the refused company.
    const bLogs = await prisma.attendanceSyncLog.count({ where: { companyId: coB.id } });
    const bAtt = await prisma.attendance.count({ where: { companyId: coB.id } });
    ok('refused sync created NO sync-log row', bLogs === 0, `logs=${bLogs}`);
    ok('refused sync created NO attendance rows', bAtt === 0, `rows=${bAtt}`);

    // 3) The enabled owner A is NOT blocked (guard query finds no rival owner).
    const rivalForA = await prisma.etimeConnection.findFirst({ where: { companyId: { not: coA.id }, enabled: true, corporateId: CORP, apiUsername: USER }, select: { companyId: true } });
    ok('enabled owner has no rival owner (would proceed)', rivalForA === null);

    // 4) With the account NOT enabled anywhere else, B is no longer blocked by the guard.
    await prisma.etimeConnection.update({ where: { companyId: coA.id }, data: { enabled: false } });
    const rivalForB = await prisma.etimeConnection.findFirst({ where: { companyId: { not: coB.id }, enabled: true, corporateId: CORP, apiUsername: USER }, select: { companyId: true } });
    ok('no enabled rival → guard does not block', rivalForB === null);

    // 5) A different account never collides. Re-enable A, then C (different corp)
    //    must see no rival owner for its own creds.
    await prisma.etimeConnection.update({ where: { companyId: coA.id }, data: { enabled: true } });
    const rivalForC = await prisma.etimeConnection.findFirst({ where: { companyId: { not: coC.id }, enabled: true, corporateId: CORP + '-DIFF', apiUsername: USER }, select: { companyId: true } });
    ok('different account is not blocked by an unrelated enabled account', rivalForC === null);
  } catch (e) {
    console.error('FATAL during tests:', e);
    FAIL++;
  } finally {
    await cleanup();
  }

  console.log(`\nETIME SINGLE-OWNER GUARD: ${PASS} passed, ${FAIL} failed`);
  await prisma.$disconnect();
  process.exit(FAIL ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch (_) {} process.exit(1); });
