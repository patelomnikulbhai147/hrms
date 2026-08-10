const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const Handlebars = require('handlebars');
const QRCode = require('qrcode');
const crypto = require('crypto');

// Register common Handlebars helpers
Handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});
Handlebars.registerHelper('formatDate', function(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString();
});

/**
 * Resolves the active template for a given context.
 * Hierarchy:
 * 1. Assigned specifically to targetId and targetType
 * 2. Assigned to targetType without specific targetId (fallback for that type)
 * 3. Active template globally for the company
 */
exports.resolveActiveTemplate = async (companyId, type, context = {}) => {
  // First, check if there are any assignments for this template type in the company
  const templates = await prisma.documentTemplate.findMany({
    where: { companyId: Number(companyId), type, status: 'Active' },
    include: { assignments: true },
    orderBy: { updatedAt: 'desc' }
  });

  if (!templates || templates.length === 0) {
    return null; // No active templates for this type
  }

  // Attempt to find a specific assignment based on context
  // e.g. context = { Client: 5, Branch: 2 }
  for (const template of templates) {
    for (const assignment of template.assignments) {
      if (context[assignment.targetType] && context[assignment.targetType] == assignment.targetId) {
        return template;
      }
    }
  }

  // Fallback to a global active template (one without specific assignments, or just the first active one)
  // Usually, there's one "Global" template
  const globalTemplate = templates.find(t => t.assignments.length === 0) || templates[0];
  
  return globalTemplate;
};

/**
 * Interpolates variables in a string using Handlebars
 */
exports.interpolate = (content, data = {}) => {
  if (!content) return '';
  try {
    const template = Handlebars.compile(content);
    return template(data);
  } catch (err) {
    console.error('Handlebars compile error:', err);
    return content; // Fallback to raw content if syntax error
  }
};

exports.renderTemplate = async (templateId, data) => {
  const template = await prisma.documentTemplate.findUnique({
    where: { id: Number(templateId) },
    include: { company: true }
  });

  if (!template) throw new Error('Template not found');

  // Generate a unique document hash for verification
  const documentHash = crypto.randomBytes(16).toString('hex');
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify/${documentHash}`;
  
  // Generate QR code as base64 data URI
  let qrCodeBase64 = '';
  try {
    qrCodeBase64 = await QRCode.toDataURL(verificationUrl);
  } catch (err) {
    console.error('QR Generation failed:', err);
  }

  // Inject company branding and QR verification data
  const templateData = {
    ...data,
    company_primary_color: template.company?.primaryColor || '#000000',
    company_logo: template.company?.logo || '',
    company_footer: template.company?.footerText || '',
    company_signature: template.company?.signatureText || '',
    document_hash: documentHash,
    qr_code: qrCodeBase64
  };

  if (template.designType === 'HTML') {
    let htmlContent = this.interpolate(template.content, templateData);
    
    // Add default CSS variables to the top of the HTML if not already present
    const brandingStyles = `
      <style>
        :root {
          --primary-color: ${templateData.company_primary_color};
        }
      </style>
    `;
    
    if (htmlContent.includes('<head>')) {
      htmlContent = htmlContent.replace('<head>', `<head>${brandingStyles}`);
    } else {
      htmlContent = `${brandingStyles}${htmlContent}`;
    }

    return { htmlContent, documentHash };
  }

  // For PDF_BACKGROUND or DOCX, additional logic would be handled here or by other services
  throw new Error('Unsupported template design type for rendering HTML');
};
