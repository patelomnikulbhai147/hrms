// ─────────────────────────────────────────────────────────────────────────────
// BrandingPreview — live "before you save" preview of how uploaded branding
// assets appear across the documents the HRMS generates (payslip, invoice, offer
// letter, report, ID card). Reads the SAME canonical Branding object the real
// generators use (via resolveBranding), so the preview matches production output.
// Pure presentation; takes a Branding and renders scaled mock documents.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { type Branding } from '@/services/brandingService';
import { CheckCircle2, XCircle } from 'lucide-react';

const Logo: React.FC<{ b: Branding; size?: number }> = ({ b, size = 28 }) =>
  b.hasLogo
    ? <img src={b.logo} alt="logo" style={{ height: size, maxWidth: size * 2.6, objectFit: 'contain' }} />
    : <div style={{ height: size, width: size, borderRadius: 6, background: b.primaryColor }} className="flex items-center justify-center text-white text-[10px] font-black">
        {(b.companyName || 'Co').slice(0, 2).toUpperCase()}
      </div>;

const Watermark: React.FC<{ b: Branding }> = ({ b }) => {
  if (!b.hasWatermark) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {b.watermarkImage
        ? <img src={b.watermarkImage} style={{ maxWidth: '70%', maxHeight: '70%', opacity: 0.08, transform: 'rotate(-30deg)' }} />
        : <span style={{ fontSize: 34, fontWeight: 800, opacity: 0.07, transform: 'rotate(-30deg)', whiteSpace: 'nowrap', letterSpacing: 4 }}>{b.watermarkText}</span>}
    </div>
  );
};

const SignatureBlock: React.FC<{ b: Branding }> = ({ b }) => (
  <div className="text-right">
    {b.hasSeal && <img src={b.seal} alt="seal" style={{ height: 26, display: 'inline-block', opacity: 0.9 }} />}
    {b.hasSignature
      ? <img src={b.signature} alt="signature" style={{ height: 22, display: 'block', marginLeft: 'auto' }} />
      : <div style={{ height: 22 }} />}
    <div className="border-t border-slate-300 mt-0.5 pt-0.5 text-[6px] text-slate-500 inline-block">{b.signatureText || 'Authorized Signatory'}</div>
  </div>
);

const Frame: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-500 mb-1.5">{title}</p>
    <div className="relative bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden" style={{ aspectRatio: '3 / 4' }}>
      {children}
    </div>
  </div>
);

// A tiny generic document header used by several mocks.
const DocHeader: React.FC<{ b: Branding }> = ({ b }) => (
  <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5" style={{ borderTop: `3px solid ${b.primaryColor}` }}>
    <Logo b={b} size={20} />
    <div className="min-w-0">
      <p className="text-[8px] font-black text-slate-800 truncate leading-none">{b.companyName || 'Company Name'}</p>
      <p className="text-[6px] text-slate-400 leading-none mt-0.5">Registered Office · GSTIN · PAN</p>
    </div>
  </div>
);

export const BrandingPreview: React.FC<{ branding: Branding }> = ({ branding: b }) => {
  const assetRow = (label: string, present: boolean) => (
    <div className="flex items-center gap-1.5 text-[11px]">
      {present ? <CheckCircle2 size={13} className="text-emerald-500" /> : <XCircle size={13} className="text-slate-300" />}
      <span className={present ? 'text-slate-700 font-medium' : 'text-slate-400'}>{label}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Asset checklist */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
        {assetRow('Logo', b.hasLogo)}
        {assetRow('Seal / Stamp', b.hasSeal)}
        {assetRow('Signature', b.hasSignature)}
        {assetRow('Letterhead', b.hasLetterhead)}
        {assetRow('Report Header', b.hasReportHeader)}
        {assetRow('Report Footer', b.hasReportFooter)}
        {assetRow('Watermark', b.hasWatermark)}
        {assetRow('Favicon', !!b.favicon)}
      </div>

      {/* Live mock documents */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Payslip */}
        <Frame title="Payslip">
          <Watermark b={b} />
          <div className="relative" style={{ zIndex: 1 }}>
            <DocHeader b={b} />
            <div className="px-2 py-1.5 text-center text-[7px] font-bold text-slate-600">PAYSLIP · JUL 2026</div>
            <div className="px-2 space-y-0.5">
              {['Basic', 'HRA', 'Net Pay'].map(r => (
                <div key={r} className="flex justify-between text-[6px] text-slate-500 border-b border-slate-50"><span>{r}</span><span>₹—</span></div>
              ))}
            </div>
            <div className="px-2 pt-3"><SignatureBlock b={b} /></div>
          </div>
        </Frame>

        {/* Invoice */}
        <Frame title="Invoice">
          <Watermark b={b} />
          <div className="relative" style={{ zIndex: 1 }}>
            <DocHeader b={b} />
            <div className="px-2 py-1.5 text-[7px] font-black text-right" style={{ color: b.primaryColor }}>TAX INVOICE</div>
            <div className="px-2 space-y-0.5">
              {['Item A', 'Item B'].map(r => (
                <div key={r} className="flex justify-between text-[6px] text-slate-500 border-b border-slate-50"><span>{r}</span><span>₹—</span></div>
              ))}
            </div>
            <div className="px-2 pt-3"><SignatureBlock b={b} /></div>
          </div>
        </Frame>

        {/* Offer letter (letterhead background) */}
        <Frame title="Offer Letter">
          {b.hasLetterhead
            ? <img src={b.letterhead} alt="letterhead" className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 0 }} />
            : <Watermark b={b} />}
          <div className="relative" style={{ zIndex: 1 }}>
            {!b.hasLetterhead && <DocHeader b={b} />}
            <div className="px-2 py-2 space-y-1">
              <p className="text-[7px] font-bold text-slate-700">Offer of Employment</p>
              <div className="h-0.5 bg-slate-100 rounded w-full" />
              <div className="h-0.5 bg-slate-100 rounded w-4/5" />
              <div className="h-0.5 bg-slate-100 rounded w-full" />
              <div className="h-0.5 bg-slate-100 rounded w-3/5" />
            </div>
            <div className="px-2 pt-4"><SignatureBlock b={b} /></div>
          </div>
        </Frame>

        {/* Report */}
        <Frame title="Attendance Report">
          <Watermark b={b} />
          <div className="relative" style={{ zIndex: 1 }}>
            {b.hasReportHeader
              ? <img src={b.reportHeader} alt="header" className="w-full object-contain" style={{ maxHeight: 26 }} />
              : <DocHeader b={b} />}
            <div className="px-2 py-1 text-center text-[7px] font-bold text-slate-600">ATTENDANCE REGISTER</div>
            <div className="px-2 space-y-0.5">
              {[1, 2, 3, 4].map(r => <div key={r} className="h-0.5 bg-slate-100 rounded w-full" />)}
            </div>
            <div className="absolute bottom-0 inset-x-0">
              {b.hasReportFooter
                ? <img src={b.reportFooter} alt="footer" className="w-full object-contain" style={{ maxHeight: 16 }} />
                : <div className="text-[5px] text-center text-slate-400 border-t border-slate-100 py-0.5">{b.footerText || 'Generated by HRMS · Confidential'}</div>}
            </div>
          </div>
        </Frame>
      </div>
      <p className="text-[11px] text-slate-400">This preview updates live as you upload assets and matches what generated documents will use once saved.</p>
    </div>
  );
};

export default BrandingPreview;
