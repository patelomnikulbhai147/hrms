/**
 * superAdminVerificationRoutes.js
 * 
 * Super Admin routes for managing Bank Verification credits, ledgers, and multi-tenant billing reports.
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const controller = require('../controllers/verificationCreditController');
const rechargeController = require('../controllers/paymentGatewayController');

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

// ── Self-service recharge administration (pricing, packages, payments) ───────
// Provider cost / margin figures are Super-Admin-only and exist ONLY under
// this hard-gated router.
router.get('/recharge/settings', rechargeController.adminGetSettings);
router.put('/recharge/settings', rechargeController.adminUpdateSettings);
router.get('/recharge/packages', rechargeController.adminListPackages);
router.post('/recharge/packages', rechargeController.adminSavePackage);
router.put('/recharge/packages/:id', rechargeController.adminSavePackage);
router.delete('/recharge/packages/:id', rechargeController.adminDeletePackage);
router.get('/recharge/orders', rechargeController.adminListOrders);
router.post('/recharge/orders/:orderId/approve', rechargeController.adminApproveOrder);
router.post('/recharge/orders/:orderId/reverify', rechargeController.adminReverifyOrder);
router.post('/recharge/orders/:orderId/regenerate-invoice', rechargeController.adminRegenerateInvoice);
router.get('/recharge/refunds', rechargeController.adminListRefunds);
router.put('/recharge/refunds/:id/mark-adjusted', rechargeController.adminMarkRefundAdjusted);
router.get('/recharge/dashboard', rechargeController.adminDashboard);

module.exports = router;
