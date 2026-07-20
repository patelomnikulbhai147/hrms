// Server-side A4 GST invoice renderer (ZeniaHR-branded). Used for emailing an
// invoice and as the /html print fallback. Self-contained inline CSS so it renders
// identically in an email client or a print window. The frontend has its own React
// preview using the same layout — this is the canonical text/email copy.
const BRAND = { name: 'ZeniaHR', color: '#7c3aed', address: 'ZeniaHR Technologies', email: 'billing@zeniahr.com' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n, cur = '₹') => `${cur}${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const STATUS_COLOR = { Paid: '#059669', Pending: '#d97706', Overdue: '#dc2626', Cancelled: '#6b7280', Refunded: '#0891b2', Draft: '#6b7280' };

function renderInvoiceHtml(inv, { settings = {} } = {}) {
  const cur = '₹';
  const sellerGstin = settings.gstNumber || '';
  const status = inv.status || 'Pending';
  const balance = Math.max(0, (inv.grandTotal || 0) - (inv.amountPaid || 0));
  const gstRows = inv.interState
    ? `<tr><td>IGST (${inv.gstPercent}%)</td><td style="text-align:right">${money(inv.igst, cur)}</td></tr>`
    : `<tr><td>CGST (${(inv.gstPercent / 2)}%)</td><td style="text-align:right">${money(inv.cgst, cur)}</td></tr>
       <tr><td>SGST (${(inv.gstPercent / 2)}%)</td><td style="text-align:right">${money(inv.sgst, cur)}</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${esc(inv.invoiceNo)}</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;background:#f1f5f9}
  .sheet{max-width:820px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,.08)}
  .hd{display:flex;justify-content:space-between;align-items:flex-start;padding:28px 32px;background:linear-gradient(135deg,${BRAND.color},#4f46e5);color:#fff}
  .brand{display:flex;align-items:center;gap:12px}
  .logo{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px}
  .brand h1{margin:0;font-size:22px;letter-spacing:-.5px} .brand p{margin:2px 0 0;font-size:11px;opacity:.85}
  .inv-meta{text-align:right} .inv-meta .t{font-size:12px;text-transform:uppercase;letter-spacing:2px;opacity:.85} .inv-meta .n{font-size:20px;font-weight:800}
  .badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;margin-top:6px;background:${STATUS_COLOR[status] || '#6b7280'}}
  .body{padding:28px 32px}
  .grid{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:22px}
  .col{min-width:220px} .col h3{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8}
  .col .name{font-weight:700;font-size:15px} .col div{font-size:13px;line-height:1.5;color:#475569}
  table{width:100%;border-collapse:collapse;margin-top:8px} th{background:#f8fafc;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0}
  td{padding:11px 12px;font-size:13px;border-bottom:1px solid #f1f5f9}
  .totals{margin-left:auto;width:320px;margin-top:14px} .totals td{border:none;padding:6px 12px}
  .totals .grand td{border-top:2px solid #e2e8f0;font-size:17px;font-weight:800;color:${BRAND.color};padding-top:12px}
  .pay{margin-top:22px;padding:16px;border:1px dashed #cbd5e1;border-radius:10px;font-size:12.5px;color:#475569}
  .ft{padding:18px 32px;background:#f8fafc;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center}
  .sign{text-align:right} .sign .line{margin-top:26px;border-top:1px solid #cbd5e1;width:180px;display:inline-block;padding-top:4px;font-size:11px;color:#64748b}
</style></head>
<body><div class="sheet">
  <div class="hd">
    <div class="brand"><div class="logo">Z</div><div><h1>${esc(BRAND.name)}</h1><p>${esc(BRAND.address)}${sellerGstin ? ' · GSTIN ' + esc(sellerGstin) : ''}</p></div></div>
    <div class="inv-meta"><div class="t">Tax Invoice</div><div class="n">${esc(inv.invoiceNo)}</div><div class="badge">${esc(status)}</div></div>
  </div>
  <div class="body">
    <div class="grid">
      <div class="col"><h3>Billed To</h3><div class="name">${esc(inv.companyName)}</div><div>${esc(inv.companyHead || '')}</div><div>${esc(inv.billingAddress || '')}</div><div>${esc(inv.companyEmail || '')}</div>${inv.gstin ? `<div>GSTIN: ${esc(inv.gstin)}</div>` : ''}</div>
      <div class="col"><h3>Invoice Details</h3>
        <div><b>Invoice Date:</b> ${dt(inv.invoiceDate)}</div>
        <div><b>Due Date:</b> ${dt(inv.dueDate)}</div>
        <div><b>Plan:</b> ${esc(inv.plan)} (${esc(inv.billingCycle)})</div>
        <div><b>Period:</b> ${dt(inv.periodStart)} – ${dt(inv.periodEnd)}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th style="text-align:center">Employees</th><th style="text-align:right">Rate / Employee</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody><tr>
        <td><b>${esc(inv.plan)} Plan Subscription</b><br><span style="color:#94a3b8;font-size:12px">${esc(inv.billingCycle)} · ${dt(inv.periodStart)} – ${dt(inv.periodEnd)}</span></td>
        <td style="text-align:center">${inv.employeeCount}</td>
        <td style="text-align:right">${money(inv.pricePerEmployee, cur)}</td>
        <td style="text-align:right">${money(inv.subtotal, cur)}</td>
      </tr></tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td style="text-align:right">${money(inv.subtotal, cur)}</td></tr>
      ${inv.discountAmount ? `<tr><td>Discount (${inv.discountPercent}%)</td><td style="text-align:right;color:#059669">− ${money(inv.discountAmount, cur)}</td></tr>` : ''}
      ${gstRows}
      <tr class="grand"><td>Grand Total</td><td style="text-align:right">${money(inv.grandTotal, cur)}</td></tr>
      ${inv.amountPaid ? `<tr><td>Paid</td><td style="text-align:right">${money(inv.amountPaid, cur)}</td></tr><tr><td><b>Balance Due</b></td><td style="text-align:right"><b>${money(balance, cur)}</b></td></tr>` : ''}
    </table>
    <div class="pay">
      <b>Payment Instructions:</b> Please pay by the due date to keep your subscription active.${settings.invoicePrefix ? '' : ''}
      ${inv.notes ? `<br><b>Notes:</b> ${esc(inv.notes)}` : ''}
      ${inv.terms ? `<br><b>Terms:</b> ${esc(inv.terms)}` : ''}
      <div class="sign"><span class="line">Authorized Signatory · ${esc(BRAND.name)}</span></div>
    </div>
  </div>
  <div class="ft"><span>This is a computer-generated GST invoice from ${esc(BRAND.name)}.</span><span>${esc(BRAND.email)}</span></div>
</div></body></html>`;
}

module.exports = { renderInvoiceHtml };
