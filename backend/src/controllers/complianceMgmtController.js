// Compliance Management — the statutory FILING calendar / due-date tracker.
// Complements the report engine (/api/compliance-reports) and the registration
// tracker (ComplianceRecord). Read-only w.r.t. payroll/statutory math.
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { generateCalendar, statutoryAmountFor, MONTHS } = require('../services/complianceCalendar');
const { canView, canEdit, canManage, actorOf, targetCompanyId, scopedWhere } = require('../utils/complianceScope');

const CATEGORIES = ['PF', 'ESI', 'PT', 'TDS', 'GST', 'LWF', 'Bonus', 'Gratuity', 'Factory Act', 'Labour License', 'Custom'];

async function resolveCompany(companyId) {
  if (!companyId) return null;
  let c = await prisma.company.findUnique({ where: { id: Number(companyId) } });
  if (c && c.parentCompanyId) c = await prisma.company.findUnique({ where: { id: c.parentCompanyId } }) || c;
  if (!c) { const b = await prisma.branch.findUnique({ where: { id: Number(companyId) } }).catch(() => null); if (b) c = await prisma.company.findUnique({ where: { id: b.companyId } }); }
  return c;
}
async function logAction(companyId, filingId, action, extra = {}) {
  try { await prisma.complianceFilingAudit.create({ data: { companyId: Number(companyId), filingId: filingId ? Number(filingId) : null, action, ...extra } }); } catch (_) {}
}

// ── Dashboard (auto-generates the calendar first) ────────────────────────────
exports.dashboard = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const cid = targetCompanyId(req);
    const company = await resolveCompany(cid);
    if (company) await generateCalendar(prisma, company, { actor: actorOf(req) }).catch(() => {});

    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    const filings = await prisma.complianceFiling.findMany({ where });

    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const pending = filings.filter((f) => f.status === 'Pending' || f.status === 'Overdue');
    const upcoming = pending.filter((f) => f.dueDate >= today && f.dueDate <= in30);
    const overdue = filings.filter((f) => f.status === 'Overdue');

    // Per-category pending counts + amounts (drives the category cards).
    const byCategory = {};
    for (const c of CATEGORIES) byCategory[c] = { pending: 0, amount: 0 };
    for (const f of pending) { (byCategory[f.category] ||= { pending: 0, amount: 0 }).pending++; byCategory[f.category].amount += f.amount || 0; }

    res.json({
      kpis: {
        upcoming: upcoming.length,
        overdue: overdue.length,
        pendingTotal: pending.length,
        filedTotal: filings.filter((f) => f.status === 'Filed').length,
        pendingAmount: Math.round(pending.reduce((s, f) => s + (f.amount || 0), 0)),
      },
      byCategory,
      upcoming: upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8),
      recentOverdue: overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── List (filters) ───────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    const where = { ...base };
    if (req.query.category) where.category = req.query.category;
    if (req.query.status) where.status = req.query.status;
    if (req.query.year) where.periodYear = idParam(req.query.year);
    const filings = await prisma.complianceFiling.findMany({ where, orderBy: [{ dueDate: 'asc' }] });
    // Never ship the (potentially huge) base64 challan in the list.
    res.json({ filings: filings.map(({ challanFileData, ...f }) => ({ ...f, hasChallan: !!challanFileData })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Single filing (with challan) ─────────────────────────────────────────────
exports.get = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const f = await prisma.complianceFiling.findUnique({ where: { id: idParam(req.params.id) } });
    if (!f) return res.status(404).json({ error: 'Filing not found.' });
    res.json(f);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Create custom / update filing ────────────────────────────────────────────
exports.save = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = req.params.id ? idParam(req.params.id) : null;
    const b = req.body;

    if (!id) {
      const companyId = targetCompanyId(req, b.companyId);
      if (!companyId) return res.status(400).json({ error: 'Company context required.' });
      if (!b.title || !b.category) return res.status(400).json({ error: 'Title and category are required.' });
      const periodYear = Number(b.periodYear) || new Date().getFullYear();
      const periodMonth = Number(b.periodMonth) || 0;
      const dupe = await prisma.complianceFiling.findFirst({ where: { companyId, category: b.category, periodMonth, periodYear } });
      if (dupe) return res.status(409).json({ error: 'A filing for this category & period already exists.' });
      const created = await prisma.complianceFiling.create({ data: {
        companyId, category: b.category, title: b.title, frequency: b.frequency || 'One-Time',
        periodLabel: b.periodLabel || `${MONTHS[(periodMonth || 1) - 1]} ${periodYear}`, periodMonth, periodYear,
        dueDate: b.dueDate || `${periodYear}-12-31`, amount: Number(b.amount) || 0,
        reminderDays: Number(b.reminderDays) || 7, assignedTo: b.assignedTo || null, remarks: b.remarks || null,
        autoGenerated: false, createdBy: actorOf(req), status: 'Pending',
      } });
      await logAction(companyId, created.id, 'CREATED', { performedBy: actorOf(req), details: `${b.category} ${created.periodLabel}` });
      return res.status(201).json(created);
    }

    const existing = await prisma.complianceFiling.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Filing not found.' });
    const data = {};
    for (const f of ['title', 'dueDate', 'filedDate', 'referenceNumber', 'assignedTo', 'remarks', 'periodLabel']) if (b[f] !== undefined) data[f] = b[f];
    if (b.amount !== undefined) data.amount = Number(b.amount) || 0;
    if (b.reminderDays !== undefined) data.reminderDays = Number(b.reminderDays) || 7;
    const updated = await prisma.complianceFiling.update({ where: { id }, data });
    await logAction(existing.companyId, id, 'UPDATED', { performedBy: actorOf(req) });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Status: file / waive / reopen ────────────────────────────────────────────
exports.setStatus = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = idParam(req.params.id);
    const f = await prisma.complianceFiling.findUnique({ where: { id } });
    if (!f) return res.status(404).json({ error: 'Filing not found.' });
    const action = String(req.body.action || '').toLowerCase();
    let data = {};
    if (action === 'file') data = { status: 'Filed', filedDate: req.body.filedDate || new Date().toISOString().slice(0, 10), referenceNumber: req.body.referenceNumber || f.referenceNumber, amount: req.body.amount !== undefined ? Number(req.body.amount) : f.amount };
    else if (action === 'waive') { if (!canManage(req)) return res.status(403).json({ error: 'Only Company Head/Finance can waive.' }); data = { status: 'Waived' }; }
    else if (action === 'reopen') data = { status: f.dueDate < new Date().toISOString().slice(0, 10) ? 'Overdue' : 'Pending', filedDate: null };
    else return res.status(400).json({ error: 'Unknown action.' });
    const updated = await prisma.complianceFiling.update({ where: { id }, data });
    await logAction(f.companyId, id, action.toUpperCase(), { performedBy: actorOf(req), details: data.referenceNumber || null });
    res.json({ ...updated, challanFileData: undefined });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Upload challan document (versioned) ──────────────────────────────────────
exports.uploadChallan = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = idParam(req.params.id);
    const f = await prisma.complianceFiling.findUnique({ where: { id } });
    if (!f) return res.status(404).json({ error: 'Filing not found.' });
    const { fileData, fileName, mimeType } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No file supplied.' });
    const history = Array.isArray(f.versionHistory) ? f.versionHistory : [];
    if (f.challanFileName) history.unshift({ fileName: f.challanFileName, uploadedAt: new Date().toISOString(), by: actorOf(req) });
    const updated = await prisma.complianceFiling.update({ where: { id }, data: {
      challanFileData: fileData, challanFileName: fileName || 'challan', challanMimeType: mimeType || 'application/octet-stream',
      versionHistory: history.slice(0, 20),
    } });
    await logAction(f.companyId, id, 'CHALLAN_UPLOADED', { performedBy: actorOf(req), details: fileName });
    res.json({ ...updated, challanFileData: undefined });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Delete (manage) ──────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Not authorised to delete filings.' });
    const id = idParam(req.params.id);
    const f = await prisma.complianceFiling.findUnique({ where: { id } });
    if (!f) return res.status(404).json({ error: 'Filing not found.' });
    await prisma.complianceFiling.delete({ where: { id } });
    await logAction(f.companyId, null, 'DELETED', { performedBy: actorOf(req), details: `${f.category} ${f.periodLabel}` });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Regenerate the calendar (wider window) ───────────────────────────────────
exports.regenerate = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const company = await resolveCompany(targetCompanyId(req));
    if (!company) return res.status(400).json({ error: 'Company context required.' });
    const out = await generateCalendar(prisma, company, { monthsBack: 6, monthsAhead: 6, actor: actorOf(req) });
    await logAction(company.id, null, 'GENERATED', { performedBy: actorOf(req), details: `${out.created} filing(s)` });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Run reminders now (manual trigger of the scheduler's compliance pass) ────
exports.runReminders = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const company = await resolveCompany(targetCompanyId(req));
    if (company) await generateCalendar(prisma, company, { actor: actorOf(req) }).catch(() => {});
    const out = await require('../services/reminderScheduler').runComplianceReminders();
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Categories + registration summary (reuses ComplianceRecord) ──────────────
exports.categories = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    let registrations = [];
    try { registrations = await prisma.complianceRecord.findMany({ where, select: { category: true, name: true, status: true, expiryDate: true } }); } catch (_) {}
    res.json({ categories: CATEGORIES, registrations });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
