/**
 * Settlement handler: VERIFICATION_CREDIT_RECHARGE.
 *
 * settle(tx, order)   — runs INSIDE the settlement transaction. Adds the
 *                       credits from the order's frozen snapshot to the
 *                       PAYING company's wallet and writes the ledger row.
 *                       Throwing here rolls the whole settlement back.
 *
 * afterCommit(order)  — runs after the commit. Invoice + notifications.
 *                       Failures are logged, never propagated to the credits.
 */
const prisma = require('../../../config/prisma');
const VerificationCreditService = require('../../verificationCreditService');
const rechargeInvoiceService = require('../rechargeInvoiceService');

async function settle(tx, order) {
  // Credits come from the ORDER ROW ONLY: the company that paid, the credit
  // count frozen at order creation. No live-settings read, no request input.
  const result = await VerificationCreditService.purchaseCredits(
    {
      companyId: order.companyId,
      credits: order.creditsPurchased,
      referenceId: order.orderId,
      remarks: `Online recharge of ${order.creditsPurchased} credits (order ${order.orderId})`,
      createdBy: order.userName || 'Online Recharge',
      provider: 'Cashfree Payment Gateway',
      serviceType: order.serviceType || 'BANK_VERIFICATION',
    },
    tx
  );
  return {
    creditLedgerTxId: result.transaction.transactionId,
    creditsAdded: order.creditsPurchased,
    closingBalance: result.wallet.remainingCredits,
  };
}

async function afterCommit(order, settleResult) {
  // 1. Invoice (idempotent per order; regenerable later if this fails).
  let invoice = null;
  try {
    invoice = await rechargeInvoiceService.createForOrder(order.orderId);
  } catch (e) {
    console.error(`[payments] invoice generation failed for ${order.orderId} (regenerate later):`, e.message);
  }

  // 2. In-app notifications — purchaser + Super Admins.
  try {
    const { notify } = require('../../notificationService');
    if (order.userId) {
      await notify({
        userId: order.userId,
        companyId: order.companyId,
        type: 'CREDIT_RECHARGE',
        title: 'Verification credits added',
        message: `Your recharge of ${order.currency === 'INR' ? '₹' : ''}${order.totalAmount} was successful — ${order.creditsPurchased} verification credits have been added to your company wallet.`,
        priority: 'medium',
      });
    }
    const { notifySuperAdmins } = require('../paymentOrderService');
    await notifySuperAdmins({
      title: 'Online credit recharge received',
      message: `Company #${order.companyId} purchased ${order.creditsPurchased} verification credits (order ${order.orderId}, ${order.currency} ${order.totalAmount}).`,
      priority: 'medium',
    });
  } catch (e) {
    console.error(`[payments] notifications failed for ${order.orderId}:`, e.message);
  }

  // 3. Email receipt with the invoice PDF attached (best-effort).
  try {
    const emailService = require('../../emailService');
    const company = await prisma.company.findUnique({ where: { id: order.companyId } }).catch(() => null);
    const user = order.userId ? await prisma.user.findUnique({ where: { id: order.userId } }).catch(() => null) : null;
    const to = user?.email || company?.email;
    if (to && emailService.isSmtpConfigured()) {
      const attachments = [];
      if (invoice) {
        try {
          const pdf = await rechargeInvoiceService.renderInvoicePdf(invoice);
          attachments.push({ filename: `${invoice.invoiceNo}.pdf`, content: pdf });
        } catch (e) {
          console.error(`[payments] invoice PDF render failed for ${order.orderId}:`, e.message);
        }
      }
      await emailService.sendMail({
        to,
        subject: `Payment received — ${order.creditsPurchased} verification credits added`,
        html: `<p>Hello,</p>
<p>Your verification credit recharge was successful.</p>
<table cellpadding="6" style="border-collapse:collapse">
  <tr><td><b>Order ID</b></td><td>${order.orderId}</td></tr>
  <tr><td><b>Amount Paid</b></td><td>${order.currency} ${order.totalAmount}</td></tr>
  <tr><td><b>Credits Added</b></td><td>${order.creditsPurchased}</td></tr>
  ${invoice ? `<tr><td><b>Invoice</b></td><td>${invoice.invoiceNo} (attached)</td></tr>` : ''}
</table>
<p>The credits are available immediately in your Verification Credit Wallet.</p>`,
        attachments,
        companyId: order.companyId,
      });
    }
  } catch (e) {
    console.error(`[payments] receipt email failed for ${order.orderId}:`, e.message);
  }

  return { invoiceId: invoice?.id ?? null };
}

module.exports = { settle, afterCommit };
