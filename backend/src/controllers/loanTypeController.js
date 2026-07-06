// Loan Types — the categories a loan can be created under. Ships with a seeded
// set of enterprise defaults per company; admins can add unlimited custom types.
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { canView, canEdit, canManage, actorOf, targetCompanyId, scopedWhere } = require('../utils/loanScope');

// Enterprise default loan categories (seeded once per company).
const SYSTEM_TYPES = [
  { name: 'Salary Advance', code: 'ADV', defaultInterestType: 'None', defaultInterestRate: 0 },
  { name: 'Personal Loan', code: 'PL', defaultInterestType: 'Flat', defaultInterestRate: 10 },
  { name: 'Emergency Loan', code: 'EMG', defaultInterestType: 'None', defaultInterestRate: 0 },
  { name: 'Festival Loan', code: 'FEST', defaultInterestType: 'Flat', defaultInterestRate: 5 },
  { name: 'Education Loan', code: 'EDU', defaultInterestType: 'Reducing', defaultInterestRate: 8 },
  { name: 'Medical Loan', code: 'MED', defaultInterestType: 'None', defaultInterestRate: 0 },
  { name: 'Housing Loan', code: 'HOUSE', defaultInterestType: 'Reducing', defaultInterestRate: 8.5 },
  { name: 'Vehicle Loan', code: 'VEH', defaultInterestType: 'Reducing', defaultInterestRate: 9 },
  { name: 'Company Welfare Loan', code: 'WELF', defaultInterestType: 'Flat', defaultInterestRate: 4 },
];

// Idempotently seed the defaults for a company that has none yet.
async function ensureSeeded(companyId) {
  const cid = Number(companyId);
  if (!cid) return;
  const count = await prisma.loanType.count({ where: { companyId: cid } });
  if (count > 0) return;
  await prisma.loanType.createMany({
    data: SYSTEM_TYPES.map((t, i) => ({ ...t, companyId: cid, isSystem: true, displayOrder: i })),
    skipDuplicates: true,
  });
}

exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'Not authorised.' });
    const where = scopedWhere(req);
    if (where === null) return res.status(403).json({ error: 'Unauthorised workspace.' });
    const cid = targetCompanyId(req);
    if (cid) await ensureSeeded(cid);
    const types = await prisma.loanType.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] });
    res.json(types);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised to create loan types.' });
    const companyId = targetCompanyId(req, req.body.companyId);
    if (!companyId) return res.status(400).json({ error: 'Company context required.' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Loan type name is required.' });
    const dupe = await prisma.loanType.findFirst({ where: { companyId, name } });
    if (dupe) return res.status(409).json({ error: 'A loan type with this name already exists.' });
    const t = await prisma.loanType.create({
      data: {
        companyId, name,
        code: req.body.code || null,
        description: req.body.description || null,
        defaultInterestType: req.body.defaultInterestType || 'Flat',
        defaultInterestRate: Number(req.body.defaultInterestRate) || 0,
        maxAmount: Number(req.body.maxAmount) || 0,
        maxTenureMonths: Number(req.body.maxTenureMonths) || 0,
        requiresApproval: req.body.requiresApproval !== false,
        active: req.body.active !== false,
        isSystem: false,
        createdBy: actorOf(req),
      },
    });
    res.status(201).json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try {
    if (!canEdit(req)) return res.status(403).json({ error: 'Not authorised.' });
    const id = idParam(req.params.id);
    const existing = await prisma.loanType.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Loan type not found.' });
    const cid = targetCompanyId(req);
    if (cid && existing.companyId !== cid) return res.status(403).json({ error: 'Not your company.' });
    const data = {};
    for (const f of ['name', 'code', 'description', 'defaultInterestType']) if (req.body[f] !== undefined) data[f] = req.body[f];
    for (const f of ['defaultInterestRate', 'maxAmount', 'maxTenureMonths']) if (req.body[f] !== undefined) data[f] = Number(req.body[f]) || 0;
    if (req.body.active !== undefined) data.active = !!req.body.active;
    if (req.body.requiresApproval !== undefined) data.requiresApproval = !!req.body.requiresApproval;
    if (data.name) {
      const dupe = await prisma.loanType.findFirst({ where: { companyId: existing.companyId, name: data.name, NOT: { id } } });
      if (dupe) return res.status(409).json({ error: 'A loan type with this name already exists.' });
    }
    const t = await prisma.loanType.update({ where: { id }, data });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Not authorised to delete loan types.' });
    const id = idParam(req.params.id);
    const existing = await prisma.loanType.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Loan type not found.' });
    // In-use protection — archive instead of hard-delete when loans reference it.
    const inUse = await prisma.loan.count({ where: { loanTypeId: id } });
    if (inUse > 0) {
      await prisma.loanType.update({ where: { id }, data: { active: false } });
      return res.status(409).json({ error: `In use by ${inUse} loan(s) — deactivated instead of deleted.`, deactivated: true });
    }
    await prisma.loanType.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

module.exports.ensureSeeded = ensureSeeded;
module.exports.SYSTEM_TYPES = SYSTEM_TYPES;
