/**
 * Employee duplicate detection — the single source of truth for "is this the
 * same person already on file".
 *
 * A duplicate is any existing employee that matches the incoming record on:
 *   - employeeId (the unique code)                     — hard DB constraint too
 *   - same Company + Branch + normalized Name
 *   - same Email (real address, not a placeholder)
 *   - same Mobile number — but ONLY when the name tokens also match (see below)
 *
 * Why mobile is corroborating-only: this roster contains different employees
 * who legitimately share a contact number (e.g. spouses/siblings — PATANI VISHAL
 * & PATANI DIPALIBEN, or two numbers crammed into one field). Treating mobile as
 * a standalone key would wrongly merge them. So a phone match counts only when
 * the two names share the same token set (order-independent), which still
 * catches a re-imported person whose name words were reordered, without merging
 * two distinct people who share a phone.
 *
 * Used by createEmployee (reject) and bulkCreate/import (route to update
 * instead of inserting a second row) so imports can never create duplicates.
 */

const norm = (s) => String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, ' ');

// Mobile numbers may arrive with spaces, +91, or two numbers joined by a comma /
// newline. Reduce to the last 10 digits of the FIRST number for a stable key.
const normPhone = (s) => {
  const first = String(s == null ? '' : s).split(/[,\n\r/;]+/)[0];
  const digits = first.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};

const normEmail = (s) => {
  const v = String(s == null ? '' : s).trim().toLowerCase();
  if (!v || v === '-' || v.includes('placeholder') || v.endsWith('@example.com') || v.endsWith('@noemail.local')) return '';
  return v;
};

const nameKey = (companyId, branchId, name) =>
  `${companyId ?? ''}|${branchId ?? ''}|${norm(name)}`;

// Order-independent set of name words, e.g. "MEHTA NEHA" -> "MEHTA|NEHA".
const tokenSet = (name) =>
  Array.from(new Set(norm(name).split(' ').filter(Boolean))).sort().join('|');
const sameTokenSet = (a, b) => {
  const ta = tokenSet(a), tb = tokenSet(b);
  return !!ta && ta === tb;
};

/**
 * Build fast lookup indexes from a list of existing employees. Pass this to
 * matchAgainstIndex() to avoid re-querying per row during a bulk import.
 */
function buildIndex(employees) {
  const byCode = new Map();
  const byName = new Map();
  const byPhone = new Map();
  const byEmail = new Map();
  for (const e of employees) {
    if (e.employeeId) byCode.set(norm(e.employeeId), e);
    if (norm(e.name) && norm(e.name) !== '-') byName.set(nameKey(e.companyId, e.branchId, e.name), e);
    const ph = normPhone(e.phone);
    if (ph) byPhone.set(ph, e);
    const em = normEmail(e.email);
    if (em) byEmail.set(em, e);
  }
  return { byCode, byName, byPhone, byEmail };
}

/**
 * Return the existing employee that `data` duplicates (and the field that
 * matched), or null. `index` comes from buildIndex(); `excludeId` skips a row
 * when validating an update against itself.
 */
function matchAgainstIndex(data, index, excludeId = null) {
  const tryHit = (hit, field) =>
    hit && hit.id !== excludeId ? { match: hit, field } : null;

  const code = norm(data.employeeId);
  if (code && code !== norm('[ Auto Generated ]')) {
    const r = tryHit(index.byCode.get(code), 'employeeCode');
    if (r) return r;
  }
  if (norm(data.name) && norm(data.name) !== '-') {
    const r = tryHit(index.byName.get(nameKey(data.companyId, data.branchId, data.name)), 'company+branch+name');
    if (r) return r;
  }
  const ph = normPhone(data.phone);
  if (ph) {
    const hit = index.byPhone.get(ph);
    // Corroborating-only: a phone match is a duplicate solely when the names are
    // the same set of words (guards against shared family numbers).
    if (hit && hit.id !== excludeId && sameTokenSet(hit.name, data.name)) {
      return { match: hit, field: 'mobile+name' };
    }
  }
  const em = normEmail(data.email);
  if (em) {
    const r = tryHit(index.byEmail.get(em), 'email');
    if (r) return r;
  }
  return null;
}

/**
 * One-off duplicate check straight against the database (used by single-record
 * createEmployee). Returns { match, field } or null.
 */
async function findDuplicate(prisma, data, excludeId = null) {
  const all = await prisma.employee.findMany({
    select: { id: true, employeeId: true, companyId: true, branchId: true, name: true, phone: true, email: true },
  });
  return matchAgainstIndex(data, buildIndex(all), excludeId);
}

module.exports = { norm, normPhone, normEmail, nameKey, buildIndex, matchAgainstIndex, findDuplicate };
