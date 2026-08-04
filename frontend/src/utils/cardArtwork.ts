// ─────────────────────────────────────────────────────────────────────────────
// Custom card artwork — accept a company's own ID-card design and make it safe
// to store inside a CardTemplate's JSON spec.
//
// The spec is persisted in a MySQL JSON column, and a 10 MB upload becomes
// ~13.4 MB of base64 — comfortably past a default `max_allowed_packet`, so the
// save would fail at the database with an error nobody could act on. Everything
// raster is therefore re-encoded to a print-safe ceiling before it is ever put
// in the spec: at ~2000 px on the long edge a CR80 card (85.6 mm) still prints
// at ~590 dpi, far beyond what any PVC printer resolves. SVG is left untouched —
// it is text, it scales losslessly, and it is already small.
// ─────────────────────────────────────────────────────────────────────────────

/** What a user is allowed to hand us. PDF is deliberately absent — see below. */
export const ARTWORK_ACCEPT = 'image/png,image/jpeg,image/jpg,image/svg+xml';
export const ARTWORK_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB, as offered to the user
const MAX_EDGE = 2000;                                // px on the long edge after re-encode
const JPEG_QUALITY = 0.9;
/** Soft ceiling for the stored data URL. Kept in step with MAX_SPEC on the server. */
const TARGET_BYTES = 1_200_000;

export interface ArtworkResult {
  /** data: URL ready to store on a CardElement. */
  dataUrl: string;
  width: number;
  height: number;
  /** Bytes of the stored data URL (not the original file). */
  storedBytes: number;
  /** True when the image was re-encoded smaller than the file supplied. */
  downscaled: boolean;
}

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(new Error('That file could not be read.'));
  r.readAsDataURL(file);
});

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('That file is not a readable image.'));
  img.src = src;
});

/**
 * Validate and normalise an uploaded design.
 * Throws an Error with a message meant for the user — callers surface it as-is.
 */
export async function prepareCardArtwork(file: File): Promise<ArtworkResult> {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  // PDF is rejected explicitly rather than silently ignored: reading one needs a
  // PDF renderer the app does not ship, and a vague "unsupported file" would
  // leave the user guessing which of their files is the problem.
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    throw new Error('PDF designs are not supported yet. Please export your design as a PNG and upload that.');
  }

  const isSvg = type === 'image/svg+xml' || name.endsWith('.svg');
  const isRaster = type === 'image/png' || type === 'image/jpeg' || /\.(png|jpe?g)$/.test(name);
  if (!isSvg && !isRaster) {
    throw new Error('Upload a PNG, JPG or SVG image.');
  }
  if (file.size > ARTWORK_MAX_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The maximum is 10 MB.`);
  }

  const original = await readAsDataUrl(file);

  if (isSvg) {
    // Vector: no raster step, no quality loss, and already small.
    return { dataUrl: original, width: 0, height: 0, storedBytes: original.length, downscaled: false };
  }

  const img = await loadImage(original);
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image in this browser.');
  ctx.drawImage(img, 0, 0, w, h);

  // PNG keeps transparency (a design may have a cut-out or rounded corner);
  // anything opaque goes to JPEG, which is dramatically smaller for photographic
  // artwork. Whichever is smaller wins, so a small PNG is never inflated.
  const hasAlpha = type === 'image/png' || name.endsWith('.png');
  const asPng = canvas.toDataURL('image/png');
  const asJpeg = hasAlpha ? '' : canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  let dataUrl = asJpeg && asJpeg.length < asPng.length ? asJpeg : asPng;

  // Bring anything still oversized under the budget by stepping quality down.
  // The budget is not really about the database (MySQL will take megabytes
  // happily) — it is about the gallery, which loads EVERY template's spec to
  // render its thumbnails. A handful of multi-megabyte designs would make that
  // screen crawl. Transparency is given up only as the last step, and only when
  // the alternative is an unusably heavy template.
  for (const q of [0.85, 0.75, 0.65]) {
    if (dataUrl.length <= TARGET_BYTES) break;
    const smaller = canvas.toDataURL('image/jpeg', q);
    if (smaller.length < dataUrl.length) dataUrl = smaller;
  }

  return {
    dataUrl,
    width: w,
    height: h,
    storedBytes: dataUrl.length,
    downscaled: scale < 1 || dataUrl.length < original.length,
  };
}

/** Human-readable size, for the upload dialog's feedback line. */
export const prettyBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
