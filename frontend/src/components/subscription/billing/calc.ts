// Frontend mirror of backend subscriptionInvoiceEngine.computeInvoice — for the
// LIVE breakdown in the Generate Invoice form. The backend recomputes
// authoritatively on save; this is display-only.
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface Money {
  subtotal: number; discountAmount: number; taxable: number;
  gstAmount: number; cgst: number; sgst: number; igst: number; grandTotal: number;
}

export function computeInvoice(opts: { employeeCount: number; pricePerEmployee: number; discountPercent?: number; gstPercent?: number; interState?: boolean }): Money {
  const { employeeCount = 0, pricePerEmployee = 0, discountPercent = 0, gstPercent = 0, interState = false } = opts;
  const subtotal = r2(employeeCount * pricePerEmployee);
  const discountAmount = r2(subtotal * (discountPercent / 100));
  const taxable = r2(subtotal - discountAmount);
  const gstAmount = r2(taxable * (gstPercent / 100));
  const cgst = interState ? 0 : r2(gstAmount / 2);
  const sgst = interState ? 0 : r2(gstAmount - cgst);
  const igst = interState ? gstAmount : 0;
  const grandTotal = r2(taxable + gstAmount);
  return { subtotal, discountAmount, taxable, gstAmount, cgst, sgst, igst, grandTotal };
}

export const INVOICE_STATUS_VARIANT: Record<string, any> = {
  Draft: 'gray', Pending: 'amber', Paid: 'green', Overdue: 'red', Cancelled: 'gray', Refunded: 'blue',
};
export const RENEWAL_VARIANT: Record<string, any> = { Active: 'green', 'Due Soon': 'amber', Expired: 'red', 'N/A': 'gray' };
