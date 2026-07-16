/**
 * customReportRegistry — the ALLOWLIST that makes the Custom Report Builder safe.
 *
 * The report engine (customReportEngine.js) can ONLY ever reference fields,
 * operators, data sources and joins declared here. Nothing a user types is ever
 * turned into a column name, table name, SQL fragment or Prisma path — the client
 * sends registry KEYS, the engine looks them up here, and builds the query from
 * the trusted descriptor. That is the entire SQL-injection defence.
 *
 * A DATA SOURCE = one base Prisma model (+ optional relation `include`) and a set
 * of fields. "Employee + Payroll" etc. are modelled as a base model with a joined
 * relation (one row per base record, employee columns read through the relation),
 * so joins reuse the existing foreign keys and never duplicate rows.
 *
 * Every field carries a `path` (how the engine reads/filters/sorts it), a `type`
 * (drives the operator set + formatting) and an optional `sensitive` flag
 * (role-gated: salary / PAN / Aadhaar / bank / statutory ids).
 *
 * This module NEVER touches existing report logic — it is additive metadata only.
 */

// ── Operators allowed per field type (Prisma-mapped in the engine) ────────────
const OPERATORS = {
  string: [
    { op: 'equals', label: 'is' },
    { op: 'notEquals', label: 'is not' },
    { op: 'contains', label: 'contains' },
    { op: 'startsWith', label: 'starts with' },
    { op: 'endsWith', label: 'ends with' },
    { op: 'in', label: 'is any of' },
    { op: 'isEmpty', label: 'is empty' },
    { op: 'notEmpty', label: 'is not empty' },
  ],
  number: [
    { op: 'equals', label: '=' },
    { op: 'notEquals', label: '≠' },
    { op: 'gt', label: '>' },
    { op: 'gte', label: '≥' },
    { op: 'lt', label: '<' },
    { op: 'lte', label: '≤' },
    { op: 'between', label: 'between' },
  ],
  date: [
    { op: 'on', label: 'on' },
    { op: 'before', label: 'before' },
    { op: 'after', label: 'after' },
    { op: 'between', label: 'between' },
  ],
  boolean: [
    { op: 'isTrue', label: 'is yes' },
    { op: 'isFalse', label: 'is no' },
  ],
};

// A field descriptor. `path` is the array route used to select / filter / sort /
// read the value (['name'] on the base model, ['employee','name'] through a join).
const f = (key, label, type, category, path, opts = {}) => ({
  key, label, type, category, path, sensitive: !!opts.sensitive,
  agg: opts.agg !== false && type === 'number',
  // true DateTime column (needs a Date object to filter); otherwise a
  // 'YYYY-MM-DD' string column that compares correctly lexicographically.
  datetime: !!opts.datetime,
});

// Employee field descriptors, reusable at a given path prefix: `[]` when Employee
// is the base source, `['employee']` when joined onto Payroll/Attendance/Leave.
const employeeFields = (prefix = []) => {
  const p = (col) => [...prefix, col];
  const C = 'Employee';
  return [
    f('emp.name', 'Employee Name', 'string', C, p('name')),
    f('emp.employeeId', 'Employee ID', 'string', C, p('employeeId')),
    f('emp.email', 'Email', 'string', C, p('email')),
    f('emp.phone', 'Phone', 'string', C, p('phone')),
    f('emp.department', 'Department', 'string', C, p('department')),
    f('emp.designation', 'Designation', 'string', C, p('designation')),
    f('emp.status', 'Status', 'string', C, p('status')),
    f('emp.gender', 'Gender', 'string', C, p('gender')),
    f('emp.dob', 'Date of Birth', 'date', C, p('dob')),
    f('emp.joinDate', 'Joining Date', 'date', C, p('joinDate'), { datetime: true }),
    f('emp.exitDate', 'Exit Date', 'date', C, p('exitDate'), { datetime: true }),
    f('emp.manager', 'Reporting Manager', 'string', C, p('manager')),
    f('emp.employmentType', 'Employment Type', 'string', C, p('employmentType')),
    f('emp.category', 'Wage Category', 'string', C, p('category')),
    f('emp.maritalStatus', 'Marital Status', 'string', C, p('maritalStatus')),
    f('emp.nationality', 'Nationality', 'string', C, p('nationality')),
    // Location / Branch
    f('emp.branchLocation', 'Branch', 'string', 'Branch', p('branchLocation')),
    f('emp.location', 'Location', 'string', 'Branch', p('location')),
    f('emp.city', 'City', 'string', 'Branch', p('city')),
    f('emp.state', 'State', 'string', 'Branch', p('state')),
    // Compensation (sensitive)
    f('emp.salary', 'Monthly Salary', 'number', 'Salary', p('salary'), { sensitive: true }),
    // Bank (sensitive)
    f('emp.bankName', 'Bank Name', 'string', 'Bank', p('bankName'), { sensitive: true }),
    f('emp.accountNumber', 'Account Number', 'string', 'Bank', p('accountNumber'), { sensitive: true, agg: false }),
    f('emp.ifsc', 'IFSC', 'string', 'Bank', p('ifsc'), { sensitive: true }),
    // Statutory / identity (sensitive)
    f('emp.pan', 'PAN', 'string', 'Statutory', p('pan'), { sensitive: true }),
    f('emp.aadhaar', 'Aadhaar', 'string', 'Statutory', p('aadhaar'), { sensitive: true }),
    f('emp.uan', 'UAN', 'string', 'Statutory', p('uan'), { sensitive: true }),
    f('emp.pfNumber', 'PF Number', 'string', 'Statutory', p('pfNumber'), { sensitive: true }),
    f('emp.esiNumber', 'ESI Number', 'string', 'Statutory', p('esiNumber'), { sensitive: true }),
  ];
};

// Payroll fields on the base Payroll model.
const payrollFields = () => {
  const C = 'Payroll';
  return [
    f('pay.month', 'Payroll Month', 'string', C, ['month']),
    f('pay.year', 'Payroll Year', 'number', C, ['year'], { agg: false }),
    f('pay.basicSalary', 'Basic Salary', 'number', C, ['basicSalary'], { sensitive: true }),
    f('pay.allowances', 'Allowances', 'number', C, ['allowances'], { sensitive: true }),
    f('pay.overtime', 'Overtime Amount', 'number', C, ['overtime'], { sensitive: true }),
    f('pay.bonus', 'Bonus', 'number', C, ['bonus'], { sensitive: true }),
    f('pay.deductions', 'Deductions', 'number', C, ['deductions'], { sensitive: true }),
    f('pay.tax', 'TDS / Tax', 'number', C, ['tax'], { sensitive: true }),
    f('pay.loanDeduction', 'Loan EMI', 'number', C, ['loanDeduction'], { sensitive: true }),
    f('pay.netSalary', 'Net Salary', 'number', C, ['netSalary'], { sensitive: true }),
    f('pay.presentDays', 'Present Days', 'number', C, ['presentDays']),
    f('pay.payableDays', 'Payable Days', 'number', C, ['payableDays']),
    f('pay.workingDays', 'Working Days', 'number', C, ['workingDays']),
    f('pay.lwpDays', 'LWP Days', 'number', C, ['lwpDays']),
    f('pay.halfDays', 'Half Days', 'number', C, ['halfDays']),
    f('pay.otHours', 'Overtime Hours', 'number', C, ['otHours']),
    f('pay.payrollStatus', 'Payroll Status', 'string', C, ['payrollStatus']),
    f('pay.paymentStatus', 'Payment Status', 'string', C, ['paymentStatus']),
  ];
};

const attendanceFields = () => {
  const C = 'Attendance';
  return [
    f('att.date', 'Date', 'date', C, ['date']),
    f('att.status', 'Status', 'string', C, ['status']),
    f('att.clockIn', 'Clock In', 'string', C, ['clockIn'], { agg: false }),
    f('att.clockOut', 'Clock Out', 'string', C, ['clockOut'], { agg: false }),
    f('att.hoursWorked', 'Hours Worked', 'number', C, ['hoursWorked']),
    f('att.shift', 'Shift', 'string', C, ['shift']),
    f('att.leaveType', 'Leave Type', 'string', C, ['leaveType']),
    f('att.branch', 'Branch', 'string', 'Branch', ['branch']),
  ];
};

const leaveFields = () => {
  const C = 'Leave';
  return [
    f('lv.leaveType', 'Leave Type', 'string', C, ['leaveType']),
    f('lv.fromDate', 'From Date', 'date', C, ['fromDate']),
    f('lv.toDate', 'To Date', 'date', C, ['toDate']),
    f('lv.days', 'Days', 'number', C, ['days']),
    f('lv.status', 'Status', 'string', C, ['status']),
    f('lv.reason', 'Reason', 'string', C, ['reason'], { agg: false }),
    f('lv.appliedOn', 'Applied On', 'date', C, ['appliedOn']),
    f('lv.approvedBy', 'Approved By', 'string', C, ['approvedBy']),
    f('lv.paidDays', 'Paid Days', 'number', C, ['paidDays']),
    f('lv.lwpDays', 'LWP Days', 'number', C, ['lwpDays']),
  ];
};

const loanFields = () => {
  const C = 'Loan';
  return [
    f('loan.loanNumber', 'Loan Number', 'string', C, ['loanNumber'], { agg: false }),
    f('loan.loanTypeName', 'Loan Type', 'string', C, ['loanTypeName']),
    f('loan.principalAmount', 'Principal', 'number', C, ['principalAmount'], { sensitive: true }),
    f('loan.emiAmount', 'EMI', 'number', C, ['emiAmount'], { sensitive: true }),
    f('loan.totalPayable', 'Total Payable', 'number', C, ['totalPayable'], { sensitive: true }),
    f('loan.tenureMonths', 'Tenure (months)', 'number', C, ['tenureMonths']),
    f('loan.status', 'Status', 'string', C, ['status']),
    f('loan.disbursedDate', 'Disbursed Date', 'date', C, ['disbursedDate']),
    f('loan.employeeName', 'Employee Name', 'string', 'Employee', ['employeeName']),
    f('loan.department', 'Department', 'string', 'Employee', ['department']),
  ];
};

// ── DATA SOURCES ─────────────────────────────────────────────────────────────
// `model`      : prisma delegate name (prisma[model])
// `include`    : relations to join (Prisma include) — declared, never user-driven
// `companyPath`: path to the companyId scalar for RULE-5 company isolation
// `orderable`  : a stable default sort field path
const SOURCES = {
  employee: {
    key: 'employee', label: 'Employees', module: 'Employees',
    model: 'employee', companyPath: ['companyId'], defaultSort: ['employeeId'],
    fields: employeeFields([]),
  },
  payroll: {
    key: 'payroll', label: 'Employee + Payroll', module: 'Payroll',
    model: 'payroll', include: { employee: true }, companyPath: ['companyId'], defaultSort: ['id'],
    fields: [...payrollFields(), ...employeeFields(['employee'])],
  },
  attendance: {
    key: 'attendance', label: 'Employee + Attendance', module: 'Attendance',
    model: 'attendance', include: { employee: true }, companyPath: ['companyId'], defaultSort: ['date'],
    fields: [...attendanceFields(), ...employeeFields(['employee'])],
  },
  leave: {
    key: 'leave', label: 'Employee + Leave', module: 'Leave',
    model: 'leaveRequest', include: { employee: true }, companyPath: ['companyId'], defaultSort: ['appliedOn'],
    fields: [...leaveFields(), ...employeeFields(['employee'])],
  },
  loan: {
    key: 'loan', label: 'Employee Loans', module: 'Loans',
    model: 'loan', companyPath: ['companyId'], defaultSort: ['id'],
    fields: loanFields(),
  },
};

// Roles allowed to see `sensitive` fields (salary / bank / statutory ids). The
// whole module is already gated to Company Head / HR (reports permission); this
// is the per-field second layer required by the spec.
const SENSITIVE_ROLES = new Set(['Super Admin', 'Company Head', 'HR', 'Finance']);
const canSeeSensitive = (role) => SENSITIVE_ROLES.has(role);

// Lookups used by the engine (never expose raw model/paths to the client).
function getSource(key) { return SOURCES[key] || null; }
function getField(sourceKey, fieldKey) {
  const s = SOURCES[sourceKey];
  if (!s) return null;
  return s.fields.find((x) => x.key === fieldKey) || null;
}

// Client-facing catalog: sources + their fields grouped by category, with the
// sensitive fields stripped for roles that may not see them.
function catalogFor(role) {
  const allowSensitive = canSeeSensitive(role);
  return Object.values(SOURCES).map((s) => ({
    key: s.key, label: s.label, module: s.module,
    fields: s.fields
      .filter((fld) => allowSensitive || !fld.sensitive)
      .map((fld) => ({ key: fld.key, label: fld.label, type: fld.type, category: fld.category, sensitive: fld.sensitive, aggregatable: fld.agg })),
  }));
}

module.exports = { SOURCES, OPERATORS, getSource, getField, catalogFor, canSeeSensitive };
