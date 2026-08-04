const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/bankController');

// All bank endpoints require user authentication
router.use(protect);

// IFSC lookup returning Bank, Branch, City, State, MICR, SWIFT
router.get('/ifsc/:ifsc', ctrl.getIfsc);
router.get('/ifsc/:code', ctrl.getIfsc); // fallback param name

// Account verification
router.post('/verify-account', ctrl.verifyAccount);

// Log manual override to audit trail
router.post('/log-manual-override', ctrl.logManualOverride);

// Multi-Tenant BYO API verification platform settings & health checks
router.get('/settings', ctrl.getSettings);
router.post('/settings', ctrl.saveSettings);
router.post('/test-connection', ctrl.testConnection);
router.get('/audit-logs', ctrl.getAuditLogs);

// Enterprise verification records (permanent history, detail, employee lookup).
// The static and /latest routes are declared BEFORE '/verifications/:id' so
// Express does not match "latest" as an id.
router.get('/verifications', ctrl.getVerifications);
router.get('/verifications/latest/:employeeId', ctrl.getLatestVerification);
router.post('/verifications/link', ctrl.linkVerification);
router.get('/verifications/:id', ctrl.getVerificationById);

// Payroll protection policy (§12)
router.get('/payroll-policy', ctrl.getPayrollPolicy);
router.post('/payroll-policy', ctrl.savePayrollPolicy);

module.exports = router;

