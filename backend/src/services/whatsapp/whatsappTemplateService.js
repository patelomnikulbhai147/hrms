// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppTemplateService — read the WhatsApp-ready Communication Templates and
// resolve their placeholders for a recipient.
//
// Reuses the EXISTING communication_templates table (extended with the additive
// columns whatsappCompatible / whatsappRichText / whatsappCaption). This service
// never mutates templates — template CRUD stays in communicationController; here
// we only SELECT the WhatsApp-flagged ones and render their body/caption via the
// placeholder engine. No message is ever sent in Phase 1.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../../config/prisma');
const placeholders = require('./whatsappPlaceholders');

// List the company's templates that are flagged WhatsApp Compatible.
const listWhatsAppTemplates = async (companyId) =>
  prisma.communicationTemplate.findMany({
    where: { companyId, whatsappCompatible: true },
    orderBy: { updatedAt: 'desc' },
  });

// Fetch one template (company-scoped — never leaks another tenant's template).
const getTemplate = async (companyId, templateId) =>
  prisma.communicationTemplate.findFirst({ where: { id: templateId, companyId } });

// Build a render-ready WhatsApp message from a template + recipient context.
// Returns { body, caption, image, richText } with all {{tokens}} resolved.
// Phase 1: this output is only stored as a queue payload snapshot / shown in the
// test simulation — it is NOT transmitted anywhere.
const buildMessage = (template, employee, company) => {
  if (!template) return { body: '', caption: '', image: '', richText: false };
  return {
    body: placeholders.render(template.body, employee, company),
    caption: placeholders.render(template.whatsappCaption, employee, company),
    image: template.backgroundImage || template.companyLogo || '',
    richText: Boolean(template.whatsappRichText),
  };
};

// Sample render (no real employee) — used by the preview / test path.
const buildSampleMessage = (template) => {
  if (!template) return { body: '', caption: '', image: '', richText: false };
  return {
    body: placeholders.renderSample(template.body),
    caption: placeholders.renderSample(template.whatsappCaption),
    image: template.backgroundImage || template.companyLogo || '',
    richText: Boolean(template.whatsappRichText),
  };
};

module.exports = { listWhatsAppTemplates, getTemplate, buildMessage, buildSampleMessage };
