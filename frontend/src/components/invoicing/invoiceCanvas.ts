// ─────────────────────────────────────────────────────────────────────────────
// Visual Invoice Designer — CANVAS renderer (opt-in, additive).
//
// A canvas layout is a set of absolutely-positioned BLOCKS on an A4 page. The
// SAME `renderBlockHtml()` produces both the on-screen editing canvas and the
// print/PDF document (`canvasDocHtml`), so "what you design == what prints" by
// construction — exactly like the classic flow renderer's invoiceDocHtml.
//
// This does NOT touch the classic flow templates, GST, numbering, or any API.
// An invoice renders a canvas layout ONLY when a company sets one active.
// ─────────────────────────────────────────────────────────────────────────────
import { resolveBranding } from '@/services/brandingService';
import { amountInWords, SAMPLE_INVOICE } from './invoiceTemplate';

export type BlockType =
  | 'text' | 'logo' | 'company' | 'customer' | 'itemTable' | 'taxSummary'
  | 'bank' | 'signature' | 'stamp' | 'notes' | 'terms' | 'divider' | 'space'
  | 'qr' | 'barcode' | 'image' | 'custom';

export interface BlockStyle {
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
  padding?: number;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  lineHeight?: number;
  letterSpacing?: number;
}

export interface CanvasBlock {
  id: string;
  type: BlockType;
  x: number; y: number; w: number; h: number;
  z?: number;
  visible?: boolean;   // default true
  locked?: boolean;    // Phase 2 interaction; stored now
  content?: string;    // text / custom / image src
  style?: BlockStyle;
}

export interface CanvasPage { width: number; height: number; margin: number; background?: string; fontFamily?: string; }

export interface InvoiceLayout {
  id?: number;
  name: string;
  page: CanvasPage;
  blocks: CanvasBlock[];
}

// A4 portrait at ~96dpi.
export const A4_PAGE: CanvasPage = { width: 794, height: 1123, margin: 32, background: '#ffffff', fontFamily: "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif" };

const FONT = A4_PAGE.fontFamily!;
export const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const inr = (n: any, cur = '₹') => cur + Math.round(Number(n) || 0).toLocaleString('en-IN');

// ── Block library (drives the palette). Each entry seeds a new block. ──────────
export interface BlockDef { type: BlockType; label: string; w: number; h: number; content?: string; }
export const BLOCK_LIBRARY: BlockDef[] = [
  { type: 'text', label: 'Text', w: 240, h: 36, content: 'Text' },
  { type: 'logo', label: 'Logo', w: 140, h: 70 },
  { type: 'company', label: 'Company Details', w: 320, h: 96 },
  { type: 'customer', label: 'Customer Details', w: 300, h: 96 },
  { type: 'itemTable', label: 'Item Table', w: 730, h: 200 },
  { type: 'taxSummary', label: 'Tax Summary', w: 300, h: 150 },
  { type: 'bank', label: 'Bank Details', w: 320, h: 90 },
  { type: 'qr', label: 'QR Code', w: 90, h: 90 },
  { type: 'barcode', label: 'Barcode', w: 200, h: 60 },
  { type: 'signature', label: 'Signature', w: 200, h: 80 },
  { type: 'stamp', label: 'Stamp', w: 110, h: 110 },
  { type: 'notes', label: 'Notes', w: 360, h: 70 },
  { type: 'terms', label: 'Terms & Conditions', w: 360, h: 90 },
  { type: 'divider', label: 'Divider', w: 730, h: 2 },
  { type: 'space', label: 'Space', w: 200, h: 40 },
  { type: 'image', label: 'Image', w: 160, h: 120 },
  { type: 'custom', label: 'Custom Block', w: 260, h: 60, content: 'Custom content' },
];
export const BLOCK_LABEL: Record<string, string> = Object.fromEntries(BLOCK_LIBRARY.map((b) => [b.type, b.label]));

// Simple {{token}} substitution for text/custom blocks.
function fillTokens(text: string, inv: any, company: any, b: any): string {
  const map: Record<string, string> = {
    invoice_number: inv.invoiceNumber || '', invoice_date: inv.invoiceDate || '', due_date: inv.dueDate || '',
    company_name: b.companyName || company?.name || '', customer_name: inv.billToName || '',
    grand_total: inr(inv.grandTotal, inv.currency === 'INR' || !inv.currency ? '₹' : ''),
    po_number: inv.poNumber || '', place_of_supply: inv.placeOfSupply || inv.billToState || '',
  };
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (map[k] != null ? esc(map[k]) : m));
}

function styleCss(s: BlockStyle = {}, extra = ''): string {
  const bits = [
    `font-family:${FONT}`,
    `font-size:${s.fontSize ?? 12}px`,
    `font-weight:${s.fontWeight ?? 400}`,
    s.fontStyle ? `font-style:${s.fontStyle}` : '',
    `color:${s.color || '#111827'}`,
    s.background ? `background:${s.background}` : '',
    `text-align:${s.align || 'left'}`,
    `padding:${s.padding ?? 0}px`,
    s.borderWidth ? `border:${s.borderWidth}px solid ${s.borderColor || '#e5e7eb'}` : '',
    s.borderRadius ? `border-radius:${s.borderRadius}px` : '',
    `line-height:${s.lineHeight ?? 1.35}`,
    s.letterSpacing ? `letter-spacing:${s.letterSpacing}px` : '',
    'box-sizing:border-box;overflow:hidden;width:100%;height:100%',
    extra,
  ].filter(Boolean);
  return bits.join(';');
}

const muted = 'color:#6b7280';

// ── Per-block inner HTML. `ctx` = { inv, company, branding }. ──────────────────
export interface BlockCtx { inv: any; company: any; branding: ReturnType<typeof resolveBranding>; qrDataUrl?: string; barcodeDataUrl?: string; }

export function renderBlockHtml(block: CanvasBlock, ctx: BlockCtx): string {
  const { inv, company, branding: b } = ctx;
  const s = block.style || {};
  const wrap = (inner: string, extra = '') => `<div style="${styleCss(s, extra)}">${inner}</div>`;

  switch (block.type) {
    case 'text':
    case 'custom':
      return wrap(`<div style="white-space:pre-wrap">${fillTokens(block.content || '', inv, company, b)}</div>`, 'display:flex;flex-direction:column;justify-content:center');

    case 'logo':
      return b.hasLogo
        ? `<div style="${styleCss(s, 'display:flex;align-items:center')}"><img src="${b.logo}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>`
        : wrap(`<div style="${muted};font-weight:800;font-size:16px">${esc(b.companyName || company?.name || 'LOGO')}</div>`, 'display:flex;align-items:center');

    case 'company':
      return wrap([
        `<div style="font-weight:800;font-size:${(s.fontSize ?? 12) + 3}px">${esc(b.companyName || company?.name || 'Company')}</div>`,
        company?.address ? `<div style="${muted}">${esc(company.address)}</div>` : '',
        company?.gstNumber ? `<div style="${muted}">GSTIN: ${esc(company.gstNumber)}</div>` : '',
        company?.panNumber ? `<div style="${muted}">PAN: ${esc(company.panNumber)}</div>` : '',
        (company?.email || company?.phone) ? `<div style="${muted}">${esc(company.email || '')} ${esc(company.phone || '')}</div>` : '',
      ].filter(Boolean).join(''));

    case 'customer':
      return wrap([
        `<div style="${muted};font-weight:700;text-transform:uppercase;font-size:10px">Bill To</div>`,
        `<div style="font-weight:700">${esc(inv.billToName || '')}</div>`,
        inv.billToAddress ? `<div style="${muted}">${esc(inv.billToAddress)}</div>` : '',
        inv.billToGstin ? `<div style="${muted}">GSTIN: ${esc(inv.billToGstin)}</div>` : '',
        (inv.billToEmail || inv.billToPhone) ? `<div style="${muted}">${esc(inv.billToEmail || '')} ${esc(inv.billToPhone || '')}</div>` : '',
      ].filter(Boolean).join(''));

    case 'itemTable': {
      const cur = inv.currency === 'INR' || !inv.currency ? '₹' : '';
      const rows = (inv.items || []).map((it: any, i: number) => `
        <tr>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:center">${i + 1}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px">${esc(it.name || '')}${it.description ? `<div style="${muted};font-size:10px">${esc(it.description)}</div>` : ''}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:center">${esc(it.hsnSac || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${esc(it.quantity ?? '')} ${esc(it.unit || '')}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${inr(it.rate, cur)}</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${esc(it.discountPct || 0)}%</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${esc(it.taxRate || 0)}%</td>
          <td style="border:1px solid #e5e7eb;padding:4px 6px;text-align:right">${inr(it.amount, cur)}</td>
        </tr>`).join('');
      const head = ['#', 'Item', 'HSN/SAC', 'Qty', 'Rate', 'Disc', 'GST', 'Amount']
        .map((h, i) => `<th style="border:1px solid #d1d5db;padding:5px 6px;background:#f1f5f9;text-align:${i >= 3 ? 'right' : i === 0 ? 'center' : 'left'};font-size:10px;text-transform:uppercase">${h}</th>`).join('');
      return `<div style="${styleCss(s, 'overflow:auto')}"><table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:${s.fontSize ?? 11}px">
        <thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    case 'taxSummary': {
      const cur = inv.currency === 'INR' || !inv.currency ? '₹' : '';
      const row = (l: string, v: any, strong = false) => `<div style="display:flex;justify-content:space-between;${strong ? 'font-weight:800' : muted}"><span>${l}</span><span>${inr(v, cur)}</span></div>`;
      const taxRows = inv.igst > 0 ? row('IGST', inv.igst) : `${row('CGST', inv.cgst)}${row('SGST', inv.sgst)}`;
      return wrap([
        row('Subtotal', inv.subtotal),
        (inv.discountTotal > 0 ? row('Discount', -inv.discountTotal) : ''),
        row('Taxable', inv.taxableAmount),
        taxRows,
        (inv.roundOff ? row('Round Off', inv.roundOff) : ''),
        `<div style="border-top:1px solid #d1d5db;margin-top:4px;padding-top:4px">${row('Grand Total', inv.grandTotal, true)}</div>`,
        `<div style="${muted};font-size:10px;margin-top:4px">${esc(amountInWords(inv.grandTotal))}</div>`,
      ].filter(Boolean).join(''));
    }

    case 'bank':
      return wrap([
        `<div style="font-weight:700">Bank Details</div>`,
        inv.bankDetails ? `<div style="${muted};white-space:pre-wrap">${esc(inv.bankDetails)}</div>` : `<div style="${muted}">—</div>`,
        inv.upiId ? `<div style="${muted}">UPI: ${esc(inv.upiId)}</div>` : '',
      ].filter(Boolean).join(''));

    case 'signature':
      return `<div style="${styleCss(s, 'display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end')}">
        ${b.hasSignature ? `<img src="${b.signature}" style="max-height:60%;max-width:80%;object-fit:contain"/>` : ''}
        <div style="border-top:1px solid #9ca3af;min-width:120px;text-align:center;padding-top:2px;${muted}">${esc(b.signatureText || 'Authorized Signatory')}</div>
      </div>`;

    case 'stamp':
      return b.hasSeal
        ? `<div style="${styleCss(s, 'display:flex;align-items:center;justify-content:center')}"><img src="${b.seal}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>`
        : wrap(`<div style="border:1.5px dashed #d1d5db;border-radius:50%;width:100%;height:100%;display:flex;align-items:center;justify-content:center;${muted};font-size:10px">STAMP</div>`);

    case 'notes':
      return wrap([`<div style="font-weight:700">Notes</div>`, `<div style="${muted};white-space:pre-wrap">${esc(inv.notes || block.content || '')}</div>`].join(''));

    case 'terms':
      return wrap([`<div style="font-weight:700">Terms &amp; Conditions</div>`, `<div style="${muted};white-space:pre-wrap">${esc(inv.termsConditions || block.content || '')}</div>`].join(''));

    case 'divider':
      return `<div style="width:100%;height:100%;background:${s.background || s.color || '#d1d5db'}"></div>`;

    case 'space':
      return `<div style="width:100%;height:100%"></div>`;

    case 'qr':
      return ctx.qrDataUrl
        ? `<div style="${styleCss(s, 'display:flex;align-items:center;justify-content:center')}"><img src="${ctx.qrDataUrl}" style="width:100%;height:100%;object-fit:contain"/></div>`
        : wrap(`<div style="border:1px dashed #d1d5db;width:100%;height:100%;display:flex;align-items:center;justify-content:center;${muted};font-size:10px">QR</div>`);

    case 'barcode':
      return ctx.barcodeDataUrl
        ? `<div style="${styleCss(s, 'display:flex;align-items:center;justify-content:center')}"><img src="${ctx.barcodeDataUrl}" style="width:100%;height:100%;object-fit:contain"/></div>`
        : wrap(`<div style="border:1px dashed #d1d5db;width:100%;height:100%;display:flex;align-items:center;justify-content:center;${muted};font-size:10px">BARCODE</div>`);

    case 'image':
      return block.content
        ? `<div style="${styleCss(s, 'display:flex;align-items:center;justify-content:center')}"><img src="${block.content}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>`
        : wrap(`<div style="border:1px dashed #d1d5db;width:100%;height:100%;display:flex;align-items:center;justify-content:center;${muted};font-size:10px">IMAGE</div>`);

    default:
      return wrap('');
  }
}

// The whole page inner HTML (blocks positioned absolutely). Shared by editor + print.
export function renderLayoutInner(layout: InvoiceLayout, ctx: BlockCtx): string {
  const blocks = (layout.blocks || []).filter((bl) => bl.visible !== false).slice().sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  return blocks.map((bl) => `<div style="position:absolute;left:${bl.x}px;top:${bl.y}px;width:${bl.w}px;height:${bl.h}px;z-index:${bl.z ?? 0}">${renderBlockHtml(bl, ctx)}</div>`).join('');
}

export interface CanvasRenderOpts { print?: boolean; qrDataUrl?: string; barcodeDataUrl?: string; }

// Full standalone HTML document — used by the live preview iframe AND printInvoice.
export function canvasDocHtml(inv: any, company: any, layout: InvoiceLayout, opts: CanvasRenderOpts = {}): string {
  const page = { ...A4_PAGE, ...(layout.page || {}) };
  const branding = resolveBranding(company);
  const inner = renderLayoutInner(layout, { inv, company, branding, qrDataUrl: opts.qrDataUrl, barcodeDataUrl: opts.barcodeDataUrl });
  const printScript = opts.print ? '<script>window.onload=function(){setTimeout(function(){window.print();},120);}<\/script>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(inv.invoiceNumber || 'Invoice')}</title>
    <style>
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#eef2f6;font-family:${page.fontFamily}}
      .page{position:relative;width:${page.width}px;height:${page.height}px;background:${page.background || '#fff'};margin:0 auto;box-shadow:0 2px 16px rgba(0,0,0,.12);overflow:hidden}
      @media print{ html,body{background:#fff} .page{box-shadow:none;margin:0} @page{size:A4;margin:0} }
    </style></head>
    <body><div class="page">${inner}</div>${printScript}</body></html>`;
}

// ── A sensible starter layout + a couple of named presets. ─────────────────────
const M = A4_PAGE.margin;
const RIGHT = A4_PAGE.width - M;
export function DEFAULT_LAYOUT(name = 'Modern'): InvoiceLayout {
  return {
    name,
    page: { ...A4_PAGE },
    blocks: [
      { id: 'logo', type: 'logo', x: M, y: M, w: 150, h: 70 },
      { id: 'title', type: 'text', x: RIGHT - 240, y: M, w: 240, h: 40, content: 'TAX INVOICE', style: { fontSize: 24, fontWeight: 800, align: 'right', color: '#1e293b' } },
      { id: 'company', type: 'company', x: M, y: M + 82, w: 340, h: 96 },
      { id: 'meta', type: 'text', x: RIGHT - 240, y: M + 50, w: 240, h: 60, content: 'Invoice #: {{invoice_number}}\nDate: {{invoice_date}}\nDue: {{due_date}}', style: { fontSize: 11, align: 'right', color: '#6b7280' } },
      { id: 'customer', type: 'customer', x: M, y: 210, w: 340, h: 100 },
      { id: 'items', type: 'itemTable', x: M, y: 330, w: RIGHT - M, h: 220 },
      { id: 'tax', type: 'taxSummary', x: RIGHT - 300, y: 570, w: 300, h: 160 },
      { id: 'bank', type: 'bank', x: M, y: 570, w: 340, h: 100 },
      { id: 'notes', type: 'notes', x: M, y: 690, w: 380, h: 70 },
      { id: 'sign', type: 'signature', x: RIGHT - 220, y: 760, w: 220, h: 90 },
      { id: 'stamp', type: 'stamp', x: RIGHT - 360, y: 750, w: 110, h: 110 },
    ],
  };
}

export interface LayoutPreset { id: string; name: string; build: () => InvoiceLayout; }
export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: 'modern', name: 'Modern', build: () => DEFAULT_LAYOUT('Modern') },
  {
    id: 'corporate', name: 'Corporate', build: () => {
      const l = DEFAULT_LAYOUT('Corporate');
      // Corporate = centered banner title + full-width divider under header.
      l.blocks = l.blocks.map((bl) => bl.id === 'title'
        ? { ...bl, x: M, w: RIGHT - M, style: { fontSize: 22, fontWeight: 800, align: 'center', color: '#0b2447', background: '#eef4ff', padding: 8 } }
        : bl);
      l.blocks.push({ id: 'rule', type: 'divider', x: M, y: M + 60, w: RIGHT - M, h: 2, style: { background: '#0b2447' } });
      return l;
    },
  },
  {
    id: 'retail', name: 'Retail', build: () => {
      const l = DEFAULT_LAYOUT('Retail');
      l.blocks.push({ id: 'qr', type: 'qr', x: M, y: 760, w: 90, h: 90 });
      return l;
    },
  },
];

export function resolveLayout(saved: any): InvoiceLayout {
  if (saved && Array.isArray(saved.blocks)) return { name: saved.name || 'Layout', page: { ...A4_PAGE, ...(saved.page || {}) }, blocks: saved.blocks };
  return DEFAULT_LAYOUT();
}

export { SAMPLE_INVOICE };
