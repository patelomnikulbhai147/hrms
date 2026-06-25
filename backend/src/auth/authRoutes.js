/**
 * v1 Mobile Auth routes — mounted at /api/v1/auth.
 *
 * Public:    POST /login, POST /verify-otp, POST /refresh
 * Protected: POST /logout, GET /me   (Bearer access token via existing `protect`)
 *
 * Additive: this router is completely separate from the web auth router at
 * /api/auth, which is left untouched.
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('./authController');

// A tiny health/info endpoint so the Flutter dev can confirm the base path + mode.
router.get('/', (req, res) => res.json({
  success: true,
  service: 'HRMS Mobile Auth',
  version: 'v1',
  otpMode: require('./otpService').OTP_MODE,
  otpLength: require('./otpService').OTP_LENGTH,
  endpoints: ['POST /login', 'POST /verify-otp', 'POST /refresh', 'POST /logout', 'GET /me'],
}));

// OpenAPI spec (for Swagger UI / codegen / Postman import).
router.get('/openapi.json', (req, res) => res.json(require('./openapi.json')));

router.post('/login', ctrl.login);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/refresh', ctrl.refresh);
router.post('/logout', protect, ctrl.logout);
router.get('/me', protect, ctrl.me);

module.exports = router;
