const prisma = require('../config/prisma');

// Get all companies
exports.getCompanies = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        branches: true,
        _count: {
          select: { employees: { where: { status: 'Active' } } }
        }
      }
    });

    const enrichedCompanies = companies.map(c => {
      const { _count, ...rest } = c;
      return {
        ...rest,
        headcount: _count.employees
      };
    });

    res.json(enrichedCompanies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new company
exports.createCompany = async (req, res) => {
  try {
    const isBranch = req.body.isHeadOffice === false || req.body.parentCompanyId;
    
    if (isBranch) {
      const branchData = {
        companyId: req.body.parentCompanyId || req.body.companyId,
        branchName: req.body.name || req.body.branchName,
        branchCode: req.body.branchCode,
        location: req.body.location || req.body.address,
        phone: req.body.phone,
        email: req.body.email,
        adminName: req.body.adminName,
        adminEmail: req.body.adminEmail,
        employeeCapacity: req.body.employeeCapacity,
        status: req.body.status,
        pfRate: req.body.pfRate,
        esicRate: req.body.esicRate,
        basicPercent: req.body.basicPercent,
        profTaxRate: req.body.profTaxRate,
        overtimeRate: req.body.overtimeRate
      };
      
      const branch = await prisma.branch.create({ data: branchData });
      return res.status(201).json({ ...branch, name: branch.branchName, isHeadOffice: false, parentCompanyId: branch.companyId });
    }

    const company = await prisma.company.create({
      data: req.body
    });
    res.status(201).json(company);
  } catch (error) {
    console.error('Error creating company/branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update a company
exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const isBranch = req.body.isHeadOffice === false || req.body.parentCompanyId;

    if (isBranch) {
      const validBranchData = {};
      if (req.body.name) validBranchData.branchName = req.body.name;
      if (req.body.branchName) validBranchData.branchName = req.body.branchName;
      if (req.body.status) validBranchData.status = req.body.status;
      if (req.body.location) validBranchData.location = req.body.location;
      if (req.body.address) validBranchData.location = req.body.address;
      if (req.body.branchCode) validBranchData.branchCode = req.body.branchCode;
      if (req.body.email) validBranchData.email = req.body.email;
      if (req.body.phone) validBranchData.phone = req.body.phone;
      if (req.body.adminName) validBranchData.adminName = req.body.adminName;
      if (req.body.adminEmail) validBranchData.adminEmail = req.body.adminEmail;
      if (req.body.employeeCapacity) validBranchData.employeeCapacity = req.body.employeeCapacity;
      if (req.body.pfRate) validBranchData.pfRate = req.body.pfRate;
      if (req.body.esicRate) validBranchData.esicRate = req.body.esicRate;
      if (req.body.basicPercent) validBranchData.basicPercent = req.body.basicPercent;
      if (req.body.profTaxRate) validBranchData.profTaxRate = req.body.profTaxRate;
      if (req.body.overtimeRate) validBranchData.overtimeRate = req.body.overtimeRate;


      const branch = await prisma.branch.update({
        where: { id },
        data: validBranchData
      });

      // Forward branding and statutory settings to the parent company
      const parentCompanyId = req.body.parentCompanyId || branch.companyId;
      if (parentCompanyId) {
        const parentPayload = { ...req.body };
        delete parentPayload.name;
        delete parentPayload.branchName;
        delete parentPayload.status;
        delete parentPayload.location;
        delete parentPayload.email;
        delete parentPayload.address;
        delete parentPayload.isHeadOffice;
        delete parentPayload.parentCompanyId;
        delete parentPayload.branches;
        
        // Remove undefined/nulls to prevent wiping out parent data by mistake
        Object.keys(parentPayload).forEach(key => {
          if (parentPayload[key] === undefined) {
            delete parentPayload[key];
          }
        });

        if (Object.keys(parentPayload).length > 0) {
          try {
            await prisma.company.update({
              where: { id: parentCompanyId },
              data: parentPayload
            });
          } catch(e) {}
        }
      }

      return res.json({ ...branch, name: branch.branchName, isHeadOffice: false });
    }

    const payload = { ...req.body };
    delete payload.email;
    delete payload.address;
    delete payload.isHeadOffice;
    delete payload.branches;
    
    const company = await prisma.company.update({
      where: { id },
      data: payload
    });
    res.json(company);
  } catch (error) {
    console.error('Error updating company/branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getCompanyDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const employees = await prisma.employee.count({ where: { companyId: id } });
    const branches = await prisma.branch.count({ where: { companyId: id } });
    const payrolls = await prisma.payroll.count({ where: { companyId: id } });
    const attendances = await prisma.attendance.count({ where: { companyId: id } });
    const documents = await prisma.document.count({ where: { companyId: id } });
    
    res.json({ employees, branches, payrolls, attendances, documents });
  } catch (error) {
    console.error('Error fetching dependencies:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if it's a branch or company
    const branchCheck = await prisma.branch.findUnique({ where: { id } });
    if (branchCheck) {
      const employees = await prisma.employee.count({ where: { branchId: id } });
      if (employees > 0) {
        return res.status(400).json({ error: 'Cannot hard delete branch with existing employees.' });
      }
      await prisma.branch.delete({ where: { id } });
      return res.json({ message: 'Branch permanently deleted' });
    }

    const employees = await prisma.employee.count({ where: { companyId: id } });
    const branches = await prisma.branch.count({ where: { companyId: id } });
    const payrolls = await prisma.payroll.count({ where: { companyId: id } });
    const attendances = await prisma.attendance.count({ where: { companyId: id } });
    const documents = await prisma.document.count({ where: { companyId: id } });

    if (employees > 0 || branches > 0 || payrolls > 0 || attendances > 0 || documents > 0) {
      return res.status(400).json({ error: 'Cannot hard delete company with existing dependent records. Please archive instead.' });
    }

    await prisma.company.delete({ where: { id } });
    res.json({ message: 'Company permanently deleted' });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.archiveCompany = async (req, res) => {
  try {
    const { id } = req.params;
    
    const branchCheck = await prisma.branch.findUnique({ where: { id } });
    if (branchCheck) {
      const branch = await prisma.branch.update({
        where: { id },
        data: { status: 'Archived', isArchived: true }
      });
      await prisma.employee.updateMany({
        where: { branchId: id },
        data: { status: 'Archived', exitDate: new Date(), exitReason: 'Branch Archived' }
      });
      return res.json({ message: 'Branch archived successfully', company: { ...branch, name: branch.branchName } });
    }

    // Archive company
    const company = await prisma.company.update({
      where: { id },
      data: { status: 'Archived', isArchived: true }
    });
    
    // Archive branches
    await prisma.branch.updateMany({
      where: { companyId: id },
      data: { status: 'Archived', isArchived: true }
    });
    
    const branches = await prisma.branch.findMany({ where: { companyId: id } });
    const branchIds = branches.map(b => b.id);
    
    // Archive employees
    await prisma.employee.updateMany({
      where: { companyId: { in: [id, ...branchIds] } },
      data: { status: 'Archived', exitDate: new Date(), exitReason: 'Company Archived' }
    });
    
    res.json({ message: 'Company archived successfully', company });
  } catch (error) {
    console.error('Error archiving company:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
/**
 * GET /api/companies/export
 * Returns enriched, export-ready data for:
 *   - companies[]  — every Company row with active/total employee counts
 *   - branches[]   — every Branch row with parent company name and headcounts
 *   - plans[]      — active SubscriptionPlan list for the summary sheet
 */
exports.exportCompanies = async (req, res) => {
  try {
    // Fetch companies with their branches, employee counts and payment records
    const [companies, branches, plans] = await Promise.all([
      prisma.company.findMany({
        include: {
          branches: {
            select: {
              id: true,
              branchName: true,
              branchCode: true,
              location: true,
              phone: true,
              email: true,
              adminName: true,
              adminEmail: true,
              status: true,
              isArchived: true,
              headcount: true,
              employeeCapacity: true,
              pfRate: true,
              esicRate: true,
              basicPercent: true,
              profTaxRate: true,
              overtimeRate: true,
              createdAt: true,
              updatedAt: true,
              _count: {
                select: {
                  employees: true,
                }
              }
            }
          },
          _count: {
            select: {
              employees: true,
              branches: true,
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.branch.findMany({
        include: {
          company: { select: { name: true } },
          _count: { select: { employees: true } }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: 'asc' } })
    ]);

    // Active employee counts per company/branch
    const activeEmpByCompany = await prisma.employee.groupBy({
      by: ['companyId'],
      where: { status: { in: ['Active', 'ACTIVE'] } },
      _count: { _all: true }
    });
    const activeEmpByBranch = await prisma.employee.groupBy({
      by: ['branchId'],
      where: { status: { in: ['Active', 'ACTIVE'] }, branchId: { not: null } },
      _count: { _all: true }
    });

    const activeByComp = Object.fromEntries(activeEmpByCompany.map(r => [r.companyId, r._count._all]));
    const activeByBranch = Object.fromEntries(activeEmpByBranch.map(r => [r.branchId, r._count._all]));

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    const enrichedCompanies = companies.map(c => ({
      type: 'Company',
      companyId: c.id,
      branchId: '',
      companyName: c.name || '',
      branchName: '',
      contactPerson: c.adminName || '',
      email: c.adminEmail || c.domain || '',
      mobileNumber: c.phone || '',
      alternateContact: '',
      industry: c.industry || '',
      city: '',
      state: '',
      country: 'India',
      address: c.billingAddress || '',
      totalEmployeeCount: c._count.employees,
      activeEmployeeCount: activeByComp[c.id] || 0,
      totalBranches: c._count.branches,
      website: c.domain || '',
      joinDateTime: formatDateTime(c.joinDate),
      subscriptionPlan: c.plan || '',
      subscriptionPrice: c.subscriptionPrice || c.priceMonthly || 0,
      billingCycle: c.billingCycle || 'Monthly',
      subscriptionStartDate: formatDate(c.joinDate),
      subscriptionExpiryDate: c.renewalDate || '',
      billingStatus: c.paymentStatus || '',
      companyStatus: c.status || '',
      branchStatus: '',
      accountStatus: c.accountStatus || '',
      isArchived: c.isArchived ? 'Yes' : 'No',
      gstNumber: c.gstNumber || '',
      domain: c.domain || '',
      pfRate: c.pfRate || 12,
      esicRate: c.esicRate || 3.25,
      basicPercent: c.basicPercent || 50,
      profTaxRate: c.profTaxRate || 200,
      overtimeRate: c.overtimeRate || 1.5,
      createdDate: formatDate(c.createdAt),
      updatedDate: formatDate(c.updatedAt),
    }));

    const enrichedBranches = branches.map(b => ({
      type: 'Branch',
      companyId: b.companyId,
      branchId: b.id,
      companyName: b.company?.name || '',
      branchName: b.branchName || '',
      contactPerson: b.adminName || '',
      email: b.email || b.adminEmail || '',
      mobileNumber: b.phone || '',
      alternateContact: '',
      industry: '',
      city: b.location || '',
      state: '',
      country: 'India',
      address: b.location || '',
      totalEmployeeCount: b._count.employees,
      activeEmployeeCount: activeByBranch[b.id] || 0,
      totalBranches: '',
      subscriptionPlan: 'Included',
      subscriptionPrice: '',
      billingCycle: '',
      subscriptionStartDate: formatDate(b.createdAt),
      subscriptionExpiryDate: '',
      billingStatus: '',
      companyStatus: '',
      branchStatus: b.status || '',
      accountStatus: '',
      isArchived: b.isArchived ? 'Yes' : 'No',
      gstNumber: '',
      domain: '',
      pfRate: b.pfRate,
      esicRate: b.esicRate,
      basicPercent: b.basicPercent,
      profTaxRate: b.profTaxRate,
      overtimeRate: b.overtimeRate,
      branchCode: b.branchCode || '',
      employeeCapacity: b.employeeCapacity || 200,
      createdDate: formatDate(b.createdAt),
      updatedDate: formatDate(b.updatedAt),
    }));

    // ── Employee Summary ──────────────────────────────────────────────────────
    // Live employee aggregates straight from the Employee table (never cached
    // counts). Overall totals + a per-company breakdown for the PDF/Excel report.
    const [empTotalByCompany, empActiveByCompany, empStatusGroups, totalEmployees] = await Promise.all([
      prisma.employee.groupBy({ by: ['companyId'], _count: { _all: true } }),
      prisma.employee.groupBy({ by: ['companyId'], where: { status: { in: ['Active', 'ACTIVE'] } }, _count: { _all: true } }),
      prisma.employee.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.employee.count(),
    ]);
    const totByComp = Object.fromEntries(empTotalByCompany.map(r => [r.companyId, r._count._all]));
    const actByComp = Object.fromEntries(empActiveByCompany.map(r => [r.companyId, r._count._all]));
    const activeEmployees = empStatusGroups
      .filter(g => ['active'].includes(String(g.status).toLowerCase()))
      .reduce((s, g) => s + g._count._all, 0);

    const employeeSummary = {
      totalEmployees,
      activeEmployees,
      archivedEmployees: totalEmployees - activeEmployees,
      byStatus: empStatusGroups.map(g => ({ status: g.status, count: g._count._all })),
      byCompany: companies.map(c => ({
        companyName: c.name || '',
        companyStatus: c.status || '',
        total: totByComp[c.id] || 0,
        active: actByComp[c.id] || 0,
        archived: (totByComp[c.id] || 0) - (actByComp[c.id] || 0),
      })),
    };

    res.set('Cache-Control', 'no-store');
    res.json({
      companies: enrichedCompanies,
      branches: enrichedBranches,
      plans,
      employeeSummary,
      exportedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Export Companies Error:', error);
    res.status(500).json({ error: 'Failed to generate export data' });
  }
};
