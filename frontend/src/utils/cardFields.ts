// ─────────────────────────────────────────────────────────────────────────────
// Binds a CardElement to a live value from the employee record + company
// branding. Keeps the renderer dumb: it just draws whatever this returns.
// ─────────────────────────────────────────────────────────────────────────────
import type { CardElement } from '@/types/cardDesigner';
import { FIELD_LABEL } from '@/types/cardDesigner';
import { formatDate } from '@/utils/formatDate';
import { qrDataUrl, barcodeDataUrl, verificationUrl } from '@/utils/cardCodes';

export interface BindContext {
  employee: any;
  branding: { companyName?: string; logo?: string; primaryColor?: string; tagline?: string; watermarkImage?: string; signature?: string; seal?: string };
  companyId?: number | string;
  /** Sample mode uses a placeholder employee for gallery thumbnails. */
  sample?: boolean;
}

export interface BoundValue { kind: 'text' | 'image' | 'none'; value?: string; src?: string; label?: string; initials?: string; }

const isDataImg = (v?: string) => !!v && (v.startsWith('data:') || v.startsWith('http') || v.startsWith('blob:'));
const initialsOf = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';

function addYears(base: Date, years: number) { const d = new Date(base); d.setFullYear(d.getFullYear() + years); return d; }

export function bindField(el: CardElement, ctx: BindContext): BoundValue {
  const e = ctx.employee || {};
  const b = ctx.branding || {};
  const labelText = el.label ? FIELD_LABEL[el.type] : undefined;
  const text = (value?: any): BoundValue => ({ kind: value == null || value === '' ? 'none' : 'text', value: value == null ? '' : String(value), label: labelText });

  switch (el.type) {
    case 'text': return { kind: el.text ? 'text' : 'none', value: el.text || '' };
    case 'divider':
    case 'box': return { kind: 'none' };

    case 'companyName': return text(b.companyName || 'Company Name');
    case 'tagline': return text(b.tagline || '');
    case 'companyLogo': return isDataImg(b.logo) ? { kind: 'image', src: b.logo } : { kind: 'none', initials: initialsOf(b.companyName) };
    case 'watermark': return isDataImg(b.watermarkImage) ? { kind: 'image', src: b.watermarkImage } : (isDataImg(b.logo) ? { kind: 'image', src: b.logo } : { kind: 'none' });
    case 'backgroundImage': { const bg = e.cardBackground; return isDataImg(bg) ? { kind: 'image', src: bg } : { kind: 'none' }; }

    case 'photo': {
      const src = e.photoUpload || (isDataImg(e.avatar) ? e.avatar : (isDataImg(e.photo) ? e.photo : ''));
      return isDataImg(src) ? { kind: 'image', src } : { kind: 'none', initials: initialsOf(e.name) };
    }
    case 'signature': {
      const src = e.signatureUpload || (isDataImg(e.signature) ? e.signature : '');
      return isDataImg(src) ? { kind: 'image', src } : { kind: 'none' };
    }

    case 'name': return text(e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Employee Name');
    case 'employeeId': return text(e.employeeId || e.biometricId || (ctx.sample ? 'EMP-0001' : ''));
    case 'department': return text(e.department || '');
    case 'designation': return text(e.designation || e.role || '');
    case 'branch': return text(e.branchLocation || e.location || e.branch || '');
    case 'bloodGroup': return text(e.bloodGroup || '');
    case 'email': return text(e.email || '');
    case 'phone': return text(e.phone || e.contact || '');
    case 'employmentType': return text(e.employmentType || e.category || '');
    case 'emergencyContact': return text(e.emergencyContact || '');
    case 'address': return text(e.presentAddress || e.permanentAddress || e.address || e.location || '');

    case 'issueDate': {
      const d = e.joinDate ? new Date(e.joinDate) : new Date();
      return text(isFinite(+d) ? formatDate(d.toISOString()) : formatDate(new Date().toISOString()));
    }
    case 'validUntil': {
      const base = e.joinDate && isFinite(+new Date(e.joinDate)) ? new Date(e.joinDate) : new Date();
      return text(formatDate(addYears(base, 3).toISOString()));
    }

    case 'qr': {
      const dark = (el.style?.color) || '#111827';
      return { kind: 'image', src: qrDataUrl(verificationUrl(e, ctx.companyId), 260, dark, '#ffffff') };
    }
    case 'barcode': {
      const dark = (el.style?.color) || '#111827';
      return { kind: 'image', src: barcodeDataUrl(e.employeeId || e.id || '000000', dark, '#ffffff') };
    }
    default: return { kind: 'none' };
  }
}
