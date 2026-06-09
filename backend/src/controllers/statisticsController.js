const { getSuperAdminStatistics } = require('../services/superAdminStatisticsService');

// GET /api/statistics/super-admin
// Returns live, database-driven KPI counts for the Super Admin dashboard.
exports.getSuperAdmin = async (req, res) => {
  try {
    const stats = await getSuperAdminStatistics();
    // Connectivity validation log: PostgreSQL -> Prisma -> API.
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
    console.error('Error computing Super Admin statistics:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
