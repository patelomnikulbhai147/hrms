// ─────────────────────────────────────────────────────────────────────────────
// automationEngine — Phase 4 Communication Automation Engine.
//
// ONE generic workflow drives every communication scenario (birthday, anniversary,
// festival, announcement, salary, payslip, leave, attendance, custom):
//   resolve recipients → eligibility checks → render template → GENERATE QUEUE
//   ENTRIES (never sends directly; the queue processor delivers later).
//
// Three modes share the exact same logic:
//   run       → eligible recipients are enqueued (unless the rule is dryRun/paused)
//   preview   → full simulation incl. rendered messages, NOTHING queued
//   dry_run   → full logic + mapping validation, NOTHING queued
//
// Per-recipient failures are isolated (logged, processing continues). Reuses the
// existing WhatsApp queue + placeholder engine + template manager; nothing in the
// WhatsApp modules is modified.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../../config/prisma');
const settingsService = require('../whatsapp/whatsappSettingsService');
const queueService = require('../whatsapp/whatsappQueueService');
const placeholders = require('../whatsapp/whatsappPlaceholders');
const templateManager = require('../whatsapp/whatsappTemplateManager');
const imageService = require('../whatsapp/whatsappImageService');

// Start of "today" in server local time — used for same-day idempotency.
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// Has this rule already delivered (Sent/Delivered/Read) to this employee today?
// Prevents duplicate greetings if the scheduler double-fires or a manual send and
// an automatic send overlap on the same day.
const alreadySentToday = async (companyId, ruleId, employeeId) => {
  if (!ruleId || !employeeId) return false;
  const row = await prisma.whatsAppDeliveryLog.findFirst({
    where: {
      companyId, automationRuleId: ruleId, employeeId,
      status: { in: ['Sent', 'Delivered', 'Read'] },
      createdAt: { gte: startOfToday() },
    },
    select: { id: true },
  }).catch(() => null);
  return !!row;
};

// Static config for the UI (event types, triggers, recipient scopes + defaults).
const EVENT_TYPES = [
  { key: 'birthday', label: 'Birthday Wishes', scope: 'today_birthday' },
  { key: 'anniversary', label: 'Work Anniversary', scope: 'today_anniversary' },
  { key: 'festival', label: 'Festival Greetings', scope: 'all_active' },
  { key: 'announcement', label: 'Company Announcement', scope: 'all_active' },
  { key: 'salary_credited', label: 'Salary Credited', scope: 'all_active' },
  { key: 'payslip', label: 'Payslip Notification', scope: 'all_active' },
  { key: 'leave_approved', label: 'Leave Approved', scope: 'specific_employee' },
  { key: 'attendance_reminder', label: 'Attendance Reminder', scope: 'not_checked_in' },
  { key: 'custom', label: 'Custom Rule', scope: 'all_active' },
];
const TRIGGER_TYPES = ['daily', 'weekly', 'monthly', 'yearly', 'specific_date', 'employee_birthday', 'employee_anniversary', 'company_holiday', 'manual', 'api'];
const RECIPIENT_SCOPES = [
  { key: 'today_birthday', label: 'Employees whose birthday is today' },
  { key: 'today_anniversary', label: 'Employees whose joining anniversary is today' },
  { key: 'all_active', label: 'All active employees' },
  { key: 'specific_employee', label: 'A specific employee' },
  { key: 'not_checked_in', label: 'Active employees who have not checked in today' },
];
const SCOPE_BY_EVENT = EVENT_TYPES.reduce((m, e) => { m[e.key] = e.scope; return m; }, {});

const meta = () => ({ eventTypes: EVENT_TYPES, triggerTypes: TRIGGER_TYPES, recipientScopes: RECIPIENT_SCOPES });

const sameMonthDay = (value) => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return `${d.getMonth()}-${d.getDate()}`;
};

// ── Reusable recipient resolution ────────────────────────────────────────────
const resolveRecipients = async (companyId, rule) => {
  const scope = rule.recipientScope || SCOPE_BY_EVENT[rule.eventType] || 'all_active';
  const emps = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, name: true, status: true, phone: true, dob: true, joinDate: true, designation: true, department: true },
  });
  const isActive = (e) => String(e.status || 'Active').toLowerCase() === 'active';
  const todayKey = `${new Date().getMonth()}-${new Date().getDate()}`;

  switch (scope) {
    case 'today_birthday':
      return emps.filter((e) => isActive(e) && sameMonthDay(e.dob) === todayKey);
    case 'today_anniversary':
      return emps.filter((e) => isActive(e) && sameMonthDay(e.joinDate) === todayKey);
    case 'specific_employee':
      return emps.filter((e) => String(e.id) === String(rule.specificEmployeeId));
    case 'not_checked_in': {
      const today = new Date().toISOString().slice(0, 10);
      let checkedIds = new Set();
      try {
        const rows = await prisma.attendance.findMany({ where: { companyId, date: today }, select: { employeeId: true } });
        checkedIds = new Set(rows.map((r) => r.employeeId));
      } catch { /* attendance optional — treat as none checked in */ }
      return emps.filter((e) => isActive(e) && !checkedIds.has(e.id));
    }
    case 'all_active':
    default:
      return emps.filter(isActive);
  }
};

// ── Eligibility checks (before any queue creation) ───────────────────────────
const checkEligibility = (employee, { settings, company }) => {
  if (String(employee.status || 'Active').toLowerCase() !== 'active') return { ok: false, reason: 'Employee is not active' };
  const mobile = employee.phone || employee.mobile || employee.contactNumber;
  if (!mobile) return { ok: false, reason: 'No mobile number' };
  if (!settings || !settings.enabled) return { ok: false, reason: 'WhatsApp communication is not enabled' };
  if (employee.optOut) return { ok: false, reason: 'Employee opted out' }; // future support
  const cstatus = String((company && (company.accountStatus || company.status)) || 'active').toLowerCase();
  if (['suspended', 'archived', 'inactive', 'cancelled', 'expired'].includes(cstatus)) return { ok: false, reason: 'Company subscription is not active' };
  return { ok: true, mobile };
};

// ── Render the message a recipient would receive ─────────────────────────────
const renderMessage = ({ rule, employee, company, mapping, metaTemplate, hrTemplate }) => {
  // Prefer a mapped Meta template (positional vars → HRMate tokens → values).
  if (mapping && metaTemplate) {
    const ctx = placeholders.buildContext(employee, company);
    let vm = {}; try { vm = JSON.parse(mapping.variableMap || '{}'); } catch { /* ignore */ }
    const body = templateManager.parseComponents(metaTemplate.components).bodyText || '';
    const rendered = body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
      const tok = vm[String(n)];
      return tok && ctx[tok] != null ? ctx[tok] : `{{${n}}}`;
    });
    return { body: rendered, via: `Meta template ${mapping.metaTemplateName} (${mapping.language})` };
  }
  // Fallback: render an HRMate template body with the placeholder engine.
  if (hrTemplate) {
    const stripped = String(hrTemplate.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { body: placeholders.render(stripped, employee, company), via: `HRMate template ${hrTemplate.title}` };
  }
  return { body: '(no template selected)', via: 'none' };
};

// Validate the rule's template mapping (for dry-run feedback).
const validateRuleTemplate = (mapping, metaTemplate) => {
  if (!mapping) return { ok: true, warnings: ['No Meta template mapping — using HRMate template body for preview.'] };
  if (!metaTemplate) return { ok: false, warnings: ['Mapped Meta template not found — sync templates.'] };
  let vm = {}; try { vm = JSON.parse(mapping.variableMap || '{}'); } catch { /* ignore */ }
  const v = templateManager.validateMapping(metaTemplate, vm);
  return { ok: v.ok, warnings: v.errors, approved: metaTemplate.status === 'APPROVED' };
};

// ── Execute (the single shared workflow) ─────────────────────────────────────
const execute = async (companyId, rule, mode = 'run') => {
  const startedAt = Date.now();
  const settings = await settingsService.getOrCreate(companyId);
  const company = await prisma.company.findUnique({ where: { id: companyId } }).catch(() => null);

  // Resolve template references once.
  let mapping = null, metaTemplate = null, hrTemplate = null;
  if (rule.templateMappingId) {
    mapping = await prisma.whatsAppTemplateMapping.findFirst({ where: { id: rule.templateMappingId, companyId } });
    if (mapping) metaTemplate = await prisma.whatsAppMetaTemplate.findFirst({ where: { companyId, name: mapping.metaTemplateName, language: mapping.language } });
  }
  if (!mapping && rule.hrmateTemplateId) {
    hrTemplate = await prisma.communicationTemplate.findFirst({ where: { id: rule.hrmateTemplateId, companyId } });
  }
  const templateCheck = validateRuleTemplate(mapping, metaTemplate);

  const recipients = await resolveRecipients(companyId, rule);
  // 'run'  → enqueue a (simulated) queue row, as before.
  // 'send' → PRODUCTION: render the HRMate card, upload, send the approved image
  //          template, write a real delivery log. (preview/dry_run never write.)
  const active = rule.status === 'active' && !rule.dryRun;
  const willQueue = mode === 'run' && active;
  const willSend = mode === 'send' && active;
  // The HRMate gallery template to render for image sends.
  const imageTemplateId = rule.hrmateTemplateId || (mapping && mapping.hrmateTemplateId) || null;

  const results = [];
  let eligible = 0, queued = 0, skipped = 0, errors = 0, sent = 0, failed = 0;

  for (const emp of recipients) {
    try {
      const elig = checkEligibility(emp, { settings, company });
      if (!elig.ok) { skipped++; results.push({ employee: emp.name, employeeId: emp.id, eligible: false, reason: elig.reason }); continue; }
      eligible++;
      const rendered = renderMessage({ rule, employee: emp, company, mapping, metaTemplate, hrTemplate });
      const route = queueService.resolveRecipient(settings, elig.mobile);

      let queuedFlag = false, sentFlag = false, sendStatus = null, wamid = null, sendError = null;

      if (willSend) {
        // Idempotency — never greet the same employee twice in one day for a rule.
        if (await alreadySentToday(companyId, rule.id, emp.id)) {
          skipped++;
          results.push({ employee: emp.name, employeeId: emp.id, eligible: true, queued: false, sent: false, skipped: true, reason: 'Already sent today' });
          continue;
        }
        if (!imageTemplateId) {
          failed++; errors++;
          results.push({ employee: emp.name, employeeId: emp.id, eligible: true, sent: false, reason: 'No HRMate template selected on the rule' });
          continue;
        }
        // One queue item per employee (existing queue architecture, reused).
        const qrow = await queueService.enqueue({
          companyId, settings, employee: emp,
          template: hrTemplate || { id: imageTemplateId, title: mapping ? mapping.metaTemplateName : rule.name },
          originalNumber: elig.mobile,
          message: { body: rendered.body, via: 'image-template', rule: rule.name, eventType: rule.eventType },
        });
        await queueService.markStatus(qrow.id, 'Processing');
        // Render → upload → send approved IMAGE template → real delivery log.
        const res = await imageService.sendImageForEmployee({
          companyId, templateId: imageTemplateId, employeeId: emp.id,
          automationRuleId: rule.id || null, queueId: qrow.id,
        });
        sendStatus = res.status; wamid = res.details && res.details.metaMessageId;
        if (res.ok) { sent++; sentFlag = true; await queueService.markStatus(qrow.id, 'Sent', { simulated: false }); }
        else { failed++; errors++; sendError = res.message; await queueService.markStatus(qrow.id, 'Failed', { simulated: false }); }
        results.push({ employee: emp.name, employeeId: emp.id, eligible: true, queued: true, sent: sentFlag, queueId: qrow.id, metaMessageId: wamid, status: sendStatus, error: sendError, originalNumber: route.originalNumber, redirectedTo: route.resolvedNumber, via: 'image-template' });
        continue;
      }

      if (willQueue) {
        await queueService.enqueue({
          companyId, settings, employee: emp,
          template: hrTemplate || { id: rule.hrmateTemplateId, title: mapping ? mapping.metaTemplateName : rule.name },
          originalNumber: elig.mobile,
          message: { body: rendered.body, via: rendered.via, rule: rule.name, eventType: rule.eventType },
        });
        queued++; queuedFlag = true;
      }
      results.push({ employee: emp.name, employeeId: emp.id, eligible: true, queued: queuedFlag, originalNumber: route.originalNumber, redirectedTo: route.resolvedNumber, preview: rendered.body, via: rendered.via });
    } catch (e) {
      errors++; results.push({ employee: emp.name, employeeId: emp.id, eligible: false, reason: `Error: ${e.message}` });
    }
  }

  const durationMs = Date.now() - startedAt;
  // In 'send' mode, queuedMessages == attempts (one queue item per send).
  const summary = { recipientsEvaluated: recipients.length, eligibleRecipients: eligible, queuedMessages: willSend ? (sent + failed) : queued, skippedMessages: skipped, errorsCount: errors, sentMessages: willSend ? sent : null, failedMessages: willSend ? failed : null, durationMs };

  // Record run history (preview/dry_run are recorded too, marked by mode).
  const run = await prisma.automationRun.create({
    data: {
      companyId, ruleId: rule.id || null, ruleName: rule.name, mode, triggerType: rule.triggerType,
      ...summary,
      detail: JSON.stringify({ templateCheck, employeesChecked: recipients.length, eventsFound: eligible + skipped, recipients: results.slice(0, 100) }),
    },
  }).catch(() => null);

  if ((mode === 'run' || mode === 'send') && rule.id) await prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } }).catch(() => null);

  return { mode, summary, templateCheck, recipients: results, runId: run ? run.id : null, willQueue, willSend };
};

const listRuns = (companyId, take = 100) =>
  prisma.automationRun.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take });

module.exports = {
  EVENT_TYPES, TRIGGER_TYPES, RECIPIENT_SCOPES, SCOPE_BY_EVENT, meta,
  resolveRecipients, checkEligibility, renderMessage, validateRuleTemplate,
  execute, listRuns,
};
