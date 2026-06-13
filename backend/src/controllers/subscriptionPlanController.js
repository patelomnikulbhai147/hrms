const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const respondError = require('../utils/respondError');

exports.getAll = async (req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { priceMonthly: 'asc' }
    });
    res.json(plans);
  } catch (error) {
    return respondError(res, error);
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
    return respondError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Super Admins can update plans' });
    }
    const { id } = req.params;
    const plan = await prisma.subscriptionPlan.update({
      where: { id: idParam(id) },
      data: req.body
    });
    res.json(plan);
  } catch (error) {
    return respondError(res, error);
  }
};

exports.delete = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Super Admins can delete plans' });
    }
    const { id } = req.params;
    await prisma.subscriptionPlan.delete({
      where: { id: idParam(id) }
    });
    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    return respondError(res, error);
  }
};
