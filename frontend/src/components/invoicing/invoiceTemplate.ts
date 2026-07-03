// ─────────────────────────────────────────────────────────────────────────────
// invoiceTemplate — the ONE renderer that turns (invoice, company, design) into
// the A4 invoice HTML. Used by BOTH the real print/PDF path (printInvoice) and
// the Invoice Designer's live preview, so "preview === generated invoice" by
// construction. Branding (logo/seal/signature/watermark/footer) still comes from
// the centralized BrandingService.
//
// CRITICAL: with DEFAULT_DESIGN the output is functionally identical to the
// original hard-coded invoice, so existing generation/print/PDF never regresses.
// The `design` object only *layers* customization (colors, fonts, column choice,
// totals visibility, section toggles) on top of that default.
// ─────────────────────────────────────────────────────────────────────────────
import { resolveBranding } from '@/services/brandingService';

// ── Design model ─────────────────────────────────────────────────────────────

export interface InvoiceColumn { key: string; label: string; visible: boolean }

export interface InvoiceDesign {
  template: string;                 // preset id (for the gallery highlight)
  paper: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  title: string;                    // document heading, e.g. "TAX INVOICE"
  colors: {
    primary: string;               // '' → fall back to company.themeColor
    tableHeaderBg: string;
    tableHeaderText: string;
    text: string;
    border: string;
    grandTotal: string;
    footer: string;
  };
  font: { family: string; size: number; heading: string; lineHeight: number };
  tableBorders: boolean;
  columns: InvoiceColumn[];
  totals: { subtotal: boolean; discount: boolean; taxable: boolean; tax: boolean; roundOff: boolean; grandTotal: boolean; amountInWords: boolean };
  header: { showLogo: boolean; showAddress: boolean; showGstin: boolean };
  customer: { showBillTo: boolean; showPayment: boolean; showEmailPhone: boolean; showGstin: boolean };
  footer: { showBank: boolean; showNotes: boolean; showTerms: boolean; showSignature: boolean; showFooterText: boolean };
}

export const DEFAULT_COLUMNS: InvoiceColumn[] = [
  { key: 'sr', label: '#', visible: true },
  { key: 'item', label: 'Item', visible: true },
  { key: 'hsn', label: 'HSN/SAC', visible: true },
  { key: 'qty', label: 'Qty', visible: true },
  { key: 'rate', label: 'Rate', visible: true },
  { key: 'disc', label: 'Disc', visible: true },
  { key: 'gst', label: 'GST', visible: true },
  { key: 'amount', label: 'Amount', visible: true },
];

// The default reproduces the original invoice exactly (amountInWords off, as before).
export const DEFAULT_DESIGN: InvoiceDesign = {
  template: 'standard',
  paper: 'A4',
  orientation: 'portrait',
  title: 'TAX INVOICE',
  colors: { primary: '', tableHeaderBg: '#f1f5f9', tableHeaderText: '#475569', text: '#1e293b', border: '#e2e8f0', grandTotal: '#0f172a', footer: '#64748b' },
  font: { family: "'Segoe UI', Arial, sans-serif", size: 12, heading: "'Segoe UI', Arial, sans-serif", lineHeight: 1.5 },
  tableBorders: true,
  columns: DEFAULT_COLUMNS.map(c => ({ ...c })),
  totals: { subtotal: true, discount: true, taxable: true, tax: true, roundOff: true, grandTotal: true, amountInWords: false },
  header: { showLogo: true, showAddress: true, showGstin: true },
  customer: { showBillTo: true, showPayment: true, showEmailPhone: true, showGstin: true },
  footer: { showBank: true, showNotes: true, showTerms: true, showSignature: true, showFooterText: true },
};

// Deep-merge a saved partial design over the default (missing keys stay default).
export function resolveDesign(saved: any): InvoiceDesign {
  let d: any = saved;
  if (typeof saved === 'string') { try { d = JSON.parse(saved); } catch { d = null; } }
  // A settings row may carry the design under `designJson`.
  if (d && typeof d === 'object' && d.designJson !== undefined && d.template === undefined) {
    try { d = typeof d.designJson === 'string' ? JSON.parse(d.designJson) : d.designJson; } catch { d = null; }
  }
  if (!d || typeof d !== 'object') return { ...DEFAULT_DESIGN, columns: DEFAULT_DESIGN.columns.map(c => ({ ...c })) };
  return {
    ...DEFAULT_DESIGN, ...d,
    colors: { ...DEFAULT_DESIGN.colors, ...(d.colors || {}) },
    font: { ...DEFAULT_DESIGN.font, ...(d.font || {}) },
    totals: { ...DEFAULT_DESIGN.totals, ...(d.totals || {}) },
    header: { ...DEFAULT_DESIGN.header, ...(d.header || {}) },
    customer: { ...DEFAULT_DESIGN.customer, ...(d.customer || {}) },
    footer: { ...DEFAULT_DESIGN.footer, ...(d.footer || {}) },
    columns: Array.isArray(d.columns) && d.columns.length ? d.columns : DEFAULT_DESIGN.columns.map(c => ({ ...c })),
  };
}

// ── Template gallery presets ─────────────────────────────────────────────────
// Each preset applies a partial design over the current one (colors/font/title).

export interface TemplatePreset { id: string; name: string; paper: 'A4' | 'Letter'; orientation: 'portrait' | 'landscape'; swatch: string; apply: Partial<InvoiceDesign> }

const font = (family: string, heading = family): InvoiceDesign['font'] => ({ family, heading, size: 12, lineHeight: 1.5 });

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  { id: 'standard', name: 'Standard', paper: 'A4', orientation: 'portrait', swatch: '#4F7CFF', apply: { template: 'standard', title: 'TAX INVOICE', colors: { ...DEFAULT_DESIGN.colors, primary: '#4F7CFF' } } },
  { id: 'modern', name: 'Modern', paper: 'A4', orientation: 'portrait', swatch: '#6366f1', apply: { template: 'modern', colors: { ...DEFAULT_DESIGN.colors, primary: '#6366f1', tableHeaderBg: '#eef2ff', tableHeaderText: '#4338ca' }, font: font("'Inter', 'Segoe UI', sans-serif") } },
  { id: 'corporate', name: 'Corporate', paper: 'A4', orientation: 'portrait', swatch: '#0f172a', apply: { template: 'corporate', colors: { ...DEFAULT_DESIGN.colors, primary: '#0f172a', tableHeaderBg: '#0f172a', tableHeaderText: '#ffffff' }, font: font("Georgia, 'Times New Roman', serif") } },
  { id: 'executive', name: 'Executive', paper: 'A4', orientation: 'portrait', swatch: '#111827', apply: { template: 'executive', colors: { ...DEFAULT_DESIGN.colors, primary: '#111827', grandTotal: '#b45309', tableHeaderBg: '#1f2937', tableHeaderText: '#f9fafb' }, font: font("'Playfair Display', Georgia, serif", "'Playfair Display', Georgia, serif") } },
  { id: 'minimal', name: 'Minimal', paper: 'A4', orientation: 'portrait', swatch: '#334155', apply: { template: 'minimal', tableBorders: false, colors: { ...DEFAULT_DESIGN.colors, primary: '#334155', tableHeaderBg: '#ffffff', tableHeaderText: '#334155', border: '#e5e7eb' } } },
  { id: 'compact', name: 'Compact', paper: 'A4', orientation: 'portrait', swatch: '#2563eb', apply: { template: 'compact', colors: { ...DEFAULT_DESIGN.colors, primary: '#2563eb' }, font: { family: "'Segoe UI', Arial, sans-serif", heading: "'Segoe UI', Arial, sans-serif", size: 10, lineHeight: 1.35 } } },
  { id: 'classic', name: 'Classic', paper: 'A4', orientation: 'portrait', swatch: '#7f1d1d', apply: { template: 'classic', colors: { ...DEFAULT_DESIGN.colors, primary: '#7f1d1d', tableHeaderBg: '#fef2f2', tableHeaderText: '#7f1d1d', grandTotal: '#7f1d1d' }, font: font("Georgia, 'Times New Roman', serif") } },
  { id: 'blue-business', name: 'Blue Business', paper: 'A4', orientation: 'portrait', swatch: '#1d4ed8', apply: { template: 'blue-business', colors: { ...DEFAULT_DESIGN.colors, primary: '#1d4ed8', tableHeaderBg: '#dbeafe', tableHeaderText: '#1e40af' } } },
  { id: 'gst-india', name: 'GST India', paper: 'A4', orientation: 'portrait', swatch: '#15803d', apply: { template: 'gst-india', title: 'TAX INVOICE', colors: { ...DEFAULT_DESIGN.colors, primary: '#15803d', tableHeaderBg: '#dcfce7', tableHeaderText: '#166534', grandTotal: '#166534' } } },
  { id: 'professional', name: 'Professional', paper: 'A4', orientation: 'portrait', swatch: '#0f766e', apply: { template: 'professional', colors: { ...DEFAULT_DESIGN.colors, primary: '#0f766e', tableHeaderBg: '#ccfbf1', tableHeaderText: '#0f766e', grandTotal: '#0f766e' }, font: font("'Inter', 'Segoe UI', sans-serif") } },
];

// ── Amount-in-words (Indian numbering, paise-aware) ──────────────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number): string => n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
const three = (n: number): string => { const h = Math.floor(n / 100); const r = n % 100; return `${h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : ''}${r ? two(r) : ''}`; };
export function amountInWords(amount: number): string {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  const paise = Math.round((Math.abs(Number(amount) || 0) - n) * 100);
  if (n === 0 && !paise) return 'Zero Rupees Only';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  let w = '';
  if (crore) w += `${two(crore)} Crore `;
  if (lakh) w += `${two(lakh)} Lakh `;
  if (thousand) w += `${two(thousand)} Thousand `;
  if (rest) w += three(rest);
  w = w.trim();
  let out = w ? `${w} Rupees` : 'Rupees';
  if (paise) out += ` and ${two(paise)} Paise`;
  return `${out} Only`;
}

// ── The renderer ─────────────────────────────────────────────────────────────

const esc = (s: any) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
const money = (n: any) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Per-column <th> and <td> for one item, honoring the designer's column choice/order.
const colHead = (c: InvoiceColumn): string => {
  const r = ['qty', 'rate', 'disc', 'gst', 'amount'].includes(c.key) ? ' class="r"' : '';
  return `<th${r}>${esc(c.label)}</th>`;
};
const colCell = (c: InvoiceColumn, it: any, i: number): string => {
  switch (c.key) {
    case 'sr': return `<td>${i + 1}</td>`;
    case 'item': return `<td>${esc(it.name)}${it.description ? `<div class="muted">${esc(it.description)}</div>` : ''}</td>`;
    case 'hsn': return `<td>${esc(it.hsnSac || '')}</td>`;
    case 'qty': return `<td class="r">${esc(it.quantity)} ${esc(it.unit || '')}</td>`;
    case 'rate': return `<td class="r">${money(it.rate)}</td>`;
    case 'disc': return `<td class="r">${it.discountPct || 0}%</td>`;
    case 'gst': return `<td class="r">${it.taxRate}%</td>`;
    case 'amount': return `<td class="r">${money(it.amount)}</td>`;
    default: return '<td></td>';
  }
};

export interface RenderOpts { print?: boolean }

/** Build the full A4 invoice HTML document. Default design ≈ the original output. */
export function invoiceDocHtml(inv: any, company: any, designIn?: any, opts: RenderOpts = {}): string {
  const d = resolveDesign(designIn);
  const b = resolveBranding(company);
  const primary = d.colors.primary || company?.themeColor || '#4F7CFF';
  const cols = (d.columns || DEFAULT_COLUMNS).filter(c => c.visible);
  const intra = inv.cgst > 0;
  const tdBorder = d.tableBorders ? `1px solid ${d.colors.border}` : 'none';
  const pageSize = `${d.paper} ${d.orientation}`;

  const rows = (inv.items || []).map((it: any, i: number) =>
    `<tr>${cols.map(c => colCell(c, it, i)).join('')}</tr>`).join('');

  const totalRow = (label: string, val: string, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="r">${val}</td></tr>`;
  const totalsRows = [
    d.totals.subtotal ? totalRow('Subtotal', money(inv.subtotal)) : '',
    d.totals.discount ? totalRow('Discount', `− ${money(inv.discountTotal)}`) : '',
    d.totals.taxable ? totalRow('Taxable Amount', money(inv.taxableAmount)) : '',
    d.totals.tax ? (intra
      ? totalRow('CGST', money(inv.cgst)) + totalRow('SGST', money(inv.sgst))
      : totalRow('IGST', money(inv.igst))) : '',
    d.totals.roundOff ? totalRow('Round Off', money(inv.roundOff)) : '',
    d.totals.grandTotal ? totalRow('Grand Total', money(inv.grandTotal), 'grand') : '',
    inv.amountPaid ? totalRow('Paid', money(inv.amountPaid)) + `<tr><td><b>Balance Due</b></td><td class="r"><b>${money(inv.balanceDue)}</b></td></tr>` : '',
  ].join('');

  const wordsBlock = d.totals.amountInWords
    ? `<div class="words">Amount in Words: <b>${esc(amountInWords(inv.grandTotal))}</b></div>` : '';

  const footLeft = [
    d.footer.showBank && inv.bankDetails ? `<h4 class="muted">Bank Details</h4><div class="muted">${esc(inv.bankDetails).replace(/\n/g, '<br>')}</div>` : '',
    d.footer.showNotes && inv.notes ? `<div class="muted" style="margin-top:8px"><b>Notes:</b> ${esc(inv.notes)}</div>` : '',
    d.footer.showTerms && inv.termsConditions ? `<div class="muted" style="margin-top:6px"><b>Terms:</b> ${esc(inv.termsConditions)}</div>` : '',
  ].join('');

  const signBlock = d.footer.showSignature ? `<div class="sign">
      <div style="height:44px;position:relative">
        ${b.hasSeal ? `<img class="seal" src="${b.seal}" style="position:absolute;right:0;top:-6px;opacity:0.9"/>` : ''}
        ${b.hasSignature ? `<img class="sig" src="${b.signature}"/>` : ''}
      </div>
      <div style="border-top:1px solid #94a3b8;padding-top:4px" class="muted">${esc(b.signatureText || 'Authorised Signatory')}<br>${esc(company?.name || '')}</div></div>` : '';

  const printScript = opts.print === false ? '' : `<script>window.onload=function(){window.print();}</script>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNumber)}</title>
  <style>
    @page { size: ${pageSize}; margin: 14mm; }
    * { box-sizing: border-box; } body { font-family: ${d.font.family}; color: ${d.colors.text}; font-size: ${d.font.size}px; line-height: ${d.font.lineHeight}; margin: 0; position: relative; }
    .head { display: flex; justify-content: space-between; border-bottom: 3px solid ${primary}; padding-bottom: 12px; }
    .brand { font-size: 20px; font-weight: 800; color: ${primary}; font-family: ${d.font.heading}; }
    .muted { color: ${d.colors.footer}; font-size: 10px; } .title { text-align: right; }
    .title h1 { margin: 0; font-size: 22px; letter-spacing: 1px; color: ${primary}; font-family: ${d.font.heading}; } .grid { display: flex; justify-content: space-between; margin: 16px 0; gap: 20px; }
    .box { flex: 1; } .box h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; } th { background: ${d.colors.tableHeaderBg}; text-transform: uppercase; font-size: 9px; color: ${d.colors.tableHeaderText}; }
    th, td { border: ${tdBorder}; padding: 6px 8px; text-align: left; } td.r, th.r { text-align: right; }
    .totals { width: 280px; margin-left: auto; margin-top: 10px; } .totals td { border: none; padding: 3px 8px; }
    .totals .grand { border-top: 2px solid ${d.colors.grandTotal}; font-weight: 800; font-size: 14px; color: ${d.colors.grandTotal}; }
    .words { margin-top: 10px; font-size: 11px; }
    .foot { margin-top: 22px; display: flex; justify-content: space-between; gap: 20px; } .sign { text-align: center; }
    .status { display:inline-block; padding:3px 10px; border-radius:6px; font-weight:700; font-size:10px; background:#eef2ff; color:#4338ca; }
    .wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; overflow: hidden; }
    .wm span { font-size: 90px; font-weight: 800; color:#0f172a; opacity: 0.06; transform: rotate(-30deg); white-space: nowrap; letter-spacing: 10px; }
    .wm img { max-width: 60%; max-height: 60%; opacity: 0.07; transform: rotate(-30deg); }
    .content { position: relative; z-index: 1; }
    .logo { height: 46px; max-width: 180px; object-fit: contain; margin-bottom: 6px; display:block; }
    .seal { height: 54px; object-fit: contain; display:inline-block; }
    .sig { height: 38px; object-fit: contain; display:block; margin: 0 auto; }
  </style></head><body>
  ${b.hasWatermark ? `<div class="wm">${b.watermarkImage ? `<img src="${b.watermarkImage}"/>` : `<span>${esc(b.watermarkText)}</span>`}</div>` : ''}
  <div class="content">
  <div class="head">
    <div>${d.header.showLogo && b.hasLogo ? `<img class="logo" src="${b.logo}"/>` : ''}<div class="brand">${esc(company?.name || 'Company')}</div>
      ${d.header.showAddress ? `<div class="muted">${esc(company?.address || company?.city || '')}</div>` : ''}
      ${d.header.showGstin ? `<div class="muted">GSTIN: ${esc(inv.companyGstin || company?.gstin || '—')}</div>` : ''}</div>
    <div class="title"><h1>${esc(d.title || 'TAX INVOICE')}</h1>
      <div class="muted"># <b>${esc(inv.invoiceNumber)}</b></div>
      <div class="muted">Date: ${esc(inv.invoiceDate)}${inv.dueDate ? ` &nbsp; Due: ${esc(inv.dueDate)}` : ''}</div>
      <div style="margin-top:4px"><span class="status">${esc(inv.status)}</span></div></div>
  </div>
  <div class="grid">
    ${d.customer.showBillTo ? `<div class="box"><h4>Bill To</h4><div><b>${esc(inv.billToName)}</b></div>
      <div class="muted">${esc(inv.billToAddress || '')}</div>
      ${d.customer.showGstin ? `<div class="muted">GSTIN: ${esc(inv.billToGstin || '—')}${inv.billToState ? ` · ${esc(inv.billToState)}` : ''}</div>` : ''}
      ${d.customer.showEmailPhone ? `<div class="muted">${esc(inv.billToEmail || '')} ${esc(inv.billToPhone || '')}</div>` : ''}</div>` : ''}
    ${d.customer.showPayment ? `<div class="box" style="text-align:right"><h4>Payment</h4>
      <div class="muted">Terms: ${esc(inv.paymentTerms || '—')}</div>
      <div class="muted">Mode: ${esc(inv.paymentMode || '—')}</div>
      ${inv.upiId ? `<div class="muted">UPI: ${esc(inv.upiId)}</div>` : ''}</div>` : ''}
  </div>
  <table><thead><tr>${cols.map(colHead).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <table class="totals">${totalsRows}</table>
  ${wordsBlock}
  <div class="foot">
    <div style="flex:1">${footLeft}</div>
    ${signBlock}
  </div>
  ${d.footer.showFooterText && (b.footerText || company?.footerText) ? `<div class="muted" style="text-align:center;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:8px">${esc(b.footerText || company.footerText)}</div>` : ''}
  </div>
  ${printScript}
  </body></html>`;
}

// Sample invoice used by the designer's live preview.
export const SAMPLE_INVOICE = {
  invoiceNumber: 'INV-2026-27-0001', invoiceDate: '03/07/2026', dueDate: '02/08/2026', status: 'Generated',
  billToName: 'Acme Retail Pvt Ltd', billToAddress: '4th Floor, Trade Tower, Ahmedabad', billToGstin: '24ABCDE1234F1Z5', billToState: 'Gujarat',
  billToEmail: 'accounts@acme.example', billToPhone: '+91 98250 00000', paymentTerms: 'Net 30', paymentMode: 'Bank Transfer', upiId: 'company@upi',
  items: [
    { name: 'Consulting Services', description: 'Implementation — July', hsnSac: '9983', quantity: 10, unit: 'hrs', rate: 1500, discountPct: 5, taxRate: 18, amount: 16815 },
    { name: 'Annual Support Plan', hsnSac: '9983', quantity: 1, unit: 'yr', rate: 24000, discountPct: 0, taxRate: 18, amount: 28320 },
  ],
  subtotal: 39000, discountTotal: 750, taxableAmount: 38250, cgst: 3442.5, sgst: 3442.5, igst: 0, roundOff: 0.0, grandTotal: 45135,
  bankDetails: 'Bank: HDFC Bank\nA/C: 5010 0123 4567\nIFSC: HDFC0000123', notes: 'Thank you for your business.', termsConditions: 'Payment due within 30 days.',
};
