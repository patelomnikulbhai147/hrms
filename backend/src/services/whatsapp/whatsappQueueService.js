// ─────────────────────────────────────────────────────────────────────────────
// WhatsAppQueueService — the outbound delivery queue + delivery-log writer.
//
// Phase 1 contract: rows are CREATED but the queue is NEVER drained against a
// real API. Status lifecycle is modelled in full so Phase 2 can flip rows:
//   Pending → Processing → Sent / Failed
//
// Development Mode redirection lives here (single source of truth): when a
// company has Development Mode ON, the ACTUAL recipient is the developer test
// number, while the employee's real number is preserved for the audit trail.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../../config/prisma');

const QUEUE_STATUSES = ['Pending', 'Processing', 'Sent', 'Failed'];
const LOG_STATUSES = ['Pending', 'Simulated', 'Sent', 'Failed'];

// Core Development-Mode rule: decide where a message would actually be delivered.
//   dev mode ON  → developer test number (safe testing)
//   dev mode OFF → the employee's real number
// Returns { originalNumber, resolvedNumber, redirected }.
const resolveRecipient = (settings, originalNumber) => {
  const devMode = settings ? Boolean(settings.developmentMode) : true;
  const testNumber = settings && settings.developerTestNumber ? settings.developerTestNumber : '';
  if (devMode) {
    return { originalNumber: originalNumber || '', resolvedNumber: testNumber, redirected: true };
  }
  return { originalNumber: originalNumber || '', resolvedNumber: originalNumber || '', redirected: false };
};

// Enqueue a message. Phase 1 always stores it as Pending + simulated; nothing is
// transmitted. `message` is the rendered snapshot from the template service.
const enqueue = async ({ companyId, settings, employee = {}, template = {}, originalNumber, message }) => {
  const route = resolveRecipient(settings, originalNumber || employee.mobile || employee.phone);
  return prisma.whatsAppQueue.create({
    data: {
      companyId,
      employeeId: employee.id || null,
      employeeName: employee.name || employee.fullName || null,
      templateId: template.id || null,
      templateName: template.title || null,
      originalNumber: route.originalNumber || null,
      resolvedNumber: route.resolvedNumber || null,
      payload: message ? JSON.stringify(message) : null,
      status: 'Pending',
      developmentMode: settings ? Boolean(settings.developmentMode) : true,
      simulated: true,
    },
  });
};

// Write a delivery-log entry (every attempt — simulated in Phase 1). Accepts the
// Phase 1.5 diagnostics (queueId / messagePreview / processingMs) for the richer
// delivery-log view.
const writeLog = async ({ companyId, settings, employee = {}, template = {}, originalNumber, status = 'Simulated', errorMessage = null, queueId = null, messagePreview = null, processingMs = null }) => {
  const route = resolveRecipient(settings, originalNumber || employee.mobile || employee.phone);
  return prisma.whatsAppDeliveryLog.create({
    data: {
      companyId,
      employeeId: employee.id || null,
      employeeName: employee.name || employee.fullName || null,
      originalNumber: route.originalNumber || null,
      actualSentNumber: route.resolvedNumber || null,
      templateId: template.id || null,
      templateName: template.title || null,
      status,
      errorMessage,
      developmentMode: settings ? Boolean(settings.developmentMode) : true,
      simulated: true,
      queueId,
      messagePreview,
      processingMs,
    },
  });
};

// Pre-queue validation gate (Phase 1.5). Returns { ok, errors[] }. A message is
// rejected BEFORE queuing if any check fails. Pure (no DB writes); the caller
// passes already-loaded entities so this stays fast and testable.
const validateMessage = ({ template, employee, company, settings }) => {
  const errors = [];
  if (!template || !template.id) errors.push('Template does not exist.');
  else if (!template.whatsappCompatible) errors.push('Template is not marked WhatsApp Compatible.');
  if (!employee || !employee.id) errors.push('Employee does not exist.');
  const mobile = employee && (employee.mobile || employee.phone || employee.contactNumber);
  if (!mobile) errors.push('Employee has no mobile number.');
  if (!company || !company.id) errors.push('Company does not exist.');
  else {
    const status = String(company.accountStatus || company.status || 'active').toLowerCase();
    if (status === 'suspended' || status === 'archived' || status === 'inactive') errors.push('Company is not active.');
  }
  if (!settings || !settings.enabled) errors.push('WhatsApp Communication is not enabled.');
  return { ok: errors.length === 0, errors };
};

// Phase 2 — write a REAL (non-simulated) Meta Cloud API delivery-log entry, with
// the provider + Meta message id (on success) or error code / HTTP status (on
// failure). Used by the connectivity test send; does NOT touch the queue (the
// connectivity test deliberately bypasses queue/scheduler/templates).
const writeMetaLog = async ({ companyId, settings, to, status, metaMessageId = null, errorMessage = null, errorCode = null, httpStatus = null, messagePreview = null, processingMs = null, templateName = null, employeeName = 'Connectivity Test',
  // Additive (optional) fields — let richer senders (image-template pipeline)
  // record the employee/template/lifecycle without changing existing callers.
  employeeId = null, templateId = null, originalNumber = null, actualSentNumber = null, metaStatus = null, sentAt = null, branch = null, automationRuleId = null, queueId = null } = {}) => {
  return prisma.whatsAppDeliveryLog.create({
    data: {
      companyId,
      employeeId,
      employeeName,
      originalNumber: originalNumber || to || null,
      actualSentNumber: actualSentNumber || to || null,
      templateId,
      templateName,
      queueId,
      status,
      metaStatus,
      sentAt,
      branch,
      automationRuleId,
      errorMessage,
      developmentMode: settings ? Boolean(settings.developmentMode) : true,
      simulated: false,
      provider: 'Meta Cloud API',
      metaMessageId,
      errorCode: errorCode != null ? String(errorCode) : null,
      httpStatus,
      messagePreview,
      processingMs,
    },
  });
};

// Update a queue row's status (used by the automation 'send' path to flip a
// Pending row to Sent/Failed once the real Meta send completes). Additive helper
// — does not change the enqueue/lifecycle contract. Never throws.
const markStatus = async (queueId, status, patch = {}) => {
  if (!queueId) return null;
  return prisma.whatsAppQueue.update({ where: { id: queueId }, data: { status, ...patch } }).catch(() => null);
};

const listQueue = async (companyId, take = 200) =>
  prisma.whatsAppQueue.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take });

const listLogs = async (companyId, take = 200) =>
  prisma.whatsAppDeliveryLog.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take });

module.exports = {
  QUEUE_STATUSES,
  LOG_STATUSES,
  resolveRecipient,
  validateMessage,
  enqueue,
  writeLog,
  writeMetaLog,
  markStatus,
  listQueue,
  listLogs,
};
