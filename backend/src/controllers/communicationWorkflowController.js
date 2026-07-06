// ═════════════════════════════════════════════════════════════════════════════
// ENTERPRISE COMMUNICATION WORKFLOW controller (additive — connects existing pieces).
//   • Company Template Library: copy-from-master + enable/disable/archive.
//   • Event → Template Mapping: pick ONE template per event, saved once.
//   • Saving an ENABLED mapping SYNCS the mapped template onto a canonical
//     automation rule → the EXISTING scheduler/engine send it automatically.
//     No engine/queue/scheduler/webhook code is modified. No generic fallback:
//     an enabled event with no template is a RED validation error and never sends
//     (the engine already fails safe without a template).
// ═════════════════════════════════════════════════════════════════════════════
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { FESTIVALS } = require('../data/communicationSamples');

// ── local helpers (mirror communicationController — company isolation preserved) ──
async function resolveCompanyId(req) {
  const toParent = async (rawId) => {
    if (!rawId) return undefined;
    const asCompany = await prisma.company.findUnique({ where: { id: rawId } }).catch(() => null);
    if (asCompany) return asCompany.parentCompanyId || asCompany.id;
    const asBranch = await prisma.branch.findUnique({ where: { id: rawId } }).catch(() => null);
    return asBranch ? asBranch.companyId : rawId;
  };
  if (req.user?.role === 'Super Admin') return await toParent(idParam(req.query.companyId || req.headers['x-workspace-id']));
  return await toParent(req.user?.companyId);
}
const actorName = (req) => (req.user && (req.user.name || req.user.email || req.user.username)) || 'System';
function sendError(res, e, label) {
  console.error(label, e && e.message ? e.message : e);
  const code = e && e.code;
  if (code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
  if (code === 'P2002') return res.status(409).json({ error: 'A record with this value already exists.' });
  if (e && (e.name === 'PrismaClientValidationError' || /Invalid `prisma\./.test(e.message || ''))) return res.status(400).json({ error: 'Invalid data: one or more fields have the wrong format.' });
  return res.status(500).json({ error: (e && e.message) || 'Server error' });
}
// Best-effort audit into the existing AuditLog (module='Communication', companyId in details).
async function writeCommAudit(companyId, req, { action, detail, targetId }) {
  try {
    if (!req.user?.id) return;
    await prisma.auditLog.create({ data: { userId: req.user.id, action, module: 'Communication', targetId: String(targetId || ''), details: JSON.stringify({ companyId, by: actorName(req), detail }).slice(0, 1000) } });
  } catch { /* never break the op */ }
}

// ── The 15 enterprise events ──────────────────────────────────────────────────
const EVENT_CATALOG = [
  { key: 'birthday',       label: 'Birthday',            category: 'Birthday',            engineEvent: 'birthday',            mode: 'scheduled' },
  { key: 'anniversary',    label: 'Work Anniversary',    category: 'Work Anniversary',    engineEvent: 'anniversary',         mode: 'scheduled' },
  { key: 'joining',        label: 'Joining Anniversary', category: 'Joining Anniversary', engineEvent: 'custom',              mode: 'event' },
  { key: 'promotion',      label: 'Promotion',           category: 'Promotion',           engineEvent: 'custom',              mode: 'event' },
  { key: 'confirmation',   label: 'Confirmation',        category: 'Confirmation',        engineEvent: 'custom',              mode: 'event' },
  { key: 'leave_approved', label: 'Leave Approved',      category: 'Leave',               engineEvent: 'leave_approved',      mode: 'event' },
  { key: 'attendance',     label: 'Attendance Reminder', category: 'Attendance',          engineEvent: 'attendance_reminder', mode: 'scheduled' },
  { key: 'payroll',        label: 'Payroll / Salary',    category: 'Payroll',             engineEvent: 'salary_credited',     mode: 'event' },
  { key: 'payslip',        label: 'Payslip Generated',   category: 'Payslip',             engineEvent: 'payslip',             mode: 'event' },
  { key: 'loan',           label: 'Loan Approved',       category: 'Loan',                engineEvent: 'custom',              mode: 'event' },
  { key: 'compliance',     label: 'Compliance',          category: 'Compliance',          engineEvent: 'custom',              mode: 'event' },
  { key: 'festival',       label: 'Festival',            category: 'Festival',            engineEvent: 'festival',            mode: 'date', festival: true },
  { key: 'holiday',        label: 'Holiday',             category: 'Holiday',             engineEvent: 'festival',            mode: 'date' },
  { key: 'announcement',   label: 'Announcement',        category: 'Announcement',        engineEvent: 'announcement',        mode: 'manual' },
  { key: 'custom',         label: 'Custom',              category: 'Custom',              engineEvent: 'custom',              mode: 'manual' },
];
const EVENT_BY_KEY = EVENT_CATALOG.reduce((m, e) => { m[e.key] = e; return m; }, {});
// Recurring events the EXISTING scheduler can fire automatically (canonical rule sync).
const SCHEDULE_BY_EVENT = {
  birthday:    { triggerType: 'daily', recipientScope: 'today_birthday',    scheduleTime: '09:00' },
  anniversary: { triggerType: 'daily', recipientScope: 'today_anniversary', scheduleTime: '09:00' },
  attendance:  { triggerType: 'daily', recipientScope: 'not_checked_in',    scheduleTime: '11:00' },
};

// POST /templates/copy-from-master/:masterId — Company Library copy from Master.
exports.copyTemplateFromMaster = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const masterId = idParam(req.params.masterId);
    const m = await prisma.communicationMasterTemplate.findUnique({ where: { id: masterId } });
    if (!m) return res.status(404).json({ error: 'Master template not found.' });
    const created = await prisma.communicationTemplate.create({
      data: {
        companyId, title: m.title, category: m.category, subject: m.subject || '', body: m.body || '',
        placeholders: m.placeholders || null, layout: m.layout || null, backgroundImage: m.backgroundImage || null,
        whatsappCompatible: m.whatsappCompatible, whatsappCaption: m.whatsappCaption || null,
        festivalName: m.festivalKey || null, status: 'Active', libraryState: 'enabled', masterTemplateId: m.id, createdBy: actorName(req),
      },
    });
    await writeCommAudit(companyId, req, { action: 'Copy From Master', detail: `${m.title} (master #${m.id})`, targetId: created.id });
    res.status(201).json(created);
  } catch (e) { sendError(res, e, 'workflow.copyTemplateFromMaster'); }
};

// PUT /templates/:id/library-state — enable / disable / archive.
exports.setTemplateLibraryState = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const id = idParam(req.params.id);
    const state = String(req.body.libraryState || '').toLowerCase();
    if (!['enabled', 'disabled', 'archived'].includes(state)) return res.status(400).json({ error: 'libraryState must be enabled, disabled or archived.' });
    const existing = await prisma.communicationTemplate.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) return res.status(404).json({ error: 'Template not found.' });
    const updated = await prisma.communicationTemplate.update({ where: { id }, data: { libraryState: state, status: state === 'archived' ? 'Archived' : existing.status } });
    res.json(updated);
  } catch (e) { sendError(res, e, 'workflow.setTemplateLibraryState'); }
};

// GET /event-mappings — mapping matrix + catalog + festival sub-events.
exports.listEventMappings = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json({ events: EVENT_CATALOG, mappings: [], festivals: [] });
    const mappings = await prisma.communicationEventMapping.findMany({ where: { companyId } });
    const festivals = FESTIVALS.map((f) => ({ key: f.slug, label: f.name, emoji: f.emoji }));
    res.json({ events: EVENT_CATALOG, mappings, festivals });
  } catch (e) { sendError(res, e, 'workflow.listEventMappings'); }
};

// Keep the canonical automation rule synced with an enabled scheduled mapping.
async function syncMappingToRule(companyId, ev, mapping, req) {
  const sched = SCHEDULE_BY_EVENT[ev.key];
  if (!sched) return null;
  const wantActive = !!(mapping.enabled && mapping.hrmateTemplateId);
  let rule = null;
  if (mapping.ruleId) rule = await prisma.automationRule.findFirst({ where: { id: mapping.ruleId, companyId } });
  const data = {
    companyId, name: `${ev.label} (auto)`, eventType: ev.engineEvent, triggerType: sched.triggerType,
    recipientScope: sched.recipientScope, channel: 'whatsapp', hrmateTemplateId: mapping.hrmateTemplateId || null,
    scheduleTime: sched.scheduleTime, status: wantActive ? 'active' : 'paused', dryRun: false,
  };
  if (rule) {
    await prisma.automationRule.update({ where: { id: rule.id }, data: { hrmateTemplateId: data.hrmateTemplateId, status: data.status, recipientScope: data.recipientScope, triggerType: data.triggerType, scheduleTime: data.scheduleTime, channel: 'whatsapp', eventType: data.eventType } });
    return rule.id;
  }
  const created = await prisma.automationRule.create({ data: { ...data, createdBy: actorName(req) } });
  return created.id;
}

// PUT /event-mappings/:eventKey — save the one-template-per-event choice.
exports.saveEventMapping = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const eventKey = String(req.params.eventKey);
    const ev = EVENT_BY_KEY[eventKey];
    if (!ev) return res.status(400).json({ error: `Unknown event "${eventKey}".` });
    const festivalKey = ev.festival ? String(req.body.festivalKey || '') : '';
    const hrmateTemplateId = (req.body.hrmateTemplateId === '' || req.body.hrmateTemplateId == null) ? null : Number(req.body.hrmateTemplateId);
    if (hrmateTemplateId) {
      const t = await prisma.communicationTemplate.findUnique({ where: { id: hrmateTemplateId } });
      if (!t || t.companyId !== companyId) return res.status(400).json({ error: 'Selected template does not belong to this company.' });
    }
    const base = {
      whatsappEnabled: req.body.whatsappEnabled !== undefined ? !!req.body.whatsappEnabled : true,
      emailEnabled: req.body.emailEnabled !== undefined ? !!req.body.emailEnabled : false,
      enabled: !!req.body.enabled, hrmateTemplateId,
    };
    const existing = await prisma.communicationEventMapping.findFirst({ where: { companyId, eventKey, festivalKey } });
    let mapping = existing
      ? await prisma.communicationEventMapping.update({ where: { id: existing.id }, data: base })
      : await prisma.communicationEventMapping.create({ data: { companyId, eventKey, festivalKey, ...base, createdBy: actorName(req) } });
    const ruleId = await syncMappingToRule(companyId, ev, mapping, req);
    if (ruleId && ruleId !== mapping.ruleId) mapping = await prisma.communicationEventMapping.update({ where: { id: mapping.id }, data: { ruleId } });
    await writeCommAudit(companyId, req, { action: 'Save Event Mapping', detail: `${ev.label}${festivalKey ? ` / ${festivalKey}` : ''} -> template ${hrmateTemplateId || 'none'} (${mapping.enabled ? 'enabled' : 'disabled'})`, targetId: mapping.id });
    res.json(mapping);
  } catch (e) { sendError(res, e, 'workflow.saveEventMapping'); }
};

// GET /event-mappings/validation — RED warnings for enabled events with no template.
exports.getEventMappingValidation = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json({ ok: true, issues: [], events: [] });
    const mappings = await prisma.communicationEventMapping.findMany({ where: { companyId } });
    const byKey = {};
    for (const m of mappings) byKey[`${m.eventKey}::${m.festivalKey}`] = m;
    const issues = [], events = [];
    for (const ev of EVENT_CATALOG) {
      const m = byKey[`${ev.key}::`];
      const configured = !!(m && m.hrmateTemplateId);
      const enabled = !!(m && m.enabled);
      events.push({ key: ev.key, label: ev.label, mode: ev.mode, enabled, configured, hrmateTemplateId: m ? m.hrmateTemplateId : null });
      if (enabled && !configured) issues.push({ eventKey: ev.key, level: 'error', title: `${ev.label} Template Missing`, message: `Please select a ${ev.label} template. No generic message will be sent.` });
    }
    res.json({ ok: issues.length === 0, issues, events });
  } catch (e) { sendError(res, e, 'workflow.getEventMappingValidation'); }
};

// GET /health — Communication Health card (Step 8).
exports.getCommunicationHealth = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json({});
    const [templates, mappings, ws] = await Promise.all([
      prisma.communicationTemplate.findMany({ where: { companyId }, select: { id: true, libraryState: true } }),
      prisma.communicationEventMapping.findMany({ where: { companyId } }),
      prisma.whatsAppSettings.findUnique({ where: { companyId } }).catch(() => null),
    ]);
    const configuredTemplates = templates.filter((t) => (t.libraryState || 'enabled') === 'enabled').length;
    let missingTemplates = 0, automationEnabled = 0, automationDisabled = 0;
    const byKey = {};
    for (const m of mappings) byKey[m.eventKey] = m;
    for (const ev of EVENT_CATALOG) {
      const m = byKey[ev.key];
      if (m && m.enabled) { automationEnabled++; if (!m.hrmateTemplateId) missingTemplates++; }
      else automationDisabled++;
    }
    let upcomingEvents = 0;
    try {
      const emps = await prisma.employee.findMany({ where: { companyId }, select: { dob: true, joinDate: true } });
      const within30 = (d) => { if (!d) return false; const dt = new Date(d); if (isNaN(dt.getTime())) return false; const now = new Date(); const next = new Date(now.getFullYear(), dt.getMonth(), dt.getDate()); if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1); const diff = (next - now) / 86400000; return diff >= 0 && diff <= 30; };
      for (const e of emps) { if (within30(e.dob)) upcomingEvents++; if (within30(e.joinDate)) upcomingEvents++; }
    } catch { /* optional */ }
    const emailConnected = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    res.json({
      configuredTemplates, missingTemplates, automationEnabled, automationDisabled,
      whatsappConnected: !!(ws && ws.enabled && String(ws.connectionStatus || '').toLowerCase() === 'connected'),
      emailConnected, upcomingEvents, totalEvents: EVENT_CATALOG.length, healthy: missingTemplates === 0,
    });
  } catch (e) { sendError(res, e, 'workflow.getCommunicationHealth'); }
};

exports.EVENT_CATALOG = EVENT_CATALOG;
