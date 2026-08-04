/**
 * verificationCreditRoutes.js
 * 
 * Tenant-scoped routes for Bank Verification Credit Wallet & Settings.
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const controller = require('../controllers/verificationCreditController');
const rechargeController = require('../controllers/paymentGatewayController');

router.use(protect);

router.get('/wallet', controller.getWallet);
router.get('/settings', controller.getSettings);
router.put('/settings', controller.updateSettings);
router.post('/request-credits', controller.requestCredits);
router.get('/transactions', controller.getTransactions);
router.get('/audit-logs', controller.getAuditLogs);

// ── Self-service recharge (Cashfree PG) ──────────────────────────────────────
// Role gates live in the controller: purchasing is Company Head only, viewing
// excludes Employees, and every handler resolves the company via
// resolveWalletCompany — client-supplied ids are never trusted.
router.get('/recharge/config', rechargeController.getRechargeConfig);
router.post('/recharge/quote', rechargeController.quoteRecharge);
router.post('/recharge/orders', rechargeController.createRechargeOrder);
router.post('/recharge/orders/:orderId/verify', rechargeController.verifyRechargeOrder);
router.get('/recharge/history', rechargeController.getRechargeHistory);
router.get('/recharge/invoices/:id/download', rechargeController.downloadRechargeInvoice);

module.exports = router;
