/**
 * Mobile App API router — mounted at /api/app. Completely separate from the
 * website API (/api/*). Nothing here modifies an existing route.
 */
const express = require('express');
const router = express.Router();
const { appProtect, requireApproved } = require('./appAuth');
const auth = require('./authController');
const profile = require('./profileController');
const dash = require('./dashboardController');

// Service info / health for the mobile base path.
router.get('/', (req, res) => res.json({
  success: true, service: 'HRMS Mobile App API', version: 'v1',
  basePath: '/api/app', timestamp: new Date().toISOString(),
}));

// ── Auth ──────────────────────────────────────────────────────────────────
router.post('/auth/login', auth.login);
router.post('/auth/verify-otp', auth.verifyOtp);
router.post('/auth/refresh', auth.refresh);
router.post('/auth/logout', appProtect, auth.logout);
router.get('/auth/session', appProtect, auth.session);
router.get('/auth/me', appProtect, auth.me);

// ── Registration (editable until approval) ─────────────────────────────────
router.post('/profile/personal', appProtect, profile.personal);
router.post('/profile/address', appProtect, profile.address);
router.post('/profile/family', appProtect, profile.family);
router.post('/profile/bank', appProtect, profile.bank);
router.post('/profile/education', appProtect, profile.education);
router.post('/profile/experience', appProtect, profile.experience);
router.post('/profile/documents', appProtect, profile.documents);
router.post('/profile/document', appProtect, profile.uploadDocument);
router.get('/profile/progress', appProtect, profile.progress);
router.post('/profile/submit', appProtect, profile.submit);
router.get('/profile/status', appProtect, profile.status);
router.put('/profile/update', appProtect, profile.update);

// ── Dashboard (approved employees only) ────────────────────────────────────
router.get('/dashboard', appProtect, requireApproved, dash.dashboard);
router.get('/profile', appProtect, requireApproved, dash.profile);
router.get('/profile/documents', appProtect, requireApproved, dash.documents);
router.get('/attendance', appProtect, requireApproved, dash.attendance);
router.get('/leave', appProtect, requireApproved, dash.leave);
router.post('/leave/apply', appProtect, requireApproved, dash.applyLeave);
router.get('/payroll', appProtect, requireApproved, dash.payroll);
router.get('/notifications', appProtect, requireApproved, dash.notifications);
router.get('/holiday', appProtect, requireApproved, dash.holiday);

module.exports = router;
