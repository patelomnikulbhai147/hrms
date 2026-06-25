// ─────────────────────────────────────────────────────────────────────────────
// DocumentCanvas — renders the A4 document with a GENUINELY DIFFERENT structure
// per `layout` (not a recolour). Each layout changes the header design, section
// arrangement, typography hierarchy, signature placement and footer.
//
// PRESENTATION ONLY: it consumes already-compiled values (subject/body HTML,
// payslip node, branding) from Documents.tsx. It does NOT touch data binding,
// the token compiler, PDF/print capture (which snapshot this same DOM), approvals
// or any workflow. Swapping layouts only swaps the surrounding structure.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';

export interface DocLayoutMeta { id: string; label: string; desc: string; }

// The catalogue of true layouts (used for assignment + the preview thumbnails).
export const DOC_LAYOUTS: DocLayoutMeta[] = [
  { id: 'modern-corporate', label: 'Modern Corporate', desc: 'Header band, logo right, split signature' },
  { id: 'executive-premium', label: 'Executive Premium', desc: 'Centered monogram letterhead, sealed signature' },
  { id: 'sidebar-tech', label: 'Technology / Sidebar', desc: 'Vertical colour sidebar with content panel' },
  { id: 'minimal-clean', label: 'Minimal Clean', desc: 'Whitespace-led, no header band' },
  { id: 'legal-agreement', label: 'Legal Agreement', desc: 'Centered title, dual signatory blocks' },
  { id: 'government-format', label: 'Government / Official', desc: 'Full border, ref no, seal & signature' },
  { id: 'international', label: 'International Corporate', desc: 'Grid header, accent bar, right signature' },
  { id: 'enterprise-band', label: 'Professional Enterprise', desc: 'Full-width colour bands top & bottom' },
];

export const LAYOUT_IDS = DOC_LAYOUTS.map(l => l.id);

export interface DocumentCanvasProps {
  layout?: string;
  primary: string;
  logoText: string;
  /** The company's own uploaded brand logo (base64/URL). Falls back to logoText. */
  logoImage?: string;
  companyName: string;
  branchName?: string;
  address?: string;
  email?: string;
  subject: string;
  dateStr: string;
  bodyHtml: string;
  employeeName?: string;
  signatureText: string;
  footerText: string;
  watermark?: string;
  isPayslip?: boolean;
  payslipNode?: React.ReactNode;
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'system-ui, "Segoe UI", Arial, sans-serif';

// Subtle, professional watermark — small, light, and never overpowering the body.
const Watermark: React.FC<{ text?: string }> = ({ text }) =>
  text ? (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0">
      <span className="text-[26px] font-bold text-slate-400/40 border border-slate-300/30 px-3 py-0.5 rounded-lg -rotate-[30deg] uppercase tracking-[0.3em] opacity-[0.07]" style={{ fontFamily: SANS }}>{text}</span>
    </div>
  ) : null;

export const DocumentCanvas: React.FC<DocumentCanvasProps> = (p) => {
  const { primary, logoText, companyName, branchName, address, email, subject, dateStr, bodyHtml, employeeName, signatureText, footerText, watermark, isPayslip, payslipNode } = p;
  const layout = LAYOUT_IDS.includes(p.layout || '') ? p.layout : 'modern-corporate';
  const tint = (hex: string, a: string) => `${hex}${a}`; // hex + alpha suffix

  // Brand mark: the company's uploaded logo image when available, else the
  // initials emblem (unchanged appearance). For the image we drop the coloured
  // fill / white text and show the logo on white, keeping the box's shape/size.
  const logoMark = (boxClass: string, style?: React.CSSProperties) => p.logoImage
    ? (
      <div className={`${boxClass.replace(/bg-\S+/g, '').replace(/text-white/g, '')} overflow-hidden bg-white border border-black/5`} style={style ? { ...style, backgroundColor: '#fff' } : undefined}>
        <img src={p.logoImage} alt={`${companyName} logo`} className="w-full h-full object-contain p-0.5" />
      </div>
    )
    : <div className={boxClass} style={style}>{logoText}</div>;

  // Body slot — payslip keeps its computed node; letters get layout-specific type.
  // Professional letter typography: comfortable size, generous line-height, and
  // spacing between paragraphs / list items so the content reads like a real
  // corporate letter and fills the page naturally (not a compressed receipt).
  const Body = ({ serif, size, justify, color }: { serif?: boolean; size?: number; justify?: boolean; color?: string }) =>
    isPayslip ? <>{payslipNode}</> : (
      <div
        className="doc-body whitespace-pre-wrap [&_p]:mb-3.5 [&_p]:leading-[1.8] [&_ul]:my-3.5 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:mb-1.5 [&_li]:leading-[1.7]"
        style={{ fontFamily: serif ? SERIF : SANS, fontSize: size ?? 13, lineHeight: 1.8, textAlign: justify ? 'justify' : 'left', color: color ?? '#1f2937' }}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    );

  const sheet = (extra: React.CSSProperties, children: React.ReactNode) => (
    <div className="w-full relative bg-white flex flex-col" style={{ minHeight: '297mm', ...extra }}>
      <Watermark text={watermark} />
      <div className="relative z-10 flex flex-col flex-1">{children}</div>
    </div>
  );

  // ───────────────────────── 1) MODERN CORPORATE ─────────────────────────
  if (layout === 'modern-corporate') {
    return sheet({ padding: '20mm 14mm' }, (
      <>
        <div>
          <div className="flex items-center justify-between border-b-2 pb-4 mb-6" style={{ borderColor: primary }}>
            <div style={{ fontFamily: SANS }}>
              <h1 className="text-base font-extrabold uppercase tracking-wider" style={{ color: primary }}>{companyName}</h1>
              {branchName && <p className="text-[11px] font-bold text-slate-700 mt-0.5">{branchName} Branch</p>}
              <p className="text-[9px] text-slate-500 mt-1">HQ Address: {address}</p>
              <p className="text-[9px] text-slate-400 mt-0.5">Corporate Email: {email}</p>
            </div>
            {logoMark('w-10 h-10 rounded-xl text-white flex items-center justify-center font-extrabold text-sm uppercase', { backgroundColor: primary, fontFamily: SANS })}
          </div>
          <div className="flex justify-between items-baseline text-[10px] text-slate-500 mb-6" style={{ fontFamily: SANS }}>
            <span className="font-bold">Subject: {subject}</span><span>Date: {dateStr}</span>
          </div>
          <Body serif size={13} />
        </div>
        <div className="mt-14">
          <div className="flex justify-between items-end border-t border-slate-100 pt-5" style={{ fontFamily: SANS }}>
            <div>
              <p className="font-bold text-[11px]">For {companyName}</p>
              <p className="text-[10px] text-slate-500 italic mt-6">{signatureText}</p>
              <p className="text-[8px] text-slate-400 mt-0.5">Corporate Operations Department</p>
            </div>
            <div className="text-right text-[8px] text-slate-400"><p className="font-bold">CONFIDENTIAL AND PROPRIETARY</p><p className="mt-0.5">{companyName}</p></div>
          </div>
          <div className="text-center text-[8px] text-slate-400 border-t border-slate-100 mt-6 pt-1.5" style={{ fontFamily: SANS }}>{footerText}</div>
        </div>
      </>
    ));
  }

  // ───────────────────────── 2) EXECUTIVE PREMIUM ─────────────────────────
  if (layout === 'executive-premium') {
    return sheet({ padding: '20mm 16mm' }, (
      <>
        <div>
          <div className="h-[3px] w-full mb-0.5" style={{ backgroundColor: primary }} />
          <div className="h-[1px] w-full mb-5" style={{ backgroundColor: primary }} />
          <div className="flex flex-col items-center text-center mb-6">
            {logoMark('w-14 h-14 rounded-full border-2 flex items-center justify-center font-extrabold text-lg mb-3', { borderColor: primary, color: primary, fontFamily: SERIF })}
            <h1 className="text-xl tracking-[0.2em] uppercase" style={{ color: primary, fontFamily: SERIF, fontWeight: 700 }}>{companyName}</h1>
            {branchName && <p className="text-[10px] tracking-widest uppercase text-slate-500 mt-1">{branchName} Branch</p>}
            <p className="text-[9px] text-slate-400 mt-1">{address} · {email}</p>
            <div className="h-[1px] w-24 mt-3" style={{ backgroundColor: primary }} />
          </div>
          <p className="text-center text-[11px] italic text-slate-600 mb-5" style={{ fontFamily: SERIF }}>{subject}</p>
          <Body serif size={13} justify />
        </div>
        <div className="mt-14 flex flex-col items-center text-center" style={{ fontFamily: SERIF }}>
          <div className="w-12 h-12 rounded-full border flex items-center justify-center text-[7px] uppercase tracking-wider text-slate-400 mb-2" style={{ borderColor: tint(primary, '55') }}>Seal</div>
          <div className="h-[1px] w-40" style={{ backgroundColor: primary }} />
          <p className="text-[11px] font-bold mt-1.5">{signatureText}</p>
          <p className="text-[9px] text-slate-500">For {companyName}</p>
          <p className="text-[7px] text-slate-300 tracking-widest uppercase mt-6">{footerText}</p>
        </div>
      </>
    ));
  }

  // ───────────────────────── 3) TECHNOLOGY / SIDEBAR ─────────────────────────
  if (layout === 'sidebar-tech') {
    return sheet({ padding: 0 }, (
      <div className="flex flex-1">
        <div className="flex flex-col justify-between text-white p-5" style={{ width: '52mm', backgroundColor: primary }}>
          <div>
            {logoMark('w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center font-extrabold text-lg mb-4', { fontFamily: SANS })}
            <h1 className="text-[15px] font-extrabold leading-tight" style={{ fontFamily: SANS }}>{companyName}</h1>
            {branchName && <p className="text-[10px] font-semibold text-white/80 mt-1">{branchName} Branch</p>}
          </div>
          <div className="text-[8px] text-white/80 space-y-1.5" style={{ fontFamily: SANS }}>
            <p className="uppercase tracking-widest text-white/60 font-bold text-[7px]">Contact</p>
            <p>{address}</p><p>{email}</p>
            <p className="pt-3 text-white/60">{footerText}</p>
          </div>
        </div>
        <div className="flex-1 p-8 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-baseline mb-5" style={{ fontFamily: SANS }}>
              <span className="text-[12px] font-extrabold" style={{ color: primary }}>{subject}</span>
              <span className="text-[9px] text-slate-400">{dateStr}</span>
            </div>
            <Body size={13} />
          </div>
          <div className="mt-10" style={{ fontFamily: SANS }}>
            <div className="h-[2px] w-28 mb-1" style={{ backgroundColor: primary }} />
            <p className="text-[11px] font-bold">{signatureText}</p>
            <p className="text-[9px] text-slate-500">For {companyName}</p>
          </div>
        </div>
      </div>
    ));
  }

  // ───────────────────────── 4) MINIMAL CLEAN ─────────────────────────
  if (layout === 'minimal-clean') {
    return sheet({ padding: '22mm 16mm' }, (
      <>
        <div>
          <div className="mb-10" style={{ fontFamily: SANS }}>
            <h1 className="text-[13px] font-bold tracking-tight text-slate-900">{companyName}</h1>
            <p className="text-[9px] text-slate-400 mt-0.5">{branchName ? `${branchName} Branch · ` : ''}{address}</p>
          </div>
          <p className="text-[9px] uppercase tracking-[0.25em] text-slate-400 mb-1" style={{ fontFamily: SANS }}>{subject}</p>
          <div className="h-[1px] w-full bg-slate-200 mb-7" />
          <Body size={13} color="#334155" />
        </div>
        <div className="mt-16" style={{ fontFamily: SANS }}>
          <div className="h-[1px] w-32 bg-slate-300 mb-1.5" />
          <p className="text-[11px] text-slate-800">{signatureText}</p>
          <p className="text-[9px] text-slate-400">{companyName}</p>
          <p className="text-[8px] text-slate-300 mt-10">{footerText}</p>
        </div>
      </>
    ));
  }

  // ───────────────────────── 5) LEGAL AGREEMENT ─────────────────────────
  if (layout === 'legal-agreement') {
    return sheet({ padding: '20mm 15mm' }, (
      <>
        <div>
          <div className="text-center mb-2" style={{ fontFamily: SERIF }}>
            <h1 className="text-[15px] font-bold text-slate-900">{companyName}</h1>
            <p className="text-[9px] text-slate-500">{branchName ? `${branchName} Branch · ` : ''}{address} · {email}</p>
          </div>
          <div className="h-[2px] w-full bg-slate-800 mb-1" />
          <div className="h-[1px] w-full bg-slate-800 mb-5" />
          <p className="text-center text-[12px] font-bold uppercase tracking-wider mb-5 underline" style={{ fontFamily: SERIF }}>{subject}</p>
          <Body serif size={12.5} justify />
        </div>
        <div className="mt-14" style={{ fontFamily: SERIF }}>
          <div className="grid grid-cols-2 gap-10">
            <div>
              <div className="h-[1px] bg-slate-800 mb-1 mt-8" />
              <p className="text-[10px] font-bold uppercase tracking-wide">For the Employer</p>
              <p className="text-[10px] text-slate-700">{signatureText}</p>
              <p className="text-[9px] text-slate-500">{companyName}</p>
            </div>
            <div>
              <div className="h-[1px] bg-slate-800 mb-1 mt-8" />
              <p className="text-[10px] font-bold uppercase tracking-wide">The Employee</p>
              <p className="text-[10px] text-slate-700">{employeeName || 'Employee Signature'}</p>
              <p className="text-[9px] text-slate-500">Date: {dateStr}</p>
            </div>
          </div>
          <p className="text-center text-[7px] text-slate-400 border-t border-slate-200 mt-8 pt-1.5">{footerText} · This document is executed in good faith and is legally binding.</p>
        </div>
      </>
    ));
  }

  // ───────────────────────── 6) GOVERNMENT / OFFICIAL ─────────────────────────
  if (layout === 'government-format') {
    const refNo = `REF/${(companyName || 'CO').slice(0, 3).toUpperCase()}/${String(new Date().getFullYear())}/${String(Math.abs((subject || '').length * 37) % 9000 + 1000)}`;
    return sheet({ padding: '12mm' }, (
      <div className="flex-1 border-2 flex flex-col" style={{ borderColor: primary, padding: '8mm' }}>
        <div className="text-center pb-3 mb-3 border-b" style={{ borderColor: primary, fontFamily: SERIF }}>
          <h1 className="text-[15px] font-bold tracking-wide" style={{ color: primary }}>{companyName}</h1>
          {branchName && <p className="text-[10px] font-semibold text-slate-700">{branchName} Branch</p>}
          <p className="text-[8px] text-slate-500 mt-0.5">{address}</p>
        </div>
        <div className="flex justify-between text-[9px] font-semibold text-slate-600 mb-4" style={{ fontFamily: SANS }}>
          <span>Ref. No: {refNo}</span><span>Date: {dateStr}</span>
        </div>
        <p className="text-center text-[11px] font-bold uppercase tracking-wide mb-3" style={{ fontFamily: SERIF }}>{subject}</p>
        <div className="flex-1"><Body serif size={12.5} justify /></div>
        <div className="flex justify-end mt-8" style={{ fontFamily: SERIF }}>
          <div className="text-center">
            <div className="w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center text-[7px] uppercase text-slate-400 mb-1 mx-auto" style={{ borderColor: tint(primary, '66') }}>Seal &amp; Sign</div>
            <p className="text-[10px] font-bold">{signatureText}</p>
            <p className="text-[8px] text-slate-500">For {companyName}</p>
          </div>
        </div>
        <p className="text-center text-[7px] text-slate-400 border-t mt-3 pt-1.5" style={{ borderColor: tint(primary, '33') }}>{footerText}</p>
      </div>
    ));
  }

  // ───────────────────────── 7) INTERNATIONAL CORPORATE ─────────────────────────
  if (layout === 'international') {
    return sheet({ padding: '18mm 14mm' }, (
      <>
        <div>
          <div className="flex items-start justify-between mb-3" style={{ fontFamily: SANS }}>
            <div className="flex items-center gap-3">
              {logoMark('w-11 h-11 rounded-lg text-white flex items-center justify-center font-extrabold', { backgroundColor: primary })}
              <div>
                <h1 className="text-[15px] font-extrabold text-slate-900">{companyName}</h1>
                {branchName && <p className="text-[10px] font-semibold text-slate-500">{branchName} Branch</p>}
              </div>
            </div>
            <div className="text-right text-[8px] text-slate-500 leading-relaxed"><p>{address}</p><p>{email}</p><p>{dateStr}</p></div>
          </div>
          <div className="h-1 w-full rounded-full mb-5" style={{ backgroundColor: primary }} />
          <span className="inline-block text-[10px] font-bold px-3 py-1 rounded-full mb-4" style={{ backgroundColor: tint(primary, '15'), color: primary }}>{subject}</span>
          <Body size={13} />
        </div>
        <div className="mt-12 flex justify-end" style={{ fontFamily: SANS }}>
          <div className="text-right">
            <div className="h-[2px] w-32 ml-auto mb-1" style={{ backgroundColor: primary }} />
            <p className="text-[11px] font-bold">{signatureText}</p>
            <p className="text-[9px] text-slate-500">For {companyName}</p>
          </div>
        </div>
        <div className="flex justify-between text-[7px] text-slate-400 border-t border-slate-100 mt-5 pt-1.5" style={{ fontFamily: SANS }}>
          <span>{footerText}</span><span>{companyName} · Page 1 of 1</span>
        </div>
      </>
    ));
  }

  // ───────────────────────── 8) PROFESSIONAL ENTERPRISE (bands) ─────────────────────────
  return sheet({ padding: 0 }, (
    <>
      <div className="text-white px-8 py-6 flex items-center justify-between" style={{ backgroundColor: primary }}>
        <div style={{ fontFamily: SANS }}>
          <h1 className="text-lg font-extrabold tracking-tight">{companyName}</h1>
          {branchName && <p className="text-[11px] font-semibold text-white/85">{branchName} Branch</p>}
          <p className="text-[8px] text-white/70 mt-0.5">{address} · {email}</p>
        </div>
        {logoMark('w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center font-extrabold text-lg', { fontFamily: SANS })}
      </div>
      <div className="flex-1 px-8 py-7 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-baseline mb-5" style={{ fontFamily: SANS }}>
            <span className="text-[12px] font-extrabold" style={{ color: primary }}>{subject}</span>
            <span className="text-[9px] text-slate-400">{dateStr}</span>
          </div>
          <div className="rounded-2xl border border-slate-200 p-5"><Body size={13} /></div>
        </div>
        <div className="mt-8 rounded-2xl border p-4 flex justify-between items-end" style={{ borderColor: tint(primary, '33'), fontFamily: SANS }}>
          <div><p className="text-[11px] font-bold">{signatureText}</p><p className="text-[9px] text-slate-500">For {companyName} · Authorized Signatory</p></div>
          <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: primary }}>Verified</span>
        </div>
      </div>
      <div className="text-white text-center text-[8px] py-2" style={{ backgroundColor: primary, fontFamily: SANS }}>{footerText}</div>
    </>
  ));
};

// ── Mini schematic for the template picker card — shows the real layout shape. ──
export const LayoutThumbnail: React.FC<{ layout?: string; color?: string }> = ({ layout, color = '#4f46e5' }) => {
  const id = LAYOUT_IDS.includes(layout || '') ? layout : 'modern-corporate';
  const line = (w: string, c = '#e2e8f0') => <div className="h-[2px] rounded" style={{ width: w, background: c }} />;
  const box = "h-16 bg-white border border-slate-100 rounded-lg p-1.5 overflow-hidden pointer-events-none select-none flex flex-col";
  if (id === 'sidebar-tech') return (
    <div className={box + ' flex-row gap-1'}>
      <div className="w-1/3 rounded" style={{ background: color }} />
      <div className="flex-1 space-y-1 pt-0.5">{line('90%')}{line('80%')}{line('85%')}{line('50%')}</div>
    </div>);
  if (id === 'enterprise-band') return (
    <div className={box + ' p-0'}>
      <div className="h-2.5" style={{ background: color }} />
      <div className="flex-1 p-1.5 space-y-1">{line('80%')}{line('90%')}{line('60%')}</div>
      <div className="h-2" style={{ background: color }} />
    </div>);
  if (id === 'executive-premium') return (
    <div className={box + ' items-center'}>
      <div className="h-[2px] w-full mb-1" style={{ background: color }} />
      <div className="w-3 h-3 rounded-full border" style={{ borderColor: color }} />
      <div className="w-full flex flex-col items-center space-y-1 mt-1">{line('60%', color)}{line('80%')}{line('70%')}</div>
    </div>);
  if (id === 'legal-agreement') return (
    <div className={box + ' items-center'}>
      {line('55%', '#334155')}
      <div className="h-[2px] w-full bg-slate-300 my-1" />
      <div className="w-full space-y-1">{line('100%')}{line('95%')}{line('90%')}</div>
      <div className="flex gap-2 w-full mt-auto pt-1">{line('40%', '#94a3b8')}{line('40%', '#94a3b8')}</div>
    </div>);
  if (id === 'government-format') return (
    <div className={box + ' p-0.5'}>
      <div className="flex-1 border-2 rounded p-1 flex flex-col" style={{ borderColor: color }}>
        <div className="flex justify-center">{line('50%', color)}</div>
        <div className="space-y-1 mt-1">{line('90%')}{line('80%')}</div>
        <div className="mt-auto ml-auto w-2.5 h-2.5 rounded-full border border-dashed" style={{ borderColor: color }} />
      </div>
    </div>);
  if (id === 'minimal-clean') return (
    <div className={box + ' justify-start gap-2'}>
      {line('40%', '#334155')}
      <div className="h-[1px] w-full bg-slate-200" />
      <div className="space-y-1.5">{line('85%')}{line('70%')}</div>
      <div className="mt-auto">{line('30%', '#94a3b8')}</div>
    </div>);
  if (id === 'international') return (
    <div className={box}>
      <div className="flex justify-between items-start"><div className="w-2.5 h-2.5 rounded" style={{ background: color }} /><div className="space-y-0.5 w-1/3">{line('100%')}{line('80%')}</div></div>
      <div className="h-1 w-full rounded mt-1" style={{ background: color }} />
      <div className="space-y-1 mt-1">{line('80%')}{line('90%')}</div>
      <div className="mt-auto ml-auto w-1/3">{line('100%', color)}</div>
    </div>);
  // modern-corporate (default)
  return (
    <div className={box}>
      <div className="flex justify-between items-center border-b pb-0.5" style={{ borderColor: color }}>
        <div className="w-1/2">{line('100%', color)}</div>
        <div className="w-2.5 h-2.5 rounded" style={{ background: color }} />
      </div>
      <div className="space-y-1 mt-1">{line('90%')}{line('80%')}{line('85%')}</div>
      <div className="mt-auto">{line('35%', '#94a3b8')}</div>
    </div>);
};

export default DocumentCanvas;
