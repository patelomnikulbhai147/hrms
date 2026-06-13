const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/payrollController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', requirePermission('payroll', 'view'), controller.getAll);
router.post('/generate', requirePermission('payroll', 'create'), controller.generate);
router.post('/approve', requirePermission('payroll', 'edit'), controller.approve);
router.post('/mark-paid', requirePermission('payroll', 'edit'), controller.markPaid);
router.post('/lock', requirePermission('payroll', 'edit'), controller.lock);
router.post('/unlock', requirePermission('payroll', 'edit'), controller.unlock);
router.post('/recalculate', requirePermission('payroll', 'edit'), controller.recalculate);
router.post('/', requirePermission('payroll', 'create'), controller.create);
router.patch('/:id/slip-event', requirePermission('payroll', 'view'), controller.slipEvent);
router.post('/:id/email-slip', requirePermission('payroll', 'view'), controller.emailSlip);
router.put('/:id', requirePermission('payroll', 'edit'), controller.update);
router.delete('/:id', requirePermission('payroll', 'delete'), controller.delete);

module.exports = router;
