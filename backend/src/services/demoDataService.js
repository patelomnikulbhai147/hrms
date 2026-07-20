// ─────────────────────────────────────────────────────────────────────────────
// DEMO / SAMPLE WORKSPACE GENERATOR (per company, one-time)
//
// Populates a single company with a realistic sample roster so a new tenant can
// explore the product before onboarding real staff. Tagging follows the repo's
// established convention (no schema change): every demo record is identifiable so
// "Remove Sample Data" can delete ONLY it and never touch real records.
//   • Employees: employeeId LIKE 'DEMO-%'  AND  email LIKE '%@demo.zeniahr.local'
//   • Company-level demo (departments) is recorded in onboardingState.demo.
//
// Phase 1 generates the roster (30 employees + 5 departments + designations +
// head-office assignment). Attendance/leave/payroll/holidays/etc. are layered on
// in Phase 2 by extending generateDemoWorkspace (all keyed to the DEMO employees
// so the same cleanup query removes them).
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/prisma');

const DEMO_EMAIL_DOMAIN = 'demo.zeniahr.local';
const DEMO_EMPLOYEE_PREFIX = 'DEMO-';
const DEMO_COUNT = 30;
// Marker written on company-level demo rows that DON'T cascade from the demo
// employees (Document.uploadedBy, CommunicationHoliday.createdBy). Notifications
// use type='demo'. Cleanup deletes strictly by these markers + demo employee ids.
const DEMO_MARKER = 'Demo Seed';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const DEPARTMENTS = ['Engineering', 'Sales', 'Human Resources', 'Finance', 'Operations'];
const DESIGNATIONS = {
  Engineering: ['Software Engineer', 'Senior Software Engineer', 'Engineering Lead', 'QA Engineer', 'DevOps Engineer', 'Frontend Developer'],
  Sales: ['Sales Executive', 'Sales Manager', 'Account Manager', 'Business Development Executive', 'Inside Sales Rep', 'Regional Sales Head'],
  'Human Resources': ['HR Executive', 'HR Manager', 'Talent Acquisition Specialist', 'HR Business Partner', 'HR Generalist', 'People Ops Lead'],
  Finance: ['Accountant', 'Finance Manager', 'Financial Analyst', 'Payroll Specialist', 'Accounts Executive', 'Audit Associate'],
  Operations: ['Operations Executive', 'Operations Manager', 'Logistics Coordinator', 'Facilities Manager', 'Process Analyst', 'Supply Chain Executive'],
};

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
  'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Pari', 'Anika', 'Navya', 'Riya', 'Ishani', 'Meera',
  'Kabir', 'Aryan', 'Dhruv', 'Kiaan', 'Neha', 'Priya', 'Kavya', 'Isha', 'Tanvi', 'Aarohi'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Mehta', 'Singh', 'Rao',
  'Kulkarni', 'Chopra', 'Bose', 'Das', 'Kapoor', 'Joshi', 'Menon', 'Pillai', 'Shetty', 'Malhotra'];

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];

// Salary bands (MONTHLY — Employee.salary is a monthly figure in this codebase).
const SALARY_BY_LEVEL = { lead: [90000, 140000], senior: [55000, 90000], mid: [35000, 55000], junior: [22000, 35000] };
function salaryFor(designation) {
  const d = designation.toLowerCase();
  const band = /lead|manager|head|partner/.test(d) ? 'lead'
    : /senior|specialist|analyst|architect/.test(d) ? 'senior'
    : /executive|associate|coordinator|generalist|rep/.test(d) ? 'mid' : 'mid';
  const [lo, hi] = SALARY_BY_LEVEL[band] || SALARY_BY_LEVEL.mid;
  return Math.round((lo + rnd(hi - lo)) / 500) * 500;
}

function joinDateSpread(i) {
  // Spread hires across the last ~24 months, most recent first-ish.
  const daysAgo = 30 + rnd(720);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');

// True when this company already has demo employees (used to keep generation
// idempotent and to power the "Remove Sample Data" affordance).
async function hasDemoData(companyId) {
  const n = await prisma.employee.count({
    where: { companyId: Number(companyId), employeeId: { startsWith: DEMO_EMPLOYEE_PREFIX } },
  });
  return n > 0;
}

// Generate the sample workspace for ONE head company. Idempotent: if demo data
// already exists it is a no-op. Returns a small summary.
async function generateDemoWorkspace(headCompanyId, actor = 'System') {
  const companyId = Number(headCompanyId);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, customDepartments: true } });
  if (!company) throw new Error('Company not found for demo generation.');
  if (await hasDemoData(companyId)) {
    return { created: 0, skipped: true, reason: 'Demo data already present.' };
  }

  // Head-office branch (created at provisioning). Demo staff attach to it so
  // branch-scoped views/reports light up.
  const branch = await prisma.branch.findFirst({ where: { companyId }, orderBy: { id: 'asc' }, select: { id: true } });
  const branchId = branch?.id || null;

  // Merge demo departments into the company's department list (data-only, matches
  // the customDepartments pattern; never removes the tenant's own departments).
  const current = Array.isArray(company.customDepartments) ? company.customDepartments : [];
  const mergedDepts = Array.from(new Set([...current, ...DEPARTMENTS]));
  await prisma.company.update({ where: { id: companyId }, data: { customDepartments: mergedDepts } });

  // 30 employees, evenly split across the 5 demo departments.
  const perDept = Math.floor(DEMO_COUNT / DEPARTMENTS.length);
  const usedEmails = new Set();
  const rows = [];
  let seq = 1;
  for (let d = 0; d < DEPARTMENTS.length; d++) {
    const dept = DEPARTMENTS[d];
    for (let k = 0; k < perDept; k++) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const designation = pick(DESIGNATIONS[dept]);
      let email = `${slug(first)}.${slug(last)}@${DEMO_EMAIL_DOMAIN}`;
      while (usedEmails.has(email)) email = `${slug(first)}.${slug(last)}${seq}@${DEMO_EMAIL_DOMAIN}`;
      usedEmails.add(email);
      rows.push({
        employeeId: `${DEMO_EMPLOYEE_PREFIX}${String(seq).padStart(4, '0')}`,
        companyId, branchId,
        name: `${first} ${last}`,
        firstName: first, lastName: last,
        email,
        phone: `9${String(100000000 + rnd(899999999))}`,
        department: dept,
        designation,
        gender: rnd(2) ? 'Male' : 'Female',
        joinDate: joinDateSpread(seq),
        salary: salaryFor(designation),
        status: 'Active',
        employmentType: 'Full-time',
      });
      seq++;
    }
  }

  await prisma.employee.createMany({ data: rows });

  // Re-read the created employees to get their DB ids (createMany returns none)
  // — all rich child data is keyed to these ids, so cleanup is one cascade.
  const emps = await prisma.employee.findMany({
    where: { companyId, employeeId: { startsWith: DEMO_EMPLOYEE_PREFIX } },
    select: { id: true, name: true, department: true, salary: true, joinDate: true },
  });

  const rich = await generateRichDemoData(companyId, emps);

  // Keep Company.employeeCount in sync with the new roster.
  try {
    const HeadcountSyncService = require('./headcountSyncService');
    if (HeadcountSyncService.syncAllBranches) await HeadcountSyncService.syncAllBranches();
  } catch (_) { /* non-fatal */ }

  return { created: rows.length, skipped: false, departments: DEPARTMENTS.length, branchId, ...rich };
}

// ── Rich demo data (Phase 2) ─────────────────────────────────────────────────
// Attendance history (2 months), attendance summaries, processed payroll with
// generated payslips, a few leave requests, one document per employee, plus a
// company holiday calendar and notifications. Everything is FK-linked to the
// demo employees (so it cascades on delete) or carries a demo marker.
async function generateRichDemoData(companyId, emps) {
  const now = new Date();
  const attendance = [];
  const summaries = [];
  const payrolls = [];
  const leaves = [];
  const documents = [];

  // Two months of history: previous month (full) + current month (to today).
  const periods = [
    { y: new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear(), m: new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth(), lastDay: new Date(now.getFullYear(), now.getMonth(), 0).getDate() },
    { y: now.getFullYear(), m: now.getMonth(), lastDay: now.getDate() },
  ];

  for (const emp of emps) {
    const monthly = round0(Number(emp.salary) || 30000); // Employee.salary is monthly
    for (const p of periods) {
      let present = 0, absent = 0, leaveDays = 0, weeklyOff = 0, working = 0;
      for (let day = 1; day <= p.lastDay; day++) {
        const d = new Date(p.y, p.m, day);
        const dow = d.getDay(); // 0 Sun
        const date = ymd(d);
        if (dow === 0) { // Sunday = weekly off
          weeklyOff++;
          attendance.push(attRow(companyId, emp, date, 'Weekly Off', '', '', 0));
          continue;
        }
        working++;
        const r = pseudo(emp.id + day + p.m); // deterministic-ish spread
        if (r < 0.05) { absent++; attendance.push(attRow(companyId, emp, date, 'Absent', '', '', 0)); }
        else if (r < 0.10) { leaveDays++; attendance.push(attRow(companyId, emp, date, 'Leave', '', '', 0, 'CL')); }
        else { present++; attendance.push(attRow(companyId, emp, date, 'Present', '09:' + pad2(5 + (day % 20)), '18:' + pad2(10 + (day % 30)), 8 + (r > 0.7 ? 1 : 0))); }
      }
      const payable = present + leaveDays + weeklyOff; // paid leaves count
      const monthName = MONTHS[p.m];
      summaries.push({
        companyId, employeeId: emp.id, month: monthName, year: p.y,
        presentDays: present, absentDays: absent, cl: leaveDays, pl: 0, sl: 0, lwp: absent,
        payableDays: payable, workingDays: working, weeklyOffDays: weeklyOff, holidayDays: 0,
        attendanceStatus: 'Complete', attendanceSource: 'Demo Data', syncedAt: now,
      });
      // Processed payroll + generated payslip for this month.
      const basic = round0(monthly * 0.5);
      const allowances = monthly - basic;
      const pf = round0(basic * 0.12);
      const esic = monthly <= 21000 ? round0(monthly * 0.0075) : 0;
      const pt = 200;
      const deductions = pf + esic + pt;
      payrolls.push({
        companyId, employeeId: emp.id, employeeName: emp.name, department: emp.department || 'General',
        month: monthName, year: p.y,
        basicSalary: basic, allowances, deductions, netSalary: Math.max(0, monthly - deductions),
        payrollStatus: 'processed', paymentStatus: 'paid', payslipGenerated: true,
        presentDays: present, lwpDays: absent, payableDays: payable, workingDays: working,
        weeklyOffDays: weeklyOff, holidayDays: 0, tax: 0,
        attendanceSyncedAt: now, attendanceSource: 'Demo Data', summarySyncedAt: now,
        processedOn: ymd(now), generatedAt: now, paymentDate: ymd(now),
      });
    }
    // ~1 in 3 employees has a leave request on file.
    if (pseudo(emp.id * 7) < 0.34) {
      const from = new Date(now.getFullYear(), now.getMonth(), Math.max(1, (emp.id % 20) + 1));
      const to = new Date(from); to.setDate(to.getDate() + 1);
      leaves.push({
        companyId, employeeId: emp.id, employeeName: emp.name, department: emp.department || 'General',
        leaveType: 'CL', fromDate: ymd(from), toDate: ymd(to), days: 2, reason: 'Personal work',
        status: pseudo(emp.id) < 0.5 ? 'Approved' : 'Pending', appliedOn: ymd(now), paidDays: 2, lwpDays: 0,
      });
    }
    // One document per employee (marker: uploadedBy = DEMO_MARKER).
    documents.push({
      companyId, employeeId: emp.id, employeeName: emp.name,
      name: 'Offer Letter', type: 'Employment', category: 'HR',
      uploadedBy: DEMO_MARKER, uploadedOn: ymd(emp.joinDate ? new Date(emp.joinDate) : now), size: '48 KB',
      status: 'Verified',
    });
  }

  // Company holiday calendar + notifications (company-level demo, marked).
  const yr = now.getFullYear();
  const holidays = [
    { name: 'Republic Day', date: `${yr}-01-26`, category: 'National' },
    { name: 'Holi', date: `${yr}-03-14`, category: 'Religious' },
    { name: 'Independence Day', date: `${yr}-08-15`, category: 'National' },
    { name: 'Gandhi Jayanti', date: `${yr}-10-02`, category: 'National' },
    { name: 'Diwali', date: `${yr}-10-29`, category: 'Religious' },
    { name: 'Christmas', date: `${yr}-12-25`, category: 'Religious' },
  ].map((h) => ({ companyId, name: h.name, date: h.date, category: h.category, isPublicHoliday: true, status: 'Active', createdBy: DEMO_MARKER, description: 'Sample holiday' }));

  const notifications = [
    { companyId, type: 'demo', title: 'Welcome to ZeniaHR', message: 'Your sample workspace is ready — explore attendance, payroll, reports and more.', timestamp: now.toISOString(), priority: 'normal' },
    { companyId, type: 'demo', title: 'Payroll processed', message: `${MONTHS[now.getMonth()]} payroll has been processed for ${emps.length} employees.`, timestamp: now.toISOString(), priority: 'normal' },
    { companyId, type: 'demo', title: 'New joinees this month', message: 'Sample employees have been added across 5 departments.', timestamp: now.toISOString(), priority: 'low' },
  ];

  // Bulk insert (createMany; skipDuplicates guards the attendance unique key).
  if (attendance.length) await prisma.attendance.createMany({ data: attendance, skipDuplicates: true });
  if (summaries.length) await prisma.attendanceSummary.createMany({ data: summaries, skipDuplicates: true });
  if (payrolls.length) await prisma.payroll.createMany({ data: payrolls, skipDuplicates: true });
  if (leaves.length) await prisma.leaveRequest.createMany({ data: leaves });
  if (documents.length) await prisma.document.createMany({ data: documents });
  if (holidays.length) await prisma.communicationHoliday.createMany({ data: holidays });
  if (notifications.length) await prisma.notification.createMany({ data: notifications });

  return {
    attendance: attendance.length, summaries: summaries.length, payroll: payrolls.length,
    leaves: leaves.length, documents: documents.length, holidays: holidays.length, notifications: notifications.length,
  };
}

const round0 = (n) => Math.round(Number(n) || 0);
// Cheap deterministic 0..1 from an int seed (avoids Math.random so re-runs are stable).
const pseudo = (seed) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
const attRow = (companyId, emp, date, status, clockIn, clockOut, hoursWorked, leaveType) => ({
  companyId, employeeId: emp.id, employeeName: emp.name, department: emp.department || 'General',
  date, clockIn: clockIn || '', clockOut: clockOut || '', status, hoursWorked, leaveType: leaveType || null,
});

// ── Remove ALL demo data for a company (one-time, irreversible) ───────────────
// Deletes ONLY demo records: demo employees (their attendance/payroll/leave/
// summary/overtime/leaveBalance cascade), plus the marked company-level rows.
// Real records are never touched. Returns per-table deletion counts.
async function removeSampleData(headCompanyId) {
  const companyId = Number(headCompanyId);
  const demoEmps = await prisma.employee.findMany({
    where: { companyId, employeeId: { startsWith: DEMO_EMPLOYEE_PREFIX } },
    select: { id: true },
  });
  const ids = demoEmps.map((e) => e.id);

  // Non-cascading, marker-tagged company-level demo rows (delete first).
  const docs = await prisma.document.deleteMany({ where: { companyId, uploadedBy: DEMO_MARKER } });
  const notes = await prisma.notification.deleteMany({ where: { companyId, type: 'demo' } });
  const hols = await prisma.communicationHoliday.deleteMany({ where: { companyId, createdBy: DEMO_MARKER } });

  // Deleting the demo employees cascades attendance / payroll / leaveRequest /
  // attendanceSummary / overtime / leaveBalance (all FK onDelete: Cascade).
  let empDeleted = 0;
  if (ids.length) {
    const del = await prisma.employee.deleteMany({ where: { id: { in: ids } } });
    empDeleted = del.count;
  }

  try {
    const HeadcountSyncService = require('./headcountSyncService');
    if (HeadcountSyncService.syncAllBranches) await HeadcountSyncService.syncAllBranches();
  } catch (_) { /* non-fatal */ }

  return { employees: empDeleted, documents: docs.count, notifications: notes.count, holidays: hols.count };
}

module.exports = {
  DEMO_EMAIL_DOMAIN, DEMO_EMPLOYEE_PREFIX, DEMO_COUNT, DEMO_MARKER,
  hasDemoData, generateDemoWorkspace, removeSampleData,
};
