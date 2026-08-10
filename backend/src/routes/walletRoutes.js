const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireCompanyModuleAccess } = require('../middleware/rbacMiddleware');
const WalletController = require('../controllers/walletController');
const WalletRechargeController = require('../controllers/walletRechargeController');

// All wallet routes require authentication
router.use(protect);

// ── Read-only (Company Head / HR with payroll view) ───────────────────────────
router.get(
  '/summary',
  requireCompanyModuleAccess('payroll', 'view', {
    defaults: { view: ['HR', 'Finance', 'Company Head'] },
  }),
  WalletController.getSummary
);

router.get(
  '/transactions',
  requireCompanyModuleAccess('payroll', 'view', {
    defaults: { view: ['HR', 'Finance', 'Company Head'] },
  }),
  WalletController.getTransactions
);

router.get(
  '/estimate',
  requireCompanyModuleAccess('payroll', 'view', {
    defaults: { view: ['HR', 'Finance', 'Company Head'] },
  }),
  WalletController.getEstimate
);

// ── Recharge (Company Head only, or HR with payroll edit permission) ──────────
router.post(
  '/create-order',
  requireCompanyModuleAccess('payroll', 'edit', {
    defaults: { edit: ['Company Head', 'HR'] },
  }),
  WalletRechargeController.createOrder
);

router.post(
  '/recharge/verify',
  requireCompanyModuleAccess('payroll', 'edit', {
    defaults: { edit: ['Company Head', 'HR'] },
  }),
  WalletRechargeController.verifyPayment
);

module.exports = router;
