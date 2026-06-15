const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // offboarded company → read-only

router.get('/', requirePermission('attendance', 'view'), controller.getAll);
router.get('/analytics', requirePermission('attendance', 'view'), controller.getAnalytics);
router.post('/sync-payroll', requirePermission('attendance', 'edit'), controller.syncPayroll);
router.post('/', requirePermission('attendance', 'create'), controller.create);
router.put('/:id', requirePermission('attendance', 'edit'), controller.update);
router.delete('/:id', requirePermission('attendance', 'delete'), controller.delete);

module.exports = router;
