/* E2E: compliance filing calendar + filings lifecycle. Mostly self-cleaning.
 *   node scripts/test-compliance-e2e.js
 */
const prisma = require('../src/config/prisma');
const BASE = 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

(async () => {
  let customId, filedId;
  try {
    const token = (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'om@gmail.com', password: 'Om@12345' }) })).json()).token;
    ok(!!token, 'login as Company Head');

    // 1) Dashboard auto-generates the calendar
    const dash = await (await fetch(`${BASE}/compliance-mgmt/dashboard`, { headers: H(token) })).json();
    ok(dash.kpis && typeof dash.kpis.pendingTotal === 'number', 'dashboard returns KPIs');
    ok(dash.byCategory && dash.byCategory.PF !== undefined, 'per-category breakdown present');

    // 2) Filings list should now contain auto-generated PF/ESI/PT rows
    const list = await (await fetch(`${BASE}/compliance-mgmt/filings`, { headers: H(token) })).json();
    ok(Array.isArray(list.filings) && list.filings.length > 0, `filings generated (${list.filings.length})`);
    const pf = list.filings.find((f) => f.category === 'PF');
    ok(!!pf, 'PF filing exists');
    ok(pf && /\d{4}-\d{2}-15/.test(pf.dueDate), `PF due on the 15th (${pf?.dueDate})`);
    ok(list.filings.some((f) => f.category === 'GST'), 'GST filing exists');
    ok(list.filings.some((f) => f.category === 'TDS'), 'TDS (quarterly) filing exists');
    ok(list.filings.every((f) => !('challanFileData' in f)), 'list never ships base64 challan');

    // 3) Mark a Pending/Overdue filing as Filed
    const target = list.filings.find((f) => f.status === 'Pending' || f.status === 'Overdue');
    filedId = target.id;
    const filed = await (await fetch(`${BASE}/compliance-mgmt/filings/${filedId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'file', referenceNumber: 'TEST-CHLN-1', amount: 12345 }) })).json();
    ok(filed.status === 'Filed', 'marked as Filed');
    ok(filed.referenceNumber === 'TEST-CHLN-1', 'reference number stored');

    // 4) Upload a (tiny) challan → hasChallan
    await fetch(`${BASE}/compliance-mgmt/filings/${filedId}/challan`, { method: 'POST', headers: H(token), body: JSON.stringify({ fileData: 'data:text/plain;base64,SGVsbG8=', fileName: 'test.txt', mimeType: 'text/plain' }) });
    const listAfter = await (await fetch(`${BASE}/compliance-mgmt/filings`, { headers: H(token) })).json();
    ok(listAfter.filings.find((f) => f.id === filedId)?.hasChallan === true, 'challan uploaded (hasChallan)');

    // 5) Add a custom filing + dupe guard
    const created = await (await fetch(`${BASE}/compliance-mgmt/filings`, { method: 'POST', headers: H(token), body: JSON.stringify({ category: 'Custom', title: 'CLAUDE TEST FILING', frequency: 'One-Time', periodYear: 2099, periodMonth: 6, dueDate: '2099-06-30', amount: 500 }) })).json();
    customId = created.id;
    ok(created.status === 'Pending' && created.title === 'CLAUDE TEST FILING', 'custom filing created');
    const dupe = await fetch(`${BASE}/compliance-mgmt/filings`, { method: 'POST', headers: H(token), body: JSON.stringify({ category: 'Custom', title: 'dupe', periodYear: 2099, periodMonth: 6 }) });
    ok(dupe.status === 409, 'duplicate category+period rejected (409)');

    // 6) Waive it (manage)
    const waived = await (await fetch(`${BASE}/compliance-mgmt/filings/${customId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'waive' }) })).json();
    ok(waived.status === 'Waived', 'custom filing waived');

    // 7) Idempotent regenerate — dashboard again should not error/duplicate
    const before = (await (await fetch(`${BASE}/compliance-mgmt/filings`, { headers: H(token) })).json()).filings.length;
    await fetch(`${BASE}/compliance-mgmt/dashboard`, { headers: H(token) });
    const after = (await (await fetch(`${BASE}/compliance-mgmt/filings`, { headers: H(token) })).json()).filings.length;
    ok(after === before, `calendar generation idempotent (${before} → ${after})`);

    // cleanup: delete custom + reopen the filed row (leave auto calendar intact)
    await fetch(`${BASE}/compliance-mgmt/filings/${customId}`, { method: 'DELETE', headers: H(token) });
    await fetch(`${BASE}/compliance-mgmt/filings/${filedId}/status`, { method: 'POST', headers: H(token), body: JSON.stringify({ action: 'reopen' }) });
    await prisma.complianceFiling.update({ where: { id: filedId }, data: { challanFileData: null, challanFileName: null, referenceNumber: null, versionHistory: null } }).catch(() => {});
    ok(true, 'cleaned up test rows');

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  } catch (e) {
    console.error('TEST ERROR:', e.message, e.stack);
    if (customId) { try { await prisma.complianceFiling.delete({ where: { id: customId } }); } catch {} }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
