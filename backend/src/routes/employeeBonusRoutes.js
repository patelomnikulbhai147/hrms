const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/employeeBonusController');

// Per-employee bonus ledger. Bonus rides on the `payroll` permission matrix
// (same as the rest of bonus handling). Archived company → read-only.
router.use(protect);
router.use(require('../middleware/readOnlyMiddleware'));

router.get('/', requirePermission('payroll', 'view'), ctrl.list);
router.post('/', requirePermission('payroll', 'edit'), ctrl.create);
router.put('/:id', requirePermission('payroll', 'edit'), ctrl.update);
router.delete('/:id', requirePermission('payroll', 'edit'), ctrl.remove);

module.exports = router;
