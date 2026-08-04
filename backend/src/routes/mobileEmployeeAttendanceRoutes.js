const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/mobileAttendanceController');
const { protectMobileEmployee } = require('../middleware/mobileAuthMiddleware');

// Secure all attendance endpoints with Employee Mobile Auth Middleware
router.use(protectMobileEmployee);

router.get('/today', attendanceController.getTodayAttendance);
router.get('/month', attendanceController.getMonthlyAttendance);
router.get('/history', attendanceController.getAttendanceHistory);
router.post('/check-in', attendanceController.checkIn);
router.post('/check-out', attendanceController.checkOut);

module.exports = router;
