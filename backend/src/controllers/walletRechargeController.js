const cashfreePg = require('../services/payments/cashfreePgClient');
const WalletService = require('../services/walletService');
const AuditService = require('../services/auditService');
const { notify } = require('../services/notificationService');
const prisma = require('../config/prisma');
const { targetCompanyId } = require('../utils/workspaceScope');

class WalletRechargeController {

  /**
   * POST /wallet/recharge/create-order
   * Creates a Cashfree order for wallet recharge.
   * Allowed: Company Head, or HR with payroll permission.
   */
  static async createOrder(req, res) {
    try {
      const role = req.user?.role;
      // RBAC: only Company Head or HR (with payroll perm) can recharge
      const allowedRoles = ['Company Head', 'HR'];
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ success: false, message: 'Only Company Head or HR can recharge the wallet.' });
      }

      // Resolve company — branch workspace maps to its parent company
      const companyId = targetCompanyId(req, null) || req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ success: false, message: 'Company ID could not be resolved.' });
      }

      const { amount, note } = req.body;
      const parsedAmount = parseFloat(amount);
      if (!parsedAmount || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid recharge amount.' });
      }

      if (!cashfreePg.isConfigured()) {
        return res.status(503).json({ success: false, message: 'Cashfree Payment Gateway is not configured. Please contact the administrator.' });
      }

      // Unique order id: WALLET_{companyId}_{timestamp}
      const orderId = `WALLET_${companyId}_${Date.now()}`;

      // Get company info for customer_details
      const company = await prisma.company.findUnique({ where: { id: Number(companyId) } }).catch(() => null);

      const cfOrder = await cashfreePg.createOrder({
        orderId,
        amount: parsedAmount,
        currency: 'INR',
        customer: {
          id: `company-${companyId}-user-${req.user.id}`,
          name: req.user.name || company?.name || 'Company Admin',
          email: req.user.email || company?.adminEmail || 'admin@company.com',
          phone: req.user.phone || company?.phone || '9999999999',
        },
        note: note || `Wallet recharge for ${company?.name || 'Company'}`,
        meta: {
          return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payroll-wallet?recharge_status={order_id}`,
          purpose: 'WALLET_RECHARGE',
        },
        tags: {
          type: 'WALLET_RECHARGE',
          companyId: String(companyId),
          userId: String(req.user.id),
        },
      });

      // Audit log
      AuditService.logAudit(
        req.user.id,
        'Wallet Recharge Initiated',
        'Wallet',
        String(companyId),
        {
          companyId,
          orderId,
          amount: parsedAmount,
          gateway: 'Cashfree',
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }
      ).catch(() => {});

      return res.json({
        success: true,
        payment_session_id: cfOrder.payment_session_id,
        order_id: orderId,
        cf_order_id: cfOrder.cf_order_id,
        checkoutMode: cashfreePg.envMode(),
        amount: parsedAmount,
      });

    } catch (error) {
      console.error('[WalletRecharge] createOrder error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to create recharge order.' });
    }
  }

  /**
   * POST /wallet/recharge/verify
   * Called from frontend after Cashfree checkout returns.
   * Verifies the payment status with Cashfree and credits the wallet.
   */
  static async verifyPayment(req, res) {
    try {
      const { order_id } = req.body;
      if (!order_id) {
        return res.status(400).json({ success: false, message: 'order_id is required.' });
      }

      // Parse companyId from order_id: WALLET_{companyId}_{timestamp}
      const parts = order_id.split('_');
      if (parts[0] !== 'WALLET' || !parts[1]) {
        return res.status(400).json({ success: false, message: 'Invalid wallet order ID format.' });
      }
      const companyId = parseInt(parts[1], 10);
      if (!companyId || isNaN(companyId)) {
        return res.status(400).json({ success: false, message: 'Could not extract company ID from order.' });
      }

      // Security: ensure the logged-in user belongs to this company
      const userCompanyId = targetCompanyId(req, null) || req.user?.companyId;
      if (Number(userCompanyId) !== companyId) {
        return res.status(403).json({ success: false, message: 'You are not authorized to verify this order.' });
      }

      // Fetch the Cashfree order
      const cfOrder = await cashfreePg.getOrder(order_id);
      const orderStatus = cfOrder?.order_status;

      if (orderStatus === 'PAID') {
        const payments = await cashfreePg.getOrderPayments(order_id);
        const successPayment = (payments || []).find(p => p.payment_status === 'SUCCESS');
        const cfPaymentId = successPayment?.cf_payment_id ? String(successPayment.cf_payment_id) : order_id;
        const paidAmount = cfOrder.order_amount;

        // addBalance has built-in duplicate detection via referenceNumber
        const result = await WalletService.addBalance(
          companyId,
          paidAmount,
          'Recharge',
          cfPaymentId,
          'Cashfree',
          req.user?.name || 'System'
        );

        // Audit
        AuditService.logAudit(
          req.user.id,
          'Wallet Recharged',
          'Wallet',
          String(companyId),
          {
            companyId,
            orderId: order_id,
            cfPaymentId,
            amount: paidAmount,
            gateway: 'Cashfree',
            ip: req.ip,
          }
        ).catch(() => {});

        // In-app notification
        notify({
          userId: req.user.id,
          companyId: companyId,
          type: 'success',
          title: 'Wallet Recharged ✓',
          message: `₹${paidAmount.toLocaleString('en-IN')} has been added to your Payroll Wallet.`,
          priority: 'high',
        }).catch(() => {});

        return res.json({
          success: true,
          status: 'PAID',
          wallet: result.wallet,
          transaction: result.transaction,
        });

      } else if (orderStatus === 'ACTIVE') {
        return res.json({ success: false, status: 'PENDING', message: 'Payment is still pending.' });
      } else {
        // EXPIRED or CANCELLED
        return res.json({ success: false, status: orderStatus, message: `Payment ${orderStatus?.toLowerCase() || 'failed'}.` });
      }

    } catch (error) {
      console.error('[WalletRecharge] verifyPayment error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to verify payment.' });
    }
  }
}

module.exports = WalletRechargeController;
