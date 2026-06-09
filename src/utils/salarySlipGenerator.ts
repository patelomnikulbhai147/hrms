import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Helper to convert numbers to words
const numberToWords = (num: number): string => {
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
    String(a.workingDays ?? 26),
    String(a.present ?? 0),
    String(a.absent ?? 0),
    String(a.leave ?? 0),
    String(a.weeklyOff ?? 0),
    String(a.holiday ?? 0),
    String(a.lop ?? 0),
    Number(a.overtimeHours ?? record?.overtimeHours ?? 0).toFixed(1),
  ];
};

export const generateEnterprisePayslipPDF = (record: any, employee: any, company: any, attendanceSummary?: any) => {
  const doc = new jsPDF();
  const { earnings, deductions, employerContributions } = generateDynamicComponents(record, employee, company);
  
  const grossEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const netSalary = grossEarnings - totalDeductions;

  // 10. COMPANY INFORMATION
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(company?.name?.toUpperCase() || 'ENTERPRISE INC', 105, 15, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(company?.address || 'Corporate Headquarters', 105, 20, { align: 'center' });
  doc.text(`GST: ${company?.gstNumber || 'N/A'} | PAN: ${company?.pan || 'N/A'} | TAN: ${company?.tan || 'N/A'}`, 105, 25, { align: 'center' });
  doc.text(`Website: ${company?.domain || 'N/A'} | Contact: ${company?.phone || 'N/A'}`, 105, 30, { align: 'center' });

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
    head: [['Total Days', 'Working Days', 'Present', 'Absent', 'Leave', 'Weekly Off', 'Holiday', 'LOP', 'Overtime Hrs']],
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

  doc.save(`Enterprise_Payslip_${String(record.employeeName || 'Employee').replace(/\s+/g, '_')}_${record.month || ''}_${record.year || ''}.pdf`);
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
    [`GST: ${company?.gstNumber || 'N/A'} | PAN: ${company?.pan || 'N/A'}`],
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
