// ─────────────────────────────────────────────────────────────────────────────
// invoiceTemplate — the ONE renderer that turns (invoice, company, design) into
// the A4 invoice HTML. Used by BOTH the real print/PDF path (printInvoice) and
// the Invoice Designer's live preview, so "preview === generated invoice" by
// construction. Branding (logo/seal/signature/watermark/footer) still comes from
// the centralized BrandingService.
//
// CRITICAL: with DEFAULT_DESIGN the output is functionally identical to the
// original hard-coded invoice, so existing generation/print/PDF never regresses.
// The `design` object only *layers* customization (colors, fonts, layout, column
// choice, totals visibility, section toggles) on top of that default.
//
// PREVIEW-ONLY fields (QR code, ship-to, PAN, payment instructions) are rendered
// only when the corresponding *data* is present on the invoice, or (for QR) when
// a data-URL is passed via RenderOpts. Real invoices don't carry that data and
// the real print path never passes a QR, so those sections stay preview-only.
// ─────────────────────────────────────────────────────────────────────────────
import { resolveBranding } from '@/services/brandingService';
import { canvasTextCss, googleFontsLink, webFontsUsed } from './richText';

// ── Design model ─────────────────────────────────────────────────────────────

export interface InvoiceColumn { key: string; label: string; visible: boolean; width?: number }

export interface CanvasElement {
  id: string;
  type: 'text' | 'image' | 'logo' | 'companyDetails' | 'customerDetails' | 'itemTable' | 'totals' | 'bankDetails' | 'paymentInfo' | 'signature' | 'terms' | 'notes' | 'qr' | 'barcode' | 'stamp' | 'rect' | 'circle' | 'line' | 'customSection';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  name: string;
  content?: string;
  /** Editable body text for blocks whose `content` already means "image URL"
   *  (companyDetails, customerDetails, bankDetails, terms, notes, signature,
   *  stamp). Undefined = render the block's data-driven default. */
  text?: string;
  src?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  /** none | uppercase | lowercase | capitalize */
  textTransform?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  letterSpacing?: number;
  lineHeight?: number;
  bg?: string;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  borderRadius?: number;
  /** Uniform padding. The per-side values below override it when present, so a
   *  layout saved before they existed keeps rendering exactly as it did. */
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  tableCols?: InvoiceColumn[];
  totalsRows?: any;
  /** Per-row label overrides for the `totals` block, keyed by row id. */
  totalsLabels?: Record<string, string>;
}


export interface InvoiceDesign {
  isCanvas?: boolean;
  elements?: CanvasElement[];
  template: string;                 // preset id (for the gallery highlight)
  paper: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  title: string;                    // document heading, e.g. "TAX INVOICE"
  colors: {
    primary: string;               // '' → fall back to company.themeColor
    secondary: string;             // sub-accent (box labels / dividers); '' → default
    headerBg: string;              // header band background; '' → no band
    tableHeaderBg: string;
    tableHeaderText: string;
    text: string;
    border: string;
    grandTotal: string;
    footer: string;
    accent: string;                // small accents (labels/status); '' → default
  };
  font: {
    family: string; size: number; heading: string; lineHeight: number;
    headingBold: boolean;          // brand weight 800 vs 600
    italicNotes: boolean;          // italicize muted/notes text
    letterSpacing: number;         // body letter-spacing (px)
    headerStyle: 'split' | 'centered' | 'banner';
  };
  layout: {
    margin: number;                // page margin (mm)
    headerHeight: number;          // header min-height (px, 0 = auto)
    footerHeight: number;          // footer min-height (px, 0 = auto)
    logoPosition: 'left' | 'center' | 'right';
    titlePosition: 'left' | 'center' | 'right';
    borderStyle: 'solid' | 'dashed' | 'dotted';
    borderRadius: number;          // rounded corners on boxes/status (px)
  };
  tableBorders: boolean;
  altRows: boolean;                // zebra-striped item rows
  altRowColor: string;
  totalsPosition: 'left' | 'right';
  columns: InvoiceColumn[];
  totals: { subtotal: boolean; discount: boolean; taxable: boolean; tax: boolean; roundOff: boolean; grandTotal: boolean; amountInWords: boolean };
  header: { showLogo: boolean; showAddress: boolean; showGstin: boolean; showTagline: boolean };
  customer: { showBillTo: boolean; showPayment: boolean; showEmailPhone: boolean; showGstin: boolean; showShipTo: boolean; showPan: boolean };
  footer: {
    showBank: boolean; showNotes: boolean; showTerms: boolean; showSignature: boolean; showFooterText: boolean;
    showPaymentInstructions: boolean;   // preview-only (data-gated)
    showQr: boolean;                    // preview-only (needs opts.qrDataUrl)
    showThankYou: boolean; thankYouText: string;
    showContact: boolean;               // structured contact line
    contact: { website: string; email: string; phone: string; address: string; social: string; copyright: string };
  };
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
  colors: { primary: '', secondary: '', headerBg: '', tableHeaderBg: '#f1f5f9', tableHeaderText: '#475569', text: '#1e293b', border: '#e5e7eb', grandTotal: '#111827', footer: '#6b7280', accent: '' },
  font: { family: "'Segoe UI', Arial, sans-serif", size: 12, heading: "'Segoe UI', Arial, sans-serif", lineHeight: 1.5, headingBold: true, italicNotes: false, letterSpacing: 0, headerStyle: 'split' },
  layout: { margin: 14, headerHeight: 0, footerHeight: 0, logoPosition: 'left', titlePosition: 'right', borderStyle: 'solid', borderRadius: 0 },
  tableBorders: true,
  altRows: false,
  altRowColor: '#f8fafc',
  totalsPosition: 'right',
  columns: DEFAULT_COLUMNS.map(c => ({ ...c })),
  totals: { subtotal: true, discount: true, taxable: true, tax: true, roundOff: true, grandTotal: true, amountInWords: false },
  header: { showLogo: true, showAddress: true, showGstin: true, showTagline: false },
  customer: { showBillTo: true, showPayment: true, showEmailPhone: true, showGstin: true, showShipTo: false, showPan: false },
  footer: {
    showBank: true, showNotes: true, showTerms: true, showSignature: true, showFooterText: true,
    showPaymentInstructions: false, showQr: false,
    showThankYou: false, thankYouText: 'Thank you for your business!',
    showContact: false, contact: { website: '', email: '', phone: '', address: '', social: '', copyright: '' },
  },
};

// Deep-merge a saved partial design over the default (missing keys stay default).
export function resolveDesign(saved: any): InvoiceDesign {
  let d: any = saved;
  if (typeof saved === 'string') { try { d = JSON.parse(saved); } catch { d = null; } }
  // A settings row may carry the design under `designJson`.
  if (d && typeof d === 'object' && d.designJson !== undefined && d.template === undefined && d.isCanvas === undefined) {
    try { d = typeof d.designJson === 'string' ? JSON.parse(d.designJson) : d.designJson; } catch { d = null; }
  }
  if (d && typeof d === 'object' && d.isCanvas) {
    // If it's a new canvas-based design, return it as-is
    return d;
  }
  const base = () => ({ ...DEFAULT_DESIGN, columns: DEFAULT_DESIGN.columns.map(c => ({ ...c })) });
  if (!d || typeof d !== 'object') return base();
  return {
    ...DEFAULT_DESIGN, ...d,
    colors: { ...DEFAULT_DESIGN.colors, ...(d.colors || {}) },
    font: { ...DEFAULT_DESIGN.font, ...(d.font || {}) },
    layout: { ...DEFAULT_DESIGN.layout, ...(d.layout || {}) },
    totals: { ...DEFAULT_DESIGN.totals, ...(d.totals || {}) },
    header: { ...DEFAULT_DESIGN.header, ...(d.header || {}) },
    customer: { ...DEFAULT_DESIGN.customer, ...(d.customer || {}) },
    footer: { ...DEFAULT_DESIGN.footer, ...(d.footer || {}), contact: { ...DEFAULT_DESIGN.footer.contact, ...((d.footer && d.footer.contact) || {}) } },
    columns: Array.isArray(d.columns) && d.columns.length ? d.columns.map((c: any) => ({ ...c })) : DEFAULT_DESIGN.columns.map(c => ({ ...c })),
  };
}

// ── Template gallery presets ─────────────────────────────────────────────────
// Each preset applies a partial design over the current one (colors/font/title).

export interface TemplatePreset { id: string; name: string; paper: 'A4' | 'Letter'; orientation: 'portrait' | 'landscape'; swatch: string; apply: Partial<InvoiceDesign> }

const font = (family: string, heading = family): InvoiceDesign['font'] => ({ ...DEFAULT_DESIGN.font, family, heading });
const colors = (over: Partial<InvoiceDesign['colors']>): InvoiceDesign['colors'] => ({ ...DEFAULT_DESIGN.colors, ...over });

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  { id: 'standard', name: 'Standard', paper: 'A4', orientation: 'portrait', swatch: '#C77E52', apply: { template: 'standard', title: 'TAX INVOICE', colors: colors({ primary: '#C77E52' }) } },
  { id: 'modern', name: 'Modern', paper: 'A4', orientation: 'portrait', swatch: '#6366f1', apply: { template: 'modern', colors: colors({ primary: '#6366f1', tableHeaderBg: '#eef2ff', tableHeaderText: '#4338ca', accent: '#6366f1' }), font: font("'Inter', 'Segoe UI', sans-serif") } },
  { id: 'professional', name: 'Professional', paper: 'A4', orientation: 'portrait', swatch: '#0f766e', apply: { template: 'professional', colors: colors({ primary: '#0f766e', tableHeaderBg: '#ccfbf1', tableHeaderText: '#0f766e', grandTotal: '#0f766e', accent: '#0f766e' }), font: font("'Inter', 'Segoe UI', sans-serif") } },
  { id: 'corporate', name: 'Corporate', paper: 'A4', orientation: 'portrait', swatch: '#111827', apply: { template: 'corporate', colors: colors({ primary: '#111827', tableHeaderBg: '#111827', tableHeaderText: '#ffffff' }), font: font("Georgia, 'Times New Roman', serif") } },
  { id: 'minimal', name: 'Minimal', paper: 'A4', orientation: 'portrait', swatch: '#334155', apply: { template: 'minimal', tableBorders: false, colors: colors({ primary: '#334155', tableHeaderBg: '#ffffff', tableHeaderText: '#334155', border: '#e5e7eb' }), font: { ...DEFAULT_DESIGN.font, headerStyle: 'split' } } },
  { id: 'creative', name: 'Creative', paper: 'A4', orientation: 'portrait', swatch: '#db2777', apply: { template: 'creative', colors: colors({ primary: '#db2777', secondary: '#7c3aed', headerBg: '#db2777', tableHeaderBg: '#fce7f3', tableHeaderText: '#9d174d', grandTotal: '#9d174d', accent: '#db2777' }), font: { ...font("'Inter', 'Segoe UI', sans-serif"), headerStyle: 'banner' }, layout: { ...DEFAULT_DESIGN.layout, borderRadius: 8 } } },
  { id: 'elegant', name: 'Elegant', paper: 'A4', orientation: 'portrait', swatch: '#1f2937', apply: { template: 'elegant', altRows: true, altRowColor: '#f8fafc', colors: colors({ primary: '#1f2937', secondary: '#b45309', tableHeaderBg: '#f9fafb', tableHeaderText: '#374151', grandTotal: '#b45309', accent: '#b45309' }), font: { ...font("'Playfair Display', Georgia, serif", "'Playfair Display', Georgia, serif"), headerStyle: 'centered' } } },
  { id: 'blue-business', name: 'Blue Business', paper: 'A4', orientation: 'portrait', swatch: '#99552F', apply: { template: 'blue-business', colors: colors({ primary: '#99552F', headerBg: '#99552F', tableHeaderBg: '#F7E3D3', tableHeaderText: '#1e40af', accent: '#99552F' }), font: { ...DEFAULT_DESIGN.font, headerStyle: 'banner' } } },
  { id: 'green-business', name: 'Green Business', paper: 'A4', orientation: 'portrait', swatch: '#15803d', apply: { template: 'green-business', altRows: true, altRowColor: '#f0fdf4', colors: colors({ primary: '#15803d', tableHeaderBg: '#dcfce7', tableHeaderText: '#166534', grandTotal: '#166534', accent: '#15803d' }) } },
  { id: 'healthcare', name: 'Healthcare', paper: 'A4', orientation: 'portrait', swatch: '#0891b2', apply: { template: 'healthcare', colors: colors({ primary: '#0891b2', secondary: '#0e7490', headerBg: '#ecfeff', tableHeaderBg: '#cffafe', tableHeaderText: '#155e75', grandTotal: '#0e7490', accent: '#0891b2' }), font: font("'Inter', 'Segoe UI', sans-serif"), layout: { ...DEFAULT_DESIGN.layout, borderRadius: 6 } } },
  { id: 'education', name: 'Education', paper: 'A4', orientation: 'portrait', swatch: '#4338ca', apply: { template: 'education', colors: colors({ primary: '#4338ca', secondary: '#d97706', tableHeaderBg: '#eef2ff', tableHeaderText: '#7C4527', grandTotal: '#d97706', accent: '#4338ca' }) } },
  { id: 'manufacturing', name: 'Manufacturing', paper: 'A4', orientation: 'portrait', swatch: '#c2410c', apply: { template: 'manufacturing', altRows: true, altRowColor: '#fff7ed', colors: colors({ primary: '#1e293b', secondary: '#c2410c', tableHeaderBg: '#1e293b', tableHeaderText: '#ffffff', grandTotal: '#c2410c', accent: '#c2410c' }) } },
  { id: 'retail', name: 'Retail', paper: 'A4', orientation: 'portrait', swatch: '#7c3aed', apply: { template: 'retail', colors: colors({ primary: '#7c3aed', secondary: '#db2777', headerBg: '#7c3aed', tableHeaderBg: '#f5f3ff', tableHeaderText: '#5b21b6', grandTotal: '#7c3aed', accent: '#7c3aed' }), font: { ...font("'Inter', 'Segoe UI', sans-serif"), headerStyle: 'banner' }, layout: { ...DEFAULT_DESIGN.layout, borderRadius: 8 } } },
  { id: 'technology', name: 'Technology', paper: 'A4', orientation: 'portrait', swatch: '#0ea5e9', apply: { template: 'technology', colors: colors({ primary: '#0ea5e9', secondary: '#6366f1', tableHeaderBg: '#111827', tableHeaderText: '#e5e7eb', grandTotal: '#0ea5e9', accent: '#0ea5e9' }), font: font("'Inter', 'Segoe UI', sans-serif"), layout: { ...DEFAULT_DESIGN.layout, borderRadius: 6 } } },
  { id: 'luxury', name: 'Luxury', paper: 'A4', orientation: 'portrait', swatch: '#a16207', apply: { template: 'luxury', colors: colors({ primary: '#111827', secondary: '#a16207', headerBg: '#111827', tableHeaderBg: '#1f2937', tableHeaderText: '#fcd34d', grandTotal: '#a16207', accent: '#a16207' }), font: { ...font("'Playfair Display', Georgia, serif", "'Playfair Display', Georgia, serif"), headerStyle: 'banner' } } },
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

export interface RenderOpts { print?: boolean; qrDataUrl?: string }

/** Build the full A4 invoice HTML document. Default design ≈ the original output. */
export function invoiceDocHtml(inv: any, company: any, designIn?: any, opts: RenderOpts = {}): string {
  if (designIn && designIn.isCanvas) {
    return renderCanvasHtml(inv, company, designIn, opts);
  }
  const d = resolveDesign(designIn);
  const b = resolveBranding(company);
  const primary = d.colors.primary || company?.themeColor || '#C77E52';
  const accent = d.colors.accent || '#9ca3af';
  const cols = (d.columns || DEFAULT_COLUMNS).filter(c => c.visible);
  const intra = inv.cgst > 0;
  const tdBorder = d.tableBorders ? `1px ${d.layout.borderStyle} ${d.colors.border}` : 'none';
  const pageSize = `${d.paper} ${d.orientation}`;
  const radius = d.layout.borderRadius || 0;

  const hasWidths = cols.some(c => c.width);
  const colgroup = hasWidths ? `<colgroup>${cols.map(c => `<col${c.width ? ` style="width:${c.width}%"` : ''}/>`).join('')}</colgroup>` : '';

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

  // ── Header (split / centered / banner) ──
  const getLogoHtml = () => {
    if (!d.header.showLogo) return '';
    const fallbackJs = `this.style.display='none'; this.nextElementSibling.style.display='flex';`;
    const placeholder = `<div class="logo-placeholder" style="display:none;align-items:center;justify-content:center;width:100px;height:50px;background:#f8fafc;color:#9ca3af;font-size:11px;border:1px dashed #d1d5db;border-radius:4px;font-weight:600;margin-bottom:8px;">COMPANY LOGO</div>`;
    const emptyPlaceholder = `<div class="logo-placeholder" style="display:flex;align-items:center;justify-content:center;width:100px;height:50px;background:#f8fafc;color:#9ca3af;font-size:11px;border:1px dashed #d1d5db;border-radius:4px;font-weight:600;margin-bottom:8px;">COMPANY LOGO</div>`;
    
    if (b.hasLogo && b.logo && b.logo !== 'null' && b.logo !== 'undefined') {
      const isUrl = b.logo.includes('/') || b.logo.includes('.') || b.logo.startsWith('data:');
      if (!isUrl && b.logo.length <= 4) {
        return `<div class="logo-placeholder" style="display:flex;align-items:center;justify-content:center;width:50px;height:50px;background:#f1f5f9;color:#475569;font-size:20px;font-weight:bold;border-radius:8px;margin-bottom:8px;">${esc(b.logo)}</div>`;
      }
      return `<img class="logo" src="${b.logo}" onerror="${fallbackJs}" />${placeholder}`;
    }
    return emptyPlaceholder;
  };
  const logoHtml = getLogoHtml();
  const taglineHtml = d.header.showTagline && (company?.tagline || company?.motto) ? `<div class="muted" style="font-style:italic">${esc(company.tagline || company.motto)}</div>` : '';
  // Legal entity (parent company) first; the branch is only the operating
  // location. `company` is parent-resolved upstream by invoiceIdentity.ts.
  const companyBlock = `${logoHtml}<div class="brand">${esc(company?.name || 'Company')}</div>
      ${d.header.showAddress ? `<div class="muted">${esc(company?.address || company?.city || '')}</div>` : ''}
      ${taglineHtml}
      ${d.header.showGstin ? `<div class="muted">GSTIN: ${esc(inv.companyGstin || company?.gstin || '—')}</div>` : ''}
      ${company?.branchLabel ? `<div class="brand-branch">Branch: ${esc(company.branchLabel)}</div>` : ''}`;
  const titleBlock = `<h1>${esc(d.title || 'TAX INVOICE')}</h1>
      <div class="muted"># <b>${esc(inv.invoiceNumber)}</b></div>
      <div class="muted">Date: ${esc(inv.invoiceDate)}${inv.dueDate ? ` &nbsp; Due: ${esc(inv.dueDate)}` : ''}</div>
      <div style="margin-top:4px"><span class="status">${esc(inv.status)}</span></div>`;

  let head: string;
  if (d.font.headerStyle === 'centered') {
    head = `<div class="head head-centered"><div class="hc-brand">${companyBlock}</div><div class="title hc-title">${titleBlock}</div></div>`;
  } else if (d.font.headerStyle === 'banner') {
    head = `<div class="head head-banner"><div class="hb-brand">${companyBlock}</div><div class="title hb-title">${titleBlock}</div></div>`;
  } else {
    // split (default → identical to original)
    head = `<div class="head">
    <div style="text-align:${d.layout.logoPosition}">${companyBlock}</div>
    <div class="title" style="text-align:${d.layout.titlePosition}">${titleBlock}</div>
  </div>`;
  }

  // ── Bill-To / Ship-To / Payment grid ──
  const billTo = d.customer.showBillTo ? `<div class="box"><h4>Bill To</h4><div><b>${esc(inv.billToName)}</b></div>
      <div class="muted">${esc(inv.billToAddress || '')}</div>
      ${d.customer.showGstin ? `<div class="muted">GSTIN: ${esc(inv.billToGstin || '—')}${inv.billToState ? ` · ${esc(inv.billToState)}` : ''}</div>` : ''}
      ${d.customer.showPan && (inv.billToPan || inv.customerPan) ? `<div class="muted">PAN: ${esc(inv.billToPan || inv.customerPan)}</div>` : ''}
      ${d.customer.showEmailPhone ? `<div class="muted">${esc(inv.billToEmail || '')} ${esc(inv.billToPhone || '')}</div>` : ''}</div>` : '';
  // Ship-To now uses the real invoice snapshot (billToShipAddress, auto-filled from
  // the Client Master); falls back to the preview-only shipToAddress. Still fully
  // data-gated + default-off, so invoices without a ship-to are unchanged.
  const shipAddr = inv.billToShipAddress || inv.shipToAddress;
  const shipTo = d.customer.showShipTo && (inv.shipToName || shipAddr) ? `<div class="box"><h4>Ship To</h4><div><b>${esc(inv.shipToName || inv.billToName)}</b></div>
      <div class="muted">${esc(shipAddr || '')}</div>
      ${inv.shipToState ? `<div class="muted">${esc(inv.shipToState)}</div>` : ''}</div>` : '';
  // Payment summary box (top-right) keeps the terms summary; Payment Mode + UPI
  // render in the footer "Payment Information" section (below Bank Details), so
  // they are never duplicated. Data-gated — no more "Terms: —" blank label.
  const payRows = paymentInfoRows(inv);
  const payTerms = String(inv.paymentTerms ?? '').trim();
  const payment = d.customer.showPayment && payTerms ? `<div class="box" style="text-align:right"><h4>Payment</h4>
      <div class="muted">Terms: ${esc(payTerms)}</div></div>` : '';
  const gridInner = [billTo, shipTo, payment].filter(Boolean).join('');

  // ── Footer blocks ──
  // Payment Information (Mode + UPI) sits directly below Bank Details, matching
  // the invoice layout convention. Fully data-gated: each row only appears when
  // its value exists, and the whole block is omitted when both are blank.
  const paymentInfoFooter = payRows.has ? `<h4 class="muted" style="margin-top:8px">Payment Information</h4>`
    + (payRows.mode ? `<div class="muted">Payment Mode: ${esc(payRows.mode)}</div>` : '')
    + (payRows.upi ? `<div class="muted">UPI ID: ${esc(payRows.upi)}</div>` : '') : '';
  const footLeft = [
    d.footer.showBank && inv.bankDetails ? `<h4 class="muted">Bank Details</h4><div class="muted">${esc(inv.bankDetails).replace(/\n/g, '<br>')}</div>` : '',
    paymentInfoFooter,
    d.footer.showNotes && inv.notes ? `<div class="muted" style="margin-top:8px"><b>Notes:</b> ${esc(inv.notes)}</div>` : '',
    d.footer.showTerms && inv.termsConditions ? `<div class="muted" style="margin-top:6px"><b>Terms:</b> ${esc(inv.termsConditions)}</div>` : '',
    // Payment instructions are preview-only (data-gated; real invoices don't carry the field).
    d.footer.showPaymentInstructions && inv.paymentInstructions ? `<div class="muted" style="margin-top:6px"><b>Payment Instructions:</b> ${esc(inv.paymentInstructions)}</div>` : '',
  ].join('');

  // QR is preview-only: rendered only when a data-URL is supplied via opts (the
  // real print path never passes one), so actual invoices remain unchanged.
  const qrBlock = d.footer.showQr && opts.qrDataUrl
    ? `<div class="qr"><img src="${opts.qrDataUrl}" alt="QR"/><div class="muted" style="margin-top:2px">Scan to pay</div></div>` : '';

  const signBlock = d.footer.showSignature ? `<div class="sign">
      <div style="height:44px;position:relative">
        ${b.hasSeal ? `<img class="seal" src="${b.seal}" style="position:absolute;right:0;top:-6px;opacity:0.9" onerror="this.style.display='none'" />` : ''}
        ${b.hasSignature ? `<img class="sig" src="${b.signature}" onerror="this.style.display='none'" />` : ''}
      </div>
      <div style="border-top:1px solid #9ca3af;padding-top:4px" class="muted">${esc(b.signatureText || 'Authorised Signatory')}<br>${esc(company?.name || '')}</div></div>` : '';

  const thankYou = d.footer.showThankYou && d.footer.thankYouText
    ? `<div class="thanks">${esc(d.footer.thankYouText)}</div>` : '';

  // Structured contact line — designer overrides fall back to Company Profile values.
  const c = d.footer.contact;
  const contactParts = d.footer.showContact ? [
    (c.website || company?.website) ? `🌐 ${esc(c.website || company.website)}` : '',
    (c.email || company?.email) ? `✉ ${esc(c.email || company.email)}` : '',
    (c.phone || company?.phone || company?.contactNumber) ? `☎ ${esc(c.phone || company.phone || company.contactNumber)}` : '',
    (c.address || company?.address) ? `📍 ${esc(c.address || company.address)}` : '',
    c.social ? esc(c.social) : '',
  ].filter(Boolean) : [];
  const contactBlock = contactParts.length ? `<div class="contact">${contactParts.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>` : '';
  const copyrightBlock = d.footer.showContact && c.copyright ? `<div class="copyright">${esc(c.copyright)}</div>` : '';

  const footerTextBlock = d.footer.showFooterText && (b.footerText || company?.footerText)
    ? `<div class="muted" style="text-align:center;margin-top:16px;border-top:1px solid #e5e7eb;padding-top:8px">${esc(b.footerText || company.footerText)}</div>` : '';

  const printScript = opts.print === false ? '' : `<script>window.onload=function(){window.print();}</script>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNumber)}</title>
  <style>
    @page { size: ${pageSize}; margin: ${d.layout.margin}mm; }
    * { box-sizing: border-box; } body { font-family: ${d.font.family}; color: ${d.colors.text}; font-size: ${d.font.size}px; line-height: ${d.font.lineHeight}; letter-spacing: ${d.font.letterSpacing || 0}px; margin: 0; position: relative; }
    .head { display: flex; justify-content: space-between; border-bottom: 3px solid ${primary}; padding-bottom: 12px; ${d.layout.headerHeight ? `min-height:${d.layout.headerHeight}px;` : ''}${d.colors.headerBg ? ` background:${d.colors.headerBg}; padding:12px; border-radius:${radius}px; border-bottom:none;` : ''} }
    .head-centered { flex-direction: column; align-items: center; text-align: center; gap: 8px; }
    .head-centered .hc-title, .head-centered .hc-brand { text-align: center; }
    .head-banner { align-items: center; background: ${d.colors.headerBg || primary}; color: #fff; padding: 16px; border-radius: ${radius}px; border-bottom: none; }
    .head-banner .brand, .head-banner .title h1 { color: #fff; }
    .head-banner .muted { color: rgba(255,255,255,0.85); }
    .head-banner .status { background: rgba(255,255,255,0.2); color: #fff; }
    .brand { font-size: 20px; font-weight: ${d.font.headingBold ? 800 : 600}; color: ${primary}; font-family: ${d.font.heading}; }
    /* Operating branch — a subtitle under the legal company name, never a substitute for it. */
    .brand-branch { font-size: 11px; font-weight: 700; color: ${d.colors.footer}; letter-spacing: .3px; margin-top: 1px; }
    .muted { color: ${d.colors.footer}; font-size: 10px; ${d.font.italicNotes ? 'font-style: italic;' : ''} } .title { text-align: right; }
    .title h1 { margin: 0; font-size: 22px; letter-spacing: 1px; color: ${primary}; font-family: ${d.font.heading}; } .grid { display: flex; justify-content: space-between; margin: 16px 0; gap: 20px; }
    .box { flex: 1; ${radius ? `border-radius:${radius}px;` : ''} } .box h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; color: ${d.colors.secondary || accent}; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; } th { background: ${d.colors.tableHeaderBg}; text-transform: uppercase; font-size: 9px; color: ${d.colors.tableHeaderText}; }
    th, td { border: ${tdBorder}; padding: 6px 8px; text-align: left; } td.r, th.r { text-align: right; }
    ${d.altRows ? `tbody tr:nth-child(even) td { background: ${d.altRowColor}; }` : ''}
    .totals { width: 280px; margin-${d.totalsPosition === 'left' ? 'right' : 'left'}: auto; margin-top: 10px; } .totals td { border: none; padding: 3px 8px; }
    .totals .grand { border-top: 2px solid ${d.colors.grandTotal}; font-weight: 800; font-size: 14px; color: ${d.colors.grandTotal}; }
    .words { margin-top: 10px; font-size: 11px; }
    .foot { margin-top: 22px; display: flex; justify-content: space-between; gap: 20px; ${d.layout.footerHeight ? `min-height:${d.layout.footerHeight}px;` : ''} } .sign { text-align: center; }
    .qr { text-align: center; } .qr img { height: 84px; width: 84px; object-fit: contain; }
    .thanks { text-align: center; margin-top: 16px; font-weight: 700; color: ${primary}; font-family: ${d.font.heading}; }
    .contact { text-align: center; margin-top: 10px; font-size: 10px; color: ${d.colors.footer}; }
    .copyright { text-align: center; margin-top: 4px; font-size: 9px; color: ${d.colors.footer}; opacity: 0.8; }
    .status { display:inline-block; padding:3px 10px; border-radius:${radius || 6}px; font-weight:700; font-size:10px; background:${d.colors.accent ? `${d.colors.accent}22` : '#eef2ff'}; color:${d.colors.accent || '#4338ca'}; }
    .wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; overflow: hidden; }
    .wm span { font-size: 90px; font-weight: 800; color:#111827; opacity: 0.06; transform: rotate(-30deg); white-space: nowrap; letter-spacing: 10px; }
    .wm img { max-width: 60%; max-height: 60%; opacity: 0.07; transform: rotate(-30deg); }
    .content { position: relative; z-index: 1; }
    .logo { height: 46px; max-width: 180px; object-fit: contain; margin-bottom: 6px; display:block; }
    .head-centered .logo { margin-left: auto; margin-right: auto; }
    .seal { height: 54px; object-fit: contain; display:inline-block; }
    .sig { height: 38px; object-fit: contain; display:block; margin: 0 auto; }
  </style></head><body>
  ${b.hasWatermark ? `<div class="wm">${b.watermarkImage ? `<img src="${b.watermarkImage}" onerror="this.style.display='none'" />` : `<span>${esc(b.watermarkText)}</span>`}</div>` : ''}
  <div class="content">
  ${head}
  <div class="grid">
    ${gridInner}
  </div>
  <table>${colgroup}<thead><tr>${cols.map(colHead).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <table class="totals">${totalsRows}</table>
  ${wordsBlock}
  <div class="foot">
    <div style="flex:1">${footLeft}</div>
    ${qrBlock}
    ${signBlock}
  </div>
  ${thankYou}
  ${contactBlock}
  ${copyrightBlock}
  ${footerTextBlock}
  </div>
  ${printScript}
  </body></html>`;
}

// Sample invoice used by the designer's live preview. Carries extra fields
// (ship-to, PAN, payment instructions) so the preview can exercise the
// preview-only sections; real invoices simply omit these.
export const SAMPLE_INVOICE = {
  invoiceNumber: 'INV-2026-27-0001', invoiceDate: '03/07/2026', dueDate: '02/08/2026', status: 'Generated',
  billToName: 'Acme Retail Pvt Ltd', billToAddress: '4th Floor, Trade Tower, Ahmedabad', billToGstin: '24ABCDE1234F1Z5', billToState: 'Gujarat',
  billToEmail: 'accounts@acme.example', billToPhone: '+91 98250 00000', billToPan: 'ABCDE1234F',
  shipToName: 'Acme Retail — Warehouse', shipToAddress: 'Plot 22, GIDC Estate, Vatva, Ahmedabad', shipToState: 'Gujarat',
  paymentTerms: 'Net 30', paymentMode: 'Bank Transfer', upiId: 'company@upi',
  paymentInstructions: 'Please quote the invoice number with your payment. Cheques payable to the company name.',
  items: [
    { name: 'Consulting Services', description: 'Implementation — July', hsnSac: '9983', quantity: 10, unit: 'hrs', rate: 1500, discountPct: 5, taxRate: 18, amount: 16815 },
    { name: 'Annual Support Plan', hsnSac: '9983', quantity: 1, unit: 'yr', rate: 24000, discountPct: 0, taxRate: 18, amount: 28320 },
  ],
  subtotal: 39000, discountTotal: 750, taxableAmount: 38250, cgst: 3442.5, sgst: 3442.5, igst: 0, roundOff: 0.0, grandTotal: 45135,
  bankDetails: 'Bank: HDFC Bank\nA/C: 5010 0123 4567\nIFSC: HDFC0000123', notes: 'Thank you for your business.', termsConditions: 'Payment due within 30 days.',
};

// ── Canvas text model ───────────────────────────────────────────────────────
// The designer edits a block's text in place. `text`/`customSection` have always
// kept their body in `content`; every other block already uses `content` for an
// image URL, so their body lives in the additive `text` field. A block with no
// stored text renders exactly as it always did (data-driven default) — the
// override only kicks in once the user actually types something.

export const TEXT_EDITABLE_TYPES: CanvasElement['type'][] = [
  'text', 'customSection', 'companyDetails', 'customerDetails',
  'bankDetails', 'paymentInfo', 'terms', 'notes', 'signature', 'stamp',
];

export function isTextEditable(type: CanvasElement['type']): boolean {
  return TEXT_EDITABLE_TYPES.includes(type);
}

export function textPropOf(type: CanvasElement['type']): 'content' | 'text' {
  return type === 'text' || type === 'customSection' ? 'content' : 'text';
}

export function getElementText(el: CanvasElement): string {
  const v = (el as any)[textPropOf(el.type)];
  return typeof v === 'string' ? v : '';
}

export function hasElementText(el: CanvasElement): boolean {
  return isTextEditable(el.type) && getElementText(el).trim() !== '';
}

/** `{{Token}}` → live value. Case-insensitive, unknown tokens are left alone.
 *  Every token offered by the designer's token picker (`TOKEN_GROUPS`) must have
 *  an entry here — a token missing from this map prints as literal `{{…}}`. */
export function fillCanvasTokens(text: string, inv: any, company: any): string {
  // Company Profile is the master repository; older code read `gstin`/`email`.
  const companyGst = company?.gstNumber || company?.gstin || '';
  const companyEmail = company?.email || company?.contactEmail || company?.adminEmail || '';
  const map: Record<string, string> = {
    customername: inv?.billToName || '',
    customeraddress: inv?.billToAddress || '',
    customeremail: inv?.billToEmail || '',
    customerphone: inv?.billToPhone || '',
    customergst: inv?.billToGstin || '',
    invoicenumber: inv?.invoiceNumber || '',
    invoicedate: inv?.invoiceDate || '',
    duedate: inv?.dueDate || '',
    ponumber: inv?.poNumber || '',
    paymentmode: inv?.paymentMode || '',
    paymentterms: inv?.paymentTerms || '',
    upiid: inv?.upiId || '',
    companyname: company?.name || '',
    // Operating location of the issuing workspace ("Head Office" / "X Branch").
    branchname: company?.branchLabel || '',
    companyaddress: company?.address || '',
    companyemail: companyEmail,
    companyphone: company?.phone || company?.contactNumber || '',
    companygst: companyGst,
    gstin: companyGst,
    bankname: company?.bankName || '',
    ifsc: company?.ifscCode || '',
    accountnumber: company?.bankAccountNumber || '',
    bankdetails: inv?.bankDetails || '',
    terms: inv?.termsConditions || '',
    notes: inv?.notes || '',
    pagenumber: '1',
    totalpages: '1',
    customfield1: inv?.customField1 || '',
  };
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    const v = map[key.toLowerCase()];
    return v === undefined ? whole : esc(v).replace(/\n/g, '<br/>');
  });
}

/** The HTML a text-bearing block contributes, tokens resolved. */
export function canvasTextHtml(el: CanvasElement, inv: any, company: any): string {
  return fillCanvasTokens(getElementText(el), inv, company).replace(/\n/g, '<br/>');
}

export const TOTALS_ROWS: { key: string; label: string }[] = [
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'discount', label: 'Discount' },
  { key: 'taxable', label: 'Taxable Amount' },
  { key: 'cgst', label: 'CGST' },
  { key: 'sgst', label: 'SGST' },
  { key: 'igst', label: 'IGST' },
  { key: 'roundOff', label: 'Round Off' },
  { key: 'grandTotal', label: 'Grand Total' },
  { key: 'amountInWords', label: 'Amount in Words' },
];

export function totalsLabel(el: CanvasElement, key: string): string {
  const custom = el.totalsLabels?.[key];
  if (typeof custom === 'string' && custom.trim() !== '') return custom;
  return TOTALS_ROWS.find((r) => r.key === key)?.label || key;
}

/** Payment Mode + UPI ID, trimmed, with a `has` flag for the visibility rule. */
export function paymentInfoRows(inv: any): { mode: string; upi: string; has: boolean } {
  const mode = String(inv?.paymentMode ?? '').trim();
  const upi = String(inv?.upiId ?? '').trim();
  return { mode, upi, has: !!(mode || upi) };
}

/** The "Payment Information" section HTML (heading + only the rows that carry a
 *  value). Empty string when NEITHER field is set — so a template never shows a
 *  blank label or an empty box. Shared by the canvas `paymentInfo` block and the
 *  auto-inject-below-Bank-Details path; the classic renderer builds its own
 *  muted-styled version from `paymentInfoRows`. */
export function paymentInfoHtml(inv: any): string {
  const { mode, upi, has } = paymentInfoRows(inv);
  if (!has) return '';
  return `<strong>Payment Information</strong>`
    + (mode ? `<div>Payment Mode: ${esc(mode)}</div>` : '')
    + (upi ? `<div>UPI ID: ${esc(upi)}</div>` : '');
}

/** [top, right, bottom, left] in px, or null when the block has no padding.
 *  A per-side value wins over the uniform `padding`; unset sides fall back to it.
 *  Both the editor and the print renderer read this, so they cannot disagree. */
export function resolvePadding(el: CanvasElement): [number, number, number, number] | null {
  const base = el.padding;
  const sides = [el.paddingTop, el.paddingRight, el.paddingBottom, el.paddingLeft];
  if (base === undefined && sides.every(v => v === undefined)) return null;
  return sides.map(v => Number(v ?? base ?? 0)) as [number, number, number, number];
}

// ── Saved-layout adapters ────────────────────────────────────────────────────
// A saved canvas template (invoice_layouts.layoutJson) carries its blocks as
// `CanvasElement[]` under `.blocks` — the exact model the Visual Designer edits
// and this file renders. These two helpers let the Create-Invoice preview and
// the print/PDF path render a saved template through THIS renderer (so what the
// designer showed is what the invoice prints), instead of the older block model.

/** True when a saved layout's blocks are the `CanvasElement` model this renderer
 *  understands (they carry `zIndex`), vs. the legacy `CanvasBlock` model in
 *  invoiceCanvas.ts (which uses `z`). Empty/absent → treat as element model. */
export function layoutIsElementModel(layout: any): boolean {
  const blocks = layout?.blocks ?? layout?.elements;
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  const b = blocks[0] || {};
  if ('zIndex' in b) return true;
  if ('z' in b || 'style' in b) return false;   // legacy CanvasBlock
  return true;
}

/** Wrap a saved canvas layout's blocks in the `isCanvas` InvoiceDesign that
 *  `invoiceDocHtml` renders — identical to what the Visual Designer builds for
 *  its own live preview, so preview === designer === PDF. */
export function canvasDesignFromLayout(layout: any): InvoiceDesign {
  const elements: CanvasElement[] = Array.isArray(layout?.blocks) ? layout.blocks
    : Array.isArray(layout?.elements) ? layout.elements : [];
  return {
    isCanvas: true, template: 'canvas', title: 'TAX INVOICE', paper: 'A4', orientation: 'portrait',
    elements,
    colors: {} as any, font: {} as any, layout: {} as any, totals: {} as any,
    header: {} as any, customer: {} as any, footer: {} as any,
    columns: [], tableBorders: false, altRows: false, altRowColor: '', totalsPosition: 'right',
  };
}

// ── Canvas Renderer ─────────────────────────────────────────────────────────

function renderCanvasHtml(inv: any, company: any, design: InvoiceDesign, opts: RenderOpts): string {
  const b = resolveBranding(company);
  const elements = design.elements || [];
  const pageSize = `${design.paper || 'A4'} ${design.orientation || 'portrait'}`;
  
  // Web fonts must be FACE-loaded before the print dialog samples the page, or
  // the PDF silently substitutes a fallback. `document.fonts.ready` resolves
  // once every @font-face the document references has settled (or failed).
  const fontsLink = googleFontsLink(webFontsUsed(elements));
  const printScript = opts.print === false ? '' : `<script>window.onload=function(){
    var go=function(){setTimeout(function(){window.print();},60);};
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go).catch(go); else go();
  }</script>`;

  let html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNumber)}</title>
  ${fontsLink}
  <style>
    @page { size: ${pageSize}; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; position: relative; width: 100%; height: 100%; display: flex; justify-content: center; }
    .canvas-container { position: relative; width: 794px; height: 1123px; overflow: hidden; background: white; }
    .el { position: absolute; word-wrap: break-word; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e5e7eb; padding: 4px 6px; text-align: left; font-size: 0.9em; }
    th { background: #f8fafc; font-weight: bold; }
    .r { text-align: right; }
    /* The same rules the editor canvas applies — see richText.canvasTextCss. */
    ${canvasTextCss('.el')}
  </style></head><body><div class="canvas-container">`;

  // Sort elements by zIndex
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  for (const el of sorted) {
    if (!el.visible) continue;
    
    let style = `left: ${el.x}px; top: ${el.y}px; width: ${el.w}px; height: ${el.h}px; z-index: ${el.zIndex};`;
    if (el.rotation) style += ` transform: rotate(${el.rotation}deg);`;
    if (el.opacity !== undefined) style += ` opacity: ${el.opacity};`;
    if (el.fontFamily) style += ` font-family: ${el.fontFamily};`;
    if (el.fontSize) style += ` font-size: ${el.fontSize}px;`;
    if (el.fontWeight) style += ` font-weight: ${el.fontWeight};`;
    if (el.fontStyle) style += ` font-style: ${el.fontStyle};`;
    if (el.textDecoration) style += ` text-decoration: ${el.textDecoration};`;
    if (el.textTransform && el.textTransform !== 'none') style += ` text-transform: ${el.textTransform};`;
    if (el.textAlign) style += ` text-align: ${el.textAlign};`;
    if (el.color) style += ` color: ${el.color};`;
    if (el.letterSpacing) style += ` letter-spacing: ${el.letterSpacing}px;`;
    if (el.lineHeight) style += ` line-height: ${el.lineHeight};`;
    if (el.bg) style += ` background-color: ${el.bg};`;
    if (el.borderWidth) style += ` border-width: ${el.borderWidth}px;`;
    if (el.borderColor) style += ` border-color: ${el.borderColor};`;
    if (el.borderStyle) style += ` border-style: ${el.borderStyle};`;
    if (el.borderRadius) style += ` border-radius: ${el.borderRadius}px;`;
    const pad = resolvePadding(el);
    if (pad) style += ` padding: ${pad.map(v => `${v}px`).join(' ')};`;

    let innerHtml = '';
    
    switch (el.type) {
      case 'text':
      case 'customSection': {
        innerHtml = canvasTextHtml(el, inv, company);
        break;
      }
      case 'rect':
      case 'circle':
        if (el.type === 'circle') style += ' border-radius: 50%;';
        break;
      case 'line':
        style += ' border-top-width: ' + (el.borderWidth || 1) + 'px; border-top-style: ' + (el.borderStyle || 'solid') + '; border-top-color: ' + (el.borderColor || '#000') + ';';
        style += ' height: 0 !important; overflow: visible;';
        break;
      case 'image':
        innerHtml = `<img src="${el.src || ''}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'" />`;
        break;
      case 'stamp': {
        // A label, when the user has typed one, shares the box with the image.
        const labelled = hasElementText(el);
        const imgH = labelled ? '70%' : '100%';
        innerHtml = `<img src="${el.src || ''}" style="width:100%; height:${imgH}; object-fit:contain;" onerror="this.style.display='none'" />`;
        if (labelled) innerHtml += `<div>${canvasTextHtml(el, inv, company)}</div>`;
        break;
      }
      case 'logo':
        if (b.hasLogo) innerHtml = `<img src="${b.logo}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'" />`;
        break;
      case 'signature': {
        const labelled = hasElementText(el);
        const imgH = labelled ? '70%' : '100%';
        if (b.hasSignature) innerHtml = `<img src="${b.signature}" style="width:100%; height:${imgH}; object-fit:contain;" onerror="this.style.display='none'" />`;
        if (labelled) innerHtml += `<div>${canvasTextHtml(el, inv, company)}</div>`;
        break;
      }
      case 'qr':
        if (opts.qrDataUrl) innerHtml = `<img src="${opts.qrDataUrl}" style="width:100%; height:100%; object-fit:contain;" onerror="this.style.display='none'" />`;
        break;
      case 'barcode':
        // Placeholder for barcode preview since it requires JS rendering usually
        innerHtml = `<div style="width:100%; height:100%; border:1px solid #ccc; display:flex; align-items:center; justify-content:center;">|||||||||||||||</div>`;
        break;
      case 'companyDetails':
        // Legal entity, then the operating branch as a subtitle.
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company) : `<strong>${esc(company?.name || 'Company Name')}</strong><br/>
          ${esc(company?.address || '')}<br/>
          ${company?.gstin ? `GSTIN: ${esc(company.gstin)}<br/>` : ''}
          ${company?.email ? `${esc(company.email)}<br/>` : ''}
          ${company?.phone ? `${esc(company.phone)}<br/>` : ''}
          ${company?.branchLabel ? `<span style="font-weight:700">Branch: ${esc(company.branchLabel)}</span>` : ''}`;
        break;
      case 'customerDetails':
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company) : `<strong>${esc(inv.billToName || 'Customer')}</strong><br/>
          ${esc(inv.billToAddress || '')}<br/>
          ${inv.billToGstin ? `GSTIN: ${esc(inv.billToGstin)}<br/>` : ''}
          ${inv.billToEmail ? `${esc(inv.billToEmail)}<br/>` : ''}
          ${inv.billToPhone ? `${esc(inv.billToPhone)}` : ''}`;
        break;
      case 'itemTable':
        {
          const cols = (el.tableCols || DEFAULT_COLUMNS).filter(c => c.visible);
          let ths = cols.map(c => {
            const r = ['qty', 'rate', 'disc', 'gst', 'amount'].includes(c.key) ? ' class="r"' : '';
            return `<th${r} style="width:${c.width ? c.width + '%' : 'auto'}">${esc(c.label)}</th>`;
          }).join('');
          let trs = (inv.items || []).map((it:any, i:number) => {
            return `<tr>${cols.map(c => colCell(c, it, i)).join('')}</tr>`;
          }).join('');
          innerHtml = `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
        }
        break;
      case 'totals':
        {
          const rows = [];
          const tr = el.totalsRows || { subtotal: true, grandTotal: true };
          const L = (k: string) => esc(totalsLabel(el, k));
          if (tr.subtotal) rows.push(`<tr><td>${L('subtotal')}</td><td class="r">${money(inv.subtotal)}</td></tr>`);
          if (tr.discount) rows.push(`<tr><td>${L('discount')}</td><td class="r">− ${money(inv.discountTotal)}</td></tr>`);
          if (tr.taxable) rows.push(`<tr><td>${L('taxable')}</td><td class="r">${money(inv.taxableAmount)}</td></tr>`);
          if (tr.tax) {
            if (inv.cgst > 0) {
              rows.push(`<tr><td>${L('cgst')}</td><td class="r">${money(inv.cgst)}</td></tr>`);
              rows.push(`<tr><td>${L('sgst')}</td><td class="r">${money(inv.sgst)}</td></tr>`);
            } else if (inv.igst > 0) {
              rows.push(`<tr><td>${L('igst')}</td><td class="r">${money(inv.igst)}</td></tr>`);
            }
          }
          if (tr.roundOff) rows.push(`<tr><td>${L('roundOff')}</td><td class="r">${money(inv.roundOff)}</td></tr>`);
          if (tr.grandTotal) rows.push(`<tr><td style="font-weight:bold">${L('grandTotal')}</td><td class="r" style="font-weight:bold">${money(inv.grandTotal)}</td></tr>`);
          if (tr.amountInWords) rows.push(`<tr><td colspan="2" style="font-size:0.9em">${L('amountInWords')}: <b>${esc(amountInWords(inv.grandTotal))}</b></td></tr>`);
          innerHtml = `<table style="border:none"><tbody>${rows.join('')}</tbody></table>`;
        }
        break;
      case 'bankDetails':
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company)
          : inv.bankDetails ? `<strong>Bank Details</strong><br/>${esc(inv.bankDetails).replace(/\n/g, '<br/>')}` : '';
        break;
      case 'paymentInfo':
        // Typed override wins; otherwise the data-driven Payment Mode + UPI ID
        // (empty when neither is set → the block renders nothing).
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company) : paymentInfoHtml(inv);
        break;
      case 'terms':
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company)
          : inv.termsConditions ? `<strong>Terms & Conditions</strong><br/>${esc(inv.termsConditions).replace(/\n/g, '<br/>')}` : '';
        break;
      case 'notes':
        innerHtml = hasElementText(el) ? canvasTextHtml(el, inv, company)
          : inv.notes ? `<strong>Notes</strong><br/>${esc(inv.notes).replace(/\n/g, '<br/>')}` : '';
        break;
    }
    
    html += `<div class="el" style="${style}">${innerHtml}</div>`;
  }

  // Auto-inject "Payment Information" below Bank Details when the layout has no
  // dedicated paymentInfo block but the invoice carries Payment Mode / UPI ID.
  // Data-gated: invoices without those fields render exactly as before.
  const hasPaymentBlock = sorted.some((el) => el.type === 'paymentInfo' && el.visible !== false);
  const autoPayHtml = paymentInfoHtml(inv);
  if (!hasPaymentBlock && autoPayHtml) {
    const bank = sorted.filter((el) => el.type === 'bankDetails' && el.visible !== false).pop();
    const anchorX = bank ? bank.x : 40;
    const anchorW = bank ? bank.w : 300;
    const anchorY = bank ? Math.min(bank.y + bank.h + 8, 1123 - 60) : 900;
    html += `<div class="el" style="left:${anchorX}px; top:${anchorY}px; width:${anchorW}px; font-size:12px;">${autoPayHtml}</div>`;
  }

  html += `</div>${printScript}</body></html>`;
  return html;
}

