/**
 * verificationCreditRoutes.js
 * 
 * Tenant-scoped routes for Bank Verification Credit Wallet & Settings.
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const controller = require('../controllers/verificationCreditController');

router.use(protect);

router.get('/wallet', controller.getWallet);
router.get('/settings', controller.getSettings);
router.put('/settings', controller.updateSettings);
router.post('/request-credits', controller.requestCredits);
router.get('/transactions', controller.getTransactions);
router.get('/audit-logs', controller.getAuditLogs);

module.exports = router;
