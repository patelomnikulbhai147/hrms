/**
 * Communication Center — Phase 1 foundation (storage only, NO message sending).
 *
 * Provides CRUD + read APIs for communication templates, scheduled messages,
 * announcements, settings, plus the category & placeholder libraries and a
 * dashboard summary. There are deliberately NO endpoints that deliver/send a
 * message (WhatsApp/SMS/Email/Push are Phase 2). Every read/write is scoped to
 * the caller's own top-level company. Access is gated to Super Admin + Company
 * Head at the route layer.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { SAMPLE_TEMPLATES, sampleHolidays } = require('../data/communicationSamples');

// ── Company resolution (branch → parent; non-SA locked to own company) ────────
async function resolveCompanyId(req) {
  const toParent = async (rawId) => {
    if (!rawId) return undefined;
    const asCompany = await prisma.company.findUnique({ where: { id: rawId } }).catch(() => null);
    if (asCompany) return asCompany.parentCompanyId || asCompany.id;
    const asBranch = await prisma.branch.findUnique({ where: { id: rawId } }).catch(() => null);
    return asBranch ? asBranch.companyId : rawId;
  };
  if (req.user?.role === 'Super Admin') {
    return await toParent(idParam(req.query.companyId || req.headers['x-workspace-id']));
  }
  return await toParent(req.user?.companyId);
}

function actorName(req) {
  return (req.user && (req.user.name || req.user.email || req.user.username)) || 'System';
}

function sendError(res, e, label) {
  console.error(label, e);
  const code = e && e.code;
  if (code === 'P2025') return res.status(404).json({ error: 'Record not found.' });
  if (code === 'P2002') return res.status(409).json({ error: 'A record with this value already exists.' });
  if (e && (e.name === 'PrismaClientValidationError' || /Invalid `prisma\./.test(e.message || ''))) {
    return res.status(400).json({ error: 'Invalid data: one or more fields have the wrong format.' });
  }
  return res.status(500).json({ error: (e && e.message) || 'Server error' });
}

// ── Static libraries (Phase 1 — stored/exposed, not processed) ────────────────
const CATEGORIES = [
  'Birthday Wishes', 'Work Anniversary', 'Festival Greetings', 'Company Announcements',
  'Welcome Messages', 'Farewell Messages', 'Promotion Congratulations',
  'Employee of the Month', 'Salary Credited', 'Payslip Available', 'Custom Templates',
];

// Dynamic placeholder library — prepared for future rendering, NOT processed yet.
const PLACEHOLDERS = [
  { token: '{{employee_name}}', label: 'Employee Name' },
  { token: '{{employee_id}}', label: 'Employee ID' },
  { token: '{{employee_photo}}', label: 'Employee Photo' },
  { token: '{{designation}}', label: 'Designation' },
  { token: '{{department}}', label: 'Department' },
  { token: '{{company_name}}', label: 'Company Name' },
  { token: '{{company_logo}}', label: 'Company Logo' },
  { token: '{{company_address}}', label: 'Company Address' },
  { token: '{{birthday}}', label: 'Birthday' },
  { token: '{{joining_date}}', label: 'Joining Date' },
  { token: '{{years_of_service}}', label: 'Years of Service' },
  { token: '{{today_date}}', label: "Today's Date" },
];

exports.getCategories = (_req, res) => res.json(CATEGORIES);
exports.getPlaceholders = (_req, res) => res.json(PLACEHOLDERS);

// Enterprise sample template library (read-only catalog; duplicated on demand).
exports.getSampleTemplates = (_req, res) => res.json(SAMPLE_TEMPLATES);

// Curated major-Indian-holiday starter list (importable, not auto-applied).
exports.getSampleHolidays = (req, res) => res.json(sampleHolidays(req.query.year));

// ── Dashboard summary (counts only) ───────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json(emptyDashboard());
    const today = new Date().toISOString().split('T')[0];

    const [totalTemplates, festivalTemplates, draftTemplates, scheduled, announcements, sentToday] = await Promise.all([
      prisma.communicationTemplate.count({ where: { companyId } }),
      prisma.communicationTemplate.count({ where: { companyId, category: 'Festival Greetings' } }),
      prisma.communicationTemplate.count({ where: { companyId, status: 'Draft' } }),
      prisma.communicationSchedule.count({ where: { companyId, status: 'Scheduled' } }),
      prisma.communicationAnnouncement.count({ where: { companyId } }),
      prisma.whatsAppDeliveryLog.count({ where: { companyId, status: 'Sent', createdAt: { gte: new Date(today) } } }),
    ]);

    // Upcoming birthdays / work anniversaries — summary counts only (no PII), and
    // gracefully zero if the employee table has no usable dates.
    let upcomingBirthdays = 0, upcomingAnniversaries = 0;
    try {
      const emps = await prisma.employee.findMany({ where: { companyId }, select: { dob: true, joinDate: true } });
      const within30 = (d) => {
        if (!d) return false;
        const dt = new Date(d); if (isNaN(dt.getTime())) return false;
        const now = new Date();
        const next = new Date(now.getFullYear(), dt.getMonth(), dt.getDate());
        if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
        const diff = (next - now) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
      };
      for (const e of emps) { if (within30(e.dob)) upcomingBirthdays++; if (within30(e.joinDate)) upcomingAnniversaries++; }
    } catch { /* employee dates optional */ }

    // Upcoming holidays in the next 30 days (count only, from the holiday calendar).
    let upcomingHolidays = 0, totalHolidays = 0;
    try {
      const holidays = await prisma.communicationHoliday.findMany({ where: { companyId, status: 'Active' }, select: { date: true } });
      totalHolidays = holidays.length;
      const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start); end.setDate(end.getDate() + 30);
      for (const h of holidays) { const d = new Date(h.date); if (!isNaN(d.getTime()) && d >= start && d <= end) upcomingHolidays++; }
    } catch { /* holiday table optional */ }

    // WhatsApp summary (Phase 1.5) — counts only, company-scoped. Never throws.
    let whatsappTemplates = 0, whatsappPending = 0, whatsappSimulated = 0, whatsappFailed = 0, whatsappDevelopmentMode = true;
    try {
      const [waTpl, waPending, waSim, waFailed, waSettings] = await Promise.all([
        prisma.communicationTemplate.count({ where: { companyId, whatsappCompatible: true } }),
        prisma.whatsAppQueue.count({ where: { companyId, status: 'Pending' } }),
        prisma.whatsAppDeliveryLog.count({ where: { companyId, status: 'Simulated' } }),
        prisma.whatsAppDeliveryLog.count({ where: { companyId, status: 'Failed' } }),
        prisma.whatsAppSettings.findUnique({ where: { companyId } }),
      ]);
      whatsappTemplates = waTpl; whatsappPending = waPending; whatsappSimulated = waSim; whatsappFailed = waFailed;
      whatsappDevelopmentMode = waSettings ? Boolean(waSettings.developmentMode) : true;
    } catch { /* whatsapp tables optional */ }

    res.json({
      totalTemplates, scheduledMessages: scheduled, sentToday, upcomingBirthdays, upcomingAnniversaries,
      festivalTemplates, announcements, draftMessages: draftTemplates, upcomingHolidays, totalHolidays,
      // WhatsApp summary cards
      whatsappTemplates, whatsappPending, whatsappSimulated, whatsappFailed, whatsappDevelopmentMode,
      upcomingBirthdayMessages: upcomingBirthdays, upcomingFestivalMessages: festivalTemplates,
    });
  } catch (e) { sendError(res, e, 'communication.getDashboard'); }
};
function emptyDashboard() {
  return { totalTemplates: 0, scheduledMessages: 0, sentToday: 0, upcomingBirthdays: 0, upcomingAnniversaries: 0, festivalTemplates: 0, announcements: 0, draftMessages: 0, upcomingHolidays: 0, totalHolidays: 0,
    whatsappTemplates: 0, whatsappPending: 0, whatsappSimulated: 0, whatsappFailed: 0, whatsappDevelopmentMode: true, upcomingBirthdayMessages: 0, upcomingFestivalMessages: 0 };
}

// ── Templates ─────────────────────────────────────────────────────────────────
const TEMPLATE_FIELDS = ['title', 'category', 'subject', 'body', 'status', 'backgroundImage', 'companyLogo',
  'employeePhotoPlaceholder', 'placeholders', 'layout', 'festivalName', 'festivalDate',
  // WhatsApp readiness (Phase 1 — stored only, never sent)
  'whatsappCompatible', 'whatsappRichText', 'whatsappCaption'];
function pickTemplate(body) {
  const data = {};
  for (const f of TEMPLATE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (data.employeePhotoPlaceholder !== undefined) data.employeePhotoPlaceholder = !!data.employeePhotoPlaceholder;
  for (const f of ['whatsappCompatible', 'whatsappRichText']) {
    if (data[f] !== undefined) data[f] = !!data[f];
  }
  for (const f of ['placeholders', 'layout']) {
    if (data[f] != null && typeof data[f] !== 'string') { try { data[f] = JSON.stringify(data[f]); } catch { data[f] = null; } }
  }
  return data;
}

exports.listTemplates = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    const where = { companyId };
    if (req.query.category && req.query.category !== 'All') where.category = String(req.query.category);
    res.json(await prisma.communicationTemplate.findMany({ where, orderBy: { id: 'desc' } }));
  } catch (e) { sendError(res, e, 'communication.listTemplates'); }
};
exports.createTemplate = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const data = pickTemplate(req.body);
    if (!data.title || !String(data.title).trim()) return res.status(400).json({ error: 'A template title is required.' });
    if (!data.category) data.category = 'Custom Templates';
    const created = await prisma.communicationTemplate.create({ data: { ...data, companyId, createdBy: actorName(req) } });
    res.status(201).json(created);
  } catch (e) { sendError(res, e, 'communication.createTemplate'); }
};
exports.updateTemplate = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.communicationTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Template not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This template is outside your company.' });
    res.json(await prisma.communicationTemplate.update({ where: { id }, data: pickTemplate(req.body) }));
  } catch (e) { sendError(res, e, 'communication.updateTemplate'); }
};
exports.deleteTemplate = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.communicationTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Template not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This template is outside your company.' });
    await prisma.communicationTemplate.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) { sendError(res, e, 'communication.deleteTemplate'); }
};

// ── Scheduled messages (stored only — NEVER executed in Phase 1) ──────────────
const SCHEDULE_FIELDS = ['name', 'templateId', 'channel', 'scheduleDate', 'scheduleTime', 'recurrence', 'recipients', 'status'];
function pickSchedule(body) {
  const data = {};
  for (const f of SCHEDULE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (data.templateId !== undefined) data.templateId = data.templateId === '' || data.templateId == null ? null : Number(data.templateId);
  if (data.recipients != null && typeof data.recipients !== 'string') { try { data.recipients = JSON.stringify(data.recipients); } catch { data.recipients = null; } }
  return data;
}
exports.listSchedules = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await prisma.communicationSchedule.findMany({ where: { companyId }, orderBy: { id: 'desc' } }));
  } catch (e) { sendError(res, e, 'communication.listSchedules'); }
};
exports.createSchedule = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const data = pickSchedule(req.body);
    if (!data.name || !String(data.name).trim()) return res.status(400).json({ error: 'A schedule name is required.' });
    const created = await prisma.communicationSchedule.create({ data: { ...data, companyId, createdBy: actorName(req) } });
    res.status(201).json(created);
  } catch (e) { sendError(res, e, 'communication.createSchedule'); }
};
exports.updateSchedule = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.communicationSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Schedule not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This schedule is outside your company.' });
    res.json(await prisma.communicationSchedule.update({ where: { id }, data: pickSchedule(req.body) }));
  } catch (e) { sendError(res, e, 'communication.updateSchedule'); }
};
exports.deleteSchedule = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.communicationSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Schedule not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This schedule is outside your company.' });
    await prisma.communicationSchedule.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) { sendError(res, e, 'communication.deleteSchedule'); }
};

// ── Announcements (created/stored — NOT delivered in Phase 1) ──────────────────
const ANN_FIELDS = ['title', 'message', 'attachment', 'attachmentName', 'priority', 'expiryDate', 'status'];
function pickAnnouncement(body) {
  const data = {};
  for (const f of ANN_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  return data;
}
exports.listAnnouncements = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await prisma.communicationAnnouncement.findMany({ where: { companyId }, orderBy: { id: 'desc' } }));
  } catch (e) { sendError(res, e, 'communication.listAnnouncements'); }
};
exports.createAnnouncement = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const data = pickAnnouncement(req.body);
    if (!data.title || !String(data.title).trim()) return res.status(400).json({ error: 'An announcement title is required.' });
    const created = await prisma.communicationAnnouncement.create({ data: { ...data, companyId, createdBy: actorName(req) } });
    res.status(201).json(created);
  } catch (e) { sendError(res, e, 'communication.createAnnouncement'); }
};
exports.updateAnnouncement = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.communicationAnnouncement.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Announcement not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This announcement is outside your company.' });
    res.json(await prisma.communicationAnnouncement.update({ where: { id }, data: pickAnnouncement(req.body) }));
  } catch (e) { sendError(res, e, 'communication.updateAnnouncement'); }
};
exports.deleteAnnouncement = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.communicationAnnouncement.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Announcement not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This announcement is outside your company.' });
    await prisma.communicationAnnouncement.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) { sendError(res, e, 'communication.deleteAnnouncement'); }
};

// ── Delivery logs (read-only) ─────────────────────────────────────────────────
// Reads the real per-message WhatsApp delivery ledger (whatsAppDeliveryLog).
// The legacy communicationDeliveryLog table was never written to and is retired.
exports.listDeliveryLogs = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await prisma.whatsAppDeliveryLog.findMany({ where: { companyId }, orderBy: { id: 'desc' }, take: 200 }));
  } catch (e) { sendError(res, e, 'communication.listDeliveryLogs'); }
};

// ── Holiday Calendar ──────────────────────────────────────────────────────────
const HOLIDAY_FIELDS = ['name', 'category', 'date', 'applicableBranches', 'applicableDepartments',
  'description', 'isPublicHoliday', 'isOptionalHoliday', 'isRecurring', 'status'];
function pickHoliday(body) {
  const data = {};
  for (const f of HOLIDAY_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  for (const b of ['isPublicHoliday', 'isOptionalHoliday', 'isRecurring']) if (data[b] !== undefined) data[b] = !!data[b];
  for (const j of ['applicableBranches', 'applicableDepartments']) {
    if (data[j] != null && typeof data[j] !== 'string') { try { data[j] = JSON.stringify(data[j]); } catch { data[j] = null; } }
  }
  if (data.date != null) data.date = String(data.date).slice(0, 10);
  return data;
}
exports.listHolidays = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    const where = { companyId };
    if (req.query.year) where.date = { startsWith: String(req.query.year) };
    res.json(await prisma.communicationHoliday.findMany({ where, orderBy: { date: 'asc' } }));
  } catch (e) { sendError(res, e, 'communication.listHolidays'); }
};
exports.createHoliday = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const data = pickHoliday(req.body);
    if (!data.name || !String(data.name).trim()) return res.status(400).json({ error: 'A holiday name is required.' });
    if (!data.date) return res.status(400).json({ error: 'A holiday date is required.' });
    const created = await prisma.communicationHoliday.create({ data: { ...data, companyId, createdBy: actorName(req) } });
    res.status(201).json(created);
  } catch (e) { sendError(res, e, 'communication.createHoliday'); }
};
exports.updateHoliday = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.communicationHoliday.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Holiday not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This holiday is outside your company.' });
    res.json(await prisma.communicationHoliday.update({ where: { id }, data: pickHoliday(req.body) }));
  } catch (e) { sendError(res, e, 'communication.updateHoliday'); }
};
exports.deleteHoliday = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.communicationHoliday.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Holiday not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This holiday is outside your company.' });
    await prisma.communicationHoliday.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) { sendError(res, e, 'communication.deleteHoliday'); }
};
// Bulk import — accepts { holidays: [...] }. Skips rows that duplicate an existing
// name+date for the company so re-importing the starter list is idempotent.
exports.importHolidays = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const rows = Array.isArray(req.body?.holidays) ? req.body.holidays : (Array.isArray(req.body) ? req.body : []);
    if (!rows.length) return res.status(400).json({ error: 'No holidays to import.' });
    const existing = await prisma.communicationHoliday.findMany({ where: { companyId }, select: { name: true, date: true } });
    const seen = new Set(existing.map(h => `${(h.name || '').toLowerCase()}|${h.date}`));
    let created = 0, skipped = 0;
    for (const r of rows) {
      const data = pickHoliday(r || {});
      if (!data.name || !data.date) { skipped++; continue; }
      const key = `${String(data.name).toLowerCase()}|${data.date}`;
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      await prisma.communicationHoliday.create({ data: { ...data, companyId, createdBy: actorName(req) } });
      created++;
    }
    res.status(201).json({ created, skipped, total: rows.length });
  } catch (e) { sendError(res, e, 'communication.importHolidays'); }
};

// ── Settings (Phase 1: stored; provider config is disabled in the UI) ─────────
const SETTINGS_FIELDS = ['emailProvider', 'smsProvider', 'whatsappProvider', 'pushEnabled', 'timezone', 'workingHoursStart', 'workingHoursEnd', 'config'];
function pickSettings(body) {
  const data = {};
  for (const f of SETTINGS_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (data.pushEnabled !== undefined) data.pushEnabled = !!data.pushEnabled;
  return data;
}
exports.getSettings = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json(null);
    let s = await prisma.communicationSettings.findUnique({ where: { companyId } });
    if (!s) s = await prisma.communicationSettings.create({ data: { companyId } });
    res.json(s);
  } catch (e) { sendError(res, e, 'communication.getSettings'); }
};
exports.updateSettings = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const data = pickSettings(req.body);
    const s = await prisma.communicationSettings.upsert({ where: { companyId }, update: data, create: { ...data, companyId } });
    res.json(s);
  } catch (e) { sendError(res, e, 'communication.updateSettings'); }
};

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp integration foundation (Phase 1 — NO real messages are ever sent).
// Reuses the company-resolution + error helpers above. All sending logic lives in
// the WhatsApp service layer (src/services/whatsapp); these handlers are thin.
// Gated at the route layer by the same Communication Center permission as the
// rest of the module (Super Admin blocked; Company Head full; HR per matrix).
// ─────────────────────────────────────────────────────────────────────────────
const whatsapp = require('../services/whatsapp');

// GET /whatsapp/settings — the per-company config (created with dev-mode ON).
// SECURITY: secrets (Access Token / Verify Token) are NEVER returned — only
// boolean presence flags (hasAccessToken / hasVerifyToken).
exports.getWhatsAppSettings = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json(null);
    res.json(await whatsapp.settings.getForClient(companyId));
  } catch (e) { sendError(res, e, 'communication.getWhatsAppSettings'); }
};

// PUT /whatsapp/settings — save connection toggle, dev mode, test number, Meta
// credentials. Credentials are format-validated BEFORE any Meta call; secrets are
// encrypted at rest and the response is redacted.
exports.updateWhatsAppSettings = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const check = whatsapp.validation.validateCredentials(req.body);
    if (!check.ok) return res.status(400).json({ error: 'Some credentials are invalid. Please correct the highlighted fields.', fields: check.errors });
    const updated = await whatsapp.settings.update(companyId, req.body);
    await writeCommAudit(companyId, req, { eventType: 'whatsapp', action: 'Configuration Changed', detail: 'WhatsApp settings updated' });
    res.json(whatsapp.settings.redactForClient(updated));
  } catch (e) { sendError(res, e, 'communication.updateWhatsAppSettings'); }
};

// GET /whatsapp/request-history — internal Meta API request history (no secrets).
exports.getWhatsAppRequestHistory = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await whatsapp.service.requestHistory(companyId));
  } catch (e) { sendError(res, e, 'communication.getWhatsAppRequestHistory'); }
};

// ── Phase 3 — WhatsApp Template Management ────────────────────────────────────
const tmpl = () => whatsapp.templateManager;

// POST /whatsapp/templates/sync — pull approved templates from Meta.
exports.syncWhatsAppTemplates = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const result = await tmpl().syncTemplates(companyId);
    await writeCommAudit(companyId, req, { eventType: 'whatsapp', action: 'Template Sync', detail: result && result.total != null ? `${result.total} templates` : 'synced' });
    res.json(result);
  } catch (e) { sendError(res, e, 'communication.syncWhatsAppTemplates'); }
};

// GET /whatsapp/templates/meta — synced Meta template catalog.
exports.listWhatsAppMetaTemplates = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await tmpl().listMetaTemplates(companyId));
  } catch (e) { sendError(res, e, 'communication.listWhatsAppMetaTemplates'); }
};

// GET /whatsapp/templates/mappings — HRMate↔Meta mappings.
exports.listWhatsAppMappings = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await tmpl().listMappings(companyId));
  } catch (e) { sendError(res, e, 'communication.listWhatsAppMappings'); }
};

// POST /whatsapp/templates/mappings — create/update a mapping (validates placeholders).
exports.saveWhatsAppMapping = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const result = await tmpl().saveMapping(companyId, req.body);
    if (!result.ok) return res.status(400).json({ error: result.message, fields: result.errors });
    res.json(result.mapping);
  } catch (e) { sendError(res, e, 'communication.saveWhatsAppMapping'); }
};

// DELETE /whatsapp/templates/mappings/:id
exports.deleteWhatsAppMapping = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const result = await tmpl().deleteMapping(companyId, req.params.id);
    if (!result.ok) return res.status(404).json({ error: result.message });
    res.json({ message: 'Deleted' });
  } catch (e) { sendError(res, e, 'communication.deleteWhatsAppMapping'); }
};

// POST /whatsapp/templates/mappings/:id/test — send a manual template test.
exports.testWhatsAppTemplate = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    res.json(await tmpl().sendTemplateTest(companyId, req.params.id));
  } catch (e) { sendError(res, e, 'communication.testWhatsAppTemplate'); }
};

// GET /whatsapp/templates/events — version/approval/sync history.
exports.listWhatsAppTemplateEvents = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await tmpl().listEvents(companyId));
  } catch (e) { sendError(res, e, 'communication.listWhatsAppTemplateEvents'); }
};

// ── Phase 4 — Communication Automation Engine ─────────────────────────────────
const automation = require('../services/automation/automationEngine');

const RULE_FIELDS = ['name', 'eventType', 'triggerType', 'recipientScope', 'channel', 'templateMappingId',
  'hrmateTemplateId', 'language', 'scheduleTime', 'scheduleDay', 'scheduleMonth', 'specificDate', 'specificEmployeeId', 'status', 'dryRun'];
function pickRule(body) {
  const d = {};
  for (const f of RULE_FIELDS) if (body[f] !== undefined) d[f] = body[f];
  for (const f of ['templateMappingId', 'hrmateTemplateId', 'scheduleDay', 'scheduleMonth', 'specificEmployeeId']) {
    if (d[f] !== undefined) d[f] = (d[f] === '' || d[f] === null) ? null : Number(d[f]);
  }
  if (d.dryRun !== undefined) d.dryRun = !!d.dryRun;
  return d;
}

// GET /automation/meta — event types / triggers / recipient scopes for the UI.
exports.getAutomationMeta = (_req, res) => res.json(automation.meta());

// GET /automation/rules
exports.listAutomationRules = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await prisma.automationRule.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' } }));
  } catch (e) { sendError(res, e, 'communication.listAutomationRules'); }
};

// POST /automation/rules
exports.createAutomationRule = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const data = pickRule(req.body);
    if (!data.name || !String(data.name).trim()) return res.status(400).json({ error: 'A rule name is required.' });
    if (!data.eventType) return res.status(400).json({ error: 'Select an event type.' });
    const created = await prisma.automationRule.create({ data: { ...data, companyId, createdBy: actorName(req) } });
    res.status(201).json(created);
  } catch (e) { sendError(res, e, 'communication.createAutomationRule'); }
};

// PUT /automation/rules/:id
exports.updateAutomationRule = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Rule not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This rule is outside your company.' });
    res.json(await prisma.automationRule.update({ where: { id }, data: pickRule(req.body) }));
  } catch (e) { sendError(res, e, 'communication.updateAutomationRule'); }
};

// DELETE /automation/rules/:id
exports.deleteAutomationRule = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    const id = idParam(req.params.id);
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Rule not found.' });
    if (req.user?.role !== 'Super Admin' && existing.companyId !== companyId) return res.status(403).json({ error: 'This rule is outside your company.' });
    await prisma.automationRule.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) { sendError(res, e, 'communication.deleteAutomationRule'); }
};

// POST /automation/rules/:id/execute  body { mode: run|preview|dry_run }
exports.executeAutomationRule = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const id = idParam(req.params.id);
    const rule = await prisma.automationRule.findFirst({ where: { id, companyId } });
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });
    const mode = ['preview', 'dry_run', 'run', 'send'].includes(req.body?.mode) ? req.body.mode : 'preview';
    const result = await automation.execute(companyId, rule, mode);
    const s = result.summary || {};
    const label = mode === 'send' ? 'Automation Send' : mode === 'run' ? 'Automation' : mode === 'dry_run' ? 'Automation Dry-Run' : 'Automation Preview';
    const detail = mode === 'send'
      ? `${rule.name} · ${s.sentMessages ?? 0} sent / ${s.failedMessages ?? 0} failed / ${s.eligibleRecipients ?? 0} eligible`
      : `${rule.name} · ${s.queuedMessages ?? 0} queued / ${s.eligibleRecipients ?? 0} eligible`;
    await writeCommAudit(companyId, req, { eventType: rule.eventType || 'automation', action: label, detail, targetId: rule.id });
    res.json(result);
  } catch (e) { sendError(res, e, 'communication.executeAutomationRule'); }
};

// GET /automation/scheduler — scheduler status + per-rule next-run (UI display).
exports.getAutomationScheduler = async (req, res) => {
  try {
    const scheduler = require('../services/automation/automationScheduler');
    const companyId = await resolveCompanyId(req);
    const rules = companyId ? await prisma.automationRule.findMany({ where: { companyId } }) : [];
    const nextRuns = rules.map((r) => ({ id: r.id, name: r.name, status: r.status, scheduleTime: r.scheduleTime, timezone: r.timezone || null, lastRunAt: r.lastRunAt, nextRunAt: scheduler.nextRunAt(r) }));
    res.json({ scheduler: scheduler.status(), rules: nextRuns });
  } catch (e) { sendError(res, e, 'communication.getAutomationScheduler'); }
};

// GET /automation/runs — execution history.
exports.listAutomationRuns = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await automation.listRuns(companyId));
  } catch (e) { sendError(res, e, 'communication.listAutomationRuns'); }
};

// POST /whatsapp/connection-test — REAL Meta connectivity check (Phase 2).
exports.testWhatsAppConnection = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const result = await whatsapp.service.testConnection(companyId);
    await writeCommAudit(companyId, req, { eventType: 'whatsapp', action: 'Connection Test', detail: result.status || (result.ok ? 'Connected' : 'Failed') });
    res.json(result);
  } catch (e) { sendError(res, e, 'communication.testWhatsAppConnection'); }
};

// POST /whatsapp/send-test — send the ONE real test message to the dev number.
exports.sendWhatsAppTestMessage = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const result = await whatsapp.service.sendTestMessage(companyId);
    await writeCommAudit(companyId, req, { eventType: 'whatsapp', action: 'Manual Send (Test)', detail: result.ok ? `Sent · ${result.details && result.details.metaMessageId || ''}` : (result.status || 'Failed') });
    res.json(result);
  } catch (e) { sendError(res, e, 'communication.sendWhatsAppTestMessage'); }
};

// ── WhatsApp Image-Template Integration ───────────────────────────────────────
// Render an HRMate Template-Gallery design as a PNG and send it as an approved
// WhatsApp IMAGE template. Reuses the renderer + Meta media upload + the existing
// template mapping; writes a real delivery log consumed by webhook/analytics/audit.
const img = () => whatsapp.image;

// POST /whatsapp/image/preview — return the exact PNG (base64) that WOULD be sent,
// so the in-app preview never differs from the delivered card. Body: { templateId, employeeId? }.
exports.previewWhatsAppCard = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const { templateId, employeeId } = { ...req.query, ...req.body };
    const result = await img().previewCard({ companyId, templateId, employeeId });
    if (!result.ok) return res.status(result.status === 'Not Found' ? 404 : 400).json({ error: result.message });
    res.json(result);
  } catch (e) { sendError(res, e, 'communication.previewWhatsAppCard'); }
};

// POST /whatsapp/image/send — render + send a personalized image card to an
// employee (or, in Development Mode, the Developer Test Number). Manual/"Send Again".
exports.sendWhatsAppImage = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const { templateId, employeeId, toOverride, useImageFallback, automationRuleId } = req.body || {};
    if (!templateId) return res.status(400).json({ error: 'A template is required.' });
    const result = await img().sendImageForEmployee({ companyId, templateId, employeeId, toOverride, useImageFallback: !!useImageFallback, automationRuleId: automationRuleId != null ? Number(automationRuleId) : null });
    await writeCommAudit(companyId, req, { eventType: 'whatsapp', action: 'Image Send', detail: result.ok ? `Sent · ${(result.details && result.details.metaMessageId) || ''}` : (result.status || 'Failed'), targetId: employeeId != null ? Number(employeeId) : null });
    res.json(result);
  } catch (e) { sendError(res, e, 'communication.sendWhatsAppImage'); }
};

// POST /whatsapp/image/test — send a rendered image card to the Developer Test
// Number to validate the whole pipeline live. Body: { templateId, employeeId? }.
exports.sendWhatsAppTestImage = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const { templateId, employeeId } = req.body || {};
    if (!templateId) return res.status(400).json({ error: 'A template is required.' });
    const result = await img().sendTestImage(companyId, { templateId, employeeId });
    await writeCommAudit(companyId, req, { eventType: 'whatsapp', action: 'Image Send (Test)', detail: result.ok ? `Sent · ${(result.details && result.details.metaMessageId) || ''}` : (result.status || 'Failed') });
    res.json(result);
  } catch (e) { sendError(res, e, 'communication.sendWhatsAppTestImage'); }
};

// GET /whatsapp/placeholders — the supported WhatsApp token vocabulary.
exports.getWhatsAppPlaceholders = (_req, res) => res.json(whatsapp.placeholders.WHATSAPP_PLACEHOLDERS);

// GET /whatsapp/templates — templates flagged WhatsApp Compatible.
exports.listWhatsAppTemplates = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await whatsapp.templates.listWhatsAppTemplates(companyId));
  } catch (e) { sendError(res, e, 'communication.listWhatsAppTemplates'); }
};

// GET /whatsapp/queue — the (simulated) outbound queue.
exports.listWhatsAppQueue = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await whatsapp.queue.listQueue(companyId));
  } catch (e) { sendError(res, e, 'communication.listWhatsAppQueue'); }
};

// GET /whatsapp/logs — the WhatsApp delivery logs (simulated in Phase 1).
exports.listWhatsAppLogs = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await whatsapp.queue.listLogs(companyId));
  } catch (e) { sendError(res, e, 'communication.listWhatsAppLogs'); }
};

// POST /whatsapp/test — "Test WhatsApp Configuration" (simulate, never send).
exports.testWhatsAppConfiguration = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    res.json(await whatsapp.service.testConfiguration(companyId));
  } catch (e) { sendError(res, e, 'communication.testWhatsAppConfiguration'); }
};

// GET /whatsapp/diagnostics — LIVE Meta connection status (Phase 2).
exports.getWhatsAppDiagnostics = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json({ connection: [], items: [], metaConfigured: false });
    res.json(await whatsapp.service.diagnostics(companyId));
  } catch (e) { sendError(res, e, 'communication.getWhatsAppDiagnostics'); }
};

// GET /whatsapp/scheduler-preview — simulate upcoming jobs (NO sending).
// Today/Tomorrow birthday queues + upcoming festival queue, company-scoped.
exports.getWhatsAppSchedulerPreview = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json({ todayBirthdays: [], tomorrowBirthdays: [], upcomingFestivals: [], developmentMode: true, testNumber: '' });
    const s = await whatsapp.settings.getOrCreate(companyId);
    const recipient = (mobile) => (s.developmentMode ? (s.developerTestNumber || '(test number not set)') : (mobile || '(no mobile)'));

    const now = new Date();
    const md = (d) => { const x = new Date(d); return isNaN(x.getTime()) ? null : `${x.getMonth()}-${x.getDate()}`; };
    const todayKey = `${now.getMonth()}-${now.getDate()}`;
    const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
    const tmrKey = `${tmr.getMonth()}-${tmr.getDate()}`;

    let todayBirthdays = [], tomorrowBirthdays = [];
    try {
      const emps = await prisma.employee.findMany({ where: { companyId }, select: { id: true, name: true, dob: true, mobile: true } });
      for (const e of emps) {
        const key = md(e.dob);
        if (!key) continue;
        const row = { employee: e.name, date: e.dob, originalNumber: e.mobile || '', redirectedTo: recipient(e.mobile) };
        if (key === todayKey) todayBirthdays.push(row);
        else if (key === tmrKey) tomorrowBirthdays.push(row);
      }
    } catch { /* employee dates optional */ }

    // Upcoming festivals = next-30-day holidays (religious/festival flavour) paired
    // with the company's festival greeting templates (simulated job preview).
    let upcomingFestivals = [];
    try {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start); end.setDate(end.getDate() + 30);
      const holidays = await prisma.communicationHoliday.findMany({ where: { companyId, status: 'Active' }, select: { name: true, date: true, category: true } });
      const festTemplates = await prisma.communicationTemplate.count({ where: { companyId, category: 'Festival Greetings' } });
      for (const h of holidays) {
        const d = new Date(h.date);
        if (!isNaN(d.getTime()) && d >= start && d <= end) {
          upcomingFestivals.push({ festival: h.name, date: h.date, category: h.category, templatesAvailable: festTemplates });
        }
      }
      upcomingFestivals.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch { /* holidays optional */ }

    res.json({ todayBirthdays, tomorrowBirthdays, upcomingFestivals, developmentMode: !!s.developmentMode, testNumber: s.developerTestNumber || '' });
  } catch (e) { sendError(res, e, 'communication.getWhatsAppSchedulerPreview'); }
};

// ── Communication Audit Trail ─────────────────────────────────────────────────
// Reuses the EXISTING AuditLog model (no schema change). Company isolation is
// preserved by stamping the companyId inside the details JSON and filtering reads
// to the caller's resolved company. module is always 'Communication'.
const COMM_AUDIT_MODULE = 'Communication';
const parseAuditDetails = (raw) => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };

// Authoritative server-side audit writer — caller-independent (API, UI, automation
// all funnel through the controllers). Best-effort: never throws / blocks a request.
async function writeCommAudit(companyId, req, { eventType = '', action, detail = '', targetId = null }) {
  try {
    const uid = req && req.user && req.user.id;
    if (!uid || !companyId) return;
    await prisma.auditLog.create({
      data: {
        userId: uid, action: String(action).slice(0, 191), module: COMM_AUDIT_MODULE,
        targetId: String(targetId != null ? targetId : companyId),
        details: JSON.stringify({ companyId, eventType, action, detail, actor: actorName(req) }),
      },
    });
  } catch { /* audit is best-effort */ }
}

// GET /communication/audit?eventType=birthday&limit=100 — company-scoped trail.
exports.listCommunicationAudit = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    const eventType = req.query.eventType ? String(req.query.eventType) : null;
    const take = Math.min(Number(req.query.limit) || 100, 300);
    // Pull a generous window of Communication entries, then isolate by company in JS.
    const rows = await prisma.auditLog.findMany({
      where: { module: COMM_AUDIT_MODULE },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    const out = [];
    for (const l of rows) {
      const d = parseAuditDetails(l.details);
      if (Number(d.companyId) !== Number(companyId)) continue;       // company isolation
      if (eventType && String(d.eventType || '') !== eventType) continue;
      out.push({
        id: l.id,
        action: l.action,
        eventType: d.eventType || '',
        targetName: d.targetName || '',
        detail: d.detail || '',
        createdAt: l.createdAt,
        actorName: (l.user && (l.user.name || l.user.email)) || 'System',
        actorRole: (l.user && l.user.role) || '',
      });
      if (out.length >= take) break;
    }
    res.json(out);
  } catch (e) { sendError(res, e, 'communication.listCommunicationAudit'); }
};

// POST /communication/audit { eventType, action, targetId, targetName, detail }
// Records a Communication action (Preview / Manual Send / Retry / Template Change).
exports.createCommunicationAudit = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const userId = req.user && req.user.id;
    if (!userId) return res.json({ ok: false, skipped: 'no-user' }); // never blocks the UI
    const { eventType = '', action = 'Action', targetId = null, targetName = '', detail = '' } = req.body || {};
    await prisma.auditLog.create({
      data: {
        userId,
        action: String(action).slice(0, 191),
        module: COMM_AUDIT_MODULE,
        targetId: String(targetId != null ? targetId : companyId),
        details: JSON.stringify({ companyId, eventType, action, targetName, detail, actor: actorName(req) }),
      },
    });
    res.json({ ok: true });
  } catch (e) { sendError(res, e, 'communication.createCommunicationAudit'); }
};

// ── Phase 5 — Enterprise WhatsApp completion (all company-scoped, additive) ────
const REAL_STATUSES = new Set(['Sent', 'Delivered', 'Read', 'Failed']);
const isSameDay = (d) => { const x = new Date(d); const n = new Date(); return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate(); };

// GET /whatsapp/analytics — delivery analytics from the delivery logs + queue.
exports.getWhatsAppAnalytics = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json({});
    const [logs, queue] = await Promise.all([
      prisma.whatsAppDeliveryLog.findMany({ where: { companyId }, orderBy: { id: 'desc' }, take: 3000 }),
      prisma.whatsAppQueue.findMany({ where: { companyId }, select: { status: true } }),
    ]);
    const real = logs.filter((l) => REAL_STATUSES.has(l.status));
    const agg = (rows) => {
      const sent = rows.filter((l) => ['Sent', 'Delivered', 'Read'].includes(l.status)).length;
      const delivered = rows.filter((l) => l.deliveredAt || ['Delivered', 'Read'].includes(l.status)).length;
      const read = rows.filter((l) => l.readAt || l.status === 'Read').length;
      const failed = rows.filter((l) => l.status === 'Failed').length;
      const total = sent + failed;
      const deliveryTimes = rows.filter((l) => l.sentAt && l.deliveredAt).map((l) => (new Date(l.deliveredAt) - new Date(l.sentAt)) / 1000);
      const avgDeliverySec = deliveryTimes.length ? Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length) : null;
      return {
        sent, delivered, read, failed,
        successRate: total ? Math.round((sent / total) * 100) : 0,
        readRate: delivered ? Math.round((read / delivered) * 100) : 0,
        avgDeliverySeconds: avgDeliverySec,
      };
    };
    const pending = queue.filter((q) => ['Pending', 'Processing'].includes(q.status)).length;
    res.json({
      today: { ...agg(real.filter((l) => isSameDay(l.createdAt))), messages: real.filter((l) => isSameDay(l.createdAt)).length, pending },
      allTime: { ...agg(real), messages: real.length, pending },
      pending,
    });
  } catch (e) { sendError(res, e, 'communication.getWhatsAppAnalytics'); }
};

// GET /whatsapp/messages/search — multi-field message search (company-scoped).
exports.searchWhatsAppMessages = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    const q = req.query || {};
    const where = { companyId };
    const and = [];
    if (q.employee) and.push({ employeeName: { contains: String(q.employee) } });
    if (q.mobile) and.push({ OR: [{ originalNumber: { contains: String(q.mobile) } }, { actualSentNumber: { contains: String(q.mobile) } }] });
    if (q.wamid) and.push({ metaMessageId: { contains: String(q.wamid) } });
    if (q.template) and.push({ templateName: { contains: String(q.template) } });
    if (q.status && q.status !== 'All') where.status = String(q.status);
    if (q.ruleId) where.automationRuleId = Number(q.ruleId);
    if (q.from || q.to) { where.createdAt = {}; if (q.from) where.createdAt.gte = new Date(`${q.from}T00:00:00`); if (q.to) where.createdAt.lte = new Date(`${q.to}T23:59:59`); }
    if (and.length) where.AND = and;
    const rows = await prisma.whatsAppDeliveryLog.findMany({ where, orderBy: { id: 'desc' }, take: 300 });
    res.json(rows);
  } catch (e) { sendError(res, e, 'communication.searchWhatsAppMessages'); }
};

// GET /whatsapp/messages/:id — message inspector (timeline + webhook events).
exports.getWhatsAppMessageDetail = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const id = Number(req.params.id);
    const log = await prisma.whatsAppDeliveryLog.findFirst({ where: { id, companyId } });
    if (!log) return res.status(404).json({ error: 'Message not found.' });
    const [events, queueRow, rule, company] = await Promise.all([
      log.metaMessageId ? prisma.whatsAppWebhookEvent.findMany({ where: { companyId, metaMessageId: log.metaMessageId }, orderBy: { id: 'asc' } }) : Promise.resolve([]),
      log.queueId ? prisma.whatsAppQueue.findUnique({ where: { id: log.queueId } }) : Promise.resolve(null),
      log.automationRuleId ? prisma.automationRule.findUnique({ where: { id: log.automationRuleId } }).catch(() => null) : Promise.resolve(null),
      prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, displayName: true } }).catch(() => null),
    ]);
    // Build a lifecycle timeline with timestamps.
    const timeline = [
      { stage: 'Queued', at: queueRow ? queueRow.createdAt : log.createdAt },
      { stage: 'Sent', at: log.sentAt || (['Sent', 'Delivered', 'Read'].includes(log.status) ? log.createdAt : null) },
      { stage: 'Delivered', at: log.deliveredAt },
      { stage: 'Read', at: log.readAt },
      { stage: 'Failed', at: log.failedAt || (log.status === 'Failed' ? log.createdAt : null) },
    ];
    res.json({
      log, timeline, webhookEvents: events,
      queue: queueRow ? { id: queueRow.id, status: queueRow.status, attempts: queueRow.attempts } : null,
      retryCount: queueRow ? queueRow.attempts : 0,
      automationRule: rule ? { id: rule.id, name: rule.name, eventType: rule.eventType } : null,
      company: company ? (company.displayName || company.name) : null,
    });
  } catch (e) { sendError(res, e, 'communication.getWhatsAppMessageDetail'); }
};

// GET /whatsapp/conversation?employeeId= or ?employee= — per-employee message history.
exports.getWhatsAppConversation = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    const where = { companyId };
    if (req.query.employeeId) where.employeeId = Number(req.query.employeeId);
    else if (req.query.employee) where.employeeName = { contains: String(req.query.employee) };
    const rows = await prisma.whatsAppDeliveryLog.findMany({ where, orderBy: { id: 'desc' }, take: 100 });
    res.json(rows);
  } catch (e) { sendError(res, e, 'communication.getWhatsAppConversation'); }
};

// POST /whatsapp/retry { logId? } — retry transient failures only.
exports.retryWhatsAppFailed = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Select a company workspace first.' });
    const result = await whatsapp.retry.retryFailed(companyId, { logId: req.body && req.body.logId });
    // Audit (reuses AuditLog, company-scoped).
    try {
      const uid = req.user && req.user.id;
      if (uid) await prisma.auditLog.create({ data: { userId: uid, action: 'WhatsApp Retry', module: 'Communication', targetId: String(companyId), details: JSON.stringify({ companyId, eventType: 'whatsapp', action: 'Retry', detail: `${result.succeeded}/${result.retried} succeeded`, actor: actorName(req) }) } });
    } catch { /* audit best-effort */ }
    res.json(result);
  } catch (e) { sendError(res, e, 'communication.retryWhatsAppFailed'); }
};

// GET /whatsapp/retry-policy — the (configurable) retry policy.
exports.getWhatsAppRetryPolicy = async (_req, res) => {
  try { res.json(whatsapp.retry.policy()); } catch (e) { sendError(res, e, 'communication.getWhatsAppRetryPolicy'); }
};

// GET /whatsapp/webhook-health — webhook + Meta account health and readiness.
exports.getWhatsAppWebhookHealth = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json({});
    const s = await whatsapp.settings.getOrCreate(companyId);
    const [eventCount, recent] = await Promise.all([
      prisma.whatsAppWebhookEvent.count({ where: { companyId } }),
      prisma.whatsAppWebhookEvent.findMany({ where: { companyId }, orderBy: { id: 'desc' }, take: 10 }),
    ]);
    const checklist = [
      { key: 'connected', label: 'Meta Connected', ok: s.connectionStatus === 'Connected' },
      { key: 'webhook', label: 'Webhook Connected', ok: !!s.webhookVerified },
      { key: 'webhookEvents', label: 'Webhook Receiving Events', ok: !!s.lastWebhookAt },
      { key: 'businessVerified', label: 'Verified Business', ok: !!s.businessVerified },
      { key: 'phoneVerified', label: 'Verified Phone', ok: !!s.phoneVerified },
      { key: 'tokenValid', label: 'Access Token Valid', ok: !!s.tokenValid },
      { key: 'testNumber', label: 'Developer Test Number Configured', ok: !!(s.developerTestNumber && String(s.developerTestNumber).trim()) },
      { key: 'devOff', label: 'Development Mode OFF', ok: !s.developmentMode },
    ];
    res.json({
      health: {
        metaConnected: s.connectionStatus === 'Connected',
        webhookConnected: !!s.webhookVerified,
        webhookReceiving: !!s.lastWebhookAt,
        phoneVerified: !!s.phoneVerified,
        businessVerified: !!s.businessVerified,
        tokenValid: !!s.tokenValid,
        environment: s.environment || 'unconfigured',
        qualityRating: s.qualityRating || null,
        messagingLimitTier: s.messagingLimitTier || null,
        lastSuccessfulApiCall: s.lastSuccessAt || s.lastConnectedAt || null,
        lastWebhookAt: s.lastWebhookAt || null,
        webhookFailureReason: s.webhookFailureReason || null,
        webhookUrl: s.webhookUrl || null,
      },
      checklist,
      productionReady: checklist.every((c) => c.ok),
      webhookEventCount: eventCount,
      recentEvents: recent,
    });
  } catch (e) { sendError(res, e, 'communication.getWhatsAppWebhookHealth'); }
};

// GET /whatsapp/queue-monitor — queue status buckets + worker status.
exports.getWhatsAppQueueMonitor = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json({ buckets: {}, total: 0 });
    const rows = await prisma.whatsAppQueue.findMany({ where: { companyId }, select: { status: true, attempts: true, createdAt: true } });
    const buckets = { Pending: 0, Processing: 0, Retrying: 0, Completed: 0, Failed: 0, Cancelled: 0 };
    for (const r of rows) {
      if (r.status === 'Sent') buckets.Completed++;
      else if (r.status === 'Failed' && (r.attempts || 0) > 0 && (r.attempts || 0) < whatsapp.retry.MAX_ATTEMPTS) buckets.Retrying++;
      else if (buckets[r.status] !== undefined) buckets[r.status]++;
      else buckets.Pending++;
    }
    res.json({
      buckets,
      total: rows.length,
      // No autonomous drain worker runs; delivery is driven by automation runs +
      // the manual retry endpoint, so the "worker" is event-driven, not a daemon.
      worker: { mode: 'event-driven', status: 'Ready', note: 'Sends occur on automation-rule execution; transient failures via the Retry engine.' },
      estimatedProcessingMs: rows.filter((r) => ['Pending', 'Processing'].includes(r.status)).length * 400,
    });
  } catch (e) { sendError(res, e, 'communication.getWhatsAppQueueMonitor'); }
};
