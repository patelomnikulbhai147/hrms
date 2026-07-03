// ─────────────────────────────────────────────────────────────────────────────
// whatsappTemplateManager — Phase 3 WhatsApp Business Template Management.
//
// Syncs the company's Meta-approved templates, maps HRMate (communication_templates)
// templates to them (per language) with a positional variable map, validates
// placeholders, sends a manual template test, and keeps a version/approval history.
//
// SEPARATE from communication_templates — it never overwrites HRMate templates.
// Fully company-scoped. No scheduler / queue / automation here.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const prisma = require('../../config/prisma');
const meta = require('./metaCloudClient');
const settingsService = require('./whatsappSettingsService');
const queueService = require('./whatsappQueueService');
const requestLog = require('./whatsappRequestLogService');
const { WHATSAPP_PLACEHOLDERS } = require('./whatsappPlaceholders');

// The HRMate placeholder tokens a Meta variable may map to.
const ALLOWED_TOKENS = WHATSAPP_PLACEHOLDERS.map((p) => p.token.replace(/\{\{|\}\}/g, ''));
const SAMPLE_OF = WHATSAPP_PLACEHOLDERS.reduce((m, p) => { m[p.token.replace(/\{\{|\}\}/g, '')] = p.sample; return m; }, {});

const shortHash = (obj) => crypto.createHash('sha1').update(JSON.stringify(obj || {})).digest('hex').slice(0, 12);

// Parse Meta `components` → { bodyVariableCount, headerFormat, bodyText }.
const parseComponents = (components) => {
  let comps = components;
  if (typeof comps === 'string') { try { comps = JSON.parse(comps); } catch { comps = []; } }
  comps = Array.isArray(comps) ? comps : [];
  const body = comps.find((c) => (c.type || '').toUpperCase() === 'BODY');
  const header = comps.find((c) => (c.type || '').toUpperCase() === 'HEADER');
  const bodyText = body ? (body.text || '') : '';
  const nums = (bodyText.match(/\{\{\s*(\d+)\s*\}\}/g) || []).map((m) => Number(m.replace(/[^\d]/g, '')));
  const bodyVariableCount = nums.length ? Math.max(...nums) : 0;
  const headerFormat = header ? (header.format || 'TEXT') : null;
  return { bodyVariableCount, headerFormat, bodyText };
};

const writeEvent = (companyId, data) =>
  prisma.whatsAppTemplateEvent.create({ data: { companyId, ...data } }).catch(() => null);

// ── Sync ──────────────────────────────────────────────────────────────────────
const syncTemplates = async (companyId) => {
  const s = await settingsService.getDecrypted(companyId);
  if (!s.whatsappBusinessAccountId) return { ok: false, message: 'Set the WhatsApp Business Account ID first.' };
  if (!s.permanentAccessToken) return { ok: false, message: 'Configure the Access Token first.' };

  const res = await meta.listTemplates({ wabaId: s.whatsappBusinessAccountId, accessToken: s.permanentAccessToken });
  if (res.request) await requestLog.record({ companyId, ...res.request });
  if (!res.ok) return { ok: false, status: res.status, message: res.message || 'Could not retrieve templates from Meta.' };

  const now = new Date();
  let created = 0, updated = 0, statusChanges = 0, versionChanges = 0;

  for (const t of res.templates) {
    const { bodyVariableCount, headerFormat } = parseComponents(t.components);
    const version = shortHash(t.components);
    const existing = await prisma.whatsAppMetaTemplate.findFirst({ where: { companyId, name: t.name, language: t.language || null } });

    const base = {
      companyId, metaTemplateId: t.id || null, name: t.name, category: t.category || null,
      language: t.language || null, status: t.status || null,
      components: JSON.stringify(t.components || []), version, bodyVariableCount,
      headerFormat, lastSyncedAt: now,
    };

    if (!existing) {
      await prisma.whatsAppMetaTemplate.create({ data: base });
      created++;
      await writeEvent(companyId, { templateName: t.name, language: t.language, event: 'synced', toValue: t.status, detail: 'First sync' });
      continue;
    }

    const statusChanged = (existing.status || '') !== (t.status || '');
    const versionChanged = (existing.version || '') !== version;
    await prisma.whatsAppMetaTemplate.update({
      where: { id: existing.id },
      data: {
        ...base,
        previousStatus: statusChanged ? existing.status : existing.previousStatus,
        lastStatusChangeAt: statusChanged ? now : existing.lastStatusChangeAt,
      },
    });
    updated++;
    if (statusChanged) { statusChanges++; await writeEvent(companyId, { templateName: t.name, language: t.language, event: 'status_change', fromValue: existing.status, toValue: t.status }); }
    if (versionChanged) { versionChanges++; await writeEvent(companyId, { templateName: t.name, language: t.language, event: 'version_change', fromValue: existing.version, toValue: version }); }

    // Keep any mapping's status snapshot in sync.
    if (statusChanged) {
      await prisma.whatsAppTemplateMapping.updateMany({
        where: { companyId, metaTemplateName: t.name, language: t.language || 'en' },
        data: { status: t.status, active: t.status === 'APPROVED', lastApprovalStatus: t.status, lastApprovalChangeAt: now },
      }).catch(() => null);
    }
  }

  return { ok: true, total: res.templates.length, created, updated, statusChanges, versionChanges, lastSyncedAt: now };
};

const listMetaTemplates = (companyId) =>
  prisma.whatsAppMetaTemplate.findMany({ where: { companyId }, orderBy: [{ name: 'asc' }, { language: 'asc' }] });

const listMappings = (companyId) =>
  prisma.whatsAppTemplateMapping.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' } });

const listEvents = (companyId, take = 100) =>
  prisma.whatsAppTemplateEvent.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take });

// ── Placeholder validation ──────────────────────────────────────────────────
// Ensure every Meta body variable {{1..n}} is mapped to a known HRMate token.
const validateMapping = (metaTemplate, variableMap = {}) => {
  const errors = [];
  const n = metaTemplate ? metaTemplate.bodyVariableCount : 0;
  for (let i = 1; i <= n; i++) {
    const tok = variableMap[String(i)];
    if (!tok) errors.push(`Variable {{${i}}} is not mapped to an HRMate placeholder.`);
    else if (!ALLOWED_TOKENS.includes(tok)) errors.push(`Variable {{${i}}} maps to an unknown placeholder "${tok}".`);
  }
  // Reject extra mappings beyond the template's variable count.
  for (const k of Object.keys(variableMap)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 1 || idx > n) errors.push(`Mapping has variable {{${k}}} but the Meta template only has ${n}.`);
  }
  return { ok: errors.length === 0, errors, variableCount: n };
};

// ── Save mapping ──────────────────────────────────────────────────────────────
const saveMapping = async (companyId, body = {}) => {
  const language = body.language || 'en';
  const metaTemplate = await prisma.whatsAppMetaTemplate.findFirst({ where: { companyId, name: body.metaTemplateName, language } });
  if (!metaTemplate) return { ok: false, message: `Meta template "${body.metaTemplateName}" (${language}) not found. Sync templates first.` };

  let variableMap = body.variableMap || {};
  if (typeof variableMap === 'string') { try { variableMap = JSON.parse(variableMap); } catch { variableMap = {}; } }

  const check = validateMapping(metaTemplate, variableMap);
  if (!check.ok) return { ok: false, message: 'Placeholder mapping is invalid.', errors: check.errors };

  const headerMediaType = body.headerMediaType || 'none';
  if (headerMediaType !== 'none' && metaTemplate.headerFormat && metaTemplate.headerFormat !== 'TEXT') {
    if (!body.headerMediaUrl) return { ok: false, message: `This template has a ${metaTemplate.headerFormat} header — provide a media URL.`, errors: [`Header media URL required for ${metaTemplate.headerFormat}.`] };
  }

  const now = new Date();
  const data = {
    companyId,
    hrmateTemplateId: body.hrmateTemplateId != null ? Number(body.hrmateTemplateId) : null,
    hrmateTemplateName: body.hrmateTemplateName || null,
    metaTemplateName: body.metaTemplateName,
    metaTemplateId: metaTemplate.metaTemplateId,
    language,
    status: metaTemplate.status,
    variableMap: JSON.stringify(variableMap),
    headerMediaType,
    headerMediaUrl: body.headerMediaUrl || null,
    active: metaTemplate.status === 'APPROVED',
    lastModifiedAt: now,
    lastApprovalStatus: metaTemplate.status,
  };

  const existing = body.id
    ? await prisma.whatsAppTemplateMapping.findFirst({ where: { id: Number(body.id), companyId } })
    : await prisma.whatsAppTemplateMapping.findFirst({ where: { companyId, hrmateTemplateId: data.hrmateTemplateId, language } });

  let saved;
  if (existing) {
    saved = await prisma.whatsAppTemplateMapping.update({ where: { id: existing.id }, data });
    await writeEvent(companyId, { templateName: data.metaTemplateName, language, event: 'mapping_updated', toValue: data.hrmateTemplateName });
  } else {
    saved = await prisma.whatsAppTemplateMapping.create({ data: { ...data, lastApprovalChangeAt: now } });
    await writeEvent(companyId, { templateName: data.metaTemplateName, language, event: 'mapped', toValue: data.hrmateTemplateName });
  }
  return { ok: true, mapping: saved };
};

const deleteMapping = async (companyId, id) => {
  const m = await prisma.whatsAppTemplateMapping.findFirst({ where: { id: Number(id), companyId } });
  if (!m) return { ok: false, message: 'Mapping not found.' };
  await prisma.whatsAppTemplateMapping.delete({ where: { id: m.id } });
  await writeEvent(companyId, { templateName: m.metaTemplateName, language: m.language, event: 'mapping_deleted', fromValue: m.hrmateTemplateName });
  return { ok: true };
};

// ── Send a manual template test ─────────────────────────────────────────────
const sendTemplateTest = async (companyId, mappingId) => {
  const startedAt = Date.now();
  const s = await settingsService.getDecrypted(companyId);
  if (!s.enabled) return { ok: false, status: 'Disabled', message: 'Enable WhatsApp Communication first.' };
  if (!s.developerTestNumber) return { ok: false, status: 'No Test Number', message: 'Set a Developer Test Number first.' };
  if (!s.phoneNumberId || !s.permanentAccessToken) return { ok: false, status: 'Not Configured', message: 'Configure Phone Number ID and Access Token first.' };

  const mapping = await prisma.whatsAppTemplateMapping.findFirst({ where: { id: Number(mappingId), companyId } });
  if (!mapping) return { ok: false, status: 'Not Found', message: 'Template mapping not found.' };
  const metaTemplate = await prisma.whatsAppMetaTemplate.findFirst({ where: { companyId, name: mapping.metaTemplateName, language: mapping.language } });
  if (!metaTemplate) return { ok: false, status: 'Not Found', message: 'Synced Meta template not found — sync again.' };
  if (metaTemplate.status !== 'APPROVED') return { ok: false, status: metaTemplate.status || 'Not Approved', message: `Template is "${metaTemplate.status}". Only APPROVED templates can be sent.` };

  let variableMap = {};
  try { variableMap = JSON.parse(mapping.variableMap || '{}'); } catch { variableMap = {}; }

  // Build body parameters in order 1..n using sample values for the mapped token.
  const components = [];
  if (mapping.headerMediaType && mapping.headerMediaType !== 'none' && mapping.headerMediaUrl) {
    const t = mapping.headerMediaType; // image/document/video
    components.push({ type: 'header', parameters: [{ type: t, [t]: { link: mapping.headerMediaUrl } }] });
  }
  const n = metaTemplate.bodyVariableCount;
  if (n > 0) {
    const params = [];
    for (let i = 1; i <= n; i++) {
      const tok = variableMap[String(i)];
      params.push({ type: 'text', text: SAMPLE_OF[tok] || `Sample ${i}` });
    }
    components.push({ type: 'body', parameters: params });
  }

  const to = s.developerTestNumber;
  const result = await meta.sendTemplate({ phoneNumberId: s.phoneNumberId, accessToken: s.permanentAccessToken, to, name: mapping.metaTemplateName, language: mapping.language, components });
  if (result.request) await requestLog.record({ companyId, ...result.request });
  const processingMs = Date.now() - startedAt;

  if (result.ok) {
    await queueService.writeMetaLog({ companyId, settings: s, to, status: 'Sent', metaMessageId: result.messageId, templateName: mapping.metaTemplateName, messagePreview: `[template] ${mapping.metaTemplateName} (${mapping.language})`, httpStatus: result.httpStatus, processingMs });
    await writeEvent(companyId, { templateName: mapping.metaTemplateName, language: mapping.language, event: 'test_sent', toValue: result.messageId });
    return { ok: true, status: 'Sent', message: 'Template message sent! Check your Developer Test Number.', details: { metaMessageId: result.messageId, to, provider: 'Meta Cloud API' } };
  }
  await queueService.writeMetaLog({ companyId, settings: s, to, status: 'Failed', errorMessage: result.message, errorCode: result.errorCode, httpStatus: result.httpStatus, templateName: mapping.metaTemplateName, messagePreview: `[template] ${mapping.metaTemplateName}`, processingMs });
  await writeEvent(companyId, { templateName: mapping.metaTemplateName, language: mapping.language, event: 'test_failed', detail: result.message });
  return { ok: false, status: result.status, message: result.message, details: { httpStatus: result.httpStatus, errorCode: result.errorCode, to } };
};

module.exports = {
  ALLOWED_TOKENS, SAMPLE_OF, parseComponents, validateMapping,
  syncTemplates, listMetaTemplates, listMappings, listEvents,
  saveMapping, deleteMapping, sendTemplateTest,
};
