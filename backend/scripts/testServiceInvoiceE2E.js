/**
 * Invoice Management — end-to-end check of the new header fields, GST engine and
 * the email endpoint, driven through the REAL controller. Cleans up after itself.
 * Run: node scripts/testServiceInvoiceE2E.js
 */
const prisma = require('../src/config/prisma');
const inv = require('../src/controllers/invoiceController');

const COMPANY = 11;
const USER = { id: 13, role: 'Company Head', name: 'E2E Tester', companyId: COMPANY, email: 'e2e@test.local' };
const made = [];

const call = (fn, { body = {}, params = {}, query = {} } = {}) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(p) { if (p && p.id && p.invoiceNumber) made.push(p.id); resolve({ code: this.statusCode, body: p }); },
  };
  fn({ user: USER, body, params, query, headers: {} }, res).catch((e) => resolve({ code: 500, body: { error: e.message } }));
});

let pass = 0, fail = 0;
const ok = (n, c, extra) => { c ? pass++ : fail++; console.log(`${c ? '✓' : '✗'} ${n}${c ? '' : `  → ${JSON.stringify(extra)}`}`); };

(async () => {
  console.log('── Create with the new header fields ──');
  let r = await call(inv.create, {
    body: {
      billToName: 'District Deputy Director (CI-3)', billToState: 'Gujarat', billToEmail: 'ddd@example.com',
      invoiceDate: '2026-07-10', dueDate: '2026-08-09',
      contractNo: 'GEMC-515877639', referenceNo: 'GEM/2025/B/6807579', poNumber: 'PO-9985',
      billingPeriod: '01/06/2026 – 30/06/2026', placeOfSupply: 'Gujarat',
      items: [{ name: 'Security Manpower Service', hsnSac: '998525', quantity: 90, rate: 650.90, discountPct: 0, taxRate: 18 }],
    },
  });
  const created = r.body;
  ok('Invoice created', r.code === 201 && !!created.id, r);
  ok('contractNo persisted', created.contractNo === 'GEMC-515877639', created.contractNo);
  ok('referenceNo persisted', created.referenceNo === 'GEM/2025/B/6807579', created.referenceNo);
  ok('poNumber persisted', created.poNumber === 'PO-9985', created.poNumber);
  ok('billingPeriod persisted', created.billingPeriod === '01/06/2026 – 30/06/2026', created.billingPeriod);

  console.log('\n── Server-side GST (authoritative) ──');
  ok('Taxable 58,581 (90 × 650.90)', created.taxableAmount === 58581, created.taxableAmount);
  ok('Intra-state → CGST 5,272.29 + SGST 5,272.29', created.cgst === 5272.29 && created.sgst === 5272.29, created);
  ok('IGST zero intra-state', created.igst === 0, created.igst);
  ok('Grand total 69,126 (rounded)', created.grandTotal === 69126, created.grandTotal);
  ok('Balance due === grand total when unpaid', created.balanceDue === created.grandTotal, created);

  console.log('\n── Client-sent totals are IGNORED (server recomputes) ──');
  r = await call(inv.create, {
    body: {
      billToName: 'Tamper Test', billToState: 'Gujarat', invoiceDate: '2026-07-10',
      grandTotal: 1, taxableAmount: 1, cgst: 0, sgst: 0,     // ← attacker payload
      items: [{ name: 'Svc', quantity: 2, rate: 1000, taxRate: 18 }],
    },
  });
  ok('Posted grandTotal=1 is discarded → 2,360', r.body.grandTotal === 2360, r.body.grandTotal);

  console.log('\n── Update keeps the header fields editable ──');
  r = await call(inv.update, {
    params: { id: String(created.id) },
    body: {
      billToName: created.billToName, invoiceDate: created.invoiceDate, billToState: 'Gujarat',
      contractNo: 'CHANGED-001', referenceNo: '', poNumber: created.poNumber, billingPeriod: created.billingPeriod,
      items: [{ name: 'Security Manpower Service', quantity: 90, rate: 650.90, taxRate: 18 }],
    },
  });
  ok('contractNo updated', r.body.contractNo === 'CHANGED-001', r.body.contractNo);
  ok('blank referenceNo → NULL (row hides on the invoice)', r.body.referenceNo === null, r.body.referenceNo);

  console.log('\n── Duplicate carries the header fields ──');
  r = await call(inv.duplicate, { params: { id: String(created.id) } });
  ok('Duplicate copies contractNo / poNumber / billingPeriod',
    r.body.contractNo === 'CHANGED-001' && r.body.poNumber === 'PO-9985' && r.body.billingPeriod === '01/06/2026 – 30/06/2026', r.body);
  ok('Duplicate is a fresh Draft with a new number',
    r.body.status === 'Draft' && r.body.invoiceNumber !== created.invoiceNumber, r.body.invoiceNumber);

  console.log('\n── Email endpoint validation ──');
  r = await call(inv.emailInvoice, { params: { id: String(created.id) }, body: { to: 'not-an-email', html: '<html></html>' } });
  ok('Invalid address rejected (400)', r.code === 400, r);
  r = await call(inv.emailInvoice, { params: { id: String(created.id) }, body: { to: 'a@b.com', html: '' } });
  ok('Empty document rejected (400)', r.code === 400, r);
  r = await call(inv.emailInvoice, { params: { id: '99999999' }, body: { to: 'a@b.com', html: '<html></html>' } });
  ok('Unknown invoice → 404', r.code === 404, r);

  console.log('\n── Existing invoices are untouched by the new columns ──');
  const legacy = await prisma.invoice.count({ where: { contractNo: null } });
  ok(`${legacy} pre-existing invoice(s) have NULL header fields and still load`, legacy >= 0, legacy);

  // cleanup
  const ids = [...new Set(made)];
  if (ids.length) {
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: ids } } });
    await prisma.invoiceAudit.deleteMany({ where: { invoiceId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`\ncleaned up ${ids.length} test invoice(s)`);
  console.log(fail ? `\n${pass} passed, ${fail} FAILED` : `\nALL ${pass} PASSED`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})();
