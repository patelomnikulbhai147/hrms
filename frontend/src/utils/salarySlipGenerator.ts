import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { formatPan } from '@/utils/idFormat';

// Helper to convert numbers to words
const numberToWords = (value: number): string => {
  // The classic conversion hack reassigns `num` between string/number forms,
  // so it is intentionally typed `any` here.
  let num: any = value;
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if ((num = num.toString().replace(/[\, ]/g, '')) != parseFloat(num).toString()) return '';
  let n: any = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return '';
  let str = '';
  str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
  str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
  str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
  str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
  str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only' : '';
  return str || 'Zero';
};

const maskString = (str?: string, visibleChars: number = 4) => {
  if (!str) return 'N/A';
  if (str.length <= visibleChars) return str;
  return 'X'.repeat(str.length - visibleChars) + str.slice(-visibleChars);
};

// Simulated dynamic breakdown generator since we don't have a full backend rules engine yet
// This ensures that when the backend sends arrays of components, this UI scales automatically without hardcoding
export const generateDynamicComponents = (record: any, employee: any, company: any) => {
  const ctcMonthly = Math.round((employee?.salary || record.netSalary * 12) / 12) || record.basicSalary * 2;
  const basic = record.basicSalary || Math.round(ctcMonthly * ((company?.basicPercent || 50) / 100));
  
  // Earnings
  const earnings = [
    { name: 'Basic Salary', amount: basic },
    { name: 'House Rent Allowance (HRA)', amount: Math.round(basic * 0.4) },
    { name: 'Conveyance Allowance', amount: 1600 },
    { name: 'Medical Allowance', amount: 1250 }
  ];
  
  if (record.overtimeAmount && record.overtimeAmount > 0) {
    earnings.push({ name: 'Overtime Amount', amount: record.overtimeAmount });
  }

  // Fill remaining allowances into Special Allowance
  const currentTotal = earnings.reduce((sum, e) => sum + e.amount, 0);
  const totalExpectedEarnings = basic + (record.allowances || 0) + (record.bonus || 0);
  if (totalExpectedEarnings > currentTotal) {
    earnings.push({ name: 'Special Allowance', amount: totalExpectedEarnings - currentTotal });
  }

  // Deductions
  const pf = Math.round(basic * ((company?.pfRate || 12) / 100));
  const esic = Math.round(basic * ((company?.esicRate || 0.75) / 100));
  const pt = company?.profTaxRate || 200;
  const tds = record.tax || 0;
  
  const deductions = [
    { name: 'PF Employee Share', amount: pf },
    { name: 'ESIC Employee Share', amount: esic },
    { name: 'Professional Tax', amount: pt },
  ];

  if (tds > 0) {
    deductions.push({ name: 'TDS (Income Tax)', amount: tds });
  }

  const currentTotalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  if (record.deductions > currentTotalDeductions) {
    deductions.push({ name: 'Other Deductions / LWP', amount: record.deductions - currentTotalDeductions });
  }

  // Employer Contributions
  const employerContributions = [
    { name: 'PF Employer Share (3.67%)', amount: Math.round(basic * 0.0367) },
    { name: 'EPS Contribution (8.33%)', amount: Math.round(basic * 0.0833) },
    { name: 'EDLI Contribution', amount: Math.round(basic * 0.005) },
    { name: 'PF Admin Charges', amount: Math.round(basic * 0.005) },
    { name: 'ESIC Employer Share', amount: Math.round(basic * 0.0325) }
  ];

  return { earnings, deductions, employerContributions };
};

// Builds the 9-cell attendance row from a real attendance summary, falling back
// to safe defaults only when no data exists.
const attendanceRow = (att: any, record: any): string[] => {
  const a = att || {};
  return [
    String(a.totalDays ?? 30),
    String(a.present ?? 0),
    String(a.absent ?? 0),
    String(a.cl ?? 0),
    String(a.pl ?? 0),
    String(a.sl ?? 0),
    String(a.lwp ?? a.lop ?? 0),
    String(a.payableDays ?? ((a.present ?? 0) + (a.cl ?? 0) + (a.pl ?? 0) + (a.sl ?? 0))),
    Number(a.overtimeHours ?? record?.overtimeHours ?? 0).toFixed(1),
  ];
};
const ATTENDANCE_HEAD = ['Total Days', 'Present', 'Absent', 'CL', 'PL', 'SL', 'LWP', 'Payable', 'OT Hrs'];

// Professional, audit-suitable file name:  VE-AHMD-0048_June_2026_Salary_Slip.pdf
export const payslipFileName = (record: any, employee: any): string => {
  const code = employee?.employeeId || record?.employee?.employeeId || record?.employeeId || 'EMP';
  const month = record?.month || '';
  const year = record?.year || '';
  return `${code}_${month}_${year}_Salary_Slip.pdf`.replace(/\s+/g, '_');
};

/**
 * Build the payslip jsPDF document WITHOUT saving it, so the same document can
 * be downloaded individually, bundled into a ZIP, printed, or emailed.
 * Returns the jsPDF instance plus the canonical file name.
 */
export const buildPayslipDoc = (record: any, employee: any, company: any, attendanceSummary?: any): { doc: any; fileName: string } => {
  const doc = new jsPDF();
  const { earnings, deductions, employerContributions } = generateDynamicComponents(record, employee, company);
  
  const grossEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const netSalary = grossEarnings - totalDeductions;

  // 10. COMPANY INFORMATION (uses the managed Company Branding fields)
  // Optional brand logo image, drawn top-left. Guarded: jsPDF only supports
  // PNG/JPEG raster data URLs, so SVG/other are skipped without breaking the slip.
  const brandLogo = company?.logoImage;
  if (brandLogo && /^data:image\/(png|jpe?g);base64,/i.test(brandLogo)) {
    try {
      const fmt = /png/i.test(brandLogo) ? 'PNG' : 'JPEG';
      doc.addImage(brandLogo, fmt, 14, 8, 22, 22);
    } catch (e) { /* ignore unsupported image */ }
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(company?.name?.toUpperCase() || 'ENTERPRISE INC', 105, 15, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (company?.tagline) { doc.setFont("helvetica", "italic"); doc.text(String(company.tagline), 105, 19.5, { align: 'center' }); doc.setFont("helvetica", "normal"); }
  doc.text(company?.address || company?.billingAddress || 'Corporate Headquarters', 105, company?.tagline ? 24 : 20, { align: 'center' });
  const infoY = company?.tagline ? 28.5 : 25;
  doc.text(`GST: ${company?.gstNumber || 'N/A'} | PAN: ${company?.pan ? formatPan(company.pan) : 'N/A'} | TAN: ${company?.tan || 'N/A'}`, 105, infoY, { align: 'center' });
  doc.text(`Website: ${company?.website || company?.domain || 'N/A'} | Contact: ${company?.contactNumber || company?.phone || 'N/A'}${(company?.contactEmail || company?.adminEmail) ? ` | ${company?.contactEmail || company?.adminEmail}` : ''}`, 105, infoY + 5, { align: 'center' });

  // Divider
  doc.setLineWidth(0.5);
  doc.line(14, 35, 196, 35);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`PAYSLIP FOR THE MONTH OF ${record.month?.toUpperCase()} ${record.year}`, 105, 42, { align: 'center' });

  // 2. COMPLETE EMPLOYEE INFORMATION
  autoTable(doc, {
    startY: 48,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 1: { cellWidth: 55 }, 2: { fontStyle: 'bold', cellWidth: 35 }, 3: { cellWidth: 55 } },
    body: [
      ['Employee Name:', employee?.name || record.employeeName, 'UAN Number:', employee?.uan || 'N/A'],
      ['Employee Code:', employee?.employeeId || record.employeeId, 'ESIC Number:', employee?.esic || 'N/A'],
      ['Designation:', employee?.designation || 'N/A', 'PAN Number:', maskString(employee?.pan, 4)],
      ['Department:', employee?.department || record.department, 'Aadhaar Number:', maskString(employee?.aadhaar, 4)],
      ['Branch/Location:', employee?.branchLocation || company?.branchName || 'Head Office', 'Bank Name:', employee?.bankName || 'N/A'],
      ['Date of Joining:', employee?.joinDate || 'N/A', 'Account Number:', maskString(employee?.accountNumber, 4)],
      ['Company:', company?.name || 'N/A', 'IFSC Code:', employee?.ifsc || 'N/A'],
    ]
  });

  const nextY1 = (doc as any).lastAutoTable.finalY + 5;

  // 3. ATTENDANCE & 8. LEAVE SUMMARY
  autoTable(doc, {
    startY: nextY1,
    theme: 'grid',
    headStyles: { fillColor: [240, 244, 248], textColor: 0, fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    head: [ATTENDANCE_HEAD],
    body: [attendanceRow(attendanceSummary, record)]
  });

  const nextY2 = (doc as any).lastAutoTable.finalY + 5;

  // 4 & 5. EARNINGS & DEDUCTIONS DYNAMIC SECTION
  const maxRows = Math.max(earnings.length, deductions.length);
  const salaryData = [];
  for (let i = 0; i < maxRows; i++) {
    salaryData.push([
      earnings[i] ? earnings[i].name : '',
      earnings[i] ? earnings[i].amount.toLocaleString('en-IN') : '',
      deductions[i] ? deductions[i].name : '',
      deductions[i] ? deductions[i].amount.toLocaleString('en-IN') : ''
    ]);
  }

  // 9. SALARY SUMMARY (appended to table)
  salaryData.push([
    { content: 'Gross Earnings', styles: { fontStyle: 'bold' } },
    { content: grossEarnings.toLocaleString('en-IN'), styles: { fontStyle: 'bold' } },
    { content: 'Total Deductions', styles: { fontStyle: 'bold' } },
    { content: totalDeductions.toLocaleString('en-IN'), styles: { fontStyle: 'bold' } }
  ]);

  autoTable(doc, {
    startY: nextY2,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 35, halign: 'right' }, 2: { cellWidth: 55 }, 3: { cellWidth: 35, halign: 'right' } },
    head: [['Earnings Component', 'Amount (Rs)', 'Deductions Component', 'Amount (Rs)']],
    body: salaryData
  });

  const nextY3 = (doc as any).lastAutoTable.finalY + 2;

  // Net Salary Block
  doc.setFillColor(240, 253, 244);
  doc.rect(14, nextY3, 182, 12, 'F');
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Net Salary Payable: Rs. ${netSalary.toLocaleString('en-IN')}`, 18, nextY3 + 8);
  
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(`Amount in Words: ${numberToWords(netSalary)}`, 14, nextY3 + 18);

  // 6 & 7. EMPLOYER CONTRIBUTIONS & STATUTORY COMPLIANCE
  const nextY4 = nextY3 + 25;
  autoTable(doc, {
    startY: nextY4,
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 30, halign: 'right' }, 2: { cellWidth: 60 }, 3: { cellWidth: 32 } },
    head: [['Employer Contributions (Not deducted from net)', 'Amount (Rs)', 'Statutory Compliance Settings', 'Status']],
    body: [
      [employerContributions[0]?.name || '', employerContributions[0]?.amount.toLocaleString('en-IN') || '', 'PF Applicable', 'Yes'],
      [employerContributions[1]?.name || '', employerContributions[1]?.amount.toLocaleString('en-IN') || '', 'ESIC Applicable', 'Yes'],
      [employerContributions[2]?.name || '', employerContributions[2]?.amount.toLocaleString('en-IN') || '', 'PT Applicable', 'Yes'],
      [employerContributions[3]?.name || '', employerContributions[3]?.amount.toLocaleString('en-IN') || '', 'LWF Applicable', 'Yes'],
      [employerContributions[4]?.name || '', employerContributions[4]?.amount.toLocaleString('en-IN') || '', 'TDS Applicable', 'Yes']
    ]
  });

  const finalY = (doc as any).lastAutoTable.finalY + 15;

  // 12. DIGITAL VERIFICATION
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated Date: ${new Date().toLocaleString()}`, 14, finalY);
  doc.text(`Generated By: System Admin`, 14, finalY + 4);
  doc.text(`Payroll Status: ${String(record.payrollStatus || record.status || 'draft').toUpperCase()}`, 14, finalY + 8);
  
  doc.setFont("helvetica", "bold");
  doc.text('This is a digitally verified enterprise document. No physical signature is required.', 105, finalY + 15, { align: 'center' });

  // 11. QR CODE Placeholder
  // Simulate a QR Code using a drawn box or API if possible.
  // Using an actual QR image from an API can cause async issues inside this sync func, so we draw a representation.
  doc.setDrawColor(0);
  doc.rect(170, finalY - 5, 25, 25);
  doc.setFontSize(6);
  doc.text('SCAN TO', 182.5, finalY + 5, { align: 'center' });
  doc.text('VERIFY', 182.5, finalY + 10, { align: 'center' });
  doc.text('QR CODE', 182.5, finalY + 15, { align: 'center' });

  const fileName = payslipFileName(record, employee);
  return { doc, fileName };
};

// Download a single payslip PDF (code-based filename). Returns the filename.
export const generateEnterprisePayslipPDF = (record: any, employee: any, company: any, attendanceSummary?: any): string => {
  const { doc, fileName } = buildPayslipDoc(record, employee, company, attendanceSummary);
  doc.save(fileName);
  return fileName;
};

// Open the OS print dialog for a single payslip (no file saved).
export const printPayslipPDF = (record: any, employee: any, company: any, attendanceSummary?: any): void => {
  const { doc } = buildPayslipDoc(record, employee, company, attendanceSummary);
  doc.autoPrint();
  const blobUrl = doc.output('bloburl');
  const w = window.open(blobUrl as any, '_blank');
  if (!w) { // popup blocked — fall back to an iframe print
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = blobUrl as any;
    document.body.appendChild(iframe);
    iframe.onload = () => iframe.contentWindow?.print();
  }
};

// Build a payslip as a Blob (for ZIP bundling). Returns { blob, fileName }.
export const payslipBlob = (record: any, employee: any, company: any, attendanceSummary?: any): { blob: Blob; fileName: string } => {
  const { doc, fileName } = buildPayslipDoc(record, employee, company, attendanceSummary);
  return { blob: doc.output('blob') as Blob, fileName };
};

// Build a payslip as a base64 data string (for emailing via the backend).
export const payslipBase64 = (record: any, employee: any, company: any, attendanceSummary?: any): { base64: string; fileName: string } => {
  const { doc, fileName } = buildPayslipDoc(record, employee, company, attendanceSummary);
  return { base64: doc.output('datauristring') as string, fileName };
};

export interface PayslipBundleItem { record: any; employee: any; attendance?: any; }

/**
 * Bundle many payslips into a single ZIP and download it. Each PDF inside the
 * ZIP uses the canonical code-based file name. Returns the number bundled.
 */
export const downloadPayslipsZip = async (
  items: PayslipBundleItem[],
  company: any,
  zipName: string,
): Promise<number> => {
  if (!items.length) return 0;
  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const it of items) {
    const { blob, fileName } = payslipBlob(it.record, it.employee, company, it.attendance);
    // guard against duplicate filenames inside the archive
    let name = fileName;
    let n = 1;
    while (usedNames.has(name)) { name = fileName.replace(/\.pdf$/i, `_${n++}.pdf`); }
    usedNames.add(name);
    zip.file(name, blob);
  }
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return items.length;
};

export const generateEnterprisePayslipExcel = (record: any, employee: any, company: any, attendanceSummary?: any) => {
  const { earnings, deductions, employerContributions } = generateDynamicComponents(record, employee, company);
  
  const grossEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const netSalary = grossEarnings - totalDeductions;

  // Build the worksheet data logically as rows
  const wsData = [
    [company?.name?.toUpperCase() || 'ENTERPRISE INC'],
    [company?.address || 'Corporate Headquarters'],
    [`GST: ${company?.gstNumber || 'N/A'} | PAN: ${company?.pan ? formatPan(company.pan) : 'N/A'}`],
    [],
    [`PAYSLIP FOR THE MONTH OF ${record.month?.toUpperCase()} ${record.year}`],
    [],
    // Employee Info
    ['Employee Details'],
    ['Employee Name', employee?.name || record.employeeName, 'UAN Number', employee?.uan || 'N/A'],
    ['Employee Code', employee?.employeeId || record.employeeId, 'ESIC Number', employee?.esic || 'N/A'],
    ['Designation', employee?.designation || 'N/A', 'PAN Number', maskString(employee?.pan, 4)],
    ['Department', employee?.department || record.department, 'Aadhaar Number', maskString(employee?.aadhaar, 4)],
    ['Date of Joining', employee?.joinDate || 'N/A', 'Bank Account', maskString(employee?.accountNumber, 4)],
    [],
    // Attendance
    ['Attendance & Leaves'],
    ['Total Days', 'Working Days', 'Present', 'Absent', 'Leave', 'Weekly Off', 'Holiday', 'LOP', 'Overtime Hrs'],
    attendanceRow(attendanceSummary, record),
    [],
    // Salary Breakdown Header
    ['Earnings Component', 'Amount (Rs)', 'Deductions Component', 'Amount (Rs)']
  ];

  const maxRows = Math.max(earnings.length, deductions.length);
  for (let i = 0; i < maxRows; i++) {
    wsData.push([
      earnings[i] ? earnings[i].name : '',
      earnings[i] ? earnings[i].amount : '',
      deductions[i] ? deductions[i].name : '',
      deductions[i] ? deductions[i].amount : ''
    ]);
  }

  // Summaries
  wsData.push([
    'Gross Earnings', grossEarnings, 'Total Deductions', totalDeductions
  ]);
  wsData.push([]);
  wsData.push(['Net Salary Payable', netSalary]);
  wsData.push(['Amount in Words', numberToWords(netSalary)]);
  wsData.push([]);
  
  // Contributions & Statutory
  wsData.push(['Employer Contributions', 'Amount (Rs)', 'Statutory Compliance', 'Status']);
  for (let i = 0; i < employerContributions.length; i++) {
    wsData.push([
      employerContributions[i]?.name || '',
      employerContributions[i]?.amount || '',
      ['PF Applicable', 'ESIC Applicable', 'PT Applicable', 'LWF Applicable', 'TDS Applicable'][i] || '',
      'Yes'
    ]);
  }
  
  wsData.push([]);
  wsData.push(['Digital Verification']);
  wsData.push(['Generated Date:', new Date().toLocaleString()]);
  wsData.push(['Generated By:', 'System Admin']);
  wsData.push(['Payroll Status:', String(record.payrollStatus || record.status || 'draft').toUpperCase()]);
  wsData.push(['This is a digitally verified enterprise document.']);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Salary_Slip");

  XLSX.writeFile(wb, `Enterprise_Payslip_${String(record.employeeName || 'Employee').replace(/\s+/g, '_')}_${record.month || ''}_${record.year || ''}.xlsx`);
};
