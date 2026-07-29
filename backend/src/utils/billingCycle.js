// ─────────────────────────────────────────────────────────────────────────────
// BILLING CYCLE — the single server-side vocabulary for a subscription's period.
//
// A company picks its cycle ONCE, at onboarding (or when its subscription is
// changed), and it is stored on `CompanySubscription.billingCycle`. Everything
// that is billed afterwards — most notably employee slot purchases — INHERITS
// that value by reading the active subscription. The cycle is therefore never
// accepted as a client input on a purchase; a request that carries one is
// ignored, not honoured.
//
// `Company.billingCycle` is a legacy column that predates CompanySubscription
// and historically held values like 'Monthly'. It is kept in sync as a mirror
// (exports and older screens still read it) but the SUBSCRIPTION row is the
// source of truth. normalizeBillingCycle() is what stops a legacy/junk value
// from ever reaching the subscription: anything unrecognised falls back.
// ─────────────────────────────────────────────────────────────────────────────

const BILLING_CYCLES = ['Quarterly', 'Yearly'];
const DEFAULT_BILLING_CYCLE = 'Quarterly';

/** True only for an exact, storable cycle value. */
const isBillingCycle = (value) => BILLING_CYCLES.includes(value);

/**
 * Coerce any input into a storable cycle.
 *
 * Accepts the canonical values plus the common synonyms a form or an import can
 * produce ('yearly', 'annual', 'ANNUALLY', 'quarter'). Everything else — blank,
 * null, 'Monthly', a number, an object — resolves to `fallback`, so a bad value
 * degrades to the safe default instead of corrupting the subscription record.
 *
 * @param {*} value               the raw candidate
 * @param {string} [fallback]     used when `value` is unrecognised; itself
 *                                validated, so a bad fallback can't leak either
 * @returns {'Quarterly'|'Yearly'}
 */
function normalizeBillingCycle(value, fallback = DEFAULT_BILLING_CYCLE) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  if (v === 'yearly' || v === 'annual' || v === 'annually' || v === 'year') return 'Yearly';
  if (v === 'quarterly' || v === 'quarter') return 'Quarterly';
  return isBillingCycle(fallback) ? fallback : DEFAULT_BILLING_CYCLE;
}

module.exports = { BILLING_CYCLES, DEFAULT_BILLING_CYCLE, isBillingCycle, normalizeBillingCycle };
