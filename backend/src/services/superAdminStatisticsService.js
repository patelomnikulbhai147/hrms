const prisma = require('../config/prisma');
const { OFFBOARDED_STATUSES } = require('../utils/employeeStatus');

/**
 * SuperAdminStatisticsService
 *
 * Single source of truth for Super Admin KPI counts. Every value is computed
 * with a live aggregate query against MySQL (via Prisma) so the dashboard,
 * company directory, reports, and analytics always match the database exactly.
 *
 * There are NO hardcoded, cached, mock, or fallback numbers here.
 *
 * Field semantics:
 *   - Company.status        : 'Active' | 'Inactive' | 'Archived' | 'Suspended' | ...
 *   - Company.accountStatus : 'Active' | 'Suspended'
 *   - Branch.status         : 'Active' | 'Inactive' | 'Suspended' | 'Archived' | ...
 *
 * Deactivation rule:
 *   A company is "deactivated" when its status is anything other than Active.
 *   A branch is "deactivated" when EITHER:
 *     (a) the branch's own status is non-Active, OR
 *     (b) its parent company's status is non-Active (cascade deactivation).
 */

// Non-active status values accepted from the database (case-insensitive match
// because some rows were written with mixed casing).
const DEACTIVATED_STATUSES = [
  'Archived', 'ARCHIVED',
  'Suspended', 'SUSPENDED',
  'Inactive', 'INACTIVE',
  'Deactivated', 'DEACTIVATED',
  'Disabled', 'DISABLED',
  'Offboarded', 'OFFBOARDED',
];

// A company has a live (active) subscription when it is not archived, its portal
// access is enabled, and its billing is current (paid or in trial).
const ACTIVE_SUBSCRIPTION_WHERE = {
  status: { notIn: ['Archived', 'ARCHIVED'] },
  accountStatus: 'Active',
  paymentStatus: { in: ['Paid', 'Trial Active'] },
};

// Offboarded = archived, inactive, or explicitly offboarded tenants.
const OFFBOARDED_WHERE = {
  status: { in: ['Archived', 'Inactive', 'Offboarded', 'ARCHIVED', 'INACTIVE', 'OFFBOARDED'] },
};

async function getSuperAdminStatistics() {
  // ── Core counts (single DB round-trip) ──────────────────────────────────────
  const [
    totalCompanies,
    activeCompanies,
    suspendedAccounts,
    archivedCompanies,
    offboardedCompanies,
    activeSubscriptions,
    totalBranches,
    activeBranches,
    suspendedBranches,
    archivedBranches,
    totalEmployees,
    activeStaff,
    deactivatedCompanies,
  ] = await prisma.$transaction([
    // ── Company counts ────────────────────────────────────────────────────────
    prisma.company.count(),
    prisma.company.count({ where: { status: { in: ['Active', 'ACTIVE'] } } }),
    // Suspended Accounts = portal access blocked (any non-active status or accountStatus)
    prisma.company.count({
      where: {
        OR: [
          { status: { in: ['Suspended', 'SUSPENDED'] } },
          { accountStatus: { in: ['Suspended', 'SUSPENDED'] } },
          { status: { in: ['Inactive', 'INACTIVE'] } },
        ]
      },
    }),
    prisma.company.count({ where: { status: { in: ['Archived', 'ARCHIVED'] } } }),
    prisma.company.count({ where: OFFBOARDED_WHERE }),
    prisma.company.count({ where: ACTIVE_SUBSCRIPTION_WHERE }),

    // ── Branch counts ─────────────────────────────────────────────────────────
    prisma.branch.count(),
    prisma.branch.count({ where: { status: { in: ['Active', 'ACTIVE'] } } }),
    prisma.branch.count({ where: { status: { in: ['Suspended', 'SUSPENDED', 'Inactive', 'INACTIVE'] } } }),
    prisma.branch.count({ where: { OR: [{ status: { in: ['Archived', 'ARCHIVED'] } }, { isArchived: true }] } }),

    // ── Employee counts ───────────────────────────────────────────────────────
    prisma.employee.count(),
    // Active Staff = currently-employed headcount (offboarded employees excluded).
    prisma.employee.count({ where: { status: { notIn: OFFBOARDED_STATUSES } } }),

    // ── Deactivated Companies ─────────────────────────────────────────────────
    // Any company whose status OR accountStatus is non-active.
    // Includes: Archived, Suspended, Inactive, Deactivated, Disabled, Offboarded.
    prisma.company.count({
      where: {
        OR: [
          { status: { in: DEACTIVATED_STATUSES } },
          { accountStatus: { in: DEACTIVATED_STATUSES } },
        ]
      }
    }),
  ]);

  // ── Deactivated Branches (raw SQL for cross-table logic) ────────────────────
  // A branch is deactivated when:
  //   (a) its own status is non-Active, OR
  //   (b) its parent company's status is non-Active (cascade deactivation).
  // Prisma count() cannot express a cross-table OR in a single query, so we use
  // a raw parameterised query instead.
  const deactivatedStatusList = [
    'archived', 'suspended', 'inactive', 'deactivated', 'disabled', 'offboarded'
  ];

  // Build a parameterised placeholder list (?, ?, …) for safe interpolation.
  // MySQL uses positional `?` placeholders and backtick-quoted identifiers.
  const placeholders = deactivatedStatusList.map(() => '?').join(', ');

  const deactivatedBranchesResult = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS cnt
    FROM \`Branch\` b
    JOIN \`Company\` c ON b.\`companyId\` = c.\`id\`
    WHERE LOWER(b.\`status\`) IN (${placeholders})
       OR LOWER(c.\`status\`) IN (${placeholders})
       OR b.\`isArchived\` = true
  `, ...deactivatedStatusList, ...deactivatedStatusList);

  const deactivatedBranches = Number(deactivatedBranchesResult?.[0]?.cnt ?? 0);

  // ── Monthly Revenue ────────────────────────────────────────────────────────
  const [activeCompanyRows, plans] = await Promise.all([
    prisma.company.findMany({
      where: ACTIVE_SUBSCRIPTION_WHERE,
      select: {
        plan: true,
        billingCycle: true,
        priceMonthly: true,
        priceYearly: true,
        subscriptionPrice: true,
      },
    }),
    prisma.subscriptionPlan.findMany({
      select: { name: true, priceMonthly: true, priceYearly: true },
    }),
  ]);

  const planByName = new Map(plans.map((p) => [p.name, p]));
  let monthlyRevenue = 0;
  for (const c of activeCompanyRows) {
    const plan = planByName.get(c.plan);
    let cost;
    if (plan) {
      cost = c.billingCycle === 'Yearly'
        ? Math.round((plan.priceYearly || 0) / 12)
        : (plan.priceMonthly || 0);
    } else {
      cost = c.billingCycle === 'Yearly'
        ? Math.round((c.priceYearly || 0) / 12)
        : (c.priceMonthly || c.subscriptionPrice || 0);
    }
    monthlyRevenue += cost || 0;
  }

  return {
    totalCompanies,           // COUNT(Company)
    activeCompanies,          // status = Active
    suspendedAccounts,        // Suspended Accounts KPI
    archivedCompanies,        // status = Archived
    offboardedCompanies,      // status IN (Archived, Inactive, Offboarded)
    activeSubscriptions,      // live subscription check
    totalBranches,            // COUNT(Branch)
    activeBranches,           // branch status = Active
    suspendedBranches,        // branch status = Suspended/Inactive
    archivedBranches,         // branch status = Archived OR isArchived = true
    deactivatedCompanies,     // any non-Active status (incl. Archived, Suspended, Inactive…)
    deactivatedBranches,      // branch non-Active OR parent company non-Active (cascade)
    totalEmployees,           // COUNT(Employee)
    activeStaff,              // status = Active
    totalStaff: activeStaff,
    combinedEmployees: totalEmployees,
    monthlyRevenue,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * getPlatformReports — SaaS PLATFORM analytics for the Super Admin Reports module.
 *
 * Returns ONLY platform-level counts, totals, revenue and growth — never any
 * company-operational or employee-level confidential data (no names, salaries,
 * bank details, attendance, leave, documents). Employee figures are summary
 * counts only. Builds on getSuperAdminStatistics() for the core counts + revenue
 * and adds role / subscription / plan / growth breakdowns.
 */
async function getPlatformReports() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const base = await getSuperAdminStatistics();

  const [
    inactiveCompanies,
    trialCompanies,
    expiredSubscriptions,
    newCompaniesThisMonth,
    newBranchesThisMonth,
    totalUsers,
    activeUsers,
    usersByRole,
    activeUsers30d,
    newUsersThisMonth,
    offboardedEmployees,
    joinedThisMonth,
    leftThisMonth,
    newEmployeesThisMonth,
    planGroups,
  ] = await prisma.$transaction([
    prisma.company.count({ where: { status: { in: ['Inactive', 'INACTIVE'] } } }),
    prisma.company.count({ where: { paymentStatus: { in: ['Trial Active', 'Trial', 'TRIAL'] } } }),
    prisma.company.count({ where: { paymentStatus: { in: ['Overdue', 'OVERDUE', 'Expired', 'EXPIRED', 'Unpaid', 'UNPAID'] } } }),
    prisma.company.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.branch.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: { in: ['Active', 'ACTIVE'] } } }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.employee.count({ where: { status: { in: OFFBOARDED_STATUSES } } }),
    prisma.employee.count({ where: { joinDate: { gte: monthStart } } }),
    prisma.employee.count({ where: { exitDate: { gte: monthStart } } }),
    prisma.employee.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.company.groupBy({ by: ['plan'], _count: { _all: true } }),
  ]);

  const roleCount = (r) => usersByRole
    .filter((g) => (g.role || '').toLowerCase() === r.toLowerCase())
    .reduce((s, g) => s + g._count._all, 0);

  return {
    generatedAt: now.toISOString(),
    companies: {
      total: base.totalCompanies,
      active: base.activeCompanies,
      inactive: inactiveCompanies,
      archived: base.archivedCompanies,
      suspended: base.suspendedAccounts,
      trial: trialCompanies,
      newThisMonth: newCompaniesThisMonth,
    },
    branches: {
      total: base.totalBranches,
      active: base.activeBranches,
      suspended: base.suspendedBranches,
      archived: base.archivedBranches,
      newThisMonth: newBranchesThisMonth,
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      activeLast30Days: activeUsers30d,
      superAdmins: roleCount('Super Admin'),
      companyHeads: roleCount('Company Head'),
      hrManagers: roleCount('HR'),
      finance: roleCount('Finance'),
      employees: roleCount('Employee'),
    },
    employees: {
      total: base.totalEmployees,
      active: base.activeStaff,
      inactive: offboardedEmployees,
      joinedThisMonth,
      leftThisMonth,
      newThisMonth: newEmployeesThisMonth,
    },
    subscriptions: {
      active: base.activeSubscriptions,
      trial: trialCompanies,
      expired: expiredSubscriptions,
      planDistribution: planGroups
        .map((g) => ({ plan: g.plan || 'Unknown', count: g._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    revenue: {
      mrr: base.monthlyRevenue,
      arr: base.monthlyRevenue * 12,
      currency: 'INR',
    },
    growth: {
      newCompaniesThisMonth,
      newBranchesThisMonth,
      newUsersThisMonth,
      newEmployeesThisMonth,
    },
  };
}

module.exports = { getSuperAdminStatistics, getPlatformReports };
