const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');
const ctrl = require('../controllers/systemSettingsController');

// Any authenticated user: the runtime key used to load the Google Maps JS API.
router.get('/google-maps/public', protect, ctrl.getPublicMapsConfig);
// Any authenticated user: fallback address resolution from a pasted Maps URL
// (used when the interactive map can't load in the browser).
router.post('/google-maps/geocode', protect, ctrl.geocodeLocation);

// Super Admin (installer) only: configure & test the integration.
router.get('/google-maps', protect, requireSuperAdmin, ctrl.getGoogleMaps);
router.put('/google-maps', protect, requireSuperAdmin, ctrl.updateGoogleMaps);
router.post('/google-maps/test', protect, requireSuperAdmin, ctrl.testGoogleMaps);

module.exports = router;
