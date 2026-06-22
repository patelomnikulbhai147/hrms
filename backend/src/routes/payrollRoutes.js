const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/payrollController');
const worksheet = require('../controllers/payrollWorksheetController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // offboarded company → read-only

// ── Salary Worksheet (enhancement layer — granular earnings/deductions) ──
// Registered before the generic /:id routes so the specific paths win.
router.get('/:id/worksheet', requirePermission('payroll', 'view'), worksheet.get);
router.put('/:id/worksheet', requirePermission('payroll', 'edit'), worksheet.save);
router.get('/:id/worksheet/audit', requirePermission('payroll', 'view'), worksheet.audit);

router.get('/', requirePermission('payroll', 'view'), controller.getAll);
router.post('/generate', requirePermission('payroll', 'create'), controller.generate);
router.post('/approve', requirePermission('payroll', 'edit'), controller.approve);
router.post('/mark-paid', requirePermission('payroll', 'edit'), controller.markPaid);
router.post('/lock', requirePermission('payroll', 'edit'), controller.lock);
router.post('/unlock', requirePermission('payroll', 'edit'), controller.unlock);
router.post('/recalculate', requirePermission('payroll', 'edit'), controller.recalculate);
router.post('/apply-bonus', requirePermission('payroll', 'edit'), controller.applyBonus);
router.post('/remove-bonus', requirePermission('payroll', 'edit'), controller.removeBonus);
router.post('/', requirePermission('payroll', 'create'), controller.create);
router.patch('/:id/slip-event', requirePermission('payroll', 'view'), controller.slipEvent);
router.post('/:id/email-slip', requirePermission('payroll', 'view'), controller.emailSlip);
router.put('/:id', requirePermission('payroll', 'edit'), controller.update);
router.delete('/:id', requirePermission('payroll', 'delete'), controller.delete);

module.exports = router;
