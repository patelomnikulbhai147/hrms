const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

exports.getAll = async (req, res) => {
  try {
    const companyId = idParam(req.query.companyId || req.headers['x-workspace-id']);
    let whereClause = {};

    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause.companyId = { in: allowedIds };
      if (companyId) {
        if (!allowedIds.includes(companyId)) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        whereClause.companyId = companyId;
      }
    } else if (companyId) {
      whereClause.companyId = companyId;
    }

    const data = await prisma.shift.findMany({ where: whereClause });
    res.json(data);
  } catch (error) {
    console.error('Error fetching shifts', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const data = await prisma.shift.create({ data: req.body });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating shift', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await prisma.shift.update({ where: { id: idParam(id) }, data: req.body });
    res.json(data);
  } catch (error) {
    console.error('Error updating shift', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.shift.delete({ where: { id: idParam(id) } });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting shift', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
