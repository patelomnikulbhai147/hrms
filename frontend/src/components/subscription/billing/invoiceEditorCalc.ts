// ─────────────────────────────────────────────────────────────────────────────
// INVOICE EDITOR CALC — frontend mirror of backend services/invoiceEditorEngine.
// The SINGLE place the editor derives money, so changing any input instantly
// recomputes every dependent figure with no manual arithmetic anywhere in the UI.
// The backend recomputes authoritatively on save; this drives the live preview.
//
// Self-contained on purpose (including amount-in-words) so the Subscription
// billing editor never couples to the Customer/Payroll/Employee invoice modules.
// ─────────────────────────────────────────────────────────────────────────────
export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: any, dflt = 0) => { const n = Number(v); return Number.isFinite(n) ? n : dflt; };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface LineItem {
  id: string;
  description: string;
  hsn: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxPercent: number;
}
export interface ComputedItem extends LineItem {
  gross: number; discountAmount: number; taxable: number; gstAmount: number; total: number;
}
export interface ComputedInvoice {
  items: ComputedItem[];
  subtotal: number; discountAmount: number; discountPercent: number; taxable: number;
  gstPercent: number; gstAmount: number; cgst: number; sgst: number; igst: number; interState: boolean;
  roundOff: number; grandTotal: number; amountPaid: number; outstanding: number; balance: number;
  amountInWords: string;
}

export const blankItem = (n = 1): LineItem => ({
  id: `it-${Date.now()}-${n}`, description: '', hsn: '', quantity: 1, rate: 0, discountPercent: 0, taxPercent: 18,
});

export function normalizeItem(raw: any, idx = 0): LineItem {
  return {
    id: String(raw?.id || `it-${idx + 1}`),
    description: String(raw?.description ?? '').slice(0, 500),
    hsn: String(raw?.hsn ?? raw?.hsnSac ?? '').slice(0, 20),
    quantity: num(raw?.quantity, 0),
    rate: num(raw?.rate, 0),
    discountPercent: clamp(num(raw?.discountPercent, 0), 0, 100),
    taxPercent: clamp(num(raw?.taxPercent, 0), 0, 100),
  };
}

export function computeItem(item: LineItem): ComputedItem {
  const gross = r2(item.quantity * item.rate);
  const discountAmount = r2(gross * (item.discountPercent / 100));
  const taxable = r2(gross - discountAmount);
  const gstAmount = r2(taxable * (item.taxPercent / 100));
  const total = r2(taxable + gstAmount);
  return { ...item, gross, discountAmount, taxable, gstAmount, total };
}

export function computeInvoiceFromItems(opts: {
  lineItems: any[]; interState?: boolean; roundOffEnabled?: boolean; amountPaid?: number;
}): ComputedInvoice {
  const { lineItems = [], interState = false, roundOffEnabled = true, amountPaid = 0 } = opts;
  const items = (Array.isArray(lineItems) ? lineItems : []).map(normalizeItem).map(computeItem);

  const sum = (k: keyof ComputedItem) => r2(items.reduce((t, i) => t + (i[k] as number), 0));
  const subtotal = sum('gross');
  const discountAmount = sum('discountAmount');
  const taxable = sum('taxable');
  const gstAmount = sum('gstAmount');

  const cgst = interState ? 0 : r2(gstAmount / 2);
  const sgst = interState ? 0 : r2(gstAmount - cgst);
  const igst = interState ? gstAmount : 0;

  const beforeRound = r2(taxable + gstAmount);
  const rounded = roundOffEnabled ? Math.round(beforeRound) : beforeRound;
  const roundOff = r2(rounded - beforeRound);
  const grandTotal = r2(rounded);

  const paid = r2(amountPaid);
  const outstanding = r2(Math.max(0, grandTotal - paid));

  return {
    items, subtotal, discountAmount,
    discountPercent: subtotal > 0 ? r2((discountAmount / subtotal) * 100) : 0,
    taxable,
    gstPercent: taxable > 0 ? r2((gstAmount / taxable) * 100) : 0,
    gstAmount, cgst, sgst, igst, interState: !!interState,
    roundOff, grandTotal, amountPaid: paid, outstanding, balance: outstanding,
    amountInWords: amountInWords(grandTotal),
  };
}

/** Validation mirror — same rules the backend enforces on save. */
export function validateInvoice(o: { lineItems: any[]; invoiceNo?: string; invoiceDate?: string }): string[] {
  const errors: string[] = [];
  if (!Array.isArray(o.lineItems) || o.lineItems.length === 0) errors.push('Add at least one invoice item.');
  if (o.invoiceNo !== undefined && !String(o.invoiceNo).trim()) errors.push('Invoice Number is required.');
  if (o.invoiceDate && Number.isNaN(new Date(o.invoiceDate).getTime())) errors.push('Invoice Date is not a valid date.');
  (o.lineItems || []).forEach((raw: any, i: number) => {
    const it = normalizeItem(raw, i);
    const at = `Item ${i + 1}`;
    if (!it.description.trim()) errors.push(`${at}: Description is required.`);
    if (!Number.isFinite(Number(raw?.quantity)) || it.quantity < 0) errors.push(`${at}: Quantity must be zero or greater.`);
    if (!Number.isFinite(Number(raw?.rate)) || it.rate < 0) errors.push(`${at}: Rate must be zero or greater.`);
    if (num(raw?.discountPercent, 0) < 0 || num(raw?.discountPercent, 0) > 100) errors.push(`${at}: Discount % must be between 0 and 100.`);
    if (num(raw?.taxPercent, 0) < 0 || num(raw?.taxPercent, 0) > 100) errors.push(`${at}: GST % must be between 0 and 100.`);
  });
  return errors;
}

// ── Indian-numbering amount to words (mirror of backend utils/amountInWords) ──
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number): string => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
function three(n: number): string {
  const h = Math.floor(n / 100), rest = n % 100;
  return (h ? ONES[h] + ' Hundred' + (rest ? ' ' : '') : '') + (rest ? two(rest) : '');
}
export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  return [
    crore ? `${three(crore)} Crore` : '',
    lakh ? `${three(lakh)} Lakh` : '',
    thousand ? `${three(thousand)} Thousand` : '',
    n ? three(n) : '',
  ].filter(Boolean).join(' ').trim();
}
export function amountInWords(amount: number): string {
  const v = Math.abs(Number(amount) || 0);
  const rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  const head = `Rupees ${numberToWords(rupees)}`;
  return paise ? `${head} and ${numberToWords(paise)} Paise Only` : `${head} Only`;
}
