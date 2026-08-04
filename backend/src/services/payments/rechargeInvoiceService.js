/**
 * Recharge tax invoices — created AFTER the settlement commit.
 *
 * An invoice failure must never affect credits: creation is idempotent per
 * order (unique orderId) and can be re-run any time via the regenerate
 * endpoint. The issuer is the PLATFORM (same file-backed issuer settings the
 * Subscription Billing invoice uses) — the platform bills the company.
 *
 * Numbering is concurrency-safe: candidate numbers are claimed by the
 * invoiceNo unique constraint with retry, never by a bare count().
 */
const prisma = require('../../config/prisma');
const { getIssuer } = require('../invoiceIssuerStore');
const { amountInWords } = require('../../utils/amountInWords');
const { resolvePlaceOfSupply } = require('../../utils/placeOfSupply');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// This invoice table serves every self-service purchase. Per-purpose identity:
// number prefix + how the line item and quantity column read on the document.
const PURPOSE_PRESENTATION = {
  VERIFICATION_CREDIT_RECHARGE: {
    prefix: 'VCR',
    itemLabel: 'Verification Credit Recharge — online self-service purchase',
    qtyHeader: 'Credits',
  },
  EMPLOYEE_SLOT_PURCHASE: {
    prefix: 'ESP',
    itemLabel: 'Additional Employee Slots — online self-service purchase',
    qtyHeader: 'Slots',
  },
  SUBSCRIPTION_PURCHASE: {
    prefix: 'SUB',
    itemLabel: 'ZeniaHR Subscription — plan purchase / upgrade / renewal',
    qtyHeader: 'Employees',
  },
};
const presentationFor = (purpose) => PURPOSE_PRESENTATION[purpose] || PURPOSE_PRESENTATION.VERIFICATION_CREDIT_RECHARGE;

/**
 * Create (or return the existing) invoice for a settled order.
 * Idempotent: the unique orderId constraint means a webhook retry racing a
 * manual regenerate still produces exactly one invoice.
 */
async function createForOrder(orderId) {
  const order = await prisma.paymentOrder.findUnique({ where: { orderId } });
  if (!order) throw new Error('Payment order not found.');
  if (order.settlementStatus !== 'CREDITED') throw new Error('Invoices are only generated for settled orders.');

  const existing = await prisma.verificationRechargeInvoice.findUnique({ where: { orderId } });
  if (existing) return existing;

  const company = await prisma.company.findUnique({ where: { id: order.companyId } }).catch(() => null);
  const issuer = getIssuer();

  // Inter-state supply → IGST; same state (or unknown) → CGST+SGST, with the
  // rounding remainder folded into SGST (same convention as subscription billing).
  // Resolved through the SHARED place-of-supply helper so this invoice always
  // matches the quote and the order it was raised from.
  const pos = resolvePlaceOfSupply(issuer.state, company?.state);
  const interState = pos.interState;
  if (pos.warning) {
    console.warn(`[recharge-invoice] order ${order.orderId}: ${pos.warning}`);
  }
  const gstAmount = r2(order.gstAmount);
  const cgst = interState ? 0 : r2(gstAmount / 2);
  const sgst = interState ? 0 : r2(gstAmount - cgst);
  const igst = interState ? gstAmount : 0;

  const { prefix } = presentationFor(order.purpose);
  const year = new Date().getFullYear();
  const yearCount = await prisma.verificationRechargeInvoice.count({
    where: { invoiceNo: { startsWith: `${prefix}-${year}-` } },
  });

  const data = {
    orderId,
    purpose: order.purpose,
    companyId: order.companyId,
    companyName: company?.name || `Company #${order.companyId}`,
    companyEmail: company?.email || null,
    billingAddress: company?.address || null,
    gstin: company?.gstNumber || null,
    creditsPurchased: order.creditsPurchased,
    baseAmount: r2(order.baseAmount),
    gstPercent: order.gstPercent,
    gstAmount,
    cgst,
    sgst,
    igst,
    interState,
    totalAmount: r2(order.totalAmount),
    currency: order.currency,
    cfPaymentId: order.cfPaymentId,
    paymentMethod: order.paymentMethod,
    paymentDate: order.paymentTime || order.creditedAt,
    status: 'Paid',
    createdBy: order.userName || 'Online Recharge',
  };

  // Claim a number through the unique constraint — retry on collision.
  for (let attempt = 0; attempt < 25; attempt++) {
    const seq = yearCount + 1 + attempt;
    const invoiceNo = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
    try {
      const created = await prisma.verificationRechargeInvoice.create({ data: { ...data, invoiceNo } });
      await prisma.paymentOrder.update({ where: { orderId }, data: { invoiceId: created.id } }).catch(() => {});
      return created;
    } catch (e) {
      if (e?.code !== 'P2002') throw e;
      // invoiceNo taken → try the next number; orderId taken → someone else
      // just created this order's invoice, return theirs.
      const race = await prisma.verificationRechargeInvoice.findUnique({ where: { orderId } });
      if (race) return race;
    }
  }
  throw new Error('Could not allocate a recharge invoice number.');
}

/** Self-contained A4 invoice HTML (inline CSS only — feeds Puppeteer as-is). */
function renderInvoiceHtml(inv) {
  const issuer = getIssuer();
  const issuerAddress = [issuer.addressLine1, issuer.addressLine2, [issuer.city, issuer.state, issuer.pincode].filter(Boolean).join(', '), issuer.country]
    .filter(Boolean).join('<br/>');
  const accent = issuer.accentColor || '#7c3aed';
  const gstRows = inv.gstAmount > 0
    ? (inv.interState
        ? `<tr><td class="l">IGST @ ${inv.gstPercent}%</td><td class="r">${inr(inv.igst)}</td></tr>`
        : `<tr><td class="l">CGST @ ${inv.gstPercent / 2}%</td><td class="r">${inr(inv.cgst)}</td></tr>
           <tr><td class="l">SGST @ ${inv.gstPercent / 2}%</td><td class="r">${inr(inv.sgst)}</td></tr>`)
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(inv.invoiceNo)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI', Arial, sans-serif; }
  body { padding:32px; color:#1f2937; font-size:13px; }
  .head { display:flex; justify-content:space-between; border-bottom:3px solid ${accent}; padding-bottom:16px; }
  .brand { font-size:22px; font-weight:700; color:${accent}; }
  .muted { color:#6b7280; font-size:11.5px; line-height:1.5; }
  .tag { font-size:20px; font-weight:700; letter-spacing:2px; color:#111827; text-align:right; }
  .meta { text-align:right; font-size:12px; line-height:1.6; }
  .cols { display:flex; justify-content:space-between; gap:24px; margin:20px 0; }
  .box { flex:1; border:1px solid #e5e7eb; border-radius:8px; padding:12px 14px; }
  .box h4 { font-size:10.5px; text-transform:uppercase; letter-spacing:1px; color:${accent}; margin-bottom:6px; }
  table.items { width:100%; border-collapse:collapse; margin-top:8px; }
  table.items th { background:${accent}; color:#fff; text-align:left; padding:8px 10px; font-size:11.5px; }
  table.items td { padding:9px 10px; border-bottom:1px solid #e5e7eb; }
  .num { text-align:right; }
  table.totals { margin-left:auto; margin-top:12px; width:280px; border-collapse:collapse; }
  table.totals td { padding:5px 10px; font-size:12.5px; }
  table.totals td.l { color:#6b7280; } table.totals td.r { text-align:right; }
  table.totals tr.grand td { border-top:2px solid ${accent}; font-weight:700; font-size:14px; padding-top:8px; }
  .words { margin-top:10px; font-size:11.5px; color:#374151; }
  .foot { margin-top:36px; border-top:1px solid #e5e7eb; padding-top:10px; text-align:center; }
</style></head><body>
  <div class="head">
    <div>
      <div class="brand">${esc(issuer.name)}</div>
      <div class="muted">${esc(issuer.legalName)}<br/>${issuerAddress}<br/>
        ${issuer.gstin ? `GSTIN: ${esc(issuer.gstin)}<br/>` : ''}${issuer.email ? `${esc(issuer.email)}` : ''}</div>
    </div>
    <div>
      <div class="tag">TAX INVOICE</div>
      <div class="meta">
        <b>Invoice No:</b> ${esc(inv.invoiceNo)}<br/>
        <b>Date:</b> ${new Date(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}<br/>
        <b>Status:</b> ${esc(inv.status)}
      </div>
    </div>
  </div>
  <div class="cols">
    <div class="box">
      <h4>Billed To</h4>
      <b>${esc(inv.companyName)}</b>
      <div class="muted">${esc(inv.billingAddress || '')}${inv.gstin ? `<br/>GSTIN: ${esc(inv.gstin)}` : ''}${inv.companyEmail ? `<br/>${esc(inv.companyEmail)}` : ''}</div>
    </div>
    <div class="box">
      <h4>Payment Details</h4>
      <div class="muted">
        Order ID: ${esc(inv.orderId)}<br/>
        ${inv.cfPaymentId ? `Payment ID: ${esc(inv.cfPaymentId)}<br/>` : ''}
        ${inv.paymentMethod ? `Method: ${esc(inv.paymentMethod)}<br/>` : ''}
        ${inv.paymentDate ? `Paid on: ${new Date(inv.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
      </div>
    </div>
  </div>
  <table class="items">
    <tr><th style="width:50%">Description</th><th class="num">${esc(presentationFor(inv.purpose).qtyHeader)}</th><th class="num">Amount</th></tr>
    <tr>
      <td>${esc(presentationFor(inv.purpose).itemLabel)}</td>
      <td class="num">${inv.creditsPurchased.toLocaleString('en-IN')}</td>
      <td class="num">${inr(inv.baseAmount)}</td>
    </tr>
  </table>
  <table class="totals">
    <tr><td class="l">Subtotal</td><td class="r">${inr(inv.baseAmount)}</td></tr>
    ${gstRows}
    <tr class="grand"><td class="l">Total Paid</td><td class="r">${inr(inv.totalAmount)}</td></tr>
  </table>
  <div class="words"><b>Amount in words:</b> ${esc(amountInWords(inv.totalAmount))}</div>
  <div class="foot muted">${esc(issuer.footerText || 'This is a computer generated invoice.')}</div>
</body></html>`;
}

/** PDF buffer via the shared Puppeteer pipeline. */
async function renderInvoicePdf(inv) {
  const { htmlToPdf } = require('../invoicePdfMailer');
  return htmlToPdf(renderInvoiceHtml(inv));
}

module.exports = { createForOrder, renderInvoiceHtml, renderInvoicePdf };
