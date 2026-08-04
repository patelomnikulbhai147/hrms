const express = require('express');
const router = express.Router();
const appController = require('../controllers/mobileAppController');
const { protectMobile } = require('../middleware/mobileAuthMiddleware');

// Mount the middleware for all routes in this namespace.
router.use(protectMobile);

// --- Phase 1: Core Mobile Endpoints ---

// Dashboard
router.get('/dashboard', appController.getDashboard);

// Profile
router.get('/profile', appController.getProfile);
router.put('/profile', appController.updateProfile);

// Notifications
router.get('/notifications', appController.getNotifications);

// Company Info
router.get('/company', appController.getCompany);

// --- Phase 2A: Employee Management Endpoints ---
router.get('/employees', appController.getEmployees);
router.get('/employees/search', appController.getEmployees);
router.get('/employees/:id', appController.getEmployeeById);

module.exports = router;
