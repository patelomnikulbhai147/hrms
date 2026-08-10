const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Helper: build a real-data HRMS response for common questions
async function buildRealResponse(query, companyId) {
  const q = query.toLowerCase();
  const cId = Number(companyId);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    if (q.includes('active employee') || q.includes('total employee') || q.includes('headcount')) {
      const count = await prisma.employee.count({ where: { companyId: cId, status: 'Active' } });
      return `There are currently **${count} active employees** in your company as of today.`;
    }

    if (q.includes('absent today') || q.includes('absent this')) {
      const absentCount = await prisma.attendanceRecord.count({
        where: { employee: { companyId: cId }, date: today, status: 'Absent' }
      });
      const presentCount = await prisma.attendanceRecord.count({
        where: { employee: { companyId: cId }, date: today, status: 'Present' }
      });
      return `**Today's Attendance Summary:**\n- Present: **${presentCount}** employees\n- Absent: **${absentCount}** employees`;
    }

    if (q.includes('payroll') || q.includes('salary cost')) {
      const payroll = await prisma.payrollRecord.aggregate({
        where: { employee: { companyId: cId }, month: now.getMonth() + 1, year: now.getFullYear(), status: 'Processed' },
        _sum: { netSalary: true, grossSalary: true, totalDeductions: true }
      });
      const net = payroll._sum.netSalary || 0;
      const gross = payroll._sum.grossSalary || 0;
      return `**This Month's Payroll Summary:**\n- Gross Payroll: ₹${gross.toLocaleString('en-IN')}\n- Net Payroll: ₹${net.toLocaleString('en-IN')}\n- Total Deductions: ₹${((payroll._sum.totalDeductions) || 0).toLocaleString('en-IN')}`;
    }

    if (q.includes('pending leave') || q.includes('leave request')) {
      const pending = await prisma.leaveRequest.count({
        where: { employee: { companyId: cId }, status: 'Pending' }
      });
      const recent = await prisma.leaveRequest.findMany({
        where: { employee: { companyId: cId }, status: 'Pending' },
        include: { employee: { select: { name: true, department: true } } },
        take: 5,
        orderBy: { createdAt: 'desc' }
      });
      const list = recent.map(l => `• ${l.employee.name} (${l.employee.department}) — ${l.leaveType}, ${l.days} day(s)`).join('\n');
      return `There are **${pending} pending leave requests**.\n\nMost Recent:\n${list || 'No recent pending requests.'}`;
    }

    if (q.includes('late today') || q.includes('late coming')) {
      const lateCount = await prisma.attendanceRecord.count({
        where: { employee: { companyId: cId }, date: today, isLate: true }
      });
      return `**${lateCount} employees** came in late today.`;
    }

    if (q.includes('new employee') || q.includes('joined this month')) {
      const count = await prisma.employee.count({
        where: { companyId: cId, joinDate: { gte: monthStart }, status: { not: 'Archived' } }
      });
      return `**${count} new employees** joined this month.`;
    }

    if (q.includes('department') || q.includes('team size')) {
      const dept = await prisma.employee.groupBy({
        by: ['department'],
        where: { companyId: cId, status: 'Active' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } }
      });
      const list = dept.slice(0, 8).map(d => `• ${d.department || 'Unknown'}: ${d._count.id}`).join('\n');
      return `**Department Headcount:**\n${list}`;
    }

    // Default response with live stats
    const totalActive = await prisma.employee.count({ where: { companyId: cId, status: 'Active' } });
    const pendingLeaves = await prisma.leaveRequest.count({ where: { employee: { companyId: cId }, status: 'Pending' } });
    return `I'm your HR AI Assistant with access to live company data.\n\n**Quick Stats:**\n- Active Employees: **${totalActive}**\n- Pending Leave Requests: **${pendingLeaves}**\n\nYou can ask me about:\n• "How many active employees are there?"\n• "Who was absent today?"\n• "What is the total payroll this month?"\n• "Show pending leave requests"\n• "How many employees joined this month?"`;
  } catch (err) {
    console.error('AI query error:', err);
    return "I'm unable to fetch live data right now. Please ensure the database is connected and try again.";
  }
}

router.post('/query', async (req, res) => {
  try {
    const { companyId, employeeId, query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const response = await buildRealResponse(query, companyId || req.user.companyId);

    // Save to chat history (best-effort)
    let chat;
    try {
      chat = await prisma.aiChatHistory.create({
        data: {
          companyId: Number(companyId || req.user.companyId),
          employeeId: employeeId ? Number(employeeId) : null,
          message: query,
          response,
        }
      });
    } catch (e) {
      // If DB save fails, still return the response
      chat = { id: Date.now(), message: query, response, createdAt: new Date() };
    }

    res.json(chat);
  } catch (error) {
    console.error('AI Error:', error);
    res.status(500).json({ error: 'Failed to process AI query' });
  }
});

router.get('/history/:companyId', async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);

    // Company isolation
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

// Keep old endpoint for backwards compat
router.get('/history/:employeeId/legacy', async (req, res) => {
  res.json([]);
});

module.exports = router;
