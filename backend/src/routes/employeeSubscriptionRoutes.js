const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin, requirePermission } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/employeeSubscriptionController');

// NEW Employee-Based Subscription (Beta). Reuses the existing 'billing' RBAC module
// for read access; all WRITES (pricing, slots, peak correction, status) are
// Super-Admin-only. Fully additive — separate routes & tables from the existing
// subscription system.
router.use(protect);

// Reads — billing viewers (Super Admin always allowed by requirePermission).
router.get('/config', requirePermission('billing', 'view'), ctrl.getConfig);
router.get('/audit', requirePermission('billing', 'view'), ctrl.getAudit);
router.get('/branch-slot/:companyId', requirePermission('billing', 'view'), ctrl.branchSlot);
router.get('/dashboard/:companyId', requirePermission('billing', 'view'), ctrl.getDashboard);
router.get('/', requireSuperAdmin, ctrl.list);

// Writes — Super Admin only.
router.put('/config', requireSuperAdmin, ctrl.updateConfig);
router.put('/:companyId', requireSuperAdmin, ctrl.updateSubscription);

module.exports = router;
