// ─────────────────────────────────────────────────────────────────────────────
//  Report export helpers — shared by every report template.
//
//  The golden rule of this engine: PREVIEW === PDF === PRINT. All three render
//  the exact same DOM node (the template), so they can never drift:
//    • Print  → clone the node's HTML into a blank window and print it.
//    • PDF    → rasterise the node with html2canvas and place it in a jsPDF page
//               (faithful to the on-screen layout, including merged cells/borders).
//    • Excel  → SheetJS from the report's columns + rows (tabular approximation).
//  Templates are styled with INLINE styles / a scoped <style> so the cloned print
//  window and the canvas capture look identical without the app's Tailwind sheet.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx';

export type Orientation = 'portrait' | 'landscape';

// Open the template HTML in a clean window and trigger the browser print dialog.
// We inline the computed page CSS so the printout matches the preview exactly.
export function printNode(node: HTMLElement, title = 'Report') {
  const w = window.open('', '_blank', 'width=1024,height=768');
  if (!w) { alert('Please allow pop-ups to print this report.'); return; }
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; padding: 16px; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
      table { border-collapse: collapse; }
      @page { margin: 10mm; }
    </style></head><body>${node.outerHTML}</body></html>`);
  w.document.close();
  // Give the new document a tick to lay out before printing.
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 350);
}

// Rasterise the template node into a (multi-page) PDF that matches the preview.
export async function nodeToPdf(node: HTMLElement, fileName: string, orientation: Orientation = 'portrait') {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const usableW = pageW - margin * 2;
  const imgH = (canvas.height * usableW) / canvas.width;
  const img = canvas.toDataURL('image/png');

  if (imgH <= pageH - margin * 2) {
    pdf.addImage(img, 'PNG', margin, margin, usableW, imgH);
  } else {
    // Slice the tall canvas across multiple A4 pages.
    const pageCanvasH = ((pageH - margin * 2) * canvas.width) / usableW;
    let rendered = 0; let first = true;
    while (rendered < canvas.height) {
      const sliceH = Math.min(pageCanvasH, canvas.height - rendered);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width; pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, usableW, (sliceH * usableW) / canvas.width);
      rendered += sliceH; first = false;
    }
  }
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
