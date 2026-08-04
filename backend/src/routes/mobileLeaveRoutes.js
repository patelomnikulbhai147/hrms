const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/mobileLeaveController');
const { protectMobileEmployee } = require('../middleware/mobileAuthMiddleware');

router.use(protectMobileEmployee);

router.get('/balances', leaveController.getLeaveBalances);
router.get('/history', leaveController.getLeaveHistory);
router.post('/apply', leaveController.applyLeave);
router.post('/:id/cancel', leaveController.cancelLeave);
router.get('/:id/status', leaveController.getLeaveStatus);

module.exports = router;
