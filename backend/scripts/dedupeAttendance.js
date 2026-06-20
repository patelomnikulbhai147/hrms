// One-time cleanup: collapse duplicate attendance rows so there is exactly ONE
// row per (employeeId, date) — the single source of truth. For each duplicate
// group we KEEP the most recently updated row (the user's latest edit) and delete
// the older redundant rows.
const prisma = require('../src/config/prisma');

(async () => {
  try {
    const before = await prisma.attendance.count();
    const all = await prisma.attendance.findMany({ select: { id: true, employeeId: true, date: true, updatedAt: true } });

    const byKey = new Map();
    for (const r of all) {
      const k = `${r.employeeId}|${r.date}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }

    const toDelete = [];
    let dupGroups = 0;
    for (const rows of byKey.values()) {
      if (rows.length <= 1) continue;
      dupGroups++;
      // Keep the most recently updated; tiebreak on highest id.
      rows.sort((a, b) => (new Date(b.updatedAt) - new Date(a.updatedAt)) || (b.id - a.id));
      for (const r of rows.slice(1)) toDelete.push(r.id);
    }

    console.log(`Total rows: ${before}`);
    console.log(`Duplicate groups: ${dupGroups}`);
    console.log(`Redundant rows to delete: ${toDelete.length}`);

    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 500) {
      const chunk = toDelete.slice(i, i + 500);
      const res = await prisma.attendance.deleteMany({ where: { id: { in: chunk } } });
      deleted += res.count;
    }

    const after = await prisma.attendance.count();
    console.log(`Deleted: ${deleted}`);
    console.log(`Rows now: ${after}  (${before} - ${deleted} = ${before - deleted})`);
  } catch (e) {
    console.error('DEDUPE FAILED:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
