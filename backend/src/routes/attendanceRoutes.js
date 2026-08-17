const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // offboarded company → read-only

router.get('/', requirePermission('attendance', 'view'), controller.getAll);
router.get('/analytics', requirePermission('attendance', 'view'), controller.getAnalytics);
// Full-report destinations for the dashboard's "View Full Report" actions.
// Read-only, so they ride on the same `attendance:view` permission as the tiles
// that link to them — a user who can see the card can open its report, and one
// who cannot see the card cannot reach the report by URL either.
router.get('/workforce-report', requirePermission('attendance', 'view'), controller.workforceReport);
router.get('/department-report', requirePermission('attendance', 'view'), controller.departmentReport);
router.post('/sync-payroll', requirePermission('attendance', 'edit'), controller.syncPayroll);
router.post('/sync-payroll/cancel', requirePermission('attendance', 'edit'), controller.syncPayrollCancel);
router.get('/sync-payroll/status', requirePermission('attendance', 'view'), controller.syncPayrollStatus);
// Push to Payroll Engine — transfer the finalized attendance calculation into the
// Payroll module (creates payroll records from the snapshot; NO recalculation).
// Gated on payroll edit since it writes payroll records.
router.post('/push-to-payroll', requirePermission('payroll', 'edit'), controller.pushToPayroll);
router.post('/', requirePermission('attendance', 'create'), controller.create);
router.put('/:id', requirePermission('attendance', 'edit'), controller.update);
router.delete('/:id', requirePermission('attendance', 'delete'), controller.delete);

module.exports = router;
