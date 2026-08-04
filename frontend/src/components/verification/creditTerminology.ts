/**
 * Shared wording for the Verification Credit system.
 *
 * ONE VERIFICATION CREDIT = ONE SUCCESSFUL API VERIFICATION.
 *
 * There is no cost per verification, no conversion and no division anywhere.
 * A company holding 50 credits can perform exactly 50 successful verifications;
 * each success deducts exactly 1. "Credits remaining" and "verifications
 * remaining" are the same number, so only one of them is ever shown.
 *
 * Credits are also a QUOTA, not money: they are never priced, charged,
 * recharged or refunded, and no currency symbol may be rendered against one.
 *
 * Every screen that shows a credit figure imports its wording from here so the
 * dashboard, the credits dialog, the allocation form, the ledger and the reports
 * cannot drift apart again.
 */

/** The tooltip attached to every credit figure in the product. */
export const CREDIT_TOOLTIP =
  'Verification Credits represent the number of API verification requests available to this company. One credit allows exactly one successful verification. They are not monetary values.';

/** Singular/plural unit suffix — `12 credits`, `1 credit`. */
export const creditUnit = (n: number) => (Math.abs(n) === 1 ? 'credit' : 'credits');

/** A credit figure with its unit, e.g. `1,250 credits`. Never prefixed with a currency. */
export const formatCredits = (n: number | null | undefined) =>
  `${Number(n ?? 0).toLocaleString()} ${creditUnit(Number(n ?? 0))}`;

/** Bare, grouped credit figure for table cells that carry their own column header. */
export const creditValue = (n: number | null | undefined) => Number(n ?? 0).toLocaleString();

/**
 * What a credit total means, in plain words. Because 1 credit = 1 verification
 * this restates the same number rather than converting it — there is deliberately
 * no second, smaller figure for the reader to reconcile.
 */
export const creditsMeaning = (credits: number) =>
  `${credits.toLocaleString()} successful verification${credits === 1 ? '' : 's'} available`;

/**
 * The helper line under the amount field in the allocation dialog. Spells out
 * what the number the Super Admin just typed will let the company do — which is
 * exactly that number of verifications.
 */
export const allocationHelper = (credits: number) => {
  if (!credits || credits <= 0) {
    return 'One verification credit allows one successful API verification. Credits are a verification quota, not money.';
  }
  return `Adding ${credits.toLocaleString()} verification ${creditUnit(credits)} allows this company to perform exactly ${credits.toLocaleString()} successful API verification${credits === 1 ? '' : 's'}. Each success deducts 1 credit.`;
};

/**
 * Display label for a ledger `transactionType`. The stored values are left
 * exactly as they are — historical rows keep their original type — so this maps
 * them to credit wording at render time only.
 */
export const LEDGER_TYPE_LABEL: Record<string, string> = {
  Allocation: 'Credits Allocated',
  Addition: 'Credits Added',
  Deduction: 'Credits Removed',
  Reset: 'Credits Reset',
  Debit: 'Credit Usage',
  Credit: 'Credits Added',
  Request: 'Credits Requested',
};

export const ledgerTypeLabel = (type: string) => LEDGER_TYPE_LABEL[type] || type;
