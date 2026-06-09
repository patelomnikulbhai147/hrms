const prisma = require('../config/prisma');

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

  const employeesRaw = await prisma.employee.findMany({
    where: employeeWhere
  });

  const companyIds = [...new Set(employeesRaw.map(e => e.companyId).filter(Boolean))];
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } }
  });
  const companyMap = {};
  for (const c of companies) companyMap[c.id] = c;

  const employees = employeesRaw.map(e => ({
    ...e,
    company: companyMap[e.companyId] || null
  }));

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
         console.error("Failed to auto-create draft payroll:", err.message);
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

exports.generate = async (req, res) => {
  try {
    const { companyId, branchId, month, year, role } = req.body;
    
    if ((!companyId && !branchId) || !month || !year) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    const isBranch = !!branchId && role !== 'Company Head';

    // Duplicate Check
    if (isBranch) {
      const existingBranchPayroll = await prisma.branchPayroll.findUnique({
        where: { branchId_payrollMonth_payrollYear: { branchId, payrollMonth: month, payrollYear: year } }
      });
      if (existingBranchPayroll) {
        return res.status(409).json({ error: 'Payroll already generated for this period.' });
      }
    } else {
      const existingCompanyPayroll = await prisma.companyPayroll.findUnique({
        where: { companyId_payrollMonth_payrollYear: { companyId, payrollMonth: month, payrollYear: year } }
      });
      if (existingCompanyPayroll) {
        return res.status(409).json({ error: 'Payroll already generated for this period.' });
      }
    }

    // Fetch scoped employees
    const employeeWhere = { status: 'Active' };
    if (isBranch) {
      employeeWhere.branchId = branchId;
    } else {
      employeeWhere.OR = [
        { companyId: companyId },
        { branchId: companyId } // fallback in case branch is passed as companyId
      ];
    }

    const employeesRaw = await prisma.employee.findMany({
      where: employeeWhere
    });

    const companyIds = [...new Set(employeesRaw.map(e => e.companyId).filter(Boolean))];
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } }
    });
    const companyMap = {};
    for (const c of companies) companyMap[c.id] = c;

    const employees = employeesRaw.map(e => ({
      ...e,
      company: companyMap[e.companyId] || null
    }));

    if (employees.length === 0) {
      return res.status(400).json({ error: 'No active employees found to generate payroll for.' });
    }

    let totalAmount = 0;
    const payrollRecordsToCreate = [];

    for (const emp of employees) {
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

      totalAmount += netSalary;

      payrollRecordsToCreate.push({
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
        payrollStatus: 'processed',
        paymentStatus: 'pending',
        payslipGenerated: false,
        paymentDate: new Date().toISOString()
      });
    }

    let result;

    if (isBranch) {
      result = await prisma.branchPayroll.create({
        data: {
          branchId,
          companyId,
          payrollMonth: month,
          payrollYear: year,
          totalEmployees: employees.length,
          processedEmployees: 0,
          pendingEmployees: employees.length,
          totalAmount,
          status: 'Pending',
          generatedBy: req.user?.name || 'System'
        }
      });
      // Set branchPayrollId for the bulk inserts
      payrollRecordsToCreate.forEach(record => {
        record.branchPayrollId = result.id;
      });
    } else {
      result = await prisma.companyPayroll.create({
        data: {
          companyId,
          payrollMonth: month,
          payrollYear: year,
          totalEmployees: employees.length,
          processedEmployees: 0,
          pendingEmployees: employees.length,
          totalAmount,
          status: 'Pending',
          generatedBy: req.user?.name || 'System'
        }
      });
      // Set companyPayrollId for the bulk inserts
      payrollRecordsToCreate.forEach(record => {
        record.companyPayrollId = result.id;
      });
    }

    // Upsert employee payroll records (to handle duplicates from drafts)
    for (const record of payrollRecordsToCreate) {
      await prisma.payroll.upsert({
        where: {
          employeeId_month_year_companyId: {
            employeeId: record.employeeId,
            month: record.month,
            year: record.year,
            companyId: record.companyId
          }
        },
        update: record,
        create: record
      });
    }

    res.status(201).json({ message: 'Payroll Generated Successfully', data: result });
  } catch (error) {
    console.error('Error generating payroll', error);
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
    console.log("PAYROLL UPDATE CALLED FOR ID:", id);
    console.log("PAYLOAD RECEIVED:", req.body);
    const payload = { ...req.body };
    delete payload.status;
    delete payload.salary;
    delete payload.employee;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.designation;
    delete payload.id;

    const existingRecord = await prisma.payroll.findUnique({
      where: { id }
    });

    if (!existingRecord) {
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    if (payload.paymentStatus === 'paid' && existingRecord.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Payroll already paid.' });
    }

    const data = await prisma.payroll.update({
      where: { id },
      data: payload
    });

    // If marked as paid, update the master tables
    if (payload.paymentStatus === 'paid' && existingRecord.paymentStatus !== 'paid') {
      if (existingRecord.companyPayrollId) {
        await prisma.companyPayroll.update({
          where: { id: existingRecord.companyPayrollId },
          data: {
            processedEmployees: { increment: 1 },
            pendingEmployees: { decrement: 1 }
          }
        });
      }
      
      if (existingRecord.branchPayrollId) {
        await prisma.branchPayroll.update({
          where: { id: existingRecord.branchPayrollId },
          data: {
            processedEmployees: { increment: 1 },
            pendingEmployees: { decrement: 1 }
          }
        });
      }
    }

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
