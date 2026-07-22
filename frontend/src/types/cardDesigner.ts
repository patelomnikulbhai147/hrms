// ─────────────────────────────────────────────────────────────────────────────
// Employee Card Designer — portable JSON design-spec types.
//
// A CardTemplate is a fully self-contained, serialisable design (front + back)
// that can be stored, imported/exported, and rendered against ANY employee.
// Coordinates are plain CSS pixels in the card's own "design space" (see SIZES);
// the renderer/exporters apply a single uniform scale for thumbnails, live
// preview and high-DPI print capture. Modelled on the greeting-card `layout`
// JSON approach already used by CommunicationCenter.
// ─────────────────────────────────────────────────────────────────────────────

export type CardSide = 'front' | 'back';
export type CardOrientation = 'portrait' | 'landscape';
export type CardSizeId = 'CR80' | 'A7' | 'A6' | 'visitor' | 'info';

// Every dynamic field bindable to an employee record, plus static/decorative types.
export type CardElementType =
  | 'companyLogo' | 'companyName' | 'tagline'
  | 'photo' | 'name' | 'employeeId' | 'department' | 'designation'
  | 'bloodGroup' | 'qr' | 'barcode' | 'signature'
  | 'issueDate' | 'validUntil' | 'emergencyContact' | 'address'
  | 'branch' | 'email' | 'phone' | 'employmentType'
  | 'backgroundImage' | 'watermark'
  | 'text' | 'divider' | 'box';

export interface CardElementStyle {
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  color?: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  radius?: number;
  opacity?: number;
  borderWidth?: number;
  borderColor?: string;
  uppercase?: boolean;
  lineHeight?: number;
  objectFit?: 'cover' | 'contain';
}

export interface CardElement {
  id: string;
  type: CardElementType;
  side: CardSide;
  x: number; y: number; w: number; h: number;
  rotation?: number;
  visible?: boolean;          // Show/Hide fields (default true)
  z?: number;
  /** Static text for `text` elements, or a label prefix for dynamic fields. */
  text?: string;
  /**
   * Artwork carried BY THE TEMPLATE (data URL). Used by `backgroundImage` and
   * `watermark` so a company can upload one design and have every employee's
   * card render on it.
   *
   * It lives on the element rather than the template so front and back can carry
   * different artwork with no extra model, and so the existing per-employee
   * `cardBackground` remains the fallback — uploading a design never takes away
   * a background an employee record already supplies.
   */
  src?: string;
  /** Optional label shown before a dynamic value, e.g. "Blood Group". */
  label?: boolean;
  style?: CardElementStyle;
  /** Reference a theme token so a theme swap recolors the element. */
  tint?: 'primary' | 'secondary' | 'accent' | 'text' | 'bg' | 'none';
}

export interface CardTheme {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  bg: string;
}

export interface CardTemplate {
  id: string;
  name: string;
  category: string;
  size: CardSizeId;
  orientation: CardOrientation;
  theme: CardTheme;
  /** Per-side background fill/gradient (CSS). Falls back to theme.bg. */
  frontBg?: string;
  backBg?: string;
  elements: CardElement[];
  /** True for user-created / edited templates persisted per company. */
  custom?: boolean;
  builtinId?: string;         // origin builtin, when duplicated/edited
  isDefault?: boolean;
  companyId?: number;
  shared?: boolean;           // Super-Admin: available to all companies
  dbId?: number;              // backend row id for persisted custom templates
  updatedAt?: string;
}

// ── Card sizes (native millimetre footprint → design-space pixels) ────────────
// Design space uses 4 px / mm for comfortable on-screen editing; exporters
// capture at scale ≥2 → ~200 dpi, well within PVC-printer tolerance.
export const PX_PER_MM = 4;
interface SizeDef { id: CardSizeId; label: string; wmm: number; hmm: number; fixedOrientation?: CardOrientation; }
const SIZE_DEFS: SizeDef[] = [
  { id: 'CR80',    label: 'CR80 PVC (Credit Card, 85.6×54mm)', wmm: 85.6, hmm: 54 },
  { id: 'A7',      label: 'A7 (74×105mm)',                     wmm: 74,   hmm: 105 },
  { id: 'A6',      label: 'A6 (105×148mm)',                    wmm: 105,  hmm: 148 },
  { id: 'visitor', label: 'Visitor Card (54×85.6mm)',          wmm: 54,   hmm: 85.6, fixedOrientation: 'portrait' },
  { id: 'info',    label: 'Information Card (120×75mm)',       wmm: 120,  hmm: 75,   fixedOrientation: 'landscape' },
];

export interface ResolvedSize { w: number; h: number; wmm: number; hmm: number; }
/** Design-space pixel dimensions for a size + orientation. */
export function cardDimensions(size: CardSizeId, orientation: CardOrientation): ResolvedSize {
  const def = SIZE_DEFS.find((s) => s.id === size) || SIZE_DEFS[0];
  const o = def.fixedOrientation || orientation;
  // Native footprint is landscape (w>h) for CR80/info; portrait for A7/A6/visitor.
  const nativeLandscape = def.wmm >= def.hmm;
  const long = Math.max(def.wmm, def.hmm), short = Math.min(def.wmm, def.hmm);
  const wantLandscape = o === 'landscape';
  const wmm = wantLandscape ? long : short;
  const hmm = wantLandscape ? short : long;
  void nativeLandscape;
  return { w: Math.round(wmm * PX_PER_MM), h: Math.round(hmm * PX_PER_MM), wmm, hmm };
}
export const CARD_SIZES = SIZE_DEFS.map((s) => ({ id: s.id, label: s.label, fixedOrientation: s.fixedOrientation }));

// ── Field catalog (drives the Show/Hide + Add-element palette) ────────────────
export interface FieldDef { type: CardElementType; label: string; group: 'brand' | 'identity' | 'code' | 'meta' | 'decor'; }
export const FIELD_CATALOG: FieldDef[] = [
  { type: 'companyLogo', label: 'Company Logo', group: 'brand' },
  { type: 'companyName', label: 'Company Name', group: 'brand' },
  { type: 'tagline', label: 'Tagline', group: 'brand' },
  { type: 'photo', label: 'Employee Photo', group: 'identity' },
  { type: 'name', label: 'Employee Name', group: 'identity' },
  { type: 'employeeId', label: 'Employee ID', group: 'identity' },
  { type: 'department', label: 'Department', group: 'identity' },
  { type: 'designation', label: 'Designation', group: 'identity' },
  { type: 'bloodGroup', label: 'Blood Group', group: 'meta' },
  { type: 'qr', label: 'QR Code', group: 'code' },
  { type: 'barcode', label: 'Barcode', group: 'code' },
  { type: 'signature', label: 'Signature', group: 'identity' },
  { type: 'issueDate', label: 'Issue Date', group: 'meta' },
  { type: 'validUntil', label: 'Valid Until', group: 'meta' },
  { type: 'emergencyContact', label: 'Emergency Contact', group: 'meta' },
  { type: 'address', label: 'Address', group: 'meta' },
  { type: 'branch', label: 'Branch', group: 'identity' },
  { type: 'email', label: 'Email', group: 'meta' },
  { type: 'phone', label: 'Phone', group: 'meta' },
  { type: 'employmentType', label: 'Employment Type', group: 'meta' },
  { type: 'backgroundImage', label: 'Background Image', group: 'decor' },
  { type: 'watermark', label: 'Watermark', group: 'decor' },
  { type: 'text', label: 'Custom Text', group: 'decor' },
  { type: 'divider', label: 'Divider / Line', group: 'decor' },
  { type: 'box', label: 'Shape / Box', group: 'decor' },
];
export const FIELD_LABEL: Record<string, string> = Object.fromEntries(FIELD_CATALOG.map((f) => [f.type, f.label]));

// ── Built-in colour themes ────────────────────────────────────────────────────
export interface NamedTheme { id: string; label: string; theme: CardTheme; }
export const CARD_THEMES: NamedTheme[] = [
  { id: 'blue', label: 'Blue', theme: { primary: '#1e4fd8', secondary: '#6c3cf0', accent: '#e6e0fe', text: '#111827', bg: '#ffffff' } },
  { id: 'green', label: 'Green', theme: { primary: '#0f7b4f', secondary: '#16a34a', accent: '#dcfce7', text: '#111827', bg: '#ffffff' } },
  { id: 'purple', label: 'Purple', theme: { primary: '#6d28d9', secondary: '#8b5cf6', accent: '#ede9fe', text: '#111827', bg: '#ffffff' } },
  { id: 'orange', label: 'Orange', theme: { primary: '#c2410c', secondary: '#f97316', accent: '#ffedd5', text: '#111827', bg: '#ffffff' } },
  { id: 'black', label: 'Black', theme: { primary: '#111827', secondary: '#334155', accent: '#e5e7eb', text: '#f8fafc', bg: '#111827' } },
  { id: 'white', label: 'White', theme: { primary: '#111827', secondary: '#6b7280', accent: '#f3f4f6', text: '#111827', bg: '#ffffff' } },
  { id: 'corporate', label: 'Corporate', theme: { primary: '#0b2447', secondary: '#19376d', accent: '#a5d7e8', text: '#0b2447', bg: '#ffffff' } },
  { id: 'hospital', label: 'Hospital', theme: { primary: '#0e7490', secondary: '#06b6d4', accent: '#cffafe', text: '#111827', bg: '#ffffff' } },
  { id: 'university', label: 'University', theme: { primary: '#7f1d1d', secondary: '#b91c1c', accent: '#fee2e2', text: '#111827', bg: '#ffffff' } },
  { id: 'manufacturing', label: 'Manufacturing', theme: { primary: '#a16207', secondary: '#f59e0b', accent: '#fef3c7', text: '#111827', bg: '#ffffff' } },
  { id: 'gold', label: 'Premium Gold', theme: { primary: '#8a6d1f', secondary: '#caa64a', accent: '#f7ecc9', text: '#1c1917', bg: '#fffef8' } },
  { id: 'slate', label: 'Slate', theme: { primary: '#334155', secondary: '#6b7280', accent: '#e5e7eb', text: '#111827', bg: '#ffffff' } },
];
