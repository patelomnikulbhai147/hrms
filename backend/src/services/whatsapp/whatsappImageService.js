// ─────────────────────────────────────────────────────────────────────────────
// whatsappImageService — send HRMate Template-Gallery designs over WhatsApp as
// approved IMAGE templates.
//
// Pipeline (exactly the spec workflow):
//   template + employee/company  →  fill placeholders  →  render PNG (puppeteer,
//   identical to the gallery preview)  →  upload media to Meta  →  send the mapped
//   approved IMAGE template with the PNG as header media  →  write a real delivery
//   log (so the existing webhook / analytics / retry / audit all pick it up).
//
// This module ONLY EXTENDS the platform. It reuses metaCloudClient, the renderer,
// the settings service, the placeholder engine, and the delivery-log writer. It
// never modifies the queue, scheduler, automation engine, webhooks, retry engine,
// or analytics — it simply produces the same kind of real delivery-log rows those
// systems already consume. Never throws; always returns a structured result.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../../config/prisma');
const meta = require('./metaCloudClient');
const renderer = require('./imageRenderer');
const settingsService = require('./whatsappSettingsService');
const queueService = require('./whatsappQueueService');
const templateService = require('./whatsappTemplateService');
const placeholders = require('./whatsappPlaceholders');
const requestLog = require('./whatsappRequestLogService');
const { resolveTestRecipient } = require('./whatsappService');

// Fallback Meta IMAGE template name (env-configurable). Used only when neither a
// per-template / per-category mapping nor settings.imageTemplateDefault is set.
const DEFAULT_IMAGE_TEMPLATE = process.env.WHATSAPP_IMAGE_TEMPLATE || 'jaspers_market_image_cta_v1';
const DEFAULT_IMAGE_LANG = process.env.WHATSAPP_IMAGE_TEMPLATE_LANG || 'en_US';

// ── mapping ──────────────────────────────────────────────────────────────────
// Parse a stored JSON map safely (used for the optional settings.imageTemplateMap
// category fallback).
const parseMap = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
};

const parseVarMap = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
};

// Resolve which approved Meta IMAGE template to send for a given HRMate template.
// Precedence (reuses the EXISTING WhatsAppTemplateMapping table — read-only):
//   1) a per-template mapping (hrmateTemplateId → metaTemplateName + variableMap)
//   2) settings.imageTemplateMap byCategory  (lightweight category default)
//   3) settings.imageTemplateDefault          (company default)
//   4) env default                            (jaspers_market_image_cta_v1)
// Returns { name, language, variableMap, metaTemplate, source }.
const resolveMapping = async (companyId, settings, template) => {
  // 1) explicit per-template mapping
  if (template && template.id != null) {
    const mapping = await prisma.whatsAppTemplateMapping.findFirst({
      where: { companyId, hrmateTemplateId: Number(template.id) },
      orderBy: { updatedAt: 'desc' },
    }).catch(() => null);
    if (mapping && mapping.metaTemplateName) {
      const metaTemplate = await prisma.whatsAppMetaTemplate.findFirst({
        where: { companyId, name: mapping.metaTemplateName, language: mapping.language },
      }).catch(() => null);
      return { name: mapping.metaTemplateName, language: mapping.language || DEFAULT_IMAGE_LANG, variableMap: parseVarMap(mapping.variableMap), metaTemplate, source: 'mapping' };
    }
  }
  // 2) category fallback in settings JSON
  const catMap = parseMap(settings && settings.imageTemplateMap).byCategory || {};
  const cat = (template && template.category) || '';
  // 3 / 4) defaults
  const name = catMap[cat] || (settings && settings.imageTemplateDefault) || DEFAULT_IMAGE_TEMPLATE;
  const language = (settings && settings.imageTemplateLang) || DEFAULT_IMAGE_LANG;
  const metaTemplate = await prisma.whatsAppMetaTemplate.findFirst({ where: { companyId, name, language } }).catch(() => null);
  return { name, language, variableMap: {}, metaTemplate, source: catMap[cat] ? 'category' : ((settings && settings.imageTemplateDefault) ? 'default' : 'env') };
};

// Build the ordered BODY text parameters for a template that has body variables,
// pulling REAL values from the placeholder context via the mapping's variableMap.
const buildBodyParams = (metaTemplate, variableMap, ctx) => {
  const n = metaTemplate ? (metaTemplate.bodyVariableCount || 0) : 0;
  if (!n) return [];
  const params = [];
  for (let i = 1; i <= n; i++) {
    const tok = variableMap[String(i)];
    params.push((tok && ctx[tok]) ? ctx[tok] : '');
  }
  return params;
};

// ── context loading ──────────────────────────────────────────────────────────
const loadCompany = (companyId) =>
  prisma.company.findUnique({ where: { id: companyId } }).catch(() => null);

const loadTemplate = (companyId, templateId) =>
  prisma.communicationTemplate.findFirst({ where: { id: Number(templateId), companyId } }).catch(() => null);

const loadEmployee = async (companyId, employeeId) => {
  if (!employeeId) return null;
  const emp = await prisma.employee.findFirst({ where: { id: Number(employeeId), companyId } }).catch(() => null);
  if (!emp) return null;
  // Best-effort branch name for {{branch_name}} (schema-tolerant).
  if (!emp.branchName && emp.branchId) {
    const br = await prisma.branch.findUnique({ where: { id: emp.branchId } }).catch(() => null);
    if (br) emp.branchName = br.name || br.branchName || '';
  }
  return emp;
};

// Resolve the recipient number. Development Mode → developer test number (the
// single source of truth used everywhere). Live → the employee's mobile. Both are
// normalised to full E.164 digits Meta expects. Returns { originalNumber,
// actualSentNumber, redirected }.
const resolveNumber = (settings, employee, toOverride) => {
  const devMode = !!(settings && settings.developmentMode);
  const empNumber = (employee && (employee.mobile || employee.phone || employee.contactNumber)) || '';
  const original = toOverride || empNumber;
  if (devMode) {
    return {
      originalNumber: original,
      actualSentNumber: resolveTestRecipient(settings.developerTestNumber).normalized,
      redirected: true,
    };
  }
  return {
    originalNumber: original,
    actualSentNumber: resolveTestRecipient(original).normalized,
    redirected: false,
  };
};

// ── preview (render only, no send) ───────────────────────────────────────────
// Returns a base64 data URL of the PNG that WOULD be sent — identical to what the
// recipient receives, so the in-app preview never differs from the delivered card.
const previewCard = async ({ companyId, templateId, employeeId } = {}) => {
  try {
    const [company, template, employee] = await Promise.all([
      loadCompany(companyId), loadTemplate(companyId, templateId), loadEmployee(companyId, employeeId),
    ]);
    if (!template) return { ok: false, status: 'Not Found', message: 'Template not found.' };
    if (!renderer.isAvailable()) return { ok: false, status: 'Renderer Unavailable', message: 'Image renderer (puppeteer) is not installed.' };
    const emp = employee || { name: 'OM PATEL', designation: 'Software Developer', department: 'Engineering', employeeId: 'EMP-1024', joinDate: '2022-06-01' };
    const { png, hash, cached } = await renderer.renderCardPng({ template, employee: emp, company: company || {} });
    return { ok: true, dataUrl: `data:image/png;base64,${png.toString('base64')}`, hash, cached, bytes: png.length };
  } catch (e) {
    return { ok: false, status: 'Render Error', message: e.message };
  }
};

// ── the send pipeline ────────────────────────────────────────────────────────
// Core: render → upload → send approved image template → log. `opts.useImageFallback`
// sends a free-form image (type:image, 24h-window only) instead of a template —
// used only when explicitly requested for in-window testing.
const sendImageForEmployee = async ({ companyId, templateId, employeeId, toOverride, automationRuleId = null, queueId = null, useImageFallback = false } = {}) => {
  const startedAt = Date.now();
  try {
    const s = await settingsService.getDecrypted(companyId);
    if (!s.enabled) return { ok: false, status: 'Disabled', message: 'Enable WhatsApp Communication first.' };
    if (!s.phoneNumberId || !s.permanentAccessToken) return { ok: false, status: 'Not Configured', message: 'Configure Phone Number ID and Access Token first.' };
    if (!renderer.isAvailable()) return { ok: false, status: 'Renderer Unavailable', message: 'Image renderer (puppeteer) is not installed.' };

    const [company, template] = await Promise.all([loadCompany(companyId), loadTemplate(companyId, templateId)]);
    if (!template) return { ok: false, status: 'Not Found', message: 'Template not found for this company.' };
    const employee = await loadEmployee(companyId, employeeId);

    const route = resolveNumber(s, employee, toOverride);
    const to = route.actualSentNumber;
    if (!to) return { ok: false, status: 'No Recipient', message: s.developmentMode ? 'Set a Developer Test Number first.' : 'Employee has no mobile number.' };

    const empCtx = employee || { name: 'OM PATEL', designation: 'Software Developer', department: 'Engineering', employeeId: 'EMP-1024' };
    const built = templateService.buildMessage(template, empCtx, company || {});
    const ctx = placeholders.buildContext(empCtx, company || {});
    const caption = built.caption || placeholders.render(template.whatsappCaption || '', empCtx, company || {});

    // Resolve the approved Meta IMAGE template + its variable map (reuses the
    // existing WhatsAppTemplateMapping table; falls back to the company/env default).
    const meta_tpl = await resolveMapping(companyId, s, template);

    // 1) RENDER the personalized PNG (identical to the gallery preview).
    const { png, hash } = await renderer.renderCardPng({ template, employee: empCtx, company: company || {} });

    // 2) UPLOAD to Meta → Media ID.
    const up = await meta.uploadMedia({ phoneNumberId: s.phoneNumberId, accessToken: s.permanentAccessToken, buffer: png, mimeType: 'image/png', filename: `${(template.category || 'card').toString().replace(/\W+/g, '_')}.png` });
    if (up.request) await requestLog.record({ companyId, ...up.request });
    if (!up.ok) {
      await logSend({ companyId, settings: s, employee: empCtx, template, route, status: 'Failed', errorMessage: up.message, errorCode: up.errorCode, httpStatus: up.httpStatus, preview: `Image upload failed: ${up.message}`, automationRuleId, queueId, processingMs: Date.now() - startedAt });
      return { ok: false, status: up.status, message: up.message, stage: 'upload', details: { httpStatus: up.httpStatus, errorCode: up.errorCode } };
    }

    // 3) SEND — approved IMAGE template with the uploaded media as header.
    let result, preview, sentVia;
    if (useImageFallback) {
      result = await meta.sendImage({ phoneNumberId: s.phoneNumberId, accessToken: s.permanentAccessToken, to, mediaId: up.mediaId, caption });
      preview = `Image (free-form) — ${template.title || template.category}`;
      sentVia = 'image';
    } else {
      // Guard: the mapped Meta template must have an IMAGE header to carry our PNG.
      if (meta_tpl.metaTemplate && meta_tpl.metaTemplate.headerFormat && meta_tpl.metaTemplate.headerFormat !== 'IMAGE') {
        await logSend({ companyId, settings: s, employee: empCtx, template, route, status: 'Failed', errorMessage: `Mapped Meta template "${meta_tpl.name}" has a ${meta_tpl.metaTemplate.headerFormat} header, not IMAGE.`, preview: `Mapping error: ${meta_tpl.name}`, automationRuleId, queueId, processingMs: Date.now() - startedAt });
        return { ok: false, status: 'Mapping Error', message: `Mapped Meta template "${meta_tpl.name}" does not have an IMAGE header. Map this HRMate template to an approved image template.`, stage: 'mapping' };
      }
      const bodyParams = buildBodyParams(meta_tpl.metaTemplate, meta_tpl.variableMap, ctx);
      const components = meta.imageHeaderComponents({ mediaId: up.mediaId, bodyParams });
      result = await meta.sendTemplate({ phoneNumberId: s.phoneNumberId, accessToken: s.permanentAccessToken, to, name: meta_tpl.name, language: meta_tpl.language, components });
      preview = `Image template "${meta_tpl.name}" — ${template.title || template.category}`;
      sentVia = 'template';
    }
    if (result.request) await requestLog.record({ companyId, ...result.request });
    const processingMs = Date.now() - startedAt;

    // 4) LOG — a real delivery-log row (consumed by webhook/analytics/retry/audit).
    if (result.ok) {
      const log = await logSend({ companyId, settings: s, employee: empCtx, template, route, status: 'Sent', metaStatus: 'Sent', metaMessageId: result.messageId, httpStatus: result.httpStatus, preview, automationRuleId, queueId, processingMs, sentAt: new Date() });
      return {
        ok: true, status: 'Sent',
        message: `Sent "${template.title || template.category}" as image ${sentVia === 'template' ? `template "${meta_tpl.name}"` : 'message'}.`,
        details: { metaMessageId: result.messageId, to, originalNumber: route.originalNumber, redirected: route.redirected, metaTemplate: sentVia === 'template' ? meta_tpl.name : null, mediaId: up.mediaId, imageHash: hash, logId: log && log.id },
      };
    }
    await logSend({ companyId, settings: s, employee: empCtx, template, route, status: 'Failed', errorMessage: result.message, errorCode: result.errorCode, httpStatus: result.httpStatus, preview, automationRuleId, queueId, processingMs });
    return { ok: false, status: result.status, message: result.message, stage: 'send', tokenExpired: !!result.tokenExpired, details: { httpStatus: result.httpStatus, errorCode: result.errorCode, to, metaTemplate: meta_tpl.name } };
  } catch (e) {
    return { ok: false, status: 'Send Error', message: e.message };
  }
};

// Write the delivery-log row via the shared writer (so schema stays single-source).
const logSend = ({ companyId, settings, employee, template, route, status, metaStatus = null, metaMessageId = null, errorMessage = null, errorCode = null, httpStatus = null, preview = null, automationRuleId = null, queueId = null, processingMs = null, sentAt = null }) =>
  queueService.writeMetaLog({
    companyId, settings, status, metaStatus,
    employeeId: employee && employee.id ? employee.id : null,
    employeeName: (employee && (employee.name || employee.fullName)) || 'Employee',
    originalNumber: route.originalNumber, actualSentNumber: route.actualSentNumber,
    templateId: template && template.id ? template.id : null,
    templateName: template && (template.title || template.category) ? (template.title || template.category) : null,
    metaMessageId, errorMessage, errorCode, httpStatus, messagePreview: preview,
    processingMs, sentAt, automationRuleId, queueId,
    branch: (employee && employee.branchName) || null,
  }).catch(() => null);

// Convenience: send a card to the company's Developer Test Number to validate the
// whole pipeline live (no employee required — uses sample data when none given).
const sendTestImage = async (companyId, { templateId, employeeId } = {}) => {
  const s = await settingsService.getDecrypted(companyId);
  // Force the developer-test recipient regardless of dev-mode for a safe test.
  const to = resolveTestRecipient(s.developerTestNumber).normalized;
  if (!to) return { ok: false, status: 'No Test Number', message: 'Set a Developer Test Number first.' };
  return sendImageForEmployee({ companyId, templateId, employeeId, toOverride: to });
};

module.exports = { resolveMapping, buildBodyParams, parseMap, previewCard, sendImageForEmployee, sendTestImage, DEFAULT_IMAGE_TEMPLATE, DEFAULT_IMAGE_LANG };
