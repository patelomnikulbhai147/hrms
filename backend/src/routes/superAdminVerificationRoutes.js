/**
 * superAdminVerificationRoutes.js
 * 
 * Super Admin routes for managing Bank Verification credits, ledgers, and multi-tenant billing reports.
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const controller = require('../controllers/verificationCreditController');

// Super Admin RBAC Middleware
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'Super Admin') {
    return res.status(403).json({ error: 'Access denied. Super Admin privileges required.' });
  }
  next();
};

router.use(protect, requireSuperAdmin);

router.get('/dashboard', controller.getSuperAdminDashboard);
router.get('/companies', controller.getCompanyList);
router.get('/companies/:id', controller.getCompanyDetails);
router.post('/allocate', controller.allocateCredits);
router.put('/company-status', controller.suspendResumeCompany);
router.get('/transactions', controller.getGlobalLedger);
router.get('/audit-logs', controller.getGlobalAuditLogs);
router.get('/reports', controller.getReports);
router.get('/export', controller.exportReports);

module.exports = router;
