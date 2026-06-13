const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', requirePermission('employees', 'view'), employeeController.getEmployees);
router.get('/next-code', requirePermission('employees', 'view'), employeeController.nextCode);
router.post('/validate-code', requirePermission('employees', 'view'), employeeController.validateCode);
router.get('/status-report', requirePermission('employees', 'view'), employeeController.statusReport);
router.post('/', requirePermission('employees', 'create'), employeeController.createEmployee);
router.post('/bulk', requirePermission('employees', 'create'), employeeController.bulkCreate);
router.put('/:id', requirePermission('employees', 'edit'), employeeController.updateEmployee);
router.delete('/:id', requirePermission('employees', 'delete'), employeeController.deleteEmployee);

module.exports = router;
