const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { isSuperAdmin, companyScopeFor, canEnterWorkspace } = require('../utils/workspaceScope');

/**
 * Tenant scope for the payment ledger.
 *
 * These rows are billing records per company. The list used to be an unfiltered
 * findMany, so ANY authenticated user received every tenant's payment history
 * (verified: a Company Head of one tenant saw another tenant's rows). Reads are
 * now constrained to the caller's companies; Super Admin still sees everything.
 */
function paymentScopeWhere(req) {
  if (isSuperAdmin(req)) return {};
  const scope = companyScopeFor(req);
  return { companyId: { in: scope.length ? scope : [-1] } };
}

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
      where: paymentScopeWhere(req),
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

    // Confirm the target row is inside the caller's tenant before mutating it,
    // and refuse a body-supplied companyId that would move it to another tenant.
    const existing = await prisma.paymentRecord.findUnique({ where: { id: idParam(id) } });
    if (!existing) return res.status(404).json({ error: 'Payment record not found.' });
    if (!canEnterWorkspace(req, existing.companyId)) {
      return res.status(403).json({ error: 'You do not have access to this payment record.' });
    }
    if (updateData.companyId !== undefined && !canEnterWorkspace(req, updateData.companyId)) {
      return res.status(403).json({ error: 'You cannot reassign a payment record to that company.' });
    }

    const data = await prisma.paymentRecord.update({
      where: { id: idParam(id) },
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
    // Scoped delete — another tenant's row simply does not match (count 0 → 404).
    const result = await prisma.paymentRecord.deleteMany({
      where: { id: idParam(id), ...paymentScopeWhere(req) }
    });
    if (result.count === 0) return res.status(404).json({ error: 'Payment record not found.' });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};
