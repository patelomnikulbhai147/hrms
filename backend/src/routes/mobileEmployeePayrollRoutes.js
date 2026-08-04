const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/mobilePayrollController');
const { protectMobileEmployee } = require('../middleware/mobileAuthMiddleware');

// Secure all payroll endpoints with Employee Mobile Auth Middleware
router.use(protectMobileEmployee);

router.get('/summary', payrollController.getSummary);
router.get('/history', payrollController.getHistory);
router.get('/:id', payrollController.getById);
router.get('/:id/payslip', payrollController.getPayslip);

module.exports = router;
