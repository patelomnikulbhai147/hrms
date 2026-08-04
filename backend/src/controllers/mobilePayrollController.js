const prisma = require('../config/prisma');
const { ensureEmployeeProfileForUser } = require('../services/userEmployeeProfileService');
const AuditService = require('../services/auditService');

const respond = (res, statusCode, success, message, data = null) => {
  res.status(statusCode).json({
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

exports.getSummary = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    // Fetch the most recent non-draft payroll
    const latestPayroll = await prisma.payroll.findFirst({
        where: { 
            employeeId: employee.id,
            payrollStatus: { not: 'draft' }
        },
        orderBy: [
            { year: 'desc' },
            { month: 'desc' },
            { id: 'desc' }
        ]
    });

    if (!latestPayroll) {
        return respond(res, 200, true, 'No finalized payroll found.', {
            grossSalary: 0,
            netSalary: 0,
            totalDeductions: 0,
            totalAllowances: 0,
            payrollStatus: 'N/A'
        });
    }

    const payload = {
        id: latestPayroll.id,
        month: latestPayroll.month,
        year: latestPayroll.year,
        grossSalary: latestPayroll.basicSalary + latestPayroll.allowances,
        netSalary: latestPayroll.netSalary,
        totalDeductions: latestPayroll.deductions,
        totalAllowances: latestPayroll.allowances,
        payrollStatus: latestPayroll.payrollStatus,
        paymentStatus: latestPayroll.paymentStatus
    };

    return respond(res, 200, true, 'Current payroll summary retrieved.', payload);
  } catch (error) {
    console.error('[mobilePayrollController.getSummary] Error:', error);
    return respond(res, 500, false, 'Failed to fetch payroll summary.');
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const { page = 1, limit = 20, month, year, status } = req.query;
    
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = { 
        employeeId: employee.id,
        payrollStatus: { not: 'draft' } // Hide drafts from mobile app
    };
    
    if (month) where.month = String(month);
    if (year) where.year = parseInt(year, 10);
    if (status) where.payrollStatus = String(status);

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        select: {
            id: true,
            month: true,
            year: true,
            netSalary: true,
            payrollStatus: true,
            paymentStatus: true
        },
        orderBy: [
            { year: 'desc' },
            { id: 'desc' }
        ],
        skip,
        take: limitNum
      }),
      prisma.payroll.count({ where })
    ]);

    return res.status(200).json({
      success: true,
      message: 'Payroll history retrieved.',
      data: payrolls,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[mobilePayrollController.getHistory] Error:', error);
    return respond(res, 500, false, 'Failed to fetch payroll history.');
  }
};

exports.getById = async (req, res) => {
  try {
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const payrollId = parseInt(req.params.id, 10);
    const pr = await prisma.payroll.findUnique({
        where: { id: payrollId }
    });

    if (!pr || pr.employeeId !== employee.id) {
        return respond(res, 404, false, 'Payroll record not found.');
    }

    const company = await prisma.company.findUnique({
        where: { id: employee.companyId }
    });

    // Dynamically breakdown deductions matching ZeniaHR backend formula
    const pfRate = company?.pfRate || 12;
    const profTax = company?.profTaxRate || 200;
    
    const PF_WAGE_CEILING = 15000;
    const ESI_GROSS_CEILING = 21000;
    const ESI_EMP_RATE = 0.75;

    const basic = pr.basicSalary;
    const gross = basic + pr.allowances;

    const pfWages = Math.min(basic, PF_WAGE_CEILING);
    const pf = Math.round(pfWages * (pfRate / 100));
    const esi = gross > 0 && gross <= ESI_GROSS_CEILING ? Math.round(gross * (ESI_EMP_RATE / 100)) : 0;
    const pt = gross > 0 ? profTax : 0;

    const payload = {
        id: pr.id,
        month: pr.month,
        year: pr.year,
        basicSalary: pr.basicSalary,
        allowances: pr.allowances,
        grossSalary: gross,
        deductions: pr.deductions,
        netSalary: pr.netSalary,
        overtime: pr.overtime || 0,
        bonus: pr.bonus || 0,
        tax: pr.tax || 0,
        loanDeduction: pr.loanDeduction || 0,
        breakdown: {
            pf,
            esi,
            pt
        },
        attendance: {
            payableDays: pr.payableDays,
            workingDays: pr.workingDays,
            lwpDays: pr.lwpDays,
        },
        status: {
            payroll: pr.payrollStatus,
            payment: pr.paymentStatus
        }
    };

    return respond(res, 200, true, 'Payroll details retrieved.', payload);
  } catch (error) {
    console.error('[mobilePayrollController.getById] Error:', error);
    return respond(res, 500, false, 'Failed to fetch payroll details.');
  }
};

exports.getPayslip = async (req, res) => {
  try {
    // Exact same data fetching as getById, but triggers the AuditLog and generated/downloaded state.
    const { employee } = await ensureEmployeeProfileForUser(req.user);
    if (!employee) return respond(res, 404, false, 'Employee profile not found.');

    const payrollId = parseInt(req.params.id, 10);
    const pr = await prisma.payroll.findUnique({
        where: { id: payrollId }
    });

    if (!pr || pr.employeeId !== employee.id) {
        return respond(res, 404, false, 'Payroll record not found.');
    }
    
    // Log Audit for Payslip Download/View
    await AuditService.logAudit(req.user.id, 'MOBILE_PAYSLIP_DOWNLOADED', 'Payroll', pr.id, {
        month: pr.month,
        year: pr.year
    });
    
    // Update download count
    await prisma.payroll.update({
        where: { id: pr.id },
        data: {
            downloadedAt: new Date(),
            downloadCount: { increment: 1 }
        }
    });

    const company = await prisma.company.findUnique({
        where: { id: employee.companyId }
    });

    // Dynamically breakdown deductions matching ZeniaHR backend formula
    const pfRate = company?.pfRate || 12;
    const profTax = company?.profTaxRate || 200;
    
    const PF_WAGE_CEILING = 15000;
    const ESI_GROSS_CEILING = 21000;
    const ESI_EMP_RATE = 0.75;

    const basic = pr.basicSalary;
    const gross = basic + pr.allowances;

    const pfWages = Math.min(basic, PF_WAGE_CEILING);
    const pf = Math.round(pfWages * (pfRate / 100));
    const esi = gross > 0 && gross <= ESI_GROSS_CEILING ? Math.round(gross * (ESI_EMP_RATE / 100)) : 0;
    const pt = gross > 0 ? profTax : 0;

    const payload = {
        id: pr.id,
        month: pr.month,
        year: pr.year,
        companyName: company?.name || 'Company',
        companyAddress: company?.address || '',
        employeeName: pr.employeeName,
        department: pr.department,
        basicSalary: pr.basicSalary,
        allowances: pr.allowances,
        grossSalary: gross,
        deductions: pr.deductions,
        netSalary: pr.netSalary,
        overtime: pr.overtime || 0,
        bonus: pr.bonus || 0,
        tax: pr.tax || 0,
        loanDeduction: pr.loanDeduction || 0,
        breakdown: {
            pf,
            esi,
            pt
        },
        attendance: {
            payableDays: pr.payableDays,
            workingDays: pr.workingDays,
            lwpDays: pr.lwpDays,
            presentDays: pr.presentDays
        }
    };

    return respond(res, 200, true, 'Payslip data retrieved.', payload);
  } catch (error) {
    console.error('[mobilePayrollController.getPayslip] Error:', error);
    return respond(res, 500, false, 'Failed to fetch payslip data.');
  }
};
