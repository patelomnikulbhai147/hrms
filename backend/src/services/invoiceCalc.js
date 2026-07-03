// ─────────────────────────────────────────────────────────────────────────────
// invoiceCalc — the single, server-authoritative money engine for invoices.
//
// Computes per-line taxable value, CGST/SGST (intra-state) or IGST (inter-state),
// and the invoice totals (subtotal, discount, taxable, tax, round-off, grand
// total). All values are rounded to 2dp and can NEVER be negative. The client
// may show a preview, but this is the source of truth on every save.
// ─────────────────────────────────────────────────────────────────────────────
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nn = (n) => Math.max(0, Number(n) || 0); // non-negative number

// Compute ONE line. `intraState` = customer state === company state → split GST.
function computeLine(item, intraState) {
  const quantity = nn(item.quantity);
  const rate = nn(item.rate);
  const gross = r2(quantity * rate);
  // Discount: an explicit amount wins; otherwise a percentage of gross.
  const discountPct = nn(item.discountPct);
  let discountAmt = item.discountAmt != null && item.discountAmt !== '' ? nn(item.discountAmt) : r2(gross * discountPct / 100);
  if (discountAmt > gross) discountAmt = gross; // never discount below zero
  const taxableValue = r2(gross - discountAmt);
  const taxRate = nn(item.taxRate);
  const totalTax = r2(taxableValue * taxRate / 100);
  const cgst = intraState ? r2(totalTax / 2) : 0;
  const sgst = intraState ? r2(totalTax - cgst) : 0; // absorb rounding into sgst
  const igst = intraState ? 0 : totalTax;
  const amount = r2(taxableValue + cgst + sgst + igst);
  return {
    ...item,
    quantity, rate, discountPct,
    discountAmt: r2(discountAmt),
    taxRate, taxableValue, cgst, sgst, igst, amount,
  };
}

// Compute the whole invoice from raw items. Returns { lines, totals }.
function computeInvoice(items, { intraState = true } = {}) {
  const lines = (items || []).map((it) => computeLine(it, intraState));
  const subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.rate, 0));
  const discountTotal = r2(lines.reduce((s, l) => s + l.discountAmt, 0));
  const taxableAmount = r2(lines.reduce((s, l) => s + l.taxableValue, 0));
  const cgst = r2(lines.reduce((s, l) => s + l.cgst, 0));
  const sgst = r2(lines.reduce((s, l) => s + l.sgst, 0));
  const igst = r2(lines.reduce((s, l) => s + l.igst, 0));
  const preRound = r2(taxableAmount + cgst + sgst + igst);
  const grandTotal = Math.round(preRound); // round to nearest rupee
  const roundOff = r2(grandTotal - preRound);
  return {
    lines,
    totals: { subtotal, discountTotal, taxableAmount, cgst, sgst, igst, roundOff, grandTotal: Math.max(0, grandTotal) },
  };
}

// Derive the payment status from paid vs total (single source for status).
function paymentStatusFor(grandTotal, amountPaid) {
  const total = r2(grandTotal);
  const paid = r2(amountPaid);
  if (paid <= 0) return 'unpaid';
  if (paid + 0.01 < total) return 'partial';
  return 'paid';
}

// ── Invoice-number generation ────────────────────────────────────────────────
// Indian financial year for a date: Apr 2026–Mar 2027 → "2026-27".
function financialYear(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  const startYear = m >= 3 ? y : y - 1; // FY starts in April (month index 3)
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

// Build an invoice number from the settings format + sequence.
//   tokens: {PREFIX} {FY} {YYYY} {MM} {SEQ}
function formatInvoiceNumber(settings, seq, dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const seqStr = String(seq).padStart(Math.max(1, settings.seqPadding || 4), '0');
  return String(settings.numberFormat || '{PREFIX}-{FY}-{SEQ}')
    .replace(/\{PREFIX\}/g, settings.invoicePrefix || 'INV')
    .replace(/\{FY\}/g, financialYear(dateStr))
    .replace(/\{YYYY\}/g, String(d.getFullYear()))
    .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, '0'))
    .replace(/\{SEQ\}/g, seqStr);
}

module.exports = { computeInvoice, computeLine, paymentStatusFor, formatInvoiceNumber, financialYear, r2, nn };
