// ─────────────────────────────────────────────────────────────────────────────
// richText — the typography vocabulary shared by the Invoice Visual Designer's
// editor canvas and its print/PDF renderer.
//
// The rule that keeps "preview === PDF" true: every typographic value the
// toolbar can produce is either
//   (a) a CanvasElement property, emitted as CSS by BOTH `renderCanvasHtml`
//       (print) and `DraggableElement`'s inline style (editor), or
//   (b) inline HTML inside the block's stored text (`<b>`, `<span style>`,
//       `<ul>`), which both paths dump verbatim into the same CSS scope.
//
// `canvasTextCss(scope)` is that CSS scope. It is emitted once into the print
// document under `.el` and once into the editor under `.zh-rt`, from this one
// string — so a bullet list, an underline or a strikethrough cannot render one
// way on the canvas and another way on paper.
//
// Nothing here touches invoice generation, GST, or totals.
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of CanvasElement this module reasons about. Declared structurally
 *  so richText.ts has no runtime import of invoiceTemplate.ts (one-way dep). */
export interface TypographyElement {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  textTransform?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  bg?: string;
  letterSpacing?: number;
  lineHeight?: number;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: string;
  borderRadius?: number;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  opacity?: number;
}

// ── Fonts ────────────────────────────────────────────────────────────────────
// `web` is the Google Fonts family name. A layout that uses none of them adds no
// <link> to the printed document, so existing templates print byte-identically.

export interface FontOption { label: string; css: string; web?: string }

export const FONT_FAMILIES: FontOption[] = [
  { label: 'Inter',           css: "'Inter', sans-serif",                    web: 'Inter' },
  { label: 'Poppins',         css: "'Poppins', sans-serif",                  web: 'Poppins' },
  { label: 'Roboto',          css: "'Roboto', sans-serif",                   web: 'Roboto' },
  { label: 'Open Sans',       css: "'Open Sans', sans-serif",                web: 'Open Sans' },
  { label: 'Lato',            css: "'Lato', sans-serif",                     web: 'Lato' },
  { label: 'Montserrat',      css: "'Montserrat', sans-serif",               web: 'Montserrat' },
  { label: 'Arial',           css: "Arial, Helvetica, sans-serif" },
  { label: 'Times New Roman', css: "'Times New Roman', Times, serif" },
  { label: 'Calibri',         css: "Calibri, 'Segoe UI', sans-serif" },
  { label: 'Georgia',         css: "Georgia, 'Times New Roman', serif" },
  { label: 'Courier New',     css: "'Courier New', Courier, monospace" },
];

export const DEFAULT_FONT_CSS = "'Segoe UI', Arial, sans-serif";

/** All weights we offer, so a web font is fetched with the faces the user can pick. */
const WEB_FONT_WEIGHTS = '100;300;400;500;600;700;800';

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72];
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;

export const FONT_WEIGHTS: { label: string; value: string }[] = [
  { label: 'Thin',       value: '100' },
  { label: 'Light',      value: '300' },
  { label: 'Regular',    value: '400' },
  { label: 'Medium',     value: '500' },
  { label: 'Semi Bold',  value: '600' },
  { label: 'Bold',       value: '700' },
  { label: 'Extra Bold', value: '800' },
];

export const LINE_HEIGHTS = [1, 1.15, 1.2, 1.35, 1.5, 1.75, 2, 2.5];

export const TEXT_TRANSFORMS: { label: string; value: string }[] = [
  { label: 'Normal',     value: 'none' },
  { label: 'UPPERCASE',  value: 'uppercase' },
  { label: 'lowercase',  value: 'lowercase' },
  { label: 'Title Case', value: 'capitalize' },
];

export const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double'];

/** Which font families a layout actually references — decides the print <link>. */
export function webFontsUsed(elements: { fontFamily?: string }[]): string[] {
  const wanted = new Set<string>();
  for (const el of elements || []) {
    if (!el?.fontFamily) continue;
    const hit = FONT_FAMILIES.find(f => f.css === el.fontFamily && f.web);
    if (hit?.web) wanted.add(hit.web);
  }
  return [...wanted];
}

/** `<link>` tags for the given Google families, or '' when none are used.
 *  Printed documents must not substitute fonts, so the print path waits on
 *  `document.fonts.ready` (see `renderCanvasHtml`) before calling print(). */
export function googleFontsLink(families: string[]): string {
  if (!families.length) return '';
  const q = families
    .map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${WEB_FONT_WEIGHTS}`)
    .join('&');
  return `<link rel="preconnect" href="https://fonts.googleapis.com">` +
         `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
         `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">`;
}

// ── Shared text CSS ──────────────────────────────────────────────────────────
// Tailwind's preflight strips list markers and bold/italic defaults inside the
// app, while the print document has no reset at all. Without this both sides
// drift: a bullet list shows markers on paper and none on the canvas. Emitting
// the SAME declarations into both scopes is what makes them agree.

export function canvasTextCss(scope: string): string {
  return `
    ${scope} p { margin: 0; }
    ${scope} ul, ${scope} ol { margin: 0; padding-left: 1.4em; }
    ${scope} ul { list-style: disc outside; }
    ${scope} ol { list-style: decimal outside; }
    ${scope} li { margin: 0; padding: 0; display: list-item; }
    ${scope} b, ${scope} strong { font-weight: bold; }
    ${scope} i, ${scope} em { font-style: italic; }
    ${scope} u { text-decoration: underline; }
    ${scope} s, ${scope} strike, ${scope} del { text-decoration: line-through; }
    ${scope} sub { vertical-align: sub; font-size: smaller; }
    ${scope} sup { vertical-align: super; font-size: smaller; }
  `;
}

// ── Sanitising + normalising contentEditable output ──────────────────────────
// The stored text is injected raw into `dangerouslySetInnerHTML` and into the
// print document, so what the editor emits is sanitised on the way out.

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
  'BR', 'SPAN', 'FONT', 'UL', 'OL', 'LI', 'DIV', 'P', 'SUB', 'SUP',
]);

/** Attributes kept per tag. Everything else (class, id, on*, src…) is dropped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  FONT: new Set(['style', 'color', 'face', 'size']),
  '*': new Set(['style']),
};

const UNSAFE_CSS = /(expression|javascript:|@import|behaviou?r\s*:|url\s*\()/i;

function cleanStyle(value: string): string {
  return value
    .split(';')
    .map(d => d.trim())
    .filter(d => d && !UNSAFE_CSS.test(d))
    .join('; ');
}

function scrubElement(el: Element): void {
  const allowed = ALLOWED_ATTRS[el.tagName] || ALLOWED_ATTRS['*'];
  for (const attr of [...el.attributes]) {
    if (!allowed.has(attr.name.toLowerCase())) { el.removeAttribute(attr.name); continue; }
    if (attr.name.toLowerCase() === 'style') {
      const safe = cleanStyle(attr.value);
      if (safe) el.setAttribute('style', safe); else el.removeAttribute('style');
    }
  }
}

/** Replace a node with its children, in place. */
function unwrap(node: Element): void {
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  parent.removeChild(node);
}

/** A `<div>`/`<p>` that carries no styling is contentEditable's line wrapper,
 *  not the user's intent — fold it back into `<br/>`-separated content. One that
 *  carries a `style` (what `justifyCenter` produces) is real formatting: keep it. */
function isBareWrapper(el: Element): boolean {
  return (el.tagName === 'DIV' || el.tagName === 'P') && !el.getAttribute('style');
}

function foldBareWrappers(root: Element): void {
  // Snapshot: unwrapping mutates the child list while we walk it.
  for (const child of [...root.children]) foldBareWrappers(child);

  for (const child of [...root.children]) {
    if (!isBareWrapper(child)) continue;
    // `<div><br></div>` is an EMPTY line: the separator alone represents it.
    const lone = child.childNodes.length === 1 && (child.firstChild as Element)?.nodeName === 'BR';
    if (lone) child.removeChild(child.firstChild!);
    if (child.previousSibling) root.insertBefore(document.createElement('br'), child);
    unwrap(child);
  }
}

function scrubTree(root: Element): void {
  for (const child of [...root.children]) {
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Never keep the contents of a script/style container.
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') child.remove();
      else { scrubTree(child); unwrap(child); }
      continue;
    }
    scrubElement(child);
    scrubTree(child);
  }
}

/** Strip unsafe markup, keeping the inline formatting the toolbar produces. */
export function sanitizeRichHtml(html: string): string {
  if (typeof document === 'undefined') return String(html || '');
  const host = document.createElement('div');
  host.innerHTML = String(html || '');
  scrubTree(host);
  return host.innerHTML;
}

/** Sanitise + fold contentEditable's line wrappers + trim stray leading/trailing
 *  breaks. This is what an edit session commits. */
export function normalizeRichHtml(html: string): string {
  if (typeof document === 'undefined') return String(html || '');
  const host = document.createElement('div');
  host.innerHTML = String(html || '');
  scrubTree(host);
  foldBareWrappers(host);
  return host.innerHTML
    .replace(/&nbsp;/g, ' ')
    .replace(/^(?:<br\s*\/?>)+/i, '')
    .replace(/(?:<br\s*\/?>)+$/i, '')
    .trim();
}

/** Turn `<br/>`-separated lines into a list, or a list back into lines.
 *  Used when the list buttons are pressed with no caret in the text (the
 *  element is selected but not open for inline editing). */
export function toggleListHtml(html: string, kind: 'ul' | 'ol'): string {
  if (typeof document === 'undefined') return html;
  const host = document.createElement('div');
  host.innerHTML = String(html || '');

  const existing = host.querySelector(kind);
  if (existing && host.children.length === 1 && host.firstElementChild === existing) {
    const lines = [...existing.querySelectorAll('li')].map(li => li.innerHTML);
    return lines.join('<br/>');
  }

  const lines = host.innerHTML.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return `<${kind}><li></li></${kind}>`;
  return `<${kind}>${lines.map(l => `<li>${l}</li>`).join('')}</${kind}>`;
}

// ── Colours ──────────────────────────────────────────────────────────────────

/** ZeniaHR brand ramp + document neutrals (see the design-system tokens). */
export const THEME_COLORS: string[] = [
  '#000000', '#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#ffffff',
  '#6C3CF0', '#5B2DE6', '#4C1FD4', '#8F6BF5', '#CFC2FD', '#F3F0FF',
  '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb',
];

export const HIGHLIGHT_COLORS: string[] = [
  'transparent', '#fef08a', '#fed7aa', '#fecaca', '#bbf7d0', '#bfdbfe',
  '#e9d5ff', '#f5f5f4', '#e2e8f0', '#fde68a', '#a7f3d0', '#c7d2fe',
];

const RECENT_COLORS_KEY = 'zh_invoice_recent_colors';
const RECENT_LIMIT = 12;

export function loadRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COLORS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(c => typeof c === 'string').slice(0, RECENT_LIMIT) : [];
  } catch { return []; }
}

/** Recent swatches are a preference, not a dataset — a dozen hex strings. */
export function pushRecentColor(color: string): string[] {
  const next = [color, ...loadRecentColors().filter(c => c !== color)].slice(0, RECENT_LIMIT);
  try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next)); } catch { /* quota / private mode */ }
  return next;
}

export const isHexColor = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

// ── Dynamic tokens ───────────────────────────────────────────────────────────
// Every token here must exist in `fillCanvasTokens`, otherwise the picker would
// insert a placeholder that prints literally.

export interface TokenGroup { label: string; tokens: { token: string; label: string }[] }

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    label: 'Company',
    tokens: [
      { token: 'CompanyName',    label: 'Company Name' },
      { token: 'CompanyGst',     label: 'GST Number' },
      { token: 'CompanyAddress', label: 'Address' },
      { token: 'CompanyPhone',   label: 'Phone' },
      { token: 'CompanyEmail',   label: 'Email' },
    ],
  },
  {
    label: 'Customer',
    tokens: [
      { token: 'CustomerName',    label: 'Customer Name' },
      { token: 'CustomerAddress', label: 'Customer Address' },
      { token: 'CustomerGst',     label: 'GST' },
      { token: 'CustomerPhone',   label: 'Phone' },
      { token: 'CustomerEmail',   label: 'Email' },
    ],
  },
  {
    label: 'Invoice',
    tokens: [
      { token: 'InvoiceNumber', label: 'Invoice Number' },
      { token: 'InvoiceDate',   label: 'Invoice Date' },
      { token: 'DueDate',       label: 'Due Date' },
      { token: 'PoNumber',      label: 'PO Number' },
      { token: 'PageNumber',    label: 'Page Number' },
    ],
  },
  {
    label: 'Payment',
    tokens: [
      { token: 'PaymentMode',   label: 'Payment Mode' },
      { token: 'UpiId',         label: 'UPI ID' },
      { token: 'PaymentTerms',  label: 'Payment Terms' },
      { token: 'BankName',      label: 'Bank Name' },
      { token: 'Ifsc',          label: 'IFSC' },
      { token: 'AccountNumber', label: 'Account Number' },
      { token: 'BankDetails',   label: 'Full Bank Details' },
    ],
  },
];

// ── Format painter ───────────────────────────────────────────────────────────
// Geometry (x/y/w/h), rotation, z-order, content and identity are never copied —
// only how the block LOOKS.

export const TYPOGRAPHY_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecoration', 'textTransform',
  'textAlign', 'color', 'bg', 'letterSpacing', 'lineHeight',
  'borderWidth', 'borderColor', 'borderStyle', 'borderRadius',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'opacity',
] as const;

export type TypographyProp = typeof TYPOGRAPHY_PROPS[number];

export function pickTypography(el: TypographyElement): Partial<TypographyElement> {
  const out: any = {};
  for (const k of TYPOGRAPHY_PROPS) {
    const v = (el as any)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

// ── Default styles per document role ─────────────────────────────────────────
// Saved inside the layout JSON (`styleRoles`), so reopening a template restores
// them. Absent from older layouts → these defaults apply.

export type StyleRole = 'header' | 'body' | 'footer' | 'table' | 'totals';

export const STYLE_ROLES: { key: StyleRole; label: string }[] = [
  { key: 'header', label: 'Header' },
  { key: 'body',   label: 'Body' },
  { key: 'footer', label: 'Footer' },
  { key: 'table',  label: 'Tables' },
  { key: 'totals', label: 'Totals' },
];

export type StyleRoleMap = Record<StyleRole, Partial<TypographyElement>>;

export const DEFAULT_STYLE_ROLES: StyleRoleMap = {
  header: { fontFamily: FONT_FAMILIES[0].css, fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'left', lineHeight: 1.2, letterSpacing: 0 },
  body:   { fontFamily: FONT_FAMILIES[0].css, fontSize: 12, fontWeight: '400', color: '#1e293b', textAlign: 'left', lineHeight: 1.5, letterSpacing: 0 },
  footer: { fontFamily: FONT_FAMILIES[0].css, fontSize: 10, fontWeight: '400', color: '#6b7280', textAlign: 'center', lineHeight: 1.4, letterSpacing: 0 },
  table:  { fontFamily: FONT_FAMILIES[0].css, fontSize: 11, fontWeight: '400', color: '#1e293b', textAlign: 'left', lineHeight: 1.4, letterSpacing: 0 },
  totals: { fontFamily: FONT_FAMILIES[0].css, fontSize: 12, fontWeight: '600', color: '#111827', textAlign: 'right', lineHeight: 1.4, letterSpacing: 0 },
};

export function resolveStyleRoles(saved: any): StyleRoleMap {
  const out = {} as StyleRoleMap;
  for (const { key } of STYLE_ROLES) {
    out[key] = { ...DEFAULT_STYLE_ROLES[key], ...((saved && saved[key]) || {}) };
  }
  return out;
}
