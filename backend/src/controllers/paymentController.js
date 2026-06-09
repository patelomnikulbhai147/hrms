const prisma = require('../config/prisma');

const mapToFrontend = (r) => ({
  id: r.id,
  companyId: r.companyId,
  companyName: r.companyName,
  amount: r.amount,
  paymentDate: r.date,
  invoiceNumber: r.invoiceUrl || r.id,
  planType: r.planName,
  billingCycle: r.billingCycle,
  paymentMode: 'Manual',
  transactionStatus: r.status
});

exports.getAll = async (req, res) => {
  try {
    const data = await prisma.paymentRecord.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(data.map(mapToFrontend));
  } catch (error) {
    console.error('Error fetching', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const mappedData = {
      id: req.body.id,
      companyId: req.body.companyId,
      companyName: req.body.companyName || '',
      amount: req.body.amount || 0,
      planName: req.body.planType || 'Starter',
      billingCycle: req.body.billingCycle || 'Monthly',
      status: req.body.transactionStatus || 'Success',
      date: req.body.paymentDate || new Date().toISOString(),
      invoiceUrl: req.body.invoiceNumber || req.body.id
    };

    const data = await prisma.paymentRecord.create({
      data: mappedData
    });
    res.status(201).json(mapToFrontend(data));
  } catch (error) {
    console.error('Error creating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Only map if fields are provided
    const updateData = {};
    if (req.body.companyId) updateData.companyId = req.body.companyId;
    if (req.body.companyName) updateData.companyName = req.body.companyName;
    if (req.body.amount !== undefined) updateData.amount = req.body.amount;
    if (req.body.planType) updateData.planName = req.body.planType;
    if (req.body.transactionStatus) updateData.status = req.body.transactionStatus;
    if (req.body.paymentDate) updateData.date = req.body.paymentDate;
    if (req.body.invoiceNumber) updateData.invoiceUrl = req.body.invoiceNumber;

    const data = await prisma.paymentRecord.update({
      where: { id },
      data: updateData
    });
    res.json(mapToFrontend(data));
  } catch (error) {
    console.error('Error updating', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.paymentRecord.delete({
      where: { id }
    });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
