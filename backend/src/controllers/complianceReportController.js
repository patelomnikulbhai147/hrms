/**
 * Reports engine — the single source for every HRMS report (payroll, attendance,
 * leave, employee, statutory compliance, PF, ESI, tax, gratuity & settlement and
 * bonus). Every report is generated LIVE from the database (no dummy data, no
 * uploaded static PDFs). The engine returns structured { meta, columns, rows,
 * summary, warnings }; the frontend renders the preview and exports PDF / Excel /
 * Print with the branded company header and a generated-on / generated-by footer.
 * All generate/download actions are audited. Company-scoped; Employee has no access.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

const companyScopeFor = (req) => [req.user?.companyId, ...(req.user?.accessibleCompanyIds || [])].filter(Boolean);
const isSuperAdmin = (req) => req.user?.role === 'Super Admin';
const canAccess = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const PF_WAGE_CEILING = 15000, ESI_GROSS_CEILING = 21000, ESI_EMP_RATE = 0.75;
const EPS_RATE = 8.33, EPF_ER_DIFF = 3.67, EDLI_RATE = 0.5, PF_ADMIN_RATE = 0.5;

// ── Scope + company meta ─────────────────────────────────────────────────────
function resolveScope(req) {
  const b = req.body || {};
  const reqCompany = idParam(b.companyId || req.headers['x-workspace-id']);
  let companyIds, primaryCompanyId;
  if (isSuperAdmin(req)) { companyIds = reqCompany ? [reqCompany] : []; primaryCompanyId = reqCompany; }
  else { const scope = companyScopeFor(req); companyIds = (reqCompany && scope.includes(reqCompany)) ? [reqCompany] : scope; primaryCompanyId = reqCompany || companyIds[0]; }
  const startDate = b.startDate || null, endDate = b.endDate || null;
  const year = startDate && /^\d{4}/.test(startDate) ? parseInt(startDate.slice(0, 4), 10) : null;
  return { companyIds, primaryCompanyId, branch: b.branch || null, department: b.department || null, startDate, endDate, year, employeeId: idParam(b.employeeId) || null };
}

async function companyMeta(companyId) {
  if (!companyId) return null;
  const c = await prisma.company.findUnique({ where: { id: companyId } });
  if (!c) return null;
  let brandSrc = c;
  if (c.parentCompanyId) { const p = await prisma.company.findUnique({ where: { id: c.parentCompanyId } }); if (p) brandSrc = { ...p, ...c, logoImage: c.logoImage || p.logoImage, primaryColor: c.primaryColor || p.primaryColor }; }
  const addr = [c.address || c.billingAddress, c.city, c.state, c.pincode].filter(Boolean).join(', ');
  return {
    name: c.name, address: addr, gstNumber: c.gstNumber || null, panNumber: c.panNumber || null, cinNumber: c.cinNumber || null,
    logoImage: c.logoImage || brandSrc.logoImage || null, primaryColor: c.primaryColor || brandSrc.primaryColor || '#4F46E5',
    signatureText: c.signatureText || null,
    rates: { pfRate: c.pfRate ?? 12, esicRate: c.esicRate ?? 3.25, profTaxRate: c.profTaxRate ?? 200 },
  };
}

const empWhere = (s) => { const w = { companyId: { in: s.companyIds } }; if (s.department) w.department = s.department; if (s.branch) w.branchLocation = s.branch; if (s.employeeId) w.id = s.employeeId; return w; };
const dateWhere = (s) => (s.startDate && s.endDate) ? { date: { gte: s.startDate, lte: s.endDate } } : {};
const payrollWhere = (s) => { const w = { companyId: { in: s.companyIds } }; if (s.department) w.department = s.department; if (s.employeeId) w.employeeId = s.employeeId; if (s.year) w.year = s.year; return w; };

const empCols = (extra = []) => [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department' }, ...extra];

// ── Small shared helpers ─────────────────────────────────────────────────────
const grossOf = (p) => (p.basicSalary || 0) + (p.allowances || 0);
const scopedEmps = (s) => prisma.employee.findMany({ where: empWhere(s), orderBy: { employeeId: 'asc' } });
const fmtDate = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-IN'); } catch { return String(d); } };
const monthOf = (d) => { if (!d) return null; const dt = new Date(d); return isNaN(dt) ? null : dt.getMonth(); };
function yearsBetween(start, end) { if (!start) return 0; const s = new Date(start), e = end ? new Date(end) : new Date(); return (e - s) / (1000 * 60 * 60 * 24 * 365.25); }
async function lastBasicMap(s) { const pay = await prisma.payroll.findMany({ where: { companyId: { in: s.companyIds } }, orderBy: { year: 'desc' } }); const m = new Map(); for (const p of pay) if (!m.has(p.employeeId)) m.set(p.employeeId, p.basicSalary); return m; }

// ── Report registry ──────────────────────────────────────────────────────────
// Each entry: { label, category, available, generate(scope, ctx) }.
// Categories are the 10 master groups shown under the single Reports menu.
const REPORTS = {
  // ════════════════ 1) Payroll Reports ════════════════
  salary_register: { label: 'Salary Register', category: 'Payroll Reports', available: true, generate: (s) => salaryReg(s) },
  salary_slip: { label: 'Salary Slip', category: 'Payroll Reports', available: true, generate: (s) => salarySlip(s) },
  payroll_summary: { label: 'Payroll Summary', category: 'Payroll Reports', available: true, generate: (s) => payrollSummary(s) },
  bank_transfer: { label: 'Bank Transfer Report', category: 'Payroll Reports', available: true, generate: (s) => bankTransfer(s) },
  loan_report: { label: 'Loan Report', category: 'Payroll Reports', available: true, generate: () => noSource('Loan disbursement') },
  advance_report: { label: 'Advance Report', category: 'Payroll Reports', available: true, generate: () => noSource('Salary advance') },
  ctc_report: { label: 'CTC Report', category: 'Payroll Reports', available: true, generate: (s) => ctcReport(s) },
  increment_report: { label: 'Increment Report', category: 'Payroll Reports', available: true, generate: (s) => incrementReport(s) },

  // ════════════════ 2) Attendance Reports ════════════════
  daily_attendance: { label: 'Daily Attendance', category: 'Attendance Reports', available: true, generate: (s) => dailyAttendance(s) },
  monthly_attendance: { label: 'Monthly Attendance', category: 'Attendance Reports', available: true, generate: (s) => monthlyAttendance(s) },
  muster_roll: { label: 'Muster Roll', category: 'Attendance Reports', available: true, generate: (s) => musterRoll(s) },
  overtime_register: { label: 'Overtime Register', category: 'Attendance Reports', available: true, generate: (s) => overtimeRegister(s) },
  shift_report: { label: 'Shift Report', category: 'Attendance Reports', available: true, generate: (s) => shiftReport(s) },
  late_coming: { label: 'Late Coming Report', category: 'Attendance Reports', available: true, generate: (s) => lateComing(s) },
  attendance_summary: { label: 'Attendance Summary', category: 'Attendance Reports', available: true, generate: (s) => attendanceSummaryReport(s) },

  // ════════════════ 3) Leave Reports ════════════════
  leave_register: { label: 'Leave Register', category: 'Leave Reports', available: true, generate: (s) => leaveRegister(s) },
  leave_balance: { label: 'Leave Balance Report', category: 'Leave Reports', available: true, generate: (s) => leaveBalance(s) },
  leave_summary: { label: 'Leave Summary', category: 'Leave Reports', available: true, generate: (s) => leaveSummary(s) },
  leave_encashment: { label: 'Leave Encashment Report', category: 'Leave Reports', available: true, generate: (s) => leaveEncashment(s) },

  // ════════════════ 4) Employee Reports ════════════════
  employee_master: { label: 'Employee Master Report', category: 'Employee Reports', available: true, generate: (s) => employeeMaster(s) },
  department_report: { label: 'Department Report', category: 'Employee Reports', available: true, generate: (s) => groupReport(s, 'department', 'Department') },
  designation_report: { label: 'Designation Report', category: 'Employee Reports', available: true, generate: (s) => groupReport(s, 'designation', 'Designation') },
  branch_report: { label: 'Branch Report', category: 'Employee Reports', available: true, generate: (s) => groupReport(s, 'branchLocation', 'Branch') },
  employee_joining: { label: 'Employee Joining Report', category: 'Employee Reports', available: true, generate: (s) => joiningReport(s) },
  employee_exit: { label: 'Employee Exit Report', category: 'Employee Reports', available: true, generate: (s) => exitReport(s) },
  employee_birthday: { label: 'Employee Birthday Report', category: 'Employee Reports', available: true, generate: (s) => birthdayReport(s) },
  employee_anniversary: { label: 'Employee Anniversary Report', category: 'Employee Reports', available: true, generate: (s) => anniversaryReport(s) },

  // ════════════════ 5) Compliance Reports (statutory) ════════════════
  // Statutory registers. Several are the same live data rendered in the legally
  // mandated register format, so they intentionally reuse the source generators
  // (e.g. Salary/Wage Register → salaryReg). They are grouped here so an auditor
  // finds every statutory document in one place.
  comp_salary_register: { label: 'Salary Register (Statutory Format)', category: 'Compliance Reports', available: true, generate: (s) => salaryReg(s) },
  comp_muster_roll: { label: 'Muster Roll', category: 'Compliance Reports', available: true, generate: (s) => musterRoll(s) },
  attendance_register: { label: 'Attendance Register', category: 'Compliance Reports', available: true, generate: (s) => attendanceRegister(s) },
  wage_register: { label: 'Wage Register', category: 'Compliance Reports', available: true, generate: (s) => salaryReg(s) },
  comp_leave_register: { label: 'Leave Register', category: 'Compliance Reports', available: true, generate: (s) => leaveRegister(s) },
  employee_register: { label: 'Employee Register', category: 'Compliance Reports', available: true, generate: (s) => employeeMaster(s) },
  bonus_register_form_c: { label: 'Bonus Register — Form C', category: 'Compliance Reports', available: true, generate: (s) => bonusFormC(s) },
  bonus_register_form_d: { label: 'Bonus Register — Form D', category: 'Compliance Reports', available: true, generate: (s) => bonusFormD(s) },
  comp_overtime_register: { label: 'Overtime Register', category: 'Compliance Reports', available: true, generate: (s) => overtimeRegister(s) },
  comp_professional_tax: { label: 'Professional Tax Report', category: 'Compliance Reports', available: true, generate: (s, ctx) => ptReport(s, ctx) },
  form_a: { label: 'Form A — Register of Fines', category: 'Compliance Reports', available: true, generate: (s) => nilRegister(s, 'Fine') },
  form_b: { label: 'Form B — Register of Deductions for Damage/Loss', category: 'Compliance Reports', available: true, generate: (s) => nilRegister(s, 'Deduction') },
  form_c: { label: 'Form C — Register of Advances', category: 'Compliance Reports', available: true, generate: (s) => nilRegister(s, 'Advance') },
  form_d: { label: 'Form D — Annual Return (Wages)', category: 'Compliance Reports', available: true, generate: (s) => annualWageReturn(s) },

  // ════════════════ 6) PF Reports ════════════════
  pf_register: { label: 'PF Register', category: 'PF Reports', available: true, generate: (s, ctx) => pfReport(s, ctx) },
  pf_summary: { label: 'PF Summary', category: 'PF Reports', available: true, generate: (s, ctx) => monthly(s, ctx, 'pf') },
  pf_challan: { label: 'PF Challan', category: 'PF Reports', available: true, generate: (s) => pfChallan(s) },
  pf_form_3a: { label: 'PF Form 3A', category: 'PF Reports', available: true, generate: (s) => pfForm3A(s) },
  pf_form_6a: { label: 'PF Form 6A', category: 'PF Reports', available: true, generate: (s) => pfForm6A(s) },
  pf_form_11: { label: 'PF Form 11', category: 'PF Reports', available: true, generate: (s) => pfForm11(s) },
  pf_form_19: { label: 'PF Form 19', category: 'PF Reports', available: true, generate: (s) => pfExitForm(s, '19') },
  pf_form_10c: { label: 'PF Form 10C', category: 'PF Reports', available: true, generate: (s) => pfExitForm(s, '10C') },
  ecr_file: { label: 'ECR File Generator', category: 'PF Reports', available: true, generate: (s) => ecrFile(s) },
  kyc_export: { label: 'KYC Export File', category: 'PF Reports', available: true, generate: (s) => kycExport(s) },

  // ════════════════ 7) ESI Reports ════════════════
  esi_register: { label: 'ESI Register', category: 'ESI Reports', available: true, generate: (s, ctx) => esiReport(s, ctx) },
  esi_summary: { label: 'ESI Summary', category: 'ESI Reports', available: true, generate: (s, ctx) => monthly(s, ctx, 'esi') },
  esi_challan: { label: 'ESI Challan', category: 'ESI Reports', available: true, generate: (s, ctx) => esiChallan(s, ctx) },
  esi_inspection: { label: 'ESI Inspection Report', category: 'ESI Reports', available: true, generate: (s, ctx) => esiReport(s, ctx) },
  esi_coverage: { label: 'ESI Coverage Report', category: 'ESI Reports', available: true, generate: (s) => esiCoverage(s) },

  // ════════════════ 8) Tax Reports ════════════════
  form16: { label: 'Form 16', category: 'Tax Reports', available: true, generate: (s) => form16(s) },
  tds_report: { label: 'TDS Report', category: 'Tax Reports', available: true, generate: (s) => tdsReport(s) },
  employee_tax_summary: { label: 'Employee Tax Summary', category: 'Tax Reports', available: true, generate: (s) => employeeTaxSummary(s) },
  professional_tax_summary: { label: 'Professional Tax Summary', category: 'Tax Reports', available: true, generate: (s, ctx) => ptReport(s, ctx) },

  // ════════════════ 9) Gratuity & Settlement ════════════════
  gratuity_report: { label: 'Gratuity Report', category: 'Gratuity & Settlement', available: true, generate: (s) => gratuityReport(s) },
  fnf_settlement: { label: 'Full & Final Settlement', category: 'Gratuity & Settlement', available: true, generate: (s) => fnfSettlement(s) },
  exit_settlement: { label: 'Exit Settlement Report', category: 'Gratuity & Settlement', available: true, generate: (s) => exitReport(s) },

  // ════════════════ 10) Bonus Reports ════════════════
  bonus_register: { label: 'Bonus Register', category: 'Bonus Reports', available: true, generate: (s) => bonusReport(s, false) },
  bonus_summary: { label: 'Bonus Summary', category: 'Bonus Reports', available: true, generate: (s) => bonusSummary(s) },
  bonus_payment: { label: 'Bonus Payment Report', category: 'Bonus Reports', available: true, generate: (s) => bonusReport(s, true) },

  // ════════════════ Restored: Payroll Reports (variants) ════════════════
  salary_slip_tds: { label: 'Salary Slip (TDS)', category: 'Payroll Reports', available: true, generate: (s) => salarySlipTds(s) },
  payment_report: { label: 'Payment Report', category: 'Payroll Reports', available: true, generate: (s) => paymentReport(s) },
  salary_certificate: { label: 'Salary Certificate', category: 'Payroll Reports', available: true, generate: (s) => salaryCertificate(s) },
  emp_monthly_salary: { label: 'Employee Monthly Salary Summary', category: 'Payroll Reports', available: true, generate: (s) => empMonthlySalary(s) },
  emp_annual_salary: { label: 'Employee Annual Salary Summary', category: 'Payroll Reports', available: true, generate: (s) => empAnnualSalary(s) },
  company_annual_salary: { label: 'Company Annual Salary Summary', category: 'Payroll Reports', available: true, generate: (s) => companyAnnualSalary(s) },
  division_summary: { label: 'Division Summary', category: 'Payroll Reports', available: true, generate: (s) => payrollSummary(s) },

  // ════════════════ Restored: Attendance Reports ════════════════
  weekly_attendance: { label: 'Weekly Attendance', category: 'Attendance Reports', available: true, generate: (s) => weeklyAttendance(s) },
  missing_punch: { label: 'Missing Punch Report', category: 'Attendance Reports', available: true, generate: (s) => missingPunch(s) },
  early_exit: { label: 'Early Exit Report', category: 'Attendance Reports', available: true, generate: (s) => earlyExit(s) },
  overtime_summary: { label: 'Overtime Summary Report', category: 'Attendance Reports', available: true, generate: (s) => overtimeSummary(s) },

  // ════════════════ Restored: Leave Reports ════════════════
  leave_application: { label: 'Leave Application Report', category: 'Leave Reports', available: true, generate: (s) => leaveRegister(s) },

  // ════════════════ Restored: Employee Reports ════════════════
  employee_info_form: { label: 'Employee Information Form', category: 'Employee Reports', available: true, generate: (s) => employeeInfoForm(s) },
  employee_directory: { label: 'Employee Directory', category: 'Employee Reports', available: true, generate: (s) => employeeDirectory(s) },
  attrition_report: { label: 'Monthly Attrition Report', category: 'Employee Reports', available: true, generate: (s) => attritionReport(s) },
  age_wise: { label: 'Age Wise Report', category: 'Employee Reports', available: true, generate: (s) => ageWise(s) },
  left_join_report: { label: 'Left & Joined Report', category: 'Employee Reports', available: true, generate: (s) => leftJoinReport(s) },
  service_certificate: { label: 'Service Certificate Report', category: 'Employee Reports', available: true, generate: (s) => serviceCertificate(s) },
  identity_card_register: { label: 'Identity Card Register', category: 'Employee Reports', available: true, generate: (s) => identityCardRegister(s) },
  employee_kyc: { label: 'Employee KYC Report', category: 'Employee Reports', available: true, generate: (s) => kycExport(s) },

  // ════════════════ NEW: Document Reports ════════════════
  document_register: { label: 'Uploaded Documents Register', category: 'Document Reports', available: true, generate: (s) => documentRegister(s) },
  doc_aadhaar: { label: 'Aadhaar Report', category: 'Document Reports', available: true, generate: (s) => identityFieldReport(s, 'aadhaar', 'Aadhaar') },
  doc_pan: { label: 'PAN Report', category: 'Document Reports', available: true, generate: (s) => identityFieldReport(s, 'pan', 'PAN') },
  doc_passport: { label: 'Passport Report', category: 'Document Reports', available: true, generate: (s) => docTypeReport(s, ['passport'], 'Passport') },
  doc_dl: { label: 'Driving License Report', category: 'Document Reports', available: true, generate: (s) => docTypeReport(s, ['driving', 'licen', 'dl'], 'Driving License') },
  doc_bank: { label: 'Bank Document Report', category: 'Document Reports', available: true, generate: (s) => bankDocumentReport(s) },
  doc_education: { label: 'Education Document Report', category: 'Document Reports', available: true, generate: (s) => docTypeReport(s, ['education', 'degree', 'marksheet', 'qualification'], 'Education') },
  doc_experience: { label: 'Experience Document Report', category: 'Document Reports', available: true, generate: (s) => docTypeReport(s, ['experience', 'relieving', 'service'], 'Experience') },
  doc_contract: { label: 'Contract Document Report', category: 'Document Reports', available: true, generate: (s) => docTypeReport(s, ['contract', 'agreement', 'offer', 'appointment'], 'Contract') },
  doc_pending: { label: 'Employee Pending Documents Report', category: 'Document Reports', available: true, generate: (s) => pendingDocuments(s) },
  doc_status: { label: 'Employee Document Status Report', category: 'Document Reports', available: true, generate: (s) => documentStatus(s) },

  // ════════════════ Restored: PF Reports ════════════════
  pf_form_5: { label: 'PF Form 5 (New Joiners)', category: 'PF Reports', available: true, generate: (s) => pfMovementForm(s, '5') },
  pf_form_10: { label: 'PF Form 10 (Exits)', category: 'PF Reports', available: true, generate: (s) => pfMovementForm(s, '10') },
  pf_form_9: { label: 'PF Form 9 (Eligibility Register)', category: 'PF Reports', available: true, generate: (s) => pfForm9(s) },
  pf_number_report: { label: 'PF Number Report', category: 'PF Reports', available: true, generate: (s) => pfNumberReport(s) },
  employee_pf_summary: { label: 'Employee PF Summary', category: 'PF Reports', available: true, generate: (s, ctx) => pfReport(s, ctx) },
  pf_inspection: { label: 'PF Inspection Report', category: 'PF Reports', available: true, generate: (s, ctx) => pfReport(s, ctx) },

  // ════════════════ Restored: ESI Reports ════════════════
  employee_esi_summary: { label: 'Employee ESI Summary', category: 'ESI Reports', available: true, generate: (s, ctx) => esiReport(s, ctx) },
  esi_number_report: { label: 'ESI Number Report', category: 'ESI Reports', available: true, generate: (s) => esiNumberReport(s) },

  // ════════════════ Restored: Tax Reports ════════════════
  pt_challan: { label: 'PT Challan', category: 'Tax Reports', available: true, generate: (s, ctx) => monthly(s, ctx, 'pt') },
  it_declaration: { label: 'IT Declaration Form', category: 'Tax Reports', available: true, generate: (s) => itDeclaration(s) },
  tax_deduction: { label: 'Tax Deduction Report', category: 'Tax Reports', available: true, generate: (s) => tdsReport(s) },

  // ════════════════ Restored: Gratuity & Settlement ════════════════
  gratuity_register: { label: 'Gratuity Register', category: 'Gratuity & Settlement', available: true, generate: (s) => gratuityReport(s) },
  gratuity_statement: { label: 'Gratuity Statement', category: 'Gratuity & Settlement', available: true, generate: (s) => gratuityReport(s) },

  // ════════════════ NEW: Statutory Registers (Factory Act / Labour) ════════════════
  form_15_wages: { label: 'Form 15-II — Wages Register', category: 'Statutory Registers', available: true, generate: (s) => salaryReg(s) },
  form_13_workmen: { label: 'Form 13 — Register of Workmen', category: 'Statutory Registers', available: true, generate: (s) => registerOfWorkmen(s) },
  employment_card: { label: 'Employment Card (Form XIV)', category: 'Statutory Registers', available: true, generate: (s) => employmentCard(s) },
  form_28_muster: { label: 'Form 28 — Muster Roll', category: 'Statutory Registers', available: true, generate: (s) => musterRoll(s) },
  accident_register: { label: 'Accident Register (Form 21)', category: 'Statutory Registers', available: true, generate: (s) => nilEventRegister(s, 'Accident') },
  health_register: { label: 'Form 20/32 — Health Register', category: 'Statutory Registers', available: true, generate: (s) => nilEventRegister(s, 'Health examination') },
  comp_leave_register_factory: { label: 'Compensatory Leave Register', category: 'Statutory Registers', available: true, generate: (s) => leaveRegister(s) },
  form_xx_damages: { label: 'Form XX — Loss & Damages Register', category: 'Statutory Registers', available: true, generate: (s) => nilRegister(s, 'Damage/Loss') },
};

// ── Generic helpers used by several reports ──────────────────────────────────
function noSource(label) {
  return { columns: [{ key: 'info', label: 'Info' }], rows: [], warnings: [`${label} records are not captured by the HRMS yet, so there is no data to report. This report will populate automatically once the module is in use.`] };
}
// A statutory "nil" register — lists scoped employees with a zero entry column,
// which is the legally-required format when no fines/deductions/advances exist.
async function nilRegister(s, kind) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, designation: e.designation, amount: 0, remarks: 'NIL' }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'designation', label: 'Designation' }, { key: 'amount', label: `${kind} Amount` }, { key: 'remarks', label: 'Remarks' }], rows, warnings: [`${kind} register generated in statutory format. No ${kind.toLowerCase()} entries recorded — shown as NIL against each employee.`] };
}

// ── Payroll generators ───────────────────────────────────────────────────────
async function salaryReg(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const rows = pay.map((p, i) => ({ sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, month: `${p.month} ${p.year}`, basic: r2(p.basicSalary), allowances: r2(p.allowances), deductions: r2(p.deductions), bonus: r2(p.bonus || 0), tax: r2(p.tax || 0), net: r2(p.netSalary), payableDays: p.payableDays }));
  const summary = { employees: pay.length, basic: r2(pay.reduce((t, p) => t + p.basicSalary, 0)), net: r2(pay.reduce((t, p) => t + p.netSalary, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'month', label: 'Period' }, { key: 'basic', label: 'Basic' }, { key: 'allowances', label: 'Allowances' }, { key: 'deductions', label: 'Deductions' }, { key: 'net', label: 'Net Pay' }], rows, summary };
}
async function salarySlip(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const rows = pay.map((p, i) => ({ sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, period: `${p.month} ${p.year}`, payableDays: p.payableDays, basic: r2(p.basicSalary), allowances: r2(p.allowances), bonus: r2(p.bonus || 0), deductions: r2(p.deductions), tax: r2(p.tax || 0), net: r2(p.netSalary), status: p.paymentStatus }));
  const summary = { slips: rows.length, net: r2(rows.reduce((t, r) => t + r.net, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'period', label: 'Period' }, { key: 'payableDays', label: 'Pay Days' }, { key: 'basic', label: 'Basic' }, { key: 'allowances', label: 'Allowances' }, { key: 'deductions', label: 'Deductions' }, { key: 'tax', label: 'Tax' }, { key: 'net', label: 'Net Pay' }, { key: 'status', label: 'Status' }], rows, summary, warnings: ['One row per generated payslip. Use the per-employee filter for a single slip.'] };
}
async function payrollSummary(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  const m = new Map();
  for (const p of pay) { const k = p.department || 'General'; if (!m.has(k)) m.set(k, { department: k, employees: 0, basic: 0, allowances: 0, deductions: 0, net: 0 }); const r = m.get(k); r.employees++; r.basic += p.basicSalary; r.allowances += p.allowances; r.deductions += p.deductions; r.net += p.netSalary; }
  const rows = [...m.values()].map((r, i) => ({ sr: i + 1, department: r.department, employees: r.employees, basic: r2(r.basic), allowances: r2(r.allowances), deductions: r2(r.deductions), net: r2(r.net) }));
  const summary = { employees: pay.length, net: r2(pay.reduce((t, p) => t + p.netSalary, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'department', label: 'Department' }, { key: 'employees', label: 'Employees' }, { key: 'basic', label: 'Basic' }, { key: 'allowances', label: 'Allowances' }, { key: 'deductions', label: 'Deductions' }, { key: 'net', label: 'Net Pay' }], rows, summary };
}
async function bankTransfer(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const rows = pay.map((p, i) => { const e = em.get(p.employeeId) || {}; return { sr: i + 1, code: e.employeeId || p.employeeId, name: p.employeeName, bank: e.bankName || '', account: e.accountNumber || '', ifsc: e.ifsc || '', amount: r2(p.netSalary) }; });
  const missing = rows.filter(r => !r.account || !r.ifsc).length;
  const summary = { transfers: rows.length, amount: r2(rows.reduce((t, r) => t + r.amount, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'bank', label: 'Bank' }, { key: 'account', label: 'Account No' }, { key: 'ifsc', label: 'IFSC' }, { key: 'amount', label: 'Amount (₹)' }], rows, summary, warnings: missing ? [`${missing} employee(s) missing bank account / IFSC — they cannot be included in the bank file.`] : [] };
}
async function ctcReport(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => { const monthly = e.salary || 0; const basic = monthly * 0.5; const hra = monthly * 0.2; const other = monthly - basic - hra; return { sr: i + 1, code: e.employeeId, name: e.name, department: e.department, designation: e.designation, basic: r2(basic), hra: r2(hra), other: r2(other), monthly: r2(monthly), annual: r2(monthly * 12) }; });
  const summary = { employees: rows.length, annual: r2(rows.reduce((t, r) => t + r.annual, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'designation', label: 'Designation' }, { key: 'basic', label: 'Basic' }, { key: 'hra', label: 'HRA' }, { key: 'other', label: 'Other' }, { key: 'monthly', label: 'Monthly CTC' }, { key: 'annual', label: 'Annual CTC' }], rows, summary, warnings: ['CTC split (Basic 50% / HRA 20% / Other 30%) is indicative, derived from the employee gross.'] };
}
async function incrementReport(s) {
  const emps = await scopedEmps(s);
  const rows = []; let sr = 1;
  for (const e of emps) {
    let hist = e.employmentHistory;
    if (typeof hist === 'string') { try { hist = JSON.parse(hist); } catch { hist = null; } }
    if (!Array.isArray(hist)) continue;
    for (const h of hist) {
      const newSal = h.newSalary ?? h.salary ?? h.revisedSalary;
      const oldSal = h.oldSalary ?? h.previousSalary;
      if (newSal == null) continue;
      const diff = oldSal != null ? newSal - oldSal : null;
      rows.push({ sr: sr++, code: e.employeeId, name: e.name, department: e.department, effective: fmtDate(h.effectiveDate || h.date), oldSalary: oldSal != null ? r2(oldSal) : '', newSalary: r2(newSal), increment: diff != null ? r2(diff) : '', percent: (diff != null && oldSal) ? r2((diff / oldSal) * 100) : '' });
    }
  }
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'effective', label: 'Effective' }, { key: 'oldSalary', label: 'Old Salary' }, { key: 'newSalary', label: 'New Salary' }, { key: 'increment', label: 'Increment' }, { key: 'percent', label: '%' }], rows, warnings: rows.length ? [] : ['No recorded salary revisions found in employment history for the selected scope.'] };
}

// ── Attendance generators ────────────────────────────────────────────────────
async function dailyAttendance(s) {
  const att = await prisma.attendance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) }, orderBy: [{ date: 'asc' }] });
  const rows = att.map((a, i) => ({ sr: i + 1, date: a.date, name: a.employeeName, department: a.department, status: a.status, clockIn: a.clockIn, clockOut: a.clockOut, hours: a.hoursWorked }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'date', label: 'Date' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'status', label: 'Status' }, { key: 'clockIn', label: 'In' }, { key: 'clockOut', label: 'Out' }, { key: 'hours', label: 'Hours' }], rows };
}
async function monthlyAttendance(s) {
  const sum = await prisma.attendanceSummary.findMany({ where: { companyId: { in: s.companyIds }, ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...(s.year ? { year: s.year } : {}) } });
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const rows = sum.filter(r => !s.department || em.get(r.employeeId)?.department === s.department).map((r, i) => { const e = em.get(r.employeeId) || {}; return { sr: i + 1, code: e.employeeId || '', name: e.name || '', department: e.department || '', period: `${r.month} ${r.year}`, present: r.presentDays, absent: r.absentDays, leave: r2((r.cl || 0) + (r.pl || 0) + (r.sl || 0)), lwp: r.lwp, half: r.halfDays, ot: r.otHours, payable: r.payableDays }; });
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'period', label: 'Period' }, { key: 'present', label: 'Present' }, { key: 'absent', label: 'Absent' }, { key: 'leave', label: 'Leave' }, { key: 'lwp', label: 'LWP' }, { key: 'half', label: 'Half' }, { key: 'ot', label: 'OT Hrs' }, { key: 'payable', label: 'Payable' }], rows };
}
async function musterRoll(s) {
  const att = await prisma.attendance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) } });
  const m = new Map();
  for (const a of att) { const k = a.employeeId; if (!m.has(k)) m.set(k, { name: a.employeeName, department: a.department, present: 0, absent: 0, leave: 0, half: 0, total: 0, hours: 0 }); const r = m.get(k); r.total++; r.hours += a.hoursWorked || 0; const st = (a.status || '').toLowerCase(); if (st.includes('present')) r.present++; else if (st.includes('absent')) r.absent++; else if (st.includes('half')) r.half++; else if (st.includes('leave')) r.leave++; }
  const rows = [...m.values()].map((r, i) => ({ sr: i + 1, name: r.name, department: r.department, present: r.present, absent: r.absent, leave: r.leave, half: r.half, total: r.total, hours: r2(r.hours) }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'present', label: 'Present' }, { key: 'absent', label: 'Absent' }, { key: 'leave', label: 'Leave' }, { key: 'half', label: 'Half' }, { key: 'total', label: 'Days' }, { key: 'hours', label: 'Hours' }], rows };
}
async function overtimeRegister(s) {
  const ot = await prisma.overtime.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) }, orderBy: { date: 'desc' } });
  const rows = ot.map((o, i) => ({ sr: i + 1, name: o.employeeName, department: o.department || '', date: o.date, inTime: o.inTime, outTime: o.outTime, otHours: o.otHours, type: o.type, status: o.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'date', label: 'Date' }, { key: 'inTime', label: 'In' }, { key: 'outTime', label: 'Out' }, { key: 'otHours', label: 'OT Hrs' }, { key: 'type', label: 'Type' }, { key: 'status', label: 'Status' }], rows };
}
async function shiftReport(s) {
  const emps = await prisma.employee.findMany({ where: empWhere(s), orderBy: { employeeId: 'asc' }, include: { shift: true } });
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, shift: e.shift?.name || 'Unassigned', timing: e.shift ? `${e.shift.startTime || ''} - ${e.shift.endTime || ''}` : '' }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'shift', label: 'Shift' }, { key: 'timing', label: 'Timing' }], rows };
}
async function lateComing(s) {
  const att = await prisma.attendance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) }, orderBy: [{ date: 'asc' }] });
  const isLate = (a) => { const st = (a.status || '').toLowerCase(); if (st.includes('late')) return true; const ci = a.clockIn; return ci && /^\d{2}:\d{2}/.test(ci) && ci.slice(0, 5) > '09:30'; };
  const rows = att.filter(isLate).map((a, i) => ({ sr: i + 1, date: a.date, name: a.employeeName, department: a.department, clockIn: a.clockIn, status: a.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'date', label: 'Date' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'clockIn', label: 'Clock In' }, { key: 'status', label: 'Status' }], rows, warnings: ['Late = status marked late, or clock-in after 09:30.'] };
}
async function attendanceSummaryReport(s) {
  const sum = await prisma.attendanceSummary.findMany({ where: { companyId: { in: s.companyIds }, ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...(s.year ? { year: s.year } : {}) } });
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const m = new Map();
  for (const r of sum) { const e = em.get(r.employeeId); if (!e) continue; if (s.department && e.department !== s.department) continue; if (!m.has(r.employeeId)) m.set(r.employeeId, { code: e.employeeId, name: e.name, department: e.department, present: 0, absent: 0, leave: 0, lwp: 0, half: 0, ot: 0, payable: 0 }); const a = m.get(r.employeeId); a.present += r.presentDays; a.absent += r.absentDays; a.leave += (r.cl || 0) + (r.pl || 0) + (r.sl || 0); a.lwp += r.lwp; a.half += r.halfDays; a.ot += r.otHours; a.payable += r.payableDays; }
  const rows = [...m.values()].map((a, i) => ({ sr: i + 1, code: a.code, name: a.name, department: a.department, present: r2(a.present), absent: r2(a.absent), leave: r2(a.leave), lwp: r2(a.lwp), half: r2(a.half), ot: r2(a.ot), payable: r2(a.payable) }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'present', label: 'Present' }, { key: 'absent', label: 'Absent' }, { key: 'leave', label: 'Leave' }, { key: 'lwp', label: 'LWP' }, { key: 'half', label: 'Half' }, { key: 'ot', label: 'OT Hrs' }, { key: 'payable', label: 'Payable' }], rows };
}
async function attendanceRegister(s) {
  const att = await prisma.attendance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) }, orderBy: [{ date: 'asc' }] });
  const rows = att.map((a, i) => ({ sr: i + 1, date: a.date, name: a.employeeName, department: a.department, status: a.status, clockIn: a.clockIn, clockOut: a.clockOut, hours: a.hoursWorked }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'date', label: 'Date' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'status', label: 'Status' }, { key: 'clockIn', label: 'In' }, { key: 'clockOut', label: 'Out' }, { key: 'hours', label: 'Hours' }], rows };
}

// ── Leave generators ─────────────────────────────────────────────────────────
async function leaveRegister(s) {
  const lv = await prisma.leaveRequest.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}) }, orderBy: { fromDate: 'desc' } });
  const rows = lv.map((l, i) => ({ sr: i + 1, name: l.employeeName, department: l.department, type: l.leaveType, from: l.fromDate, to: l.toDate, days: l.days, paid: l.paidDays, lwp: l.lwpDays, status: l.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'type', label: 'Type' }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'days', label: 'Days' }, { key: 'paid', label: 'Paid' }, { key: 'lwp', label: 'LWP' }, { key: 'status', label: 'Status' }], rows };
}
async function leaveBalance(s) {
  const bal = await prisma.leaveBalance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...(s.year ? { year: s.year } : {}) } });
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const rows = bal.filter(b => { const e = em.get(b.employeeId); return e && (!s.department || e.department === s.department); }).map((b, i) => { const e = em.get(b.employeeId); return { sr: i + 1, code: e.employeeId, name: e.name, department: e.department, cl: b.clBalance, pl: b.plBalance, sl: b.slBalance, clUsed: b.clUsed, plUsed: b.plUsed, slUsed: b.slUsed, carryForward: b.carryForward }; });
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'cl', label: 'CL Bal' }, { key: 'pl', label: 'PL Bal' }, { key: 'sl', label: 'SL Bal' }, { key: 'clUsed', label: 'CL Used' }, { key: 'plUsed', label: 'PL Used' }, { key: 'slUsed', label: 'SL Used' }, { key: 'carryForward', label: 'C/F' }], rows };
}
async function leaveSummary(s) {
  const lv = await prisma.leaveRequest.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}) } });
  const m = new Map();
  for (const l of lv) { const k = l.employeeId; if (!m.has(k)) m.set(k, { name: l.employeeName, department: l.department, cl: 0, pl: 0, sl: 0, other: 0, total: 0, lwp: 0 }); const r = m.get(k); const t = (l.leaveType || '').toUpperCase(); if (t.includes('CL') || t.includes('CASUAL')) r.cl += l.days; else if (t.includes('PL') || t.includes('PRIVILEGE') || t.includes('EARNED')) r.pl += l.days; else if (t.includes('SL') || t.includes('SICK')) r.sl += l.days; else r.other += l.days; r.total += l.days; r.lwp += l.lwpDays || 0; }
  const rows = [...m.values()].map((r, i) => ({ sr: i + 1, name: r.name, department: r.department, cl: r2(r.cl), pl: r2(r.pl), sl: r2(r.sl), other: r2(r.other), total: r2(r.total), lwp: r2(r.lwp) }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'cl', label: 'CL' }, { key: 'pl', label: 'PL' }, { key: 'sl', label: 'SL' }, { key: 'other', label: 'Other' }, { key: 'total', label: 'Total' }, { key: 'lwp', label: 'LWP' }], rows };
}
async function leaveEncashment(s) {
  const cfg = await prisma.leaveCreditConfig.findFirst({ where: { companyId: { in: s.companyIds }, ...(s.year ? { year: s.year } : {}) } });
  const encashTypes = (cfg?.encashableTypes || 'PL').toUpperCase();
  const bal = await prisma.leaveBalance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...(s.year ? { year: s.year } : {}) } });
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const rows = bal.filter(b => { const e = em.get(b.employeeId); return e && (!s.department || e.department === s.department); }).map((b, i) => {
    const e = em.get(b.employeeId);
    let days = 0; if (encashTypes.includes('CL')) days += b.clBalance; if (encashTypes.includes('PL')) days += b.plBalance; if (encashTypes.includes('SL')) days += b.slBalance;
    const cap = cfg?.maxEncashmentDays ?? 30; days = Math.min(days, cap);
    const perDay = (e.salary || 0) / 30; const amount = r2(days * perDay);
    return { sr: i + 1, code: e.employeeId, name: e.name, department: e.department, encashTypes, days: r2(days), perDay: r2(perDay), amount };
  });
  const summary = { amount: r2(rows.reduce((t, r) => t + r.amount, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'encashTypes', label: 'Encashable' }, { key: 'days', label: 'Days' }, { key: 'perDay', label: 'Per Day (₹)' }, { key: 'amount', label: 'Amount (₹)' }], rows, summary, warnings: [`Encashable types: ${encashTypes}${cfg?.allowEncashment === false ? ' — note: encashment is currently disabled in leave policy.' : ''}. Per-day rate = monthly gross / 30.`] };
}

// ── Employee generators ──────────────────────────────────────────────────────
async function employeeMaster(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, designation: e.designation, branch: e.branchLocation || '', doj: fmtDate(e.joinDate), gender: e.gender || '', email: e.email || '', phone: e.phone || '', pan: e.pan || '', uan: e.uan || '', esic: e.esiNumber || '', pf: e.pfNumber || '', bank: e.bankName || '', account: e.accountNumber || '', status: e.status }));
  const missing = emps.filter(e => !e.pan || !e.uan).length;
  return { columns: empCols([{ key: 'designation', label: 'Designation' }, { key: 'branch', label: 'Branch' }, { key: 'doj', label: 'DOJ' }, { key: 'phone', label: 'Phone' }, { key: 'pan', label: 'PAN' }, { key: 'uan', label: 'UAN' }, { key: 'esic', label: 'ESIC' }, { key: 'pf', label: 'PF No' }, { key: 'bank', label: 'Bank' }, { key: 'status', label: 'Status' }]), rows, warnings: missing ? [`${missing} employee(s) missing PAN/UAN.`] : [] };
}
async function groupReport(s, field, label) {
  const emps = await scopedEmps(s);
  const m = new Map();
  for (const e of emps) { const k = e[field] || 'Unassigned'; if (!m.has(k)) m.set(k, { group: k, total: 0, active: 0, salary: 0 }); const r = m.get(k); r.total++; if (e.status === 'Active') r.active++; r.salary += e.salary || 0; }
  const rows = [...m.values()].sort((a, b) => b.total - a.total).map((r, i) => ({ sr: i + 1, group: r.group, total: r.total, active: r.active, salary: r2(r.salary) }));
  const summary = { groups: rows.length, employees: emps.length };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'group', label: label }, { key: 'total', label: 'Total' }, { key: 'active', label: 'Active' }, { key: 'salary', label: 'Monthly Salary (₹)' }], rows, summary };
}
async function joiningReport(s) {
  const emps = await scopedEmps(s);
  const inRange = (d) => { if (!s.startDate || !s.endDate) return true; const v = new Date(d).toISOString().slice(0, 10); return v >= s.startDate && v <= s.endDate; };
  const rows = emps.filter(e => e.joinDate && inRange(e.joinDate)).sort((a, b) => new Date(b.joinDate) - new Date(a.joinDate)).map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, designation: e.designation, branch: e.branchLocation || '', doj: fmtDate(e.joinDate), type: e.employmentType || '' }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'designation', label: 'Designation' }, { key: 'branch', label: 'Branch' }, { key: 'doj', label: 'Join Date' }, { key: 'type', label: 'Type' }], rows, warnings: (s.startDate && s.endDate) ? [] : ['Showing all employees. Use the date range to filter joiners in a period.'] };
}
async function exitReport(s) {
  const emps = await scopedEmps(s);
  const inRange = (d) => { if (!s.startDate || !s.endDate) return true; const v = new Date(d).toISOString().slice(0, 10); return v >= s.startDate && v <= s.endDate; };
  const rows = emps.filter(e => e.exitDate && inRange(e.exitDate)).sort((a, b) => new Date(b.exitDate) - new Date(a.exitDate)).map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, designation: e.designation, doj: fmtDate(e.joinDate), exitDate: fmtDate(e.exitDate), reason: e.exitReason || '', status: e.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'designation', label: 'Designation' }, { key: 'doj', label: 'DOJ' }, { key: 'exitDate', label: 'Exit Date' }, { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status' }], rows, warnings: rows.length ? [] : ['No exited employees in the selected scope/period.'] };
}
async function birthdayReport(s) {
  const emps = await scopedEmps(s);
  const target = s.startDate ? monthOf(s.startDate) : null;
  const rows = emps.filter(e => e.dob).filter(e => target == null || monthOf(e.dob) === target).sort((a, b) => (monthOf(a.dob) - monthOf(b.dob)) || (new Date(a.dob).getDate() - new Date(b.dob).getDate())).map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, dob: fmtDate(e.dob), phone: e.phone || '' }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'dob', label: 'Date of Birth' }, { key: 'phone', label: 'Phone' }], rows, warnings: target == null ? ['Showing all employees with a recorded DOB. Pick a From date to filter by birthday month.'] : [] };
}
async function anniversaryReport(s) {
  const emps = await scopedEmps(s);
  const target = s.startDate ? monthOf(s.startDate) : null;
  const rows = emps.filter(e => e.joinDate).filter(e => target == null || monthOf(e.joinDate) === target).sort((a, b) => (monthOf(a.joinDate) - monthOf(b.joinDate)) || (new Date(a.joinDate).getDate() - new Date(b.joinDate).getDate())).map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, doj: fmtDate(e.joinDate), years: Math.floor(yearsBetween(e.joinDate, e.exitDate)) }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'doj', label: 'Join Date' }, { key: 'years', label: 'Years' }], rows, warnings: target == null ? ['Showing all employees. Pick a From date to filter by work-anniversary month.'] : [] };
}

// ── Compliance / statutory generators ────────────────────────────────────────
async function bonusFormC(s) {
  const calcs = await prisma.bonusCalculation.findMany({ where: { companyId: { in: s.companyIds } } });
  const empIds = [...new Set(calcs.map(c => c.employeeId))];
  const emps = await prisma.employee.findMany({ where: { id: { in: empIds.length ? empIds : [-1] } }, select: { id: true, employeeId: true, name: true, designation: true, joinDate: true } });
  const em = new Map(emps.map(e => [e.id, e]));
  const rows = calcs.filter(c => c.bonusAmount > 0).map((c, i) => { const e = em.get(c.employeeId) || {}; return { sr: i + 1, code: e.employeeId || '', name: e.name || '', designation: e.designation || '', eligibleSalary: r2(c.eligibleSalary), percent: c.bonusPercent, bonus: r2(c.bonusAmount), deduction: 0, payable: r2(c.bonusAmount) }; });
  const summary = { bonus: r2(rows.reduce((t, r) => t + r.bonus, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'eligibleSalary', label: 'Salary/Wage' }, { key: 'percent', label: '%' }, { key: 'bonus', label: 'Bonus' }, { key: 'deduction', label: 'Deduction' }, { key: 'payable', label: 'Net Payable' }], rows, summary, warnings: ['Payment of Bonus Act — Form C (Register of bonus due/paid to each employee).'] };
}
async function bonusFormD(s) {
  const calcs = await prisma.bonusCalculation.findMany({ where: { companyId: { in: s.companyIds } } });
  const pays = await prisma.bonusPayment.findMany({ where: { companyId: { in: s.companyIds } } });
  const totalAllocable = r2(calcs.reduce((t, c) => t + (c.bonusAmount || 0), 0));
  const totalPaid = r2(pays.reduce((t, p) => t + (p.amount || 0), 0));
  const rows = [
    { sr: 1, particular: 'Number of employees eligible for bonus', value: calcs.filter(c => c.bonusAmount > 0).length },
    { sr: 2, particular: 'Total allocable bonus (₹)', value: totalAllocable },
    { sr: 3, particular: 'Total bonus paid (₹)', value: totalPaid },
    { sr: 4, particular: 'Balance payable (₹)', value: r2(totalAllocable - totalPaid) },
  ];
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'particular', label: 'Particulars' }, { key: 'value', label: 'Value' }], rows, warnings: ['Payment of Bonus Act — Form D (Annual return of bonus paid).'] };
}
async function annualWageReturn(s) {
  const pay = await prisma.payroll.findMany({ where: { companyId: { in: s.companyIds }, ...(s.year ? { year: s.year } : {}), ...(s.department ? { department: s.department } : {}) } });
  const m = new Map();
  for (const p of pay) { const k = p.employeeId; if (!m.has(k)) m.set(k, { name: p.employeeName, department: p.department, months: 0, basic: 0, gross: 0, deductions: 0, net: 0 }); const r = m.get(k); r.months++; r.basic += p.basicSalary; r.gross += grossOf(p); r.deductions += p.deductions; r.net += p.netSalary; }
  const rows = [...m.values()].map((r, i) => ({ sr: i + 1, name: r.name, department: r.department, months: r.months, basic: r2(r.basic), gross: r2(r.gross), deductions: r2(r.deductions), net: r2(r.net) }));
  const summary = { employees: rows.length, gross: r2(rows.reduce((t, r) => t + r.gross, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'months', label: 'Months' }, { key: 'basic', label: 'Annual Basic' }, { key: 'gross', label: 'Annual Gross' }, { key: 'deductions', label: 'Deductions' }, { key: 'net', label: 'Net Paid' }], rows, summary, warnings: ['Annual return of wages — consolidated from monthly payroll for the selected year.'] };
}

// ── PF / EPF generators ──────────────────────────────────────────────────────
async function pfReport(s, ctx) {
  const rate = ctx?.meta?.rates?.pfRate ?? 12;
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const rows = pay.map((p, i) => { const pfWages = Math.min(p.basicSalary, PF_WAGE_CEILING); const emp = r2(pfWages * rate / 100); return { sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, basic: r2(p.basicSalary), pfWages: r2(pfWages), employeePf: emp, employerPf: emp, total: r2(emp * 2) }; });
  const summary = { employeePf: r2(rows.reduce((t, r) => t + r.employeePf, 0)), employerPf: r2(rows.reduce((t, r) => t + r.employerPf, 0)), total: r2(rows.reduce((t, r) => t + r.total, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'basic', label: 'Basic' }, { key: 'pfWages', label: 'PF Wages' }, { key: 'employeePf', label: 'Employee PF' }, { key: 'employerPf', label: 'Employer PF' }, { key: 'total', label: 'Total' }], rows, summary, warnings: [`PF computed at ${rate}% on PF wages (capped at ₹${PF_WAGE_CEILING}).`] };
}
async function esiReport(s, ctx) {
  const rate = ctx?.meta?.rates?.esicRate ?? 3.25;
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const rows = pay.map((p, i) => { const gross = grossOf(p); const applicable = gross <= ESI_GROSS_CEILING; const emp = applicable ? r2(gross * ESI_EMP_RATE / 100) : 0; const er = applicable ? r2(gross * rate / 100) : 0; return { sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, gross: r2(gross), applicable: applicable ? 'Yes' : 'No', employeeEsi: emp, employerEsi: er, total: r2(emp + er) }; });
  const summary = { employeeEsi: r2(rows.reduce((t, r) => t + r.employeeEsi, 0)), employerEsi: r2(rows.reduce((t, r) => t + r.employerEsi, 0)), total: r2(rows.reduce((t, r) => t + r.total, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'gross', label: 'Gross' }, { key: 'applicable', label: 'ESI?' }, { key: 'employeeEsi', label: 'Employee ESI' }, { key: 'employerEsi', label: 'Employer ESI' }, { key: 'total', label: 'Total' }], rows, summary, warnings: [`ESI applies when gross ≤ ₹${ESI_GROSS_CEILING}; employee ${ESI_EMP_RATE}%, employer ${rate}%.`] };
}
async function ptReport(s, ctx) {
  const pt = ctx?.meta?.rates?.profTaxRate ?? 200;
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const rows = pay.map((p, i) => ({ sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, gross: r2(grossOf(p)), pt: r2(pt) }));
  const summary = { pt: r2(rows.reduce((t, r) => t + r.pt, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'gross', label: 'Gross' }, { key: 'pt', label: 'Prof. Tax' }], rows, summary, warnings: [`Professional Tax at the company rate of ₹${pt}/month.`] };
}
async function monthly(s, ctx, kind) {
  const rate = ctx?.meta?.rates || { pfRate: 12, esicRate: 3.25, profTaxRate: 200 };
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  const m = new Map();
  for (const p of pay) { const k = `${p.month} ${p.year}`; if (!m.has(k)) m.set(k, { period: k, employees: 0, amount: 0 }); const r = m.get(k); r.employees++;
    if (kind === 'pf') r.amount += Math.min(p.basicSalary, PF_WAGE_CEILING) * rate.pfRate / 100 * 2;
    else if (kind === 'esi') { const g = grossOf(p); if (g <= ESI_GROSS_CEILING) r.amount += g * (ESI_EMP_RATE + rate.esicRate) / 100; }
    else if (kind === 'pt') r.amount += rate.profTaxRate; }
  const rows = [...m.values()].map((r, i) => ({ sr: i + 1, period: r.period, employees: r.employees, amount: r2(r.amount) }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'period', label: 'Period' }, { key: 'employees', label: 'Employees' }, { key: 'amount', label: 'Total Contribution' }], rows };
}
async function pfChallan(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  let ac1 = 0, ac2 = 0, ac10 = 0, ac21 = 0; const ac22 = 0; let epfWagesT = 0;
  for (const p of pay) { const w = Math.min(p.basicSalary, PF_WAGE_CEILING); epfWagesT += w; ac1 += w * 12 / 100 + w * EPF_ER_DIFF / 100; ac10 += w * EPS_RATE / 100; ac2 += w * PF_ADMIN_RATE / 100; ac21 += w * EDLI_RATE / 100; }
  const heads = [
    { head: 'A/C 1 — EPF (12% EE + 3.67% ER)', amount: r2(ac1) },
    { head: 'A/C 2 — EPF Admin Charges (0.5%)', amount: r2(ac2) },
    { head: 'A/C 10 — EPS (8.33%)', amount: r2(ac10) },
    { head: 'A/C 21 — EDLI (0.5%)', amount: r2(ac21) },
    { head: 'A/C 22 — EDLI Admin Charges', amount: r2(ac22) },
  ];
  const total = r2(ac1 + ac2 + ac10 + ac21 + ac22);
  const rows = heads.map((h, i) => ({ sr: i + 1, ...h }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'head', label: 'Account Head' }, { key: 'amount', label: 'Amount (₹)' }], rows, summary: { members: pay.length, epfWages: r2(epfWagesT), total }, warnings: [`PF challan consolidated from payroll for ${pay.length} member(s). Total remittance ₹${total}.`] };
}
async function pfAnnualPerMember(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const m = new Map();
  for (const p of pay) { const w = Math.min(p.basicSalary, PF_WAGE_CEILING); if (!m.has(p.employeeId)) m.set(p.employeeId, { id: p.employeeId, name: p.employeeName, months: 0, epfWages: 0, employeePf: 0, employerEps: 0, employerEpf: 0 }); const r = m.get(p.employeeId); r.months++; r.epfWages += w; r.employeePf += w * 12 / 100; r.employerEps += w * EPS_RATE / 100; r.employerEpf += w * EPF_ER_DIFF / 100; }
  return { rows: [...m.values()], em };
}
async function pfForm3A(s) {
  const { rows: agg, em } = await pfAnnualPerMember(s);
  const rows = agg.map((r, i) => { const e = em.get(r.id) || {}; return { sr: i + 1, uan: e.uan || '', code: e.employeeId || '', name: r.name, months: r.months, epfWages: r2(r.epfWages), employeePf: r2(r.employeePf), employerEpf: r2(r.employerEpf), eps: r2(r.employerEps) }; });
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'uan', label: 'UAN' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Member' }, { key: 'months', label: 'Months' }, { key: 'epfWages', label: 'EPF Wages' }, { key: 'employeePf', label: 'EE PF' }, { key: 'employerEpf', label: 'ER PF' }, { key: 'eps', label: 'EPS' }], rows, warnings: ['Form 3A — annual contribution card per member, consolidated from payroll.'] };
}
async function pfForm6A(s) {
  const { rows: agg, em } = await pfAnnualPerMember(s);
  const rows = agg.map((r, i) => { const e = em.get(r.id) || {}; const total = r.employeePf + r.employerEpf + r.employerEps; return { sr: i + 1, code: e.employeeId || '', name: r.name, epfWages: r2(r.epfWages), employeePf: r2(r.employeePf), employerPf: r2(r.employerEpf), eps: r2(r.employerEps), total: r2(total) }; });
  const summary = { members: rows.length, total: r2(rows.reduce((t, r) => t + r.total, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Member' }, { key: 'epfWages', label: 'EPF Wages' }, { key: 'employeePf', label: 'EE PF' }, { key: 'employerPf', label: 'ER PF' }, { key: 'eps', label: 'EPS' }, { key: 'total', label: 'Total' }], rows, summary, warnings: ['Form 6A — annual consolidated statement of contributions.'] };
}
async function pfForm11(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, father: e.fatherSpouseName || '', dob: fmtDate(e.dob), doj: fmtDate(e.joinDate), uan: e.uan || '', pf: e.pfNumber || '', aadhaar: e.aadhaar || '', pan: e.pan || '' }));
  const missing = emps.filter(e => !e.uan || !e.aadhaar).length;
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'father', label: 'Father/Spouse' }, { key: 'dob', label: 'DOB' }, { key: 'doj', label: 'DOJ' }, { key: 'uan', label: 'UAN' }, { key: 'pf', label: 'PF No' }, { key: 'aadhaar', label: 'Aadhaar' }, { key: 'pan', label: 'PAN' }], rows, warnings: ['Form 11 — new employee PF declaration.', ...(missing ? [`${missing} employee(s) missing UAN/Aadhaar.`] : [])] };
}
async function pfExitForm(s, form) {
  const emps = (await scopedEmps(s)).filter(e => e.exitDate);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, uan: e.uan || '', pf: e.pfNumber || '', doj: fmtDate(e.joinDate), exit: fmtDate(e.exitDate), reason: e.exitReason || '', years: Math.floor(yearsBetween(e.joinDate, e.exitDate)) }));
  const note = form === '19' ? 'Form 19 — EPF final settlement / withdrawal for exited members.' : 'Form 10C — EPS (pension) withdrawal / scheme certificate for exited members.';
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'uan', label: 'UAN' }, { key: 'pf', label: 'PF No' }, { key: 'doj', label: 'DOJ' }, { key: 'exit', label: 'Exit Date' }, { key: 'years', label: 'Service Yrs' }, { key: 'reason', label: 'Reason' }], rows, warnings: [note, ...(rows.length ? [] : ['No exited members in scope.'])] };
}
async function ecrFile(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const rows = pay.map((p, i) => { const w = Math.min(p.basicSalary, PF_WAGE_CEILING); const e = em.get(p.employeeId) || {}; return { sr: i + 1, uan: e.uan || '', code: e.employeeId || '', name: p.employeeName, gross: r2(grossOf(p)), epfWages: r2(w), epsWages: r2(w), edliWages: r2(w), epfContrib: r2(w * 12 / 100), epsContrib: r2(w * EPS_RATE / 100), erDiff: r2(w * EPF_ER_DIFF / 100), ncpDays: r2(p.lwpDays || 0), refund: 0 }; });
  const missing = rows.filter(r => !r.uan).length;
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'uan', label: 'UAN' }, { key: 'name', label: 'Member Name' }, { key: 'gross', label: 'Gross Wages' }, { key: 'epfWages', label: 'EPF Wages' }, { key: 'epsWages', label: 'EPS Wages' }, { key: 'edliWages', label: 'EDLI Wages' }, { key: 'epfContrib', label: 'EE PF' }, { key: 'epsContrib', label: 'EPS' }, { key: 'erDiff', label: 'ER PF Diff' }, { key: 'ncpDays', label: 'NCP Days' }, { key: 'refund', label: 'Refund' }], rows, warnings: ['ECR upload data — export to Excel for the EPFO portal.', ...(missing ? [`${missing} member(s) missing UAN — required for ECR.`] : [])] };
}
async function kycExport(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, uan: e.uan || '', code: e.employeeId, name: e.name, aadhaar: e.aadhaar || '', pan: e.pan || '', bank: e.bankName || '', account: e.accountNumber || '', ifsc: e.ifsc || '' }));
  const missing = emps.filter(e => !e.uan || !e.aadhaar || !e.pan || !e.accountNumber).length;
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'uan', label: 'UAN' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'aadhaar', label: 'Aadhaar' }, { key: 'pan', label: 'PAN' }, { key: 'bank', label: 'Bank' }, { key: 'account', label: 'Account No' }, { key: 'ifsc', label: 'IFSC' }], rows, warnings: ['KYC export for UAN seeding (Aadhaar / PAN / Bank).', ...(missing ? [`${missing} member(s) have incomplete KYC.`] : [])] };
}

// ── ESI generators (extra) ───────────────────────────────────────────────────
async function esiChallan(s, ctx) {
  const rate = ctx?.meta?.rates?.esicRate ?? 3.25;
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  let employee = 0, employer = 0, members = 0;
  for (const p of pay) { const g = grossOf(p); if (g <= ESI_GROSS_CEILING) { members++; employee += g * ESI_EMP_RATE / 100; employer += g * rate / 100; } }
  const rows = [
    { sr: 1, head: `Employee Contribution (${ESI_EMP_RATE}%)`, amount: r2(employee) },
    { sr: 2, head: `Employer Contribution (${rate}%)`, amount: r2(employer) },
  ];
  const total = r2(employee + employer);
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'head', label: 'Contribution Head' }, { key: 'amount', label: 'Amount (₹)' }], rows, summary: { members, total }, warnings: [`ESI challan consolidated from payroll. ${members} covered member(s); total ₹${total}.`] };
}
async function esiCoverage(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const rows = pay.map((p, i) => { const g = grossOf(p); const covered = g <= ESI_GROSS_CEILING; return { sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, gross: r2(g), covered: covered ? 'Covered' : 'Out of Coverage' }; });
  const summary = { covered: rows.filter(r => r.covered === 'Covered').length, total: rows.length };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'gross', label: 'Gross' }, { key: 'covered', label: 'ESI Status' }], rows, summary, warnings: [`Coverage threshold: gross ≤ ₹${ESI_GROSS_CEILING}.`] };
}

// ── Tax generators ───────────────────────────────────────────────────────────
async function tdsReport(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  const rows = pay.filter(p => (p.tax || 0) > 0).map((p, i) => ({ sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, month: `${p.month} ${p.year}`, gross: r2(grossOf(p)), tds: r2(p.tax || 0) }));
  const summary = { tds: r2(rows.reduce((t, r) => t + r.tds, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'month', label: 'Period' }, { key: 'gross', label: 'Gross' }, { key: 'tds', label: 'TDS' }], rows, summary };
}
async function taxAnnualPerEmployee(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  const m = new Map();
  for (const p of pay) { if (!m.has(p.employeeId)) m.set(p.employeeId, { id: p.employeeId, name: p.employeeName, department: p.department, gross: 0, deductions: 0, tds: 0, months: 0 }); const r = m.get(p.employeeId); r.gross += grossOf(p); r.deductions += p.deductions; r.tds += p.tax || 0; r.months++; }
  return [...m.values()];
}
async function form16(s) {
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const agg = await taxAnnualPerEmployee(s);
  const rows = agg.map((r, i) => { const e = em.get(r.id) || {}; const taxable = Math.max(0, r.gross - r.deductions); return { sr: i + 1, code: e.employeeId || '', name: r.name, pan: e.pan || '', grossSalary: r2(r.gross), deductions: r2(r.deductions), taxable: r2(taxable), tds: r2(r.tds) }; });
  const summary = { employees: rows.length, tds: r2(rows.reduce((t, r) => t + r.tds, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'pan', label: 'PAN' }, { key: 'grossSalary', label: 'Gross Salary' }, { key: 'deductions', label: 'Deductions' }, { key: 'taxable', label: 'Taxable' }, { key: 'tds', label: 'TDS Deducted' }], rows, summary, warnings: ['Form 16 Part B summary — annual salary & TDS consolidated from payroll. Pick a year via the date range.'] };
}
async function employeeTaxSummary(s) {
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const agg = await taxAnnualPerEmployee(s);
  const rows = agg.map((r, i) => { const e = em.get(r.id) || {}; return { sr: i + 1, code: e.employeeId || '', name: r.name, department: r.department, pan: e.pan || '', months: r.months, gross: r2(r.gross), deductions: r2(r.deductions), tds: r2(r.tds) }; });
  const summary = { employees: rows.length, tds: r2(rows.reduce((t, r) => t + r.tds, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'pan', label: 'PAN' }, { key: 'months', label: 'Months' }, { key: 'gross', label: 'Gross' }, { key: 'deductions', label: 'Deductions' }, { key: 'tds', label: 'TDS' }], rows, summary };
}

// ── Gratuity & settlement generators ─────────────────────────────────────────
async function gratuityReport(s) {
  const emps = await scopedEmps(s);
  const lastBasic = await lastBasicMap(s);
  const rows = emps.map((e, i) => { const yrs = yearsBetween(e.joinDate, e.exitDate); const basic = lastBasic.get(e.id) ?? (e.salary ? e.salary * 0.5 : 0); const eligible = yrs >= 5; const gratuity = eligible ? r2((15 / 26) * basic * Math.floor(yrs)) : 0; return { sr: i + 1, code: e.employeeId, name: e.name, department: e.department, doj: fmtDate(e.joinDate), years: r2(yrs), lastBasic: r2(basic), eligible: eligible ? 'Yes' : 'No', gratuity }; });
  const summary = { gratuity: r2(rows.reduce((t, r) => t + r.gratuity, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'doj', label: 'DOJ' }, { key: 'years', label: 'Service Yrs' }, { key: 'lastBasic', label: 'Last Basic' }, { key: 'eligible', label: 'Eligible' }, { key: 'gratuity', label: 'Gratuity (₹)' }], rows, summary, warnings: ['Gratuity = (15 / 26) × last basic × completed years, for ≥ 5 years of service.'] };
}
async function fnfSettlement(s) {
  const emps = (await scopedEmps(s)).filter(e => e.exitDate);
  const lastBasic = await lastBasicMap(s);
  const bal = await prisma.leaveBalance.findMany({ where: { companyId: { in: s.companyIds } } });
  const balMap = new Map(bal.map(b => [b.employeeId, b]));
  const rows = emps.map((e, i) => {
    const yrs = yearsBetween(e.joinDate, e.exitDate); const basic = lastBasic.get(e.id) ?? (e.salary ? e.salary * 0.5 : 0);
    const gratuity = yrs >= 5 ? r2((15 / 26) * basic * Math.floor(yrs)) : 0;
    const b = balMap.get(e.id); const leaveDays = b ? (b.plBalance + b.clBalance) : 0; const leaveEncash = r2(leaveDays * (e.salary || 0) / 30);
    const net = r2(gratuity + leaveEncash);
    return { sr: i + 1, code: e.employeeId, name: e.name, department: e.department, exit: fmtDate(e.exitDate), gratuity, leaveDays: r2(leaveDays), leaveEncash, net };
  });
  const summary = { settlements: rows.length, net: r2(rows.reduce((t, r) => t + r.net, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'exit', label: 'Exit Date' }, { key: 'gratuity', label: 'Gratuity' }, { key: 'leaveDays', label: 'Leave Days' }, { key: 'leaveEncash', label: 'Leave Encash' }, { key: 'net', label: 'Net Settlement (₹)' }], rows, summary, warnings: ['Full & Final = gratuity (if eligible) + leave encashment of CL/PL balance. Recoveries/loans not included.', ...(rows.length ? [] : ['No exited employees to settle in scope.'])] };
}

// ── Bonus generators ─────────────────────────────────────────────────────────
async function bonusReport(s, paymentsOnly) {
  if (paymentsOnly) {
    const pays = await prisma.bonusPayment.findMany({ where: { companyId: { in: s.companyIds } }, orderBy: { paymentDate: 'desc' } });
    const empIds = [...new Set(pays.map(p => p.employeeId))];
    const emps = await prisma.employee.findMany({ where: { id: { in: empIds.length ? empIds : [-1] } }, select: { id: true, employeeId: true, name: true } });
    const em = new Map(emps.map(e => [e.id, e]));
    const rows = pays.map((p, i) => ({ sr: i + 1, code: em.get(p.employeeId)?.employeeId || '', name: em.get(p.employeeId)?.name || '', amount: r2(p.amount), paymentDate: p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-IN') : '', mode: p.paymentMode || '', status: p.status }));
    const summary = { amount: r2(rows.reduce((t, r) => t + r.amount, 0)) };
    return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'amount', label: 'Bonus' }, { key: 'paymentDate', label: 'Paid On' }, { key: 'mode', label: 'Mode' }, { key: 'status', label: 'Status' }], rows, summary };
  }
  const calcs = await prisma.bonusCalculation.findMany({ where: { companyId: { in: s.companyIds } } });
  const empIds = [...new Set(calcs.map(c => c.employeeId))];
  const emps = await prisma.employee.findMany({ where: { id: { in: empIds.length ? empIds : [-1] } }, select: { id: true, employeeId: true, name: true, department: true } });
  const em = new Map(emps.map(e => [e.id, e]));
  const rows = calcs.filter(c => c.bonusAmount > 0).map((c, i) => ({ sr: i + 1, code: em.get(c.employeeId)?.employeeId || '', name: em.get(c.employeeId)?.name || '', department: em.get(c.employeeId)?.department || '', eligibleSalary: r2(c.eligibleSalary), percent: c.bonusPercent, amount: r2(c.bonusAmount) }));
  const summary = { amount: r2(rows.reduce((t, r) => t + r.amount, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'eligibleSalary', label: 'Eligible Salary' }, { key: 'percent', label: '%' }, { key: 'amount', label: 'Bonus' }], rows, summary };
}
async function bonusSummary(s) {
  const calcs = await prisma.bonusCalculation.findMany({ where: { companyId: { in: s.companyIds } } });
  const empIds = [...new Set(calcs.map(c => c.employeeId))];
  const emps = await prisma.employee.findMany({ where: { id: { in: empIds.length ? empIds : [-1] } }, select: { id: true, department: true } });
  const dep = new Map(emps.map(e => [e.id, e.department]));
  const m = new Map();
  for (const c of calcs) { if (!(c.bonusAmount > 0)) continue; const k = dep.get(c.employeeId) || 'General'; if (!m.has(k)) m.set(k, { department: k, employees: 0, amount: 0 }); const r = m.get(k); r.employees++; r.amount += c.bonusAmount; }
  const rows = [...m.values()].map((r, i) => ({ sr: i + 1, department: r.department, employees: r.employees, amount: r2(r.amount) }));
  const summary = { amount: r2(rows.reduce((t, r) => t + r.amount, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'department', label: 'Department' }, { key: 'employees', label: 'Employees' }, { key: 'amount', label: 'Bonus (₹)' }], rows, summary };
}

// ── Restored payroll generators ──────────────────────────────────────────────
async function salarySlipTds(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const rows = pay.map((p, i) => ({ sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, period: `${p.month} ${p.year}`, gross: r2(grossOf(p)), deductions: r2(p.deductions), tax: r2(p.tax || 0), net: r2(p.netSalary), status: p.paymentStatus }));
  const summary = { slips: rows.length, tax: r2(rows.reduce((t, r) => t + r.tax, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'period', label: 'Period' }, { key: 'gross', label: 'Gross' }, { key: 'deductions', label: 'Deductions' }, { key: 'tax', label: 'TDS' }, { key: 'net', label: 'Net Pay' }, { key: 'status', label: 'Status' }], rows, summary, warnings: ['Salary slip emphasising TDS/tax deducted per payslip.'] };
}
async function paymentReport(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: { employeeName: 'asc' } });
  const rows = pay.map((p, i) => ({ sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, period: `${p.month} ${p.year}`, net: r2(p.netSalary), method: p.paymentMethod || '', paymentDate: p.paymentDate || '', status: p.paymentStatus }));
  const summary = { payments: rows.length, paid: rows.filter(r => /paid/i.test(r.status)).length, amount: r2(rows.reduce((t, r) => t + r.net, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'period', label: 'Period' }, { key: 'net', label: 'Net Pay' }, { key: 'method', label: 'Mode' }, { key: 'paymentDate', label: 'Paid On' }, { key: 'status', label: 'Status' }], rows, summary };
}
async function salaryCertificate(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  const emps = await scopedEmps(s); const em = new Map(emps.map(e => [e.id, e]));
  const m = new Map();
  for (const p of pay) { if (!m.has(p.employeeId)) m.set(p.employeeId, { name: p.employeeName, department: p.department, months: 0, basic: 0, allow: 0, ded: 0, net: 0 }); const r = m.get(p.employeeId); r.months++; r.basic += p.basicSalary; r.allow += p.allowances; r.ded += p.deductions; r.net += p.netSalary; }
  const rows = [...m.entries()].map(([id, r], i) => { const e = em.get(id) || {}; return { sr: i + 1, code: e.employeeId || '', name: r.name, designation: e.designation || '', department: r.department, months: r.months, basic: r2(r.basic), allowances: r2(r.allow), deductions: r2(r.ded), net: r2(r.net) }; });
  const summary = { employees: rows.length, net: r2(rows.reduce((t, r) => t + r.net, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'department', label: 'Dept' }, { key: 'months', label: 'Months' }, { key: 'basic', label: 'Annual Basic' }, { key: 'allowances', label: 'Annual Allow' }, { key: 'deductions', label: 'Deductions' }, { key: 'net', label: 'Annual Net' }], rows, summary, warnings: ['Annual earnings consolidated from payroll. Filter by employee for a single certificate.'] };
}
async function empMonthlySalary(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s), orderBy: [{ employeeName: 'asc' }] });
  const rows = pay.map((p, i) => ({ sr: i + 1, code: p.employeeId, name: p.employeeName, department: p.department, period: `${p.month} ${p.year}`, basic: r2(p.basicSalary), allowances: r2(p.allowances), deductions: r2(p.deductions), tax: r2(p.tax || 0), net: r2(p.netSalary), payable: p.payableDays }));
  const summary = { rows: rows.length, net: r2(rows.reduce((t, r) => t + r.net, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'period', label: 'Period' }, { key: 'basic', label: 'Basic' }, { key: 'allowances', label: 'Allowances' }, { key: 'deductions', label: 'Deductions' }, { key: 'tax', label: 'Tax' }, { key: 'net', label: 'Net' }, { key: 'payable', label: 'Pay Days' }], rows, summary };
}
function empAnnualSalary(s) { return salaryCertificate(s); }
async function companyAnnualSalary(s) {
  const pay = await prisma.payroll.findMany({ where: payrollWhere(s) });
  const m = new Map();
  for (const p of pay) { const k = `${p.month} ${p.year}`; if (!m.has(k)) m.set(k, { period: k, employees: 0, basic: 0, allow: 0, ded: 0, net: 0 }); const r = m.get(k); r.employees++; r.basic += p.basicSalary; r.allow += p.allowances; r.ded += p.deductions; r.net += p.netSalary; }
  const rows = [...m.values()].map((r, i) => ({ sr: i + 1, period: r.period, employees: r.employees, basic: r2(r.basic), allowances: r2(r.allow), deductions: r2(r.ded), net: r2(r.net) }));
  const summary = { net: r2(rows.reduce((t, r) => t + r.net, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'period', label: 'Month' }, { key: 'employees', label: 'Employees' }, { key: 'basic', label: 'Basic' }, { key: 'allowances', label: 'Allowances' }, { key: 'deductions', label: 'Deductions' }, { key: 'net', label: 'Net Payout' }], rows, summary };
}

// ── Restored attendance generators ───────────────────────────────────────────
async function weeklyAttendance(s) {
  const att = await prisma.attendance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) } });
  const weekOf = (d) => { const dt = new Date(d); const day = (dt.getDay() + 6) % 7; const mon = new Date(dt); mon.setDate(dt.getDate() - day); return mon.toISOString().slice(0, 10); };
  const m = new Map();
  for (const a of att) { const wk = weekOf(a.date); const k = `${a.employeeId}|${wk}`; if (!m.has(k)) m.set(k, { name: a.employeeName, department: a.department, week: wk, present: 0, absent: 0, leave: 0, half: 0, wo: 0, holiday: 0 }); const r = m.get(k); const st = (a.status || '').toLowerCase(); if (/present|on duty|wfo|wfh|work from home/.test(st)) r.present++; else if (/half/.test(st)) r.half++; else if (/leave/.test(st)) r.leave++; else if (/holiday/.test(st)) r.holiday++; else if (/weekly off|week off/.test(st)) r.wo++; else r.absent++; }
  const rows = [...m.values()].sort((a, b) => a.week.localeCompare(b.week)).map((r, i) => ({ sr: i + 1, name: r.name, department: r.department, week: `Week of ${r.week}`, present: r.present, absent: r.absent, leave: r.leave, half: r.half, wo: r.wo, holiday: r.holiday }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'week', label: 'Week' }, { key: 'present', label: 'P' }, { key: 'absent', label: 'A' }, { key: 'leave', label: 'L' }, { key: 'half', label: 'HD' }, { key: 'wo', label: 'WO' }, { key: 'holiday', label: 'H' }], rows, warnings: rows.length ? [] : ['No attendance in the selected range. Pick a From/To date range.'] };
}
async function missingPunch(s) {
  const att = await prisma.attendance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) }, orderBy: [{ date: 'asc' }] });
  const rows = att.filter(a => { const st = (a.status || '').toLowerCase(); const present = /present|on duty|wfo|half|wfh|work from home/.test(st); return present && (!a.clockIn || !a.clockOut); }).map((a, i) => ({ sr: i + 1, date: a.date, name: a.employeeName, department: a.department, clockIn: a.clockIn || '— missing', clockOut: a.clockOut || '— missing', status: a.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'date', label: 'Date' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'clockIn', label: 'In' }, { key: 'clockOut', label: 'Out' }, { key: 'status', label: 'Status' }], rows, warnings: ['Rows where an employee was present but a punch (in/out) is missing.'] };
}
async function earlyExit(s) {
  const att = await prisma.attendance.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) }, orderBy: [{ date: 'asc' }] });
  const isEarly = (a) => { const st = (a.status || '').toLowerCase(); if (/early/.test(st)) return true; const co = a.clockOut; return co && /^\d{2}:\d{2}/.test(co) && co.slice(0, 5) < '18:00'; };
  const rows = att.filter(a => { const st = (a.status || '').toLowerCase(); const present = /present|on duty|wfo|half/.test(st); return present && isEarly(a); }).map((a, i) => ({ sr: i + 1, date: a.date, name: a.employeeName, department: a.department, clockOut: a.clockOut, status: a.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'date', label: 'Date' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'clockOut', label: 'Clock Out' }, { key: 'status', label: 'Status' }], rows, warnings: ['Early exit = status marked early, or clock-out before 18:00.'] };
}
async function overtimeSummary(s) {
  const ot = await prisma.overtime.findMany({ where: { companyId: { in: s.companyIds }, ...(s.department ? { department: s.department } : {}), ...(s.employeeId ? { employeeId: s.employeeId } : {}), ...dateWhere(s) } });
  const m = new Map();
  for (const o of ot) { const k = o.employeeId || o.empId; if (!m.has(k)) m.set(k, { name: o.employeeName, department: o.department || '', entries: 0, hours: 0, approved: 0 }); const r = m.get(k); r.entries++; r.hours += Number(o.otHours || o.overtimeHours || 0); if (/approved/i.test(o.status || '')) r.approved += Number(o.otHours || o.overtimeHours || 0); }
  const rows = [...m.values()].map((r, i) => ({ sr: i + 1, name: r.name, department: r.department, entries: r.entries, hours: r2(r.hours), approved: r2(r.approved) }));
  const summary = { hours: r2(rows.reduce((t, r) => t + r.hours, 0)) };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Employee' }, { key: 'department', label: 'Dept' }, { key: 'entries', label: 'OT Entries' }, { key: 'hours', label: 'Total OT Hrs' }, { key: 'approved', label: 'Approved Hrs' }], rows, summary };
}

// ── Restored employee generators ─────────────────────────────────────────────
async function employeeInfoForm(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, designation: e.designation, doj: fmtDate(e.joinDate), gender: e.gender || '', phone: e.phone || '', email: e.email || '', pan: e.pan || '', aadhaar: e.aadhaar || '', uan: e.uan || '', bank: e.bankName || '', account: e.accountNumber || '' }));
  return { columns: empCols([{ key: 'designation', label: 'Designation' }, { key: 'doj', label: 'DOJ' }, { key: 'gender', label: 'Gender' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'pan', label: 'PAN' }, { key: 'aadhaar', label: 'Aadhaar' }, { key: 'uan', label: 'UAN' }, { key: 'bank', label: 'Bank' }, { key: 'account', label: 'Account' }]), rows };
}
async function employeeDirectory(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, designation: e.designation, branch: e.branchLocation || '', phone: e.phone || '', email: e.email || '', status: e.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'designation', label: 'Designation' }, { key: 'branch', label: 'Branch' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'status', label: 'Status' }], rows };
}
async function attritionReport(s) {
  const emps = await scopedEmps(s);
  const exited = emps.filter(e => e.exitDate);
  const m = new Map();
  for (const e of exited) { const d = new Date(e.exitDate); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; m.set(k, (m.get(k) || 0) + 1); }
  const rows = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, count], i) => ({ sr: i + 1, period, exits: count }));
  const summary = { exits: exited.length, headcount: emps.length, attritionPct: emps.length ? r2(exited.length / emps.length * 100) : 0 };
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'period', label: 'Month' }, { key: 'exits', label: 'Exits' }], rows, summary, warnings: [`Overall attrition: ${exited.length} of ${emps.length} (${emps.length ? r2(exited.length / emps.length * 100) : 0}%).`] };
}
async function ageWise(s) {
  const emps = await scopedEmps(s);
  const band = (age) => age < 25 ? '< 25' : age < 35 ? '25–34' : age < 45 ? '35–44' : age < 55 ? '45–54' : '55+';
  const order = ['< 25', '25–34', '35–44', '45–54', '55+'];
  const m = new Map(order.map(b => [b, 0]));
  let counted = 0;
  for (const e of emps) { if (!e.dob) continue; const age = (Date.now() - new Date(e.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25); if (isNaN(age)) continue; const b = band(age); m.set(b, (m.get(b) || 0) + 1); counted++; }
  const rows = order.map((b, i) => ({ sr: i + 1, band: b, employees: m.get(b) || 0 }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'band', label: 'Age Band' }, { key: 'employees', label: 'Employees' }], rows, warnings: [`Age computed from DOB for ${counted} employee(s) with a recorded DOB.`] };
}
async function leftJoinReport(s) {
  const emps = await scopedEmps(s);
  const inRange = (d) => { if (!s.startDate || !s.endDate) return true; const v = new Date(d).toISOString().slice(0, 10); return v >= s.startDate && v <= s.endDate; };
  const rows = [];
  for (const e of emps) { if (e.joinDate && inRange(e.joinDate)) rows.push({ code: e.employeeId, name: e.name, department: e.department, type: 'Joined', date: fmtDate(e.joinDate), _d: new Date(e.joinDate), status: e.status }); if (e.exitDate && inRange(e.exitDate)) rows.push({ code: e.employeeId, name: e.name, department: e.department, type: 'Left', date: fmtDate(e.exitDate), _d: new Date(e.exitDate), status: e.status }); }
  rows.sort((a, b) => a._d - b._d); rows.forEach((r, i) => { r.sr = i + 1; delete r._d; });
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'type', label: 'Movement' }, { key: 'date', label: 'Date' }, { key: 'status', label: 'Status' }], rows, warnings: (s.startDate && s.endDate) ? [] : ['Showing all joiners & leavers. Use the date range to filter a period.'] };
}
async function serviceCertificate(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, designation: e.designation, department: e.department, doj: fmtDate(e.joinDate), dol: e.exitDate ? fmtDate(e.exitDate) : 'In service', years: r2(yearsBetween(e.joinDate, e.exitDate)), status: e.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'department', label: 'Dept' }, { key: 'doj', label: 'Date of Joining' }, { key: 'dol', label: 'Date of Leaving' }, { key: 'years', label: 'Service Yrs' }, { key: 'status', label: 'Status' }], rows, warnings: ['Service-certificate data. Filter by employee for an individual certificate.'] };
}
async function identityCardRegister(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, designation: e.designation, department: e.department, branch: e.branchLocation || '', phone: e.phone || '', emergency: e.emergencyContact || '', photo: e.photoUpload ? 'Yes' : 'No' }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'department', label: 'Dept' }, { key: 'branch', label: 'Branch' }, { key: 'phone', label: 'Phone' }, { key: 'emergency', label: 'Emergency' }, { key: 'photo', label: 'Photo on File' }], rows, warnings: ['Identity-card register — ID-card data per employee.'] };
}

// ── Document generators ──────────────────────────────────────────────────────
async function documentRegister(s) {
  const docs = await prisma.document.findMany({ where: { companyId: { in: s.companyIds }, ...(s.employeeId ? { employeeId: s.employeeId } : {}) }, orderBy: { uploadedOn: 'desc' } });
  const rows = docs.map((d, i) => ({ sr: i + 1, name: d.name, type: d.type, employee: d.employeeName || '', number: d.documentNumber || '', expiry: d.expiryDate || '', status: d.status, uploadedBy: d.uploadedBy, uploadedOn: d.uploadedOn }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'name', label: 'Document' }, { key: 'type', label: 'Type' }, { key: 'employee', label: 'Employee' }, { key: 'number', label: 'Doc No' }, { key: 'expiry', label: 'Expiry' }, { key: 'status', label: 'Status' }, { key: 'uploadedBy', label: 'Uploaded By' }, { key: 'uploadedOn', label: 'Uploaded On' }], rows, warnings: rows.length ? [] : ['No documents uploaded for the selected scope.'] };
}
async function docTypeReport(s, keywords, label) {
  const docs = await prisma.document.findMany({ where: { companyId: { in: s.companyIds }, ...(s.employeeId ? { employeeId: s.employeeId } : {}) } });
  const match = docs.filter(d => { const t = `${d.type || ''} ${d.name || ''}`.toLowerCase(); return keywords.some(k => t.includes(k)); });
  const rows = match.map((d, i) => ({ sr: i + 1, employee: d.employeeName || '', name: d.name, number: d.documentNumber || '', issue: d.issueDate || '', expiry: d.expiryDate || '', status: d.status }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'employee', label: 'Employee' }, { key: 'name', label: 'Document' }, { key: 'number', label: `${label} No` }, { key: 'issue', label: 'Issue' }, { key: 'expiry', label: 'Expiry' }, { key: 'status', label: 'Status' }], rows, warnings: rows.length ? [] : [`No ${label} documents uploaded yet.`] };
}
async function identityFieldReport(s, field, label) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, value: e[field] || '', status: e[field] ? 'On file' : 'Missing' }));
  const missing = rows.filter(r => r.status === 'Missing').length;
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'value', label: `${label} Number` }, { key: 'status', label: 'Status' }], rows, warnings: missing ? [`${missing} employee(s) have no ${label} on file.`] : [] };
}
async function bankDocumentReport(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, bank: e.bankName || '', account: e.accountNumber || '', ifsc: e.ifsc || '', holder: e.accountHolderName || '', status: (e.accountNumber && e.ifsc) ? 'Complete' : 'Incomplete' }));
  const missing = rows.filter(r => r.status === 'Incomplete').length;
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'bank', label: 'Bank' }, { key: 'account', label: 'Account No' }, { key: 'ifsc', label: 'IFSC' }, { key: 'holder', label: 'Holder' }, { key: 'status', label: 'Status' }], rows, warnings: missing ? [`${missing} employee(s) have incomplete bank details.`] : [] };
}
async function pendingDocuments(s) {
  const docs = await prisma.document.findMany({ where: { companyId: { in: s.companyIds }, ...(s.employeeId ? { employeeId: s.employeeId } : {}) } });
  const pending = docs.filter(d => !/verif|approv|complete/i.test(d.status || ''));
  const rows = pending.map((d, i) => ({ sr: i + 1, employee: d.employeeName || '', name: d.name, type: d.type, status: d.status, uploadedOn: d.uploadedOn }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'employee', label: 'Employee' }, { key: 'name', label: 'Document' }, { key: 'type', label: 'Type' }, { key: 'status', label: 'Status' }, { key: 'uploadedOn', label: 'Uploaded On' }], rows, warnings: rows.length ? ['Documents awaiting verification/approval.'] : ['No pending documents — all verified.'] };
}
async function documentStatus(s) {
  const emps = await scopedEmps(s);
  const docs = await prisma.document.findMany({ where: { companyId: { in: s.companyIds } } });
  const byEmp = new Map();
  for (const d of docs) { if (d.employeeId == null) continue; if (!byEmp.has(d.employeeId)) byEmp.set(d.employeeId, { total: 0, verified: 0 }); const r = byEmp.get(d.employeeId); r.total++; if (/verif|approv|complete/i.test(d.status || '')) r.verified++; }
  const rows = emps.map((e, i) => { const st = byEmp.get(e.id) || { total: 0, verified: 0 }; return { sr: i + 1, code: e.employeeId, name: e.name, department: e.department, uploaded: st.total, verified: st.verified, pending: st.total - st.verified, kyc: (e.aadhaar && e.pan) ? 'Complete' : 'Incomplete' }; });
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'uploaded', label: 'Docs Uploaded' }, { key: 'verified', label: 'Verified' }, { key: 'pending', label: 'Pending' }, { key: 'kyc', label: 'KYC (PAN+Aadhaar)' }], rows };
}

// ── Restored PF / ESI generators ─────────────────────────────────────────────
async function pfMovementForm(s, form) {
  const emps = await scopedEmps(s);
  const inRange = (d) => { if (!s.startDate || !s.endDate) return true; const v = new Date(d).toISOString().slice(0, 10); return v >= s.startDate && v <= s.endDate; };
  const target = form === '5' ? emps.filter(e => e.joinDate && inRange(e.joinDate)) : emps.filter(e => e.exitDate && inRange(e.exitDate));
  const rows = target.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, father: e.fatherSpouseName || '', uan: e.uan || '', pf: e.pfNumber || '', date: form === '5' ? fmtDate(e.joinDate) : fmtDate(e.exitDate) }));
  const note = form === '5' ? 'Form 5 — employees who JOINED (new PF members) in the period.' : 'Form 10 — employees who LEFT (PF members exiting) in the period.';
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'father', label: 'Father/Spouse' }, { key: 'uan', label: 'UAN' }, { key: 'pf', label: 'PF No' }, { key: 'date', label: form === '5' ? 'Date of Joining' : 'Date of Exit' }], rows, warnings: [note, ...((s.startDate && s.endDate) ? [] : ['Showing all — use the date range to filter the contribution month.'])] };
}
async function pfForm9(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, father: e.fatherSpouseName || '', doj: fmtDate(e.joinDate), uan: e.uan || '', pf: e.pfNumber || '', dob: e.dob || '' }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'father', label: 'Father/Spouse' }, { key: 'doj', label: 'DOJ' }, { key: 'uan', label: 'UAN' }, { key: 'pf', label: 'PF No' }, { key: 'dob', label: 'DOB' }], rows, warnings: ['Form 9 — inspection/eligibility register of PF members.'] };
}
async function pfNumberReport(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, uan: e.uan || '', pf: e.pfNumber || '', status: (e.uan || e.pfNumber) ? 'Allotted' : 'Pending' }));
  const missing = rows.filter(r => r.status === 'Pending').length;
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'uan', label: 'UAN' }, { key: 'pf', label: 'PF Number' }, { key: 'status', label: 'Status' }], rows, warnings: missing ? [`${missing} employee(s) have no UAN/PF number.`] : [] };
}
async function esiNumberReport(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, department: e.department, esi: e.esiNumber || '', status: e.esiNumber ? 'Allotted' : 'Pending' }));
  const missing = rows.filter(r => r.status === 'Pending').length;
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Dept' }, { key: 'esi', label: 'ESI Number' }, { key: 'status', label: 'Status' }], rows, warnings: missing ? [`${missing} employee(s) have no ESI number.`] : [] };
}

// ── Tax / statutory generators ───────────────────────────────────────────────
async function itDeclaration(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, pan: e.pan || '', sec80c: 0, hra: 0, otherDeductions: 0 }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'pan', label: 'PAN' }, { key: 'sec80c', label: '80C (₹)' }, { key: 'hra', label: 'HRA (₹)' }, { key: 'otherDeductions', label: 'Other (₹)' }], rows, warnings: ['IT Declaration template. Values are NIL until employees submit declarations (no declaration capture yet).'] };
}
async function registerOfWorkmen(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, father: e.fatherSpouseName || '', designation: e.designation, department: e.department, doj: fmtDate(e.joinDate), category: e.category || '' }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'father', label: 'Father/Spouse' }, { key: 'designation', label: 'Designation' }, { key: 'department', label: 'Dept' }, { key: 'doj', label: 'DOJ' }, { key: 'category', label: 'Category' }], rows, warnings: ['Form 13 — Register of Workmen employed (Contract Labour Act).'] };
}
async function employmentCard(s) {
  const emps = await scopedEmps(s);
  const rows = emps.map((e, i) => ({ sr: i + 1, code: e.employeeId, name: e.name, father: e.fatherSpouseName || '', designation: e.designation, doj: fmtDate(e.joinDate), wageRate: r2(e.salary || 0), category: e.category || '' }));
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'father', label: 'Father/Spouse' }, { key: 'designation', label: 'Designation' }, { key: 'doj', label: 'DOJ' }, { key: 'wageRate', label: 'Wage Rate' }, { key: 'category', label: 'Category' }], rows, warnings: ['Employment Card (Form XIV) — one card per workman.'] };
}
async function nilEventRegister(s, kind) {
  const rows = [{ sr: 1, code: '—', name: '—', date: '—', detail: `No ${kind.toLowerCase()} reported`, remarks: 'NIL' }];
  return { columns: [{ key: 'sr', label: 'Sr' }, { key: 'code', label: 'Emp ID' }, { key: 'name', label: 'Name' }, { key: 'date', label: 'Date' }, { key: 'detail', label: `${kind} Detail` }, { key: 'remarks', label: 'Remarks' }], rows, warnings: [`${kind} register in statutory format — NIL for the selected period (no ${kind.toLowerCase()} events captured).`] };
}

// ── Catalog metadata (descriptions + status for the template gallery) ────────
// Reports whose data source is not yet captured by the HRMS → "Requires Setup".
const SETUP_KEYS = new Set(['loan_report', 'advance_report', 'it_declaration', 'accident_register', 'health_register', 'form_xx_damages', 'form_a', 'form_b', 'form_c']);
const DESCRIPTIONS = {
  salary_register: 'Month-wise earnings & deductions for all employees.',
  salary_slip: 'Per-employee payslip with earnings, deductions and net pay.',
  payroll_summary: 'Department-wise payroll totals for the period.',
  bank_transfer: 'Bank file: account, IFSC and net amount per employee.',
  ctc_report: 'Annual CTC breakup (Basic / HRA / Other) per employee.',
  increment_report: 'Salary revisions from employment history.',
  daily_attendance: 'Day-wise punch log with in/out and status.',
  weekly_attendance: 'Per-employee weekly P/A/L/HD/WO/H breakup.',
  monthly_attendance: 'Monthly present/absent/leave/OT summary per employee.',
  muster_roll: 'Statutory muster roll of attendance.',
  leave_register: 'All leave applications with paid/LWP split.',
  leave_balance: 'CL/PL/SL balances and usage per employee.',
  employee_master: 'Full employee master with statutory identifiers.',
  employee_joining: 'Employees who joined in the selected period.',
  employee_exit: 'Employees who exited, with reason and tenure.',
  pf_register: 'EPF wages and employee/employer contributions.',
  pf_summary: 'Month-wise consolidated PF remittance.',
  pf_challan: 'PF challan account-head breakup (A/C 1/2/10/21/22).',
  pf_form_3a: 'Annual PF contribution card per member.',
  pf_form_6a: 'Annual consolidated PF statement.',
  pf_form_11: 'New-employee PF declaration register.',
  esi_register: 'ESI gross, eligibility and contributions.',
  esi_summary: 'Month-wise ESI remittance.',
  esi_challan: 'ESI challan employee/employer split.',
  form16: 'Annual salary & TDS (Form 16 Part B) per employee.',
  tds_report: 'Monthly TDS deducted from payroll.',
  bonus_register: 'Statutory bonus computed per eligible employee.',
  bonus_summary: 'Department-wise bonus totals.',
  gratuity_report: 'Gratuity eligibility & amount per employee.',
  fnf_settlement: 'Full & Final settlement (gratuity + leave encashment).',
};
function describe(key, def) {
  if (DESCRIPTIONS[key]) return DESCRIPTIONS[key];
  return `${def.label} — generated live from ${def.category.replace(/ Reports$/, '').toLowerCase()} data.`;
}
function statusOf(key, def) {
  if (!def.available) return 'coming';      // not implemented yet (orange)
  if (SETUP_KEYS.has(key)) return 'setup';   // implemented but needs a data source (gray)
  return 'available';                        // ready (green)
}

// Phase 5 — only the filters relevant to each report (the UI renders just these).
// Filter ids: 'dateRange' (From/To), 'financialYear', 'branch', 'department', 'employee'.
const FILTERS_BY_CATEGORY = {
  'Payroll Reports': ['dateRange', 'branch', 'department', 'employee'],
  'Attendance Reports': ['dateRange', 'branch', 'department', 'employee'],
  'Leave Reports': ['dateRange', 'branch', 'department', 'employee'],
  'Employee Reports': ['branch', 'department', 'employee'],
  'Document Reports': ['branch', 'department', 'employee'],
  'Compliance Reports': ['dateRange', 'branch', 'department'],
  'Statutory Registers': ['dateRange', 'branch', 'department'],
  'PF Reports': ['dateRange', 'branch'],
  'ESI Reports': ['dateRange', 'branch'],
  'Tax Reports': ['financialYear', 'employee'],
  'Gratuity & Settlement': ['branch', 'department', 'employee'],
  'Bonus Reports': ['branch', 'department', 'employee'],
};
const FILTERS_BY_KEY = {
  form16: ['financialYear', 'employee'],
  employee_tax_summary: ['financialYear', 'employee'],
  tds_report: ['dateRange', 'department', 'employee'],
  pt_challan: ['dateRange', 'branch'],
  professional_tax_summary: ['dateRange', 'branch', 'department'],
  pf_challan: ['dateRange', 'branch'],
  esi_challan: ['dateRange', 'branch'],
  esi_coverage: ['dateRange', 'branch'],
  employee_master: ['branch', 'department', 'employee'],
  employee_register: ['branch', 'department', 'employee'],
  employee_birthday: ['dateRange', 'department'],
  employee_anniversary: ['dateRange', 'department'],
  employee_joining: ['dateRange', 'branch', 'department'],
  employee_exit: ['dateRange', 'branch', 'department'],
  salary_certificate: ['financialYear', 'employee'],
  emp_annual_salary: ['financialYear', 'employee'],
  company_annual_salary: ['financialYear'],
  pf_form_5: ['dateRange', 'branch'],
  pf_form_10: ['dateRange', 'branch'],
};
function filtersFor(key, category) { return FILTERS_BY_KEY[key] || FILTERS_BY_CATEGORY[category] || ['dateRange', 'branch', 'department', 'employee']; }

// Find the seeded demo company (VISHV ENTERPRISE) for preview generation.
async function demoCompany() {
  return prisma.company.findFirst({ where: { name: { contains: 'VISHV ENTERPRISE' } }, orderBy: { id: 'asc' } });
}

// ── Endpoints ────────────────────────────────────────────────────────────────
exports.catalog = (req, res) => {
  if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
  const list = Object.entries(REPORTS).map(([key, r]) => ({ key, label: r.label, category: r.category, available: !!r.available, description: describe(key, r), status: statusOf(key, r), filters: filtersFor(key, r.category) }));
  res.json(list);
};

// Preview a report using the VISHV ENTERPRISE demo company — sample layout + demo
// data only. NEVER touches the user's real company and is NOT audit-logged as a
// real generation.
exports.preview = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    const key = req.body?.reportKey;
    const def = REPORTS[key];
    if (!def) return res.status(400).json({ error: 'Unknown report.' });
    const demo = await demoCompany();
    if (!demo) return res.status(404).json({ error: 'Demo data not found. Ask an admin to run scripts/seedDemoCompany.js.' });
    // Default scope spanning the seeded demo period so date-based reports show data.
    const scope = { companyIds: [demo.id], primaryCompanyId: demo.id, branch: null, department: null, startDate: '2026-06-01', endDate: '2026-06-30', year: 2026, employeeId: null };
    const meta = await companyMeta(demo.id);
    const out = await def.generate(scope, { meta });
    res.json({
      reportKey: key, reportName: def.label, category: def.category, isDemo: true,
      generatedAt: new Date().toISOString(), generatedBy: 'Sample Preview',
      meta, columns: out.columns, rows: out.rows || [], summary: out.summary || null,
      warnings: ['This is a SAMPLE PREVIEW using VISHV ENTERPRISE demo data — not your company data.', ...(out.warnings || [])],
      canExport: (out.rows?.length || 0) > 0,
    });
  } catch (e) { console.error('reports.preview', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.generate = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'You do not have access to reports.' });
    const key = req.body?.reportKey;
    const def = REPORTS[key];
    if (!def) return res.status(400).json({ error: 'Unknown report.' });
    if (!def.available) return res.status(400).json({ error: `${def.label} is not available yet.` });
    const scope = resolveScope(req);
    if (!scope.primaryCompanyId || !scope.companyIds.length) return res.status(400).json({ error: 'Select a company to generate the report.' });

    // ── Backend ENFORCEMENT of report-specific filters (not just hidden in the UI) ──
    // Strip any filter the report doesn't accept, so an irrelevant filter sent by a
    // client (or API caller) can never affect the query for this report.
    const allowed = filtersFor(key, def.category);
    if (!allowed.includes('branch')) scope.branch = null;
    if (!allowed.includes('department')) scope.department = null;
    if (!allowed.includes('employee')) scope.employeeId = null;
    if (!allowed.includes('dateRange') && !allowed.includes('financialYear')) { scope.startDate = null; scope.endDate = null; scope.year = null; }

    const meta = await companyMeta(scope.primaryCompanyId);
    const ctx = { meta };
    const out = await def.generate(scope, ctx);
    const warnings = out.warnings || [];
    if (!out.rows || out.rows.length === 0) warnings.unshift('No records match the selected filters — nothing to generate.');
    await prisma.complianceReportLog.create({ data: { companyId: scope.primaryCompanyId, reportKey: key, reportName: def.label, action: 'GENERATE', filters: JSON.stringify({ branch: scope.branch, department: scope.department, startDate: scope.startDate, endDate: scope.endDate, employeeId: scope.employeeId }), rowCount: out.rows?.length || 0, performedBy: req.user?.id || null, performedByName: req.user?.name || req.user?.email || null } }).catch(() => {});
    res.json({ reportKey: key, reportName: def.label, category: def.category, generatedAt: new Date().toISOString(), generatedBy: req.user?.name || req.user?.email || null, meta, columns: out.columns, rows: out.rows || [], summary: out.summary || null, warnings, canExport: (out.rows?.length || 0) > 0 });
  } catch (e) { console.error('reports.generate', e); res.status(500).json({ error: e.message || 'Server error' }); }
};

exports.logDownload = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'No access.' });
    const { reportKey, reportName, format, companyId, filters, rowCount } = req.body || {};
    const cid = idParam(companyId) || req.user?.companyId;
    if (cid) await prisma.complianceReportLog.create({ data: { companyId: cid, reportKey: reportKey || 'unknown', reportName: reportName || 'Report', action: 'DOWNLOAD', format: format || null, filters: filters ? JSON.stringify(filters) : null, rowCount: Number(rowCount) || 0, performedBy: req.user?.id || null, performedByName: req.user?.name || req.user?.email || null } }).catch(() => {});
    res.json({ ok: true });
  } catch (e) { console.error('reports.logDownload', e); res.status(500).json({ error: e.message }); }
};

exports.audit = async (req, res) => {
  try {
    if (!canAccess(req)) return res.status(403).json({ error: 'No access.' });
    let where = {};
    if (!isSuperAdmin(req)) { const scope = companyScopeFor(req); where.companyId = { in: scope.length ? scope : [-1] }; }
    else { const cid = idParam(req.query.companyId || req.headers['x-workspace-id']); if (cid) where.companyId = cid; }
    const logs = await prisma.complianceReportLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(logs);
  } catch (e) { console.error('reports.audit', e); res.status(500).json({ error: e.message }); }
};
