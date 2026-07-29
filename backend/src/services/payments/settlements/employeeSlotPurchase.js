/**
 * Settlement handler: EMPLOYEE_SLOT_PURCHASE.
 *
 * settle(tx, order)  — inside the settlement transaction: adds the slots
 *                      frozen on the order (creditsPurchased = slot quantity)
 *                      to the PAYING company's extraEmployeeSlots and writes
 *                      the append-only slot-transaction row with old/new
 *                      limits. Throwing rolls the whole settlement back.
 *
 * afterCommit(order) — invoice + notifications + audit; failure-tolerant,
 *                      can never undo the granted slots.
 */
const prisma = require('../../../config/prisma');

async function settle(tx, order) {
  const { grantSlotsInTx } = require('../../employeeSlotService');
  const result = await grantSlotsInTx(tx, {
    companyId: order.companyId,
    slots: order.creditsPurchased, // the spine's generic quantity column
    type: 'ONLINE_PURCHASE',
    status: 'COMPLETED',
    packId: order.packageId,
    packName: order.packageName,
    amount: order.totalAmount,
    orderId: order.orderId,
    requestedBy: order.userName || 'Company Head',
    actionedBy: 'Online Payment',
  });
  return {
    slotTransactionId: result.slotTx.id,
    slotsAdded: result.appliedDelta,
    oldLimit: result.oldLimit,
    newLimit: result.newLimit,
    headId: result.headId,
  };
}

async function afterCommit(order, settleResult) {
  // 1. Invoice (idempotent per order, ESP- numbering; regenerable later).
  let invoice = null;
  try {
    const rechargeInvoiceService = require('../rechargeInvoiceService');
    invoice = await rechargeInvoiceService.createForOrder(order.orderId);
  } catch (e) {
    console.error(`[slots] invoice generation failed for ${order.orderId} (regenerate later):`, e.message);
  }

  // 2. Audit trail — attributed to the purchasing user.
  try {
    const { auditSlotChange } = require('../../employeeSlotService');
    await auditSlotChange(order.userId, 'SLOT_ONLINE_PURCHASE', {
      headId: settleResult?.headId ?? order.companyId,
      oldLimit: settleResult?.oldLimit ?? null,
      newLimit: settleResult?.newLimit ?? null,
      appliedDelta: settleResult?.slotsAdded ?? order.creditsPurchased,
    }, { orderId: order.orderId, amount: order.totalAmount, pack: order.packageName });
  } catch (e) {
    console.error(`[slots] audit failed for ${order.orderId}:`, e.message);
  }

  // 3. Notifications — purchaser + Super Admins.
  try {
    const { notify } = require('../../notificationService');
    if (order.userId) {
      await notify({
        userId: order.userId,
        companyId: settleResult?.headId ?? order.companyId,
        type: 'EMPLOYEE_SLOTS',
        title: 'Employee slots added',
        message: `Your purchase of ${order.creditsPurchased} additional employee slots was successful. Your employee limit is now ${settleResult?.newLimit ?? 'updated'}.`,
        priority: 'medium',
      });
    }
    const { notifySuperAdmins } = require('../paymentOrderService');
    await notifySuperAdmins({
      title: 'Employee slot pack purchased',
      message: `Company #${order.companyId} purchased ${order.creditsPurchased} employee slots (${order.packageName || 'custom'}, ${order.currency} ${order.totalAmount}, order ${order.orderId}).`,
      priority: 'medium',
    });
  } catch (e) {
    console.error(`[slots] notifications failed for ${order.orderId}:`, e.message);
  }

  // 4. Email receipt with the invoice PDF (best-effort).
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
          console.error(`[slots] invoice PDF render failed for ${order.orderId}:`, e.message);
        }
      }
      await emailService.sendMail({
        to,
        subject: `Payment received — ${order.creditsPurchased} employee slots added`,
        html: `<p>Hello,</p>
<p>Your employee slot purchase was successful.</p>
<table cellpadding="6" style="border-collapse:collapse">
  <tr><td><b>Order ID</b></td><td>${order.orderId}</td></tr>
  <tr><td><b>Amount Paid</b></td><td>${order.currency} ${order.totalAmount}</td></tr>
  <tr><td><b>Slots Added</b></td><td>${order.creditsPurchased}</td></tr>
  ${settleResult?.newLimit != null ? `<tr><td><b>New Employee Limit</b></td><td>${settleResult.newLimit}</td></tr>` : ''}
  ${invoice ? `<tr><td><b>Invoice</b></td><td>${invoice.invoiceNo} (attached)</td></tr>` : ''}
</table>
<p>The additional capacity is available immediately.</p>`,
        attachments,
        companyId: order.companyId,
      });
    }
  } catch (e) {
    console.error(`[slots] receipt email failed for ${order.orderId}:`, e.message);
  }

  return { invoiceId: invoice?.id ?? null };
}

module.exports = { settle, afterCommit };
