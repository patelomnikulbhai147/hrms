const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getBranches = async (req, res) => {
  try {
    const { companyId } = req.query;
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause.OR = [
        { companyId: { in: allowedIds } },
        { id: { in: allowedIds } }
      ];
      if (companyId) {
        if (!allowedIds.includes(companyId)) {
          // If they request a specific company but they only have access to a child branch of it,
          // the OR clause already includes that logic for their specific branches. We just AND the companyId.
          whereClause.companyId = companyId;
        } else {
          whereClause.companyId = companyId;
        }
      }
    } else if (companyId) {
      whereClause.companyId = companyId;
    }

    const branches = await prisma.branch.findMany({
      where: whereClause,
      include: {
        _count: {
          select: { employees: { where: { status: 'Active' } } }
        }
      }
    });

    const enrichedBranches = branches.map(b => {
      const { _count, ...rest } = b;
      return {
        ...rest,
        headcount: _count.employees
      };
    });

    res.json(enrichedBranches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createBranch = async (req, res) => {
  try {
    const branch = await prisma.branch.create({
      data: req.body
    });
    res.status(201).json(branch);
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const branch = await prisma.branch.update({
      where: { id },
      data: req.body
    });
    res.json(branch);
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.branch.delete({
      where: { id }
    });
    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
