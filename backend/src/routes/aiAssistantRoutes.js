/**
 * ZeniaHR AI Assistant — Database-First HRMS Chatbot
 *
 * Architecture:
 *  1. NLP intent detection (multi-pattern, no hard-coded answers)
 *  2. Company/branch scope enforced on every query
 *  3. All answers come from live DB data
 *  4. Supports dates, employee names, departments, branches in questions
 */

const express = require('express');
const prisma = require('../config/prisma');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

// ─── Date Helpers ────────────────────────────────────────────────────────────
const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function parseDateRange(q) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (/\btoday\b/.test(q)) {
    const d = new Date(y, m, now.getDate());
    return { start: d, end: new Date(d.getTime() + 86400000 - 1), label: 'today' };
  }
  if (/\byesterday\b/.test(q)) {
    const d = new Date(y, m, now.getDate() - 1);
    return { start: d, end: new Date(d.getTime() + 86400000 - 1), label: 'yesterday' };
  }
  if (/\bthis\s+week\b/.test(q)) {
    const day = now.getDay();
    const start = new Date(y, m, now.getDate() - day);
    const end = new Date(start.getTime() + 7 * 86400000 - 1);
    return { start, end, label: 'this week' };
  }
  if (/\blast\s+week\b/.test(q)) {
    const day = now.getDay();
    const start = new Date(y, m, now.getDate() - day - 7);
    const end = new Date(start.getTime() + 7 * 86400000 - 1);
    return { start, end, label: 'last week' };
  }
  if (/\bthis\s+month\b/.test(q)) {
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: 'this month', month: m, year: y };
  }
  if (/\blast\s+month\b/.test(q)) {
    const lm = m === 0 ? 11 : m - 1;
    const ly = m === 0 ? y - 1 : y;
    return { start: new Date(ly, lm, 1), end: new Date(ly, lm + 1, 0, 23, 59, 59), label: 'last month', month: lm, year: ly };
  }
  if (/\blast\s+3\s+months?\b/.test(q)) {
    return { start: new Date(y, m - 3, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: 'last 3 months' };
  }
  if (/\blast\s+6\s+months?\b/.test(q)) {
    return { start: new Date(y, m - 6, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: 'last 6 months' };
  }
  if (/\bthis\s+year\b/.test(q)) {
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59), label: 'this year', year: y };
  }
  if (/\blast\s+year\b/.test(q)) {
    return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31, 23, 59, 59), label: `${y - 1}`, year: y - 1 };
  }
  // Named month e.g. "january", "march 2026"
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const reg = new RegExp(`\\b${MONTH_NAMES[i]}(?:\\s+(\\d{4}))?\\b`);
    const match = q.match(reg);
    if (match) {
      const yr = match[1] ? parseInt(match[1]) : y;
      return { start: new Date(yr, i, 1), end: new Date(yr, i + 1, 0, 23, 59, 59), label: `${MONTH_NAMES[i]} ${yr}`, month: i, year: yr };
    }
  }
  // Default: this month
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59), label: 'this month', month: m, year: y };
}

function formatINR(n) {
  return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ─── Company Scope Builder ────────────────────────────────────────────────────
function buildScope(user, reqCompanyId) {
  const cId = Number(reqCompanyId || user.companyId);
  if (user.role === 'Super Admin') return { companyId: cId };
  const companyScope = [user.companyId, ...(user.accessibleCompanyIds || [])].filter(Boolean).map(Number);
  const branchScope = (user.accessibleBranchIds || []).filter(Boolean).map(Number);
  if (!companyScope.includes(cId) && !branchScope.includes(cId)) {
    return null; // unauthorized
  }
  if (branchScope.length > 0 && !companyScope.includes(cId)) {
    // branch-only user
    return { branchId: { in: branchScope } };
  }
  return { companyId: cId };
}

// ─── Intent Patterns ─────────────────────────────────────────────────────────
const INTENTS = [
  // Employee counts
  { id: 'employee_count_active',    patterns: [/\b(active\s+employee|employee.*active|headcount|head\s*count|how\s+many\s+employee|total\s+employee|total\s+staff|team\s+size|staff\s+count|number\s+of\s+employee)\b/] },
  { id: 'employee_count_all',       patterns: [/\b(all\s+employee|every\s+employee|list.*employee)\b/] },
  { id: 'new_joiners',              patterns: [/\b(join|new\s+hire|new\s+employee|joined|onboard)\b/] },
  { id: 'exits',                    patterns: [/\b(exit|left|resign|terminat|offboard|who\s+left)\b/] },
  { id: 'department_breakdown',     patterns: [/\b(department|team\s+wise|dept|dept\s+count|by\s+department)\b/] },
  { id: 'branch_breakdown',         patterns: [/\b(branch|office\s+wise|location\s+wise)\b/] },

  // Attendance
  { id: 'attendance_today',         patterns: [/\b(present\s+today|attendance\s+today|today.*attendance|today.*present|marked.*today)\b/] },
  { id: 'absent_today',             patterns: [/\b(absent\s+today|today.*absent|not\s+present|not\s+mark)\b/] },
  { id: 'late_today',               patterns: [/\b(late\s+today|today.*late|late\s+coming|late\s+arrival)\b/] },
  { id: 'not_marked_today',         patterns: [/\b(not\s+marked|no\s+attendance|missing\s+attendance)\b/] },

  // Leave
  { id: 'leave_today',              patterns: [/\b(on\s+leave\s+today|leave\s+today|today.*leave)\b/] },
  { id: 'pending_leave',            patterns: [/\b(pending\s+leave|leave\s+request|awaiting\s+approval|leave\s+pending)\b/] },
  { id: 'leave_balance',            patterns: [/\b(leave\s+balance|remaining\s+leave|leave\s+left|balance.*leave)\b/] },

  // Payroll
  { id: 'payroll_summary',          patterns: [/\b(payroll|salary\s+cost|wage|total\s+salary|payroll\s+cost|payroll\s+total)\b/] },

  // Specific employee
  { id: 'employee_attendance',      patterns: [/\b(attendance\s+of|attendance\s+for|.*'s\s+attendance)\b/] },
  { id: 'employee_leave_balance',   patterns: [/\b(leave\s+balance\s+of|.*'s\s+leave\s+balance|balance.*of\s+employee)\b/] },
  { id: 'employee_salary',          patterns: [/\b(salary\s+of|salary\s+for|.*'s\s+salary|wage\s+of)\b/] },

  // Dashboard summary
  { id: 'dashboard_summary',        patterns: [/\b(overview|summary|dashboard|quick\s+stat|status\s+report|tell\s+me\s+about)\b/] },
];

function detectIntent(q) {
  const qLower = q.toLowerCase();
  for (const intent of INTENTS) {
    for (const pat of intent.patterns) {
      if (pat.test(qLower)) return intent.id;
    }
  }
  return null;
}

// ─── Extract employee name from question ─────────────────────────────────────
function extractEmployeeName(q) {
  // "attendance of Hemlata", "Hemlata's attendance", "salary of John Doe"
  const patterns = [
    /\bof\s+([A-Z][a-zA-Z\s]{2,30})/,
    /\bfor\s+([A-Z][a-zA-Z\s]{2,30})/,
    /([A-Z][a-zA-Z\s]{2,30})'s\s+/,
  ];
  for (const p of patterns) {
    const m = q.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

// ─── Extract department from question ────────────────────────────────────────
function extractDepartment(q) {
  const m = q.match(/\bin\s+(?:the\s+)?([A-Z][a-zA-Z\s]{1,30})(?:\s+department|\s+team|\s+dept)?/i);
  return m ? m[1].trim() : null;
}

// ─── Extract branch from question ────────────────────────────────────────────
function extractBranch(q) {
  const m = q.match(/\b(?:in|at|from)\s+(?:the\s+)?([A-Z][a-zA-Z\s]{1,20})(?:\s+branch|\s+office)?/i);
  return m ? m[1].trim() : null;
}

// ─── Intent Resolvers ─────────────────────────────────────────────────────────
const OFFBOARDED = ['Offboarded', 'Archived', 'Resigned', 'Terminated', 'Inactive'];

async function resolveIntent(intent, q, scope, user, dateRange) {
  const qLow = q.toLowerCase();

  switch (intent) {

    case 'employee_count_active': {
      const dept = extractDepartment(q);
      const branch = extractBranch(q);
      const where = { ...scope, status: { notIn: OFFBOARDED } };
      if (dept) where.department = { contains: dept };
      if (branch) {
        const br = await prisma.branch.findFirst({ where: { branchName: { contains: branch } } });
        if (br) where.branchId = br.id;
      }
      const count = await prisma.employee.count({ where });
      let msg = `Your company currently has **${count} active employees**`;
      if (dept) msg += ` in the **${dept}** department`;
      if (branch) msg += ` at the **${branch}** branch`;
      return msg + '.';
    }

    case 'employee_count_all': {
      const active = await prisma.employee.count({ where: { ...scope, status: { notIn: OFFBOARDED } } });
      const total = await prisma.employee.count({ where: { ...scope } });
      return `**Employee Summary:**\n• Total (including ex-employees): **${total}**\n• Currently Active: **${active}**\n• Previous/Offboarded: **${total - active}**`;
    }

    case 'new_joiners': {
      const dr = parseDateRange(qLow);
      const count = await prisma.employee.count({
        where: { ...scope, joinDate: { gte: dr.start, lte: dr.end }, status: { not: 'Archived' } }
      });
      const list = await prisma.employee.findMany({
        where: { ...scope, joinDate: { gte: dr.start, lte: dr.end }, status: { not: 'Archived' } },
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
      const count = await prisma.employee.count({
        where: { ...scope, exitDate: { gte: dr.start, lte: dr.end }, status: { in: OFFBOARDED } }
      });
      const list = await prisma.employee.findMany({
        where: { ...scope, exitDate: { gte: dr.start, lte: dr.end }, status: { in: OFFBOARDED } },
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
        where: { ...scope, status: { notIn: OFFBOARDED } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } }
      });
      const total = depts.reduce((s, d) => s + d._count.id, 0);
      const list = depts.map(d => `• ${d.department || 'Not Specified'}: **${d._count.id}**`).join('\n');
      return `**Department Headcount (${total} active employees):**\n${list}`;
    }

    case 'branch_breakdown': {
      const branches = await prisma.employee.groupBy({
        by: ['branchId'],
        where: { ...scope, status: { notIn: OFFBOARDED } },
        _count: { id: true }
      });
      const branchIds = branches.map(b => b.branchId).filter(Boolean);
      const branchMap = {};
      if (branchIds.length) {
        const brs = await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, branchName: true } });
        brs.forEach(b => { branchMap[b.id] = b.branchName; });
      }
      const list = branches.map(b => `• ${branchMap[b.branchId] || 'Main Office'}: **${b._count.id}**`).join('\n');
      const nobranchCount = await prisma.employee.count({ where: { ...scope, status: { notIn: OFFBOARDED }, branchId: null } });
      return `**Branch-wise Headcount:**\n${list}${nobranchCount > 0 ? `\n• Head Office (unassigned): **${nobranchCount}**` : ''}`;
    }

    case 'attendance_today': {
      const today = new Date();
      const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const companyId = scope.companyId;

      const [presentCount, halfDayCount, activeTotal] = await Promise.all([
        prisma.attendance.count({ where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr, status: 'Present' } }),
        prisma.attendance.count({ where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr, status: 'Half Day' } }),
        prisma.employee.count({ where: { ...scope, status: { notIn: OFFBOARDED } } })
      ]);
      const total = await prisma.attendance.count({ where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr } });
      return `**Today's Attendance (${today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}):**\n• Active Employees: **${activeTotal}**\n• Marked Present: **${presentCount}**\n• Half Day: **${halfDayCount}**\n• Attendance Marked: **${total}**\n• Not Yet Marked: **${Math.max(0, activeTotal - total)}**`;
    }

    case 'absent_today': {
      const today = new Date();
      const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const companyId = scope.companyId;

      const [absentCount, activeTotal, onLeaveToday] = await Promise.all([
        prisma.attendance.count({ where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr, status: 'Absent' } }),
        prisma.employee.count({ where: { ...scope, status: { notIn: OFFBOARDED } } }),
        prisma.leaveRequest.count({
          where: {
            ...(companyId ? { employee: { companyId } } : {}),
            status: 'Approved',
            startDate: { lte: todayStr },
            endDate: { gte: todayStr }
          }
        })
      ]);
      const presentCount = await prisma.attendance.count({ where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr, status: 'Present' } });
      return `**Absent Today (${today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}):**\n• Active Employees: **${activeTotal}**\n• Present: **${presentCount}**\n• On Approved Leave: **${onLeaveToday}**\n• Marked Absent: **${absentCount}**\n• Unaccounted: **${Math.max(0, activeTotal - presentCount - onLeaveToday - absentCount)}**`;
    }

    case 'late_today': {
      const today = new Date();
      const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const companyId = scope.companyId;
      const lateCount = await prisma.attendance.count({
        where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr, isLate: true }
      });
      const late = await prisma.attendance.findMany({
        where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr, isLate: true },
        include: { employee: { select: { name: true, department: true } } },
        take: 10
      });
      let msg = `**${lateCount} employee(s) came in late today.**`;
      if (late.length > 0) msg += '\n\n' + late.map(a => `• ${a.employee?.name} (${a.employee?.department || ''})`).join('\n');
      return msg;
    }

    case 'not_marked_today': {
      const today = new Date();
      const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const companyId = scope.companyId;
      const [activeTotal, markedCount] = await Promise.all([
        prisma.employee.count({ where: { ...scope, status: { notIn: OFFBOARDED } } }),
        prisma.attendance.count({ where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr } })
      ]);
      return `**${Math.max(0, activeTotal - markedCount)} active employee(s)** have not yet marked attendance today.\n\n• Active Employees: **${activeTotal}**\n• Attendance Marked: **${markedCount}**\n• Not Yet Marked: **${Math.max(0, activeTotal - markedCount)}**`;
    }

    case 'leave_today': {
      const today = new Date();
      const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const companyId = scope.companyId;
      const [count, list] = await Promise.all([
        prisma.leaveRequest.count({
          where: { ...(companyId ? { employee: { companyId } } : {}), status: 'Approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } }
        }),
        prisma.leaveRequest.findMany({
          where: { ...(companyId ? { employee: { companyId } } : {}), status: 'Approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } },
          include: { employee: { select: { name: true, department: true } } },
          take: 10
        })
      ]);
      let msg = `**${count} employee(s) are on approved leave today.**`;
      if (list.length > 0) msg += '\n\n' + list.map(l => `• ${l.employee?.name} (${l.employee?.department || ''}) — ${l.leaveType}`).join('\n');
      if (count > 10) msg += `\n_...and ${count - 10} more._`;
      return msg;
    }

    case 'pending_leave': {
      const companyId = scope.companyId;
      const [count, list] = await Promise.all([
        prisma.leaveRequest.count({ where: { ...(companyId ? { employee: { companyId } } : {}), status: 'Pending' } }),
        prisma.leaveRequest.findMany({
          where: { ...(companyId ? { employee: { companyId } } : {}), status: 'Pending' },
          include: { employee: { select: { name: true, department: true } } },
          orderBy: { createdAt: 'desc' },
          take: 8
        })
      ]);
      let msg = `There are **${count} pending leave request(s)** awaiting approval.`;
      if (list.length > 0) {
        msg += '\n\n**Most Recent:**\n' + list.map(l => `• ${l.employee?.name} (${l.employee?.department || ''}) — ${l.leaveType}, ${l.days} day(s) from ${new Date(l.startDate).toLocaleDateString('en-IN')}`).join('\n');
      }
      return msg;
    }

    case 'leave_balance': {
      const nameHint = extractEmployeeName(q);
      const companyId = scope.companyId;
      if (!nameHint) {
        // aggregate
        const balances = await prisma.leaveBalance.findMany({
          where: companyId ? { employee: { companyId }, year: new Date().getFullYear() } : { year: new Date().getFullYear() },
          select: { leaveType: true, balance: true },
        });
        const byType = {};
        balances.forEach(b => { byType[b.leaveType] = (byType[b.leaveType] || 0) + (b.balance || 0); });
        const list = Object.entries(byType).map(([t, b]) => `• ${t}: **${b}** days`).join('\n');
        return `**Company Leave Balance Summary (this year):**\n${list || 'No leave balance data available.'}`;
      }
      // Specific employee
      const emp = await prisma.employee.findFirst({
        where: { ...(companyId ? { companyId } : {}), name: { contains: nameHint } },
        select: { id: true, name: true }
      });
      if (!emp) return `I couldn't find an employee named **${nameHint}** in your company.`;
      const bal = await prisma.leaveBalance.findMany({
        where: { employeeId: emp.id, year: new Date().getFullYear() }
      });
      if (!bal.length) return `No leave balance data found for **${emp.name}** this year.`;
      const list = bal.map(b => `• ${b.leaveType}: **${b.balance}** days remaining`).join('\n');
      return `**Leave Balance for ${emp.name} (${new Date().getFullYear()}):**\n${list}`;
    }

    case 'payroll_summary': {
      const dr = parseDateRange(qLow);
      // Use Payroll model (has month/year string format)
      const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const companyId = scope.companyId;

      // Check if we have a specific month/year
      let payrollWhere = companyId ? { employee: { companyId } } : {};

      if (dr.month !== undefined && dr.year !== undefined) {
        payrollWhere.month = MONTH_NAMES_FULL[dr.month];
        payrollWhere.year = dr.year;
      } else {
        // Date range fallback using joinDate equivalent
        payrollWhere.year = dr.year || new Date().getFullYear();
      }

      const agg = await prisma.payroll.aggregate({
        where: payrollWhere,
        _sum: { netSalary: true, grossSalary: true, totalDeductions: true, pfEmployee: true, esiEmployee: true },
        _count: { id: true }
      });

      const net = agg._sum.netSalary || 0;
      const gross = agg._sum.grossSalary || 0;
      const deductions = agg._sum.totalDeductions || 0;
      const pf = agg._sum.pfEmployee || 0;
      const esi = agg._sum.esiEmployee || 0;
      const count = agg._count.id || 0;

      if (count === 0) return `No payroll records found for **${dr.label}**. Payroll may not have been processed yet.`;

      return `**Payroll Summary — ${dr.label}:**\n• Employees Processed: **${count}**\n• Gross Payroll: **${formatINR(gross)}**\n• Total Deductions: **${formatINR(deductions)}** (PF: ${formatINR(pf)}, ESI: ${formatINR(esi)})\n• Net Payroll (Take-home): **${formatINR(net)}**`;
    }

    case 'employee_attendance': {
      const nameHint = extractEmployeeName(q);
      if (!nameHint) return 'Please specify the employee name. For example: "What is Hemlata\'s attendance this month?"';
      const companyId = scope.companyId;
      const emps = await prisma.employee.findMany({
        where: { ...(companyId ? { companyId } : {}), name: { contains: nameHint } },
        select: { id: true, name: true, department: true },
        take: 5
      });
      if (!emps.length) return `I couldn't find an employee named **${nameHint}** in your company.`;
      if (emps.length > 1) return `I found **${emps.length} employees** matching "${nameHint}":\n` + emps.map(e => `• ${e.name} (${e.department || 'N/A'})`).join('\n') + '\n\nPlease be more specific (e.g., full name).';
      const emp = emps[0];
      const dr = parseDateRange(qLow);
      const records = await prisma.attendance.findMany({
        where: { employeeId: emp.id, date: { gte: dr.start, lte: dr.end } },
        orderBy: { date: 'desc' }
      });
      const present = records.filter(r => r.status === 'Present').length;
      const absent = records.filter(r => r.status === 'Absent').length;
      const halfDay = records.filter(r => r.status === 'Half Day').length;
      const late = records.filter(r => r.isLate).length;
      const total = records.length;
      return `**Attendance Report for ${emp.name} — ${dr.label}:**\n• Total Days Recorded: **${total}**\n• Present: **${present}**\n• Absent: **${absent}**\n• Half Day: **${halfDay}**\n• Late Arrivals: **${late}**\n• Attendance Rate: **${total > 0 ? ((present + halfDay * 0.5) / total * 100).toFixed(1) : 0}%**`;
    }

    case 'employee_salary': {
      // Only Company Head / HR / Finance / Super Admin can see salary
      const allowedRoles = ['Company Head', 'HR', 'Finance', 'Super Admin'];
      if (!allowedRoles.includes(user.role)) {
        return "I don't have permission to share salary information with your role. Please contact HR or your system administrator.";
      }
      const nameHint = extractEmployeeName(q);
      if (!nameHint) return 'Please specify the employee name. For example: "What is Hemlata\'s salary?"';
      const companyId = scope.companyId;
      const emps = await prisma.employee.findMany({
        where: { ...(companyId ? { companyId } : {}), name: { contains: nameHint } },
        select: { id: true, name: true, department: true, designation: true, salary: true },
        take: 5
      });
      if (!emps.length) return `I couldn't find an employee named **${nameHint}** in your company.`;
      if (emps.length > 1) return `I found **${emps.length} employees** matching "${nameHint}":\n` + emps.map(e => `• ${e.name} (${e.department || 'N/A'})`).join('\n') + '\n\nPlease provide the full name.';
      const emp = emps[0];
      const lastPayroll = await prisma.payroll.findFirst({
        where: { employeeId: emp.id },
        orderBy: [{ year: 'desc' }, { id: 'desc' }]
      });
      let msg = `**Salary Info for ${emp.name} (${emp.designation || ''}):**\n• Basic Salary: **${formatINR(emp.salary)}**`;
      if (lastPayroll) {
        msg += `\n• Last Payroll (${lastPayroll.month} ${lastPayroll.year}):\n  - Gross: **${formatINR(lastPayroll.grossSalary)}**\n  - Net Take-home: **${formatINR(lastPayroll.netSalary)}**\n  - Deductions: **${formatINR(lastPayroll.totalDeductions)}**`;
      }
      return msg;
    }

    case 'employee_leave_balance': {
      const nameHint = extractEmployeeName(q);
      if (!nameHint) return 'Please specify the employee name. For example: "What is Hemlata\'s leave balance?"';
      const companyId = scope.companyId;
      const emps = await prisma.employee.findMany({
        where: { ...(companyId ? { companyId } : {}), name: { contains: nameHint } },
        select: { id: true, name: true },
        take: 5
      });
      if (!emps.length) return `I couldn't find an employee named **${nameHint}** in your company.`;
      if (emps.length > 1) return `I found **${emps.length} employees** matching "${nameHint}". Please provide the full name.`;
      const emp = emps[0];
      const bal = await prisma.leaveBalance.findMany({ where: { employeeId: emp.id, year: new Date().getFullYear() } });
      if (!bal.length) return `No leave balance data found for **${emp.name}** this year.`;
      return `**Leave Balance for ${emp.name} (${new Date().getFullYear()}):**\n` + bal.map(b => `• ${b.leaveType}: **${b.balance}** days remaining`).join('\n');
    }

    case 'dashboard_summary': {
      const companyId = scope.companyId;
      const today = new Date();
      const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const [active, pending, presentToday, onLeave, newJoiners] = await Promise.all([
        prisma.employee.count({ where: { ...scope, status: { notIn: OFFBOARDED } } }),
        prisma.leaveRequest.count({ where: { ...(companyId ? { employee: { companyId } } : {}), status: 'Pending' } }),
        prisma.attendance.count({ where: { ...(companyId ? { employee: { companyId } } : {}), date: todayStr, status: 'Present' } }),
        prisma.leaveRequest.count({ where: { ...(companyId ? { employee: { companyId } } : {}), status: 'Approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } } }),
        prisma.employee.count({ where: { ...scope, joinDate: { gte: monthStart }, status: { not: 'Archived' } } }),
      ]);

      return `**ZeniaHR Live Dashboard — ${today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}**\n\n👥 Active Employees: **${active}**\n✅ Present Today: **${presentToday}**\n🏖️ On Leave Today: **${onLeave}**\n⏳ Pending Leave Requests: **${pending}**\n🆕 New Joiners This Month: **${newJoiners}**\n\nAsk me anything more specific!`;
    }

    default:
      return null;
  }
}

// ─── Main Query Handler ───────────────────────────────────────────────────────
async function processQuery(query, user, reqCompanyId) {
  const scope = buildScope(user, reqCompanyId);
  if (!scope) {
    return "I don't have permission to access that company's data.";
  }

  const qLow = query.toLowerCase().trim();
  const dateRange = parseDateRange(qLow);
  const intent = detectIntent(qLow);

  try {
    // Named employee question detection (fallback)
    const nameHint = extractEmployeeName(query);
    let resolvedIntent = intent;

    // If name is mentioned, refine intent
    if (nameHint && !intent) {
      if (/attendance/.test(qLow)) resolvedIntent = 'employee_attendance';
      else if (/leave\s+balance/.test(qLow)) resolvedIntent = 'employee_leave_balance';
      else if (/salary|wage|pay/.test(qLow)) resolvedIntent = 'employee_salary';
    }

    // Also refine if both name and intent
    if (nameHint && intent === 'attendance_today') resolvedIntent = 'employee_attendance';
    if (nameHint && intent === 'leave_balance') resolvedIntent = 'employee_leave_balance';
    if (nameHint && intent === 'payroll_summary') resolvedIntent = 'employee_salary';

    if (resolvedIntent) {
      const answer = await resolveIntent(resolvedIntent, query, scope, user, dateRange);
      if (answer) return answer;
    }

    // No intent matched — return live summary + guidance
    const companyId = scope.companyId;
    const [active, pending] = await Promise.all([
      prisma.employee.count({ where: { ...scope, status: { notIn: OFFBOARDED } } }),
      prisma.leaveRequest.count({ where: { ...(companyId ? { employee: { companyId } } : {}), status: 'Pending' } }),
    ]);

    return `I'm not sure I understood that question. Here's a quick overview of your company:\n\n• Active Employees: **${active}**\n• Pending Leave Requests: **${pending}**\n\nYou can ask me:\n• "How many active employees are there?"\n• "How many employees were absent today?"\n• "What is the total payroll this month?"\n• "Who joined this month?"\n• "Show pending leave requests"\n• "Department headcount breakdown"\n• "What is Hemlata's attendance this month?"`;

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

    // Persist chat history (best-effort)
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
