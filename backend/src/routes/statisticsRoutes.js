const express = require('express');
const router = express.Router();
const statisticsController = require('../controllers/statisticsController');
const { protect } = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/rbacMiddleware');

// Super Admin statistics — restricted to Super Admin role only.
router.use(protect);
router.use(requireSuperAdmin);

router.get('/super-admin', statisticsController.getSuperAdmin);
router.get('/platform-reports', statisticsController.getPlatformReports);

module.exports = router;
