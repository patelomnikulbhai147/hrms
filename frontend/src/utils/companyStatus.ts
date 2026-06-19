/**
 * Single source of truth for "is this company archived" on the frontend.
 * Mirrors backend/src/middleware/readOnlyMiddleware.js. An archived company is a
 * HISTORICAL record: its users may view and export data, but every write is
 * blocked (Super Admin excepted — they can reactivate it).
 *
 * Archiving sets `status: 'Archived'` and `isArchived: true`; we also honour the
 * legacy `accountStatus` of 'Offboarded'/'Archived'.
 */
export const isCompanyArchived = (
  company?: { status?: string | null; isArchived?: boolean; accountStatus?: string | null } | null
): boolean => {
  if (!company) return false;
  if (company.isArchived === true) return true;
  const status = String(company.status || '').toLowerCase();
  const account = String(company.accountStatus || '').toLowerCase();
  return status === 'archived' || account === 'offboarded' || account === 'archived';
};
