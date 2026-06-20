// Final verification: dump the full report inventory + prove backend filter enforcement.
const ctrl = require('../src/controllers/complianceReportController');
const mk = () => { const r = { _s: 200, _j: null, status(c) { this._s = c; return this; }, json(x) { this._j = x; return this; } }; return r; };
const gen = async (key, extra) => { const res = mk(); await ctrl.generate({ user: { role: 'Super Admin', id: 1 }, body: { reportKey: key, companyId: 13, ...extra } }, res); return res._j; };

(async () => {
  const cr = mk(); ctrl.catalog({ user: { role: 'Super Admin' } }, cr); const cat = cr._j;

  // Group by category in catalog order.
  const byCat = {}; cat.forEach(r => { (byCat[r.category] = byCat[r.category] || []).push(r); });
  console.log('================ FULL REPORT INVENTORY ================');
  console.log('TOTAL:', cat.length);
  const byStatus = { available: [], setup: [], coming: [] };
  cat.forEach(r => byStatus[r.status]?.push(r.label));
  console.log('Available:', byStatus.available.length, '| Requires Setup:', byStatus.setup.length, '| Coming Soon:', byStatus.coming.length);
  console.log('\n--- Category-wise ---');
  for (const c of Object.keys(byCat)) {
    console.log(`\n## ${c} (${byCat[c].length})`);
    byCat[c].forEach(r => console.log(`   [${r.status.toUpperCase().padEnd(9)}] ${r.label}   filters=${JSON.stringify(r.filters)}`));
  }
  console.log('\n--- Requires Setup ---'); console.log('   ' + byStatus.setup.join(' · '));
  console.log('--- Coming Soon ---'); console.log('   ' + (byStatus.coming.join(' · ') || '(none)'));

  // ── Prove backend enforcement: department is STRIPPED for Form 16, APPLIED for Salary Register ──
  console.log('\n================ BACKEND FILTER ENFORCEMENT PROOF ================');
  const f16none = await gen('form16', {}); const f16dept = await gen('form16', { department: 'Production' });
  console.log(`Form 16 (department NOT an allowed filter):  no-filter rows=${f16none.rows.length}  with department='Production' rows=${f16dept.rows.length}  -> ${f16none.rows.length === f16dept.rows.length ? 'IGNORED ✅ (enforced server-side)' : 'APPLIED ❌'}`);
  const srNone = await gen('salary_register', {}); const srDept = await gen('salary_register', { department: 'Production' });
  console.log(`Salary Register (department IS allowed):     no-filter rows=${srNone.rows.length}  with department='Production' rows=${srDept.rows.length}  -> ${srNone.rows.length !== srDept.rows.length ? 'APPLIED ✅' : 'no diff (check data)'}`);
  const pfNone = await gen('pf_challan', {}); const pfEmp = await gen('pf_challan', { employeeId: 9999 });
  console.log(`PF Challan (employee NOT an allowed filter): no-filter rows=${pfNone.rows.length}  with employeeId=9999 rows=${pfEmp.rows.length}  -> ${pfNone.rows.length === pfEmp.rows.length ? 'IGNORED ✅ (enforced server-side)' : 'APPLIED ❌'}`);

  process.exit(0);
})();
