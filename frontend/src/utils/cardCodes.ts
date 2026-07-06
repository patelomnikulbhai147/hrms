// ─────────────────────────────────────────────────────────────────────────────
// Real, scannable QR codes + barcodes for employee cards, rendered SYNCHRONOUSLY
// to data-URLs (drawn on an offscreen canvas from the module matrix / jsbarcode)
// so html2canvas-pro captures them deterministically — no async paint race.
// Results are memoised so dragging an element doesn't recompute the code.
// ─────────────────────────────────────────────────────────────────────────────
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

const qrCache = new Map<string, string>();
const barCache = new Map<string, string>();

/** Synchronous QR → PNG data-URL. `px` = output pixel size (square). */
export function qrDataUrl(text: string, px = 240, dark = '#000000', light = '#ffffff'): string {
  const key = `${px}|${dark}|${light}|${text}`;
  const hit = qrCache.get(key);
  if (hit) return hit;
  try {
    // create() is synchronous and returns the module matrix.
    const qr = QRCode.create(text || ' ', { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const data = qr.modules.data;
    const margin = 2; // quiet zone in modules
    const total = count + margin * 2;
    const cell = Math.max(1, Math.floor(px / total));
    const dim = cell * total;
    const canvas = document.createElement('canvas');
    canvas.width = dim; canvas.height = dim;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = light; ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = dark;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (data[r * count + c]) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
      }
    }
    const url = canvas.toDataURL('image/png');
    qrCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

/** Synchronous Code128 barcode → PNG data-URL. */
export function barcodeDataUrl(text: string, dark = '#000000', light = '#ffffff'): string {
  const value = (text || '0').toString().slice(0, 40) || '0';
  const key = `${dark}|${light}|${value}`;
  const hit = barCache.get(key);
  if (hit) return hit;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128', displayValue: false, margin: 0,
      width: 2, height: 60, background: light, lineColor: dark,
    });
    const url = canvas.toDataURL('image/png');
    barCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

/**
 * The verification payload encoded in an employee's QR. Scanning opens the
 * company's public verification page for that employee (profile / ID / company
 * verification). Falls back to a self-describing text token when no base URL.
 */
export function verificationUrl(employee: any, companyId?: number | string): string {
  const base = (typeof window !== 'undefined' && window.location?.origin) || '';
  const empId = employee?.employeeId || employee?.id || '';
  const cid = companyId ?? employee?.companyId ?? '';
  if (base) return `${base}/verify?c=${encodeURIComponent(String(cid))}&e=${encodeURIComponent(String(empId))}`;
  return `HRMS-VERIFY|company:${cid}|employee:${empId}|name:${employee?.name || ''}`;
}
