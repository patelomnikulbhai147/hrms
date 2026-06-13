// Full Database -> API -> Permission -> Grouping audit for the workspace switcher.
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '10m' });
const get = async (path, token) => {
  const r = await fetch(`http://localhost:5000/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
};

// Replicate App.tsx hydration merge.
const mergeLikeFrontend = (companies, branches) => {
  const mappedBranches = branches.map((b) => ({ ...b, name: b.branchName || b.name, isHeadOffice: false, parentCompanyId: b.companyId }));
  return [...companies, ...mappedBranches];
};

// Mirror the NEW buildWorkspaceHierarchy (company = parent, branch = child).
const isCompany = (it) => it.isHeadOffice === true || (!it.parentCompanyId && !it.companyId);
const buildHierarchy = (items) => {
  const groups = new Map();
  const ensure = (id, name) => {
    if (!groups.has(id)) groups.set(id, { id, name: name || id, companyRecord: null, branches: [] });
    const g = groups.get(id);
    if (name && (!g.name || g.name === g.id)) g.name = name;
    return g;
  };
  for (const it of items) if (isCompany(it)) ensure(it.id, it.name).companyRecord = it;
  for (const it of items) {
    if (isCompany(it)) continue;
    const pid = it.parentCompanyId || it.companyId || 'unknown-company';
    const pname = it.parentCompanyName && it.parentCompanyName !== 'Unknown Company' ? it.parentCompanyName : undefined;
    ensure(pid, pname).branches.push(it);
  }
  const result = [];
  for (const g of groups.values()) {
    if (g.branches.length) result.push({ name: g.name, cards: g.branches.map(b => b.name), isCompanyOnly: false });
    else if (g.companyRecord) result.push({ name: g.name, cards: [g.companyRecord.name], isCompanyOnly: true });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
};

(async () => {
  const users = await prisma.user.findMany({ where: { role: { not: 'Super Admin' } } });
  for (const u of users) {
    console.log(`\n================ USER: ${u.email} (${u.role}) ================`);
    console.log('  DB companyId:', u.companyId, '| accessibleCompanyIds:', JSON.stringify(u.accessibleCompanyIds));
    const token = tokenFor(u.id);
    const companies = await get('/companies', token);
    const branches = await get('/branches', token);
    if (!Array.isArray(companies) || !Array.isArray(branches)) {
      console.log('  API ERROR:', JSON.stringify({ companies, branches }));
      continue;
    }
    console.log('  API /companies ->', companies.map(c => `${c.name}[${c.id}]`).join(', ') || '(none)');
    console.log('  API /branches  ->', branches.map(b => `${b.branchName}[parent=${b.parentCompanyName}]`).join(', ') || '(none)');
    const merged = mergeLikeFrontend(companies, branches);
    const hierarchy = buildHierarchy(merged);
    // Validation counts
    const isBranch = (it) => !isCompany(it);
    const apiCount = merged.filter(isBranch).length + hierarchy.filter(g => g.isCompanyOnly).length;
    const renderedCount = hierarchy.reduce((n, g) => n + g.cards.length, 0);
    console.log('  RENDERED GROUPS (NEW hierarchy: Company -> Branches):');
    hierarchy.forEach(g => console.log(`     🏢 ${g.name} (${g.cards.length}) -> ${g.cards.join(', ')}`));
    console.log(`  COUNTS -> API selectable: ${apiCount} | Rendered: ${renderedCount} | ${apiCount === renderedCount ? 'OK ✅' : 'MISMATCH ❌'}`);
  }
  await prisma.$disconnect();
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
