const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(require('../middleware/readOnlyMiddleware')); // offboarded company → read-only

router.get('/', requirePermission('employees', 'view'), employeeController.getEmployees);
router.get('/next-code', requirePermission('employees', 'view'), employeeController.nextCode);
// Paginated card grid + per-page metrics. Declared before '/:id' so it is not
// swallowed by the parameter route.
router.get('/cards', requirePermission('employees', 'view'), employeeController.employeeCards);
router.post('/validate-code', requirePermission('employees', 'view'), employeeController.validateCode);
router.get('/status-report', requirePermission('employees', 'view'), employeeController.statusReport);
// Declared AFTER the literal paths above so '/next-code' and '/status-report'
// are never swallowed by the ':id' parameter.
router.get('/:id', requirePermission('employees', 'view'), employeeController.getEmployeeById);
router.post('/', requirePermission('employees', 'create'), employeeController.createEmployee);
router.post('/bulk', requirePermission('employees', 'create'), employeeController.bulkCreate);
router.put('/:id', requirePermission('employees', 'edit'), employeeController.updateEmployee);
// Re-onboarding CREATES a new employment record, so it is gated on 'create',
// not 'edit' — the locked previous record is never written to.
router.post('/:id/re-onboard', requirePermission('employees', 'create'), employeeController.reOnboardEmployee);
router.delete('/:id', requirePermission('employees', 'delete'), employeeController.deleteEmployee);

module.exports = router;
