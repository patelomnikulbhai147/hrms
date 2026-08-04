const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/leaveAdminController');
const roster = require('../controllers/leaveAdministrationController');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // archived company → read-only (Super Admin bypass inside)

// Server-side paginated roster for the Leave Administration table. Read-only, so
// it rides on `leaves:view` like the other GETs here.
router.get('/roster', requirePermission('leaves', 'view'), roster.list);
router.get('/filter-options', requirePermission('leaves', 'view'), roster.filterOptions);

router.post('/grant', requirePermission('leaves', 'edit'), ctrl.grant);
router.post('/grant-bulk', requirePermission('leaves', 'edit'), ctrl.grantBulk);
router.post('/deduct', requirePermission('leaves', 'edit'), ctrl.deduct);
router.post('/reset', requirePermission('leaves', 'edit'), ctrl.reset);
router.post('/transfer', requirePermission('leaves', 'edit'), ctrl.transfer);
router.post('/carry-forward', requirePermission('leaves', 'edit'), ctrl.carryForward);
router.get('/audit', requirePermission('leaves', 'view'), ctrl.getAuditLog);

module.exports = router;
