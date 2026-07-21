const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const registrationController = require('../controllers/registrationController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/login', authController.login);
router.post('/captcha-status', authController.getCaptchaStatus);
router.get('/captcha', authController.generateInternalCaptcha);

// Public company self-registration (FREE plan) — CAPTCHA + email-OTP verified.
router.post('/register-company/start', registrationController.registerCompanyStart);   // validate + send OTP
router.post('/register-company/verify', registrationController.registerCompanyVerify); // verify OTP → provision + auto-login

// Forgot-password OTP workflow
router.post('/forgot-password', authController.forgotPassword); // step 1: request OTP
router.post('/verify-otp', authController.verifyOtp);           // step 2: verify OTP
router.post('/reset-password', authController.resetPassword);   // step 3: set new password

// Protected routes — any authenticated user may read their own profile.
router.get('/me', protect, authController.getMe);

// Self-service: change own password (verifies current password first).
router.post('/change-password', protect, authController.changePassword);

module.exports = router;
