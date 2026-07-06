/* Smoke test: Employee Card Designer template CRUD + company scoping + default.
 *   node scripts/test-card-templates-smoke.js
 */
const prisma = require('../src/config/prisma');
const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

const sampleSpec = {
  id: 'corp-blue', name: 'X', category: 'Custom', size: 'CR80', orientation: 'portrait',
  theme: { primary: '#1e4fd8', secondary: '#4f7cff', accent: '#dbeafe', text: '#0f172a', bg: '#ffffff' },
  elements: [{ id: 'e1', type: 'name', side: 'front', x: 10, y: 10, w: 100, h: 30, visible: true }],
};

(async () => {
  let id;
  try {
    const token = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'om@gmail.com', password: 'Om@12345' }) })).json()).token;
    ok(!!token, 'login as Company Head');

    // Create
    const created = await (await fetch(`${BASE}/card-templates`, { method: 'POST', headers: H(token), body: JSON.stringify({ name: 'CLAUDE_CARD_TEST', category: 'Custom', size: 'CR80', orientation: 'portrait', builtinId: 'corp-blue', spec: { ...sampleSpec, name: 'CLAUDE_CARD_TEST' } }) })).json();
    id = created.id;
    ok(!!id && created.custom === true, `created custom template (id ${id})`);
    ok(Array.isArray(created.spec?.elements) && created.spec.elements.length === 1, 'spec persisted with elements');

    // Reject bad spec
    const bad = await fetch(`${BASE}/card-templates`, { method: 'POST', headers: H(token), body: JSON.stringify({ name: 'bad', spec: { nope: true } }) });
    ok(bad.status === 400, 'invalid spec rejected (400)');

    // List includes it, scoped to company
    const list = await (await fetch(`${BASE}/card-templates`, { headers: H(token) })).json();
    const row = (list.templates || []).find((t) => t.id === id);
    ok(!!row, 'template appears in company list');
    ok((list.templates || []).every((t) => t.companyId === row.companyId || t.shared), 'list is company-scoped (own + shared only)');

    // Update
    const upd = await (await fetch(`${BASE}/card-templates`, { method: 'POST', headers: H(token), body: JSON.stringify({ id, name: 'CLAUDE_CARD_TEST2', spec: created.spec }) })).json();
    ok(upd.name === 'CLAUDE_CARD_TEST2', 'template renamed on update');

    // Set default
    const def = await (await fetch(`${BASE}/card-templates/${id}/default`, { method: 'POST', headers: H(token) })).json();
    ok(def.isDefault === true, 'template marked default');
    const others = (await (await fetch(`${BASE}/card-templates`, { headers: H(token) })).json()).templates.filter((t) => t.id !== id && t.companyId === row.companyId);
    ok(others.every((t) => !t.isDefault), 'only one default per company');

    // Share requires Super Admin → Company Head gets 403
    const share = await fetch(`${BASE}/card-templates/${id}/share`, { method: 'POST', headers: H(token), body: JSON.stringify({ shared: true }) });
    ok(share.status === 403, 'non-Super-Admin cannot share across companies (403)');

    // Delete
    const del = await fetch(`${BASE}/card-templates/${id}`, { method: 'DELETE', headers: H(token) });
    ok(del.status === 200, 'template deleted');
    id = null;
    const after = (await (await fetch(`${BASE}/card-templates`, { headers: H(token) })).json()).templates.find((t) => t.name && t.name.startsWith('CLAUDE_CARD_TEST'));
    ok(!after, 'template gone after delete');

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  } catch (e) {
    console.error('TEST ERROR:', e.message, e.stack);
    process.exitCode = 1;
  } finally {
    try { if (id) await prisma.cardTemplate.delete({ where: { id } }); } catch {}
    await prisma.$disconnect();
  }
})();
