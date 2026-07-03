// ─────────────────────────────────────────────────────────────────────────────
// BrandingService — the SINGLE source of truth for company branding assets.
//
// Branding assets live as base64 data-URI columns on the Company row (and are
// echoed into report `meta` by the backend companyMeta()). Historically every
// generator reached into those raw fields with slightly different names
// (logoImage vs logo, watermarkImage vs watermarkText, stampImage as "seal"…),
// which is why branding was inconsistent across payslips / invoices / letters /
// reports. This module normalises ALL of those shapes into ONE canonical
// `Branding` object so every document generator can ask for the same thing:
//
//     const b = resolveBranding(company);   // company object OR report meta
//     b.logo, b.seal, b.signature, b.letterhead, b.reportHeader, b.reportFooter,
//     b.watermark, b.headerText, b.footerText, b.signatureText, b.favicon …
//
// It is PURELY a read/normalise layer — it does not fetch, cache, mutate, or
// change storage. Because it always reads from the live company/meta object it
// is handed, a branding change made in Company Profile is reflected in the very
// next document with no cache, restart, or refresh (satisfying "Live Update").
// Multi-company safety is inherent: you pass the company that owns the document,
// so branding can never leak between tenants.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';

/** The canonical branding shape every generator consumes. */
export interface Branding {
  companyName: string;
  primaryColor: string;
  // Image assets (base64 data URI or URL, '' when unset)
  logo: string;
  seal: string;            // company seal / stamp   (stampImage)
  signature: string;       // authorized signature   (digitalSignatureImage)
  letterhead: string;      // full-page letterhead background
  reportHeader: string;    // report header banner
  reportFooter: string;    // report footer banner
  watermarkImage: string;
  favicon: string;
  // Text fallbacks
  watermarkText: string;
  headerText: string;
  footerText: string;
  signatureText: string;   // typed signatory name/designation
  // Convenience flags
  hasLogo: boolean;
  hasSeal: boolean;
  hasSignature: boolean;
  hasLetterhead: boolean;
  hasReportHeader: boolean;
  hasReportFooter: boolean;
  hasWatermark: boolean;   // image OR text
}

/** A permissive source: a Company object, a report `meta`, or a form draft. */
export type BrandingSource = Record<string, any> | null | undefined;

// First non-empty string among the given keys of the source.
const pick = (src: Record<string, any>, keys: string[]): string => {
  for (const k of keys) {
    const v = src?.[k];
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return '';
};

/**
 * Normalise any Company / meta / form-draft object into the canonical Branding.
 * Every generator in the app should route through this instead of reading raw
 * company fields directly.
 */
export function resolveBranding(source: BrandingSource): Branding {
  const s = (source || {}) as Record<string, any>;

  const logo = pick(s, ['logoImage', 'logo', 'companyLogo']);
  const seal = pick(s, ['stampImage', 'sealImage', 'stamp', 'seal']);
  const signature = pick(s, ['digitalSignatureImage', 'signatureImage', 'authorizedSignatureImage']);
  const letterhead = pick(s, ['letterheadImage', 'letterhead']);
  const reportHeader = pick(s, ['reportHeaderImage', 'headerImage']);
  const reportFooter = pick(s, ['reportFooterImage', 'footerImage']);
  const watermarkImage = pick(s, ['watermarkImage']);
  const favicon = pick(s, ['faviconImage', 'favicon']);

  const watermarkText = pick(s, ['watermarkText']);
  const headerText = pick(s, ['headerText']);
  const footerText = pick(s, ['footerText']);
  const signatureText = pick(s, ['signatureText', 'authorizedSignatory']);

  return {
    companyName: pick(s, ['name', 'companyName', 'legalName']),
    primaryColor: pick(s, ['primaryColor', 'themeColor', 'brandColor']) || '#1e293b',
    logo, seal, signature, letterhead, reportHeader, reportFooter, watermarkImage, favicon,
    watermarkText, headerText, footerText, signatureText,
    hasLogo: !!logo,
    hasSeal: !!seal,
    hasSignature: !!signature,
    hasLetterhead: !!letterhead,
    hasReportHeader: !!reportHeader,
    hasReportFooter: !!reportFooter,
    hasWatermark: !!(watermarkImage || watermarkText),
  };
}

/** React hook — memoised canonical branding for the given company/meta source. */
export function useBranding(source: BrandingSource): Branding {
  const key = source ? JSON.stringify([
    (source as any).id, (source as any).logoImage, (source as any).stampImage,
    (source as any).digitalSignatureImage, (source as any).letterheadImage,
    (source as any).reportHeaderImage, (source as any).reportFooterImage,
    (source as any).watermarkImage, (source as any).watermarkText,
    (source as any).footerText, (source as any).headerText, (source as any).signatureText,
    (source as any).faviconImage, (source as any).primaryColor, (source as any).name,
  ]) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveBranding(source), [key]);
}

// Individual getters (thin wrappers) — for call sites that want just one asset.
export const getLogo = (s: BrandingSource) => resolveBranding(s).logo;
export const getSeal = (s: BrandingSource) => resolveBranding(s).seal;
export const getSignature = (s: BrandingSource) => resolveBranding(s).signature;
export const getLetterhead = (s: BrandingSource) => resolveBranding(s).letterhead;
export const getReportHeader = (s: BrandingSource) => resolveBranding(s).reportHeader;
export const getReportFooter = (s: BrandingSource) => resolveBranding(s).reportFooter;
export const getWatermark = (s: BrandingSource) => {
  const b = resolveBranding(s);
  return { image: b.watermarkImage, text: b.watermarkText, enabled: b.hasWatermark };
};

// ── Asset kind + validation ──────────────────────────────────────────────────

export type AssetKind = 'png' | 'jpeg' | 'svg' | 'gif' | 'webp' | 'pdf' | 'other';

/** Detect the underlying type of a data URI (or return null for empties). */
export function assetKind(value: string): AssetKind | null {
  if (!value || typeof value !== 'string') return null;
  const m = /^data:([^;,]+)[;,]/i.exec(value.trim());
  const mime = (m?.[1] || '').toLowerCase();
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpeg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('pdf')) return 'pdf';
  // Fall back to a file-extension guess for plain URLs.
  const ext = value.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext && ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'pdf'].includes(ext)) {
    return ext === 'jpg' ? 'jpeg' : (ext as AssetKind);
  }
  return 'other';
}

/**
 * jsPDF's addImage only accepts raster formats (PNG/JPEG/WEBP). SVG must be
 * skipped or it throws. Generators use this to decide whether to draw an asset.
 */
export function isRasterImage(value: string): boolean {
  const k = assetKind(value);
  return k === 'png' || k === 'jpeg' || k === 'webp' || k === 'gif';
}

/** Rough byte size of a base64 data URI (for a soft upload-size guard). */
export function dataUriBytes(value: string): number {
  if (!value || !value.startsWith('data:')) return 0;
  const b64 = value.split(',')[1] || '';
  return Math.floor((b64.length * 3) / 4);
}

export interface AssetRule { accept: AssetKind[]; maxBytes: number; note?: string }

// Per-asset upload policy (matches the enterprise spec's validation rules).
export const ASSET_RULES: Record<keyof Pick<Branding, 'logo' | 'seal' | 'signature' | 'letterhead' | 'reportHeader' | 'reportFooter' | 'watermarkImage' | 'favicon'>, AssetRule> = {
  logo: { accept: ['png', 'jpeg', 'svg'], maxBytes: 2_000_000 },
  seal: { accept: ['png'], maxBytes: 1_000_000, note: 'Transparent PNG recommended.' },
  signature: { accept: ['png'], maxBytes: 1_000_000, note: 'Transparent PNG preferred.' },
  letterhead: { accept: ['png', 'jpeg', 'pdf'], maxBytes: 4_000_000 },
  reportHeader: { accept: ['png', 'jpeg'], maxBytes: 2_000_000 },
  reportFooter: { accept: ['png', 'jpeg'], maxBytes: 2_000_000 },
  watermarkImage: { accept: ['png', 'svg'], maxBytes: 1_000_000 },
  favicon: { accept: ['png', 'svg'], maxBytes: 200_000 },
};

/** Validate a chosen asset against its rule. Returns { ok, error? }. */
export function validateAsset(assetKey: keyof typeof ASSET_RULES, value: string): { ok: boolean; error?: string } {
  const rule = ASSET_RULES[assetKey];
  if (!value) return { ok: true }; // empty = cleared, always allowed
  const kind = assetKind(value);
  if (!kind || kind === 'other') return { ok: false, error: 'Unrecognized or possibly corrupted file.' };
  if (!rule.accept.includes(kind)) return { ok: false, error: `Unsupported format (.${kind}). Allowed: ${rule.accept.map(k => k.toUpperCase()).join(', ')}.` };
  const bytes = dataUriBytes(value);
  if (bytes > rule.maxBytes) return { ok: false, error: `File is too large (${(bytes / 1_000_000).toFixed(1)} MB). Max ${(rule.maxBytes / 1_000_000).toFixed(1)} MB.` };
  return { ok: true };
}

// ── Watermark styling helper (shared by HTML-based generators) ────────────────

export interface WatermarkStyle { opacity: number; rotation: number; position: 'center' | 'diagonal' }

/**
 * Build an absolutely-positioned watermark <div> HTML for popup/print generators
 * (invoice, letters). Returns '' when no watermark is configured. Uses the image
 * if present, else the text. Sits behind content (caller wraps content above it).
 */
export function watermarkHtml(b: Branding, style: Partial<WatermarkStyle> = {}): string {
  if (!b.hasWatermark) return '';
  const opacity = style.opacity ?? 0.08;
  const rotation = style.rotation ?? -30;
  const base = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;overflow:hidden;';
  if (b.watermarkImage) {
    return `<div style="${base}"><img src="${b.watermarkImage}" style="max-width:70%;max-height:70%;opacity:${opacity};transform:rotate(${rotation}deg);" /></div>`;
  }
  const safe = String(b.watermarkText).replace(/</g, '&lt;');
  return `<div style="${base}"><span style="font-size:80px;font-weight:800;color:#000;opacity:${opacity};transform:rotate(${rotation}deg);white-space:nowrap;letter-spacing:8px;">${safe}</span></div>`;
}
