// ─────────────────────────────────────────────────────────────────────────────
// COMPANY PROVISIONING — the shared "stand up a whole new workspace" routine used
// by public self-registration (FREE plan). It composes the exact same building
// blocks the app already uses, so a self-registered company is indistinguishable
// from an admin-created one and shows up everywhere the Super Admin looks:
//
//   Company  →  Head Office branch  →  default department  →  Company Head user
//            →  FREE subscription (Company.plan)  →  audit trail
//
// It reuses:
//   • pickCompanyData / applyRegistrationDefaults / COMPANY_FIELDS  (companyController)
//   • defaultPermissionsForRole('Company Head')                     (userController)
//   • nextEntityId / nextBranchNo                                   (sequentialNo)
//   • AuditService.logAudit                                         (auditService)
//
// No schema change: the "subscription" is `Company.plan = 'Free'` plus the
// existing accountStatus/paymentStatus columns.
// ─────────────────────────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { nextEntityId, nextBranchNo } = require('../utils/sequentialNo');
const AuditService = require('./auditService');
const { pickCompanyData, applyRegistrationDefaults } = require('../controllers/companyController');
const { defaultPermissionsForRole } = require('../controllers/userController');

const FREE_PLAN = 'Free';

// Turn an email into a unique username base, then disambiguate against the DB.
async function uniqueUsername(email) {
  const base = (String(email).split('@')[0] || 'user').replace(/[^a-z0-9._-]/gi, '').toLowerCase() || 'user';
  let username = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.user.findFirst({ where: { username }, select: { id: true } })) {
    username = `${base}${n++}`;
  }
  return username;
}

/**
 * Provision a brand-new FREE workspace.
 *
 * @param {object} input
 * @param {object} input.company  { name, email, phone, industry, companySize, country, state, city }
 * @param {object} input.head     { name, email, mobile, passwordHash }  (password already bcrypt-hashed)
 * @param {object} input.branch   { branchName, address }
 * @returns {Promise<{ company, branch, head }>}  the created rows.
 * @throws  Error with `.code` 'DUPLICATE' | 'REQUIRED_MISSING' on a caller error.
 */
async function provisionFreeCompany({ company = {}, head = {}, branch = {} }) {
  const companyName = String(company.name || '').trim();
  const headName = String(head.name || '').trim();
  const headEmail = String(head.email || '').trim().toLowerCase();
  const passwordHash = String(head.passwordHash || '');

  if (!companyName || !headName || !headEmail || !passwordHash) {
    const e = new Error('Company name, Company Head name, email and password are required.');
    e.code = 'REQUIRED_MISSING';
    throw e;
  }

  // Re-check email uniqueness at provision time — the start→verify window (10 min)
  // could have let another registration claim it. The DB unique index is the hard
  // guard; this returns a friendly 409 instead of a raw Prisma error.
  const existing = await prisma.user.findFirst({ where: { email: headEmail }, select: { id: true } });
  if (existing) {
    const e = new Error('An account with this email already exists. Please sign in instead.');
    e.code = 'DUPLICATE';
    throw e;
  }

  // ── 1. Company row (FREE, active) ──────────────────────────────────────────
  // Build the Prisma-safe payload from the same whitelist the admin path uses,
  // then force the subscription/status fields.
  const companyData = pickCompanyData({
    name: companyName,
    email: company.email,          // → contactEmail (Company has no bare `email`)
    phone: company.phone,          // → contactNumber via registration mirror
    industry: company.industry,
    country: company.country,
    state: company.state,
    city: company.city,
    address: branch.address,       // seed registered-office address from Head Office
  });
  applyRegistrationDefaults(companyData, {
    name: companyName,
    email: company.email,
    phone: company.phone,
    industry: company.industry,
    address: branch.address,
  });
  companyData.plan = FREE_PLAN;
  companyData.status = 'Active';
  companyData.accountStatus = 'Active';
  // 'Trial Active' keeps the FREE workspace inside the Super Admin
  // ACTIVE_SUBSCRIPTION_WHERE count (which accepts only 'Paid' | 'Trial Active').
  companyData.paymentStatus = 'Trial Active';
  companyData.isHeadOffice = true;
  companyData.employeeCount = 0;
  // Default department (data-only, matches the customDepartments pattern).
  companyData.customDepartments = ['General'];

  const createdCompany = await prisma.company.create({
    data: { ...companyData, id: await nextEntityId() },
  });

  // FREE subscription record (mirrors Company.plan) — best-effort.
  prisma.companySubscription.create({
    data: { companyId: createdCompany.id, plan: 'Free', billingCycle: 'Quarterly', status: 'Active' },
  }).catch(() => {});

  // From here on, roll back the company on any failure so a half-provisioned
  // workspace never lingers (no interactive transaction because nextEntityId /
  // nextBranchNo run their own aggregate queries).
  try {
    // ── 2. Head Office branch ────────────────────────────────────────────────
    const branchName = String(branch.branchName || '').trim() || 'Head Office';
    const createdBranch = await prisma.branch.create({
      data: {
        id: await nextEntityId(),
        branchNo: await nextBranchNo(createdCompany.id),
        companyId: createdCompany.id,
        branchName,
        location: String(branch.address || '').trim() || createdCompany.address || undefined,
        email: createdCompany.contactEmail || undefined,
        phone: createdCompany.contactNumber || undefined,
        adminName: headName,
        adminEmail: headEmail,
      },
    });

    // ── 3. Company Head user (full default permissions) ──────────────────────
    const permBlob = defaultPermissionsForRole('Company Head');
    permBlob.profile = {
      designation: 'Company Head',
      department: 'General',
      mobile: String(head.mobile || '').trim() || null,
      loginEnabled: true,
      forcePasswordChange: false,
    };
    const username = await uniqueUsername(headEmail);
    const createdHead = await prisma.user.create({
      data: {
        name: headName,
        email: headEmail,
        username,
        passwordHash,
        role: 'Company Head',
        companyId: createdCompany.id,
        branchId: createdBranch.id,
        status: 'Active',
        accessibleCompanyIds: [createdCompany.id],
        permissions: permBlob,
      },
    });

    // ── 4. Audit trail (attributed to the new Company Head — a real User.id, so
    //       the non-nullable AuditLog.userId FK is satisfied). ────────────────
    const by = 'Self Registration';
    await AuditService.logAudit(createdHead.id, 'CREATE_COMPANY', 'Companies', String(createdCompany.id), { name: createdCompany.name, plan: FREE_PLAN, by });
    await AuditService.logAudit(createdHead.id, 'ASSIGN_SUBSCRIPTION', 'Companies', String(createdCompany.id), { plan: FREE_PLAN, status: 'Active', by });
    await AuditService.logAudit(createdHead.id, 'CREATE_USER', 'Users', String(createdHead.id), { name: headName, role: 'Company Head', by });
    await AuditService.logAudit(createdHead.id, 'CREATE_BRANCH', 'Companies', String(createdBranch.id), { branchName, headOffice: true, by });

    return { company: createdCompany, branch: createdBranch, head: createdHead };
  } catch (err) {
    // Best-effort rollback: remove the branch(es) then the company.
    await prisma.branch.deleteMany({ where: { companyId: createdCompany.id } }).catch(() => {});
    await prisma.company.delete({ where: { id: createdCompany.id } }).catch(() => {});
    throw err;
  }
}

module.exports = { provisionFreeCompany, FREE_PLAN };
