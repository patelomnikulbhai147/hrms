// ─────────────────────────────────────────────────────────────────────────────
// INVOICE → PDF → EMAIL (Invoice Management only).
//
// The client posts the EXACT invoice HTML it is displaying (rendered by
// components/invoicing/serviceInvoice), so the attached PDF is byte-for-byte the
// invoice the user edited and printed — there is no second server-side template
// that could drift from the on-screen one.
//
// Puppeteer is loaded LAZILY: a server without a Chromium download still starts
// and every other invoice feature keeps working; only this endpoint reports that
// PDF generation is unavailable.
//
// SCOPE: nothing here is used by subscription invoices, payslips or vendor bills.
// ─────────────────────────────────────────────────────────────────────────────
const { sendMail, isSmtpConfigured } = require('./emailService');
const { DEFAULT_BRAND } = require('./emailBranding');

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    const puppeteer = require('puppeteer');
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    }).then((b) => { b.on('disconnected', () => { browserPromise = null; }); return b; })
      .catch((e) => { browserPromise = null; throw e; });
  }
  return browserPromise;
}

/** Render an A4 PDF from a full HTML document. Returns a Buffer. */
async function htmlToPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(String(html), { waitUntil: 'networkidle0', timeout: 30000 });
    const out = await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
    });
    // Newer Puppeteer returns a Uint8Array; nodemailer attachments need a Buffer.
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  } finally {
    await page.close().catch(() => {});
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The covering email body (the invoice itself travels as the PDF attachment). */
function mailBody({ invoice, companyName, message }) {
  const due = Number(invoice.balanceDue ?? invoice.grandTotal) || 0;
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6">
  <p>Dear ${esc(invoice.billToName || 'Customer')},</p>
  <p>${message ? esc(message).replace(/\n/g, '<br/>') : `Please find attached invoice <b>${esc(invoice.invoiceNumber)}</b> dated ${esc(invoice.invoiceDate)}.`}</p>
  <table style="border-collapse:collapse;margin:14px 0;font-size:13px">
    <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Invoice No.</td><td style="padding:4px 0;font-weight:700">${esc(invoice.invoiceNumber)}</td></tr>
    <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Invoice Date</td><td style="padding:4px 0;font-weight:700">${esc(invoice.invoiceDate)}</td></tr>
    ${invoice.dueDate ? `<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Due Date</td><td style="padding:4px 0;font-weight:700">${esc(invoice.dueDate)}</td></tr>` : ''}
    <tr><td style="padding:4px 14px 4px 0;color:#6b7280">Amount</td><td style="padding:4px 0;font-weight:700">${money(invoice.grandTotal)}</td></tr>
    ${due > 0 ? `<tr><td style="padding:4px 14px 4px 0;color:#6b7280">Outstanding</td><td style="padding:4px 0;font-weight:700;color:#b91c1c">${money(due)}</td></tr>` : ''}
  </table>
  <p style="color:#6b7280;font-size:12px">Regards,<br/>${esc(companyName || DEFAULT_BRAND.name)}</p>
</div>`;
}

/**
 * Build the PDF and email it.
 * @returns {Promise<{delivered:boolean, devMode?:boolean, configured?:boolean, error?:string, pdfBytes?:number}>}
 */
async function emailInvoicePdf({ to, cc, subject, message, html, invoice, companyName, companyId }) {
  let pdf = null;
  try {
    pdf = await htmlToPdf(html);
  } catch (e) {
    return { delivered: false, error: `PDF generation failed: ${e.message}` };
  }
  const fileName = `${String(invoice.invoiceNumber || 'Invoice').replace(/[^\w.-]+/g, '_')}.pdf`;
  const res = await sendMail({
    to, cc,
    subject: subject || `Invoice ${invoice.invoiceNumber} from ${companyName || DEFAULT_BRAND.name}`,
    text: `Please find attached invoice ${invoice.invoiceNumber} dated ${invoice.invoiceDate} for ${money(invoice.grandTotal)}.`,
    html: mailBody({ invoice, companyName, message }),
    attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
    companyId,
  });
  return { ...res, pdfBytes: pdf.length, fileName };
}

module.exports = { emailInvoicePdf, htmlToPdf, isSmtpConfigured };
