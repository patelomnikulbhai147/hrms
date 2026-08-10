const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const handlebars = require('handlebars');
const canvasRenderer = require('./canvasRenderer');

// Register Handlebars helpers for currency and date formatting
handlebars.registerHelper('money', function (amount) {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

handlebars.registerHelper('date', function (dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
});

handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});

const DEFAULT_INVOICE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 20px; font-size: 14px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .logo { max-height: 80px; max-width: 200px; }
  .company-details { text-align: right; }
  .company-name { font-size: 24px; font-weight: bold; color: #1f2937; margin: 0 0 5px 0; }
  .invoice-title { font-size: 32px; font-weight: bold; color: #6366f1; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 20px; }
  .info-section { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .info-box { width: 48%; }
  .info-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px; font-weight: 600; }
  .info-value { font-size: 14px; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { background-color: #f3f4f6; color: #374151; font-weight: 600; text-align: left; padding: 12px; font-size: 13px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; }
  td { padding: 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563; }
  .text-right { text-align: right; }
  .totals-section { width: 40%; margin-left: auto; }
  .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
  .total-row.grand-total { font-weight: bold; font-size: 18px; color: #111827; border-bottom: none; border-top: 2px solid #e5e7eb; padding-top: 12px; margin-top: 4px; }
  .footer { margin-top: 60px; border-top: 1px solid #e5e7eb; padding-top: 20px; font-size: 12px; color: #6b7280; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div>
      {{#if company.logo}}
        <img src="{{company.logo}}" class="logo" alt="Company Logo" />
      {{else}}
        <div class="invoice-title">INVOICE</div>
      {{/if}}
    </div>
    <div class="company-details">
      <h1 class="company-name">{{company.name}}</h1>
      <div>{{company.address}}</div>
      {{#if company.gstin}}<div>GSTIN: {{company.gstin}}</div>{{/if}}
      {{#if company.contactEmail}}<div>{{company.contactEmail}}</div>{{/if}}
      {{#if company.contactNumber}}<div>{{company.contactNumber}}</div>{{/if}}
    </div>
  </div>

  {{#if company.logo}}
    <div class="invoice-title">INVOICE</div>
  {{/if}}

  <div class="info-section">
    <div class="info-box">
      <div class="info-label">Billed To</div>
      <div class="info-value">{{invoice.billToName}}</div>
      {{#if invoice.billToAddress}}<div>{{invoice.billToAddress}}</div>{{/if}}
      {{#if invoice.billToGstin}}<div>GSTIN: {{invoice.billToGstin}}</div>{{/if}}
    </div>
    <div class="info-box">
      <table style="margin: 0;">
        <tr><td style="border:none; padding: 4px 0" class="info-label">Invoice Number:</td><td style="border:none; padding: 4px 0" class="info-value text-right">{{invoice.invoiceNumber}}</td></tr>
        <tr><td style="border:none; padding: 4px 0" class="info-label">Invoice Date:</td><td style="border:none; padding: 4px 0" class="info-value text-right">{{date invoice.invoiceDate}}</td></tr>
        {{#if invoice.dueDate}}
        <tr><td style="border:none; padding: 4px 0" class="info-label">Due Date:</td><td style="border:none; padding: 4px 0" class="info-value text-right">{{date invoice.dueDate}}</td></tr>
        {{/if}}
      </table>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item & Description</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Rate</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>
          <div style="font-weight: 500; color: #111827;">{{this.name}}</div>
          {{#if this.description}}<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">{{this.description}}</div>{{/if}}
        </td>
        <td class="text-right">{{this.quantity}} {{this.unit}}</td>
        <td class="text-right">{{money this.rate}}</td>
        <td class="text-right">{{money this.amount}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div style="display: flex; justify-content: space-between;">
    <div style="width: 50%;">
      {{#if invoice.bankDetails}}
      <div class="info-label" style="margin-top: 20px;">Bank Details</div>
      <div style="font-size: 13px; color: #4b5563; white-space: pre-wrap;">{{invoice.bankDetails}}</div>
      {{/if}}
      
      {{#if invoice.notes}}
      <div class="info-label" style="margin-top: 20px;">Notes</div>
      <div style="font-size: 13px; color: #4b5563; white-space: pre-wrap;">{{invoice.notes}}</div>
      {{/if}}
    </div>
    
    <div class="totals-section">
      <div class="total-row">
        <span>Subtotal</span>
        <span>{{money invoice.subtotal}}</span>
      </div>
      {{#if invoice.discountTotal}}
      <div class="total-row">
        <span>Discount</span>
        <span>-{{money invoice.discountTotal}}</span>
      </div>
      {{/if}}
      {{#if invoice.cgst}}
      <div class="total-row">
        <span>CGST</span>
        <span>{{money invoice.cgst}}</span>
      </div>
      <div class="total-row">
        <span>SGST</span>
        <span>{{money invoice.sgst}}</span>
      </div>
      {{/if}}
      {{#if invoice.igst}}
      <div class="total-row">
        <span>IGST</span>
        <span>{{money invoice.igst}}</span>
      </div>
      {{/if}}
      <div class="total-row grand-total">
        <span>Total</span>
        <span>{{money invoice.grandTotal}}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>{{#if company.website}}{{company.website}}{{/if}}</div>
    <div>Thank you for your business.</div>
  </div>
</body>
</html>
`;

/**
 * Resolves the active invoice template for a given company and branch.
 * Resolution order:
 * 1. Active Branch Template (if branchId provided)
 * 2. Active Company Template
 * 3. System Default (Hardcoded fallback)
 */
exports.resolveInvoiceTemplate = async (companyId, branchId = null) => {
  if (branchId) {
    const branchTemplate = await prisma.documentTemplate.findFirst({
      where: { companyId: Number(companyId), branchId: Number(branchId), type: 'Invoice', status: 'Active' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
    });
    if (branchTemplate) return branchTemplate;
  }

  const companyTemplate = await prisma.documentTemplate.findFirst({
    where: { companyId: Number(companyId), branchId: null, type: 'Invoice', status: 'Active' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
  });

  if (companyTemplate) return companyTemplate;

  return { id: null, isDefault: true, content: DEFAULT_INVOICE_TEMPLATE, name: 'System Default' };
};

/**
 * Resolves a historical template by ID and version ID.
 * Falls back to resolveInvoiceTemplate if not found.
 */
exports.resolveHistoricalTemplate = async (companyId, templateId, versionId) => {
  if (!templateId) return exports.resolveInvoiceTemplate(companyId, null);
  
  if (versionId) {
    const version = await prisma.templateVersion.findUnique({
      where: { id: Number(versionId) },
      include: { template: true }
    });
    if (version && version.template.companyId === Number(companyId)) {
      return { ...version.template, content: version.content };
    }
  }
  
  const template = await prisma.documentTemplate.findFirst({
    where: { id: Number(templateId), companyId: Number(companyId) }
  });
  
  if (template) return template;
  
  return exports.resolveInvoiceTemplate(companyId, null);
};

/**
 * Renders the HTML template with the provided invoice and company data.
 */
exports.renderInvoiceHtml = (templateContent, invoiceData) => {
  console.log('[InvoiceRenderer]', {
    templateId: invoiceData?.invoice?.templateId,
    templateName: invoiceData?.invoice?.templateName,
    versionId: invoiceData?.invoice?.templateVersionId
  });
  try {
    let parsed = null;
    try {
      parsed = JSON.parse(templateContent);
    } catch (e) {
      // Not JSON, continue to Handlebars
    }

    if (parsed && (parsed.elements || parsed.blocks || Array.isArray(parsed))) {
      const blocks = parsed.elements || parsed.blocks || (Array.isArray(parsed) ? parsed : []);
      
      return canvasRenderer.renderInvoiceHtml(
        invoiceData.invoice, 
        invoiceData.company || {}, 
        undefined, 
        { blocks }, 
        { print: true }
      );
    }
  } catch (err) {
    console.error('Canvas rendering error:', err);
  }

  try {
    const compileTemplate = handlebars.compile(templateContent || DEFAULT_INVOICE_TEMPLATE);
    return compileTemplate(invoiceData);
  } catch (err) {
    console.error('Template compilation error:', err);
    // Fallback to default if custom template fails to compile
    const fallbackTemplate = handlebars.compile(DEFAULT_INVOICE_TEMPLATE);
    return fallbackTemplate(invoiceData);
  }
};
