/**
 * Professional, branch-wise employee code generation.
 *
 *   Format:  <COMPANY_PREFIX>-<BRANCH_CODE>-<NNNN>
 *   Example: VE-AHMD-0001   (Vishv Enterprise, Ahmedabad branch, #1)
 *
 * - Company prefix: Branch/Company-driven (Vishv Enterprise = "VE").
 * - Branch code:    taken from Branch.branchCode (AHMD, BHAV, RJKT, SIDD…).
 * - Sequence:       zero-padded, continues from the current max for that branch,
 *                   never skips, never duplicates.
 */
const prisma = require('../config/prisma');

const SEQ_PAD = 4;

// Explicit company-id -> prefix overrides; otherwise derive from the name.
// Keyed by the numeric Company.id (1 = Vishv Enterprise, 2 = HealthPlus LLC).
const COMPANY_PREFIX = {
  1: 'VE',     // Vishv Enterprise
  2: 'HP',     // HealthPlus LLC
};

// Derive a short uppercase prefix from a company name (initials of first 2 words).
function derivePrefixFromName(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'CO';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function companyPrefix(company) {
  if (!company) return 'CO';
  return COMPANY_PREFIX[company.id] || derivePrefixFromName(company.name);
}

// Build a fallback branch code from a branch name when branchCode is empty.
function deriveBranchCode(branchName = '') {
  const cleaned = String(branchName).replace(/[^a-zA-Z]/g, '').toUpperCase();
  return cleaned.slice(0, 4) || 'HQ';
}

function pad(n) {
  return String(n).padStart(SEQ_PAD, '0');
}

function buildCode(prefix, branchCode, seq) {
  return `${prefix}-${branchCode}-${pad(seq)}`;
}

// Parse the numeric sequence out of a code that matches a given prefix+branch.
function parseSeq(code, prefix, branchCode) {
  const re = new RegExp(`^${prefix}-${branchCode}-(\\d+)$`, 'i');
  const m = re.exec(String(code || ''));
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Resolve the company prefix + branch code for a given branchId.
 * Returns { prefix, branchCode, company, branch } or throws if branch missing.
 */
async function resolveCodeParts(branchId, companyIdFallback) {
  let branch = null;
  if (branchId) branch = await prisma.branch.findUnique({ where: { id: branchId } });
  const companyId = branch ? branch.companyId : companyIdFallback;
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  const prefix = companyPrefix(company);
  const branchCode = branch
    ? (branch.branchCode && branch.branchCode.trim() ? branch.branchCode.trim().toUpperCase() : deriveBranchCode(branch.branchName))
    : 'HQ'; // unbranched employees
  return { prefix, branchCode, company, branch };
}

/**
 * Compute the highest existing sequence for a (prefix, branchCode) pair by
 * scanning current employee codes. Branch-scoped so each branch counts alone.
 */
async function currentMaxSeq(prefix, branchCode, branchId) {
  const where = branchId ? { branchId } : {};
  const rows = await prisma.employee.findMany({ where, select: { employeeId: true } });
  let max = 0;
  for (const r of rows) {
    const seq = parseSeq(r.employeeId, prefix, branchCode);
    if (seq && seq > max) max = seq;
  }
  return max;
}

/**
 * Generate the next unique employee code for a branch.
 * Guards against duplicates by re-checking the DB and incrementing.
 */
async function generateEmployeeCode(branchId, companyIdFallback) {
  const { prefix, branchCode } = await resolveCodeParts(branchId, companyIdFallback);
  let seq = (await currentMaxSeq(prefix, branchCode, branchId)) + 1;
  // ensure global uniqueness on employeeId
  // (branch scoping already isolates sequences; this is a safety net)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const code = buildCode(prefix, branchCode, seq);
    const exists = await prisma.employee.findUnique({ where: { employeeId: code } });
    if (!exists) return code;
    seq++;
  }
}

/**
 * Generate the next unique TEMPORARY employee code for a company.
 *   Format:  <COMPANY_PREFIX>-TEMP-<NNNNNN>   e.g.  VE-TEMP-000001
 * Sequence is per-company (scanned from the TemporaryEmployee table), zero-padded
 * to 6 digits, never duplicates. Fully isolated from the real employee sequence.
 */
const TEMP_PAD = 6;
async function generateTempCode(companyId) {
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  const prefix = companyPrefix(company);
  const rows = await prisma.temporaryEmployee.findMany({ where: { companyId }, select: { tempEmployeeId: true } });
  const re = new RegExp(`^${prefix}-TEMP-(\\d+)$`, 'i');
  let max = 0;
  for (const r of rows) { const m = re.exec(String(r.tempEmployeeId || '')); if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; } }
  let seq = max + 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const code = `${prefix}-TEMP-${String(seq).padStart(TEMP_PAD, '0')}`;
    const exists = await prisma.temporaryEmployee.findUnique({ where: { tempEmployeeId: code } });
    if (!exists) return code;
    seq++;
  }
}

/**
 * Validate a user-supplied custom code: non-empty, reasonable charset, unique.
 * Returns { ok, code, error }.
 */
async function validateCustomCode(rawCode, excludeEmployeeId) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Custom employee code cannot be empty.' };
  if (!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(code)) {
    return { ok: false, error: 'Code must be 2–30 chars: letters, digits and hyphens only.' };
  }
  const existing = await prisma.employee.findUnique({ where: { employeeId: code } });
  if (existing && existing.id !== excludeEmployeeId) {
    return { ok: false, error: `Employee code "${code}" already exists.` };
  }
  return { ok: true, code };
}

module.exports = {
  SEQ_PAD,
  companyPrefix,
  deriveBranchCode,
  buildCode,
  parseSeq,
  resolveCodeParts,
  currentMaxSeq,
  generateEmployeeCode,
  generateTempCode,
  validateCustomCode,
};
