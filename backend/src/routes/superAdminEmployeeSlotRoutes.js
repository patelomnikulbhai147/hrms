/**
 * Employee Slot Management — Super Admin routes
 * (/api/super-admin/employee-slots). Pack configuration, manual request
 * approval, manual grants/decreases, purchase history and per-company usage.
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const controller = require('../controllers/employeeSlotController');

router.use(protect, requireSuperAdmin);

router.get('/packs', controller.adminListPacks);
router.post('/packs', controller.adminSavePack);
router.put('/packs/:id', controller.adminSavePack);
router.delete('/packs/:id', controller.adminDeletePack);
router.get('/requests', controller.adminListRequests);
router.post('/requests/:id/approve', controller.adminApproveRequest);
router.post('/requests/:id/reject', controller.adminRejectRequest);
router.post('/adjust', controller.adminAdjust);
router.get('/transactions', controller.adminListTransactions);
router.get('/usage', controller.adminUsage);

module.exports = router;
