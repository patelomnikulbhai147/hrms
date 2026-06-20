// Smoke-test every report generator against the real DB via the generate endpoint.
const ctrl = require('../src/controllers/complianceReportController');

function mockRes() { const r = { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(x) { this._json = x; return this; } }; return r; }

(async () => {
  // Get the full catalog.
  const catRes = mockRes();
  ctrl.catalog({ user: { role: 'Super Admin' } }, catRes);
  const catalog = catRes._json;
  console.log(`Testing ${catalog.length} reports against company 1...\n`);

  let ok = 0, empty = 0, failed = 0;
  const failures = [];
  for (const r of catalog) {
    const res = mockRes();
    try {
      await ctrl.generate({ user: { role: 'Super Admin', id: 1, name: 'Smoke' }, body: { reportKey: r.key, companyId: 1 } }, res);
      if (res._status >= 500) { failed++; failures.push(`${r.key}: HTTP ${res._status} ${res._json?.error}`); }
      else if (res._json && Array.isArray(res._json.columns)) { ok++; if ((res._json.rows || []).length === 0) empty++; }
      else { failed++; failures.push(`${r.key}: unexpected response ${JSON.stringify(res._json).slice(0, 120)}`); }
    } catch (e) {
      failed++; failures.push(`${r.key}: THREW ${e.message}`);
    }
  }
  console.log(`PASS (returned columns): ${ok}/${catalog.length}   (of which ${empty} had 0 rows for company 1)`);
  console.log(`FAILED: ${failed}`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  ✗ ' + f)); }
  process.exit(0);
})();
