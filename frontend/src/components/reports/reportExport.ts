// ─────────────────────────────────────────────────────────────────────────────
//  Report export helpers — the SINGLE print engine shared by every report
//  (both EditableReportCanvas and ReportTemplateViewer go through here, so all
//  133 reports get identical behaviour).
//
//  The golden rule: PREVIEW === PRINT === PDF. All three render the exact same
//  DOM node (the on-screen report), on A4, with the SAME orientation, margins,
//  branding header and footer:
//    • Print → clone the node into a blank window that ALSO loads the app's own
//      stylesheets (so Tailwind / preview styling is preserved — not a stripped
//      fallback), set @page A4 + standard margins, zoom-to-fit the page width so
//      nothing overflows, repeat table headers, and never split a row.
//    • PDF   → rasterise the node (faithful to the preview, incl. merged cells,
//      borders and edited values) and lay it across A4 pages, breaking pages at
//      ROW boundaries (never mid-row), with a running header + footer per page.
//    • Excel → SheetJS from the report's columns + rows (tabular approximation).
//
//  Page geometry lives in ONE place (PAGE) so print and PDF can never drift.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx';
import { formatDateTime } from '@/utils/formatDate';

export type Orientation = 'portrait' | 'landscape';

// Optional branding / context drawn into the repeated header & footer of every
// page. All fields are optional; callers pass what they have from the report meta.
export interface ExportContext {
  companyName?: string;
  title?: string;
  generatedBy?: string;
  generatedAt?: string;
  footerNote?: string;
}

// ── Shared A4 page geometry (millimetres) — the single source for print + PDF ──
const PAGE = {
  marginTop: 15,
  marginBottom: 15,
  marginLeft: 10,
  marginRight: 10,
  a4: { portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } },
};
const PX_PER_MM = 96 / 25.4;   // CSS px per mm at 96dpi
const PT_PER_MM = 72 / 25.4;   // PDF points per mm

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// The printable content width (mm) for a given orientation, after L/R margins.
function printableWidthMm(orientation: Orientation) {
  return PAGE.a4[orientation].w - PAGE.marginLeft - PAGE.marginRight;
}

// Collect the app's own stylesheets so the print window renders EXACTLY like the
// on-screen preview (Tailwind utility classes, fonts, colours) instead of a bare
// fallback. <link> hrefs are emitted absolute so they resolve in the new window.
function collectAppStyles(): string {
  try {
    return Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => {
        if (el.tagName === 'LINK') {
          const href = (el as HTMLLinkElement).href;
          return href ? `<link rel="stylesheet" href="${esc(href)}">` : '';
        }
        return `<style>${el.textContent || ''}</style>`;
      })
      .join('\n');
  } catch { return ''; }
}

// Open the report in a clean A4 window and trigger the browser print dialog.
// Print output is identical to the preview and to the PDF (same orientation,
// margins and branding). Wide content is zoom-fitted so columns never overflow.
export function printNode(node: HTMLElement, title = 'Report', orientation: Orientation = 'portrait', ctx: ExportContext = {}) {
  const w = window.open('', '_blank', 'width=1024,height=768');
  if (!w) { alert('Please allow pop-ups to print this report.'); return; }

  // A self-paged doc (.report-doc) is already an A4 sheet WITH its own margin
  // padding, so the page itself uses margin:0 (the padding is the margin). Other
  // nodes (faithful statutory templates) get the standard A4 margins from @page.
  const selfPaged = !!node.classList?.contains('report-doc');
  const pageMargin = selfPaged ? '0' : `${PAGE.marginTop}mm ${PAGE.marginRight}mm ${PAGE.marginBottom}mm ${PAGE.marginLeft}mm`;

  // Zoom-to-fit: shrink (never enlarge) so the report fits the printable width.
  const printableMm = selfPaged ? PAGE.a4[orientation].w : printableWidthMm(orientation);
  const printablePx = printableMm * PX_PER_MM;
  const nodeW = node.scrollWidth || node.offsetWidth || printablePx;
  const zoom = nodeW > printablePx ? printablePx / nodeW : 1;

  const genLine = `Generated: ${formatDateTime(ctx.generatedAt || new Date())}${ctx.generatedBy ? ` · By ${esc(ctx.generatedBy)}` : ''}`;
  const footRight = esc(ctx.footerNote || ctx.companyName || '');

  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title>
    <meta charset="utf-8" />
    ${collectAppStyles()}
    <style>
      @page { size: A4 ${orientation}; margin: ${pageMargin}; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; padding: 0; background: #fff; color: #111; }
      /* Fit wide reports to the page width without distorting the layout. */
      .rp-wrap { zoom: ${zoom}; }
      /* Standard table behaviour: aligned columns, repeated header, no row split. */
      table { border-collapse: collapse; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr, img { page-break-inside: avoid; break-inside: avoid; }
      td, th { overflow-wrap: anywhere; word-break: break-word; }
      /* Strip on-screen editing affordances so the printout is clean. */
      [contenteditable] { outline: none !important; }
      [data-editable] { outline: none !important; background: none !important; }
      .no-print, [data-noprint] { display: none !important; }
      /* Running footer repeated on every printed page. */
      .rp-foot { position: fixed; bottom: 6mm; left: ${PAGE.marginLeft}mm; right: ${PAGE.marginRight}mm;
                 font: 9px Arial, Helvetica, sans-serif; color: #8a8a8a;
                 display: flex; justify-content: space-between; gap: 12px; }
    </style></head><body>
      <div class="rp-wrap">${node.outerHTML}</div>
      <div class="rp-foot"><span>${genLine}</span><span>${footRight}</span></div>
    </body></html>`);
  w.document.close();
  w.focus();
  // Allow the cloned document + its stylesheets to lay out before printing.
  setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 600);
}

// Rasterise the report into a multi-page A4 PDF that matches the preview. Pages
// break at table ROW boundaries (never through a row), and every page carries a
// running header (company — title) plus a footer (generated date/by + page x/y).
export async function nodeToPdf(node: HTMLElement, fileName: string, orientation: Orientation = 'portrait', ctx: ExportContext = {}) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const scale = 2;
  const canvas = await html2canvas(node, { scale, useCORS: true, backgroundColor: '#ffffff', logging: false });

  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const mL = PAGE.marginLeft * PT_PER_MM;
  const mR = PAGE.marginRight * PT_PER_MM;
  const mT = PAGE.marginTop * PT_PER_MM;
  const mB = PAGE.marginBottom * PT_PER_MM;
  const footerH = 14;                                   // reserved footer band (pt)
  const contHeaderH = (ctx.companyName || ctx.title) ? 16 : 0; // continuation header on pages > 1
  const usableW = pageW - mL - mR;
  const px2pt = usableW / canvas.width;                 // canvas px → pt (full width)

  // Row boundaries (canvas px from the node top) so a page never cuts a row.
  const nodeTop = node.getBoundingClientRect().top;
  const boundaries: number[] = [];
  node.querySelectorAll('tr').forEach((tr) => {
    const b = (tr.getBoundingClientRect().bottom - nodeTop) * scale;
    if (b > 0 && b <= canvas.height) boundaries.push(b);
  });
  boundaries.sort((a, b) => a - b);

  // Compute slices [startPx, endPx, isFirst].
  const slices: Array<[number, number, boolean]> = [];
  let rendered = 0;
  let pageNo = 0;
  while (rendered < canvas.height) {
    const isFirst = pageNo === 0;
    const usableHpt = pageH - mT - mB - footerH - (isFirst ? 0 : contHeaderH);
    const maxSlicePx = usableHpt / px2pt;
    let end: number;
    if (rendered + maxSlicePx >= canvas.height) {
      end = canvas.height;
    } else {
      const target = rendered + maxSlicePx;
      const fit = boundaries.filter((b) => b > rendered + 2 && b <= target);
      end = fit.length ? fit[fit.length - 1] : target; // fall back to a hard cut if a single row is taller than a page
    }
    slices.push([rendered, end, isFirst]);
    rendered = end;
    pageNo++;
    if (pageNo > 1000) break; // safety against pathological content
  }

  const total = slices.length;
  slices.forEach(([start, end, isFirst], i) => {
    if (i > 0) pdf.addPage();
    const sliceH = end - start;
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceH;
    const c2d = pageCanvas.getContext('2d')!;
    c2d.fillStyle = '#ffffff';
    c2d.fillRect(0, 0, pageCanvas.width, sliceH);
    c2d.drawImage(canvas, 0, start, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    // Continuation header (pages after the first) — keeps the company/report
    // identity visible even though the full letterhead lives on page 1.
    let yTop = mT;
    if (!isFirst && contHeaderH) {
      const ht = [ctx.companyName, ctx.title].filter(Boolean).join(' — ');
      pdf.setFontSize(8); pdf.setTextColor(120);
      pdf.text(ht, mL, mT + 8);
      pdf.setDrawColor(220); pdf.line(mL, mT + 11, pageW - mR, mT + 11);
      yTop = mT + contHeaderH;
    }

    pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', mL, yTop, usableW, sliceH * px2pt);

    // Footer (every page): generated date/by on the left, page x/y on the right.
    pdf.setFontSize(8); pdf.setTextColor(140);
    const footY = pageH - mB + 10;
    const left = `Generated: ${formatDateTime(ctx.generatedAt || new Date())}${ctx.generatedBy ? ` · By ${ctx.generatedBy}` : ''}`;
    pdf.text(left, mL, footY);
    const right = `Page ${i + 1} of ${total}`;
    pdf.text(right, pageW - mR - pdf.getTextWidth(right), footY);
    if (ctx.footerNote) pdf.text(ctx.footerNote, (pageW - pdf.getTextWidth(ctx.footerNote)) / 2, footY);
  });

  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}

// Build an .xlsx from the report's columns + rows, with optional title rows on top.
export function rowsToExcel(opts: {
  columns: { key: string; label: string }[];
  rows: any[];
  fileName: string;
  sheetName?: string;
  headerLines?: string[];
}) {
  const { columns, rows, fileName, sheetName = 'Report', headerLines = [] } = opts;
  const aoa: any[][] = [];
  headerLines.forEach(line => aoa.push([line]));
  if (headerLines.length) aoa.push([]);
  aoa.push(columns.map(c => c.label));
  rows.forEach(r => aoa.push(columns.map(c => r[c.key] ?? '')));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = columns.map(c => ({ wch: Math.max(10, c.label.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

// Indian number format helper used across templates.
export const inr = (n: any) => {
  const v = Number(n);
  if (!isFinite(v) || n === '' || n == null) return '—';
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};
