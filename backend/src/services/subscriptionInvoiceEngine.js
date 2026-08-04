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

// Next invoice number: PREFIX-YYYY-000N.
//
// The sequence is scoped to the PREFIX AND YEAR (it used to be a global
// `count()`, so the numbering never restarted per year and any deletion shifted
// every subsequent number).
//
// NOTE: this is a CANDIDATE, not a reservation. Probing "does it exist?" and
// then creating is inherently racy — two concurrent generates both see the same
// number free. `createInvoiceWithUniqueNo` below is the safe way to use it: it
// lets the unique index be the arbiter and retries on collision.
async function nextInvoiceNo(invoiceDate, skip = 0) {
  const settings = store.getSettings();
  // The Invoice Settings screen (invoiceIssuerStore) is the authoritative prefix;
  // platform settings stay as a fallback so existing numbering never breaks.
  let issuerPrefix = '';
  try { issuerPrefix = (require('./invoiceIssuerStore').getIssuer().invoicePrefix || '').trim(); } catch (_) { /* fallback below */ }
  const prefix = (issuerPrefix || settings.invoicePrefix || 'INV').trim();
  const year = new Date(invoiceDate || Date.now()).getFullYear();
  const stem = `${prefix}-${year}-`;
  const used = await prisma.subscriptionInvoice.count({ where: { invoiceNo: { startsWith: stem } } });
  let seq = used + 1 + Number(skip || 0);
  // Skip past numbers that already exist (numbering edited / rows deleted).
  for (let i = 0; i < 10000; i++) {
    const candidate = `${stem}${String(seq).padStart(4, '0')}`;
    const exists = await prisma.subscriptionInvoice.findUnique({ where: { invoiceNo: candidate } });
    if (!exists) return candidate;
    seq++;
  }
  return `${stem}${Date.now()}`;
}

/**
 * Create a subscription invoice with a guaranteed-unique number.
 *
 * Concurrency-safe by construction: the DB's unique index on `invoiceNo` is the
 * single arbiter. On a P2002 collision we simply take the next candidate and try
 * again, so two simultaneous generates produce two DIFFERENT numbers instead of
 * one succeeding and the other returning a bare 500 with no invoice.
 *
 * @param {(invoiceNo: string) => object} buildData  data for prisma.create, given the number
 * @param {object} [opts]
 * @param {Date|string} [opts.invoiceDate]  drives the YYYY segment
 * @param {string} [opts.invoiceNo]         explicit number (still retried if taken)
 * @param {number} [opts.attempts]          max collision retries
 */
async function createInvoiceWithUniqueNo(buildData, opts = {}) {
  // Attempts are cheap (one INSERT each) and only consumed under genuine
  // contention; 12 simultaneous generates were measured to need well under 25.
  const { invoiceDate, invoiceNo: explicit, attempts = 50 } = opts;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // An explicitly supplied number is honoured on the first attempt only; if it
    // is already taken we fall back to generated numbering rather than failing.
    const candidate = attempt === 0 && explicit
      ? String(explicit).trim()
      : await nextInvoiceNo(invoiceDate, attempt);
    try {
      return await prisma.subscriptionInvoice.create({ data: buildData(candidate) });
    } catch (e) {
      const isNumberCollision =
        e?.code === 'P2002' &&
        String(e?.meta?.target ?? '').toLowerCase().includes('invoiceno');
      if (!isNumberCollision) throw e;
      // Another transaction claimed this number between our probe and our insert
      // — take the next one. This is the expected path under concurrency.
    }
  }
  throw new Error('Could not allocate a unique invoice number after repeated collisions.');
}

module.exports = { computeInvoice, periodEndFor, nextInvoiceNo, createInvoiceWithUniqueNo, r2 };
