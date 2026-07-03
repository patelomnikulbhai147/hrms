const { getSuperAdminStatistics, getPlatformReports } = require('../services/superAdminStatisticsService');
const respondError = require('../utils/respondError');
const prisma = require('../config/prisma');
const idParam = require('../utils/idParam');
const { ACTIVE_EMPLOYEE_WHERE } = require('../utils/employeeStatus');

// GET /api/statistics/company-overview/:companyId
// Platform-level monitoring summary for ONE company — Super Admin only. Returns
// COUNTS and subscription/license/branch summaries ONLY. Never any employee PII
// (no names, salaries, bank, documents, attendance, leave, personal details).
exports.getCompanyOverview = async (req, res) => {
  try {
    const companyId = idParam(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'A company id is required.' });

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    // Branches under this company.
    const branches = await prisma.branch.findMany({ where: { companyId } });
    const branchIds = branches.map((b) => b.id);
    const scopeIds = [companyId, ...branchIds];

    // Employee COUNTS only (never fetch employee rows — privacy by construction).
    // "Active" uses the single-source ACTIVE_EMPLOYEE_WHERE (not-offboarded), the
    // same definition the Employees roster & company headcount use, so this number
    // agrees with every other screen.
    const [totalEmployees, activeEmployees] = await Promise.all([
      prisma.employee.count({ where: { companyId: { in: scopeIds } } }),
      prisma.employee.count({ where: { companyId: { in: scopeIds }, ...ACTIVE_EMPLOYEE_WHERE } }),
    ]);

    // Per-branch employee counts. An employee may be keyed to a branch either by
    // `branchId` (Branch-table branches) OR by `companyId = branch id` (company-as-
    // branch) — match BOTH so a populated branch never shows 0 (was: companyId only,
    // which reported 0 for every Branch-table branch since its staff use branchId).
    const branchSummaries = await Promise.all(
      branches.map(async (b) => {
        const branchWhere = { OR: [{ branchId: b.id }, { companyId: b.id }] };
        const [emp, act] = await Promise.all([
          prisma.employee.count({ where: branchWhere }),
          prisma.employee.count({ where: { ...branchWhere, ...ACTIVE_EMPLOYEE_WHERE } }),
        ]);
        return {
          id: b.id,
          name: b.branchName,
          code: b.branchCode || null,
          status: b.isArchived ? 'Archived' : b.status,
          manager: b.adminName || null,
          employeeCount: emp,
          activeEmployeeCount: act,
        };
      })
    );

    // Last login across this company's users (timestamp only).
    let lastLogin = null;
    try {
      const u = await prisma.user.findFirst({
        where: { companyId: { in: scopeIds }, lastLoginAt: { not: null } },
        orderBy: { lastLoginAt: 'desc' },
        select: { lastLoginAt: true },
      });
      lastLogin = u?.lastLoginAt || null;
    } catch { /* lastLoginAt optional */ }

    // Approximate storage usage from stored document blobs for this company.
    let storageBytes = 0;
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM(CHAR_LENGTH(fileData)),0) AS bytes FROM Document WHERE companyId IN (${scopeIds.join(',')})`
      );
      storageBytes = Number(rows?.[0]?.bytes || 0);
    } catch { /* storage best-effort */ }

    res.set('Cache-Control', 'no-store');
    res.json({
      company: {
        id: company.id,
        name: company.name,
        code: company.companyCode || null,
        status: company.status,
        accountStatus: company.accountStatus,
        head: company.adminName || null,
        email: company.contactEmail || company.adminEmail || company.email || null,
        contactNumber: company.contactNumber || company.phone || null,
        address: company.address || null,
        city: company.city || null,
        state: company.state || null,
        registrationDate: company.joinDate || company.createdAt,
        industry: company.industry || null,
      },
      subscription: {
        plan: company.plan,
        status: company.paymentStatus,
        priceMonthly: company.priceMonthly ?? null,
        priceYearly: company.priceYearly ?? null,
        expiry: company.validUntil ?? null,
        licensedEmployeeLimit: company.licensedEmployeeLimit ?? null,
        licenseActive: company.branchLicenseActive ?? null,
        licenseStatus: company.branchLicenseStatus ?? null,
      },
      branchesTotal: branches.length,
      branchesActive: branches.filter((b) => !b.isArchived && b.status === 'Active').length,
      employeesTotal: totalEmployees,
      employeesActive: activeEmployees,
      employeesInactive: Math.max(0, totalEmployees - activeEmployees),
      storageBytes,
      lastLogin,
      branches: branchSummaries,
    });
  } catch (error) {
    return respondError(res, error);
  }
};

// GET /api/statistics/super-admin
// Returns live, database-driven KPI counts for the Super Admin dashboard.
exports.getSuperAdmin = async (req, res) => {
  try {
    const stats = await getSuperAdminStatistics();
    // Connectivity validation log: MySQL -> Prisma -> API.
    console.log('[SuperAdminStats][DB->API]', {
      totalCompanies: stats.totalCompanies,
      totalBranches: stats.totalBranches,
      combinedEmployees: stats.combinedEmployees,
      activeSubscriptions: stats.activeSubscriptions,
      offboardedCompanies: stats.offboardedCompanies,
      monthlyRevenue: stats.monthlyRevenue,
    });
    // Never serve stale cached counts.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(stats);
  } catch (error) {
    return respondError(res, error);
  }
};

// GET /api/statistics/platform-reports
// SaaS platform analytics for the Super Admin Reports module — platform-level
// counts/totals/revenue/growth only (NO company-operational or employee PII).
exports.getPlatformReports = async (req, res) => {
  try {
    const reports = await getPlatformReports();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(reports);
  } catch (error) {
    return respondError(res, error);
  }
};
