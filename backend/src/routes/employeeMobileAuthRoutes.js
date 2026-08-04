const express = require('express');
const router = express.Router();
const employeeMobileAuthController = require('../controllers/employeeMobileAuthController');
const { protectMobileEmployee } = require('../middleware/mobileAuthMiddleware');

// Public routes
router.post('/login', employeeMobileAuthController.login);
router.post('/verify-otp', employeeMobileAuthController.verifyOtp);
router.post('/refresh', employeeMobileAuthController.refresh);

// Protected routes
router.post('/logout', protectMobileEmployee, employeeMobileAuthController.logout);
router.post('/logout-all', protectMobileEmployee, employeeMobileAuthController.logoutAll);

module.exports = router;
