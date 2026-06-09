const prisma = require('../config/prisma');

exports.getEmployees = async (req, res) => {
  try {
    const { companyId } = req.query;
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause.OR = [
        { companyId: { in: allowedIds } },
        { branchId: { in: allowedIds } }
      ];
      if (companyId) {
        if (!allowedIds.includes(companyId)) {
          return res.status(403).json({ error: 'Unauthorized to view this company employees' });
        }
        whereClause.OR = [
          { companyId: companyId },
          { branchId: companyId }
        ];
      }
    } else if (companyId) {
      whereClause.OR = [
        { companyId: companyId },
        { branchId: companyId }
      ];
    }

    const employees = await prisma.employee.findMany({ where: whereClause });
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    let data = { ...req.body };

    // Validation
    const requiredFields = ['name', 'companyId', 'department', 'designation'];
    for (const field of requiredFields) {
      if (!data[field] || String(data[field]).trim() === '') {
        return res.status(400).json({ error: `Missing or empty required field: ${field}` });
      }
    }
    
    // Sanitize Dates
    if (data.joinDate && typeof data.joinDate === 'string') {
      data.joinDate = new Date(data.joinDate);
    }
    if (data.exitDate && typeof data.exitDate === 'string') {
      if (data.exitDate.trim() === '') data.exitDate = null;
      else data.exitDate = new Date(data.exitDate);
    } else if (data.exitDate === '') {
      data.exitDate = null;
    }
    
    // Map fields
    if (data.esic !== undefined) {
      data.esiNumber = data.esic;
      delete data.esic;
    }

    if (data.companyId) {
      const comp = await prisma.company.findUnique({ where: { id: data.companyId } });
      if (!comp) data.companyId = 'c-gcri';
    }

    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
      if (!branch) data.branchId = null;
    }

    // Auto-generate employeeId (VE sequence)
    let generatedId = 'VE1001';
    const lastEmp = await prisma.employee.findFirst({
      where: { employeeId: { startsWith: 'VE' } },
      orderBy: { employeeId: 'desc' }
    });
    
    if (lastEmp) {
      const lastNum = parseInt(lastEmp.employeeId.replace('VE', ''), 10);
      if (!isNaN(lastNum)) {
        generatedId = `VE${lastNum + 1}`;
      }
    }

    let isUnique = false;
    while (!isUnique) {
      const exists = await prisma.employee.findUnique({ where: { employeeId: generatedId } });
      if (exists) {
        const num = parseInt(generatedId.replace('VE', ''), 10);
        generatedId = `VE${num + 1}`;
      } else {
        isUnique = true;
      }
    }
    
    data.employeeId = generatedId;

    const employee = await prisma.employee.create({
      data
    });

    // Auto-create initial payroll draft for the current month
    if (employee.status === 'Active' && employee.salary > 0) {
      try {
        const company = await prisma.company.findUnique({ where: { id: employee.companyId } });
        const basicPercent = company?.basicPercent || 50;
        const ctcMonthly = Math.round(employee.salary / 12);
        const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
        const hra = Math.round(basicSalary * 0.4);
        const special = Math.max(0, ctcMonthly - basicSalary - hra);
        const allowances = hra + special;
        const pfRate = company?.pfRate || 12;
        const esicRate = company?.esicRate || 0.75;
        const profTax = company?.profTaxRate || 200;
        const pfDeduction = Math.round(basicSalary * (pfRate / 100));
        const esicDeduction = Math.round(basicSalary * (esicRate / 100));
        const deductions = pfDeduction + esicDeduction + profTax;
        const netSalary = Math.max(0, ctcMonthly - deductions);

        await prisma.payroll.create({
          data: {
            companyId: employee.companyId,
            employeeId: employee.id,
            employeeName: employee.name,
            department: employee.department,
            month: 'June',
            year: 2026,
            basicSalary,
            allowances,
            deductions,
            netSalary,
            payrollStatus: 'draft',
            paymentStatus: 'pending',
            payslipGenerated: false
          }
        });
      } catch (err) {
        console.error('Failed to create initial payroll record:', err);
      }
    }

    res.status(201).json(employee);
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.bulkCreate = async (req, res) => {
  try {
    const { employees } = req.body;
    if (!Array.isArray(employees)) {
      return res.status(400).json({ error: 'Expected an array of employees' });
    }

    const created = [];
    for (const data of employees) {
      if (data.joinDate && typeof data.joinDate === 'string') {
        data.joinDate = new Date(data.joinDate);
      }
      if (data.exitDate && typeof data.exitDate === 'string') {
        if (data.exitDate.trim() === '') data.exitDate = null;
        else data.exitDate = new Date(data.exitDate);
      } else if (data.exitDate === '') {
        data.exitDate = null;
      }
      
      if (data.esic !== undefined) {
        data.esiNumber = data.esic;
        delete data.esic;
      }

      // We'll use upsert to avoid duplicate errors on bulk insert, or skip them
      const result = await prisma.employee.upsert({
        where: { employeeId: data.employeeId },
        update: data,
        create: data
      });
      created.push(result);
    }

    // Auto-sync payroll for imported employees in the background
    try {
      const activeNewIds = created.filter(e => e.status === 'Active' && e.salary > 0).map(e => e.id);
      if (activeNewIds.length > 0) {
        // We'll let the user see success immediately, but trigger the payroll creation async
        setImmediate(async () => {
           for (const emp of created) {
             if (emp.status !== 'Active' || !emp.salary) continue;
             const company = await prisma.company.findUnique({ where: { id: emp.companyId } });
             const basicPercent = company?.basicPercent || 50;
             const ctcMonthly = Math.round(emp.salary / 12);
             const basicSalary = Math.round(ctcMonthly * (basicPercent / 100));
             const hra = Math.round(basicSalary * 0.4);
             const special = Math.max(0, ctcMonthly - basicSalary - hra);
             const allowances = hra + special;
             const pfRate = company?.pfRate || 12;
             const esicRate = company?.esicRate || 0.75;
             const profTax = company?.profTaxRate || 200;
             const pfDeduction = Math.round(basicSalary * (pfRate / 100));
             const esicDeduction = Math.round(basicSalary * (esicRate / 100));
             const deductions = pfDeduction + esicDeduction + profTax;
             const netSalary = Math.max(0, ctcMonthly - deductions);

             await prisma.payroll.upsert({
               where: {
                 employeeId_month_year_companyId: {
                   employeeId: emp.id,
                   month: 'June',
                   year: 2026,
                   companyId: emp.companyId
                 }
               },
               update: {},
               create: {
                 companyId: emp.companyId,
                 employeeId: emp.id,
                 employeeName: emp.name,
                 department: emp.department,
                 month: 'June',
                 year: 2026,
                 basicSalary,
                 allowances,
                 deductions,
                 netSalary,
                 payrollStatus: 'draft',
                 paymentStatus: 'pending',
                 payslipGenerated: false
               }
             }).catch(() => {});
           }
        });
      }
    } catch(e) {}

    res.status(201).json({ count: created.length, employees: created });
  } catch (error) {
    console.error('Error in bulk create:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    let data = { ...req.body };

    // Validation for critical fields if they are provided
    const criticalFields = ['name', 'email', 'employeeId', 'companyId', 'department', 'designation'];
    for (const field of criticalFields) {
      if (data.hasOwnProperty(field) && (!data[field] || String(data[field]).trim() === '')) {
        return res.status(400).json({ error: `Critical field cannot be empty: ${field}` });
      }
    }
    
    // Sanitize Dates
    if (data.joinDate && typeof data.joinDate === 'string') {
      data.joinDate = new Date(data.joinDate);
    }
    if (data.exitDate && typeof data.exitDate === 'string') {
      if (data.exitDate.trim() === '') data.exitDate = null;
      else data.exitDate = new Date(data.exitDate);
    } else if (data.exitDate === '') {
      data.exitDate = null;
    }
    
    // Map fields
    if (data.esic !== undefined) {
      data.esiNumber = data.esic;
      delete data.esic;
    }

    if (data.companyId) {
      const comp = await prisma.company.findUnique({ where: { id: data.companyId } });
      if (!comp) data.companyId = 'c-gcri';
    }

    if (data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
      if (!branch) data.branchId = null;
    }

    const employee = await prisma.employee.update({
      where: { id },
      data
    });
    res.json(employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    // Archive employee instead of hard delete
    const employee = await prisma.employee.update({
      where: { id },
      data: { 
        status: 'Archived', 
        exitDate: new Date(), 
        exitReason: 'Admin Archived' 
      }
    });
    res.json({ message: 'Employee archived successfully', employee });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Employee Status Verification Report ──────────────────────────────────────
// Returns one row per employee (Employee ID, Name, Status, isArchived, Branch,
// Company) plus a mismatch list, so status inconsistencies can be identified.
// `status` is the single source of truth; isArchived is derived from it.
exports.statusReport = async (req, res) => {
  try {
    const [employees, branches, companies] = await Promise.all([
      prisma.employee.findMany({
        select: { id: true, employeeId: true, name: true, status: true, branchId: true, companyId: true },
        orderBy: { name: 'asc' },
      }),
      prisma.branch.findMany({ select: { id: true, branchName: true, status: true } }),
      prisma.company.findMany({ select: { id: true, name: true, status: true } }),
    ]);
    const bMap = Object.fromEntries(branches.map(b => [b.id, b]));
    const cMap = Object.fromEntries(companies.map(c => [c.id, c]));
    const SUPPORTED = ['Active', 'Archived', 'Resigned', 'Terminated', 'Inactive'];

    const rows = employees.map(e => {
      const b = e.branchId ? bMap[e.branchId] : null;
      const c = cMap[e.companyId] || null;
      const archived = e.status === 'Archived';
      // An archived employee whose parent branch/company is Active is a mismatch.
      const parentActive = b ? b.status === 'Active' : (c ? c.status === 'Active' : false);
      const mismatch =
        (archived && parentActive) ||
        !SUPPORTED.includes(e.status);
      return {
        employeeId: e.employeeId,
        employeeName: e.name,
        status: e.status,
        isArchived: archived,
        branch: b ? b.branchName : '',
        company: c ? c.name : '',
        mismatch,
        mismatchReason: !SUPPORTED.includes(e.status)
          ? `Unsupported status "${e.status}"`
          : (archived && parentActive ? 'Archived employee under an Active branch/company' : ''),
      };
    });

    const mismatches = rows.filter(r => r.mismatch);
    const byStatus = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

    res.set('Cache-Control', 'no-store');
    res.json({ total: rows.length, byStatus, mismatchCount: mismatches.length, mismatches, rows, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Error generating employee status report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
