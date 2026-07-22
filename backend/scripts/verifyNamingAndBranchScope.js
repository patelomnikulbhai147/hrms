/**
 * Regression test — the master-data naming standard, and branch scoping.
 *
 * Two things are pinned here:
 *
 *  1. NAMING. titleCase must collapse casing variants to one value without
 *     mangling the acronyms this dataset is full of (HR, IT, ECG, CSSD, O.T,
 *     X-RAY) — a naive per-word capitalise renders "Hr"/"Ecg"/"O.t", which is
 *     why this is a shared utility rather than an inline expression.
 *     The frontend copy (utils/titleCase.ts) MUST agree with this one.
 *
 *  2. BRANCH SCOPE. A branch-level user must not be able to read another
 *     branch's attendance by editing the request. The UI hides the branch filter
 *     for them; that is cosmetic, so the API is what actually has to hold.
 *
 *   node backend/scripts/verifyNamingAndBranchScope.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
const { titleCase, normalizeKey, sameValue } = require('../src/utils/titleCase');

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};
const hdr = (u, ws) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${jwt.sign({ id: u.id }, SECRET, { expiresIn: '10m' })}`,
  ...(ws ? { 'x-workspace-id': String(ws) } : {}),
});

(async () => {
  console.log('Naming standard & branch scope\n');

  // ── 1. the naming standard ─────────────────────────────────────────────────
  const cases = [
    ['AHMEDABAD', 'Ahmedabad'], ['Ahmedabad', 'Ahmedabad'], ['ahmedabad', 'Ahmedabad'],
    ['AHMeDaBaD', 'Ahmedabad'], ['  surat  ', 'Surat'], ['vadodara', 'Vadodara'],
    // Acronyms — the whole reason this is not a one-liner.
    ['HR', 'HR'], ['hr', 'HR'], ['IT ENGINEER', 'IT Engineer'], ['QA Tester', 'QA Tester'],
    ['CCTV OPERATOR', 'CCTV Operator'], ['ECG TECHNICIAN', 'ECG Technician'],
    ['CSSD TECHNICIAN', 'CSSD Technician'], ['AHA', 'AHA'],
    ['O.T ASSISTANT', 'O.T Assistant'], ['H.A.M', 'H.A.M'],
    // Punctuation compounds.
    ['X-RAY TEC', 'X-Ray Tec'], ['BIO-MEDICAL ENGINEER', 'Bio-Medical Engineer'],
    ['DATA ENTRY OPERATOR (MULTI TASK)', 'Data Entry Operator (Multi Task)'],
    // Names.
    ['SAROTHIYA HEMLATA SANTOSHBHAI', 'Sarothiya Hemlata Santoshbhai'],
    ['MCDONALD JOHN', 'McDonald John'], ["D'SOUZA MARIA", "D'Souza Maria"],
    ['CHAVDA KHIMA H.', 'Chavda Khima H.'],
    // Connectors.
    ['head of department', 'Head of Department'],
    // Degenerate input must not throw.
    ['', ''], ['   ', ''],
  ];
  let bad = [];
  for (const [input, want] of cases) {
    const got = titleCase(input);
    if (got !== want) bad.push(`${JSON.stringify(input)} → ${JSON.stringify(got)} (want ${JSON.stringify(want)})`);
  }
  check(`titleCase handles all ${cases.length} cases`, bad.length === 0, bad.length ? bad.join('; ') : '');
  check('null / undefined are safe', titleCase(null) === '' && titleCase(undefined) === '');
  check('casing variants share one key',
    normalizeKey('AHMEDABAD') === normalizeKey('Ahmedabad') && normalizeKey(' ahmedabad ') === normalizeKey('Ahmedabad'));
  check('sameValue is case-insensitive', sameValue('STAFF NURSE', 'Staff Nurse') && !sameValue('Skilled', 'Semi Skilled'));

  // The frontend mirror must not drift — same rule, two files.
  const fs = require('fs');
  const path = require('path');
  const fePath = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'titleCase.ts');
  if (fs.existsSync(fePath)) {
    const fe = fs.readFileSync(fePath, 'utf8');
    const acr = (s) => (s.match(/const ACRONYMS = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
    const norm = (s) => (s.match(/'[A-Z0-9]+'/g) || []).sort().join(',');
    check('frontend and backend acronym lists agree',
      norm(acr(fe)) === norm(acr(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'titleCase.js'), 'utf8'))));
  } else {
    console.log('  SKIP  frontend titleCase.ts not found');
  }

  // ── 2. no casing duplicates remain in the categorical columns ──────────────
  const emps = await prisma.employee.findMany({ select: { branchLocation: true, department: true, designation: true, category: true } });
  for (const f of ['branchLocation', 'department', 'designation', 'category']) {
    const groups = new Map();
    for (const r of emps) {
      const v = r[f];
      if (!v || !String(v).trim()) continue;
      const k = normalizeKey(v);
      if (!groups.has(k)) groups.set(k, new Set());
      groups.get(k).add(v);
    }
    const dupes = [...groups.entries()].filter(([, s]) => s.size > 1);
    check(`employee.${f} has no casing duplicates`, dupes.length === 0,
      dupes.length ? dupes.map(([k, s]) => `${k}: ${[...s].join('|')}`).join(' ; ') : `${groups.size} distinct value(s)`);
  }

  // ── 3. branch scope is enforced by the API, not just hidden in the UI ──────
  const branches = await prisma.branch.findMany({ select: { id: true, companyId: true, branchName: true } });
  const users = await prisma.user.findMany({
    where: { role: { not: 'Super Admin' }, status: 'Active' },
    select: { id: true, email: true, companyId: true, accessibleCompanyIds: true },
  });
  const { resolveAccess } = require('../src/utils/accessScope');
  const companies = await prisma.company.findMany({ select: { id: true } });

  let branchUser = null, ownBranch = null, foreignBranch = null;
  for (const u of users) {
    const raw = [u.companyId, ...(Array.isArray(u.accessibleCompanyIds) ? u.accessibleCompanyIds : [])];
    const { branchIds, companyWideIds } = resolveAccess(raw, companies, branches);
    const mine = branchIds.map(Number);
    if (!mine.length) continue;
    const other = branches.find((b) => !mine.includes(b.id) && !companyWideIds.map(Number).includes(b.companyId));
    if (other) { branchUser = u; ownBranch = mine[0]; foreignBranch = other.id; break; }
  }

  if (branchUser) {
    console.log(`\n  branch user ${branchUser.email}: own branch ${ownBranch}, foreign branch ${foreignBranch}`);
    const mineRes = await fetch(`${BASE}/attendance?companyId=${ownBranch}`, { headers: hdr(branchUser, ownBranch) });
    check('a branch user CAN read their own branch', mineRes.status === 200, `status ${mineRes.status}`);

    const theirsRes = await fetch(`${BASE}/attendance?companyId=${foreignBranch}`, { headers: hdr(branchUser, foreignBranch) });
    check('a branch user CANNOT read another branch', theirsRes.status === 403,
      `status ${theirsRes.status}${theirsRes.status === 200 ? '  ← LEAK' : ''}`);

    // Header spoof — the same check must hold when the id arrives via the header.
    const spoof = await fetch(`${BASE}/attendance`, { headers: hdr(branchUser, foreignBranch) });
    check('nor by spoofing the x-workspace-id header', spoof.status === 403, `status ${spoof.status}`);

    // Unfiltered: must return ONLY employees the user may see.
    const openRes = await fetch(`${BASE}/attendance`, { headers: hdr(branchUser) });
    if (openRes.status === 200) {
      const rows = await openRes.json();
      const ids = [...new Set((Array.isArray(rows) ? rows : []).map((r) => r.employeeId))];
      const leaked = ids.length
        ? await prisma.employee.count({ where: { id: { in: ids }, companyId: foreignBranch } })
        : 0;
      check('an unfiltered read returns no foreign-branch employees', leaked === 0,
        leaked ? `${leaked} employee(s) leaked` : `${ids.length} employee(s), all in scope`);
    } else {
      check('an unfiltered read succeeds', false, `status ${openRes.status}`);
    }
  } else {
    console.log('  SKIP  no branch-scoped user with a reachable foreign branch in this database');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
