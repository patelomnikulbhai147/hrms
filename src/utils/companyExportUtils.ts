/**
 * companyExportUtils.ts
 *
 * Excel  — 3-sheet workbook (Companies / Branches / Subscription Summary)
 * PDF    — Professional multi-page report with KPI summary, directory tables,
 *          and plan catalogue. Generated with jsPDF + jspdf-autotable.
 *
 * Companies and Branches are NEVER merged into a single column.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: any): string => (v == null || v === '' ? '' : String(v));
const fmtNum = (v: any): number | string => (v == null || v === '' ? '' : Number(v));
const fmtCurrency = (v: any): string => {
  const n = Number(v);
  return isNaN(n) || n === 0 ? '' : `Rs. ${n.toLocaleString('en-IN')}`;
};

const todayStamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const autoWidth = (rows: Record<string, any>[], headers: string[]): number[] =>
  headers.map(h => {
    const maxContent = rows.reduce((max, row) => {
      const val = fmt(row[h]);
      return Math.max(max, val.length);
    }, h.length);
    return Math.min(Math.max(maxContent + 2, 10), 60);
  });

const triggerExcelDownload = (buffer: ArrayBuffer, fileName: string): void => {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const nav = window.navigator as any;
  if (nav && typeof nav.msSaveOrOpenBlob === 'function') { nav.msSaveOrOpenBlob(blob, fileName); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.setAttribute('download', fileName);
  a.rel = 'noopener'; a.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  setTimeout(() => { a.parentNode?.removeChild(a); URL.revokeObjectURL(url); }, 4000);
};

const triggerBlobDownload = (blob: Blob, fileName: string): void => {
  const nav = window.navigator as any;
  if (nav && typeof nav.msSaveOrOpenBlob === 'function') { nav.msSaveOrOpenBlob(blob, fileName); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.setAttribute('download', fileName);
  a.rel = 'noopener'; a.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  setTimeout(() => { a.parentNode?.removeChild(a); URL.revokeObjectURL(url); }, 4000);
};

// ─── Column Definitions ───────────────────────────────────────────────────────

const COMPANY_HEADERS = [
  'Type', 'Company ID', 'Company Name', 'Contact Person', 'Email', 'Mobile Number',
  'Alternate Contact', 'Industry', 'City', 'State', 'Country', 'Address', 'GST Number',
  'Domain', 'Total Employees', 'Active Employees', 'Total Branches', 'Subscription Plan',
  'Subscription Price (Rs.)', 'Billing Cycle', 'Subscription Start Date',
  'Subscription Expiry Date', 'Billing Status', 'Account Status', 'Company Status',
  'Is Archived', 'PF Rate (%)', 'ESIC Rate (%)', 'Basic %', 'Prof Tax (Rs.)',
  'Overtime Rate', 'Created Date', 'Last Updated',
];

const BRANCH_HEADERS = [
  'Type', 'Parent Company ID', 'Branch ID', 'Company Name', 'Branch Name', 'Branch Code',
  'Contact Person', 'Email', 'Mobile Number', 'Alternate Contact', 'City / Location',
  'Country', 'Address', 'Employee Capacity', 'Total Employees', 'Active Employees',
  'Subscription Plan', 'Branch Status', 'Is Archived', 'PF Rate (%)', 'ESIC Rate (%)',
  'Basic %', 'Prof Tax (Rs.)', 'Overtime Rate', 'Created Date', 'Last Updated',
];

const PLAN_HEADERS = [
  'Plan Name', 'Monthly Price (Rs.)', 'Yearly Price (Rs.)', 'Employee Limit',
  'HR Admin Limit', 'Storage Limit', 'Payroll Access', 'Document Access', 'Included Branch Limit',
];

// ─── Row Mappers ──────────────────────────────────────────────────────────────

const mapCompanyRow = (c: any): Record<string, any> => ({
  'Type': 'Company',
  'Company ID': fmt(c.companyId),
  'Company Name': fmt(c.companyName),
  'Contact Person': fmt(c.contactPerson),
  'Email': fmt(c.email),
  'Mobile Number': fmt(c.mobileNumber),
  'Alternate Contact': fmt(c.alternateContact),
  'Industry': fmt(c.industry),
  'City': fmt(c.city),
  'State': fmt(c.state),
  'Country': fmt(c.country) || 'India',
  'Address': fmt(c.address),
  'GST Number': fmt(c.gstNumber),
  'Domain': fmt(c.domain),
  'Total Employees': fmtNum(c.totalEmployeeCount),
  'Active Employees': fmtNum(c.activeEmployeeCount),
  'Total Branches': fmtNum(c.totalBranches),
  'Subscription Plan': fmt(c.subscriptionPlan),
  'Subscription Price (Rs.)': fmtCurrency(c.subscriptionPrice),
  'Billing Cycle': fmt(c.billingCycle),
  'Subscription Start Date': fmt(c.subscriptionStartDate),
  'Subscription Expiry Date': fmt(c.subscriptionExpiryDate),
  'Billing Status': fmt(c.billingStatus),
  'Account Status': fmt(c.accountStatus),
  'Company Status': fmt(c.companyStatus),
  'Is Archived': fmt(c.isArchived),
  'PF Rate (%)': fmtNum(c.pfRate),
  'ESIC Rate (%)': fmtNum(c.esicRate),
  'Basic %': fmtNum(c.basicPercent),
  'Prof Tax (Rs.)': fmtNum(c.profTaxRate),
  'Overtime Rate': fmtNum(c.overtimeRate),
  'Created Date': fmt(c.createdDate),
  'Last Updated': fmt(c.updatedDate),
});

const mapBranchRow = (b: any): Record<string, any> => ({
  'Type': 'Branch',
  'Parent Company ID': fmt(b.companyId),
  'Branch ID': fmt(b.branchId),
  'Company Name': fmt(b.companyName),
  'Branch Name': fmt(b.branchName),
  'Branch Code': fmt(b.branchCode),
  'Contact Person': fmt(b.contactPerson),
  'Email': fmt(b.email),
  'Mobile Number': fmt(b.mobileNumber),
  'Alternate Contact': fmt(b.alternateContact),
  'City / Location': fmt(b.city),
  'Country': fmt(b.country) || 'India',
  'Address': fmt(b.address),
  'Employee Capacity': fmtNum(b.employeeCapacity),
  'Total Employees': fmtNum(b.totalEmployeeCount),
  'Active Employees': fmtNum(b.activeEmployeeCount),
  'Subscription Plan': fmt(b.subscriptionPlan),
  'Branch Status': fmt(b.branchStatus),
  'Is Archived': fmt(b.isArchived),
  'PF Rate (%)': fmtNum(b.pfRate),
  'ESIC Rate (%)': fmtNum(b.esicRate),
  'Basic %': fmtNum(b.basicPercent),
  'Prof Tax (Rs.)': fmtNum(b.profTaxRate),
  'Overtime Rate': fmtNum(b.overtimeRate),
  'Created Date': fmt(b.createdDate),
  'Last Updated': fmt(b.updatedDate),
});

const mapPlanRow = (p: any): Record<string, any> => ({
  'Plan Name': fmt(p.name),
  'Monthly Price (Rs.)': fmtCurrency(p.priceMonthly),
  'Yearly Price (Rs.)': fmtCurrency(p.priceYearly),
  'Employee Limit': fmtNum(p.employeeLimit),
  'HR Admin Limit': fmtNum(p.hrLimit),
  'Storage Limit': fmt(p.storageLimit),
  'Payroll Access': p.payrollAccess ? 'Yes' : 'No',
  'Document Access': p.documentAccess ? 'Yes' : 'No',
  'Included Branch Limit': fmtNum(p.includedBranchLimit),
});

// ─── Sheet Builder (Excel) ────────────────────────────────────────────────────

const buildSheet = (headers: string[], mappedRows: Record<string, any>[]): XLSX.WorkSheet => {
  const sheetData: any[][] = [
    headers,
    ...mappedRows.map(row => headers.map(h => row[h] ?? '')),
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = autoWidth(mappedRows, headers).map(w => ({ wch: w }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
  const lastCol = XLSX.utils.encode_col(headers.length - 1);
  ws['!autofilter'] = { ref: `A1:${lastCol}${sheetData.length}` };

  headers.forEach((_, colIdx) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (!ws[addr]) ws[addr] = { t: 's', v: headers[colIdx] };
    ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: '2563EB' }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
      border: { bottom: { style: 'medium', color: { rgb: '1D4ED8' } } },
    };
  });

  return ws;
};

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface EmployeeSummary {
  totalEmployees: number;
  activeEmployees: number;
  archivedEmployees: number;
  byStatus?: { status: string; count: number }[];
  byCompany?: { companyName: string; companyStatus: string; total: number; active: number; archived: number }[];
}

export interface CompanyExportPayload {
  companies: any[];
  branches: any[];
  plans: any[];
  employeeSummary?: EmployeeSummary;
  exportedAt?: string;
}

// A record is treated as deactivated when its status is anything other than
// Active, or it is flagged archived.
const ACTIVE_RE = /^active$/i;
const isDeactivated = (status: any, isArchived: any): boolean =>
  !ACTIVE_RE.test(String(status || '')) || String(isArchived) === 'Yes' || isArchived === true;

const EMP_SUMMARY_HEADERS = ['Company', 'Company Status', 'Total Employees', 'Active', 'Archived'];
const ARCHIVED_HEADERS = ['Type', 'Name', 'Parent / Company', 'Code', 'Status', 'Total Employees', 'Is Archived'];

// ─── Excel Export ─────────────────────────────────────────────────────────────

/**
 * Generates and downloads a 3-sheet Excel workbook:
 *   Sheet 1 — Companies        (all DB fields)
 *   Sheet 2 — Branches         (all DB fields + parent company name)
 *   Sheet 3 — Subscription Summary
 */
export const downloadCompanyExcel = (payload: CompanyExportPayload): void => {
  const { companies = [], branches = [], plans = [], employeeSummary } = payload;

  // Archived / deactivated companies + branches in one sheet.
  const archivedRows = [
    ...companies.filter(c => isDeactivated(c.companyStatus, c.isArchived)).map(c => ({
      'Type': 'Company', 'Name': fmt(c.companyName), 'Parent / Company': '—',
      'Code': fmt(c.companyId), 'Status': fmt(c.companyStatus),
      'Total Employees': fmtNum(c.totalEmployeeCount), 'Is Archived': fmt(c.isArchived),
    })),
    ...branches.filter(b => isDeactivated(b.branchStatus, b.isArchived)).map(b => ({
      'Type': 'Branch', 'Name': fmt(b.branchName), 'Parent / Company': fmt(b.companyName),
      'Code': fmt(b.branchCode), 'Status': fmt(b.branchStatus),
      'Total Employees': fmtNum(b.totalEmployeeCount), 'Is Archived': fmt(b.isArchived),
    })),
  ];

  // Employee summary per company.
  const empRows = (employeeSummary?.byCompany || []).map(r => ({
    'Company': fmt(r.companyName), 'Company Status': fmt(r.companyStatus),
    'Total Employees': fmtNum(r.total), 'Active': fmtNum(r.active), 'Archived': fmtNum(r.archived),
  }));
  if (employeeSummary) {
    empRows.push({
      'Company': 'TOTAL (All Companies)', 'Company Status': '',
      'Total Employees': fmtNum(employeeSummary.totalEmployees),
      'Active': fmtNum(employeeSummary.activeEmployees),
      'Archived': fmtNum(employeeSummary.archivedEmployees),
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(COMPANY_HEADERS, companies.map(mapCompanyRow)), 'Companies');
  XLSX.utils.book_append_sheet(wb, buildSheet(BRANCH_HEADERS,  branches.map(mapBranchRow)),  'Branches');
  if (empRows.length)      XLSX.utils.book_append_sheet(wb, buildSheet(EMP_SUMMARY_HEADERS, empRows),      'Employee Summary');
  if (archivedRows.length) XLSX.utils.book_append_sheet(wb, buildSheet(ARCHIVED_HEADERS,    archivedRows), 'Archived Records');
  XLSX.utils.book_append_sheet(wb, buildSheet(PLAN_HEADERS,    plans.map(mapPlanRow)),        'Subscription Summary');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true, compression: true });
  triggerExcelDownload(buffer, `Company_Directory_${todayStamp()}.xlsx`);
};

// ─── PDF Export ───────────────────────────────────────────────────────────────

/**
 * Generates and downloads a professional multi-section PDF report:
 *   1. Dashboard Summary
 *   2. Company Directory
 *   3. Branch Directory
 *   4. Archived / Deactivated Records
 *   5. Employee Summary
 *   6. Subscription Summary
 * Sections flow continuously and auto-paginate; every page carries a header band
 * and a footer with page numbers.
 */
export const downloadCompanyPDF = (payload: CompanyExportPayload, stats?: any): void => {
  const { companies = [], branches = [], plans = [], employeeSummary } = payload;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const C_BLUE   = [37,  99,  235] as [number, number, number];
  const C_INDIGO = [79,  70,  229] as [number, number, number];
  const C_AMBER  = [217, 119, 6]   as [number, number, number];
  const C_ROSE   = [220, 38,  38]  as [number, number, number];
  const C_WHITE  = [255, 255, 255] as [number, number, number];
  const C_LIGHT  = [248, 250, 252] as [number, number, number];
  const C_SLATE  = [71,  85,  105] as [number, number, number];
  const stamp    = todayStamp();
  const PAGE_W = 297, PAGE_H = 210, M = 14;

  // Slim header band drawn on every page (via autoTable's didDrawPage + manually).
  const drawHeaderBand = () => {
    doc.setFillColor(...C_BLUE);
    doc.rect(0, 0, PAGE_W, 12, 'F');
    doc.setTextColor(...C_WHITE);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
    doc.text('SaaS Company Management Report', M, 8);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}  |  Super Admin`, PAGE_W - M, 8, { align: 'right' });
  };

  let y = 16;

  // Move to a new page if there isn't room for `need` mm before the footer.
  const ensure = (need: number) => {
    if (y + need > PAGE_H - 14) { doc.addPage(); drawHeaderBand(); y = 16; }
  };
  const heading = (title: string, color = C_BLUE) => {
    ensure(12);
    doc.setTextColor(...color);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(title, M, y);
    y += 4;
  };
  const table = (head: string[], body: any[][], headColor: [number, number, number], columnStyles: any = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length ? body : [[ 'No records', ...Array(head.length - 1).fill('') ]],
      theme: 'striped',
      headStyles: { fillColor: headColor, textColor: C_WHITE, fontStyle: 'bold', fontSize: 6.8 },
      styles: { fontSize: 6.6, cellPadding: 1.6, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: M, right: M, top: 16, bottom: 12 },
      columnStyles,
      didDrawPage: drawHeaderBand,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  };

  drawHeaderBand();

  // ── Section 1: Dashboard Summary ────────────────────────────────────────────
  heading('1. Dashboard Summary');
  const cards = [
    { label: 'Total Companies',       value: stats?.totalCompanies      ?? companies.length, color: C_BLUE },
    { label: 'Total Branches',        value: stats?.totalBranches        ?? branches.length, color: C_INDIGO },
    { label: 'Deactivated Companies', value: stats?.deactivatedCompanies ?? companies.filter(c => isDeactivated(c.companyStatus, c.isArchived)).length, color: C_AMBER },
    { label: 'Deactivated Branches',  value: stats?.deactivatedBranches  ?? branches.filter(b => isDeactivated(b.branchStatus, b.isArchived)).length, color: C_ROSE },
  ];
  const cardW = (PAGE_W - 2 * M - 3 * 7) / 4;
  cards.forEach((card, i) => {
    const x = M + i * (cardW + 7);
    doc.setFillColor(...C_LIGHT);
    doc.roundedRect(x, y, cardW, 20, 3, 3, 'F');
    doc.setFillColor(...card.color);
    doc.roundedRect(x, y, 6, 20, 3, 3, 'F');
    doc.setTextColor(...C_SLATE);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text(card.label, x + 10, y + 7);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(card.value), x + 10, y + 16);
  });
  y += 25;
  // Secondary stat line
  const secondary = [
    `Active Companies: ${stats?.activeCompanies ?? '-'}`,
    `Active Branches: ${stats?.activeBranches ?? '-'}`,
    `Total Employees: ${employeeSummary?.totalEmployees ?? stats?.totalEmployees ?? '-'}`,
    `Active Employees: ${employeeSummary?.activeEmployees ?? stats?.activeStaff ?? '-'}`,
    `Archived Employees: ${employeeSummary?.archivedEmployees ?? '-'}`,
  ].join('     ');
  doc.setTextColor(...C_SLATE); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(secondary, M, y);
  y += 8;

  // ── Section 2: Company Directory ────────────────────────────────────────────
  heading('2. Company Directory');
  table(
    ['Company Name', 'Type', 'Website', 'Contact Person', 'Email', 'Mobile', 'Industry', 'Join Date', 'Status', 'Plan', 'Emp.', 'Branches', 'Created', 'Updated'],
    companies.map(c => [
      fmt(c.companyName) || '-', 'Company', fmt(c.website || c.domain) || '-', fmt(c.contactPerson) || '-',
      fmt(c.email) || '-', fmt(c.mobileNumber) || '-', fmt(c.industry) || '-',
      fmt(c.subscriptionStartDate) || '-', fmt(c.companyStatus) || '-', fmt(c.subscriptionPlan) || '-',
      fmt(c.totalEmployeeCount), fmt(c.totalBranches), fmt(c.createdDate) || '-', fmt(c.updatedDate) || '-',
    ]),
    C_BLUE,
    { 0: { cellWidth: 26 }, 4: { cellWidth: 34 } },
  );

  // ── Section 3: Branch Directory ─────────────────────────────────────────────
  heading('3. Branch Directory');
  table(
    ['Branch Code', 'Branch Name', 'Parent Company', 'Admin Name', 'Admin Email', 'Contact No.', 'Staff Count', 'Status', 'Created', 'Updated'],
    branches.map(b => [
      fmt(b.branchCode) || '-', fmt(b.branchName) || '-', fmt(b.companyName) || '-',
      fmt(b.contactPerson) || '-', fmt(b.email) || '-', fmt(b.mobileNumber) || '-',
      fmt(b.totalEmployeeCount), fmt(b.branchStatus) || '-', fmt(b.createdDate) || '-', fmt(b.updatedDate) || '-',
    ]),
    C_INDIGO,
    { 1: { cellWidth: 28 }, 2: { cellWidth: 30 }, 4: { cellWidth: 36 } },
  );

  // ── Section 4: Archived / Deactivated Records ───────────────────────────────
  heading('4. Archived / Deactivated Records', C_AMBER);
  const archived = [
    ...companies.filter(c => isDeactivated(c.companyStatus, c.isArchived)).map(c => [
      'Company', fmt(c.companyName) || '-', '—', fmt(c.companyId) || '-',
      fmt(c.companyStatus) || '-', fmt(c.totalEmployeeCount), fmt(c.isArchived),
    ]),
    ...branches.filter(b => isDeactivated(b.branchStatus, b.isArchived)).map(b => [
      'Branch', fmt(b.branchName) || '-', fmt(b.companyName) || '-', fmt(b.branchCode) || '-',
      fmt(b.branchStatus) || '-', fmt(b.totalEmployeeCount), fmt(b.isArchived),
    ]),
  ];
  table(
    ['Type', 'Name', 'Parent / Company', 'Code', 'Status', 'Total Emp.', 'Is Archived'],
    archived,
    C_AMBER,
    { 1: { cellWidth: 40 }, 2: { cellWidth: 40 } },
  );

  // ── Section 5: Employee Summary ─────────────────────────────────────────────
  heading('5. Employee Summary');
  const empRows = (employeeSummary?.byCompany || []).map(r => [
    fmt(r.companyName) || '-', fmt(r.companyStatus) || '-', fmt(r.total), fmt(r.active), fmt(r.archived),
  ]);
  if (employeeSummary) {
    empRows.push([
      'TOTAL (All Companies)', '', fmt(employeeSummary.totalEmployees),
      fmt(employeeSummary.activeEmployees), fmt(employeeSummary.archivedEmployees),
    ]);
  }
  table(
    ['Company', 'Company Status', 'Total Employees', 'Active', 'Archived'],
    empRows,
    C_BLUE,
    { 0: { cellWidth: 60 } },
  );

  // ── Section 6: Subscription Summary ─────────────────────────────────────────
  heading('6. Subscription Summary');
  table(
    ['Plan Name', 'Monthly (Rs.)', 'Yearly (Rs.)', 'Employee Limit', 'HR Limit', 'Storage', 'Payroll', 'Documents', 'Branch Limit'],
    plans.map(p => [
      fmt(p.name),
      p.priceMonthly ? `Rs. ${Number(p.priceMonthly).toLocaleString('en-IN')}` : '-',
      p.priceYearly  ? `Rs. ${Number(p.priceYearly).toLocaleString('en-IN')}` : '-',
      fmt(p.employeeLimit), fmt(p.hrLimit), fmt(p.storageLimit),
      p.payrollAccess  ? 'Yes' : 'No', p.documentAccess ? 'Yes' : 'No', fmt(p.includedBranchLimit),
    ]),
    C_INDIGO,
  );

  // ── Footer on every page ────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages}  |  Confidential — Super Admin Only  |  ${stamp}`,
      PAGE_W / 2, PAGE_H - 6, { align: 'center' }
    );
  }

  triggerBlobDownload(doc.output('blob'), `Company_Report_${stamp}.pdf`);
};
