/**
 * Normalise a company/branch id arriving from a request (query param, header,
 * or JSON body) into the numeric type the DB now uses. Numeric strings ("1")
 * become numbers (1); empty/blank becomes undefined; anything non-numeric is
 * left as-is (defensive, for any legacy value).
 */
function idParam(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

// Coerce companyId/branchId fields on a create/update payload to numbers.
function coerceEntityIds(data) {
  if (!data || typeof data !== 'object') return data;
  if (data.companyId !== undefined && data.companyId !== null && data.companyId !== '') {
    const n = Number(data.companyId);
    if (Number.isFinite(n)) data.companyId = n;
  } else if (data.companyId === '') {
    delete data.companyId;
  }
  if (data.branchId !== undefined) {
    if (data.branchId === '' || data.branchId === null) data.branchId = null;
    else { const n = Number(data.branchId); if (Number.isFinite(n)) data.branchId = n; }
  }
  if (data.parentCompanyId !== undefined && data.parentCompanyId !== null && data.parentCompanyId !== '') {
    const n = Number(data.parentCompanyId);
    if (Number.isFinite(n)) data.parentCompanyId = n;
  }
  return data;
}

module.exports = idParam;
module.exports.idParam = idParam;
module.exports.coerceEntityIds = coerceEntityIds;
