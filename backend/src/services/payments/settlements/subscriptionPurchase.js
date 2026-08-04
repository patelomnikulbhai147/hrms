/**
 * Settlement handler: SUBSCRIPTION_PURCHASE.
 *
 * settle(tx, order)  — inside the settlement transaction: applies the plan /
 *                      billing cycle / renewal date / seat capacity change and
 *                      grants the plan's included verification credits, all
 *                      from the metadata frozen on the order at creation.
 *                      Throwing rolls the whole settlement back.
 *
 * afterCommit(order) — invoice (SUB-…), upgrade-history row, audit,
 *                      notifications, receipt email; failure-tolerant, can
 *                      never undo the committed subscription change.
 */
const prisma = require('../../../config/prisma');

async function settle(tx, order) {
  const { applySubscriptionInTx } = require('../../subscriptionPurchaseService');
  return applySubscriptionInTx(tx, order);
}

async function afterCommit(order, result) {
  // 1. Invoice (idempotent per order, SUB- numbering; regenerable later).
  let invoice = null;
  try {
    const rechargeInvoiceService = require('../rechargeInvoiceService');
    invoice = await rechargeInvoiceService.createForOrder(order.orderId);
  } catch (e) {
    console.error(`[subscription] invoice generation failed for ${order.orderId} (regenerate later):`, e.message);
  }

  // 2. Upgrade history — same table the Super Admin plan editor writes.
  try {
    await prisma.subscriptionHistory.create({
      data: {
        companyId: result?.headId ?? order.companyId,
        companyName: result?.companyName || `Company #${order.companyId}`,
        changedBy: order.userName || 'Online Payment',
        oldPlan: result?.oldPlan || '',
        newPlan: result?.planKey || '',
        reason: `Self-service ${String(result?.changeType || 'purchase').toLowerCase()} — ${result?.billingCycle}, ${result?.seats} employees, order ${order.orderId}`,
      },
    });
  } catch (e) {
    console.error(`[subscription] history row failed for ${order.orderId}:`, e.message);
  }

  // 3. Audit trail — attributed to the purchasing user.
  try {
    const AuditService = require('../../auditService');
    if (order.userId) {
      await AuditService.logAudit(order.userId, 'SUBSCRIPTION_PURCHASED', 'Subscriptions', String(result?.headId ?? order.companyId), {
        orderId: order.orderId,
        amount: order.totalAmount,
        oldPlan: result?.oldPlan,
        newPlan: result?.planKey,
        billingCycle: result?.billingCycle,
        employees: result?.seats,
        oldLimit: result?.oldLimit,
        newLimit: result?.newLimit,
        renewalDate: result?.renewalDate,
        changeType: result?.changeType,
      });
    }
  } catch (e) {
    console.error(`[subscription] audit failed for ${order.orderId}:`, e.message);
  }

  // 4. Notifications — purchaser + Super Admins.
  try {
    const { notify } = require('../../notificationService');
    if (order.userId) {
      await notify({
        userId: order.userId,
        companyId: result?.headId ?? order.companyId,
        type: 'SUBSCRIPTION',
        title: 'Subscription updated',
        message: `Your ${result?.planName || result?.planKey} (${result?.billingCycle}) subscription is now active for ${result?.seats} employees. All plan features are unlocked immediately.`,
        priority: 'high',
      });
    }
    const { notifySuperAdmins } = require('../paymentOrderService');
    await notifySuperAdmins({
      title: 'Subscription purchased online',
      message: `${result?.companyName || `Company #${order.companyId}`} moved ${result?.oldPlan || '—'} → ${result?.planKey} (${result?.billingCycle}, ${result?.seats} employees, ${order.currency} ${order.totalAmount}, order ${order.orderId}).`,
      priority: 'high',
    });
  } catch (e) {
    console.error(`[subscription] notifications failed for ${order.orderId}:`, e.message);
  }

  // 5. Receipt email with the invoice PDF (best-effort).
  try {
    const emailService = require('../../emailService');
    const user = order.userId ? await prisma.user.findUnique({ where: { id: order.userId } }).catch(() => null) : null;
    const company = await prisma.company.findUnique({ where: { id: order.companyId } }).catch(() => null);
    const to = user?.email || company?.email;
    if (to && emailService.isSmtpConfigured()) {
      const attachments = [];
      if (invoice) {
        try {
          const rechargeInvoiceService = require('../rechargeInvoiceService');
          const pdf = await rechargeInvoiceService.renderInvoicePdf(invoice);
          attachments.push({ filename: `${invoice.invoiceNo}.pdf`, content: pdf });
        } catch (e) {
          console.error(`[subscription] invoice PDF render failed for ${order.orderId}:`, e.message);
        }
      }
      await emailService.sendMail({
        to,
        subject: `Subscription active — ${result?.planName || result?.planKey} (${result?.billingCycle})`,
        html: `<p>Hello,</p>
<p>Your subscription purchase was successful.</p>
<table cellpadding="6" style="border-collapse:collapse">
  <tr><td><b>Plan</b></td><td>${result?.planName || result?.planKey}</td></tr>
  <tr><td><b>Billing Cycle</b></td><td>${result?.billingCycle}</td></tr>
  <tr><td><b>Employees</b></td><td>${result?.seats}</td></tr>
  ${result?.renewalDate ? `<tr><td><b>Renewal Date</b></td><td>${new Date(result.renewalDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>` : ''}
  <tr><td><b>Amount Paid</b></td><td>${order.currency} ${order.totalAmount}</td></tr>
  <tr><td><b>Order ID</b></td><td>${order.orderId}</td></tr>
  ${invoice ? `<tr><td><b>Invoice</b></td><td>${invoice.invoiceNo} (attached)</td></tr>` : ''}
</table>
<p>All plan features are unlocked immediately — no logout required.</p>`,
        attachments,
        companyId: order.companyId,
      });
    }
  } catch (e) {
    console.error(`[subscription] receipt email failed for ${order.orderId}:`, e.message);
  }

  return { invoiceId: invoice?.id ?? null };
}

module.exports = { settle, afterCommit };
