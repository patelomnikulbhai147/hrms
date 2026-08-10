/**
 * ZeniaHR AI Assistant — Database-First HRMS Data & Procedural Engine
 *
 * Single Source of Truth:
 * Uses `buildEmployeeScope` from `../utils/employeeScope` for strict
 * company + branch scope isolation across all queries.
 */

const express = require('express');
const prisma = require('../config/prisma');
const { protect } = require('../middleware/authMiddleware');
const { buildEmployeeScope, NOT_OFFBOARDED } = require('../utils/employeeScope');

const router = express.Router();
router.use(protect);

const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_NAMES_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function parseDateRange(q) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (/\btoday\b/i.test(q)) {
    const d = new Date(y, m, now.getDate());
    return { start: d, end: new Date(d.getTime() + 86400000 - 1), label: 'today' };
  }
  if (/\byesterday\b/i.test(q)) {
    const d = new Date(y, m, now.getDate() - 1);
    return { start: d, end: new Date(d.getTime() + 86400000 - 1), label: 'yesterday' };
  }
  if (/\bthis\s+week\b/i.test(q)) {
    const day = now.getDay();
    const start = new Date(y, m, now.getDate() - day);
    const end = new Date(start.getTime() + 7 * 86400000 - 1);
    return { start, end, label: 'this week' };
  }
  if (/\blast\s+week\b/i.test(q)) {
    const day = now.getDay();
    const start = new Date(y, m, now.getDate() - day - 7);
    const end = new Date(start.getTime() + 7 * 86400000 - 1);
    return { start, end, label: 'last week' };
  }
  if (/\bthis\s+month\b/i.test(q)) {
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: 'this month', month: m, year: y };
  }
  if (/\blast\s+month\b/i.test(q)) {
    const lm = m === 0 ? 11 : m - 1;
    const ly = m === 0 ? y - 1 : y;
    return { start: new Date(ly, lm, 1), end: new Date(ly, lm + 1, 0, 23, 59, 59), label: 'last month', month: lm, year: ly };
  }
  if (/\blast\s+3\s+months?\b/i.test(q)) {
    return { start: new Date(y, m - 3, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: 'last 3 months' };
  }
  if (/\blast\s+6\s+months?\b/i.test(q)) {
    return { start: new Date(y, m - 6, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: 'last 6 months' };
  }
  if (/\bthis\s+year\b/i.test(q)) {
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59), label: 'this year', year: y };
  }
  if (/\blast\s+year\b/i.test(q)) {
    return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31, 23, 59, 59), label: `${y - 1}`, year: y - 1 };
  }
  for (let i = 0; i < MONTH_NAMES_FULL.length; i++) {
    const reg = new RegExp(`\\b(${MONTH_NAMES_FULL[i]}|${MONTH_NAMES_SHORT[i]})(?:\\s+(\\d{4}))?\\b`, 'i');
    const match = q.match(reg);
    if (match) {
      const yr = match[2] ? parseInt(match[2]) : y;
      return { start: new Date(yr, i, 1), end: new Date(yr, i + 1, 0, 23, 59, 59), label: `${MONTH_NAMES_FULL[i]} ${yr}`, month: i, year: yr };
    }
  }
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: 'this month', month: m, year: y };
}

function formatINR(n) {
  return '₹' + Math.round(n || 0).toLocaleString('en-IN');
}

// ─── Intent Definitions ───────────────────────────────────────────────────────
const INTENTS = [
  // PROCEDURAL INTENTS FIRST (Highest Priority)
  {
    id: 'procedural_payroll',
    type: 'procedural',
    patterns: [
      /\b(how\s+(to|can\s+i|do\s+i)\s+(generate|process|run|create|calculate)\s+payroll)\b/i,
      /\b(generate|process|run)\s+payroll\b/i,
      /\b(payroll\s+(process|procedure|steps|workflow|guide|instructions))\b/i,
      /\b(how\s+to\s+process\s+salary)\b/i,
      /\b(steps\s+to\s+generate\s+payroll)\b/i,
    ]
  },
  {
    id: 'procedural_leave',
    type: 'procedural',
    patterns: [
      /\b(how\s+(to|can\s+i|do\s+i)\s+(apply|request|take)\s+leave)\b/i,
      /\b(leave\s+(application|process|steps|procedure|workflow))\b/i,
    ]
  },
  {
    id: 'procedural_attendance',
    type: 'procedural',
    patterns: [
      /\b(how\s+(to|can\s+i|do\s+i)\s+(mark|clock\s*in|record)\s+attendance)\b/i,
      /\b(attendance\s+(marking|process|steps|procedure))\b/i,
    ]
  },
  {
    id: 'procedural_onboarding',
    type: 'procedural',
    patterns: [
      /\b(how\s+(to|can\s+i|do\s+i)\s+(add|create|onboard)\s+employee)\b/i,
      /\b(onboarding|add\s+employee)\s+(process|steps|procedure)\b/i,
    ]
  },
  {
    id: 'procedural_invoice_template',
    type: 'procedural',
    patterns: [
      /\b(how\s+(to|can\s+i|do\s+i)\s+(customize|build|change|set\s+up)\s+invoice\s+template)\b/i,
      /\b(invoice\s+template\s+(builder|designer|steps|process))\b/i,
    ]
  },

  // DATA QUESTIONS
  { id: 'not_marked_today',         type: 'data', patterns: [/\b(not\s+marked|no\s+attendance|missing\s+attendance)\b/i] },
  { id: 'absent_today',             type: 'data', patterns: [/\b(absent\s+today|today.*absent|not\s+present)\b/i] },
  { id: 'attendance_today',         type: 'data', patterns: [/\b(present\s+today|attendance\s+today|today.*attendance|today.*present|marked.*today)\b/i] },
  { id: 'leave_today',              type: 'data', patterns: [/\b(on\s+leave\s+today|leave\s+today|today.*leave)\b/i] },
  { id: 'pending_leave',            type: 'data', patterns: [/\b(pending\s+leaves?|leave\s+requests?|awaiting\s+approval|leave\s+pending)\b/i] },
  { id: 'leave_balance',            type: 'data', patterns: [/\b(leave\s+balances?|remaining\s+leaves?|leaves?\s+left|balances?.*leave)\b/i] },
  { id: 'payroll_summary',          type: 'data', patterns: [/\b(payroll|salary\s+cost|wage|total\s+salary|payroll\s+cost|payroll\s+total|payroll\s+processed)\b/i] },
  { id: 'department_breakdown',     type: 'data', patterns: [/\b(departments?|team\s+wise|dept|dept\s+count|by\s+department|in\s+each\s+department)\b/i] },
  { id: 'branch_breakdown',         type: 'data', patterns: [/\b(branches?|office\s+wise|location\s+wise)\b/i] },
  { id: 'new_joiners',              type: 'data', patterns: [/\b(join|new\s+hires?|new\s+employees?|joined|onboard)\b/i] },
  { id: 'exits',                    type: 'data', patterns: [/\b(exit|left|resign|terminat|offboard|who\s+left)\b/i] },
  { id: 'employee_count_active',    type: 'data', patterns: [/\b(active\s+employees?|employees?.*active|headcounts?|head\s*count|how\s+many\s+employees?|total\s+employees?|total\s+staff|team\s+size|staff\s+count|number\s+of\s+employees?)\b/i] },
  { id: 'employee_count_all',       type: 'data', patterns: [/\b(all\s+employees?|every\s+employee|list.*employees?)\b/i] },
  { id: 'employee_attendance',      type: 'data', patterns: [/\b(attendance\s+of|attendance\s+for|.*'s\s+attendance)\b/i] },
  { id: 'employee_leave_balance',   type: 'data', patterns: [/\b(leave\s+balance\s+of|.*'s\s+leave\s+balance|balance.*of\s+employee)\b/i] },
  { id: 'employee_salary',          type: 'data', patterns: [/\b(salary\s+of|salary\s+for|.*'s\s+salary|wage\s+of)\b/i] },
  { id: 'dashboard_summary',        type: 'data', patterns: [/\b(overview|summary|dashboard|quick\s+stat|status\s+report|tell\s+me\s+about)\b/i] },
];

function detectIntent(q) {
  const qLower = q.toLowerCase().trim();
  for (const intent of INTENTS) {
    for (const pat of intent.patterns) {
      if (pat.test(qLower)) return intent;
    }
  }
  return null;
}

function extractEmployeeName(q) {
  const cleaned = q.replace(/^(what|who|show|get|give\s+me)\s+(is|are|the|a|an)?\s+/i, '').trim();
  const patterns = [
    /\bof\s+([A-Z][a-zA-Z\s]{2,30})/i,
    /\bfor\s+([A-Z][a-zA-Z\s]{2,30})/i,
    /([A-Z][a-zA-Z\s]{2,30})'s\s+/i,
  ];
  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m) {
      const name = m[1].trim();
      if (!['the', 'our', 'this', 'my', 'a', 'an'].includes(name.toLowerCase())) return name;
    }
  }
  return null;
}

function extractDepartment(q) {
  const m = q.match(/\bin\s+(?:the\s+)?([A-Z][a-zA-Z\s]{1,30})(?:\s+department|\s+team|\s+dept)?/i);
  if (!m) return null;
  const dept = m[1].trim();
  const invalidDepts = ['each', 'each department', 'payroll', 'payroll this month', 'leave', 'leave today', 'the company'];
  if (invalidDepts.includes(dept.toLowerCase())) return null;
  return dept;
}

function extractBranch(q) {
  const m = q.match(/\b(?:in|at|from)\s+(?:the\s+)?([A-Z][a-zA-Z\s]{1,20})(?:\s+branch|\s+office)?/i);
  return m ? m[1].trim() : null;
}

// ─── Intent Resolvers ─────────────────────────────────────────────────────────
async function resolveIntent(intent, q, scopeResult, user, dateRange) {
  const qLow = q.toLowerCase();
  const { baseWhere, withStatus } = scopeResult;
  const activeWhere = withStatus(NOT_OFFBOARDED);

  // PROCEDURAL HANDLERS
  if (intent.type === 'procedural') {
    switch (intent.id) {
      case 'procedural_payroll':
        return `**How to Generate Payroll in ZeniaHR:**\n\n` +
               `1. Open **Payroll Management** from the sidebar menu.\n` +
               `2. Select the **Month and Year** (payroll period) you wish to process.\n` +
               `3. Click **Generate Payroll** — ZeniaHR will pull active eligible employees, attendance summaries, approved leaves, overtime, and loan deductions.\n` +
               `4. Review draft salaries in the **Salary Register / Worksheet**.\n` +
               `5. Use **Recalculate** if attendance or leave records were modified after generation.\n` +
               `6. Click **Approve Payroll** to finalize figures, then **Mark as Paid** to issue payouts and automatically generate employee payslips.`;

      case 'procedural_leave':
        return `**How to Apply for Leave in ZeniaHR:**\n\n` +
               `1. Go to **Leave Management** or your **ESS (Employee Self-Service) Portal**.\n` +
               `2. Click **Apply Leave**.\n` +
               `3. Select the **Leave Type** (Casual, Sick, Paid, etc.), **Start Date**, and **End Date**.\n` +
               `4. Enter your reason for leave and submit.\n` +
               `5. Your manager/HR will receive a notification to approve or reject the request.`;

      case 'procedural_attendance':
        return `**How to Mark & Manage Attendance in ZeniaHR:**\n\n` +
               `1. Navigate to **Attendance Management** or **ESS Portal**.\n` +
               `2. Click **Clock In** at the start of your shift and **Clock Out** at the end.\n` +
               `3. For biometric/eTime device integrations, hardware devices automatically sync check-ins to ZeniaHR.\n` +
               `4. HR/Managers can review daily attendance, mark manual overrides, or view attendance logs.`;

      case 'procedural_onboarding':
        return `**How to Add/Onboard a New Employee in ZeniaHR:**\n\n` +
               `1. Go to **Employee Self-Service / Employee Directory**.\n` +
               `2. Click **Add Employee** (or use Bulk Upload / Onboarding portal).\n` +
               `3. Fill in Personal Details, Official Email, Department, Designation, Branch, and Date of Joining.\n` +
               `4. Assign their Salary Structure and Leave Policy.\n` +
               `5. Click **Save** to activate the employee profile.`;

      case 'procedural_invoice_template':
        return `**How to Customize & Set Up Invoice Templates in ZeniaHR:**\n\n` +
               `1. Go to **Invoice Management** -> **Invoice Templates**.\n` +
               `2. Choose a pre-built template from the **Gallery** or click **Build Your Own Template**.\n` +
               `3. Use the **Visual Designer** to edit headers, logo, brand colors, typography, and terms.\n` +
               `4. Preview your design live.\n` +
               `5. Click **Activate Template** to ensure new invoices automatically use your custom design.`;
    }
  }

  // DATA HANDLERS
  switch (intent.id) {

    case 'employee_count_active': {
      const dept = extractDepartment(q);
      const branch = extractBranch(q);
      const queryWhere = { ...activeWhere };
      if (dept) queryWhere.department = { contains: dept };
      if (branch) {
        const br = await prisma.branch.findFirst({ where: { branchName: { contains: branch } } });
        if (br) queryWhere.branchId = br.id;
      }
      const count = await prisma.employee.count({ where: queryWhere });
      let msg = `Your company currently has **${count} active employees**`;
      if (dept) msg += ` in the **${dept}** department`;
      if (branch) msg += ` at the **${branch}** branch`;
      return msg + '.';
    }

    case 'employee_count_all': {
      const active = await prisma.employee.count({ where: activeWhere });
      const total = await prisma.employee.count({ where: baseWhere });
      return `**Employee Headcount Summary:**\n• Currently Active: **${active}**\n• Offboarded/Exited: **${total - active}**\n• Total Database Records: **${total}**`;
    }

    case 'new_joiners': {
      const dr = parseDateRange(qLow);
      const queryWhere = { ...baseWhere, joinDate: { gte: dr.start, lte: dr.end }, status: { not: 'Archived' } };
      const count = await prisma.employee.count({ where: queryWhere });
      const list = await prisma.employee.findMany({
        where: queryWhere,
        select: { name: true, department: true, designation: true, joinDate: true },
        orderBy: { joinDate: 'desc' },
        take: 10
      });
      let msg = `**${count} employee(s) joined ${dr.label}.**`;
      if (list.length > 0) {
        msg += '\n\n' + list.map(e => `• ${e.name} — ${e.designation || ''} (${e.department || ''}), joined ${new Date(e.joinDate).toLocaleDateString('en-IN')}`).join('\n');
        if (count > 10) msg += `\n_...and ${count - 10} more._`;
      }
      return msg;
    }

    case 'exits': {
      const dr = parseDateRange(qLow);
      const queryWhere = { ...baseWhere, exitDate: { gte: dr.start, lte: dr.end } };
      const count = await prisma.employee.count({ where: queryWhere });
      const list = await prisma.employee.findMany({
        where: queryWhere,
        select: { name: true, department: true, designation: true, exitDate: true, status: true },
        orderBy: { exitDate: 'desc' },
        take: 10
      });
      let msg = `**${count} employee(s) exited ${dr.label}.**`;
      if (list.length > 0) {
        msg += '\n\n' + list.map(e => `• ${e.name} — ${e.status}, ${e.department || ''}, exited ${new Date(e.exitDate).toLocaleDateString('en-IN')}`).join('\n');
      }
      return msg;
    }

    case 'department_breakdown': {
      const depts = await prisma.employee.groupBy({
        by: ['department'],
        where: activeWhere,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } }
      });
      const total = depts.reduce((s, d) => s + d._count.id, 0);
      const list = depts.map(d => `• ${d.department || 'Not Specified'}: **${d._count.id}**`).join('\n');
      return `**Department Headcount Breakdown (${total} active employees):**\n${list}`;
    }

    case 'branch_breakdown': {
      const branches = await prisma.employee.groupBy({
        by: ['branchId'],
        where: activeWhere,
        _count: { id: true }
      });
      const branchIds = branches.map(b => b.branchId).filter(Boolean);
      const branchMap = {};
      if (branchIds.length) {
        const brs = await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, branchName: true } });
        brs.forEach(b => { branchMap[b.id] = b.branchName; });
      }
      const list = branches.map(b => `• ${branchMap[b.branchId] || 'Head Office'}: **${b._count.id}**`).join('\n');
      return `**Branch Headcount Breakdown:**\n${list}`;
    }

    case 'attendance_today': {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const [presentCount, halfDayCount, activeTotal] = await Promise.all([
        prisma.attendance.count({ where: { employee: activeWhere, date: todayStr, status: 'Present' } }),
        prisma.attendance.count({ where: { employee: activeWhere, date: todayStr, status: 'Half Day' } }),
        prisma.employee.count({ where: activeWhere })
      ]);
      const markedCount = await prisma.attendance.count({ where: { employee: activeWhere, date: todayStr } });
      return `**Today's Attendance Summary (${today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}):**\n` +
             `• Active Company Employees: **${activeTotal}**\n` +
             `• Present: **${presentCount}**\n` +
             `• Half Day: **${halfDayCount}**\n` +
             `• Total Attendance Marked: **${markedCount}**\n` +
             `• Not Yet Marked: **${Math.max(0, activeTotal - markedCount)}**`;
    }

    case 'absent_today': {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const [absentCount, activeTotal, onLeaveToday, presentCount] = await Promise.all([
        prisma.attendance.count({ where: { employee: activeWhere, date: todayStr, status: 'Absent' } }),
        prisma.employee.count({ where: activeWhere }),
        prisma.leaveRequest.count({
          where: { employee: activeWhere, status: 'Approved', fromDate: { lte: todayStr }, toDate: { gte: todayStr } }
        }),
        prisma.attendance.count({ where: { employee: activeWhere, date: todayStr, status: 'Present' } })
      ]);
      return `**Today's Absence Status (${today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}):**\n` +
             `• Active Company Employees: **${activeTotal}**\n` +
             `• Present: **${presentCount}**\n` +
             `• On Approved Leave: **${onLeaveToday}**\n` +
             `• Marked Absent: **${absentCount}**\n` +
             `• Unaccounted / Pending Check-in: **${Math.max(0, activeTotal - presentCount - onLeaveToday - absentCount)}**`;
    }

    case 'not_marked_today': {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const [activeTotal, markedCount] = await Promise.all([
        prisma.employee.count({ where: activeWhere }),
        prisma.attendance.count({ where: { employee: activeWhere, date: todayStr } })
      ]);
      return `**${Math.max(0, activeTotal - markedCount)} active employee(s)** have not yet marked attendance today.\n\n` +
             `• Active Company Employees: **${activeTotal}**\n` +
             `• Attendance Marked Today: **${markedCount}**\n` +
             `• Remaining / Pending: **${Math.max(0, activeTotal - markedCount)}**`;
    }

    case 'leave_today': {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const [count, list] = await Promise.all([
        prisma.leaveRequest.count({
          where: { employee: activeWhere, status: 'Approved', fromDate: { lte: todayStr }, toDate: { gte: todayStr } }
        }),
        prisma.leaveRequest.findMany({
          where: { employee: activeWhere, status: 'Approved', fromDate: { lte: todayStr }, toDate: { gte: todayStr } },
          include: { employee: { select: { name: true, department: true } } },
          take: 10
        })
      ]);
      let msg = `**${count} employee(s) are on approved leave today.**`;
      if (list.length > 0) msg += '\n\n' + list.map(l => `• ${l.employee?.name} (${l.employee?.department || 'N/A'}) — ${l.leaveType}`).join('\n');
      if (count > 10) msg += `\n_...and ${count - 10} more._`;
      return msg;
    }

    case 'pending_leave': {
      const [count, list] = await Promise.all([
        prisma.leaveRequest.count({ where: { employee: activeWhere, status: 'Pending' } }),
        prisma.leaveRequest.findMany({
          where: { employee: activeWhere, status: 'Pending' },
          include: { employee: { select: { name: true, department: true } } },
          orderBy: { createdAt: 'desc' },
          take: 8
        })
      ]);
      let msg = `There are **${count} pending leave request(s)** awaiting approval.`;
      if (list.length > 0) {
        msg += '\n\n**Recent Pending Requests:**\n' + list.map(l => `• ${l.employee?.name} (${l.employee?.department || 'N/A'}) — ${l.leaveType}, ${l.days} day(s) from ${l.fromDate}`).join('\n');
      }
      return msg;
    }

    case 'leave_balance': {
      const nameHint = extractEmployeeName(q);
      if (!nameHint) {
        const balances = await prisma.leaveBalance.findMany({
          where: { employee: activeWhere, year: new Date().getFullYear() },
          select: { leaveType: true, balance: true },
        });
        const byType = {};
        balances.forEach(b => { byType[b.leaveType] = (byType[b.leaveType] || 0) + (b.balance || 0); });
        const list = Object.entries(byType).map(([t, b]) => `• ${t}: **${b}** total days`).join('\n');
        return `**Company Leave Balance Pool (${new Date().getFullYear()}):**\n${list || 'No leave balances configured.'}`;
      }
      const emp = await prisma.employee.findFirst({
        where: { ...activeWhere, name: { contains: nameHint } },
        select: { id: true, name: true }
      });
      if (!emp) return `I couldn't find an active employee named **${nameHint}** in your company.`;
      const bal = await prisma.leaveBalance.findMany({
        where: { employeeId: emp.id, year: new Date().getFullYear() }
      });
      if (!bal.length) return `No leave balance record found for **${emp.name}** for ${new Date().getFullYear()}.`;
      const list = bal.map(b => `• ${b.leaveType}: **${b.balance}** days remaining`).join('\n');
      return `**Leave Balance for ${emp.name} (${new Date().getFullYear()}):**\n${list}`;
    }

    case 'payroll_summary': {
      const dr = parseDateRange(qLow);
      let targetMonth, targetYear;

      if (dr.month !== undefined && dr.year !== undefined) {
        targetMonth = MONTH_NAMES_FULL[dr.month];
        targetYear = dr.year;
      } else {
        // Find latest processed/draft payroll for this company
        const latestPayroll = await prisma.payroll.findFirst({
          where: { employee: activeWhere },
          orderBy: [{ year: 'desc' }, { id: 'desc' }],
          select: { month: true, year: true }
        });
        if (latestPayroll) {
          targetMonth = latestPayroll.month;
          targetYear = latestPayroll.year;
        } else {
          const now = new Date();
          targetMonth = MONTH_NAMES_FULL[now.getMonth()];
          targetYear = now.getFullYear();
        }
      }

      const payrollWhere = { employee: activeWhere, month: targetMonth, year: targetYear };

      const [activeEmployeeCount, payrollRows, agg] = await Promise.all([
        prisma.employee.count({ where: activeWhere }),
        prisma.payroll.findMany({
          where: payrollWhere,
          select: { employeeId: true }
        }),
        prisma.payroll.aggregate({
          where: payrollWhere,
          _sum: { netSalary: true, basicSalary: true, allowances: true, deductions: true }
        })
      ]);

      const uniqueProcessedCount = new Set(payrollRows.map(p => p.employeeId)).size;
      const basic = agg._sum.basicSalary || 0;
      const allowances = agg._sum.allowances || 0;
      const gross = basic + allowances;
      const deductions = agg._sum.deductions || 0;
      const net = agg._sum.netSalary || 0;

      if (uniqueProcessedCount === 0) {
        return `No payroll records have been generated yet for **${targetMonth} ${targetYear}**.\n\n` +
               `• Active Company Employees: **${activeEmployeeCount}**\n` +
               `• Payroll Status: Not Generated\n\n` +
               `_Ask "How to generate payroll?" to learn the step-by-step process._`;
      }

      let diffNote = '';
      if (activeEmployeeCount !== uniqueProcessedCount) {
        const diff = Math.abs(activeEmployeeCount - uniqueProcessedCount);
        diffNote = ` _(${diff} active employee(s) not included in this payroll run)_`;
      }

      return `**Payroll Summary — ${targetMonth} ${targetYear}:**\n` +
             `• Active Company Employees: **${activeEmployeeCount}**\n` +
             `• Employees Processed in Payroll: **${uniqueProcessedCount}**${diffNote}\n` +
             `• Gross Payroll: **${formatINR(gross)}**\n` +
             `• Total Deductions: **${formatINR(deductions)}**\n` +
             `• Net Payroll (Take-home): **${formatINR(net)}**`;
    }

    case 'employee_attendance': {
      const nameHint = extractEmployeeName(q);
      if (!nameHint) return 'Please specify an employee name. For example: "What is Hemlata\'s attendance this month?"';
      const emps = await prisma.employee.findMany({
        where: { ...activeWhere, name: { contains: nameHint } },
        select: { id: true, name: true, department: true },
        take: 5
      });
      if (!emps.length) return `I couldn't find an active employee named **${nameHint}** in your company.`;
      if (emps.length > 1) return `I found **${emps.length} employees** matching "${nameHint}":\n` + emps.map(e => `• ${e.name} (${e.department || 'N/A'})`).join('\n') + '\n\nPlease be more specific (e.g., full name).';
      const emp = emps[0];
      const dr = parseDateRange(qLow);
      const startStr = dr.start.toISOString().split('T')[0];
      const endStr = dr.end.toISOString().split('T')[0];
      const records = await prisma.attendance.findMany({
        where: { employeeId: emp.id, date: { gte: startStr, lte: endStr } },
        orderBy: { date: 'desc' }
      });
      const present = records.filter(r => r.status === 'Present').length;
      const absent = records.filter(r => r.status === 'Absent').length;
      const halfDay = records.filter(r => r.status === 'Half Day').length;
      const total = records.length;
      return `**Attendance Report for ${emp.name} — ${dr.label}:**\n` +
             `• Days Recorded: **${total}**\n` +
             `• Present: **${present}**\n` +
             `• Absent: **${absent}**\n` +
             `• Half Day: **${halfDay}**\n` +
             `• Attendance Rate: **${total > 0 ? ((present + halfDay * 0.5) / total * 100).toFixed(1) : 0}%**`;
    }

    case 'employee_salary': {
      const allowedRoles = ['Company Head', 'HR', 'Finance', 'Super Admin'];
      if (!allowedRoles.includes(user.role)) {
        return "I don't have permission to share salary information with your role. Please contact HR or your system administrator.";
      }
      const nameHint = extractEmployeeName(q);
      if (!nameHint) return 'Please specify an employee name. For example: "What is Hemlata\'s salary?"';
      const emps = await prisma.employee.findMany({
        where: { ...activeWhere, name: { contains: nameHint } },
        select: { id: true, name: true, department: true, designation: true, salary: true },
        take: 5
      });
      if (!emps.length) return `I couldn't find an active employee named **${nameHint}** in your company.`;
      if (emps.length > 1) return `I found **${emps.length} employees** matching "${nameHint}". Please specify their full name.`;
      const emp = emps[0];
      const lastPayroll = await prisma.payroll.findFirst({
        where: { employeeId: emp.id },
        orderBy: [{ year: 'desc' }, { id: 'desc' }]
      });
      let msg = `**Salary Info for ${emp.name} (${emp.designation || 'Staff'}):**\n• Basic Base Salary: **${formatINR(emp.salary)}**`;
      if (lastPayroll) {
        msg += `\n• Last Processed Payroll (${lastPayroll.month} ${lastPayroll.year}):\n` +
               `  - Gross: **${formatINR((lastPayroll.basicSalary || 0) + (lastPayroll.allowances || 0))}**\n` +
               `  - Deductions: **${formatINR(lastPayroll.deductions)}**\n` +
               `  - Net Take-home: **${formatINR(lastPayroll.netSalary)}**`;
      }
      return msg;
    }

    case 'employee_leave_balance': {
      const nameHint = extractEmployeeName(q);
      if (!nameHint) return 'Please specify an employee name. For example: "What is Hemlata\'s leave balance?"';
      const emps = await prisma.employee.findMany({
        where: { ...activeWhere, name: { contains: nameHint } },
        select: { id: true, name: true },
        take: 5
      });
      if (!emps.length) return `I couldn't find an active employee named **${nameHint}** in your company.`;
      if (emps.length > 1) return `I found **${emps.length} employees** matching "${nameHint}". Please specify full name.`;
      const emp = emps[0];
      const bal = await prisma.leaveBalance.findMany({ where: { employeeId: emp.id, year: new Date().getFullYear() } });
      if (!bal.length) return `No leave balance record found for **${emp.name}** for ${new Date().getFullYear()}.`;
      return `**Leave Balance for ${emp.name} (${new Date().getFullYear()}):**\n` + bal.map(b => `• ${b.leaveType}: **${b.balance}** days remaining`).join('\n');
    }

    case 'dashboard_summary': {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const [active, pending, presentToday, onLeave, newJoiners] = await Promise.all([
        prisma.employee.count({ where: activeWhere }),
        prisma.leaveRequest.count({ where: { employee: activeWhere, status: 'Pending' } }),
        prisma.attendance.count({ where: { employee: activeWhere, date: todayStr, status: 'Present' } }),
        prisma.leaveRequest.count({ where: { employee: activeWhere, status: 'Approved', fromDate: { lte: todayStr }, toDate: { gte: todayStr } } }),
        prisma.employee.count({ where: { ...baseWhere, joinDate: { gte: monthStart }, status: { not: 'Archived' } } }),
      ]);

      return `**ZeniaHR Live Dashboard — ${today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}**\n\n` +
             `👥 Active Company Employees: **${active}**\n` +
             `✅ Present Today: **${presentToday}**\n` +
             `🏖️ On Leave Today: **${onLeave}**\n` +
             `⏳ Pending Leave Requests: **${pending}**\n` +
             `🆕 New Joiners This Month: **${newJoiners}**\n\n` +
             `_Ask me anything specific about your company data or workflows!_`;
    }

    default:
      return null;
  }
}

// ─── Main Query Handler ───────────────────────────────────────────────────────
async function processQuery(query, user, reqCompanyId) {
  // Use buildEmployeeScope (SINGLE SOURCE OF TRUTH) for workspace scope resolution
  const reqScopeAdapter = {
    user,
    query: { companyId: reqCompanyId },
    headers: { 'x-workspace-id': reqCompanyId }
  };
  const scopeResult = buildEmployeeScope(reqScopeAdapter);
  if (!scopeResult.ok) {
    return "I don't have permission to access that workspace's information.";
  }

  const qLow = query.toLowerCase().trim();
  const dateRange = parseDateRange(qLow);
  const intent = detectIntent(qLow);

  try {
    const nameHint = extractEmployeeName(query);
    let resolvedIntent = intent;

    if (nameHint && !intent) {
      if (/attendance/.test(qLow)) resolvedIntent = INTENTS.find(i => i.id === 'employee_attendance');
      else if (/leave\s+balance/.test(qLow)) resolvedIntent = INTENTS.find(i => i.id === 'employee_leave_balance');
      else if (/salary|wage|pay/.test(qLow)) resolvedIntent = INTENTS.find(i => i.id === 'employee_salary');
    }

    if (nameHint && intent && intent.id === 'attendance_today') resolvedIntent = INTENTS.find(i => i.id === 'employee_attendance');
    if (nameHint && intent && intent.id === 'leave_balance') resolvedIntent = INTENTS.find(i => i.id === 'employee_leave_balance');
    if (nameHint && intent && intent.id === 'payroll_summary') resolvedIntent = INTENTS.find(i => i.id === 'employee_salary');

    if (resolvedIntent) {
      const answer = await resolveIntent(resolvedIntent, query, scopeResult, user, dateRange);
      if (answer) return answer;
    }

    // Explicit UNKNOWN response — do NOT output generic statistics when question is unknown
    return `I don't have enough information in ZeniaHR to answer that question accurately.\n\n` +
           `You can ask me about:\n` +
           `• **Data Questions**: "How many active employees?", "What is this month's payroll?", "Who is on leave today?"\n` +
           `• **Procedural Workflows**: "How do I generate payroll?", "How to apply for leave?", "How to add an employee?"`;

  } catch (err) {
    console.error('[AI] Query error:', err);
    return "I couldn't retrieve the latest HRMS data right now. Please try again in a moment.";
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────
router.post('/query', async (req, res) => {
  try {
    const { companyId, employeeId, query } = req.body;
    if (!query || !query.trim()) return res.status(400).json({ error: 'query is required' });

    const response = await processQuery(query, req.user, companyId || req.user?.companyId);

    let chat;
    try {
      chat = await prisma.aiChatHistory.create({
        data: {
          companyId: Number(companyId || req.user?.companyId),
          employeeId: employeeId ? Number(employeeId) : null,
          message: query,
          response,
        }
      });
    } catch (_) {
      chat = { id: Date.now(), message: query, response, createdAt: new Date() };
    }

    res.json(chat);
  } catch (error) {
    console.error('[AI] Handler error:', error);
    res.status(500).json({ error: 'Failed to process AI query' });
  }
});

router.get('/history/:companyId', async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    if (req.user.role !== 'Super Admin' && req.user.companyId !== companyId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const history = await prisma.aiChatHistory.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

router.get('/history/:employeeId/legacy', async (_req, res) => res.json([]));

module.exports = router;
