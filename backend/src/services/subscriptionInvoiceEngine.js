// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION INVOICE ENGINE — the single place invoice amounts + GST are
// computed. No amount is ever entered manually: subtotal = headcount × rate, then
// discount, then GST (split CGST/SGST intra-state or IGST inter-state).
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');
const store = require('./planStore');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Compute the full money breakdown from the billing inputs.
//   subtotal      = employeeCount × pricePerEmployee
//   discountAmount= subtotal × discount%
//   taxable       = subtotal − discountAmount
//   gstAmount     = taxable × gst%   (CGST+SGST halves intra-state, else IGST)
//   grandTotal    = taxable + gstAmount
function computeInvoice({ employeeCount = 0, pricePerEmployee = 0, discountPercent = 0, gstPercent = 0, interState = false }) {
  const subtotal = r2((Number(employeeCount) || 0) * (Number(pricePerEmployee) || 0));
  const discountAmount = r2(subtotal * ((Number(discountPercent) || 0) / 100));
  const taxable = r2(subtotal - discountAmount);
  const gstAmount = r2(taxable * ((Number(gstPercent) || 0) / 100));
  const cgst = interState ? 0 : r2(gstAmount / 2);
  const sgst = interState ? 0 : r2(gstAmount - cgst); // absorb rounding remainder into SGST
  const igst = interState ? gstAmount : 0;
  const grandTotal = r2(taxable + gstAmount);
  return { subtotal, discountAmount, taxable, gstPercent: Number(gstPercent) || 0, gstAmount, cgst, sgst, igst, interState: !!interState, grandTotal };
}

// Billing period end for a cycle (Quarterly = +3 months, Yearly = +12 months).
function periodEndFor(start, cycle) {
  const d = new Date(start);
  const months = String(cycle).toLowerCase() === 'yearly' ? 12 : 3;
  d.setMonth(d.getMonth() + months);
  return d;
}

// Next unique invoice number: PREFIX-YYYY-000N (sequence = existing count + 1,
// bumped on the rare unique collision). Prefix comes from platform settings.
async function nextInvoiceNo(invoiceDate) {
  const settings = store.getSettings();
  // The Invoice Settings screen (invoiceIssuerStore) is the authoritative prefix;
  // platform settings stay as a fallback so existing numbering never breaks.
  let issuerPrefix = '';
  try { issuerPrefix = (require('./invoiceIssuerStore').getIssuer().invoicePrefix || '').trim(); } catch (_) { /* fallback below */ }
  const prefix = (issuerPrefix || settings.invoicePrefix || 'INV').trim();
  const year = new Date(invoiceDate || Date.now()).getFullYear();
  let seq = (await prisma.subscriptionInvoice.count()) + 1;
  // Guarantee uniqueness even if numbering was edited / rows deleted.
  for (let i = 0; i < 10000; i++) {
    const candidate = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
    const exists = await prisma.subscriptionInvoice.findUnique({ where: { invoiceNo: candidate } });
    if (!exists) return candidate;
    seq++;
  }
  return `${prefix}-${year}-${Date.now()}`;
}

module.exports = { computeInvoice, periodEndFor, nextInvoiceNo, r2 };
