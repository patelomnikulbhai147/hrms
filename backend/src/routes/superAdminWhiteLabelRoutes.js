/**
 * White Label & Custom Domain — Super Admin routes
 * (/api/super-admin/white-label). Fleet view of every mapping, disable /
 * re-enable / force-reverify / delete, and the SSL renewal sweep.
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const controller = require('../controllers/customDomainController');

router.use(protect, requireSuperAdmin);

router.get('/mappings', controller.adminList);
router.post('/mappings/:id/disable', controller.adminDisable);
router.post('/mappings/:id/enable', controller.adminEnable);
router.post('/mappings/:id/reverify', controller.adminReverify);
router.delete('/mappings/:id', controller.adminDelete);
router.post('/ssl/renew-sweep', controller.adminRenewSweep);

module.exports = router;
