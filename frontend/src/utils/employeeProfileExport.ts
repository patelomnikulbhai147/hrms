// ─────────────────────────────────────────────────────────────────────────────
// employeeProfileExport — Print / Download-PDF for the full Employee Profile.
// Presentation only: reads the already-loaded employee object and renders it to
// a clean print window (Print) or a structured jsPDF document (Download PDF).
// No API calls, no data mutation, no business-logic — just formatting.
// ─────────────────────────────────────────────────────────────────────────────
import { formatDate } from '@/utils/formatDate';

type AnyEmp = Record<string, any>;

const val = (v: any) => (v === 0 ? '0' : v ? String(v) : '—');
const money = (v: any) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

// Ordered [section, [ [label, value] ]] — the single source of truth shared by
// both the print window and the PDF so they never drift.
function profileSections(e: AnyEmp, companyName: string): Array<[string, Array<[string, string]>]> {
  return [
    ['Employment', [
      ['Employee Code', val(e.employeeId)],
      ['Company', val(companyName)],
      ['Branch', val(e.branchLocation)],
      ['Department', val(e.department)],
      ['Designation', val(e.designation)],
      ['Employment Type', val(e.employmentType)],
      ['Employment Class', val(e.category)],
      ['Status', val(e.status)],
      ['Date of Joining', e.joinDate ? formatDate(e.joinDate) : '—'],
      ['Biometric Code', val(e.biometricId)],
    ]],
    ['Personal', [
      ['Full Name', val(e.name)],
      ['Date of Birth', e.dob ? formatDate(e.dob) : '—'],
      ['Gender', val(e.gender)],
      ['Marital Status', val(e.maritalStatus)],
      ['Nationality', val(e.nationality)],
      ['Father / Spouse', `${val(e.fatherSpouseName)}${e.relationType ? ` (${e.relationType})` : ''}`],
      ['Present Address', val(e.presentAddress)],
      ['Permanent Address', val(e.permanentAddress)],
    ]],
    ['Payroll & Bank', [
      ['Monthly Basic Salary', money(e.salary)],
      ['Bank Name', val(e.bankName)],
      ['Account Number', val(e.accountNumber)],
      ['IFSC Code', val(e.ifsc)],
      ['Account Holder', val(e.accountHolderName || e.name)],
    ]],
    ['Compliance IDs', [
      ['Aadhaar', val(e.aadhaar)],
      ['PAN', val(e.pan)],
      ['UAN', val(e.uan)],
      ['PF Number', val(e.pfNumber)],
      ['ESIC / IP Number', val(e.esic || e.esiNumber)],
    ]],
  ];
}

/** Print Profile — opens a clean print window (self-contained HTML). */
export function printEmployeeProfile(e: AnyEmp, companyName: string): void {
  const sections = profileSections(e, companyName);
  const esc = (s: string) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const rows = (pairs: Array<[string, string]>) =>
    pairs.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('');
  const blocks = sections.map(([title, pairs]) =>
    `<h2>${esc(title)}</h2><table class="grid">${rows(pairs)}</table>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(e.name || 'Employee')} — Profile</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:28px;font-size:12px}
      .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6d28d9;padding-bottom:10px;margin-bottom:14px}
      .hd h1{margin:0;font-size:20px} .hd p{margin:2px 0;color:#64748b;font-size:11px}
      .co{text-align:right;font-size:11px;color:#475569}
      h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6d28d9;margin:16px 0 6px}
      table.grid{width:100%;border-collapse:collapse} table.grid td{border:1px solid #e2e8f0;padding:5px 8px;vertical-align:top}
      td.k{width:32%;color:#64748b;font-size:11px} td.v{font-weight:600}
      @media print{body{margin:12mm}}
    </style></head><body>
    <div class="hd">
      <div><h1>${esc(e.name || '—')}</h1><p>${esc(val(e.designation))} · ${esc(val(e.department))} · ${esc(val(e.employeeId))}</p><p>Status: ${esc(val(e.status))}</p></div>
      <div class="co"><strong>${esc(companyName || 'Company')}</strong><br/>Employee Profile<br/>${formatDate(new Date().toISOString())}</div>
    </div>${blocks}
    <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

/** Download PDF — structured jsPDF document (no html2canvas, so it is immune to
 *  modern CSS color functions and always renders). */
export async function downloadEmployeeProfilePdf(e: AnyEmp, companyName: string): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(109, 40, 217); doc.rect(0, 0, pageW, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(String(e.name || 'Employee Profile'), 40, 30);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`${val(e.designation)} · ${val(e.department)} · ${val(e.employeeId)}`, 40, 46);
  doc.text(String(companyName || 'Company'), pageW - 40, 30, { align: 'right' });
  doc.text('Employee Profile', pageW - 40, 46, { align: 'right' });

  let y = 84;
  for (const [title, pairs] of profileSections(e, companyName)) {
    autoTable(doc, {
      startY: y,
      head: [[title, '']],
      body: pairs,
      theme: 'grid',
      headStyles: { fillColor: [237, 233, 254], textColor: [76, 29, 149], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4, textColor: [30, 41, 59] },
      columnStyles: { 0: { cellWidth: 160, textColor: [100, 116, 139] }, 1: { fontStyle: 'bold' } },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }
  doc.save(`${String(e.name || 'employee').replace(/\s+/g, '_')}_Profile.pdf`);
}
