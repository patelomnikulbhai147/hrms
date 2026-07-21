// ─────────────────────────────────────────────────────────────────────────────
// INVOICE EDITOR ENGINE — the SINGLE source of truth for every amount on an
// editable Subscription invoice. Nothing is ever hand-calculated: change any
// input (qty, rate, discount %, tax %, round-off, paid) and every dependent
// figure below is re-derived from scratch.
//
//   per item:  gross    = quantity × rate
//              discount = gross × discount%
//              taxable  = gross − discount
//              gst      = taxable × tax%
//              total    = taxable + gst
//   invoice:   subtotal = Σ gross, discount = Σ discount, taxable = Σ taxable
//              gst      = Σ gst  → CGST+SGST (intra-state) or IGST (inter-state)
//              grand    = taxable + gst (+ round-off)
//              balance  = grand − paid
//
// SCOPE: used ONLY by the Super Admin Subscription Billing invoice editor. The
// Payroll, Customer and Employee invoice modules are untouched.
// ─────────────────────────────────────────────────────────────────────────────
const { amountInWords } = require('../utils/amountInWords');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v, dflt = 0) => { const n = Number(v); return Number.isFinite(n) ? n : dflt; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Normalise a raw (client-supplied) line item into the canonical shape. */
function normalizeItem(raw = {}, idx = 0) {
  return {
    id: String(raw.id || `it-${idx + 1}`),
    description: String(raw.description ?? '').slice(0, 500),
    hsn: String(raw.hsn ?? raw.hsnSac ?? '').slice(0, 20),
    quantity: num(raw.quantity, 0),
    rate: num(raw.rate, 0),
    discountPercent: clamp(num(raw.discountPercent, 0), 0, 100),
    taxPercent: clamp(num(raw.taxPercent, 0), 0, 100),
  };
}

/** Derive every money field for ONE item. */
function computeItem(item) {
  const gross = r2(item.quantity * item.rate);
  const discountAmount = r2(gross * (item.discountPercent / 100));
  const taxable = r2(gross - discountAmount);
  const gstAmount = r2(taxable * (item.taxPercent / 100));
  const total = r2(taxable + gstAmount);
  return { ...item, gross, discountAmount, taxable, gstAmount, total };
}

/**
 * Compute the whole invoice from its line items.
 * @param {object} o { lineItems, interState, roundOffEnabled, amountPaid }
 */
function computeInvoiceFromItems({ lineItems = [], interState = false, roundOffEnabled = true, amountPaid = 0 } = {}) {
  const items = (Array.isArray(lineItems) ? lineItems : []).map(normalizeItem).map(computeItem);

  const sum = (k) => r2(items.reduce((t, i) => t + i[k], 0));
  const subtotal = sum('gross');
  const discountAmount = sum('discountAmount');
  const taxable = sum('taxable');
  const gstAmount = sum('gstAmount');

  const cgst = interState ? 0 : r2(gstAmount / 2);
  const sgst = interState ? 0 : r2(gstAmount - cgst); // absorb the rounding remainder
  const igst = interState ? gstAmount : 0;

  const beforeRound = r2(taxable + gstAmount);
  const rounded = roundOffEnabled ? Math.round(beforeRound) : beforeRound;
  const roundOff = r2(rounded - beforeRound);
  const grandTotal = r2(rounded);

  const paid = r2(amountPaid);
  const outstanding = r2(Math.max(0, grandTotal - paid));

  // Effective percentages kept for the legacy list/report/export columns so the
  // register, CSV/Excel exports and GST reports keep working unchanged.
  const gstPercent = taxable > 0 ? r2((gstAmount / taxable) * 100) : 0;
  const discountPercent = subtotal > 0 ? r2((discountAmount / subtotal) * 100) : 0;

  return {
    items,
    subtotal, discountAmount, discountPercent, taxable,
    gstPercent, gstAmount, cgst, sgst, igst, interState: !!interState,
    roundOff, grandTotal,
    amountPaid: paid, outstanding, balance: outstanding,
    amountInWords: amountInWords(grandTotal),
  };
}

/**
 * Seed a single line item from a legacy (headcount × rate) invoice so existing
 * invoices open in the editor with no migration. Once edited, the items become
 * the source of truth while the legacy columns stay in sync.
 */
function seedItemsFromLegacy(inv = {}) {
  const qty = num(inv.employeeCount, 0);
  const rate = num(inv.pricePerEmployee, 0);
  const period = inv.periodStart && inv.periodEnd
    ? ` (${new Date(inv.periodStart).toLocaleDateString('en-IN')} – ${new Date(inv.periodEnd).toLocaleDateString('en-IN')})`
    : '';
  return [{
    id: 'it-1',
    description: `${inv.plan || 'Subscription'} Plan — ${inv.billingCycle || 'Quarterly'} subscription${period}`,
    hsn: '998314', // SAC: information technology / software services
    quantity: qty,
    rate,
    discountPercent: num(inv.discountPercent, 0),
    taxPercent: num(inv.gstPercent, 0),
  }];
}

/**
 * Validate an editable invoice payload. Returns an array of human messages —
 * empty means it may be saved. Rejects negatives and out-of-range percentages
 * (the ticket's "no negative amount / invalid GST / quantity / rate").
 */
function validateInvoice({ lineItems = [], amountPaid = 0, invoiceNo, invoiceDate } = {}) {
  const errors = [];
  if (!Array.isArray(lineItems) || lineItems.length === 0) errors.push('Add at least one invoice item.');
  if (invoiceNo != null && !String(invoiceNo).trim()) errors.push('Invoice Number is required.');
  if (invoiceDate != null && String(invoiceDate).trim() && Number.isNaN(new Date(invoiceDate).getTime())) errors.push('Invoice Date is not a valid date.');

  lineItems.forEach((raw, i) => {
    const it = normalizeItem(raw, i);
    const at = `Item ${i + 1}${it.description ? ` (${it.description.slice(0, 30)})` : ''}`;
    if (!it.description.trim()) errors.push(`${at}: Description is required.`);
    if (!Number.isFinite(Number(raw.quantity)) || it.quantity < 0) errors.push(`${at}: Quantity must be zero or greater.`);
    if (!Number.isFinite(Number(raw.rate)) || it.rate < 0) errors.push(`${at}: Rate must be zero or greater.`);
    if (num(raw.discountPercent, 0) < 0 || num(raw.discountPercent, 0) > 100) errors.push(`${at}: Discount % must be between 0 and 100.`);
    if (num(raw.taxPercent, 0) < 0 || num(raw.taxPercent, 0) > 100) errors.push(`${at}: GST % must be between 0 and 100.`);
    if (r2(it.quantity * it.rate) < 0) errors.push(`${at}: Amount cannot be negative.`);
  });

  if (num(amountPaid, 0) < 0) errors.push('Amount Paid cannot be negative.');
  return errors;
}

/** Statuses whose invoices are locked for editing until explicitly unlocked. */
const LOCKED_STATUSES = ['Paid', 'Cancelled', 'Archived', 'Refunded'];
const isLocked = (inv) => LOCKED_STATUSES.includes(String(inv?.status || '')) && !inv?.editUnlocked;

module.exports = {
  r2, normalizeItem, computeItem, computeInvoiceFromItems,
  seedItemsFromLegacy, validateInvoice, LOCKED_STATUSES, isLocked,
};
