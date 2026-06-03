const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
      const data = { ...req.body, branchName: req.body.name || req.body.branchName };
      delete data.name; // Prisma branch model uses branchName
      const branch = await prisma.branch.create({ data });
      return res.status(201).json({ ...branch, name: branch.branchName, isHeadOffice: false });
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

