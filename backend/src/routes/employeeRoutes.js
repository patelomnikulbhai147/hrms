const { requirePermission } = require('../middleware/rbacMiddleware');
const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', employeeController.getEmployees);
router.post('/', employeeController.createEmployee);
router.post('/bulk', employeeController.bulkCreate);
router.put('/:id', employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;
