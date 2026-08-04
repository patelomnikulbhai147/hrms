/**
 * Payroll Component Builder — full CRUD for the payroll component master.
 *
 * Components (Allowance / Deduction / Reimbursement / Bonus / Incentive /
 * Employer Contribution / Loan / Recovery / Custom) with taxability, statutory
 * impact, calculation/formula config, effective dating and lifecycle status.
 * Company-scoped (RULE 5) and role-gated:
 *   - Super Admin  : any company (names it / masquerades via x-workspace-id)
 *   - Company Head : their own company (full CRUD)
 *   - HR           : view only
 * Every mutation is recorded in payroll_component_audits (immutable history).
 * Hard-delete is blocked once a component has been used by payroll (usageCount>0)
 * — archive/deactivate instead.
 */
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');

const canView = (req) => ['Super Admin', 'Company Head', 'HR'].includes(req.user?.role);
const canManage = (req) => ['Super Admin', 'Company Head'].includes(req.user?.role);
const actorOf = (req) => req.user?.name || req.user?.email || 'System';

// Workspace authorisation is delegated to the shared, BRANCH-AWARE resolver.
// The previous private helper compared the workspace id against
// accessibleCompanyIds only, which never contains branch ids — so every branch
// workspace was refused with "Unauthorized to view this workspace."
const { isSuperAdmin, scopedCompanyWhere, targetCompanyId } = require('../utils/workspaceScope');

// Company-scoped WHERE for reads (null → unauthorised workspace).
const scopedWhere = (req) => scopedCompanyWhere(req);

// ── Enumerations (validated server-side so no bad value can be persisted) ──────
const TYPES = ['Allowance', 'Deduction', 'Reimbursement', 'Bonus', 'Incentive', 'Employer Contribution', 'Loan', 'Recovery', 'Custom'];
const CATEGORIES = ['Fixed', 'Variable', 'Attendance Based', 'Performance Based', 'Formula Based', 'Manual Entry'];
const METHODS = ['Fixed Amount', 'Percentage of Basic', 'Percentage of Gross', 'Formula Builder', 'Manual'];
const TAXABLE = ['Taxable', 'Non-Taxable', 'Partially Taxable'];
const STATUSES = ['Active', 'Inactive', 'Archived'];

// Reserved formula tokens (system salary variables) — never treated as component refs.
const RESERVED = new Set(['BASIC', 'GROSS', 'CTC', 'NET', 'HRA', 'DA', 'PF', 'ESIC', 'PT', 'LWF', 'TDS', 'GROSSSALARY', 'BASICSALARY', 'NETSALARY']);

const isUsed = (c) => (c?.usageCount || 0) > 0;

// ── Formula validation ────────────────────────────────────────────────────────
// Balanced parentheses + allowed characters + reference extraction. References are
// UPPERCASE alnum/underscore tokens that aren't reserved variables or numbers.
function tokenizeRefs(formula) {
  const up = String(formula || '').toUpperCase();
  const tokens = up.match(/[A-Z_][A-Z0-9_]*/g) || [];
  return [...new Set(tokens.filter((t) => !RESERVED.has(t)))];
}
function validateFormulaSyntax(formula) {
  const f = String(formula || '').trim();
  if (!f) return { ok: false, error: 'Formula is empty. Enter an expression or choose a different calculation method.' };
  if (!/^[A-Za-z0-9_+\-*/().%\s]+$/.test(f)) return { ok: false, error: 'Formula contains invalid characters. Allowed: letters, numbers, _ and + - * / ( ) . %' };
  let depth = 0;
  for (const ch of f) { if (ch === '(') depth++; else if (ch === ')') { depth--; if (depth < 0) return { ok: false, error: 'Unbalanced parentheses in the formula.' }; } }
  if (depth !== 0) return { ok: false, error: 'Unbalanced parentheses in the formula.' };
  if (/[+\-*/%]\s*[)]/.test(f) || /[(]\s*[*/%]/.test(f) || /[+\-*/%]\s*$/.test(f)) return { ok: false, error: 'The formula ends with or misplaces an operator.' };
  return { ok: true };
}
// Detect a circular reference: build the reference graph of every Formula-Builder
// component (keyed by shortCode/name), overlay the component being saved, then DFS
// from it. A cycle back to itself (direct or transitive) → circular.
function detectCircular(self, formula, allComponents) {
  const keyOf = (c) => [String(c.shortCode || '').toUpperCase(), String(c.componentName || '').toUpperCase()].filter(Boolean);
  const graph = new Map(); // token → Set(referenced tokens)
  const register = (keys, refs) => keys.forEach((k) => { if (k) graph.set(k, new Set(refs)); });
  for (const c of allComponents) {
    if (c.id === self.id) continue;
    if (c.calculationMethod === 'Formula Builder' && c.formula) register(keyOf(c), tokenizeRefs(c.formula));
  }
  const selfKeys = keyOf(self);
  register(selfKeys, tokenizeRefs(formula));
  // DFS from each of the component's own keys looking for a path back to itself.
  const selfSet = new Set(selfKeys);
  const seen = new Set();
  const stack = [...tokenizeRefs(formula)];
  while (stack.length) {
    const t = stack.pop();
    if (selfSet.has(t)) return { circular: true, token: t };
    if (seen.has(t)) continue;
    seen.add(t);
    const next = graph.get(t);
    if (next) stack.push(...next);
  }
  return { circular: false };
}

// Full validation of an incoming component payload. `existing` is the current row
// on update (to exclude self from the duplicate check).
async function validate(companyId, body, existing = null) {
  const name = String(body.componentName || '').trim();
  if (!name) return 'Component Name is required.';
  if (name.length > 120) return 'Component Name is too long (max 120 characters).';
  if (body.componentType && !TYPES.includes(body.componentType)) return `Invalid Component Type. Choose one of: ${TYPES.join(', ')}.`;
  if (body.payrollCategory && !CATEGORIES.includes(body.payrollCategory)) return 'Invalid Payroll Category.';
  if (body.calculationMethod && !METHODS.includes(body.calculationMethod)) return 'Invalid Calculation Method.';
  if (body.taxable && !TAXABLE.includes(body.taxable)) return 'Invalid Tax Configuration.';
  if (body.status && !STATUSES.includes(body.status)) return 'Invalid Status.';

  // Duplicate name within the company (case-insensitive), excluding self.
  const clash = await prisma.payrollComponent.findFirst({
    where: { companyId, componentName: name, NOT: existing ? { id: existing.id } : undefined },
    select: { id: true },
  });
  if (clash) return `A component named "${name}" already exists in this company. Names must be unique.`;

  const method = body.calculationMethod || existing?.calculationMethod || 'Fixed Amount';
  if (method === 'Fixed Amount') {
    const amt = body.amount != null ? Number(body.amount) : (existing?.amount ?? 0);
    if (!Number.isFinite(amt)) return 'Fixed Amount must be a number.';
    // Negative fixed amounts are only meaningful for Deduction/Recovery/Loan lines.
    const type = body.componentType || existing?.componentType;
    const allowsNegative = ['Deduction', 'Recovery', 'Loan'].includes(type);
    if (amt < 0 && !allowsNegative) return `A ${type || 'this'} component cannot have a negative Fixed Amount.`;
  }
  if (method === 'Percentage of Basic' || method === 'Percentage of Gross') {
    const pct = body.percentage != null ? Number(body.percentage) : (existing?.percentage ?? 0);
    if (!Number.isFinite(pct) || pct < 0) return 'Percentage must be a non-negative number.';
    if (pct > 1000) return 'Percentage looks too large (max 1000%).';
  }
  if (method === 'Formula Builder') {
    const formula = body.formula != null ? body.formula : existing?.formula;
    const syn = validateFormulaSyntax(formula);
    if (!syn.ok) return syn.error;
    const all = await prisma.payrollComponent.findMany({ where: { companyId }, select: { id: true, componentName: true, shortCode: true, calculationMethod: true, formula: true } });
    const self = { id: existing?.id ?? -1, componentName: name, shortCode: body.shortCode ?? existing?.shortCode };
    const cyc = detectCircular(self, formula, all);
    if (cyc.circular) return `Circular formula reference detected (via "${cyc.token}"). A component's formula cannot depend on itself.`;
  }
  if ((body.taxable || existing?.taxable) === 'Partially Taxable') {
    const tp = body.taxablePercent != null ? Number(body.taxablePercent) : (existing?.taxablePercent ?? 0);
    if (!Number.isFinite(tp) || tp < 0 || tp > 100) return 'Taxable % (for Partially Taxable) must be between 0 and 100.';
  }
  return null; // valid
}

// Shape an incoming body into persistable columns (whitelist — no mass-assignment).
function shape(body) {
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
  const str = (v) => (v == null || v === '' ? null : String(v).trim());
  const out = {
    componentName: String(body.componentName || '').trim(),
    displayName: str(body.displayName),
    shortCode: str(body.shortCode),
    description: str(body.description),
    componentType: TYPES.includes(body.componentType) ? body.componentType : 'Allowance',
    payrollCategory: CATEGORIES.includes(body.payrollCategory) ? body.payrollCategory : 'Fixed',
    calculationMethod: METHODS.includes(body.calculationMethod) ? body.calculationMethod : 'Fixed Amount',
    amount: num(body.amount, 0),
    percentage: num(body.percentage, 0),
    formula: str(body.formula),
    taxable: TAXABLE.includes(body.taxable) ? body.taxable : 'Taxable',
    taxablePercent: num(body.taxablePercent, 0),
    pfApplicable: bool(body.pfApplicable),
    esicApplicable: bool(body.esicApplicable),
    ptApplicable: bool(body.ptApplicable),
    lwfApplicable: bool(body.lwfApplicable),
    tdsApplicable: bool(body.tdsApplicable),
    effectiveFrom: str(body.effectiveFrom),
    effectiveTo: str(body.effectiveTo),
    status: STATUSES.includes(body.status) ? body.status : 'Active',
    displayOrder: num(body.displayOrder, 0),
  };
  return out;
}

// Immutable audit line. `changes` = a compact human/JSON summary.
async function writeAudit(companyId, componentId, action, changedBy, changes = null) {
  await prisma.payrollComponentAudit.create({
    data: { companyId, componentId, action, changedBy, changes: changes ? (typeof changes === 'string' ? changes : JSON.stringify(changes)) : null },
  }).catch(() => {});
}

// Diff two component snapshots → { field: [from, to] } for the audit trail.
function diff(before, after) {
  const out = {};
  const keys = ['componentName', 'displayName', 'shortCode', 'description', 'componentType', 'payrollCategory', 'calculationMethod', 'amount', 'percentage', 'formula', 'taxable', 'taxablePercent', 'pfApplicable', 'esicApplicable', 'ptApplicable', 'lwfApplicable', 'tdsApplicable', 'effectiveFrom', 'effectiveTo', 'status', 'displayOrder'];
  for (const k of keys) { if (before[k] !== after[k]) out[k] = [before[k], after[k]]; }
  return out;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET / — list with search / filter / sort.
exports.list = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission to view payroll components.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorized to view this workspace.' });

    const { q, type, category, status, sortBy = 'displayOrder', sortDir = 'asc' } = req.query;
    const where = { ...base };
    if (type && type !== 'All') where.componentType = type;
    if (category && category !== 'All') where.payrollCategory = category;
    if (status && status !== 'All') where.status = status;
    if (q) where.OR = [{ componentName: { contains: String(q) } }, { displayName: { contains: String(q) } }, { shortCode: { contains: String(q) } }];

    const sortable = ['componentName', 'componentType', 'effectiveFrom', 'displayOrder', 'status', 'updatedAt', 'createdAt'];
    const orderBy = sortable.includes(sortBy) ? [{ [sortBy]: sortDir === 'desc' ? 'desc' : 'asc' }, { id: 'asc' }] : [{ displayOrder: 'asc' }, { id: 'asc' }];

    const items = await prisma.payrollComponent.findMany({ where, orderBy });
    res.json(items.map((c) => ({ ...c, inUse: isUsed(c) })));
  } catch (e) {
    console.error('payrollComponent.list', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /:id — one component + its audit history.
exports.getOne = async (req, res) => {
  try {
    if (!canView(req)) return res.status(403).json({ error: 'You do not have permission.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const item = await prisma.payrollComponent.findFirst({ where: { id, ...base } });
    if (!item) return res.status(404).json({ error: 'Component not found.' });
    const audits = await prisma.payrollComponentAudit.findMany({ where: { componentId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ ...item, inUse: isUsed(item), audits });
  } catch (e) {
    console.error('payrollComponent.getOne', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST / — create.
exports.create = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to create components.' });
    const companyId = targetCompanyId(req, req.body?.companyId);
    if (!companyId) return res.status(400).json({ error: isSuperAdmin(req) ? 'Select a company.' : 'Your account has no company.' });
    const err = await validate(companyId, req.body || {});
    if (err) return res.status(400).json({ error: err });
    const data = shape(req.body || {});
    const created = await prisma.payrollComponent.create({ data: { ...data, companyId, createdBy: actorOf(req), updatedBy: actorOf(req) } });
    await writeAudit(companyId, created.id, 'CREATED', actorOf(req), { componentName: created.componentName, componentType: created.componentType });
    res.status(201).json({ ...created, inUse: false });
  } catch (e) {
    console.error('payrollComponent.create', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// PUT /:id — update (loads existing values, validates, records field-level diff).
exports.update = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to edit components.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.payrollComponent.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Component not found.' });
    if (existing.status === 'Archived') return res.status(400).json({ error: 'This component is archived. Restore it before editing.' });

    const err = await validate(existing.companyId, req.body || {}, existing);
    if (err) return res.status(400).json({ error: err });
    const data = shape({ ...existing, ...req.body });
    const updated = await prisma.payrollComponent.update({ where: { id }, data: { ...data, updatedBy: actorOf(req) } });
    const changes = diff(existing, updated);
    await writeAudit(existing.companyId, id, 'UPDATED', actorOf(req), changes);
    res.json({ ...updated, inUse: isUsed(updated) });
  } catch (e) {
    console.error('payrollComponent.update', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /:id/clone — duplicate as a new editable Draft (…"Copy").
exports.clone = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to clone components.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const src = await prisma.payrollComponent.findFirst({ where: { id, ...base } });
    if (!src) return res.status(404).json({ error: 'Component not found.' });

    // Find a unique "<name> Copy" name.
    let name = `${src.componentName} Copy`;
    let n = 1;
    while (await prisma.payrollComponent.findFirst({ where: { companyId: src.companyId, componentName: name }, select: { id: true } })) {
      n += 1; name = `${src.componentName} Copy ${n}`;
    }
    const { id: _i, createdAt: _c, updatedAt: _u, usageCount: _uc, lastUsedAt: _l, ...rest } = src;
    const clone = await prisma.payrollComponent.create({
      data: { ...rest, componentName: name, shortCode: src.shortCode ? `${src.shortCode}_COPY` : null, status: 'Inactive', usageCount: 0, createdBy: actorOf(req), updatedBy: actorOf(req) },
    });
    await writeAudit(src.companyId, clone.id, 'CLONED', actorOf(req), { from: src.componentName, to: name });
    res.status(201).json({ ...clone, inUse: false });
  } catch (e) {
    console.error('payrollComponent.clone', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// PATCH /:id/status — Activate / Deactivate.
exports.setStatus = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const status = req.body?.status;
    if (!['Active', 'Inactive'].includes(status)) return res.status(400).json({ error: 'Status must be Active or Inactive.' });
    const existing = await prisma.payrollComponent.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Component not found.' });
    const updated = await prisma.payrollComponent.update({ where: { id }, data: { status, updatedBy: actorOf(req) } });
    await writeAudit(existing.companyId, id, status === 'Active' ? 'ACTIVATED' : 'DEACTIVATED', actorOf(req), { status: [existing.status, status] });
    res.json({ ...updated, inUse: isUsed(updated) });
  } catch (e) {
    console.error('payrollComponent.setStatus', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// POST /:id/archive — soft-retire (reversible). The safe alternative to delete.
exports.archive = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.payrollComponent.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Component not found.' });
    const restore = req.body?.restore === true;
    const status = restore ? 'Inactive' : 'Archived';
    const updated = await prisma.payrollComponent.update({ where: { id }, data: { status, updatedBy: actorOf(req) } });
    await writeAudit(existing.companyId, id, restore ? 'ACTIVATED' : 'ARCHIVED', actorOf(req), { status: [existing.status, status] });
    res.json({ ...updated, inUse: isUsed(updated) });
  } catch (e) {
    console.error('payrollComponent.archive', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// DELETE /:id — permanent delete, allowed ONLY when the component has never been
// used by payroll (usageCount === 0). Otherwise 409 with the enterprise warning.
exports.remove = async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'You do not have permission to delete components.' });
    const base = scopedWhere(req);
    if (base === null) return res.status(403).json({ error: 'Unauthorized.' });
    const id = idParam(req.params.id);
    const existing = await prisma.payrollComponent.findFirst({ where: { id, ...base } });
    if (!existing) return res.status(404).json({ error: 'Component not found.' });
    if (isUsed(existing)) {
      return res.status(409).json({
        error: 'This component is already used in payroll records and cannot be permanently deleted.',
        code: 'IN_USE', suggestion: 'Archive or deactivate it instead.',
      });
    }
    await writeAudit(existing.companyId, id, 'DELETED', actorOf(req), { componentName: existing.componentName });
    await prisma.payrollComponent.delete({ where: { id } });
    res.json({ ok: true, deleted: id });
  } catch (e) {
    console.error('payrollComponent.remove', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// GET /meta — the enumerations (drives the drawer dropdowns; no hardcoding in UI).
exports.meta = (_req, res) => res.json({ types: TYPES, categories: CATEGORIES, methods: METHODS, taxable: TAXABLE, statuses: STATUSES });
