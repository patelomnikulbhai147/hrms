const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/onboardingController');
const { protect } = require('../middleware/authMiddleware');

// First-login onboarding (company accounts only; enforced in the controller).
router.use(protect);
router.get('/status', ctrl.status);      // current onboarding + seat capacity
router.get('/plans', ctrl.plans);        // company-readable plan catalog
router.post('/choose', ctrl.choose);     // { choice: 'blank' | 'sample' }
router.post('/remove-sample', ctrl.removeSample); // one-time demo-data removal

module.exports = router;
