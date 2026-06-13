/**
 * STEP 3 of Employee UUID -> INT conversion (run AFTER the schema migration).
 *
 * Re-inserts the exported employees with explicit INT ids (1..N) and re-inserts
 * the child rows with their employeeId remapped to the new INT id. DateTime
 * fields are coerced to Date objects; types are validated against the new
 * Prisma schema (DMMF). Finally re-links the one mapped Document.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const prisma = require('../src/config/prisma');

// Build field-type map per model from the (new) Prisma schema.
const FIELD_TYPE = {};
const SCALARS = {};
for (const m of Prisma.dmmf.datamodel.models) {
  FIELD_TYPE[m.name] = {};
  SCALARS[m.name] = new Set();
  for (const f of m.fields) {
    if (f.kind === 'object') continue;
    SCALARS[m.name].add(f.name);
    FIELD_TYPE[m.name][f.name] = f.type;
  }
}

function coerce(model, row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (!SCALARS[model].has(k)) continue;
    if (v === null || v === undefined) { out[k] = v; continue; }
    const t = FIELD_TYPE[model][k];
    if (t === 'DateTime') out[k] = new Date(v);
    else if (t === 'Int') out[k] = typeof v === 'number' ? v : parseInt(v, 10);
    else if (t === 'Float') out[k] = typeof v === 'number' ? v : parseFloat(v);
    else if (t === 'Boolean') out[k] = Boolean(v);
    else out[k] = v; // String / Json
  }
  return out;
}

(async () => {
  console.log('── STEP 3: reload with INT employee ids ──');
  const file = path.resolve(__dirname, '../scratch/intid-export.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = data.map;

  // 1) Employees with explicit int id
  const empData = data.employees.map(e => { const c = coerce('Employee', e); c.id = map[e.id]; return c; });
  // insert in id order so AUTO_INCREMENT high-water mark ends at N
  empData.sort((a, b) => a.id - b.id);
  let made = 0;
  const CHUNK = 200;
  for (let i = 0; i < empData.length; i += CHUNK) {
    const res = await prisma.employee.createMany({ data: empData.slice(i, i + CHUNK) });
    made += res.count;
  }
  console.log('Employees reloaded:', made);

  // 2) Child tables with remapped employeeId
  for (const [model, accessor] of [['Attendance', 'attendance'], ['Payroll', 'payroll'], ['LeaveRequest', 'leaveRequest'], ['Overtime', 'overtime']]) {
    const rows = (data[accessor] || []).filter(r => r.employeeId in map).map(r => { const c = coerce(model, r); c.employeeId = map[r.employeeId]; return c; });
    let n = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const res = await prisma[accessor].createMany({ data: rows.slice(i, i + CHUNK) });
      n += res.count;
    }
    console.log(`${model} reloaded:`, n, '/', (data[accessor] || []).length);
  }

  // 3) Re-link the mapped document(s)
  let docLinks = 0;
  for (const [docId, newEmpInt] of Object.entries(data.docMap || {})) {
    if (newEmpInt == null) continue;
    await prisma.document.update({ where: { id: docId }, data: { employeeId: newEmpInt } });
    docLinks++;
  }
  console.log('Documents re-linked:', docLinks);

  // 4) Verify
  const empCount = await prisma.employee.count();
  const maxId = await prisma.employee.aggregate({ _max: { id: true } });
  const sample = await prisma.employee.findMany({ orderBy: { id: 'asc' }, take: 5, select: { id: true, employeeId: true, name: true } });
  console.log('\nVERIFY:');
  console.log('  employees:', empCount, '| max id:', maxId._max.id);
  console.log('  first 5:', JSON.stringify(sample));
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FATAL:', e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
