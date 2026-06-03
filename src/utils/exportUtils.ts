import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Add type for autotable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

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
  
  doc.autoTable({
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

  doc.autoTable({
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

  doc.autoTable({
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
  sheets: {
    sheetName: string;
    columns: { header: string; key: string; width?: number }[];
    data: any[];
  }[];
}

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

  XLSX.writeFile(workbook, `${options.fileName}.xlsx`);
};
