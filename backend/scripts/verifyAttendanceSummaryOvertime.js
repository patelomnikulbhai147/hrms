/**
 * Verify the Attendance Summary counts APPROVED overtime, and only approved.
 *
 * Exercises the REAL frontend summarizer (frontend/src/utils/attendancePeriods.ts)
 * against REAL rows from the database, so it catches the two defects that made the
 * summary read 0.0:
 *
 *   1. employee ids compared with === across a number/string boundary
 *      (Prisma returns Int, Employee.id is typed string) — nothing ever matched;
 *   2. no status filter — once ids DID match via employeeCode, Pending and
 *      Rejected hours were counted as if they had been approved.
 *
 * The summarizer is TypeScript, so it is bundled with esbuild on the fly.
 * Read-only: creates and deletes nothing.
 *
 * Usage: node scripts/verifyAttendanceSummaryOvertime.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const prisma = require('../src/config/prisma');

const REPO = path.resolve(__dirname, '..', '..');
const SRC = path.join(REPO, 'frontend', 'src', 'utils', 'attendancePeriods.ts');
// esbuild's JS API, not bin/esbuild — that shim is not directly executable on
// Windows (the real binary lives in @esbuild/<platform>).
//
// It comes from the ROOT node_modules, which a backend-only host (the API EC2
// box) deliberately does not install. There the suite SKIPS rather than crashes:
// a missing build tool is not a failing assertion, and reporting it as one would
// be a false alarm on every deploy.
let esbuild = null;
try {
  esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
} catch {
  console.log('SKIPPED — esbuild not installed here (root node_modules absent).');
  console.log('This suite bundles the frontend summarizer, so it runs where the');
  console.log('frontend deps exist: a dev machine or the frontend host.');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad = (n) => String(n).padStart(2, '0');
const datesInMonth = (y, m) => {
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
};

(async () => {
  // ── Bundle the real summarizer ────────────────────────────────────────────
  const out = path.join(os.tmpdir(), `attper-${process.pid}.cjs`);
  esbuild.buildSync({
    entryPoints: [SRC], bundle: true, format: 'cjs', platform: 'node',
    alias: { '@': path.join(REPO, 'frontend', 'src') },
    logLevel: 'error', outfile: out,
  });
  const { summarizeEmployeePeriod } = require(out);
  console.log('bundled the live frontend summarizer\n');

  try {
    // ── Pick a real employee/month with BOTH approved and non-approved OT ────
    const all = await prisma.overtime.findMany({
      select: { employeeId: true, employeeName: true, employeeCode: true, date: true, otHours: true, status: true },
    });
    const buckets = new Map();
    for (const o of all) {
      const key = `${o.employeeId}|${String(o.date).slice(0, 7)}`;
      const b = buckets.get(key) || { approved: 0, other: 0, name: o.employeeName, code: o.employeeCode };
      const h = Number(o.otHours || 0);
      if (/^approved$/i.test(String(o.status || ''))) b.approved += h; else b.other += h;
      buckets.set(key, b);
    }
    const mixed = [...buckets.entries()]
      .filter(([, b]) => b.approved > 0 && b.other > 0)
      .sort((a, b) => b[1].approved - a[1].approved);

    if (!mixed.length) {
      console.log('No employee-month has both approved and non-approved overtime — cannot test.');
      await prisma.$disconnect();
      process.exit(0);
    }

    // ── Case 1: mixed statuses — the headline check ─────────────────────────
    const [key, b] = mixed[0];
    const [empIdStr, ym] = key.split('|');
    const [year, month] = ym.split('-').map(Number);
    const emp = await prisma.employee.findUnique({
      where: { id: Number(empIdStr) },
      select: { id: true, name: true, employeeId: true, department: true, branchLocation: true },
    });
    console.log(`Subject: ${b.name} (${b.code}) · ${MONTHS[month - 1]} ${year}`);
    console.log(`   approved ${b.approved}h · pending+rejected ${b.other}h\n`);

    // Feed the summarizer exactly what the API hands the page: ids as NUMBERS,
    // plus the legacy aliases the controller echoes back.
    const rows = await prisma.overtime.findMany({
      where: { employeeId: Number(empIdStr), date: { startsWith: ym } },
      select: { employeeId: true, employeeCode: true, date: true, otHours: true, status: true },
    });
    const apiShaped = rows.map((r) => ({
      ...r, empId: r.employeeId, empCode: r.employeeCode,
    }));

    // …and the employee exactly as the frontend holds it: id as a STRING.
    const frontendEmp = {
      id: String(emp.id), employeeId: emp.employeeId, name: emp.name,
      department: emp.department, branchLocation: emp.branchLocation,
    };

    const dates = datesInMonth(year, month);
    const s = summarizeEmployeePeriod(frontendEmp, dates, [], [], apiShaped);

    ok('OT is not zero when approved hours exist', s.otHours > 0, `otHours=${s.otHours}`);
    ok('OT equals the APPROVED total', Math.abs(s.otHours - b.approved) < 0.01,
      `summary=${s.otHours} approved=${b.approved}`);
    ok('pending/rejected hours are NOT counted', Math.abs(s.otHours - (b.approved + b.other)) > 0.01,
      `would be ${b.approved + b.other} if unfiltered`);

    // ── Case 2: the summary must agree with the BACKEND engine ──────────────
    const attSvc = require('../src/services/attendanceSummaryService');
    const computed = await attSvc.compute(emp.id, MONTHS[month - 1], year);
    ok('frontend summary === backend attendanceSummaryService', Math.abs(s.otHours - (computed.otHours || 0)) < 0.01,
      `frontend=${s.otHours} backend=${computed.otHours}`);

    // ── Case 3: employee matched by CODE only (no id on the row) ────────────
    const codeOnly = apiShaped.map(({ employeeId, empId, ...rest }) => rest);
    const sCode = summarizeEmployeePeriod(frontendEmp, dates, [], [], codeOnly);
    ok('matches on employeeCode when no id is present', Math.abs(sCode.otHours - b.approved) < 0.01,
      `otHours=${sCode.otHours}`);

    // ── Case 4: a number-typed employee id must work too ────────────────────
    const sNum = summarizeEmployeePeriod({ ...frontendEmp, id: emp.id }, dates, [], [], apiShaped);
    ok('matches when Employee.id is a number', Math.abs(sNum.otHours - b.approved) < 0.01, `otHours=${sNum.otHours}`);

    // ── Case 5: another employee's overtime must not leak in ────────────────
    const other = await prisma.employee.findFirst({
      where: { id: { not: emp.id } }, select: { id: true, employeeId: true, name: true },
    });
    const sOther = summarizeEmployeePeriod(
      { id: String(other.id), employeeId: other.employeeId, name: other.name },
      dates, [], [], apiShaped,
    );
    ok('does not count another employee\'s overtime', sOther.otHours === 0, `otHours=${sOther.otHours}`);

    // ── Case 6: a record with NO status is not treated as approved ──────────
    const noStatus = apiShaped.map((r) => ({ ...r, status: undefined }));
    const sNoStatus = summarizeEmployeePeriod(frontendEmp, dates, [], [], noStatus);
    ok('an unlabelled record is not counted as approved', sNoStatus.otHours === 0, `otHours=${sNoStatus.otHours}`);

    // ── Case 7: dates outside the period are excluded ───────────────────────
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const sPrev = summarizeEmployeePeriod(frontendEmp, datesInMonth(prev.y, prev.m), [], [], apiShaped);
    ok('overtime from another month is excluded', sPrev.otHours === 0, `otHours=${sPrev.otHours}`);
  } finally {
    fs.existsSync(out) && fs.unlinkSync(out);
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  }
})().catch(async (e) => { console.error('SUITE ERROR:', e); await prisma.$disconnect(); process.exit(1); });
