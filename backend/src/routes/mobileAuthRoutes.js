const express = require('express');
const router = express.Router();
const mobileAuthController = require('../controllers/mobileAuthController');
const { protectMobile } = require('../middleware/mobileAuthMiddleware');

// Public routes
router.post('/login', mobileAuthController.login);
router.post('/verify-otp', mobileAuthController.verifyOtp);
router.post('/refresh', mobileAuthController.refresh);

// Protected routes
router.post('/logout', protectMobile, mobileAuthController.logout);
router.post('/logout-all', protectMobile, mobileAuthController.logoutAll);

module.exports = router;
