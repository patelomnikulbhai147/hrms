// ─────────────────────────────────────────────────────────────────────────────
// INVOICE BRANDING ASSETS — upload validation, downscaling, and the resolution
// order that decides which logo / signature / stamp / QR an invoice shows.
//
// Resolution (first hit wins):
//   1. this invoice's OVERRIDE   (brandingOverride JSON — that invoice only)
//   2. Invoice Branding settings (invoice_settings — this company's billing default)
//   3. COMPANY PROFILE           (logoImage / digitalSignatureImage / stampImage)
// so nothing ever has to be uploaded twice, and clearing an override falls
// straight back to the live profile.
//
// SCOPE: Invoice Management only. No other module reads or writes these.
// ─────────────────────────────────────────────────────────────────────────────

export type AssetKey = 'logo' | 'signature' | 'stamp' | 'qr';

export interface AssetRule {
  label: string;
  /** MIME types the picker accepts. */
  accept: string[];
  /** Hard upload limit before any processing. */
  maxBytes: number;
  /** Longest edge after downscaling (aspect ratio is always preserved). */
  maxEdge: number;
  emptyText: string;
}

export const ASSET_RULES: Record<AssetKey, AssetRule> = {
  logo: {
    label: 'Company Logo', emptyText: 'Upload Company Logo', maxEdge: 600, maxBytes: 5 * 1024 * 1024,
    accept: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'],
  },
  signature: {
    label: 'Authorised Signature', emptyText: 'Upload Signature', maxEdge: 500, maxBytes: 5 * 1024 * 1024,
    accept: ['image/png', 'image/jpeg', 'image/jpg'],
  },
  stamp: {
    label: 'Company Seal / Stamp', emptyText: 'Upload Stamp', maxEdge: 500, maxBytes: 5 * 1024 * 1024,
    accept: ['image/png', 'image/jpeg', 'image/jpg'],
  },
  qr: {
    label: 'Payment QR Code', emptyText: 'Upload QR Code', maxEdge: 600, maxBytes: 5 * 1024 * 1024,
    accept: ['image/png', 'image/jpeg', 'image/jpg'],
  },
};

export const acceptAttr = (k: AssetKey) => ASSET_RULES[k].accept.join(',');
const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();
const EXT_FOR: Record<string, string[]> = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/jpg': ['jpg', 'jpeg'], 'image/svg+xml': ['svg'],
};

/** Human list for error messages, e.g. "PNG, JPG, JPEG or SVG". */
export const allowedLabel = (k: AssetKey) => {
  const names = [...new Set(ASSET_RULES[k].accept.flatMap((m) => EXT_FOR[m] || []))].map((e) => e.toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
};

export type AssetResult = { ok: true; dataUrl: string; note?: string } | { ok: false; error: string };

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result || ''));
  fr.onerror = () => reject(new Error('Could not read the file.'));
  fr.readAsDataURL(file);
});

/**
 * Downscale so the longest edge is ≤ maxEdge, ALWAYS preserving the aspect ratio
 * (never stretched or distorted). PNG keeps its alpha channel so a transparent
 * signature stays transparent. Smaller images are returned untouched.
 */
async function downscale(dataUrl: string, maxEdge: number, mime: string): Promise<{ dataUrl: string; resized: boolean }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('That file is not a readable image.'));
    el.src = dataUrl;
  });
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (!longest || longest <= maxEdge) return { dataUrl, resized: false };

  const ratio = maxEdge / longest;                       // one ratio for BOTH axes
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl, resized: false };
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  // PNG preserves transparency; JPEG is re-encoded at high quality.
  const out = mime === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
  return { dataUrl: out.length < dataUrl.length ? out : dataUrl, resized: true };
}

/** Validate + normalise a picked file into a data URI ready for the invoice. */
export async function prepareAsset(kind: AssetKey, file: File | null | undefined): Promise<AssetResult> {
  const rule = ASSET_RULES[kind];
  if (!file) return { ok: false, error: 'No file selected.' };

  // Type check by MIME *and* extension — some browsers report an empty type.
  const type = String(file.type || '').toLowerCase();
  const ext = extOf(file.name);
  const typeOk = rule.accept.includes(type) || rule.accept.some((m) => (EXT_FOR[m] || []).includes(ext));
  if (!typeOk) return { ok: false, error: `${rule.label} must be a ${allowedLabel(kind)} image.` };

  if (file.size > rule.maxBytes) {
    return { ok: false, error: `${rule.label} must be under ${Math.round(rule.maxBytes / 1024 / 1024)} MB (this file is ${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }

  const raw = await readAsDataUrl(file);
  if (!/^data:image\//i.test(raw)) return { ok: false, error: 'That file is not a valid image.' };
  // SVG is vector — resizing it would rasterise and lose quality.
  if (type === 'image/svg+xml' || ext === 'svg') return { ok: true, dataUrl: raw };

  try {
    const { dataUrl, resized } = await downscale(raw, rule.maxEdge, type === 'image/jpeg' ? 'image/jpeg' : 'image/png');
    return { ok: true, dataUrl, note: resized ? `Resized to fit ${rule.maxEdge}px (aspect ratio preserved).` : undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Could not process that image.' };
  }
}

// ── Override plumbing ───────────────────────────────────────────────────────
export type BrandingOverride = Partial<Record<AssetKey, string>>;

export const parseOverride = (v: any): BrandingOverride => {
  if (!v) return {};
  try {
    const o = typeof v === 'string' ? JSON.parse(v) : v;
    if (!o || typeof o !== 'object') return {};
    const out: BrandingOverride = {};
    (['logo', 'signature', 'stamp', 'qr'] as AssetKey[]).forEach((k) => {
      if (typeof o[k] === 'string' && o[k].trim()) out[k] = o[k];
    });
    return out;
  } catch { return {}; }
};

/** Serialise for the API — an empty override is stored as NULL. */
export const serialiseOverride = (o: BrandingOverride): string | null => {
  const clean = Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === 'string' && v.trim()));
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
};
