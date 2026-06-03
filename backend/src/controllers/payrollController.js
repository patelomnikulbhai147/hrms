const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper to sync payroll for missing employees
const syncPayrollForEmployees = async (companyWhere, month, year) => {
  const employeeWhere = { status: 'Active' };
  if (companyWhere) {
    if (typeof companyWhere === 'string') {
      employeeWhere.OR = [
        { companyId: companyWhere },
        { branchId: companyWhere }
      ];
    } else if (companyWhere.in) {
      employeeWhere.OR = [
        { companyId: { in: companyWhere.in } },
        { branchId: { in: companyWhere.in } }
      ];
    }
  }

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    include: { company: true }
  });

  if (!employees.length) return;

  const payrollRecords = await prisma.payroll.findMany({
    where: {
      month,
      year,
      employeeId: { in: employees.map(e => e.id) }
    },
    select: { employeeId: true }
  });

  const existingEmployeeIds = new Set(payrollRecords.map(p => p.employeeId));
  const missingEmployees = employees.filter(e => !existingEmployeeIds.has(e.id) && e.salary > 0);

  if (missingEmployees.length > 0) {
    const promises = missingEmployees.map(async emp => {
      const basicPercent = emp.company?.basicPercent || 50;
      const basicSalary = emp.salary;
      const hra = Math.round(basicSalary * 0.4);
      const special = Math.round(basicSalary * 0.1);
      const allowances = hra + special;
      
      const pfRate = emp.company?.pfRate || 12;
      const esicRate = emp.company?.esicRate || 0.75;
      const profTax = emp.company?.profTaxRate || 200;
      
      const pfDeduction = Math.round(basicSalary * (pfRate / 100));
      const esicDeduction = Math.round(basicSalary * (esicRate / 100));
      const deductions = pfDeduction + esicDeduction + profTax;
      const netSalary = Math.max(0, (basicSalary + allowances) - deductions);

      return prisma.payroll.create({
        data: {
          companyId: emp.companyId,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          month,
          year,
          basicSalary,
          allowances,
          deductions,
          netSalary,
          payrollStatus: 'draft',
          paymentStatus: 'pending',
          payslipGenerated: false
        }
      }).catch(err => {
         // Silently catch concurrent unique constraint conflicts
      });
    });

    await Promise.allSettled(promises);
  }
};

exports.getAll = async (req, res) => {
  try {
    const { month } = req.query;
    const companyId = req.query.companyId || req.headers['x-workspace-id'];
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause = {
        OR: [
          { companyId: { in: allowedIds } },
          { employee: { branchId: { in: allowedIds } } },
          { employee: { companyId: { in: allowedIds } } }
        ]
      };
      if (companyId) {
        if (!allowedIds.includes(companyId) && companyId !== 'c-gcri') {
           // Allow viewing if it's within their accessible companies
        }
        whereClause = {
          OR: [
            { companyId },
            { employee: { branchId: companyId } },
            { employee: { companyId: companyId } }
          ]
        };
      }
    } else if (companyId) {
      whereClause = {
        OR: [
          { companyId },
          { employee: { branchId: companyId } },
          { employee: { companyId: companyId } }
        ]
      };
    }

    const targetMonth = month || 'June';
    const targetYear = 2026;
    
    let syncCompanyWhere = undefined;
    if (companyId) {
      syncCompanyWhere = companyId;
    } else if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      syncCompanyWhere = { in: allowedIds };
    }
    
    await syncPayrollForEmployees(syncCompanyWhere, targetMonth, targetYear);

    const data = await prisma.payroll.findMany({ 
      where: whereClause,
      include: { employee: true }
    });
    res.json(data);
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const { employeeId, month, year, companyId } = req.body;
    
    // Validation
    if (!employeeId || !month || !year || !companyId) {
      return res.status(400).json({ error: 'Missing required payroll fields: employeeId, month, year, companyId' });
    }

    const payload = { ...req.body };
    delete payload.status;
    delete payload.salary;
    delete payload.employee;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.designation;
    delete payload.id;

    // Prevent duplicates by upserting based on unique constraint
    const data = await prisma.payroll.upsert({
      where: {
        employeeId_month_year_companyId: {
          employeeId,
          month,
          year,
          companyId
        }
      },
      update: payload,
      create: payload
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body };
    delete payload.status;
    delete payload.salary;
    delete payload.employee;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.designation;
    delete payload.id;

    const data = await prisma.payroll.update({
      where: { id },
      data: payload
    });
    res.json(data);
  } catch (error) {
    console.error('Error updating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.payroll.delete({
      where: { id }
    });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
