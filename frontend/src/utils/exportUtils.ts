import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export const downloadPayrollPDF = (record: any, company: any) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.setTextColor(79, 70, 229); // Indigo 600
  doc.text(company?.name || 'Company', 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('PAYSLIP', 14, 30);
  doc.text(`Pay Period: ${record.month} ${record.year}`, 14, 35);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 40);

  // Employee Info
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Employee Details', 14, 55);
  
  autoTable(doc, {
    startY: 60,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    body: [
      ['Name:', record.employeeName, 'Designation:', record.designation || 'N/A'],
      ['Employee ID:', record.employeeId, 'Department:', record.department || 'N/A'],
      ['Bank Account:', record.accountNumber || 'N/A', 'IFSC:', record.ifscCode || 'N/A']
    ],
  });

  // Salary Breakdown
  doc.text('Earnings & Deductions', 14, (doc as any).lastAutoTable.finalY + 15);
  
  const basic = record.basicSalary || 0;
  const allowances = record.allowances || 0;
  const deductions = record.deductions || 0;
  const net = record.netSalary || 0;

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Description', 'Earnings (INR)', 'Deductions (INR)']],
    body: [
      ['Basic Salary', basic.toLocaleString(), ''],
      ['Allowances', allowances.toLocaleString(), ''],
      ['Deductions', '', deductions.toLocaleString()],
    ],
    foot: [['Net Payable', `${net.toLocaleString()}`, '']],
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229] },
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
  });

  doc.save(`Payslip_${record.employeeName}_${record.month}_${record.year}.pdf`);
};

export const downloadAttendancePDF = (attendance: any[], month: string, year: string, companyName: string) => {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.setTextColor(79, 70, 229);
  doc.text(`Attendance Report - ${companyName}`, 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Period: ${month} ${year}`, 14, 28);
  
  const tableData = attendance.map(a => [
    a.employeeName,
    a.department,
    a.date,
    a.clockIn || '-',
    a.clockOut || '-',
    a.status
  ]);

  autoTable(doc, {
    startY: 35,
    head: [['Employee', 'Department', 'Date', 'Clock In', 'Clock Out', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229] },
    styles: { fontSize: 8 }
  });

  doc.save(`Attendance_${month}_${year}.pdf`);
};

export const downloadAttendanceExcel = (attendance: any[], month: string, year: string) => {
  const data = attendance.map(a => ({
    'Employee Name': a.employeeName,
    'Department': a.department,
    'Date': a.date,
    'Clock In': a.clockIn || '-',
    'Clock Out': a.clockOut || '-',
    'Hours': a.hoursWorked || 0,
    'Status': a.status
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
  
  XLSX.writeFile(workbook, `Attendance_${month}_${year}.xlsx`);
};


export interface ExcelExportOptions {
  fileName: string;
  format?: 'excel' | 'csv';
  sheets: {
    sheetName: string;
    columns: { header: string; key: string; width?: number }[];
    data: any[];
  }[];
}

/* ============================================================================
 * DYNAMIC EXPORT ENGINE
 * Generic, reusable Excel + PDF export used by the shared <ExportMenu> across
 * every page. Feed it the columns currently shown on screen and the rows the
 * user is currently looking at (after search/filter) and it produces a file.
 * Downloads use an explicit Blob + anchor click so they fire reliably in every
 * browser/environment (more robust than relying on XLSX.writeFile / doc.save).
 * ==========================================================================*/

export interface ExportColumn {
  /** Column heading shown in the file */
  header: string;
  /** Key into the row object. Supports dot-paths e.g. "company.name" */
  key: string;
  /** Excel column width (characters) */
  width?: number;
  /** Optional value transformer, e.g. (v) => `Rs. ${v}` */
  format?: (value: any, row: any) => any;
}

/**
 * Reliably triggers a browser download from a Blob.
 *
 * Hardened against environments that drop the filename/extension (saving files
 * as the raw blob UUID): uses the legacy msSaveOrOpenBlob path when present,
 * forces the `download` attribute, dispatches a real MouseEvent, and defers
 * cleanup so the download has time to start before the object URL is revoked.
 *
 * NOTE: if an external download manager (IDM/FDM/Ant) or a non-standard
 * embedded browser intercepts `blob:` URLs, it may still rename the file to its
 * UUID — that is outside the page's control. Use a standard Chrome/Edge/Firefox
 * window (or disable the interceptor) if filenames still come through wrong.
 */
const triggerDownload = (blob: Blob, fileName: string) => {
  // Legacy Edge / IE11 — most reliable when available.
  const nav = window.navigator as any;
  if (nav && typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(blob, fileName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // Set via both property and attribute for maximum compatibility.
  link.download = fileName;
  link.setAttribute('download', fileName);
  link.rel = 'noopener';
  link.target = '_self';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  link.style.opacity = '0';
  document.body.appendChild(link);

  // A synthesized MouseEvent is honored more broadly than HTMLElement.click().
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

  // Defer cleanup so the download pipeline keeps the object URL alive.
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    URL.revokeObjectURL(url);
  }, 4000);
};

/** Resolves a (possibly dot-pathed, possibly formatted) cell value for a row. */
const resolveCell = (col: ExportColumn, row: any): any => {
  const raw = col.key.split('.').reduce((o: any, k) => (o == null ? o : o[k]), row);
  const value = col.format ? col.format(raw, row) : raw;
  return value == null ? '' : value;
};

const sanitizeFileName = (name: string) =>
  (name || 'export').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';

/**
 * Export an on-screen table to an .xlsx file.
 * @param fileName  base name (no extension)
 * @param columns   the visible columns
 * @param rows      the visible/filtered rows
 * @param sheetName optional worksheet name
 */
export const exportRowsToExcel = (
  fileName: string,
  columns: ExportColumn[],
  rows: any[],
  sheetName = 'Sheet1'
) => {
  const data = rows.map(row => {
    const obj: Record<string, any> = {};
    columns.forEach(col => { obj[col.header] = resolveCell(col, row); });
    return obj;
  });

  const worksheet = XLSX.utils.json_to_sheet(data, { header: columns.map(c => c.header) });
  worksheet['!cols'] = columns.map(c => ({ wch: c.width || 18 }));

  const workbook = XLSX.utils.book_new();
  // Sheet names are limited to 31 chars and cannot contain certain characters.
  const safeSheet = (sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet1';
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheet);

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  triggerDownload(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${sanitizeFileName(fileName)}.xlsx`
  );
};

/**
 * Export an on-screen table to a .pdf file (auto-sizes orientation to columns).
 * @param fileName base name (no extension)
 * @param title    heading printed at the top of the document
 * @param columns  the visible columns
 * @param rows     the visible/filtered rows
 * @param subtitle optional line under the title (e.g. company / filter info)
 */
export const exportRowsToPDF = (
  fileName: string,
  title: string,
  columns: ExportColumn[],
  rows: any[],
  subtitle?: string
) => {
  const landscape = columns.length > 6;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' });

  doc.setFontSize(16);
  doc.setTextColor(31, 41, 55);
  doc.text(title, 14, 18);

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  let y = 25;
  if (subtitle) { doc.text(subtitle, 14, y); y += 5; }
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  doc.text(`Records: ${rows.length}`, 14, y + 5);

  autoTable(doc, {
    startY: y + 9,
    head: [columns.map(c => c.header)],
    body: rows.map(row => columns.map(col => {
      const v = resolveCell(col, row);
      return v === '' ? '-' : String(v);
    })),
    theme: 'striped',
    headStyles: { fillColor: [79, 124, 255], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });

  const blob = doc.output('blob');
  triggerDownload(blob, `${sanitizeFileName(fileName)}.pdf`);
};

/* ============================================================================
 * PROFESSIONAL MASTER REPORT ENGINE
 * Config-driven, branded exports used by the reusable <ExportWizard>. These are
 * additive — the original exportRowsToExcel / exportRowsToPDF above are kept for
 * backward compatibility. The engine only *renders*; the wizard decides which
 * rows/columns/options to feed it.
 * ==========================================================================*/

/** Branding + provenance printed in every report header. */
export interface ReportMeta {
  title: string;
  companyName?: string;
  /** Company logo as a data URL (PNG/JPEG). */
  companyLogo?: string;
  /** Line under the logo (e.g. address / branch). */
  companyLine?: string;
  /** "Generated By" name. */
  generatedBy?: string;
  /** Optional filter/summary line. */
  subtitle?: string;
}

export interface PdfReportOptions {
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'a4' | 'legal' | 'letter';
  logo?: boolean;
  header?: boolean;
  footer?: boolean;
  pageNumbers?: boolean;
  watermark?: boolean;
  watermarkText?: string;
}

export interface ExcelReportOptions {
  autoFit?: boolean;
  freezeHeader?: boolean;
  autoFilter?: boolean;
  branding?: boolean;
  /** When true, a "Document" column with the attached file name is appended. */
  hyperlinks?: boolean;
}

/** Attachment descriptor used by ZIP / hyperlink / PDF-image-append. */
export interface ReportAttachment {
  fileName?: string;
  /** data: URL or http(s) URL. */
  fileData?: string;
  mimeType?: string;
}

const nowStamp = () => new Date().toLocaleString();

/** Builds (but does not download) a branded jsPDF report. Reused by ZIP export. */
export const buildReportPdf = (
  meta: ReportMeta,
  columns: ExportColumn[],
  rows: any[],
  opts: PdfReportOptions = {},
  attachments?: ReportAttachment[],
): jsPDF => {
  const orientation = opts.orientation || (columns.length > 6 ? 'landscape' : 'portrait');
  const doc = new jsPDF({ orientation, unit: 'mm', format: opts.pageSize || 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let topY = 14;

  if (opts.header !== false) {
    let textX = 14;
    if (opts.logo && meta.companyLogo) {
      try {
        const fmt = /image\/png/i.test(meta.companyLogo) ? 'PNG' : 'JPEG';
        doc.addImage(meta.companyLogo, fmt, 14, 10, 18, 18);
        textX = 36;
      } catch { /* bad/oversized logo — skip gracefully */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(31, 41, 55);
    doc.text(meta.companyName || 'Company', textX, 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(79, 124, 255);
    doc.text(meta.title, textX, 23);
    if (meta.companyLine) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120); doc.text(meta.companyLine, textX, 28); }

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    const rightX = pageW - 14; let gy = 14;
    doc.text(`Generated: ${nowStamp()}`, rightX, gy, { align: 'right' }); gy += 4;
    if (meta.generatedBy) { doc.text(`Generated By: ${meta.generatedBy}`, rightX, gy, { align: 'right' }); gy += 4; }
    doc.text(`Records: ${rows.length}`, rightX, gy, { align: 'right' });

    topY = meta.companyLine ? 32 : 30;
    if (meta.subtitle) { doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text(String(meta.subtitle).slice(0, 160), textX, topY); topY += 4; }
    doc.setDrawColor(226, 232, 240); doc.line(14, topY, pageW - 14, topY); topY += 4;
  }

  autoTable(doc, {
    startY: topY,
    head: [columns.map(c => c.header)],
    body: rows.map(row => columns.map(col => { const v = resolveCell(col, row); return v === '' ? '-' : String(v); })),
    theme: 'striped',
    headStyles: { fillColor: [79, 124, 255], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14, top: opts.header !== false ? topY : 14 },
    didDrawPage: () => {
      if (opts.watermark) {
        const wm = (opts.watermarkText || meta.companyName || 'CONFIDENTIAL').toUpperCase();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(52); doc.setTextColor(235, 238, 244);
        try { (doc as any).setGState?.(new (doc as any).GState({ opacity: 0.35 })); } catch { /* opacity unsupported */ }
        doc.text(wm, pageW / 2, pageH / 2, { align: 'center', angle: 45 });
        try { (doc as any).setGState?.(new (doc as any).GState({ opacity: 1 })); } catch { /* ignore */ }
        doc.setTextColor(0, 0, 0);
      }
      if (opts.footer !== false) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150);
        doc.text(meta.companyName || '', 14, pageH - 8);
        doc.text(`Generated ${new Date().toLocaleDateString()}`, pageW / 2, pageH - 8, { align: 'center' });
      }
    },
  });

  // Append image attachments as full pages (PDF cannot merge arbitrary PDFs
  // without extra libs — non-image attachments are left for the ZIP export).
  if (attachments && attachments.length) {
    const images = attachments.filter(a => a?.fileData && /^data:image\//i.test(a.fileData));
    for (const a of images) {
      doc.addPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(31, 41, 55);
      doc.text(a.fileName || 'Attachment', 14, 16);
      try {
        const fmt = /image\/png/i.test(a.fileData!) ? 'PNG' : 'JPEG';
        const maxW = pageW - 28, maxH = pageH - 40;
        doc.addImage(a.fileData!, fmt, 14, 22, maxW, maxH, undefined, 'FAST');
      } catch { doc.setFontSize(8); doc.setTextColor(150); doc.text('(preview unavailable)', 14, 24); }
    }
  }

  if (opts.pageNumbers) {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${total}`, pageW - 14, pageH - 8, { align: 'right' });
    }
  }
  return doc;
};

/** Branded PDF download. */
export const exportReportPdf = (
  fileName: string, meta: ReportMeta, columns: ExportColumn[], rows: any[],
  opts: PdfReportOptions = {}, attachments?: ReportAttachment[],
) => {
  const doc = buildReportPdf(meta, columns, rows, opts, attachments);
  triggerDownload(doc.output('blob'), `${sanitizeFileName(fileName)}.pdf`);
};

/** Branded Excel download with column/filter/branding options. */
export const exportReportExcel = (
  fileName: string, meta: ReportMeta, columns: ExportColumn[], rows: any[],
  opts: ExcelReportOptions = {}, attachments?: (ReportAttachment | null)[],
) => {
  const cols = [...columns];
  if (opts.hyperlinks) cols.push({ header: 'Document', key: '__doc__' });

  const aoa: any[][] = [];
  let headerRowIdx = 0;
  if (opts.branding) {
    aoa.push([meta.companyName || 'Company']);
    aoa.push([meta.title]);
    aoa.push([`Generated: ${nowStamp()}`]);
    if (meta.generatedBy) aoa.push([`Generated By: ${meta.generatedBy}`]);
    aoa.push([]);
    headerRowIdx = aoa.length;
  }
  aoa.push(cols.map(c => c.header));
  rows.forEach((row, i) => {
    aoa.push(cols.map(col => {
      if (col.key === '__doc__') { const a = attachments?.[i]; return a?.fileName || (a?.fileData ? 'Attached' : ''); }
      return resolveCell(col, row);
    }));
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map(c => ({ wch: opts.autoFit ? Math.max((c.header?.length || 8) + 2, c.width || 14) : (c.width || 18) }));

  // Real hyperlinks for attachments that are external URLs (data: URLs can't be linked).
  if (opts.hyperlinks && attachments) {
    const docColIdx = cols.length - 1;
    attachments.forEach((a, i) => {
      if (a?.fileData && /^https?:\/\//i.test(a.fileData)) {
        const addr = XLSX.utils.encode_cell({ r: headerRowIdx + 1 + i, c: docColIdx });
        if (ws[addr]) ws[addr].l = { Target: a.fileData, Tooltip: a.fileName || 'Open document' };
      }
    });
  }

  const dataW = cols.length;
  const dataH = rows.length;
  const headerRef = XLSX.utils.encode_range({ s: { r: headerRowIdx, c: 0 }, e: { r: headerRowIdx + dataH, c: Math.max(0, dataW - 1) } });
  if (opts.autoFilter && dataW > 0) ws['!autofilter'] = { ref: headerRef };
  // Freeze the header row (best-effort; honored by Excel-compatible readers).
  if (opts.freezeHeader) (ws as any)['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1, topLeftCell: XLSX.utils.encode_cell({ r: headerRowIdx + 1, c: 0 }), activePane: 'bottomLeft', state: 'frozen' };

  const wb = XLSX.utils.book_new();
  const safeSheet = (meta.title || 'Report').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Report';
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${sanitizeFileName(fileName)}.xlsx`);
};

/** Branded CSV download (UTF-8 BOM for Excel compatibility). */
export const exportReportCsv = (fileName: string, columns: ExportColumn[], rows: any[]) => {
  const data = rows.map(row => {
    const o: Record<string, any> = {};
    columns.forEach(col => { o[col.header] = resolveCell(col, row); });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map(c => c.header) });
  const csv = XLSX.utils.sheet_to_csv(ws);
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `${sanitizeFileName(fileName)}.csv`);
};

/** ZIP bundle: branded PDF + Excel report and every uploaded attachment. */
export const exportReportZip = async (
  fileName: string, meta: ReportMeta, columns: ExportColumn[], rows: any[],
  attachments: (ReportAttachment | null)[] = [], pdfOpts: PdfReportOptions = {}, excelOpts: ExcelReportOptions = {},
) => {
  const zip = new JSZip();
  const base = sanitizeFileName(meta.title || fileName);

  // Report — PDF.
  const doc = buildReportPdf(meta, columns, rows, pdfOpts);
  zip.file(`${base}.pdf`, doc.output('blob'));

  // Report — Excel (as an array buffer so it lands in the zip cleanly).
  const cols = excelOpts.hyperlinks ? [...columns, { header: 'Document', key: '__doc__' } as ExportColumn] : columns;
  const aoa: any[][] = [cols.map(c => c.header)];
  rows.forEach((row, i) => aoa.push(cols.map(col => col.key === '__doc__' ? (attachments[i]?.fileName || '') : resolveCell(col, row))));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map(c => ({ wch: c.width || 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, base.slice(0, 31) || 'Report');
  zip.file(`${base}.xlsx`, XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));

  // Uploaded documents.
  const files = attachments.filter((a): a is ReportAttachment => !!a?.fileData);
  if (files.length) {
    const folder = zip.folder('documents')!;
    const used: Record<string, number> = {};
    files.forEach((a, i) => {
      const m = /^data:([^;]+);base64,(.*)$/.exec(a.fileData!);
      let name = a.fileName || `document_${i + 1}`;
      if (used[name] != null) { const n = ++used[name]; const dot = name.lastIndexOf('.'); name = dot > 0 ? `${name.slice(0, dot)}_${n}${name.slice(dot)}` : `${name}_${n}`; }
      else used[name] = 0;
      if (m) folder.file(name, m[2], { base64: true });
    });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${sanitizeFileName(fileName)}.zip`);
};

export const exportToExcel = (options: ExcelExportOptions) => {
  const workbook = XLSX.utils.book_new();

  options.sheets.forEach(sheet => {
    const rows = sheet.data.map(item => {
      const rowData: any = {};
      sheet.columns.forEach(col => {
        rowData[col.header] = item[col.key];
      });
      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    if (sheet.columns.some(c => c.width)) {
      worksheet['!cols'] = sheet.columns.map(c => ({ wch: c.width || 15 }));
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName);
  });

  if (options.format === 'csv') {
    const firstSheetName = options.sheets[0]?.sheetName;
    if (firstSheetName && workbook.Sheets[firstSheetName]) {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${options.fileName}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } else {
    XLSX.writeFile(workbook, `${options.fileName}.xlsx`);
  }
};
