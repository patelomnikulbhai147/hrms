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
      prisma.communicationDeliveryLog.count({ where: { companyId, status: 'Sent', createdAt: { gte: new Date(today) } } }),
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

    res.json({ totalTemplates, scheduledMessages: scheduled, sentToday, upcomingBirthdays, upcomingAnniversaries, festivalTemplates, announcements, draftMessages: draftTemplates, upcomingHolidays, totalHolidays });
  } catch (e) { sendError(res, e, 'communication.getDashboard'); }
};
function emptyDashboard() {
  return { totalTemplates: 0, scheduledMessages: 0, sentToday: 0, upcomingBirthdays: 0, upcomingAnniversaries: 0, festivalTemplates: 0, announcements: 0, draftMessages: 0, upcomingHolidays: 0, totalHolidays: 0 };
}

// ── Templates ─────────────────────────────────────────────────────────────────
const TEMPLATE_FIELDS = ['title', 'category', 'subject', 'body', 'status', 'backgroundImage', 'companyLogo',
  'employeePhotoPlaceholder', 'placeholders', 'layout', 'festivalName', 'festivalDate'];
function pickTemplate(body) {
  const data = {};
  for (const f of TEMPLATE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (data.employeePhotoPlaceholder !== undefined) data.employeePhotoPlaceholder = !!data.employeePhotoPlaceholder;
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

// ── Delivery logs (read-only — empty in Phase 1, no sending happens) ───────────
exports.listDeliveryLogs = async (req, res) => {
  try {
    const companyId = await resolveCompanyId(req);
    if (!companyId) return res.json([]);
    res.json(await prisma.communicationDeliveryLog.findMany({ where: { companyId }, orderBy: { id: 'desc' }, take: 200 }));
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
