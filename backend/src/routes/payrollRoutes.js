const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/payrollController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', requirePermission('payroll', 'view'), controller.getAll);
router.post('/generate', requirePermission('payroll', 'create'), controller.generate);
router.post('/', requirePermission('payroll', 'create'), controller.create);
router.put('/:id', requirePermission('payroll', 'edit'), controller.update);
router.delete('/:id', requirePermission('payroll', 'delete'), controller.delete);

module.exports = router;
