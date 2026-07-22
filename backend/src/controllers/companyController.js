const prisma = require('../config/prisma');
const { nextEntityId, nextBranchNo } = require('../utils/sequentialNo');
const idParam = require('../utils/idParam');
const { coerceEntityIds } = require('../utils/idParam');
const AuditService = require('../services/auditService');
const respondError = require('../utils/respondError');
const { OFFBOARDED_STATUSES } = require('../utils/employeeStatus');

// ── Company Branding Management ───────────────────────────────────────────────
// A dedicated, permission-gated endpoint so Company Admins / HR can manage their
// OWN company's branding without the full Super-Admin-only company write. Branding
// always lives on the top-level company (never a branch), so a branch id is
// resolved to its parent. Only the whitelisted branding columns can be written —
// statutory/payroll/billing fields are untouched.
// Extended Company Master fields — the single source of truth for every report,
// certificate, contract, payroll document, export and template. All optional &
// additive (2026-06). A Company Head/HR may manage them from Settings → Company
// Profile, so they are part of BOTH the branding whitelist and the full whitelist.
const COMPANY_MASTER_FIELDS = [
  // Identity
  'legalName', 'displayName', 'tradeName',
  // Contact
  'country', 'landline', 'corporateAddress',
  // Statutory / registration numbers
  'tanNumber', 'pfCode', 'esiCode', 'ptaxRegistrationNumber', 'msmeNumber',
  'shopEstablishmentNumber', 'labourLicenseNumber', 'factoryLicenseNumber',
  'iecCode', 'isoCertNumber', 'fssaiNumber',
  // Management
  'founderName', 'coFounderName', 'ceoName', 'managingDirector', 'directors',
  'hrHeadName', 'financeHeadName', 'authorizedSignatory', 'signatoryDesignation',
  // Banking
  'bankName', 'bankBranch', 'bankAccountNumber', 'ifscCode', 'swiftCode',
  'accountHolderName', 'upiId',
  // Payroll & statutory cycle
  'salaryCycle', 'payrollStartDate', 'financialYearStart', 'leaveYearStart',
  'defaultCurrency', 'defaultTimeZone',
  // Branding extras
  'motto', 'watermarkText',
  // Digital assets
  'letterheadImage', 'dscImage', 'gstCertificateImage', 'panCardImage', 'registrationCertImage',
  // Company Profile module additions (2026-06) — additive single-source-of-truth fields
  'companyType', 'businessCategory', 'natureOfBusiness', 'dateOfEstablishment', 'dateOfIncorporation',
  'companyStatusLabel', 'registeredOfficeAddress', 'headOfficeAddress', 'googleMapLocation',
  'supportEmail', 'hrEmail', 'payrollEmail', 'socialLinks', 'paymentTerms', 'otherRegistrations',
  'reportHeaderImage', 'reportFooterImage', 'watermarkImage',
];

const BRANDING_FIELDS = [
  'name', 'shortName', 'tagline', 'website', 'contactEmail', 'contactNumber',
  'address', 'description', 'logo', 'logoImage', 'primaryColor', 'themeStyle',
  'headerText', 'footerText', 'signatureText', 'gstNumber',
  // Merged "Company Profile & Branding" — profile identity + digital assets.
  // Writable here so a Company Head can manage them (the full company PUT is
  // Super-Admin-only).
  'companyCode', 'registrationNumber', 'panNumber', 'cinNumber',
  'city', 'state', 'pincode', 'emailSignature',
  'faviconImage', 'stampImage', 'digitalSignatureImage',
  // `industry` is the column the Company Profile's "Industry" field reads, so it
  // must also be writable here — without it, editing Industry silently no-oped.
  'industry', 'employeeCapacity',
  // Department management (Settings → Manage Departments) — writable here so a
  // Company Head can add/rename/delete/reorder departments (the full company PUT
  // is Super-Admin-only). customDepartments is a Json array column; departmentMeta
  // is a Json map of per-department metadata keyed by name.
  'customDepartments', 'departmentMeta', 'inheritParentDepartments', 'departmentTemplateType', 'companyIndustry',
  ...COMPANY_MASTER_FIELDS,
];

// Every writable scalar column on the Company model. Any other key in a
// create/update payload (frontend-only fields like `email`, `renewalDate`,
// `branches`, `parentCompanyName`) is dropped so Prisma never rejects the whole
// write with "Unknown argument …" — the root cause of Create Company silently
// failing. Mirrors the whitelist pattern already used for branches & shifts.
const COMPANY_FIELDS = [
  'name', 'domain', 'adminName', 'adminEmail', 'phone', 'industry', 'status',
  'accountStatus', 'paymentStatus', 'plan', 'employeeCount', 'joinDate', 'logo',
  'logoImage', 'isHeadOffice', 'parentCompanyId', 'offboardingState', 'basicPercent',
  'esicRate', 'overtimeRate', 'pfRate', 'primaryColor', 'profTaxRate', 'themeStyle',
  'shortName', 'tagline', 'website', 'contactEmail', 'contactNumber', 'address',
  'description', 'activeHrUsers', 'billingAddress', 'billingCycle', 'billingIncluded',
  'branchCode', 'branchLicenseActive', 'branchLicenseStatus', 'branchName',
  'branchPortalActive', 'branchPriceAddon', 'branchRenewalDate', 'companyIndustry',
  'customDepartments', 'departmentTemplateType', 'employeeCapacity', 'footerText',
  'gstNumber', 'headerText', 'inheritParentDepartments', 'licensedEmployeeLimit',
  'monthlyBranchCost', 'monthlyUsage', 'payrollLoad', 'priceMonthly', 'priceYearly',
  'purchasedAdditionalBranches', 'signatureText', 'storageUsed', 'subscriptionPrice',
  'isArchived',
  'companyCode', 'registrationNumber', 'panNumber', 'cinNumber',
  'city', 'state', 'pincode', 'emailSignature',
  'faviconImage', 'stampImage', 'digitalSignatureImage',
  ...COMPANY_MASTER_FIELDS,
];

// ── Registration → Company Profile sync ──────────────────────────────────────
// The Company row is the master profile. Everything the Super Admin types on the
// registration form must land on a real column so the Company Head's Company
// Profile opens pre-filled instead of blank. Two rules govern the mapping:
//
//  1. Mirrors — one value the app reads under two column names (the profile UI
//     and the report/template engine disagree on some names). We copy, never
//     rename, so both readers keep working.
//  2. Blank-safety — an empty box means "not supplied", so it is dropped rather
//     than written as ''. The Company Head fills it in later; nothing that was
//     entered is ever clobbered by a blank.
const REGISTRATION_MIRRORS = [
  ['email', 'contactEmail'],           // form key → column (Company has no `email`)
  ['phone', 'contactNumber'],          // profile "Mobile Number" reads contactNumber
  ['industry', 'companyIndustry'],     // reports read companyIndustry
  ['address', 'registeredOfficeAddress'],
  ['name', 'legalName'],               // profile header shows legalName first
];

// Registration document uploads → the `Document` rows the Company Profile's
// Documents tab lists (company-scoped docs are Document rows with employeeId
// null). `column` additionally mirrors the file onto the Company row where an
// existing report/certificate template already reads it.
const REGISTRATION_DOCS = [
  { key: 'gstCertificate', name: 'GST Certificate', category: 'Tax', column: 'gstCertificateImage' },
  { key: 'panCard', name: 'PAN Card', category: 'Tax', column: 'panCardImage' },
  { key: 'cinCertificate', name: 'Certificate of Incorporation', category: 'Legal', column: 'registrationCertImage' },
  { key: 'msmeCertificate', name: 'MSME / Udyam Certificate', category: 'Business' },
  { key: 'iecCertificate', name: 'IEC Certificate', category: 'Business' },
];

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// Apply the mirrors and drop blanks. Mutates and returns `data`.
function applyRegistrationDefaults(data, body) {
  for (const [from, to] of REGISTRATION_MIRRORS) {
    const src = body[from] !== undefined ? body[from] : data[from];
    if (isBlank(data[to]) && !isBlank(src)) data[to] = src;
  }
  for (const k of Object.keys(data)) if (typeof data[k] === 'string' && data[k].trim() === '') delete data[k];
  if (data.employeeCapacity !== undefined) {
    const n = parseInt(data.employeeCapacity, 10);
    if (Number.isFinite(n)) data.employeeCapacity = n; else delete data.employeeCapacity;
  }
  return data;
}

// Build a Prisma-safe Company payload from an arbitrary request body:
//  • keep only real columns,
//  • map the frontend's `email` → `contactEmail` (Company has no bare `email`),
//  • coerce `joinDate` (which arrives as "YYYY-MM-DD") to a full ISO DateTime.
function pickCompanyData(body) {
  const src = { ...body };
  if (src.email && !src.contactEmail) src.contactEmail = src.email;
  const data = {};
  for (const k of COMPANY_FIELDS) if (src[k] !== undefined && src[k] !== null) data[k] = src[k];
  if (data.joinDate !== undefined) {
    const d = new Date(data.joinDate);
    if (isNaN(d.getTime())) delete data.joinDate;   // let the DB default (now()) apply
    else data.joinDate = d;
  }
  coerceEntityIds(data);
  return data;
}

// Exported so the public self-registration flow (companyProvisioning service) can
// build the same Prisma-safe Company payload + apply the same registration
// mirrors as the Super-Admin Create Company path — one whitelist, no drift.
exports.pickCompanyData = pickCompanyData;
exports.applyRegistrationDefaults = applyRegistrationDefaults;
exports.COMPANY_FIELDS = COMPANY_FIELDS;

exports.updateBranding = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!role || role === 'Employee' || role === 'Staff') {
      return res.status(403).json({ error: 'You do not have permission to edit company branding.' });
    }

    // Resolve the target to a top-level COMPANY (branding never lives on a branch).
    const rawId = idParam(req.params.id);
    let companyId = rawId;
    const asCompany = await prisma.company.findUnique({ where: { id: rawId } });
    if (!asCompany || asCompany.parentCompanyId) {
      // rawId is a branch (or a sub-company) → use its parent company.
      const asBranch = await prisma.branch.findUnique({ where: { id: rawId } }).catch(() => null);
      companyId = (asCompany && asCompany.parentCompanyId) ? asCompany.parentCompanyId : (asBranch ? asBranch.companyId : rawId);
    }

    // Permission scope: Super Admin → any company; everyone else → ONLY their own
    // top-level company. We compare against the user's resolved primary company
    if (role !== 'Super Admin') {
      let isAllowed = false;
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      
      for (const id of allowedIds) {
        let cid = id;
        const searchId = typeof cid === 'number' ? cid : (Number(cid) || cid);
        const uc = await prisma.company.findUnique({ where: { id: searchId } }).catch(() => null);
        if (!uc) {
          const ub = await prisma.branch.findUnique({ where: { id: searchId } }).catch(() => null);
          if (ub) cid = ub.companyId;
        } else if (uc.parentCompanyId) {
          cid = uc.parentCompanyId;
        }
        
        if (String(cid) === String(companyId)) {
          isAllowed = true;
          break;
        }
      }

      const brandingCompanyId = companyId;
      const currentUser = req.user;
      
      const cpPerms = currentUser.permissions?.['company-profile'] || {};
      const allowEdit = cpPerms.edit === true;

      console.log({
          userId: currentUser.id,
          role: currentUser.role,
          companyId: currentUser.companyId,
          branchId: currentUser.branchId,
          brandingCompanyId: brandingCompanyId,
          profileCompanyId: rawId,
          permissions: currentUser.permissions
      });
      console.log("Permission Check Result", allowEdit);

      if (!isAllowed) {
        return res.status(403).json({ error: 'You can only edit branding for your own company.' });
      }

      if (!allowEdit && currentUser.role !== 'Super Admin' && currentUser.role !== 'Company Head') {
        return res.status(403).json({ error: 'Company branding management is not enabled for your account.' });
      }
    }

    const data = {};
    for (const f of BRANDING_FIELDS) if (req.body[f] !== undefined) data[f] = req.body[f];
    // `employeeCapacity` is an Int column but arrives from the profile form as a
    // string; an empty box means "not set", not 0.
    if (data.employeeCapacity !== undefined) {
      const n = parseInt(data.employeeCapacity, 10);
      data.employeeCapacity = Number.isFinite(n) ? n : null;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No branding fields supplied.' });
    }

    const updated = await prisma.company.update({ where: { id: companyId }, data });

    // Audit: record exactly which branding fields changed, by whom.
    if (req.user?.id) {
      await AuditService.logAudit(req.user.id, 'UPDATE_BRANDING', 'Branding', String(companyId), {
        fields: Object.keys(data),
        nameChangedTo: data.name,
        logoChanged: data.logoImage !== undefined || data.logo !== undefined,
        by: req.user.name || req.user.email,
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating branding:', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Company not found.' });
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// ── Department Management (Settings → Manage Departments) ─────────────────────
// A department-specific endpoint that is authorized by the SETTINGS module
// permission (View/Edit) and its own company-isolation check — NOT the company
// branding authorization. It writes ONLY department columns, so branding / company
// profile / logo / theme are never touched here. This decouples "edit department"
// from "edit branding": a user with Settings → Edit can manage departments even if
// they have no branding rights, and the confusing "…edit branding for your own
// company" error can never surface from this flow.
const DEPARTMENT_FIELDS = ['customDepartments', 'departmentMeta', 'inheritParentDepartments', 'departmentTemplateType'];

// Resolve any company/branch id to its TOP-LEVEL company id (departments live on
// the company, never on a branch). Returns the id unchanged if it can't be found.
async function resolveTopCompanyId(id) {
  if (!id && id !== 0) return null;
  const c = await prisma.company.findUnique({ where: { id } }).catch(() => null);
  if (c) return c.parentCompanyId || c.id;
  const b = await prisma.branch.findUnique({ where: { id } }).catch(() => null);
  return b ? b.companyId : id;
}

exports.updateDepartments = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!role || role === 'Employee' || role === 'Staff') {
      return res.status(403).json({ error: 'You do not have permission to manage departments.' });
    }

    // Departments live on the top-level company — resolve a branch/sub-company id
    // to its parent so every consumer reads the same list.
    const rawId = idParam(req.params.id);
    const companyId = await resolveTopCompanyId(rawId);

    if (role !== 'Super Admin') {
      // ── Company isolation ──────────────────────────────────────────────────
      // The target company (resolved to top level) MUST be one the user actually
      // belongs to. We resolve every id in the user's grant set (own company +
      // accessible companies/branches) to its parent company, so a user can manage
      // departments from any of their own workspaces but NEVER another company's.
      const ownIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(v => v || v === 0);
      const allowedTop = new Set(
        (await Promise.all(ownIds.map(resolveTopCompanyId))).filter(v => v || v === 0).map(String)
      );
      if (!allowedTop.has(String(companyId))) {
        return res.status(403).json({ error: 'You can only manage departments for your own company.' });
      }

      // ── Permission: Settings → Edit ────────────────────────────────────────
      // Company Head owns company settings by default. Every other role (HR,
      // Finance, Manager…) needs an explicit Settings edit grant. Create / delete /
      // reorder all fold into EDIT, matching the 4-action permission model, so this
      // single check covers Add / Edit / Delete / Reorder department.
      if (role !== 'Company Head') {
        const perms = req.user.permissions || {};
        const moduleAccess = perms.moduleAccess || {};
        const granular = perms.permissions || {};
        const settingsEnabled = moduleAccess.settings !== false;
        const canEditSettings = granular.settings?.edit === true
          || granular.settings?.manage === true
          || granular.settings?.create === true;
        if (!settingsEnabled || !canEditSettings) {
          return res.status(403).json({ error: 'You need Settings → Edit permission to manage departments.' });
        }
      }
    }

    // Only department columns are writable here — nothing else on the company row.
    const data = {};
    for (const f of DEPARTMENT_FIELDS) if (req.body[f] !== undefined) data[f] = req.body[f];
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No department fields supplied.' });
    }

    const updated = await prisma.company.update({ where: { id: companyId }, data });

    if (req.user?.id) {
      await AuditService.logAudit(req.user.id, 'MANAGE_DEPARTMENTS', 'Department', String(companyId), {
        count: Array.isArray(data.customDepartments) ? data.customDepartments.length : undefined,
        by: req.user.name || req.user.email,
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating departments:', error);
    if (error.code === 'P2025') return res.status(404).json({ error: 'Company not found.' });
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

// Get all companies
// ─────────────────────────────────────────────────────────────────────────────
// Heavy branding assets — base64 images stored directly on the Company row.
//
// Measured against production (9 companies): stampImage and letterheadImage are
// 2.6 MB EACH across the table, 95% of the entire /companies payload. They are
// used only when RENDERING a document — invoices, payslips, Form 16, letterheads
// — and never by the company list, the workspace switcher or the dashboard, yet
// the app re-downloaded all of them on every login and every workspace switch.
//
// They are therefore omitted from the list and served on demand by
// GET /companies/:id/assets. logoImage is deliberately NOT in this set: it is
// ~24 KB per company and is displayed throughout the UI (topbar, cards, PDFs),
// so lazy-loading it would trade a real win for visible logo flicker.
const HEAVY_ASSET_FIELDS = ['stampImage', 'letterheadImage', 'digitalSignatureImage'];

const stripHeavyAssets = (company) => {
  const out = { ...company };
  for (const f of HEAVY_ASSET_FIELDS) delete out[f];
  // Let the client know an asset exists without shipping it, so a "no seal
  // uploaded" empty state stays accurate while the bytes load lazily.
  out.hasHeavyAssets = HEAVY_ASSET_FIELDS.some((f) => !!company[f]);
  return out;
};

exports.getCompanies = async (req, res) => {
  try {
    let whereClause = {};
    if (req.user && req.user.role !== 'Super Admin') {
      const allowedIds = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      whereClause.id = { in: allowedIds };
    }

    const companies = await prisma.company.findMany({
      where: whereClause,
      include: {
        branches: {
          orderBy: [{ branchNo: 'asc' }, { id: 'asc' }],
        },
        _count: {
          // Headcount shown per company excludes offboarded employees.
          select: { employees: { where: { status: { notIn: OFFBOARDED_STATUSES } } } }
        }
      }
    });

    const enrichedCompanies = companies.map(c => {
      const { _count, ...rest } = c;
      // Always serve a LIVE staff count computed from employee rows so the stored
      // (denormalized) employeeCount can never drift from MySQL reality.
      return {
        ...rest,
        employeeCount: _count.employees,
        headcount: _count.employees
      };
    });

    // Attach the primary Owner/Director (for {{owner_*}} document placeholders).
    // Owners live on the TOP-LEVEL company, so a branch inherits its parent's.
    // Guarded so an un-migrated DB never breaks the companies list.
    try {
      const topIds = [...new Set(enrichedCompanies.map(c => c.parentCompanyId || c.id))];
      if (topIds.length) {
        const primaries = await prisma.companyOwner.findMany({ where: { companyId: { in: topIds }, isPrimary: true } });
        const byCompany = Object.fromEntries(primaries.map(o => [o.companyId, o]));
        for (const c of enrichedCompanies) c.primaryOwner = byCompany[c.parentCompanyId || c.id] || null;
      }
    } catch { /* CompanyOwner table absent on older DBs — non-fatal */ }

    // `?assets=1` opts back into the full payload for any caller that genuinely
    // needs every company's artwork in one go (bulk document generation).
    const withAssets = String(req.query.assets || '') === '1';
    res.json(withAssets ? enrichedCompanies : enrichedCompanies.map(stripHeavyAssets));
  } catch (error) {
    return respondError(res, error);
  }
};

// Create a new company
exports.createCompany = async (req, res) => {
  try {
    const isBranch = req.body.isHeadOffice === false || req.body.parentCompanyId;
    
    if (isBranch) {
      const branchData = {
        companyId: req.body.parentCompanyId || req.body.companyId,
        branchName: req.body.name || req.body.branchName,
        branchCode: req.body.branchCode,
        location: req.body.location || req.body.address,
        phone: req.body.phone,
        email: req.body.email,
        adminName: req.body.adminName,
        adminEmail: req.body.adminEmail,
        employeeCapacity: req.body.employeeCapacity,
        status: req.body.status,
        pfRate: req.body.pfRate,
        esicRate: req.body.esicRate,
        basicPercent: req.body.basicPercent,
        profTaxRate: req.body.profTaxRate,
        overtimeRate: req.body.overtimeRate
      };
      coerceEntityIds(branchData);
      branchData.id = await nextEntityId();
      branchData.branchNo = await nextBranchNo(branchData.companyId);
      const branch = await prisma.branch.create({ data: branchData });
      return res.status(201).json({ ...branch, name: branch.branchName, isHeadOffice: false, parentCompanyId: branch.companyId });
    }

    const companyData = pickCompanyData(req.body);
    if (!companyData.name || String(companyData.name).trim() === '') {
      return res.status(400).json({ error: 'Company name is required.', code: 'REQUIRED_MISSING' });
    }
    applyRegistrationDefaults(companyData, req.body);

    // Registration document uploads also live on the Company row where a report
    // or certificate template already reads them by column.
    const uploads = (req.body.documents && typeof req.body.documents === 'object') ? req.body.documents : {};
    for (const d of REGISTRATION_DOCS) {
      const file = uploads[d.key];
      if (d.column && file && file.fileData) companyData[d.column] = file.fileData;
    }

    // Every new company starts on the FREE plan unless one was explicitly chosen
    // (the DB default is also 'Free', but set it here so it's unambiguous + audited).
    if (isBlank(companyData.plan)) companyData.plan = 'Free';

    const company = await prisma.company.create({
      data: { ...companyData, id: await nextEntityId() }
    });

    // Subscription record (FREE / Active) — best-effort, mirrors Company.plan.
    prisma.companySubscription.create({
      data: { companyId: company.id, plan: company.plan || 'Free', billingCycle: 'Quarterly', status: 'Active' },
    }).catch(() => { /* lazily created later by the subscription controller if this fails */ });

    // The company row is authoritative. Everything below enriches the profile and
    // must never fail the registration — a bad owner row or an oversized upload is
    // reported as a warning, not a lost company.
    const warnings = [];
    const actor = req.user?.name || req.user?.email || 'System';
    const today = new Date().toISOString().split('T')[0];

    // ── Default branch ────────────────────────────────────────────────────────
    // Shows up in Company Profile → Branch Information with no manual entry.
    // The global prisma audit middleware already logs the Branch/Document creates
    // below, so nothing here writes its own AuditLog row.
    const db = req.body.defaultBranch;
    if (db && !isBlank(db.branchName)) {
      try {
        await prisma.branch.create({
          data: {
            id: await nextEntityId(),
            branchNo: await nextBranchNo(company.id),
            companyId: company.id,
            branchName: String(db.branchName).trim(),
            branchCode: isBlank(db.branchCode) ? undefined : String(db.branchCode).trim(),
            location: isBlank(db.location) ? (companyData.address || undefined) : String(db.location).trim(),
            email: companyData.contactEmail || undefined,
            phone: companyData.contactNumber || undefined,
            adminName: companyData.adminName || undefined,
            adminEmail: companyData.adminEmail || undefined,
          },
        });
      } catch (e) {
        console.error('createCompany: default branch failed', e);
        warnings.push('The default branch could not be created. Add it from Branch Management.');
      }
    }

    // ── Owner(s) / Director(s) ────────────────────────────────────────────────
    // Exactly one owner is primary; the primary feeds the {{owner_*}} placeholders.
    const owners = Array.isArray(req.body.owners) ? req.body.owners.filter(o => o && !isBlank(o.name)) : [];
    if (owners.length) {
      try {
        const primaryIdx = Math.max(0, owners.findIndex(o => o.isPrimary));
        await prisma.companyOwner.createMany({
          data: owners.map((o, i) => ({
            companyId: company.id,
            name: String(o.name).trim(),
            designation: isBlank(o.designation) ? null : String(o.designation).trim(),
            email: isBlank(o.email) ? null : String(o.email).trim(),
            mobile: isBlank(o.mobile) ? null : String(o.mobile).trim(),
            ownershipPercentage: isBlank(o.ownershipPercentage) ? null : String(o.ownershipPercentage).trim(),
            isPrimary: i === primaryIdx,
            sortOrder: i,
          })),
        });
      } catch (e) {
        console.error('createCompany: owners failed', e);
        warnings.push('Owner / Director details could not be saved. Add them from Company Profile.');
      }
    }

    // ── Company documents ─────────────────────────────────────────────────────
    // Written as company-scoped Document rows (employeeId = null) so the Company
    // Profile → Company Documents tab lists them without a re-upload.
    for (const d of REGISTRATION_DOCS) {
      const file = uploads[d.key];
      if (!file || (!file.fileData && !file.url)) continue;
      try {
        await prisma.document.create({
          data: {
            companyId: company.id,
            employeeId: null,
            name: d.name,
            type: d.category,
            category: d.category,
            documentNumber: isBlank(file.documentNumber) ? null : String(file.documentNumber).trim(),
            fileData: file.fileData || null,
            url: file.url || null,
            mimeType: file.mimeType || null,
            size: file.size || '—',
            status: 'Pending',
            uploadedBy: actor,
            uploadedOn: today,
            remarks: 'Uploaded during company registration.',
          },
        });
      } catch (e) {
        console.error(`createCompany: document ${d.key} failed`, e);
        warnings.push(`"${d.name}" could not be attached. Upload it from Company Profile → Company Documents.`);
      }
    }

    // Audit the creation (best-effort — never block the create on an audit write).
    if (req.user?.id) {
      AuditService.logAudit(req.user.id, 'CREATE_COMPANY', 'Companies', String(company.id), {
        name: company.name, plan: company.plan, by: actor,
      }).catch(() => {});
    }

    res.status(201).json(warnings.length ? { ...company, warnings } : company);
  } catch (error) {
    return respondError(res, error);
  }
};

// Update a company
exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const isBranch = req.body.isHeadOffice === false || req.body.parentCompanyId;

    if (isBranch) {
      const validBranchData = {};
      if (req.body.name) validBranchData.branchName = req.body.name;
      if (req.body.branchName) validBranchData.branchName = req.body.branchName;
      if (req.body.status) validBranchData.status = req.body.status;
      if (req.body.location) validBranchData.location = req.body.location;
      if (req.body.address) validBranchData.location = req.body.address;
      if (req.body.branchCode) validBranchData.branchCode = req.body.branchCode;
      if (req.body.email) validBranchData.email = req.body.email;
      if (req.body.phone) validBranchData.phone = req.body.phone;
      if (req.body.adminName) validBranchData.adminName = req.body.adminName;
      if (req.body.adminEmail) validBranchData.adminEmail = req.body.adminEmail;
      if (req.body.employeeCapacity) validBranchData.employeeCapacity = req.body.employeeCapacity;
      if (req.body.pfRate) validBranchData.pfRate = req.body.pfRate;
      if (req.body.esicRate) validBranchData.esicRate = req.body.esicRate;
      if (req.body.basicPercent) validBranchData.basicPercent = req.body.basicPercent;
      if (req.body.profTaxRate) validBranchData.profTaxRate = req.body.profTaxRate;
      if (req.body.overtimeRate) validBranchData.overtimeRate = req.body.overtimeRate;


      const branch = await prisma.branch.update({
        where: { id: idParam(id) },
        data: validBranchData
      });

      // Forward branding and statutory settings to the parent company
      const parentCompanyId = req.body.parentCompanyId || branch.companyId;
      if (parentCompanyId) {
        const parentPayload = { ...req.body };
        delete parentPayload.name;
        delete parentPayload.branchName;
        delete parentPayload.status;
        delete parentPayload.location;
        delete parentPayload.email;
        delete parentPayload.address;
        delete parentPayload.isHeadOffice;
        delete parentPayload.parentCompanyId;
        delete parentPayload.branches;
        
        // Remove undefined/nulls to prevent wiping out parent data by mistake
        Object.keys(parentPayload).forEach(key => {
          if (parentPayload[key] === undefined) {
            delete parentPayload[key];
          }
        });

        if (Object.keys(parentPayload).length > 0) {
          try {
            await prisma.company.update({
              where: { id: parentCompanyId },
              data: parentPayload
            });
          } catch(e) {
            // Best-effort forward of branding/statutory settings to the parent
            // company: the branch update itself already succeeded, so we don't
            // fail the request. But log it — a silently-swallowed error here
            // previously hid cases where the parent settings never persisted.
            console.error(`Branch update: parent company ${parentCompanyId} forward-update failed:`, e.message);
          }
        }
      }

      return res.json({ ...branch, name: branch.branchName, isHeadOffice: false });
    }

    const payload = pickCompanyData(req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No valid company fields supplied to update.' });
    }
    const company = await prisma.company.update({
      where: { id: idParam(id) },
      data: payload
    });
    res.json(company);
  } catch (error) {
    return respondError(res, error);
  }
};

// GET /companies/:id/assets — the heavy branding images for ONE company.
// Paired with the omission in getCompanies above: document-rendering screens
// pull the artwork for the workspace they are actually printing, instead of
// every user downloading every company's artwork at login.
exports.getCompanyAssets = async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Company id required.' });

    if (req.user && req.user.role !== 'Super Admin') {
      const allowed = [req.user.companyId, ...(req.user.accessibleCompanyIds || [])].filter(Boolean);
      // A branch workspace inherits its parent company's artwork, so resolve the
      // branch to its parent before deciding whether this caller may read it.
      let effective = id;
      if (!allowed.includes(id)) {
        const branch = await prisma.branch.findUnique({ where: { id }, select: { companyId: true } });
        if (!branch || !allowed.includes(branch.companyId)) {
          return res.status(403).json({ error: 'Not your company.' });
        }
        effective = branch.companyId;
      }
      const c = await prisma.company.findUnique({
        where: { id: effective },
        select: { id: true, stampImage: true, letterheadImage: true, digitalSignatureImage: true },
      });
      if (!c) return res.status(404).json({ error: 'Company not found.' });
      return res.json(c);
    }

    const c = await prisma.company.findUnique({
      where: { id },
      select: { id: true, stampImage: true, letterheadImage: true, digitalSignatureImage: true },
    });
    if (!c) return res.status(404).json({ error: 'Company not found.' });
    res.json(c);
  } catch (error) {
    console.error('company.getAssets', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.getCompanyDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const employees = await prisma.employee.count({ where: { companyId: id } });
    const branches = await prisma.branch.count({ where: { companyId: id } });
    const payrolls = await prisma.payroll.count({ where: { companyId: id } });
    const attendances = await prisma.attendance.count({ where: { companyId: id } });
    const documents = await prisma.document.count({ where: { companyId: id } });
    
    res.json({ employees, branches, payrolls, attendances, documents });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if it's a branch or company
    const branchCheck = await prisma.branch.findUnique({ where: { id: idParam(id) } });
    if (branchCheck) {
      const employees = await prisma.employee.count({ where: { branchId: id } });
      if (employees > 0) {
        return res.status(400).json({ error: 'Cannot hard delete branch with existing employees.' });
      }
      await prisma.branch.delete({ where: { id: idParam(id) } });
      return res.json({ message: 'Branch permanently deleted' });
    }

    const employees = await prisma.employee.count({ where: { companyId: id } });
    const branches = await prisma.branch.count({ where: { companyId: id } });
    const payrolls = await prisma.payroll.count({ where: { companyId: id } });
    const attendances = await prisma.attendance.count({ where: { companyId: id } });
    const documents = await prisma.document.count({ where: { companyId: id } });

    if (employees > 0 || branches > 0 || payrolls > 0 || attendances > 0 || documents > 0) {
      return res.status(400).json({ error: 'Cannot hard delete company with existing dependent records. Please archive instead.' });
    }

    await prisma.company.delete({ where: { id: idParam(id) } });
    res.json({ message: 'Company permanently deleted' });
  } catch (error) {
    return respondError(res, error);
  }
};

exports.archiveCompany = async (req, res) => {
  // ── Validate & convert the workspace id to an Int BEFORE any DB query. ──────
  // The id column is an integer; passing the raw string param into integer
  // filters (companyId/branchId, or an `in: [...]` array) is what raised the
  // Prisma "Expected Int, provided String" error AFTER the row was archived.
  // Reject a non-numeric id up front so no query ever runs with a bad value.
  const workspaceId = idParam(req.params.id);
  if (!Number.isInteger(workspaceId)) {
    return res.status(400).json({
      error: 'A valid company or branch is required to offboard.',
      code: 'INVALID_ID',
    });
  }

  try {
    // Is this id a BRANCH? (Branch and company ids share one integer space.)
    const branchCheck = await prisma.branch.findUnique({ where: { id: workspaceId } });

    if (branchCheck) {
      // ── Branch offboarding — atomic: archive the branch AND its employees, or
      //    nothing at all (so the user never sees "done + error"). ──
      const branch = await prisma.$transaction(async (tx) => {
        const updatedBranch = await tx.branch.update({
          where: { id: workspaceId },
          data: { status: 'Archived', isArchived: true },
        });
        await tx.employee.updateMany({
          where: { branchId: workspaceId },
          data: { status: 'Archived', exitDate: new Date(), exitReason: 'Branch Archived' },
        });
        return updatedBranch;
      });
      return res.json({ message: 'Branch archived successfully', company: { ...branch, name: branch.branchName } });
    }

    // ── Company offboarding — atomic: archive the company, its branches and all
    //    their employees in one transaction. ──
    const company = await prisma.$transaction(async (tx) => {
      const updatedCompany = await tx.company.update({
        where: { id: workspaceId },
        data: { status: 'Archived', isArchived: true },
      });
      await tx.branch.updateMany({
        where: { companyId: workspaceId },
        data: { status: 'Archived', isArchived: true },
      });
      // branchIds come straight from the DB → already integers. Combined with the
      // numeric workspaceId, the `in: [...]` array is now Int[] as Prisma expects.
      const branches = await tx.branch.findMany({ where: { companyId: workspaceId }, select: { id: true } });
      const branchIds = branches.map(b => b.id);
      await tx.employee.updateMany({
        where: { companyId: { in: [workspaceId, ...branchIds] } },
        data: { status: 'Archived', exitDate: new Date(), exitReason: 'Company Archived' },
      });
      return updatedCompany;
    });

    return res.json({ message: 'Company archived successfully', company });
  } catch (error) {
    // Genuine failure: the transaction rolled back (no partial archive). Log the
    // full technical detail server-side; show the user a friendly message only —
    // never the raw Prisma/DB error.
    console.error('[Offboarding] Failed to archive company/branch:', error);
    if (error && error.code === 'P2025') {
      return res.status(404).json({ error: 'That company or branch no longer exists.', code: 'NOT_FOUND' });
    }
    return res.status(500).json({
      error: 'Unable to complete offboarding. Please try again or contact your administrator.',
      code: 'OFFBOARDING_FAILED',
    });
  }
};
/**
 * GET /api/companies/export
 * Returns enriched, export-ready data for:
 *   - companies[]  — every Company row with active/total employee counts
 *   - branches[]   — every Branch row with parent company name and headcounts
 *   - plans[]      — active SubscriptionPlan list for the summary sheet
 */
exports.exportCompanies = async (req, res) => {
  try {
    // Fetch companies with their branches, employee counts and payment records
    const [companies, branches, plans] = await Promise.all([
      prisma.company.findMany({
        include: {
          branches: {
            select: {
              id: true,
              branchName: true,
              branchCode: true,
              location: true,
              phone: true,
              email: true,
              adminName: true,
              adminEmail: true,
              status: true,
              isArchived: true,
              headcount: true,
              employeeCapacity: true,
              pfRate: true,
              esicRate: true,
              basicPercent: true,
              profTaxRate: true,
              overtimeRate: true,
              createdAt: true,
              updatedAt: true,
              _count: {
                select: {
                  employees: true,
                }
              }
            }
          },
          _count: {
            select: {
              employees: true,
              branches: true,
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.branch.findMany({
        include: {
          company: { select: { name: true } },
          _count: { select: { employees: true } }
        },
        // Company-wise branchNo ordering for exports/reports.
        orderBy: [{ companyId: 'asc' }, { branchNo: 'asc' }, { id: 'asc' }]
      }),
      prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: 'asc' } })
    ]);

    // Active employee counts per company/branch
    const activeEmpByCompany = await prisma.employee.groupBy({
      by: ['companyId'],
      where: { status: { in: ['Active', 'ACTIVE'] } },
      _count: { _all: true }
    });
    const activeEmpByBranch = await prisma.employee.groupBy({
      by: ['branchId'],
      where: { status: { in: ['Active', 'ACTIVE'] }, branchId: { not: null } },
      _count: { _all: true }
    });

    const activeByComp = Object.fromEntries(activeEmpByCompany.map(r => [r.companyId, r._count._all]));
    const activeByBranch = Object.fromEntries(activeEmpByBranch.map(r => [r.branchId, r._count._all]));

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    const enrichedCompanies = companies.map(c => ({
      type: 'Company',
      companyId: c.id,
      branchId: '',
      companyName: c.name || '',
      branchName: '',
      contactPerson: c.adminName || '',
      email: c.adminEmail || c.domain || '',
      mobileNumber: c.phone || '',
      alternateContact: '',
      industry: c.industry || '',
      city: '',
      state: '',
      country: 'India',
      address: c.billingAddress || '',
      totalEmployeeCount: c._count.employees,
      activeEmployeeCount: activeByComp[c.id] || 0,
      totalBranches: c._count.branches,
      website: c.domain || '',
      joinDateTime: formatDateTime(c.joinDate),
      subscriptionPlan: c.plan || '',
      subscriptionPrice: c.subscriptionPrice || c.priceMonthly || 0,
      billingCycle: c.billingCycle || 'Monthly',
      subscriptionStartDate: formatDate(c.joinDate),
      subscriptionExpiryDate: c.renewalDate || '',
      billingStatus: c.paymentStatus || '',
      companyStatus: c.status || '',
      branchStatus: '',
      accountStatus: c.accountStatus || '',
      isArchived: c.isArchived ? 'Yes' : 'No',
      gstNumber: c.gstNumber || '',
      domain: c.domain || '',
      pfRate: c.pfRate || 12,
      esicRate: c.esicRate || 3.25,
      basicPercent: c.basicPercent || 50,
      profTaxRate: c.profTaxRate || 200,
      overtimeRate: c.overtimeRate || 1.5,
      createdDate: formatDate(c.createdAt),
      updatedDate: formatDate(c.updatedAt),
    }));

    const enrichedBranches = branches.map(b => ({
      type: 'Branch',
      companyId: b.companyId,
      branchId: b.id,
      branchNo: b.branchNo ?? '',
      companyName: b.company?.name || '',
      branchName: b.branchName || '',
      contactPerson: b.adminName || '',
      email: b.email || b.adminEmail || '',
      mobileNumber: b.phone || '',
      alternateContact: '',
      industry: '',
      city: b.location || '',
      state: '',
      country: 'India',
      address: b.location || '',
      totalEmployeeCount: b._count.employees,
      activeEmployeeCount: activeByBranch[b.id] || 0,
      totalBranches: '',
      subscriptionPlan: 'Included',
      subscriptionPrice: '',
      billingCycle: '',
      subscriptionStartDate: formatDate(b.createdAt),
      subscriptionExpiryDate: '',
      billingStatus: '',
      companyStatus: '',
      branchStatus: b.status || '',
      accountStatus: '',
      isArchived: b.isArchived ? 'Yes' : 'No',
      gstNumber: '',
      domain: '',
      pfRate: b.pfRate,
      esicRate: b.esicRate,
      basicPercent: b.basicPercent,
      profTaxRate: b.profTaxRate,
      overtimeRate: b.overtimeRate,
      branchCode: b.branchCode || '',
      employeeCapacity: b.employeeCapacity || 200,
      createdDate: formatDate(b.createdAt),
      updatedDate: formatDate(b.updatedAt),
    }));

    // ── Employee Summary ──────────────────────────────────────────────────────
    // Live employee aggregates straight from the Employee table (never cached
    // counts). Overall totals + a per-company breakdown for the PDF/Excel report.
    const [empTotalByCompany, empActiveByCompany, empStatusGroups, totalEmployees] = await Promise.all([
      prisma.employee.groupBy({ by: ['companyId'], _count: { _all: true } }),
      prisma.employee.groupBy({ by: ['companyId'], where: { status: { in: ['Active', 'ACTIVE'] } }, _count: { _all: true } }),
      prisma.employee.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.employee.count(),
    ]);
    const totByComp = Object.fromEntries(empTotalByCompany.map(r => [r.companyId, r._count._all]));
    const actByComp = Object.fromEntries(empActiveByCompany.map(r => [r.companyId, r._count._all]));
    const activeEmployees = empStatusGroups
      .filter(g => ['active'].includes(String(g.status).toLowerCase()))
      .reduce((s, g) => s + g._count._all, 0);

    const employeeSummary = {
      totalEmployees,
      activeEmployees,
      archivedEmployees: totalEmployees - activeEmployees,
      byStatus: empStatusGroups.map(g => ({ status: g.status, count: g._count._all })),
      byCompany: companies.map(c => ({
        companyName: c.name || '',
        companyStatus: c.status || '',
        total: totByComp[c.id] || 0,
        active: actByComp[c.id] || 0,
        archived: (totByComp[c.id] || 0) - (actByComp[c.id] || 0),
      })),
    };

    res.set('Cache-Control', 'no-store');
    res.json({
      companies: enrichedCompanies,
      branches: enrichedBranches,
      plans,
      employeeSummary,
      exportedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Export Companies Error:', error);
    res.status(500).json({ error: 'Failed to generate export data' });
  }
};
