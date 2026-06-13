const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/login', authController.login);

// Forgot-password OTP workflow
router.post('/forgot-password', authController.forgotPassword); // step 1: request OTP
router.post('/verify-otp', authController.verifyOtp);           // step 2: verify OTP
router.post('/reset-password', authController.resetPassword);   // step 3: set new password

// Protected routes — any authenticated user may read their own profile.
router.get('/me', protect, authController.getMe);

module.exports = router;
