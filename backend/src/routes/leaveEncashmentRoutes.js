const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/leaveEncashmentController');

router.use(protect);

router.get('/', requirePermission('leaves', 'view'), ctrl.getAll);
router.get('/calculate', requirePermission('leaves', 'view'), ctrl.calculate);
router.post('/', requirePermission('leaves', 'edit'), ctrl.create);
router.post('/year-end', requirePermission('leaves', 'edit'), ctrl.yearEnd);
router.post('/add-to-payroll', requirePermission('leaves', 'edit'), ctrl.addToPayroll);
router.put('/:id', requirePermission('leaves', 'edit'), ctrl.update);
router.delete('/:id', requirePermission('leaves', 'delete'), ctrl.remove);

module.exports = router;
