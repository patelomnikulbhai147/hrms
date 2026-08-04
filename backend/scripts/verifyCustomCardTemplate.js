/**
 * Regression test — uploaded ID-card templates.
 *
 * A company can upload its own card artwork; it is stored inside the template's
 * spec as a `src` data URL on a `backgroundImage` element. This pins the three
 * things that make the feature trustworthy:
 *   • the artwork SURVIVES the round trip (an API that quietly dropped unknown
 *     element keys would leave every card blank with no error);
 *   • a realistic artwork payload is ACCEPTED (the old 400 KB cap rejected it);
 *   • one company's templates are INVISIBLE to another.
 *
 * Cleans up everything it creates.
 *
 *   node backend/scripts/verifyCustomCardTemplate.js
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
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

// A stand-in for real artwork: a data URL of roughly the size the client
// produces after downscaling (~900 KB), so the size guard is exercised for real
// rather than with a token 100-byte string.
const ARTWORK = 'data:image/jpeg;base64,' + 'A'.repeat(900_000);

(async () => {
  console.log('Custom card template upload\n');

  const users = await prisma.user.findMany({
    where: { role: 'Company Head', companyId: { not: null } },
    select: { id: true, companyId: true, email: true },
    orderBy: { id: 'asc' },
  });
  const owner = users[0];
  const other = users.find((u) => u.companyId !== owner.companyId);
  if (!owner) throw new Error('no Company Head to authenticate as');

  const hdr = (u) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: u.id }, SECRET, { expiresIn: '10m' })}` });
  console.log(`owner: ${owner.email} (company ${owner.companyId})${other ? `; other tenant: company ${other.companyId}` : '; (no second tenant found)'}\n`);

  const created = [];
  const spec = {
    theme: { primary: '#111827', secondary: '#4b5563', accent: '#C77E52', text: '#111827', bg: '#ffffff' },
    elements: [
      { id: 'bg1', type: 'backgroundImage', side: 'front', x: 0, y: 0, w: 216, h: 343, z: 0, src: ARTWORK, style: { objectFit: 'cover' } },
      { id: 'nm1', type: 'name', side: 'front', x: 16, y: 210, w: 184, h: 26, z: 2, style: { fontSize: 15, fontWeight: 800, align: 'center' } },
      { id: 'qr1', type: 'qr', side: 'front', x: 80, y: 270, w: 56, h: 56, z: 2 },
    ],
  };

  // ── save ────────────────────────────────────────────────────────────────
  const saveRes = await fetch(`${BASE}/card-templates`, {
    method: 'POST', headers: hdr(owner),
    body: JSON.stringify({ name: `QA Uploaded ${Date.now()}`, category: 'Custom', size: 'CR80', orientation: 'portrait', spec, companyId: owner.companyId }),
  });
  const saved = await j(saveRes);
  check('an uploaded design is accepted', saveRes.status < 300,
    saveRes.status < 300 ? `id ${saved.dbId || saved.id}` : `${saveRes.status} ${String(saved.error || '').slice(0, 70)}`);
  if (saveRes.status >= 300) throw new Error('cannot continue — the template was not saved');
  const dbId = saved.dbId || saved.id;
  created.push(dbId);

  // ── the artwork survives ────────────────────────────────────────────────
  const row = await prisma.cardTemplate.findUnique({ where: { id: dbId } });
  const bg = (row?.spec?.elements || []).find((e) => e.type === 'backgroundImage');
  check('the artwork is stored on the element', !!bg?.src, bg?.src ? `${Math.round(bg.src.length / 1024)} KB` : 'src missing');
  check('the artwork is byte-identical to what was sent', bg?.src === ARTWORK);
  check('the mapped fields are stored alongside it',
    (row?.spec?.elements || []).some((e) => e.type === 'name') && (row?.spec?.elements || []).some((e) => e.type === 'qr'));

  // ── and survives a read back through the API ────────────────────────────
  const listed = await j(await fetch(`${BASE}/card-templates`, { headers: hdr(owner) }));
  const mine = (listed.templates || []).find((t) => (t.dbId || t.id) === dbId);
  check('the template appears in the owner\'s gallery', !!mine, mine ? mine.name : 'absent');
  const apiBg = (mine?.elements || mine?.spec?.elements || []).find?.((e) => e.type === 'backgroundImage');
  check('the API returns the artwork, not a stripped spec', !!apiBg?.src,
    apiBg?.src ? `${Math.round(apiBg.src.length / 1024)} KB` : 'src missing from the API response');

  // ── tenant isolation ────────────────────────────────────────────────────
  if (other) {
    const theirs = await j(await fetch(`${BASE}/card-templates`, { headers: hdr(other) }));
    const leaked = (theirs.templates || []).find((t) => (t.dbId || t.id) === dbId);
    check('another company cannot see this template', !leaked,
      leaked ? `LEAKED: "${leaked.name}" visible to company ${other.companyId}` : '');
  } else {
    console.log('  SKIP  no second tenant available to test isolation with');
  }

  // ── the size guard still refuses something genuinely absurd ─────────────
  const huge = { ...spec, elements: [{ ...spec.elements[0], src: 'data:image/jpeg;base64,' + 'A'.repeat(5_000_000) }] };
  const hugeRes = await fetch(`${BASE}/card-templates`, {
    method: 'POST', headers: hdr(owner),
    body: JSON.stringify({ name: `QA Oversized ${Date.now()}`, spec: huge, companyId: owner.companyId }),
  });
  const hugeBody = await j(hugeRes);
  check('an absurdly large design is still refused', hugeRes.status === 413, `status ${hugeRes.status}`);
  if (hugeRes.status < 300 && (hugeBody.dbId || hugeBody.id)) created.push(hugeBody.dbId || hugeBody.id);

  for (const id of created) await prisma.cardTemplate.deleteMany({ where: { id } }).catch(() => {});
  console.log(`\ncleaned up ${created.length} template(s)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
