import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ui } from '../components/ui/feedback';

export const downloadAttendanceTemplateExcel = (columns: string[]) => {
  const ws = XLSX.utils.aoa_to_sheet([columns]);
  
  // Set column widths dynamically based on header length
  ws['!cols'] = columns.map(c => ({ wch: Math.max(15, c.length + 5) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance_Template');
  XLSX.writeFile(wb, 'Attendance_Import_Template.xlsx');
};

export const downloadImportGuidePDF = () => {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.setTextColor(41, 128, 185);
  doc.text('Attendance Import Guide', 14, 22);
  
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text('This guide explains how to properly format your Excel/CSV files for biometric import.', 14, 32);

  doc.setFontSize(14);
  doc.setTextColor(41, 128, 185);
  doc.text('1. Supported Formats', 14, 45);
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text('- .xlsx (Microsoft Excel)\n- .xls (Legacy Excel)\n- .csv (Comma Separated Values)', 14, 52);

  doc.setFontSize(14);
  doc.setTextColor(41, 128, 185);
  doc.text('2. Required Columns', 14, 72);
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text('The system will auto-map columns if they follow these headers:\nEmployee Code, Employee Name, Date (YYYY-MM-DD), In Time, Out Time, Status', 14, 79);

  doc.setFontSize(14);
  doc.setTextColor(41, 128, 185);
  doc.text('3. Sample Data Row', 14, 99);
  
  autoTable(doc, {
    startY: 105,
    head: [['Emp Code', 'Name', 'Date', 'In Time', 'Out Time', 'Status']],
    body: [
      ['EMP-001', 'John Doe', '2026-06-01', '09:00', '18:00', 'Present'],
      ['EMP-002', 'Jane Smith', '2026-06-01', '', '', 'Absent'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] }
  });

  doc.setFontSize(14);
  doc.setTextColor(41, 128, 185);
  doc.text('4. Troubleshooting', 14, (doc as any).lastAutoTable.finalY + 15);
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text('- Missing Employee Codes will cause the row to be rejected.\n- Invalid dates will default to today.\n- Ensure time format is 24-hour (HH:MM).', 14, (doc as any).lastAutoTable.finalY + 22);

  doc.save('Attendance_Import_Guide.pdf');
};

export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'print';
export interface ExportColumn { header: string; key: string }

export const downloadAttendanceReport = (
  reportName: string,
  format: ExportFormat,
  data: any[],
  columns: ExportColumn[],
  subtitle?: string
) => {
  if (!data || data.length === 0) {
    ui.toast.warning("No attendance data available for selected period.");
    return;
  }

  const filename = `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
  const cell = (row: any, key: string) => {
    const v = row[key];
    return v === 0 ? '0' : (v ?? '—');
  };

  if (format === 'excel') {
    const wsData = [columns.map(c => c.header)];
    data.forEach(row => {
      wsData.push(columns.map(c => cell(row, c.key)));
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = columns.map(c => ({ wch: Math.max(12, c.header.length + 4) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }
  else if (format === 'csv') {
    const esc = (v: any) => {
      const str = String(v === 0 ? '0' : (v ?? ''));
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [
      columns.map(c => esc(c.header)).join(','),
      ...data.map(row => columns.map(c => esc(cell(row, c.key) === '—' ? '' : cell(row, c.key))).join(',')),
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  else if (format === 'print') {
    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) { ui.toast.warning('Please allow pop-ups to print.'); return; }
    const head = columns.map(c => `<th>${c.header}</th>`).join('');
    const body = data.map(row =>
      `<tr>${columns.map(c => `<td>${cell(row, c.key)}</td>`).join('')}</tr>`
    ).join('');
    win.document.write(`<!doctype html><html><head><title>${reportName}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#0f172a}
        h1{font-size:18px;color:#2980b9;margin:0 0 2px}
        p{font-size:11px;color:#64748b;margin:0 0 16px}
        table{border-collapse:collapse;width:100%;font-size:11px}
        th{background:#2980b9;color:#fff;text-align:left;padding:6px 8px}
        td{border:1px solid #e2e8f0;padding:5px 8px}
        tr:nth-child(even) td{background:#f8fafc}
      </style></head><body>
      <h1>${reportName}</h1>
      <p>${subtitle ? subtitle + ' &middot; ' : ''}Generated on ${new Date().toLocaleString()} &middot; ${data.length} record(s)</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    win.document.close();
  }
  else { // pdf
    const doc = new jsPDF('landscape');
    doc.setFontSize(18);
    doc.setTextColor(41, 128, 185);
    doc.text(reportName, 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`${subtitle ? subtitle + '  |  ' : ''}Generated on: ${new Date().toLocaleString()}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [columns.map(c => c.header)],
      body: data.map(row => columns.map(c => cell(row, c.key))),
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save(`${filename}.pdf`);
  }
};

/**
 * Generic period/scope-aware export used by the enterprise Export modal.
 * Thin wrapper over downloadAttendanceReport so all four formats share one path.
 */
export const exportAttendanceDataset = (
  title: string,
  format: ExportFormat,
  rows: any[],
  columns: ExportColumn[],
  subtitle?: string
) => downloadAttendanceReport(title, format, rows, columns, subtitle);
