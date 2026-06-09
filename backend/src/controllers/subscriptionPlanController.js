const prisma = require('../config/prisma');

exports.getAll = async (req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { priceMonthly: 'asc' }
    });
    res.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Super Admins can create plans' });
    }
    const plan = await prisma.subscriptionPlan.create({
      data: req.body
    });
    res.status(201).json(plan);
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Super Admins can update plans' });
    }
    const { id } = req.params;
    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: req.body
    });
    res.json(plan);
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Super Admins can delete plans' });
    }
    const { id } = req.params;
    await prisma.subscriptionPlan.delete({
      where: { id }
    });
    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
