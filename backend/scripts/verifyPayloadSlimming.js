/**
 * Regression test — list endpoints must not ship blobs.
 *
 * /companies carried every company's seal + letterhead + signature (95% of a
 * 5.5 MB response) and /documents carried whole files (99.9% of its response),
 * both re-fetched on every login and every workspace switch. They are now served
 * on demand.
 *
 * This pins BOTH halves — the payload really shrank, AND the data is still
 * reachable, byte-identical, and still scoped to its tenant. A test that only
 * checked the size would pass just as well if the artwork had been deleted.
 *
 *   node backend/scripts/verifyPayloadSlimming.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

const BASE = process.env.QA_BASE_URL || 'http://localhost:5000/api';
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

let passed = 0, failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? passed++ : failed++;
};
const hdr = (u) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: u.id }, SECRET, { expiresIn: '10m' })}` });
const kb = (n) => `${Math.round(n / 1024)} KB`;
const HEAVY = ['stampImage', 'letterheadImage', 'digitalSignatureImage'];

(async () => {
  console.log('List payload slimming\n');

  // Prefer a user whose company actually HAS artwork, else the test proves nothing.
  const withArt = await prisma.company.findFirst({
    where: { OR: HEAVY.map((f) => ({ [f]: { not: null } })) },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { role: { in: ['Company Head', 'HR'] }, companyId: { not: null } },
    select: { id: true, email: true, companyId: true, accessibleCompanyIds: true },
  });
  const user = users.find((u) => {
    const g = [u.companyId, ...(Array.isArray(u.accessibleCompanyIds) ? u.accessibleCompanyIds.map(Number) : [])];
    return withArt && g.includes(withArt.id);
  }) || users[0];
  if (!user) throw new Error('no company user to authenticate as');
  console.log(`as ${user.email} (company ${user.companyId})${withArt ? `; artwork on company ${withArt.id}` : '; NO artwork in this DB'}\n`);

  // ── /companies ──────────────────────────────────────────────────────────────
  const listRes = await fetch(`${BASE}/companies`, { headers: hdr(user) });
  const listText = await listRes.text();
  const companies = JSON.parse(listText);
  check('GET /companies succeeds', listRes.status === 200, `${companies.length} companies, ${kb(listText.length)}`);

  const leaked = companies.filter((c) => HEAVY.some((f) => c[f] != null));
  check('the list carries no heavy artwork', leaked.length === 0,
    leaked.length ? `${leaked.length} company/companies still ship it` : `stripped from all ${companies.length}`);

  const target = companies.find((c) => withArt && String(c.id) === String(withArt.id)) || companies[0];
  check('the list still reports THAT artwork exists', target ? 'hasHeavyAssets' in target : false,
    target ? `hasHeavyAssets=${target.hasHeavyAssets}` : 'no company visible');

  // ── the artwork is still reachable, and unchanged ───────────────────────────
  if (target) {
    const aRes = await fetch(`${BASE}/companies/${target.id}/assets`, { headers: hdr(user) });
    const assets = await aRes.json();
    check('GET /companies/:id/assets succeeds', aRes.status === 200, `status ${aRes.status}`);

    const row = await prisma.company.findUnique({
      where: { id: Number(target.id) },
      select: { stampImage: true, letterheadImage: true, digitalSignatureImage: true },
    });
    const identical = HEAVY.every((f) => (assets[f] || null) === (row[f] || null));
    check('the artwork is byte-identical to the database', identical,
      HEAVY.map((f) => `${f}=${row[f] ? kb(row[f].length) : 'none'}`).join(' '));

    // The whole point: the bytes moved off the login path, they did not vanish.
    const moved = HEAVY.reduce((n, f) => n + (row[f] ? row[f].length : 0), 0);
    check('bytes were moved off the list, not deleted', !withArt || moved > 0, `${kb(moved)} now lazy`);
  }

  // ── /documents ──────────────────────────────────────────────────────────────
  const dRes = await fetch(`${BASE}/documents`, { headers: hdr(user) });
  const dText = await dRes.text();
  const docs = JSON.parse(dText);
  check('GET /documents succeeds', dRes.status === 200, `${docs.length} documents, ${kb(dText.length)}`);
  check('the list carries no file contents', docs.every((d) => d.fileData === undefined),
    docs.some((d) => d.fileData !== undefined) ? 'fileData still present' : 'fileData omitted');
  check('the list still says which documents have a file', docs.every((d) => 'hasFile' in d),
    `${docs.filter((d) => d.hasFile).length}/${docs.length} have a file`);

  const withFile = docs.find((d) => d.hasFile);
  if (withFile) {
    const fRes = await fetch(`${BASE}/documents/${withFile.id}/file`, { headers: hdr(user) });
    const f = await fRes.json();
    const dbRow = await prisma.document.findUnique({ where: { id: withFile.id }, select: { fileData: true } });
    check('GET /documents/:id/file returns the file', fRes.status === 200 && !!f.fileData, kb((f.fileData || '').length));
    check('the file is byte-identical to the database', f.fileData === dbRow.fileData);
  } else {
    console.log('  SKIP  no document with an attached file in this database');
  }

  // ── tenant isolation on the new endpoints ───────────────────────────────────
  const all = await prisma.user.findMany({
    where: { role: { not: 'Super Admin' }, status: 'Active' },
    select: { id: true, email: true, companyId: true, accessibleCompanyIds: true },
  });
  const grantsOf = (u) => [u.companyId, ...(Array.isArray(u.accessibleCompanyIds) ? u.accessibleCompanyIds.map(Number) : [])];
  const branchIds = (await prisma.branch.findMany({ where: { companyId: Number(target?.id) }, select: { id: true } })).map((b) => b.id);
  const outsider = all.find((u) => {
    const g = grantsOf(u);
    return target && !g.includes(Number(target.id)) && !g.some((x) => branchIds.includes(x));
  });

  if (outsider && target) {
    const r = await fetch(`${BASE}/companies/${target.id}/assets`, { headers: hdr(outsider) });
    check('another tenant cannot read the artwork', r.status === 403, `status ${r.status}`);
  } else {
    console.log('  SKIP  no separate tenant available for the artwork isolation check');
  }

  if (outsider && withFile) {
    const r = await fetch(`${BASE}/documents/${withFile.id}/file`, { headers: hdr(outsider) });
    check('another tenant cannot read the file', r.status === 404 || r.status === 403, `status ${r.status}`);
  } else {
    console.log('  SKIP  no separate tenant available for the file isolation check');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
