/**
 * Built-in Custom Report templates — ready-to-load starting points the user can
 * open, tweak and Save As their own. Each is just a report CONFIG the engine
 * already understands (nothing special). Sensitive-field columns are still
 * role-gated at run time, so a template referencing salary simply shows fewer
 * columns for a role that can't see it.
 */
const TEMPLATES = [
  {
    key: 'employee_master', name: 'Employee Master', module: 'Employees',
    description: 'Core directory of every employee with department, designation and joining date.',
    config: {
      source: 'employee',
      fields: ['emp.employeeId', 'emp.name', 'emp.department', 'emp.designation', 'emp.branchLocation', 'emp.email', 'emp.phone', 'emp.joinDate', 'emp.status'],
      filters: { logic: 'AND', conditions: [{ field: 'emp.status', op: 'equals', value: 'Active' }] },
      sorts: [{ field: 'emp.employeeId', dir: 'asc' }],
    },
  },
  {
    key: 'payroll_register', name: 'Payroll Register', module: 'Payroll',
    description: 'Month-wise salary register: basic, allowances, deductions and net pay per employee.',
    config: {
      source: 'payroll',
      fields: ['emp.employeeId', 'emp.name', 'emp.department', 'pay.month', 'pay.year', 'pay.basicSalary', 'pay.allowances', 'pay.deductions', 'pay.netSalary'],
      sorts: [{ field: 'emp.employeeId', dir: 'asc' }],
      summary: { 'pay.basicSalary': ['sum'], 'pay.allowances': ['sum'], 'pay.deductions': ['sum'], 'pay.netSalary': ['sum'] },
    },
  },
  {
    key: 'attendance_summary', name: 'Attendance Summary', module: 'Attendance',
    description: 'Daily attendance with status, clock-in/out and hours worked.',
    config: {
      source: 'attendance',
      fields: ['att.date', 'emp.employeeId', 'emp.name', 'emp.department', 'att.status', 'att.clockIn', 'att.clockOut', 'att.hoursWorked'],
      sorts: [{ field: 'att.date', dir: 'desc' }],
    },
  },
  {
    key: 'leave_register', name: 'Leave Register', module: 'Leave',
    description: 'All leave applications with type, dates, days and approval status.',
    config: {
      source: 'leave',
      fields: ['emp.employeeId', 'emp.name', 'emp.department', 'lv.leaveType', 'lv.fromDate', 'lv.toDate', 'lv.days', 'lv.status'],
      sorts: [{ field: 'lv.appliedOn', dir: 'desc' }],
      summary: { 'lv.days': ['sum'] },
    },
  },
  {
    key: 'joining_report', name: 'Joining Report', module: 'Employees',
    description: 'Employees ordered by joining date — new-hire / onboarding tracking.',
    config: {
      source: 'employee',
      fields: ['emp.employeeId', 'emp.name', 'emp.department', 'emp.designation', 'emp.joinDate', 'emp.employmentType', 'emp.branchLocation'],
      sorts: [{ field: 'emp.joinDate', dir: 'desc' }],
    },
  },
  {
    key: 'department_headcount', name: 'Department Headcount', module: 'Employees',
    description: 'Active employees grouped by department (drag more fields to extend).',
    config: {
      source: 'employee',
      fields: ['emp.department', 'emp.name', 'emp.designation', 'emp.branchLocation'],
      filters: { logic: 'AND', conditions: [{ field: 'emp.status', op: 'equals', value: 'Active' }] },
      sorts: [{ field: 'emp.department', dir: 'asc' }],
      group: ['emp.department'],
    },
  },
  {
    key: 'loan_register', name: 'Loan Register', module: 'Loans',
    description: 'Employee loans with type, principal, EMI, tenure and status.',
    config: {
      source: 'loan',
      fields: ['loan.loanNumber', 'loan.employeeName', 'loan.department', 'loan.loanTypeName', 'loan.principalAmount', 'loan.emiAmount', 'loan.tenureMonths', 'loan.status'],
      sorts: [{ field: 'loan.disbursedDate', dir: 'desc' }],
      summary: { 'loan.principalAmount': ['sum'], 'loan.emiAmount': ['sum'] },
    },
  },
  {
    key: 'statutory_register', name: 'PF / ESI Register', module: 'Payroll',
    description: 'Statutory identifiers alongside monthly gross for PF/ESI reconciliation.',
    config: {
      source: 'payroll',
      fields: ['emp.employeeId', 'emp.name', 'emp.uan', 'emp.pfNumber', 'emp.esiNumber', 'pay.month', 'pay.basicSalary', 'pay.netSalary'],
      sorts: [{ field: 'emp.employeeId', dir: 'asc' }],
    },
  },
];

const list = () => TEMPLATES.map(({ key, name, module, description }) => ({ key, name, module, description }));
const get = (key) => TEMPLATES.find((t) => t.key === key) || null;

module.exports = { TEMPLATES, list, get };
