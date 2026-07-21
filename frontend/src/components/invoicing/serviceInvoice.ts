// ─────────────────────────────────────────────────────────────────────────────
// PROFESSIONAL SERVICE INVOICE — the default Invoice Management template.
//
// ONE definition of the layout, shared by:
//   • ServiceInvoiceDocument.tsx — the inline-editable on-screen invoice
//   • serviceInvoiceHtml()        — the print / PDF / email document
// Both use the SAME class names and the SAME css string below, so what is edited
// on screen is exactly what prints. Money comes from computeInvoice(), a mirror
// of backend services/invoiceCalc — the server still recomputes on every save.
//
// SCOPE: Company Head / HR → Invoice Management only. Nothing here is used by
// the Super Admin subscription invoice, payslips, purchase invoices or vendor
// bills, and no existing renderer (invoiceTemplate / invoiceCanvas) is modified.
// ─────────────────────────────────────────────────────────────────────────────
// ── AMOUNT IN WORDS ──────────────────────────────────────────────────────────
// Indian numbering, "Rupees … Only" phrasing. Deliberately local: the classic /
// canvas templates use invoiceTemplate.amountInWords, which phrases it as
// "… Rupees Only" — changing that shared helper would alter every existing
// template's printed output, so this template carries its own.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number): string => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
const three = (n: number): string => {
  const h = Math.floor(n / 100), rest = n % 100;
  return `${h ? `${ONES[h]} Hundred${rest ? ' ' : ''}` : ''}${rest ? two(rest) : ''}`;
};
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
/** e.g. 71384 → "Rupees Seventy One Thousand Three Hundred Eighty Four Only" */
export function amountInWords(amount: number): string {
  const v = Math.abs(Number(amount) || 0);
  const rupees = Math.floor(v);
  const paise = Math.round((v - rupees) * 100);
  const head = `Rupees ${numberToWords(rupees)}`;
  return paise ? `${head} and ${numberToWords(paise)} Paise Only` : `${head} Only`;
}

export const A4_W = 794;   // px @96dpi
export const A4_H = 1123;

export const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
const nn = (n: any) => Math.max(0, Number(n) || 0);
export const inr = (n: any) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: any) => `₹${inr(n)}`;

export interface ServiceItem {
  id?: string;
  name: string;
  description?: string;
  hsnSac?: string;
  quantity: number;
  unit?: string;
  rate: number;
  discountPct?: number;
  /** Absolute discount. When present it WINS over discountPct (see
   *  computeInvoice), so editing the % clears it. Was always read by the money
   *  engine but missing from this type. */
  discountAmt?: number;
  taxRate: number;
  productId?: any;
}

export const blankServiceItem = (): ServiceItem => ({
  id: `it-${Math.round(performance.now() * 1000)}`,
  name: '', description: '', hsnSac: '', quantity: 1, unit: 'Nos', rate: 0, discountPct: 0, taxRate: 18,
});

// ── MONEY ENGINE (mirror of backend services/invoiceCalc) ────────────────────
// Every dependent figure is derived here — nothing in the UI does arithmetic.
export function computeInvoice(items: any[], intraState: boolean) {
  const lines = (items || []).map((it: any) => {
    const quantity = nn(it.quantity);
    const rate = nn(it.rate);
    const gross = r2(quantity * rate);
    const discountPct = nn(it.discountPct);
    let discountAmt = it.discountAmt != null && it.discountAmt !== '' ? nn(it.discountAmt) : r2(gross * discountPct / 100);
    if (discountAmt > gross) discountAmt = gross;
    const taxableValue = r2(gross - discountAmt);
    const taxRate = nn(it.taxRate);
    const totalTax = r2(taxableValue * taxRate / 100);
    const cgst = intraState ? r2(totalTax / 2) : 0;
    const sgst = intraState ? r2(totalTax - cgst) : 0;
    const igst = intraState ? 0 : totalTax;
    return {
      ...it, quantity, rate, discountPct, discountAmt: r2(discountAmt), taxableValue, taxRate,
      taxAmount: totalTax, cgst, sgst, igst, amount: r2(taxableValue + totalTax),
      gross, taxable: taxableValue,
    };
  });
  const sum = (k: string) => r2(lines.reduce((s: number, l: any) => s + (Number(l[k]) || 0), 0));
  // Subtotal sums the UNROUNDED products exactly as services/invoiceCalc does —
  // summing pre-rounded line grosses drifts by a paise on some combinations.
  const subtotal = r2(lines.reduce((s: number, l: any) => s + l.quantity * l.rate, 0));
  const taxableAmount = sum('taxableValue');
  const cgst = sum('cgst'), sgst = sum('sgst'), igst = sum('igst');
  const preRound = r2(taxableAmount + cgst + sgst + igst);
  const grandTotal = Math.round(preRound);
  return {
    lines,
    subtotal,
    discountTotal: sum('discountAmt'),
    taxableAmount, cgst, sgst, igst,
    taxTotal: r2(cgst + sgst + igst),
    roundOff: r2(grandTotal - preRound),
    grandTotal: Math.max(0, grandTotal),
  };
}

// ── BANK BLOCK ───────────────────────────────────────────────────────────────
// The invoice stores bank details as a labelled text block (the existing
// `bankDetails` column — no schema change), but edits them as discrete fields.
// These two helpers are the single parse/serialise pair used by every screen.
export const BANK_FIELDS = ['Bank', 'Account Name', 'Account No.', 'IFSC', 'Branch'] as const;
export type BankField = (typeof BANK_FIELDS)[number];

export function parseBank(block: any): Record<string, string> {
  const out: Record<string, string> = {};
  String(block ?? '').split('\n').forEach((line) => {
    const i = line.indexOf(':');
    if (i < 0) return;
    const key = line.slice(0, i).trim();
    const match = BANK_FIELDS.find((f) => f.toLowerCase().replace(/\W/g, '') === key.toLowerCase().replace(/\W/g, ''));
    if (match) out[match] = line.slice(i + 1).trim();
  });
  return out;
}

export const serialiseBank = (fields: Record<string, string>): string =>
  BANK_FIELDS.filter((f) => String(fields[f] ?? '').trim())
    .map((f) => `${f}: ${String(fields[f]).trim()}`)
    .join('\n');

/** Outstanding / balance for a given paid amount. */
export const outstandingOf = (grandTotal: number, amountPaid: number) => r2(Math.max(0, r2(grandTotal) - r2(amountPaid)));

// ── ISSUER (the "from" side) ─────────────────────────────────────────────────
// Resolved from the company master + saved Invoice Settings. Settings win, so
// Template Settings configured once are reused by every future invoice.
export interface Issuer {
  logo: string; seal: string; signature: string; qr: string; signatureText: string;
  /** LEGAL entity name — the parent company, never a branch. */
  name: string;
  /** Operating location: "Head Office" | "Ahmedabad Branch". Blank when unknown. */
  branchLabel: string;
  address: string; phone: string; email: string; website: string;
  gstin: string; pan: string; cin: string;
  bankDetails: string; upiId: string;
  footerText: string; notes: string; terms: string; accent: string;
}

/** Placeholders so a missing value is stated, never rendered as an empty box. */
export const NOT_CONFIGURED = 'Not Configured';
export const NO_SIGNATURE = 'No Signature Uploaded';

/**
 * Only a REAL image source may reach an <img>. Company.logo holds a 2-letter
 * avatar ("PM"), which would otherwise render as a broken image — this is the
 * guard that keeps such values out of the document.
 */
export const isImageSrc = (v: any): boolean => {
  const s = String(v ?? '').trim();
  return /^data:image\//i.test(s) || /^https?:\/\//i.test(s) || (s.startsWith('/') && /\.(png|jpe?g|svg|webp|gif)$/i.test(s));
};
const img = (...candidates: any[]) => candidates.map((v) => String(v ?? '').trim()).find(isImageSrc) || '';
const first = (...candidates: any[]) => candidates.map((v) => String(v ?? '').trim()).find(Boolean) || '';

/**
 * COMPANY PROFILE → INVOICE.
 *
 * Company Profile is the source of truth for branding and business details, so
 * nothing has to be re-uploaded for invoicing. Because the company row is read
 * live on every render, updating the profile changes the very next invoice —
 * there is no cached copy.
 *
 * Invoice Settings act as an optional OVERRIDE: a value entered there (e.g. a
 * billing-specific GSTIN or bank block) wins, and leaving it blank falls back to
 * Company Profile.
 */
export function resolveIssuer(company: any, settings: any, override?: any): Issuer {
  const c = company || {}, s = settings || {};
  // Per-invoice override (this invoice only) beats the company default, which
  // beats Company Profile. Parsed defensively — bad JSON simply means "none".
  let o: any = {};
  if (override) { try { o = typeof override === 'string' ? JSON.parse(override) : override; } catch { o = {}; } }
  if (!o || typeof o !== 'object') o = {};

  // Address: registered / head-office / corporate, then city · state · country.
  const line1 = first(c.address, c.registeredOfficeAddress, c.headOfficeAddress, c.corporateAddress, c.billingAddress, c.addressLine1);
  const line2 = [c.city, c.state, c.pincode || c.zipCode, c.country].map((x: any) => String(x ?? '').trim()).filter(Boolean).join(', ');
  const address = [line1, line2].filter(Boolean).join(', ');

  // Bank block: an explicit override, else composed from the Company Profile
  // bank fields (only the ones actually filled in).
  const composedBank = [
    c.bankName && `Bank: ${c.bankName}`,
    c.accountHolderName && `Account Name: ${c.accountHolderName}`,
    c.bankAccountNumber && `Account No.: ${c.bankAccountNumber}`,
    c.ifscCode && `IFSC: ${c.ifscCode}`,
    c.bankBranch && `Branch: ${c.bankBranch}`,
  ].filter(Boolean).join('\n');

  return {
    // Images — override → billing default → Company Profile. Each candidate is
    // validated, so a broken <img> can never be emitted.
    logo: img(o.logo, s.logoUrl, c.logoImage, c.companyLogo, c.logo),
    seal: img(o.stamp, s.stampUrl, c.stampImage, c.sealImage, c.seal),
    signature: img(o.signature, s.signatureUrl, c.digitalSignatureImage, c.signatureImage, c.authorizedSignatureImage),
    qr: img(o.qr, s.qrUrl, c.paymentQrImage, c.qrImage),
    signatureText: first(c.signatureText, c.authorizedSignatory && `${c.authorizedSignatory}${c.signatoryDesignation ? `, ${c.signatoryDesignation}` : ''}`),

    // The legal entity. `company` is already parent-resolved by invoiceIdentity —
    // a branch name can never land here — and `branchLabel` names the operating
    // location underneath it.
    name: first(c.name, c.companyName, 'Your Company'),
    branchLabel: first(c.branchLabel),
    address,
    phone: first(c.phone, c.contactNumber, c.mobile),
    email: first(c.contactEmail, c.email, c.adminEmail, c.supportEmail),
    website: first(c.website),

    gstin: first(s.companyGstin, c.gstNumber, c.gstin),
    pan: first(c.panNumber, c.pan),
    cin: first(c.cinNumber, c.cin),

    bankDetails: first(s.bankDetails, composedBank),
    upiId: first(s.upiId, c.upiId),

    footerText: first(s.footerText, 'This is a computer-generated invoice and does not require a signature.'),
    notes: first(s.defaultNotes),
    terms: first(s.defaultTerms, c.paymentTerms),
    accent: first(s.themeColor, '#1f2937'),
  };
}

// ── SHARED STYLES ────────────────────────────────────────────────────────────
// Used verbatim by BOTH renderers. `.si-` prefixed so it can never collide with
// the app's Tailwind classes or any other invoice template.
export const SERVICE_INVOICE_CSS = `
.si-page{width:${A4_W}px;min-height:${A4_H}px;background:#fff;color:#111827;
  font-family:"Segoe UI",Roboto,Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;
  box-sizing:border-box;padding:22px 24px 18px;display:flex;flex-direction:column}
.si-page *{box-sizing:border-box}
.si-frame{border:1.5px solid #111827;flex:1;display:flex;flex-direction:column}
.si-head{display:flex;border-bottom:1.5px solid #111827}
.si-head-l{flex:1.35;padding:10px 12px;border-right:1.5px solid #111827}
.si-head-r{flex:1;padding:0}
.si-logo{max-height:46px;max-width:170px;object-fit:contain;margin-bottom:6px;display:block}
.si-co-name{font-size:16px;font-weight:800;letter-spacing:.2px;line-height:1.2}
.si-co-branch{font-size:10.5px;font-weight:700;color:#374151;letter-spacing:.2px;margin-top:5px;
  padding-top:4px;border-top:1px dashed #d1d5db}
.si-co-line{font-size:10.5px;color:#374151;margin-top:2px}
.si-co-stat{font-size:10.5px;font-weight:700;margin-top:4px}
.si-title{background:#111827;color:#fff;text-align:center;font-size:13px;font-weight:800;
  letter-spacing:2px;padding:6px 0}
.si-meta{width:100%;border-collapse:collapse}
.si-meta td{border-top:1px solid #d1d5db;padding:3px 8px;font-size:10.5px;vertical-align:top}
.si-meta td.k{width:44%;color:#4b5563;font-weight:600;border-right:1px solid #d1d5db}
.si-meta td.v{font-weight:700}
.si-bill{display:flex;border-bottom:1.5px solid #111827}
.si-bill-l{flex:1.35;padding:8px 12px;border-right:1.5px solid #111827}
.si-bill-r{flex:1;padding:8px 12px}
.si-lbl{font-size:9px;font-weight:800;letter-spacing:1px;color:#6b7280;text-transform:uppercase;margin-bottom:3px}
.si-bill-name{font-size:12.5px;font-weight:800}
.si-bill-line{font-size:10.5px;color:#374151}
.si-items{width:100%;border-collapse:collapse;table-layout:fixed}
.si-items th{background:#f3f4f6;border-bottom:1.5px solid #111827;border-right:1px solid #d1d5db;
  padding:6px 6px;font-size:9.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#111827}
.si-items td{border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:6px;font-size:10.5px;vertical-align:top}
.si-items th:last-child,.si-items td:last-child{border-right:none}
.si-items .num{text-align:right;font-variant-numeric:tabular-nums}
.si-items .ctr{text-align:center}
.si-desc{font-weight:700;word-break:break-word}
.si-sub{font-size:9.5px;color:#6b7280;white-space:pre-wrap;word-break:break-word;margin-top:2px}
.si-foot{display:flex;border-top:1.5px solid #111827;margin-top:auto}
.si-foot-l{flex:1.35;border-right:1.5px solid #111827;padding:8px 12px}
.si-foot-r{flex:1}
.si-tot{width:100%;border-collapse:collapse}
.si-tot td{padding:4px 10px;font-size:10.5px;border-bottom:1px solid #e5e7eb}
.si-tot td.k{color:#374151}
.si-tot td.v{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;width:42%}
.si-tot tr.grand td{background:#111827;color:#fff;font-size:12.5px;font-weight:800;border-bottom:none;padding:7px 10px}
.si-tot tr.due td{background:#fef2f2;color:#991b1b;font-weight:800}
.si-words{border-top:1.5px solid #111827;border-bottom:1.5px solid #111827;padding:6px 12px;font-size:10.5px}
.si-words b{text-transform:uppercase;font-size:9px;letter-spacing:1px;color:#6b7280}
.si-bank{display:flex;border-bottom:1.5px solid #111827}
.si-bank-l{flex:1.35;padding:8px 12px;border-right:1.5px solid #111827}
.si-bank-r{flex:1;padding:8px 12px;display:flex;gap:10px;align-items:flex-start}
.si-kv{font-size:10.5px;display:flex;gap:6px}
.si-kv span:first-child{color:#6b7280;min-width:74px}
.si-kv span:last-child{font-weight:700}
.si-qr{width:74px;height:74px;border:1px dashed #9ca3af;border-radius:4px;display:flex;
  align-items:center;justify-content:center;font-size:8px;color:#9ca3af;text-align:center;flex:0 0 auto}
.si-qr img{width:100%;height:100%;object-fit:contain}
.si-end{display:flex}
.si-end-l{flex:1.35;padding:8px 12px;border-right:1.5px solid #111827}
.si-end-r{flex:1;padding:8px 12px;text-align:center;display:flex;flex-direction:column;justify-content:space-between}
.si-terms{font-size:9.5px;color:#374151;white-space:pre-wrap;word-break:break-word}
.si-seal{width:78px;height:78px;border:1px dashed #9ca3af;border-radius:50%;display:flex;align-items:center;
  justify-content:center;font-size:8px;color:#9ca3af;margin:4px auto 0;text-align:center;line-height:1.2}
.si-sign{height:38px;object-fit:contain;margin:0 auto;display:block}
.si-stamp{width:78px;height:78px;object-fit:contain;margin:4px auto 0;display:block}
.si-sign-name{font-size:10px;font-weight:700;color:#374151}
.si-sign-lbl{font-size:10px;font-weight:800;border-top:1px solid #111827;padding-top:3px;margin-top:6px}
/* A value that Company Profile has not supplied — stated, never an empty box. */
.si-missing{color:#9ca3af;font-style:italic;font-weight:600}
.si-note{text-align:center;font-size:9px;color:#6b7280;padding:6px 0 0}
@media print{
  @page{size:A4 portrait;margin:8mm}
  html,body{margin:0;padding:0;background:#fff}
  .si-page{width:auto;min-height:auto;padding:0;box-shadow:none}
  .si-items tr{page-break-inside:avoid}
}
`;

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
const nl = (s: any) => esc(s).replace(/\n/g, '<br/>');

/** Header key/value rows — a blank value hides its row entirely. */
export const metaRows = (inv: any, sacFallback: string) => ([
  ['Invoice No.', inv.invoiceNumber],
  ['Invoice Date', inv.invoiceDate],
  ['Due Date', inv.dueDate],
  ['Contract No.', inv.contractNo],
  ['Reference No.', inv.referenceNo],
  ['P.O. No.', inv.poNumber],
  ['SAC / HSN', inv.sacHsn || sacFallback],
  ['Billing Period', inv.billingPeriod],
] as [string, any][]).filter(([, v]) => String(v ?? '').trim() !== '');

/** Bill-to lines — blanks are dropped so the block never shows empty labels. */
export const billToLines = (inv: any) => ([
  inv.billToAddress,
  [inv.billToCity, inv.billToState, inv.billToCountry].filter(Boolean).join(', '),
  inv.billToGstin ? `GSTIN: ${inv.billToGstin}` : '',
  inv.billToPan ? `PAN: ${inv.billToPan}` : '',
  inv.billToEmail, inv.billToPhone,
  inv.billToContact ? `Contact: ${inv.billToContact}` : '',
] as any[]).map((x) => String(x ?? '').trim()).filter(Boolean);

/** Totals rows — zero-value optional rows are hidden, mandatory ones always show. */
export const totalsRows = (t: any, intraState: boolean, amountPaid: number) => {
  const rows: { k: string; v: number; cls?: string }[] = [
    { k: 'Subtotal', v: t.subtotal },
  ];
  if (t.discountTotal > 0) rows.push({ k: 'Discount', v: -t.discountTotal });
  rows.push({ k: 'Taxable Amount', v: t.taxableAmount });
  if (intraState) {
    if (t.cgst > 0) rows.push({ k: 'CGST', v: t.cgst });
    if (t.sgst > 0) rows.push({ k: 'SGST', v: t.sgst });
  } else if (t.igst > 0) rows.push({ k: 'IGST', v: t.igst });
  if (t.roundOff !== 0) rows.push({ k: 'Round Off', v: t.roundOff });
  return rows;
};

/**
 * The A4 print / PDF / email document. Same markup + same CSS as the on-screen
 * editable invoice, so the printed page matches the preview exactly.
 */
export function serviceInvoiceHtml(
  inv: any,
  company: any,
  settings: any,
  opts: { print?: boolean; qrDataUrl?: string } = {},
): string {
  const iss = resolveIssuer(company, settings, inv.brandingOverride);
  const intraState = inv.intraState !== false;
  const items = Array.isArray(inv.items) ? inv.items : [];
  const t = computeInvoice(items, intraState);
  const paid = r2(inv.amountPaid);
  const due = outstandingOf(t.grandTotal, paid);
  const sac = items.map((i: any) => i.hsnSac).filter(Boolean)[0] || '';

  const meta = metaRows(inv, sac)
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('');

  const rows = t.lines.map((l: any, i: number) => `
    <tr>
      <td class="ctr">${i + 1}</td>
      <td><div class="si-desc">${esc(l.name || 'Service')}</div>${l.description ? `<div class="si-sub">${nl(l.description)}</div>` : ''}${l.hsnSac ? `<div class="si-sub">SAC/HSN: ${esc(l.hsnSac)}</div>` : ''}</td>
      <td class="num">${inr(l.rate)}</td>
      <td class="ctr">${inr(l.quantity)}${l.unit ? ` ${esc(l.unit)}` : ''}</td>
      <td class="ctr">${l.discountPct ? `${inr(l.discountPct)}%` : '—'}</td>
      <td class="num">${inr(l.taxableValue)}</td>
      <td class="ctr">${inr(l.taxRate)}%</td>
      <td class="num">${inr(l.taxAmount)}</td>
      <td class="num">${inr(l.amount)}</td>
    </tr>`).join('');

  const totals = totalsRows(t, intraState, paid)
    .map((r) => `<tr><td class="k">${esc(r.k)}</td><td class="v">${r.v < 0 ? `- ${inr(Math.abs(r.v))}` : inr(r.v)}</td></tr>`).join('');
  const paidRows = paid > 0
    ? `<tr><td class="k">Amount Paid</td><td class="v">${inr(paid)}</td></tr>
       <tr class="due"><td class="k">Outstanding / Balance</td><td class="v">${inr(due)}</td></tr>`
    : '';

  const bank = String(inv.bankDetails || iss.bankDetails || '').trim();
  const upi = String(inv.upiId || iss.upiId || '').trim();
  const notes = String(inv.notes || '').trim();
  const terms = String(inv.termsConditions || '').trim();

  const body = `
<div class="si-page">
  <div class="si-frame">
    <div class="si-head">
      <div class="si-head-l">
        ${iss.logo ? `<img class="si-logo" src="${esc(iss.logo)}" alt=""/>` : ''}
        <div class="si-co-name">${esc(iss.name)}</div>
        ${iss.address ? `<div class="si-co-line">${nl(iss.address)}</div>` : ''}
        ${iss.phone ? `<div class="si-co-line">Phone: ${esc(iss.phone)}</div>` : ''}
        ${iss.email ? `<div class="si-co-line">Email: ${esc(iss.email)}</div>` : ''}
        ${iss.website ? `<div class="si-co-line">${esc(iss.website)}</div>` : ''}
        <div class="si-co-stat">GSTIN: ${iss.gstin ? esc(iss.gstin) : `<span class="si-missing">${NOT_CONFIGURED}</span>`}</div>
        <div class="si-co-stat">PAN: ${iss.pan ? esc(iss.pan) : `<span class="si-missing">${NOT_CONFIGURED}</span>`}</div>
        ${iss.cin ? `<div class="si-co-stat">CIN: ${esc(iss.cin)}</div>` : ''}
        ${/* The operating location, stated separately BELOW the legal identity —
              never a replacement for the company name above. */''}
        ${iss.branchLabel ? `<div class="si-co-branch">Branch: ${esc(iss.branchLabel)}</div>` : ''}
      </div>
      <div class="si-head-r">
        <div class="si-title">TAX INVOICE</div>
        <table class="si-meta">${meta}</table>
      </div>
    </div>

    <div class="si-bill">
      <div class="si-bill-l">
        <div class="si-lbl">Bill To</div>
        <div class="si-bill-name">${esc(inv.billToName || 'Customer')}</div>
        ${billToLines(inv).map((l) => `<div class="si-bill-line">${nl(l)}</div>`).join('')}
      </div>
      <div class="si-bill-r">
        <div class="si-lbl">Place of Supply</div>
        <div class="si-bill-line">${esc(inv.placeOfSupply || inv.billToState || '—')}</div>
        ${inv.paymentTerms ? `<div class="si-lbl" style="margin-top:6px">Payment Terms</div><div class="si-bill-line">${esc(inv.paymentTerms)}</div>` : ''}
      </div>
    </div>

    <table class="si-items">
      <thead><tr>
        <th style="width:5%">Sr</th><th style="width:31%">Particulars / Service Description</th>
        <th style="width:10%">Rate</th><th style="width:8%">Qty</th><th style="width:7%">Disc %</th>
        <th style="width:11%">Taxable</th>
        <th style="width:7%">GST %</th><th style="width:10%">GST Amt</th><th style="width:11%">Total</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="ctr" style="padding:18px;color:#9ca3af">No items</td></tr>'}</tbody>
    </table>

    <div class="si-foot">
      <div class="si-foot-l">
        ${notes ? `<div class="si-lbl">Notes</div><div class="si-terms">${nl(notes)}</div>` : ''}
      </div>
      <div class="si-foot-r">
        <table class="si-tot">
          ${totals}
          <tr class="grand"><td class="k" style="color:#fff">Grand Total</td><td class="v" style="color:#fff">₹${inr(t.grandTotal)}</td></tr>
          ${paidRows}
        </table>
      </div>
    </div>

    <div class="si-words"><b>Amount in Words</b><br/>${esc(amountInWords(t.grandTotal))}</div>

    <div class="si-bank">
      <div class="si-bank-l">
        <div class="si-lbl">Bank Details</div>
        ${bank ? `<div class="si-terms">${nl(bank)}</div>` : `<div class="si-terms si-missing">${NOT_CONFIGURED}</div>`}
      </div>
      <div class="si-bank-r">
        <div style="flex:1">
          <div class="si-lbl">Payment</div>
          ${inv.paymentMode ? `<div class="si-kv"><span>Mode</span><span>${esc(inv.paymentMode)}</span></div>` : ''}
          ${upi ? `<div class="si-kv"><span>UPI ID</span><span>${esc(upi)}</span></div>` : ''}
        </div>
        <div class="si-qr">${(opts.qrDataUrl || iss.qr)
          ? `<img src="${esc(opts.qrDataUrl || iss.qr)}" alt="Payment QR code"/>`
          : '<span class="si-missing">Scan &amp;<br/>Pay QR</span>'}</div>
      </div>
    </div>

    <div class="si-end">
      <div class="si-end-l">
        ${terms ? `<div class="si-lbl">Terms &amp; Conditions</div><div class="si-terms">${nl(terms)}</div>` : ''}
      </div>
      <div class="si-end-r">
        <div>
          <div class="si-lbl">For ${esc(iss.name)}</div>
          ${iss.seal
            ? `<img class="si-stamp" src="${esc(iss.seal)}" alt="Company seal"/>`
            : '<div class="si-seal">COMPANY<br/>SEAL</div>'}
        </div>
        <div>
          ${iss.signature
            ? `<img class="si-sign" src="${esc(iss.signature)}" alt="Authorised signature"/>`
            : `<div class="si-sign si-missing" style="display:flex;align-items:flex-end;justify-content:center">${NO_SIGNATURE}</div>`}
          ${iss.signatureText ? `<div class="si-sign-name">${esc(iss.signatureText)}</div>` : ''}
          <div class="si-sign-lbl">Authorised Signatory</div>
        </div>
      </div>
    </div>
  </div>
  <div class="si-note">${esc(iss.footerText)}</div>
</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(inv.invoiceNumber || 'Invoice')}</title>
<style>*{margin:0;padding:0}body{background:#e5e7eb;display:flex;justify-content:center;padding:16px}
@media print{body{background:#fff;padding:0;display:block}}
${SERVICE_INVOICE_CSS}</style></head>
<body>${body}${opts.print ? '<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>' : ''}</body></html>`;
}
