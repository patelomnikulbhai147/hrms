const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');

// Super Admin Subscription Management — the platform-level control center.
// Every route requires an authenticated Super Admin.
router.use(protect);
router.use(requireSuperAdmin);

router.get('/dashboard', ctrl.dashboard);      // summary cards
router.get('/catalog', ctrl.catalog);          // plan tiers + pricing + premium module keys
router.get('/history/all', ctrl.allHistory);   // GLOBAL change history (History tab)
router.get('/billing/all', ctrl.billing);      // GLOBAL billing view (Billing tab)
router.get('/', ctrl.list);                    // every company's subscription row
router.get('/:companyId', ctrl.getOne);        // manage detail (+ history + billing)
router.put('/:companyId', ctrl.update);        // change plan / cycle / custom config
router.post('/:companyId/suspend', ctrl.suspend);
router.post('/:companyId/activate', ctrl.activate);
router.get('/:companyId/history', ctrl.history);

module.exports = router;
