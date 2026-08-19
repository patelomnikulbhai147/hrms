// One-off, idempotent cleanup of orphaned QA notification rows.
//
// The tenant-isolation test harnesses exercise the real leave create/approve
// flow, which fires bell notifications through services/notificationService.js as
// a SIDE EFFECT (type 'leave_request' / 'leave_approved', companyId = the throwaway
// QA company). Older harness runs deleted the QA company + employee + leave but not
// these notification rows, leaving notifications whose companyId no longer exists.
//
// This removes ONLY leave_request/leave_approved notifications whose companyId is
// no longer a real Company. It deliberately does NOT touch:
//   • 'demo' sample-workspace notifications (an onboarding feature),
//   • 'task_assigned' or any other type,
//   • any notification whose companyId still resolves to a live company.
// Safe to re-run; prints exactly what it removes.
//   node scripts/cleanupOrphanQaNotifications.js         (dry run)
//   node scripts/cleanupOrphanQaNotifications.js --apply (delete)
const prisma = require('../src/config/prisma');

(async () => {
  const apply = process.argv.includes('--apply');
  const liveCompanyIds = new Set((await prisma.company.findMany({ select: { id: true } })).map((c) => c.id));
  const candidates = await prisma.notification.findMany({
    where: { type: { in: ['leave_request', 'leave_approved'] } },
    select: { id: true, companyId: true, type: true, message: true },
  });
  const orphans = candidates.filter((n) => n.companyId != null && !liveCompanyIds.has(n.companyId));

  console.log(`leave notifications scanned: ${candidates.length}`);
  console.log(`orphaned (companyId no longer exists): ${orphans.length}`);
  for (const o of orphans) console.log(`  #${o.id} co=${o.companyId} ${o.type} :: ${o.message}`);

  if (!orphans.length) { console.log('nothing to clean.'); await prisma.$disconnect(); return; }
  if (!apply) { console.log('\nDRY RUN — re-run with --apply to delete.'); await prisma.$disconnect(); return; }

  const res = await prisma.notification.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  console.log(`\ndeleted ${res.count} orphaned notification row(s).`);
  console.log(`notifications remaining: ${await prisma.notification.count()}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FATAL:', e); await prisma.$disconnect(); process.exit(1); });
