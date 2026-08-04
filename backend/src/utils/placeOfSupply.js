// ─────────────────────────────────────────────────────────────────────────────
// GST PLACE OF SUPPLY — THE single decision point
//
// Under Indian GST the tax split follows the PLACE OF SUPPLY, not an operator's
// checkbox:
//
//   supplier state === customer state  →  intra-state  →  CGST + SGST
//   supplier state !== customer state  →  inter-state  →  IGST
//
// This used to be decided in two different ways. The payment-order path derived
// it from the two states, while the subscription-invoice path read a plain
// `!!body.interState` boolean that defaulted to FALSE — so an out-of-state
// customer was invoiced CGST+SGST unless someone remembered to tick a box, and a
// quote could disagree with the invoice raised from it.
//
// Every caller now resolves through here, so the quote, the order, the invoice
// and any regeneration of that invoice can never diverge.
//
// UNKNOWN STATES: if either side's state is blank the split cannot be derived.
// We fall back to CGST+SGST (the historical behaviour, so nothing changes
// silently for existing intra-state tenants) but return `derivable:false` and a
// human-readable `warning`, which callers surface and log instead of pretending
// the answer is authoritative. The fix for that warning is configuring the
// issuer state in Invoice Settings — not ticking a box per invoice.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a state name for comparison (case/whitespace/punctuation-insensitive). */
function normalizeState(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.\-_]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Decide the GST treatment for one supply.
 *
 * @param {string} supplierState the ISSUER's state (ZeniaHR, from Invoice Settings)
 * @param {string} customerState the BILLED company's state
 * @returns {{
 *   interState: boolean, gstType: 'IGST'|'CGST_SGST', derivable: boolean,
 *   supplierState: string, customerState: string, warning: string|null
 * }}
 */
function resolvePlaceOfSupply(supplierState, customerState) {
  const supplier = normalizeState(supplierState);
  const customer = normalizeState(customerState);
  const derivable = Boolean(supplier && customer);

  if (!derivable) {
    const missing = !supplier && !customer
      ? 'neither the issuer state (Invoice Settings) nor the customer state'
      : !supplier
        ? 'the issuer state (Invoice Settings → State)'
        : "the customer's state on the company record";
    return {
      interState: false,
      gstType: 'CGST_SGST',
      derivable: false,
      supplierState: String(supplierState || ''),
      customerState: String(customerState || ''),
      warning:
        `GST place of supply could not be determined because ${missing} is not set. ` +
        'Defaulted to CGST + SGST (intra-state). If this is an inter-state supply the ' +
        'invoice is wrong — set the missing state and regenerate.',
    };
  }

  const interState = supplier !== customer;
  return {
    interState,
    gstType: interState ? 'IGST' : 'CGST_SGST',
    derivable: true,
    supplierState: String(supplierState || ''),
    customerState: String(customerState || ''),
    warning: null,
  };
}

/** Convenience: just the legacy gstType string used by the payment-order path. */
function gstTypeFor(customerState, supplierState) {
  return resolvePlaceOfSupply(supplierState, customerState).gstType;
}

module.exports = { resolvePlaceOfSupply, gstTypeFor, normalizeState };
