// Verifies the Subscription Billing A4 invoice template: renders sample invoices
// (intra-state CGST/SGST, inter-state IGST, discounted, partially paid) and
// asserts every spec-required section + the GST math appear in the output.
// Writes a previewable HTML file. Run: node scripts/verifySubscriptionInvoiceTemplate.js
const fs = require('fs');
const path = require('path');
const { renderInvoiceHtml } = require('../src/services/subscriptionInvoiceHtml');
const { computeInvoice } = require('../src/services/subscriptionInvoiceEngine');
const { amountInWords } = require('../src/utils/amountInWords');

const ok = (c, m) => { console.log(`${c ? 'PASS ✔' : 'FAIL ✗'}  ${m}`); if (!c) process.exitCode = 1; };

// ── amount-in-words ──
ok(amountInWords(7021) === 'Rupees Seven Thousand Twenty One Only', `words: "${amountInWords(7021)}"`);
ok(amountInWords(272099.99).includes('Ninety Nine Paise'), `paise: "${amountInWords(272099.99)}"`);
ok(amountInWords(10000000) === 'Rupees One Crore Only', `crore: "${amountInWords(10000000)}"`);

// ── Spec example: 238 employees × ₹25 = ₹5,950 + 18% GST = ₹7,021 ──
const m = computeInvoice({ employeeCount: 238, pricePerEmployee: 25, discountPercent: 0, gstPercent: 18, interState: false });
ok(m.subtotal === 5950, `subtotal 238×₹25 = ${m.subtotal}`);
ok(m.gstAmount === 1071, `GST 18% = ${m.gstAmount}`);
ok(m.cgst === 535.5 && m.sgst === 535.5, `CGST/SGST split = ${m.cgst}/${m.sgst}`);
ok(m.grandTotal === 7021, `grand total = ${m.grandTotal}`);

const base = {
  invoiceNo: 'ZEN-INV-2026-0001', invoiceDate: new Date(), dueDate: new Date(Date.now() + 7 * 864e5),
  periodStart: new Date('2026-06-01'), periodEnd: new Date('2026-06-30'), renewalDate: new Date('2026-07-01'),
  companyName: 'Samras Boys Hostel Anand', companyHead: 'Social Welfare Officer',
  companyEmail: 'head@samras.example', companyPhone: '079-23258326',
  billingAddress: 'Gujarat Samras Chhatralay Society,\nSardar Patel University Sport Campus,\nVadtal, Anand, Gujarat - 388001',
  gstin: '24AAMFE6107E1ZQ', companyPan: 'AAMFE6107E',
  plan: 'Starter', billingCycle: 'Quarterly', employeeCount: 238, pricePerEmployee: 25,
  gstPercent: 18, status: 'Pending', amountPaid: 0, notes: 'Thank you for your business.',
};

const cases = {
  'intra-state (CGST/SGST)': { ...base, ...m, interState: false, discountPercent: 0 },
  'inter-state (IGST)': (() => { const x = computeInvoice({ employeeCount: 238, pricePerEmployee: 25, discountPercent: 0, gstPercent: 18, interState: true }); return { ...base, ...x, invoiceNo: 'ZEN-INV-2026-0002', interState: true, discountPercent: 0 }; })(),
  'discounted + partially paid': (() => { const x = computeInvoice({ employeeCount: 238, pricePerEmployee: 25, discountPercent: 10, gstPercent: 18, interState: false }); return { ...base, ...x, invoiceNo: 'ZEN-INV-2026-0003', interState: false, discountPercent: 10, amountPaid: 3000, status: 'Partial' }; })(),
};

const REQUIRED = [
  'TAX INVOICE', 'BILL TO', 'SUBSCRIPTION DETAILS', 'BANK DETAILS', 'PAYMENT STATUS',
  'Amount Chargeable (in words)', 'GRAND TOTAL', 'Taxable Value', 'Sub Total',
  'Invoice No.', 'Due Date', 'Billing Period', 'Payment Terms',
  'Employee Count', 'Price / Employee', 'Subscription Start', 'Subscription End', 'Renewal Date',
  'Authorized Signatory', 'computer generated', 'Terms &amp; Conditions', 'SCAN', '@page',
];

const out = [];
for (const [label, inv] of Object.entries(cases)) {
  const html = renderInvoiceHtml(inv, { settings: {} });
  const missing = REQUIRED.filter((s) => !html.includes(s));
  ok(missing.length === 0, `[${label}] all sections present${missing.length ? ' — MISSING: ' + missing.join(', ') : ''}`);
  ok(html.includes(amountInWords(inv.grandTotal)), `[${label}] amount in words matches grand total (${inv.grandTotal})`);
  if (inv.interState) {
    ok(html.includes('IGST (18%)') && !html.includes('CGST'), `[${label}] shows IGST only`);
  } else {
    ok(html.includes('CGST (9%)') && html.includes('SGST (9%)') && !html.includes('IGST ('), `[${label}] shows CGST+SGST only`);
  }
  out.push(`<h2 style="font-family:sans-serif">${label}</h2>` + html);
}

const file = path.join(require('os').tmpdir(), 'zeniahr_subscription_invoice_preview.html');
fs.writeFileSync(file, out.join('\n<hr>\n'), 'utf8');
console.log('\nPreview written to:', file);
