const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAll = async (req, res) => {
  try {
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

    const data = await prisma.leaveRequest.findMany({ where: whereClause });
    res.json(data);
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const data = await prisma.leaveRequest.create({
      data: req.body
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
    const data = await prisma.leaveRequest.update({
      where: { id },
      data: req.body
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
    await prisma.leaveRequest.delete({
      where: { id }
    });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
