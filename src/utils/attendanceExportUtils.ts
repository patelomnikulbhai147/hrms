import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AttendanceRecord, Employee } from '../types';

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

export const downloadAttendanceReport = (
  reportName: string, 
  format: 'pdf' | 'excel', 
  data: any[],
  columns: { header: string; key: string }[]
) => {
  if (!data || data.length === 0) {
    alert("No attendance data available for selected period.");
    return;
  }

  const filename = `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;

  if (format === 'excel') {
    const wsData = [columns.map(c => c.header)];
    data.forEach(row => {
      wsData.push(columns.map(c => row[c.key] || '—'));
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } 
  else if (format === 'pdf') {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(18);
    doc.setTextColor(41, 128, 185);
    doc.text(reportName, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [columns.map(c => c.header)],
      body: data.map(row => columns.map(c => row[c.key] || '—')),
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save(`${filename}.pdf`);
  }
};
