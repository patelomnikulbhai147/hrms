// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION BILLING — professional A4 TAX INVOICE renderer (Super Admin only).
//
// Corporate bordered layout: issuer header, TAX INVOICE meta, Bill To,
// Subscription details, GST item table, totals (discount/CGST/SGST/IGST/round
// off), amount in words, bank + UPI/QR, payment status, notes, terms, signature
// and footer. Self-contained inline CSS so preview === print === PDF === email.
//
// SCOPE: used ONLY by Super Admin → Subscription Management → Billing & Invoices.
// It does NOT touch the company-side Invoice Management module, payroll
// payslips, or any customer invoice template.
//
// Issuer/branding/bank/signature come from invoiceIssuerStore (editable in the
// UI); the money figures come straight off the persisted invoice row so the
// document always matches what the system will settle on payment.
// ─────────────────────────────────────────────────────────────────────────────
const { amountInWords } = require('../utils/amountInWords');
const { getIssuer } = require('./invoiceIssuerStore');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
const n2 = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => `₹${n2(n)}`;
const dt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STATUS_COLOR = { Paid: '#059669', Pending: '#d97706', Overdue: '#dc2626', Cancelled: '#6b7280', Refunded: '#0891b2', Draft: '#64748b', Partial: '#d97706' };

// One "label: value" line, omitted entirely when the value is empty.
const line = (label, value) => (value ? `<div><span class="lbl">${esc(label)}</span> ${esc(value)}</div>` : '');
const metaRow = (label, value) => (value ? `<tr><td class="mk">${esc(label)}</td><td class="mv">${esc(value)}</td></tr>` : '');

function issuerAddress(iss) {
  const cityLine = [iss.city, iss.state, iss.pincode].filter(Boolean).join(', ');
  return [iss.addressLine1, iss.addressLine2, cityLine, iss.country].filter(Boolean);
}

function renderInvoiceHtml(inv, { settings = {}, issuer } = {}) {
  const iss = { ...getIssuer(), ...(issuer || {}) };
  const accent = iss.accentColor || '#7c3aed';
  const status = inv.status || 'Pending';
  const paid = Number(inv.amountPaid) || 0;
  const grand = Number(inv.grandTotal) || 0;
  const balance = Math.max(0, grand - paid);

  // Money breakdown (derived from the PERSISTED row — never recomputed here, so
  // the printed total always equals the amount the system settles).
  const subtotal = Number(inv.subtotal) || 0;
  const discount = Number(inv.discountAmount) || 0;
  const gstAmount = Number(inv.gstAmount) || 0;
  const taxable = subtotal - discount;
  // Round-off is the difference already baked into the stored grand total
  // (0.00 with the current engine). Shown only when it is actually non-zero, so
  // the document can never disagree with the payable amount.
  const roundOff = grand - (taxable + gstAmount);
  const showRoundOff = iss.roundOff && Math.abs(roundOff) >= 0.005;

  // ── Item rows ──────────────────────────────────────────────────────────────
  // Invoices edited in the Invoice Editor carry explicit `lineItems`; render each
  // one. Legacy (headcount × rate) invoices keep their original single row, so
  // every previously-generated document prints exactly as before.
  const editedItems = Array.isArray(inv.lineItems) && inv.lineItems.length ? inv.lineItems : null;
  const itemRows = editedItems
    ? editedItems.map((it, i) => {
        const qty = Number(it.quantity) || 0;
        const rate = Number(it.rate) || 0;
        const gross = qty * rate;
        const itTaxable = Number(it.taxable != null ? it.taxable : gross - gross * ((Number(it.discountPercent) || 0) / 100));
        const itGst = Number(it.gstAmount != null ? it.gstAmount : itTaxable * ((Number(it.taxPercent) || 0) / 100));
        const itTotal = Number(it.total != null ? it.total : itTaxable + itGst);
        const disc = Number(it.discountPercent) || 0;
        return `<tr>
        <td class="ctr">${i + 1}</td>
        <td class="desc"><b>${esc(it.description || '')}</b>${disc ? `<div class="sub">Discount ${esc(disc)}%</div>` : ''}</td>
        <td class="ctr">${esc(it.hsn || '')}</td>
        <td class="ctr">${esc(qty)}</td>
        <td class="num">${money(rate)}</td>
        <td class="num">${money(itTaxable)}</td>
        <td class="ctr">${esc(Number(it.taxPercent) || 0)}%</td>
        <td class="num">${money(itGst)}</td>
        <td class="num">${money(itTotal)}</td>
      </tr>`;
      }).join('')
    : `<tr>
        <td class="ctr">1</td>
        <td class="desc">
          <b>${esc(inv.plan)} Plan — Subscription</b>
          <div class="sub">${esc(inv.billingCycle)} subscription for ${esc(inv.employeeCount)} employee(s)<br>Period: ${dt(inv.periodStart)} – ${dt(inv.periodEnd)}</div>
        </td>
        <td class="ctr">998314</td>
        <td class="ctr">${esc(inv.employeeCount)}</td>
        <td class="num">${money(inv.pricePerEmployee)}</td>
        <td class="num">${money(taxable)}</td>
        <td class="ctr">${esc(inv.gstPercent)}%</td>
        <td class="num">${money(gstAmount)}</td>
        <td class="num">${money(taxable + gstAmount)}</td>
      </tr>`;

  const gstRows = inv.interState
    ? `<tr><td class="tl">IGST (${esc(inv.gstPercent)}%)</td><td class="tr">${money(inv.igst)}</td></tr>`
    : `<tr><td class="tl">CGST (${esc((Number(inv.gstPercent) || 0) / 2)}%)</td><td class="tr">${money(inv.cgst)}</td></tr>
       <tr><td class="tl">SGST (${esc((Number(inv.gstPercent) || 0) / 2)}%)</td><td class="tr">${money(inv.sgst)}</td></tr>`;

  const logo = iss.logo
    ? `<img src="${esc(iss.logo)}" alt="${esc(iss.name)}" class="logo-img">`
    : `<div class="logo-tile" style="background:${esc(accent)}">${esc((iss.name || 'Z').charAt(0))}</div>`;

  const bankRows = [
    ['Account Name', iss.bankAccountName], ['Bank Name', iss.bankName],
    ['Account Number', iss.bankAccountNumber], ['IFSC Code', iss.bankIfsc],
    ['Branch', iss.bankBranch], ['UPI ID', iss.upiId],
  ].filter(([, v]) => v);

  // Editor-supplied values win over the auto-filled ones so the printed document
  // always matches what was saved in the Invoice Editor.
  const billTo = [
    ['Contact Person', inv.contactPerson || inv.companyHead], ['Email', inv.companyEmail], ['Phone', inv.companyPhone],
    ['GSTIN', inv.gstin], ['PAN', inv.pan || inv.companyPan],
  ].filter(([, v]) => v);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tax Invoice ${esc(inv.invoiceNo)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  *{box-sizing:border-box}
  body{margin:0;background:#eef2f7;font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{width:210mm;min-height:297mm;margin:16px auto;background:#fff;padding:10mm;border:1px solid #111}
  .b{border:1px solid #111}
  table{width:100%;border-collapse:collapse}
  .lbl{color:#555;font-weight:600}
  /* ── Header ── */
  .top{display:flex;border:1px solid #111}
  .top .left{width:58%;padding:10px 12px;border-right:1px solid #111}
  .top .right{width:42%;padding:0}
  .brand{display:flex;gap:10px;align-items:flex-start}
  .logo-img{width:52px;height:52px;object-fit:contain}
  .logo-tile{width:52px;height:52px;border-radius:8px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800}
  .brand h1{margin:0;font-size:19px;letter-spacing:-.3px}
  .brand .tag{font-size:10.5px;color:#555;margin-top:1px}
  .issuer{margin-top:8px;font-size:10.5px;line-height:1.55;color:#333}
  .issuer .lbl{color:#555}
  .titlebar{background:${accent};color:#fff;text-align:center;font-size:15px;font-weight:800;letter-spacing:3px;padding:7px 0}
  .meta td{border-bottom:1px solid #ddd;padding:4.5px 10px;font-size:10.5px}
  .meta tr:last-child td{border-bottom:none}
  .meta .mk{color:#555;width:45%;font-weight:600}
  .meta .mv{text-align:right;font-weight:700}
  /* ── Party blocks ── */
  .parties{display:flex;border:1px solid #111;border-top:none}
  .parties .p{width:50%;padding:9px 12px;font-size:10.5px;line-height:1.6}
  .parties .p:first-child{border-right:1px solid #111}
  .sec{font-size:9.5px;font-weight:800;letter-spacing:1.2px;color:#fff;background:#374151;padding:3px 8px;display:inline-block;margin-bottom:6px}
  .pname{font-size:13px;font-weight:800;margin-bottom:2px}
  /* ── Items ── */
  .items{border:1px solid #111;border-top:none}
  .items th{background:#f3f4f6;border-bottom:1px solid #111;border-right:1px solid #ddd;padding:7px 8px;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;text-align:left}
  .items td{border-right:1px solid #ddd;border-bottom:1px solid #eee;padding:9px 8px;font-size:10.5px;vertical-align:top}
  .items th:last-child,.items td:last-child{border-right:none}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .ctr{text-align:center}
  .desc b{font-size:11.5px}
  .desc .sub{color:#666;font-size:9.8px;margin-top:2px;line-height:1.5}
  /* ── Totals ── */
  .totwrap{display:flex;border:1px solid #111;border-top:none}
  .words{width:58%;padding:10px 12px;border-right:1px solid #111;font-size:10.5px}
  .words .w{font-weight:800;font-size:11px;margin-top:3px;text-transform:capitalize}
  .totals{width:42%}
  .totals td{padding:5px 10px;font-size:10.5px;border-bottom:1px solid #eee}
  .totals .tl{color:#444}.totals .tr{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .totals .grand td{background:${accent};color:#fff;font-size:13px;font-weight:800;border-bottom:none;padding:9px 10px}
  .totals .bal td{background:#fef3c7;font-weight:800}
  /* ── Bank / status ── */
  .lower{display:flex;border:1px solid #111;border-top:none}
  .lower .bank{width:58%;padding:9px 12px;border-right:1px solid #111}
  .lower .payblk{width:42%;padding:9px 12px}
  .bank table td{padding:2.5px 0;font-size:10.5px}
  .bank table td:first-child{color:#555;width:44%}
  .bank table td:last-child{font-weight:700}
  .qr{margin-top:8px;display:flex;align-items:center;gap:9px}
  .qrbox{width:62px;height:62px;border:1px dashed #999;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#888;text-align:center;line-height:1.3}
  .pill{display:inline-block;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:800;color:#fff}
  /* ── Notes / signature / footer ── */
  .notes{border:1px solid #111;border-top:none;padding:9px 12px;font-size:10px;line-height:1.6;color:#333}
  .notes b{color:#111}
  .signrow{display:flex;border:1px solid #111;border-top:none}
  .signrow .l{width:58%;padding:9px 12px;border-right:1px solid #111;font-size:9.5px;color:#666}
  .signrow .r{width:42%;padding:9px 12px;text-align:right}
  .sigimg{max-height:44px;max-width:170px;object-fit:contain;display:block;margin-left:auto}
  .sigline{margin-top:30px;border-top:1px solid #111;display:inline-block;padding-top:3px;font-size:10px;font-weight:700}
  .foot{text-align:center;font-size:9.5px;color:#555;padding:8px 0 0}
  @media print{ body{background:#fff} .sheet{margin:0;border:none;width:auto;min-height:auto;padding:0} }
</style></head>
<body><div class="sheet">

  <!-- HEADER -->
  <div class="top">
    <div class="left">
      <div class="brand">
        ${logo}
        <div>
          <h1>${esc(iss.legalName || iss.name)}</h1>
          ${iss.tagline ? `<div class="tag">${esc(iss.tagline)}</div>` : ''}
        </div>
      </div>
      <div class="issuer">
        ${issuerAddress(iss).map((l) => `<div>${esc(l)}</div>`).join('')}
        ${line('Phone:', iss.phone)}
        ${line('Email:', iss.email)}
        ${line('Website:', iss.website)}
        ${line('GSTIN:', iss.gstin)}
        ${line('PAN:', iss.pan)}
      </div>
    </div>
    <div class="right">
      <div class="titlebar">TAX INVOICE</div>
      <table class="meta">
        ${metaRow('Invoice No.', inv.invoiceNo)}
        ${metaRow('Invoice Date', dt(inv.invoiceDate))}
        ${metaRow('Due Date', dt(inv.dueDate))}
        ${metaRow('Billing Period', `${dt(inv.periodStart)} – ${dt(inv.periodEnd)}`)}
        ${metaRow('Subscription', `${inv.plan || ''} · ${inv.billingCycle || ''}`)}
        ${metaRow('Payment Terms', iss.paymentTerms)}
      </table>
    </div>
  </div>

  <!-- BILL TO + SUBSCRIPTION -->
  <div class="parties">
    <div class="p">
      <div class="sec">BILL TO</div>
      <div class="pname">${esc(inv.companyName)}</div>
      ${inv.billingAddress ? `<div>${nl2br(inv.billingAddress)}</div>` : ''}
      ${billTo.map(([k, v]) => `<div><span class="lbl">${esc(k)}:</span> ${esc(v)}</div>`).join('')}
    </div>
    <div class="p">
      <div class="sec">SUBSCRIPTION DETAILS</div>
      <div><span class="lbl">Plan:</span> <b>${esc(inv.plan)}</b></div>
      <div><span class="lbl">Billing Cycle:</span> ${esc(inv.billingCycle)}</div>
      <div><span class="lbl">Employee Count:</span> ${esc(inv.employeeCount)}</div>
      <div><span class="lbl">Price / Employee:</span> ${money(inv.pricePerEmployee)}</div>
      <div><span class="lbl">Subscription Start:</span> ${dt(inv.periodStart)}</div>
      <div><span class="lbl">Subscription End:</span> ${dt(inv.periodEnd)}</div>
      ${inv.renewalDate ? `<div><span class="lbl">Renewal Date:</span> ${dt(inv.renewalDate)}</div>` : ''}
    </div>
  </div>

  <!-- ITEM TABLE -->
  <table class="items">
    <thead><tr>
      <th style="width:5%">Sr</th>
      <th style="width:28%">Description</th>
      <th class="ctr" style="width:9%">HSN/SAC</th>
      <th class="ctr" style="width:7%">Qty</th>
      <th class="num" style="width:10%">Rate</th>
      <th class="num" style="width:13%">Taxable Amt</th>
      <th class="ctr" style="width:7%">GST %</th>
      <th class="num" style="width:10%">GST Amt</th>
      <th class="num" style="width:11%">Total</th>
    </tr></thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- WORDS + TOTALS -->
  <div class="totwrap">
    <div class="words">
      <div class="lbl">Amount Chargeable (in words)</div>
      <div class="w">${esc(amountInWords(grand))}</div>
    </div>
    <table class="totals">
      <tr><td class="tl">Sub Total</td><td class="tr">${money(subtotal)}</td></tr>
      ${discount ? `<tr><td class="tl">Discount (${esc(inv.discountPercent)}%)</td><td class="tr" style="color:#059669">− ${money(discount)}</td></tr>` : ''}
      <tr><td class="tl">Taxable Value</td><td class="tr">${money(taxable)}</td></tr>
      ${gstRows}
      ${showRoundOff ? `<tr><td class="tl">Round Off</td><td class="tr">${roundOff < 0 ? '− ' : ''}${money(Math.abs(roundOff))}</td></tr>` : ''}
      <tr class="grand"><td>GRAND TOTAL</td><td class="tr" style="color:#fff">${money(grand)}</td></tr>
      ${paid ? `<tr><td class="tl">Amount Paid</td><td class="tr">${money(paid)}</td></tr>
      <tr class="bal"><td class="tl">Balance Due</td><td class="tr">${money(balance)}</td></tr>` : ''}
    </table>
  </div>

  <!-- BANK + PAYMENT STATUS -->
  <div class="lower">
    <div class="bank">
      <div class="sec">BANK DETAILS</div>
      ${bankRows.length
      ? `<table>${bankRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`
      : `<div style="font-size:10.5px;color:#888">Bank details not configured.</div>`}
      ${iss.showQrPlaceholder ? `<div class="qr"><div class="qrbox">SCAN<br>TO PAY</div><div style="font-size:9.5px;color:#666">${iss.upiId ? `UPI: <b>${esc(iss.upiId)}</b><br>` : ''}Scan the QR to pay this invoice.</div></div>` : ''}
    </div>
    <div class="payblk">
      <div class="sec">PAYMENT STATUS</div>
      <div style="margin:4px 0 8px"><span class="pill" style="background:${STATUS_COLOR[status] || '#6b7280'}">${esc(String(status).toUpperCase())}</span></div>
      <div style="font-size:10.5px;line-height:1.7">
        <div><span class="lbl">Invoice Total:</span> <b>${money(grand)}</b></div>
        <div><span class="lbl">Amount Paid:</span> ${money(paid)}</div>
        <div><span class="lbl">Balance Due:</span> <b>${money(balance)}</b></div>
        <div><span class="lbl">Due Date:</span> ${dt(inv.dueDate)}</div>
      </div>
    </div>
  </div>

  <!-- NOTES / TERMS -->
  ${(inv.notes || iss.defaultNotes || inv.terms || iss.defaultTerms) ? `<div class="notes">
    ${(inv.notes || iss.defaultNotes) ? `<div><b>Notes:</b><br>${nl2br(inv.notes || iss.defaultNotes)}</div>` : ''}
    ${(inv.terms || iss.defaultTerms) ? `<div style="margin-top:6px"><b>Terms &amp; Conditions:</b><br>${nl2br(inv.terms || iss.defaultTerms)}</div>` : ''}
  </div>` : ''}

  <!-- SIGNATURE -->
  <div class="signrow">
    <div class="l">E. &amp; O.E.<br>Declaration: This is a subscription service invoice issued under the stated GSTIN.</div>
    <div class="r">
      <div style="font-size:10.5px;font-weight:700">For ${esc(iss.legalName || iss.name)}</div>
      ${iss.signatureImage ? `<img class="sigimg" src="${esc(iss.signatureImage)}" alt="Signature">` : ''}
      <div class="sigline">${esc(iss.signatoryName || 'Authorized Signatory')}</div>
    </div>
  </div>

  <div class="foot">${esc(iss.footerText || 'Powered by ZeniaHR · This is a computer generated invoice.')}</div>
</div></body></html>`;
}

module.exports = { renderInvoiceHtml };
