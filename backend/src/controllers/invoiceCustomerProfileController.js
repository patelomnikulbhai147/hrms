/**
 * Customer Profile 360° Data Aggregation
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canView, scopedWhere } = require('../utils/invoiceScope');

exports.getCustomerProfile = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'No permission.' });
    const base = scopedWhere(req); 
    if (base === null) return res.status(403).json({ error: 'Unauthorized workspace.' });
    
    const customerId = idParam(req.params.id);
    if (!customerId) return res.status(400).json({ error: 'Invalid customer ID.' });

    // 1. Fetch Master Data
    const customer = await prisma.invoiceCustomer.findFirst({
      where: { id: customerId, ...base }
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    // 2. Fetch all Invoices
    const invoicesData = await prisma.invoice.findMany({
      where: { customerId, ...base },
      orderBy: { invoiceDate: 'desc' }
    });

    const invoiceIds = invoicesData.map(i => i.id);

    // Fetch items separately because there is no direct Prisma relation defined
    const allItems = invoiceIds.length > 0 
      ? await prisma.invoiceItem.findMany({ where: { invoiceId: { in: invoiceIds } } })
      : [];

    const invoices = invoicesData.map(inv => ({
      ...inv,
      items: allItems.filter(item => item.invoiceId === inv.id)
    }));

    // 3. Fetch Payments
    const payments = invoiceIds.length > 0 
      ? await prisma.invoicePayment.findMany({
          where: { invoiceId: { in: invoiceIds } },
          orderBy: { paymentDate: 'desc' }
        })
      : [];

    // 4. Fetch Timeline (Audit Logs)
    const audits = await prisma.invoiceAudit.findMany({
      where: {
        companyId: customer.companyId,
        OR: [
          { entityType: 'Customer', entityId: customerId },
          { invoiceId: { in: invoiceIds } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    // 5. Compute Metrics
    const metrics = {
      totalInvoices: invoices.length,
      draftInvoices: 0,
      paidInvoices: 0,
      partiallyPaid: 0,
      overdueInvoices: 0,
      cancelledInvoices: 0,
      totalInvoiceAmount: 0,
      totalAmountPaid: 0,
      outstandingAmount: 0,
    };

    const now = new Date();
    
    invoices.forEach(inv => {
      metrics.totalInvoiceAmount += (inv.grandTotal || 0);
      metrics.totalAmountPaid += (inv.amountPaid || 0);
      metrics.outstandingAmount += (inv.balanceDue || 0);

      switch (inv.status) {
        case 'Draft': metrics.draftInvoices++; break;
        case 'Paid': metrics.paidInvoices++; break;
        case 'Closed': metrics.paidInvoices++; break;
        case 'Partially Paid': metrics.partiallyPaid++; break;
        case 'Cancelled': metrics.cancelledInvoices++; break;
      }

      if (inv.status !== 'Paid' && inv.status !== 'Closed' && inv.status !== 'Cancelled') {
        if (inv.dueDate && new Date(inv.dueDate) < now) {
          metrics.overdueInvoices++;
        }
      }
    });

    // Averages
    metrics.averageInvoiceValue = metrics.totalInvoices > 0 ? (metrics.totalInvoiceAmount / metrics.totalInvoices) : 0;
    
    // Group Products
    const productMap = {};
    invoices.forEach(inv => {
      inv.items.forEach(item => {
        const name = item.name || 'Unknown Product';
        if (!productMap[name]) {
          productMap[name] = {
            product: name,
            category: item.hsnSac || '-',
            quantity: 0,
            unitPrice: item.rate, // latest rate
            lastPurchased: inv.invoiceDate,
            totalPurchased: 0,
            revenue: 0
          };
        }
        productMap[name].quantity += (item.quantity || 0);
        productMap[name].totalPurchased += (item.quantity || 0);
        productMap[name].revenue += (item.amount || 0);
        if (new Date(inv.invoiceDate) > new Date(productMap[name].lastPurchased)) {
          productMap[name].lastPurchased = inv.invoiceDate;
          productMap[name].unitPrice = item.rate; // keep most recent price
        }
      });
    });
    
    const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

    // Chart Data (Last 12 Months)
    const monthMap = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = { month: key, invoiceAmount: 0, payments: 0, label: d.toLocaleString('default', { month: 'short' }) };
    }

    invoices.forEach(inv => {
      if (inv.status !== 'Cancelled' && inv.invoiceDate) {
        const date = new Date(inv.invoiceDate);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthMap[key]) monthMap[key].invoiceAmount += (inv.grandTotal || 0);
      }
    });

    payments.forEach(pay => {
      if (pay.status !== 'Failed' && pay.paymentDate) {
        const date = new Date(pay.paymentDate);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthMap[key]) monthMap[key].payments += (pay.amount || 0);
      }
    });

    const charts = {
      monthlyTrend: Object.values(monthMap)
    };

    res.json({
      customer,
      invoices,
      payments,
      audits,
      metrics,
      products,
      charts
    });

  } catch (e) {
    console.error('invoiceCustomerProfile.getProfile', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
